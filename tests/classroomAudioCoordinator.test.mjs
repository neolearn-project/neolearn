import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");
const realtime = await readFile(new URL("../app/student/realtimeTeacherClient.ts", import.meta.url), "utf8");

test("all teacher voice paths cancel competing and stale playback", () => {
  assert.match(page, /audioRequestVersionRef\.current \+= 1/);
  assert.match(page, /answerAudioRequestVersion === audioRequestVersionRef\.current/);
  assert.match(page, /onRemoteAudioStart: \(\) => \{\s*onStopLessonAudio\(\)/);
  assert.match(page, /includeAudio: false/);
  assert.match(realtime, /type: "response\.cancel"/);
  assert.match(realtime, /lifecycleGeneration/);
  assert.match(realtime, /this\.remoteAudio\?\.play\(\)/);
});
