/**
 * 判定确认后的确定性效果（数值在 game-numbers 的 freeAction.aftermath / dualCultivation.buff，文本在内容包 texts）：
 *   failureAftermathEffects：非成功档写“行动门控”余波；combat 类另扣玩家气血——战斗伤害不保底，与场面同一口径（combat.woundRules.hp）：
 *     打到 ≤ combatDownedAt 即当拍判负，人倒下后剧情继续，气血拉回 afterLossContinueHp（keepHp 只给中毒等状态掉血）。
 *   selfBuffEffect：双修的“阴阳调和”临时状态。
 * 只算不写：旧判定引擎（旧预检 / 事件判定的回执）和 freeAction 结算（settle.ts）共用这一份。
 * 判定回执是 free_action_judgement 时，引擎不再自己算这些（见 judgementEngine.deterministicOutcomeEffects），由 settle.ts 落账，避免双扣、双写。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { packText } from '@/modules/contentPacks';
import { JUDGEMENT_OUTCOME_LABELS, type JudgementKind, type JudgementOutcome, type JudgementResolution } from '@/utils/judgementEngine';

type Effect = JudgementResolution['appliedEffects'][number];

export interface AftermathConfig {
  hpLoss: { kinds: string[]; ratio: Partial<Record<JudgementOutcome, number>>; minLoss: number };
  gate: { ttlTurns: number; labelChars: number; defaultScope: string; scopeByKind: Record<string, string>; outcomeByResult: Partial<Record<JudgementOutcome, string>> };
}
export interface SelfBuffConfig {
  name: string; type: string; minutesByOutcome: Partial<Record<JudgementOutcome, number>>; strength: number; source: string; descKey: string;
}

export const aftermathConfig = (): AftermathConfig => GAME_NUMBERS.freeAction.aftermath as unknown as AftermathConfig;
export const dualBuffConfig = (): SelfBuffConfig => GAME_NUMBERS.freeAction.dualCultivation.buff as unknown as SelfBuffConfig;

const fill = (template: string, slots: Record<string, string>): string => Object.entries(slots).reduce((out, [key, value]) => out.split(`{${key}}`).join(value), template);

/**
 * combat 类失手扣的气血（REPORT-8091-1892cfb6 P1：南荒战斗气血打到 1 后停住、不判负——这里原先按 keepHp 保底，战斗伤害不该保底）。
 * 扣到 ≤ combatDownedAt＝当拍判负（downed），收场拉回 afterLossContinueHp；已在 0 及以下的不再扣。非 combat 类或该档不扣时返回 null。
 */
export function combatAftermathHp(saveData: unknown, kind: JudgementKind, outcome: JudgementOutcome): { from: number; to: number; lost: number; downed: boolean } | null {
  const { hpLoss } = aftermathConfig();
  if (!aftermathConfig().gate.outcomeByResult[outcome] || !hpLoss.kinds.includes(kind)) return null;
  const ratio = hpLoss.ratio[outcome];
  const hp = (saveData as any)?.角色?.属性?.气血, from = Number(hp?.当前), max = Number(hp?.上限);
  if (ratio === undefined || !Number.isFinite(from) || !Number.isFinite(max) || max <= 0 || from <= 0) return null;
  const rules = GAME_NUMBERS.combat.woundRules.hp;
  const lost = Math.min(from, Math.max(hpLoss.minLoss, Math.round(max * ratio)));
  const downed = from - lost <= rules.combatDownedAt;
  return { from, to: downed ? rules.afterLossContinueHp : from - lost, lost, downed };
}

export function failureAftermathEffects(
  saveData: unknown,
  input: { kind: JudgementKind; actionText: string; target?: string; outcome: JudgementOutcome; turn: number },
): Effect[] {
  const { gate } = aftermathConfig(), { kind, outcome } = input;
  const gateOutcome = gate.outcomeByResult[outcome];
  if (!gateOutcome) return [];
  const effects: Effect[] = [];
  const hit = combatAftermathHp(saveData, kind, outcome);
  if (hit && hit.to !== hit.from) effects.push({ key: '角色.属性.气血.当前', action: 'add', value: hit.to - hit.from });
  effects.push({
    key: '系统.扩展.行动门控.recent',
    action: 'push',
    value: {
      actionLabel: input.actionText.slice(0, gate.labelChars),
      outcome: gateOutcome,
      scope: gate.scopeByKind[kind] ?? gate.defaultScope,
      ...(input.target ? { target: input.target } : {}),
      // 原因会进行动门控提示给模型看，结果档写中文（真机 658435d5eb8b：叙事夹英文）。
      reason: fill(packText('judge.aftermath.reason'), { severity: packText(`judge.aftermath.severity.${outcome}`), outcome: JUDGEMENT_OUTCOME_LABELS[outcome] ?? outcome }),
      effect: packText('judge.aftermath.effect'),
      createdAtTurn: input.turn,
      ttlTurns: gate.ttlTurns,
    },
  });
  return effects;
}

/** 双修专属收益：按结果档给“阴阳调和”临时状态；该档没有时长（失败档）则没有。 */
export function selfBuffEffect(saveData: unknown, buff: SelfBuffConfig, outcome: JudgementOutcome): Effect | null {
  const minutes = buff.minutesByOutcome[outcome];
  if (minutes === undefined) return null;
  return {
    key: '角色.效果', action: 'upsert', value: {
      状态名称: buff.name, 类型: buff.type, 生成时间: structuredClone((saveData as any)?.元数据?.时间 || {}),
      持续时间分钟: minutes, 状态描述: packText(buff.descKey), 强度: buff.strength, 来源: buff.source,
    },
  };
}
