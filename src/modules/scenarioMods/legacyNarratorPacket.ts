import { cloneDeep } from 'lodash';
import { getPrompt, getSystemPrompts } from '@/services/defaultPrompts';
import { rankOf, type AcquaintanceLedger } from './acquaintanceLedger';
import { computePresentNames } from './presence';
import {
  advanceScenarioRuntime,
  getScenarioFocusEvent,
  recordStoryEventStructuredAction,
  type ScenarioEventActionSelection,
} from './runtime';
import { buildScenarioStoryPrompt } from './storyContext';
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
  eventId: string;
  facts: string[];
  recentNarrative: string;
  currentObjective: string;
}

export interface LegacyPresentActor {
  name: string;
  traits: string[];
  speechStyle?: string;
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
  receipts: { move: boolean; casualty: boolean; moveTo?: string };
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
  return nameFromLedger(ledger, id) || nameFromCanon(runtime, id);
}

function isRevealedName(ledger: AcquaintanceLedger, name: string, playerName: string): boolean {
  if (!name || name === playerName) return false;
  const record = Object.values(ledger).find(item => readText(item?.name) === name);
  if (record) return rankOf(record.kind) >= rankOf('encountered');
  return true;
}

function eventIsCompleted(runtime: RuntimeLike, eventId: string): boolean {
  const flagKey = String(eventId || '').replace(/^lcq\.event\./, 'event.') + '.done';
  if (runtime.flags?.[flagKey] === true) return true;
  const completed = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  return completed.includes(eventId);
}

function departedNames(saveData: SaveData, currentEventId: string): string[] {
  const runtime = runtimeOf(saveData);
  if (currentEventId !== 'lcq.event.s01_02' && eventIsCompleted(runtime, 'lcq.event.s01_02')) {
    return ['段强'];
  }
  return [];
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
  return [...computePresentNames({
    playerLocation: readLocation(saveData),
    eventCharacterNames: eventNames.filter(name => !dead.has(name)),
  })].filter(name => name !== playerName && !dead.has(name)).sort();
}

function isSafePersonalityTrait(trait: string): boolean {
  const text = readText(trait);
  if (!text) return false;
  return !PERSONALITY_LEAK_RE.test(text);
}

function readPresentActors(saveData: SaveData, presentNames: string[]): LegacyPresentActor[] {
  const allowed = new Set(presentNames.filter(Boolean));
  if (!allowed.size) return [];
  const runtime = runtimeOf(saveData);
  const characters = Array.isArray(runtime.canon?.characters) ? runtime.canon.characters : [];
  const byName = new Map<string, any>();
  for (const character of characters) {
    const name = readText(character?.name);
    if (name && allowed.has(name) && !byName.has(name)) byName.set(name, character);
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
    if (!traits.length && !speechStyle) continue;
    actors.push({
      name,
      traits,
      ...(speechStyle ? { speechStyle } : {}),
    });
    if (actors.length >= 3) break;
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
  const currentObjective = playerFacingFact(focus?.objective);
  const facts = uniqueFacts([
    playerFacingFact(selection.outcomeText),
    currentObjective,
    readLocation(saveData),
  ]).slice(0, 6);
  return {
    location: readLocation(saveData),
    presentNames: readPresentNames(saveData, selection.eventId),
    eventId: selection.eventId,
    facts,
    recentNarrative: readText(recent).slice(0, CAPSULE_CHAR_LIMIT),
    currentObjective,
  };
}

export interface LegacyPilotSettlementPreview {
  settled: SaveData;
  receipts: { move: boolean; casualty: boolean; moveTo?: string };
  progress: ReturnType<typeof recordStoryEventStructuredAction>;
}

/** Clone-and-settle so packets read actual location/death results, not event-id guesses. */
export function previewLegacyPilotSettlement(
  saveData: SaveData,
  selection: ScenarioEventActionSelection,
): LegacyPilotSettlementPreview {
  const beforeLocation = readLocation(saveData);
  const settled = cloneDeep(saveData);
  const progress = recordStoryEventStructuredAction(settled, selection);
  const advanced = advanceScenarioRuntime(settled).saveData;
  const afterLocation = readLocation(advanced);
  const move = Boolean(beforeLocation && afterLocation && beforeLocation !== afterLocation);
  return {
    settled: advanced,
    progress,
    receipts: {
      move,
      casualty: Boolean(progress.completed && progress.eventId === 'lcq.event.s01_02'),
      ...(move ? { moveTo: afterLocation } : {}),
    },
  };
}

export function compileLegacyNarratorPacket(
  saveData: SaveData,
  plan: LegacyNarrativePilotPlan,
  storyPrompt: string,
  profile: string,
  playerPersonality = '',
  receipts?: { move: boolean; casualty: boolean; moveTo?: string },
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
  const presentActors = readPresentActors(saveData, capsule.presentNames);
  const settledReceipts = receipts || { move: false, casualty: false };
  const appearLocation = settledReceipts.moveTo || capsule.location;
  const publicFacts = uniqueFacts([
    capsule.location,
    appearLocation,
    capsule.currentObjective,
    settledOutcome,
    ...(settledReceipts.casualty ? ['段强中箭身亡'] : []),
    ...capsule.presentNames.map(name => `${name}在场`),
    ...capsule.facts,
  ]);
  const mustAppear: LegacyMustAppear = {
    location: appearLocation,
    present: [...capsule.presentNames],
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
    action,
    settledOutcome,
    location: capsule.location,
    currentObjective: capsule.currentObjective,
    publicFacts,
    localReceipt: {
      source: 'event_action',
      action,
      outcome: settledOutcome || capsule.currentObjective,
    },
    present: capsule.presentNames,
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
  receipts: { move: boolean; casualty: boolean; moveTo?: string };
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
