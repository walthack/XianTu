// B 步：状态效果配置（分项效果 + 外貌标签 + 下限计数）、角色身上按 id 写状态、永久伤残字段、
// 毒伤与 mustSurvive、物品 effectTags/onUse → 状态 id。
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k), clear: () => values.clear() };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const profile = await loadTs('../src/modules/sceneModule/statusProfile.ts');
const statuses = await loadTs('../src/modules/sceneModule/statuses.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const injuries = await loadTs('../src/modules/sceneModule/host/injuries.ts');
const contracts = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const read = await loadTs('../src/modules/scenarioMods/actorStatusRead.ts');
const apply = await loadTs('../src/modules/scenarioMods/freeAction/actorStatus.ts');
const itemUse = await loadTs('../src/modules/scenarioMods/freeAction/itemUse.ts');
const protect = await loadTs('../src/modules/scenarioMods/freeAction/protect.ts');
const cardLayer = await loadTs('../src/modules/scenarioMods/npcCardLayer.ts');
const inst = await loadTs('../src/modules/scenarioMods/actorInstances.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const audit = await import('../scripts/validate-entity-catalog.mjs');

const { GAME_NUMBERS } = numbers;
const NUM = GAME_NUMBERS.status;
const rootUrl = new URL('../', import.meta.url);
const readJson = p => JSON.parse(readFileSync(new URL(p, rootUrl), 'utf8'));
const items = readJson('mod-kit/entity-catalog/items.json');

const WANG_ZHE = 'lcq.character.wang_zhe'; // 总表标了 mustSurvive
const XIE_YI = 'liuchao.character.xie_yi'; // 总表标了 mustSurvive
const DUAN_QIANG = 'lcq.character.duan_qiang'; // 没标
const MERFOLK = 'lcq.enemy.merfolk';
const rt = s => s.世界.状态.剧本模组;
function save(characters = []) {
  const s = createMinimalSaveDataV3();
  s.世界.状态.剧本模组 = { modId: 'lcq.stage_04', flags: {}, canon: { characters, locations: [] }, events: [], completedEventIds: [], activeEventIds: [] };
  return s;
}
const person = (id, name) => ({ id, name, profile: {} });
const catalog = id => statuses.catalogStatus(id);
const rows = (s, id) => rt(s).sceneLedger.statusRecords.actors[id] || [];

// ───────── 状态效果配置 ─────────
test('game-numbers.status：名单、范围、下限计数、时长与物品标签都在配置里', () => {
  assert.deepEqual(NUM.senses, ['sight', 'hearing', 'smell', 'taste', 'touch', 'mind'], '六识（眼耳鼻舌身意）');
  assert.deepEqual(NUM.consciousnessLevels, ['clear', 'dazed', 'confused', 'unconscious'], '神志档（由轻到重）');
  assert.ok(NUM.actionKinds.includes('run') && NUM.actionKinds.includes('grip'));
  assert.ok(NUM.lifeFloor.ratio > 0 && NUM.lifeFloor.ratio < 1 && NUM.lifeFloor.min >= 1);
  assert.ok(NUM.freeActionMaxMinutes > 0 && NUM.permanent.maxPerActor >= 1 && NUM.appearance.maxTags >= 1);
  assert.deepEqual(NUM.itemTags.toxic, ['poison']);
});

test('状态目录：计划里的既有 id 都在，新增的分项状态 id 全表齐全', () => {
  for (const id of ['poisoned', 'wound.severe', 'wound.external', 'wound.soul', 'weak.body', 'wound.exhaustion', 'unconscious', 'dying']) assert.ok(catalog(id), id);
  // 2026-10-19 整改：五感五条并成六识受损 sense.impaired（参数 senses 指明哪几识）；疲惫、行动细分、永久伤残全部删除。
  for (const id of ['mind.confused', 'sense.impaired']) assert.ok(catalog(id), id);
  assert.equal(catalog('mind.confused').provisional, true, '神志不清的 provisional 待用户确认后再去');
  assert.equal(catalog('sense.impaired').provisional, undefined);
  for (const id of ['sense.sight', 'sense.hearing', 'sense.smell', 'sense.taste', 'sense.touch', 'fatigue.weary', 'fatigue.mental', 'restrict.arm', 'restrict.leg', 'disability.one_eye', 'disability.lame_leg']) assert.equal(catalog(id), undefined, `${id} 已删除或合并`);
  assert.deepEqual(statuses.STATUS_CATALOG.filter(d => d.permanent).map(d => d.id), [], '游戏里没有永久伤残');
  assert.deepEqual(statuses.STATUS_CATALOG.filter(d => d.lifeFloor).map(d => d.id), ['poisoned'], '只有中毒带下限计数');
});

test('整个状态目录通过体检（名单、范围、标签长度、下限计数、永久伤残写法）', () => {
  const errors = statuses.STATUS_CATALOG.flatMap(d => profile.validateStatusDef(d));
  assert.deepEqual(errors, []);
});

test('体检能抓出错误：未知感官/动作/神志档、越界数值、超长标签、坏的下限计数、带时限的永久伤残', () => {
  const base = { id: 't', label: 't', tier: 'general', cause: 'story', kind: 'debuff', effects: [], remove: [{ kind: 'rest' }] };
  const bad = effects => profile.validateStatusDef({ ...base, effects });
  assert.match(bad([{ kind: 'sense', sense: 'sixth', value: -1 }])[0], /未知感官/);
  assert.match(bad([{ kind: 'sense', sense: 'sight', value: -9 }])[0], /五感值/);
  assert.match(bad([{ kind: 'sense', sense: 'sight', value: 0.5 }])[0], /五感值/);
  assert.match(bad([{ kind: 'psyche', value: 99 }])[0], /精神值/);
  assert.match(bad([{ kind: 'consciousness', level: 'dreaming' }])[0], /未知神志档/);
  assert.match(bad([{ kind: 'restrict', actions: ['fly'] }])[0], /未知行动/);
  assert.match(bad([{ kind: 'restrict', actions: [] }])[0], /不能为空/);
  assert.match(bad([{ kind: 'appearance', tag: '字'.repeat(NUM.appearance.tagChars + 1) }])[0], /外貌标签/);
  assert.match(bad([{ kind: 'appearance', tag: '  ' }])[0], /外貌标签/);
  assert.match(profile.validateStatusDef({ ...base, lifeFloor: { max: 3, perDose: 5 } })[0], /lifeFloor/);
  assert.match(profile.validateStatusDef({ ...base, permanent: true, afterScene: { minutes: 60 }, remove: [{ kind: 'rest' }] })[0], /永久伤残/);
  assert.equal(profile.validateStatusDef({ ...base, permanent: true, afterScene: { minutes: null }, remove: [{ kind: 'story', flag: 'f' }] }).length, 0);
});

test('分项汇总：精神相加并夹范围，五感按感官相加并夹范围，神志取最重，downed 算最重，行动并集，外貌去重', () => {
  const p = profile.summarizeEffects([
    { kind: 'psyche', value: -2 }, { kind: 'psyche', value: -2 },
    { kind: 'sense', sense: 'sight', value: -2 }, { kind: 'sense', sense: 'sight', value: -2 }, { kind: 'sense', sense: 'smell', value: -1 },
    { kind: 'consciousness', level: 'dazed' }, { kind: 'consciousness', level: 'confused' },
    { kind: 'restrict', actions: ['run', 'grip'] }, { kind: 'restrict', actions: ['run'] },
    { kind: 'appearance', tag: '面色青灰' }, { kind: 'appearance', tag: '面色青灰' }, { kind: 'appearance', tag: '跛行' },
    { kind: 'rollModifier', scope: 'action', value: -1 }, { kind: 'note', field: 'text', text: '不参与' },
  ]);
  assert.equal(p.psyche, NUM.psycheRange.min);
  assert.deepEqual(p.senses, { sight: NUM.senseRange.min, smell: -1 });
  assert.equal(p.consciousness, 'confused');
  assert.deepEqual(p.restricted, ['run', 'grip']);
  assert.deepEqual(p.appearance, ['面色青灰', '跛行']);
  assert.equal(profile.summarizeEffects([{ kind: 'downed' }]).consciousness, 'unconscious');
  assert.deepEqual(profile.summarizeEffects([]), profile.emptyProfile());
  // 名单之外的内容被忽略，而不是写进画像
  const ignored = profile.summarizeEffects([{ kind: 'sense', sense: 'sixth', value: -1 }, { kind: 'restrict', actions: ['fly'] }, { kind: 'consciousness', level: 'dreaming' }]);
  assert.deepEqual(ignored, profile.emptyProfile());
});

test('分项状态确实表达了气血之外的效果：神志不清、五感、疲惫、行动细分各自落在对应维度', () => {
  const of = id => profile.summarizeEffects(catalog(id).effects);
  assert.equal(of('mind.confused').consciousness, 'confused');
  assert.ok(of('mind.confused').psyche < 0);
  const impaired = senses => profile.summarizeEffects(statuses.resolveEffects(catalog('sense.impaired').effects, { senses }));
  for (const sense of NUM.senses) assert.ok(impaired([sense]).senses[sense] < 0, sense);
  assert.deepEqual(Object.keys(impaired(['sight', 'hearing']).senses).sort(), ['hearing', 'sight'], '参数指明哪几识，只压这几识');
  assert.deepEqual(impaired(undefined).senses, {}, '没给参数时不凭空压任何一识');
  assert.ok(of('poisoned').appearance.includes('面色青灰') && of('poisoned').psyche < 0, '中毒带精神和外貌');
  assert.equal(of('unconscious').consciousness, 'unconscious', '昏迷（未改动）按 downed 归最重档');
});

test('既有状态只追加新维度：去掉新维度后与提交里的版本逐字相同（原有数值、note、来源文字含合规标记都没动）', () => {
  const NEW_KINDS = ['psyche', 'sense', 'consciousness', 'restrict', 'appearance'];
  // 2026-10-19 整改按用户方案重写的条目（合并、补实效、去 provisional）与迁移表里删掉 / 并走的旧 id 不比。
  const REWORKED = new Set(['wound.external', 'wound.burn', 'wound.soul_aftershock', 'wound.soul', ...Object.keys(injuries.STATUS_MIGRATIONS)]);
  const strip = d => { const { lifeFloor, permanent, ...rest } = d; return { ...rest, effects: d.effects.filter(e => !NEW_KINDS.includes(e.kind)), ...(d.id === 'dying' ? { remove: undefined } : {}) }; }; // dying.remove 按 2026-10-19 药品分级改，见下
  let committed;
  try { committed = JSON.parse(execFileSync('git', ['show', 'HEAD:src/modules/sceneModule/contracts/statuses.json'], { cwd: fileURLToPath(rootUrl), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { committed = undefined; }
  if (!committed) return; // 不在 git 仓库里（例如打包后）
  const now = new Map(readJson('src/modules/sceneModule/contracts/statuses.json').map(d => [d.id, d]));
  for (const old of committed) if (!REWORKED.has(old.id)) assert.deepEqual(strip(now.get(old.id)), strip(old), old.id);
  for (const id of ['unconscious', 'paralyzed', 'acupoint.sealed', 'dying', 'drunk']) {
    // 2026-10-19 用户指示（药品分级 B2）：heal 不再解濒死——dying 只改 remove（stabilize 降级 / revive 解除），其余字段（含合规标记）整条没动。
    const omitRemove = d => id === 'dying' ? { ...d, remove: undefined } : d;
    assert.deepEqual(omitRemove(now.get(id)), omitRemove(committed.find(d => d.id === id)), `${id}（含合规标记）整条没动`);
  }
  assert.deepEqual(now.get('dying').remove.map(r => r.ref), ['stabilize', 'revive']);
});

// ───────── 角色身上按 id 写状态 ─────────
test('按角色 id 写状态：记录带效果快照、来源、有限时长，同一状态再写是刷新不是叠加，视图文字同步', () => {
  const s = save([person(DUAN_QIANG, '段强')]);
  const r = apply.applyActorStatus(s, DUAN_QIANG, 'mind.confused', { sourceId: 't1' });
  assert.equal(r.ok, true);
  const [row] = rows(s, DUAN_QIANG);
  assert.equal(row.statusId, 'mind.confused');
  assert.equal(row.sourceScene, 'free:t1');
  assert.equal(row.expiresAt - row.appliedAt, catalog('mind.confused').afterScene.minutes);
  assert.deepEqual(row.effects, catalog('mind.confused').effects);
  assert.match(rt(s).sceneLedger.injuries[DUAN_QIANG], /神志不清/);
  apply.applyActorStatus(s, DUAN_QIANG, 'mind.confused', { sourceId: 't2' });
  assert.equal(rows(s, DUAN_QIANG).length, 1);
  assert.equal(rows(s, DUAN_QIANG)[0].sourceScene, 'free:t2');
  assert.equal(read.actorStatusProfile(s, DUAN_QIANG).consciousness, 'confused');
});

test('目录里没有时限的状态，自由行动路径写成有限时长（status.freeActionMaxMinutes）；显式 minutes 优先；显式 null 才不过期', () => {
  const s = save();
  assert.equal(catalog('wound.severe').afterScene.minutes, null);
  apply.applyActorStatus(s, WANG_ZHE, 'wound.severe');
  const row = rows(s, WANG_ZHE)[0];
  assert.equal(row.expiresAt - row.appliedAt, NUM.freeActionMaxMinutes);
  apply.applyActorStatus(s, DUAN_QIANG, 'wound.severe', { minutes: 7 });
  assert.equal(rows(s, DUAN_QIANG)[0].expiresAt - rows(s, DUAN_QIANG)[0].appliedAt, 7);
  apply.applyActorStatus(s, XIE_YI, 'wound.severe', { minutes: null });
  assert.equal(rows(s, XIE_YI)[0].expiresAt, null);
});

test('到期后状态消失（视图与画像同步），没到期时存在', () => {
  const s = save();
  apply.applyActorStatus(s, DUAN_QIANG, 'sense.impaired', { params: { senses: ['sight'] } });
  assert.ok(read.actorStatusProfile(s, DUAN_QIANG).senses.sight < 0);
  s.元数据.时间.日 += 1;
  assert.deepEqual(read.actorStatusRecords(s, DUAN_QIANG), [], '读取不改存档但已按到期过滤');
  injuries.renderInjuryViews(s);
  assert.equal(rt(s).sceneLedger.injuries[DUAN_QIANG], undefined);
});

test('拒绝：状态 id 不存在、非法角色 id、敌人种类 id（伤势只写个体）', () => {
  const s = save();
  assert.deepEqual(apply.applyActorStatus(s, DUAN_QIANG, 'no.such.status'), { ok: false, reason: 'unknown_status' });
  assert.deepEqual(apply.applyActorStatus(s, '王哲', 'mind.confused'), { ok: false, reason: 'bad_actor' });
  assert.deepEqual(apply.applyActorStatus(s, MERFOLK, 'wound.external'), { ok: false, reason: 'enemy_kind' });
  assert.deepEqual(apply.applyActorStatus(s, 'lcq.enemy.guiwangdong_warrior', 'wound.external'), { ok: false, reason: 'enemy_kind' }, '种类的旧 id 别名也拒绝');
  assert.equal(rt(s).sceneLedger, undefined, '被拒绝的调用不留任何存档痕迹');
});

test('敌人个体（实例 id）：状态写在实例名下，带种类 id，互不影响；种类名下永远没有记录', () => {
  const s = save();
  const a = inst.instanceId(MERFOLK, 'combat.free.demo', 1), b = inst.instanceId(MERFOLK, 'combat.free.demo', 2);
  assert.equal(apply.applyActorStatus(s, a, 'wound.external', { params: { bodyPart: '右臂' } }).ok, true);
  const store = rt(s).sceneLedger.statusRecords;
  assert.deepEqual(Object.keys(store.groups), [a]);
  assert.equal(store.groups[a][0].instanceId, a);
  assert.equal(store.groups[a][0].enemyId, MERFOLK);
  assert.deepEqual(read.actorStatusRecords(s, b), [], '同种类的另一个个体不受影响');
  assert.deepEqual(read.actorStatusRecords(s, MERFOLK), [], '种类名下没有记录');
  assert.ok(![...Object.keys(store.actors), ...Object.keys(store.groups)].includes(MERFOLK));
  assert.match(rt(s).sceneLedger.groupInjuries[a].text, /外伤/);
  assert.match(rt(s).sceneLedger.groupInjuries[a].text, /右臂/, '部位参数进视图');
  assert.equal(rt(s).sceneLedger.groupInjuries[a].label.length > 0, true);
});

// ───────── 永久伤残（2026-10-19 用户定：游戏里没有永久伤残）─────────
test('旧存档里的永久伤残（disabilities 字段）与已删除的状态 id 按迁移表移除；部位伤改挂外伤并带部位；幂等', () => {
  const s = save();
  const row = (statusId, label, sourceScene = 'combat.f10.ghost_king_clash') => ({ statusId, label, sourceScene, cause: 'combat', appliedAt: 0, expiresAt: null, effects: [], remove: [] });
  rt(s).sceneLedger = { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [], statusRecords: { version: 1, groups: {}, groupLabels: {},
    actors: { [DUAN_QIANG]: [row('wound.external.thigh', '腿伤'), row('wound.external.back', '背伤'), row('gear.blades_dulled', '双刀卷刃'), row('fatigue.mental', '心神疲惫', 'free:x')] },
    disabilities: { [DUAN_QIANG]: [row('disability.one_eye', '一目失明', 'free:y')] } } };
  injuries.pruneSceneInjuries(s);
  const store = rt(s).sceneLedger.statusRecords;
  assert.deepEqual(store.actors[DUAN_QIANG].map(r => r.statusId).sort(), ['wound.external', 'wound.soul']);
  assert.equal(store.actors[DUAN_QIANG].find(r => r.statusId === 'wound.external').params.bodyPart, '大腿、背', '同一来源两处部位伤并成一条外伤');
  assert.deepEqual(store.disabilities[DUAN_QIANG], []);
  const before = JSON.stringify(store);
  injuries.pruneSceneInjuries(s);
  assert.equal(JSON.stringify(rt(s).sceneLedger.statusRecords), before, '再迁移一次不变');
  for (const id of Object.keys(injuries.STATUS_MIGRATIONS)) assert.equal(catalog(id), undefined, `${id} 已不在目录`);
});

test('旧存档兼容：没有 statusRecords / 没有 disabilities / 没有 sceneLedger 时读取一律为空，写入与视图渲染不报错', () => {
  const none = save(); // 没有 sceneLedger
  assert.deepEqual(read.actorStatusRecords(none, DUAN_QIANG), []);
  assert.deepEqual(read.disabilitiesOf(none, DUAN_QIANG), []);
  assert.deepEqual(read.appearanceTagsOf(none, DUAN_QIANG), []);
  assert.deepEqual(read.actorStatusProfile(none, DUAN_QIANG), profile.emptyProfile());
  assert.equal(rt(none).sceneLedger, undefined, '只读不创建字段');

  const old = save(); // 旧版结构：statusRecords 只有 version/actors/groups/groupLabels
  rt(old).sceneLedger = { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [], statusRecords: { version: 1, actors: { [DUAN_QIANG]: [] }, groups: {}, groupLabels: {} } };
  assert.equal('disabilities' in rt(old).sceneLedger.statusRecords, false);
  assert.deepEqual(read.disabilitiesOf(old, DUAN_QIANG), []);
  injuries.renderInjuryViews(old);
  injuries.pruneSceneInjuries(old);
  assert.equal('disabilities' in rt(old).sceneLedger.statusRecords, false, '读取、修剪、渲染都不凭空加字段');
});

test('旧存档里已有的普通伤势记录（没有 counter）照常被读到，也能被中毒状态按默认上限接管', () => {
  const s = save();
  rt(s).sceneLedger = { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [], statusRecords: { version: 1, groups: {}, groupLabels: {}, actors: { [DUAN_QIANG]: [
    { statusId: 'poisoned', label: '中毒', sourceScene: 'old.scene', cause: 'item', appliedAt: 0, expiresAt: null, effects: catalog('poisoned').effects, remove: catalog('poisoned').remove },
  ] } } };
  assert.equal(read.actorStatusRecords(s, DUAN_QIANG).length, 1);
  assert.deepEqual(read.appearanceTagsOf(s, DUAN_QIANG), ['面色青灰']);
  const r = apply.applyActorStatus(s, DUAN_QIANG, 'poisoned');
  assert.equal(r.counter.before, catalog('poisoned').lifeFloor.max, '旧记录没有计数 = 从满值起算');
  assert.equal(rows(s, DUAN_QIANG).filter(x => x.statusId === 'poisoned').length, 1);
});

// ───────── 毒伤：下限计数 + mustSurvive ─────────
const POISON = catalog('poisoned').lifeFloor;

test('总表里的必须活着：王哲、谢艺 = true，段强 = false；下限由配置算出，其余角色为 0', () => {
  assert.equal(protect.isMustSurvive(WANG_ZHE), true);
  assert.equal(protect.isMustSurvive(XIE_YI), true);
  assert.equal(protect.isMustSurvive(DUAN_QIANG), false);
  assert.equal(protect.lifeFloorFor(WANG_ZHE, POISON.max), Math.max(NUM.lifeFloor.min, Math.ceil(POISON.max * NUM.lifeFloor.ratio)));
  assert.ok(protect.lifeFloorFor(WANG_ZHE, POISON.max) >= 1);
  assert.equal(protect.lifeFloorFor(DUAN_QIANG, POISON.max), 0);
});

test('mustSurvive 的人可以反复中毒但不致死：计数停在下限，再下毒不追加，不升级濒死，中毒状态仍在', () => {
  const s = save([person(WANG_ZHE, '王哲')]);
  const floor = protect.lifeFloorFor(WANG_ZHE, POISON.max);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const r = apply.applyActorStatus(s, WANG_ZHE, 'poisoned', { sourceId: `dose${i}` });
    assert.equal(r.ok, true);
    assert.equal(r.lethal, undefined, `第 ${i + 1} 次不致死`);
    assert.equal(r.upgradedTo, undefined);
    assert.ok(r.counter.after >= floor, '计数不低于下限');
    seen.push(r.counter.after);
  }
  assert.equal(seen[0], POISON.max - POISON.perDose, '第一次扣一个剂量');
  assert.equal(seen.at(-1), floor);
  const last = apply.applyActorStatus(s, WANG_ZHE, 'poisoned');
  assert.equal(last.counter.atFloor, true);
  assert.equal(last.counter.before, last.counter.after, '已在下限：不再追加毒伤');
  const list = rows(s, WANG_ZHE);
  assert.equal(list.filter(x => x.statusId === 'poisoned').length, 1, '中毒状态只有一条');
  assert.equal(list.some(x => x.statusId === 'dying'), false, '不挂 dying');
  assert.equal(list.find(x => x.statusId === 'poisoned').counter.life, floor);
  assert.equal(read.actorStatusProfile(s, WANG_ZHE).consciousness, 'clear', '没有倒下');
  assert.deepEqual(read.appearanceTagsOf(s, WANG_ZHE), ['面色青灰'], '中毒的外貌仍在');
});

test('mustSurvive 的人一次吃大剂量也不会越过下限', () => {
  const s = save();
  const r = apply.applyActorStatus(s, XIE_YI, 'poisoned', { doses: 99 });
  assert.equal(r.counter.after, protect.lifeFloorFor(XIE_YI, POISON.max));
  assert.equal(r.lethal, undefined);
  assert.equal(rows(s, XIE_YI).some(x => x.statusId === 'dying'), false);
});

test('非必须存活者同样的毒会致死：计数降到 0，结果标 lethal，顺升级链挂上不过期的 dying；不写死亡字段', () => {
  const s = save([person(DUAN_QIANG, '段强')]);
  const results = [];
  for (let i = 0; i < Math.ceil(POISON.max / POISON.perDose); i++) results.push(apply.applyActorStatus(s, DUAN_QIANG, 'poisoned'));
  const final = results.at(-1);
  assert.equal(final.counter.after, 0);
  assert.equal(final.lethal, true);
  assert.equal(final.upgradedTo, 'dying');
  assert.ok(results.slice(0, -1).every(r => !r.lethal), '之前都没致死');
  const dying = rows(s, DUAN_QIANG).find(x => x.statusId === 'dying');
  assert.ok(dying, '挂上 dying');
  assert.equal(dying.expiresAt, null, '濒死不因时限消失');
  assert.equal(read.actorStatusProfile(s, DUAN_QIANG).consciousness, 'unconscious');
  const ledger = rt(s).sceneLedger;
  assert.equal(JSON.stringify(ledger).match(/"status":"(dead|missing|departed)"/), null, '自由行动路径不写 dead/missing/departed');
  assert.equal(ledger.actors?.[DUAN_QIANG]?.status, undefined);
});

test('毒伤计数的数值全在配置里：改 status.lifeFloor.ratio，必须活着者的下限随之改变', () => {
  const original = NUM.lifeFloor.ratio;
  try {
    numbers.applyGameNumbers({ status: { lifeFloor: { ratio: 0.5 } } });
    const s = save();
    const r = apply.applyActorStatus(s, WANG_ZHE, 'poisoned', { doses: 99 });
    assert.equal(r.counter.after, Math.ceil(POISON.max * 0.5));
  } finally { numbers.applyGameNumbers({ status: { lifeFloor: { ratio: original } } }); }
  assert.equal(NUM.lifeFloor.ratio, original);
});

test('NPC 气血字段本轮不依赖：中毒不读不写 社交.关系[id].属性.气血；新代码里没有对气血字段的引用', () => {
  const s = save([person(WANG_ZHE, '王哲')]);
  s.社交 = { 关系: { 王哲: { 角色ID: WANG_ZHE, 好感度: 10, 属性: { 气血: { 当前: 100, 上限: 100 } } } } };
  const before = JSON.stringify(s.社交);
  for (let i = 0; i < 6; i++) apply.applyActorStatus(s, WANG_ZHE, 'poisoned');
  assert.equal(JSON.stringify(s.社交), before, '社交.关系 逐字不变');
  for (const f of ['src/modules/scenarioMods/freeAction/actorStatus.ts', 'src/modules/scenarioMods/freeAction/protect.ts', 'src/modules/scenarioMods/freeAction/itemUse.ts',
    'src/modules/scenarioMods/actorStatusRead.ts', 'src/modules/sceneModule/statusProfile.ts']) {
    const code = readFileSync(new URL(f, rootUrl), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/气血/.test(code), `${f} 的代码不引用气血（注释里提到不算）`);
  }
});

test('mustSurvive 只在总表读取函数与 freeAction/protect.ts 里出现；写状态的入口只被 freeAction/ 自己和测试引用（路径隔离）', () => {
  const walk = dir => readdirSync(dir).flatMap(name => {
    const p = `${dir}/${name}`;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const src = fileURLToPath(new URL('src', rootUrl));
  const files = walk(src).filter(f => /\.(ts|vue)$/.test(f));
  const mentions = files.filter(f => /mustSurvive|MustSurvive/.test(readFileSync(f, 'utf8'))).map(f => f.slice(src.length + 1)).sort();
  assert.deepEqual(mentions, ['modules/scenarioMods/characterResolver.ts', 'modules/scenarioMods/freeAction/protect.ts']);
  const importers = files.filter(f => /from\s+['"][^'"]*freeAction\/(actorStatus|protect|itemUse)['"]/.test(readFileSync(f, 'utf8'))).map(f => f.slice(src.length + 1)).sort();
  assert.deepEqual(importers, [], 'B 步没有把写入口接进任何运行时代码（接线属于自由行动结算步骤）');
});

test('剧情合同路径不受 mustSurvive 约束：必须活着的人经合同写回照常被挂上 dying', () => {
  const c = structuredClone(contracts.sceneContractById('combat.f03.mountain_stream_fog'));
  const party = c.parties.find(p => !p.player && !p.group);
  party.ref = WANG_ZHE;
  const s = save([person(WANG_ZHE, '王哲')]);
  const def = catalog('dying');
  injuries.recordSceneInjuries(s, c, [{ party: party.id, ref: WANG_ZHE, status: 'dying', label: def.label, minutes: null, cause: def.cause, source: def.source }]);
  assert.equal(protect.isMustSurvive(WANG_ZHE), true);
  assert.ok(rows(s, WANG_ZHE).some(x => x.statusId === 'dying'), '合同写回不看 mustSurvive');
});

// ───────── 外貌进角色卡 ─────────
test('角色身上的外貌标签进角色卡：一行“外貌：…”，条数受 status.appearance.maxTags 限制，到期后消失', () => {
  const s = save([person(WANG_ZHE, '王哲')]);
  const text = () => (cardLayer.readNpcCard(s, WANG_ZHE)?.card || []).join('\n');
  assert.doesNotMatch(text(), /外貌：/, '没有状态时没有外貌行');
  apply.applyActorStatus(s, WANG_ZHE, 'poisoned');
  assert.match(text(), /外貌：面色青灰/);
  apply.applyActorStatus(s, WANG_ZHE, 'wound.severe');
  assert.match(text(), /外貌：面色青灰、面无血色/);
  const original = NUM.appearance.maxTags;
  try {
    numbers.applyGameNumbers({ status: { appearance: { maxTags: 1 } } });
    const line = text().split('\n').find(l => l.startsWith('外貌：'));
    assert.equal(line.slice('外貌：'.length).split('、').length, 1);
    assert.ok(line.includes('面色青灰'), '先挂的先出');
  } finally { numbers.applyGameNumbers({ status: { appearance: { maxTags: original } } }); }
  s.元数据.时间.日 += 40;
  assert.doesNotMatch(text(), /外貌：/, '到期的状态外貌消失');
});

test('外貌行遵守角色卡总字数上限：超出时先丢末尾，不撑破 maxCardChars', () => {
  const s = save([person(WANG_ZHE, '王哲')]);
  apply.applyActorStatus(s, WANG_ZHE, 'poisoned');
  const card = cardLayer.readNpcCard(s, WANG_ZHE).card;
  assert.ok(card.reduce((n, l) => n + l.length, 0) <= GAME_NUMBERS.npcCard.maxCardChars || card.length === 1);
});

test('敌人个体也有外貌标签（按实例 id 读）', () => {
  const s = save();
  const id = inst.instanceId(MERFOLK, 'combat.free.demo', 3);
  apply.applyActorStatus(s, id, 'poisoned');
  assert.deepEqual(read.appearanceTagsOf(s, id), ['面色青灰']);
  assert.deepEqual(read.appearanceTagsOf(s, MERFOLK), []);
});

// ───────── 物品 effectTags / onUse ─────────
const TAGGED = {
  'lcq.item.np013': { tags: ['antidote'], onUse: [] },
  'lyg.item.np049': { tags: ['antidote'], onUse: [] },
  'lyg.item.np092': { tags: ['poison'], onUse: [{ statusId: 'poisoned', doses: 1 }] },
  // C 步：用户裁定合规相关的两种药开放标注（假死药 → 昏迷；六识禁绝丹 → 六识受损（五识全压）+ 神志不清）。tag=sedative，喂药时要看对方态度（不是毒）。
  'lyl.item.np053': { tags: ['sedative'], onUse: [{ statusId: 'unconscious' }] },
  'lyg.item.np071': { tags: ['sedative'], onUse: [{ statusId: 'sense.impaired', params: { senses: ['sight', 'hearing', 'smell', 'taste', 'touch'] } }, { statusId: 'mind.confused' }] },
  // 2026-10-19 用户确认（#177）：麻古按非性化普通依赖 debuff 实装，只挂「感官亢奋」，不带任何标签。
  'lcq.item.np006': { tags: [], onUse: [{ statusId: 'sense.heightened' }] },
  // 2026-10-19 药品分级 B2：新增五件药。
  'lcq.item.jinchuang_yao': { tags: ['salve'], onUse: [] },
  'lcq.item.liaoshang_yao': { tags: ['heal'], onUse: [] },
  'lcq.item.qiannian_renshen': { tags: ['stabilize'], onUse: [] },
  'lcq.item.tianshan_xuelian': { tags: ['stabilize'], onUse: [] },
  'lcq.item.jiuzhuan_huanhun_dan': { tags: ['revive'], onUse: [] },
};

test('物品表：只有毒/药相关的条目（原 5 件 + 麻古 + 新增五件药）补了 effectTags/onUse，其余两个字段都没有', () => {
  const marked = items.entries.filter(e => e.definition.effectTags !== undefined || e.definition.onUse !== undefined).map(e => e.id).sort();
  assert.deepEqual(marked, Object.keys(TAGGED).sort());
  for (const [id, want] of Object.entries(TAGGED)) {
    const eff = itemUse.itemEffectOf(id);
    assert.deepEqual(eff, want, id);
  }
  assert.deepEqual(itemUse.itemEffectOf('lcq.item.nh_orange'), { tags: [], onUse: [] });
  assert.deepEqual(itemUse.itemEffectOf('no.such.item'), { tags: [], onUse: [] });
});

test('南荒掉落物（lcq.item.nh_*，含山草药）的定义键被 locationLootContent 守卫锁死：不在这些物品上加字段', () => {
  for (const e of items.entries.filter(x => x.id.startsWith('lcq.item.nh_'))) assert.ok(e.definition.effectTags === undefined && e.definition.onUse === undefined, e.id);
});

test('合规相关的药物类物品不补标签（麻古、春药、慎恤胶、催情仙草、魂丹类；假死药与六识禁绝丹已由用户裁定开放标注）', () => {
  const left = items.entries.filter(e => /麻古|春药|慎恤胶|催情|魂丹|药丸（殇侯制）|摇头丸/.test(e.definition.name + (e.definition.description || '')));
  assert.ok(left.length >= 9); // 同文字 id 合并后（第四轮）从 13 条降到 9 条；这里只是防正则失效的下限
  // 例外（均为用户 2026-10-19 指示）：麻古（#177 非性化普通依赖 debuff，只挂感官亢奋、无标签）；九转还魂丹是新增的吊命药，名字含「魂丹」但与合规魂丹类无关。
  const EXEMPT = { 'lcq.item.np006': e => e.definition.effectTags === undefined && JSON.stringify(e.definition.onUse) === JSON.stringify([{ statusId: 'sense.heightened' }]), 'lcq.item.jiuzhuan_huanhun_dan': e => JSON.stringify(e.definition.effectTags) === '["revive"]' && e.definition.onUse === undefined };
  for (const e of left) assert.ok(EXEMPT[e.id] ? EXEMPT[e.id](e) : e.definition.effectTags === undefined && e.definition.onUse === undefined, e.id);
});

test('物品标签与状态目录对得上：解除类标签是目录 remove 规则里的 item 标签，毒性标签在配置里，onUse 的状态 id 都存在', () => {
  const refs = new Set(statuses.STATUS_CATALOG.flatMap(d => (d.remove || []).filter(r => r.kind === 'item').map(r => r.ref)));
  for (const [id, { tags, onUse }] of Object.entries(TAGGED)) {
    for (const tag of tags) assert.ok(refs.has(tag) || Object.values(NUM.itemTags).flat().includes(tag), `${id}:${tag}`);
    for (const use of onUse) assert.ok(catalog(use.statusId), `${id} → ${use.statusId}`);
  }
  assert.ok(catalog('poisoned').remove.some(r => r.kind === 'item' && r.ref === 'antidote'), '解毒标签能解中毒');
  assert.deepEqual(audit.auditEntityCatalog().errors, []);
});

test('canon:build 的物品校验能抓出错误：onUse 引用不存在的状态、未知标签、坏剂量、毒性物品没有 onUse、空数组', () => {
  const mk = def => ({ entries: [{ id: 'x.item', definition: { id: 'x.item', name: 'x', type: 'consumable', ...def } }] });
  const run = def => { const errors = []; audit.auditItemEffects(errors, mk(def)); return errors.join('|'); };
  assert.equal(run({}), '');
  assert.equal(run({ effectTags: ['antidote'] }), '');
  assert.equal(run({ effectTags: ['poison'], onUse: [{ statusId: 'poisoned', doses: 2 }] }), '');
  assert.match(run({ onUse: [{ statusId: 'no.such.status' }] }), /不存在的状态 no\.such\.status/);
  assert.match(run({ effectTags: ['magic'] }), /未知效果标签 magic/);
  assert.match(run({ effectTags: [] }), /effectTags 需为非空/);
  assert.match(run({ effectTags: ['heal', 'heal'] }), /不重复/);
  assert.match(run({ onUse: [] }), /onUse 需为非空数组/);
  assert.match(run({ onUse: [{ statusId: 'poisoned', doses: 0 }] }), /doses/);
  assert.match(run({ onUse: [{ statusId: 'poisoned', doses: NUM.onUse.maxDoses + 1 }] }), /doses/);
  assert.match(run({ onUse: [{ statusId: 'poisoned', minutes: -5 }] }), /minutes/);
  assert.match(run({ onUse: [{ statusId: 'poisoned', hp: 5 }] }), /只允许 statusId/);
  assert.match(run({ effectTags: ['poison'] }), /毒性物品必须有 onUse/);
  // 标签词表独立成文件后：标签要适用该 activation，道具的 activation 随类型
  assert.match(run({ type: 'weapon', effectTags: ['heal'] }), /效果标签 heal 不适用于 equipped/);
  assert.match(run({ type: 'material', effectTags: ['heal'] }), /没有生效方式/);
  assert.match(run({ type: 'weapon', onUse: [{ statusId: 'poisoned' }] }), /onUse 只用于 consumable/);
  assert.match(run({ activation: 'equipped' }), /activation equipped 与类型 consumable 不一致/);
});

test('毒物品 → 状态：使用六拂化清散，目标身上挂中毒并按下限计数；必须活着者停在下限，其余人可致死', () => {
  const poisonItem = 'lyg.item.np092';
  const s = save();
  const first = itemUse.applyItemOnUse(s, WANG_ZHE, poisonItem);
  assert.equal(first.length, 1);
  assert.equal(first[0].ok, true);
  assert.equal(rows(s, WANG_ZHE)[0].statusId, 'poisoned');
  assert.equal(rows(s, WANG_ZHE)[0].sourceScene, `free:${poisonItem}`);
  for (let i = 0; i < 10; i++) itemUse.applyItemOnUse(s, WANG_ZHE, poisonItem);
  assert.equal(rows(s, WANG_ZHE).find(x => x.statusId === 'poisoned').counter.life, protect.lifeFloorFor(WANG_ZHE, POISON.max));
  let lethal = false;
  for (let i = 0; i < 10; i++) lethal ||= itemUse.applyItemOnUse(s, DUAN_QIANG, poisonItem)[0].lethal === true;
  assert.equal(lethal, true);
  assert.deepEqual(itemUse.applyItemOnUse(s, DUAN_QIANG, 'lcq.item.nh_orange'), [], '没有 onUse 的物品什么也不挂');
});

test('药物品的标签能真正解毒：antidote 标签经现有 removeSceneInjury 摘掉中毒；用错标签摘不掉', () => {
  const s = save();
  apply.applyActorStatus(s, DUAN_QIANG, 'poisoned');
  const [tag] = itemUse.itemEffectOf('lcq.item.np013').tags;
  assert.equal(injuries.removeSceneInjury(s, { actorId: DUAN_QIANG }, 'poisoned', 'item', 'heal'), false, 'heal 解不了毒');
  assert.equal(injuries.removeSceneInjury(s, { actorId: DUAN_QIANG }, 'poisoned', 'item', tag), true);
  assert.deepEqual(read.actorStatusRecords(s, DUAN_QIANG), []);
});
