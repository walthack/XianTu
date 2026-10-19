/**
 * 麻古：普通依赖 debuff（用户 2026-10-19 23:45/23:47/23:50 定），不涉性与意愿，对双修无任何加成（双修仍只看好感）。
 * - 给药（自由行动喂药，或使用物品路径）→ afterItemFed：挂「感官亢奋」（时长 heightened.minutes），挂 / 续「麻古成瘾」，
 *   解除戒断挂上的「神志不清」，渴求计时从此刻重新开始。
 * - syncMaigu（每回合叙事兜底入口调用）：
 *   · presetActors：原著已成瘾的角色在所列关卡自动带成瘾（成瘾只由状态目录里的剧情旗标解除，#177）；
 *   · 成瘾者距上次给药超过 addiction.cravingMinutes：挂「神志不清」addiction.withdrawalMinutes 分钟（戒断开始）；
 *     治疗（神志不清自身解除规则）只解神志不清，戒断期照算；戒断开始起 addiction.quitMinutes 内没再给药＝撑过戒断期，
 *     成瘾戒除（用户 2026-10-20 00:26 定）。给药则回到渴求计时。
 * - maiguFactors：判定卡因子。主角持有麻古、对成瘾者交涉 +addiction.holdSocialBonus；
 *   主角自己感官亢奋时交涉 +heightened.socialBonus、心性判定（heightened.mindKinds）heightened.mindPenalty。
 * 数值全部来自 GAME_NUMBERS.status.maigu；本文件不写数值。性格提示在状态目录的 note 里，写成按原本性格偏移的通用规则。
 */
import type { SaveData } from '@/types/game';
import type { JudgementFactor, JudgementKind } from '@/utils/judgementEngine';
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { catalogStatus } from '../../sceneModule/statuses';
import { injuryStore, pruneSceneInjuries, renderInjuryViews, sceneTime } from '../../sceneModule/host/injuries';
import { actorStatusRecords } from '../actorStatusRead';
import { relationshipOf } from '../ledger/affinityIdentity';
import { applyActorStatus } from './actorStatus';
import { scenarioPlayerId } from '../playerIdentity';

export interface MaiguConfig {
  itemId: string; heightenedStatus: string; addictionStatus: string; withdrawalStatus: string;
  heightened: { minutes: number; socialBonus: number; mindPenalty: number; mindKinds: string[] };
  addiction: { cravingMinutes: number; withdrawalMinutes: number; quitMinutes: number; holdSocialBonus: number };
  presetActors: Record<string, string[]>;
}
export const maiguConfig = (): MaiguConfig => (GAME_NUMBERS.status as unknown as { maigu: MaiguConfig }).maigu;

const WITHDRAWAL_SOURCE = 'maigu.withdrawal';
type Clock = { lastDoseAt: number; withdrawal?: boolean; withdrawalAt?: number };
const runtimeOf = (save: SaveData): any => (save as any)?.世界?.状态?.剧本模组;
const playerIdOf = (save: SaveData): string | undefined => scenarioPlayerId(save);
const clocks = (save: SaveData): Record<string, Clock> => (runtimeOf(save).maiguClock ||= {});
const has = (save: SaveData, actorId: string, statusId: string): boolean => actorStatusRecords(save, actorId).some(row => row.statusId === statusId);
const isWithdrawalRow = (row: { statusId: string; sourceScene?: string }, cfg: MaiguConfig): boolean => row.statusId === cfg.withdrawalStatus && row.sourceScene === `free:${WITHDRAWAL_SOURCE}`;

function clearWithdrawal(save: SaveData, actorId: string, cfg: MaiguConfig): boolean {
  const store = injuryStore(save), rows = store.actors[actorId];
  if (!rows?.some(row => isWithdrawalRow(row, cfg))) return false;
  store.actors[actorId] = rows.filter(row => !isWithdrawalRow(row, cfg));
  renderInjuryViews(save);
  return true;
}

/** 给药之后：感官亢奋、成瘾、解戒断、重置渴求计时。不是麻古就什么都不做。 */
export function afterItemFed(save: SaveData, actorId: string, itemId: string): void {
  const cfg = maiguConfig();
  if (!cfg || itemId !== cfg.itemId || !runtimeOf(save)) return;
  applyActorStatus(save, actorId, cfg.heightenedStatus, { sourceId: 'maigu.dose', minutes: cfg.heightened.minutes });
  if (!has(save, actorId, cfg.addictionStatus)) applyActorStatus(save, actorId, cfg.addictionStatus, { sourceId: 'maigu.dose', minutes: null });
  clearWithdrawal(save, actorId, cfg);
  clocks(save)[actorId] = { lastDoseAt: sceneTime(save) };
}

const addictionResolved = (flags: Record<string, unknown>, cfg: MaiguConfig): boolean =>
  (catalogStatus(cfg.addictionStatus)?.remove || []).some(rule => rule.kind === 'story' && flags[rule.flag] === true);

/** 撑过戒断期：成瘾与戒断挂的神志不清一并解除。 */
function quitAddiction(save: SaveData, actorId: string, cfg: MaiguConfig): void {
  const store = injuryStore(save), rows = store.actors[actorId] || [];
  store.actors[actorId] = rows.filter(row => row.statusId !== cfg.addictionStatus && !isWithdrawalRow(row, cfg));
  delete clocks(save)[actorId];
  renderInjuryViews(save);
}

/** 每回合：预设成瘾、渴求计时到点挂戒断、撑过戒断期戒除。返回这次的变化（新挂 `角色:状态`，戒除 `-角色:状态`）。 */
export function syncMaigu(save: SaveData): string[] {
  const cfg = maiguConfig(), runtime = runtimeOf(save);
  if (!cfg || !runtime || !(save as any)?.元数据?.时间) return [];
  pruneSceneInjuries(save);
  const added: string[] = [], now = sceneTime(save), flags = runtime.flags || {};
  for (const [actorId, stages] of Object.entries(cfg.presetActors || {})) {
    if (!stages.includes(runtime.modId) || !relationshipOf(save as any, actorId)) continue;
    // 成瘾的剧情解除旗标（状态目录 remove）为真就不再预设。
    if (addictionResolved(flags, cfg) || has(save, actorId, cfg.addictionStatus)) continue;
    if (applyActorStatus(save, actorId, cfg.addictionStatus, { sourceId: 'maigu.preset', minutes: null }).ok) added.push(`${actorId}:${cfg.addictionStatus}`);
  }
  const store = injuryStore(save);
  for (const actorId of Object.keys(store.actors)) {
    if (!has(save, actorId, cfg.addictionStatus)) {
      // 成瘾被 detox 药（清心散）等途径解除：戒断挂的神志不清一并清掉，算戒除。
      if (clocks(save)[actorId]) { clearWithdrawal(save, actorId, cfg); added.push(`-${actorId}:${cfg.addictionStatus}`); }
      delete clocks(save)[actorId]; continue;
    }
    const clock = clocks(save)[actorId] ||= { lastDoseAt: now };
    if (clock.withdrawal) {
      clock.withdrawalAt ??= now; // 旧档的计时没有戒断起点：从此刻算
      if (now - clock.withdrawalAt >= cfg.addiction.quitMinutes) { quitAddiction(save, actorId, cfg); added.push(`-${actorId}:${cfg.addictionStatus}`); }
      continue;
    }
    if (now - clock.lastDoseAt >= cfg.addiction.cravingMinutes) {
      if (applyActorStatus(save, actorId, cfg.withdrawalStatus, { sourceId: WITHDRAWAL_SOURCE, minutes: cfg.addiction.withdrawalMinutes }).ok) {
        clock.withdrawal = true; clock.withdrawalAt = now; added.push(`${actorId}:${cfg.withdrawalStatus}`);
      }
    }
  }
  return added;
}

/** 判定卡因子（只加不改其它因子）。 */
export function maiguFactors(save: SaveData, kind: JudgementKind, targetId?: string | null): JudgementFactor[] {
  const cfg = maiguConfig(), playerId = playerIdOf(save);
  if (!cfg || !playerId) return [];
  const out: JudgementFactor[] = [];
  const holds = Number((save as any)?.角色?.背包?.物品?.[cfg.itemId]?.数量 ?? 0) > 0;
  if (kind === 'social' && targetId && holds && has(save, targetId, cfg.addictionStatus)) out.push({ label: '持有麻古', value: cfg.addiction.holdSocialBonus, source: 'item' });
  if (has(save, playerId, cfg.heightenedStatus)) {
    if (kind === 'social') out.push({ label: '感官亢奋', value: cfg.heightened.socialBonus, source: 'condition' });
    if (cfg.heightened.mindKinds.includes(kind)) out.push({ label: '感官亢奋（心性浮动）', value: cfg.heightened.mindPenalty, source: 'condition' });
  }
  return out;
}
