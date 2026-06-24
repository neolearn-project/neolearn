type RealtimeLanguage = "en-IN" | "hi-IN" | "bn-IN" | string;

export type RealtimeTeacherEvents = {
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
  onTranscript?: (text: string) => void;
};

export class RealtimeTeacherClient {
  private studentMobile: string;
  private events: RealtimeTeacherEvents;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private transcript = "";
  private connected = false;

  constructor(studentMobile: string, events: RealtimeTeacherEvents = {}) {
    this.studentMobile = studentMobile;
    this.events = events;
  }

  private logStatus(message: string) {
    this.events.onStatus?.(message);
  }

  private emitError(message: string) {
    this.events.onError?.(message);
  }

  async connect(language: RealtimeLanguage, instructions: string) {
    if (this.connected && this.pc) return;

    this.logStatus("Creating realtime voice session...");

    const sessionRes = await fetch(
      `/api/realtime-session?mobile=${encodeURIComponent(this.studentMobile)}`,
      { cache: "no-store" }
    );

    const sessionJson = await sessionRes.json();

    if (!sessionRes.ok) {
      throw new Error(sessionJson?.error || "Failed to create realtime session.");
    }

    const clientSecret = sessionJson?.clientSecret;
    const model = sessionJson?.model || "gpt-realtime-mini";

    if (!clientSecret) {
      throw new Error("Realtime client secret missing.");
    }

    this.pc = new RTCPeerConnection();

    this.remoteAudio = document.createElement("audio");
    this.remoteAudio.autoplay = true;

    this.pc.ontrack = (event) => {
      if (!this.remoteAudio) return;
      const [stream] = event.streams;
      if (stream) {
        this.remoteAudio.srcObject = stream;
        this.remoteAudio.play().catch(() => {});
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state) this.logStatus(`Realtime connection: ${state}`);
    };

    this.dc = this.pc.createDataChannel("oai-events");

    this.dc.onopen = () => {
      this.connected = true;
      this.logStatus("Realtime teacher connected.");

      this.sendEvent({
        type: "session.update",
        session: {
          type: "realtime",
          model,
          instructions,
            audio: {
            output: {
              voice: "alloy",
            },
          },
        },
      });
    };

    this.dc.onerror = () => {
      this.emitError("Realtime data channel error.");
    };

    this.dc.onclose = () => {
      this.connected = false;
      this.logStatus("Realtime teacher disconnected.");
    };

    this.dc.onmessage = (event) => {
      this.handleServerEvent(event.data);
    };

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });

    await this.pc.setLocalDescription(offer);

    const formData = new FormData();
    formData.set("sdp", offer.sdp || "");
    formData.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model,
        instructions,
        audio: {
          output: {
            voice: "alloy",
          },
        },
      })
    );

    this.logStatus("Connecting realtime teacher...");

    const answerRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
      },
      body: formData,
    });

    const answerSdp = await answerRes.text();

    if (!answerRes.ok) {
      throw new Error(answerSdp || "Realtime SDP exchange failed.");
    }

    await this.pc.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });

    this.logStatus("Realtime connected. You may speak or type.");
  }

  private handleServerEvent(raw: string) {
    let event: any;

    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    if (event.type === "error") {
      const message = event?.error?.message || "Realtime API error.";
      this.emitError(message);
      return;
    }

    const delta =
      event?.delta ||
      event?.transcript ||
      event?.text ||
      event?.item?.content?.[0]?.text ||
      "";

    if (
      event.type === "response.output_text.delta" ||
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.text.delta" ||
      event.type === "response.audio_transcript.delta"
    ) {
      if (delta) {
        this.transcript += String(delta);
        this.events.onTranscript?.(this.transcript);
      }
    }

    if (
      event.type === "response.output_text.done" ||
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.done"
    ) {
      this.logStatus("Realtime teacher ready.");
    }
  }

  private sendEvent(event: any) {
    if (!this.dc || this.dc.readyState !== "open") {
      throw new Error("Realtime connection is not ready.");
    }
    this.dc.send(JSON.stringify(event));
  }

  sendText(text: string) {
    const clean = String(text || "").trim();
    if (!clean) return;

    this.transcript = "";
    this.events.onTranscript?.("");

    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: clean,
          },
        ],
      },
    });

    this.sendEvent({
      type: "response.create",
      response: {
      },
    });

    this.logStatus("Teacher is answering...");
  }

  async startMic() {
    if (!this.pc) {
      throw new Error("Realtime connection is not ready.");
    }

    if (this.localStream) return;

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    for (const track of this.localStream.getAudioTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    this.logStatus("Listening... speak now.");
  }

  stopMicAndSend() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    try {
      this.sendEvent({
        type: "input_audio_buffer.commit",
      });
    } catch {}

    this.sendEvent({
      type: "response.create",
      response: {
      },
    });

    this.logStatus("Teacher is answering...");
  }

  disconnect() {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
      }
    } catch {}

    this.localStream = null;

    try {
      this.dc?.close();
    } catch {}

    try {
      this.pc?.close();
    } catch {}

    try {
      if (this.remoteAudio) {
        this.remoteAudio.pause();
        this.remoteAudio.srcObject = null;
      }
    } catch {}

    this.dc = null;
    this.pc = null;
    this.remoteAudio = null;
    this.connected = false;
    this.logStatus("Realtime teacher disconnected.");
  }
}
