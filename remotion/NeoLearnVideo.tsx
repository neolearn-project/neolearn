// @ts-nocheck
import React from "react";
import {
  Audio,
  Sequence,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FullScreen } from "./components/FullScreen";
import { NeoIntro } from "./components/NeoIntro";
import { SceneSlide } from "./components/SceneSlide";
import { CtaSlide } from "./components/CtaSlide";

type VisualIntent = {
  diagramType?: string;
  labels?: string[];
  emphasisWords?: string[];
  animationStyle?: "build" | "highlight" | "transform" | "flow";
};

type Scene = {
  sceneNo: number;
  type: "brand-intro" | "title" | "concept" | "example" | "recap" | "cta";
  title?: string;
  subtitle?: string;
  voiceover?: string;
  onscreenText?: string[];
  durationMs: number;
  visualStyle?: "whiteboard" | "premium-slide";
  visualKind?: "hook" | "concept" | "example" | "recap";
  visualIntent?: VisualIntent;
};

type VideoData = {
  topic: string;
  ctaText: string;
  audioUrl?: string | null;
  bgMusicUrl?: string | null;
  scenes: Scene[];
};

const fps = 30;
const toFrames = (ms: number) => Math.max(1, Math.round((ms / 1000) * fps));

const getSafeStaticFile = (url?: string | null) => {
  if (!url) return null;
  return staticFile(url.replace(/^\//, ""));
};

const getIntroFrames = (scenes: Scene[]) => {
  const introScene = scenes.find((scene) => scene.type === "brand-intro");
  return introScene ? toFrames(introScene.durationMs) : toFrames(2200);
};

const buildCaptionText = (scene: Scene, ctaText: string, fallbackTopic: string) => {
  if (scene.type === "cta") {
    return ctaText || "Start learning smarter with NeoLearn.";
  }

  if (scene.voiceover && scene.voiceover.trim()) {
    return scene.voiceover.trim();
  }

  if (scene.subtitle && scene.subtitle.trim()) {
    return scene.subtitle.trim();
  }

  if (scene.title && scene.title.trim()) {
    return scene.title.trim();
  }

  return fallbackTopic;
};

const splitCaption = (text: string) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [""];

  if (clean.length <= 58) return [clean];

  const mid = Math.floor(clean.length / 2);
  let splitAt = clean.lastIndexOf(" ", mid);

  if (splitAt < 20) {
    splitAt = clean.indexOf(" ", mid);
  }

  if (splitAt === -1) return [clean];

  return [clean.slice(0, splitAt).trim(), clean.slice(splitAt + 1).trim()].filter(Boolean);
};

const BackgroundMusic: React.FC<{
  src: string;
  introFrames: number;
  voiceStartFrame: number;
}> = ({ src, introFrames, voiceStartFrame }) => {
  const frame = useCurrentFrame();

  let volume = 0.08;

  if (frame < introFrames) {
    volume = 0.06;
  } else if (frame >= voiceStartFrame) {
    volume = 0.03;
  }

  return <Audio src={src} volume={volume} />;
};

const CaptionOverlay: React.FC<{
  text: string;
}> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 140, mass: 0.9 },
  });

  const opacity = interpolate(frame, [0, 4, 9999], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lines = splitCaption(text);

  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 38,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity,
        transform: `translateY(${(1 - pop) * 22}px) scale(${0.96 + pop * 0.04})`,
      }}
    >
      <div
        style={{
          maxWidth: 860,
          padding: "18px 26px",
          borderRadius: 24,
          background: "rgba(15,23,42,0.72)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 40px rgba(15,23,42,0.22)",
          backdropFilter: "blur(10px)",
          textAlign: "center",
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: "white",
              fontSize: lines.length === 1 ? 28 : 24,
              lineHeight: 1.28,
              fontWeight: 800,
              letterSpacing: -0.2,
              marginTop: i === 0 ? 0 : 4,
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};

export const NeoLearnVideo: React.FC<{
  data: VideoData;
}> = ({ data }) => {
  const introFrames = getIntroFrames(data.scenes);
  const narrationGapFrames = 8;
  const contentStartFrame = introFrames + narrationGapFrames;
  const voiceStartFrame = contentStartFrame;

  const introMusicSrc = getSafeStaticFile("/audio/neolearn-intro.mp3");
  const narrationSrc = getSafeStaticFile(data.audioUrl);
  const bgMusicSrc = getSafeStaticFile(data.bgMusicUrl);

  let currentFrame = 0;

  return (
    <FullScreen style={{ background: "#f8fbff" }}>
      {bgMusicSrc ? (
        <BackgroundMusic
          src={bgMusicSrc}
          introFrames={introFrames}
          voiceStartFrame={voiceStartFrame}
        />
      ) : null}

      {introMusicSrc ? (
        <Sequence from={0} durationInFrames={introFrames}>
          <Audio src={introMusicSrc} volume={0.9} />
        </Sequence>
      ) : null}

      {narrationSrc ? (
        <Sequence from={voiceStartFrame}>
          <Audio src={narrationSrc} volume={1} />
        </Sequence>
      ) : null}

      {data.scenes.map((scene, idx) => {
        const durationInFrames = toFrames(scene.durationMs);

        if (scene.type === "brand-intro") {
          currentFrame = introFrames;
          return (
            <Sequence key={idx} from={0} durationInFrames={introFrames}>
              <NeoIntro />
            </Sequence>
          );
        }

        const from = currentFrame + narrationGapFrames;
        currentFrame += durationInFrames;

        const captionText = buildCaptionText(scene, data.ctaText, data.topic);

        if (scene.type === "cta") {
          return (
            <Sequence key={idx} from={from} durationInFrames={durationInFrames}>
              <>
                <CtaSlide ctaText={data.ctaText} />
                <CaptionOverlay text={captionText} />
              </>
            </Sequence>
          );
        }

        return (
          <Sequence key={idx} from={from} durationInFrames={durationInFrames}>
            <>
              <SceneSlide
                type={scene.type}
                title={scene.title || data.topic}
                subtitle={scene.subtitle}
                points={scene.onscreenText || []}
                visualKind={scene.visualKind}
                visualIntent={scene.visualIntent}
              />
              <CaptionOverlay text={captionText} />
            </>
          </Sequence>
        );
      })}
    </FullScreen>
  );
};