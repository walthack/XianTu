// 旧档读档迁移（dataRepair.ts migrateNarrativeDetailOnLoad；设计稿 2026-11-03 第七节方案 B 详细描写不入档）：
// 存档只留概要、正文进本地副本、短期记忆按序号换概要、无概要条标记并在发送时跳过、幂等、none 不写副本、副本写失败不清正文。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const store = await loadTs('../src/services/narrativeDetailStore.ts');
const summary = await loadTs('../src/services/narrativeSummary.ts');
const { migrateNarrativeDetailOnLoad } = await loadTs('../src/utils/dataRepair.ts');

const T1 = '【仙道历1年1月1日 08:00】';
const T2 = '【仙道历1年1月1日 09:00】';
const T3 = '【仙道历1年1月1日 10:00】';
const T0 = '【仙道历1年1月1日 07:00】';
const RAW0 = `${T0}最早一回合的详细正文，早已滚出短期记忆，摘要已转成中期记忆。`;
const RAW1 = `${T1}第一回合的详细正文，描写很长很长。`;
const RAW2 = `${T2}第二回合的详细正文，描写很长很长。`;
const RAW3 = `${T3}第三回合的详细正文，摘要为空。`;
const SUM0 = `${T0}早先的事。`;
const SUM2 = `${T2}第二回合概要。`;
const SUM1 = `${T1}第一回合概要。`;

function makeSave() {
  return {
    社交: { 记忆: { 短期记忆: [RAW1, RAW2, RAW3], 隐式中期记忆: [SUM1, SUM2, ''], 中期记忆: [SUM0], 长期记忆: [] } },
    系统: { 历史: { 叙事: [
      { type: 'gm', role: 'assistant', content: RAW0, time: T0, actionOptions: [] },
      { type: 'user', content: '玩家输入', time: T1, actionOptions: [] },
      { type: 'gm', role: 'assistant', content: RAW1, time: T1, actionOptions: [] },
      { type: 'gm', role: 'assistant', content: RAW2, time: T2, actionOptions: [] },
      { type: 'gm', role: 'assistant', content: RAW3, time: T3, actionOptions: [] },
    ] } },
  };
}

const fresh = () => store.setNarrativeDetailBackend(store.createMemoryDetailBackend());
const RAWS = [RAW0, RAW1, RAW2, RAW3];

test('迁移后存档 JSON 不含正文全文，本地副本可读回原文', async () => {
  fresh();
  const save = makeSave();
  const result = await migrateNarrativeDetailOnLoad(save, 'char1');
  const json = JSON.stringify(save);
  for (const raw of RAWS) assert.equal(json.includes(raw), false, raw);
  assert.deepEqual(result, { shortTermReplaced: 3, narrativeMigrated: 4, narrativeFailed: 0 });
  const gm = save.系统.历史.叙事.filter(item => item.type === 'gm');
  for (const [i, item] of gm.entries()) {
    assert.equal(await store.getDetail('char1', item.detailId), RAWS[i]);
    assert.equal(item.detailMigrated, 1);
    assert.equal(item.content, item.summary);
  }
  // 概要来源：与短期记忆同文→对齐的隐式中期；滚出短期记忆的→按时间前缀对上中期记忆；摘要为空→无概要
  assert.deepEqual(gm.map(item => item.summary), [SUM0, SUM1, SUM2, summary.summaryEntry(T3, '')]);
  assert.equal(summary.isNoSummary(gm[3].summary), true);
  // 玩家输入条不动
  assert.deepEqual(save.系统.历史.叙事[1], { type: 'user', content: '玩家输入', time: T1, actionOptions: [] });
});

test('短期记忆按末尾对齐的序号换成隐式中期记忆概要；对不上或为空的标无概要，发送时跳过', async () => {
  fresh();
  const save = makeSave();
  save.社交.记忆.短期记忆.unshift(`${T0}比隐式中期多出的一条`);
  await migrateNarrativeDetailOnLoad(save, 'char1');
  const shortTerm = save.社交.记忆.短期记忆;
  assert.equal(shortTerm.length, 4);
  assert.equal(summary.isNoSummary(shortTerm[0]), true);
  assert.equal(shortTerm[0].startsWith(T0), true);
  assert.deepEqual(shortTerm.slice(1, 3), [SUM1, SUM2]);
  assert.equal(summary.isNoSummary(shortTerm[3]), true);
  assert.deepEqual(summary.entriesForPrompt(shortTerm), [SUM1, SUM2]);
});

test('幂等：重复读档不重复写副本、不改结果', async () => {
  const puts = [];
  const backend = store.createMemoryDetailBackend();
  store.setNarrativeDetailBackend({ ...backend, async put(record) { puts.push(record.entryId); await backend.put(record); } });
  const save = makeSave();
  await migrateNarrativeDetailOnLoad(save, 'char1');
  const once = JSON.stringify(save);
  const putsOnce = puts.length;
  const again = await migrateNarrativeDetailOnLoad(save, 'char1');
  assert.equal(JSON.stringify(save), once);
  assert.equal(puts.length, putsOnce);
  assert.deepEqual(again, { shortTermReplaced: 0, narrativeMigrated: 0, narrativeFailed: 0 });
  const gm = save.系统.历史.叙事.filter(item => item.type === 'gm');
  assert.equal(await store.getDetail('char1', gm[1].detailId), RAW1);
});

test('detailRetention=none：不写副本，存档照样只留概要', async () => {
  const puts = [];
  store.setNarrativeDetailBackend({ ...store.createMemoryDetailBackend(), async put(record) { puts.push(record); } });
  numbers.applyGameNumbers({ narrative: { detailRetention: 'none' } });
  try {
    const save = makeSave();
    const result = await migrateNarrativeDetailOnLoad(save, 'char1');
    assert.equal(puts.length, 0);
    assert.equal(result.narrativeMigrated, 4);
    const json = JSON.stringify(save);
    for (const raw of RAWS) assert.equal(json.includes(raw), false, raw);
  } finally {
    numbers.applyGameNumbers({ narrative: { detailRetention: 'localOnly' } });
  }
});

test('副本写入失败：该条保留原文、不打标记，下次读档重试', async () => {
  store.setNarrativeDetailBackend({
    ...store.createMemoryDetailBackend(),
    async put(record) { if (record.content === RAW2) throw new Error('quota'); },
  });
  const save = makeSave();
  const result = await migrateNarrativeDetailOnLoad(save, 'char1');
  assert.equal(result.narrativeFailed, 1);
  const failed = save.系统.历史.叙事[3];
  assert.equal(failed.content, RAW2);
  assert.equal(failed.detailMigrated, undefined);
  assert.equal(failed.summary, undefined);
  fresh();
  const retry = await migrateNarrativeDetailOnLoad(save, 'char1');
  assert.equal(retry.narrativeMigrated, 1);
  assert.equal(save.系统.历史.叙事[3].content.includes('详细正文'), false);
  assert.equal(await store.getDetail('char1', save.系统.历史.叙事[3].detailId), RAW2);
});

test('接线：loadGame 在 applyLoadRepairs 后等迁移；迁移不调用模型；LCQ-SAV-060 已登记', () => {
  const src = readFileSync(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8');
  assert.match(src, /applyLoadRepairs\(targetSlot\.存档数据\);\n.*\n\s*await migrateNarrativeDetailOnLoad\(targetSlot\.存档数据, charId\);/);
  const repair = readFileSync(new URL('../src/utils/dataRepair.ts', import.meta.url), 'utf8');
  const fn = repair.slice(repair.indexOf('export async function migrateNarrativeDetailOnLoad'));
  assert.doesNotMatch(repair, /aiService|generateText|AIBidirectional|fetch\(/);
  assert.match(fn, /logError\('LCQ-SAV-060'/);
  assert.match(readFileSync(new URL('../src/modules/diagnostics/codes.ts', import.meta.url), 'utf8'), /'LCQ-SAV-060'/);
  assert.match(readFileSync(new URL('../docs/ERROR-CODES.md', import.meta.url), 'utf8'), /\| LCQ-SAV-060 \|/);
});
