// A 步：总表角色/敌人种类、基础属性与阶段覆盖项的合并、mustSurvive 缺省 false、伤势写实例不写回种类。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const merge = await loadTs('../src/modules/scenarioMods/characterStatsMerge.ts');
const rulesMod = await loadTs('../src/modules/scenarioMods/characterStatsRules.ts');
const stats = await loadTs('../src/modules/scenarioMods/characterStats.ts');
const resolver = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const inst = await loadTs('../src/modules/scenarioMods/actorInstances.ts');
const names = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const levels = await loadTs('../src/modules/scenarioMods/characterLevels.ts');
const host = await loadTs('../src/modules/sceneModule/host/factors.ts');
const injuries = await loadTs('../src/modules/sceneModule/host/injuries.ts');
const core = await loadTs('../src/modules/sceneModule/index.ts');
const contracts = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const progression = await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');

const readJson = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const registry = readJson('src/modules/scenarioMods/builtins/character-registry.json');
const enemies = readJson('mod-kit/entity-catalog/enemies.json');
const levelTable = readJson('mod-kit/entity-catalog/character-levels.qingyu.json');
const RULES = rulesMod.statsRules();
const M = (base, override) => merge.mergeCharacterStats(base, override, RULES);

const KINDS = { merfolk: 'lcq.enemy.merfolk', altar_corpse: 'lcq.enemy.altar_corpse', guiwang_warrior: 'lcq.enemy.guiwang_warrior' };
const rt = s => s.世界.状态.剧本模组;
function save(stageCharacters = []) {
  const s = createMinimalSaveDataV3();
  s.世界.状态.剧本模组 = { modId: 'lcq.stage_04', flags: {}, opening: { playerCharacterId: 'liuchao.character.cheng_zongyang' }, canon: { characters: stageCharacters, locations: [] }, events: [], completedEventIds: [], activeEventIds: [] };
  s.角色.属性.境界 = progression.realmAt(0);
  return s;
}

// ───────── 合并规则（纯函数）─────────
test('属性名来自判定权重表的六司，级数范围来自 levels 配置，不另立名单', () => {
  assert.deepEqual([...RULES.attributeKeys].sort(), ['悟性', '心性', '根骨', '气运', '灵性', '魅力'].sort());
  assert.equal(RULES.levelMin, 0);
  assert.equal(RULES.levelMax, 9);
});

test('合并规则 1：覆盖项缺省（键不存在或 undefined）= 沿用基础', () => {
  const base = { level: 3, levelSource: '基础来源', combatStrength: 4, attributes: { 根骨: 6, 灵性: 5 } };
  assert.deepEqual(M(base, undefined).stats, base);
  assert.deepEqual(M(base, {}).stats, base);
  assert.deepEqual(M(base, { level: undefined, attributes: undefined }).stats, base);
  assert.deepEqual(M(undefined, undefined).stats, {});
  assert.deepEqual(M(undefined, { level: 2 }).stats, { level: 2 });
});

test('合并规则 2：覆盖项存在 = 替换同名字段；其余字段不动；显式 null 是“不适用”，不回落基础也不是 0', () => {
  const base = { level: 3, combatStrength: 4, levelSource: 'A' };
  assert.deepEqual(M(base, { level: 5 }).stats, { level: 5, combatStrength: 4, levelSource: 'A' });
  assert.deepEqual(M(base, { combatStrength: 7, levelSource: 'B' }).stats, { level: 3, combatStrength: 7, levelSource: 'B' });
  const nulled = M(base, { level: null }).stats;
  assert.equal(nulled.level, null);
  assert.notEqual(nulled.level, 0);
  assert.equal(merge.combatLevelOf(nulled), 4, 'level 为 null 时战斗强度仍生效');
  assert.equal(merge.combatLevelOf({ level: null, combatStrength: null }), undefined, '都是 null = 无值，调用方按同级回落');
  assert.equal(merge.combatLevelOf({ level: 3 }), 3);
  assert.equal(merge.combatLevelOf({ level: 3, combatStrength: 5 }), 5, '战斗强度优先于等级');
  assert.equal(merge.combatLevelOf({ level: 0 }), 0, '0 级是有效等级，不能被当成缺省');
});

test('合并规则 3：嵌套对象 attributes 逐键合并（覆盖项写了的替换，没写的沿用），不是整体替换', () => {
  const base = { attributes: { 根骨: 6, 灵性: 5, 气运: 3 } };
  const out = M(base, { attributes: { 灵性: 8, 魅力: 2 } });
  assert.deepEqual(out.stats.attributes, { 根骨: 6, 灵性: 8, 气运: 3, 魅力: 2 });
  assert.deepEqual(M(base, { attributes: { 气运: null } }).stats.attributes, { 根骨: 6, 灵性: 5, 气运: null });
  assert.deepEqual(M(base, { attributes: {} }).stats.attributes, base.attributes, '空对象 = 没有覆盖');
  assert.deepEqual(M(undefined, { attributes: { 根骨: 1 } }).stats.attributes, { 根骨: 1 });
});

test('合并规则 4：未知字段不进合并结果并被记录（顶层、attributes 内、越界与错类型都一样）', () => {
  const base = { level: 3, 战力: 99, attributes: { 根骨: 6, 力量: 9 } };
  const override = { combatStrength: 12, levelSource: 7, 神通: 'x', attributes: { 灵性: '高', 悟性: 4, 速度: 1 } };
  const out = M(base, override);
  assert.deepEqual(out.stats, { level: 3, attributes: { 根骨: 6, 悟性: 4 } });
  assert.deepEqual([...out.ignored].sort(), [
    'base.attributes.力量', 'base.战力',
    'override.attributes.灵性', 'override.attributes.速度', 'override.combatStrength', 'override.levelSource', 'override.神通',
  ].sort());
  assert.deepEqual(M(base, 'oops').ignored.includes('override'), true, '覆盖项不是对象 = 整体丢弃');
  assert.deepEqual(M(base, { level: 2.5 }).stats.level, 3, '非整数级数丢弃，沿用基础');
  assert.deepEqual(M(base, { level: -1 }).stats.level, 3, '越界丢弃');
  assert.deepEqual(M(base, { attributes: [1] }).stats.attributes, { 根骨: 6 }, 'attributes 不是对象 = 丢弃');
});

test('合并不改动传入的对象；validateCharacterStats 把会被丢弃的字段列为错误', () => {
  const base = { level: 3, attributes: { 根骨: 6 } }, override = { attributes: { 灵性: 2 } };
  const b0 = structuredClone(base), o0 = structuredClone(override);
  const out = M(base, override);
  assert.deepEqual(base, b0);
  assert.deepEqual(override, o0);
  out.stats.attributes.根骨 = 99;
  assert.equal(base.attributes.根骨, 6, '结果与输入不共享引用');
  assert.deepEqual(merge.validateCharacterStats({ level: 3, attributes: { 根骨: 1 } }, RULES), []);
  assert.deepEqual(merge.validateCharacterStats({ level: 3, x: 1 }, RULES, 'S'), ['S.x']);
});

// ───────── 总表：敌人种类 / baseStats / mustSurvive ─────────
test('总表里每个敌人种类一个 id；三个先行种类在敌人目录里是同一个 id，且不是人物表的可检索项', () => {
  for (const id of Object.values(KINDS)) {
    const entries = registry.characters.filter(c => c.id === id);
    assert.equal(entries.length, 1, `${id} 只有一条`);
    assert.equal(entries[0].entityType, 'enemy_kind');
    assert.ok(enemies.entries.some(e => e.id === id), `${id} 在敌人目录里`);
    assert.equal(inst.isEnemyKindId(id), true);
    assert.equal(resolver.hasRegistryEntry(entries[0].canonicalName), false, '种类名不参与按人名的总表查找');
    assert.ok(!names.namedEntityEntries('character').some(e => e.id === id), '不进人物命名表');
    assert.ok(names.namedEntityEntries('enemy').some(e => e.id === id), '敌人命名表照旧');
  }
  assert.equal(inst.isEnemyKindId('liuchao.character.cheng_zongyang'), false);
  assert.equal(inst.isEnemyKindId('lcq.enemy.jiaoren'), true, '旧 id 别名也认');
  assert.equal(registry.characters.filter(c => c.entityType === 'enemy_kind').length, 3);
});

test('baseStats：总表里全部条目的基础属性都合法；种类基础等级与时点级数表的同 id 通用行一致，不另造一套', () => {
  for (const c of registry.characters) {
    if (c.baseStats === undefined) continue;
    assert.deepEqual(merge.validateCharacterStats(c.baseStats, RULES, c.id), [], c.id);
  }
  const base = id => resolver.getRegistryBaseStats(id);
  assert.equal(base(KINDS.guiwang_warrior).level, 3);
  assert.equal(base(KINDS.merfolk).level, 4);
  assert.equal(base(KINDS.altar_corpse).level, null, '尸鬼的等级待剧情策划核定：null，不是 0');
  for (const id of Object.values(KINDS)) {
    const generic = levelTable.entries.filter(e => e.entityId === id && !e.variant && e.level !== null);
    if (generic.length === 1) assert.equal(base(id).level, generic[0].level, `${id} 与时点表通用行同值`);
  }
  assert.equal(base('lcq.enemy.jiaoren').level, 4, '旧 id 别名读到同一份');
  assert.equal(resolver.getRegistryBaseStats('lcq.enemy.no_such'), undefined);
  const copy = base(KINDS.merfolk);
  copy.level = 9;
  assert.equal(base(KINDS.merfolk).level, 4, '读到的是拷贝');
  assert.equal(resolver.getRegistryBaseStats('liuchao.character.xie_yi').level, 6, '谢艺的旧卡级数 6 折成了基础属性');
});

test('mustSurvive：缺省 false；只有明确标 true 的才是 true；总表里只允许布尔；未知 id 与实例 id 的读法', () => {
  for (const c of registry.characters) assert.ok(c.mustSurvive === undefined || typeof c.mustSurvive === 'boolean', c.id);
  const tagged = registry.characters.filter(c => c.mustSurvive === true).map(c => c.id).sort();
  assert.deepEqual(tagged, ['liuchao.character.xie_yi', 'lcq.character.wang_zhe'].sort(), '打标名单（王哲、谢艺）；其余没有打标');
  assert.equal(resolver.getRegistryMustSurvive('lcq.character.wang_zhe'), true);
  assert.equal(resolver.getRegistryMustSurvive('liuchao.character.xie_yi'), true);
  assert.equal(resolver.getRegistryMustSurvive('lcq.character.duan_qiang'), false, '没打标 = false');
  assert.equal(resolver.getRegistryMustSurvive('liuchao.character.cheng_zongyang'), false);
  assert.equal(resolver.getRegistryMustSurvive(KINDS.merfolk), false, '敌人种类缺省 false');
  assert.equal(resolver.getRegistryMustSurvive('lcq.enemy.no_such'), false, '总表里没有的 id = false，不抛错');
  assert.equal(resolver.getRegistryMustSurvive(inst.instanceId(KINDS.merfolk, 'combat.x', 1)), false);
  assert.equal(resolver.getRegistryMustSurvive(inst.instanceId('lcq.character.wang_zhe', 'combat.x', 1)), true, '实例 id 按其种类读');
});

test('mustSurvive 只许在总表读取函数里出现，不接进共用写入或守卫（计划 §7.3 硬规则）', () => {
  const forbidden = ['src/modules/scenarioMods/runtime.ts', 'src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/canonGuard.ts', 'src/modules/sceneModule/host/writeback.ts', 'src/modules/scenarioMods/fixedEndingNarratives.ts', 'src/modules/sceneModule/host/injuries.ts'];
  for (const f of forbidden) assert.ok(!/mustSurvive|getRegistryMustSurvive/.test(readFileSync(new URL('../' + f, import.meta.url), 'utf8')), `${f} 不得引用 mustSurvive`);
});

// ───────── 运行时：总表基础 ⊕ 当前阶段档覆盖项 ─────────
test('运行时合并：只有基础 / 阶段档覆盖 / 旧顶层 level 别名 / stats 优先于旧 level / 未知 id', () => {
  const only = stats.resolveActorStats(rt(save()), KINDS.merfolk);
  assert.deepEqual(only.stats, { level: 4, levelSource: only.stats.levelSource });
  assert.equal(only.canonicalId, KINDS.merfolk);

  const withStats = stats.resolveActorStats(rt(save([{ id: KINDS.merfolk, stats: { combatStrength: 6, attributes: { 根骨: 7 } } }])), KINDS.merfolk);
  assert.equal(withStats.stats.level, 4, '没写的沿用基础');
  assert.equal(withStats.stats.combatStrength, 6);
  assert.deepEqual(withStats.stats.attributes, { 根骨: 7 });

  const legacy = stats.resolveActorStats(rt(save([{ id: KINDS.merfolk, level: 5 }])), KINDS.merfolk);
  assert.equal(legacy.stats.level, 5, '阶段档旧顶层 level 当作覆盖项');
  const both = stats.resolveActorStats(rt(save([{ id: KINDS.merfolk, level: 5, stats: { level: 2 } }])), KINDS.merfolk);
  assert.equal(both.stats.level, 2, 'stats.level 优先');
  const junk = stats.resolveActorStats(rt(save([{ id: KINDS.merfolk, level: null, stats: { 战力: 1, level: 99 } }])), KINDS.merfolk);
  assert.equal(junk.stats.level, 4, '越界与未知字段丢弃，沿用基础');
  assert.deepEqual([...junk.ignored].sort(), ['override.level', 'override.战力']);

  assert.equal(stats.resolveActorStats(rt(save()), 'lcq.enemy.no_such'), undefined);
  assert.equal(stats.resolveActorStats(undefined, KINDS.merfolk).stats.level, 4, '没有存档也能读基础');
  const person = stats.resolveActorStats(rt(save([{ id: 'liuchao.character.xie_yi', level: 6 }])), 'liuchao.character.xie_yi');
  assert.equal(person.stats.level, 6);
  const other = stats.resolveActorStats(rt(save([{ id: 'x.other', stats: { level: 8 } }])), KINDS.merfolk);
  assert.equal(other.stats.level, 4, '别人的阶段档不影响这个 id');
});

test('覆盖项只作用于当前阶段的副本：换一份阶段档读到的是另一个结果，总表基础不被改写', () => {
  const stageA = save([{ id: KINDS.guiwang_warrior, stats: { level: 5 } }]), stageB = save();
  assert.equal(stats.resolveActorStats(rt(stageA), KINDS.guiwang_warrior).stats.level, 5);
  assert.equal(stats.resolveActorStats(rt(stageB), KINDS.guiwang_warrior).stats.level, 3);
  assert.equal(resolver.getRegistryBaseStats(KINDS.guiwang_warrior).level, 3);
});

test('实例 id 读种类的属性', () => {
  const id = inst.instanceId(KINDS.guiwang_warrior, 'combat.f03.mountain_stream_fog', 4);
  assert.equal(stats.resolveActorStats(rt(save()), id).stats.level, 3);
  assert.equal(stats.resolveActorStats(rt(save([{ id: KINDS.guiwang_warrior, stats: { level: 5 } }])), id).stats.level, 5);
});

// ───────── 战斗读合并结果 ─────────
function snapshotWith(contractMutator, stageCharacters = []) {
  const base = contracts.sceneContractById('combat.f03.mountain_stream_fog');
  const c = structuredClone(base);
  contractMutator(c);
  const s = core.beginScene(c).state, v = save(stageCharacters);
  host.snapshotLevels(v, c, s);
  return s;
}
test('战斗：时点级数表没有该 id 该章的行时，读总表基础属性（鲛人第 45 章无表行）', () => {
  assert.equal(levels.levelFact(KINDS.merfolk, 45), undefined);
  const s = snapshotWith(c => { c.parties.find(p => p.id === 'foe_pack_1').ref = KINDS.merfolk; });
  assert.equal(s.levels.foe_pack_1, 4);
  assert.equal(s.levelFacts.foe_pack_1, undefined, '这一读不是时点表事实');
});
test('战斗：阶段档覆盖项替换基础，战斗强度优先于等级；覆盖项不影响同种类以外的参战方', () => {
  const swap = c => { c.parties.find(p => p.id === 'foe_pack_1').ref = KINDS.merfolk; };
  assert.equal(snapshotWith(swap, [{ id: KINDS.merfolk, stats: { level: 6 } }]).levels.foe_pack_1, 6);
  const s = snapshotWith(swap, [{ id: KINDS.merfolk, stats: { combatStrength: 7 } }]);
  assert.equal(s.levels.foe_pack_1, 7);
  assert.equal(s.levels.foe_engaged, 3, '同合同里的鬼王峒武士仍按时点表');
});
test('战斗：时点级数表仍是按章的权威（第 45 章武士 3，精英变体 4）；总表基础只在没有表行时兜底', () => {
  const s = snapshotWith(() => {}, [{ id: KINDS.guiwang_warrior, stats: { level: 8 } }]);
  assert.equal(s.levels.foe_engaged, 3, '有表行时表行优先，阶段覆盖不改它');
  assert.equal(s.levelFacts.foe_engaged.entityId, KINDS.guiwang_warrior);
});
test('战斗：尸鬼 level 为 null（不适用九级）但有战斗强度 3 → 战斗读 combatStrength ?? level（用户 2026-10-16 裁定尸鬼与男尸鬼合并）', () => {
  const s = snapshotWith(c => { c.parties.find(p => p.id === 'foe_pack_2').ref = KINDS.altar_corpse; });
  assert.equal(s.levels.foe_pack_2, 3, '第 45 章没有尸鬼的表行：读总表基础的战斗强度，不是按同级');
});
test('战斗：level 与 combatStrength 都为 null = 不适用，不是 0 级，调用方按同级回落', () => {
  assert.equal(merge.combatLevelOf({ level: null, combatStrength: null }), undefined);
  assert.equal(merge.combatLevelOf({ level: null }), undefined);
  assert.equal(merge.combatLevelOf({ level: null, combatStrength: 0 }), 0, '0 是真实的强度，只有 null 才是不适用');
});

// ───────── 实例编号与“伤势写实例不写回种类” ─────────
test('实例 id 规则：往返、拒绝非法输入、实例 id 解析回种类', () => {
  const id = inst.instanceId(KINDS.merfolk, 'combat.f06.sea_hall', 3);
  assert.equal(id, 'lcq.enemy.merfolk#combat.f06.sea_hall:3');
  assert.deepEqual(inst.parseInstanceId(id), { kindId: KINDS.merfolk, scopeId: 'combat.f06.sea_hall', n: 3 });
  assert.equal(inst.kindIdOf(id), KINDS.merfolk);
  assert.equal(inst.kindIdOf(KINDS.merfolk), KINDS.merfolk, '种类 id 原样');
  assert.equal(inst.parseInstanceId(KINDS.merfolk), undefined);
  for (const bad of [[KINDS.merfolk, 'a:b', 1], [KINDS.merfolk, 'a', 0], [KINDS.merfolk, 'a', 1.5], ['x#y', 'a', 1], [KINDS.merfolk, '', 1]]) assert.throws(() => inst.instanceId(...bad));
  assert.equal(inst.parseInstanceId('lcq.enemy.merfolk#combat.f06:0'), undefined);
});
test('合同里同种类参战方按出场顺序编号（f03 的九名鬼王峒武士 1..9，互不相同）', () => {
  const c = contracts.sceneContractById('combat.f03.mountain_stream_fog');
  const warriors = c.parties.filter(p => p.ref === KINDS.guiwang_warrior);
  assert.equal(warriors.length, 9);
  const ids = warriors.map(p => injuries.partyInstanceId(c, p));
  assert.deepEqual(ids.map(id => inst.parseInstanceId(id).n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(ids).size, 9);
  assert.equal(injuries.partyInstanceId(c, c.parties.find(p => p.player)), undefined, '玩家与人物没有实例 id');
  assert.equal(ids[0], 'lcq.enemy.guiwang_warrior#combat.f03.mountain_stream_fog:1');
});
test('伤势写在个体（实例）名下：同种类别的个体互不影响，种类 id 下永远没有记录，种类的总表条目不被改动', () => {
  const c = contracts.sceneContractById('combat.f03.mountain_stream_fog'), s = save();
  const registryBefore = JSON.stringify(registry.characters.filter(e => e.entityType === 'enemy_kind'));
  const row = party => { const def = core.resolveStatusDef('wound.external', c); return { party, ref: c.parties.find(p => p.id === party).ref, status: 'wound.external', label: def.label, minutes: def.afterScene.minutes, cause: def.cause, source: def.source }; };
  injuries.recordSceneInjuries(s, c, [row('foe_pack_1'), row('foe_last')]);
  const store = rt(s).sceneLedger.statusRecords;
  const keys = [...Object.keys(store.actors), ...Object.keys(store.groups)];
  for (const kind of Object.values(KINDS)) assert.ok(!keys.includes(kind), `种类 ${kind} 名下不能有伤势`);
  assert.deepEqual(Object.keys(store.groups).sort(), ['combat.f03.mountain_stream_fog.foe_last', 'combat.f03.mountain_stream_fog.foe_pack_1']);
  assert.equal(store.groups['combat.f03.mountain_stream_fog.foe_pack_1'][0].instanceId, 'lcq.enemy.guiwang_warrior#combat.f03.mountain_stream_fog:2');
  assert.equal(store.groups['combat.f03.mountain_stream_fog.foe_last'][0].instanceId, 'lcq.enemy.guiwang_warrior#combat.f03.mountain_stream_fog:9');
  assert.equal(store.groups['combat.f03.mountain_stream_fog.foe_pack_1'][0].enemyId, KINDS.guiwang_warrior);
  assert.equal(store.groups['combat.f03.mountain_stream_fog.foe_pack_2'], undefined, '没受伤的个体没有记录');
  // 下一场开战时只还原到受伤的那个个体
  const next = core.beginScene(c).state;
  injuries.restoreSceneInjuries(JSON.parse(JSON.stringify(s)), c, next);
  assert.equal(next.statuses.foe_pack_1[0].id, 'wound.external');
  assert.deepEqual(next.statuses.foe_pack_2 ?? [], [], '没受伤的个体不还原任何状态');
  assert.equal(JSON.stringify(registry.characters.filter(e => e.entityType === 'enemy_kind')), registryBefore);
  assert.equal(resolver.getRegistryBaseStats(KINDS.guiwang_warrior).level, 3, '伤势不改种类的基础属性');
});
test('总表登记的种类即使不在敌人目录里，也走个体路径，不会把伤势写到种类 id 下', () => {
  // 守卫的条件是 isEnemyKindId；目录里的种类由 namedEntity 覆盖，这里用别名 id 验证注册表一侧的判断。
  assert.equal(inst.isEnemyKindId('lcq.enemy.guiwangdong_warrior'), true);
  const src = readFileSync(new URL('../src/modules/sceneModule/host/injuries.ts', import.meta.url), 'utf8');
  assert.match(src, /isEnemyKindId\(party\.ref\)/);
});

test('阶段档文件里的 stats 覆盖项全部合法（现状：没有任何阶段档写 stats，守住以后写的人）', () => {
  const dir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
  let withStats = 0;
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const m = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const c of m.canon?.characters || []) {
      if (c.stats === undefined) continue;
      withStats++;
      assert.deepEqual(merge.validateCharacterStats(c.stats, RULES, `${f}:${c.id}`), []);
    }
  }
  assert.ok(Number.isInteger(withStats));
});
