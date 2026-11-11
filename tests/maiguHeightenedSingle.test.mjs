// 一次服用只产生一条「感官亢奋」（任务单 maigu-heightened，改法 ②）。复现用：基线 465fb93b 上验收 1/3 应为红。
// np006 的 onUse 只声明不写（applyItemOnUse 跳过），真正挂状态的是 afterItemFed。
// 自服走真实读档链 + 真实 settleSelfConsumable；喂药走自由行动 give/feed_pill。时长一律从 status.maigu.heightened.minutes 读。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
import { NING_YU, itemEntry, load, makeSave, mods, runJudged, ticket } from './freeActionFixture.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const G = await import('../scripts/generate-c01-timers-checkpoint.mjs');
const MG = await loadTs('../src/modules/scenarioMods/freeAction/maigu.ts');
const SC = await loadTs('../src/modules/scenarioMods/freeAction/selfConsumable.ts');
const EC = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const IG = await loadTs('../src/modules/scenarioMods/itemGrades.ts');
const INJ = await loadTs('../src/modules/sceneModule/host/injuries.ts');
const ST = await loadTs('../src/modules/sceneModule/statuses.ts');
const PID = await loadTs('../src/modules/scenarioMods/playerIdentity.ts');
const SEM = await loadTs('../src/utils/statusEffectManager.ts');
const TIME = await loadTs('../src/utils/time.ts');
const PACK = await loadTs('../src/modules/contentPacks/index.ts');

const bundle = JSON.parse(readFileSync(new URL('./fixtures/checkpoints/c01-before-wuyuan-220.json', import.meta.url), 'utf8'));
const items = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/items.json', import.meta.url), 'utf8'));
const defOf = id => items.entries.find(e => e.id === id).definition;

async function selfDosed() {
  const save = await quiet(() => G.loadLikeGame(bundle, 'c01-before-wuyuan-220'));
  const cfg = MG.maiguConfig(), def = EC.contentDefinition('item', cfg.itemId);
  save.角色.背包.物品[cfg.itemId] = { 物品ID: cfg.itemId, 名称: def.name, 类型: '丹药', 品质: IG.itemSaveQuality(def.grade, () => ({ quality: '凡', grade: 0 })), 数量: 5, 描述: def.description || '', 已装备: false };
  const pid = PID.scenarioPlayerId(save);
  const before = { social: MG.maiguFactors(save, 'social'), mind: cfg.heightened.mindKinds.map(kind => MG.maiguFactors(save, kind)) };
  const used = SC.settleSelfConsumable(save, `我取出${def.name}服下`);
  assert.equal(used?.itemId, cfg.itemId, '自服麻古已结算');
  return { save, cfg, pid, used, before };
}
const heightenedRows = (save, cfg, pid) => (INJ.injuryStore(save).actors[pid] || []).filter(r => r.statusId === cfg.heightenedStatus);
const heightenedEffects = (save, cfg) => (save.角色.效果 || []).filter(e => e.状态名称 === ST.catalogStatus(cfg.heightenedStatus).label);
const setClock = (save, total) => Object.assign(save.元数据.时间, TIME.gameTimeFromMinutes(total));

test('验收 1：自服麻古后 角色.效果「感官亢奋」恰好 1 条、statusRecords 恰好 1 行，时长＝配置，来源 free:maigu.dose；成瘾挂上', async () => {
  const { save, cfg, pid } = await selfDosed();
  const now = INJ.sceneTime(save), rows = heightenedRows(save, cfg, pid), effects = heightenedEffects(save, cfg);
  // 停手条件：一条都没有＝afterItemFed 未挂上。
  assert.ok(rows.length + effects.length > 0, '停手条件：自服后身上没有感官亢奋');
  assert.equal(rows.length, 1, 'statusRecords 一行');
  assert.equal(effects.length, 1, `角色.效果 一条：${JSON.stringify(effects.map(e => e.来源))}`);
  assert.equal(rows[0].sourceScene, 'free:maigu.dose');
  assert.equal(effects[0].来源, rows[0].sourceScene);
  assert.equal(rows[0].expiresAt - now, cfg.heightened.minutes);
  assert.equal(effects[0].持续时间分钟, cfg.heightened.minutes);
  assert.ok((INJ.injuryStore(save).actors[pid] || []).some(r => r.statusId === cfg.addictionStatus), '成瘾');
});

test('强制项 ①：自服事实块与回执仍含「药效生效：感官亢奋」，不是 noEffect', async () => {
  const { cfg, used } = await selfDosed();
  const label = ST.catalogStatus(cfg.heightenedStatus).label;
  const onUseFact = PACK.packText('free.fact.selfUse.onUse').split('{status}').join(label);
  assert.match(onUseFact, /药效生效：感官亢奋/, '文案前提');
  assert.ok(used.facts.includes(onUseFact), JSON.stringify(used.facts));
  assert.ok(!used.facts.includes(PACK.packText('free.fact.selfUse.noEffect')));
  assert.match(SC.renderSelfConsumableBlock(used), /药效生效：感官亢奋/);
  assert.match(SC.renderSelfConsumableReceipt(used), /药效生效：感官亢奋/);
});

test('验收 2：maiguFactors 交涉「感官亢奋」一条 +socialBonus、心性一条 mindPenalty，服用前后对照不翻倍', async () => {
  const { save, cfg, before } = await selfDosed();
  const isH = f => f.label.startsWith('感官亢奋');
  assert.deepEqual(before.social.filter(isH), [], '服用前无');
  for (const list of before.mind) assert.deepEqual(list.filter(isH), [], '服用前无');
  const social = MG.maiguFactors(save, 'social').filter(isH);
  assert.equal(social.length, 1);
  assert.equal(social[0].value, cfg.heightened.socialBonus);
  for (const kind of cfg.heightened.mindKinds) {
    const mind = MG.maiguFactors(save, kind).filter(isH);
    assert.equal(mind.length, 1, kind);
    assert.equal(mind[0].value, cfg.heightened.mindPenalty, kind);
  }
});

test('验收 3：拨钟 minutes-1 两条通道都在；拨到 minutes 经真实到期清理都摘除；拨到 1440 不留第二条', async () => {
  const { save, cfg, pid } = await selfDosed();
  const t0 = INJ.sceneTime(save), cleanup = () => quiet(() => { INJ.pruneSceneInjuries(save); SEM.updateStatusEffects(save); });
  setClock(save, t0 + cfg.heightened.minutes - 1); await cleanup();
  assert.equal(heightenedRows(save, cfg, pid).length, 1, 'minutes-1：伤势行仍在');
  assert.equal(heightenedEffects(save, cfg).length, 1, 'minutes-1：角色.效果仍在');
  setClock(save, t0 + cfg.heightened.minutes); await cleanup();
  assert.equal(heightenedRows(save, cfg, pid).length, 0, 'minutes：伤势行摘除');
  assert.equal(heightenedEffects(save, cfg).length, 0, 'minutes：角色.效果摘除');
  setClock(save, t0 + 1440); await cleanup();
  assert.equal(heightenedRows(save, cfg, pid).length, 0, '1440：无残留');
  assert.equal(heightenedEffects(save, cfg).length, 0, '1440：无第二条残留');
  assert.ok((INJ.injuryStore(save).actors[pid] || []).some(r => r.statusId === cfg.addictionStatus), '成瘾不随亢奋到期');
});

test('强制项 ②：喂麻古给 NPC——事实含「药性渐渐上来」，NPC 只一行感官亢奋（配置时长、free:maigu.dose），成瘾挂上', () => {
  const CFG = mods.numbers.GAME_NUMBERS.status.maigu;
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 80 }, items: { [CFG.itemId]: itemEntry(CFG.itemId) } });
  const run = runJudged(save, ticket('give', 'feed_pill', NING_YU, { itemId: CFG.itemId }), 'success');
  const result = run.result ?? run.prepared.result; // feed_pill 不经判定时 prepare 直接结算
  assert.equal(result?.resultKey, 'sedative_done', JSON.stringify(result));
  assert.ok(result.facts.some(f => f.includes('药性渐渐上来')), JSON.stringify(result.facts));
  const rows = mods.statusRead.actorStatusRecords(save, NING_YU), now = mods.injuries.sceneTime(save);
  const h = rows.filter(r => r.statusId === CFG.heightenedStatus);
  assert.equal(h.length, 1, JSON.stringify(rows));
  assert.equal(h[0].sourceScene, 'free:maigu.dose');
  assert.equal(h[0].expiresAt - now, CFG.heightened.minutes);
  assert.ok(rows.some(r => r.statusId === CFG.addictionStatus), '成瘾');
});

test('验收 4/5：np006 声明不变（无 effectTags、保留 onUse）；其它三件带 onUse 的药仍写入，且不走 afterItemFed 的挂状态', async () => {
  const IU = await load('../src/modules/scenarioMods/freeAction/itemUse.ts');
  const MGF = await load('../src/modules/scenarioMods/freeAction/maigu.ts');
  const CFG = MGF.maiguConfig();
  assert.equal(defOf(CFG.itemId).effectTags, undefined);
  assert.deepEqual(defOf(CFG.itemId).onUse, [{ statusId: CFG.heightenedStatus }]);
  assert.deepEqual(IU.itemEffectOf(CFG.itemId).onUse, [{ statusId: CFG.heightenedStatus }], '声明仍完整返回');
  // 麻古：applyItemOnUse 本身不写感官亢奋（只声明不写）。
  const s0 = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  assert.deepEqual(IU.applyItemOnUse(s0, NING_YU, CFG.itemId, 'probe'), []);
  assert.ok(!mods.statusRead.actorStatusRecords(s0, NING_YU).some(r => r.statusId === CFG.heightenedStatus));
  for (const id of ['lyl.item.np053', 'lyg.item.np071', 'lyg.item.np092']) {
    const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
    const declared = defOf(id).onUse.map(u => u.statusId);
    const out = IU.applyItemOnUse(save, NING_YU, id, 'probe');
    assert.equal(out.length, declared.length, id);
    assert.ok(out.every(r => r.ok), `${id}: ${JSON.stringify(out.map(r => r.reason))}`);
    const rows = mods.statusRead.actorStatusRecords(save, NING_YU);
    for (const statusId of declared) assert.ok(rows.some(r => r.statusId === statusId && r.sourceScene === 'free:probe'), `${id} → ${statusId}`);
    MGF.afterItemFed(save, NING_YU, id);
    const after = mods.statusRead.actorStatusRecords(save, NING_YU);
    assert.ok(!after.some(r => r.statusId === CFG.heightenedStatus || r.statusId === CFG.addictionStatus), `${id}: 不挂麻古状态`);
    assert.equal(save.世界.状态.剧本模组.maiguClock?.[NING_YU], undefined, `${id}: 不动渴求计时`);
  }
});

// 8092 90def980 真机 1A：背包「使用」按钮只扣份数、不落药效。按钮路径在回合发送时走 settleButtonUses 补结算（不再扣份数）。
test('背包「使用」按钮：settleButtonUses 挂恰好 1 条感官亢奋 + 成瘾，不再扣份数，同一队列项不重复结算', async () => {
  const save = await quiet(() => G.loadLikeGame(bundle, 'c01-before-wuyuan-220'));
  const cfg = MG.maiguConfig(), def = EC.contentDefinition('item', cfg.itemId), pid = PID.scenarioPlayerId(save);
  save.角色.背包.物品[cfg.itemId] = { 物品ID: cfg.itemId, 名称: def.name, 类型: '丹药', 数量: 4, 描述: '', 已装备: false };
  const uses = [{ id: 'action_a', itemId: cfg.itemId, quantity: 1 }];
  const used = SC.settleButtonUses(save, uses);
  assert.equal(used.length, 1);
  assert.equal(used[0].count, 1);
  assert.match(SC.renderSelfConsumableReceipt(used[0]), /已服用：.*麻古.*药效生效：感官亢奋/);
  assert.equal(heightenedRows(save, cfg, pid).length, 1, 'statusRecords 一行');
  assert.equal(heightenedEffects(save, cfg).length, 1, '角色.效果 一条');
  assert.equal(heightenedEffects(save, cfg)[0].持续时间分钟, cfg.heightened.minutes);
  assert.ok((INJ.injuryStore(save).actors[pid] || []).some(r => r.statusId === cfg.addictionStatus), '成瘾');
  assert.equal(save.角色.背包.物品[cfg.itemId].数量, 4, '份数由按钮点下时扣，这里不再扣');
  assert.deepEqual(SC.settleButtonUses(save, uses), [], '同一队列项重发不重复结算');
  // 一次按 2 份：仍只有一条感官亢奋；事实行不重复。
  const twice = SC.settleButtonUses(save, [{ id: 'action_b', itemId: cfg.itemId, quantity: 2 }]);
  assert.equal(twice[0].count, 2);
  assert.equal(new Set(twice[0].facts).size, twice[0].facts.length);
  assert.equal(heightenedRows(save, cfg, pid).length, 1);
  assert.equal(heightenedEffects(save, cfg).length, 1);
});

test('背包「使用」按钮：不在物品总表里的消耗品、非消耗品不结算', async () => {
  const save = await quiet(() => G.loadLikeGame(bundle, 'c01-before-wuyuan-220'));
  const nonConsumable = items.entries.find(e => e.definition?.type && e.definition.type !== 'consumable');
  assert.ok(nonConsumable, '夹具前提：总表里有非消耗品');
  const before = JSON.stringify(save);
  assert.deepEqual(SC.settleButtonUses(save, [{ id: 'x', itemId: 'no.such.item', quantity: 1 }, { id: 'y', itemId: nonConsumable.id, quantity: 1 }]), []);
  assert.equal(JSON.stringify(save), before);
});
