/**
 * 自服消耗品的原话识别（只读，不落账）：自由行动票校验与 freeAction/selfConsumable 结算共用。
 * 放在 freeAction/ 外：那里按守则不对原话做正则匹配（tests/freeActionStatic），原话识别只在这里。
 * 05e63d31 真机 MED1「我取出朱箓蛇丹服下，运气疗伤」。
 */
import type { SaveData } from '@/types/game';
import { contentDefinition } from './entityCatalog';

const EAT = '(?:服下|服用|吞下|吃下|咽下|服食)';

/** 原话是否明确要自己服下背包里恰好一件消耗品；否定（「不要服下」）、喂给别人、点名多件或没持有都不算。 */
export function selfConsumableTarget(save: SaveData, input: string): { itemId: string; name: string } | undefined {
  const text = String(input || '').trim();
  if (!new RegExp(EAT).test(text)) return undefined;
  if (new RegExp(`(?:不|别|没|未|勿)(?:要|想|肯|敢|能|必)?(?:再)?${EAT}`).test(text) || /喂|给[^，。！？]{1,8}(?:服|吃|吞)/.test(text)) return undefined;
  const bag = (save as any)?.角色?.背包?.物品;
  if (!bag || typeof bag !== 'object') return undefined;
  const named = Object.entries<any>(bag).flatMap(([id, row]) => {
    const def = contentDefinition('item', id) as any;
    const name = String(def?.name || row?.名称 || '');
    return def?.type === 'consumable' && name && Number(row?.数量) > 0 && text.includes(name) ? [{ itemId: id, name }] : [];
  });
  return named.length === 1 ? named[0] : undefined;
}
