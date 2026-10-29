import type { SaveData } from '@/types/game';
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { parseJsonSmart } from '@/utils/jsonExtract';
import { getPrompt } from '@/services/defaultPrompts';
import { advanceScenarioRuntime, getCurrentStoryEventActions, getCurrentStoryExplorationActions, getTrackedStoryOpportunityActions } from './runtime';
import { getWuyuanOpenWorldSelections } from './wuyuanOpenWorldSlice';
import { getBaihuGambleRefusalSelections } from './baihuGambleRefusal';
import { previewLegacyPilotSettlement } from './legacyNarratorPacket';
import type { LegacyNarrativePilotPlan } from './legacyNarrativePilot';
import type { LegacyNarratorPacket } from './legacyNarratorPacket';
import { fixedBeatNarrative, stepScene } from './fixedEndingNarratives';
import { getActiveKeyBeatCard } from './keyBeatCards';

export type PilotOptionsSource = 'model' | 'local_fallback' | 'cleared_keybeat' | 'cleared_fixedbeat' | 'cleared_ending' | 'cleared_contract' | 'disabled';
const sources = new WeakMap<object, PilotOptionsSource>();
export const pilotOptionLimits = () => GAME_NUMBERS.ui.legacyPilotActionOptions;
registerNumbersValidator(() => pilotOptionLimits().min > pilotOptionLimits().max ? ['ui.legacyPilotActionOptions.min > max'] : []);

/** Extend only the pilot call; the reviewed four-field RenderPlan and local body stay intact. */
export async function pilotOptionsPrompt(custom = ''): Promise<string> {
  const { min, max } = pilotOptionLimits();
  const prompt = (await getPrompt('actionOptions')).replace('{{CUSTOM_ACTION_PROMPT}}', custom);
  return `${prompt}\n本次只扩展 Legacy RenderPlan 响应合同：在原四个枚举字段之外增加 action_options 字符串数组（${min}–${max}项）。不输出 text、正文或指令。选项是玩家下一步可尝试的行动，不是已经发生的事实；不要重复引擎按钮。`;
}

/** Split before the strict RenderPlan parser so options can never become visible prose. */
export function splitPilotOptions(raw: string): { renderPlan: string; options: unknown[] } {
  try {
    const obj = parseJsonSmart<Record<string, unknown>>(raw);
    const options = obj.action_options ?? obj.行动选项;
    const { action_options: _options, 行动选项: _chinese, ...plan } = obj;
    return { renderPlan: JSON.stringify(plan), options: Array.isArray(options) ? options : [] };
  } catch {
    return { renderPlan: raw, options: [] }; // lcq-allow: malformed output uses the existing local RenderPlan fallback
  }
}

type Selection = { label?: string; actionText?: string; playerLine?: string };
const aliases = (action: Selection): string[] => [action.label, action.actionText, action.playerLine].filter((v): v is string => Boolean(v));
const key = (s: string) => s.normalize('NFKC').replace(/^[你我]\s*/, '').replace(/[\s\p{P}\p{S}]/gu, '');

/** Same sources and s02_04 visibility rule as MainGamePanel.scenarioEngineActionOptions. */
export function pilotOptionContext(save: SaveData, plan: LegacyNarrativePilotPlan, packet: LegacyNarratorPacket) {
  const settled = previewLegacyPilotSettlement(save, plan.selection).settled;
  const next = advanceScenarioRuntime(settled).saveData;
  const open = getWuyuanOpenWorldSelections(next);
  const events = getCurrentStoryEventActions(next).filter(a => !(open.length && a.eventId === 'lcq.event.s02_04'));
  const exploration = getCurrentStoryExplorationActions(next);
  const opportunities = getTrackedStoryOpportunityActions(next);
  const engine = [...events, ...exploration, ...opportunities, ...open, ...getBaihuGambleRefusalSelections(next)];
  const card = stepScene((next as any)?.世界?.状态?.剧本模组, events[0]?.eventId, events[0]?.actionId);
  // Authored actions are tried first, but engine aliases must not be duplicated as secondary buttons.
  const local = [...events, ...opportunities, ...exploration, ...open].flatMap(aliases);
  const location = card?.sceneLocation || packet.location;
  local.push(...(location ? [`留意${location}周围的动静`, `仔细观察${location}近处的环境`] : []),
    '检查随身物品', '留意自己的身体状况', '整理眼下已经知道的线索', '观察脚下的地面');
  return { engine: engine.flatMap(aliases), local };
}

export function selectPilotOptions(model: unknown, local: string[], engine: string[], sanitize: (options: unknown) => string[]) {
  const { min, max } = pilotOptionLimits();
  const unique = (values: unknown) => {
    const seen = new Set(engine.map(key));
    return sanitize(values).filter(option => { const k = key(option); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
  };
  const modelOptions = unique(model);
  if (modelOptions.length >= min) return { options: modelOptions, source: 'model' as const };
  return { options: unique([...modelOptions, ...local]), source: 'local_fallback' as const };
}

export function tagPilotOptions<T extends object>(response: T, source: PilotOptionsSource): T {
  sources.set(response, source);
  return response;
}

/** Observe the published history, including existing downstream clearing; never change it. */
export function pilotOptionsDiagnostic(save: SaveData | null, response: object | null | undefined, selection?: { eventId?: string; actionId?: string } | null) {
  const history = (save as any)?.系统?.历史?.叙事;
  const count = history?.at(-1)?.actionOptions?.length ?? 0;
  let source: PilotOptionsSource = response ? sources.get(response) ?? 'model' : 'local_fallback';
  if (!count) {
    const runtime = (save as any)?.世界?.状态?.剧本模组;
    const card = stepScene(runtime, selection?.eventId, selection?.actionId);
    if (runtime?.gameOver) source = 'cleared_ending';
    else if (getActiveKeyBeatCard(save)) source = 'cleared_keybeat';
    else if ((!card?.fixedFacts?.length || card.forceFixed) && (fixedBeatNarrative(selection?.eventId, selection?.actionId) || card?.forceFixed)) source = 'cleared_fixedbeat';
    else if (source !== 'disabled') source = 'cleared_contract';
  }
  return { actionOptionsCount: count, optionsSource: source, legacyPilot: Boolean(response && sources.has(response)) };
}
