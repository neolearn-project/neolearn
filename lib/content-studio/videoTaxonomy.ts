export type TopicFamily =
  | "geometry"
  | "fractions"
  | "algebra"
  | "biology"
  | "physics"
  | "chemistry"
  | "grammar"
  | "history"
  | "geography"
  | "general";

export type TopicStyle = {
  family: TopicFamily;
  primary: string;
  secondary: string;
  accent: string;
  soft: string;
  bgTop: string;
  bgBottom: string;
  badgeText: string;
};

const has = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase());

export function detectTopicFamily(subject?: string, topic?: string, extraText = ""): TopicFamily {
  const text = `${subject || ""} ${topic || ""} ${extraText}`.toLowerCase();

  if (
    has(
      text,
      /triangle|triangles|symmetry|line of symmetry|reflection|mirror|angle|angles|polygon|circle|quadrilateral|perimeter|area|geometry|shape|shapes/
    )
  ) {
    return "geometry";
  }

  if (has(text, /fraction|fractions|numerator|denominator|equivalent fraction|half|quarter|part of a whole/)) {
    return "fractions";
  }

  if (has(text, /algebra|equation|linear equation|expression|variable|polynomial|factor|solve for x/)) {
    return "algebra";
  }

  if (has(text, /photosynthesis|respiration|cell|cells|plant|plants|leaf|leaf|digestive|circulatory|biology/)) {
    return "biology";
  }

  if (has(text, /force|motion|speed|velocity|acceleration|gravity|friction|energy|physics/)) {
    return "physics";
  }

  if (has(text, /atom|molecule|element|compound|acid|base|salt|reaction|periodic|chemistry/)) {
    return "chemistry";
  }

  if (has(text, /noun|pronoun|verb|adjective|adverb|tense|sentence|grammar|english|parts of speech/)) {
    return "grammar";
  }

  if (has(text, /history|empire|civilization|revolt|revolution|freedom|medieval|ancient|timeline/)) {
    return "history";
  }

  if (has(text, /map|river|mountain|plateau|plain|climate|continent|latitude|longitude|geography/)) {
    return "geography";
  }

  return "general";
}

export function getTopicStyle(
  title?: string,
  subtitle?: string,
  points?: string[],
  subject?: string,
  topic?: string
): TopicStyle {
  const family = detectTopicFamily(subject || title, topic || subtitle, (points || []).join(" "));

  switch (family) {
    case "geometry":
      return {
        family,
        primary: "#0f766e",
        secondary: "#14b8a6",
        accent: "#0ea5e9",
        soft: "#ccfbf1",
        bgTop: "#ecfeff",
        bgBottom: "#eff6ff",
        badgeText: "Geometry",
      };
    case "fractions":
      return {
        family,
        primary: "#2563eb",
        secondary: "#7c3aed",
        accent: "#1d4ed8",
        soft: "#dbeafe",
        bgTop: "#eef6ff",
        bgBottom: "#eef2ff",
        badgeText: "Fractions",
      };
    case "algebra":
      return {
        family,
        primary: "#4f46e5",
        secondary: "#7c3aed",
        accent: "#4338ca",
        soft: "#e0e7ff",
        bgTop: "#eef2ff",
        bgBottom: "#f5f3ff",
        badgeText: "Algebra",
      };
    case "biology":
      return {
        family,
        primary: "#15803d",
        secondary: "#22c55e",
        accent: "#16a34a",
        soft: "#dcfce7",
        bgTop: "#f0fdf4",
        bgBottom: "#ecfeff",
        badgeText: "Biology",
      };
    case "physics":
      return {
        family,
        primary: "#0369a1",
        secondary: "#0891b2",
        accent: "#0284c7",
        soft: "#cffafe",
        bgTop: "#ecfeff",
        bgBottom: "#f8fafc",
        badgeText: "Physics",
      };
    case "chemistry":
      return {
        family,
        primary: "#c2410c",
        secondary: "#ea580c",
        accent: "#fb923c",
        soft: "#ffedd5",
        bgTop: "#fff7ed",
        bgBottom: "#fffaf0",
        badgeText: "Chemistry",
      };
    case "grammar":
      return {
        family,
        primary: "#7c3aed",
        secondary: "#ec4899",
        accent: "#6d28d9",
        soft: "#f3e8ff",
        bgTop: "#faf5ff",
        bgBottom: "#fff1f2",
        badgeText: "Grammar",
      };
    case "history":
      return {
        family,
        primary: "#92400e",
        secondary: "#d97706",
        accent: "#b45309",
        soft: "#fef3c7",
        bgTop: "#fffaf0",
        bgBottom: "#fefce8",
        badgeText: "History",
      };
    case "geography":
      return {
        family,
        primary: "#0369a1",
        secondary: "#16a34a",
        accent: "#0284c7",
        soft: "#dbeafe",
        bgTop: "#eff6ff",
        bgBottom: "#f0fdf4",
        badgeText: "Geography",
      };
    default:
      return {
        family,
        primary: "#2563eb",
        secondary: "#7c3aed",
        accent: "#1d4ed8",
        soft: "#dbeafe",
        bgTop: "#f8fbff",
        bgBottom: "#eef2ff",
        badgeText: "Smart Learning",
      };
  }
}

export function diagramForScene(params: {
  family: TopicFamily;
  topic: string;
  subject: string;
  type: "title" | "concept" | "example" | "recap" | "cta";
  title?: string;
  subtitle?: string;
}) {
  const text = `${params.subject} ${params.topic} ${params.title || ""} ${params.subtitle || ""}`.toLowerCase();

  if (params.type === "cta") return "brand-cta";
  if (params.type === "title") return `${params.family}-hook`;

  if (params.family === "geometry") {
    if (has(text, /symmetry|line of symmetry|mirror|reflection/)) {
      if (params.type === "concept") return "symmetry-line";
      if (params.type === "example") return "mirror-half";
      if (params.type === "recap") return "symmetric-vs-not";
    }
    if (has(text, /triangle|triangles/)) {
      if (params.type === "concept") return "triangle-types";
      if (params.type === "example") return "triangle-labels";
      if (params.type === "recap") return "triangle-compare";
    }
    if (has(text, /circle/)) {
      if (params.type === "concept") return "circle-parts";
      if (params.type === "example") return "circle-sectors";
      if (params.type === "recap") return "shape-compare";
    }
    return params.type === "example" ? "shape-example" : "shape-diagram";
  }

  if (params.family === "fractions") {
    if (params.type === "concept") return "fraction-model";
    if (params.type === "example") return "fraction-example";
    if (params.type === "recap") return "fraction-compare";
    return "fraction-hook";
  }

  if (params.family === "algebra") {
    if (params.type === "concept") return "equation-balance";
    if (params.type === "example") return "equation-steps";
    if (params.type === "recap") return "algebra-rules";
    return "algebra-hook";
  }

  if (params.family === "biology") {
    if (has(text, /photosynthesis/)) {
      if (params.type === "concept") return "leaf-process";
      if (params.type === "example") return "photosynthesis-flow";
      if (params.type === "recap") return "biology-cycle";
    }
    if (has(text, /cell/)) {
      if (params.type === "concept") return "cell-parts";
      if (params.type === "example") return "cell-zoom";
      if (params.type === "recap") return "cell-recap";
    }
    return params.type === "example" ? "biology-example" : "process-flow";
  }

  if (params.family === "physics") {
    if (params.type === "concept") return "force-arrows";
    if (params.type === "example") return "motion-graph";
    if (params.type === "recap") return "physics-laws";
    return "physics-hook";
  }

  if (params.family === "chemistry") {
    if (params.type === "concept") return "atom-model";
    if (params.type === "example") return "reaction-flow";
    if (params.type === "recap") return "chemistry-compare";
    return "chemistry-hook";
  }

  if (params.family === "grammar") {
    if (params.type === "concept") return "sentence-parts";
    if (params.type === "example") return "word-breakdown";
    if (params.type === "recap") return "grammar-rules";
    return "grammar-hook";
  }

  if (params.family === "history") {
    if (params.type === "concept") return "timeline";
    if (params.type === "example") return "history-cards";
    if (params.type === "recap") return "history-summary";
    return "history-hook";
  }

  if (params.family === "geography") {
    if (params.type === "concept") return "map-concept";
    if (params.type === "example") return "landform-cards";
    if (params.type === "recap") return "geography-summary";
    return "geography-hook";
  }

  if (params.type === "concept") return "concept-card";
  if (params.type === "example") return "example-card";
  if (params.type === "recap") return "recap-chips";
  return "generic-hook";
}

export function hookSubtitle(language: string) {
  const l = language.toLowerCase();
  if (l === "hindi") return "आसान, दृश्य और तेज़ सीखना";
  if (l === "bengali") return "সহজ, ভিজ্যুয়াল ও দ্রুত শেখা";
  return "Simple, visual and easy to learn";
}

export function defaultCtaVoice(language: string, ctaText: string) {
  const l = language.toLowerCase();
  if (ctaText?.trim()) return ctaText.trim();
  if (l === "hindi") return "NeoLearn के साथ स्मार्ट तरीके से सीखना शुरू करें।";
  if (l === "bengali") return "NeoLearn-এর সাথে স্মার্টভাবে শেখা শুরু করো।";
  return "Start learning smarter with NeoLearn.";
}