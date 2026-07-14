import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const {
  extractTextFromJsonResponse,
  extractStreamingNarrativeText,
} = await loadTs('../src/utils/textSanitizer.ts');

test('does not treat malformed JSON or analysis as a final narrative', () => {
  assert.equal(extractTextFromJsonResponse('先分析一下局势。\n{"text":"不应显示'), '');
  assert.equal(extractTextFromJsonResponse('<analysis>推理过程</analysis>{"text":"已落定"'), '');
});

test('extracts a complete final narrative only from valid JSON', () => {
  const response = '<think>hidden</think>{"text":"雨落青石，灯火未熄。","mid_term_memory":"抵达山门"}';
  assert.equal(extractTextFromJsonResponse(response), '雨落青石，灯火未熄。');
});

test('stream preview waits for text field and never echoes analysis or JSON syntax', () => {
  assert.equal(extractStreamingNarrativeText('让我先分析局势。\n{"mid_term_memory":"'), '');
  assert.equal(
    extractStreamingNarrativeText('<analysis>不可见</analysis>{"text":"雨落青石，'),
    '雨落青石，',
  );
  assert.equal(
    extractStreamingNarrativeText('{"text":"雨落\\n青石","mid_term_memory":"ok"}'),
    '雨落\n青石',
  );
});
