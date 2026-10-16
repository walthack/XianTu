/**
 * 既定事实行：把结算结果拼成给叙事模型的“只演这些”文本。
 * 模板在内容包 texts（free.fact.* / free.memory.* / free.why / free.stakes.*），槽位只有代码填的显示名，
 * 不收玩家原话、不收模型文字。事实行用词受 previewWangZheStayEnding 等关键词守卫约束，见 tests/freeActionFacts.test.mjs。
 */
import { CONTENT_PACKS, packText } from '@/modules/contentPacks';
import { enabledVariants, freeActionConfig, resultKeysOf, variantSpecOf, type VariantSpec } from './config';

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
    case 'applyStatus': return ['done'];
    case 'itemDefined': return ['benefit_done', 'sedative_done', 'toxic_done', 'toxic_floor', 'toxic_dying'];
    default: return [];
  }
}
export const GATE_REASONS = [
  'not_present', 'scene_active', 'low_goodwill', 'no_item', 'item_mismatch', 'equipped_or_story', 'nothing_to_treat',
  'level_too_low', 'level_unknown', 'no_resource', 'cooldown', 'budget_full', 'protected',
  // 票校验阶段（目标/物品无效）与结算写入被状态拒绝时的“未发生”事实。
  'target_unavailable', 'item_unavailable', 'state_refused',
  // 没落实的动作（同目标被挤掉的第二张票）/ 本地没有识别出可结算动作（识别降级、传功语义无票）。
  'dropped', 'unrecognized',
] as const;
export type GateReason = typeof GATE_REASONS[number];

/** 结算后的事实行（并入 finalUserMessage）。 */
export const renderSettledBlock = (facts: string[]): string => packText('free.block.settled').split('{facts}').join(facts.join('；'));
/** 闸门不过：必须发，否则叙事模型会自行写成功。 */
export const renderRefusedBlock = (facts: string[]): string => packText('free.block.refused').split('{facts}').join(facts.join('；'));

/** 背包里数量>0 的物品 → 数量（物品 id 为键；名称取背包条目）。 */
export function inventoryCounts(save: unknown): Map<string, { name: string; count: number }> {
  const out = new Map<string, { name: string; count: number }>();
  for (const [key, raw] of Object.entries((save as any)?.角色?.背包?.物品 || {})) {
    const item = raw as { 物品ID?: string; 名称?: string; 数量?: number };
    const count = Number(item?.数量);
    if (!(count > 0)) continue;
    const id = item?.物品ID || key, prior = out.get(id);
    out.set(id, { name: item?.名称 || id, count: (prior?.count ?? 0) + count });
  }
  return out;
}

/**
 * 给叙事的背包事实：本回合背包增减（对比结算前的快照）+ 背包现有。
 * 叙事常把“送出/拿到”写成已成而背包没动；把背包的实际账写进叙述包，让“没发生”有据可依。
 */
export function renderInventoryBlock(before: Map<string, { name: string; count: number }>, save: unknown): string {
  const now = inventoryCounts(save), changes: string[] = [];
  const slot = (key: string, name: string, count: number) => packText(key).split('{name}').join(name).split('{count}').join(String(count));
  for (const id of new Set([...before.keys(), ...now.keys()])) {
    const delta = (now.get(id)?.count ?? 0) - (before.get(id)?.count ?? 0);
    if (delta !== 0) changes.push(slot(delta > 0 ? 'free.block.inventory.delta.gain' : 'free.block.inventory.delta.lose', now.get(id)?.name ?? before.get(id)!.name, Math.abs(delta)));
  }
  const listed = [...now.values()].slice(0, freeActionConfig().narration.inventoryListMax).map(row => slot('free.block.inventory.item', row.name, row.count));
  const items = listed.length ? listed.join('、') : packText('free.block.inventory.empty');
  const template = packText(changes.length ? 'free.block.inventory.changed' : 'free.block.inventory.unchanged');
  return template.split('{changes}').join(changes.join('；')).split('{items}').join(items);
}

/** 界面持久回执：被拒 / 给予成功 / 其他。 */
export function renderReceipts(input: { refused: string[]; given: string[]; others: number }): string[] {
  const line = (key: string, facts: string[]) => packText(key).split('{facts}').join([...new Set(facts)].join(' '));
  return [
    ...(input.refused.length ? [line('free.receipt.refused', input.refused)] : []),
    ...(input.given.length ? [line('free.receipt.given', input.given)] : []),
    ...(input.others > 0 ? [packText('free.receipt.other')] : []),
  ];
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
  for (const id of ['free.block.settled', 'free.block.refused', 'free.block.inventory.changed', 'free.block.inventory.unchanged', 'free.block.inventory.empty', 'free.block.inventory.item',
    'free.block.inventory.delta.gain', 'free.block.inventory.delta.lose', 'free.receipt.refused', 'free.receipt.given', 'free.receipt.other', 'free.receipt.dismiss']) need(id, 'block');
  return errors;
}
