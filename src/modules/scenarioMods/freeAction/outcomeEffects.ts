/**
 * 判定确认后的确定性效果（数值在 game-numbers 的 freeAction.aftermath / dualCultivation.buff，文本在内容包 texts）：
 *   failureAftermathEffects：非成功档写“行动门控”余波；combat 类另扣玩家气血（最低留 keepHp 点）。
 *   selfBuffEffect：双修的“阴阳调和”临时状态。
 * 只算不写：旧判定引擎（旧预检 / 事件判定的回执）和 freeAction 结算（settle.ts）共用这一份。
 * 判定回执是 free_action_judgement 时，引擎不再自己算这些（见 judgementEngine.deterministicOutcomeEffects），由 settle.ts 落账，避免双扣、双写。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { packText } from '@/modules/contentPacks';
import type { JudgementKind, JudgementOutcome, JudgementResolution } from '@/utils/judgementEngine';

type Effect = JudgementResolution['appliedEffects'][number];

export interface AftermathConfig {
  hpLoss: { kinds: string[]; ratio: Partial<Record<JudgementOutcome, number>>; minLoss: number; keepHp: number };
  gate: { ttlTurns: number; labelChars: number; defaultScope: string; scopeByKind: Record<string, string>; outcomeByResult: Partial<Record<JudgementOutcome, string>> };
}
export interface SelfBuffConfig {
  name: string; type: string; minutesByOutcome: Partial<Record<JudgementOutcome, number>>; strength: number; source: string; descKey: string;
}

export const aftermathConfig = (): AftermathConfig => GAME_NUMBERS.freeAction.aftermath as unknown as AftermathConfig;
export const dualBuffConfig = (): SelfBuffConfig => GAME_NUMBERS.freeAction.dualCultivation.buff as unknown as SelfBuffConfig;

const fill = (template: string, slots: Record<string, string>): string => Object.entries(slots).reduce((out, [key, value]) => out.split(`{${key}}`).join(value), template);

export function failureAftermathEffects(
  saveData: unknown,
  input: { kind: JudgementKind; actionText: string; target?: string; outcome: JudgementOutcome; turn: number },
): Effect[] {
  const { hpLoss, gate } = aftermathConfig(), { kind, outcome } = input;
  const gateOutcome = gate.outcomeByResult[outcome];
  if (!gateOutcome) return [];
  const effects: Effect[] = [];
  const ratio = hpLoss.kinds.includes(kind) ? hpLoss.ratio[outcome] : undefined;
  if (ratio !== undefined) {
    const hp = (saveData as any)?.角色?.属性?.气血, current = Number(hp?.当前), max = Number(hp?.上限);
    if (Number.isFinite(current) && Number.isFinite(max) && current > hpLoss.keepHp && max > 0) {
      effects.push({ key: '角色.属性.气血.当前', action: 'add', value: -Math.min(current - hpLoss.keepHp, Math.max(hpLoss.minLoss, Math.round(max * ratio))) });
    }
  }
  effects.push({
    key: '系统.扩展.行动门控.recent',
    action: 'push',
    value: {
      actionLabel: input.actionText.slice(0, gate.labelChars),
      outcome: gateOutcome,
      scope: gate.scopeByKind[kind] ?? gate.defaultScope,
      ...(input.target ? { target: input.target } : {}),
      reason: fill(packText('judge.aftermath.reason'), { severity: packText(`judge.aftermath.severity.${outcome}`), outcome }),
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
