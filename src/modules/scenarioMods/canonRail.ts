/**
 * Canon Rail keeps the default Six Dynasties route on its source-backed beats.
 *
 * A rail is selected by its audited stage, not by player choice. It is not an
 * alternate scenario system: an explicit IF branch remains the only place
 * allowed to replace a canon outcome.
 */

export interface CanonRailContract {
  eventId: string;
  /** Source-backed result which must happen before this node can be completed. */
  mustReach: string;
  /** Compact, source-backed anchors that must be present in reconciliation evidence. */
  completionEvidence: string[];
  /** Disallowed default-line rewrites; only an explicit IF may authorize them. */
  forbiddenInCanon: string[];
  /** Safe material the narrator may add between fixed beats. */
  allowedElaboration: string;
}

export interface CanonRailProfile {
  id: string;
  modId: string;
  chapterId: string;
  orderedEventIds: string[];
  contracts: CanonRailContract[];
}

/** The first audited pilot.  The #9/#10 source order fixes the old reversed event conditions. */
export const CANON_RAIL_PROFILES: CanonRailProfile[] = [
  {
    id: 'qingyu.stage_01',
    modId: 'lcq.stage_01',
    chapterId: 'lcq.chapter.stage_01',
    orderedEventIds: [
      'lcq.event.s01_01',
      'lcq.event.s01_02',
      'lcq.event.s01_03',
      'lcq.event.s01_04',
      'lcq.event.s01_06',
      'lcq.event.s01_05',
    ],
    contracts: [
      {
        eventId: 'lcq.event.s01_01',
        mustReach: '程宗扬与段强在航班上遭紫色雷电击中，并从现代世界消失、坠入异界草原。',
        completionEvidence: ['程宗扬', '段强', '紫色雷电'],
        forbiddenInCanon: ['改写穿越原因', '替换同行者', '提前抵达后续地点'],
        allowedElaboration: '可补足机舱异象、坠落后的感官与两人的即时应对；不得另造穿越原因或改写同行者。',
      },
      {
        eventId: 'lcq.event.s01_02',
        mustReach: '段强在异界草原遭半兽人袭击身亡，程宗扬被迫独自求生。',
        completionEvidence: ['段强', '半兽人', '射杀'],
        forbiddenInCanon: ['段强存活', '段强失踪', '替换死亡结果'],
        allowedElaboration: '可补足遭袭过程、程宗扬的反应与脱险衔接；不得让段强存活、失踪或换成其他结局。',
      },
      {
        eventId: 'lcq.event.s01_03',
        mustReach: '程宗扬在战场与受伤、女扮男装的月霜初遇，冲突由误触其胸部引发。',
        completionEvidence: ['月霜', '初遇', '受伤'],
        forbiddenInCanon: ['提前揭露月霜身世', '提前引入后续人物'],
        allowedElaboration: '可补足战场混乱、彼此误解与短暂协作；不得提前揭露不在场人物的私密背景。',
      },
      {
        eventId: 'lcq.event.s01_04',
        mustReach: '卓云君施救，太乙真宗诸人介入并击退兽蛮，使程宗扬与月霜脱险。',
        completionEvidence: ['卓云君', '兽蛮', '脱险'],
        forbiddenInCanon: ['无关人物获得太乙身份', '改写救援结果'],
        allowedElaboration: '可补足救援过程、战后安置与人物反应；不得把无关人物写成太乙弟子、教御或道门中人。',
      },
      {
        eventId: 'lcq.event.s01_06',
        mustReach: '月霜寒毒危急，真阳进入其体内并压制、化解寒毒。',
        completionEvidence: ['月霜', '寒毒', '真阳'],
        forbiddenInCanon: ['以替代疗法跳过寒毒', '将本拍作废'],
        allowedElaboration: '可补足伤势危机、救治的前因后果与事后关系张力；不得以“作废”或替代疗法跳过此一既定结果。',
      },
      {
        eventId: 'lcq.event.s01_05',
        mustReach: '王哲为程宗扬筑基疗伤，授其九阳神功口诀，程宗扬以自创文字记录。',
        completionEvidence: ['王哲', '筑基', '九阳神功'],
        forbiddenInCanon: ['提前扩写下一关', '改写传功结果'],
        allowedElaboration: '可补足帅帐会面、问答与传功后的余波；不得提前扩写后续关卡剧情。',
      },
    ],
  },
];

/** Only stages that have passed source/order audit appear in this registry. */
export function getCanonRailProfile(runtime: { modId?: unknown } | null | undefined): CanonRailProfile | null {
  if (typeof runtime?.modId !== 'string') return null;
  return CANON_RAIL_PROFILES.find(profile => profile.modId === runtime.modId) || null;
}

export function getCanonRailContract(profile: CanonRailProfile | null, eventId: string): CanonRailContract | null {
  return profile?.contracts.find(contract => contract.eventId === eventId) || null;
}

export function getCanonRailOrder(profile: CanonRailProfile | null): Map<string, number> {
  return new Map((profile?.orderedEventIds || []).map((id, index) => [id, index]));
}

export function isCanonRailChapter(profile: CanonRailProfile | null, chapterId: string | null | undefined): boolean {
  return Boolean(profile && profile.chapterId === chapterId);
}
