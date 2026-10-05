import images from '../../../mod-kit/ending-images.qingyu.json';

export interface EndingPresentation { image: string | null }
export function endingKey(ending: { endingId: string; sourceEventId: string } | undefined): string {
  if (!ending) return '';
  return ({
    'lcq.ending.death.ajiman_bond': 'E02',
    'lcq.ending.death.shanghou_relic': 'E05',
    'lcq.ending.death.wangzhe_blast': 'E04',
    'lcq.ending.death.ghost_king_skull': 'E06',
    'lcq.ending.death.dragon_well': 'E07',
    'lcq.ending.fail.dragon_essence': 'E08',
  } as Record<string, string>)[ending.endingId] || (ending.endingId === 'lcq.ending.death.paolao'
    ? ending.sourceEventId === 'lcq.event.ningyu_enters_gamble' ? 'E01' : 'E03' : '');
}
export function endingPresentation(ending: { endingId: string; sourceEventId: string } | undefined): EndingPresentation {
  return { image: (images.images as Record<string, string | null>)[endingKey(ending)] || null };
}
