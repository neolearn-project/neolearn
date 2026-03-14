import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { getTopicStyle } from "./topicStyle";

export const SceneSlide: React.FC<{
  title?: string;
  subtitle?: string;
  points?: string[];
  visualKind?: "hook" | "concept" | "example" | "recap";
}> = ({ title, subtitle, points = [], visualKind = "concept" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const style = getTopicStyle(title, subtitle, points);

  const titleIn = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });

  const bgDrift = interpolate(frame, [0, 180], [0, 80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const panelIn = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });

  const renderGeometryVisual = () => {
    if (visualKind === "hook") {
      return (
        <div
          style={{
            width: 470,
            height: 300,
            borderRadius: 34,
            background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
            boxShadow: `0 18px 40px ${style.primary}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 48,
            fontWeight: 800,
            textAlign: "center",
            padding: 24,
          }}
        >
          {title || "Geometry Concepts"}
        </div>
      );
    }

    if (visualKind === "example") {
      return (
        <div
          style={{
            width: 470,
            height: 420,
            borderRadius: 30,
            background: "white",
            boxShadow: `0 18px 40px ${style.primary}1f`,
            border: "1px solid rgba(148,163,184,0.16)",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="360" height="280" viewBox="0 0 360 280">
            <polygon
              points="180,30 60,230 300,230"
              fill={style.soft}
              stroke={style.primary}
              strokeWidth="8"
            />
            <circle cx="180" cy="30" r="8" fill={style.secondary} />
            <circle cx="60" cy="230" r="8" fill={style.secondary} />
            <circle cx="300" cy="230" r="8" fill={style.secondary} />
            <text x="170" y="20" fontSize="24" fontWeight="700" fill={style.primary}>
              A
            </text>
            <text x="34" y="252" fontSize="24" fontWeight="700" fill={style.primary}>
              B
            </text>
            <text x="308" y="252" fontSize="24" fontWeight="700" fill={style.primary}>
              C
            </text>
          </svg>
        </div>
      );
    }

    if (visualKind === "recap") {
      return (
        <div
          style={{
            width: 470,
            background: "white",
            borderRadius: 30,
            padding: 28,
            boxShadow: `0 18px 40px ${style.primary}1a`,
            border: "1px solid rgba(148,163,184,0.16)",
          }}
        >
          {(points.length ? points : ["Observe sides", "Compare angles", "Identify the type"]).map(
            (t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: i === 2 ? 0 : 18,
                }}
              >
                ✓ {t}
              </div>
            )
          )}
        </div>
      );
    }

    return (
      <div
        style={{
          width: 470,
          background: "white",
          borderRadius: 30,
          padding: 30,
          boxShadow: `0 18px 40px ${style.primary}1a`,
          border: "1px solid rgba(148,163,184,0.16)",
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: style.primary,
            marginBottom: 18,
          }}
        >
          Geometry Visual
        </div>

        <div
          style={{
            height: 230,
            borderRadius: 24,
            background: `linear-gradient(180deg, ${style.soft}, white)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <svg width="300" height="180" viewBox="0 0 300 180">
            <polygon
              points="150,20 40,150 260,150"
              fill="white"
              stroke={style.primary}
              strokeWidth="7"
            />
            <line x1="150" y1="20" x2="40" y2="150" stroke={style.secondary} strokeWidth="4" />
            <line x1="150" y1="20" x2="260" y2="150" stroke={style.secondary} strokeWidth="4" />
            <line x1="40" y1="150" x2="260" y2="150" stroke={style.secondary} strokeWidth="4" />
          </svg>
        </div>

        <div style={{ fontSize: 24, color: "#334155", fontWeight: 700 }}>
          Visual learning makes geometry easier to understand.
        </div>
      </div>
    );
  };

  const renderFractionVisual = () => {
    if (visualKind === "hook") {
      return (
        <div
          style={{
            width: 470,
            height: 300,
            borderRadius: 34,
            background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
            boxShadow: `0 18px 40px ${style.primary}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 64,
            fontWeight: 800,
          }}
        >
          {title || "Fractions"}
        </div>
      );
    }

    if (visualKind === "example") {
      return (
        <div
          style={{
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: `conic-gradient(${style.primary} 0deg 90deg, ${style.soft} 90deg 360deg)`,
            boxShadow: `0 18px 40px ${style.primary}2e`,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 40,
              borderRadius: 9999,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 62,
              fontWeight: 800,
              color: style.primary,
            }}
          >
            1/4
          </div>
        </div>
      );
    }

    if (visualKind === "recap") {
      return (
        <div
          style={{
            width: 470,
            background: "white",
            borderRadius: 30,
            padding: 28,
            boxShadow: `0 18px 40px ${style.primary}1a`,
            border: "1px solid rgba(148,163,184,0.16)",
          }}
        >
          {(points.length ? points : ["Part of a whole", "Equal parts matter", "Easy in daily life"]).map(
            (t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: i === 2 ? 0 : 18,
                }}
              >
                ✓ {t}
              </div>
            )
          )}
        </div>
      );
    }

    return (
      <div
        style={{
          width: 470,
          background: "white",
          borderRadius: 30,
          padding: 30,
          boxShadow: `0 18px 40px ${style.primary}1a`,
          border: "1px solid rgba(148,163,184,0.16)",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, color: style.primary, marginBottom: 18 }}>
          Fraction Visual
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 110,
                borderRadius: 20,
                background: i === 0 ? style.primary : style.soft,
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 26, color: "#334155", fontWeight: 700 }}>
          Equal parts make fractions easy to understand.
        </div>
      </div>
    );
  };

  const renderGenericVisual = () => {
    if (visualKind === "hook") {
      return (
        <div
          style={{
            width: 470,
            height: 300,
            borderRadius: 34,
            background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
            boxShadow: `0 18px 40px ${style.primary}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 54,
            fontWeight: 800,
            textAlign: "center",
            padding: 24,
          }}
        >
          {title || "NeoLearn"}
        </div>
      );
    }

    if (visualKind === "recap") {
      return (
        <div
          style={{
            width: 470,
            background: "white",
            borderRadius: 30,
            padding: 28,
            boxShadow: `0 18px 40px ${style.primary}1a`,
            border: "1px solid rgba(148,163,184,0.16)",
          }}
        >
          {(points.length ? points : ["Learn clearly", "Practice smartly", "Remember faster"]).map(
            (t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: i === 2 ? 0 : 18,
                }}
              >
                ✓ {t}
              </div>
            )
          )}
        </div>
      );
    }

    return (
      <div
        style={{
          width: 470,
          background: "white",
          borderRadius: 30,
          padding: 30,
          boxShadow: `0 18px 40px ${style.primary}1a`,
          border: "1px solid rgba(148,163,184,0.16)",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, color: style.primary, marginBottom: 18 }}>
          Concept Visual
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 110,
                borderRadius: 20,
                background: i % 2 === 0 ? style.soft : `${style.primary}22`,
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 26, color: "#334155", fontWeight: 700 }}>
          Smart visuals make learning easier and faster.
        </div>
      </div>
    );
  };

  const renderVisual = () => {
    if (style.family === "geometry") return renderGeometryVisual();
    if (style.family === "fractions") return renderFractionVisual();
    return renderGenericVisual();
  };

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${style.bgTop} 0%, #f8fbff 35%, ${style.bgBottom} 100%)`,
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -140,
          left: -60 + bgDrift,
          width: 420,
          height: 420,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${style.primary}22, rgba(255,255,255,0) 70%)`,
          filter: "blur(22px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -180,
          right: -60 - bgDrift * 0.6,
          width: 520,
          height: 520,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${style.secondary}22, rgba(255,255,255,0) 72%)`,
          filter: "blur(24px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 58,
          left: 70,
          right: 70,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, color: style.primary }}>NeoLearn</div>
        <div
          style={{
            padding: "10px 18px",
            borderRadius: 9999,
            background: `${style.primary}14`,
            color: style.accent,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {style.badgeText}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 145,
          left: 70,
          right: 70,
          transform: `translateY(${(1 - titleIn) * 26}px) scale(${0.96 + titleIn * 0.04})`,
          opacity: titleIn,
        }}
      >
        <div
          style={{
            fontSize: 78,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: -1.6,
            marginBottom: 18,
            maxWidth: 900,
          }}
        >
          {title}
        </div>

        {subtitle ? (
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.35,
              color: "#475569",
              maxWidth: 840,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 360,
          bottom: 80,
          display: "grid",
          gridTemplateColumns: "1.15fr 0.95fr",
          gap: 26,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {points.map((point, idx) => {
            const pointFrame = Math.max(0, frame - idx * 10);
            const pointIn = spring({
              frame: pointFrame,
              fps,
              config: { damping: 15, stiffness: 150, mass: 0.8 },
            });

            const lineGrow = interpolate(pointFrame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={idx}
                style={{
                  transform: `translateY(${(1 - pointIn) * 28}px) scale(${0.95 + pointIn * 0.05})`,
                  opacity: pointIn,
                  background: "rgba(255,255,255,0.88)",
                  borderRadius: 30,
                  padding: "24px 28px",
                  boxShadow: `0 14px 40px ${style.primary}14`,
                  border: "1px solid rgba(148,163,184,0.16)",
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${lineGrow * 10}px`,
                    background: `linear-gradient(180deg, ${style.primary}, ${style.secondary})`,
                  }}
                />

                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9999,
                    background: `linear-gradient(180deg, ${style.primary}, ${style.secondary})`,
                    flexShrink: 0,
                    marginLeft: 6,
                  }}
                />
                <div
                  style={{
                    fontSize: 35,
                    lineHeight: 1.35,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {point}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            transform: `translateY(${(1 - panelIn) * 24}px) scale(${0.94 + panelIn * 0.06})`,
            opacity: panelIn,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {renderVisual()}
        </div>
      </div>
    </AbsoluteFill>
  );
};