// @ts-nocheck
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FullScreen } from "./FullScreen";

export const NeoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, 8, 64, 80], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scaleIn = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.9 },
  });

  const titleRise = interpolate(frame, [0, 22], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowPulse = 1 + Math.sin(frame / 8) * 0.025;
  const ringRotate = interpolate(frame, [0, 90], [0, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <FullScreen
      style={{
        background: "linear-gradient(180deg, #eef6ff 0%, #f8fbff 40%, #eef2ff 100%)",
        fontFamily: "Arial, sans-serif",
        opacity: fade,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          left: -80,
          width: 420,
          height: 420,
          borderRadius: 9999,
          background: "radial-gradient(circle, rgba(37,99,235,0.18), rgba(37,99,235,0) 72%)",
          filter: "blur(22px)",
          transform: `scale(${glowPulse})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -140,
          right: -60,
          width: 500,
          height: 500,
          borderRadius: 9999,
          background: "radial-gradient(circle, rgba(124,58,237,0.15), rgba(124,58,237,0) 72%)",
          filter: "blur(24px)",
          transform: `scale(${glowPulse})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 460,
            height: 460,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${0.9 + scaleIn * 0.1})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 26,
              borderRadius: 9999,
              border: "2px solid rgba(37,99,235,0.14)",
              transform: `rotate(${ringRotate}deg)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background:
                "conic-gradient(from 180deg, rgba(37,99,235,0.22), rgba(124,58,237,0.10), rgba(37,99,235,0.22))",
              filter: "blur(18px)",
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "relative",
              width: 350,
              height: 350,
              borderRadius: 9999,
              background: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(148,163,184,0.16)",
              boxShadow: "0 24px 60px rgba(37,99,235,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 28,
            }}
          >
            <div style={{ transform: `translateY(${titleRise}px)` }}>
              <div
                style={{
                  fontSize: 84,
                  fontWeight: 900,
                  color: "#2563eb",
                  letterSpacing: -2,
                  lineHeight: 0.95,
                  marginBottom: 14,
                }}
              >
                NeoLearn
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: "#475569",
                  lineHeight: 1.2,
                }}
              >
                The Future of Learning
              </div>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#64748b",
                  letterSpacing: 1.2,
                }}
              >
                LEARN • PRACTICE • PROGRESS
              </div>
            </div>
          </div>
        </div>
      </div>
    </FullScreen>
  );
};