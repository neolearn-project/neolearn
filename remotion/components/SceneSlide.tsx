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

  const diagramType = visualIntent?.diagramType || "concept-card";
  const labels = visualIntent?.labels?.length
    ? visualIntent.labels.slice(0, 4)
    : points.slice(0, 4);

  const emphasisWords = visualIntent?.emphasisWords?.length
    ? visualIntent.emphasisWords.slice(0, 4)
    : [title || "NeoLearn"];

  const pulse = 1 + Math.sin(frame / 10) * 0.02;
  const slideX = interpolate(frame, [0, 20], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textBlob = `${title || ""} ${subtitle || ""} ${labels.join(" ")}`;

  const cardStyle: React.CSSProperties = {
    width: 500,
    background: "white",
    borderRadius: 30,
    padding: 24,
    boxShadow: `0 18px 40px ${style.primary}1f`,
    border: "1px solid rgba(148,163,184,0.16)",
  };

  const chipRow = (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
      {labels.map((label, i) => (
        <div
          key={i}
          style={{
            padding: "10px 16px",
            borderRadius: 9999,
            background: `${style.primary}14`,
            color: style.accent,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );

  const hookCard =
    diagramType === "geometry-hook" &&
    /triangle|triangles|त्रिभुज|ত্রিভুজ/i.test(textBlob) ? (
      <div
        style={{
          ...cardStyle,
          height: 300,
          background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
          color: "white",
          position: "relative",
          overflow: "hidden",
          transform: `scale(${pulse})`,
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 500 300"
          style={{ position: "absolute", inset: 0, opacity: 0.18 }}
        >
          <polygon points="250,40 130,230 370,230" fill="white" />
          <polygon points="120,85 55,230 205,230" fill="white" opacity="0.7" />
          <polygon points="380,95 305,230 455,230" fill="white" opacity="0.55" />
        </svg>
        <div
          style={{
            position: "relative",
            zIndex: 2,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 28,
          }}
        >
          <div>
            <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.05 }}>
              {title}
            </div>
            {subtitle ? (
              <div style={{ fontSize: 24, marginTop: 14, opacity: 0.95 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : (
      <div
        style={{
          ...cardStyle,
          height: 300,
          background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          transform: `scale(${pulse})`,
        }}
      >
        <div>
          <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.05 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 24, marginTop: 14, opacity: 0.95 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
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
      case "fractions-hook":
      case "algebra-hook":
      case "biology-hook":
      case "physics-hook":
      case "chemistry-hook":
      case "grammar-hook":
      case "history-hook":
      case "geography-hook":
      case "generic-hook":
        return hookCard;

      case "triangle-types":
        return (
          <div
            style={{
              ...cardStyle,
              transform: `translateX(${slideX * 0.35}px) scale(${pulse})`,
            }}
          >
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { name: "Equilateral", pts: "75,20 20,120 130,120" },
                { name: "Isosceles", pts: "75,20 30,120 120,120" },
                { name: "Scalene", pts: "70,18 18,120 125,110" },
              ].map((item) => (
                <div key={item.name} style={{ flex: 1, textAlign: "center" }}>
                  <svg width="140" height="140" viewBox="0 0 150 140">
                    <polygon
                      points={item.pts}
                      fill={style.soft}
                      stroke={style.primary}
                      strokeWidth="6"
                    />
                  </svg>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: style.primary,
                    }}
                  >
                    {item.name}
                  </div>
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "triangle-labels":
        return (
          <div style={{ ...cardStyle, transform: `scale(${pulse})` }}>
            <svg width="440" height="250" viewBox="0 0 440 250">
              <polygon
                points="220,30 90,210 350,210"
                fill="white"
                stroke={style.primary}
                strokeWidth="7"
              />
              <text x="210" y="22" fontSize="20" fill={style.primary} fontWeight="800">
                A
              </text>
              <text x="70" y="225" fontSize="20" fill={style.primary} fontWeight="800">
                B
              </text>
              <text x="355" y="225" fontSize="20" fill={style.primary} fontWeight="800">
                C
              </text>
              <text x="145" y="125" fontSize="18" fill={style.secondary} fontWeight="700">
                Side
              </text>
              <text x="280" y="125" fontSize="18" fill={style.secondary} fontWeight="700">
                Side
              </text>
              <text x="205" y="230" fontSize="18" fill={style.secondary} fontWeight="700">
                Base
              </text>
            </svg>
            {chipRow}
          </div>
        );

      case "triangle-compare":
        return (
          <div
            style={{
              ...cardStyle,
              width: 520,
              transform: `translateX(${slideX * 0.25}px)`,
            }}
          >
            <div style={{ display: "flex", gap: 16 }}>
              {[
                { title: "Equal sides", pts: "70,20 20,120 120,120" },
                { title: "Two equal", pts: "70,20 30,120 110,120" },
                { title: "All different", pts: "65,18 20,120 115,110" },
              ].map((item, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <svg width="130" height="120" viewBox="0 0 140 130">
                    <polygon
                      points={item.pts}
                      fill={style.soft}
                      stroke={style.primary}
                      strokeWidth="6"
                    />
                  </svg>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: style.primary,
                    }}
                  >
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "symmetry-line":
        return (
          <div style={cardStyle}>
            <div
              style={{
                height: 290,
                borderRadius: 24,
                background: `linear-gradient(180deg, ${style.soft}, white)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <svg width="340" height="220" viewBox="0 0 340 220">
                <rect
                  x="80"
                  y="35"
                  width="180"
                  height="150"
                  rx="16"
                  fill="white"
                  stroke={style.primary}
                  strokeWidth="6"
                />
                <line
                  x1="170"
                  y1="20"
                  x2="170"
                  y2="200"
                  stroke={style.secondary}
                  strokeWidth="6"
                  strokeDasharray="10 8"
                />
                <circle cx="125" cy="80" r="10" fill={style.primary} />
                <circle cx="215" cy="80" r="10" fill={style.primary} />
                <circle cx="125" cy="140" r="10" fill={style.primary} />
                <circle cx="215" cy="140" r="10" fill={style.primary} />
              </svg>
            </div>
            <div style={{ fontSize: 24, color: "#334155", fontWeight: 700 }}>
              A line of symmetry divides a shape into matching halves.
            </div>
            {chipRow}
          </div>
        );

      case "mirror-half":
        return (
          <div style={cardStyle}>
            <div
              style={{
                height: 290,
                borderRadius: 24,
                background: `linear-gradient(180deg, ${style.soft}, white)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <svg width="340" height="220" viewBox="0 0 340 220">
                <line
                  x1="170"
                  y1="20"
                  x2="170"
                  y2="200"
                  stroke={style.secondary}
                  strokeWidth="6"
                  strokeDasharray="10 8"
                />
                <path
                  d="M170 50 C150 35, 120 45, 120 80 C120 110, 145 128, 170 145"
                  fill="none"
                  stroke={style.primary}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M170 50 C190 35, 220 45, 220 80 C220 110, 195 128, 170 145"
                  fill="none"
                  stroke={style.primary}
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity={0.45}
                />
              </svg>
            </div>
            <div style={{ fontSize: 24, color: "#334155", fontWeight: 700 }}>
              One half reflects across the mirror line to form the full shape.
            </div>
            {chipRow}
          </div>
        );

      case "symmetric-vs-not":
        return (
          <div style={{ ...cardStyle, width: 520 }}>
            <div style={{ display: "flex", gap: 18 }}>
              <div
                style={{
                  flex: 1,
                  borderRadius: 22,
                  background: style.soft,
                  padding: 16,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: style.primary,
                    marginBottom: 8,
                  }}
                >
                  Symmetric
                </div>
                <svg width="180" height="160" viewBox="0 0 180 160">
                  <line
                    x1="90"
                    y1="15"
                    x2="90"
                    y2="145"
                    stroke={style.secondary}
                    strokeWidth="5"
                    strokeDasharray="8 6"
                  />
                  <polygon
                    points="90,20 35,120 145,120"
                    fill="white"
                    stroke={style.primary}
                    strokeWidth="6"
                  />
                </svg>
              </div>
              <div
                style={{
                  flex: 1,
                  borderRadius: 22,
                  background: "#fff7ed",
                  padding: 16,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#c2410c",
                    marginBottom: 8,
                  }}
                >
                  Not symmetric
                </div>
                <svg width="180" height="160" viewBox="0 0 180 160">
                  <line
                    x1="90"
                    y1="15"
                    x2="90"
                    y2="145"
                    stroke="#fb923c"
                    strokeWidth="5"
                    strokeDasharray="8 6"
                  />
                  <polygon
                    points="70,25 28,122 142,108"
                    fill="white"
                    stroke="#ea580c"
                    strokeWidth="6"
                  />
                </svg>
              </div>
            </div>
            {chipRow}
          </div>
        );

      case "circle-parts":
        return (
          <div style={cardStyle}>
            <svg width="420" height="240" viewBox="0 0 420 240">
              <circle
                cx="210"
                cy="120"
                r="78"
                fill="white"
                stroke={style.primary}
                strokeWidth="6"
              />
              <line
                x1="210"
                y1="120"
                x2="288"
                y2="120"
                stroke={style.secondary}
                strokeWidth="5"
              />
              <line
                x1="132"
                y1="120"
                x2="288"
                y2="120"
                stroke={style.primary}
                strokeWidth="4"
                strokeDasharray="7 6"
              />
              <text x="290" y="114" fontSize="18" fill={style.secondary} fontWeight="700">
                Radius
              </text>
              <text x="158" y="145" fontSize="18" fill={style.primary} fontWeight="700">
                Diameter
              </text>
              <circle cx="210" cy="120" r="6" fill={style.primary} />
            </svg>
            {chipRow}
          </div>
        );

      case "circle-sectors":
        return (
          <div style={cardStyle}>
            <div
              style={{
                width: 300,
                height: 300,
                margin: "0 auto",
                borderRadius: 9999,
                background: `conic-gradient(${style.primary} 0deg 110deg, ${style.secondary} 110deg 220deg, ${style.soft} 220deg 360deg)`,
              }}
            />
            {chipRow}
          </div>
        );

      case "shape-diagram":
        return (
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 18, justifyContent: "space-between" }}>
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 16,
                  background: style.soft,
                  border: `6px solid ${style.primary}`,
                }}
              />
              <div
                style={{
                  width: 100,
                  height: 90,
                  background: "white",
                  border: `6px solid ${style.primary}`,
                }}
              />
              <div
                style={{
                  width: 100,
                  height: 90,
                  clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
                  background: style.soft,
                  borderBottom: `6px solid ${style.primary}`,
                }}
              />
            </div>
            {chipRow}
          </div>
        );

      case "shape-example":
      case "shape-compare":
        return (
          <div style={{ ...cardStyle, width: 520 }}>
            <div style={{ display: "flex", gap: 16 }}>
              {["Square", "Rectangle", "Triangle"].map((name, i) => (
                <div key={name} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      margin: "0 auto 10px",
                      background: i === 2 ? style.soft : "white",
                      border: `6px solid ${style.primary}`,
                      borderRadius: i === 0 ? 16 : 6,
                      clipPath: i === 2 ? "polygon(50% 0%, 100% 100%, 0% 100%)" : "none",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: style.primary,
                    }}
                  >
                    {name}
                  </div>
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "fraction-model":
        return (
          <div style={cardStyle}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: style.primary,
                marginBottom: 18,
              }}
            >
              Fraction Visual
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 120,
                    borderRadius: 20,
                    background: i === 0 ? style.primary : style.soft,
                  }}
                />
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "fraction-example":
        return (
          <div style={cardStyle}>
            <div
              style={{
                width: 320,
                height: 320,
                margin: "0 auto",
                borderRadius: 9999,
                background: `conic-gradient(${style.primary} 0deg 90deg, ${style.soft} 90deg 360deg)`,
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
                  fontSize: 56,
                  fontWeight: 900,
                  color: style.primary,
                }}
              >
                1/4
              </div>
            </div>
            {chipRow}
          </div>
        );

      case "fraction-compare":
        return (
          <div style={{ ...cardStyle, width: 520 }}>
            <div style={{ display: "flex", gap: 18 }}>
              {["1/2", "1/3", "1/4"].map((f, i) => (
                <div key={f} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      height: 120,
                      borderRadius: 18,
                      background: i === 0 ? `${style.primary}` : `${style.soft}`,
                      opacity: i === 0 ? 1 : 0.85,
                      marginBottom: 10,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: style.primary,
                    }}
                  >
                    {f}
                  </div>
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "equation-balance":
        return (
          <div style={cardStyle}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: style.primary,
                marginBottom: 18,
              }}
            >
              Equation Balance
            </div>
            <div
              style={{
                minHeight: 220,
                borderRadius: 24,
                background: `linear-gradient(180deg, ${style.soft}, white)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 56, fontWeight: 900, color: style.primary }}>
                x + 3 = 8
              </div>
            </div>
            {chipRow}
          </div>
        );

      case "equation-steps":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 14 }}>
              {["x + 3 = 8", "x = 8 - 3", "x = 5"].map((step, i) => (
                <div
                  key={i}
                  style={{
                    padding: "18px 20px",
                    borderRadius: 20,
                    background: i === 2 ? `${style.primary}16` : `${style.soft}`,
                    fontSize: 32,
                    fontWeight: 800,
                    color: i === 2 ? style.primary : "#334155",
                  }}
                >
                  {step}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "algebra-rules":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              {["Like terms", "Balance both sides", "Simplify step by step"].map((rule) => (
                <div
                  key={rule}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 24,
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {rule}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "leaf-process":
      case "photosynthesis-flow":
      case "process-flow":
        return (
          <div style={cardStyle}>
            <svg width="430" height="230" viewBox="0 0 430 230">
              <circle cx="60" cy="55" r="24" fill="#facc15" />
              <path
                d="M140 140 C170 60, 270 60, 300 140 C260 190, 180 190, 140 140Z"
                fill={style.soft}
                stroke={style.primary}
                strokeWidth="6"
              />
              <line
                x1="60"
                y1="80"
                x2="150"
                y2="120"
                stroke={style.secondary}
                strokeWidth="5"
              />
              <line
                x1="90"
                y1="180"
                x2="170"
                y2="150"
                stroke="#38bdf8"
                strokeWidth="5"
              />
              <line
                x1="320"
                y1="100"
                x2="395"
                y2="65"
                stroke="#22c55e"
                strokeWidth="5"
              />
              <text x="18" y="24" fontSize="18" fill={style.primary} fontWeight="800">
                Sunlight
              </text>
              <text x="10" y="210" fontSize="18" fill={style.primary} fontWeight="800">
                Water
              </text>
              <text x="338" y="55" fontSize="18" fill={style.primary} fontWeight="800">
                Food/O₂
              </text>
            </svg>
            {chipRow}
          </div>
        );

      case "biology-cycle":
        return (
          <div style={cardStyle}>
            <svg width="420" height="240" viewBox="0 0 420 240">
              <circle
                cx="120"
                cy="120"
                r="40"
                fill={style.soft}
                stroke={style.primary}
                strokeWidth="5"
              />
              <circle
                cx="300"
                cy="120"
                r="40"
                fill="white"
                stroke={style.secondary}
                strokeWidth="5"
              />
              <path
                d="M160 95 C210 55, 250 55, 285 95"
                fill="none"
                stroke={style.primary}
                strokeWidth="5"
              />
              <path
                d="M280 145 C235 185, 185 185, 140 145"
                fill="none"
                stroke={style.secondary}
                strokeWidth="5"
              />
            </svg>
            {chipRow}
          </div>
        );

      case "cell-parts":
        return (
          <div style={cardStyle}>
            <svg width="380" height="240" viewBox="0 0 380 240">
              <ellipse
                cx="190"
                cy="120"
                rx="120"
                ry="80"
                fill={style.soft}
                stroke={style.primary}
                strokeWidth="6"
              />
              <circle
                cx="190"
                cy="120"
                r="34"
                fill="white"
                stroke={style.secondary}
                strokeWidth="5"
              />
              <circle cx="130" cy="95" r="12" fill={style.primary} />
              <circle cx="245" cy="100" r="12" fill={style.primary} />
              <circle cx="150" cy="150" r="10" fill={style.secondary} />
              <circle cx="235" cy="150" r="10" fill={style.secondary} />
            </svg>
            {chipRow}
          </div>
        );

      case "cell-zoom":
        return (
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="52"
                  fill={style.soft}
                  stroke={style.primary}
                  strokeWidth="6"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="18"
                  fill="white"
                  stroke={style.secondary}
                  strokeWidth="4"
                />
              </svg>
              <div style={{ fontSize: 38, fontWeight: 900, color: style.secondary }}>
                →
              </div>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="58"
                  fill="white"
                  stroke={style.primary}
                  strokeWidth="6"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="22"
                  fill={style.soft}
                  stroke={style.secondary}
                  strokeWidth="4"
                />
                <circle cx="48" cy="56" r="8" fill={style.primary} />
                <circle cx="112" cy="58" r="8" fill={style.primary} />
              </svg>
            </div>
            {chipRow}
          </div>
        );

      case "cell-recap":
      case "biology-example":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              {["Membrane", "Nucleus", "Cell parts work together"].map((t) => (
                <div
                  key={t}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 24,
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "force-arrows":
        return (
          <div style={cardStyle}>
            <svg width="420" height="220" viewBox="0 0 420 220">
              <rect
                x="145"
                y="90"
                width="120"
                height="70"
                rx="14"
                fill={style.soft}
                stroke={style.primary}
                strokeWidth="6"
              />
              <line
                x1="70"
                y1="125"
                x2="145"
                y2="125"
                stroke={style.secondary}
                strokeWidth="6"
              />
              <polygon points="145,125 127,115 127,135" fill={style.secondary} />
              <line
                x1="265"
                y1="125"
                x2="350"
                y2="125"
                stroke={style.primary}
                strokeWidth="6"
              />
              <polygon points="350,125 332,115 332,135" fill={style.primary} />
            </svg>
            {chipRow}
          </div>
        );

      case "motion-graph":
        return (
          <div style={cardStyle}>
            <svg width="420" height="240" viewBox="0 0 420 240">
              <line x1="50" y1="190" x2="370" y2="190" stroke="#64748b" strokeWidth="4" />
              <line x1="50" y1="30" x2="50" y2="190" stroke="#64748b" strokeWidth="4" />
              <polyline
                points="50,170 130,150 210,120 290,80 360,50"
                fill="none"
                stroke={style.primary}
                strokeWidth="7"
              />
            </svg>
            {chipRow}
          </div>
        );

      case "physics-laws":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              {["Force changes motion", "More force, more effect", "Observe direction"].map((t) => (
                <div
                  key={t}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 24,
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "atom-model":
        return (
          <div style={cardStyle}>
            <svg width="380" height="240" viewBox="0 0 380 240">
              <circle cx="190" cy="120" r="20" fill={style.primary} />
              <ellipse
                cx="190"
                cy="120"
                rx="110"
                ry="45"
                fill="none"
                stroke={style.secondary}
                strokeWidth="4"
              />
              <ellipse
                cx="190"
                cy="120"
                rx="110"
                ry="45"
                fill="none"
                stroke={style.secondary}
                strokeWidth="4"
                transform="rotate(60 190 120)"
              />
              <ellipse
                cx="190"
                cy="120"
                rx="110"
                ry="45"
                fill="none"
                stroke={style.secondary}
                strokeWidth="4"
                transform="rotate(-60 190 120)"
              />
              <circle cx="298" cy="120" r="8" fill="#0f172a" />
            </svg>
            {chipRow}
          </div>
        );

      case "reaction-flow":
        return (
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: 220,
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 900, color: style.primary }}>
                A + B
              </div>
              <div style={{ fontSize: 46, fontWeight: 900, color: style.secondary }}>
                →
              </div>
              <div style={{ fontSize: 34, fontWeight: 900, color: style.primary }}>
                C
              </div>
            </div>
            {chipRow}
          </div>
        );

      case "chemistry-compare":
        return (
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 16 }}>
              {["Element", "Compound", "Mixture"].map((x) => (
                <div
                  key={x}
                  style={{
                    flex: 1,
                    padding: "20px 10px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 22,
                    textAlign: "center",
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "sentence-parts":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 14 }}>
              {["Subject", "Verb", "Object"].map((part, i) => (
                <div
                  key={part}
                  style={{
                    padding: "18px 22px",
                    borderRadius: 18,
                    background: i === 1 ? `${style.primary}16` : style.soft,
                    fontSize: 28,
                    fontWeight: 800,
                    color: i === 1 ? style.primary : "#334155",
                  }}
                >
                  {part}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "word-breakdown":
        return (
          <div style={cardStyle}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: style.primary,
                marginBottom: 18,
              }}
            >
              beautifully
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {["beauty", "ful", "ly"].map((s) => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    padding: "18px 0",
                    textAlign: "center",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#334155",
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "grammar-rules":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              {["Identify the main word", "See its role", "Use it correctly"].map((x) => (
                <div
                  key={x}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 24,
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "timeline":
        return (
          <div style={cardStyle}>
            <div style={{ position: "relative", minHeight: 220 }}>
              <div
                style={{
                  position: "absolute",
                  top: 110,
                  left: 30,
                  right: 30,
                  height: 6,
                  background: style.soft,
                }}
              />
              {["Early", "Middle", "Later"].map((item, i) => (
                <div key={item} style={{ position: "absolute", left: 45 + i * 120, top: 70 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 9999,
                      background: style.primary,
                      margin: "0 auto 12px",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: style.primary,
                    }}
                  >
                    {item}
                  </div>
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "history-cards":
        return (
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 16 }}>
              {["Event", "Cause", "Effect"].map((x) => (
                <div
                  key={x}
                  style={{
                    flex: 1,
                    padding: "20px 10px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 22,
                    textAlign: "center",
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "history-summary":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              {["Time period", "Main event", "Why it matters"].map((x) => (
                <div
                  key={x}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 24,
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "map-concept":
        return (
          <div style={cardStyle}>
            <svg width="420" height="240" viewBox="0 0 420 240">
              <path
                d="M60 80 L120 50 L190 70 L260 45 L340 80 L330 170 L240 190 L160 170 L80 190 Z"
                fill={style.soft}
                stroke={style.primary}
                strokeWidth="6"
              />
              <circle cx="170" cy="110" r="8" fill={style.primary} />
              <circle cx="250" cy="125" r="8" fill={style.secondary} />
              <line
                x1="170"
                y1="110"
                x2="130"
                y2="85"
                stroke={style.primary}
                strokeWidth="3"
              />
              <line
                x1="250"
                y1="125"
                x2="290"
                y2="95"
                stroke={style.secondary}
                strokeWidth="3"
              />
            </svg>
            {chipRow}
          </div>
        );

      case "landform-cards":
        return (
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 16 }}>
              {["Mountain", "Plateau", "Plain"].map((x) => (
                <div
                  key={x}
                  style={{
                    flex: 1,
                    padding: "20px 10px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 20,
                    textAlign: "center",
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "geography-summary":
        return (
          <div style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              {["Location", "Features", "Importance"].map((x) => (
                <div
                  key={x}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    background: style.soft,
                    fontSize: 24,
                    fontWeight: 800,
                    color: style.primary,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "brand-cta":
        return (
          <div
            style={{
              ...cardStyle,
              height: 300,
              background: `linear-gradient(135deg, ${style.primary}, ${style.secondary})`,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05 }}>
                NeoLearn
              </div>
              <div style={{ fontSize: 24, marginTop: 14, opacity: 0.95 }}>
                Learn • Practice • Progress
              </div>
            </div>
          </div>
        );

      case "concept-card":
      case "example-card":
      case "recap-chips":
      default:
        return (
          <div style={cardStyle}>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: style.primary,
                marginBottom: 18,
              }}
            >
              {genericHeading}
            </div>
            <div
              style={{
                minHeight: 190,
                borderRadius: 24,
                background: `linear-gradient(180deg, ${style.soft}, white)`,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 12,
                transform: `translateX(${slideX}px)`,
              }}
            >
              {emphasisWords.slice(0, 3).map((word, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: i === 0 ? 32 : 24,
                    fontWeight: 900,
                    color: i === 0 ? style.primary : "#334155",
                  }}
                >
                  {word}
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );
    }
  };

  return (
    <FullScreen
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
        <div style={{ fontSize: 30, fontWeight: 800, color: style.primary }}>
          NeoLearn
        </div>
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
          {renderDiagram()}
        </div>
      </div>
    </FullScreen>
  );
};