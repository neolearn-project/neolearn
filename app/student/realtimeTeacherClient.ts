type RealtimeLanguage =
  | "English"
  | "Hindi"
  | "Bengali"
  | "en-IN"
  | "hi-IN"
  | "bn-IN";

export type RealtimeTeacherEvents = {
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
  onTranscript?: (text: string) => void;
};

export class RealtimeTeacherClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private playing = false;
  private bufferQueue: Float32Array[] = [];
  private events: RealtimeTeacherEvents;
  private studentMobile: string;
  private currentTranscript = "";
  private currentLocale: "en-IN" | "hi-IN" | "bn-IN" = "en-IN";
  private currentInstructions =
    "You are a female Indian school teacher in India. Speak only in simple Indian English. Do not switch to Spanish or any other language.";
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private isMicActive = false;

  constructor(studentMobile: string, events: RealtimeTeacherEvents = {}) {
    this.studentMobile = studentMobile;
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

  private normalizeLanguage(language: RealtimeLanguage) {
    if (language === "Hindi" || language === "hi-IN") {
      return {
        locale: "hi-IN" as const,
        instructions:
          "You are a female Indian school teacher. Speak only in simple Hindi used in India. Do not switch to English or Spanish.",
      };
    }

    if (language === "Bengali" || language === "bn-IN") {
      return {
        locale: "bn-IN" as const,
        instructions:
          "You are a female Indian school teacher. Speak only in simple Bengali used in India. Do not switch to English or Spanish.",
      };
    }

    return {
      locale: "en-IN" as const,
      instructions:
        "You are a female Indian school teacher in India. Speak only in simple Indian English. Do not switch to Spanish or any other language.",
    };
  }

  async connect(language: RealtimeLanguage, instructionsOverride?: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const lang = this.normalizeLanguage(language);
    this.logStatus("Creating realtime session...");

    const res = await fetch(
      `/api/realtime-session?mobile=${encodeURIComponent(this.studentMobile)}`
    );
    if (!res.ok) {
      throw new Error("Failed to create realtime session.");
    }

    const session = await res.json();
    if (!session?.clientSecret || !session?.model) {
      throw new Error("Realtime session response is incomplete.");
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      session.model
    )}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, [
        "realtime",
        `openai-insecure-api-key.${session.clientSecret}`,
        "openai-beta.realtime-v1",
      ]);

      const timeout = window.setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error("Realtime connection timed out."));
      }, 15000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        this.logStatus("Connected to realtime teacher.");

        const instructions = instructionsOverride || lang.instructions;
        this.currentLocale = lang.locale;
        this.currentInstructions = instructions;

        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions,
              input_audio_transcription: { model: "whisper-1" },
              output_audio: { format: "pcm16", sample_rate: 24000 },
            },
          })
        );
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error while connecting realtime teacher."));
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

        if (data.type === "response.text.delta" && data.delta) {
          this.currentTranscript += data.delta;
          this.events.onTranscript?.(this.currentTranscript);
        }

        if (data.type === "response.text.done" && data.text) {
          this.currentTranscript = data.text;
          this.events.onTranscript?.(this.currentTranscript);
          this.currentTranscript = "";
        }

        if (data.type === "response.audio.delta" && data.delta) {
          this.handleAudioDelta(data.delta);
        }
      };
    });
  }

  disconnect() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.stopAudio();
    this.stopMicInternal();
  }

  sendText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime teacher is not connected.");
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    this.currentTranscript = "";
    this.events.onTranscript?.("");

    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      })
    );

    this.ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          instructions: [
  this.currentInstructions,
  this.currentLocale === "hi-IN"
    ? "FINAL RULE: Answer only in Hindi written in Devanagari script. Never use English, Kannada, Spanish, or any other language."
    : this.currentLocale === "bn-IN"
    ? "FINAL RULE: Answer only in Bengali written in Bangla script. Never use English, Kannada, Spanish, or any other language."
    : "FINAL RULE: Answer only in English. Never use Hindi, Bengali, Kannada, Spanish, or any other language.",
  "FINAL RULE: If the student asks anything outside the selected lesson topic, politely refuse and ask the student to continue with the current lesson topic only.",
].join(" "),
        },
      })
    );
  }

  async startMic() {
    if (this.isMicActive) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime teacher is not connected.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone is not supported in this browser.");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.micStream = stream;

      const audioCtx = this.ensureAudioContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        const pcm16 = this.floatTo16BitPCM(input);
        const base64 = this.int16ToBase64(pcm16);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({ type: "input_audio_buffer.append", audio: base64 })
          );
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      this.micSource = source;
      this.micProcessor = processor;
      this.isMicActive = true;
      this.logStatus("Listening... speak now.");
    } catch (err) {
      console.error("startMic getUserMedia error:", err);
      throw new Error("Could not access microphone.");
    }
  }

  stopMicAndSend() {
    if (!this.isMicActive) return;

    this.stopMicInternal();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      this.ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: [
  this.currentInstructions,
  this.currentLocale === "hi-IN"
    ? "FINAL RULE: Answer only in Hindi written in Devanagari script. Never use English, Kannada, Spanish, or any other language."
    : this.currentLocale === "bn-IN"
    ? "FINAL RULE: Answer only in Bengali written in Bangla script. Never use English, Kannada, Spanish, or any other language."
    : "FINAL RULE: Answer only in English. Never use Hindi, Bengali, Kannada, Spanish, or any other language.",
  "FINAL RULE: If the student asks anything outside the selected lesson topic, politely refuse and ask the student to continue with the current lesson topic only.",
].join(" "),
          },
        })
      );
    }

    this.logStatus("Stopped listening. Teacher is answering...");
  }

  private stopMicInternal() {
    try {
      this.micProcessor?.disconnect();
      this.micSource?.disconnect();
      this.micStream?.getTracks().forEach((track) => track.stop());
    } catch {}
    this.micProcessor = null;
    this.micSource = null;
    this.micStream = null;
    this.isMicActive = false;
  }

  private ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: 24000 });
    }
    return this.audioCtx;
  }

  private stopAudio() {
    this.bufferQueue = [];
    this.playing = false;
  }

  private handleAudioDelta(base64: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i += 1) {
      float32[i] = pcm16[i] / 32768;
    }
    this.bufferQueue.push(float32);
    if (!this.playing) {
      this.playQueuedAudio();
    }
  }

  private async playQueuedAudio() {
    if (this.playing) return;
    this.playing = true;

    while (this.bufferQueue.length) {
      const chunk = this.bufferQueue.shift();
      if (!chunk) continue;
      const ctx = this.ensureAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const buffer = ctx.createBuffer(1, chunk.length, 24000);
      buffer.copyToChannel(chunk, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    }

    this.playing = false;
  }

  private floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private int16ToBase64(buffer: Int16Array) {
    let binary = "";
    const bytes = new Uint8Array(buffer.buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
}