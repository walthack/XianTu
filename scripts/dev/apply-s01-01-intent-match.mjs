#!/usr/bin/env node
/**
 * 真机 REPORT-8091-69ab6bdd / cd167d7a（stage01 B16「见段强」卡住）：s01_01 的完成合同是 objective_action，
 * 只有点「主线 行动」按钮或自由输入命中 intentMatch 才落账；s01_01 是 stage01 唯一没有 intentMatch 的拍，
 * 玩家打「护着段强冲向秦军阵线」「滚入盾阵后撤」这类正合目标的话 19 回合都不推进。
 *
 * 本脚本给 s01_01 的 advance_declared_objective 补 intentMatch（≤8 条），
 * 同步写 canon-authority overlay（insertKeys，canon:build 从生成源重建时保留），幂等。
 * 2026-10-31 第二版：fbef6792 首版 8 条与清羽 Demo 的 s01_01 覆写合并后成 11 条（超校验上限 8）。
 * Demo 不再给 s01_01 追加短语，两份并成一份 8 条：留真机 69ab A1–B15 实际命中的（护住段强、秦军阵线、盾阵）、
 * Demo 开场三个建议各自的命中词（确认段强、弄清这片草原、观察四周）和主线按钮文案（稳住自己、弄清身在何处）；
 * 删 0 命中且与上面重叠的找掩体、查看段强、处理落地。首版已落盘时原地改 overlay 那条 op 的 entries。
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
  matchAny: ['稳住自己', '弄清身在何处', '弄清这片草原', '观察四周', '确认段强', '护住段强', '秦军阵线', '盾阵'],
  rejectIf: ['不管段强', '丢下段强'],
};
/** 已落盘的旧版（fbef6792 首版），只认它才原地升级。 */
export const S01_01_INTENT_MATCH_V1 = {
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
const upgrade = JSON.stringify(action.intentMatch) === JSON.stringify(S01_01_INTENT_MATCH_V1);
if (action.intentMatch && !upgrade) throw new Error('s01_01 已有不同的 intentMatch，请人工核对后再改');
if (check) { console.error(upgrade ? 's01_01 intentMatch 仍是首版' : 's01_01 尚未补 intentMatch'); process.exit(1); }
const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8'));
const OP_PATH = `scenario.events[id=${EVENT_ID}].playerCompletionContract.actions[id=${ACTION_ID}]`;
if (upgrade) {
  // 同一路径不能再追加 op（二次套用会 source drift）：改首版那条 insertKeys 的 entries，builtins 原位换值（键序不变）。
  const op = overlay.ops.find(item => item.op === 'insertKeys' && item.path === OP_PATH);
  if (!op || JSON.stringify(op.entries?.intentMatch) !== JSON.stringify(S01_01_INTENT_MATCH_V1)) throw new Error('overlay 首版 op 不在或已漂移');
  action.intentMatch = structuredClone(S01_01_INTENT_MATCH);
  op.entries.intentMatch = structuredClone(S01_01_INTENT_MATCH);
  const replay = structuredClone(head);
  delete replay.scenario.events.find(e => e.id === EVENT_ID).playerCompletionContract.actions.find(a => a.id === ACTION_ID).intentMatch;
  applyCanonAuthorityOverlay(replay, { ...overlay, ops: [op] });
  if (JSON.stringify(replay) !== JSON.stringify(next)) throw new Error('overlay 回放与新 builtins 不一致');
  writeFileSync(BUILTIN, JSON.stringify(next, null, 2) + '\n');
  writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n');
  console.log(`已把 ${EVENT_ID} intentMatch 由首版升级为第二版，overlay 原地改 1 条 op：${OP_PATH}`);
  process.exit(0);
}
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
overlay.ops.push(...ops);
// 自验：把新 op 套到改前 builtins 上，必须与新 builtins 一致。
const replay = structuredClone(head);
applyCanonAuthorityOverlay(replay, { ...overlay, ops });
if (JSON.stringify(replay) !== JSON.stringify(next)) throw new Error('overlay 回放与新 builtins 不一致');
writeFileSync(BUILTIN, JSON.stringify(next, null, 2) + '\n');
writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n');
console.log(`已补 ${EVENT_ID} intentMatch，overlay 新增 ${ops.length} 条 op：${ops[0].path}`);
