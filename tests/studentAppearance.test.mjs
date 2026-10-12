import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_STUDENT_APPEARANCE,
  normalizeStudentAppearance,
  readStudentAppearance,
  resolveStudentAppearanceTheme,
  STUDENT_APPEARANCE_STORAGE_KEY,
  writeStudentAppearance,
} from "../app/lib/studentAppearance.mjs";

const page = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("student appearance validates stored values and survives unavailable storage", () => {
  assert.deepEqual(normalizeStudentAppearance({ mode: "dark", accent: "teal", readingSize: "extra-large" }), {
    mode: "dark", accent: "teal", readingSize: "extra-large",
  });
  assert.deepEqual(normalizeStudentAppearance({ mode: "sepia", accent: "red", readingSize: 99 }), DEFAULT_STUDENT_APPEARANCE);
  const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readStudentAppearance(unavailable), DEFAULT_STUDENT_APPEARANCE);
  assert.equal(writeStudentAppearance(unavailable, DEFAULT_STUDENT_APPEARANCE), false);
  const stored = new Map();
  const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  assert.equal(writeStudentAppearance(storage, { mode: "light", accent: "violet", readingSize: "large" }), true);
  assert.equal(stored.has(STUDENT_APPEARANCE_STORAGE_KEY), true);
  assert.deepEqual(readStudentAppearance(storage), { mode: "light", accent: "violet", readingSize: "large" });
});

test("system mode resolves without changing classroom state or starting work", () => {
  assert.equal(resolveStudentAppearanceTheme("system", true), "dark");
  assert.equal(resolveStudentAppearanceTheme("system", false), "light");
  assert.match(page, /data-appearance-theme=\{resolvedAppearanceTheme\}/);
  assert.match(page, /data-appearance-accent=\{appearance\.accent\}/);
  assert.match(page, /data-reading-size=\{appearance\.readingSize\}/);
  assert.match(page, /Mode[\s\S]*Light[\s\S]*Dark[\s\S]*System/);
  assert.match(page, /Accent[\s\S]*Ocean blue[\s\S]*Teal[\s\S]*Violet/);
  assert.match(page, /Reading size[\s\S]*Normal[\s\S]*Large[\s\S]*Extra Large/);
  const appearanceEffect = page.match(/useEffect\(\(\) => \{\s*if \(!appearanceReady\)[\s\S]*?\}, \[appearance, appearanceReady\]\);/)?.[0] || "";
  assert.ok(appearanceEffect);
  assert.doesNotMatch(appearanceEffect, /fetch\(|router\.|handleStartLesson|handleStartTopicTest|play\(/);
});

test("appearance CSS stays student-scoped and preserves answer-state colours and compact controls", () => {
  assert.match(css, /\.neo-student-shell\[data-appearance-theme="dark"\]/);
  assert.match(css, /\.neo-student-shell\[data-reading-size="extra-large"\]/);
  assert.match(css, /\.neo-student-shell \.neo-appearance-field[\s\S]*font-size: 0\.75rem/);
  assert.match(css, /\.bg-emerald-50[\s\S]*#a7f3d0/);
  assert.match(css, /\.bg-red-50[\s\S]*#fecaca/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /\.neo-dashboard \.line-clamp-2[\s\S]*-webkit-line-clamp: unset/);
  assert.doesNotMatch(css, /^(?:html|body)\[data-appearance-/m);
});

test("appearance contrast repairs cover navigation, sidebar states, logo, and narrow settings layout", () => {
  assert.match(css, /data-appearance-theme="dark"[\s\S]*neo-student-tabs button:not\(\.bg-blue-600\)[\s\S]*color: #cbd5e1/);
  assert.match(css, /data-appearance-theme="dark"[\s\S]*neo-classroom aside button:not[\s\S]*background: #111827[\s\S]*color: #e2e8f0/);
  assert.match(css, /neo-classroom aside button:disabled[\s\S]*color: #94a3b8[\s\S]*cursor: not-allowed/);
  assert.match(page, /src="\/logo\.svg"[\s\S]*alt="NeoLearn logo"/);
  assert.match(css, /neo-top-logo-image[\s\S]*object-fit: contain !important;[\s\S]*filter: none !important;/);
  assert.match(css, /data-appearance-theme="dark"[^}]*neo-top-logo-image[\s\S]*filter: none !important;/);
  assert.match(css, /data-appearance-theme="dark"[^}]*neo-top-logo[^{]*\{[\s\S]*background: rgba\(255, 255, 255, 0\.94\) !important;/);
  assert.match(css, /neo-settings-notice[\s\S]*width: min\(19rem, calc\(100vw - 1rem\)\)/);
  assert.match(css, /neo-appearance-field[\s\S]*minmax\(9rem, 1\.2fr\)/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*neo-settings-notice[\s\S]*calc\(100vw - 0\.75rem\)/);
});
