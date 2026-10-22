/**
 * 一个回合里自由行动的编排（界面只调这两步，逻辑都在这里，可以脱离界面测试）：
 *   issueFreeActionJudgement：判定类票在发送前签发（至多一张待确认；之后的票放弃，不留半截结算）。
 *   settleFreeActionTurn：备份“上次对话”之后结算——判定确认回合取回执里的票，其余是不掷骰的票。
 * 返回的 block 拼进 finalUserMessage；refusals 是闸门不过的“未发生”事实，同样必须发给叙事。
 */
import type { SaveData } from '@/types/game';
import type { JudgementProposal, JudgementResolution } from '@/utils/judgementEngine';
import { freeActionConfig, variantSpecOf } from './config';
import { renderRefusedBlock, renderSettledBlock } from './facts';
import { prepareFreeAction } from './plan';
import { settleFreeAction, settleFromResolution, type SettleDeps } from './settle';
import type { FreeActionTicket } from './ticket';
import { settleShiweimoAction, shiweimoLeaveRoll } from '../shiweimoRescue';
import { getNarrativeTurn } from '@/utils/actionGate';

const routeOf = (ticket: FreeActionTicket) => variantSpecOf(ticket.actionClass, ticket.variant)?.route;

export interface IssueResult {
  /** 已签发待确认判定：调用方持久化存档后提示玩家确认，本回合到此为止。 */
  issued?: JudgementProposal;
  /** 闸门不过的事实块（没有写任何东西）。 */
  refusalBlock: string;
  /** 同一批“未发生”事实行（界面回执用）。 */
  refusedFacts: string[];
}

export function issueFreeActionJudgement(save: SaveData, tickets: FreeActionTicket[], deps: SettleDeps = {}): IssueResult {
  const refusals: string[] = [];
  for (const ticket of tickets.filter(t => routeOf(t) === 'judge')) {
    const prepared = prepareFreeAction(save, ticket, deps);
    if (prepared.kind === 'issued') return { issued: prepared.proposal, refusalBlock: '', refusedFacts: [] };
    if (prepared.kind === 'refused') refusals.push(...prepared.facts);
  }
  return { refusalBlock: refusals.length ? renderRefusedBlock(refusals) : '', refusedFacts: refusals };
}

export interface TurnSettlement {
  /** 存档是否被改写（调用方据此持久化）。 */
  changed: boolean;
  block: string;
  /** 本次“未发生”事实行（界面回执用）。 */
  refusedFacts: string[];
  /** 本次结算成功的“给予”类事实行（界面回执用；类的回执归类在配置 classes.<类>.receipt）。 */
  givenFacts: string[];
  /** 到顶／习以为常附注（界面轻回执用；是否展示由 affinity.lightReceipt 决定）。 */
  affinityNotes: string[];
}

export function settleFreeActionTurn(
  save: SaveData, tickets: FreeActionTicket[], resolution: JudgementResolution | undefined, deps: SettleDeps = {},
): TurnSettlement {
  const done: string[] = [], refused: string[] = [], given: string[] = [], affinityNotes: string[] = [];
  let changed = false;
  const take = (result: ReturnType<typeof settleFreeAction> | null, actionClass?: string): void => {
    if (!result) return;
    if (result.ok) {
      done.push(...result.facts); changed ||= !result.replay;
      if (!result.replay && actionClass && freeActionConfig().classes[actionClass]?.receipt === 'given') given.push(...result.facts);
      if (!result.replay && result.affinityNotes?.length) affinityNotes.push(...result.affinityNotes);
    }
    else if (result.facts.length) refused.push(...result.facts);
  };
  // F02 对手救治（SHIWEIMO_ID，story.shiweimo）：目标是她且带药的票先按救治规则结算，不再走常规用药。
  // 离开概率在配置（story.shiweimo.leaveChanceOnShedanTruth）；骰走项目 RNG，同种子可复现。
  const rescueRoll = shiweimoLeaveRoll(save, Number(getNarrativeTurn(save as any)) || 0);
  tickets = tickets.filter(ticket => {
    const r = settleShiweimoAction(save, ticket, undefined, rescueRoll);
    if (r.handled) { done.push(...r.facts); changed = true; }
    return !r.handled;
  });
  if (resolution?.authorityReceipt?.kind === 'free_action_judgement') take(settleFromResolution(save, resolution, deps));
  else for (const ticket of tickets.filter(t => routeOf(t) === 'table')) {
    const prepared = prepareFreeAction(save, ticket, deps);
    if (prepared.kind === 'settled') take(prepared.result, ticket.actionClass);
    else if (prepared.kind === 'refused') refused.push(...prepared.facts);
  }
  return { changed, block: (done.length ? renderSettledBlock(done) : '') + (refused.length ? renderRefusedBlock(refused) : ''), refusedFacts: refused, givenFacts: given, affinityNotes };
}
