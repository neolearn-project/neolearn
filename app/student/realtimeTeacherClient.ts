// app/student/realtimeTeacherClient.ts

type LanguageUI = "English" | "Hindi" | "Bengali";

export type RealtimeTeacherEvents = {
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
  onTranscript?: (text: string) => void; // live captions
};

export class RealtimeTeacherClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private playing = false;
  private bufferQueue: Float32Array[] = [];
  private events: RealtimeTeacherEvents;

  // live subtitle buffer for current AI reply
  private currentTranscript = "";

  // mic streaming
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private isMicActive = false;

  constructor(events: RealtimeTeacherEvents = {}) {
    this.events = events;
  }

  private logStatus(msg: string) {
    console.log("[RealtimeTeacher]", msg);
    this.events.onStatus?.(msg);
  }

  private logError(msg: string) {
    console.error("[RealtimeTeacher ERROR]", msg);
    this.events.onError?.(msg);
  }

 async connect(language: LanguageUI, instructionsOverride?: string) {
    if (this.ws) return; // already connected

    this.logStatus("Creating realtime session…");

    const res = await fetch("/api/realtime-session");
    if (!res.ok) {
      this.logError("Failed to create realtime session.");
      return;
    }

    const session = await res.json();
    if (!session.clientSecret) {
      this.logError("No client secret in realtime session.");
      return;
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      session.model
    )}`;

    // Dev pattern: using API key via insecure subprotocol
    const ws = new WebSocket(url, [
      "realtime",
      `openai-insecure-api-key.${session.clientSecret}`,
      "openai-beta.realtime-v1",
    ]);

    this.ws = ws;

    ws.onopen = () => {
      this.logStatus("Connected to Realtime teacher.");

      const instructions =
      instructionsOverride ??
      (language === "Hindi"
        ? "You are a female Indian school teacher. Speak in very simple Hindi, slowly and clearly."
        : language === "Bengali"
        ? "You are a female Indian school teacher. Speak in very simple Bengali (Bangla), slowly and clearly."
        : "You are a female Indian school teacher in India. Speak in very simple English, slowly and clearly.");

    const sessionUpdate = {
      type: "session.update",
      session: {
        instructions,
        input_audio_transcription: { model: "whisper-1" },
        output_audio: {
          format: "pcm16",
          sample_rate: 24000,
        },
      },
    };

      ws.send(JSON.stringify(sessionUpdate));
    };

    ws.onerror = (event) => {
      this.logError("WebSocket error.");
      console.error(event);
    };

    ws.onclose = (event) => {
      this.logStatus(
        `Realtime teacher disconnected (code ${event.code}${
          event.reason ? `, reason: ${event.reason}` : ""
        }).`
      );
      this.ws = null;
      this.stopAudio();
      this.stopMicInternal();
    };

    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      // ====== LIVE CAPTIONS ======
      // Subtitles for audio replies
      if (
        data.type === "response.audio_transcript.delta" &&
        typeof data.delta === "string"
      ) {
        this.currentTranscript += data.delta;
        this.events.onTranscript?.(this.currentTranscript);
      }

      if (
        data.type === "response.audio_transcript.done" &&
        typeof data.transcript === "string"
      ) {
        this.currentTranscript = data.transcript;
        this.events.onTranscript?.(this.currentTranscript);
        this.currentTranscript = "";
      }

      // Fallback for plain text responses
      if (data.type === "response.text.delta" && data.delta) {
        this.currentTranscript += data.delta;
        this.events.onTranscript?.(this.currentTranscript);
      }

      if (data.type === "response.text.done" && data.text) {
        this.currentTranscript = data.text;
        this.events.onTranscript?.(this.currentTranscript);
        this.currentTranscript = "";
      }

      // ====== AUDIO STREAM ======
      if (data.type === "response.audio.delta" && data.delta) {
        this.handleAudioDelta(data.delta);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopAudio();
    this.stopMicInternal();
  }

  // ------------------- TEXT → AI -------------------

  sendText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logError("Realtime teacher is not connected.");
      return;
    }

    if (!text.trim()) return;

    // reset subtitles for new answer
    this.currentTranscript = "";
    this.events.onTranscript?.("");

    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      })
    );

    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  // ------------------- MIC STREAMING -------------------

  async startMic() {
    if (this.isMicActive) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logError("Realtime teacher is not connected.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.logError("Microphone is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;

      const audioCtx = this.ensureAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        const pcm16 = this.floatTo16BitPCM(input);
        const base64 = this.int16ToBase64(pcm16);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64,
            })
          );
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      this.micSource = source;
      this.micProcessor = processor;
      this.isMicActive = true;
      this.logStatus("Listening… speak now.");
    } catch (err) {
      console.error("startMic getUserMedia error:", err);
      this.logError("Could not access microphone.");
    }
  }

  // stop mic + ask model to answer
  stopMicAndSend() {
    if (!this.isMicActive) return;

    this.stopMicInternal();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      this.ws.send(JSON.stringify({ type: "response.create" }));
    }

    this.logStatus("Stopped listening. Teacher is answering…");
  }

  private stopMicInternal() {
    if (this.micProcessor) {
      this.micProcessor.onaudioprocess = null;
      try {
        this.micProcessor.disconnect();
      } catch {}
      this.micProcessor = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.isMicActive = false;
  }

  // ------------------- AUDIO OUTPUT -------------------

  private ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: 24000 });
    }
    return this.audioCtx;
  }

  private handleAudioDelta(base64Pcm16: string) {
    const audioCtx = this.ensureAudioContext();

    const binary = atob(base64Pcm16);
    const len = binary.length / 2;
    const floatData = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      const hi = binary.charCodeAt(i * 2 + 1);
      const lo = binary.charCodeAt(i * 2);
      let sample = (hi << 8) | lo;
      if (sample >= 0x8000) sample = sample - 0x10000;
      floatData[i] = sample / 0x8000;
    }

    this.bufferQueue.push(floatData);
    if (!this.playing) {
      this.playing = true;
      this.playNextBuffer();
    }
  }

  private async playNextBuffer() {
    const audioCtx = this.ensureAudioContext();

    while (this.bufferQueue.length > 0) {
      const data = this.bufferQueue.shift();
      if (!data) continue;

      const buffer = audioCtx.createBuffer(1, data.length, audioCtx.sampleRate);
      buffer.copyToChannel(data, 0);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    }

    this.playing = false;
  }

  private stopAudio() {
    this.bufferQueue = [];
  }

  // ------------------- HELPERS -------------------

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private int16ToBase64(input: Int16Array): string {
    let binary = "";
    for (let i = 0; i < input.length; i++) {
      const val = input[i];
      const lo = val & 0xff;
      const hi = (val >> 8) & 0xff;
      binary += String.fromCharCode(lo, hi);
    }
    return btoa(binary);
  }
}
