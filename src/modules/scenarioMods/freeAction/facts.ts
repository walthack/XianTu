/**
 * 既定事实行：把结算结果拼成给叙事模型的“只演这些”文本。
 * 模板在内容包 texts（free.fact.* / free.memory.* / free.why / free.stakes.*），槽位只有代码填的显示名，
 * 不收玩家原话、不收模型文字。事实行用词受 previewWangZheStayEnding 等关键词守卫约束，见 tests/freeActionFacts.test.mjs。
 */
import { CONTENT_PACKS, packText } from '@/modules/contentPacks';
import { enabledVariants, resultKeysOf, variantSpecOf, type VariantSpec } from './config';

export interface FactSlots { player: string; target: string; item?: string; status?: string; label?: string }

/** 槽位替换：模板是我们自己的文本，用 split/join，不碰玩家原话。 */
export function fillSlots(template: string, slots: FactSlots): string {
  let out = template;
  for (const [key, value] of Object.entries(slots)) out = out.split(`{${key}}`).join(value ?? '');
  return out;
}

export const factText = (variant: string, key: string, slots: FactSlots): string => fillSlots(packText(`free.fact.${variant}.${key}`), slots);
export const memoryText = (variant: string, key: string, slots: FactSlots): string => fillSlots(packText(`free.memory.${variant}.${key}`), slots);
export const gateText = (reason: string, slots: FactSlots): string => fillSlots(packText(`free.fact.gate.${reason}`), slots);
export const protectedText = (slots: FactSlots): string => fillSlots(packText('free.fact.protected'), slots);
export const whyNowText = (slots: FactSlots): string => fillSlots(packText('free.why'), slots);

/** 按 effect 种类决定的结果键（config 不列，由代码按物品效果与骰面决定）；校验与单测用它核对文本齐全。 */
export function effectResultKeys(spec: VariantSpec): string[] {
  switch (spec.effect) {
    case 'practiceProgress': return ['gain', 'no_gain', 'backlash'];
    case 'removeStatus': return ['done', 'failed', ...(spec.downgrade ? ['done_downgraded'] : [])];
    case 'transferItem': return ['done'];
    case 'itemDefined': return ['benefit_done', 'sedative_done', 'toxic_done', 'toxic_floor', 'toxic_dying'];
    default: return [];
  }
}
export const GATE_REASONS = [
  'not_present', 'scene_active', 'low_goodwill', 'no_item', 'item_mismatch', 'equipped_or_story', 'nothing_to_treat',
  'level_too_low', 'level_unknown', 'no_resource', 'cooldown', 'budget_full', 'protected',
  // 票校验阶段（目标/物品无效）与结算写入被状态拒绝时的“未发生”事实。
  'target_unavailable', 'item_unavailable', 'state_refused',
] as const;
export type GateReason = typeof GATE_REASONS[number];

/** 结算后的事实行（并入 finalUserMessage）。 */
export function renderSettledBlock(facts: string[]): string {
  return `\n【本地自由行动已结算】${facts.join('；')}。好感与记忆已由本地写入，只演出这些既定事实，不得另行增减好感、写入记忆或杜撰额外后果。\n`;
}
/** 闸门不过：必须发，否则叙事模型会自行写成功。 */
export function renderRefusedBlock(facts: string[]): string {
  return `\n【本地自由行动未发生】${facts.join('；')}。这一下没有成事，没有任何状态、物品或好感变化，只演出这个结果。\n`;
}

/** 文本体检：每个启用变体的每个可能结果都有事实文本与记忆文本，闸门原因、保护、判定卡文案齐全。返回错误列表。 */
export function validateFreeActionTexts(texts: Record<string, string> = CONTENT_PACKS.texts): string[] {
  const errors: string[] = [], need = (id: string, where: string) => { if (typeof texts[id] !== 'string' || !texts[id]) errors.push(`${where}: 缺文本 ${id}`); };
  for (const row of enabledVariants()) {
    const spec = variantSpecOf(row.actionClass, row.variant)!;
    const keys = [...new Set([...resultKeysOf(spec), ...effectResultKeys(spec)])];
    for (const key of keys) {
      need(`free.fact.${row.variant}.${key}`, `${row.actionClass}.${row.variant}`);
      if (key !== 'backlash') need(`free.memory.${row.variant}.${key}`, `${row.actionClass}.${row.variant}`);
    }
    if (spec.route === 'judge') for (const name of ['success', 'partial', 'failure']) need(`free.stakes.${row.actionClass}.${name}`, row.actionClass);
  }
  for (const reason of GATE_REASONS) need(`free.fact.gate.${reason}`, 'gate');
  need('free.fact.protected', 'protected');
  need('free.why', 'why');
  return errors;
}
