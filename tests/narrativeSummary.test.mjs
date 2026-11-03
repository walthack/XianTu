// 详细描写不入档：概要条、无概要标记、提示词侧跳过与 tailChars（narrativeSummary.ts；设计稿 2026-11-03 第七节方案 B）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const { summaryEntry, isNoSummary, entriesForPrompt } = await loadTs('../src/services/narrativeSummary.ts');
const N = numbers.GAME_NUMBERS;
const MARKER = N.narrative.noSummaryMarker;
const PREFIX = '【仙道1年1月1日 08:00】';

const withTail = (tailChars, fn) => {
  const before = N.prompt.recentContext.tailChars;
  numbers.applyGameNumbers({ prompt: { recentContext: { tailChars } } });
  try { fn(); } finally { numbers.applyGameNumbers({ prompt: { recentContext: { tailChars: before } } }); }
};

test('配置默认值：localOnly、tailChars 0、标记由配置给出', () => {
  assert.equal(N.narrative.detailRetention, 'localOnly');
  assert.equal(N.prompt.recentContext.tailChars, 0);
  assert.equal(typeof MARKER, 'string');
  assert.ok(MARKER.trim());
});

test('配置校验：detailRetention 枚举、tailChars 非负、标记不能为空', () => {
  assert.throws(() => numbers.applyGameNumbers({ narrative: { detailRetention: 'all' } }), /LCQ-NUM-008/);
  assert.throws(() => numbers.applyGameNumbers({ prompt: { recentContext: { tailChars: -1 } } }), /LCQ-NUM-008/);
  assert.throws(() => numbers.applyGameNumbers({ narrative: { noSummaryMarker: '  ' } }), /LCQ-NUM-006/);
  assert.equal(N.narrative.noSummaryMarker, MARKER);
  assert.equal(N.narrative.detailRetention, 'localOnly');
});

test('summaryEntry：有概要写概要，带时间前缀', () => {
  assert.equal(summaryEntry(PREFIX, '韩云入城，见王哲。'), `${PREFIX}韩云入城，见王哲。`);
});

test('summaryEntry：概要为空写无概要标记，不截正文', () => {
  for (const empty of ['', '   ', undefined, null]) {
    const entry = summaryEntry(PREFIX, empty);
    assert.equal(entry, `${PREFIX}${MARKER}`);
    assert.ok(isNoSummary(entry));
  }
});

test('isNoSummary：只认标记条', () => {
  assert.ok(isNoSummary(MARKER));
  assert.ok(isNoSummary(`${PREFIX}${MARKER}`));
  assert.ok(!isNoSummary(`${PREFIX}韩云入城。`));
  assert.ok(!isNoSummary(`${PREFIX}${MARKER}之后又有事`));
  assert.ok(!isNoSummary(undefined));
});

test('entriesForPrompt：跳过无概要条，默认不附正文，不改入参', () => {
  const shortTerm = Object.freeze([`${PREFIX}摘1`, `${PREFIX}${MARKER}`, `${PREFIX}摘3`]);
  assert.deepEqual(entriesForPrompt(shortTerm, '最新一回合的正文全文'), [`${PREFIX}摘1`, `${PREFIX}摘3`]);
  assert.deepEqual(entriesForPrompt(shortTerm), [`${PREFIX}摘1`, `${PREFIX}摘3`]);
  assert.equal(shortTerm.length, 3);
});

test('entriesForPrompt：tailChars>0 附最新正文末尾若干字', () => {
  withTail(4, () => {
    assert.deepEqual(entriesForPrompt(['摘1'], '  前文很长很长末尾四字  '), ['摘1', '末尾四字']);
    assert.deepEqual(entriesForPrompt(['摘1'], '短'), ['摘1', '短']);
    assert.deepEqual(entriesForPrompt(['摘1'], ''), ['摘1']);
    assert.deepEqual(entriesForPrompt(['摘1']), ['摘1']);
  });
  assert.deepEqual(entriesForPrompt(['摘1'], '正文'), ['摘1']);
});
