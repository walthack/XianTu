import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const registry = () => json('src/modules/scenarioMods/builtins/character-registry.json');
const ledger = () => json('mod-kit/entity-ledger/overrides.json');
const gates = () => json('mod-kit/entity-ledger/card-time-gates.json');
const stageProjection = (entry, stageId) => (entry.phaseIdentities || []).find(p => p.scope === 'stage-projection' && p.stageId === stageId);
const resolveOne = async (character, stageId) => {
  const {resolveScenarioCharacters} = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  resolveScenarioCharacters([character], stageId);
  return character;
};

/** 逐关逐人：总表该关相位 + 阶段档，排除运行时时点闸（不物化）与账本展示接管者（小紫／殇侯／乐明珠）。 */
async function projectedPairs() {
  const [{characters}, {stages}, {identityDisplays, masterPrecedence}] = await Promise.all([registry(), gates(), ledger()]);
  const pairs = [];
  for (const entry of characters) for (const phase of entry.phaseIdentities || []) {
    if (phase.scope !== 'stage-projection') continue;
    if (stages[phase.stageId]?.at.includes('runtime') && stages[phase.stageId].exclude.includes(entry.id)) continue;
    if (identityDisplays[entry.id] || masterPrecedence.pendingIds.includes(entry.id) || phase.identityWithheld) continue;
    pairs.push({entry, phase});
  }
  return pairs;
}

test('master precedence: a stale stage-file description/origin is overwritten by the master stage-projection phase, for every person and stage', async () => {
  const pairs = (await projectedPairs()).filter(({phase}) => phase.description && phase.identity);
  assert.ok(pairs.length > 800, `expected the batch to cover the whole table, got ${pairs.length}`);
  for (const {entry, phase} of pairs) {
    const c = await resolveOne({id: entry.id, name: entry.canonicalName, description: 'STALE-STAGE-TEXT', role: 'stale', profile: {origin: 'STALE-STAGE-TEXT'}}, phase.stageId);
    assert.equal(c.description, phase.description, `${entry.canonicalName}@${phase.stageId} description`);
    assert.equal(c.profile.origin, phase.identity, `${entry.canonicalName}@${phase.stageId} origin`);
  }
});

test('master precedence: where the master gives no description, the stage-file text stays as the gap fallback (nothing invented)', async () => {
  const gaps = (await projectedPairs()).filter(({phase}) => !phase.description);
  assert.ok(gaps.length > 100);
  for (const {entry, phase} of gaps) {
    const c = await resolveOne({id: entry.id, name: entry.canonicalName, description: 'KEEP-STAGE-TEXT', profile: {}}, phase.stageId);
    assert.equal(c.description, 'KEEP-STAGE-TEXT', `${entry.canonicalName}@${phase.stageId}`);
  }
});

test('master precedence: no phase, no override — stage text of a person without a stage-projection stays as it is', async () => {
  const [{characters}] = [await registry()];
  const entry = characters.find(e => e.phaseIdentities?.some(p => p.scope === 'stage-projection') && e.staticProfile?.identitySummary);
  const c = await resolveOne({id: entry.id, name: entry.canonicalName, description: 'KEEP-STAGE-TEXT', profile: {origin: 'KEEP-STAGE-ORIGIN'}}, 'lcq.stage_does_not_exist');
  assert.equal(c.description, 'KEEP-STAGE-TEXT');
  assert.equal(c.profile.origin, 'KEEP-STAGE-ORIGIN');
});

test('master precedence: 殇侯 is decided (2026-10-15 round 3) — no longer pending, master wins like everyone else, nanhuang role is 云氏雇用的老向导 in master and ledger', async () => {
  const {masterPrecedence, identityDisplays} = await ledger();
  assert.deepEqual(masterPrecedence.pendingIds, []);
  const entry = (await registry()).characters.find(e => e.id === 'liuchao.character.shang_zhen_yu');
  const phase = entry.phaseIdentities.find(p => p.scope === 'stage-projection' && p.stageId === 'lcq.stage_07_qingyuan_jiankang');
  assert.ok(phase.description && phase.identity);
  const c = await resolveOne({id: entry.id, name: entry.canonicalName, description: 'STALE-STAGE-TEXT', profile: {origin: 'STALE-STAGE-TEXT'}}, phase.stageId);
  assert.equal(c.description, phase.description);
  assert.equal(c.profile.origin, phase.identity);
  // 南荒五关的总表 role 与账本 hidden.role 同为「云氏雇用的老向导」（原总表是「老向导」，已裁定改）
  const nanhuang = entry.phaseIdentities.filter(p => p.scope === 'stage-projection' && p.stageId.startsWith('lcq.stage_0') && p.identity.startsWith('云氏雇用的老向导'));
  assert.deepEqual(nanhuang.map(p => p.stageId).sort(), ['lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b', 'lcq.stage_06']);
  for (const p of nanhuang) assert.equal(p.role, '云氏雇用的老向导', p.stageId);
  assert.equal(identityDisplays[entry.id].hidden.role, '云氏雇用的老向导');
});

test('master table: every stage-file character id resolves to a master entry (id or idAlias); no person has two master entries', async () => {
  const {characters} = await registry();
  const ids = new Set(characters.flatMap(e => [e.id, ...(e.idAliases || [])]));
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const missing = new Set();
  for (const file of (await readdir(new URL(dir, root))).filter(f => f.endsWith('.json'))) {
    for (const c of (await json(dir + file)).canon.characters || []) if (!ids.has(c.id)) missing.add(`${c.id} ${c.name}`);
  }
  assert.deepEqual([...missing], []);
  const names = characters.map(e => e.canonicalName);
  assert.equal(new Set(names).size, names.length, 'canonicalName must be unique in the master table');
});

test('master table: the 8 stage-only people are master entries with their existing ids; only the approved description is filled, nothing else invented', async () => {
  const {characters} = await registry();
  const expected = {
    阿葭: 'lcq.character.nanhuang_ajia', 叶媪: 'lcq.character.nanhuang_yeao', 白夷族长: 'lcq.character.nanhuang_baiyi_chief',
    易勇: 'lcq.character.nanhuang_yiyong', 小津: 'lcq.character.nanhuang_xiaojin', 易雄: 'lcq.character.nanhuang_yixiong',
    六朝石匠: 'lcq.character.nanhuang_stonemason', 黑衣丽人: 'lcq.character.nanhuang_blacksea_envoy',
  };
  for (const [name, id] of Object.entries(expected)) {
    const e = characters.find(x => x.id === id);
    assert.equal(e?.canonicalName, name);
    assert.notEqual(e.staticProfile.identitySummary, '', '用户 2026-10-15 01:11 已批准描述（逐字内容见 masterTableIdentityChain.test.mjs）');
    assert.equal(e.staticProfile.appearance, '');
    assert.deepEqual(e.staticProfile.personality, []);
    for (const p of e.phaseIdentities) {
      assert.equal(p.scope, 'stage-projection');
      assert.equal(p.description, e.staticProfile.identitySummary);
      assert.ok(!p.identity && !p.role, "用户只给了描述，身份与 role 留空");
    }
    assert.ok(!e.review.flags.includes('master-description-pending'));
  }
  // 另四人总表早有条目：阶段档统一用总表 id，少数派旧 id 只作 idAliases（第三轮），不另建重复条目
  const aliasOf = {'lyg.character.np011': '张恽', 'lyl.character.he_yilian': '何漪莲', 'lyl.character.np016': '王蕙', 'liuchao.character.ning_cheng': '宁成'};
  const dir = 'src/modules/scenarioMods/builtins/data/';
  for (const [alias, name] of Object.entries(aliasOf)) {
    const e = characters.find(x => x.canonicalName === name);
    assert.ok(e.idAliases.includes(alias), `${alias} should be an idAlias of ${name}`);
    assert.equal(characters.filter(x => x.id === alias).length, 0);
    assert.ok(!e.idAliases.includes(e.id), 'master id is never its own alias');
    for (const file of (await readdir(new URL(dir, root))).filter(f => f.endsWith('.json'))) {
      for (const c of (await json(dir + file)).canon.characters || []) {
        if (c.name === name) assert.equal(c.id, e.id, `${file}: ${name} must use the master id, not ${alias}`);
        assert.notEqual(c.id, alias, `${file} still uses the old id ${alias}`);
      }
    }
  }
  // 旧 id 仍按 id 即可物化（名字故意对不上，只能靠 id 命中）——存档里的旧 id 继续解析
  const c = await resolveOne({id: 'lyg.character.np011', name: 'ZZ-no-such-name', profile: {}}, 'lyg.mijing_rumen');
  assert.ok(c.profile.personality.length > 0);
});
