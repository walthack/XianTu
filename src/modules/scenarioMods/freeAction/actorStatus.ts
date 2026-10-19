/**
 * 自由行动路径往角色身上写状态：按状态 id、按角色 id（含敌人个体的实例 id），写进 injuries.ts 的结构化伤势。
 * - 状态定义（效果、外貌标签、下限计数、是否永久）全部来自状态目录；本文件不写数值，上限与时长来自 GAME_NUMBERS.status。
 * - 敌人种类 id 一律拒绝：伤势只写个体（实例 id），从不写回种类。
 * - 永久伤残（def.permanent）写进 statusRecords.disabilities，不按时间消退。
 * - 带 lifeFloor 的状态（中毒）：计数从 max 往下扣，必须活着的角色停在 protect.ts 给的下限，其余角色可以降到 0（致命）。
 * 致命只落成状态（升级链上的 dying，不过期）并在结果里标 lethal；不写 dead/missing/departed——那是剧情合同的权限。
 * NPC 的“属性.气血”字段本轮不依赖、不读不写。
 * 目标是玩家自己时（传功反噬）：记录标 player:true，并同步写一项 角色.效果（与 freeTextStatus 同一写法）。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { catalogStatus, resolveEffects } from '../../sceneModule/statuses';
import type { StatusParams } from '../../sceneModule/types';
import { injuryStore, renderInjuryViews, sceneTime, type InjuryRecord } from '../../sceneModule/host/injuries';
import { toPlayerStatusEffect } from '../../sceneModule/statusAdapters';
import { namedEntity } from '../namedEntities';
import { isEnemyKindId, kindIdOf, parseInstanceId } from '../actorInstances';
import { statusBankOf } from '../actorStatusRead';
import { lifeFloorFor } from './protect';
import { scenarioPlayerId } from '../playerIdentity';

export type ApplyStatusRefusal = 'unknown_status' | 'enemy_kind' | 'bad_actor' | 'permanent_cap';

export interface ApplyStatusResult {
  ok: boolean;
  reason?: ApplyStatusRefusal;
  record?: InjuryRecord;
  /** 下限计数（带 lifeFloor 的状态）：本次前后的计数、该角色的下限、是否已在下限（再下毒不追加）。 */
  counter?: { before: number; after: number; floor: number; max: number; atFloor: boolean };
  /** 计数降到 0（只可能发生在没有下限的角色身上）。 */
  lethal?: boolean;
  /** 致命时顺着升级链一并挂上的状态 id。 */
  upgradedTo?: string;
  permanent?: boolean;
}

export interface ApplyStatusOptions {
  /** 来源标识，写成 sourceScene = `free:<sourceId>`，便于识别和审计（计划 D20）。 */
  sourceId?: string;
  /** 缺省按状态目录 afterScene.minutes，目录是 null 的取 status.freeActionMaxMinutes；显式 null = 不过期。 */
  minutes?: number | null;
  /** 剂量数（带 lifeFloor 的状态），缺省 1。 */
  doses?: number;
  /** 挂状态参数（外伤部位、六识受损的哪几识）。 */
  params?: StatusParams;
}

function labelOf(actorId: string): string {
  const kind = kindIdOf(actorId);
  return (namedEntity('enemy', kind) as { name?: string } | undefined)?.name || kind;
}

export function applyActorStatus(save: SaveData, actorId: string, statusId: string, options: ApplyStatusOptions = {}): ApplyStatusResult {
  const def = catalogStatus(statusId);
  if (!def) return { ok: false, reason: 'unknown_status' };
  if (isEnemyKindId(actorId)) return { ok: false, reason: 'enemy_kind' };
  const bank = statusBankOf(actorId);
  if (!bank) return { ok: false, reason: 'bad_actor' };

  const store = injuryStore(save), now = sceneTime(save), sourceScene = `free:${options.sourceId ?? statusId}`;
  const instance = parseInstanceId(actorId);
  const rows = def.permanent
    ? ((store.disabilities ||= {})[actorId] ||= [])
    : (store[bank][actorId] ||= []);
  if (def.permanent && !rows.some(row => row.statusId === def.id) && rows.length >= GAME_NUMBERS.status.permanent.maxPerActor) {
    return { ok: false, reason: 'permanent_cap' };
  }

  let minutes: number | null;
  if (def.permanent) minutes = null;
  else if (options.minutes !== undefined) minutes = options.minutes;
  else minutes = def.afterScene?.minutes ?? GAME_NUMBERS.status.freeActionMaxMinutes;

  const prior = rows.find(row => row.statusId === def.id);
  const playerId = scenarioPlayerId(save), isPlayer = !!playerId && actorId === playerId;
  const record: InjuryRecord = {
    ...(instance ? { enemyId: instance.kindId, instanceId: actorId } : {}),
    player: isPlayer, statusId: def.id, label: def.label, sourceScene, cause: def.cause, source: def.source,
    appliedAt: prior?.appliedAt ?? now, expiresAt: minutes === null ? null : now + minutes,
    effects: resolveEffects(structuredClone(def.effects), options.params), remove: structuredClone(def.remove || []),
    ...(options.params ? { params: structuredClone(options.params) } : {}),
  };

  const result: ApplyStatusResult = { ok: true, record };
  if (def.lifeFloor) {
    const { max, perDose } = def.lifeFloor, floor = lifeFloorFor(actorId, max);
    const before = prior?.counter?.life ?? max, atFloor = before <= floor;
    const after = Math.max(floor, before - perDose * Math.max(1, Math.floor(options.doses ?? 1)));
    record.counter = { life: after, max, floor };
    result.counter = { before, after, floor, max, atFloor };
    if (after <= 0) result.lethal = true;
  }
  if (def.permanent) result.permanent = true;

  if (prior) rows.splice(rows.indexOf(prior), 1);
  rows.push(record);
  if (isPlayer && (save as any).元数据?.时间) {
    const effects: any[] = Array.isArray((save as any).角色?.效果) ? (save as any).角色.效果 : ((((save as any).角色 ||= {}).效果) = []);
    const effect = toPlayerStatusEffect({ party: 'player', ref: actorId, status: def.id, label: def.label, minutes, cause: def.cause, source: sourceScene }, (save as any).元数据.时间, def);
    const at = effects.findIndex(e => e.状态名称 === def.label && e.来源 === sourceScene);
    if (at >= 0) effects[at] = effect; else effects.push(effect);
  }
  if (bank === 'groups' && !store.groupLabels[actorId]) store.groupLabels[actorId] = labelOf(actorId);

  if (result.lethal && def.upgradesTo && catalogStatus(def.upgradesTo)) {
    const upgraded = applyActorStatus(save, actorId, def.upgradesTo, { sourceId: options.sourceId, minutes: null });
    if (upgraded.ok) result.upgradedTo = def.upgradesTo;
  }
  renderInjuryViews(save);
  return result;
}
