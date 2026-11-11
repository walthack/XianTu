/**
 * 跨关常驻的可选拍入口（交接 2026-11-09 需求一、需求三旧档）。
 * - 藻丝取物：拍只投影在 04b；04b 之后的各关在加载、切关、地图抵达和每回合推进时，人在碧鲮就把取物事件、持物的本地人与样品定义补进本关运行时。
 * - 驿馆会合：有可靠「留下」记录、尚未会合的 05b 旧档，内嵌事件表里没有会合拍时按当前内容包补上（是否开场仍由拍自己的 requires 决定）。
 * 只补缺失项，不改玩家已有状态；拍已完成（questLineState.receipts）就不再补。
 */
import type { SaveData } from '@/types/game';
import { CONTENT_PACKS } from '../contentPacks';
import { catalogItem, resolveScenarioContent } from './entityCatalog';
import { awaitingRejoin } from './stayRejoin';
import { currentLocation } from './travel/travelLedger';
import stage04b from './builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json';

/** 只补清羽记本书已登记的关（lcq.*）；别的书另有主角与地图，不带这条入口。 */
const QINGYU_STAGE_PREFIX = 'lcq.';

/**
 * 两种常驻入口（F0b 2026-11-11：与内容包 persistentEntries 合并，TS 在前、包按 catalog 顺序在后，每种全局至多一条）。
 * algae：stageId 是取物事件原生投影的关（04b，也是模板事件与持物人／样品定义的来源）；notBeforeStageIds 是不碰藻丝的 04b 之前各关。
 * 包里的 algae 条目由编译器带上 templateEvent（从它的关抄出的事件，内置关取原始事件，同下面的静态 import）。
 */
export interface PersistentEntry {
  kind: 'algae' | 'rejoin';
  beatId: string; eventId: string; stageId: string;
  locationId?: string; characterId?: string; itemId?: string; receiptId?: string; notBeforeStageIds?: string[];
  templateEvent?: unknown;
}
export const TS_PERSISTENT_ENTRIES: PersistentEntry[] = [
  {
    kind: 'algae',
    stageId: 'lcq.stage_04b_lingfei_baiyi_crisis',
    /** 04b 之前的关不碰藻丝；04b 本身事件已原生投影，只做旧档完成映射。 */
    notBeforeStageIds: ['lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04'],
    beatId: 'beat.side.biling_algae_silk.01',
    eventId: 'lcq.event.side_biling_algae_silk',
    locationId: 'liuchao.location.biyu_village',
    characterId: 'lcq.character.biling_woman_ch80',
    itemId: 'lcq.item.biling_algae_sample',
    receiptId: 'rcpt.side.biling_algae_silk.ordered',
  },
  {
    kind: 'rejoin',
    beatId: 'beat.ningyu.y5_rejoin',
    eventId: 'lcq.event.blank_letter_and_dagu_ins_ningyu_rejoin',
    stageId: 'lcq.stage_05b',
  },
];

/** 合并后按种类取唯一一条（TS 在前、包在后；同一种两条抛错，编译期已拦；一条都没有也抛错）。 */
export function persistentEntryIn(entries: readonly PersistentEntry[], kind: PersistentEntry['kind']): PersistentEntry {
  const hits = entries.filter(x => x.kind === kind);
  if (hits.length > 1) throw Error(`常驻入口 ${kind} 同时在内容包与 TS 里定义`);
  if (!hits.length) throw Error(`缺少常驻入口 ${kind}`);
  return hits[0];
}
const ENTRIES = [...TS_PERSISTENT_ENTRIES, ...((CONTENT_PACKS.persistentEntries || []) as PersistentEntry[])];
const ALGAE = persistentEntryIn(ENTRIES, 'algae'), REJOIN = persistentEntryIn(ENTRIES, 'rejoin');
const STAGE_04B = ALGAE.stageId;
const BEFORE_ALGAE: readonly string[] = ALGAE.notBeforeStageIds || [];

export const ALGAE_ENTRY = {
  beatId: ALGAE.beatId,
  eventId: ALGAE.eventId,
  locationId: ALGAE.locationId!,
  characterId: ALGAE.characterId!,
  itemId: ALGAE.itemId!,
  receiptId: ALGAE.receiptId!,
} as const;

export const REJOIN_ENTRY = {
  beatId: REJOIN.beatId,
  eventId: REJOIN.eventId,
  stageId: REJOIN.stageId,
} as const;

/** 地图上只作取物访问的落点：到这里不算抵达待启程的下一关。 */
export const VISIT_ONLY_MAP_LOCATION_IDS: readonly string[] = [ALGAE_ENTRY.locationId];

const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;

/**
 * 藻丝已取的稳定依据：拍回执（跨关继承）。旧档没有拍回执、但有本拍自己的路径回执、发物回执或背包里已有样品时同样算已取，
 * 补记一条标明来源的拍回执，之后各处都只看拍回执。无关剧情不作依据。
 */
export function algaeCollected(save: SaveData | null | undefined): boolean {
  const r = runtimeOf(save);
  if (!r) return false;
  if (r.questLineState?.receipts?.[ALGAE_ENTRY.beatId]) return true;
  const evidence = r.pathReceipts?.[ALGAE_ENTRY.receiptId] ? 'pathReceipt'
    : (r.inventoryTransferReceipts || []).some((x: any) => x?.itemId === ALGAE_ENTRY.itemId) ? 'transferReceipt'
      : Number((save as any)?.角色?.背包?.物品?.[ALGAE_ENTRY.itemId]?.数量) > 0 ? 'inventory' : '';
  if (!evidence) return false;
  const state = r.questLineState ||= { version: 1, receipts: {} };
  state.receipts[ALGAE_ENTRY.beatId] = { receiptId: `legacy:${evidence}`, turn: Number(r.worldTurn) || 0, outcome: 'success' };
  return true;
}

let algaeSource: { event: any; character: any; item: any } | undefined;
function algaeTemplate() {
  if (algaeSource) return algaeSource;
  // 包条目带编译器抄好的模板事件；TS 条目沿用静态 import 的 04b 原始关数据
  const event = ALGAE.templateEvent ?? (stage04b as any).scenario.events.find((e: any) => e.id === ALGAE_ENTRY.eventId);
  const holder = resolveScenarioContent({ manifest: { id: STAGE_04B }, canon: { characters: [] }, scenario: { optionalActorIds: [ALGAE_ENTRY.characterId] } }) as any;
  const item = catalogItem(ALGAE_ENTRY.itemId, STAGE_04B);
  if (!event || !item) throw Error(`藻丝取物入口模板缺失：${!event ? ALGAE_ENTRY.eventId : ALGAE_ENTRY.itemId}`);
  algaeSource = { event, character: holder.canon.characters[0], item };
  return algaeSource;
}

function rejoinTemplate(): any {
  return CONTENT_PACKS.overlays.filter(o => o.stageId === REJOIN_ENTRY.stageId).flatMap(o => o.events || []).find(e => e.id === REJOIN_ENTRY.eventId);
}

/** 幂等；返回本次补进运行时的条目数。改入参。 */
export function syncPersistentLineEntries(save: SaveData | null | undefined): number {
  const r = runtimeOf(save);
  if (!r || r.gameOver || !Array.isArray(r.events)) return 0;
  const stageId = String(r.modId || '');
  let added = 0;
  // 只在人到了碧鲮村本身时补（海神殿等子地点不算，取物的人在村里）：别处的本关事件表保持原样，切关核对与出场名单都按原关。
  const atBiling = currentLocation(save as SaveData).canonicalLocationId === ALGAE_ENTRY.locationId;
  if (stageId.startsWith(QINGYU_STAGE_PREFIX) && !BEFORE_ALGAE.includes(stageId) && !algaeCollected(save) && stageId !== STAGE_04B && atBiling) {
    const { event, character, item } = algaeTemplate();
    if (!r.events.some((e: any) => e.id === event.id)) { r.events.push({ ...structuredClone(event), critical: false }); added++; }
    const canon = r.canon ||= {};
    if (!(canon.characters ||= []).some((c: any) => c.id === character.id)) { canon.characters.push(structuredClone(character)); added++; }
    if (!(canon.items ||= []).some((x: any) => x.id === item.id)) { canon.items.push(structuredClone(item)); added++; }
  }
  if (stageId === REJOIN_ENTRY.stageId && awaitingRejoin(r) && !r.events.some((e: any) => e.id === REJOIN_ENTRY.eventId)) {
    const template = rejoinTemplate();
    if (template) { r.events.push(structuredClone(template)); added++; }
  }
  return added;
}
