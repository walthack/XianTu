/**
 * 兼容薄壳（阶段 2b）：大祭已改成包里声明的世界事件（packs/festival，id heimohaiFestival），逻辑在 worldEvents.ts。
 * 这里的导出名永久保留（tests/、scripts/dev/make-test-saves.mjs 照旧调用）；src 里的通用模块不要再 import 本文件，改用 worldEvents.ts。
 * FESTIVAL 的 10 个键与原 numbers 的 story.lineCompass.festival 同名同值，由包声明和包 texts 拼出。
 */
import type { SaveData } from '@/types/game';
import { WORLD_EVENTS, worldEventText, worldEventCloseHolds, worldEventView, startWorldEvent } from './worldEvents';
export { lineClosedByWorldEvent } from './worldEvents';

const DEF = WORLD_EVENTS.find(x => x.id === 'heimohaiFestival');
if (!DEF) throw Error('缺少世界事件 heimohaiFestival（packs/festival/world-events.json）');
const QIN = DEF.closes[0];

export const FESTIVAL = {
  eventId: DEF.eventId,
  finalStageId: DEF.stageId,
  qinStageId: QIN.stageId,
  qinLineId: QIN.lineId,
  qinMessageEventId: QIN.messageEventId,
  actionId: DEF.actionId,
  warning: worldEventText(DEF, 'warning'),
  transition: worldEventText(DEF, 'transition'),
  blocked: worldEventText(DEF, 'blocked'),
  label: worldEventText(DEF, 'label'),
};
const runtime = (save: any) => save?.世界?.状态?.剧本模组;
export function qinClosedByFestival(save: any, rt = runtime(save)): boolean {
  return worldEventCloseHolds(save, rt, DEF!, QIN);
}
export function festivalView(save: any) {
  return worldEventView(save, DEF!);
}
/** Only the explicit UI choice calls this; ticks and narrative reconciliation never do. */
export function startHeimohaiFestival(save: SaveData, choice: { source: string; actionId: string }) {
  return startWorldEvent(save, DEF!.id, choice);
}
