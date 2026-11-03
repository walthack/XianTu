// 角色设定分层第 1 步：mod-kit/prompt-layers.json 与纯函数 promptLayers.ts（设计稿 2026-11-03-角色设定分层.md；用户 18:07 拍板）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const layers = await loadTs('../src/modules/scenarioMods/promptLayers.ts');
const { AFFINITY_THRESHOLDS } = await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
const { isIntimateScene } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
const config = JSON.parse(readFileSync(new URL('../mod-kit/prompt-layers.json', import.meta.url), 'utf8'));
const SHALLOW = AFFINITY_THRESHOLDS.intimacyShallow;

test('配置体检：仓库配置通过，坏配置报错', () => {
  assert.deepEqual(layers.validatePromptLayersConfig(config), []);
  const bad = structuredClone(config);
  bad.memory.npcPromptLimit = -1;
  bad.memory.npcEntryMaxChars = 0;
  bad.private.requirePresent = 'yes';
  bad.intimateInputPatterns = [];
  bad.layers.gated.fields.push('weaknesses');
  const errors = layers.validatePromptLayersConfig(bad);
  for (const key of ['npcPromptLimit', 'npcEntryMaxChars', 'requirePresent', 'intimateInputPatterns', 'weaknesses']) {
    assert.ok(errors.some(error => error.includes(key)), `应报 ${key}：${errors.join('；')}`);
  }
  assert.ok(layers.validatePromptLayersConfig(null).length > 0);
});

test('配置默认值：P6 记忆 60 字／5 条，私密层须在场，好感阶沿用 affinityLadder', () => {
  assert.equal(config.memory.npcEntryMaxChars, 60);
  assert.equal(config.memory.npcPromptLimit, 5);
  assert.equal(config.private.requirePresent, true);
  assert.equal(config.private.favorTiers, 'affinityLadder');
  assert.equal(config.layers.private.source, 'intimacyProfiles');
});

test('fieldLayer：软肋在基础层（P2），底线在门控层，真身在秘密层，其余体貌在基础层', () => {
  assert.equal(layers.fieldLayer('weaknesses'), 'base');
  assert.equal(layers.fieldLayer('identitySummary'), 'base');
  assert.equal(layers.fieldLayer('principles'), 'gated');
  assert.equal(layers.fieldLayer('visualIdentity.trueForm'), 'secret');
  assert.equal(layers.fieldLayer('visualIdentity.hair'), 'base');
  assert.equal(layers.fieldLayer('visualIdentity'), 'base');
  assert.equal(layers.fieldLayer('keyEvents'), null);
  assert.equal(layers.fieldLayer('weaknessesX'), null, '只按整段路径匹配，不按字符串前缀');
});

test('词表原样搬入配置：与原写死正则逐词一致', () => {
  const original = '亲吻|接吻|拥吻|爱抚|抚摸|宽衣|解带|更衣|沐浴|同榻|同衾|上榻|床笫|欢好|交欢|云雨|双修|求欢|侍寝|春宵|帐中|榻上|亲热|情动|裸|赤身|房事|媾和';
  assert.equal(config.intimateInputPatterns.join('|'), original);
  assert.equal(layers.INTIMATE_INPUT_RE.source, original);
  const src = readFileSync(new URL('../src/modules/scenarioMods/intimacyProfiles.ts', import.meta.url), 'utf8');
  assert.ok(!src.includes('亲吻|接吻'), 'intimacyProfiles.ts 不再写死词表');
});

test('intimateInputHit：命中词表才真；与 isIntimateScene 行为一致', () => {
  for (const [text, expected] of [
    ['他俯身亲吻她', true], ['两人同榻而眠', true], ['裸', true],
    ['两人在堂上议事', false], ['她递上一封密信', false], ['', false], [null, false], [undefined, false],
  ]) {
    assert.equal(layers.intimateInputHit(text), expected, String(text));
    assert.equal(isIntimateScene(text), expected, String(text));
  }
});

test('privateGateOpen：入口（输入命中或拍标记）、在场、关系确立三项同时满足才开', () => {
  const ok = { inputHit: true, present: true, favor: SHALLOW };
  assert.equal(layers.privateGateOpen(ok), true);
  assert.equal(layers.privateGateOpen({ ...ok, inputHit: false, beatIntimate: true }), true, '拍子 scene.intimate 是并列入口');
  assert.equal(layers.privateGateOpen({ ...ok, inputHit: false }), false, '无入口');
  assert.equal(layers.privateGateOpen({ ...ok, inputHit: false, beatIntimate: true, present: false }), false, '拍标记同样须在场');
  assert.equal(layers.privateGateOpen({ ...ok, present: false }), false, '不在场');
  assert.equal(layers.privateGateOpen({ ...ok, favor: SHALLOW - 1 }), false, '关系未确立');
  assert.equal(layers.privateGateOpen({ ...ok, beatIntimate: true, favor: SHALLOW - 1 }), false, '拍标记同样须关系确立');
  assert.equal(layers.privateGateOpen({ ...ok, favor: NaN }), false);
  assert.equal(layers.privateGateOpen({ ...ok, favor: 10, thresholds: { intimacyShallow: 10 } }), true, '阈值可注入');
  assert.equal(layers.privateGateOpen({ ...ok, favor: 9, thresholds: { intimacyShallow: 10 } }), false);
});

test('pickPrivacyFields：只留清单内的倾向类字段', () => {
  const privacy = {
    性格倾向: '外冷内热', 性取向: '异性', 亲密偏好: ['慢'], 亲密节奏: '缓', 亲密需求: '陪伴', 禁忌清单: ['人前'], 安全偏好: '稳妥',
    是否为处女: true, 身体部位: [{ 部位名称: 'x' }], 性交总次数: 3, 性伴侣名单: ['甲'], 最近一次性行为时间: 't', 生育状态: { 是否可孕: true },
  };
  const picked = layers.pickPrivacyFields(privacy);
  assert.deepEqual(Object.keys(picked).sort(), [...config.privacyAllowedFields].sort());
  for (const key of ['是否为处女', '身体部位', '性交总次数', '性伴侣名单', '最近一次性行为时间', '生育状态']) assert.ok(!(key in picked), key);
  assert.deepEqual(layers.pickPrivacyFields({ 性取向: '异性' }), { 性取向: '异性' }, '缺字段不补');
  assert.equal(layers.pickPrivacyFields(null), null);
  assert.equal(layers.pickPrivacyFields([]), null);
  assert.equal(layers.pickPrivacyFields('x'), null);
  assert.equal(privacy.是否为处女, true, '不改原对象');
});

test('projectNpcMemory：取最近 npcPromptLimit 条，不截条目', () => {
  const long = '甲'.repeat(200);
  const list = ['1', '2', '3', '4', '5', '6', long];
  const projected = layers.projectNpcMemory(list);
  assert.equal(projected.length, config.memory.npcPromptLimit);
  assert.deepEqual(projected, list.slice(-config.memory.npcPromptLimit));
  assert.equal(projected.at(-1), long, 'P9：不做截断');
  assert.equal(list.length, 7, '不改原数组');
  assert.deepEqual(layers.projectNpcMemory(['a']), ['a']);
  assert.deepEqual(layers.projectNpcMemory(undefined), []);
  assert.deepEqual(layers.projectNpcMemory('x'), []);
});
