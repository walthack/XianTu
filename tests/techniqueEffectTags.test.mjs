// 功法效果标签/加成：目录迁移（techniqueEffects→bonus）、activation、词表、装备与功法同一读取入口（功法加成进六司由配置开关控制）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadTs} from './loadTs.mjs';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const audit = await import('../scripts/validate-entity-catalog.mjs');
const techniques = read('mod-kit/entity-catalog/techniques.json');
const vocab = read('mod-kit/entity-catalog/effect-tags.json');
const NUM = read('mod-kit/game-numbers.qingyu.json');
const fx = await loadTs('../src/modules/scenarioMods/effectTags.ts');
const calc = await loadTs('../src/utils/attributeCalculation.ts');
const {validateScenarioMod} = await loadTs('../src/modules/scenarioMods/validator.ts');
const run = def => { const errors = []; audit.auditItemEffects(errors, {entries: [{id: 'x.tech', definition: {id: 'x.tech', name: 'x', activation: 'active', ...def}}]}, 'technique'); return errors.join('|'); };

test('67 条功法全部迁到 bonus + activation=active，旧字段 techniqueEffects 已无', () => {
  assert.equal(techniques.entries.length, 67);
  for (const e of techniques.entries) for (const d of [e.definition, ...Object.values(e.stageVariants)]) {
    assert.equal(d.techniqueEffects, undefined, e.id);
    assert.equal(d.activation, 'active', e.id);
    assert.ok(Object.keys(d.bonus).every(k => ['修炼速度加成', '后天六司'].includes(k)), e.id);
    assert.deepEqual(Object.keys(d.bonus.后天六司).sort(), ['悟性', '灵性'], e.id);
  }
});

test('迁移保持数值原样：九阳神功 0.56 / 悟性7 灵性4，口诀 0.08 / 1 / 1（占位值，按品级生成）', () => {
  const by = id => techniques.entries.find(e => e.id === id).definition.bonus;
  assert.deepEqual(by('lcq.technique.jiuyang'), {修炼速度加成: 0.56, 后天六司: {悟性: 7, 灵性: 4}});
  assert.deepEqual(by('lcq.technique.nine_sun_manual'), {修炼速度加成: 0.08, 后天六司: {悟性: 1, 灵性: 1}});
  // 变体数值与本体同品级规则一致：搜神诀变体 0.16 / 2 / 1
  assert.deepEqual(techniques.entries.find(e => e.id === 'lyg.technique.np016').stageVariants['lyg.mijing_rumen'].bonus, {修炼速度加成: 0.16, 后天六司: {悟性: 2, 灵性: 1}});
});

test('目录功法不带 allowMultiEquip（缺省取配置，初值 false）；没有任何功法被打效果标签', () => {
  assert.equal(NUM.techniques.allowMultiEquipDefault, false);
  for (const e of techniques.entries) { assert.equal(e.definition.allowMultiEquip, undefined, e.id); assert.equal(e.definition.effectTags, undefined, e.id); }
});

test('词表文件：每个标签标注适用 activation；功法（active）目前没有可用标签，道具标签全是 consumable', () => {
  assert.deepEqual(Object.keys(vocab.activations).sort(), ['active', 'consumable', 'equipped']);
  assert.deepEqual(Object.keys(vocab.tags).sort(), ['antidote', 'detox', 'heal', 'hemostatic', 'poison', 'sedative', 'sober', 'splint', 'unseal']);
  for (const [tag, spec] of Object.entries(vocab.tags)) assert.ok(spec.activation.length && spec.activation.every(a => a in vocab.activations), tag);
  assert.deepEqual(Object.entries(vocab.tags).filter(([, s]) => s.activation.includes('active')), []);
  const errors = []; audit.auditEffectVocabulary(errors); assert.deepEqual(errors, []);
});

test('功法校验：activation 必填且只能 active；标签要在词表里且适用 active；onUse/旧字段/坏加成/坏开关被拒', () => {
  assert.equal(run({bonus: {修炼速度加成: 0.1, 后天六司: {悟性: 1}}}), '');
  assert.equal(run({allowMultiEquip: true}), '');
  assert.match(run({activation: undefined}), /activation 必填/);
  assert.match(run({activation: 'equipped'}), /activation equipped 与功法类不一致（应为 active）/);
  assert.match(run({effectTags: ['magic']}), /未知效果标签 magic/);
  assert.match(run({effectTags: ['heal']}), /效果标签 heal 不适用于 active/);
  assert.match(run({effectTags: []}), /effectTags 需为非空/);
  assert.match(run({onUse: [{statusId: 'poisoned'}]}), /onUse 只用于 consumable/);
  assert.match(run({techniqueEffects: {修炼速度加成: 0.1}}), /techniqueEffects 已改名 bonus/);
  assert.match(run({bonus: {}}), /加成需为非空对象/);
  assert.match(run({bonus: {修炼速度加成: 'x'}}), /修炼速度加成 需为有限数字/);
  assert.match(run({bonus: {特殊能力: 1}}), /未知加成字段/);
  assert.match(run({bonus: {后天六司: {力量: 1}}}), /后天六司\.力量 非法/);
  assert.match(run({allowMultiEquip: 'yes'}), /allowMultiEquip 需为布尔值/);
});

test('装备的 attributeBonus 与功法 bonus 同构校验：装备不能带修炼速度加成，非装备类不能带 attributeBonus，道具不能带 allowMultiEquip', () => {
  const item = def => { const errors = []; audit.auditItemEffects(errors, {entries: [{id: 'x.item', definition: {id: 'x.item', name: 'x', type: 'weapon', ...def}}]}); return errors.join('|'); };
  assert.equal(item({attributeBonus: {气血上限: 15, 后天六司: {根骨: 2}}}), '');
  assert.match(item({attributeBonus: {修炼速度加成: 0.1}}), /未知加成字段 修炼速度加成/);
  assert.match(item({type: 'material', attributeBonus: {气血上限: 1}}), /attributeBonus 只用于装备/);
  assert.match(item({allowMultiEquip: true}), /allowMultiEquip 只用于功法/);
});

test('双修/采补/鼎炉/夺元的功法与普通功法同规则：可打适用的标签，不再有专门的回避处理', () => {
  const words = /双修|采补|鼎炉|夺元/;
  const ids = techniques.entries.filter(e => [e.definition, ...Object.values(e.stageVariants)].some(d => words.test(`${d.name || ''}${d.description || ''}`))).map(e => e.id);
  assert.deepEqual(ids.sort(), ['liuchao.technique.tai_yi_jing', 'lyg.technique.np050', 'lyl.technique.np056', 'lyl.technique.np059', 'lyl.technique.np060', 'lyl.technique.np063']);
  assert.equal(audit.complianceMarkedTechniques, undefined);
  assert.equal(read('mod-kit/entity-catalog/validation.config.json').techniqueTags, undefined);
  assert.doesNotMatch(run({name: '双修法', effectTags: ['detox']}), /合规|C02/);
  assert.doesNotMatch(run({description: '以处子为鼎炉'}), /合规|C02/);
});

test('整份目录通过体检（含功法与词表对账）', () => {
  assert.deepEqual(audit.auditEntityCatalog().errors, []);
});

test('mod 校验器（validator.ts）也检查功法的 activation/标签/bonus，自定义 mod 可省 activation', () => {
  const mod = technique => ({schema: 'xiantu.scenario-mod', version: 1, manifest: {id: 'x.test', name: 't', version: '1'}, canon: {}, content: {techniques: [{id: 'x.technique.a', name: 'a', ...technique}]}, scenario: {}});
  const issues = technique => validateScenarioMod(mod(technique)).issues.filter(i => i.code === 'invalid_effects').map(i => i.message).join('|');
  assert.equal(issues({bonus: {后天六司: {悟性: 1}}}), '');
  assert.match(issues({effectTags: ['heal']}), /不适用于 active/);
  assert.match(issues({activation: 'consumable'}), /不一致/);
  assert.match(issues({techniqueEffects: {修炼速度加成: 0.1}}), /已改名 bonus/);
});

test('同一读取入口：功法加成进六司由配置 applyBonusToAttributes 控制，默认关闭；开启后只取第一部已装备功法，带「允许多部装备」的可叠加', async () => {
  const {GAME_NUMBERS} = await loadTs('../src/modules/sceneModule/numbers.ts');
  const eq = {id: '装备', 类型: '装备', 装备增幅: {后天六司: {悟性: 1}}};
  const tech = (n, bonus, extra = {}) => ({类型: '功法', 已装备: true, 功法效果: {修炼速度加成: 0.1, 属性加成: bonus}, ...extra});
  const save = items => ({角色: {装备: {武器: 'e'}, 背包: {物品: {e: eq, ...items}}}});
  const six = (s) => calc.calculateEquippedBonuses(s);
  assert.equal(NUM.techniques.applyBonusToAttributes, false);
  assert.equal(GAME_NUMBERS.techniques.applyBonusToAttributes, false);
  assert.equal(six(save({a: tech('a', {悟性: 7, 灵性: 4})})).悟性, 1, '开关关闭：已装备功法不影响面板，装备照常');
  assert.equal(six(save({a: tech('a', {悟性: 7, 灵性: 4})})).灵性, 0);
  GAME_NUMBERS.techniques.applyBonusToAttributes = true;
  try {
    assert.equal(six(save({})).悟性, 1);
    assert.equal(six(save({a: tech('a', {悟性: 7, 灵性: 4})})).悟性, 8);
    assert.equal(six(save({a: tech('a', {悟性: 7, 灵性: 4})})).灵性, 4);
    const two = save({a: tech('a', {悟性: 7}), b: tech('b', {悟性: 2})});
    assert.equal(six(two).悟性, 8, '第二部未标记，不叠加');
    const multi = save({a: tech('a', {悟性: 7}), b: tech('b', {悟性: 2}, {允许多部装备: true})});
    assert.equal(six(multi).悟性, 10);
    assert.equal(six(save({a: tech('a', {悟性: 7}, {已装备: false})})).悟性, 1, '未装备的不算');
  } finally { GAME_NUMBERS.techniques.applyBonusToAttributes = false; }
});

test('目录功法进主角存档：bonus 映射为功法效果（属性加成＝后天六司），不带 allowMultiEquip 时不写「允许多部装备」；开关走配置', async () => {
  const {applyScenarioRelationshipsToSave} = await loadTs('../src/modules/scenarioMods/relationships.ts');
  const {GAME_NUMBERS} = await loadTs('../src/modules/sceneModule/numbers.ts');
  const technique = {id: 'x.technique.t', name: 't', grade: '神品', activation: 'active', bonus: {修炼速度加成: 0.56, 后天六司: {悟性: 7, 灵性: 4}}};
  const build = () => {
    const save = {角色: {背包: {物品: {}}}, 社交: {}, 元数据: {时间: {年: 1000}}};
    const source = {characters: [{id: 'x.p', name: 'P', techniqueIds: [technique.id]}], techniques: [technique], opening: {playerCharacterId: 'x.p'}};
    applyScenarioRelationshipsToSave(save, source, 'now');
    return save.角色.背包.物品[technique.id];
  };
  const item = build();
  assert.deepEqual(item.功法效果, {修炼速度加成: 0.56, 属性加成: {悟性: 7, 灵性: 4}});
  assert.equal(item.允许多部装备, undefined);
  GAME_NUMBERS.techniques.allowMultiEquipDefault = true;
  try { assert.equal(build().允许多部装备, true); } finally { GAME_NUMBERS.techniques.allowMultiEquipDefault = false; }
});
