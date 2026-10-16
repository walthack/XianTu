import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const registry = async () => (await json('src/modules/scenarioMods/builtins/character-registry.json')).characters;
const byName = async name => (await registry()).find(e => e.canonicalName === name);
const resolveIn = async (entry, stageId, seed = {}) => {
  const {resolveScenarioCharacters} = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const c = {id: entry.id, name: entry.canonicalName, profile: {}, ...seed};
  resolveScenarioCharacters([c], stageId);
  return c;
};

// 用户 2026-10-15 01:11 批准，逐字，不含章号。
const APPROVED = {
  阿葭: '花苗族的少女，龙神新娘的伴娘', 叶媪: '南荒山村里养蛊的老妇', 白夷族长: '白夷族的族长', 易勇: '云氏商会的护卫',
  小津: '碧鲮族女子，祁远的救命恩人', 易雄: '云氏商会的护卫', 六朝石匠: '在峒口刻柱的六朝石匠', 黑衣丽人: '黑魔海来的女子',
};
// 用户 2026-10-15 第三轮：这 4 人的总表概括还原为改前的原值（取自备份，不是新写的）。
const RESTORED = {宁成: '帝党干将、知名酷吏、曾任大司农', 张恽: '内侍/中黄门', 何漪莲: '洛帮帮主', 王蕙: '秦桧之妻'};

test('master table: the 8 approved descriptions are stored verbatim (no chapter numbers); the 4 pre-existing people keep their original richer summaries', async () => {
  for (const [name, text] of Object.entries({...APPROVED, ...RESTORED})) {
    const entry = await byName(name);
    assert.ok(entry, `${name} must be a master entry`);
    assert.equal(entry.staticProfile.identitySummary, text, name);
    assert.doesNotMatch(text, /第\d+章/);
    assert.ok(!(entry.review?.flags || []).includes('master-description-pending') || !entry.staticProfile.identitySummary, `${name} no longer pending`);
  }
});

test('master table: the 8 stage-only people get the verbatim description in every stage they appear in (master wins over the stage label)', async () => {
  const eight = ['阿葭', '叶媪', '白夷族长', '易勇', '小津', '易雄', '六朝石匠', '黑衣丽人'];
  for (const name of eight) {
    const entry = await byName(name);
    const phases = entry.phaseIdentities.filter(p => p.scope === 'stage-projection');
    assert.ok(phases.length >= 1, `${name} needs at least one stage-projection phase`);
    for (const phase of phases) {
      const c = await resolveIn(entry, phase.stageId, {description: 'OLD-STAGE-LABEL', role: '旧标签', profile: {origin: '旧标签'}});
      assert.equal(c.description, APPROVED[name], `${name}@${phase.stageId}`);
      assert.equal(c.profile.origin, '旧标签', `${name} gave no identity, so the stage origin stays (nothing invented)`);
    }
  }
  // 阶段档里这 8 人出现的每一关都已有相位（没有漏关）。
  const man = await json('src/modules/scenarioMods/builtins/manifest.json');
  for (const stageId of man.ids) {
    const mod = await json(`src/modules/scenarioMods/builtins/data/${stageId}.json`);
    for (const c of mod.canon.characters) {
      const entry = (await registry()).find(e => e.id === c.id);
      if (entry && eight.includes(entry.canonicalName)) assert.ok(entry.phaseIdentities.some(p => p.stageId === stageId), `${entry.canonicalName}@${stageId}`);
    }
  }
});

test('identity chain 宁成: 总表概括 (static) → 舞都太守 from lyl.luoyang_coup → 逃犯 from lyg.dingtao_beijing', async () => {
  const entry = await byName('宁成');
  const stages = (await json('src/modules/scenarioMods/builtins/manifest.json')).ids;
  for (const id of ['lyl.luoyang_coup', 'lyg.dingtao_beijing']) assert.ok(stages.includes(id), `${id} is a real stage`);
  assert.ok(stages.indexOf('lyl.luoyang_coup') < stages.indexOf('lyg.dingtao_beijing'));
  // 第 1 步：没有本关相位的关，退回总表静态描述。
  const before = await resolveIn(entry, 'lyl.taiquan_expedition');
  assert.equal(before.profile.origin, RESTORED.宁成);
  // 第 2 步：lyl.luoyang_coup 起是舞都太守。
  const coup = await resolveIn(entry, 'lyl.luoyang_coup', {profile: {origin: 'STALE'}, role: 'stale'});
  assert.equal(coup.profile.origin, '舞都太守');
  assert.equal(coup.role, '舞都太守');
  // 第 3 步：lyg.dingtao_beijing 起是逃犯。
  const run = await resolveIn(entry, 'lyg.dingtao_beijing', {profile: {origin: 'STALE'}, role: 'stale'});
  assert.equal(run.profile.origin, '逃犯');
  assert.equal(run.role, '逃犯');
  // 切换数据都在总表相位里，解析器没有人物专属代码。
  const src = await readFile(new URL('src/modules/scenarioMods/characterResolver.ts', root), 'utf8');
  assert.doesNotMatch(src, /宁成|张恽|何漪莲|ning_cheng|zhang_yun|he_yilian/);
});

test('identity chain 张恽: 总表概括 (static) → 程侯府内侍 from lyl.luoyang_coup, and stays so in lyg.dingtao_beijing／lyg.mijing_rumen', async () => {
  const entry = await byName('张恽');
  const early = await resolveIn(entry, 'lyl.taiquan_expedition');
  assert.equal(early.profile.origin, RESTORED.张恽);
  for (const stageId of ['lyl.luoyang_coup', 'lyg.dingtao_beijing', 'lyg.mijing_rumen']) {
    const c = await resolveIn(entry, stageId, {profile: {origin: 'STALE'}});
    assert.equal(c.profile.origin, '程侯府内侍', stageId);
  }
  const switchStages = entry.phaseIdentities.filter(p => p.scope === 'stage-projection').map(p => p.stageId).sort();
  assert.deepEqual(switchStages, ['lyg.dingtao_beijing', 'lyg.mijing_rumen', 'lyl.luoyang_coup']);
});

test('identity chain 何漪莲: 洛帮帮主 holds in every stage-projection from lyl.taiquan_core_conflict on', async () => {
  const entry = await byName('何漪莲');
  assert.equal(entry.staticProfile.identitySummary, RESTORED.何漪莲);
  const all = entry.phaseIdentities.filter(p => p.scope === 'stage-projection');
  const switchPoint = all.find(p => p.stageId === 'lyl.taiquan_core_conflict');
  assert.ok(switchPoint, 'lyl.taiquan_core_conflict is a real stage with a phase for 何漪莲');
  // 关的先后以总表相位的原著序号（seqLo）为准，manifest 里的排列不是剧情顺序。
  const phases = all.filter(p => p.seqLo >= switchPoint.seqLo);
  assert.ok(phases.length >= 4);
  for (const p of phases) assert.equal(p.identity, '洛帮帮主', p.stageId);
  for (const p of phases) assert.ok(!p.identityWithheld, p.stageId);
});

test('identity withheld 何漪莲: the three stages before lyl.taiquan_core_conflict do not disclose 洛帮帮主 anywhere (empty gap, nothing invented)', async () => {
  const entry = await byName('何漪莲');
  const all = entry.phaseIdentities.filter(p => p.scope === 'stage-projection');
  const switchPoint = all.find(p => p.stageId === 'lyl.taiquan_core_conflict');
  const early = ['lyl.lin_an_bridge', 'lyl.xiaoyingzhou_blacksea_trap', 'lyl.taiquan_sacred_fruit'];
  // 这三关都在核心冲突之前（总表原著序号），且正是数据里被标记为不披露的全部相位。
  assert.deepEqual(all.filter(p => p.identityWithheld).map(p => p.stageId).sort(), [...early].sort());
  for (const sid of early) assert.ok(all.find(p => p.stageId === sid).seqHi < switchPoint.seqLo, sid);
  // 披露文本取自核心冲突相位本身（数据），不在测试里另写关键词。
  const disclosed = [switchPoint.identity, switchPoint.role, entry.staticProfile.identitySummary];
  for (const sid of early) {
    const phase = all.find(p => p.stageId === sid);
    assert.deepEqual([phase.identity, phase.role, phase.description], ['', '', ''], '无现成非剧透文本，留空为缺口');
    // 阶段档带着旧文字也一样被清空，且总表概括不得回落进来
    const affiliations = [{factionId: 'liuchao.faction.x3521715ccf', category: 'organization', role: '帮主'}, {factionId: 'liuchao.faction.x2d33e1eaf9', category: 'organization', role: '侍奴/从侍奴'}];
    const c = await resolveIn(entry, sid, {role: '洛帮帮主', description: '一帮之主，旧阶段档文字', profile: {origin: '洛帮帮主', notes: []}, affiliations, factionId: affiliations[0].factionId});
    assert.equal(c.role, '');
    assert.equal(c.description, '');
    assert.equal(c.profile.origin, '');
    // 势力归属同样不披露：阶段档带着 affiliations／factionId 也被清掉
    assert.equal(c.affiliations, undefined, `${sid} hides affiliations`);
    assert.equal(c.factionId, undefined, `${sid} hides factionId`);
    const blob = JSON.stringify([c.role, c.description, c.profile.origin, c.profile.notes]);
    for (const text of disclosed) assert.ok(!blob.includes(text), `${sid} leaks "${text}"`);
    assert.ok(!c.profile.notes.some(n => /^【(?:阶段身份|关系身份门禁)】/.test(n)), `${sid} carries no identity notes`);
  }
  // 核心冲突起照常披露
  const keep = [{factionId: 'liuchao.faction.x3521715ccf', category: 'organization', role: '帮主'}];
  const open = await resolveIn(entry, 'lyl.taiquan_core_conflict', {profile: {}, affiliations: keep});
  assert.deepEqual(open.affiliations, keep, '核心冲突起归属照常保留');
  assert.equal(open.role, '洛帮帮主');
  assert.equal(open.profile.origin, '洛帮帮主');
  // 机制是通用的相位数据开关，解析器里没有人物专属代码
  const src = await readFile(new URL('src/modules/scenarioMods/characterResolver.ts', root), 'utf8');
  assert.match(src, /identityWithheld/);
});
