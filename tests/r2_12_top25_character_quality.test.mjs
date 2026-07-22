import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const cardsUrl = new URL(
  '../mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json',
  import.meta.url,
);
const cards = JSON.parse(await readFile(cardsUrl, 'utf8')).characters;
const byName = new Map(cards.map(card => [card.canonicalName, card]));

function stagePhase(name, stageId) {
  return byName.get(name).phaseIdentities.find(
    phase => phase.scope === 'stage-projection' && phase.stageId === stageId,
  );
}

function relation(notes) {
  return notes?.find(note => note.startsWith('【关系】')) || '';
}

test('R2-12 top-25 pass is idempotently deduplicated and closes only evidenced phase flags', () => {
  for (const name of ['小紫', '卓云君', '阮香琳', '惊理']) {
    const chains = byName.get(name).phaseIdentities.filter(phase => phase.scope === 'relationship-chain');
    assert.equal(chains.length, 2, `${name} must retain one pre/post relationship-chain pair`);
    assert.equal(new Set(chains.map(phase => JSON.stringify(phase))).size, 2);
  }

  const resolved = [
    '安乐公主', '成光', '惊理', '吕雉', '齐羽仙', '阮香琳', '蛇夫人', '孙寿',
    '相雅', '小紫', '杨玉环', '尹馥兰', '罂粟女', '鱼玄机', '云如瑶', '卓云君',
  ];
  for (const name of resolved) {
    const flags = byName.get(name).review.flags;
    assert.ok(flags.includes('relationship-phase-resolved'), `${name} must be marked resolved`);
    assert.ok(!flags.includes('female-relationship-phase-needed'), `${name} must leave the old queue`);
  }

  for (const name of ['泉玉姬', '孙暖']) {
    assert.ok(byName.get(name).review.flags.includes('female-relationship-phase-needed'),
      `${name} stays queued until its transition evidence is pinned`);
  }
});

test('R2-12 pre-transition projections replace final roles and withhold future-only arrays', () => {
  const checks = [
    ['小紫', 'lcq.stage_06', /尚未.*后宫/],
    ['卓云君', 'lcq.stage_07_qingyuan_jiankang', /尚未被擒/],
    ['吕雉', 'lyg.han_succession', /尚未.*从属/],
    ['阮香琳', 'lyl.taiquan_sacred_fruit', /尚未归入.*后宫/],
    ['孙寿', 'lyl.taiquan_afterfall', /尚未被.*收编/],
    ['尹馥兰', 'lyl.taiquan_afterfall', /尚未成为.*姬妾/],
    ['安乐公主', 'lyg.ganlu_aftershock', /尚未被.*收入内宅/],
    ['鱼玄机', 'lyg.ganlu_bian', /尚无从属关系/],
    ['相雅', 'lyl.jiangzhou_retreat', /尚未相识/],
    ['齐羽仙', 'lyg.shixiang_ambush', /合作、戒备或敌对/],
    ['成光', 'lyg.dingtao_beijing', /尚未被.*收编/],
  ];
  for (const [name, stageId, expected] of checks) {
    const phase = stagePhase(name, stageId);
    assert.ok(phase, `${name} must have ${stageId} projection`);
    assert.match(phase.relationToProtagonist.join(''), expected);
    for (const key of ['formsOfAddress', 'goals', 'weaknesses', 'joining', 'keyEvents', 'ending']) {
      assert.deepEqual(phase[key], [], `${name}/${stageId} must withhold future ${key}`);
    }
  }

  assert.equal(stagePhase('卓云君', 'lcq.stage_07_qingyuan_jiankang').role, '太乙真宗教御');
  assert.equal(stagePhase('吕雉', 'lyg.han_succession').role, '汉国太后与吕氏权力核心');
  assert.equal(stagePhase('孙寿', 'lyl.taiquan_afterfall').identity, '襄城君、吕冀之妻');
  assert.equal(stagePhase('成光', 'lyg.dingtao_beijing').role, '吕氏案阶下囚');
  assert.deepEqual(stagePhase('吕雉', 'lyg.han_succession').personality,
    ['冷静', '威严', '隐忍但不卑微', '善于权谋']);
  assert.doesNotMatch(stagePhase('孙寿', 'lyl.taiquan_afterfall').appearance, /银环|银铃/);
  assert.doesNotMatch(stagePhase('尹馥兰', 'lyl.taiquan_afterfall').personality.join(''), /臣服|淫荡/);
  assert.doesNotMatch(stagePhase('成光', 'lyg.dingtao_beijing').appearance, /银铃|阴阜/);

  for (const phase of byName.get('杨玉环').phaseIdentities.filter(item => item.scope === 'stage-projection')) {
    assert.equal(phase.identity, '太真公主、镇国大长公主');
    assert.match(phase.relationToProtagonist.join(''), /尚未确立后宫关系/);
    assert.doesNotMatch(JSON.stringify(phase), /程宗扬的伴侣|究极尤物/);
  }
});

test('R2-12 runtime selects the opening side of each known boundary and keeps later projections intact', async () => {
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const resolve = (name, stageId) => {
    const actor = { name, profile: {} };
    assert.equal(resolveScenarioCharacters([actor], stageId), 1);
    return actor;
  };

  assert.match(relation(resolve('小紫', 'lcq.stage_06').profile.notes), /尚未.*后宫/);
  assert.match(relation(resolve('小紫', 'lcq.stage_07_qingyuan_jiankang').profile.notes), /后宫之首/);
  assert.match(relation(resolve('卓云君', 'lcq.stage_07_qingyuan_jiankang').profile.notes), /尚未被擒/);
  assert.match(relation(resolve('卓云君', 'lcq.stage_08_jiankang_coup').profile.notes), /后宫/);
  assert.match(relation(resolve('吕雉', 'lyg.han_succession').profile.notes), /尚未.*从属/);
  assert.match(relation(resolve('吕雉', 'lyg.changgan_begins').profile.notes), /奴婢/);
  assert.match(relation(resolve('阮香琳', 'lyl.taiquan_sacred_fruit').profile.notes), /尚未归入/);
  assert.match(relation(resolve('阮香琳', 'lyl.taiquan_afterfall').profile.notes), /后宫/);
  assert.match(relation(resolve('孙寿', 'lyl.taiquan_afterfall').profile.notes), /尚未被.*收编/);
  assert.match(relation(resolve('孙寿', 'lyl.luoyang_cloud_secret').profile.notes), /妾室/);
  assert.match(relation(resolve('安乐公主', 'lyg.ganlu_aftershock').profile.notes), /尚未被.*收入内宅/);
  assert.match(relation(resolve('安乐公主', 'lyg.shituolin_endgame').profile.notes), /情妇/);
  assert.match(relation(resolve('成光', 'lyg.dingtao_beijing').profile.notes), /尚未被.*收编/);
  assert.match(relation(resolve('成光', 'lyg.changgan_begins').profile.notes), /性奴/);

  const preLv = resolve('吕雉', 'lyg.han_succession');
  assert.deepEqual(preLv.profile.personality, ['冷静', '威严', '隐忍但不卑微', '善于权谋']);
  assert.doesNotMatch(preLv.profile.notes.join('\n'), /自称奴婢|柔媚、卑微/);
  const preSun = resolve('孙寿', 'lyl.taiquan_afterfall');
  assert.doesNotMatch(preSun.profile.appearance, /银环|银铃/);
  assert.doesNotMatch(preSun.profile.notes.join('\n'), /完全服从主人|老公/);
  const preCheng = resolve('成光', 'lyg.dingtao_beijing');
  assert.doesNotMatch(preCheng.profile.appearance, /银铃|阴阜/);
  assert.doesNotMatch(preCheng.profile.notes.join('\n'), /魂丹|讨好语气/);
});
