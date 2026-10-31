#!/usr/bin/env node
/**
 * 真机 REPORT-8091-69ab6bdd / cd167d7a（stage01 B16「见段强」卡住）：s01_01 的完成合同是 objective_action，
 * 只有点「主线 行动」按钮或自由输入命中 intentMatch 才落账；s01_01 是 stage01 唯一没有 intentMatch 的拍，
 * 玩家打「护着段强冲向秦军阵线」「滚入盾阵后撤」这类正合目标的话 19 回合都不推进。
 *
 * 本脚本给 s01_01 的 advance_declared_objective 补 intentMatch（≤8 条；与清羽 Demo 覆写合并后仍 ≤8），
 * 同步写 canon-authority overlay（insertKeys，canon:build 从生成源重建时保留），幂等。
 * 用法：node scripts/dev/apply-s01-01-intent-match.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCanonAuthorityOps, applyCanonAuthorityOverlay } from '../canon-authority-overlay.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const BUILTIN = `${root}src/modules/scenarioMods/builtins/data/lcq.stage_01.json`;
const OVERLAY = `${root}mod-kit/canon-authority-overlays/lcq.stage_01.json`;
const EVENT_ID = 'lcq.event.s01_01';
const ACTION_ID = 'advance_declared_objective';
export const S01_01_INTENT_MATCH = {
  // 目标＝稳住自己、弄清身在何处：开场在草原上护着段强找掩护、奔向秦军阵线／盾阵都是在执行它。
  matchAny: ['稳住自己', '弄清身在何处', '观察四周', '找掩体', '确认段强', '护住段强', '秦军阵线', '盾阵'],
  rejectIf: ['不管段强', '丢下段强'],
};

const check = process.argv.includes('--check');
const head = JSON.parse(readFileSync(BUILTIN, 'utf8'));
const next = structuredClone(head);
const action = next.scenario.events.find(e => e.id === EVENT_ID)?.playerCompletionContract?.actions?.find(a => a.id === ACTION_ID);
if (!action) throw new Error(`${EVENT_ID}/${ACTION_ID} 不存在`);
if (JSON.stringify(action.intentMatch) === JSON.stringify(S01_01_INTENT_MATCH)) {
  console.log('s01_01 intentMatch 已是目标值，无需改动');
  process.exit(0);
}
if (action.intentMatch) throw new Error('s01_01 已有不同的 intentMatch，请人工核对后再改');
if (check) { console.error('s01_01 尚未补 intentMatch'); process.exit(1); }
// 键序与 s01_02–06 一致：timeCost 之后、outcomeText 之前。
const ordered = {};
for (const [key, value] of Object.entries(action)) {
  ordered[key] = value;
  if (key === 'timeCost') ordered.intentMatch = structuredClone(S01_01_INTENT_MATCH);
}
for (const key of Object.keys(action)) delete action[key];
Object.assign(action, ordered);

const ops = buildCanonAuthorityOps(head, next);
if (ops.length !== 1 || ops[0].op !== 'insertKeys') throw new Error(`意外的 overlay 差异：${JSON.stringify(ops).slice(0, 300)}`);
const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8'));
overlay.ops.push(...ops);
// 自验：把新 op 套到改前 builtins 上，必须与新 builtins 一致。
const replay = structuredClone(head);
applyCanonAuthorityOverlay(replay, { ...overlay, ops });
if (JSON.stringify(replay) !== JSON.stringify(next)) throw new Error('overlay 回放与新 builtins 不一致');
writeFileSync(BUILTIN, JSON.stringify(next, null, 2) + '\n');
writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n');
console.log(`已补 ${EVENT_ID} intentMatch，overlay 新增 ${ops.length} 条 op：${ops[0].path}`);
