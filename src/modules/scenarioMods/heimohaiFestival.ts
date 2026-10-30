import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { getCanonRailProfile } from './canonRail';
import { activeScene } from '../sceneModule/host/ext';

export const FESTIVAL = GAME_NUMBERS.story.lineCompass.festival;
const runtime = (save: any) => save?.世界?.状态?.剧本模组;
export function qinClosedByFestival(save: any, rt = runtime(save)): boolean {
  return save?.系统?.扩展?.festivalStarted === true && rt?.modId !== FESTIVAL.qinStageId
    && !(rt?.chronicle || []).some((e: any) => e.stageId === FESTIVAL.qinStageId);
}
/** Same rail settlement rules as advanceScenarioRuntime/isEventSettled, including void beats. */
function finalStageComplete(rt: any): boolean {
  if (rt?.modId !== FESTIVAL.finalStageId) return false;
  const rail = getCanonRailProfile(rt);
  return !!rail?.orderedEventIds.length && rail.orderedEventIds.every(id => {
    if (rt.completedEventIds.includes(id) || (rt.offscreenResolvedEventIds || []).includes(id)) return true;
    const condition = rt.events.find((e: any) => e.id === id)?.completion?.[0];
    return condition?.path?.startsWith('flags.') && condition.path.endsWith('.done')
      && rt.flags[condition.path.slice('flags.'.length).replace(/\.done$/, '.void')] === true;
  });
}
export function festivalView(save: any) {
  const rt = runtime(save);
  const started = save?.系统?.扩展?.festivalStarted === true;
  const inQin = rt?.modId === FESTIVAL.qinStageId;
  const source = inQin ? save?.系统?.扩展?.mapEntryResume?.runtime : rt;
  return {
    warning: !started && rt?.modId === FESTIVAL.finalStageId ? FESTIVAL.warning : '',
    available: !started && finalStageComplete(source) && !rt?.gameOver && !activeScene(save),
    blocked: inQin ? FESTIVAL.blocked : '',
    transition: started ? FESTIVAL.transition : '',
  };
}
/** Only the explicit UI choice calls this; ticks and narrative reconciliation never do. */
export function startHeimohaiFestival(save: SaveData, choice: { source: string; actionId: string }) {
  const view = festivalView(save);
  if (view.blocked) return { ok: false, note: view.blocked };
  if (choice?.source !== 'player' || choice.actionId !== FESTIVAL.actionId || !view.available) return { ok: false, note: '' };
  const s = save as any, rt = runtime(save);
  ((s.系统 ||= {}).扩展 ||= {}).festivalStarted = true;
  if (!rt.completedEventIds.includes(FESTIVAL.eventId)) rt.completedEventIds.push(FESTIVAL.eventId);
  const chronicle = rt.chronicle ||= [];
  chronicle.push({ id: `chronicle.${rt.modId}.${FESTIVAL.eventId}`, type: 'event', stageId: rt.modId,
    title: FESTIVAL.label, detail: FESTIVAL.transition, sequence: chronicle.length + 1 });
  if (qinClosedByFestival(save)) {
    rt.activeEventIds = rt.activeEventIds.filter((id: string) => id !== FESTIVAL.qinMessageEventId);
    for (const chapter of rt.chapters) chapter.eventIds = chapter.eventIds.filter((id: string) => id !== FESTIVAL.qinMessageEventId);
  }
  return { ok: true, note: FESTIVAL.transition };
}
