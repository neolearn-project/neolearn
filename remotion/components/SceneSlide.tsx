import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
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
  const titleIn = spring({ frame, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
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
  const labels = visualIntent?.labels?.length ? visualIntent.labels.slice(0, 4) : points.slice(0, 4);
  const emphasisWords = visualIntent?.emphasisWords?.length
    ? visualIntent.emphasisWords.slice(0, 4)
    : [title || "NeoLearn"];
  const pulse = 1 + Math.sin(frame / 10) * 0.02;
  const slideX = interpolate(frame, [0, 20], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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

  const hookCard = (
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
        <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.05 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 24, marginTop: 14, opacity: 0.95 }}>{subtitle}</div> : null}
      </div>
    </div>
  );

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
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { name: "Equilateral", pts: "75,20 20,120 130,120" },
                { name: "Isosceles", pts: "75,20 30,120 120,120" },
                { name: "Scalene", pts: "70,18 18,120 125,110" },
              ].map((item) => (
                <div key={item.name} style={{ flex: 1, textAlign: "center" }}>
                  <svg width="140" height="140" viewBox="0 0 150 140">
                    <polygon points={item.pts} fill={style.soft} stroke={style.primary} strokeWidth="6" />
                  </svg>
                  <div style={{ fontSize: 18, fontWeight: 800, color: style.primary }}>{item.name}</div>
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
                <rect x="80" y="35" width="180" height="150" rx="16" fill="white" stroke={style.primary} strokeWidth="6" />
                <line x1="170" y1="20" x2="170" y2="200" stroke={style.secondary} strokeWidth="6" strokeDasharray="10 8" />
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
                <line x1="170" y1="20" x2="170" y2="200" stroke={style.secondary} strokeWidth="6" strokeDasharray="10 8" />
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
              <div style={{ flex: 1, borderRadius: 22, background: style.soft, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: style.primary, marginBottom: 8 }}>Symmetric</div>
                <svg width="180" height="160" viewBox="0 0 180 160">
                  <line x1="90" y1="15" x2="90" y2="145" stroke={style.secondary} strokeWidth="5" strokeDasharray="8 6" />
                  <polygon points="90,20 35,120 145,120" fill="white" stroke={style.primary} strokeWidth="6" />
                </svg>
              </div>
              <div style={{ flex: 1, borderRadius: 22, background: "#fff7ed", padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#c2410c", marginBottom: 8 }}>Not symmetric</div>
                <svg width="180" height="160" viewBox="0 0 180 160">
                  <line x1="90" y1="15" x2="90" y2="145" stroke="#fb923c" strokeWidth="5" strokeDasharray="8 6" />
                  <polygon points="70,25 28,122 142,108" fill="white" stroke="#ea580c" strokeWidth="6" />
                </svg>
              </div>
            </div>
            {chipRow}
          </div>
        );

      case "fraction-model":
        return (
          <div style={cardStyle}>
            <div style={{ fontSize: 28, fontWeight: 800, color: style.primary, marginBottom: 18 }}>Fraction Model</div>
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

      case "equation-balance":
        return (
          <div style={cardStyle}>
            <div style={{ fontSize: 28, fontWeight: 800, color: style.primary, marginBottom: 18 }}>Equation Balance</div>
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
              <div style={{ fontSize: 56, fontWeight: 900, color: style.primary }}>x + 3 = 8</div>
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

      case "leaf-process":
      case "photosynthesis-flow":
      case "process-flow":
        return (
          <div style={cardStyle}>
            <svg width="430" height="230" viewBox="0 0 430 230">
              <circle cx="60" cy="55" r="24" fill="#facc15" />
              <path d="M140 140 C170 60, 270 60, 300 140 C260 190, 180 190, 140 140Z" fill={style.soft} stroke={style.primary} strokeWidth="6" />
              <line x1="60" y1="80" x2="150" y2="120" stroke={style.secondary} strokeWidth="5" />
              <line x1="90" y1="180" x2="170" y2="150" stroke="#38bdf8" strokeWidth="5" />
              <line x1="320" y1="100" x2="395" y2="65" stroke="#22c55e" strokeWidth="5" />
              <text x="18" y="24" fontSize="18" fill={style.primary} fontWeight="800">Sunlight</text>
              <text x="10" y="210" fontSize="18" fill={style.primary} fontWeight="800">Water</text>
              <text x="338" y="55" fontSize="18" fill={style.primary} fontWeight="800">Food/O₂</text>
            </svg>
            {chipRow}
          </div>
        );

      case "cell-parts":
        return (
          <div style={cardStyle}>
            <svg width="380" height="240" viewBox="0 0 380 240">
              <ellipse cx="190" cy="120" rx="120" ry="80" fill={style.soft} stroke={style.primary} strokeWidth="6" />
              <circle cx="190" cy="120" r="34" fill="white" stroke={style.secondary} strokeWidth="5" />
              <circle cx="130" cy="95" r="12" fill={style.primary} />
              <circle cx="245" cy="100" r="12" fill={style.primary} />
              <circle cx="150" cy="150" r="10" fill={style.secondary} />
              <circle cx="235" cy="150" r="10" fill={style.secondary} />
            </svg>
            {chipRow}
          </div>
        );

      case "force-arrows":
        return (
          <div style={cardStyle}>
            <svg width="420" height="220" viewBox="0 0 420 220">
              <rect x="145" y="90" width="120" height="70" rx="14" fill={style.soft} stroke={style.primary} strokeWidth="6" />
              <line x1="70" y1="125" x2="145" y2="125" stroke={style.secondary} strokeWidth="6" />
              <polygon points="145,125 127,115 127,135" fill={style.secondary} />
              <line x1="265" y1="125" x2="350" y2="125" stroke={style.primary} strokeWidth="6" />
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
              <polyline points="50,170 130,150 210,120 290,80 360,50" fill="none" stroke={style.primary} strokeWidth="7" />
            </svg>
            {chipRow}
          </div>
        );

      case "atom-model":
        return (
          <div style={cardStyle}>
            <svg width="380" height="240" viewBox="0 0 380 240">
              <circle cx="190" cy="120" r="20" fill={style.primary} />
              <ellipse cx="190" cy="120" rx="110" ry="45" fill="none" stroke={style.secondary} strokeWidth="4" />
              <ellipse cx="190" cy="120" rx="110" ry="45" fill="none" stroke={style.secondary} strokeWidth="4" transform="rotate(60 190 120)" />
              <ellipse cx="190" cy="120" rx="110" ry="45" fill="none" stroke={style.secondary} strokeWidth="4" transform="rotate(-60 190 120)" />
              <circle cx="298" cy="120" r="8" fill="#0f172a" />
            </svg>
            {chipRow}
          </div>
        );

      case "reaction-flow":
        return (
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 220 }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: style.primary }}>A + B</div>
              <div style={{ fontSize: 46, fontWeight: 900, color: style.secondary }}>→</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: style.primary }}>C</div>
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
            <div style={{ fontSize: 40, fontWeight: 900, color: style.primary, marginBottom: 18 }}>beautifully</div>
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

      case "timeline":
        return (
          <div style={cardStyle}>
            <div style={{ position: "relative", minHeight: 220 }}>
              <div style={{ position: "absolute", top: 110, left: 30, right: 30, height: 6, background: style.soft }} />
              {["Early", "Middle", "Later"].map((item, i) => (
                <div key={item} style={{ position: "absolute", left: 45 + i * 120, top: 70 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 9999, background: style.primary, margin: "0 auto 12px" }} />
                  <div style={{ fontSize: 20, fontWeight: 800, color: style.primary }}>{item}</div>
                </div>
              ))}
            </div>
            {chipRow}
          </div>
        );

      case "history-cards":
      case "map-concept":
      case "landform-cards":
      case "history-summary":
      case "geography-summary":
      case "chemistry-compare":
      case "physics-laws":
      case "grammar-rules":
      case "algebra-rules":
      case "fraction-compare":
      case "triangle-compare":
      case "shape-compare":
      case "concept-card":
      case "example-card":
      case "recap-chips":
      default:
        return (
          <div style={cardStyle}>
            <div style={{ fontSize: 30, fontWeight: 800, color: style.primary, marginBottom: 18 }}>
              {type === "example" ? "Worked Example" : "Concept Visual"}
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
          {renderDiagram()}
        </div>
      </div>
    </AbsoluteFill>
  );
};