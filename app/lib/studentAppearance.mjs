export const STUDENT_APPEARANCE_STORAGE_KEY = "neolearnStudentAppearanceV1";

export const DEFAULT_STUDENT_APPEARANCE = Object.freeze({
  mode: "system",
  accent: "default",
  readingSize: "normal",
});

const MODES = new Set(["light", "dark", "system"]);
const ACCENTS = new Set(["default", "teal", "violet"]);
const READING_SIZES = new Set(["normal", "large", "extra-large"]);

export function normalizeStudentAppearance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_STUDENT_APPEARANCE };
  }
  return {
    mode: MODES.has(value.mode) ? value.mode : DEFAULT_STUDENT_APPEARANCE.mode,
    accent: ACCENTS.has(value.accent) ? value.accent : DEFAULT_STUDENT_APPEARANCE.accent,
    readingSize: READING_SIZES.has(value.readingSize)
      ? value.readingSize
      : DEFAULT_STUDENT_APPEARANCE.readingSize,
  };
}

export function readStudentAppearance(storage) {
  try {
    const raw = storage?.getItem?.(STUDENT_APPEARANCE_STORAGE_KEY);
    return raw ? normalizeStudentAppearance(JSON.parse(raw)) : { ...DEFAULT_STUDENT_APPEARANCE };
  } catch {
    return { ...DEFAULT_STUDENT_APPEARANCE };
  }
}

export function writeStudentAppearance(storage, value) {
  const normalized = normalizeStudentAppearance(value);
  try {
    storage?.setItem?.(STUDENT_APPEARANCE_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function resolveStudentAppearanceTheme(mode, systemPrefersDark) {
  return mode === "dark" || (mode === "system" && systemPrefersDark) ? "dark" : "light";
}
