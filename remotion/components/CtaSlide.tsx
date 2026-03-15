// @ts-nocheck
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { FullScreen } from "./FullScreen";
export const CtaSlide: React.FC<{ ctaText: string }> = ({ ctaText }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inAnim = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });

  const glow = interpolate(frame, [0, 45], [0.2, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <FullScreen
      style={{
        background:
          "radial-gradient(circle at 50% 30%, rgba(37,99,235,0.42), rgba(15,23,42,1) 60%)",
        color: "white",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
        padding: 80,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0) 68%)",
          filter: "blur(26px)",
          opacity: glow,
        }}
      />

      <div
        style={{
          transform: `scale(${0.92 + inAnim * 0.08}) translateY(${(1 - inAnim) * 18}px)`,
          opacity: inAnim,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontSize: 90,
            fontWeight: 800,
            letterSpacing: -1.2,
            marginBottom: 14,
          }}
        >
          NeoLearn
        </div>

        <div
          style={{
            fontSize: 32,
            color: "rgba(255,255,255,0.84)",
            marginBottom: 34,
          }}
        >
          AI Teachers for Every Child
        </div>

        <div
          style={{
            fontSize: 50,
            fontWeight: 700,
            maxWidth: 860,
            lineHeight: 1.25,
            marginBottom: 40,
          }}
        >
          {ctaText}
        </div>

        <div
          style={{
            padding: "18px 34px",
            borderRadius: 9999,
            background: "white",
            color: "#0f172a",
            fontSize: 30,
            fontWeight: 800,
            boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
          }}
        >
          Start Free Trial
        </div>
      </div>
    </FullScreen>
  );
};