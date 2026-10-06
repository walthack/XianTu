#!/usr/bin/env node
// 地点 id 校验关（canon:build 独立一关，主策划 2026-10-03 裁定 #5）。
// 读 builtins（「内置 mod 同步」之后即与 generated 一致），跑 auditLocationIds + 南荒 rail 强制路线覆盖。
// 已登记在已知问题名单里的只警告；新出现的直接失败；别名循环/自指/别名目标不存在/归一后事件引用失效不许豁免。
// 用法：node scripts/validate-location-ids.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = new URL('..', import.meta.url);
export const DATA_DIR = new URL('src/modules/scenarioMods/builtins/data/', root);
// 放在 mod-kit 根下：mod-kit/generated/deepseek-v4-flash/* 被 .gitignore 忽略，名单必须能入库。
export const KNOWN_ISSUES_FILE = new URL('mod-kit/location-id-known-issues.json', root);

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': fileURLToPath(new URL('src', root)) },
});
const ts = path => jiti.import(fileURLToPath(new URL(path, root)));

export function loadStageLocationData(dir = DATA_DIR) {
  return readdirSync(dir).filter(file => file.endsWith('.json')).map(file => {
    const mod = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const events = mod.scenario?.events || [];
    return {
      file,
      modId: mod.manifest?.id,
      locations: mod.canon?.locations || [],
      continents: mod.world?.continents || [],
      openingLocationId: mod.scenario?.opening?.locationId,
      events,
      eventLocations: [
        ...events.filter(event => event.locationId).map(event => ({ eventId: event.id, locationId: event.locationId })),
        ...(mod.scenario?.opening?.locationId ? [{ eventId: 'opening', locationId: mod.scenario.opening.locationId }] : []),
      ],
    };
  });
}

/** 南荒 rail 上每一次地点变化都要有声明过的强制路线（前一拍完成或转关触发）。 */
export async function auditNanhuangRailRoutes(stages) {
  const { getCanonRailProfile } = await ts('src/modules/scenarioMods/canonRail.ts');
  const { NANHUANG_STAGE_IDS, QINGYU_NANHUANG_DEFINITION: def } = await ts('src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts');
  const { locationWithin } = await ts('src/modules/scenarioMods/travel/locationIds.ts');
  const { worldLocationIdOf, forcedRoutesFor } = await ts('src/modules/scenarioMods/openWorldSlice.ts');
  const issues = [];
  for (const stageId of NANHUANG_STAGE_IDS) {
    // stage_02只为提前建立行旅账；五原军帐/市集仍由既有开放世界校验负责。
    if (stageId === "lcq.stage_02") continue;
    const stage = stages.find(item => item.modId === stageId);
    if (!stage) continue;
    const rail = getCanonRailProfile({ modId: stageId })?.orderedEventIds || [];
    let current = stage.openingLocationId;
    let previous;
    for (const eventId of rail) {
      const target = stage.events.find(event => event.id === eventId)?.locationId;
      if (target && current && !locationWithin(current, target)) {
        const routes = previous ? forcedRoutesFor(def, { afterEventDone: previous }) : [];
        const covered = routes.some(route => locationWithin(worldLocationIdOf(def, route.toZoneId), target));
        if (!covered) {
          issues.push({ kind: 'rail_move_undeclared', ids: [eventId], detail: `${stageId}：${previous || '开场'} → ${eventId}（${current} → ${target}）没有声明强制路线` });
        }
      }
      if (target) current = target;
      previous = eventId;
    }
  }
  return issues;
}

export async function evaluateLocationGate({ stages = loadStageLocationData(), known } = {}) {
  const { auditLocationIds, locationIssueKey, canonicalLocationId, UNWAIVABLE_LOCATION_ISSUES } = await ts('src/modules/scenarioMods/travel/locationIds.ts');
  const registry = known ?? JSON.parse(readFileSync(KNOWN_ISSUES_FILE, 'utf8')).issues;
  const issues = [...auditLocationIds(stages), ...await auditNanhuangRailRoutes(stages)];
  // Identity aliases rename an existing debt key; they do not waive new geometry errors.
  const normalizedKey=(entry)=>entry.kind==='shared_anchor'?`${entry.kind}:${[...new Set(entry.locationIds.map(id=>canonicalLocationId(id)))].sort().join('+')}`:entry.key;
  const knownKeys = new Map(registry.map(entry => [normalizedKey(entry), entry]));
  const failures = [];
  const warnings = [];
  for (const issue of issues) {
    const key = locationIssueKey(issue);
    if (UNWAIVABLE_LOCATION_ISSUES.includes(issue.kind)) failures.push({ ...issue, key, reason: '不许豁免' });
    else if (knownKeys.has(key)) warnings.push({ ...issue, key });
    else failures.push({ ...issue, key, reason: '未登记的新问题' });
  }
  const live = new Set(issues.map(issue => locationIssueKey(issue)));
  const stale = registry.filter(entry => !live.has(normalizedKey(entry)));
  const invalidEntries = registry.filter(entry => !entry.key || !entry.kind || !entry.locationIds?.length || !entry.reason || !entry.closeWhen
    || UNWAIVABLE_LOCATION_ISSUES.includes(entry.kind));
  return { failures, warnings, stale, invalidEntries };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { failures, warnings, stale, invalidEntries } = await evaluateLocationGate();
  for (const item of warnings) console.warn(`⚠ 已登记：${item.key} — ${item.detail}`);
  for (const entry of stale) console.warn(`⚠ 名单项已不再出现，可关闭：${entry.key}`);
  for (const entry of invalidEntries) console.error(`✖ 名单项不合规（缺字段或属不许豁免类型）：${entry.key || JSON.stringify(entry)}`);
  for (const item of failures) console.error(`✖ ${item.reason}：${item.key} — ${item.detail}`);
  console.error(`地点 id 校验：失败 ${failures.length + invalidEntries.length}，已登记警告 ${warnings.length}，可关闭 ${stale.length}`);
  process.exit(failures.length || invalidEntries.length ? 1 : 0);
}
