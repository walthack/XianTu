#!/usr/bin/env node
/**
 * 清羽 Demo 合并短语超上限（REPORT-8091-fbef6792 工单 ⑧，接 0896a594 对 s01_01 的做法）：
 * qingyuOpeningPlaytest.ts 的 overlayDemoActionIntent 把 Demo 短语并进内置 intentMatch，
 * s01_02 合并后 9 条、s01_03 与 s01_05 各 10 条，超校验上限 8（validateIntentMatch 判 invalid_range）。
 * Demo 不再给这三拍追加，两份并成一份 ≤8 条写进内置关（Demo 与正式开局同一份）：
 *   真机 69ab 全部输入都停在 s01_01，候选短语对真机原话 0 命中，只能按真机说法取舍——
 *   玩家写「带段强」「护住段强」「前往」，从不写「拉」「走进」；严格子串冗余的先删。
 *   s01_02 删「拉着段强躲」（与「带段强躲开」同一动作，真机只用「带段强」）；
 *   s01_03 删「上前查看伤者」（含「查看伤者」，命中集合完全被覆盖）、「看看那个伤兵」（口语重复，已有查看伤者／查看伤兵伤势）；
 *   s01_05 删「向王哲说明来历请他诊治」（11 字长句，「说明自己的来历」「请王哲诊治」已拆开覆盖）、「走进帅帐」（真机走动只说前往／去）。
 *   测试钉住的 见月霜、去帅帐、见王哲、请王哲诊治 都留着。
 * 同步写 canon-authority overlay（set，from＝改前内置值），自验把新 op 套到改前内置关等于新内置关，
 * 并按 sync-builtin-mods.mjs 同一算法（manifest.ids 顺序 sha256(id+文件全文) 前 12 位）重算 builtins/manifest.json version。幂等。
 * 用法：node scripts/dev/apply-s01-demo-intent-match.mjs [--check]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCanonAuthorityOps, applyCanonAuthorityOverlay } from '../canon-authority-overlay.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const DATA = `${root}src/modules/scenarioMods/builtins/data/`;
const BUILTIN = `${DATA}lcq.stage_01.json`;
const MANIFEST = `${root}src/modules/scenarioMods/builtins/manifest.json`;
const OVERLAY = `${root}mod-kit/canon-authority-overlays/lcq.stage_01.json`;
const ACTION_ID = 'advance_declared_objective';

/** 改前内置值（只认它才改）与合并后的目标值。 */
export const S01_DEMO_INTENT_MATCH = {
  'lcq.event.s01_02': {
    before: { matchAny: ['拉着段强躲', '带段强找掩护', '护住段强撤'], rejectIf: ['不管段强', '丢下段强', '袖手旁观'] },
    after: {
      matchAny: ['带段强找掩护', '护住段强撤', '带段强躲开', '拉段强避箭', '掩护段强', '寻找掩护', '躲开半兽人', '避开箭袭'],
      rejectIf: ['不管段强', '丢下段强', '袖手旁观'],
    },
  },
  'lcq.event.s01_03': {
    before: { matchAny: ['查看伤兵伤势', '扶起受伤军士', '救下受伤军士', '带伤兵离开'], rejectIf: ['不管伤兵', '不救伤者', '丢下伤者', '转身离开'] },
    after: {
      matchAny: ['查看伤兵伤势', '扶起受伤军士', '救下受伤军士', '带伤兵离开', '见月霜', '查看伤者', '扶住伤者', '救那个伤兵'],
      rejectIf: ['不管伤兵', '不救伤者', '丢下伤者', '转身离开'],
    },
  },
  'lcq.event.s01_05': {
    before: { matchAny: ['请王哲诊治', '让王哲诊治', '让王哲查看伤势', '向王哲说明来历请他诊治'], rejectIf: ['拒绝诊治', '隐瞒来历离开', '不让王哲查看'] },
    after: {
      matchAny: ['请王哲诊治', '让王哲诊治', '让王哲查看伤势', '去帅帐', '前往帅帐', '见王哲', '请他看伤', '说明自己的来历'],
      rejectIf: ['拒绝诊治', '隐瞒来历离开', '不让王哲查看'],
    },
  },
};

/** 按 scripts/sync-builtin-mods.mjs 的算法重算内置关 version。 */
export function builtinManifestVersion(manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))) {
  const hash = createHash('sha256');
  for (const id of manifest.ids) hash.update(id).update(readFileSync(`${DATA}${id}.json`, 'utf8'));
  return hash.digest('hex').slice(0, 12);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const check = process.argv.includes('--check');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const head = JSON.parse(readFileSync(BUILTIN, 'utf8'));
  const next = structuredClone(head);
  const pending = [];
  for (const [eventId, { before, after }] of Object.entries(S01_DEMO_INTENT_MATCH)) {
    const action = next.scenario.events.find(e => e.id === eventId)?.playerCompletionContract?.actions?.find(a => a.id === ACTION_ID);
    if (!action) throw new Error(`${eventId}/${ACTION_ID} 不存在`);
    if (same(action.intentMatch, after)) continue;
    if (!same(action.intentMatch, before)) throw new Error(`${eventId} 的 intentMatch 既不是改前值也不是目标值，请人工核对`);
    if (after.matchAny.length > 8 || after.rejectIf.length > 8) throw new Error(`${eventId} 目标值超 8 条`);
    action.intentMatch = structuredClone(after);
    pending.push(eventId);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!pending.length) {
    const version = builtinManifestVersion(manifest);
    if (version !== manifest.version) {
      if (check) { console.error(`manifest version 未按内容哈希更新：${manifest.version} → ${version}`); process.exit(1); }
      writeFileSync(MANIFEST, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
      console.log(`intentMatch 已是目标值；manifest version ${manifest.version} → ${version}`);
    } else console.log('s01_02/03/05 intentMatch 已是目标值，无需改动');
    process.exit(0);
  }
  if (check) { console.error(`尚未合并：${pending.join('、')}`); process.exit(1); }
  const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8'));
  const ops = buildCanonAuthorityOps(head, next);
  if (ops.length !== pending.length || ops.some(op => op.op !== 'set' || !/\.intentMatch(?:\.matchAny)?$/.test(op.path))) {
    throw new Error(`意外的 overlay 差异：${JSON.stringify(ops).slice(0, 400)}`);
  }
  const existing = new Set(overlay.ops.map(op => op.path));
  if (ops.some(op => existing.has(op.path))) throw new Error('overlay 已有同路径 op（二次套用会 source drift），请人工合并');
  overlay.ops.push(...ops);
  // 自验：新 op 套到改前内置关，必须与新内置关一致。
  const replay = structuredClone(head);
  applyCanonAuthorityOverlay(replay, { ...overlay, ops });
  if (!same(replay, next)) throw new Error('overlay 回放与新 builtins 不一致');
  writeFileSync(BUILTIN, `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(OVERLAY, `${JSON.stringify(overlay, null, 2)}\n`);
  const version = builtinManifestVersion(manifest);
  writeFileSync(MANIFEST, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  console.log(`已合并 ${pending.join('、')} 的 intentMatch，overlay 新增 ${ops.length} 条 op；manifest version ${manifest.version} → ${version}`);
}
