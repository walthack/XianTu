// AIBS 接线（详细描写不入档，设计稿 2026-11-03 第七节方案 B；用户 17:05 批准追加解冻 AIBS）：
// 历史.叙事 与短期记忆写概要、全文另存本地副本（角色ID＋detailId，与读档迁移同口径）、隐式中期兜底不截正文、发送端过滤无概要。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const store = await loadTs('../src/services/narrativeDetailStore.ts');
const { migrateNarrativeDetailOnLoad } = await loadTs('../src/utils/dataRepair.ts');
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const aibs = read('../src/utils/AIBidirectionalSystem.ts');
const T1 = '【仙道历1年1月1日 08:00】';
const RAW = `${T1}本回合的详细正文，描写很长很长。`;
const SUM = `${T1}本回合概要。`;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('narrativeEntryWithDetail：条目只含概要，全文按 角色ID＋detailId 存进本地副本', async () => {
  store.setNarrativeDetailBackend(store.createMemoryDetailBackend());
  const entry = store.narrativeEntryWithDetail('char1', 3, SUM, RAW);
  assert.equal(entry.content, SUM);
  assert.equal(entry.summary, SUM);
  assert.equal(entry.detailId, store.narrativeDetailId(3, RAW));
  assert.equal(JSON.stringify(entry).includes(RAW), false);
  await flush();
  assert.equal(await store.getDetail('char1', entry.detailId), RAW);
});

test('新回合条目打迁移标记：再读档迁移不重复处理、不覆盖副本', async () => {
  store.setNarrativeDetailBackend(store.createMemoryDetailBackend());
  const entry = { type: 'gm', role: 'assistant', ...store.narrativeEntryWithDetail('char1', 0, SUM, RAW), time: T1 };
  await flush();
  const save = { 社交: { 记忆: { 短期记忆: [SUM], 隐式中期记忆: [SUM], 中期记忆: [], 长期记忆: [] } }, 系统: { 历史: { 叙事: [entry] } } };
  const result = await migrateNarrativeDetailOnLoad(save, 'char1');
  assert.equal(result.narrativeMigrated, 0);
  assert.equal(save.系统.历史.叙事[0].detailId, entry.detailId);
  assert.equal(await store.getDetail('char1', entry.detailId), RAW);
});

test('副本写失败不抛错、条目仍只含概要；detailRetention=none 不写；无存档标识不写', async () => {
  store.setNarrativeDetailBackend({ ...store.createMemoryDetailBackend(), async put() { throw new Error('quota'); } });
  const failed = store.narrativeEntryWithDetail('char1', 0, SUM, RAW);
  await flush();
  assert.equal(failed.content, SUM);
  const puts = [];
  store.setNarrativeDetailBackend({ ...store.createMemoryDetailBackend(), async put(record) { puts.push(record); } });
  store.narrativeEntryWithDetail('', 0, SUM, RAW);
  const narrative = numbers.GAME_NUMBERS.narrative;
  const before = narrative.detailRetention;
  narrative.detailRetention = 'none';
  try {
    store.narrativeEntryWithDetail('char1', 0, SUM, RAW);
    await flush();
  } finally {
    narrative.detailRetention = before;
  }
  assert.equal(puts.length, 0);
});

test('AIBS 源码接线：写概要、副本另存、兜底不截正文、发送端过滤无概要；审核降级接线不动', () => {
  assert.match(aibs, /\.\.\.narrativeEntryWithDetail\(useCharacterStore\(\)\.rootState\.当前激活存档\?\.角色ID \|\| '', \(saveData as any\)\.系统\.历史\.叙事\.length, summaryEntry\(timePrefix, midTermContent\), composeShortTermMemoryEntry\(timePrefix, textContent\)\)/);
  assert.match(aibs, /const shortMemoryEntry = summaryEntry\(timePrefix, midTermContent\);/);
  assert.match(aibs, /隐式中期记忆\.push\(summaryEntry\(timePrefix, midTermContent\)\)/);
  assert.equal(aibs.includes('textContent.slice(0, behavior.implicitMidFallbackMaxLen)'), false);
  assert.equal(/content: composeShortTermMemoryEntry\(timePrefix, textContent\)/.test(aibs), false);
  assert.match(aibs, /entriesForPrompt\(v3\?\.社交\?\.记忆\?\.短期记忆 \|\| \[\]\)\.slice\(-2\)/);
  assert.match(aibs, /const recentForPrompt = entriesForPrompt\(memoryToSend\);/);
  assert.match(aibs, /# 【最近事件】\\n\$\{recentForPrompt\.join\('\\n'\)\}/);
  assert.match(aibs, /moderationDegrade: \{ shortTerm: memoryToSend, implicitMid: v3\?\.社交\?\.记忆\?\.隐式中期记忆 \|\| \[\] \}/);
});

test('LCQ-SAV-061 已登记且由副本写入失败记录', () => {
  assert.match(read('../src/services/narrativeDetailStore.ts'), /\.catch\(error => logError\('LCQ-SAV-061'/);
  assert.match(read('../src/modules/diagnostics/codes.ts'), /'LCQ-SAV-061': spec\('warn', 'aiBidirectional'/);
  assert.match(read('../docs/ERROR-CODES.md'), /\| LCQ-SAV-061 \| warn \| aiBidirectional \|/);
});
