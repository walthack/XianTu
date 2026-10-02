import { storyChapterTitle } from './eventNarrativeView';
import type { SaveData } from '@/types/game';
import { getJudgementState } from '@/utils/judgementEngine';

import { resolveFixedQuestObjective } from './fixedQuestObjectives';
import { getStageDepartureOffer } from './runtime';
import {
  isXingyuehuLandingPlaytestFinished,
  isXingyuehuLandingPlaytestSave,
  XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID,
  XINGYUEHU_LANDING_ROUTE_MODE,
} from './xingyuehuLandingPlaytest';
import {
  isXingyuehuQuestPlaytestFinished,
  isXingyuehuQuestPlaytestSave,
  XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID,
  XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID,
  XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID,
} from './xingyuehuQuestPlaytest';

export const XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_TAGS = [
  '不知道做什么',
  '不知道为什么',
  '选择没区别',
  '节奏拖沓',
  '其他',
] as const;

export type XingyuehuQuestPlaytestFeedbackTag = typeof XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_TAGS[number];

export const XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KEYS = [
  'kind',
  'localOnly',
  'sentExternally',
  'exportedAt',
  'stageId',
  'activeEventIds',
  'tags',
  'note',
] as const;

export const XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KIND = 'xingyuehu-quest-playtest-feedback';

const EVENT = {
  oldWar: 'lcq.event.xieyi_biling_war',
  fate: 'lcq.event.xieyi_entrustment',
  reception: 'lcq.event.xiaoyaoyi_arrives',
  claim: 'lcq.event.s07_05_eight_steeds_informed',
  resources: 'lcq.event.xiao_opens_resources',
} as const;

const RECEIPT = {
  ashesDelivered: 'lcq.event.xiaoyaoyi_arrives.path.ashes_delivered',
  woundedEscorted: 'lcq.event.xiaoyaoyi_arrives.path.wounded_escorted',
  playerEscort: 'lcq.event.s07_05_eight_steeds_informed.path.player_escort',
  playerInvestigate: 'lcq.event.s07_05_eight_steeds_informed.path.player_investigate',
  estateAuthority: 'lcq.event.xiao_opens_resources.path.estate_authority',
  retainsAffairs: 'lcq.event.xiao_opens_resources.path.retains_affairs',
} as const;

export interface XingyuehuQuestPlaytestChoice {
  listen: { title: string; knownCost: string };
  rescue: { title: string; knownCost: string };
  pendingJudgement: boolean;
}

export interface XingyuehuQuestPlaytestRecap {
  fate: 'dead' | 'longrest';
  fateLabel: '死亡' | '存活长养';
  reception: string | null;
  playerClaim: string | null;
  resourceAuthority: string | null;
  heardResources: string | null;
  lines: string[];
}

export interface XingyuehuQuestPlaytestExperience {
  visible: boolean;
  finished: boolean;
  routeMode: 'from-landing' | 'short-three-acts' | null;
  stageId: string | null;
  stageLabel: string;
  activeEventIds: string[];
  currentGoal: string | null;
  whyNow: string | null;
  continueJourneyHint: string | null;
  choice: XingyuehuQuestPlaytestChoice | null;
  recap: XingyuehuQuestPlaytestRecap | null;
}

export interface XingyuehuQuestPlaytestFeedbackContext {
  stageId: string | null;
  activeEventIds: string[];
  capturedAt: string;
}

export interface XingyuehuQuestPlaytestFeedbackExport {
  kind: typeof XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KIND;
  localOnly: true;
  sentExternally: false;
  exportedAt: string;
  stageId: string | null;
  activeEventIds: string[];
  tags: XingyuehuQuestPlaytestFeedbackTag[];
  note: string;
}

type RuntimeLike = {
  baihuGambleRefusal?: { hallControlled?: boolean };
  modId?: string;
  flags?: Record<string, unknown>;
  pathReceipts?: Record<string, unknown>;
  activeEventIds?: string[];
  completedEventIds?: string[];
  currentChapterId?: string | null;
  chapters?: Array<{ id?: string; title?: string; eventIds?: string[] }>;
  events?: Array<{ id?: string; objective?: unknown; name?: string }>;
  eventActionStates?: Record<string, { preparations?: string[] }>;
};

function runtimeOf(save: SaveData | null | undefined): RuntimeLike | null {
  const runtime = (save as { 世界?: { 状态?: { 剧本模组?: RuntimeLike } } } | null)?.世界?.状态?.剧本模组;
  return runtime && typeof runtime === 'object' ? runtime : null;
}

function flag(runtime: RuntimeLike | null, key: string): unknown {
  return runtime?.flags?.[key];
}

function hasReceipt(runtime: RuntimeLike | null, receiptId: string): boolean {
  return Boolean(runtime?.pathReceipts?.[receiptId]);
}

function activeSet(runtime: RuntimeLike | null): Set<string> {
  return new Set(Array.isArray(runtime?.activeEventIds) ? runtime.activeEventIds : []);
}

function isPlaytestHudSave(save: SaveData | null | undefined): boolean {
  return isXingyuehuQuestPlaytestSave(save) || isXingyuehuLandingPlaytestSave(save);
}

function routeModeOf(save: SaveData | null | undefined): XingyuehuQuestPlaytestExperience['routeMode'] {
  if (isXingyuehuLandingPlaytestSave(save)) return XINGYUEHU_LANDING_ROUTE_MODE;
  if (isXingyuehuQuestPlaytestSave(save)) return 'short-three-acts';
  return null;
}

function stageLabelOf(runtime: RuntimeLike | null, landing: boolean): string {
  const modId = runtime?.modId || null;
  if (landing) {
    if (runtime?.baihuGambleRefusal?.hallControlled) return '白湖商馆·受押';
    const focusId = runtime ? currentFocusEvent(runtime)?.id : undefined;
    const chapter = (runtime?.chapters || []).find(item => focusId && item.eventIds?.includes(focusId))
      || (runtime?.chapters || []).find(item => item.id === runtime?.currentChapterId);
    if (chapter?.title) return storyChapterTitle(modId || undefined, focusId, chapter.title);
    if (modId === 'lcq.stage_01') return '草原';
    if (modId === 'lcq.stage_02') return '五原路';
    if (modId === 'lcq.stage_03b_snake_flower_bridge') return '南荒商路';
    if (modId === 'lcq.stage_04') return '向导';
    if (modId === 'lcq.stage_04b_lingfei_baiyi_crisis') return '白夷一路';
    if (modId === 'lcq.stage_05b') return '鬼王宫';
    if (modId === XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID) return '清远';
    return '';
  }
  if (modId === XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID) return '海神殿';
  if (modId === XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID) return '鬼王峒';
  if (modId === XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID) return '建康';
  return '';
}

function settledXieyiFate(runtime: RuntimeLike | null): 'dead' | 'longrest' | null {
  const status = flag(runtime, 'character.xie_yi.status');
  const longrest = status === 'longrest'
    || flag(runtime, 'branch.lcq.if_xieyi_longrest.active') === true;
  const dead = status === 'dead';
  if (longrest && dead) return null;
  if (longrest) return 'longrest';
  if (dead) return 'dead';
  return null;
}

function exclusiveReceiptLine(
  runtime: RuntimeLike | null,
  firstId: string,
  secondId: string,
  firstLine: string,
  secondLine: string,
): string | null {
  const first = hasReceipt(runtime, firstId);
  const second = hasReceipt(runtime, secondId);
  if (first && second) return null;
  if (first) return firstLine;
  if (second) return secondLine;
  return null;
}

function hasPendingFateJudgement(save: SaveData): boolean {
  const pending = getJudgementState(save).pending;
  if (!pending) return false;
  const receipt = pending.authorityReceipt;
  if (receipt && 'eventId' in receipt && receipt.eventId === EVENT.fate) return true;
  return pending.sourceEventId === EVENT.fate;
}

function heardOldWar(runtime: RuntimeLike | null): boolean {
  const preparations = runtime?.eventActionStates?.[EVENT.oldWar]?.preparations || [];
  return preparations.includes('biling_war_heard') || flag(runtime, 'event.xieyi_biling_war.done') === true;
}

function leMingzhuPresent(runtime: RuntimeLike | null): boolean {
  const status = String(flag(runtime, 'character.le_mingzhu.status') || '');
  return !/^(dead|missing)$/i.test(status.trim());
}

function emptyExperience(): XingyuehuQuestPlaytestExperience {
  return {
    visible: false,
    finished: false,
    routeMode: null,
    stageId: null,
    stageLabel: '',
    activeEventIds: [],
    currentGoal: null,
    whyNow: null,
    continueJourneyHint: null,
    choice: null,
    recap: null,
  };
}

function currentFocusEvent(runtime: RuntimeLike): { id?: string; objective?: unknown; name?: string } | null {
  const ids = Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : [];
  const events = Array.isArray(runtime.events) ? runtime.events : [];
  for (const id of ids) {
    const event = events.find(item => item.id === id);
    if (event) return event;
  }
  return null;
}

function metXieyiFateBeat(runtime: RuntimeLike): boolean {
  const active = activeSet(runtime);
  const completed = new Set(Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : []);
  return active.has(EVENT.fate) || completed.has(EVENT.fate) || Boolean(settledXieyiFate(runtime));
}

function buildRecap(runtime: RuntimeLike | null): XingyuehuQuestPlaytestRecap | null {
  const fate = settledXieyiFate(runtime);
  if (!fate) return null;
  const fateLabel = fate === 'longrest' ? '存活长养' : '死亡';
  const reception = exclusiveReceiptLine(
    runtime,
    RECEIPT.ashesDelivered,
    RECEIPT.woundedEscorted,
    '萧遥逸接走了谢艺的骨灰',
    '萧遥逸接走了重伤的谢艺，并安排密送',
  );
  const playerClaim = exclusiveReceiptLine(
    runtime,
    RECEIPT.playerEscort,
    RECEIPT.playerInvestigate,
    '你认领了护送／看护',
    '你认领了调查',
  );
  const resourceAuthority = exclusiveReceiptLine(
    runtime,
    RECEIPT.estateAuthority,
    RECEIPT.retainsAffairs,
    '谢艺个人事务按遗留事务处理权交接，不是已经领到的物品',
    '谢艺个人事务仍归他本人，不是遗产交接',
  );
  const heardResources = flag(runtime, 'event.xiao_opens_resources.done') === true
    ? '已听清星月湖眼下能用的支持；可用支持需另行领取'
    : null;
  const lines = [
    `谢艺：${fateLabel}`,
    reception,
    playerClaim,
    resourceAuthority,
    heardResources,
  ].filter((line): line is string => Boolean(line));
  return {
    fate,
    fateLabel,
    reception,
    playerClaim,
    resourceAuthority,
    heardResources,
    lines,
  };
}

function deriveLiveGoal(
  runtime: RuntimeLike,
  departureReady: boolean,
  pendingJudgement: boolean,
): Pick<XingyuehuQuestPlaytestExperience, 'currentGoal' | 'whyNow' | 'continueJourneyHint' | 'choice'> {
  const active = activeSet(runtime);
  const stageId = runtime.modId || null;
  const fate = settledXieyiFate(runtime);

  if (stageId === XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID) {
    if (departureReady) {
      return {
        currentGoal: '这段已经听完。',
        whyNow: '谢艺还有未说完的事，需要当面交代。',
        continueJourneyHint: '请用游戏里的「继续旅程」前往下一处。你还在这里。',
        choice: null,
      };
    }
    if (active.has(EVENT.oldWar) && heardOldWar(runtime) && flag(runtime, 'event.xieyi_biling_war.done') !== true) {
      return {
        currentGoal: '当面回应谢艺：他希望你先把岳帅未竟之事接下来。',
        whyNow: '旧战已经听清，现在轮到你回话。',
        continueJourneyHint: null,
        choice: null,
      };
    }
    return {
      currentGoal: '听谢艺把眼前这件事说清：碧鲮族与鲛族的旧战，以及朱狐冠从何而来。',
      whyNow: '他只打算当面说这一次。',
      continueJourneyHint: null,
      choice: null,
    };
  }

  if (stageId === XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID) {
    if (departureReady) {
      return {
        currentGoal: '眼前这件事已经有了结果。',
        whyNow: '后续安排需要带到下一处当面处理。',
        continueJourneyHint: '请用游戏里的「继续旅程」前往下一处。你还在这里。',
        choice: null,
      };
    }
    if (pendingJudgement) {
      return {
        currentGoal: '救治有风险，需要你确认判定。成败还没发生。',
        whyNow: '确认之前，不要把成功或失败当成已经发生。',
        continueJourneyHint: null,
        choice: leMingzhuPresent(runtime) ? fateChoice(true) : null,
      };
    }
    if (active.has(EVENT.fate) && !fate) {
      return {
        currentGoal: '谢艺重伤，还有一件事要当面交代。你现在必须决定怎么做。',
        whyNow: '这是眼前这一刻的选择，不是已经发生的结局。',
        continueJourneyHint: null,
        choice: leMingzhuPresent(runtime) ? fateChoice(false) : {
          listen: {
            title: '陪他把话说完',
            knownCost: '听完后回应这份托付，不打断、不施针。',
          },
          rescue: {
            title: '施针护持暂不可用',
            knownCost: '乐明珠此刻不在场，救治无法进行。',
          },
          pendingJudgement: false,
        },
      };
    }
    return {
      currentGoal: '先看清眼前的局面，再决定怎么做。',
      whyNow: null,
      continueJourneyHint: null,
      choice: null,
    };
  }

  if (stageId === XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID) {
    if (active.has(EVENT.reception)) {
      if (fate === 'longrest') {
        return {
          currentGoal: '萧遥逸已经上门。协助他把重伤的谢艺接走，安排密送。',
          whyNow: '人还在，这一刻要当面处理接应。',
          continueJourneyHint: null,
          choice: null,
        };
      }
      if (fate === 'dead') {
        return {
          currentGoal: '萧遥逸已经上门。把已经发生的死讯当面说清，并把谢艺的骨灰交给他。',
          whyNow: '死讯已经落定，现在只处理眼前的交接。',
          continueJourneyHint: null,
          choice: null,
        };
      }
      return {
        currentGoal: '萧遥逸已经上门。先把眼前这件事当面说清。',
        whyNow: null,
        continueJourneyHint: null,
        choice: null,
      };
    }
    if (active.has(EVENT.claim)) {
      if (fate === 'longrest') {
        return {
          currentGoal: '向孟非卿说明谢艺还活着。秘密转移和调查都会由他开启；你认领护送或调查其中一边。',
          whyNow: '两边都会做，你只需认领自己这一边。',
          continueJourneyHint: null,
          choice: null,
        };
      }
      if (fate === 'dead') {
        return {
          currentGoal: '向孟非卿说明谢艺已死，并留下实质安排。',
          whyNow: '只说明已经发生的事，并看他当场如何安排。',
          continueJourneyHint: null,
          choice: null,
        };
      }
    }
    if (active.has(EVENT.resources)) {
      return {
        currentGoal: '当着萧遥逸听清星月湖眼下能用的支持。可用支持需另行领取。',
        whyNow: '这是当面说明，还不会直接变成你手里的东西。',
        continueJourneyHint: null,
        choice: null,
      };
    }
  }

  return {
    currentGoal: '先看清眼前的局面，再用自己的话行动。',
    whyNow: null,
    continueJourneyHint: null,
    choice: null,
  };
}

function deriveLandingLiveGoal(
  runtime: RuntimeLike,
  departureReady: boolean,
  pendingJudgement: boolean,
): Pick<XingyuehuQuestPlaytestExperience, 'currentGoal' | 'whyNow' | 'continueJourneyHint' | 'choice'> {
  const active = activeSet(runtime);
  const fate = settledXieyiFate(runtime);

  if (departureReady) {
    return {
      currentGoal: '这段已经告一段落。',
      whyNow: '还没动身。下一处要等你启程。',
      continueJourneyHint: '请用游戏里的「继续旅程」前往下一处。你还在这里。',
      choice: null,
    };
  }

  if (pendingJudgement) {
    return {
      currentGoal: '救治有风险，需要你确认判定。成败还没发生。',
      whyNow: '确认之前，不要把成功或失败当成已经发生。',
      continueJourneyHint: null,
      choice: leMingzhuPresent(runtime) ? fateChoice(true) : null,
    };
  }

  if (active.has(EVENT.fate) && !fate) {
    return {
      currentGoal: '谢艺重伤，还有一件事要当面交代。你现在必须决定怎么做。',
      whyNow: '这是眼前这一刻的选择，不是已经发生的结局。',
      continueJourneyHint: null,
      choice: leMingzhuPresent(runtime) ? fateChoice(false) : {
        listen: {
          title: '陪他把话说完',
          knownCost: '听完后回应这份托付，不打断、不施针。',
        },
        rescue: {
          title: '施针护持暂不可用',
          knownCost: '乐明珠此刻不在场，救治无法进行。',
        },
        pendingJudgement: false,
      },
    };
  }

  if (active.has(EVENT.reception)) {
    if (fate === 'longrest') {
      return {
        currentGoal: '萧遥逸已经上门。协助他把重伤的谢艺接走，安排密送。',
        whyNow: '人还在，这一刻要当面处理接应。',
        continueJourneyHint: null,
        choice: null,
      };
    }
    if (fate === 'dead') {
      return {
        currentGoal: '萧遥逸已经上门。把已经发生的死讯当面说清，并把谢艺的骨灰交给他。',
        whyNow: '死讯已经落定，现在只处理眼前的交接。',
        continueJourneyHint: null,
        choice: null,
      };
    }
    return {
      currentGoal: '萧遥逸已经上门。先把眼前这件事当面说清。',
      whyNow: null,
      continueJourneyHint: null,
      choice: null,
    };
  }

  if (active.has(EVENT.claim)) {
    if (fate === 'longrest') {
      return {
        currentGoal: '向孟非卿说明谢艺还活着。秘密转移和调查都会由他开启；你认领护送或调查其中一边。',
        whyNow: '两边都会做，你只需认领自己这一边。',
        continueJourneyHint: null,
        choice: null,
      };
    }
    if (fate === 'dead') {
      return {
        currentGoal: '向孟非卿说明谢艺已死，并留下实质安排。',
        whyNow: '只说明已经发生的事，并看他当场如何安排。',
        continueJourneyHint: null,
        choice: null,
      };
    }
  }

  if (active.has(EVENT.resources)) {
    return {
      currentGoal: '当着萧遥逸听清星月湖眼下能用的支持。可用支持需另行领取。',
      whyNow: '这是当面说明，还不会直接变成你手里的东西。',
      continueJourneyHint: null,
      choice: null,
    };
  }

  const event = currentFocusEvent(runtime);
  const objective = resolveFixedQuestObjective(event);
  const chapter = (runtime.chapters || []).find(item => event?.id && item.eventIds?.includes(event.id))
    || (runtime.chapters || []).find(item => item.id === runtime.currentChapterId);
  const goal = objective || '先看清眼前的局面，再用自己的话行动。';
  const why = runtime.baihuGambleRefusal?.hallControlled
    ? '你仍受商馆控制，先回应眼前的拘拿或谈清离馆条件。'
    : chapter?.title ? `当前：${storyChapterTitle(runtime.modId || undefined, event?.id, chapter.title)}` : '先处理眼前这件事。';
  if (!metXieyiFateBeat(runtime) && /命运|失踪|骨灰|长养|星月开库/.test(`${goal}\n${why}`)) {
    return {
      currentGoal: '先看清眼前的局面，再用自己的话行动。',
      whyNow: '先处理眼前这件事。',
      continueJourneyHint: null,
      choice: null,
    };
  }
  return {
    currentGoal: goal,
    whyNow: why,
    continueJourneyHint: null,
    choice: null,
  };
}

function fateChoice(pendingJudgement: boolean): XingyuehuQuestPlaytestChoice {
  return {
    listen: {
      title: '陪他把话说完',
      knownCost: '听完后回应这份托付，不打断、不施针。',
    },
    rescue: {
      title: '请乐明珠施针，你运功护持',
      knownCost: '救治有风险，需要你运功护持并确认判定。难度不低，会消耗神识。成功才会把伤势压住；未过关不保证人能留下来。',
    },
    pendingJudgement,
  };
}

export function deriveXingyuehuQuestPlaytestExperience(
  save: SaveData | null | undefined,
): XingyuehuQuestPlaytestExperience {
  if (!isPlaytestHudSave(save) || !save) return emptyExperience();
  const runtime = runtimeOf(save);
  const landing = isXingyuehuLandingPlaytestSave(save);
  const routeMode = routeModeOf(save);
  if (!runtime) return { ...emptyExperience(), visible: true, routeMode };
  const finished = landing
    ? isXingyuehuLandingPlaytestFinished(save)
    : isXingyuehuQuestPlaytestFinished(save);
  const stageId = typeof runtime.modId === 'string' ? runtime.modId : null;
  const departureReady = Boolean(getStageDepartureOffer(save));
  const pendingJudgement = hasPendingFateJudgement(save);
  const live = finished
    ? { currentGoal: null, whyNow: null, continueJourneyHint: null, choice: null }
    : landing
      ? deriveLandingLiveGoal(runtime, departureReady, pendingJudgement)
      : deriveLiveGoal(runtime, departureReady, pendingJudgement);
  return {
    visible: true,
    finished,
    routeMode,
    stageId,
    stageLabel: stageLabelOf(runtime, landing),
    activeEventIds: Array.isArray(runtime.activeEventIds) ? [...runtime.activeEventIds] : [],
    currentGoal: live.currentGoal,
    whyNow: live.whyNow,
    continueJourneyHint: live.continueJourneyHint,
    choice: live.choice,
    recap: finished ? buildRecap(runtime) : null,
  };
}

export function extraFeedbackExportKeys(payload: object | null | undefined): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const allowed = new Set<string>(XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KEYS);
  return Object.keys(payload).filter(key => !allowed.has(key));
}

export function captureXingyuehuQuestPlaytestFeedbackContext(input: {
  save: SaveData | null | undefined;
  now?: string;
}): XingyuehuQuestPlaytestFeedbackContext | null {
  if (!isPlaytestHudSave(input.save) || !input.save) return null;
  const runtime = runtimeOf(input.save);
  return {
    stageId: typeof runtime?.modId === 'string' ? runtime.modId : null,
    activeEventIds: Array.isArray(runtime?.activeEventIds) ? [...runtime.activeEventIds] : [],
    capturedAt: input.now || new Date().toISOString(),
  };
}

export function buildXingyuehuQuestPlaytestFeedbackExport(input: {
  save: SaveData | null | undefined;
  tags?: readonly string[];
  note?: string;
  now?: string;
  extras?: Record<string, unknown>;
  context?: XingyuehuQuestPlaytestFeedbackContext | null;
}): XingyuehuQuestPlaytestFeedbackExport | null {
  if (!isPlaytestHudSave(input.save) || !input.save) return null;
  const runtime = runtimeOf(input.save);
  const allowedTags = new Set<string>(XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_TAGS);
  const tags = [...new Set((input.tags || []).filter((tag): tag is XingyuehuQuestPlaytestFeedbackTag => allowedTags.has(tag)))];
  const context = input.context && typeof input.context === 'object' ? input.context : null;
  const payload: XingyuehuQuestPlaytestFeedbackExport = {
    kind: XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_EXPORT_KIND,
    localOnly: true,
    sentExternally: false,
    exportedAt: context?.capturedAt || input.now || new Date().toISOString(),
    stageId: context ? context.stageId : (typeof runtime?.modId === 'string' ? runtime.modId : null),
    activeEventIds: context
      ? [...(Array.isArray(context.activeEventIds) ? context.activeEventIds : [])]
      : (Array.isArray(runtime?.activeEventIds) ? [...runtime.activeEventIds] : []),
    tags,
    note: String(input.note || '').slice(0, 2000),
  };
  void input.extras;
  return payload;
}
