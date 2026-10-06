import images from '../../../mod-kit/ending-images.qingyu.json';

export interface EndingPresentation { image: string | null }
type EndingRef = { endingId: string; sourceEventId: string };
/** 旧E01与E03共用id，必须由来源事件判别；不得把E03迁移成E01。 */
export function canonicalEndingId(ending: EndingRef | undefined): string {
  if (!ending) return '';
  return ending.endingId === 'lcq.ending.death.paolao' && ending.sourceEventId === 'lcq.event.ningyu_enters_gamble'
    ? 'lcq.ending.death.baihu_beheading' : ending.endingId;
}
export function endingKey(ending: EndingRef | undefined): string {
  return ({
    'lcq.ending.death.baihu_beheading': 'E01',
    'lcq.ending.death.ajiman_bond': 'E02',
    'lcq.ending.death.paolao': 'E03',
    'lcq.ending.death.wangzhe_blast': 'E04',
    'lcq.ending.death.shanghou_relic': 'E05',
    'lcq.ending.death.ghost_king_skull': 'E06',
    'lcq.ending.death.dragon_well': 'E07',
    'lcq.ending.fail.dragon_essence': 'E08',
  } as Record<string, string>)[canonicalEndingId(ending)] || '';
}
export function endingPresentation(ending: EndingRef | undefined): EndingPresentation {
  return { image: (images.byEndingId as Record<string, string | null>)[canonicalEndingId(ending)] || null };
}
/** 仅迁移旧E01终局身份与旧图，不重写已发生的历史正文。 */
export function migrateLegacyE01Ending(ending: (EndingRef & { title?: string; presentation?: EndingPresentation }) | undefined): boolean {
  if (!ending || canonicalEndingId(ending) === ending.endingId) return false;
  ending.endingId = canonicalEndingId(ending);
  ending.title = '第六个';
  ending.presentation = endingPresentation(ending);
  return true;
}
