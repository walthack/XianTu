import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/characterResolver.ts');

/**
 * 「转折前禁止提前写成后宫／侍妾／情人」此前在角色**真正登场的关卡里**整条失效：
 * 它与「转折后才可写入」同属 relationship-chain，被同一个 `if (!currentPhase)` 一起丢弃，
 * 理由是完整关系链含未来分支不能进 prompt。但前半条是纯约束、不含未来信息。
 * 实测 33 名角色、302 个「角色×关卡」组合无一注入（小紫 33 关、吕雉 18 关全丢）。
 */
const resolve = async (name, stageId) => {
  const { resolveScenarioCharacters } = await modPromise;
  const character = { name };
  const resolved = resolveScenarioCharacters([character], stageId);
  assert.equal(resolved, 1, `${name} 应能在 registry 中解析到`);
  return (character.profile?.notes || []).join('\n');
};

test('转折前的关卡注入关系身份门禁', async () => {
  // 孙寿在云龙是「吕氏外戚女眷」——尚未沦为内宅侍婢
  const notes = await resolve('孙寿', 'lyl.taiquan_sacred_fruit');
  assert.match(notes, /关系身份门禁/, '转折前必须注入禁令');
  assert.match(notes, /禁止提前称为后宫/, '禁令原文须在案');
});

test('转折后的关卡不再注入禁令（本关身份已表明归属）', async () => {
  // 孙寿在燕歌 role 已是「程宗扬内宅侍婢」，此时再说"禁止称为后宫"会自相矛盾
  const notes = await resolve('孙寿', 'lyg.changgan_begins');
  assert.ok(!notes.includes('关系身份门禁'), '已归属的关卡不应再注入禁令');
});

test('吕雉同样按关卡区分前后', async () => {
  const before = await resolve('吕雉', 'lyl.taiquan_sacred_fruit');
  const after = await resolve('吕雉', 'lyg.changgan_begins');
  assert.match(before, /关系身份门禁/, '云龙时期是汉国太后，禁令应在');
  assert.ok(!after.includes('关系身份门禁'), '燕歌时期已是性奴婢，禁令应撤');
});

test('禁令不泄漏未来分支（不得带出"转折后才可写入"那条）', async () => {
  const notes = await resolve('孙寿', 'lyl.taiquan_sacred_fruit');
  assert.ok(!notes.includes('才可写入'), '"转折后才可写入"含未来信息，不得进 prompt');
  assert.ok(!notes.includes('allowed-after-turning-point'), '状态标记同样不得泄漏');
});

test('无关系链的角色不受影响', async () => {
  const notes = await resolve('贾文和', 'lyg.changgan_begins');
  assert.ok(!notes.includes('关系身份门禁'));
  assert.ok(notes.length > 0, '其余档案照常注入');
});
