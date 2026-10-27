import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// 凝羽的自称与语气（用户 2026-10-28 01:18 定，策划稿《九阳得功时点与凝羽自称》②）。
// 原著里「凝羽姐姐 / 凝姐姐」是乐明珠对她的称呼（qyj:7979、11208），凝羽本人从不这样自称；
// 仓库原写「外人前是威严冷艳的"凝羽姐姐"」，被模型读成了她的自称或对外头衔。
// 「称呼主角」一条用户要求按好感分档，待策划方案，本次不加；「直呼其名」原著无据，删去。

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const VOICE = ['【凝羽·自称】', '【凝羽·他人如何称呼她】', '【凝羽·语气】', '【凝羽·对外形象】'];

test('立场卡：四条声音约束都在（每档都注入），「称呼主角」一条暂不加，旧写法不再出现', async () => {
  const { formatRelationStance } = await loadTs('../src/modules/scenarioMods/relationStance.ts');
  for (const favorability of [0, 40, 85]) {
    const stance = formatRelationStance('凝羽', { favorability });
    for (const label of VOICE) assert.ok(stance.includes(label), `${favorability}：${label}`);
    assert.ok(!stance.includes('【凝羽·称呼主角】'), '称呼主角待按好感分档');
    assert.doesNotMatch(stance, /威严冷艳|直呼其名/);
    assert.match(stance, /禁止自称「凝羽」「凝羽姐姐」「姐姐」「本姑娘」「人家」/);
    assert.match(stance, /「凝羽姐姐 \/ 凝姐姐」只能出自乐明珠之口/);
  }
});

test('亲密档案：外人前写侍卫长的冷面，不写成「凝羽姐姐」；删去「直呼其名」', async () => {
  const { formatIntimacyProfile } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const text = formatIntimacyProfile('凝羽', { sceneText: '他俯身亲吻她', favor: 100 });
  assert.ok(text.includes('外人前是冷面寡言的白湖商馆侍卫长'));
  assert.doesNotMatch(text, /凝羽姐姐|威严冷艳|直呼其名/);
});

test('角色总表：凝羽卡里「凝羽姐姐」只作乐明珠的叫法，不再有「直呼其名」「威严冷艳」；源卡补丁与总表一致', () => {
  const registry = JSON.parse(read('src/modules/scenarioMods/builtins/character-registry.json'));
  const card = registry.characters.find(entry => entry.canonicalName === '凝羽');
  const all = JSON.stringify(card);
  assert.doesNotMatch(all, /直呼其名|直接称呼名字|威严冷艳/);
  for (const at of [...all.matchAll(/凝羽姐姐/g)].map(match => match.index)) {
    assert.match(all.slice(Math.max(0, at - 12), at), /被乐明珠称为/, '凝羽姐姐只能出自乐明珠之口');
  }
  assert.ok(card.staticProfile.relationToProtagonist[0].includes('外人前是冷面寡言的白湖商馆侍卫长'));
  assert.ok(card.phaseIdentities.filter(phase => (phase.notes || []).some(note => note.startsWith('【关系】'))).every(phase => phase.notes[0].includes('外人前是冷面寡言的白湖商馆侍卫长')));

  // ignored 源卡在本仓库外：补丁记录 from/to，to 已落进总表、from 已不在总表。
  const patch = JSON.parse(read('docs/handoffs/2026-10-28/NINGYU-VOICE-SOURCE-CARD-PATCH.json'));
  const ops = patch.characters.find(entry => entry.canonicalName === '凝羽').ops;
  assert.equal(ops.length, 2);
  for (const op of ops) {
    assert.ok(all.includes(JSON.stringify(op.to).slice(1, -1)), op.to);
    assert.ok(!all.includes(JSON.stringify(op.from).slice(1, -1)), op.from);
  }
});
