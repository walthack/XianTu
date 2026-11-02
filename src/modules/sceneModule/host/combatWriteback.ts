/**
 * 战斗结果统一写回（设计稿 2026-11-02「剧情推进机制设计」2.4；用户 2026-11-02 拍板⑤）。
 *
 * 场面引擎收场（host/controller.ts）、自由行动交手（scenarioMods/freeAction/settle.ts）与旧判定的失手余波
 * （utils/judgementEngine.ts → freeAction/outcomeEffects.ts）都只产出 CombatResult，由 writeCombatResult 这一个函数落账：
 *   扣血（气血写成 hpTo）、判负首行（combat.sceneClose.loseHeadline）、短期记忆、伤势（主角 角色.效果，按名称＋来源幂等），
 *   并记 combat.writeback（LCQ-SAV-056）。
 * 口径（全部是已定规则，不新增）：战斗伤害不保底，打到 ≤ combatDownedAt 当拍判负，之后拉回 afterLossContinueHp；
 * keepHp 只给中毒等状态持续掉血；重伤只跟真正的伤势状态走，不按气血数值推断（injuries 只收引擎挂上的伤势行）。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../numbers';
import { logEvent } from '@/modules/diagnostics/log';
import { composeShortTermMemoryEntry } from '@/utils/memorySanitizer';

export type CombatOutcome = 'win' | 'lose' | 'flee';
export interface CombatResult {
  source: 'scene' | 'freeAction';
  outcome: CombatOutcome;
  hpFrom: number;
  hpTo: number;
  /** 判负（场面输局，或交手气血打到 ≤ combatDownedAt）。 */
  downed: boolean;
  /** 主角身上的伤势行（角色.效果 的条目，引擎挂上的真实伤势）；写回按 状态名称＋来源 幂等。 */
  injuries: Array<Record<string, unknown>>;
  /** 判负首行；未判负为空。 */
  headline: string;
  /** 写进短期记忆的这一战结果；空＝不写。 */
  memoryLine: string;
  /** 来源 id（场面合同 id、判定 id），只进日志。 */
  sourceId?: string;
}

export const combatLoseHeadline = (): string => String((GAME_NUMBERS.combat as { sceneClose?: { loseHeadline?: string } }).sceneClose?.loseHeadline || '');
const hpRules = () => GAME_NUMBERS.combat.woundRules.hp;

/** 战斗伤害落点（不保底）：扣 lost 后 ≤ combatDownedAt 即判负，气血拉回 afterLossContinueHp。 */
export function combatHpAfterLoss(from: number, lost: number): { to: number; downed: boolean } {
  const downed = from - lost <= hpRules().combatDownedAt;
  return { to: downed ? hpRules().afterLossContinueHp : from - lost, downed };
}

/** 组 CombatResult：判负时首行取配置的判负文本。 */
export function combatResult(input: Omit<CombatResult, 'headline' | 'injuries'> & { injuries?: CombatResult['injuries'] }): CombatResult {
  return { ...input, injuries: input.injuries || [], headline: input.downed ? combatLoseHeadline() : '' };
}

/** 玩家可见正文：判负首行在最前（正文已含则不重复）。 */
export function withCombatHeadline(result: Pick<CombatResult, 'headline'>, lines: string[]): string[] {
  const body = lines.filter(Boolean);
  return result.headline ? [result.headline, ...body.map(line => line.split(result.headline).join('').trim()).filter(Boolean)] : body;
}

/** 把判负首行补到一段已生成的正文最前（已含则原样返回）。 */
export function prependCombatHeadline(text: string, headline: string): string {
  return withCombatHeadline({ headline }, [text]).join('\n');
}

/** 写进短期记忆（与 gameStateStore.addToShortTermMemory 同前缀口径，隐式中期记忆同写）。 */
function remember(save: SaveData, text: string): void {
  const t = (save as any).元数据?.时间, memory = ((save as any).社交 ||= {}).记忆 ||= {};
  const prefix = t ? `【仙道${t.年}年${t.月}月${t.日}日 ${String(t.小时 ?? 0).padStart(2, '0')}:${String(t.分钟 ?? 0).padStart(2, '0')}】` : '【未知时间】';
  const entry = composeShortTermMemoryEntry(prefix, text);
  if (!entry) return;
  for (const key of ['短期记忆', '隐式中期记忆']) (Array.isArray(memory[key]) ? memory[key] : (memory[key] = [])).push(entry);
}

/** 唯一写回：扣血、伤势、短期记忆，记 combat.writeback。判负首行由调用方用 withCombatHeadline／prependCombatHeadline 放进玩家可见正文。改入参。 */
export function writeCombatResult(save: SaveData, result: CombatResult, options: { record?: boolean } = {}): void {
  const root = save as any;
  const hp = ((root.角色 ||= {}).属性 ||= {}).气血 ||= {};
  if (Number.isFinite(result.hpTo)) hp.当前 = result.hpTo;
  if (result.injuries.length) {
    const effects: any[] = Array.isArray(root.角色.效果) ? root.角色.效果 : (root.角色.效果 = []);
    for (const injury of result.injuries) {
      const at = effects.findIndex(effect => effect?.状态名称 === injury.状态名称 && effect?.来源 === injury.来源);
      if (at >= 0) effects[at] = structuredClone(injury); else effects.push(structuredClone(injury));
    }
  }
  if (options.record === false) return;
  if (result.memoryLine) remember(save, result.memoryLine);
  if (result.source === 'freeAction' && result.headline) {
    ((root.系统 ||= {}).扩展 ||= {}).combatHeadline = result.headline;
  }
  logEvent({
    code: 'LCQ-SAV-056', echo: false,
    detail: { turn: root.世界?.状态?.剧本模组?.worldTurn ?? null, source: result.source, outcome: result.outcome, from: result.hpFrom, to: result.hpTo, downed: result.downed, injuries: result.injuries.map(row => String(row.状态名称 || '')), sourceId: result.sourceId || null },
  });
}

/** 普通回合成功后把本地判负首行写入最终正文与历史；失败回合随原有事务快照回滚。 */
export function finishCombatNarrative(save: SaveData, text: string): string {
  const ext = (save as any).系统?.扩展;
  const headline = ext?.combatHeadline;
  if (typeof headline !== 'string' || !headline) return text;
  delete ext.combatHeadline;
  const body = prependCombatHeadline(text, headline);
  const rows = (save as any).系统?.历史?.叙事;
  const last = Array.isArray(rows) ? rows.at(-1) : undefined;
  if (last && (last.type === 'gm' || last.role === 'assistant')) last.content = body;
  return body;
}
