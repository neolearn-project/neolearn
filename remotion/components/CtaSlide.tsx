// @ts-nocheck
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
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
          "radial-gradient(circle at 50% 25%, rgba(37,99,235,0.42), rgba(15,23,42,1) 62%)",
        color: "white",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 46,
            textAlign: "center",
            transform: `translateY(${(1 - inAnim) * 12}px) scale(${0.97 + inAnim * 0.03})`,
            opacity: inAnim,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 900,
              letterSpacing: -1.8,
              lineHeight: 1,
            }}
          >
            NeoLearn
          </div>
          <div
            style={{
              fontSize: 28,
              marginTop: 10,
              color: "rgba(255,255,255,0.82)",
              fontWeight: 700,
            }}
          >
            AI Teachers for Every Child
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 180,
            width: 760,
            height: 320,
            borderRadius: 36,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0) 68%)",
            filter: "blur(26px)",
            opacity: glow,
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 210,
            width: 780,
            minHeight: 280,
            borderRadius: 34,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.26)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "34px 38px",
            textAlign: "center",
            transform: `scale(${0.93 + inAnim * 0.07}) translateY(${(1 - inAnim) * 18}px)`,
            opacity: inAnim,
          }}
        >
          <div
            style={{
              fontSize: 46,
              fontWeight: 800,
              lineHeight: 1.28,
              maxWidth: 680,
            }}
          >
            {ctaText}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 74,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: `translateY(${(1 - inAnim) * 16}px)`,
            opacity: inAnim,
          }}
        >
          <div
            style={{
              padding: "18px 34px",
              borderRadius: 9999,
              background: "white",
              color: "#0f172a",
              fontSize: 30,
              fontWeight: 900,
              boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
              marginBottom: 18,
            }}
          >
            Start Free Trial
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,255,255,0.82)",
              letterSpacing: 0.5,
            }}
          >
            Learn • Practice • Progress
          </div>
        </div>
      </div>
    </FullScreen>
  );
};