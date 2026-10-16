// 尸鬼 lcq.enemy.altar_corpse 与男尸鬼 lcq.enemy.male_corpse 是同一种类（用户 2026-10-16 裁定）：合并，旧 id 作别名保留。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load, makeSave, mods } from './freeActionFixture.mjs';

const KEEP = 'lcq.enemy.altar_corpse', OLD = 'lcq.enemy.male_corpse';
const json = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const resolver = await load('../src/modules/scenarioMods/characterResolver.ts');
const stats = await load('../src/modules/scenarioMods/characterStats.ts');
const instances = await load('../src/modules/scenarioMods/actorInstances.ts');

test('总表只有一条尸鬼，旧 id 与旧名作别名；敌人目录里不再有独立的男尸鬼条目', () => {
  const registry = json('src/modules/scenarioMods/builtins/character-registry.json').characters;
  assert.equal(registry.filter(c => c.id === OLD).length, 0);
  const kept = registry.filter(c => c.id === KEEP);
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0].idAliases, [OLD]);
  assert.ok(kept[0].aliases.includes('男尸鬼'));
  const enemies = json('mod-kit/entity-catalog/enemies.json').entries;
  assert.equal(enemies.some(e => e.id === OLD), false);
  const entry = enemies.find(e => e.id === KEEP);
  assert.ok(entry.aliases.includes('男尸鬼') && entry.migratedFrom.includes(OLD));
});

test('旧 id 仍能解析到同一种类：总表规范 id、敌人种类判定、时点级数行、基础战斗强度', () => {
  assert.equal(resolver.getRegistryCanonicalId(OLD), KEEP);
  assert.equal(instances.isEnemyKindId(OLD), true);
  assert.equal(instances.isEnemyKindId(KEEP), true);
  const a = mods.levels.levelFact(OLD, 102), b = mods.levels.levelFact(KEEP, 102);
  assert.ok(a && a === b || JSON.stringify(a) === JSON.stringify(b));
  assert.equal(b.entityId, KEEP);
  assert.equal(mods.levels.effectiveLevel(b), 3);
  assert.equal(mods.levels.levelFact(OLD, 50), undefined, '章段没变：只在第102–103章有行');
  const runtime = { canon: { characters: [] } };
  for (const id of [OLD, KEEP]) {
    const merged = stats.resolveActorStats(runtime, id).stats;
    assert.equal(merged.level, null, '尸鬼不适用九级：level 保持 null，不是 0');
    assert.equal(merged.combatStrength, 3);
    assert.equal(stats.combatLevelOf(merged), 3, '战斗读 combatStrength ?? level');
  }
});

test('自由行动写状态对种类 id（含旧 id）一律拒绝：伤势只写个体实例', () => {
  const save = makeSave();
  for (const id of [OLD, KEEP]) {
    const r = mods.actorStatus.applyActorStatus(save, id, 'wound.severe');
    assert.deepEqual([r.ok, r.reason], [false, 'enemy_kind']);
  }
});
