
import {isNamedEntityLabel} from './namedEntities';
import {entityNamePattern} from './namedEntities';
import { namingAliases, namingFor, namingChapter, sceneBoundEntity } from './ledger/naming';
import { syncNanhuangIdentityDisplay, xiaoziDisclosure, isDisclosureFactAllowed } from './characterResolver';
import { stepScene, sceneLedgerSummary } from './fixedEndingNarratives';
import { cloneDeep } from 'lodash';
import { getPrompt, getSystemPrompts } from '@/services/defaultPrompts';
import { rankOf, type AcquaintanceLedger } from './acquaintanceLedger';
import { computePresentNames, departedPresentNames } from './presence';
import {
  advanceScenarioRuntime,
  getScenarioFocusEvent,
  recordStoryEventStructuredAction,
  type ScenarioEventActionSelection,
} from './runtime';
import { buildScenarioStoryPrompt } from './storyContext';
import { filterLegacyPilotEventCharacterNames } from './legacyPilotScenes';
import { resolveScenarioEventNarrative } from './eventNarrativeView';
import { ensureWuyuanOpenWorldSlice } from './wuyuanOpenWorldSlice';
import { isInternalDevLanguage, stripInternalDevLanguage } from './legacyNarrativeContract';
import { LEGACY_RENDER_PLAN_INSTRUCTION } from './legacyRenderPlan';
import type { SaveData } from '@/types/game';
import type { LegacyNarrativePilotPlan } from './legacyNarrativePilot';

export const LEGACY_NARRATOR_PACKET_BUDGET_BYTES = 6 * 1024;
export const LEGACY_NARRATOR_PROMPT_BUDGET_BYTES = 12 * 1024;
export const LEGACY_PILOT_SUBSTITUTED_PROMPT_KEYS = [
  'businessRules',
  'textFormatRules',
  'worldStandards',
  'eventSystemRules',
] as const;
const CAPSULE_CHAR_LIMIT = 500;
const PERSONALITY_LEAK_RE = /秘密|知识|知道|身份|穿越|记忆|计划|企图|动机|真实|内心|想要|目标|已故|死亡|身亡/;

type RuntimeLike = Record<string, any>;

export interface LegacyMemoryCapsule {
  location: string;
  presentNames: string[];
  presentActors: LegacyPresentActor[];
  eventId: string;
  facts: string[];
  recentNarrative: string;
  currentObjective: string;
}

export interface LegacyPresentActor {
  characterId?: string;
  entityType?: 'character' | 'creature';
  name: string;
  panelName?: string;
  selfReportedName?: string;
  displayKind?: string;
  主角心称?: string;
  traits: string[];
  speechStyle?: string;
  role?: string;
  race?: string;
  appearance?: string;
  gender?: string;
  pronoun?: string;
  称呼?: { 对主角: string; 主角对他: string };
}

export interface LegacyLocalReceipt {
  source: 'event_action' | 'judgement';
  action: string;
  outcome: string;
}

export interface LegacyMustAppear {
  location: string;
  present: string[];
  objective: string;
}

export interface LegacyNarratorPacket {
  eventId?: string;
  actionId?: string;
  action: string;
  settledOutcome: string;
  location: string;
  currentObjective: string;
  publicFacts: string[];
  localReceipt: LegacyLocalReceipt;
  present: string[];
  presentActors: LegacyPresentActor[];
  mustAppear: LegacyMustAppear;
  mustNotAppear: string[];
  body: { 气血?: string; 效果?: string[] };
  recentNarrative: string;
  outputContract: string;
  receipts: LegacyPilotMoveReceipts;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function runtimeOf(saveData: SaveData): RuntimeLike {
  const runtime = (saveData as any)?.世界?.状态?.剧本模组;
  return runtime && typeof runtime === 'object' ? runtime : {};
}

function readLocation(saveData: SaveData): string {
  const location = (saveData as any)?.角色?.位置;
  if (typeof location === 'string') return location.trim();
  return readText(location?.描述);
}

function asLedger(value: unknown): AcquaintanceLedger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as AcquaintanceLedger;
}

function acquaintanceLedgerOf(runtime: RuntimeLike): AcquaintanceLedger {
  const primary = asLedger(runtime.acquaintances);
  const legacy = asLedger(runtime.actorEngine?.acquaintance);
  return { ...legacy, ...primary };
}

function nameFromCanon(runtime: RuntimeLike, id: string): string {
  const characters = Array.isArray(runtime.canon?.characters) ? runtime.canon.characters : [];
  const hit = characters.find((item: any) => item?.id === id);
  return readText(hit?.name);
}

function nameFromLedger(ledger: AcquaintanceLedger, id: string): string {
  const direct = ledger[id];
  if (direct && readText(direct.name)) return readText(direct.name);
  const byCharacterId = Object.values(ledger).find(item => item?.characterId === id);
  return readText(byCharacterId?.name);
}

function resolveCharacterName(runtime: RuntimeLike, ledger: AcquaintanceLedger, id: string): string {
  return nameFromCanon(runtime, id) || nameFromLedger(ledger, id);
}

function isRevealedName(ledger: AcquaintanceLedger, name: string, playerName: string): boolean {
  if (!name || name === playerName) return false;
  const record = Object.values(ledger).find(item => readText(item?.name) === name);
  if (record) return rankOf(record.kind) >= rankOf('encountered');
  return true;
}

function departedNames(saveData: SaveData, currentEventId: string): string[] {
  return departedPresentNames(runtimeOf(saveData))
    .filter(name => !(currentEventId === 'lcq.event.s01_02' && isNamedEntityLabel("character","lcq.character.duan_qiang",name)))
    .filter(name => !(currentEventId === 'lcq.event.s02_02' && isNamedEntityLabel("character","lcq.character.wang_zhe",name)));
}

function readPresentNames(saveData: SaveData, eventId?: string): string[] {
  const runtime = runtimeOf(saveData);
  const ledger = acquaintanceLedgerOf(runtime);
  const playerName = readText((saveData as any)?.角色?.身份?.名字);
  const focusId = readText(eventId);
  const eventNames: string[] = [];
  for (const event of runtime.events || []) {
    if (focusId && event?.id !== focusId) continue;
    if (!focusId) {
      const activeIds = new Set(Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : []);
      if (!activeIds.has(event?.id)) continue;
    }
    for (const id of event.relatedCharacterIds || []) {
      const name = resolveCharacterName(runtime, ledger, id);
      if (name && name !== playerName && isRevealedName(ledger, name, playerName)) eventNames.push(name);
    }
  }
  const dead = new Set(departedNames(saveData, focusId));
  const sceneEventNames = filterLegacyPilotEventCharacterNames(focusId, eventNames).filter(name => !dead.has(name));
  const physicalExtras = focusId === 'lcq.event.s02_02';
  const recentNarrative = physicalExtras
    ? (((saveData as any)?.社交?.记忆?.短期记忆 || []) as unknown[])
      .slice(-2)
      .map(item => String(item || ''))
      .join('\n')
    : '';
  return [...computePresentNames({
    playerLocation: readLocation(saveData),
    ...(physicalExtras ? { relations: (saveData as any)?.社交?.关系, recentNarrative } : {}),
    eventCharacterNames: sceneEventNames,
    excludeNames: dead,
  })].filter(name => name !== playerName && !dead.has(name)).sort();
}

function isSafePersonalityTrait(trait: string): boolean {
  const text = readText(trait);
  if (!text) return false;
  return !PERSONALITY_LEAK_RE.test(text);
}

function readPresentActors(saveData: SaveData, presentNames: string[], eventId?: string): LegacyPresentActor[] {
  const allowed = new Set(presentNames.filter(Boolean));
  if (!allowed.size) return [];
  const runtime = runtimeOf(saveData);
  syncNanhuangIdentityDisplay(runtime);
  const namingRuntime = eventId ? { ...runtime, activeEventIds: [eventId] } : runtime;
  const characters = Array.isArray(runtime.canon?.characters) ? runtime.canon.characters : [];
  const byName = new Map<string, any>();
  for (const character of characters) {
    const name = readText(character?.name);
    for (const alias of [name, ...namingAliases(character.id).filter(alias => alias !== '鬼王峒使者' || namingChapter(namingRuntime) >= 77)]) if (alias && allowed.has(alias) && !byName.has(alias)) byName.set(alias, character);
  }
  const actors: LegacyPresentActor[] = [];
  for (const name of presentNames) {
    if (!allowed.has(name)) continue;
    const rec = byName.get(name);
    const personality = rec?.profile?.personality;
    const traits = Array.isArray(personality)
      ? personality.map((item: unknown) => readText(item).slice(0, 24)).filter(isSafePersonalityTrait).slice(0, 3)
      : [];
    const speechStyle = isSafePersonalityTrait(readText(rec?.profile?.speechStyle) || readText(rec?.speechStyle))
      ? readText(rec?.profile?.speechStyle || rec?.speechStyle)
      : '';
    const baseName = name.replace(/[（(].*$/, '');
    const bound = sceneBoundEntity(baseName, namingChapter(namingRuntime));
    const matched = rec || (bound && 'sceneBinding' in bound ? { id: bound.id, name: namingFor(bound.id, namingChapter(namingRuntime))?.text, role: bound.sceneBinding?.role } : undefined) || characters.find((c: any) => c.name === baseName);
    const gender = matched?.gender || (new RegExp("^(?:"+"(?:"+entityNamePattern("character","liuchao.character.xie_yi")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.yun_cang_feng")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.qi_yuan")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.wu_er_lang")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.shang_zhen_yu")+")"+"|"+"(?:"+entityNamePattern("character","lcq.character.np004")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.yi_hu")+")"+"|"+"(?:"+entityNamePattern("character","lcq.character.np003")+")"+"|"+"(?:"+entityNamePattern("character","lcq.character.nanhuang_xiaowei")+")"+"|"+"(?:"+entityNamePattern("character","lcq.character.nanhuang_shigang")+")"+"|"+"(?:"+entityNamePattern("enemy","lcq.enemy.ge_luo")+")"+"|"+"(?:"+entityNamePattern("character","lcq.character.mi_gu")+")"+"|"+"(?:"+entityNamePattern("enemy","lcq.enemy.dagu")+")"+"|"+"(?:"+entityNamePattern("location","liuchao.location.gui_wang_dong")+")"+"使者)$","").test(baseName) ? '男' : new RegExp("^(?:"+"(?:"+entityNamePattern("character","liuchao.character.ning_yu")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.su_li")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.a_xi")+")"+"|阿葭|"+"(?:"+entityNamePattern("faction","liuchao.faction.hua_miao")+")"+"新娘|"+"(?:"+entityNamePattern("character","liuchao.character.le_mingzhu")+")"+"|"+"(?:"+entityNamePattern("character","canon.character.15b71fd1c8")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.xiao_zi")+")"+")$","").test(baseName) ? '女' : undefined);
    const addresses: Record<string, string> = { 云苍峰: '程小哥', 祁远: '程头儿', 吴战威: '程头儿', 谢艺: '程兄', 武二郎: '你小子（自称二爷）', 朱八八: '小程子', 樨夫人: '公子' };
    actors.push({
      characterId: matched?.id,
      ...(matched?.entityType ? { entityType: matched.entityType } : {}),
      name: namingFor(matched?.id, namingChapter(namingRuntime), 'narration')?.text || name,
      selfReportedName: namingFor(matched?.id, namingChapter(namingRuntime), 'selfReportedName')?.text,
      panelName: namingFor(matched?.id, namingChapter(namingRuntime))?.text,
      displayKind: (namingFor(matched?.id, namingChapter(namingRuntime)) as {kind?: string} | undefined)?.kind || 'name',
      主角心称: namingFor(matched?.id, namingChapter(namingRuntime), 'protagonistThought')?.text,
      traits,
      role: baseName === '鬼王峒使者' ? '鬼王峒使者，尚未报名' : readText(matched?.role).slice(0, 80),
      race: isNamedEntityLabel("character","liuchao.character.xiao_zi",baseName) ? readText(matched?.profile?.race) : readText(matched?.profile?.race).split(/[（(]/)[0].replace(/.*(?:之女|血统|身世).*/, '').slice(0, 40),
      appearance: readText(matched?.profile?.appearance).split(/[。！？]/)[0].replace(/(?:胸|乳|臀|私处|胯)[^，,；;]*/g, '').slice(0, 90),
      ...(gender ? { gender, pronoun: matched?.entityType === 'creature' ? '它' : /^(男|male)$/.test(gender) ? '他' : /^(女|female)$/.test(gender) ? '她' : '称姓名' } : {}),
      称呼: { 对主角: namingFor(matched?.id, namingChapter(namingRuntime), 'npcAddress')?.text || addresses[baseName] || (Array.isArray(matched?.profile?.notes) ? matched.profile.notes.map((n: string) => n.match(/【称呼】(.+)/)?.[1]).filter(Boolean).join('；').slice(0, 70) : '') || '你', 主角对他: namingFor(matched?.id, namingChapter(namingRuntime), 'protagonistAddress')?.text || (isNamedEntityLabel("character","liuchao.character.su_li",baseName) ? '苏荔族长' : baseName) },
      ...(speechStyle ? { speechStyle } : {}),
    });
    if (actors.length >= (/^lcq\.stage_0(?:3b|4|4b|5b)/.test(String(runtime.modId || '')) ? 18 : 3)) break;
  }
  return actors;
}

function parseListedTerms(prompt: string, key: string): string[] {
  const match = prompt.match(new RegExp(`renderGuard\\.${key}=([^；。\\n]*)`));
  if (!match?.[1]) return [];
  return match[1].split('|').map(item => item.trim()).filter(Boolean);
}

function playerFacingFact(value: unknown): string {
  const text = stripInternalDevLanguage(readText(value));
  if (!text || isInternalDevLanguage(text)) return '';
  return text;
}

function uniqueFacts(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(item => playerFacingFact(item)).filter(Boolean))];
}

export function readLocalMemoryCapsule(saveData: SaveData, selection: ScenarioEventActionSelection): LegacyMemoryCapsule {
  const runtime = runtimeOf(saveData);
  const selectedEvent = (runtime.events || []).find((item: any) => item?.id === selection.eventId);
  const focus = selectedEvent || getScenarioFocusEvent(runtime as never);
  const recent = ((saveData as any)?.社交?.记忆?.短期记忆 || []).slice(-1).join('\n');
  const card = stepScene(runtime, selection.eventId, selection.actionId);
  const currentObjective = playerFacingFact(card ? card.sceneObjective || (card as any).label : focus?.objective);
  const view = focus ? resolveScenarioEventNarrative(focus, runtime.flags || {}, runtime.divergences, runtime) : null;
  const completed = runtime.completedEventIds?.includes(focus?.id) || runtime.eventActionStates?.[focus?.id]?.readyAtTurn !== undefined;
  const facts = uniqueFacts([
    ...(card?.fixedFacts?.length ? [] : [playerFacingFact(selection.outcomeText)]),
    currentObjective,
    ...(card?.fixedFacts || []),
    ...(completed && !card?.fixedFacts?.length && /^lcq\.stage_0(?:3b|4|4b)/.test(String(runtime.modId || '')) ? [playerFacingFact(view?.description)] : []),
    ...(focus?.id === 'lcq.event.s04b_lingfei_baiyi_crisis_18' && xiaoziDisclosure(runtime).father ? ['【已知身世】小紫是岳帅的遗腹女。'] : []),
    readLocation(saveData),
  ]).filter(fact => isDisclosureFactAllowed(fact, runtime)).slice(0, 6);
  const presentNames = card?.cast?.present ? [...card.cast.present] : readPresentNames(saveData, selection.eventId);
  return {
    location: card?.sceneLocation || readLocation(saveData),
    presentNames,
    presentActors: readPresentActors(saveData, presentNames, selection.eventId),
    eventId: selection.eventId,
    facts,
    recentNarrative: readText(recent).slice(0, CAPSULE_CHAR_LIMIT),
    currentObjective,
  };
}

export interface LegacyPilotMoveReceipts {
  move: boolean;
  casualty: boolean;
  moveTo?: string;
  fromZoneId?: string;
  toZoneId?: string;
  routeId?: string;
  mode?: 'player' | 'forced';
  causeEventId?: string;
}

export interface LegacyPilotSettlementPreview {
  settled: SaveData;
  receipts: LegacyPilotMoveReceipts;
  progress: ReturnType<typeof recordStoryEventStructuredAction>;
}

/** Clone-and-settle so packets read actual location/death results, not event-id guesses. */
export function previewLegacyPilotSettlement(
  saveData: SaveData,
  selection: ScenarioEventActionSelection,
  options?: Parameters<typeof recordStoryEventStructuredAction>[2],
): LegacyPilotSettlementPreview {
  const beforeLocation = readLocation(saveData);
  const beforeZone = String((saveData as any)?.世界?.状态?.剧本模组?.openWorldSlice?.currentZoneId || '');
  const settled = cloneDeep(saveData);
  const progress = recordStoryEventStructuredAction(settled, selection, options);
  const advanced = advanceScenarioRuntime(settled).saveData;
  ensureWuyuanOpenWorldSlice(advanced);
  const afterLocation = readLocation(advanced);
  const afterZone = String((advanced as any)?.世界?.状态?.剧本模组?.openWorldSlice?.currentZoneId || '');
  const hops = (((advanced as any)?.世界?.状态?.剧本模组?.openWorldSlice?.travelReceipts) || [])
    .filter((item: { mode?: string; causeEventId?: string }) => item?.mode === 'forced' && item?.causeEventId === selection.eventId);
  const last = hops[hops.length - 1];
  const first = hops[0];
  const hopMove = Boolean(first?.fromZoneId && last?.toZoneId && first.fromZoneId !== last.toZoneId);
  const rawLocationMove = Boolean(beforeLocation && afterLocation && beforeLocation !== afterLocation);
  const sliceHydrated = !beforeZone && Boolean(afterZone);
  const unrelatedZoneShift = Boolean(beforeZone && afterZone && beforeZone !== afterZone && !hopMove);
  const move = Boolean(hopMove || (rawLocationMove && !sliceHydrated && !unrelatedZoneShift));
  return {
    settled: advanced,
    progress,
    receipts: {
      move,
      casualty: Boolean(progress.completed && (progress.eventId === 'lcq.event.s01_02' || progress.eventId === 'lcq.event.s02_02')),
      ...(move && afterLocation && afterLocation !== beforeLocation ? { moveTo: afterLocation } : {}),
      ...(first?.fromZoneId ? { fromZoneId: String(first.fromZoneId) } : {}),
      ...(last?.toZoneId ? { toZoneId: String(last.toZoneId) } : {}),
      ...(last?.routeId ? { routeId: String(last.routeId) } : {}),
      ...(last?.mode === 'forced' ? { mode: 'forced' as const, causeEventId: String(last.causeEventId || selection.eventId || '') } : {}),
    },
  };
}

export function compileLegacyNarratorPacket(
  saveData: SaveData,
  plan: LegacyNarrativePilotPlan,
  storyPrompt: string,
  profile: string,
  playerPersonality = '',
  receipts?: LegacyPilotMoveReceipts,
): {
  packet: LegacyNarratorPacket;
  systemPrompt: string;
  promptBytes: number;
  packetBytes: number;
  capsule: LegacyMemoryCapsule;
} {
  const capsule = readLocalMemoryCapsule(saveData, plan.selection);
  const attributes = (saveData as any)?.角色?.属性 || {};
  const effects = Array.isArray((saveData as any)?.角色?.效果)
    ? (saveData as any).角色.效果.map((item: any) => readText(item?.状态名称)).filter(Boolean).slice(0, 4)
    : [];
  const action = playerFacingFact(plan.playerLine) || readText(plan.playerLine);
  const settledOutcome = playerFacingFact(plan.outcomeText);
  const presentNames = capsule.presentNames;
  const presentActors = readPresentActors(saveData, presentNames, plan.selection.eventId);
  const settledReceipts = receipts || { move: false, casualty: false };
  const appearLocation = settledReceipts.moveTo || capsule.location;
  const publicFacts = uniqueFacts([
    capsule.location,
    appearLocation,
    capsule.currentObjective,
    settledOutcome,
    ...(settledReceipts.casualty && plan.selection.eventId === 'lcq.event.s01_02' ? ['段强中箭身亡'] : []),
    ...(settledReceipts.casualty && plan.selection.eventId === 'lcq.event.s02_02' ? ['王哲九阳殉军'] : []),
    ...presentNames.map(name => `${name}在场`),
    ...capsule.facts,
  ]);
  const mustAppear: LegacyMustAppear = {
    location: appearLocation,
    present: [...presentNames],
    objective: capsule.currentObjective,
  };
  const requiredTerms = uniqueFacts([
    mustAppear.location,
    ...mustAppear.present,
    mustAppear.objective,
  ]);
  const mustNotAppear = [...new Set([
    ...parseListedTerms(storyPrompt, 'reservedFutureTerms'),
    ...parseListedTerms(storyPrompt, 'forbiddenTerms'),
    ...departedNames(saveData, plan.selection.eventId),
  ])].filter(term => term && !requiredTerms.includes(term) && !isInternalDevLanguage(term)).slice(0, 12);

  const packet: LegacyNarratorPacket = {
    eventId: plan.selection.eventId,
    actionId: readText(plan.selection.actionId) || undefined,
    action,
    settledOutcome,
    location: capsule.location,
    currentObjective: capsule.currentObjective,
    publicFacts: publicFacts.filter(fact => isDisclosureFactAllowed(fact, runtimeOf(saveData))),
    localReceipt: {
      source: 'event_action',
      action,
      outcome: settledOutcome || capsule.currentObjective,
    },
    present: presentNames,
    presentActors,
    mustAppear,
    mustNotAppear,
    body: {
      ...(attributes?.气血 ? { 气血: `${attributes.气血.当前}/${attributes.气血.上限}` } : {}),
      ...(effects.length ? { 效果: effects } : {}),
    },
    recentNarrative: capsule.recentNarrative,
    outputContract: '只输出 RenderPlan JSON；不要叙事正文。无命令、无存档写入权。',
    receipts: {
      move: Boolean(settledReceipts.move),
      casualty: Boolean(settledReceipts.casualty),
      ...(settledReceipts.moveTo ? { moveTo: settledReceipts.moveTo } : {}),
      ...(settledReceipts.fromZoneId ? { fromZoneId: settledReceipts.fromZoneId } : {}),
      ...(settledReceipts.toZoneId ? { toZoneId: settledReceipts.toZoneId } : {}),
      ...(settledReceipts.routeId ? { routeId: settledReceipts.routeId } : {}),
      ...(settledReceipts.mode ? { mode: settledReceipts.mode } : {}),
      ...(settledReceipts.causeEventId ? { causeEventId: settledReceipts.causeEventId } : {}),
    },
  };

  const compiled = trimPacketToBudget(profile, playerPersonality, packet);
  return { packet, capsule, ...compiled };
}

function renderNarratorSystemPrompt(
  profile: string,
  playerPersonality: string,
  packet: LegacyNarratorPacket,
): string {
  const managed = readText(profile);
  const preference = managed && managed !== LEGACY_RENDER_PLAN_INSTRUCTION ? managed : '';
  return [
    LEGACY_RENDER_PLAN_INSTRUCTION,
    preference,
    readText(playerPersonality),
    '# Render Packet',
    JSON.stringify(packet),
    '# 模型权限',
    '- 只输出一个 RenderPlan JSON 对象，不要叙事正文，不要 text 字段。',
    '- 不得输出命令、判定、物品、移动、死亡、关系终态或事件完成声明。',
    '- JSON 必须且仅含 pacing、sensory、companion、closing，取值见上方枚举。',
  ].filter(Boolean).join('\n\n');
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function packetBytesOf(packet: LegacyNarratorPacket): number {
  return utf8Bytes(JSON.stringify(packet));
}

export function isLegacyPilotSoloCast(packet: LegacyNarratorPacket): boolean {
  const names = [...new Set((packet.present || []).map(name => String(name || '').trim()).filter(Boolean))];
  return names.length === 1;
}

export function isLegacyPilotPromptWithinBudget(input: {
  promptBytes: number;
  packetBytes?: number;
  managedPromptCompatible?: boolean;
}): boolean {
  if (input.managedPromptCompatible === false) return false;
  if (input.promptBytes > LEGACY_NARRATOR_PROMPT_BUDGET_BYTES) return false;
  if (typeof input.packetBytes === 'number' && input.packetBytes > LEGACY_NARRATOR_PACKET_BUDGET_BYTES) {
    return false;
  }
  return true;
}

function normalizedPrompt(text: unknown): string {
  return typeof text === 'string' ? text.trim() : '';
}

export function findLegacyPilotManagedPromptOverrides(
  current: Record<string, string>,
  defaults: Record<string, string>,
): string[] {
  return LEGACY_PILOT_SUBSTITUTED_PROMPT_KEYS.filter(key => (
    normalizedPrompt(current[key]) !== normalizedPrompt(defaults[key])
  ));
}

function trimPacketToBudget(
  profile: string,
  playerPersonality: string,
  packet: LegacyNarratorPacket,
): { systemPrompt: string; promptBytes: number; packetBytes: number } {
  packet.recentNarrative = packet.recentNarrative.slice(0, CAPSULE_CHAR_LIMIT);
  let systemPrompt = renderNarratorSystemPrompt(profile, playerPersonality, packet);
  let promptBytes = utf8Bytes(systemPrompt);
  let packetBytes = packetBytesOf(packet);
  if (packetBytes <= LEGACY_NARRATOR_PACKET_BUDGET_BYTES) {
    return { systemPrompt, promptBytes, packetBytes };
  }
  packet.recentNarrative = '';
  if (packet.publicFacts.length > 6) packet.publicFacts = packet.publicFacts.slice(0, 6);
  if (packet.mustNotAppear.length > 8) packet.mustNotAppear = packet.mustNotAppear.slice(0, 8);
  systemPrompt = renderNarratorSystemPrompt(profile, playerPersonality, packet);
  promptBytes = utf8Bytes(systemPrompt);
  packetBytes = packetBytesOf(packet);
  return { systemPrompt, promptBytes, packetBytes };
}

export async function buildLegacyNarratorPrompt(
  saveData: SaveData,
  plan: LegacyNarrativePilotPlan,
): Promise<{
  packet: LegacyNarratorPacket;
  systemPrompt: string;
  promptBytes: number;
  packetBytes: number;
  storyPrompt: string;
  capsule: LegacyMemoryCapsule;
  managedPromptCompatible: boolean;
  managedPromptOverrides: string[];
  settlementAttempted: boolean;
  receipts: LegacyPilotMoveReceipts;
}> {
  const recentText = ((saveData as any)?.社交?.记忆?.短期记忆 || []).slice(-2).join('\n');
  const storyPrompt = buildScenarioStoryPrompt(saveData, [plan.playerLine, recentText].filter(Boolean).join('\n'));
  const managedKeys = [...LEGACY_PILOT_SUBSTITUTED_PROMPT_KEYS];
  const [profile, playerPersonality, ...managedValues] = await Promise.all([
    getPrompt('legacyRenderPlan'),
    getPrompt('playerPersonality'),
    ...managedKeys.map(key => getPrompt(key)),
  ]);
  const promptDefaults = getSystemPrompts();
  const currentManaged = Object.fromEntries(managedKeys.map((key, index) => [key, managedValues[index] ?? '']));
  const defaultManaged = Object.fromEntries(managedKeys.map(key => [key, promptDefaults[key]?.content ?? '']));
  const managedPromptOverrides = findLegacyPilotManagedPromptOverrides(currentManaged, defaultManaged);
  const preview = previewLegacyPilotSettlement(saveData, plan.selection);
  const compiled = compileLegacyNarratorPacket(
    preview.settled,
    plan,
    storyPrompt,
    profile,
    playerPersonality,
    preview.receipts,
  );
  return {
    ...compiled,
    storyPrompt,
    managedPromptCompatible: managedPromptOverrides.length === 0,
    managedPromptOverrides,
    settlementAttempted: Boolean(preview.progress.attempted || preview.progress.completed),
    receipts: preview.receipts,
  };
}


/** 模块演出软预算：先去重复历史，再缩人物描写；身份/结算/禁区/固定事实始终完整。 */
export function buildCompactModuleNarrativePrompt(
  instruction: string,
  scene: Record<string, any>,
  memories: string[],
  budget = 10000,
): { system: string; originalChars: number; compacted: boolean } {
  const original = instruction + '\n场景材料：' + JSON.stringify(scene)
    + '\n历史摘录（只是已展示内容，不代表所有人物知情）：' + JSON.stringify(memories);
  if (original.length <= budget) return { system: original, originalChars: original.length, compacted: false };
  const compact = structuredClone(scene);
  // recentNarrative与外部短期记忆重叠；日期/主角及当前账本事实仍由账本提供。
  delete compact.recentNarrative;
  for (const [key, ledgerKey] of [['上一拍要点', '上一拍要点'], ['世界事实', '世界事实'], ['时段', '时段']]) {
    if (compact.账本摘要 && JSON.stringify(compact[key]) === JSON.stringify(compact.账本摘要[ledgerKey])) delete compact[key];
  }
  const actors = Array.isArray(compact.presentActors) ? compact.presentActors : [];
  if (JSON.stringify(compact.present) === JSON.stringify(actors.map(actor => actor.name))) delete compact.present;
  // 有预算才保留长描写；绝不删出场者或种族/性别/代词/关系称呼。
  for (const actor of actors) {
    if (Array.isArray(actor.traits)) actor.traits = actor.traits.slice(0, 2);
    if (typeof actor.appearance === 'string') actor.appearance = actor.appearance.slice(0, 120);
    if (typeof actor.speechStyle === 'string') actor.speechStyle = actor.speechStyle.slice(0, 100);
    for (const key of ['traits', 'appearance', 'race', 'role', 'speechStyle']) {
      if (actor[key] === '' || (Array.isArray(actor[key]) && actor[key].length === 0)) delete actor[key];
    }
  }
  const system = instruction + '\n场景材料：' + JSON.stringify(compact)
    + '\n历史摘录（只是已展示内容，不代表所有人物知情）：' + JSON.stringify(memories.slice(-1).map(text => text.slice(-100)));
  // 预算是精简目标，不是剧情门禁。不可再因材料超限阻止模型请求或转legacy。
  return { system, originalChars: original.length, compacted: true };
}
