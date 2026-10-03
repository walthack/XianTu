import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const cardsUrl = new URL(
  '../mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json',
  import.meta.url,
);
const bridgeUrl = new URL(
  '../mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.lin_an_bridge.json',
  import.meta.url,
);
const builtinEarlyUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json',
  import.meta.url,
);

function relation(notes) {
  return notes?.find(note => note.startsWith('【关系】')) || '';
}

test('R2-12 phase audit resolves the eleven-item queue without stale stage projections', async () => {
  const cards = JSON.parse(await readFile(cardsUrl, 'utf8')).characters;
  const byName = new Map(cards.map(card => [card.canonicalName, card]));
  const audited = ['阿夕', '何漪莲', '黄氏', '刘娥', '潘金莲', '萧氏', '雁儿', '虞白樱', '云丹琉', '赵合德', '阮香凝'];

  for (const name of audited) {
    const card = byName.get(name);
    assert.ok(card, `${name} must resolve to a canonical card`);
    assert.ok(card.review.flags.includes('relationship-phase-resolved'), `${name} must be marked resolved`);
    assert.ok(!card.review.flags.includes('female-relationship-phase-needed'), `${name} must leave the old queue`);
  }

  for (const name of ['黄氏', '刘娥']) {
    assert.ok(!byName.get(name).phaseIdentities.some(
      phase => phase.scope === 'stage-projection' && phase.stageId === 'lyl.taiquan_expedition',
    ), `${name} stale projection must be removed from the rebuilt Lin'an stage`);
  }

  const ruan = byName.get('阮香凝');
  assert.ok(ruan.aliases.includes('林娘子'), '林娘子 remains an alias of 阮香凝 instead of a duplicate card');

  const bridge = JSON.parse(await readFile(bridgeUrl, 'utf8'));
  const earlyRuan = bridge.canon.characters.find(actor => actor.id === 'liuchao.character.ruan_xiang_ning');
  assert.equal(earlyRuan.name, '林娘子');
  assert.equal(earlyRuan.role, '林冲之妻（开场真实来历尚未揭示）');
  assert.deepEqual(Object.keys(earlyRuan).sort(), ['affiliations', 'description', 'gender', 'id', 'name', 'profile', 'role']);
  assert.doesNotMatch(JSON.stringify(earlyRuan), /阮香凝|凝玉姬|黑魔海|侍妾|后宫/);
  assert.ok(!bridge.canon.playerRelationships.some(
    item => item.characterId === 'liuchao.character.ruan_xiang_ning',
  ), 'unrevealed 林娘子 must not have a player relationship');
  assert.ok(!bridge.canon.relationships.some(
    item => item.fromCharacterId === 'liuchao.character.ruan_xiang_ning'
      || item.toCharacterId === 'liuchao.character.ruan_xiang_ning',
  ), 'unrevealed 林娘子 must not have relationship edges');

  for (const name of ['云丹琉', '赵合德']) {
    assert.ok(byName.get(name).phaseIdentities.some(
      phase => phase.scope === 'stage-projection' && phase.stageId === 'lyl.taiquan_core_conflict',
    ), `${name} must cover the stage between sacred-fruit and afterfall`);
  }

  for (const stageId of [
    'lyl.lin_an_bridge', 'lyl.xiaoyingzhou_blacksea_trap',
    'lyl.taiquan_sacred_fruit', 'lyl.taiquan_core_conflict',
    'lyl.taiquan_afterfall', 'lyl.luoyang_cloud_secret', 'lyl.luoyang_coup',
  ]) {
    const stage = JSON.parse(await readFile(new URL(
      `../mod-kit/generated/deepseek-v4-flash/yunlong/stages/${stageId}.json`,
      import.meta.url,
    ), 'utf8'));
    const zhao = stage.canon.characters.find(item => item.id === 'liuchao.character.zhao_he_de');
    if (!zhao) continue;
    assert.ok(!(zhao.affiliations || []).some(
      affiliation => affiliation.factionId === 'liuchao.faction.x2d33e1eaf9',
    ), `${stageId} must not pre-project Zhao Hede as protagonist household`);
  }

  const earlyBuiltin = JSON.parse(await readFile(builtinEarlyUrl, 'utf8'));
  for (const name of ['苏荔', '阿夕']) {
    const actor = earlyBuiltin.canon.characters.find(item => item.name === name);
    assert.ok(actor, `${name} must exist in early builtin`);
    assert.ok(!(actor.profile?.notes || []).some(
      note => note.startsWith('【性癖】') || note.startsWith('【身体】'),
    ), `${name} future adult extraction notes must be gated from the early stage`);
  }
});

test('R2-12 runtime materialization uses stage-opening relations and withholds future branches', async () => {
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const resolve = (name, stageId) => {
    const actor = { name, profile: {} };
    assert.equal(resolveScenarioCharacters([actor], stageId), 1);
    return actor.profile.notes;
  };

  const cloudYun = resolve('云丹琉', 'lyl.luoyang_cloud_secret');
  assert.match(relation(cloudYun), /尚未.*后宫/);
  assert.ok(!cloudYun.some(note => note.includes('唯一以掠夺者姿态')));
  assert.ok(!cloudYun.some(note => note.includes('欲醉起')));
  assert.match(relation(resolve('云丹琉', 'lyl.taiquan_core_conflict')), /尚未.*后宫/);
  assert.match(relation(resolve('云丹琉', 'lyl.luoyang_coup')), /后宫/);

  assert.match(relation(resolve('赵合德', 'lyl.taiquan_core_conflict')), /尚未.*妾室/);
  assert.match(relation(resolve('赵合德', 'lyl.luoyang_coup')), /尚未.*妾室/);
  assert.match(relation(resolve('赵合德', 'lyl.han_palace_endgame')), /妾室\/情人/);

  assert.match(relation(resolve('潘金莲', 'lyg.changgan_interlude')), /尚未归入/);
  assert.match(relation(resolve('潘金莲', 'lyg.ganlu_bian')), /后宫/);

  assert.match(relation(resolve('雁儿', 'lcq.stage_12_jiangzhou_counterwar')), /开场仍为侍女/);
  const gatedRuan = { id: 'liuchao.character.ruan_xiang_ning', name: '林娘子', profile: {} };
  assert.equal(resolveScenarioCharacters([gatedRuan], 'lyl.lin_an_bridge'), 0);
  assert.deepEqual(gatedRuan.profile, {}, 'early 林娘子 must bypass global registry materialization');
  assert.equal(resolveScenarioCharacters([gatedRuan], 'lyl.xiaoyingzhou_blacksea_trap'), 0);
  assert.match(relation(resolve('阮香凝', 'lyl.taiquan_sacred_fruit')), /后宫/);
});

// 角色卡提前泄露修复（2026-10-02）：走向类字段（关系/入伙/情节/结局）的静态卡值是全书终点快照，
// 只在本关 phase 覆盖、或角色声明了转折且本关有投影时才可用；否则不回落静态卡。
test('static trajectory fields are not injected into stages before a declared turning point', async () => {
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const notesOf = (name, stageId) => {
    const actor = { name, profile: {} };
    assert.equal(resolveScenarioCharacters([actor], stageId), 1);
    return actor.profile.notes || [];
  };
  const trajectory = notes => notes.filter(note => /^【(关系|入伙|情节|结局)】/.test(note));
  // 无转折声明的角色：静态终态不得进早期关卡。
  for (const [name, stageId] of [['凝羽', 'lcq.stage_01'], ['凝羽', 'lcq.stage_02'], ['月霜', 'lcq.stage_01'],
    ['碧姬', 'lcq.stage_04b_lingfei_baiyi_crisis'], ['乐明珠', 'lcq.stage_04b_lingfei_baiyi_crisis']]) {
    assert.deepEqual(trajectory(notesOf(name, stageId)), [], `${name}@${stageId}`);
  }
  // 有转折声明、但本关没有投影：同样不回落（卓云君第2关夹在两个"尚未被擒"覆盖之间）。
  // （【阶段身份】里的“转折前禁止提前称为后宫”是约束规则，不算泄露，故只看走向字段。）
  assert.deepEqual(trajectory(notesOf('卓云君', 'lcq.stage_02')), []);
  // 本关有覆盖的照常注入本关值。
  assert.match(relation(notesOf('小紫', 'lcq.stage_04b_lingfei_baiyi_crisis')), /尚未.*后宫/);
});

test('character RAG injects only the current stage projection identity/relation, never the static endpoint', async () => {
  const { characterRagService } = await loadTs('../src/services/characterRagService.ts');
  const registry = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url), 'utf8'));
  const picked = ['小紫', '卓云君', '凝羽'].map(name => registry.characters.find(entry => entry.canonicalName === name));
  const original = { isEnabled: characterRagService.isEnabled, db: characterRagService.db, search: characterRagService.search };
  try {
    characterRagService.isEnabled = () => true;
    characterRagService.db = {};
    characterRagService.search = async () => picked.map((entry, index) => ({ id: entry.id, canonicalName: entry.canonicalName, score: 0.9 - index / 100 }));
    const early = await characterRagService.buildSectionForPrompt('q', { stageId: 'lcq.stage_02' });
    assert.ok(!/后宫|正宫|侍婢|肉体伴侣|岳帅与碧鲮族碧姬之女|殇候解除/.test(early), early);
    const projected = await characterRagService.buildSectionForPrompt('q', { stageId: 'lcq.stage_04b_lingfei_baiyi_crisis' });
    assert.match(projected, /与主角关系：同行伙伴；本关开场尚未与程宗扬确立后宫或正宫关系/);
    assert.ok(!/后宫正宫|后宫之首/.test(projected), projected);
    const noStage = await characterRagService.buildSectionForPrompt('q');
    assert.ok(!/与主角关系：/.test(noStage), '无关卡上下文时不注入任何关系');
  } finally {
    Object.assign(characterRagService, original);
  }
});
