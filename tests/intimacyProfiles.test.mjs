import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');

const BASE = { nsfwMode: true, sceneText: '他俯身亲吻她', favor: 100, age: 24 };

test('四道门：名单/成人/年龄/场景任一不过都不注入', async () => {
  const { formatIntimacyProfile } = await modPromise;

  // 通过基线
  assert.ok(formatIntimacyProfile('凝羽', BASE).includes('内部亲密演出要求'));

  // 名单门：不在表内的角色（含两名留白角色）永不注入
  assert.equal(formatIntimacyProfile('霍子孟', BASE), '');
  assert.equal(formatIntimacyProfile('苏妲己', BASE), '', '苏妲己收编弧线留白，不得入运行时');
  assert.equal(formatIntimacyProfile('剑玉姬', BASE), '', '剑玉姬亲密线未开启，不得入运行时');

  // 成人门
  assert.equal(formatIntimacyProfile('凝羽', { ...BASE, nsfwMode: false }), '');

  // 年龄门（合规红线）：未成年、年龄缺失、非数字一律拒绝
  assert.equal(formatIntimacyProfile('凝羽', { ...BASE, age: 17 }), '');
  assert.equal(formatIntimacyProfile('凝羽', { ...BASE, age: undefined }), '');
  assert.equal(formatIntimacyProfile('凝羽', { ...BASE, age: Number.NaN }), '');

  // 场景门：普通场景不注入
  assert.equal(formatIntimacyProfile('凝羽', { ...BASE, sceneText: '两人在堂上议事' }), '');
  assert.equal(formatIntimacyProfile('凝羽', { ...BASE, sceneText: '' }), '');
});

test('好感分层：低好感只见浅层，高好感才解锁深层', async () => {
  const { formatIntimacyProfile } = await modPromise;
  const low = formatIntimacyProfile('潘金莲', { ...BASE, favor: 0 });
  const high = formatIntimacyProfile('潘金莲', { ...BASE, favor: 100 });

  assert.ok(low.includes('鹤羽剑姬师姐'));
  assert.doesNotMatch(low, /受虐幻想已被逼问出/, '低好感不得提前揭示深层内容');
  assert.match(high, /受虐幻想已被逼问出/);
});

test('hardLimits 不受好感分层影响，任何时候都注入', async () => {
  const { formatIntimacyProfile } = await modPromise;
  for (const favor of [0, 100]) {
    const text = formatIntimacyProfile('乐明珠', { ...BASE, favor });
    assert.match(text, /元红未破/, '正典身体边界必须始终在场');
    assert.match(text, /幼态措辞/, '合规红线必须始终在场');
  }
});

test('裁定 #111/#112/#114 的正典边界已进入 hardLimits', async () => {
  const { formatIntimacyProfile } = await modPromise;
  // #111 凤凰宝典：两人都必须写明由她们主动恳求不破
  for (const name of ['潘金莲', '乐明珠']) {
    assert.match(formatIntimacyProfile(name, BASE), /凤凰宝典/);
  }
  // #112 云如瑶：逆转限房事层面，平日不变
  const yunruyao = formatIntimacyProfile('云如瑶', BASE);
  assert.match(yunruyao, /不得把逆转带出亲密场景/);
  // 吕雉：处女功法作筹码
  assert.match(formatIntimacyProfile('吕雉', BASE), /处子之身/);
  // #114 碧姬：时序门控 + 母女同场硬禁
  const biji = formatIntimacyProfile('碧姬', BASE);
  assert.match(biji, /母女同场亲密是硬禁/);
  assert.match(biji, /生还/);
});

test('注入标签同时登记进泄漏检测与清洗两份清单', async () => {
  const { formatIntimacyProfile } = await modPromise;
  const { findInternalNarrativeControlLeaks, stripInternalNarrativeControlLeaks, sanitizeAITextForDisplay } =
    await loadTs('../src/utils/textSanitizer.ts');

  const injected = formatIntimacyProfile('凝羽', BASE);
  // 检测：整段泄漏能被识别，供表演门禁退回重写
  assert.ok(findInternalNarrativeControlLeaks(injected).includes('亲密演出要求'));
  // 清洗：标签被移除，且不再被检出
  assert.equal(findInternalNarrativeControlLeaks(stripInternalNarrativeControlLeaks(injected)).includes('亲密演出要求'), false);
  // 展示路径同样清洗
  assert.doesNotMatch(sanitizeAITextForDisplay('内部亲密演出要求（不得写入正文）：她低下头。'), /内部亲密演出要求/);
  // 早先的高智行为标签同属一族，一并覆盖
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
