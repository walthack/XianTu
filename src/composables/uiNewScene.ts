/**
 * 新界面（?ui=new）场景框的地点场景图：按存档里玩家现在的地点（先区内节点、再地点）和钟点找图。
 * 地点对哪几类场景图登记在内容包 assets 的 locationScenes；夜（20 点到 5 点）有夜图用夜图。
 * 没登记、或登记了但图片文件不在（图不进公开仓库）→ 空串，场景框只写地点名。
 */
import type { SaveData } from '@/types/game';
import { currentLocation } from '@/modules/scenarioMods/travel/travelLedger';
import { sceneDayPart } from '@/modules/scenarioMods/fixedEndingNarratives';
import { canonicalEntityId } from '@/modules/scenarioMods/namedEntities';
import { locationSceneCandidates, type PackAssets } from '@/modules/contentPacks/assets';
import { packImageUrl } from '@/assets/packImages';

export function locationSceneFiles(save: SaveData | null | undefined, assets?: PackAssets): string[] {
  if (!save) return [];
  const here = currentLocation(save);
  const ids = [here.zoneId, here.locationId, here.canonicalLocationId].map(id => id ? canonicalEntityId('location', id) : undefined);
  const part = sceneDayPart((save as { 元数据?: { 时间?: unknown } }).元数据?.时间);
  return locationSceneCandidates({ locationIds: ids, night: part === '夜' || part === '深夜' }, assets).map(scene => scene.file);
}

export function locationSceneImageUrl(save: SaveData | null | undefined): string {
  for (const file of locationSceneFiles(save)) {
    const url = packImageUrl(file);
    if (url) return url;
  }
  return '';
}
