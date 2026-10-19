// 状态目录体检（2026-10-19 整改）：每条状态都要有实打实的机制效果（不只是 note）、至少一条真能触发的解除方式、不再挂 provisional。
// 必要的例外进白名单并写明原因；白名单里的条目一旦不再违规，测试会提醒把它从名单里拿掉。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const CATALOG = readJson('src/modules/sceneModule/contracts/statuses.json');
const MIGRATIONS = readJson('src/modules/sceneModule/contracts/statuses.migrations.json').migrations;
const ITEMS = readJson('mod-kit/entity-catalog/items.json').entries;
const progress = readJson('mod-kit/numbers-progress.json');

/** 白名单：id → { rule: 违反的哪条, why: 原因 }。 */
const WHITELIST = {
  'yin.sha_arm': { rules: ['mechanical', 'removal'], why: '原著剧情（F13 赢后阴煞入臂，第 109 章起的长线伤），只写叙事；解除旗标要等后续剧情事件接上，按“不改原著剧情”保留。' },
  'poison.cold': { rules: ['removal'], why: '寒毒（与已删的阴寒余伤不是一回事）：原著里只由剧情解毒，解除旗标尚无剧情事件写入。' },
  'poison.cold.suppressed': { rules: ['mechanical', 'removal'], why: '寒毒被压制的阶段（原著里压住未根除），只写叙事；解除只走剧情，旗标尚无剧情事件写入。' },
  'mind.confused': { rules: ['provisional'], why: '用户要求：去掉 provisional 之前先报告，等拍板。' },
};

// 剧情旗标“真能被写上”：在状态目录以外的源码 / 剧情数据里出现过（剧本完成条件 flags.<旗标>、或代码直接写）。
const SEARCH_DIRS = ['src/modules/scenarioMods', 'src/modules/sceneModule/contracts', 'src/modules/contentPacks/packs', 'src/utils'];
const SKIP = new Set(['src/modules/sceneModule/contracts/statuses.json', 'src/modules/sceneModule/contracts/statuses.migrations.json', 'src/modules/contentPacks/packs/qingyu/statuses.json']);
let corpus;
function sourceCorpus() {
  if (corpus) return corpus;
  const parts = [];
  const walk = dir => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|json)$/.test(name) && !SKIP.has(relative(root, p))) parts.push(readFileSync(p, 'utf8')); } };
  for (const d of SEARCH_DIRS) walk(join(root, d));
  return (corpus = parts.join('\n'));
}
const flagWritable = flag => sourceCorpus().includes(`flags.${flag}"`) || sourceCorpus().includes(`flags['${flag}'] = true`) || sourceCorpus().includes(`"${flag}": true`);
const itemCarries = ref => ITEMS.some(e => (e.definition?.effectTags || []).includes(ref));

function problems(def) {
  const out = [];
  if (!(def.effects || []).some(e => e.kind !== 'note')) out.push('mechanical');
  const live = (def.remove || []).some(rule =>
    rule.kind === 'rest'
    || (rule.kind === 'time' && Number.isFinite(def.afterScene?.minutes))
    || (rule.kind === 'item' && itemCarries(rule.ref))
    || (rule.kind === 'story' && flagWritable(rule.flag)));
  if (!live) out.push('removal');
  if (def.provisional) out.push('provisional');
  return out;
}

test('状态目录：每条都有机制效果、至少一条能触发的解除方式、没有 provisional（例外见白名单）', () => {
  const bad = [];
  for (const def of CATALOG) {
    const allowed = WHITELIST[def.id]?.rules || [];
    for (const p of problems(def)) if (!allowed.includes(p)) bad.push(`${def.id}：${p}`);
  }
  assert.deepEqual(bad, []);
});

test('白名单不过期：名单里的条目都还在目录里，且确实还违反名单写的那几条；每条都写了原因', () => {
  for (const [id, entry] of Object.entries(WHITELIST)) {
    const def = CATALOG.find(d => d.id === id);
    assert.ok(def, `${id} 已不在目录，从白名单删掉`);
    assert.ok(entry.why.length > 10, id);
    const now = problems(def);
    for (const rule of entry.rules) assert.ok(now.includes(rule), `${id} 已不再违反 ${rule}，从白名单删掉`);
  }
});

test('删除 / 合并的旧 id 都在迁移表里、都已不在目录；改挂的目标都在目录里', () => {
  const ids = new Set(CATALOG.map(d => d.id));
  const removed = ['wound.external.shoulder', 'wound.external.back', 'wound.external.thigh', 'wound.external.right_arm', 'wound.external.waist', 'wound.external.chest',
    'wound.drowning', 'wound.cold', 'gear.blade_damaged', 'gear.blades_dulled', 'restrict.arm', 'restrict.leg', 'fatigue.weary', 'fatigue.mental',
    'disability.one_eye', 'disability.lame_leg', 'sense.sight', 'sense.hearing', 'sense.smell', 'sense.taste', 'sense.touch'];
  for (const id of removed) { assert.ok(MIGRATIONS[id], `${id} 缺迁移`); assert.ok(!ids.has(id), `${id} 还在目录`); }
  for (const [id, rule] of Object.entries(MIGRATIONS)) if (rule.to) assert.ok(ids.has(rule.to), `${id} → ${rule.to} 不在目录`);
  assert.ok(ids.has('poison.cold'), '寒毒 poison.cold 与删掉的阴寒余伤 wound.cold 不是一回事，不能误删');
  assert.equal(CATALOG.filter(d => d.permanent).length, 0, '没有永久伤残');
});

test('合同与物品不再引用已删除的 id', () => {
  const dirs = ['src/modules/sceneModule/contracts', 'src/modules/contentPacks/packs', 'mod-kit/entity-catalog'];
  const hits = [];
  const walk = dir => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (name.endsWith('.json') && !p.endsWith('statuses.migrations.json')) { const text = readFileSync(p, 'utf8'); for (const id of Object.keys(MIGRATIONS)) if (text.includes(`"${id}"`)) hits.push(`${relative(root, p)}：${id}`); } } };
  for (const d of dirs) walk(join(root, d));
  assert.deepEqual(hits, []);
});

test('调息疗伤这类恢复判定不吃“重伤”减值；普通判定照吃', async () => {
  const pre = await loadTs('../src/utils/judgementPreflight.ts');
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const s = createMinimalSaveDataV3();
  s.角色.属性.气血 = { 当前: 1, 上限: 100 };
  const injured = list => list.filter(f => f.label === '重伤');
  assert.equal(injured(pre.stateFactors('cultivate', s)).length, 1, '气血见底时普通判定吃重伤减值');
  assert.equal(injured(pre.stateFactors('cultivate', s, { recovery: true })).length, 0, '恢复判定（调息疗伤）不吃');
  assert.equal(injured(pre.stateFactors('combat', s)).length, 1);
  // 自由行动入口：调息疗伤变体在配置里标 applyRecovery，judgement.ts 据此传 recovery
  assert.equal(progress.freeAction.classes.solo.variants.recover.applyRecovery, true);
  assert.match(readFileSync(join(root, 'src/modules/scenarioMods/freeAction/judgement.ts'), 'utf8'), /stateFactors\(kind, root, \{ recovery: spec\.applyRecovery === true \}\)/);
});

test('赢了战后休整清轻伤（求生类按时撑过去也收成赢）：afterWin 覆盖外伤与灼伤', () => {
  const combat = readJson('mod-kit/numbers-combat.json').combat.woundRules.afterWin;
  assert.equal(combat.clearLight, true);
  for (const id of ['wound.external', 'wound.burn']) assert.ok(combat.statuses.includes(id), id);
});

test('冰蛊：剧情挂上（种蛊旗标），压低真气上限（比例在配置），只由剧情解除；超上限运功做寒气反噬检定', async () => {
  const def = CATALOG.find(d => d.id === 'poison.ice_gu');
  assert.ok(def);
  assert.deepEqual(def.storyApply, { flags: ['event.ice_gu_coercion.done'], stages: ['lcq.stage_05', 'lcq.stage_05b'] });
  assert.ok(def.remove.every(rule => rule.kind === 'story'), '只走剧情解除');
  const cfg = progress.status.bingGu;
  assert.ok(cfg.qiCapRatio > 0 && cfg.qiCapRatio < 1);
  const bingGu = await loadTs('../src/modules/scenarioMods/freeAction/bingGu.ts');
  const injuries = await loadTs('../src/modules/sceneModule/host/injuries.ts');
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const s = createMinimalSaveDataV3();
  const player = 'liuchao.character.cheng_zongyang';
  s.世界.状态.剧本模组 = { modId: 'lcq.stage_04b', flags: {}, canon: { characters: [], locations: [] }, events: [], completedEventIds: [], activeEventIds: [], opening: { playerCharacterId: player } };
  s.角色.属性.灵气 = { 当前: 100, 上限: 100 };
  s.角色.属性.气血 = { 当前: 100, 上限: 100 };
  assert.deepEqual(bingGu.syncStoryStatuses(s), [], '没种蛊不挂');
  s.世界.状态.剧本模组.flags['event.ice_gu_coercion.done'] = true;
  assert.deepEqual(bingGu.syncStoryStatuses(s), ['poison.ice_gu']);
  assert.deepEqual(bingGu.syncStoryStatuses(s), [], '幂等');
  assert.ok(s.角色.效果.some(e => e.状态名称 === '冰蛊'), '主角效果栏可见');
  assert.equal(bingGu.qiCapOf(s), Math.floor(100 * cfg.qiCapRatio));
  assert.equal(bingGu.availableQi(s), Math.floor(100 * cfg.qiCapRatio));
  // 检定过：只压回上限，不伤气血
  let facts = bingGu.enforceQiCap(s, { roll: cfg.backlash.dc }, { player: '程宗扬', target: '' });
  assert.equal(facts.length, 1);
  assert.equal(s.角色.属性.灵气.当前, Math.floor(100 * cfg.qiCapRatio));
  assert.equal(s.角色.属性.气血.当前, 100);
  // 检定失败：扣气血、挂内力紊乱
  s.角色.属性.灵气.当前 = 100;
  facts = bingGu.enforceQiCap(s, { roll: cfg.backlash.dc - 1 }, { player: '程宗扬', target: '' });
  assert.equal(s.角色.属性.气血.当前, 100 - Math.round(100 * cfg.backlash.hpLossRatio));
  assert.ok(injuries.injuryStore(s).actors[player].some(r => r.statusId === cfg.backlash.failStatus));
  assert.deepEqual(bingGu.enforceQiCap(s, { roll: 1 }, { player: '程宗扬', target: '' }), [], '没超上限不检定');
  // 剧情解蛊
  s.世界.状态.剧本模组.flags['event.shanghou_cures_ice_gu.done'] = true;
  injuries.pruneSceneInjuries(s);
  assert.equal(bingGu.qiCapOf(s), undefined);
  assert.ok(!s.角色.效果.some(e => e.状态名称 === '冰蛊'));
  assert.deepEqual(bingGu.syncStoryStatuses(s), [], '解了不再挂回');
  // 换到 05b（旗标重置）：按剧本段补挂；05b 里解蛊后清掉
  const t = createMinimalSaveDataV3();
  t.世界.状态.剧本模组 = { modId: 'lcq.stage_05b', flags: { 'event.shanghou_cures_ice_gu.done': false }, canon: { characters: [], locations: [] }, events: [], completedEventIds: [], activeEventIds: [], opening: { playerCharacterId: player } };
  t.角色.属性.灵气 = { 当前: 50, 上限: 50 };
  assert.deepEqual(bingGu.syncStoryStatuses(t), ['poison.ice_gu']);
  t.世界.状态.剧本模组.flags['event.s05b_shanghou_reads_letter.ice_gu_cured'] = true;
  injuries.pruneSceneInjuries(t);
  assert.equal(bingGu.qiCapOf(t), undefined);
});

test('外伤部位：伤在新部位并进同一条外伤（部位合并），不算旧伤加重；同一部位再伤才沿升级链加重', async () => {
  const core = await loadTs('../src/modules/sceneModule/index.ts');
  const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const c = registry.sceneContractById('combat.f10.ghost_king_clash');
  const state = core.beginScene(c, { seed: 1 }).state;
  const meta = { cause: 'combat', sourceId: 't' };
  core.applyStatus(state, c, undefined, 'pc', { status: 'wound.external', params: { bodyPart: '大腿' } }, meta);
  core.applyStatus(state, c, undefined, 'pc', { status: 'wound.external', params: { bodyPart: '右臂' } }, meta);
  assert.deepEqual(state.statuses.pc.map(a => [a.id, a.params?.bodyPart]), [['wound.external', '大腿、右臂']]);
  core.applyStatus(state, c, undefined, 'pc', { status: 'wound.external', params: { bodyPart: '右臂' } }, meta);
  assert.deepEqual(state.statuses.pc.map(a => [a.id, a.params?.bodyPart]), [['wound.external.heavy', '大腿、右臂']]);
});
