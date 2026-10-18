/**
 * 既定事实行：把结算结果拼成给叙事模型的“只演这些”文本。
 * 模板在内容包 texts（free.fact.* / free.memory.* / free.why / free.stakes.*），槽位只有代码填的显示名，
 * 不收玩家原话、不收模型文字。事实行用词受 previewWangZheStayEnding 等关键词守卫约束，见 tests/freeActionFacts.test.mjs。
 */
import { CONTENT_PACKS, packText } from '@/modules/contentPacks';
import { enabledVariants, freeActionConfig, resultKeysOf, variantSpecOf, type VariantSpec } from './config';
import { aftermathConfig } from './outcomeEffects';

export interface FactSlots { player: string; target: string; item?: string; status?: string; label?: string; amount?: string; level?: string }

/** 槽位替换：模板是我们自己的文本，用 split/join，不碰玩家原话。 */
export function fillSlots(template: string, slots: FactSlots): string {
  let out = template;
  for (const [key, value] of Object.entries(slots)) out = out.split(`{${key}}`).join(value ?? '');
  return out;
}

export const factText = (variant: string, key: string, slots: FactSlots): string => fillSlots(packText(`free.fact.${variant}.${key}`), slots);
export const memoryText = (variant: string, key: string, slots: FactSlots): string => fillSlots(packText(`free.memory.${variant}.${key}`), slots);
/** 闸门“未发生”事实；传了变体时先找 free.fact.gate.<原因>.<变体> 的变体专用文本，没有再回落通用文本。 */
export function gateText(reason: string, slots: FactSlots, variant?: string): string {
  const specific = variant ? `free.fact.gate.${reason}.${variant}` : '';
  return fillSlots(packText(specific && CONTENT_PACKS.texts[specific] !== undefined ? specific : `free.fact.gate.${reason}`), slots);
}
/** 好感没有因这次举动再涨的原因：worn = 同类重复已递减到 0；capped = 已到阶段上限。 */
export const affinityNoteText = (kind: 'worn' | 'capped', slots: FactSlots): string => fillSlots(packText(`free.fact.affinity.${kind}`), slots);
/** 判定失手扣了玩家气血：告诉叙事数额（本地已扣，叙事不得再写数值）。 */
export const aftermathHpText = (slots: FactSlots): string => fillSlots(packText('free.fact.aftermath.hp'), slots);
export const protectedText = (slots: FactSlots): string => fillSlots(packText('free.fact.protected'), slots);
export const whyNowText = (slots: FactSlots): string => fillSlots(packText('free.why'), slots);
/** 无对象的票（自修、场面）的理解说明：没有 {target}。 */
export const whySelfText = (slots: FactSlots): string => fillSlots(packText('free.why.self'), slots);

/** 按 effect 种类决定的结果键（config 不列，由代码按物品效果与骰面决定）；校验与单测用它核对文本齐全。 */
export function effectResultKeys(spec: VariantSpec): string[] {
  switch (spec.effect) {
    case 'practiceProgress': return ['gain', 'no_gain', 'backlash'];
    case 'drainProgress': return ['backlash', 'self_cost', 'drained_lethal', 'took_qi', 'took_hp', 'realm_up'];
    case 'removeStatus': return ['done', 'failed', ...(spec.downgrade ? ['done_downgraded'] : [])];
    case 'transferItem': return ['done'];
    case 'applyStatus': return ['done'];
    case 'selfBuff': return ['buff'];
    case 'itemDefined': return ['benefit_done', 'sedative_done', 'toxic_done', 'toxic_floor', 'toxic_dying'];
    default: return [];
  }
}
export const GATE_REASONS = [
  'not_present', 'scene_active', 'low_goodwill', 'goodwill_below_min', 'no_item', 'item_mismatch', 'equipped_or_story', 'nothing_to_treat',
  'level_too_low', 'level_unknown', 'no_resource', 'cooldown', 'budget_full', 'protected', 'guard_up', 'drain_empty', 'drain_resisted', 'hp_too_low',
  // 夺元吸到对方倒下：必须活着的角色直接拒绝。
  'drain_survivor',
  // 票校验阶段（目标/物品无效）与结算写入被状态拒绝时的“未发生”事实。
  'target_unavailable', 'item_unavailable', 'state_refused',
  // 自修：按修炼结算试算境界进度不会变（时机未到 / 已满）。
  'not_ready',
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

/** 只给叙事的附注事实，不写 NPC 记忆。 */
const NO_MEMORY_KEYS = ['backlash', 'self_cost', 'buff', 'took_qi', 'took_hp', 'realm_up'];

/** 文本体检：每个启用变体的每个可能结果都有事实文本与记忆文本，闸门原因、保护、判定卡文案齐全。返回错误列表。 */
export function validateFreeActionTexts(texts: Record<string, string> = CONTENT_PACKS.texts): string[] {
  const errors: string[] = [], need = (id: string, where: string) => { if (typeof texts[id] !== 'string' || !texts[id]) errors.push(`${where}: 缺文本 ${id}`); };
  for (const row of enabledVariants()) {
    const spec = variantSpecOf(row.actionClass, row.variant)!;
    const keys = [...new Set([...resultKeysOf(spec), ...effectResultKeys(spec)])];
    for (const key of keys) {
      need(`free.fact.${row.variant}.${key}`, `${row.actionClass}.${row.variant}`);
      // 无对象的票不写 NPC 记忆，没有 memory 文本。
      if (!NO_MEMORY_KEYS.includes(key) && spec.target !== 'none') need(`free.memory.${row.variant}.${key}`, `${row.actionClass}.${row.variant}`);
    }
    if (spec.route === 'judge') for (const name of ['success', 'partial', 'failure']) need(`free.stakes.${row.actionClass}.${name}`, row.actionClass);
  }
  for (const reason of GATE_REASONS) need(`free.fact.gate.${reason}`, 'gate');
  need('free.fact.protected', 'protected');
  for (const id of ['judge.aftermath.reason', 'judge.aftermath.effect', 'free.fact.aftermath.hp', 'free.skill.label', 'free.talent.label', 'free.skill.none']) need(id, 'judgement');
  for (const outcome of Object.keys(aftermathConfig().gate.outcomeByResult)) need(`judge.aftermath.severity.${outcome}`, 'aftermath');
  for (const kind of ['worn', 'capped']) need(`free.fact.affinity.${kind}`, 'affinity');
  need('free.why', 'why');
  need('free.why.self', 'why');
  for (const id of ['free.block.settled', 'free.block.refused', 'free.block.inventory.changed', 'free.block.inventory.unchanged', 'free.block.inventory.empty', 'free.block.inventory.item',
    'free.block.inventory.delta.gain', 'free.block.inventory.delta.lose', 'free.receipt.refused', 'free.receipt.given', 'free.receipt.other', 'free.receipt.dismiss']) need(id, 'block');
  return errors;
}
