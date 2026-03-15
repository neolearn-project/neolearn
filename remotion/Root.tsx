// @ts-nocheck
import React from "react";
import { Composition } from "remotion";
import { NeoLearnVideo } from "./NeoLearnVideo";
import videoData from "./data/sample-video-data.json";

export const RemotionRoot: React.FC = () => {
  const fps = 30;
  const durationInFrames = 30 * 45;

  return (
    <>
      <Composition
        id="NeoLearnTrialVideo"
        component={NeoLearnVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{
          data: videoData,
        }}
      />
    </>
  );
};