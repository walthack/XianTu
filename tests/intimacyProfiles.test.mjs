import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// 旧的 formatIntimacyProfile 口径与生产不同、没有 src 调用者，C01 删除；这里改测生产投影
// promptLayers.projectIntimacyLines 与 INTIMACY_PROFILES[].hardLimits（storyContext 常驻发送）。
const modPromise = loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
const layersPromise = loadTs('../src/modules/scenarioMods/promptLayers.ts');

const OPEN = { inputHit: true, present: true, favor: 100 };
const project = async (name, gate = OPEN) => {
  const { findIntimacyProfile } = await modPromise;
  const { projectIntimacyLines } = await layersPromise;
  const profile = findIntimacyProfile(name);
  return profile ? projectIntimacyLines(profile, gate).join('\n') : '';
};
const hardLimits = async name => (await modPromise).findIntimacyProfile(name).hardLimits.join('\n');

test('名单与门：不在表内的角色（含两名留白角色）没有档案；入口不中不发私密内容', async () => {
  const { findIntimacyProfile } = await modPromise;
  assert.ok((await project('凝羽')).length > 0);
  assert.equal(findIntimacyProfile('霍子孟'), undefined);
  assert.equal(findIntimacyProfile('苏妲己'), undefined, '苏妲己收编弧线留白，不得入运行时');
  assert.equal(findIntimacyProfile('剑玉姬'), undefined, '剑玉姬亲密线未开启，不得入运行时');
  assert.equal(await project('凝羽', { ...OPEN, inputHit: false }), '');
  assert.equal(await project('凝羽', { ...OPEN, present: false }), '');
});

test('好感分层：低好感只见浅层，高好感才解锁深层', async () => {
  const low = await project('潘金莲', { ...OPEN, favor: 20 });
  const high = await project('潘金莲', { ...OPEN, favor: 100 });
  assert.ok(low.includes('鹤羽剑姬师姐'));
  assert.doesNotMatch(low, /受虐幻想已被逼问出/, '低好感不得提前揭示深层内容');
  assert.match(high, /受虐幻想已被逼问出/);
});

test('hardLimits 不受好感分层影响，任何时候都在（随基础档案常驻发送）', async () => {
  const text = await hardLimits('乐明珠');
  assert.match(text, /元红未破/, '正典身体边界必须始终在场');
  assert.match(text, /幼态措辞/, '合规红线必须始终在场');
  assert.doesNotMatch(await project('乐明珠', { ...OPEN, favor: 0 }), /元红未破/, 'hardLimits 不占私密内容预算');
});

test('裁定 #111/#112/#114 的正典边界已进入 hardLimits', async () => {
  for (const name of ['潘金莲', '乐明珠']) assert.match(await hardLimits(name), /凤凰宝典/);
  assert.match(await hardLimits('云如瑶'), /不得把逆转带出亲密场景/);
  assert.match(await hardLimits('吕雉'), /处子之身/);
  const biji = await hardLimits('碧姬');
  assert.match(biji, /母女同场亲密是硬禁/);
  assert.match(biji, /生还/);
});

test('C01 年龄门只认现算年龄：存档写 12 岁不影响；现算 17 不开、拨钟到 21 开', async () => {
  const { gateAgeNow } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  // 凝羽总表出生年 196、跳前登场：220 年现算 24，与存档出生日期无关（gateAgeNow 不读存档）
  assert.equal(gateAgeNow('liuchao.character.ning_yu', 220), 24);
  assert.ok((await project('凝羽', { ...OPEN, ageNow: gateAgeNow('liuchao.character.ning_yu', 220) })).length > 0);
  // 构造样例：同一人现算 17 不开，只剩 hardLimits；四年后 21 开
  assert.equal(await project('凝羽', { ...OPEN, ageNow: 17 }), '');
  assert.ok((await hardLimits('凝羽')).length > 0);
  assert.ok((await project('凝羽', { ...OPEN, ageNow: 21 })).length > 0);
});

test('注入标签同时登记进泄漏检测与清洗两份清单', async () => {
  const { findInternalNarrativeControlLeaks, stripInternalNarrativeControlLeaks, sanitizeAITextForDisplay } =
    await loadTs('../src/utils/textSanitizer.ts');
  const injected = `  内部亲密演出要求（不得写入正文）：凝羽——\n${(await project('凝羽')).split('\n').map(line => `    - ${line}`).join('\n')}`;
  assert.ok(findInternalNarrativeControlLeaks(injected).includes('亲密演出要求'));
  assert.equal(findInternalNarrativeControlLeaks(stripInternalNarrativeControlLeaks(injected)).includes('亲密演出要求'), false);
  assert.doesNotMatch(sanitizeAITextForDisplay('内部亲密演出要求（不得写入正文）：她低下头。'), /内部亲密演出要求/);
  assert.ok(findInternalNarrativeControlLeaks('内部角色行为要求（不得写入正文）：先说方案').includes('内部行为要求'));
});

test('留白角色不在数据表内，且全表角色都带 hardLimits', async () => {
  const { INTIMACY_PROFILES } = await modPromise;
  const names = INTIMACY_PROFILES.flatMap(item => item.names);
  assert.equal(names.includes('苏妲己'), false);
  assert.equal(names.includes('剑玉姬'), false);
  assert.equal(INTIMACY_PROFILES.length, 16);
  for (const profile of INTIMACY_PROFILES) {
    assert.ok(profile.hardLimits.length > 0, `${profile.names[0]} 缺少 hardLimits`);
    assert.ok(profile.preferences.length > 0, `${profile.names[0]} 缺少 preferences`);
  }
});

test('亲密场景判定宁漏不误：常见非亲密语境不误判', async () => {
  const { isIntimateScene } = await modPromise;
  assert.equal(isIntimateScene('他亲吻她的额头'), true);
  assert.equal(isIntimateScene('程宗扬与霍子孟在殿外商议军情'), false);
  assert.equal(isIntimateScene('她递上一封密信'), false);
  assert.equal(isIntimateScene('北军封锁了宫门'), false);
});
