// Sol 周审修复（2026-10-22）：①战前存档失败、存档外游标读写失败带错误码写持久日志；②诗薇莫离开判定走项目 RNG；
// ③炼制提示词级数—品质上限按原著九级、成功率区间读配置；附 ch78 蛇傀／黑舌身份回归（见 chapterIdentitySwitch.test.mjs）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const log = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');
const salt = await loadTs('../src/modules/sceneModule/host/rngSalt.ts');
const R = await loadTs('../src/modules/scenarioMods/shiweimoRescue.ts');
const turn = await loadTs('../src/modules/scenarioMods/freeAction/turn.ts');
const { GAME_NUMBERS: GN } = await loadTs('../src/modules/sceneModule/numbers.ts');
const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const recent = code => storeMod.logStore.recent(100).filter(e => e.code === code);

test('rngSalt：localStorage 读/写抛错时记 LCQ-SAV-022（op 与退回的随机源），仍返回可用种子', async () => {
  await log.resetLogState();
  const boom = { getItem() { throw new Error('quota'); }, setItem() { throw new Error('quota'); } };
  const got = await quiet(() => salt.nextOutOfSaveSalt(boom));
  assert.ok(Number.isFinite(got) && got >= 0, '读失败退回真随机');
  const read = recent('LCQ-SAV-022');
  assert.equal(read.length, 1);
  assert.equal(read[0].detail.op, 'read');
  assert.match(read[0].detail.fallback, /crypto\.getRandomValues|Math\.random/);
  await log.resetLogState();
  const mem = new Map();
  const writeFail = { getItem: k => mem.get(k) ?? null, setItem() { throw new Error('readonly'); } };
  const next = await quiet(() => salt.nextOutOfSaveSalt(writeFail));
  assert.ok(Number.isFinite(next) && next > 0, '写失败这一次照用');
  const write = recent('LCQ-SAV-022');
  assert.equal(write.length, 1);
  assert.equal(write[0].detail.op, 'write');
  assert.match(write[0].detail.fallback, /未写回/);
  await log.resetLogState();
  const ok = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  salt.nextOutOfSaveSalt(ok);
  assert.equal(recent('LCQ-SAV-022').length, 0, '正常读写不记');
  const src = readFileSync(new URL('../src/modules/sceneModule/host/rngSalt.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /lcq-allow/, '不再有静默吞掉的 catch');
});

test('战前存档失败：记 LCQ-SAV-021（带合同 id），照常开战', async () => {
  const src = readFileSync(new URL('../src/modules/sceneModule/host/controller.ts', import.meta.url), 'utf8');
  assert.match(src, /logError\('LCQ-SAV-021'/);
  assert.doesNotMatch(src, /console\.warn\('\[场面\] 战前存档失败'/);
  const codes = await loadTs('../src/modules/diagnostics/codes.ts');
  assert.equal(codes.ERROR_CODES['LCQ-SAV-021'].module, 'sceneModule');
  assert.equal(codes.ERROR_CODES['LCQ-SAV-022'].module, 'sceneModule');
  await log.resetLogState();
  await quiet(() => log.logError('LCQ-SAV-021', new Error('db closed'), { detail: { contractId: 'combat.f03.x' } }));
  const hit = recent('LCQ-SAV-021');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].detail.contractId, 'combat.f03.x');
  await log.resetLogState();
});

const mkSave = () => ({ 元数据: { 时间: { 年: 1, 月: 3, 日: 5, 小时: 22, 分钟: 0 } }, 角色: { 背包: { 物品: { 'lcq.item.np013': { 名称: '朱箓蛇丹', 数量: 3 } } } }, 社交: { 关系: {} }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: { canon: { characters: [] } } } } });
const shedan = () => ({ actionClass: 'give', variant: 'feed', targetId: R.SHIWEIMO_ID, degree: 'normal', performed: 'yes', evidence: '喂她蛇丹', itemId: 'lcq.item.np013' });

test('诗薇莫离开骰走项目 RNG：种子存在记录里，同种子同回合可复现，第 0 回合不再恒为 0', () => {
  const s = mkSave(); R.recordShiweimoEnding(s, '被制住');
  const r0 = R.shiweimoLeaveRoll(s, 0);
  const seed = R.shiweimoRecord(s).seed;
  assert.ok(Number.isInteger(seed), '首次掷骰生成并保存种子');
  assert.equal(R.shiweimoLeaveRoll(s, 0), r0, '同种子同回合复现');
  assert.ok(r0 >= 0 && r0 < 1);
  assert.notEqual(R.shiweimoLeaveRoll(s, 1), r0, '不同回合骰面不同');
  const zeros = [];
  for (let seedI = 1; seedI <= 50; seedI++) { R.shiweimoRecord(s).seed = seedI; zeros.push(R.shiweimoLeaveRoll(s, 0)); }
  assert.ok(zeros.some(v => v > 0), '第 0 回合不再恒为 0');
  assert.ok(new Set(zeros).size > 40, '不同种子第 0 回合骰面不同');
  assert.equal(R.shiweimoLeaveRoll(mkSave(), 0), 1, '没有记录时不离开');
  const turnSrc = readFileSync(new URL('../src/modules/scenarioMods/freeAction/turn.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(turnSrc, /\* 37 % 100/, '旧的 回合数×37%100 公式已删');
  assert.match(turnSrc, /shiweimoLeaveRoll\(/);
});

test('接线：蛇丹真相后是否离开由种子决定，概率仍读配置 leaveChanceOnShedanTruth', () => {
  const p = GN.story.shiweimo.leaveChanceOnShedanTruth;
  const pick = want => {
    for (let seed = 1; seed < 5000; seed++) {
      const s = mkSave(); R.recordShiweimoEnding(s, '被制住'); R.shiweimoRecord(s).seed = seed;
      const roll = R.shiweimoLeaveRoll(s, 0);
      if (want === 'leave' ? roll < p : roll >= p) return s;
    }
    assert.fail(`找不到让她${want === 'leave' ? '离开' : '留下'}的种子`);
  };
  const leave = pick('leave'); turn.settleFreeActionTurn(leave, [shedan()], undefined);
  assert.equal(R.shiweimoRecord(leave).status, 'left');
  const stay = pick('stay'); turn.settleFreeActionTurn(stay, [shedan()], undefined);
  assert.notEqual(R.shiweimoRecord(stay).status, 'left');
  const again = structuredClone(stay.系统.扩展.lcq_shiweimo);
  assert.equal(again.seed, R.shiweimoRecord(stay).seed, '种子随存档保存');
});

test('炼制提示词：级数—品质上限按原著九级读配置 crafting 段，不再出现旧仙途境界；成功率区间来自配置', async () => {
  const p = await loadTs('../src/utils/prompts/tasks/craftingPrompts.ts');
  const { LEVELS } = await loadTs('../src/utils/realmUtils.ts');
  const grades = JSON.parse(readFileSync(new URL('../mod-kit/item-grades.json', import.meta.url), 'utf8'));
  const name = id => grades.tiers.find(t => t.id === id).name;
  const C = GN.crafting;
  const base = { type: '炼丹', fire: { percent: 50, label: '文火' }, formation: { id: 'none', name: '无阵', desc: '', extraManaPercent: 0, extraSpiritPercent: 0 }, materials: [] };
  const texts = [
    p.buildCraftingNarrativePrompts({ ...base, successRate: 40, success: true, resultQuality: { quality: '凡', grade: 1 } }).systemPrompt,
    p.buildCraftingSimulationPrompts(base).systemPrompt,
    p.buildCraftingFinalizePrompts(base).systemPrompt,
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /练气|筑基期|金丹|元婴|化神|渡劫|境界/, '旧仙途境界已不出现');
    for (const row of C.levelTierCaps) {
      assert.ok(text.includes(`${row.minLevel}级${LEVELS.find(l => l.level === row.minLevel).name}`), `级数 ${row.minLevel}`);
      assert.ok(text.includes(name(row.tier)), row.tier);
    }
    for (const id of C.uncraftableTiers) assert.ok(text.includes(name(id)));
  }
  for (const text of texts.slice(1)) {
    for (const row of C.daoProficiency) {
      assert.ok(text.includes(row.name), row.name);
      if (row.successRate) assert.ok(text.includes(`成功率${row.successRate.min}-${row.successRate.max}%`), row.name);
    }
    assert.ok(text.includes(`${C.successRateRange.min}-${C.successRateRange.max} 的整数`));
  }
  const src = readFileSync(new URL('../src/utils/prompts/tasks/craftingPrompts.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\d+-\d+%/, '提示词源码里不再写死成功率区间');
  assert.doesNotMatch(src, /5-95/, '成功率边界也走配置');
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  assert.ok(registry.REQUIRED_TOP.some(t => t.key === 'crafting' && t.section === 'progress'));
});
