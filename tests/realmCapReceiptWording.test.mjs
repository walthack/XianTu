// 真机 658435d5eb8b（复测）四条技术问题：
// 1. 最高境界满进度发「冲关」提示「境界进度还不到这一步」，与满进度矛盾——改与「修炼」同一原因 realm_capped（LCQ-FA-026），写瓶颈；
// 2. 最高境界 90% 右栏仍显示「可冲刺」——「可冲刺」「可突破!」都看 atTrainingCap（与 canBreakthrough 同源）；
// 3. 修炼部分成功进度没动，叙事写「反倒被消磨去少许」——回执与事实句写明「进度不变、无折损」，只有冲关非成功档（数值确实折损）才写折损；
// 4. 模型把判定档文案原样念进叙事、把自我提示漏进正文——档名与结果说明标成「只给你看、不照抄」，回执里剩下的英文改中文；不加正文改写器。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WANG_ZHE, load, makeSave, mods, runJudged, ticket } from './freeActionFixture.mjs';

const levelProgression = await load('../src/modules/scenarioMods/levelProgression.ts');
const engine = await load('../src/utils/judgementEngine.ts');
const actionGate = await load('../src/utils/actionGate.ts');
const codes = await load('../src/modules/diagnostics/codes.ts');
const prompts = await load('../src/services/prompts/defaultPrompts.ts');
const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');

const N = () => mods.numbers.GAME_NUMBERS;
const solo = variant => ticket('solo', variant, null);
const source = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
/** 去掉判定ID（值与标签名）后剩下的拉丁字母词。 */
const latinWords = (text, id = '') => (id ? text.split(id).join('') : text).split('判定ID').join('').match(/[A-Za-z_]{2,}/g) ?? [];

function realmSave({ level = 1, stage = '中期', progress = 30, cap } = {}) {
  const save = makeSave({ present: [], favor: { [WANG_ZHE]: 55 } });
  save.角色.属性.境界 = { 名称: mods.realm.levelName(level), 阶段: stage, 当前进度: progress, 下一级所需: 100 };
  if (cap) save.系统.难度设置 = { autoRaiseLevel: true, trainingCap: cap };
  return save;
}
const top = opts => realmSave({ level: N().levels.max, ...opts });

test('atTrainingCap：与 canBreakthrough 同源——最高境界（默认难度）为真、冲不了关；没有境界记录为假', () => {
  assert.equal(levelProgression.atTrainingCap(top({ stage: '后期', progress: 100 })), true);
  assert.equal(levelProgression.atTrainingCap(top({ stage: '中期', progress: 90 })), true);
  assert.equal(levelProgression.canBreakthrough(top({ stage: '后期', progress: 100 })), false);
  assert.equal(levelProgression.atTrainingCap(realmSave({ stage: '后期', progress: 100 })), false);
  assert.equal(levelProgression.canBreakthrough(realmSave({ stage: '后期', progress: 100 })), true);
  assert.equal(levelProgression.atTrainingCap(makeSave({ present: [] })), false);
  const noRealm = makeSave({ present: [] }); delete noRealm.角色.属性.境界;
  assert.equal(levelProgression.atTrainingCap(noRealm), false);
});

test('最高境界满进度：发「冲关」与发「修炼」同一原因 realm_capped，事实句写瓶颈、不写「还不到这一步」；文案在内容包 texts，错误码 LCQ-FA-026', () => {
  for (const variant of ['breakthrough', 'train']) {
    const save = top({ stage: '后期', progress: 100 }), snapshot = structuredClone(save);
    const prepared = mods.plan.prepareFreeAction(save, solo(variant));
    assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'realm_capped'], variant);
    assert.match(prepared.facts[0], /修为已到瓶颈.*再练也没有进益/, variant);
    assert.ok(!/还不到这一步/.test(prepared.facts[0]), prepared.facts[0]);
    assert.deepEqual(save, snapshot, `${variant}：零写入`);
  }
  // 最高境界进度未满时冲关：同样无关可冲，写瓶颈；非最高境界进度未满仍是「还不到这一步」
  assert.equal(mods.plan.prepareFreeAction(top({ stage: '中期', progress: 30 }), solo('breakthrough')).reason, 'realm_capped');
  const early = mods.plan.prepareFreeAction(realmSave({ stage: '中期', progress: 30 }), solo('breakthrough'));
  assert.equal(early.reason, 'not_ready');
  assert.match(early.facts[0], /境界进度还不到这一步/);
  // 难度选原著级上限时，到上限同样按瓶颈（同一 trainingCapLevel）
  const canonCapped = realmSave({ level: 1, stage: '后期', progress: 100, cap: 'canon' });
  if (levelProgression.atTrainingCap(canonCapped)) assert.equal(mods.plan.prepareFreeAction(canonCapped, solo('breakthrough')).reason, 'realm_capped');
  assert.match(CONTENT_PACKS.texts['free.fact.gate.realm_capped'], /修为已到瓶颈，眼下再练也没有进益/);
  assert.ok(CONTENT_PACKS.texts['free.fact.gate.realm_capped.breakthrough']);
  assert.equal(CONTENT_PACKS.texts['free.fact.gate.not_ready.train'], undefined, '修炼的「瓶颈」句挪到 realm_capped，不再挂在 not_ready 下');
  assert.equal(codes.FA_GATE_CODES.realm_capped, 'LCQ-FA-026');
  assert.equal(codes.ERROR_CODES['LCQ-FA-026'].module, 'freeAction');
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('右栏：「可冲刺」「可突破!」都与 canBreakthrough 同源——可冲刺另要求未到练功上限（atTrainingCap），最高境界 90% 不再显示', () => {
  const sidebar = source('../src/components/dashboard/RightSidebar.vue');
  assert.match(sidebar, /<span v-else-if="sprintReady" class="sprint-hint">可冲刺<\/span>/);
  assert.match(sidebar, /const sprintReady = computed\(\(\) => realmProgressPercent\.value >= 90 && realmProgressPercent\.value < 100\s*&& Boolean\(gameStateStore\.attributes\?\.境界\) && !atTrainingCap\(gameStateStore\.toSaveData\(\)\)\);/);
  assert.match(sidebar, /if \(sprintReady\.value\) return 'realm-sprint';/);
  assert.ok(!/percent >= 90 && percent < 100/.test(sidebar), '进度条黄色也不再只看百分比');
  assert.ok(!/realmProgressPercent >= 90 && realmProgressPercent < 100/.test(sidebar), '模板不再只看百分比');
  // 判据本身：最高境界 90% 在上限，非最高境界 90% 不在
  assert.equal(levelProgression.atTrainingCap(top({ stage: '后期', progress: 90 })), true);
  assert.equal(levelProgression.atTrainingCap(realmSave({ stage: '后期', progress: 90 })), false);
});

test('修炼非成功档：进度没动，回执写「修为进度不变、没有任何折损」，事实句同口径，不出现消磨／倒退；冲关非成功档确实折损才写折损', () => {
  for (const outcome of ['partial', 'failure', 'critical_failure']) {
    const save = realmSave(), before = structuredClone(save.角色.属性.境界);
    const { resolution, result } = runJudged(save, solo('train'), outcome);
    assert.deepEqual(save.角色.属性.境界, before, `${outcome}：进度不变`);
    const receipt = engine.formatVerifiedJudgementReceiptForPrompt(resolution);
    assert.match(receipt, /修为=修为进度不变，没有任何折损；不得写成修为被消磨、折损、倒退或有所增长/, outcome);
    assert.match(result.facts[0], /修为进度不变，也没有任何折损/, outcome);
    assert.ok(!/消磨|气机不顺|折损了|折损一部分/.test(result.facts.join('') + engine.describeJudgementOutcomeText(resolution)), `${outcome}：${result.facts.join('')}`);
  }
  for (const outcome of ['partial', 'failure', 'critical_failure']) {
    const save = realmSave({ stage: '后期', progress: 100 });
    const { resolution, result } = runJudged(save, solo('breakthrough'), outcome);
    assert.equal(save.角色.属性.境界.当前进度, Math.floor(100 * N().training.failureRetention), outcome);
    const receipt = engine.formatVerifiedJudgementReceiptForPrompt(resolution);
    assert.match(receipt, /修为=冲关未成，修为已折损到已写入的进度/, outcome);
    assert.match(engine.describeJudgementOutcomeText(resolution), /折损/, `${outcome}：结果说明与数值同口径`);
    assert.match(result.facts[0], /折损/);
  }
  // 成功档、调息疗伤不加修为这一行
  assert.equal(engine.cultivationProgressNote(runJudged(realmSave(), solo('train'), 'success').resolution), '');
  assert.equal(engine.cultivationProgressNote(runJudged(realmSave(), solo('recover'), 'partial').resolution), '');
});

test('判定回执：档名与结果说明标成只给模型看、不得照抄；修炼各档回执除判定ID 外没有英文；指令同样写明', () => {
  for (const outcome of ['critical_failure', 'failure', 'partial', 'success']) {
    const { resolution } = runJudged(realmSave(), solo('train'), outcome);
    const receipt = engine.formatVerifiedJudgementReceiptForPrompt(resolution);
    assert.deepEqual(latinWords(receipt, resolution.id), [], `${outcome}：${receipt}`);
    assert.match(receipt, /结果档（只给你看）=/);
    assert.match(receipt, /结果说明（只给你看，不照抄）=/);
    assert.ok(receipt.includes(engine.JUDGEMENT_RECEIPT_NO_COPY), receipt);
    assert.ok(!/；结果=|结果文案=/.test(receipt), '不再以可照抄的「结果=」「结果文案=」给出');
  }
  assert.match(prompts.MODULE_NARRATIVE_SYSTEM_PROMPT, /结果档名和结果说明只供你理解成败，不照抄进正文/);
  assert.match(prompts.MODULE_NARRATIVE_SYSTEM_PROMPT, /不把写给自己的提示、备忘或自检（中英文都算）写进正文/);
  // 「不输出JSON」是格式名，保留；此外指令里没有英文
  assert.deepEqual(latinWords(prompts.MODULE_NARRATIVE_SYSTEM_PROMPT).filter(word => word !== 'JSON'), []);
});

test('MainGamePanel 拼给模型的回执：本地判定写结果档与修为说明并带不照抄要求；事件判定的结果档、开放世界类型写中文', () => {
  const panel = source('../src/components/dashboard/MainGamePanel.vue');
  const judged = panel.split('\n').find(row => row.includes('【本地判定已结算】判定ID='));
  assert.match(judged, /结果档（只给你看）=\$\{labels\.outcome\}/);
  assert.match(judged, /\$\{progressNote \? `修为=\$\{progressNote\}；` : ''\}/);
  assert.match(judged, /\$\{JUDGEMENT_RECEIPT_NO_COPY\}/);
  assert.match(panel, /const labels = judgementPromptLabels\(result\), progressNote = cultivationProgressNote\(result\);/);
  const event = panel.split('\n').find(row => row.includes('【本地事件判定已预结算】'));
  assert.match(event, /结果档（只给你看，正文不写档名）=\$\{JUDGEMENT_OUTCOME_LABELS\[result\.expectedOutcome\] \?\? result\.expectedOutcome\}/);
  assert.ok(!/结果=\$\{result\.expectedOutcome\}/.test(event), event);
  const openWorld = panel.split('\n').find(row => row.includes('【本地开放世界行动已预结算】'));
  assert.match(openWorld, /类型=\$\{OPEN_WORLD_KIND_LABELS\[resolvedOpenWorldAction\.kind\] \?\? resolvedOpenWorldAction\.kind\}/);
  for (const outcome of ['success', 'partial', 'failure']) assert.match(engine.JUDGEMENT_OUTCOME_LABELS[outcome], /^[一-龥]+$/, outcome);
});

test('行动门控：失败余波的原因写中文结果档；活跃门控给模型看的结果／范围写中文（写入格式那一行是指令协议，不动）', () => {
  const save = realmSave();
  runJudged(save, solo('train'), 'failure');
  const rows = save.系统.扩展.行动门控.recent;
  assert.ok(rows.length > 0);
  for (const row of rows) assert.deepEqual(latinWords(row.reason), [], row.reason);
  assert.match(rows.at(-1).reason, /本地判定：失败/);
  save.系统.扩展.行动门控.recent.push({ actionLabel: '翻墙', outcome: 'partial', scope: 'combat', reason: '被发现', effect: '守卫警觉', createdAtTurn: 0, ttlTurns: 99 });
  const promptText = actionGate.buildActionGatePrompt(save, 0);
  const active = promptText.split('\n').filter(line => /^\d+\. 动作=/.test(line));
  assert.ok(active.length >= 2, promptText);
  for (const line of active) assert.deepEqual(latinWords(line), [], line);
  assert.ok(active.some(line => /结果=部分成功,范围=交手/.test(line)), active.join('\n'));
});
