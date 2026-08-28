import type { SaveData } from '@/types/game';
import { getJudgementState } from '@/utils/judgementEngine';
import {
  getCurrentStoryEventActions,
  type ScenarioEventActionSelection,
} from '@/modules/scenarioMods/runtime';

export const LEGACY_NARRATIVE_PILOT_STORAGE_KEY = 'xiantu.legacyNarrativePilot.s01_01.v1';
export const LEGACY_PILOT_REQUIRED_PROMPT_KEYS = ['legacyNarrativeOnly', 'playerPersonality'] as const;
export const LEGACY_NARRATIVE_PILOT_EVENT_ID = 'lcq.event.s01_01';
export const LEGACY_NARRATIVE_PILOT_MAX_TOKENS = 2048;
export const LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS = {
  usageType: 'main' as const,
  maxTokens: LEGACY_NARRATIVE_PILOT_MAX_TOKENS,
  responseMode: 'text' as const,
};

type StorageLike = { getItem(key: string): string | null };

export interface LegacyNarrativePilotPlan {
  selection: ScenarioEventActionSelection;
  playerLine: string;
  outcomeText: string;
  compactState: Record<string, unknown>;
}

export async function areLegacyPilotPromptsEnabled(
  isEnabled: (key: string) => Promise<boolean>,
): Promise<boolean> {
  const flags = await Promise.all(LEGACY_PILOT_REQUIRED_PROMPT_KEYS.map(key => isEnabled(key)));
  return flags.every(Boolean);
}

export function isLegacyNarrativePilotEnabled(storage?: StorageLike): boolean {
  try {
    const source = storage ?? (typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage);
    return source?.getItem(LEGACY_NARRATIVE_PILOT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function sameFreshSelection(
  candidate: ScenarioEventActionSelection,
  provided: ScenarioEventActionSelection,
): boolean {
  return candidate.source === provided.source
    && candidate.eventId === provided.eventId
    && candidate.actionId === provided.actionId
    && candidate.actionText === provided.actionText
    && candidate.playerLine === provided.playerLine
    && candidate.contractHash === provided.contractHash
    && candidate.expectedOutcome === provided.expectedOutcome
    && candidate.outcomeText === provided.outcomeText
    && candidate.timeCost === provided.timeCost
    && candidate.interaction?.verb === provided.interaction?.verb
    && candidate.interaction?.targetId === provided.interaction?.targetId
    && candidate.interaction?.targetLabel === provided.interaction?.targetLabel;
}

function compactPilotState(saveData: SaveData): Record<string, unknown> {
  const state = saveData as any;
  const attributes = state?.角色?.属性 || {};
  return {
    时间: state?.元数据?.时间,
    主角: {
      名字: state?.角色?.身份?.名字,
      性别: state?.角色?.身份?.性别,
      位置: state?.角色?.位置?.描述,
      境界: attributes?.境界?.名称,
      气血: attributes?.气血,
      灵气: attributes?.灵气,
      神识: attributes?.神识,
      效果: Array.isArray(state?.角色?.效果)
        ? state.角色.效果.map((effect: any) => effect?.状态名称).filter(Boolean)
        : [],
    },
  };
}

/**
 * One-scene Legacy experiment. It accepts only an exact, fresh action selected
 * from the structured event UI. Natural-text recovery never receives this route.
 */
export function planLegacyNarrativePilot(input: {
  saveData: SaveData;
  eventAction?: ScenarioEventActionSelection;
  eventActionProvenance?: 'selected' | 'resolved_text';
  storage?: StorageLike;
}): LegacyNarrativePilotPlan | null {
  if (!isLegacyNarrativePilotEnabled(input.storage)) return null;
  if (input.eventActionProvenance !== 'selected') return null;
  const provided = input.eventAction;
  if (!provided || provided.source !== 'event_engine' || provided.eventId !== LEGACY_NARRATIVE_PILOT_EVENT_ID) {
    return null;
  }
  if (getJudgementState(input.saveData).pending) return null;
  const fresh = getCurrentStoryEventActions(input.saveData)
    .find(candidate => sameFreshSelection(candidate, provided));
  if (!fresh) return null;
  return {
    selection: structuredClone(fresh),
    playerLine: fresh.playerLine,
    outcomeText: fresh.outcomeText,
    compactState: compactPilotState(input.saveData),
  };
}
