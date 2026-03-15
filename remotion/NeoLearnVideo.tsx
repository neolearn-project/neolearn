import React from "react";
import {
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
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

const BackgroundMusic: React.FC<{
  src: string;
  voiceStartFrame: number;
}> = ({ src, voiceStartFrame }) => {
  const frame = useCurrentFrame();

  let volume = 0.12;
  if (frame >= voiceStartFrame) {
    volume = 0.04;
  }

  return <Audio src={src} volume={volume} />;
};

export const NeoLearnVideo: React.FC<{
  data: VideoData;
}> = ({ data }) => {
  let currentFrame = 0;

  const introFrames = getIntroFrames(data.scenes);
  const narrationGapFrames = 12;
  const voiceStartFrame = introFrames + narrationGapFrames;

  const introMusicSrc = getSafeStaticFile("/audio/neolearn-intro.mp3");
  const narrationSrc = getSafeStaticFile(data.audioUrl);
  const bgMusicSrc = getSafeStaticFile(data.bgMusicUrl);

  return (
   <FullScreen>
      {narrationSrc ? (
        <Sequence from={voiceStartFrame}>
          <Audio src={narrationSrc} volume={1} />
        </Sequence>
      ) : null}

      {bgMusicSrc ? (
        <BackgroundMusic
          src={bgMusicSrc}
          voiceStartFrame={voiceStartFrame}
        />
      ) : null}

      {introMusicSrc ? (
        <Sequence from={0} durationInFrames={introFrames}>
          <Audio src={introMusicSrc} volume={0.9} />
        </Sequence>
      ) : null}

      {data.scenes.map((scene, idx) => {
        const durationInFrames = toFrames(scene.durationMs);
        const from = currentFrame;
        currentFrame += durationInFrames;

        if (scene.type === "brand-intro") {
          return (
            <Sequence key={idx} from={from} durationInFrames={durationInFrames}>
              <NeoIntro />
            </Sequence>
          );
        }

        if (scene.type === "cta") {
          return (
            <Sequence key={idx} from={from} durationInFrames={durationInFrames}>
              <CtaSlide ctaText={data.ctaText} />
            </Sequence>
          );
        }

        return (
          <Sequence key={idx} from={from} durationInFrames={durationInFrames}>
            <SceneSlide
              type={scene.type}
              title={scene.title || data.topic}
              subtitle={scene.subtitle}
              points={scene.onscreenText || []}
              visualKind={scene.visualKind}
              visualIntent={scene.visualIntent}
            />
          </Sequence>
        );
      })}
    </FullScreen>
  );
};