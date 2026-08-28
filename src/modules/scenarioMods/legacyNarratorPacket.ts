import { getPrompt } from '@/services/defaultPrompts';
import { computePresentNames } from './presence';
import { getScenarioFocusEvent, type ScenarioEventActionSelection } from './runtime';
import { buildScenarioStoryPrompt } from './storyContext';
import type { SaveData } from '@/types/game';
import type { LegacyNarrativePilotPlan } from './legacyNarrativePilot';

export const LEGACY_NARRATOR_PACKET_BUDGET_BYTES = 6 * 1024;
const PROFILE_CHAR_LIMIT = 700;
const CAPSULE_CHAR_LIMIT = 500;

type RuntimeLike = Record<string, any>;

export interface LegacyMemoryCapsule {
  location: string;
  presentNames: string[];
  eventId: string;
  facts: string[];
  recentNarrative: string;
}

export interface LegacyNarratorPacket {
  action: string;
  settledOutcome: string;
  location: string;
  present: string[];
  mustAppear: string[];
  mustNotAppear: string[];
  body: { 气血?: string; 效果?: string[] };
  recentNarrative: string;
  outputContract: string;
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

function readPresentNames(saveData: SaveData): string[] {
  const runtime = runtimeOf(saveData);
  const ledger = runtime.actorEngine?.acquaintance || {};
  const playerName = readText((saveData as any)?.角色?.身份?.名字);
  const eventNames: string[] = [];
  const activeIds = new Set(Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : []);
  for (const event of runtime.events || []) {
    if (!activeIds.has(event?.id)) continue;
    for (const id of event.relatedCharacterIds || []) {
      const record = ledger[id] || Object.values(ledger).find((item: any) => item?.characterId === id);
      const name = readText(record?.name);
      if (name && name !== playerName) eventNames.push(name);
    }
  }
  const featuredNames = (runtime.opening?.featuredCharacterIds || [])
    .map((id: string) => readText(ledger[id]?.name))
    .filter((name: string) => name && name !== playerName);
  return [...computePresentNames({
    playerLocation: readLocation(saveData),
    eventCharacterNames: eventNames,
    featuredCharacterNames: featuredNames,
  })].filter(name => name !== playerName).sort();
}

function parseListedTerms(prompt: string, key: string): string[] {
  const match = prompt.match(new RegExp(`renderGuard\\.${key}=([^；。\\n]*)`));
  if (!match?.[1]) return [];
  return match[1].split('|').map(item => item.trim()).filter(Boolean);
}

export function readLocalMemoryCapsule(saveData: SaveData, selection: ScenarioEventActionSelection): LegacyMemoryCapsule {
  const runtime = runtimeOf(saveData);
  const focus = getScenarioFocusEvent(runtime as never);
  const recent = ((saveData as any)?.社交?.记忆?.短期记忆 || []).slice(-1).join('\n');
  const facts = [
    readText(selection.outcomeText),
    readText(focus?.objective),
  ].filter(Boolean);
  const capsule: LegacyMemoryCapsule = {
    location: readLocation(saveData),
    presentNames: readPresentNames(saveData),
    eventId: selection.eventId,
    facts: facts.slice(0, 6),
    recentNarrative: readText(recent).slice(0, CAPSULE_CHAR_LIMIT),
  };
  return capsule;
}

export function compileLegacyNarratorPacket(
  saveData: SaveData,
  plan: LegacyNarrativePilotPlan,
  storyPrompt: string,
  profile: string,
): { packet: LegacyNarratorPacket; systemPrompt: string; promptBytes: number; capsule: LegacyMemoryCapsule } {
  const capsule = readLocalMemoryCapsule(saveData, plan.selection);
  const attributes = (saveData as any)?.角色?.属性 || {};
  const effects = Array.isArray((saveData as any)?.角色?.效果)
    ? (saveData as any).角色.效果.map((item: any) => readText(item?.状态名称)).filter(Boolean).slice(0, 4)
    : [];
  const mustAppear = [...new Set([
    plan.playerLine,
    plan.outcomeText,
    capsule.location,
    ...capsule.presentNames,
    ...capsule.facts,
  ].filter(Boolean))];
  const mustNotAppear = [...new Set([
    ...parseListedTerms(storyPrompt, 'reservedFutureTerms'),
    ...parseListedTerms(storyPrompt, 'forbiddenTerms'),
  ])].filter(term => !mustAppear.includes(term)).slice(0, 12);

  const packet: LegacyNarratorPacket = {
    action: plan.playerLine,
    settledOutcome: plan.outcomeText,
    location: capsule.location,
    present: capsule.presentNames,
    mustAppear,
    mustNotAppear,
    body: {
      ...(attributes?.气血 ? { 气血: `${attributes.气血.当前}/${attributes.气血.上限}` } : {}),
      ...(effects.length ? { 效果: effects } : {}),
    },
    recentNarrative: capsule.recentNarrative,
    outputContract: '写 800–1000 字第二人称正文；只演出 Packet 内既定事实；无命令、无存档写入权。',
  };

  const { systemPrompt, promptBytes } = trimPacketToBudget(profile, packet);
  return { packet, systemPrompt, promptBytes, capsule };
}

function renderNarratorSystemPrompt(profile: string, packet: LegacyNarratorPacket): string {
  return [
    readText(profile),
    '# Render Packet',
    JSON.stringify(packet),
    '# 模型权限',
    '- 只输出可展示中文正文。',
    '- 不得输出 JSON、命令、判定、物品、移动、死亡、关系终态或事件完成声明。',
  ].filter(Boolean).join('\n\n');
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function trimPacketToBudget(
  profile: string,
  packet: LegacyNarratorPacket,
): { systemPrompt: string; promptBytes: number } {
  const trimmedProfile = readText(profile).slice(0, PROFILE_CHAR_LIMIT);
  packet.recentNarrative = packet.recentNarrative.slice(0, CAPSULE_CHAR_LIMIT);
  let systemPrompt = renderNarratorSystemPrompt(trimmedProfile, packet);
  let promptBytes = utf8Bytes(systemPrompt);
  if (promptBytes <= LEGACY_NARRATOR_PACKET_BUDGET_BYTES) {
    return { systemPrompt, promptBytes };
  }
  packet.recentNarrative = '';
  if (packet.mustAppear.length > 4) packet.mustAppear = packet.mustAppear.slice(0, 4);
  if (packet.mustNotAppear.length > 8) packet.mustNotAppear = packet.mustNotAppear.slice(0, 8);
  systemPrompt = renderNarratorSystemPrompt(trimmedProfile, packet);
  promptBytes = utf8Bytes(systemPrompt);
  if (promptBytes > LEGACY_NARRATOR_PACKET_BUDGET_BYTES) {
    systemPrompt = renderNarratorSystemPrompt(trimmedProfile.slice(0, 200), packet);
    promptBytes = utf8Bytes(systemPrompt);
  }
  return { systemPrompt, promptBytes };
}

export async function buildLegacyNarratorPrompt(
  saveData: SaveData,
  plan: LegacyNarrativePilotPlan,
): Promise<{ packet: LegacyNarratorPacket; systemPrompt: string; promptBytes: number; storyPrompt: string; capsule: LegacyMemoryCapsule }> {
  const recentText = ((saveData as any)?.社交?.记忆?.短期记忆 || []).slice(-2).join('\n');
  const storyPrompt = buildScenarioStoryPrompt(saveData, [plan.playerLine, recentText].filter(Boolean).join('\n'));
  const profile = await getPrompt('legacyNarrativeOnly');
  const compiled = compileLegacyNarratorPacket(saveData, plan, storyPrompt, profile);
  return { ...compiled, storyPrompt };
}
