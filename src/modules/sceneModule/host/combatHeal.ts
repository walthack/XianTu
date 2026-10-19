/**
 * 战中「用药/运功疗伤」（combat.heal）的 host 一侧：
 * - 玩家原话点名背包里带疗伤标签的药 → 消耗 1 份，按品级（combat.heal.itemHpGainByGrade）加回血；
 * - 把引擎记下的 hpGain 与药的回血一起写进 角色.属性.气血，不超过上限，写完清零。
 */
import type { SaveData } from '@/types/game';
import type { SceneState } from '../types';
import { GAME_NUMBERS } from '../numbers';
import { contentDefinition } from '@/modules/scenarioMods/entityCatalog';
import { itemTierOf } from '@/modules/scenarioMods/itemGrades';

const cfg = () => (GAME_NUMBERS.combat as any).heal;

export function findHealItem(save: SaveData, text: string): { itemId: string; name: string; tier: string } | undefined {
  const items = (save as any)?.角色?.背包?.物品 || {};
  const tags: string[] = cfg().itemTags;
  for (const [id, row] of Object.entries<any>(items)) {
    const name = String(row?.名称 || (contentDefinition('item', id) as any)?.name || '');
    if (!name || !text.includes(name) || !(Number(row?.数量) > 0)) continue;
    if (!((contentDefinition('item', id) as any)?.effectTags as string[] || []).some(t => tags.includes(t))) continue;
    const grade = (contentDefinition('item', id) as any)?.grade;
    return { itemId: id, name, tier: itemTierOf(grade)?.name || '凡品' };
  }
  return undefined;
}

export function applyCombatHeal(save: SaveData, state: SceneState, playerId: string, text: string): { item?: string; hpGained: number } {
  let ratio = state.hpGain?.[playerId] || 0;
  if (state.hpGain) delete state.hpGain[playerId];
  const item = findHealItem(save, text);
  if (item) {
    const row = (save as any).角色.背包.物品[item.itemId];
    row.数量 = Number(row.数量) - 1;
    if (row.数量 <= 0) delete (save as any).角色.背包.物品[item.itemId];
    ratio += Number(cfg().itemHpGainByGrade?.[item.tier] || 0);
  }
  const hp = (save as any)?.角色?.属性?.气血, cur = Number(hp?.当前), max = Number(hp?.上限);
  if (!(ratio > 0) || !Number.isFinite(cur) || !(max > 0)) return { item: item?.itemId, hpGained: 0 };
  const next = Math.min(max, cur + Math.round(max * ratio));
  hp.当前 = next;
  return { item: item?.itemId, hpGained: next - cur };
}
