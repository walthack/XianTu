/**
 * 冰蛊（状态 poison.ice_gu，效果 qiCap）与剧情来源状态。
 * - syncStoryStatuses：状态目录里带 storyApply 的状态，剧情旗标为真（或当前剧本段在 stages 里）、解除旗标都没为真时自动挂到主角身上（每回合由叙事兜底入口调用）。
 *   解除走状态目录的 remove（剧情旗标），由 pruneSceneInjuries 统一清掉。
 * - qiCapOf：主角身上有 qiCap 效果时的可用真气上限 = 灵气.上限 × GAME_NUMBERS.status.bingGu.qiCapRatio。
 * - enforceQiCap：qiActions 里的自由行动结算后，当前真气超过上限＝强行超上限运功，用这次判定的骰面做一次寒气反噬检定。
 * 本文件不写数值，全部来自 GAME_NUMBERS.status.bingGu。
 */
import type { SaveData } from '@/types/game';
import type { JudgementResolution } from '@/utils/judgementEngine';
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { STATUS_CATALOG } from '../../sceneModule/statuses';
import { pruneSceneInjuries } from '../../sceneModule/host/injuries';
import { actorStatusRecords } from '../actorStatusRead';
import { applyActorStatus } from './actorStatus';
import { factText, type FactSlots } from './facts';

type BingGuConfig = { qiCapRatio: number; qiActions: string[]; backlash: { dc: number; hpLossRatio: number; failStatus?: string } };
const config = (): BingGuConfig => (GAME_NUMBERS.status as any).bingGu;
const playerIdOf = (save: SaveData): string | undefined => (save as any)?.世界?.状态?.剧本模组?.opening?.playerCharacterId;
const flagsOf = (save: SaveData): Record<string, unknown> => (save as any)?.世界?.状态?.剧本模组?.flags || {};

/** 剧情来源状态补挂；返回这次新挂上的状态 id。 */
export function syncStoryStatuses(save: SaveData): string[] {
  const playerId = playerIdOf(save);
  if (!playerId || !(save as any)?.元数据?.时间) return [];
  pruneSceneInjuries(save);
  const flags = flagsOf(save), added: string[] = [];
  for (const def of STATUS_CATALOG) {
    const apply = def.storyApply;
    if (!apply) continue;
    const stage = (save as any)?.世界?.状态?.剧本模组?.modId;
    if (!(apply.flags || []).some(flag => flags[flag] === true) && !(apply.stages || []).includes(stage)) continue;
    if ((def.remove || []).some(rule => rule.kind === 'story' && flags[rule.flag] === true)) continue;
    if (actorStatusRecords(save, playerId).some(row => row.statusId === def.id)) continue;
    if (applyActorStatus(save, playerId, def.id, { sourceId: `story.${def.id}`, minutes: null }).ok) added.push(def.id);
  }
  return added;
}

/** 主角此刻的可用真气上限；没有压上限的状态时为 undefined。 */
export function qiCapOf(save: SaveData): number | undefined {
  const playerId = playerIdOf(save), qi = (save as any)?.角色?.属性?.灵气;
  if (!playerId || !qi || !(Number(qi.上限) > 0)) return undefined;
  const capped = actorStatusRecords(save, playerId).some(row => (row.effects || []).some(effect => effect.kind === 'qiCap'));
  return capped ? Math.floor(Number(qi.上限) * config().qiCapRatio) : undefined;
}

/** 可用真气：当前值与压低后的上限取小。 */
export function availableQi(save: SaveData): number {
  const current = Number((save as any)?.角色?.属性?.灵气?.当前) || 0, cap = qiCapOf(save);
  return cap === undefined ? current : Math.min(current, cap);
}

export const isQiAction = (actionClass: string, variant: string): boolean => config().qiActions.includes(`${actionClass}.${variant}`);

/** 强行超上限运功的寒气反噬：骰面 < dc 失败，扣气血并挂 failStatus；不论成败真气压回上限。返回给叙事的事实行。 */
export function enforceQiCap(save: SaveData, resolution: JudgementResolution | undefined, slots: FactSlots): string[] {
  const cap = qiCapOf(save), qi = (save as any)?.角色?.属性?.灵气;
  if (cap === undefined || !(Number(qi.当前) > cap)) return [];
  qi.当前 = cap;
  const { dc, hpLossRatio, failStatus } = config().backlash, face = Number(resolution?.roll) || 0;
  if (face >= dc) return [factText('bingGu', 'backlash_pass', slots)];
  const hp = (save as any)?.角色?.属性?.气血;
  if (hp && Number(hp.上限) > 0 && hpLossRatio > 0) {
    const keep = GAME_NUMBERS.combat.woundRules.hp.keepHp;
    hp.当前 = Math.max(Math.min(keep, Number(hp.当前) || 0), (Number(hp.当前) || 0) - Math.max(1, Math.round(Number(hp.上限) * hpLossRatio)));
  }
  const playerId = playerIdOf(save);
  if (failStatus && playerId) applyActorStatus(save, playerId, failStatus, { sourceId: 'bingGu.backlash' });
  return [factText('bingGu', 'backlash_fail', slots)];
}
