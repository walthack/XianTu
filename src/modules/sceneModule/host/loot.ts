import {currentLocation} from '@/modules/scenarioMods/travel/travelLedger';
import {catalogItem,contentName,resolveContentId} from '@/modules/scenarioMods/entityCatalog';
// Author-approved encounter loot effects. Dice and inventory transfers stay code-owned.
import type { SaveData } from '@/types/game';
import { locationWithin } from '@/modules/scenarioMods/travel/locationIds';
import { activeScene, cloneSave, readExt, writeExt } from './ext';
import type { HostDeps } from './controller';
export const BROKEN_AXE = 'lcq.item.f10_broken_axe';
export const NICHE_CRYSTAL = 'lcq.item.nh_niche_crystal';
export function equippedAxe(save: SaveData): boolean {
  return Object.values((save as any)?.角色?.背包?.物品 || {}).some((item:any)=>item.物品ID===BROKEN_AXE && item.已装备===true && item.数量>0);
}
export function twoHandConflict(save: SaveData, itemId: string): boolean {
  const items=(save as any)?.角色?.背包?.物品 || {};
  const catalog=(save as any)?.世界?.状态?.剧本模组?.canon?.items || [];
  const weapon=(id:string)=>catalog.some((item:any)=>item.id===id && item.type==='weapon') || catalogItem(id)?.type==='weapon' || catalogItem(resolveContentId('item',String(items[id]?.名称||''))||'')?.type==='weapon';
  return Object.keys(items).some(id=>id!==itemId && items[id]?.已装备 && ((itemId===BROKEN_AXE && weapon(id)) || (id===BROKEN_AXE && weapon(itemId))));
}
export function canUseNicheCrystal(save: SaveData | null): boolean {
  if(!save)return false;
  const a=activeScene(save),loc=currentLocation(save).canonicalLocationId;
  const item=(save as any)?.角色?.背包?.物品?.[NICHE_CRYSTAL];
  return !!a && a.state.status==='engaged' && !a.pending && !a.choice && item?.数量>0
    && locationWithin(loc,'liuchao.location.gui_wang_gong') && !a.state.itemEffects?.woundGuard && !a.state.itemEffects?.defenseBonus;
}
export async function useNicheCrystal(source:SaveData, mode:'wound'|'defense', deps:HostDeps):Promise<void>{
  if(!canUseNicheCrystal(source))throw new Error(`${contentName('item',NICHE_CRYSTAL)}只能在宫内交锋中选择一次护膜用途`);
  const save=cloneSave(source),ext=cloneSave(readExt(save)),a=ext.active!;
  const items=(save as any).角色.背包.物品,item=items[NICHE_CRYSTAL];item.数量--;if(item.数量===0)delete items[NICHE_CRYSTAL];
  a.state.itemEffects=mode==='wound'?{woundGuard:true}:{defenseBonus:2};
  a.notice=mode==='wound'?`${contentName('item',NICHE_CRYSTAL)}耗去：下一次外伤降一档。`:`${contentName('item',NICHE_CRYSTAL)}耗去：下一次防御检定 +2。`;
  writeExt(save,ext);await deps.persist(save);
}
