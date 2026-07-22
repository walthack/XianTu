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
  assert.match(relation(resolve('云丹琉', 'lyl.luoyang_coup')), /后宫/);

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
