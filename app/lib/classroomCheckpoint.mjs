export const CLASSROOM_CHECKPOINT_MAX_BYTES = 100000;
export const CLASSROOM_CHECKPOINT_LIMIT = 200;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validateClassroomCheckpoint(input) {
  if (!input || !uuid(input.id)) throw new Error('invalid_checkpoint');
  const revision = input.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('invalid_revision');
  const record = { id: input.id };
  for (const key of ['subjectId', 'chapterId', 'topicId']) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 1) throw new Error('invalid_curriculum');
    record[key] = input[key];
  }
  for (const key of ['subject','chapter','topic','language','startedAt','endedAt','transcript']) {
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error('invalid_text');
    if (key !== 'transcript' && input[key].length > 300) throw new Error('invalid_text');
    record[key] = input[key];
  }
  for (const key of ['startedAt','endedAt']) {
    if (!Number.isFinite(Date.parse(record[key]))) throw new Error('invalid_date');
  }
  if (!['English','Hindi','Bengali'].includes(record.language)) throw new Error('invalid_language');
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 120) throw new Error('invalid_messages');
  record.messages = input.messages.map(message => {
    if (!['Teacher','You'].includes(message?.author) || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 24000) throw new Error('invalid_message');
    return { author: message.author, text: message.text };
  });
  record.draft = typeof input.draft === 'string' ? input.draft : '';
  if (record.draft.length > 4000) throw new Error('invalid_draft');
  if (new TextEncoder().encode(JSON.stringify(record)).length > CLASSROOM_CHECKPOINT_MAX_BYTES) throw new Error('checkpoint_too_large');
  return { record, revision };
}
export function checkpointLocalKey(accountId) { return `neolearnClassroomCheckpointV1:${accountId}`; }
export function mergeClassroomHistory(local, cloud) {
  const merged = new Map(local.map(item => [item.id, item]));
  for (const item of cloud) {
    const previous = merged.get(item.id);
    // A full local recording remains available while cloud list entries are summaries.
    merged.set(item.id, previous ? { ...item, ...previous, cloud: true, cloudSummary: previous.cloudSummary === true } : item);
  }
  return [...merged.values()].sort((a,b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
}
