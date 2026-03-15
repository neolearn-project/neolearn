import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { FullScreen } from "./FullScreen";

export const NeoIntro: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 12, 48, 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(frame, [0, 20], [0.92, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <FullScreen
      style={{
        background: "linear-gradient(180deg, #eef6ff 0%, #f8fbff 35%, #eef2ff 100%)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          padding: "28px 42px",
          borderRadius: 32,
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 20px 50px rgba(37,99,235,0.14)",
          border: "1px solid rgba(148,163,184,0.16)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 68,
            fontWeight: 900,
            color: "#2563eb",
            letterSpacing: -1.5,
            lineHeight: 1,
            marginBottom: 14,
          }}
        >
          NeoLearn
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#475569",
          }}
        >
          The Future of Learning
        </div>
      </div>
    </FullScreen>
  );
};