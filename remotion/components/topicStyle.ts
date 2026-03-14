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

export function detectTopicFamily(title?: string, subtitle?: string, points?: string[]) {
  const text = [title, subtitle, ...(points || [])].join(" ").toLowerCase();

  if (
    /triangle|triangles|angle|angles|polygon|circle|quadrilateral|geometry|line segment|perimeter|area/.test(
      text
    )
  ) {
    return "geometry";
  }

  if (/fraction|fractions|numerator|denominator|equivalent fraction|half|quarter/.test(text)) {
    return "fractions";
  }

  if (/algebra|equation|variable|expression|linear equation|polynomial/.test(text)) {
    return "algebra";
  }

  if (/photosynthesis|plant|plants|cell|cells|respiration|leaf|leafs|biology/.test(text)) {
    return "biology";
  }

  if (/force|motion|gravity|speed|velocity|physics|energy/.test(text)) {
    return "physics";
  }

  if (/atom|molecule|element|compound|reaction|acid|base|chemistry/.test(text)) {
    return "chemistry";
  }

  if (/noun|pronoun|verb|adjective|tense|grammar|sentence|english/.test(text)) {
    return "grammar";
  }

  if (/history|empire|king|freedom|revolution|civilization|ancient/.test(text)) {
    return "history";
  }

  if (/map|river|mountain|plateau|climate|continent|geography/.test(text)) {
    return "geography";
  }

  return "general";
}

export function getTopicStyle(
  title?: string,
  subtitle?: string,
  points?: string[]
): TopicStyle {
  const family = detectTopicFamily(title, subtitle, points);

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
        primary: "#0f766e",
        secondary: "#0891b2",
        accent: "#155e75",
        soft: "#cffafe",
        bgTop: "#ecfeff",
        bgBottom: "#f8fafc",
        badgeText: "Physics",
      };

    case "chemistry":
      return {
        family,
        primary: "#7c2d12",
        secondary: "#ea580c",
        accent: "#c2410c",
        soft: "#ffedd5",
        bgTop: "#fff7ed",
        bgBottom: "#f8fafc",
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