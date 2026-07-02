import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { formatRealmWithStage, toGaoshoubangName, GAOSHOUBANG_NARRATION_RULE } = await loadTs('../src/utils/realmUtils.ts');

test('toGaoshoubangName maps 修仙境界 to 高手榜 numbered tiers (金丹=四级·入微)', () => {
  assert.equal(toGaoshoubangName('凡人'), '一级');
  assert.equal(toGaoshoubangName('练气'), '二级');
  assert.equal(toGaoshoubangName('筑基'), '三级');
  assert.equal(toGaoshoubangName('金丹'), '四级·入微');
  assert.equal(toGaoshoubangName('元婴'), '五级·坐照');
  assert.equal(toGaoshoubangName('化神'), '六级·通幽');
  assert.equal(toGaoshoubangName('炼虚'), '七级·归元');
  assert.equal(toGaoshoubangName('合体'), '八级·至臻');
  assert.equal(toGaoshoubangName('渡劫'), '九级·入神');
});

test('toGaoshoubangName passes through unknown names unchanged', () => {
  assert.equal(toGaoshoubangName('大罗金仙'), '大罗金仙');
});

test('formatRealmWithStage renders 高手榜 name with mapped 下/中/上 stage', () => {
  assert.equal(formatRealmWithStage({ 名称: '金丹', 阶段: '初期' }), '四级·入微·下');
  assert.equal(formatRealmWithStage({ 名称: '元婴', 阶段: '中期' }), '五级·坐照·中');
  assert.equal(formatRealmWithStage({ 名称: '渡劫', 阶段: '后期' }), '九级·入神·上');
  assert.equal(formatRealmWithStage({ 名称: '化神', 阶段: '圆满' }), '六级·通幽·巅峰');
});

test('formatRealmWithStage keeps 凡人 stageless and string input works', () => {
  assert.equal(formatRealmWithStage({ 名称: '凡人', 阶段: '' }), '一级');
  assert.equal(formatRealmWithStage('金丹'), '四级·入微');
  assert.equal(formatRealmWithStage(null), '一级');
});

test('GAOSHOUBANG_NARRATION_RULE maps names for narration but keeps data fields 修仙', () => {
  // 叙事称谓表存在
  assert.match(GAOSHOUBANG_NARRATION_RULE, /金丹→四级·入微/);
  assert.match(GAOSHOUBANG_NARRATION_RULE, /渡劫→九级·入神/);
  // 明确要求 JSON/数据字段仍用修仙原名，避免 AI 破坏排序键
  assert.match(GAOSHOUBANG_NARRATION_RULE, /境界\.名称.*仍保持修仙原名/);
});
