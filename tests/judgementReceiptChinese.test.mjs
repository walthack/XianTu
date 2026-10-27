// 给叙事模型看的判定回执只写中文（真机 db4278a0247b：冲关成功的叙事夹了英文「确认你的状态 changes」）。
// 查清：冲关（自由行动·自修）确认后，回执原样给模型 类型=cultivate、结果=success、正典策略=route_process_only、
// 已写入=「角色.属性.境界 set」；MainGamePanel 拼的【本地判定已结算】同样如此，还写着 route_process_only／void／=true。
// 改为中文标签；判定ID 原样保留。冻结文件 AIBidirectionalSystem.ts 里场景材料的英文键名（eventId／location／present…）改不了，
// 模块叙事指令（MODULE_NARRATIVE_SYSTEM_PROMPT）补一条「正文只用中文、英文键名只是格式」。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WANG_ZHE, load, makeSave, mods, runJudged, ticket } from './freeActionFixture.mjs';

const engine = await load('../src/utils/judgementEngine.ts');
const realm = await load('../src/utils/realmUtils.ts');
const prompts = await load('../src/services/prompts/defaultPrompts.ts');

/** 去掉判定ID（值与「判定ID」这个标签名，各处规则都这样叫）后剩下的拉丁字母词。 */
const latinWords = (text, id = '') => (id ? text.split(id).join('') : text).split('判定ID').join('').match(/[A-Za-z_]{2,}/g) ?? [];

function breakthrough(outcome) {
  const save = makeSave({ present: [], favor: { [WANG_ZHE]: 55 } });
  save.角色.属性.境界 = { 名称: realm.levelName(1), 阶段: '后期', 当前进度: 100, 下一级所需: 100 };
  return runJudged(save, ticket('solo', 'breakthrough', null), outcome).resolution;
}

test('冲关回执（成功／部分成功）：给模型的回执没有英文——类型、结果、正典策略、已写入都是中文，判定ID 原样', () => {
  for (const [outcome, label] of [['success', '成功'], ['partial', '部分成功']]) {
    const resolution = breakthrough(outcome);
    const prompt = engine.formatVerifiedJudgementReceiptForPrompt(resolution);
    assert.deepEqual(latinWords(prompt, resolution.id), [], `${outcome}：${prompt}`);
    assert.match(prompt, new RegExp(`判定ID=${resolution.id}`));
    assert.match(prompt, /类型=修炼/);
    assert.match(prompt, new RegExp(`结果档（只给你看）=${label}；`));
    assert.match(prompt, /正典策略=(自由演绎|只演过程)/);
    assert.match(prompt, /已写入=境界记为/);
  }
});

test('标签表：判定类型、六档结果、正典策略都有中文；境界之外的效果动作也写中文', () => {
  for (const kind of ['combat', 'cultivate', 'craft', 'explore', 'social', 'escape', 'stealth', 'scheme']) assert.match(engine.JUDGEMENT_KIND_LABELS[kind], /^[一-龥]+$/, kind);
  for (const outcome of ['critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect']) assert.match(engine.JUDGEMENT_OUTCOME_LABELS[outcome], /^[一-龥]+$/, outcome);
  for (const policy of ['free', 'route_process_only']) assert.match(engine.JUDGEMENT_CANON_POLICY_LABELS[policy], /^[一-龥]+$/, policy);
  for (const action of ['set', 'add', 'upsert', 'remove', 'push', 'other']) {
    assert.deepEqual(engine.describeJudgementEffect({ key: '角色.属性.灵气.当前', action, value: 1 }).match(/[A-Za-z]{2,}/g), null, action);
  }
});

test('MainGamePanel 拼的【本地判定已结算】：类型／结果／正典策略走中文标签，不再写 route_process_only、void、=true；模块叙事指令要求正文只用中文', () => {
  const panel = readFileSync(fileURLToPath(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url)), 'utf8');
  const line = panel.split('\n').find(row => row.includes('【本地判定已结算】判定ID='));
  assert.ok(line);
  assert.match(line, /类型=\$\{labels\.kind\}.*结果档（只给你看）=\$\{labels\.outcome\}.*正典策略=\$\{labels\.canonPolicy\}/);
  assert.ok(!/\$\{result\.(kind|outcome|canonPolicy)\}/.test(line), line);
  // 模板里的字面文字（去掉 ${…} 插值）没有英文
  const literal = line.slice(line.indexOf('`') + 1, line.lastIndexOf('`')).replace(/\$\{[^}]*\}/g, '');
  assert.deepEqual(latinWords(literal), [], literal);
  assert.match(prompts.MODULE_NARRATIVE_SYSTEM_PROMPT, /正文只用中文，不夹英文单词、字段名或程序标识/);
});
