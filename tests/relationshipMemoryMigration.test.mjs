import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const { ensureEncounteredScenarioCharacter, applyScenarioRelationshipsToSave } = await loadTs('../src/modules/scenarioMods/relationships.ts');
const { applyLoadRepairs } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const config = JSON.parse(readFileSync(new URL('../mod-kit/prompt-layers.json', import.meta.url), 'utf8'));
const id = 'test.memory.npc';
const memories = ['曾与玩家同行', '曾与玩家同行'];
const source = {
  opening: {},
  characters: [{ id, name: '测试人物', profile: { memories, notes: ['【关系】正典设定', '普通备注', '【内部约束·不入正文】约束'] } }],
  playerRelationships: [{ characterId: id, relation: '相识', memories: ['初次会面'] }],
};
const save = () => ({ 元数据: { 时间: { 年: 220 } }, 社交: { 关系: {} }, 角色: {} });
test('首次相遇仍不预置背景记忆，重遇不覆盖已有事实', () => {
  const s = save();
  ensureEncounteredScenarioCharacter(s, source, id);
  assert.deepEqual(s.社交.关系[id].记忆, []);
  assert.notEqual(s.社交.关系[id].记忆, memories);
  s.社交.关系[id].记忆.push('玩家新经历');
  ensureEncounteredScenarioCharacter(s, source, id);
  assert.deepEqual(s.社交.关系[id].记忆, ['玩家新经历']);
});
test('初始关系保留声明的事实记忆，派生备注不入档', () => {
  const s = save();
  applyScenarioRelationshipsToSave(s, source);
  assert.deepEqual(s.社交.关系[id].记忆, [...memories, '初次会面']);
});
test('读档链移除全部派生前缀，仅匹配开头，保留其他记忆及字段；重复读档幂等', () => {
  const kept = ['事实原文', '谈到【关系】二字', ' 【关系】非前缀', '【未知】备注', '事实原文', { 事件: '结构化事实' }, null];
  const s = save();
  s.社交.关系 = {
    [id]: { 记忆: [...config.derivedNotePrefixes.map(t => t + '旧设定'), ...kept], 好感度: 30, 私密信息: { 原值: '保留' } },
    another: { 记忆: ['【体貌】旧设定', '同行事实'] },
    absent: {}, invalid: { 记忆: '原值' }, empty: { 记忆: [] }, nullEntry: null,
  };
  applyLoadRepairs(s);
  assert.deepEqual(s.社交.关系[id], { 记忆: kept, 好感度: 30, 私密信息: { 原值: '保留' } });
  assert.deepEqual(s.社交.关系.another.记忆, ['同行事实']);
  assert.deepEqual(s.社交.关系.absent, {});
  assert.equal(s.社交.关系.invalid.记忆, '原值');
  const once = structuredClone(s);
  applyLoadRepairs(s);
  assert.deepEqual(s, once);
  assert.doesNotThrow(() => applyLoadRepairs({}));
});
