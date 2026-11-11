/**
 * 玩家自服背包里的消耗品（故事回合；战中服药走场面 heal_self，不经这里）。
 *
 * 05e63d31 真机 MED1「我取出朱箓蛇丹服下，运气疗伤」：没有本地规则接这一口，自由行动的背包事实块写着「没有消耗任何物品」，
 * 叙事只能写成蛇丹未入口。这里在发给叙事前本地落账：扣份数、按物品总表已有配置结算——
 * effectTags 解除身上对应状态（与喂药同一张解除／降级表）、onUse 挂状态。不从描述推断回血，没有配置的效果一律不给。
 * 份数取 freeAction 给予类的 defaults.consume（喂药与自服同一口径）；正文取内容包 free.*.selfUse.*。原话识别在 ../selfConsumableIntent。
 */
import type { SaveData } from '@/types/game';
import { packText } from '@/modules/contentPacks';
import { selfConsumableTarget } from '../selfConsumableIntent';
import { freeActionConfig } from './config';
import { findTreatable } from './gates';
import { removeSceneInjury } from '../../sceneModule/host/injuries';
import { scenarioPlayerId } from '../playerIdentity';
import { applyActorStatus } from './actorStatus';
import { afterItemFed } from './maigu';
import { itemEffectOf, tagDowngradeOf, applyItemOnUse } from './itemUse';
import { catalogStatus } from '../../sceneModule/statuses';
import { contentDefinition } from '../entityCatalog';

export interface SelfConsumableResult { itemId: string; name: string; count: number; facts: string[] }

const fill = (key: string, slots: Record<string, string | number>) =>
  Object.entries(slots).reduce((text, [slot, value]) => text.split(`{${slot}}`).join(String(value)), packText(key));

/** 一次服用的效果结算（不扣份数）：effectTags 解除／降级、onUse 挂状态、afterItemFed。返回事实行（首行是「服下了…」）。 */
function applyDose(save: SaveData, actor: string, itemId: string, name: string, count: number): string[] {
  const effect = itemEffectOf(itemId), facts = [fill('free.fact.selfUse.used', { item: name, count })];
  const treat = effect.onUse.length ? undefined : findTreatable(save, actor, effect.tags);
  if (treat && removeSceneInjury(save, { actorId: actor }, treat.row.statusId, 'item', treat.tag)) {
    const downgrade = tagDowngradeOf(treat.tag, treat.row.statusId);
    if (downgrade && !applyActorStatus(save, actor, downgrade, { sourceId: itemId }).ok) throw new Error('物品状态降级失败');
    facts.push(fill('free.fact.selfUse.cured', { status: treat.row.label }));
  }
  const applied = applyItemOnUse(save, actor, itemId);
  if (applied.some(result => !result.ok)) throw new Error('物品配置效果未能结算');
  if (effect.onUse.length) facts.push(fill('free.fact.selfUse.onUse', { status: effect.onUse.map(use => catalogStatus(use.statusId)?.label || use.statusId).join('、') }));
  afterItemFed(save, actor, itemId);
  return facts;
}

/** 落账自服；同一回合同一句重复调用按回执返回、不重复扣。没有对应物品或份数不够返回 undefined（交叙事照常处理）。 */
export function settleSelfConsumable(save: SaveData, input: string): SelfConsumableResult | undefined {
  const runtime = (save as any)?.世界?.状态?.剧本模组;
  const target = runtime ? selfConsumableTarget(save, input) : undefined;
  const actor = target ? scenarioPlayerId(save) : undefined;
  if (!target || !actor) return undefined;
  const key = `${Number(runtime.worldTurn) || 0}:${String(input).trim()}`;
  if (runtime.selfConsumableReceipt?.key === key) return runtime.selfConsumableReceipt.result;
  const count = Number(freeActionConfig().classes.give?.defaults?.consume);
  if (!(count > 0)) throw new Error('自服份数未配置：freeAction.classes.give.defaults.consume');
  const bag = (save as any).角色.背包.物品, row = bag[target.itemId];
  if (!(Number(row.数量) >= count)) return undefined;
  const facts = applyDose(save, actor, target.itemId, target.name, count);
  row.数量 = Number(row.数量) - count;
  if (row.数量 <= 0) delete bag[target.itemId];
  if (facts.length === 1) facts.push(packText('free.fact.selfUse.noEffect'));
  const result = { itemId: target.itemId, name: target.name, count, facts };
  runtime.selfConsumableReceipt = { key, result };
  return result;
}

export interface ButtonUse { id: string; itemId: string; quantity: number }

/**
 * 背包「使用」按钮（8092 90def980 真机 1A：药被扣、无药效无成瘾）：按钮点下时只扣了份数、往操作队列塞了一句话，
 * 效果要在回合发送时由这里补结算——每一份按自服同一口径走一次 applyDose，不再扣份数。
 * 只认物品总表里的消耗品；已结算过的队列项（按 id 记在回执里，失败回合随存档回退）不重复结算。
 */
export function settleButtonUses(save: SaveData, uses: ButtonUse[]): SelfConsumableResult[] {
  const runtime = (save as any)?.世界?.状态?.剧本模组;
  const actor = runtime ? scenarioPlayerId(save) : undefined;
  if (!actor) return [];
  const done: string[] = runtime.buttonUseReceipt?.ids || [];
  const results: SelfConsumableResult[] = [];
  for (const use of uses) {
    const def = contentDefinition('item', use.itemId) as any;
    if (done.includes(use.id) || def?.type !== 'consumable' || !(use.quantity > 0)) continue;
    const facts = [...new Set(Array.from({ length: use.quantity }, () => applyDose(save, actor, use.itemId, String(def.name), use.quantity)).flat())];
    if (facts.length === 1) facts.push(packText('free.fact.selfUse.noEffect'));
    results.push({ itemId: use.itemId, name: String(def.name), count: use.quantity, facts });
  }
  if (results.length) runtime.buttonUseReceipt = { ids: uses.map(use => use.id) };
  return results;
}

/** 发给叙事的既定事实块。 */
export const renderSelfConsumableBlock = (result: SelfConsumableResult): string => fill('free.block.selfUse', { facts: result.facts.join('；') });
/** 界面持久回执一行。 */
export const renderSelfConsumableReceipt = (result: SelfConsumableResult): string => fill('free.receipt.selfUse', { facts: result.facts.join('；') });
