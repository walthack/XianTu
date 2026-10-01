import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';

import { loadTs } from './loadTs.mjs';

const STAGE_IDS = [
  'lcq.stage_04b_lingfei_baiyi_crisis',
  'lcq.stage_05b',
  'lcq.stage_07_qingyuan_jiankang',
];

const FUTURE_LEAK = /骨灰|失踪|五个承重|星月开库|八骏得讯|生还长养|死亡线|密送|萧遥逸|孟非卿|建康/;
const RESULT_LEAK = /骨灰|失踪|存活长养|死亡线|保证成功/;
const TECH_JARGON = /最终落账|这不是判定|启程尚未发生|不是物品到账|不是背包到账|尚未落账/;

const RECEIPT = {
  ashesDelivered: 'lcq.event.xiaoyaoyi_arrives.path.ashes_delivered',
  woundedEscorted: 'lcq.event.xiaoyaoyi_arrives.path.wounded_escorted',
  playerEscort: 'lcq.event.s07_05_eight_steeds_informed.path.player_escort',
  playerInvestigate: 'lcq.event.s07_05_eight_steeds_informed.path.player_investigate',
  estateAuthority: 'lcq.event.xiao_opens_resources.path.estate_authority',
  retainsAffairs: 'lcq.event.xiao_opens_resources.path.retains_affairs',
};

async function loadStages() {
  return Promise.all(STAGE_IDS.map(async id => JSON.parse(await readFile(
    new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url),
    'utf8',
  ))));
}

const runtimeOf = save => save.世界.状态.剧本模组;

async function api() {
  const playtest = await loadTs('../src/modules/scenarioMods/xingyuehuQuestPlaytest.ts');
  const experience = await loadTs('../src/modules/scenarioMods/xingyuehuQuestPlaytestExperience.ts');
  const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const strict = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const dataRepair = await loadTs('../src/utils/dataRepair.ts');
  return { ...playtest, ...experience, ...runtime, ...strict, ...dataRepair };
}

function takeAction(tools, save, actionId) {
  const action = tools.getCurrentStoryEventActions(save).find(item => item.actionId === actionId);
  assert.ok(action, `当前应提供动作 ${actionId}`);
  const result = tools.recordStoryEventStructuredAction(save, action);
  assert.equal(result.attempted, true, result.reason);
  return result;
}

function advance(tools, save) {
  return tools.advanceScenarioRuntime(save).saveData;
}

function depart(tools, save, mods) {
  const target = runtimeOf(save).nextStageReadyId;
  assert.ok(target, '当前小幕完成后应提供继续旅程');
  const result = tools.transitionToNextScenarioStage(save, mods);
  assert.equal(result.ok, true, result.reason);
  return result.saveData;
}

function visibleText(experience) {
  return [
    experience.stageLabel,
    experience.currentGoal,
    experience.whyNow,
    experience.continueJourneyHint,
    experience.choice?.listen.title,
    experience.choice?.listen.knownCost,
    experience.choice?.rescue.title,
    experience.choice?.rescue.knownCost,
    ...(experience.recap?.lines || []),
  ].filter(Boolean).join('\n');
}

async function reachFateChoice(tools, stages) {
  let save = tools.createXingyuehuQuestPlaytestSave(stages);
  takeAction(tools, save, 'hear_xieyi_biling_war_and_crown');
  runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
  takeAction(tools, save, 'answer_xieyi_yue_unfinished');
  save = depart(tools, advance(tools, save), stages);
  return save;
}

async function finishDeadRoute(tools, stages) {
  let save = await reachFateChoice(tools, stages);
  takeAction(tools, save, 'accept_entrustment');
  save = depart(tools, advance(tools, save), stages);
  takeAction(tools, save, 'deliver_ashes');
  save = advance(tools, save);
  takeAction(tools, save, 'report_death');
  save = advance(tools, save);
  takeAction(tools, save, 'hear_xingyue_support_dead');
  return advance(tools, save);
}

async function finishLongrestRoute(tools, stages) {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  let save = await reachFateChoice(tools, stages);
  const rescue = tools.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const issued = prepareEventActionJudgement(save, rescue, 20);
  const resolution = resolvePendingJudgement(save, issued.proposal.id, {
    currentTurn: 20,
    testOutcome: 'success',
    roll: () => 18,
  });
  tools.recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution });
  save = depart(tools, advance(tools, save), stages);
  takeAction(tools, save, 'escort_wounded');
  save = advance(tools, save);
  takeAction(tools, save, 'claim_investigate');
  save = advance(tools, save);
  takeAction(tools, save, 'hear_xingyue_support_longrest');
  return advance(tools, save);
}

function cloneSave(save) {
  return JSON.parse(JSON.stringify(save));
}

function recapText(experience) {
  return (experience.recap?.lines || []).join('\n');
}

function defaultStartViewSource(source) {
  return source
    .replace(/<details class="test-notes">[\s\S]*?<\/details>/, '')
    .replace(/<details class="short-playtest">[\s\S]*?<\/details>/, '');
}

async function compileVue(relativePath, id) {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = await readFile(fileUrl, 'utf8');
  const { descriptor, errors } = parse(source, { filename: fileUrl.pathname });
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id });
  const template = compileTemplate({
    id,
    filename: fileUrl.pathname,
    source: descriptor.template.content,
  });
  assert.deepEqual(template.errors, []);
  return { source, script, template };
}

test('初始目标与入口默认文案不泄漏后续命运或资源', async () => {
  const tools = await api();
  const stages = await loadStages();
  const save = tools.createXingyuehuQuestPlaytestSave(stages);
  const experience = tools.deriveXingyuehuQuestPlaytestExperience(save);

  assert.equal(experience.visible, true);
  assert.equal(experience.finished, false);
  assert.equal(experience.recap, null);
  assert.equal(experience.choice, null);
  assert.equal(experience.stageLabel, '海神殿');
  assert.match(experience.currentGoal, /旧战|朱狐冠/);
  assert.doesNotMatch(visibleText(experience), FUTURE_LEAK);
  assert.doesNotMatch(visibleText(experience), TECH_JARGON);
  assert.doesNotMatch(save.系统.历史.叙事[0].content, /骨灰|失踪|生还长养|星月开库/);
});

test('非试玩存档不显示试玩目标或结尾', async () => {
  const tools = await api();
  const save = tools.createMinimalSaveDataV3();
  const experience = tools.deriveXingyuehuQuestPlaytestExperience(save);
  assert.equal(experience.visible, false);
  assert.equal(experience.recap, null);
  assert.equal(experience.currentGoal, null);
  assert.equal(tools.buildXingyuehuQuestPlaytestFeedbackExport({ save, note: 'x' }), null);
});

test('阶段边界：旧战/命运完成后只提示继续旅程，不把下一幕当已抵达，也不展示结尾', async () => {
  const tools = await api();
  const stages = await loadStages();
  let save = tools.createXingyuehuQuestPlaytestSave(stages);
  takeAction(tools, save, 'hear_xieyi_biling_war_and_crown');
  runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
  takeAction(tools, save, 'answer_xieyi_yue_unfinished');
  save = advance(tools, save);

  const afterOldWar = tools.deriveXingyuehuQuestPlaytestExperience(save);
  assert.equal(afterOldWar.stageLabel, '海神殿');
  assert.equal(afterOldWar.recap, null);
  assert.match(afterOldWar.continueJourneyHint, /继续旅程/);
  assert.match(afterOldWar.continueJourneyHint, /你还在这里/);
  assert.doesNotMatch(visibleText(afterOldWar), /已抵达|建康|鬼王峒/);
  assert.doesNotMatch(visibleText(afterOldWar), TECH_JARGON);

  save = await reachFateChoice(tools, stages);
  takeAction(tools, save, 'accept_entrustment');
  save = advance(tools, save);
  const afterFate = tools.deriveXingyuehuQuestPlaytestExperience(save);
  assert.equal(afterFate.stageLabel, '鬼王峒');
  assert.equal(afterFate.finished, false);
  assert.equal(afterFate.recap, null);
  assert.equal(afterFate.choice, null);
  assert.match(afterFate.continueJourneyHint, /继续旅程/);
  assert.match(afterFate.continueJourneyHint, /你还在这里/);
  assert.doesNotMatch(visibleText(afterFate), /已抵达建康|星月开库/);
  assert.doesNotMatch(visibleText(afterFate), TECH_JARGON);
});

test('鬼王峒真正面对抉择时说明两种可知代价，且未判定不显示结果', async () => {
  const tools = await api();
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const stages = await loadStages();
  let save = await reachFateChoice(tools, stages);
  const facing = tools.deriveXingyuehuQuestPlaytestExperience(save);

  assert.ok(facing.choice);
  assert.match(facing.choice.listen.title, /陪他把话说完/);
  assert.match(facing.choice.listen.knownCost, /听完后回应这份托付/);
  assert.match(facing.choice.rescue.title, /施针/);
  assert.match(facing.choice.rescue.knownCost, /救治有风险/);
  assert.match(facing.choice.rescue.knownCost, /确认判定/);
  assert.match(facing.choice.rescue.knownCost, /神识/);
  assert.match(facing.choice.rescue.knownCost, /不保证人能留下来/);
  assert.doesNotMatch(visibleText(facing), RESULT_LEAK);
  assert.doesNotMatch(visibleText(facing), TECH_JARGON);
  assert.doesNotMatch(facing.choice.rescue.knownCost, /保证成功/);
  assert.equal(facing.recap, null);

  const rescue = tools.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  prepareEventActionJudgement(save, rescue, 20);
  const pending = tools.deriveXingyuehuQuestPlaytestExperience(save);
  assert.equal(pending.choice.pendingJudgement, true);
  assert.equal(pending.recap, null);
  assert.match(pending.currentGoal, /确认判定/);
  assert.match(pending.currentGoal, /成败还没发生/);
  assert.doesNotMatch(visibleText(pending), TECH_JARGON);
  assert.equal(runtimeOf(save).flags['character.xie_yi.status'], undefined);
});

test('两条真实 runtime 分支的结尾回顾有证据差异，刷新后相同，且不写失踪', async () => {
  const tools = await api();
  const stages = await loadStages();
  const deadSave = await finishDeadRoute(tools, stages);
  const liveSave = await finishLongrestRoute(tools, stages);
  const dead = tools.deriveXingyuehuQuestPlaytestExperience(deadSave);
  const live = tools.deriveXingyuehuQuestPlaytestExperience(liveSave);

  assert.equal(dead.finished, true);
  assert.equal(live.finished, true);
  assert.equal(dead.recap.fate, 'dead');
  assert.equal(dead.recap.fateLabel, '死亡');
  assert.match(dead.recap.reception, /骨灰/);
  assert.equal(dead.recap.playerClaim, null);
  assert.match(dead.recap.resourceAuthority, /遗留事务/);
  assert.match(dead.recap.heardResources, /另行领取/);
  assert.match(dead.recap.resourceAuthority, /不是已经领到的物品/);

  assert.equal(live.recap.fate, 'longrest');
  assert.equal(live.recap.fateLabel, '存活长养');
  assert.match(live.recap.reception, /密送/);
  assert.match(live.recap.playerClaim, /调查/);
  assert.match(live.recap.resourceAuthority, /仍归他本人/);
  assert.equal(live.recap.reception === dead.recap.reception, false);
  assert.doesNotMatch(visibleText(dead), /失踪/);
  assert.doesNotMatch(visibleText(live), /失踪|背包已到账|已获得资源/);
  assert.doesNotMatch(visibleText(dead), TECH_JARGON);
  assert.doesNotMatch(visibleText(live), TECH_JARGON);

  const deadReload = tools.deriveXingyuehuQuestPlaytestExperience(JSON.parse(JSON.stringify(deadSave)));
  const liveReload = tools.deriveXingyuehuQuestPlaytestExperience(JSON.parse(JSON.stringify(liveSave)));
  assert.deepEqual(deadReload.recap, dead.recap);
  assert.deepEqual(liveReload.recap, live.recap);
});

test('未完成试玩即使命运已落定也不展示结尾回顾', async () => {
  const tools = await api();
  const stages = await loadStages();
  let save = await reachFateChoice(tools, stages);
  takeAction(tools, save, 'accept_entrustment');
  save = depart(tools, advance(tools, save), stages);
  const experience = tools.deriveXingyuehuQuestPlaytestExperience(save);
  assert.equal(runtimeOf(save).flags['character.xie_yi.status'], 'dead');
  assert.equal(experience.finished, false);
  assert.equal(experience.recap, null);
  assert.equal(experience.stageLabel, '建康');
  assert.match(experience.currentGoal, /萧遥逸/);
});

test('反馈导出只含白名单字段，忽略外来密钥与档案', async () => {
  const tools = await api();
  const stages = await loadStages();
  const save = tools.createXingyuehuQuestPlaytestSave(stages);
  const payload = tools.buildXingyuehuQuestPlaytestFeedbackExport({
    save,
    tags: ['不知道做什么', '伪造标签', '节奏拖沓'],
    note: '不知道下一步该做什么',
    now: '2026-09-20T00:00:00.000Z',
    extras: {
      apiKey: 'secret-key',
      token: 'tok',
      角色: save.角色,
      叙事: save.系统.历史.叙事,
      saveData: save,
    },
  });

  assert.equal(payload.kind, 'xingyuehu-quest-playtest-feedback');
  assert.equal(payload.localOnly, true);
  assert.equal(payload.sentExternally, false);
  assert.deepEqual(payload.tags, ['不知道做什么', '节奏拖沓']);
  assert.equal(payload.note, '不知道下一步该做什么');
  assert.equal(payload.stageId, tools.XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID);
  assert.deepEqual(payload.activeEventIds, ['lcq.event.xieyi_biling_war']);
  assert.deepEqual(
    Object.keys(payload).sort(),
    [...tools.XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KEYS].sort(),
  );
  assert.deepEqual(tools.extraFeedbackExportKeys(payload), []);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /secret-key|\btok\b|apiKey|character\.xie_yi|叙事全文/);
  assert.equal('角色' in payload, false);
  assert.equal('saveData' in payload, false);
});

test('入口页默认不剧透，重置需确认，折叠说明才含测试清单', async () => {
  const { source, script, template } = await compileVue(
    '../src/views/XingyuehuQuestPlaytestStartView.vue',
    'xingyuehu-playtest-start',
  );
  const visible = defaultStartViewSource(source);
  assert.match(visible, /飞机落地|湿草|段强/);
  assert.match(visible, /近期目标/);
  assert.match(visible, /不覆盖正式角色/);
  assert.doesNotMatch(visible, /海神殿|五个承重|骨灰|失踪|星月开库|八骏得讯|生还长养|死亡线|萧遥逸|孟非卿/);
  assert.match(source, /<details class="test-notes">/);
  assert.match(source, /<details class="short-playtest">/);
  assert.match(source, /将重置星月湖试玩进度；已有手动存档会保留/);
  assert.match(source, /正式角色存档不会被改动/);
  assert.match(script.content, /if \(hasExistingShort\.value\)/);
  assert.match(script.content, /shortResetGuard\.value = true/);
  assert.match(script.content, /if \(hasExistingLanding\.value\)/);
  assert.match(script.content, /landingResetGuard\.value = true/);
  assert.ok(template.code.includes('confirm-reset-xingyuehu-playtest') || source.includes('confirm-reset-xingyuehu-playtest'));
  assert.ok(source.includes('confirm-reset-xingyuehu-landing-playtest'));
  assert.match(source, /data-testid="start-xingyuehu-quest-playtest"/);
  assert.match(source, /data-testid="start-xingyuehu-landing-playtest"/);
});

test('试玩 HUD 组件可被 Vue 编译，反馈默认收起且不强制弹窗', async () => {
  const { source, script, template } = await compileVue(
    '../src/components/dashboard/XingyuehuQuestPlaytestHud.vue',
    'xingyuehu-playtest-hud',
  );
  assert.match(source, /data-testid="xingyuehu-playtest-hud"/);
  assert.match(source, /<details class="feedback"/);
  assert.match(source, /不会发送到外部/);
  assert.doesNotMatch(source, /window\.alert|dialog open|强制/);
  assert.match(source, /max-height:\s*min\(42vh,\s*22rem\)/);
  assert.match(source, /overflow-y:\s*auto/);
  assert.match(source, /min-height:\s*0/);
  assert.match(source, /flex:\s*0 1 auto/);
  assert.match(source, /清除／新建本条反馈/);
  assert.doesNotMatch(source, TECH_JARGON);
  assert.match(script.content, /deriveXingyuehuQuestPlaytestExperience/);
  assert.match(script.content, /buildXingyuehuQuestPlaytestFeedbackExport/);
  assert.match(script.content, /captureXingyuehuQuestPlaytestFeedbackContext/);
  assert.match(source, /function startNewFeedback/);
  assert.match(source, /watch\(\[note, selectedTags\], lockFeedbackContext/);
  const exportFn = source.match(/function exportFeedback\(\)[\s\S]*?\nfunction startNewFeedback/)?.[0] || '';
  assert.match(exportFn, /context: feedbackContext\.value/);
  assert.doesNotMatch(exportFn, /note\.value\s*=/);
  assert.doesNotMatch(exportFn, /selectedTags\.value\s*=/);
  assert.doesNotMatch(exportFn, /feedbackContext\.value\s*=\s*null/);
  assert.match(source, /feedbackContext\.value = null/);
  assert.match(template.code, /experience\.visible/);
  const mainPanel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(mainPanel, /XingyuehuQuestPlaytestHud/);
});

test('冲突命运与互斥回执 fail-closed，未结束不给回顾', async () => {
  const tools = await api();
  const stages = await loadStages();
  const deadSave = await finishDeadRoute(tools, stages);
  const liveSave = await finishLongrestRoute(tools, stages);

  const fateSave = await reachFateChoice(tools, stages);
  const unfinished = tools.deriveXingyuehuQuestPlaytestExperience(fateSave);
  assert.equal(unfinished.finished, false);
  assert.equal(unfinished.recap, null);
  assert.equal(unfinished.choice != null, true);

  const unfinishedConflict = cloneSave(fateSave);
  runtimeOf(unfinishedConflict).flags['character.xie_yi.status'] = 'dead';
  runtimeOf(unfinishedConflict).flags['branch.lcq.if_xieyi_longrest.active'] = true;
  const unfinishedConflictExp = tools.deriveXingyuehuQuestPlaytestExperience(unfinishedConflict);
  assert.equal(unfinishedConflictExp.finished, false);
  assert.equal(unfinishedConflictExp.recap, null);
  assert.doesNotMatch(visibleText(unfinishedConflictExp), /死亡|存活长养/);

  const fateConflict = cloneSave(deadSave);
  runtimeOf(fateConflict).flags['branch.lcq.if_xieyi_longrest.active'] = true;
  const fateConflictExp = tools.deriveXingyuehuQuestPlaytestExperience(fateConflict);
  assert.equal(fateConflictExp.finished, true);
  assert.equal(fateConflictExp.recap, null);
  assert.doesNotMatch(visibleText(fateConflictExp), /死亡|存活长养|骨灰|密送/);

  const receptionConflict = cloneSave(deadSave);
  runtimeOf(receptionConflict).pathReceipts[RECEIPT.woundedEscorted] = true;
  const receptionExp = tools.deriveXingyuehuQuestPlaytestExperience(receptionConflict);
  assert.equal(receptionExp.recap.fate, 'dead');
  assert.equal(receptionExp.recap.reception, null);
  assert.doesNotMatch(recapText(receptionExp), /骨灰|密送/);
  assert.match(recapText(receptionExp), /谢艺：死亡/);

  const claimConflict = cloneSave(liveSave);
  runtimeOf(claimConflict).pathReceipts[RECEIPT.playerEscort] = true;
  const claimExp = tools.deriveXingyuehuQuestPlaytestExperience(claimConflict);
  assert.equal(claimExp.recap.fate, 'longrest');
  assert.equal(claimExp.recap.playerClaim, null);
  assert.doesNotMatch(recapText(claimExp), /护送|调查/);
  assert.match(recapText(claimExp), /密送/);

  const authorityConflict = cloneSave(deadSave);
  runtimeOf(authorityConflict).pathReceipts[RECEIPT.retainsAffairs] = true;
  const authorityExp = tools.deriveXingyuehuQuestPlaytestExperience(authorityConflict);
  assert.equal(authorityExp.recap.fate, 'dead');
  assert.equal(authorityExp.recap.resourceAuthority, null);
  assert.doesNotMatch(recapText(authorityExp), /遗留事务|仍归他本人/);
  assert.match(recapText(authorityExp), /骨灰/);
});

test('反馈首次编辑锁定最小上下文，导出不改字且不跟到后一阶段', async () => {
  const tools = await api();
  const stages = await loadStages();
  const startSave = tools.createXingyuehuQuestPlaytestSave(stages);
  const laterSave = await reachFateChoice(tools, stages);
  const context = tools.captureXingyuehuQuestPlaytestFeedbackContext({
    save: startSave,
    now: '2026-09-20T01:00:00.000Z',
  });

  assert.ok(context);
  assert.equal(context.stageId, tools.XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID);
  assert.deepEqual(context.activeEventIds, ['lcq.event.xieyi_biling_war']);
  assert.equal(context.capturedAt, '2026-09-20T01:00:00.000Z');
  assert.deepEqual(Object.keys(context).sort(), ['activeEventIds', 'capturedAt', 'stageId']);
  assert.doesNotMatch(JSON.stringify(context), /角色|叙事全文|saveData|apiKey|character\.xie_yi/);

  const note = '在海神殿就开始写，到鬼王峒才导出';
  const payload = tools.buildXingyuehuQuestPlaytestFeedbackExport({
    save: laterSave,
    tags: ['节奏拖沓'],
    note,
    now: '2026-09-20T02:00:00.000Z',
    context,
  });
  assert.equal(payload.stageId, tools.XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID);
  assert.deepEqual(payload.activeEventIds, ['lcq.event.xieyi_biling_war']);
  assert.equal(payload.exportedAt, '2026-09-20T01:00:00.000Z');
  assert.equal(payload.note, note);
  assert.deepEqual(payload.tags, ['节奏拖沓']);
  assert.deepEqual(
    Object.keys(payload).sort(),
    [...tools.XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KEYS].sort(),
  );

  const tagOnly = tools.buildXingyuehuQuestPlaytestFeedbackExport({
    save: laterSave,
    tags: ['不知道做什么'],
    note: '',
    now: '2026-09-20T03:00:00.000Z',
    context,
  });
  assert.equal(tagOnly.stageId, tools.XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID);
  assert.equal(tagOnly.note, '');
  assert.deepEqual(tagOnly.tags, ['不知道做什么']);

  const unlocked = tools.buildXingyuehuQuestPlaytestFeedbackExport({
    save: laterSave,
    note,
    now: '2026-09-20T04:00:00.000Z',
  });
  assert.equal(unlocked.stageId, tools.XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID);
  assert.equal(unlocked.note, note);

  assert.equal(tools.captureXingyuehuQuestPlaytestFeedbackContext({ save: tools.createMinimalSaveDataV3() }), null);
});
