import assert from 'node:assert/strict';
import test from 'node:test';
import {chaptersWithActiveTopics} from '../app/lib/activeCurriculum.mjs';
test('retired and draft chapters are hidden without changing historical rows', () => {
  const chapters=[{id:413},{id:1495},{id:1496}];
  const topics=[{chapter_id:413,is_active:false},{chapter_id:1495,is_active:true},{chapter_id:1496,is_active:false}];
  assert.deepEqual(chaptersWithActiveTopics(chapters,topics),[{id:1495}]);
  assert.equal(chapters.length,3);assert.equal(topics.length,3);
});
test('mixed chapters keep their identity and curriculum order', () => {
  const chapters=[{id:2},{id:1}];
  assert.deepEqual(chaptersWithActiveTopics(chapters,[{chapter_id:1,is_active:true},{chapter_id:2,is_active:false},{chapter_id:2,is_active:true}]),chapters);
});
test('no active topics yields no selectable chapters', () => {
  assert.deepEqual(chaptersWithActiveTopics([{id:1}],[]),[]);
});
