import type { SaveData } from '@/types/game';
import { formatEarnedTitles } from './milestoneRewards';
import { getNarrativeAnchorEvent } from './runtime';
import { getCanonRailContract, getCanonRailProfile } from './canonRail';
import { narrativeVariantReplacesCanonRail, resolveScenarioEventNarrative } from './eventNarrativeView';
import { formatDivergencePrompt, type ScenarioDivergence } from './divergenceLedger';
import { findRegistryIdentitiesByContext, getRegistrySpeechStyle } from './characterResolver';
import { formatVoiceCard } from './voiceCards';

import type {
  ScenarioCondition,
  ScenarioModChapter,
  ScenarioModCharacter,
  ScenarioModCharacterRelationship,
  ScenarioModEvent,
  ScenarioModLocation,
  ScenarioModOpening,
  ScenarioModPlayerRelationship,
} from './schema';

interface StoryRuntime {
  modId: string;
  modName?: string;
  mode: 'strict' | 'expand';
  axisVersion?: string;
  axisOrder?: number;
  axisSeqLo?: number | null;
  axisSeqHi?: number | null;
  prevStageId?: string | null;
  prevStageName?: string | null;
  nextStageId?: string | null;
  nextStageName?: string | null;
  currentChapterId: string | null;
  flags: Record<string, unknown>;
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  activeEventIds: string[];
  completedChapterIds: string[];
  completedEventIds: string[];
  worldTurn?: number;
  eventTimeline?: Record<string, {
    eligibleAtTurn: number;
    activatedAtTurn?: number;
    occurredAtTurn?: number;
    publiclyRevealedAtTurn?: number;
    playerLearnedAtTurn?: number;
  }>;
  actorEngine?: {
    anchorEventId?: string;
    activeAgendaId?: string;
    surfacedAgendaIds?: string[];
    trackedOpportunityId?: string;
    opportunityStates?: Record<string, {
      status: string;
      surfacedAtTurn: number;
      completionStepIndex?: number;
      completionReadyAtTurn?: number;
    }>;
    entitlements?: Array<{ key: string; label: string }>;
    decisions?: Array<{
      id: string;
      actorId: string;
      label: string;
      reason: string;
      knownFacts: string[];
      attitudes?: Array<{ targetCharacterId: string; dimension: string; value: number }>;
      memories?: Array<{ id: string; summary: string; salience: number }>;
      phase?: 'instant' | 'started' | 'continuing' | 'completed';
      outcome?: 'unopposed' | 'succeeded' | 'blocked';
      conflict?: { domain: string; opponentDecisionId: string };
      mustNotInvent: string[];
      visibleSignal: string;
      offscreenAction: string;
    }>;
    visibleDecisionIds?: string[];
    wakeAudit?: Array<{ actorId: string; awake: boolean; reason: string }>;
  };
  divergences?: ScenarioDivergence[];
  introducedCharacterIds?: string[];
  canon?: {
    characters?: ScenarioModCharacter[];
    factions?: Array<{ id: string; name: string }>;
    locations?: ScenarioModLocation[];
    playerRelationships?: ScenarioModPlayerRelationship[];
    relationships?: ScenarioModCharacterRelationship[];
  };
  opening?: ScenarioModOpening;
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getRuntime(saveData: SaveData): StoryRuntime | null {
  const value = readPath(saveData, ['世界', '状态', '剧本模组']);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.modId !== 'string') return null;
  return record as unknown as StoryRuntime;
}

function collectIntroducedCharacterIds(runtime: StoryRuntime): string[] {
  if (runtime.introducedCharacterIds?.length) return runtime.introducedCharacterIds;
  const eventIds = new Set([...runtime.activeEventIds, ...runtime.completedEventIds]);
  const ids = new Set<string>(runtime.opening?.featuredCharacterIds || []);
  for (const event of runtime.events) {
    if (!eventIds.has(event.id)) continue;
    for (const id of event.relatedCharacterIds || []) ids.add(id);
  }
  return [...ids];
}

function resolveCurrentScenarioLocation(runtime: StoryRuntime, saveData: SaveData): ScenarioModLocation | null {
  const locations = runtime.canon?.locations || [];
  if (!locations.length) return null;
  const description = String(readPath(saveData, ['角色', '位置', '描述']) || '').replace(/\s+/g, '');
  if (description) {
    // 地点名可能互相包含（如“白夷”/“白夷谷”）；优先最长的明确命中。
    const byName = locations
      .filter(location => location.name.length >= 2 && description.includes(location.name.replace(/\s+/g, '')))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (byName) return byName;
  }
  const x = Number(readPath(saveData, ['角色', '位置', 'x']));
  const y = Number(readPath(saveData, ['角色', '位置', 'y']));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return locations.find(location => location.coordinates?.x === x && location.coordinates?.y === y) || null;
}

function formatLocationContext(location: ScenarioModLocation): string {
  const identity = [location.name, location.region ? `地域：${location.region}` : ''].filter(Boolean).join('；');
  const details = [
    compactText(location.description, 180),
    location.features?.length ? `风貌要素：${formatList(location.features, 6, 36)}` : '',
  ].filter(Boolean).join('；');
  return `- ${identity}${details ? `：${details}` : ''}`;
}

function formatConditions(conditions: ScenarioCondition[] | undefined): string {
  if (!conditions?.length) return '无显式条件';
  return conditions
    .map(condition => `${condition.path} ${condition.operator}${condition.value !== undefined ? ` ${JSON.stringify(condition.value)}` : ''}`)
    .join('；');
}

function formatCompletionWriteKeys(conditions: ScenarioCondition[] | undefined): string {
  if (!conditions?.length) return '无';
  const keys = conditions
    .filter(condition =>
      condition.path.startsWith('flags.')
      && condition.operator === 'eq'
      && condition.value === true,
    )
    .map(condition => `世界.状态.剧本模组.${condition.path}`);
  return keys.join('；') || '无';
}

function formatAxisBeat(event: ScenarioModEvent, prefix = '主轴拍点'): string {
  // “半预制高光”本身就是逐拍演出合同。普通拍点可摘要，高光合同不可在提示词层被
  // 120 字截断，否则模型只会看到前半幕，并在漏掉反差/收束动作后仍写完成键。
  const isHighlightContract = /^半预制高光[：:]/.test((event.axisBeat || '').trim());
  const beat = compactText(event.axisBeat, isHighlightContract ? 600 : 120);
  if (beat) return `${prefix}：${beat}`;
  if (event.axisId) return `${prefix}：${event.axisId}`;
  return '';
}

function selectContextualOptionalEvents(
  runtime: StoryRuntime,
  anchor: ScenarioModEvent | null,
  contextText: string,
): ScenarioModEvent[] {
  const normalizedContext = contextText.replace(/\s+/g, '');
  if (!normalizedContext) return [];
  const characters = runtime.canon?.characters || [];
  const activeIds = new Set(runtime.activeEventIds || []);
  return runtime.events
    .filter(event =>
      event.id !== anchor?.id
      && activeIds.has(event.id)
      && event.critical === false
      && !(runtime.completedEventIds || []).includes(event.id),
    )
    .filter(event => {
      if (event.name.length >= 2 && normalizedContext.includes(event.name.replace(/\s+/g, ''))) return true;
      return (event.relatedCharacterIds || []).some(id => {
        const name = characters.find(character => character.id === id)?.name || '';
        return name.length >= 2 && normalizedContext.includes(name.replace(/\s+/g, ''));
      });
    })
    .slice(0, 1);
}

function isCriticalStoryEvent(event: ScenarioModEvent): boolean {
  if (event.critical !== undefined) return event.critical;
  if (event.axisMethod === 'reviewed-no-anchor' || event.axisId === null) return false;
  return Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
}

function namesForIds(
  ids: string[] | undefined,
  entities: Array<{ id: string; name: string }> | undefined,
): string {
  if (!ids?.length) return '';
  return ids.map(id => entities?.find(entity => entity.id === id)?.name || id).join('、');
}

function compactText(value: string | undefined, maxLength = 90): string {
  const compacted = (value || '').replace(/\s+/g, ' ').trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted;
}

function formatWorldActorContract(runtime: StoryRuntime, anchor: ScenarioModEvent | null, worldPushDue: boolean): string {
  const contract = anchor?.worldActor;
  if (!anchor || !contract) return '';
  const state = runtime.actorEngine?.anchorEventId === anchor.id ? runtime.actorEngine : undefined;
  const agenda = contract.agendas?.find(item => item.id === state?.activeAgendaId) || contract.agendas?.[0];
  const opportunity = contract.opportunities.find(item => item.id === state?.trackedOpportunityId);
  const availableOpportunities = contract.opportunities.filter(item =>
    !state?.opportunityStates
    || ['available', 'tracked'].includes(state.opportunityStates[item.id]?.status || ''));
  const names = runtime.canon?.characters || [];
  const nameOf = (id: string) => names.find(character => character.id === id)?.name || id;
  const visibleIds = new Set(state?.visibleDecisionIds || []);
  const decisions = (state?.decisions || []).filter(item => visibleIds.has(item.id));
  const decisionLine = decisions.length
    ? decisions.map(decision =>
      `${nameOf(decision.actorId)}已由本地决策器裁定“${decision.label}”；阶段=${decision.phase || 'instant'}；结果=${decision.outcome || 'unopposed'}${decision.conflict ? `（冲突域=${decision.conflict.domain}，对手=${visibleIds.has(decision.conflict.opponentDecisionId) ? decision.conflict.opponentDecisionId : '未公开反制'}）` : ''}；理由=${decision.reason}；态度=${(decision.attitudes || []).map(item => `${nameOf(item.targetCharacterId)}.${item.dimension}=${item.value}`).join('、') || '无显式态度因子'}；相关长期经历=${(decision.memories || []).map(item => item.summary).join('、') || '无'}；可见征兆=${decision.visibleSignal}；玩家不介入时=${decision.offscreenAction}；knownFacts=${decision.knownFacts.join('、')}；mustNotInvent=${decision.mustNotInvent.join('、')}。`,
    ).join('\n- ')
    : '';
  const actorLine = decisionLine || (agenda
    ? `${nameOf(agenda.characterId)}正在谋求“${agenda.goal}”；下一步=${agenda.nextAction}；玩家可见征兆=${agenda.visibleSignal}；玩家不介入时=${agenda.offscreenAction}。隐藏目标不可原样念成旁白，只能通过行动和征兆让玩家推断。`
    : '');
  const opportunityState = opportunity ? state?.opportunityStates?.[opportunity.id] : undefined;
  const completionStepIndex = Math.max(0, opportunityState?.completionStepIndex || 0);
  const completionStep = opportunity?.completionContract?.steps[completionStepIndex];
  const completionInstruction = opportunity?.completionContract
    ? ` 本地引擎进度=${Math.min(completionStepIndex, opportunity.completionContract.steps.length)}/${opportunity.completionContract.steps.length}${completionStep ? `；当前只需演出“${completionStep.label}”的行动与反馈` : '；已满足合同，等待本地引擎结算'}。严禁输出或建议写入本事件 done；LLM 正文与命令均不是完成证据。`
    : '';
  const opportunityLine = opportunity
    ? `【玩家已追踪机会·本轮最高优先级】${opportunity.title}：${opportunity.nextStep}。风险=${opportunity.stakes}。必须先回应玩家的介入并让其亲自行动；不得替玩家完成，不得提前授予“${opportunity.rewardLabel}”。${completionInstruction}`
    : availableOpportunities.length
      ? `【可选介入窗口】${availableOpportunities.map(item => `${item.title}（为什么是现在：${item.whyNow}；下一步：${item.nextStep}；风险：${item.stakes}）`).join('；')}。只把窗口自然演出来，不得替玩家选择；玩家忽略也要让世界继续。`
      : '【介入窗口】本轮没有已经触发的机会卡；不得提前展示尚未满足条件的机会。';
  const actionLine = worldPushDue
    ? '本轮世界已经取得行动权：必须先演出上述角色的一项具体行动及其可见后果，不能只写静态局势或等玩家发问。'
    : '该压力持续存在；保持角色有自己的路线，但不得每轮机械重复同一征兆。';
  const guard = contract.decisionCore?.narrativeGuard;
  const guardLine = guard
    ? `\n- renderGuard.forbiddenTerms=${(guard.forbiddenTerms || []).join('|')}；renderGuard.forbiddenAssociations=${JSON.stringify(guard.forbiddenAssociations || [])}；renderGuard.rejectConcreteQuantities=${guard.rejectConcreteQuantities === true}；renderGuard.allowUnverifiedQuantities=${guard.allowUnverifiedQuantities === true}。未核实数字必须带明确消息来源与不确定性，只是角色主张，绝不等同或写回世界真值。该行是最终落稿硬门禁，命中时必须重写，不得展示违规草稿。`
    : '';
  const forbiddenBefore = contract.decisionCore?.canonPolicy.forbiddenBefore || [];
  const timelineState = runtime.eventTimeline?.[anchor.id];
  const timelineAge = timelineState
    ? Math.max(0, (Number(runtime.worldTurn) || 0) - timelineState.eligibleAtTurn)
    : 0;
  const timelineLine = anchor.timeline
    ? `\n- 事件时钟=${anchor.timeline.kind}；资格后第 ${timelineAge} 回合；最早=${anchor.timeline.notBeforeTurns}；截止=${anchor.timeline.deadlineTurns ?? '无硬截止'}。截止只由程序结算，LLM 不得自行提前宣告发生。`
    : '';
  return `【世界演员合同·${contract.pressure.canonPolicy}】压力=${contract.pressure.summary}（范围=${contract.pressure.scope}，强度=${contract.pressure.intensity}）。${actionLine}\n- ${actorLine}\n- ${opportunityLine}\n- 决策阶段已结束，禁止重选行动或修改结算；只可依据 knownFacts 渲染，mustNotInvent 任一项均不得补造。本轮未唤醒角色不得擅自追加主动行动。${guardLine}\n- forbiddenBefore=${forbiddenBefore.join('|')}。${timelineLine}\n- 正典边界：只改变过程、关系入口与行为权限；不得改写“${anchor.name}”的既定结果，不得提前演出后续事件或秘密。`;
}

function formatList(values: string[] | undefined, maxItems = 4, maxLen = 48): string {
  if (!values?.length) return '';
  return values.map(value => compactText(value, maxLen)).filter(Boolean).slice(0, maxItems).join('、');
}

function formatCharacterRelationship(
  character: ScenarioModCharacter,
  playerRelationships: ScenarioModPlayerRelationship[] | undefined,
  relationships: ScenarioModCharacterRelationship[] | undefined,
  characters: ScenarioModCharacter[],
): string {
  const lines: string[] = [];
  const playerRelation = playerRelationships?.find(item => item.characterId === character.id);
  if (playerRelation) {
    lines.push(`与玩家：${playerRelation.relation}（好感 ${playerRelation.favorability}）`);
    const memories = formatList(playerRelation.memories, 2);
    if (memories) lines.push(`共同记忆：${memories}`);
  }
  // 强约束边（契约/主仆/师徒/血亲等）优先入前 3，防关键关系被截断（R2-5：苏妲己契约被无视前例）
  const STRONG_RELATION = /契约|主仆|师徒|师父|师尊|弟子|血亲|父|母|兄|弟|姐|妹|子女|夫|妻|妾|奴|婢|结拜|结义/;
  const relationLines = (relationships || [])
    .filter(item => item.fromCharacterId === character.id || item.toCharacterId === character.id)
    .sort((a, b) =>
      ((STRONG_RELATION.test(b.relation) ? 1 : 0) - (STRONG_RELATION.test(a.relation) ? 1 : 0)) ||
      (Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0)))
    .slice(0, 3)
    .map(item => {
      const otherId = item.fromCharacterId === character.id ? item.toCharacterId : item.fromCharacterId;
      const otherName = characters.find(entity => entity.id === otherId)?.name || otherId;
      return `${otherName}:${item.relation}`;
    });
  if (relationLines.length) lines.push(`人物关系：${relationLines.join('；')}`);
  return lines.join('；');
}

// 底线揭示门控：入队(自己人类关系) 或 好感≥30 才把【底线】喂给 LLM；否则隐去，
// 避免敌对期把角色真实底线泄漏给 LLM（如小紫入队前的敌对行为被真底线约束住）。
const BOTTOMLINE_REVEAL_FAVOR = 30;
const ALLY_RELATION = /同伴|伙伴|队友|道侣|伴侣|挚友|知己|情人|爱慕|恋|妾|后宫|侍妾|奴|婢|主仆|仆|结义|亲密|归顺|臣服|忠/;
function shouldRevealBottomLine(fav: number, label: string): boolean {
  return fav >= BOTTOMLINE_REVEAL_FAVOR || ALLY_RELATION.test(label || '');
}

const CHARACTER_SECRET_KNOWLEDGE_BOUNDARIES: Readonly<Record<string, string>> = {
  阮香凝: '“凝玉姬”、黑魔海玉姬/高层、潜伏暗桩等均属黑魔海内部机密。除黑魔海内部知情者、程宗扬以及当前存档/近期正文已明确获知者外，所有其他人物（吕雉、霍子孟仅为例）都不得先知式识别、说出内部称号或拿秘密真身作为既知前提审问；可以依据亲眼所见的施术、伤势、言行矛盾等可见异常保持怀疑并盘问来历。若此前已明确向某人公开，该人物后续应延续知情，未在场或未被告知者不得自动继承。阮香凝本人主动公开由她承担选择与反应；程宗扬向外披露则属于玩家泄密决策，必须有玩家明确授权并呈现可信的政治风险或关系后果，不得替玩家把机密当普通履历介绍。',
};

function formatFocusedCharacter(
  character: ScenarioModCharacter,
  runtime: StoryRuntime,
  favByName?: Map<string, { fav: number; label: string }>,
): string {
  const profile = character.profile || {};
  const lines: string[] = [`- ${character.name}（${[character.gender, character.role, character.realm].filter(Boolean).join('；') || '正典人物'}）`];
  const base = compactText(character.description || profile.origin || '');
  if (base) lines.push(`  身份/定位：${base}`);
  // 归属(P3投影的 affiliations)——跨国称谓/同门认知的消费点
  const affiliations = (character as { affiliations?: Array<{ factionId?: string; role?: string }> }).affiliations || [];
  const factionNames = new Map((runtime.canon?.factions || []).map(f => [f.id, f.name]));
  if (affiliations.length) {
    const line = affiliations.slice(0, 4)
      .map(a => `${factionNames.get(a.factionId || '') || ''}${a.role ? `(${compactText(a.role, 16)})` : ''}`)
      .filter(t => t && !t.startsWith('(')).join('、');
    if (line) lines.push(`  归属：${line}`);
  }
  const sectNames = affiliations
    .filter(a => (a as { category?: string }).category === 'sect')
    .map(a => factionNames.get(a.factionId || '') || a.factionId || '')
    .filter(Boolean);
  lines.push(sectNames.length
    ? `  宗派限定：${sectNames.join('、')}；不得改写为其他宗派或凭亲属关系转移宗派/职位`
    : '  宗派限定：本阶段未声明宗派；不得补造成道士、某派弟子、掌教或教内职司');
  const personality = formatList(profile.personality);
  if (personality) lines.push(`  性格：${personality}`);
  const intelligenceProfile = [
    ...(Array.isArray(profile.personality) ? profile.personality : []),
    character.description || '',
    profile.origin || '',
  ].join(' ');
  if (/智商|高智|谋士|谋略|智囊|城府|精明|机敏|敏达|洞察|算计|足智/.test(intelligenceProfile)) {
    lines.push(`  内部角色行为要求（不得写入正文）：情报/决策场景中，必须由${character.name}本人先直接说出或实施至少一个具体方案（合格形态：“我已安排甲做乙，你现在可利用丙”），且该方案改变本轮选择；不得只报告情报、点头领命、等待主角追问，或只用旁白暗示“另有后手”。`);
  }
  const speechStyle = getRegistrySpeechStyle(character.name);
  if (speechStyle) lines.push(`  谈吐：${speechStyle}`);
  const voiceCard = formatVoiceCard(character.name, { modId: runtime.modId });
  if (voiceCard) lines.push(`  ${voiceCard}`);
  // 灵根=正典静态设定（R2-5：凝羽灵根曾被 LLM 改写）；"原作未载"占位不注入
  const spiritRootName = profile.spiritRoot?.name;
  if (spiritRootName && spiritRootName !== '原作未载') {
    lines.push(`  灵根：${spiritRootName}${profile.spiritRoot?.tier ? `（${profile.spiritRoot.tier}）` : ''}——正典设定，不得改写`);
  }
  if (profile.appearance) lines.push(`  外貌：${compactText(profile.appearance)}`);
  if (profile.currentAppearance) lines.push(`  当前外貌：${compactText(profile.currentAppearance)}`);
  if (profile.currentThought) lines.push(`  当前心思：${compactText(profile.currentThought)}`);
  const memories = formatList(profile.memories, 5);
  if (memories) lines.push(`  记忆：${memories}`);
  // 底线门控：未入队且好感未达阈值 → 隐去【底线】，改提示 LLM"尚未摸透，勿臆断"
  const canonFav = runtime.canon?.playerRelationships?.find(item => item.characterId === character.id)?.favorability;
  const live = favByName?.get(character.name);
  const fav = Number(live?.fav ?? canonFav ?? 0) || 0;
  const label = live?.label ?? '';
  const reveal = shouldRevealBottomLine(fav, label);
  const rawNotes: string[] = Array.isArray(profile.notes) ? profile.notes.map((n: unknown) => String(n)) : [];
  const hasBottom = rawNotes.some(note => note.startsWith('【底线】'));
  const gatedNotes = reveal
    ? rawNotes
    : [
        ...rawNotes.filter(note => !note.startsWith('【底线】')),
        ...(hasBottom ? ['【底线】（尚未与其深交，未摸透此人底线/原则；按其性格与当前立场行事即可，勿臆断其道德红线）'] : []),
      ];
  const notes = formatList(gatedNotes, 8, 220);
  if (notes) lines.push(`  正典备注：${notes}`);
  const secretKnowledgeBoundary = CHARACTER_SECRET_KNOWLEDGE_BOUNDARIES[character.name];
  if (secretKnowledgeBoundary) {
    lines.push(`  【机密身份·知情边界】${secretKnowledgeBoundary}`);
  }
  const relation = formatCharacterRelationship(
    character,
    runtime.canon?.playerRelationships,
    runtime.canon?.relationships,
    runtime.canon?.characters || [],
  );
  if (relation) lines.push(`  关系：${relation}`);
  return lines.join('\n');
}

function reputationTier(value: number): string {
  if (value < 0) return value <= -5000 ? '恶名昭彰' : value <= -1000 ? '臭名远扬' : value <= -500 ? '声名狼藉' : value <= -100 ? '恶名在外' : '小有恶名';
  if (value >= 10000) return '传说人物';
  if (value >= 5000) return '名满天下';
  if (value >= 3000) return '威震四方';
  if (value >= 1000) return '名动一方';
  if (value >= 500) return '声名远播';
  if (value >= 100) return '小有名气';
  return '籍籍无名';
}

function buildFocusedCharacterPrompt(runtime: StoryRuntime, activeEvents: ScenarioModEvent[], contextText = '', favByName?: Map<string, { fav: number; label: string }>): string {
  const characters = runtime.canon?.characters || [];
  if (!characters.length) return '';
  const focusedIds = new Set<string>();
  for (const id of runtime.opening?.featuredCharacterIds || []) focusedIds.add(id);
  for (const event of activeEvents) {
    for (const id of event.relatedCharacterIds || []) focusedIds.add(id);
  }
  if (runtime.opening?.playerCharacterId) focusedIds.add(runtime.opening.playerCharacterId);
  const focusedCharacters = [...focusedIds]
    .map(id => characters.find(character => character.id === id))
    .filter((character): character is ScenarioModCharacter => !!character)
    .slice(0, 8);
  // 确定性名字召回：玩家输入/近期叙事按名字（或别名）点到的在场角色也纳入聚焦，
  // 否则自由找不在活跃事件里的 NPC 闲聊时零档案注入 → LLM 只能靠猜（OOC 主源之一）。
  if (contextText) {
    const already = new Set(focusedCharacters.map(character => character.id));
    for (const character of characters) {
      if (focusedCharacters.length >= 12) break;
      if (already.has(character.id)) continue;
      const keys = [character.name, ...((character as { aliases?: string[] }).aliases || [])]
        .filter(key => typeof key === 'string' && key.length >= 2);
      if (keys.some(key => contextText.includes(key))) {
        focusedCharacters.push(character);
        already.add(character.id);
      }
    }
  }
  if (!focusedCharacters.length) return '';
  return `## 当前相关人物正典约束（防 OOC）
${focusedCharacters.map(character => formatFocusedCharacter(character, runtime, favByName)).join('\n')}

【人物正典优先级】：
1. 上述身份、关系、性格、谈吐/底线/目标、以及【身世】【情节】等正典备注是硬约束；不得改写、否定或让角色无因突变。
2. 角色的**深层往事/身世/渊源以【身世】【情节】备注为准**：叙述其过往必须与备注一致；备注**未载**的过往，让角色含糊带过、回避、或按其性格搪塞试探，**严禁凭空编造跨角色的血缘、师承、结拜、年代等起源设定**（例：不得杜撰某角色是另一角色的兄弟/父女/师徒）。
3. “补充细节”仅限无关紧要的当下场景描写（动作、神态、环境），**不含身世渊源与人物关系**。
4. 【族裔与地域文化一致】服饰、装束、礼俗、饮食须符合角色的族裔文化：花苗/兽蛮/碧鲮/鬼王峒/波斯/东瀛等**非中原角色不得默认穿中原长袍、儒衫、汉家衣冠**；换装应取其自身文化样式（如花苗银饰短装），并保留刺青、饰物、发式等族裔特征。**环境同理**：南荒（鬼王峒/花苗寨/碧鲮村）等异域场景的建筑、植被、气候、市井风物须符合当地风貌（峒寨/吊脚楼/雨林瘴气/巫蛊图腾），不得写成中原城镇的街市楼阁。
5. 【主角机密与人物真身】生死根、穿越者来历等主角核心秘密，以及人物档案中的真身、卧底、伪装、内部称号与秘密归属：仅正典/当前存档中**明确知情**、本人主动公开或本局已有可见揭露证据的人物可提及；已明确获知者后续延续知情，未在场/未被告知者不得自动继承。其余 NPC 可依据亲眼所见的异常保持怀疑并盘问来历，但不得先知式说出秘密称号、归属或拿真相作为既知前提推理。角色本人公开与玩家泄密不是一回事：玩家向外披露必须由玩家明确授权，并呈现符合身份、立场与局势的风险或关系后果，**不得替玩家把机密当普通履历介绍**。上文档案里出现的这类信息是给你的叙事后台知识，**不等于场内人物的知识**。
6. 【称谓语域】蔑称、敬称、私昵称呼只能出自对应关系人物之口（例：「碧奴」是鬼王峒/黑魔海中人对碧姬的役奴蔑称，仅这些人使用，其他人一律称「碧姬」）；以各角色档案中的称谓标注为准。宗派、道号、自称和教内职位同样是逐人事实：不得因人物会武、气质近道门、亲属/师徒属于某派，就让其自称「贫道」或成为该派弟子、掌教、教御。太乙真宗的「掌教／教御／弟子」不是泛称，只有人物的本阶段宗派归属和角色职司明确载明时才能使用；亲属、封地、同伴均不继承该身份。仅作为封地/家族/组织名称出现、却未列入当前人物档案者，不得被补造为在场人物或教内职司。
7. 【叙事连续性】续写（含读档后）时，先前已确立的即兴目标、物品用途、约定（例：说好“打破蛇蛋取令牌”）以近期记忆为准，**不得悄然翻转或重设**；确需改变须由剧情事件明确推动并在叙事中交代原因。
8. 用户要求角色违背正典时，以角色内方式拒绝、回避、误解或转移；不得承认“设定已被修改”。
9. 角色成长必须由已发生剧情、关系变化或明确事件支撑；不得为了迎合单轮输入突然 OOC。`;
}

export function createScenarioPromptState<T extends SaveData>(saveData: T): T {
  const promptState = structuredClone(saveData);
  const runtime = getRuntime(promptState);
  if (!runtime) return promptState;

  runtime.introducedCharacterIds = collectIntroducedCharacterIds(runtime);
  runtime.chapters = runtime.chapters.filter(chapter => chapter.id === runtime.currentChapterId);
  const anchor = getNarrativeAnchorEvent(runtime as any);
  runtime.events = anchor ? [anchor] : [];
  return promptState;
}

export function buildScenarioStoryPrompt(saveData: SaveData, contextText = ''): string {
  const runtime = getRuntime(saveData);
  if (!runtime) return '';

  const chapter = runtime.chapters.find(item => item.id === runtime.currentChapterId);
  const anchor = getNarrativeAnchorEvent(runtime as any);
  const optionalEvents = selectContextualOptionalEvents(runtime, anchor, contextText);
  const canonRail = getCanonRailProfile(runtime as any);
  const activeEvents = [...(anchor ? [anchor] : []), ...optionalEvents];
  const activeIds = new Set(activeEvents.map(event => event.id));
  const characters = runtime.canon?.characters || [];
  const factions = runtime.canon?.factions || [];
  const locations = runtime.canon?.locations || [];
  const currentLocation = resolveCurrentScenarioLocation(runtime, saveData);

  const chapterSection = chapter
    ? `## 当前章节：${chapter.title}\n${chapter.summary}\n章节完成条件：${formatConditions(chapter.completion)}`
    : '## 当前章节\n暂无已激活章节。不要自行使用或透露后续章节内容。';
  // 当前地域风貌：活跃事件所在地点的正典描述（否则 LLM 查看环境时裸猜，南荒写成中原样）
  const activeLocationIds = [...new Set([
    currentLocation?.id,
    ...activeEvents.map(event => event.locationId),
  ].filter(Boolean))] as string[];
  const locationLine = activeLocationIds
    .map(id => {
      const loc = locations.find(item => item.id === id);
      return loc ? formatLocationContext(loc) : '';
    })
    .filter(Boolean)
    .join('\n');

  const eventSection = activeEvents.length
    ? activeEvents.map(rawEvent => {
        const event = resolveScenarioEventNarrative(rawEvent, runtime.flags || {}, runtime.divergences);
        const context = [
          namesForIds(event.relatedCharacterIds, characters),
          namesForIds(event.relatedFactionIds, factions),
          namesForIds(event.locationId ? [event.locationId] : [], locations),
        ].filter(Boolean).join('；');
        const axisLine = formatAxisBeat(event);
        const highlightLine = /^半预制高光[：:]/.test((event.axisBeat || '').trim())
          ? '【高光演出硬合同】主轴拍点中的动作、顺序、反差与收束必须逐项完整呈现，不得摘要、并拍或漏拍；全部演完后才可写完成键。\n  '
          : '';
        // 分歧文案已经替代原事件结果时，旧 Canon Rail 合同（例如“谢艺之死”）
        // 不得继续注入并与分歧事实打架；分歧 variant 的 axisBeat 就是本拍合同。
        const contract = narrativeVariantReplacesCanonRail(rawEvent, runtime.flags || {}, runtime.divergences)
          ? undefined
          : getCanonRailContract(canonRail, event.id);
        const forbiddenLine = contract?.forbiddenInCanon?.length
          ? `  本拍特定禁止改写：${contract.forbiddenInCanon.join('；')}。\n`
          : '';
        const railLine = contract
          ? `【Canon Rail·默认正典】本拍必须达成：${contract.mustReach}\n  允许补足：${contract.allowedElaboration}\n${forbiddenLine}  禁止：不得以 void、替代结局、提前跳拍或新增 IF 分支改写此结果；只有用户显式进入 IF 支线时才可改写正典走向。\n  `
          : '';
        return `- ${event.name}（事件ID：${event.id}）：${event.description}\n  ${axisLine ? `${axisLine}\n  ` : ''}${highlightLine}${railLine}相关正典：${context || '无'}\n  完成条件：${formatConditions(event.completion)}\n  完成写入键（事件达成时原样 set true）：${formatCompletionWriteKeys(event.completion)}`;
      }).join('\n')
    : '- 当前没有已触发事件，不要提前引入未触发事件。';

  // 主轴下一拍：找出依赖"当前事件完成条件"的后续事件，作为前进方向喂给 AI（避免 AI 停在原地等玩家）
  const activeCompletionPaths = new Set(
    activeEvents.flatMap(event => (event.completion || []).map(c => c.path)),
  );
  const completedIds = new Set(runtime.completedEventIds || []);
  const nextEvents = runtime.events.filter(event =>
    !activeIds.has(event.id) &&
    !completedIds.has(event.id) &&
    ((event as any).conditions || []).some((c: ScenarioCondition) => activeCompletionPaths.has(c.path)),
  );
  const pendingCriticalEvents = runtime.events.filter(event =>
    isCriticalStoryEvent(event) &&
    !completedIds.has(event.id) &&
    !activeIds.has(event.id),
  );
  // 仅给出下一拍事件名称作为推进方向，不带 description，避免提前泄露未来剧情细节
  const nextSection = nextEvents.length
    ? nextEvents.map(event => {
        const axisLine = formatAxisBeat(event, '下一拍');
        return `- ${event.name}${axisLine ? `（${axisLine}）` : ''}`;
      }).join('\n')
    : pendingCriticalEvents.length
      ? `- 本关仍有关键剧情未触发，不能切换下一关。继续围绕当前章节完成条件制造线索、调度相关人物，促成最近的关键剧情节点。`
    : runtime.nextStageId
      ? `- 本关已经收束。若玩家准备启程，用来信、人物提议、路况或远近局势等角色可感知的契机自然引出转场；不得说“下一关”、不得透露关卡名或内部 ID，也不要在当前场景提前展开下一段正文。`
      : '- （当前事件完成后将进入新章节或迎来结局）';
  // 读一次 社交.关系：既供底线门控(好感/关系→是否揭示)，也供下方失配检测复用
  const relations = readPath(saveData, ['社交', '关系']) as Record<string, {
    名字?: string;
    与玩家关系?: string;
    好感度?: number;
    当前位置?: { 描述?: string };
  }> | undefined;
  const favByName = new Map<string, { fav: number; label: string }>();
  if (relations && typeof relations === 'object') {
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const entry = { fav: Number(npc.好感度) || 0, label: String(npc.与玩家关系 || '') };
      favByName.set(key, entry);
      if (npc.名字) favByName.set(String(npc.名字), entry);
    }
  }
  // G1 残留修复：自由漫游时"在场但没被点名"的 NPC 此前拿不到档案（只能赌 embedding RAG）。
  // 确定性补召回：社交.关系 里 当前位置与玩家共享世界地点段（·分隔第2段）的 NPC，
  // 其名字并入聚焦上下文 → 复用既有名字召回（同一去重/12人上限管道）。
  const introducedAtLocation = new Set(collectIntroducedCharacterIds(runtime));
  const charactersWithDynamicState = new Set<string>();
  for (const [key, npc] of Object.entries(relations || {})) {
    charactersWithDynamicState.add(key);
    if (npc?.名字) charactersWithDynamicState.add(String(npc.名字));
  }
  const canonicalSameLocationNames = currentLocation
    ? characters
        .filter(character =>
          character.id !== runtime.opening?.playerCharacterId
          && character.locationId === currentLocation.id
          && introducedAtLocation.has(character.id)
          && !charactersWithDynamicState.has(character.name),
        )
        .map(character => character.name)
    : [];
  const sameLocationNames = new Set<string>(canonicalSameLocationNames);
  if (relations && currentLocation) {
    const currentLocationName = currentLocation.name.replace(/\s+/g, '');
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const npcLocationSegments = String(npc.当前位置?.描述 || '')
        .split('·')
        .map(segment => segment.replace(/\s+/g, ''))
        .filter(Boolean);
      if (currentLocationName.length >= 2 && npcLocationSegments.includes(currentLocationName)) {
        sameLocationNames.add(String((npc as { 名字?: string }).名字 || key));
      }
    }
  }
  const sameLocationList = [...sameLocationNames];
  const focusContext = sameLocationList.length
    ? `${contextText}\n【在场】${sameLocationList.slice(0, 12).join('、')}`
    : contextText;
  const focusedCharacterSection = buildFocusedCharacterPrompt(runtime, activeEvents, focusContext, favByName);
  const introducedIds = new Set(collectIntroducedCharacterIds(runtime));
  const introducedNames = new Set<string>(
    [...introducedIds].map(id => characters.find(character => character.id === id)?.name).filter((name): name is string => !!name),
  );
  for (const [key, npc] of Object.entries(relations || {})) introducedNames.add(String(npc?.名字 || key));
  // 关卡投影只带“本关会登场”的角色；但玩家/记忆里可能先提到别名人物。
  // 用全局正典的最小身份卡补洞，避免模型把“青骓”这类人名望文生义成兵器。
  const identityContext = [
    focusContext,
    chapter?.title || '',
    chapter?.summary || '',
    ...activeEvents.map(event => `${event.name} ${event.description} ${(event.relatedFactionIds || []).map(id => factions.find(f => f.id === id)?.name || '').join(' ')}`),
  ].join('\n');
  const inRuntime = new Set(characters.map(character => character.name));
  const globalIdentityLines = findRegistryIdentitiesByContext(identityContext)
    // 只为本存档已认识的人补别名身份；不能借“别名召回”把未来人物放进上下文。
    .filter(identity => !inRuntime.has(identity.canonicalName) && introducedNames.has(identity.canonicalName))
    .map(identity => `- ${identity.aliases.length ? `${identity.aliases.join('、')}＝` : ''}${identity.canonicalName}：${identity.identity || '正典人物'}`)
    .slice(0, 12);
  const globalIdentitySection = globalIdentityLines.length
    ? `## 别名与实体定锚（不可望文生义）\n${globalIdentityLines.join('\n')}\n以上均为人物姓名/别名，不是兵器、坐骑、功法、物品或可另造的同名角色。`
    : '';
  const introducedLine = introducedNames.size
    ? `【本存档已相识人物】${[...introducedNames].slice(0, 30).join('、')}。此名单外的正典人物尚未在本存档登场；NPC 不得认识、回忆、转述其私事或以熟人身份提及。`
    : '【本存档登场门槛】没有被当前事件或既有关系明确带入的人物，NPC 不得认识、回忆或主动提及。';

  // 声望与认知闭环：当前值+档位醒目注入（静态 REPUTATION_GUIDE 埋在 worldStandards 里 LLM 不消费——
  // 实测籍籍无名的主角被唐使"底细尽在掌握"）
  const repValue = Number(readPath(saveData, ['角色', '属性', '声望']) ?? 0) || 0;
  const reputationLine = `【声望与认知】主角当前声望：${repValue}（${reputationTier(repValue)}）。NPC 对主角的认知必须匹配声望档位：籍籍无名＝陌生人不识其名、不知其过往事迹与底细；势力若声称"掌握其底细"，必须有情报来源并在剧情中交代（且这类调查本身就是值得叙述的事件）；亲历者与同行者除外。主角做出扬名（或败坏名声）之事时，必须用 set 更新 角色.属性.声望（参考：救人除害+30~300、斩强敌+100~1000、震动一方的大事件+200~2000；恶行记负值）。`;

  // 关系-好感失配检测：与玩家关系 是静态标签(物化写一次),从不随好感演进——
  // 实测某临时角色挂"敌对"却好感35且主动双修。确定性检出失配,交 LLM 剧情内收敛。（复用上方 relations）
  const mismatches: string[] = [];
  if (relations && typeof relations === 'object') {
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const label = String(npc.与玩家关系 || '');
      const fav = Number(npc.好感度);
      if (!label || !Number.isFinite(fav)) continue;
      const hostile = /敌对|仇|死敌|敌人/.test(label);
      const intimate = /亲密|爱慕|情人|道侣|挚友|伴侣/.test(label);
      if ((hostile && fav >= 20) || (intimate && fav <= 0)) mismatches.push(`${(npc as { 名字?: string }).名字 || key}（${label}，好感 ${fav}）`);
      if (mismatches.length >= 4) break;
    }
  }
  const relationLine = mismatches.length
    ? `【关系-好感失配修正】以下 NPC 的关系标签与好感度明显失配：${mismatches.join('、')}。本轮起以角色内方式收敛：要么让关系随剧情演进并用 set 更新 社交.关系.<名字>.与玩家关系（如"敌对"→"亦敌亦友/表面敌对暗生情愫"），要么在叙事中交代表里不一的原因并把标签改为体现这种复杂性的表述。此后好感度跨档变化时必须同步演进关系标签，不得让标签僵死。`
    : '';
  const divergenceLine = formatDivergencePrompt((runtime as { divergences?: any[] }).divergences);

  // 即兴目标槽（跨轮追踪，读档不翻转的治本一环）
  const improvGoals = readPath(saveData, ['系统', '扩展', '任务追踪', '即兴目标']);
  const completedGoalReceipts = readPath(saveData, ['系统', '扩展', '任务追踪', '最近完成待回报']);
  const completedGoalLine = Array.isArray(completedGoalReceipts) && completedGoalReceipts.length
    ? `【刚完成的即兴目标·本轮必须叙事回报】\n${completedGoalReceipts.slice(0, 3).map((g: any) => `- ${g?.标题 || ''}${g?.证据 ? `（依据：${compactText(String(g.证据), 80)}）` : ''}`).filter(Boolean).join('\n')}\n这些目标已经由接地审计确认完成。本轮须在正文中给出与目标规模相称、且有当前处境依据的回报：情报、关系变化、财货、声望或新机会至少一种；需要落状态时输出对应合法指令。不得重复完成目标、不得凭空发放超额奖励。`
    : '';
  const improvLine = Array.isArray(improvGoals) && improvGoals.length
    ? `【即兴目标·玩家侧可选支线（跨轮追踪，读档续写保持不悄然翻转）】\n${improvGoals.slice(0, 3).map((g: any) => `- ${typeof g === 'string' ? g : g?.标题 || ''}`).filter(Boolean).join('\n')}\n性质：这些是玩家临时选择的**可选支线**目标，**不代表主线方向，不得盖过或替代上文"当前事件/最近主线节点"**；主叙事推进以主线为准，即兴目标仅在玩家主动选择追踪时顺应。维护规则：目标达成或失效时用 set 更新 系统.扩展.任务追踪.即兴目标（整组重写，上限 3 条）；只记跨轮仍需追踪的目标，场景内小动作不记。`
    : `【即兴目标槽】当叙事确立了需跨轮追踪的临时目标（如"取回某物""赴某约"），用 set 写入 系统.扩展.任务追踪.即兴目标（数组，元素 {"标题":"..."}，上限 3 条）；达成/失效必须清除。这是玩家侧可选支线，**不得盖过主线**。`;

  // 承重角色保护：尚未完成的关键剧情事件所系人物，不得被即兴写死/永久失能（只报名字，不泄事件细节）
  const loadBearingIds = new Set<string>(
    runtime.events
      .filter(event => isCriticalStoryEvent(event) && !completedIds.has(event.id))
      .flatMap(event => event.relatedCharacterIds || []),
  );
  if (runtime.opening?.playerCharacterId) loadBearingIds.delete(runtime.opening.playerCharacterId);
  const loadBearingNames = [...loadBearingIds]
    .map(id => characters.find(character => character.id === id)?.name)
    .filter((name): name is string => !!name)
    .slice(0, 20);
  const loadBearingLine = loadBearingNames.length
    ? `【承重角色保护】以下人物承担本关尚未完成的关键剧情：${loadBearingNames.join('、')}。他们不得死亡、永久残疾、被永久囚禁或从此无法寻见；可以受挫、遇险、暂时离场，但必须保留后续登场能力。`
    : '';

  // 偏离收束：剧情停滞分档提示（≤3 轮自由发挥；4-6 软引子；≥7 强路标）
  // 方向锚点＝active 里"最近的未完成承重(critical)节点"的 axisBeat 悬念，逐轮渐进牵引；
  // 绝不指 axisSeq 更靠后的节点（否则诱导玩家跳过中间承重桥段→剧情乱序），也绝不用即兴目标
  //（即兴目标是纯即兴、常挂非剧本 NPC，不是主线硬指标）。无承重节点时退到下一关/当前章节。
  const stallTurns = (runtime as { stallTurns?: number }).stallTurns || 0;
  const nearestCritical = activeEvents
    .filter(event => isCriticalStoryEvent(event) && !completedIds.has(event.id))
    .slice()
    .sort((a, b) => (((a as { axisSeq?: number }).axisSeq ?? Infinity)) - (((b as { axisSeq?: number }).axisSeq ?? Infinity)))[0];
  // objective（玩家视角+地点+不剧透）最适合当引子锚点；无则回退 axisBeat/description，再回退下一关/章节。
  const dirHint = (nearestCritical && ((nearestCritical as { objective?: string }).objective
      || (nearestCritical as { axisBeat?: string }).axisBeat || nearestCritical.description))
    || (runtime.nextStageId ? '本关收束后的自然启程契机' : '当前章节目标');
  // 主线偏移冷却（引擎专属，存于 runtime 世界.状态.剧本模组.steeringCooldown，由 processGmResponse 甲/乙置入）：
  // >0 时不推送任何引子（尊重玩家自主选择，由引擎逐轮递减，见 runtime.advanceScenarioRuntime）。
  const steeringCooldown = Number((runtime as { steeringCooldown?: number }).steeringCooldown ?? 0) || 0;
  const steeringLine = steeringCooldown > 0
    ? ''
    : stallTurns >= 7
    ? `【回主线路标（玩家可忽略）】剧情已停滞多轮：本轮必须给玩家一条明确、此刻就能采取的回主线下一步。从下述“最近主线节点”里提取尚未揭晓的悬念/待解之谜/人物去向，以过渡钩子牵引，切勿复现该场景原貌、也不得提前演出该桥段：${dirHint}。用旁人指路、一封急报、路上传闻、同伴提议往某地或环境指向等自然方式带出，让玩家清楚“下一步可以往哪走”。严禁以新增敌袭、追兵或战斗充当压力（除非玩家主动招惹）。仅为可选引导：不得替玩家做决定，不得直接完成事件或强行触发主线高潮。`
    : stallTurns >= 4
      ? `【回主线轻引子（玩家可忽略）】剧情已数轮未推进：本轮给一个轻量可选线索，指向下述“最近主线节点”的悬念（提取待解之谜/人物去向牵引，不复现场景、不提前演出）：${dirHint}。可用旁人一句话、一则传闻、环境异样或同伴提议带出，让玩家知道“想推进主线可以往这走”。不得强行触发主线高潮，不得直接完成事件，不得用新增战斗/追兵充当引子。`
      : '';
  const divergenceSignal = (runtime as any).divergenceSignal;
  const divergenceControlLine = divergenceSignal?.level === 'high'
    ? `【大偏离·必须给玩家选择】近轮剧情与主轴明显分离（确定性评分 ${divergenceSignal.score}/100）。不得催促或替玩家回归；本轮把当前衍生线明确表述为“本世界线支流”，并同时给出两个可执行选择：继续支流，或自然接回“${dirHint}”。`
    : divergenceSignal?.level === 'medium'
      ? `【中偏离·收编桥】近轮剧情开始偏离主轴（确定性评分 ${divergenceSignal.score}/100）。本轮把现有支线的人物、后果或线索收编为“${dirHint}”的前奏或余波；不得梦醒抹除，不得强制玩家行动。`
      : '';
  const returnBridge = (runtime as any).returnBridge;
  const returnBridgeLine = returnBridge
    ? `【玩家已主动斩线回轨·本轮最高优先级】玩家选择结束衍生支线“${returnBridge.branchSummary}”。保留它已经造成的关系与后果，但立即用章节转场、来信、人物提议或局势变化把镜头接回“${returnBridge.anchorObjective}”。不得继续扩建旧支线，不得写成梦境或清空经历；本轮必须让玩家抵达该承重节点的可行动入口。`
    : '';
  const worldPush = (runtime as any).worldPush;
  const worldActorLine = formatWorldActorContract(runtime, nearestCritical || anchor, Boolean(worldPush?.due));
  const worldPushLine = worldPush?.due && !worldActorLine
    ? `【世界回合·本轮世界必须行动】原因=${worldPush.reason}，强度=${worldPush.intensity}。本轮至少让一个已登场 NPC、当前活跃事件或正典势力主动采取具体行动，改变玩家眼前的选择或局势；失败意味着世界取得行动权。不得只给静态环境描写、泛泛情报或等玩家追问。`
    : '';
  const stageLine = [
    runtime.modName || runtime.modId,
    typeof runtime.axisSeqLo === 'number' && typeof runtime.axisSeqHi === 'number' ? `主轴范围 #${runtime.axisSeqLo}~#${runtime.axisSeqHi}` : '',
    // 称号=里程碑奖励的运行时状态（引擎授予）：从存档读，未获得的头衔不进 prompt → 结构上防"未卜先知"
    formatEarnedTitles(saveData),
  ].filter(Boolean).join('；');

  return `# 当前剧本进度（仅限可见内容）
${stageLine ? `## 当前关卡\n${stageLine}\n\n` : ''}${chapterSection}

## 六朝国别风貌基准（虚构五国对应华夏朝代，环境/服饰/礼仪描写以此为准）
- 唐国＝唐朝：长安气象，朱雀大街、坊市制、胡商胡姬；男子幞头圆领袍、女子高髻襦裙披帛；乐舞胡风华贵开放；称谓如“郎君/娘子/圣人（皇帝）”。
- 汉国＝汉朝：古朴雄浑，宫阙台榭、闾里；深衣曲裾、宽袖束发；席地跪坐、分餐制、礼法尊经；称谓如“君侯/足下/陛下”。
- 宋国＝宋朝：市井极繁，瓦舍勾栏、夜市酒楼、河桥漕运；男子交领襕衫、女子褙子；点茶焚香文士风雅、重文轻武；称谓如“官人/娘子/相公”。
- 秦国＝秦朝：肃杀尚黑，夯土城垣、驰道；黑衣玄甲；军功爵制、法度森严、言行简峻；称谓如“君上/大人”。
- 晋国＝晋朝：门阀气象，园林清雅、乌衣巷第宅；宽衣博带、麈尾清谈；士庶天隔、重门第郡望；称谓如“郎/使君/明公”。
- 昭南＝南洋/东南亚：热带海国，港埠番舶、香料象牙贸易；干栏式木楼、椰林水寨；筒裙纱笼、赤足佩花；驯象乘舟、信巫祀海。
- 南荒＝百越苗疆：峒寨吊脚楼、雨林瘴气；银饰苗绣、文身跣足；巫蛊图腾、歌垣风俗。
- 太泉古阵＝**现代科技遗迹（六朝视角）**：金铁廊道厅堂、"夜明珠"长明不灭；太泉古阵又称「别有洞天」，阵中自有日月……**描写一律用六朝语汇，严禁出现现代词**（电灯/塑料/汽车/投影/机器）；六朝人物以"上古仙家遗泽"敬畏地理解这些造物，唯主角（穿越者）内心能认出真身——这层认知差是本区特色，要刻意体现（人物的误读、命名、揣测本身就是戏）。**认知差词典（原文考据，六朝叫法＝真身）**：九天玄兽蜕壳＝汽车（民间又称铁皮兽；其"兽穴"＝停车场）、守阵力士＝机器人、夜明珠＝电灯、光影幻璧＝屏幕/投影、琉璃纸/水晶袋＝塑料（袋）、软晶玉杯/软晶签筒＝塑料器皿（被各国当稀世宝物）、透影仙灯＝手电筒、日精琉璃盆＝透体显影的光学奇物、窥视孔＝潜望镜、霓龙丝＝尼龙（丝衣丝袜，贵妇奢侈品）；玻璃此界已有（"泰西白玻璃"，昂贵舶来品）。**霓龙丝、软晶玉器等太泉出产已流通六朝各国**——认知差不限于太泉本地。现代词只允许出现在主角内心独白/自语；NPC 听到会误听成雅名（"尼龙丝？"→"霓龙丝！"），且六朝词也会反向坑主角（核武不扩散条约＝核心武学）——双向误读是本作幽默基调。〔深层暗线·绝密：太泉古阵疑为**域外存在观测此界的中枢**——**任何人物（含主角）不知此事，绝不可说破、暗示到点破的程度或让 NPC 讨论**；仅允许在太泉场景以极低频微妙异象作伏笔：造物规整得不似人力、阵枢深处似有莫名"注视感"、上古残篇里语焉不详的"天外"二字。〕
【硬约束】建筑、街市、服饰、礼节、官称随所在国切换，**不得跨国混用**（宋国街头不该满是唐式幞头胡乐，汉国不该出现宋式瓦舍勾栏）。**君臣称谓按人物「归属」判断**：只对本国君主称陛下/太后/圣人，提及他国君主冠国号（唐国官员称宋国太后应为「宋国太后」而非「太后娘娘」）；跨国人物相见按各自国籍行礼致称。

## 种族形态基准（涉及这些种族的人物/环境描写以此为准）
- 羽族：纤体轻身，背生丈许凤翼可飞（吕雉羽翼纯黑；凝羽所属穹羽族能操月光，她是族中唯一无翼者）；女子外冷内热、动情至死不渝；居南方深山密林，因捕奴滥捕封闭排外。
- 兽蛮人：半人半兽、体魁皮毛坚韧、獠牙狗头额生金钱斑，可四肢奔行；蛮力惊人、部分通术法；居塞外草原，散落各地为佣兵仆役。
- 鲛人：似人更似大鱼——灰白细鳞、硬颅无发、蓝脉薄膜眼睑、趾间生蹼、脊生黑鳍；水中呼吸、瞬息百里；深海鲛魁梧凶暴、湖鲛体小发绿；与碧鲮为死敌（斥其"背叛海洋"）。
- 碧鲮：人形棕肤、无鳞无翼，水性极佳（游时美腿如鱼尾摆动）；长离大海患离魂症（神魂枯萎、心智渐塞）；原据碧鲮海湾今仅存一村；与鲛族、青鲨族敌对。

${locationLine ? `## 当前地域风貌（环境/建筑/民俗描写以此为准）\n${locationLine}\n\n` : ''}## 当前事件（玩家此刻所处的剧情节点）
${eventSection}

## 下一步（达成当前完成条件后，剧情将推进到）
${nextSection}

## 剧情标记
${JSON.stringify(runtime.flags || {})}

${focusedCharacterSection ? `${focusedCharacterSection}\n\n` : ''}${globalIdentitySection ? `${globalIdentitySection}\n\n` : ''}${loadBearingLine ? `${loadBearingLine}\n\n` : ''}${divergenceLine ? `${divergenceLine}\n\n` : ''}${returnBridgeLine ? `${returnBridgeLine}\n\n` : ''}${divergenceControlLine ? `${divergenceControlLine}\n\n` : ''}${worldActorLine ? `${worldActorLine}\n\n` : ''}${worldPushLine ? `${worldPushLine}\n\n` : ''}${steeringLine ? `${steeringLine}\n\n` : ''}${reputationLine}\n\n${relationLine ? `${relationLine}\n\n` : ''}${completedGoalLine ? `${completedGoalLine}\n\n` : ''}${improvLine}\n\n【正典叙事事实约束】：
1. 已知人物的姓名、别名、身份、物种、势力、亲属与政治关系均是事实字段：不得把人物写成兵器、坐骑、功法、物品或新角色；不得把称号、别名拆成另一个实体。
2. 人物之间的血缘、主从、婚配、同党、结盟、仇怨，只有上文正典人物档案或当前事件明确写出时才可断言。没有依据时只能写“尚未可知/传闻待证”，绝不可因同姓、官职、阵营或历史常识擅自补关系。
3. 叙事正文也必须遵守上述正典；这不是仅约束 tavern_commands 的规则。若玩家要求与正典矛盾的事实，明确说明冲突并以正典版本续写。
4. ${introducedLine}
5. 当前事件正文里出现、但没有列入“相关正典”的纯文本临时人物只用于本场演出：不得为其创建或更新 社交.关系、身份、属性、灵根、技能、背包等持久状态；除非玩家在后续明确将其收为长期同行者。

【主动推进剧情，不要停在原地等玩家】：

1. 每一段叙事都要朝“当前事件”的完成条件前进——主动设置场景、引入相关人物、制造契机，引导玩家走向该事件的达成，而不是只描述当前一幕然后停下。
2. 【每轮必做的收尾核对——叙事与数据必须同步】逐项检查本轮叙事，凡发生以下情况**必须**输出对应指令（只写在正文不发指令＝东西凭空消失，实测：云苍峰赠玉简正文收下了背包却没有）：
   ① 事件达成 → 只能使用上方“当前事件”逐条列出的“完成写入键”，将该精确路径原样 set 为 true（布尔，漏标会卡死推进）。不得自行用事件ID拼接 flag 路径；不得写到事件对象本身；不得使用未列出的、下一步/后续章节写入键；不得提前完成未来事件。
   ② 获得物品（受赠/缴获/拾取/购买/接过/收下）→ set 角色.背包.物品.<稳定物品ID> = {物品ID:"<同key末段>",名称,类型,品质:{quality,grade},数量,描述}（例：收下云苍峰玉简 → set 角色.背包.物品.item_yuncangfeng_yujian）；消耗 → add 数量(-1)；用尽 → delete
   ③ 货币收支 → add 角色.背包.货币.<币种>.数量
   ④ 学会功法/技能 → 对应功法/技能指令；伤势/中毒/增益 → push 角色.效果
   ⑤ 扬名/败名 → set 角色.属性.声望；NPC 好感/记忆变化 → add 好感度 / push 记忆
3. 关键剧情事件未完成时，不要建议切换下一关；先推动当前关内关键剧情触发。
4. 避免反复描写同一幕或原地打转；玩家若无明确行动，由你主动顺着主轴往下带。
5. 不要猜测、引用或泄露后续章节，以及“下一步”之后尚未触发的事件细节。`;
}
