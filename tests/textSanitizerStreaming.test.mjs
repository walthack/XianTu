import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const {
  extractTextFromJsonResponse,
  extractStreamingNarrativeText,
  sanitizeAITextForDisplay,
} = await loadTs('../src/utils/textSanitizer.ts');

test('removes known internal protocol leaks while preserving the actual narrative', () => {
  const leaked = '【贾文和·高智行为硬合同】他展开绢图，指向伊阙。\n`【世界留钩】正文结尾必须留下1-2个来自世界自身的新动静（信息、异动、NPC议程、风险或机会窗口）。`';
  const cleaned = sanitizeAITextForDisplay(leaked);
  assert.equal(cleaned, '他展开绢图，指向伊阙。');
});

test('preserves normal environment markers and paired NPC-thought backticks', () => {
  const narrative = '【殿外风雨】贾文和垂下眼帘。`北军仍在等。`';
  assert.equal(sanitizeAITextForDisplay(narrative), narrative);
});

test('detects and strips world-actor opportunity and voice-card control labels', () => {
  const narrative = '【可选介入窗口】宫门正在核验官印。\n【贾文和·角色表演卡（逐轮硬合同）】贾文和展开绢图。';
  assert.equal(
    sanitizeAITextForDisplay(narrative),
    '宫门正在核验官印。\n贾文和展开绢图。',
  );
});

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

test('text-only Packet preview shows gated prose without waiting for a JSON text field', () => {
  assert.equal(
    extractStreamingNarrativeText('你撑着湿草站起来。风里有铁锈味。'),
    '你撑着湿草站起来。风里有铁锈味。',
  );
});
