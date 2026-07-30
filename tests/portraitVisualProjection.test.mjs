import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const registryUrl = new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url);

function note(notes, tag) {
  return (notes || []).find(n => String(n).startsWith(`【${tag}】`)) || '';
}
async function resolveOne(name, stageId) {
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const character = { id: `test.${name}`, name, profile: {} };
  resolveScenarioCharacters([character], stageId);
  return character;
}

test('体貌与装束分层投影为两条独立的派生 note', async () => {
  const c = await resolveOne('苏妲己', 'lcq.stage_06');
  const body = note(c.profile.notes, '体貌');
  const outfit = note(c.profile.notes, '装束');

  assert.ok(body, '应注入【体貌】');
  assert.ok(body.includes('换装不改变这些特征'), '【体貌】须声明其不随换装变化');
  assert.ok(outfit, '应注入【装束】');
  assert.ok(outfit.includes('可随场景更换'), '【装束】须声明其可变');
  // 分层的意义就在于二者不混：服装不该出现在体貌里
  assert.ok(!body.includes('抹胸'), '服装不得混入【体貌】');
});

test('真身特征单独成条并带门控，绝不混进体貌或装束', async () => {
  const c = await resolveOne('苏妲己', 'lcq.stage_06');
  const trueForm = note(c.profile.notes, '真身特征');
  const body = note(c.profile.notes, '体貌');
  const outfit = note(c.profile.notes, '装束');

  assert.ok(trueForm.includes('狐尾'), '九尾狐尾应进【真身特征】');
  assert.ok(trueForm.includes('仅在其显露真身时可见'), '须带可见性门控');
  assert.ok(trueForm.includes('不得作为既知前提'), '须带知情门控（storyContext 规则 5）');
  // 曾经的缺陷：狐尾同时留在 outfits[].props 里，作为常态装束注入 —— 身份秘密就此泄底
  assert.ok(!body.includes('狐尾'), '真身特征不得混入【体貌】（那是人人可见的）');
  assert.ok(!outfit.includes('狐尾'), '真身特征不得混入【装束】');
});

test('关卡专属装束优先于常态装束，未绑定则回落', async () => {
  const { pickOutfitForStage } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const outfits = [
    { id: 'default', scope: 'default', outfit: '常态便装' },
    { id: 'variant-1', scope: 'stage:lcq.stage_06', outfit: '决战战装' },
    { id: 'variant-2', scope: 'unassigned', outfit: '尚未绑定的一套' },
  ];
  assert.equal(pickOutfitForStage(outfits, 'lcq.stage_06').outfit, '决战战装', '本关有专属装束时穿它');
  assert.equal(pickOutfitForStage(outfits, 'lcq.stage_05').outfit, '常态便装', '未绑定的关卡回落到常态');
  assert.equal(pickOutfitForStage([{ id: 'v', scope: 'unassigned', outfit: '孤立变体' }], 'lcq.stage_05'), undefined,
    '只有未绑定变体、没有常态时不注入装束（宁可不写，也不臆断她穿了哪套）');
  assert.equal(pickOutfitForStage(undefined, 'lcq.stage_05'), undefined);
  assert.equal(pickOutfitForStage([], 'lcq.stage_05'), undefined);
});

test('多套装束的角色在无绑定时穿常态那套', async () => {
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const entry = registry.characters.find(x => (x.staticProfile.visualOutfits || []).length > 1);
  assert.ok(entry, '至少要有一个角色带多套装束，否则分层没有意义');
  const c = await resolveOne(entry.canonicalName, 'lcq.stage_06');
  const worn = note(c.profile.notes, '装束');
  const def = entry.staticProfile.visualOutfits.find(o => o.scope === 'default');
  assert.ok(worn.includes(def.outfit.slice(0, 12)), `${entry.canonicalName} 应穿常态装束`);
});

test('重复投影不会让派生 note 累积', async () => {
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const character = { id: 'test.z', name: '苏妲己', profile: {} };
  resolveScenarioCharacters([character], 'lcq.stage_06');
  const first = character.profile.notes.length;
  resolveScenarioCharacters([character], 'lcq.stage_06');
  assert.equal(character.profile.notes.length, first, '重投影后 note 数量必须不变（DERIVED_TAGS 清理）');
});

test('裁定 #142 的 canon 覆盖写进了 identity 字段而不只是备注', async () => {
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const yueshuang = registry.characters.find(x => x.canonicalName === '月霜');
  const ningyu = registry.characters.find(x => x.canonicalName === '凝羽');

  // 官图把两人都画成栗棕发，原文是「一头青丝」「乌亮的发丝」——裁定以原文为准
  assert.equal(yueshuang.staticProfile.visualIdentity.hairColor, '乌黑');
  assert.equal(ningyu.staticProfile.visualIdentity.hairColor, '乌黑');
  assert.ok((ningyu.staticProfile.visualIdentity.marks || []).some(m => m.includes('月牙')),
    '凝羽肩头的淡红月牙痕是原文明载的永久标记');
  assert.ok(yueshuang.staticProfile.visualIdentity.canonOverride, '覆盖须留下理由');
});
