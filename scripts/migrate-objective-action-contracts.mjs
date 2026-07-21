#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const books = ['qingyu', 'yunlong', 'yange'];

// 裁定 #61/#62：来源或顺序未复核的隔离关不得被批处理重新接回默认 Rail。
const isolatedStageIds = new Set([
  'lcq.stage_03',
  'lcq.stage_05',
  'lcq.stage_06',
  'lyg.ganlu_bian',
  'lyg.shixiang_ambush',
  'lyl.lin_an_black_sea',
  'lyl.luoyang_coup',
  'lyl.taiquan_expedition',
]);

function hasOpportunityContract(event) {
  return (event.worldActor?.opportunities || []).some(opportunity => opportunity.completionContract);
}

function hasStandardCompletion(event) {
  return event.completion?.length === 1
    && event.completion[0]?.operator === 'eq'
    && event.completion[0]?.value === true
    && event.completion[0]?.path?.startsWith('flags.');
}

function eligible(stageId, event) {
  return !isolatedStageIds.has(stageId)
    && !event.playerCompletionContract
    && !hasOpportunityContract(event)
    && typeof event.objective === 'string'
    && event.objective.trim().length > 0
    && !(event.completionEvidence || []).length
    && hasStandardCompletion(event);
}

function contractFor(event) {
  const objective = event.objective.trim();
  return {
    kind: 'objective_action',
    settleOn: ['success'],
    actions: [{
      id: 'advance_declared_objective',
      label: objective,
      actionText: `我按当前主线目标行动：${objective}`,
      timeCost: 1,
      outcomeText: {
        success: `你已亲自执行“${objective}”；事件完成真值将由本地引擎落账。`,
        partial: '该动作类型不产生 partial；若需要部分成功，必须改用专门的本地判定合同。',
        failure: '该动作类型不产生 failure；若需要失败与重试，必须改用专门的本地判定合同。',
      },
    }],
  };
}

const summary = { eligible: 0, changedStages: 0, byBook: {}, excludedIsolated: 0, remaining: 0 };
for (const book of books) {
  const directory = path.join(root, 'mod-kit/generated/deepseek-v4-flash', book, 'stages');
  for (const filename of fs.readdirSync(directory).filter(item => item.endsWith('.json')).sort()) {
    const target = path.join(directory, filename);
    const stage = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!stage.manifest?.id || !Array.isArray(stage.scenario?.events)) continue;
    let touched = false;
    for (const event of stage.scenario.events) {
      const otherwiseEligible = !event.playerCompletionContract
        && !hasOpportunityContract(event)
        && typeof event.objective === 'string'
        && event.objective.trim().length > 0
        && !(event.completionEvidence || []).length
        && hasStandardCompletion(event);
      if (otherwiseEligible && isolatedStageIds.has(stage.manifest.id)) summary.excludedIsolated++;
      if (!eligible(stage.manifest.id, event)) continue;
      summary.eligible++;
      summary.byBook[book] = (summary.byBook[book] || 0) + 1;
      if (apply) event.playerCompletionContract = contractFor(event);
      touched = true;
    }
    if (apply && touched) {
      fs.writeFileSync(target, `${JSON.stringify(stage, null, 2)}\n`);
      summary.changedStages++;
    }
  }
}

for (const book of books) {
  const directory = path.join(root, 'mod-kit/generated/deepseek-v4-flash', book, 'stages');
  for (const filename of fs.readdirSync(directory).filter(item => item.endsWith('.json')).sort()) {
    const stage = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    if (!stage.manifest?.id || !Array.isArray(stage.scenario?.events)) continue;
    summary.remaining += stage.scenario.events.filter(event =>
      !event.playerCompletionContract && !hasOpportunityContract(event)).length;
  }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary }, null, 2));
