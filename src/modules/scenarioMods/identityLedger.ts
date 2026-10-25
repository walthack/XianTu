/**
 * 玩家身份账 playerIdentities（身份账设计稿 2026-10-25 §2.1 / §3）。
 * 存档位置：世界.状态.剧本模组.playerIdentities（runtime.playerIdentities），键＝identityId。
 * 只存 id 真值与来路；kind、所属线/势力、展示名在 entity-catalog/identities.json，按 id 查。
 * 写入只由代码执行：按规则表「事件 → 身份」扫描已完成事件，幂等同步；模型不能写。
 * 类型不进 RuntimeState（冻结的 runtime.ts），读写处局部收窄，同 updateAcquaintanceLedger。
 */
import { orderedDoneEventIds, playerLedgerRules, type IdentityGrantRule, type PlayerLedgerRules } from './playerLedgerRules';
import { syncLineOutcomes } from './lineOutcomes';

export const PLAYER_IDENTITY_STATUSES = ['active', 'revoked'] as const;
export type PlayerIdentityStatus = typeof PLAYER_IDENTITY_STATUSES[number];

/** 一次账目操作。history 是幂等依据：同一 (eventId, op) 只记一次。 */
export interface PlayerIdentityOp {
  eventId: string;
  op: 'grant' | 'reinforce' | 'revoke';
  atStageId?: string;
  atWorldTurn?: number;
  backfilled?: boolean;
}

export interface PlayerIdentityRecord {
  /** 与外层键相同，冗余存一份，便于迁移时校验 */
  identityId: string;
  /** 由 history 最后一条 grant/revoke 决定，存下来便于直接读 */
  status: PlayerIdentityStatus;
  /** 先到先得：第一次 grant 的事件，之后永不改写 */
  acquiredAtEventId: string;
  /** 只追加 */
  history: PlayerIdentityOp[];
  /** 首条记录来自旧档回填 */
  backfilled?: boolean;
}

export type PlayerIdentityLedger = Record<string, PlayerIdentityRecord>;

export interface LedgerOpContext {
  stageId?: string;
  worldTurn?: number;
  backfilled?: boolean;
}

export type GrantResult = 'granted' | 'reinforced' | 'reactivated' | 'noop';

function opEntry(eventId: string, op: PlayerIdentityOp['op'], ctx: LedgerOpContext): PlayerIdentityOp {
  return {
    eventId, op,
    ...(ctx.stageId ? { atStageId: ctx.stageId } : {}),
    ...(Number.isFinite(ctx.worldTurn) ? { atWorldTurn: ctx.worldTurn } : {}),
    ...(ctx.backfilled ? { backfilled: true } : {}),
  };
}

/** 该事件是否已对此身份记过授予类操作（grant 或 reinforce）。 */
const grantedBy = (record: PlayerIdentityRecord | undefined, eventId: string): boolean =>
  Boolean(record?.history.some(h => h.eventId === eventId && (h.op === 'grant' || h.op === 'reinforce')));

export function isIdentityActive(ledger: PlayerIdentityLedger | undefined, identityId: string): boolean {
  return ledger?.[identityId]?.status === 'active';
}

export function grantPlayerIdentity(ledger: PlayerIdentityLedger, input: { identityId: string; eventId: string } & LedgerOpContext): GrantResult {
  const { identityId, eventId } = input;
  const record = ledger[identityId];
  if (grantedBy(record, eventId)) return 'noop';
  if (!record) {
    ledger[identityId] = {
      identityId, status: 'active', acquiredAtEventId: eventId,
      history: [opEntry(eventId, 'grant', input)],
      ...(input.backfilled ? { backfilled: true } : {}),
    };
    return 'granted';
  }
  if (record.status === 'active') {
    record.history.push(opEntry(eventId, 'reinforce', input));
    return 'reinforced';
  }
  record.status = 'active';
  record.history.push(opEntry(eventId, 'grant', input));
  return 'reactivated';
}

/** 撤销：记录保留供变体读「曾持有」。没有记录、已撤销或该事件已撤过时不改，返回 false。 */
export function revokePlayerIdentity(ledger: PlayerIdentityLedger, input: { identityId: string; eventId: string } & LedgerOpContext): boolean {
  const record = ledger[input.identityId];
  if (!record || record.status === 'revoked') return false;
  if (record.history.some(h => h.eventId === input.eventId && h.op === 'revoke')) return false;
  record.status = 'revoked';
  record.history.push(opEntry(input.eventId, 'revoke', input));
  return true;
}

function applyGrantRule(ledger: PlayerIdentityLedger, rule: IdentityGrantRule, eventId: string, ctx: LedgerOpContext): GrantResult {
  if (rule.whenHeld === 'redirect' && rule.redirectIdentityId) {
    // 幂等：原身份或改授身份任一已由本事件授予过，就跳过
    if (grantedBy(ledger[rule.identityId], eventId) || grantedBy(ledger[rule.redirectIdentityId], eventId)) return 'noop';
    const target = isIdentityActive(ledger, rule.identityId) ? rule.redirectIdentityId : rule.identityId;
    return grantPlayerIdentity(ledger, { ...ctx, identityId: target, eventId });
  }
  return grantPlayerIdentity(ledger, { ...ctx, identityId: rule.identityId, eventId });
}

/** 纯函数：按完成顺序逐个事件处理，同一事件先撤销后授予；返回改动条数。 */
export function applyIdentityRules(ledger: PlayerIdentityLedger, orderedDoneEventIds: string[], rules: PlayerLedgerRules, ctx: LedgerOpContext = {}): number {
  let changed = 0;
  for (const eventId of orderedDoneEventIds) {
    for (const rule of rules.identityRevokes) {
      if (rule.eventId === eventId && revokePlayerIdentity(ledger, { ...ctx, identityId: rule.identityId, eventId })) changed += 1;
    }
    for (const rule of rules.identityGrants) {
      if (rule.eventId === eventId && applyGrantRule(ledger, rule, eventId, ctx) !== 'noop') changed += 1;
    }
  }
  return changed;
}

export interface SyncPlayerLedgerOptions {
  /** 旧档回填：新写的 history 条目与新建记录标 backfilled */
  backfilled?: boolean;
  /** 测试夹具可替换规则表；缺省读 mod-kit/player-ledger-rules.json */
  rules?: PlayerLedgerRules;
}

/** 读 runtime 的已完成事件，写 runtime.playerIdentities；没有改动时不新建字段。返回改动条数。 */
export function syncPlayerIdentities(runtime: unknown, opts: SyncPlayerLedgerOptions = {}): number {
  const rules = opts.rules ?? playerLedgerRules();
  if (!rules.identityGrants.length && !rules.identityRevokes.length) return 0;
  const rt = runtime as { playerIdentities?: PlayerIdentityLedger; modId?: string; worldTurn?: number };
  const ledger = rt.playerIdentities && typeof rt.playerIdentities === 'object' ? rt.playerIdentities : {};
  const changed = applyIdentityRules(ledger, orderedDoneEventIds(runtime), rules, {
    stageId: rt.modId, worldTurn: rt.worldTurn, backfilled: opts.backfilled,
  });
  if (changed && rt.playerIdentities !== ledger) rt.playerIdentities = ledger;
  return changed;
}

/** 身份＋收束档一起同步；失败只告警不抛，不阻断回合。 */
export function syncPlayerLedgers(runtime: unknown, opts: SyncPlayerLedgerOptions = {}): number {
  try {
    return syncPlayerIdentities(runtime, opts) + syncLineOutcomes(runtime, opts);
  } catch (error) {
    // lcq-allow: 同 updateAcquaintanceLedger，账本同步失败只告警，不阻断回合；规则表坏了由 playerLedgerRules 校验与测试拦
    console.warn('[identityLedger] 账本同步失败（不阻断回合）', error);
    return 0;
  }
}
