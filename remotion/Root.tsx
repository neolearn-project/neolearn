// @ts-nocheck
import React from "react";
import { Composition } from "remotion";
import { NeoLearnVideo } from "./NeoLearnVideo";
import videoData from "./data/sample-video-data.json";

const fps = 30;

const toFrames = (ms: number) => Math.max(1, Math.round((ms / 1000) * fps));

const calcDuration = (data: any) => {
  const totalSceneFrames = Array.isArray(data?.scenes)
    ? data.scenes.reduce((sum: number, scene: any) => sum + toFrames(Number(scene?.durationMs || 0)), 0)
    : fps * 45;

  return Math.max(totalSceneFrames + fps * 2, fps * 20);
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="NeoLearnTrialVideo"
      component={NeoLearnVideo}
      durationInFrames={calcDuration(videoData)}
      fps={fps}
      width={1080}
      height={1920}
      defaultProps={{
        data: videoData,
      }}
    />
  );
};