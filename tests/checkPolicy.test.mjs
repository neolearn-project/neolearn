import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccessSummary } from '../lib/access/checkPolicy.js';

test('computeAccessSummary returns zero usage for empty rows', () => {
  const result = computeAccessSummary([]);
  assert.deepEqual(result, { used: 0, limit: 5, allowed: true });
});

test('computeAccessSummary counts unique topic ids only', () => {
  const rows = [
    { topic_id: 't1' },
    { topic_id: 't1' },
    { topic_id: 't2' },
  ];

  const result = computeAccessSummary(rows);
  assert.deepEqual(result, { used: 2, limit: 5, allowed: true });
});

test('computeAccessSummary blocks when usage reaches limit', () => {
  const rows = [
    { topic_id: '1' },
    { topic_id: '2' },
    { topic_id: '3' },
    { topic_id: '4' },
    { topic_id: '5' },
  ];

  const result = computeAccessSummary(rows, 5);
  assert.deepEqual(result, { used: 5, limit: 5, allowed: false });
});

test('computeAccessSummary ignores falsy topic ids', () => {
  const rows = [{ topic_id: '' }, { topic_id: null }, { topic_id: 'valid' }];
  const result = computeAccessSummary(rows, 2);

  assert.deepEqual(result, { used: 1, limit: 2, allowed: true });
});
