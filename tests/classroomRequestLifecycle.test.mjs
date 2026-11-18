import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassroomRequestGuard, createClassroomRequestCache, fetchClassroomResponse } from '../app/lib/classroomRequestLifecycle.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('timeout includes stalled response bodies and releases the caller even when fetch ignores abort', async () => {
  let signal;
  await assert.rejects(fetchClassroomResponse('/lesson', {}, { timeoutMs: 5, fetchImpl: async (_, options) => {
    signal = options.signal;
    return { arrayBuffer: () => new Promise(() => {}) };
  }}), /classroom_wait_timeout/);
  assert.equal(signal.aborted, true);
});

test('stop waiting aborts the transport and permits a later independent request', async () => {
  const controller = new AbortController();
  const request = fetchClassroomResponse('/lesson', {}, { signal: controller.signal, fetchImpl: () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(request, /classroom_wait_stopped/);
  const response = await fetchClassroomResponse('/lesson', {}, { fetchImpl: async () => new Response('ready') });
  assert.equal(await response.text(), 'ready');
});

test('old topic/account responses and old cleanup cannot own a newer operation', async () => {
  const guard = createClassroomRequestGuard();
  const old = guard.begin('student1:topic1');
  const completion = deferred();
  const late = completion.promise.then(() => guard.current(old, 'student2:topic2'));
  const next = guard.begin('student2:topic2');
  completion.resolve();
  assert.equal(await late, false);
  assert.equal(old.controller.signal.aborted, true);
  assert.equal(guard.finish(old), false);
  assert.equal(guard.current(next, 'student2:topic2'), true);
  guard.cancel();
  assert.equal(guard.current(next, 'student2:topic2'), false);
});

test('audio retry reuses successful text and the exact original request identity/body', async () => {
  const request = createClassroomRequestCache();
  const calls = [];
  const config = { fetchImpl: async (url, options) => {
    calls.push({url, body: options.body, id: options.headers['x-request-id']});
    if (url === '/audio' && calls.filter(c => c.url === '/audio').length === 1) throw new Error('offline');
    return new Response(url === '/text' ? 'answer' : 'audio');
  }};
  const first = { method: 'POST', headers: {'x-request-id':'original'}, body:'original-body' };
  assert.equal(await (await request('/text', first, config)).text(), 'answer');
  await assert.rejects(request('/audio', first, config), /offline/);
  const changed = { ...first, headers: {'x-request-id':'changed'}, body:'changed-body' };
  assert.equal(await (await request('/text', changed, config)).text(), 'answer');
  await request('/audio', changed, config);
  assert.equal(calls.filter(c => c.url === '/text').length, 1);
  assert.ok(calls.every(c => c.body === 'original-body' && c.id === 'original'));
});

test('HTTP failures are not cached and retry retains original payload', async () => {
  const request = createClassroomRequestCache(); let calls = 0;
  const config = { fetchImpl: async (_, options) => { calls++; assert.equal(options.body, 'original'); return new Response('result', {status: calls === 1 ? 503 : 200}); }};
  assert.equal((await request('/text', {body:'original'}, config)).status, 503);
  assert.equal((await request('/text', {body:'different'}, config)).status, 200);
  assert.equal(calls, 2);
});

test('completion removes abort listeners and clears the deadline', async () => {
  const controller = new AbortController(); let listeners = 0;
  const signal = { get aborted() { return controller.signal.aborted; }, addEventListener(...args) { listeners++; controller.signal.addEventListener(...args); }, removeEventListener(...args) { listeners--; controller.signal.removeEventListener(...args); } };
  await fetchClassroomResponse('/text', {}, {signal, timeoutMs: 5, fetchImpl: async () => new Response('ok')});
  assert.equal(listeners, 0);
  controller.abort();
});

test('student integration commits new state after valid text and retries do not append answers again', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../app/student/page.tsx', import.meta.url), 'utf8');
  const start = page.slice(page.indexOf('const handleStartLesson'), page.indexOf('const openStartLearningFlow'));
  assert.ok(start.indexOf('setMessages([])') > start.indexOf('if (!scriptText)'));
  assert.match(start, /if \(!job.committed\)[\s\S]*setLessonOpening[\s\S]*job.committed = true/);
  assert.match(start, /void fetchClassroomResponse\("\/api\/progress\/topic"/);
  const ask = page.slice(page.indexOf('const handleAskQuestion'), page.indexOf('// ----------------- RENDER'));
  assert.match(ask, /if \(!job.committed\)[\s\S]*pushMessage\("Teacher", answer\)[\s\S]*job.committed = true/);
  assert.match(ask, /setQuestion\(\(current\) => current.trim\(\) === trimmed/);
  assert.match(ask, /job.sessionKey !== currentStudentSessionKey/);
});
