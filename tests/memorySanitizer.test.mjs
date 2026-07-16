import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/memorySanitizer.ts');

test('extracts the actual summary from old think-wrapped JSON memory', async () => {
  const { sanitizePersistedMemoryEntry } = await modPromise;
  const polluted = '<think>用户要求我生成250-400字总结，先分析。</think>\n```json\n{"text":"谢艺获救后在草庐长期休养，孟非卿改变了后续安排。"}\n```';
  assert.equal(
    sanitizePersistedMemoryEntry(polluted),
    '谢艺获救后在草庐长期休养，孟非卿改变了后续安排。',
  );
});

test('drops bare model task instructions while preserving ordinary narrative memories', async () => {
  const { sanitizePersistedMemoryArray } = await modPromise;
  assert.deepEqual(sanitizePersistedMemoryArray([
    '用户要求我生成250-400字总结，需要保留关键事件。',
    '程宗扬在草庐见到仍然活着的谢艺。',
    '<thinking>only reasoning without a final answer',
  ]), ['程宗扬在草庐见到仍然活着的谢艺。']);
});
