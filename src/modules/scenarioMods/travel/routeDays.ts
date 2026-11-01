/**
 * 两地路程天数（REPORT-8091-f76e07a7 P1-2）：罗盘移动（runtime 的 travel:<地点> 动作）与地图国内出行同一口径——
 * 直线坐标距离 × crossCountryTravel.domesticRepresentative.coordinateLi ÷ crossCountryTravel.liPerDay，向上取整。
 * 只算同一国别之内、且至少一日路程的移动；同城挪步、跨国（另有地图与剧情转场口径）返回 undefined，由调用方沿用原耗时。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import locations from '../../../../mod-kit/entity-catalog/locations.json';
import { canonicalLocationId } from './locationIds';

const definitionOf = (id: string): any => locations.entries.find(e => canonicalLocationId(e.id) === id)?.definition;

export function domesticTravelDays(fromId: string | undefined, toId: string | undefined): number | undefined {
  const from = canonicalLocationId(fromId), to = canonicalLocationId(toId);
  if (!from || !to || from === to) return undefined;
  const a = definitionOf(from), b = definitionOf(to);
  if (!a?.country || a.country !== b?.country || !a.coordinates || !b?.coordinates) return undefined;
  const cfg = (GAME_NUMBERS as any).crossCountryTravel;
  const li = Math.hypot(b.coordinates.x - a.coordinates.x, b.coordinates.y - a.coordinates.y) * cfg.domesticRepresentative.coordinateLi;
  if (li < cfg.liPerDay) return undefined;
  return Math.min(cfg.dayCap, Math.ceil(li / cfg.liPerDay));
}

/** 已知同国两点的移动；不把跨国剧情转场套入国内片刻规则。 */
export function isDomesticTravel(fromId: string | undefined, toId: string | undefined): boolean {
  const from = canonicalLocationId(fromId), to = canonicalLocationId(toId);
  if (!from || !to || from === to) return false;
  const a = definitionOf(from), b = definitionOf(to);
  return !!a?.country && a.country === b?.country;
}
