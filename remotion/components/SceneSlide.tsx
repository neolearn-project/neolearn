// @ts-nocheck
import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FullScreen } from "./FullScreen";
import { getTopicStyle } from "../../lib/content-studio/videoTaxonomy";

type VisualIntent = {
  diagramType?: string;
  labels?: string[];
  emphasisWords?: string[];
  animationStyle?: "build" | "highlight" | "transform" | "flow";
};

export const SceneSlide: React.FC<{
  type?: "title" | "concept" | "example" | "recap" | "cta";
  title?: string;
  subtitle?: string;
  points?: string[];
  visualKind?: "hook" | "concept" | "example" | "recap";
  visualIntent?: VisualIntent;
}> = ({
  type = "concept",
  title,
  subtitle,
  points = [],
  visualIntent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const style = getTopicStyle(title, subtitle, points);

  const headerIn = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.9 },
  });

  const middleIn = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 16, stiffness: 130, mass: 0.9 },
  });

  const footerIn = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 16, stiffness: 140, mass: 0.9 },
  });

  const bgDrift = interpolate(frame, [0, 180], [0, 70], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pulse = 1 + Math.sin(frame / 10) * 0.02;
  const diagramType = visualIntent?.diagramType || "concept-card";
  const labels = visualIntent?.labels?.length
    ? visualIntent.labels.slice(0, 4)
    : points.slice(0, 4);

  const emphasisWords = visualIntent?.emphasisWords?.length
    ? visualIntent.emphasisWords.slice(0, 4)
    : [title || "NeoLearn"];

  const textBlob = `${title || ""} ${subtitle || ""} ${labels.join(" ")}`;

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 30,
    border: "1px solid rgba(148,163,184,0.14)",
    boxShadow: `0 20px 46px ${style.primary}18`,
    backdropFilter: "blur(8px)",
  };

  const chipRow = (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
        marginTop: 14,
      }}
    >
      {labels.map((label, i) => (
        <div
          key={i}
          style={{
            padding: "10px 16px",
            borderRadius: 9999,
            background: `${style.primary}14`,
            color: style.accent,
            fontSize: 17,
            fontWeight: 800,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );

  const genericHeading =
    type === "example"
      ? /हिंदी|त्रिभुज|उदाहरण/i.test(textBlob)
        ? "उदाहरण"
        : /বাংলা|উদাহরণ|ত্রিভুজ/i.test(textBlob)
          ? "উদাহরণ"
          : "Worked Example"
      : /हिंदी|त्रिभुज|क्या है|समझ/i.test(textBlob)
        ? "दृश्य समझ"
        : /বাংলা|কী|বোঝো|ধারণা/i.test(textBlob)
          ? "ভিজ্যুয়াল ধারণা"
          : "Concept Visual";

  const renderDiagram = () => {
    switch (diagramType) {
      case "geometry-hook":
      case "generic-hook":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
              color: "white",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              transform: `scale(${pulse})`,
              padding: 30,
            }}
          >
            {/triangle|triangles|त्रिभुज|ত্রিভুজ/i.test(textBlob) ? (
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 840 360"
                style={{ position: "absolute", inset: 0, opacity: 0.16 }}
              >
                <polygon points="420,45 265,290 575,290" fill="white" />
                <polygon points="190,105 105,290 285,290" fill="white" opacity="0.7" />
                <polygon points="650,105 555,290 735,290" fill="white" opacity="0.55" />
              </svg>
            ) : null}

            <div style={{ position: "relative", zIndex: 2 }}>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 900,
                  lineHeight: 1.05,
                  letterSpacing: -1.2,
                }}
              >
                {title}
              </div>
              {subtitle ? (
                <div
                  style={{
                    fontSize: 26,
                    marginTop: 16,
                    lineHeight: 1.3,
                    opacity: 0.95,
                  }}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
        );

      case "triangle-types":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 28,
              transform: `scale(${pulse})`,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, width: "100%" }}>
              {[
                { name: "Equilateral", pts: "95,25 25,145 165,145" },
                { name: "Isosceles", pts: "95,25 40,145 150,145" },
                { name: "Scalene", pts: "85,20 22,145 160,132" },
              ].map((item) => (
                <div key={item.name} style={{ flex: 1, textAlign: "center" }}>
                  <svg width="210" height="180" viewBox="0 0 190 170">
                    <polygon
                      points={item.pts}
                      fill={style.soft}
                      stroke={style.primary}
                      strokeWidth="7"
                    />
                  </svg>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: style.primary,
                    }}
                  >
                    {item.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "triangle-labels":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 24,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${pulse})`,
            }}
          >
            <svg width="720" height="320" viewBox="0 0 650 300">
              <polygon
                points="325,30 120,250 530,250"
                fill="white"
                stroke={style.primary}
                strokeWidth="8"
              />
              <text x="315" y="24" fontSize="24" fill={style.primary} fontWeight="800">A</text>
              <text x="95" y="268" fontSize="24" fill={style.primary} fontWeight="800">B</text>
              <text x="535" y="268" fontSize="24" fill={style.primary} fontWeight="800">C</text>
              <text x="210" y="140" fontSize="22" fill={style.secondary} fontWeight="700">Side</text>
              <text x="410" y="140" fontSize="22" fill={style.secondary} fontWeight="700">Side</text>
              <text x="300" y="280" fontSize="22" fill={style.secondary} fontWeight="700">Base</text>
            </svg>
          </div>
        );

      case "triangle-compare":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 24,
              transform: `scale(${pulse})`,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 18, width: "100%" }}>
              {[
                { title: "Equal sides", pts: "90,22 28,145 152,145" },
                { title: "Two equal", pts: "90,22 38,145 142,145" },
                { title: "All different", pts: "80,20 25,145 150,130" },
              ].map((item) => (
                <div key={item.title} style={{ flex: 1, textAlign: "center" }}>
                  <svg width="200" height="165" viewBox="0 0 180 150">
                    <polygon
                      points={item.pts}
                      fill={style.soft}
                      stroke={style.primary}
                      strokeWidth="7"
                    />
                  </svg>
                  <div style={{ fontSize: 18, fontWeight: 800, color: style.primary }}>
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "symmetry-line":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 24,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${pulse})`,
            }}
          >
            <svg width="700" height="320" viewBox="0 0 620 300">
              <rect
                x="190"
                y="55"
                width="240"
                height="190"
                rx="18"
                fill="white"
                stroke={style.primary}
                strokeWidth="8"
              />
              <line
                x1="310"
                y1="35"
                x2="310"
                y2="265"
                stroke={style.secondary}
                strokeWidth="7"
                strokeDasharray="12 8"
              />
              <circle cx="245" cy="105" r="12" fill={style.primary} />
              <circle cx="375" cy="105" r="12" fill={style.primary} />
              <circle cx="245" cy="180" r="12" fill={style.primary} />
              <circle cx="375" cy="180" r="12" fill={style.primary} />
            </svg>
          </div>
        );

      case "mirror-half":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 24,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${pulse})`,
            }}
          >
            <svg width="700" height="320" viewBox="0 0 620 300">
              <line
                x1="310"
                y1="35"
                x2="310"
                y2="265"
                stroke={style.secondary}
                strokeWidth="7"
                strokeDasharray="12 8"
              />
              <path
                d="M310 70 C278 48, 228 58, 228 110 C228 154, 266 178, 310 202"
                fill="none"
                stroke={style.primary}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M310 70 C342 48, 392 58, 392 110 C392 154, 354 178, 310 202"
                fill="none"
                stroke={style.primary}
                strokeWidth="10"
                strokeLinecap="round"
                opacity={0.42}
              />
            </svg>
          </div>
        );

      case "fraction-model":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 28,
              transform: `scale(${pulse})`,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 16, width: "100%" }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 190,
                    borderRadius: 24,
                    background: i === 0 ? style.primary : style.soft,
                  }}
                />
              ))}
            </div>
          </div>
        );

      case "fraction-example":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 24,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${pulse})`,
            }}
          >
            <div
              style={{
                width: 340,
                height: 340,
                borderRadius: 9999,
                background: `conic-gradient(${style.primary} 0deg 90deg, ${style.soft} 90deg 360deg)`,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 44,
                  borderRadius: 9999,
                  background: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 60,
                  fontWeight: 900,
                  color: style.primary,
                }}
              >
                1/4
              </div>
            </div>
          </div>
        );

      case "equation-balance":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${pulse})`,
            }}
          >
            <div style={{ fontSize: 66, fontWeight: 900, color: style.primary }}>
              x + 3 = 8
            </div>
          </div>
        );

      case "equation-steps":
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 28,
              transform: `scale(${pulse})`,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "grid", gap: 16, width: "100%" }}>
              {["x + 3 = 8", "x = 8 - 3", "x = 5"].map((step, i) => (
                <div
                  key={i}
                  style={{
                    padding: "18px 22px",
                    borderRadius: 22,
                    background: i === 2 ? `${style.primary}16` : style.soft,
                    fontSize: 34,
                    fontWeight: 800,
                    color: i === 2 ? style.primary : "#334155",
                    textAlign: "center",
                  }}
                >
                  {step}
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return (
          <div
            style={{
              ...cardStyle,
              width: 840,
              minHeight: 360,
              padding: 28,
              transform: `scale(${pulse})`,
            }}
          >
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: style.primary,
                marginBottom: 18,
                textAlign: "center",
              }}
            >
              {genericHeading}
            </div>

            <div
              style={{
                minHeight: 220,
                borderRadius: 24,
                background: `linear-gradient(180deg, ${style.soft}, white)`,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 12,
              }}
            >
              {emphasisWords.slice(0, 3).map((word, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: i === 0 ? 36 : 26,
                    fontWeight: 900,
                    color: i === 0 ? style.primary : "#334155",
                    textAlign: "center",
                  }}
                >
                  {word}
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <FullScreen
      style={{
        background: `linear-gradient(180deg, ${style.bgTop} 0%, #f8fbff 36%, ${style.bgBottom} 100%)`,
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -150,
          left: -90 + bgDrift,
          width: 470,
          height: 470,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${style.primary}22, rgba(255,255,255,0) 72%)`,
          filter: "blur(24px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -190,
          right: -70 - bgDrift * 0.5,
          width: 560,
          height: 560,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${style.secondary}22, rgba(255,255,255,0) 72%)`,
          filter: "blur(26px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 34,
          left: 40,
          right: 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: headerIn,
          transform: `translateY(${(1 - headerIn) * 18}px) scale(${0.97 + headerIn * 0.03})`,
          zIndex: 4,
        }}
      >
        <div
          style={{
            fontSize: 62,
            fontWeight: 900,
            color: style.primary,
            letterSpacing: -2,
            lineHeight: 1,
            marginBottom: 10,
          }}
        >
          NeoLearn
        </div>

        <div
          style={{
            padding: "10px 20px",
            borderRadius: 9999,
            background: `${style.primary}14`,
            color: style.accent,
            fontSize: 21,
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          {style.badgeText}
        </div>

        <div
          style={{
            maxWidth: 980,
            fontSize: type === "title" ? 82 : 58,
            fontWeight: 900,
            lineHeight: 1.02,
            letterSpacing: -1.8,
            textAlign: "center",
            color: "#0f172a",
            marginBottom: 14,
          }}
        >
          {title}
        </div>

        {subtitle ? (
          <div
            style={{
              maxWidth: 960,
              fontSize: 30,
              lineHeight: 1.3,
              color: "#475569",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          top: type === "title" ? 260 : 230,
          left: 40,
          right: 40,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: middleIn,
          transform: `translateY(${(1 - middleIn) * 20}px) scale(${0.96 + middleIn * 0.04})`,
          zIndex: 3,
        }}
      >
        {renderDiagram()}
      </div>

      <div
        style={{
          position: "absolute",
          left: 36,
          right: 36,
          bottom: 120,
          opacity: footerIn,
          transform: `translateY(${(1 - footerIn) * 20}px)`,
          zIndex: 4,
        }}
      >
        <div
          style={{
            ...cardStyle,
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
            {points.map((point, idx) => {
              const pointFrame = Math.max(0, frame - idx * 8);
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
                    transform: `translateY(${(1 - pointIn) * 16}px) scale(${0.97 + pointIn * 0.03})`,
                    opacity: pointIn,
                    background: "rgba(255,255,255,0.96)",
                    borderRadius: 22,
                    padding: "14px 18px",
                    boxShadow: `0 10px 24px ${style.primary}10`,
                    border: "1px solid rgba(148,163,184,0.12)",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
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
                      width: `${lineGrow * 9}px`,
                      background: `linear-gradient(180deg, ${style.primary}, ${style.secondary})`,
                    }}
                  />
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 9999,
                      background: `linear-gradient(180deg, ${style.primary}, ${style.secondary})`,
                      flexShrink: 0,
                      marginLeft: 2,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 24,
                      lineHeight: 1.28,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {point}
                  </div>
                </div>
              );
            })}
          </div>

          {labels.length && (type === "title" || type === "concept") ? chipRow : null}
        </div>
      </div>
    </FullScreen>
  );
};