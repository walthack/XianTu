/**
 * AIBidirectionalSystem
 * 核心功能：
 * 1. 接收用户输入，构建Prompt，调用AI生成响应
 * 2. 解析AI响应，执行AI返回的指令
 * 3. 更新并返回游戏状态
 */
import { set, get, unset, cloneDeep } from 'lodash';
import { getTavernHelper, isTavernEnv } from '@/utils/tavern';
import { createAffinityCommandGate } from '@/modules/scenarioMods/affinityLadder';
import { affinityCapFor } from '@/modules/scenarioMods/affinityCaps';
import { focusedNpcNamesFromState } from '@/modules/scenarioMods/presence';
import { toast } from './toast';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useCharacterStore } from '@/stores/characterStore'; // 导入角色商店
import { useUIStore } from '@/stores/uiStore';
import type { GM_Response, TavernCommand } from '@/types/AIGameMaster';
import type { CharacterProfile, StateChangeLog, SaveData, GameTime, StateChange, GameMessage, StatusEffect, EventSystem, GameEvent } from '@/types/game';
import { updateMasteredSkills } from './masteredSkillsCalculator';
import { assembleSystemPrompt } from './prompts/promptAssembler';
import { getPrompt, isPromptEnabled } from '@/services/defaultPrompts';
import { normalizeGameTime } from './time';
import { updateStatusEffects } from './statusEffectManager';
import { sanitizeAITextForDisplay } from '@/utils/textSanitizer';
import { INITIAL_GENERATION_POLICY, initialGenerationRequestLimits, shouldRetryInitialNarrative } from '@/utils/initialGenerationPolicy';
import { validateAndRepairNpcProfile } from '@/utils/dataValidation';
import { stripNsfwContent } from '@/utils/prompts/definitions/dataDefinitions';
import { isSaveDataV3, migrateSaveDataToLatest } from './saveMigration';
import { parseJsonSmart, stripModelThinking } from '@/utils/jsonExtract';
import { composeShortTermMemoryEntry, sanitizePersistedMemoryEntry } from '@/utils/memorySanitizer';
import { filterActionOptionsByPov } from '@/utils/actionOptionsPovGuard';
import type { APIUsageType } from '@/stores/apiManagementStore';
import { buildScenarioCanonPrompt } from '@/modules/scenarioMods/canonGuard';
import {
  acknowledgeStageEntryPresentation,
  acknowledgeStoryBeatHandoff,
  advanceScenarioRuntime,
  clarifyUnobtainedSilkPouchNarrative,
  recordStoryEventStructuredAction,
  recordStoryOpportunityPlayerAction,
  recordStoryOpportunityStructuredAction,
  STEERING_DIVERGENCE_COOLDOWN,
  type ScenarioEventActionSelection,
  type ScenarioOpportunityActionSelection,
} from '@/modules/scenarioMods/runtime';
import {
  FAST_NARRATIVE_DEADLINE_MS,
  FAST_NARRATIVE_GENERATE_OPTIONS,
  armFastNarrativeNeedDice,
  buildFastNarrativeActionOptions,
  finalizeFastNarrativeText,
  isFastNarrativeDemoScope,
  isFastNarrativeHoldResponse,
  routeFastNarrativeDemo,
  splitFastNarrativeOutput,
  wrapFastNarrativeGmResponse,
  wrapFastNarrativeHoldResponse,
} from '@/modules/scenarioMods/fastNarrativeDemo';
import {
  LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS,
  areLegacyPilotPromptsEnabled,
  planLegacyNarrativePilot,
} from '@/modules/scenarioMods/legacyNarrativePilot';
import {
  buildLegacyNarratorPrompt,
  isLegacyPilotPromptWithinBudget,
  LEGACY_NARRATOR_PROMPT_BUDGET_BYTES,
} from '@/modules/scenarioMods/legacyNarratorPacket';
import { acceptLegacyPilotScene } from '@/modules/scenarioMods/legacyPilotScenes';
import { generateLegacyPilotNarrative } from '@/modules/scenarioMods/legacyNarrativePilotGenerate';
import { composeLegacyNarrativeFromPlan } from '@/modules/scenarioMods/legacyRenderPlan';
import {
  beginForegroundAiTurn,
  endForegroundAiTurn,
  scheduleBackgroundMemoryWork,
  commitMemorySummaryIndex,
} from '@/utils/backgroundMemoryWork';
import { resolveLegacyForegroundRecall } from '@/utils/legacyForegroundRecall';
import {
  beginTurnTelemetry,
  endTurnTelemetry,
  noteAuxWaitBeforeUnlock,
  noteBufferedFullResponse,
  notePromptBytes,
  noteRecallWait,
  noteTurnPath,
} from '@/utils/turnTelemetry';
import {
  ensureWuyuanOpenWorldSlice,
  settleWuyuanOpenWorldSelection,
  previewWuyuanOpenWorldNarrative,
  type WuyuanOpenWorldSelection,
} from '@/modules/scenarioMods/wuyuanOpenWorldSlice';
import { applyMilestoneRewards } from '@/modules/scenarioMods/milestoneRewards';
import { buildScenarioStoryPrompt, createScenarioPromptState } from '@/modules/scenarioMods/storyContext';
import { stripNarrativeEntityTypeConflicts, stripNarrativeUnintroducedCharacters } from '@/modules/scenarioMods/characterResolver';
import { buildActionGatePrompt, getNarrativeTurn, pruneExpiredActionGates } from '@/utils/actionGate';
import {
  extractLegacyJudgementMarkers,
  stripLegacyJudgementMarkers,
} from '@/utils/judgementRules';
import {
  formatVerifiedJudgementReceiptForPrompt,
  persistPendingJudgement,
  verifyResolvedJudgementReceipt,
  type JudgementResolution,
} from '@/utils/judgementEngine';
import { reconcileNarrativeState } from '@/utils/narrativeStateReconciler';
import { runProgressAudit, shouldRunAudit } from '@/services/progressAuditService';
import { runDeterministicBijiReconcile, runDeterministicHighlightReconcile, runDeterministicXieyiReconcile, runEventReconcile, shouldRunReconcile, evidenceLikely, buildChainCandidates } from '@/services/eventReconcileService';
import { validateModelCommandPipeline } from '@/utils/modelCommandPipeline';
import { recoverUnmarkedPlayerZeroHealth } from '@/utils/playerVitalGuard';
import { runBoundedAuxiliaryTask } from '@/utils/boundedAuxiliaryTask';
import {
  queueIsolatedMemorySummary,
  remainingMemoriesAfterSummary,
  shouldQueueAutomaticMemorySummary,
} from '@/utils/backgroundMemorySummary';
import { mergeDeferredReconcileResult } from '@/modules/scenarioMods/deferredReconcileMerge';
import {
  detectNarratedInventoryGainEntries,
  detectNarratedInventoryPossessions,
  getInventoryItemIdentityKey,
  getMissingNarratedInventoryGains,
  normalizeNarratedItemName,
} from '@/utils/narratedInventory';
import { buildNarrativePromptState } from '@/utils/narrativePromptState';
import {
  decideNarrativePerformanceAttempt,
  hasHardNarrativeViolation,
  performanceRetryInstruction,
  requiresNarrativeBuffering,
  safeNarrativeFallback,
  safeNarrativeFallbackForContext,
  validateNarrativePerformance,
} from '@/modules/scenarioMods/narrativePerformanceGuard';

type PlainObject = Record<string, unknown>;

// 正文与确定性状态是主事务；二次 LLM 只能占用有限的尾延迟。
// 超时任务运行在隔离副本上，晚到结果不会写回当前存档。
const AUXILIARY_LLM_WAIT_MS = 15000;

function isPlainObject(value: unknown): value is PlainObject {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 本存档已经接触的正典人物；全局 registry/RAG 中的未来人物不在此列。 */
function introducedScenarioCharacterNames(saveData: SaveData): Set<string> {
  const names = new Set<string>();
  const runtime = (saveData as any)?.世界?.状态?.剧本模组;
  if (!runtime || typeof runtime !== 'object') return names;
  const characters = Array.isArray(runtime.canon?.characters) ? runtime.canon.characters : [];
  const byId = new Map<string, string>(characters
    .filter((character: any) => typeof character?.id === 'string' && typeof character?.name === 'string')
    .map((character: any) => [character.id, character.name] as [string, string]));
  const eventIds = new Set([...(runtime.activeEventIds || []), ...(runtime.completedEventIds || [])]);
  for (const event of Array.isArray(runtime.events) ? runtime.events : []) {
    if (!eventIds.has(event.id)) continue;
    for (const id of event.relatedCharacterIds || []) {
      const name = byId.get(id);
      if (name) names.add(name);
    }
  }
  for (const id of runtime.opening?.featuredCharacterIds || []) {
    const name = byId.get(id);
    if (name) names.add(name);
  }
  const player = byId.get(runtime.opening?.playerCharacterId);
  if (player) names.add(player);
  const relations = (saveData as any)?.社交?.关系;
  if (relations && typeof relations === 'object') {
    for (const [key, value] of Object.entries(relations)) {
      names.add(String((value as any)?.名字 || key));
    }
  }
  return names;
}

function mergePlainObjectsReplacingArrays(base: PlainObject, patch: PlainObject): PlainObject {
  const merged = cloneDeep(base) as PlainObject;
  applyPlainObjectPatchReplacingArrays(merged, patch);
  return merged;
}

function applyPlainObjectPatchReplacingArrays(target: PlainObject, patch: PlainObject): void {
  for (const [key, patchValue] of Object.entries(patch)) {
    const targetValue = (target as any)[key];
    if (isPlainObject(targetValue) && isPlainObject(patchValue)) {
      applyPlainObjectPatchReplacingArrays(targetValue, patchValue);
      continue;
    }
    // NOTE: Unlike lodash.merge, arrays are replaced (not merged by index),
    // so `{a:[1,2]} + {a:[]}` correctly becomes `{a:[]}`.
    (target as any)[key] = cloneDeep(patchValue);
  }
}

export interface ProcessOptions {
  onStreamChunk?: (chunk: string) => void;
  onStreamComplete?: () => void;
  onProgressUpdate?: (progress: string) => void;
  onStateChange?: (newState: PlainObject) => void;
  useStreaming?: boolean;
  generateMode?: 'generate' | 'generateRaw'; // 生成模式：generate（标准）或 generateRaw（纯净）
  splitResponseGeneration?: boolean;
  shouldAbort?: () => boolean;
  /** 由本地机会合同生成的推进动作；成功响应后才消费。 */
  opportunityAction?: ScenarioOpportunityActionSelection;
  /** 由非机会卡事件合同生成的本地判定动作；成功响应后才消费。 */
  eventAction?: ScenarioEventActionSelection;
  /** 结构化事件动作的来源。单幕试验默认只接受点击；隔离清羽 Demo 也接受已映射到 fresh 动作的自然句。 */
  eventActionProvenance?: 'selected' | 'resolved_text';
  /** 五原局部开放世界的显式移动／消息／问题合同；成功响应后才消费。 */
  openWorldAction?: WuyuanOpenWorldSelection;
  /** 本轮已经本地落账的判定回执只读副本；Legacy 与实验快路共用，须经存档核验。 */
  judgementResolution?: JudgementResolution;
}

/**
 * 记忆总结选项
 */
export interface MemorySummaryOptions {
  /**
   * 是否使用Raw模式（默认true）
   *
   * **Raw模式 vs 标准模式：**
   * - ✅ Raw模式（推荐用于总结）：
   *   - 只发送总结提示词，不包含角色卡、世界观等预设
   *   - 不受其他提示词干扰，更符合真实内容
   *   - 适用场景：记忆总结、NPC总结、纯文本提取
   *
   * - ⚠️ 标准模式（容易污染）：
   *   - 包含完整的系统提示词（角色卡、世界观、规则等）
   *   - 容易受到预设提示词污染，可能偏离原始内容
   *   - 适用场景：正常游戏对话、需要遵守世界观的生成
   */
  useRawMode?: boolean;

  /**
   * 是否使用流式传输（默认false）
   *
   * **流式 vs 非流式：**
   * - ⚡ 流式传输（更快）：
   *   - 实时显示生成过程，用户体验更好
   *   - 响应更快，无需等待完整生成
   *   - 适用场景：长文本生成、需要实时反馈的场景
   *
   * - 🛡️ 非流式传输（更稳定，推荐用于总结）：
   *   - 一次性返回完整结果，更稳定可靠
   *   - 避免流式传输可能的中断问题
   *   - 适用场景：后台任务、自动总结、批量处理
   */
  useStreaming?: boolean;

  /**
   * 后台自动总结静默；记忆中心手动总结保持 toast/反馈。
   * 未传时视为手动，默认 false。
   */
  silent?: boolean;
}

class AIBidirectionalSystemClass {
  private static instance: AIBidirectionalSystemClass | null = null;
  private stateHistory: StateChangeLog[] = [];
  private isSummarizing = false; // 添加一个锁，防止并发总结

  private compareGameTime(a: GameTime, b: GameTime): number {
    const fields: Array<keyof GameTime> = ['年', '月', '日', '小时', '分钟'];
    for (const f of fields) {
      const av = Number(a?.[f] ?? 0);
      const bv = Number(b?.[f] ?? 0);
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  private addYears(time: GameTime, years: number): GameTime {
    return { ...time, 年: Number(time.年 ?? 0) + years };
  }

  private randomIntInclusive(min: number, max: number): number {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  private getFocusedNpcNames(stateForAI: any): string[] {
    return focusedNpcNamesFromState(stateForAI);
  }

  private buildFocusedNpcPrompt(stateForAI: any): string {
    const focusedNames = this.getFocusedNpcNames(stateForAI);
    const list = focusedNames.length > 0 ? focusedNames.map(name => `- ${name}`).join('\n') : '- （无）';
    return [
      '# 🔎 实时关注NPC（必须更新）',
      '请先检查“实时关注”名单；若名单非空，本回合必须推演并更新其💭当前状态（实时），即使不在玩家身边：',
      list,
      '要求：',
      '- 必须更新 社交.关系.[NPC名].当前内心想法',
      '- 如有变化，同步更新 当前位置 / 当前外貌状态 / 属性 等',
      '- 所有名单必须全部覆盖，可合并或分多条 tavern_commands 更新'
    ].join('\n');
  }

  private normalizeEventConfig(config: any): { enabled: boolean; minYears: number; maxYears: number; customPrompt: string } {
    const enabled = config?.启用随机事件 !== false;
    const minYears = Math.max(1, Number(config?.最小间隔年 ?? 1));
    const maxYears = Math.max(minYears, Number(config?.最大间隔年 ?? 10));
    const customPrompt = String(config?.事件提示词 ?? '').trim();
    return { enabled, minYears, maxYears, customPrompt };
  }

  private scheduleNextEventTime(now: GameTime, minYears: number, maxYears: number): GameTime {
    const years = this.randomIntInclusive(minYears, maxYears);
    return this.addYears(now, years);
  }

  private async maybeTriggerScheduledWorldEvent(args: {
    v3: any;
    stateForAI: any;
    shortTermMemoryForPrompt: string[];
  }): Promise<void> {
    const { v3, stateForAI, shortTermMemoryForPrompt } = args;

    const now: GameTime | null = v3?.元数据?.时间 ?? null;
    if (!now) return;

    const eventSystem = (v3?.社交?.事件 ?? null) as EventSystem | null;
    if (!eventSystem || typeof eventSystem !== 'object') return;

    const { enabled, minYears, maxYears, customPrompt } = this.normalizeEventConfig((eventSystem as any).配置);
    if (!enabled) return;

    const next = (eventSystem as any).下次事件时间 as GameTime | null;
    if (!next) {
      const scheduled = this.scheduleNextEventTime(now, minYears, maxYears);
      (eventSystem as any).下次事件时间 = scheduled;
      if (stateForAI?.社交?.事件) stateForAI.社交.事件.下次事件时间 = scheduled;
      const gameStateStore = useGameStateStore();
      if ((gameStateStore as any).eventSystem) {
        (gameStateStore as any).eventSystem.下次事件时间 = scheduled;
      }
      return;
    }

    if (this.compareGameTime(now, next) < 0) return;

    try {
      const { generateWorldEvent, generateSpecialNpcEvent } = await import('@/utils/generators/eventGenerators');
      const gameStateStore = useGameStateStore();

      // 酒馆端专属：随机触发“特殊NPC登场”事件（不会在网页端触发）
      let npcToAdd: any | null = null;
      let generated: { event: GameEvent; prompt_addition: string; npcProfile?: unknown } | null =
        isTavernEnv() && Math.random() < 0.2
          ? await generateSpecialNpcEvent({ saveData: v3 as SaveData, now, customPrompt })
          : null;

      if (generated && (generated as any).npcProfile) {
        npcToAdd = (generated as any).npcProfile;
      } else {
        generated = await generateWorldEvent({ saveData: v3 as SaveData, now, customPrompt });
      }
      const scheduled = this.scheduleNextEventTime(now, minYears, maxYears);

      if (!generated) {
        (eventSystem as any).下次事件时间 = scheduled;
        if (stateForAI?.社交?.事件) stateForAI.社交.事件.下次事件时间 = scheduled;
        if ((gameStateStore as any).eventSystem) {
          (gameStateStore as any).eventSystem.下次事件时间 = scheduled;
        }
        return;
      }

      // 若本次事件引入了特殊NPC，则写入人物关系（同时更新 stateForAI 与 store，保证提示词/存档同步）
      if (npcToAdd && npcToAdd.名字) {
        // v3 写入（用于后续提示词 stateForAI 继续携带）
        if (!v3.社交) v3.社交 = {};
        if (!v3.社交.关系 || typeof v3.社交.关系 !== 'object') v3.社交.关系 = {};
        if (!v3.社交.关系[npcToAdd.名字]) {
          v3.社交.关系[npcToAdd.名字] = npcToAdd;
        }

        if (stateForAI?.社交) {
          if (!stateForAI.社交.关系 || typeof stateForAI.社交.关系 !== 'object') stateForAI.社交.关系 = {};
          if (!stateForAI.社交.关系[npcToAdd.名字]) {
            stateForAI.社交.关系[npcToAdd.名字] = npcToAdd;
          }
        }

        const current = (gameStateStore.relationships && typeof gameStateStore.relationships === 'object')
          ? gameStateStore.relationships
          : {};
        if (!current[npcToAdd.名字]) {
          gameStateStore.updateState('relationships', { ...current, [npcToAdd.名字]: npcToAdd });
        }
      }

      const event: GameEvent = { ...generated.event, 发生时间: now, 事件来源: generated.event.事件来源 || '随机' };

      if (!Array.isArray((eventSystem as any).事件记录)) (eventSystem as any).事件记录 = [];
      (eventSystem as any).事件记录.push(event);
      (eventSystem as any).下次事件时间 = scheduled;

      if (stateForAI?.社交?.事件) {
        if (!Array.isArray(stateForAI.社交.事件.事件记录)) stateForAI.社交.事件.事件记录 = [];
        stateForAI.社交.事件.事件记录.push(event);
        stateForAI.社交.事件.下次事件时间 = scheduled;
      }

      if ((gameStateStore as any).eventSystem) {
        const storeEventSystem = (gameStateStore as any).eventSystem as any;
        if (!Array.isArray(storeEventSystem.事件记录)) storeEventSystem.事件记录 = [];
        storeEventSystem.事件记录.push(event);
        storeEventSystem.下次事件时间 = scheduled;
      }

      // 把事件文本写入“短期记忆”，并作为本回合注入文本，保证主游戏流程可承接“刚刚发生”的事件
      const memoryEntry = `${this._formatGameTime(now)}【世界事件】${generated.prompt_addition}`;
      shortTermMemoryForPrompt.push(memoryEntry);

      // 同步落盘：将事件快照写入存档短期记忆（否则下回合不会带上这段“刚刚发生”的承接文本）
      if (!v3.社交) v3.社交 = {};
      if (!v3.社交.记忆 || typeof v3.社交.记忆 !== 'object') v3.社交.记忆 = { 短期记忆: [], 中期记忆: [], 长期记忆: [] };
      if (!Array.isArray(v3.社交.记忆.短期记忆)) v3.社交.记忆.短期记忆 = [];
      v3.社交.记忆.短期记忆.push(memoryEntry);

      if (gameStateStore.memory && typeof gameStateStore.memory === 'object') {
        const nextMemory = cloneDeep(gameStateStore.memory) as any;
        if (!Array.isArray(nextMemory.短期记忆)) nextMemory.短期记忆 = [];
        nextMemory.短期记忆.push(memoryEntry);
        gameStateStore.updateState('memory', nextMemory);
      }

      // 酒馆端：若触发了“特殊NPC登场”，立刻存档一次，确保人物关系与事件快照不丢失
      if (npcToAdd && npcToAdd.名字 && isTavernEnv()) {
        try {
          const characterStore = useCharacterStore();
          await characterStore.saveCurrentGame();
        } catch (e) {
          console.warn('[世界事件] 特殊NPC触发后自动存档失败:', e);
        }
      }
    } catch (e) {
      console.warn('[世界事件] 调度/生成失败:', e);
    }
  }

  private extractNarrativeText(raw: string): string {
    // 🔥 移除思维链标签（兜底保护）
    // 支持多种变体：<thinking>, <antThinking>, <ant-thinking>, <reasoning>, <thought> 等
    const cleaned = stripModelThinking(String(raw || ''));

    if (!cleaned) return '';

    let result = cleaned;
    // 如果是JSON格式，提取text字段
    if (cleaned.startsWith('{') || cleaned.includes('```')) {
      try {
        const parsed = this.parseAIResponse(cleaned);
        result = parsed?.text?.trim() || '';
      } catch {
        // JSON解析失败，尝试提取代码块
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch?.[1]) {
          try {
            const obj = JSON.parse(codeBlockMatch[1].trim()) as Record<string, unknown>;
            result = String(obj.text || obj.叙事文本 || obj.narrative || '').trim();
          } catch {
            // 代码块内容本身就是文本
            result = codeBlockMatch[1].trim();
          }
        }
      }
    }

    return result;
  }

  private sanitizeActionOptionsForDisplay(options: unknown): string[] {
    if (!Array.isArray(options)) return [];
    const cleaned = options
      .filter((opt) => typeof opt === 'string')
      .map((opt) => sanitizeAITextForDisplay(opt).trim())
      .filter((opt) => opt.length > 0);
    // #14:选项含主角名=视角漂移到同伴 NPC 的确定性信号,拒收
    try {
      const playerName = String((useGameStateStore() as any)?.character?.名字 || '').trim();
      const { kept, dropped } = filterActionOptionsByPov(cleaned, playerName);
      if (dropped.length) console.warn('[行动选项POV守卫] 拒收含主角名的选项:', dropped);
      return kept;
    } catch {
      return cleaned;
    }
  }

  private readBoolFlag(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (value && typeof value === 'object' && 'value' in (value as any)) {
      return (value as any).value === true;
    }
    return defaultValue;
  }

  private isActionOptionsEnabled(uiStore: unknown): boolean {
    // Pinia store fields are usually unwrapped, but keep a safe fallback for non-reactive access.
    const raw = (uiStore as any)?.enableActionOptions;
    return this.readBoolFlag(raw, true);
  }

  private getCommandProtectionMode(uiStore: unknown): 'strict' | 'skeleton' {
    const raw = (uiStore as any)?.commandProtectionMode;
    const value = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' && 'value' in (raw as any) ? (raw as any).value : undefined);
    return value === 'skeleton' ? 'skeleton' : 'strict';
  }

  /**
   * 文本优化：调用AI对生成的文本进行润色
   * @param text 原始文本
   * @param onProgressUpdate 进度回调
   * @returns 优化后的文本，失败时返回原文本
   */
  private async optimizeText(
    text: string,
    onProgressUpdate?: (progress: string) => void
  ): Promise<string> {
    // 检查功能是否启用
    const { useAPIManagementStore } = await import('@/stores/apiManagementStore');
    const apiStore = useAPIManagementStore();

    if (!apiStore.isFunctionEnabled('text_optimization')) {
      return text;
    }

    // 检查是否有可用的API配置
    const apiConfig = apiStore.getAPIForType('text_optimization');
    if (!apiConfig) {
      console.warn('[文本优化] 未配置text_optimization API，跳过优化');
      return text;
    }

    onProgressUpdate?.('正在优化文本…');

    try {
      const { aiService } = await import('@/services/aiService');
      const textOptPrompt = await getPrompt('textOptimization');
      const lengthGuard = [
        '# 长度约束（最高优先级）',
        `原文长度约${text.length}字。`,
        '- 只润色，不扩写；优化后不得长于原文。',
        '- 不新增段落、场景、动作、对话、心理活动或背景铺陈。',
        '- 如果原文已经顺畅，直接原样返回。'
      ].join('\n');

      const optimizedText = await aiService.generateRaw({
        ordered_prompts: [
          { role: 'system', content: `${textOptPrompt}\n\n---\n\n${lengthGuard}` },
          { role: 'user', content: `请优化以下文本：\n\n${text}` }
        ],
        should_stream: false,
        generation_id: `text_optimization_${Date.now()}`,
        usageType: 'text_optimization',
      });

      const result = String(optimizedText).trim();
      if (result && result.length > 0) {
        console.log('[文本优化] 优化完成，原长度:', text.length, '新长度:', result.length);
        return result;
      }

      console.warn('[文本优化] 优化结果为空，使用原文本');
      return text;
    } catch (error) {
      console.error('[文本优化] 优化失败:', error);
      return text;
    }
  }

  private constructor() {}

  public static getInstance(): AIBidirectionalSystemClass {
    if (!this.instance) this.instance = new AIBidirectionalSystemClass();
    return this.instance;
  }

  private async tryFastNarrativeDemo(
    saveData: SaveData,
    userMessage: string,
    options: (ProcessOptions & { generation_id?: string }) | undefined,
    generationId: string,
    shouldAbort: () => boolean,
  ): Promise<GM_Response | null> {
    if (shouldAbort()) {
      throw new Error('请求已被取消');
    }
    const routeInput = {
      saveData,
      playerAction: userMessage,
      judgementResolution: options?.judgementResolution,
      aborted: false,
      eventAction: options?.eventAction,
      opportunityAction: options?.opportunityAction,
      openWorldAction: options?.openWorldAction,
    };
    if (!isFastNarrativeDemoScope(routeInput)) return null;
    const route = routeFastNarrativeDemo(routeInput);
    if (route.outcome === 'legacy') return null;
    if (route.outcome === 'need_dice') {
      if (route.proposal) {
        try {
          persistPendingJudgement(saveData, route.proposal);
        } catch {
          armFastNarrativeNeedDice(saveData, route.proposal.actionText);
        }
      } else {
        armFastNarrativeNeedDice(saveData, userMessage);
      }
      return wrapFastNarrativeHoldResponse('need_dice');
    }
    if (route.outcome === 'clarify') {
      return wrapFastNarrativeHoldResponse('clarify', route.text);
    }
    if (route.outcome !== 'fast') {
      return wrapFastNarrativeGmResponse(route.text);
    }
    const plan = route.plan;
    options?.onProgressUpdate?.('实验快路：写现场正文…');
    const { aiService } = await import('@/services/aiService');
    let raw = '';
    let timedOut = false;
    let userCancelled = false;
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FAST_NARRATIVE_DEADLINE_MS);
    const cancelWatcher = setInterval(() => {
      if (!shouldAbort()) return;
      userCancelled = true;
      controller.abort();
    }, 100);
    try {
      raw = await aiService.generate({
        ...FAST_NARRATIVE_GENERATE_OPTIONS,
        injects: [{
          content: plan.systemPrompt,
          role: 'system',
          depth: 4,
          position: 'in_chat',
        }],
        user_input: plan.userPrompt,
        generation_id: generationId,
        signal: controller.signal,
      });
    } catch (error) {
      if (userCancelled || shouldAbort()) {
        throw new Error('请求已被取消');
      }
      raw = '';
    } finally {
      clearTimeout(deadline);
      clearInterval(cancelWatcher);
    }
    if (userCancelled || shouldAbort()) {
      throw new Error('请求已被取消');
    }
    if (timedOut) {
      options?.onProgressUpdate?.('实验快路：超时，使用本地收束文本。');
    }
    const split = splitFastNarrativeOutput(raw);
    const text = finalizeFastNarrativeText(split.body, plan.packet, plan.forbiddenNames);
    const actionOptions = this.isActionOptionsEnabled(useUIStore())
      ? buildFastNarrativeActionOptions(plan.packet, text, split.options, plan.forbiddenNames)
      : [];
    return wrapFastNarrativeGmResponse(text, actionOptions);
  }

  private async tryLegacyNarrativePilot(
    saveData: SaveData,
    options: ProcessOptions | undefined,
    generationId: string,
    shouldAbort: () => boolean,
    userMessage?: string,
  ): Promise<GM_Response | null> {
    const plan = planLegacyNarrativePilot({
      saveData,
      eventAction: options?.eventAction,
      eventActionProvenance: options?.eventActionProvenance,
      playerActionText: userMessage,
    });
    if (!plan) return null;
    if (!(await areLegacyPilotPromptsEnabled(isPromptEnabled))) {
      console.warn('[Legacy单幕试验] 必要提示词已禁用，回落普通 Legacy');
      return null;
    }
    if (options?.opportunityAction || options?.judgementResolution) return null;
    if (options?.openWorldAction && !options?.eventAction) return null;
    if (shouldAbort()) throw new Error('请求已被取消');

    options?.onProgressUpdate?.('Legacy 单幕试验：生成纯正文…');
    const recallStarted = Date.now();
    const compiled = await buildLegacyNarratorPrompt(saveData, plan);
    if (!compiled.settlementAttempted) {
      console.warn('[Legacy单幕试验] 预结算未成立，回落普通 Legacy', plan.selection.eventId);
      return null;
    }
    if (!acceptLegacyPilotScene(compiled.packet)) {
      console.warn('[Legacy单幕试验] 场景合同不完整，改用本地句库，不回落普通 Legacy', {
        eventId: compiled.packet.eventId,
        present: compiled.packet.present,
        location: compiled.packet.location,
        receipts: compiled.packet.receipts,
      });
      const text = composeLegacyNarrativeFromPlan(compiled.packet);
      if (!text) return null;
      return {
        text,
        mid_term_memory: '',
        tavern_commands: [],
        action_options: [],
      };
    }
    if (!isLegacyPilotPromptWithinBudget(compiled)) {
      console.warn('[Legacy单幕试验] 总输入超过预算，回落普通 Legacy', {
        promptBytes: compiled.promptBytes,
        packetBytes: compiled.packetBytes,
        promptBudgetBytes: LEGACY_NARRATOR_PROMPT_BUDGET_BYTES,
        managedPromptOverrides: compiled.managedPromptOverrides,
      });
      return null;
    }
    noteRecallWait(Date.now() - recallStarted);
    notePromptBytes(compiled.promptBytes);
    const startedAt = Date.now();
    const { aiService } = await import('@/services/aiService');
    const maxRetries = aiService.getConfig().maxRetries ?? 1;
    noteBufferedFullResponse(true);
    const finished = await generateLegacyPilotNarrative({
      playerLine: plan.playerLine,
      storyPrompt: compiled.storyPrompt,
      packet: compiled.packet,
      maxRetries,
      useStreaming: false,
      generationId: `${generationId}_legacy_narrative_pilot`,
      shouldAbort,
      generate: ({ generationId: attemptId }) => aiService.generate({
        ...LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS,
        requestMaxRetries: 0,
        injects: [{
          content: compiled.systemPrompt,
          role: 'system',
          depth: 4,
          position: 'in_chat',
        }],
        user_input: plan.playerLine,
        should_stream: false,
        generation_id: attemptId,
      }),
    });
    const text = finished.text;
    if (!text) throw new Error('Legacy 单幕试验返回空正文');
    if (shouldAbort()) throw new Error('请求已被取消');
    console.info(`[Legacy单幕试验] ${JSON.stringify({
      eventId: plan.selection.eventId,
      promptBytes: compiled.promptBytes,
      packetBytes: compiled.packetBytes,
      outputChars: text.length,
      elapsedMs: Date.now() - startedAt,
      usedLocalFallback: finished.usedFallback,
      attempts: finished.attempts,
      bufferedFullResponse: true,
      maxTokens: LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS.maxTokens,
      embeddingCalls: 0,
      modelCommands: 0,
    })}`);
    return {
      text,
      mid_term_memory: '',
      tavern_commands: [],
      action_options: [],
    };
  }

  /**
   * 处理玩家行动 - 简化版流程
   * 1. 调用AI生成响应
   * 2. 执行指令
   * 3. 返回结果
   */
  public async processPlayerAction(
    userMessage: string,
    character: CharacterProfile,
    options?: ProcessOptions & { generation_id?: string }
  ): Promise<GM_Response | null> {
    console.log('[AI双向系统] processPlayerAction 接收到的options:', {
      hasOnStreamChunk: !!options?.onStreamChunk,
      useStreaming: options?.useStreaming,
      splitResponseGeneration: options?.splitResponseGeneration
    });
    const gameStateStore = useGameStateStore();
    const tavernHelper = getTavernHelper();
    const uiStore = useUIStore();
    const actionOptionsEnabled = this.isActionOptionsEnabled(uiStore);
    const shouldAbort = () => options?.shouldAbort?.() ?? false;

    // 检查AI服务可用性（酒馆或自定义API）
    if (!tavernHelper) {
      const { aiService } = await import('@/services/aiService');
      const availability = aiService.checkAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }
    }

    // 生成唯一的generation_id，如果未提供
    const generationId = options?.generation_id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 1. 获取当前存档数据
    options?.onProgressUpdate?.('获取存档数据…');
    const saveData = gameStateStore.toSaveData();

    // 🔥 对话前创建快照（轻量级，不含叙事历史）
    if (saveData) {
      const characterStore = useCharacterStore();
      const active = characterStore.rootState.当前激活存档;
      if (active) {
        const { createSnapshot } = await import('@/utils/snapshotManager');
        createSnapshot(active.角色ID, active.存档槽位, saveData);
      }
    }

    if (!saveData) {
      throw new Error('无法获取存档数据，请确保角色已加载');
    }

    const trustedJudgementResolution = verifyResolvedJudgementReceipt(saveData, options?.judgementResolution);

    // 2. 准备AI上下文
    options?.onProgressUpdate?.('构建提示词并请求AI生成…');
    let gmResponse: GM_Response = { text: '', mid_term_memory: '', tavern_commands: [], action_options: [] };
    let usedLegacyNarrativePilot = false;
    // UI 会对占位响应发起一次结构化重试；失败响应本身必须是零副作用的。
    let generationFailed = false;
    beginTurnTelemetry('legacy');
    beginForegroundAiTurn();
    try {
    try {
      const fastNarrativeResponse = await this.tryFastNarrativeDemo(
        saveData,
        userMessage,
        options,
        generationId,
        shouldAbort,
      );
      if (fastNarrativeResponse) {
        noteTurnPath('fast');
        gmResponse = fastNarrativeResponse;
      }
      if (isFastNarrativeHoldResponse(fastNarrativeResponse)) {
        gameStateStore.loadFromSaveData(saveData);
        return fastNarrativeResponse;
      }
      if (!fastNarrativeResponse) {
      const legacyNarrativePilotResponse = await this.tryLegacyNarrativePilot(
        saveData,
        options,
        generationId,
        shouldAbort,
        userMessage,
      );
      if (legacyNarrativePilotResponse) {
        noteTurnPath('legacy_pilot');
        gmResponse = legacyNarrativePilotResponse;
        usedLegacyNarrativePilot = true;
      }
      if (!legacyNarrativePilotResponse) {
      const openWorldLocalText = options?.openWorldAction
        ? previewWuyuanOpenWorldNarrative(saveData, {
          openWorldAction: options.openWorldAction,
          eventAction: options.eventAction,
        })
        : '';
      if (openWorldLocalText) {
        noteTurnPath('open_world');
        gmResponse = {
          text: openWorldLocalText,
          mid_term_memory: '',
          tavern_commands: [],
          action_options: [],
        };
        usedLegacyNarrativePilot = true;
      }
      if (!openWorldLocalText) {
      const v3 = isSaveDataV3(saveData) ? (saveData as any) : migrateSaveDataToLatest(saveData).migrated;

      // 发送给 AI 的状态：严格使用 V3 五域结构（命令 key 也必须按此结构输出）
      const stateForAI = createScenarioPromptState(v3 as SaveData);
      if (stateForAI.社交?.记忆) {
        // 移除短期和隐式中期记忆，以优化AI上下文（短期记忆单独发送）
        delete stateForAI.社交.记忆.短期记忆;
        delete stateForAI.社交.记忆.隐式中期记忆;
      }
      // 移除叙事历史，避免与短期记忆重复/爆token
      if (stateForAI.系统?.历史?.叙事) {
        delete stateForAI.系统.历史.叙事;
      }

      const recallStarted = Date.now();
      const activeSave = useCharacterStore().rootState.当前激活存档;
      const {
        vectorMemorySection,
        narrativeRagSection,
        characterRagSection,
      } = await resolveLegacyForegroundRecall({
        userMessage,
        v3,
        stateForAI,
        saveSlot: activeSave?.角色ID && activeSave?.存档槽位
          ? `${activeSave.角色ID}_${activeSave.存档槽位}`
          : undefined,
      });
      noteRecallWait(Date.now() - recallStarted);

      // 保存短期记忆用于单独发送
      const shortTermMemory = v3?.社交?.记忆?.短期记忆 || [];

      // --- 角色核心状态速览 ---
      const attributes = stateForAI.角色?.属性;
      const character = stateForAI.角色?.身份;
      const formatTalentsForPrompt = (talents: any): string => {
        if (!talents) return '无';
        if (typeof talents === 'string') return talents;
        if (Array.isArray(talents)) {
          return talents.map(t => {
            if (typeof t === 'string') return t;
            if (typeof t === 'object' && t !== null) {
              return t.name || t.名称 || '';
            }
            return '';
          }).filter(Boolean).join(', ') || '无';
        }
        return '未知格式';
      };

      let coreStatusSummary = '# 角色核心状态速览\n';
      if (attributes) {
        coreStatusSummary += `\n- 生命: 气血${attributes.气血?.当前}/${attributes.气血?.上限} 灵气${attributes.灵气?.当前}/${attributes.灵气?.上限} 神识${attributes.神识?.当前}/${attributes.神识?.上限} 寿元${attributes.寿命?.当前}/${attributes.寿命?.上限}`;

        if (attributes.境界) {
          const realm = attributes.境界;
          coreStatusSummary += `\n- 境界: ${realm.名称}-${realm.阶段} (${realm.当前进度}/${realm.下一级所需})`;
        }

        if (attributes.声望) {
          coreStatusSummary += `\n- 声望: ${attributes.声望}`;
        }

        const effects = (stateForAI.角色?.效果 ?? []) as StatusEffect[];
        if (Array.isArray(effects) && effects.length > 0) {
          coreStatusSummary += `\n- 效果: ${effects
            .filter((e: StatusEffect) => e && typeof e === 'object' && e.状态名称)
            .map((e: StatusEffect) => e.状态名称)
            .join(', ')}`;
        }
      }
      if (character?.天赋) {
        coreStatusSummary += `\n- 天赋: ${formatTalentsForPrompt(character.天赋)}`;
      }

      coreStatusSummary += trustedJudgementResolution
        ? `\n\n# 本回合本地判定回执\n${formatVerifiedJudgementReceiptForPrompt(trustedJudgementResolution)}`
        : '\n\n# 本回合无本地判定回执\n禁止计算或输出骰点、判定值、难度与成败；新生风险必须停在玩家选择行动之前。';
      // --- 结束 ---

      // 🔥 构建精简版存档数据（用于叙事判定，减少token消耗）
      // 无论单步还是分步模式，都使用精简版存档
      const buildNarrativeState = (): Record<string, unknown> =>
        buildNarrativePromptState(stateForAI as SaveData);

      const stateJsonString = JSON.stringify(buildNarrativeState());

      const activePrompts: string[] = [];
      if (actionOptionsEnabled) {
        activePrompts.push('actionOptions');
      }

      // 🔥 世界事件规则始终注入（用于“世界会变化”的叙事一致性）
      activePrompts.push('eventSystem');

      // 🔥 固定随机事件：若已到触发时间，则先生成"刚刚发生"的事件并注入短期记忆
      const shortTermMemoryForPrompt = Array.isArray(shortTermMemory) ? [...shortTermMemory] : [];
      await this.maybeTriggerScheduledWorldEvent({ v3, stateForAI, shortTermMemoryForPrompt });

      const assembledPrompt = await assembleSystemPrompt(activePrompts, uiStore.actionOptionsPrompt, stateForAI);
      const scenarioCanonPrompt = buildScenarioCanonPrompt(stateForAI as SaveData);
      // 聚焦上下文：玩家输入+近期叙事，供剧本 prompt 做确定性名字召回（点名的在场角色档案也注入，防自由闲聊零档案）
      const focusContextText = [userMessage || '', (v3?.社交?.记忆?.短期记忆 || []).slice(-2).join('\n')]
        .filter(Boolean).join('\n');
      // 使用完整 runtime 做“下一拍”和玩家点名的非阻塞高光选择；输出到模型的状态 JSON
      // 仍由 buildNarrativePromptState 去重压缩，避免重复发送整份 canon/events。
      const scenarioStoryPrompt = buildScenarioStoryPrompt(v3 as SaveData, focusContextText);
      const actionGatePrompt = buildActionGatePrompt(saveData, getNarrativeTurn(saveData));

      const focusedNpcPrompt = this.buildFocusedNpcPrompt(stateForAI);

      const systemPrompt = `
${assembledPrompt}
${scenarioCanonPrompt ? `\n${scenarioCanonPrompt}\n` : ''}
${scenarioStoryPrompt ? `\n${scenarioStoryPrompt}\n` : ''}
${actionGatePrompt ? `\n${actionGatePrompt}\n` : ''}
${coreStatusSummary}
${vectorMemorySection ? `\n${vectorMemorySection}\n` : ''}
${narrativeRagSection ? `\n${narrativeRagSection}\n` : ''}
${characterRagSection ? `\n${characterRagSection}\n` : ''}
# 游戏状态
你正在修仙世界《仙途》中扮演GM。以下是当前完整游戏存档(JSON格式):
${stateJsonString}
`.trim();
      notePromptBytes(new TextEncoder().encode(systemPrompt).byteLength);

      const userActionForAI = (userMessage && userMessage.toString().trim()) || '继续当前活动';
      console.log('[AI双向系统] 用户输入 userMessage:', userMessage);
      console.log('[AI双向系统] 处理后 userActionForAI:', userActionForAI);

      // 构建注入消息列表
      const injects: Array<{ content: string; role: 'system' | 'assistant' | 'user'; depth: number; position: 'in_chat' | 'none' }> = [
        {
          content: systemPrompt,
          role: 'system',
          depth: 4,
          position: 'in_chat',
        }
      ];
      injects.push({
        content: focusedNpcPrompt,
        role: 'system',
        depth: 3,
        position: 'in_chat',
      });

      // 如果有短期记忆，作为独立的 assistant 消息发送
      const memoryToSend = (typeof shortTermMemoryForPrompt !== 'undefined' ? shortTermMemoryForPrompt : shortTermMemory) as string[];
      if (memoryToSend.length > 0) {
        injects.push({
          content: `# 【最近事件】\n${memoryToSend.join('\n')}。根据这刚刚发生的文本事件，合理生成下一次文本信息，要保证衔接流畅、不断层，符合上文的文本信息`,
          role: 'assistant',
          depth: 2,
          position: 'in_chat',
        });
      }

      // 🛡️ 添加assistant角色的占位消息（防止输入截断）
      // 原理：如果最后一条消息是assistant角色，某些模型不会审核输入
      injects.push({
        content: '</input>',
        role: 'assistant',
        depth: 0,
        position: 'in_chat',
      });

      // 🔥 [流式传输修复] 优先使用配置中的streaming设置
      const { aiService } = await import('@/services/aiService');
      const aiConfig = aiService.getConfig();
      const useStreaming = options?.useStreaming ?? aiConfig.streaming ?? true;
      // 含正典渲染硬门禁时只关闭 UI 分片回调；网络层仍可流式收齐，
      // 避免部分供应商的非流式请求显著变慢，同时保证首稿不会提前展示。
      const bufferedFullResponse = requiresNarrativeBuffering(scenarioStoryPrompt);
      noteBufferedFullResponse(bufferedFullResponse);
      const narrativeStreaming = useStreaming && !bufferedFullResponse;

      const isSplitEnabled = (() => {
        if (typeof options?.splitResponseGeneration === 'boolean') return options.splitResponseGeneration;
        try {
          const raw = localStorage.getItem('dad_game_settings');
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          return parsed?.splitResponseGeneration === true;
        } catch {
          return false;
        }
      })();

      let response = '';

      // 🔥 获取 API 管理配置，判断是否真正需要分步生成
      const { useAPIManagementStore } = await import('@/stores/apiManagementStore');
      const apiStore = useAPIManagementStore();
      const instructionApiConfig = apiStore.getAPIForType('instruction_generation');
      // 判断是否有独立的指令生成 API 配置
      const hasInstructionApi = instructionApiConfig && instructionApiConfig.id !== 'default';

      const finalUserInput = userActionForAI;

      // 🔥 分步生成：只根据开关按钮判断，同一个API也可以分步（减少单次输出压力）
      const shouldActuallySplit = isSplitEnabled;
      console.log(`[AI双向系统] shouldActuallySplit=${shouldActuallySplit}, isSplitEnabled=${isSplitEnabled}, tavernHelper=${!!tavernHelper}`);

      if (shouldActuallySplit) {
        // 🔥 分步生成第1步直接复用 buildNarrativeState（已在上方定义）
        const buildNarrativeStateForStep1 = (): string => JSON.stringify(buildNarrativeState());

        const buildSplitSystemPrompt = async (step: 1 | 2): Promise<string> => {
          const tavernEnv = !!tavernHelper;

          if (step === 1) {
            // 第1步：只输出正文纯文本，不需要JSON格式和指令相关的提示词
            const stepRules = (await getPrompt('splitGenerationStep1')).trim();
            const worldStandardsPrompt = await getPrompt('worldStandards');
            // 🔥 添加判定规则，确保战斗等场景使用判定系统
            const textFormatsPrompt = await getPrompt('textFormatRules');
            // 🔥 添加精简版存档数据，用于叙事判定（知道玩家装备、状态、NPC关系等）
            const narrativeStateJson = buildNarrativeStateForStep1();
            // 只给叙事相关的提示词，不给coreOutputRules/dataDefinitions等指令格式提示词
            return `
${stepRules}

---

# 判定系统（战斗/修炼/探索等场景必须使用）
${textFormatsPrompt}

---

# 世界观设定
${worldStandardsPrompt}
${scenarioCanonPrompt ? `\n---\n\n${scenarioCanonPrompt}\n` : ''}
${scenarioStoryPrompt ? `\n---\n\n${scenarioStoryPrompt}\n` : ''}
---

${coreStatusSummary}
${vectorMemorySection ? `\n${vectorMemorySection}\n` : ''}
${narrativeRagSection ? `\n${narrativeRagSection}\n` : ''}
# 当前游戏状态（用于叙事判定，无需输出指令）
${narrativeStateJson}
`.trim();
          }

          // 第2步：COT + 指令生成（合并），需要结构与业务规则
          // 注意：不要注入 coreOutputRules（它会要求输出 text，和第2步“禁止text”冲突）
          const [businessRulesPrompt, dataDefinitionsPrompt, textFormatsPrompt, worldStandardsPrompt] = await Promise.all([
            getPrompt('businessRules'),
            getPrompt('dataDefinitions'),
            getPrompt('textFormatRules'),
            getPrompt('worldStandards')
          ]);

          const sanitizedDataDefinitionsPrompt = tavernEnv ? dataDefinitionsPrompt : stripNsfwContent(dataDefinitionsPrompt);

          // 第2步：指令生成（CoT 自检清单已合并到 splitGenerationStep2 提示词中）
          const stepRules = (await getPrompt('splitGenerationStep2')).trim();
          const sections: string[] = [stepRules];

          const sanitizedBusinessRulesPrompt = tavernEnv ? businessRulesPrompt : stripNsfwContent(businessRulesPrompt);
          sections.push(sanitizedBusinessRulesPrompt, sanitizedDataDefinitionsPrompt, textFormatsPrompt, worldStandardsPrompt);

          if (actionOptionsEnabled) {
            const actionOptionsPrompt = await getPrompt('actionOptions');
            const customPromptSection = uiStore.actionOptionsPrompt
              ? `**用户自定义要求**：${uiStore.actionOptionsPrompt}\n\n请严格按以上要求生成行动选项。`
              : '（无特殊要求，按默认规则生成）';
            sections.push(actionOptionsPrompt.replace('{{CUSTOM_ACTION_PROMPT}}', customPromptSection));
          }

          sections.push(await getPrompt('eventSystemRules'));

          const assembled = sections.join('\n\n---\n\n');
          return `
${assembled}

${coreStatusSummary}
${focusedNpcPrompt ? `\n${focusedNpcPrompt}\n` : ''}
${scenarioCanonPrompt ? `\n${scenarioCanonPrompt}\n` : ''}
${scenarioStoryPrompt ? `\n${scenarioStoryPrompt}\n` : ''}

# 游戏状态（JSON）
${stateJsonString}
`.trim();
        };

        const buildSplitInjects = (systemPrompt: string, includeShortTermMemory: boolean = false) => {
          const splitInjects: Array<{ content: string; role: 'system' | 'assistant' | 'user'; depth: number; position: 'in_chat' | 'none' }> = [
            { content: systemPrompt, role: 'system', depth: 4, position: 'in_chat' }
          ];
          // 🔥 只在第1步注入短期记忆，避免重复
          const memoryToSend = (typeof shortTermMemoryForPrompt !== 'undefined' ? shortTermMemoryForPrompt : shortTermMemory) as string[];
          if (includeShortTermMemory && memoryToSend.length > 0) {
            splitInjects.push({
              content: `# 【最近事件】\n${memoryToSend.join('\n')}。根据这刚刚发生的文本事件，合理生成下一次文本信息，要保证衔接流畅、不断层，符合上文的文本信息`,
              role: 'assistant',
              depth: 2,
              position: 'in_chat',
            });
          }
          splitInjects.push({ content: '</input>', role: 'assistant', depth: 0, position: 'in_chat' });
          return splitInjects;
        };

        type SplitUsageType = 'main' | 'instruction_generation';
        const generateOnce = async (args: { user_input: string; should_stream: boolean; generation_id: string; injects: any; usageType?: SplitUsageType; onStreamChunk?: (chunk: string) => void; }) => {
          // 始终通过 aiService.generate 调用，让它根据 usageType 决定使用独立 API 还是酒馆代理
          return await aiService.generate({
            user_input: args.user_input,
            should_stream: args.should_stream,
            generation_id: args.generation_id,
            usageType: args.usageType || 'main',
            injects: args.injects,
            onStreamChunk: args.onStreamChunk,
          });
        };

        // ========== 第1步：正文生成（失败重试1次） ==========
        options?.onProgressUpdate?.('分步生成：第1步（正文）…');
        const systemPromptStep1 = await buildSplitSystemPrompt(1);
        notePromptBytes(new TextEncoder().encode(systemPromptStep1).byteLength);
        const injectsStep1 = buildSplitInjects(systemPromptStep1, true);
        let step1Text = '';
        let performanceCorrection = '';
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if (attempt > 1) options?.onProgressUpdate?.('分步生成：第1步重试…');
            const step1Raw = await generateOnce({
              user_input: performanceCorrection ? `${finalUserInput}\n\n${performanceCorrection}` : finalUserInput,
              should_stream: useStreaming,
              generation_id: `${generationId}_step1_${attempt}`,
              injects: injectsStep1 as any,
              usageType: 'main',
              onStreamChunk: narrativeStreaming ? options?.onStreamChunk : undefined,
            });
            const candidateText = this.extractNarrativeText(String(step1Raw));
            if (candidateText.trim().length > 0) {
              const performance = decideNarrativePerformanceAttempt(
                candidateText,
                finalUserInput,
                scenarioStoryPrompt,
                attempt,
                2,
              );
              step1Text = performance.narrative;
              if (performance.valid) break;
              performanceCorrection = performance.retryInstruction;
              if (performance.shouldRetry) {
                console.warn('[角色表演门禁] 分步正文退回重写：', performance.issues);
                continue;
              }
              console.warn('[角色表演门禁] 分步正文末次仍未达标，保留末稿降级继续：', performance.issues);
              break;
            }
            step1Text = '';
          } catch (e) {
            console.warn(`[分步生成] 第1步第${attempt}次失败:`, e);
          }
        }

        // ========== 第2步：指令生成（COT已合并到提示词中，可选开启） ==========
        options?.onProgressUpdate?.('分步生成：第2步（指令生成）…');
        const systemPromptStep2 = await buildSplitSystemPrompt(2);
        const injectsStep2 = buildSplitInjects(systemPromptStep2, false);

        const buildStep2UserInput = (missingItems: string[] = []) => `
【用户本次操作】
${finalUserInput}

【第1步正文】
${step1Text}

${missingItems.length > 0 ? `【上次结构化输出缺失】
第1步正文已经叙述玩家获得/收下了这些物品：${missingItems.join('、')}。
本次 tavern_commands 必须补上背包写入：set 角色.背包.物品.<稳定物品ID>，value 必须包含 {物品ID,名称,类型,品质:{quality,grade},数量,描述}。
` : ''}

请按"分步生成（第2步）"规则输出 JSON。
`.trim();

        // 🔥 第2步指令生成：可单独控制是否流式（部分API不支持流式）
        // - 总开关 useStreaming=false 时，强制关闭第2步流式
        const step2Streaming = !!apiStore.aiGenerationSettings?.splitStep2Streaming && useStreaming;
        const step2UsageType: APIUsageType = hasInstructionApi ? 'instruction_generation' : 'main';
        const step2ForceJson = aiService.isForceJsonEnabled(step2UsageType);
        let parsedStep2: GM_Response | null = null;
        let missingInventoryItemsForRetry: string[] = [];
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if (attempt > 1) options?.onProgressUpdate?.(`分步生成：第2步重试…`);
            const step2UserInput = buildStep2UserInput(missingInventoryItemsForRetry);
            const step2Response = await generateOnce({
              user_input: step2UserInput,
              should_stream: step2Streaming,
              generation_id: `${generationId}_step2_${attempt}`,
              injects: injectsStep2 as any,
              usageType: step2UsageType,
              onStreamChunk: undefined,
            });
            parsedStep2 = this.parseAIResponse(String(step2Response), step2ForceJson, actionOptionsEnabled);
            missingInventoryItemsForRetry = getMissingNarratedInventoryGains(step1Text, parsedStep2.tavern_commands || []);
            if (missingInventoryItemsForRetry.length > 0) {
              console.warn(`[分步生成] 第2步遗漏背包物品指令，准备重试: ${missingInventoryItemsForRetry.join('、')}`);
              parsedStep2 = null;
              continue;
            }
            if (parsedStep2.tavern_commands && parsedStep2.tavern_commands.length > 0) break;
            parsedStep2 = null;
          } catch (e) {
            console.warn(`[分步生成] 第2步第${attempt}次失败:`, e);
          }
        }
        if (!parsedStep2) {
          parsedStep2 = { text: '', mid_term_memory: '', tavern_commands: [], action_options: [] } as GM_Response;
        }

        gmResponse = {
          text: step1Text,
          mid_term_memory: parsedStep2.mid_term_memory || '',
          tavern_commands: parsedStep2.tavern_commands || [],
          action_options: actionOptionsEnabled ? this.sanitizeActionOptionsForDisplay(parsedStep2.action_options || []) : []
        };
      } else if (tavernHelper) {
        // 酒馆模式
        console.log(`[AI双向系统] 进入酒馆模式, hasOnStreamChunk=${!!options?.onStreamChunk}`);
        response = await tavernHelper.generate({
          user_input: finalUserInput,
          should_stream: useStreaming,
          generation_id: generationId,
          usageType: 'main',
          injects: injects as any,
          onStreamChunk: narrativeStreaming ? options?.onStreamChunk : undefined,
        });
      } else {
        // 自定义API模式
        console.log(`[AI双向系统] 进入自定义API模式, hasOnStreamChunk=${!!options?.onStreamChunk}`);
        const { aiService } = await import('@/services/aiService');
        response = await aiService.generate({
          user_input: finalUserInput,
          should_stream: useStreaming,
          generation_id: generationId,
          usageType: 'main',
          injects: injects as any,
          onStreamChunk: narrativeStreaming ? options?.onStreamChunk : undefined,
        });
      }

      // 流式传输通过事件系统在 MainGamePanel 中处理
      // 这里只需要解析最终响应
      if (!isSplitEnabled) {
        // 🔥 获取主API的强JSON模式设置
        const mainForceJson = aiService.isForceJsonEnabled('main');
        try {
          gmResponse = this.parseAIResponse(response, mainForceJson, actionOptionsEnabled);
        } catch (parseError) {
        console.error('[AI双向系统] 响应解析失败，尝试容错处理:', parseError);

        // 容错策略：尝试多种方式提取文本内容
        const responseText = String(response).trim();
        let extractedText = '';
        let extractedMemory = '';
        let extractedCommands: any[] = [];
        let extractedActionOptions: string[] = [];

        // 1. 尝试提取JSON代码块（```json ... ```）
        const jsonBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonBlockMatch && jsonBlockMatch[1]) {
          try {
            const jsonObj = JSON.parse(jsonBlockMatch[1].trim());
            extractedText = jsonObj.text || jsonObj.叙事文本 || jsonObj.narrative || '';
            extractedMemory = jsonObj.mid_term_memory || jsonObj.中期记忆 || '';
            extractedCommands = jsonObj.tavern_commands || jsonObj.指令 || [];
            extractedActionOptions = jsonObj.action_options || [];
          } catch (e) {
            console.warn('[AI双向系统] JSON代码块解析失败:', e);
          }
        }

        // 2. 如果没有提取到，尝试直接JSON解析
        if (!extractedText) {
          try {
            const jsonObj = JSON.parse(responseText);
            extractedText = jsonObj.text || jsonObj.叙事文本 || jsonObj.narrative || '';
            extractedMemory = jsonObj.mid_term_memory || jsonObj.中期记忆 || '';
            extractedCommands = jsonObj.tavern_commands || jsonObj.指令 || [];
            extractedActionOptions = jsonObj.action_options || [];
          } catch {
            // 3. 尝试提取JSON中的text字段（使用正则）
            const textMatch = responseText.match(/"(?:text|叙事文本|narrative)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (textMatch && textMatch[1]) {
              extractedText = textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            } else {
              // 4. 尝试查找大括号包裹的JSON
              const jsonMatch = responseText.match(/\{[\s\S]*"text"[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  const jsonObj = JSON.parse(jsonMatch[0]);
                  extractedText = jsonObj.text || '';
                  extractedMemory = jsonObj.mid_term_memory || '';
                  extractedCommands = jsonObj.tavern_commands || [];
                  extractedActionOptions = jsonObj.action_options || [];
                } catch {
                  // 不能把残缺 JSON 或前置分析当作玩家叙事回显；交给外层重试。
                }
              }
            }
          }
        }

        if (!extractedText.trim()) {
          throw new Error('AI响应中未提取到有效叙事文本');
        }

        // 🔥 action_options：仅在启用时兜底默认；关闭时保持为空，避免“关不掉”的体验
        if (!actionOptionsEnabled) {
          extractedActionOptions = [];
        } else if (!extractedActionOptions || extractedActionOptions.length === 0) {
          console.warn('[AI双向系统] ⚠️ 容错模式：action_options为空，使用默认选项');
          extractedActionOptions = ['继续当前活动', '观察周围环境', '与附近的人交谈', '查看自身状态', '稍作休息调整'];
        }

        gmResponse = {
          text: extractedText,
          mid_term_memory: extractedMemory,
          tavern_commands: extractedCommands,
          action_options: this.sanitizeActionOptionsForDisplay(extractedActionOptions)
        };
        console.warn('[AI双向系统] 使用容错模式提取内容 - 文本长度:', extractedText.length, '记忆:', extractedMemory.length, '指令数:', extractedCommands.length, '行动选项:', extractedActionOptions.length);
      }
      }

      // 非分步路由同样执行一次表演门禁；仅点名决策场景触发，最多额外调用一次。
      if (!shouldActuallySplit && gmResponse?.text) {
        const performance = validateNarrativePerformance(gmResponse.text, finalUserInput, scenarioStoryPrompt);
        if (!performance.valid) {
          options?.onProgressUpdate?.('角色表演门禁：重写正文…');
          const retryInput = `${finalUserInput}\n\n${performanceRetryInstruction(performance.issues)}`;
          console.warn('[角色表演门禁] 非分步正文退回重写：', performance.issues);
          const retryRaw = tavernHelper
            ? await tavernHelper.generate({
                user_input: retryInput,
                should_stream: false,
                generation_id: `${generationId}_performance_retry`,
                usageType: 'main',
                injects: injects as any,
              })
            : await aiService.generate({
                user_input: retryInput,
                should_stream: false,
                generation_id: `${generationId}_performance_retry`,
                usageType: 'main',
                injects: injects as any,
              });
          gmResponse = this.parseAIResponse(
            String(retryRaw),
            aiService.isForceJsonEnabled('main'),
            actionOptionsEnabled,
          );
          const finalPerformance = validateNarrativePerformance(gmResponse.text || '', finalUserInput, scenarioStoryPrompt);
          if (hasHardNarrativeViolation(finalPerformance)) {
            gmResponse.text = safeNarrativeFallbackForContext(finalUserInput, scenarioStoryPrompt);
            gmResponse.mid_term_memory = '';
            gmResponse.tavern_commands = [];
            gmResponse.action_options = [];
            console.error('[叙事硬门禁] 非分步重试仍违规，已丢弃正文与伴随指令：', finalPerformance.issues);
          }
        }
      }

      // 🔥 文本优化：如果启用，对生成的文本进行润色
      if (shouldAbort()) {
        console.log('[AI System] Abort detected, skip text optimization and command execution');
        if (usedLegacyNarrativePilot) {
          gmResponse = { text: '', mid_term_memory: '', tavern_commands: [], action_options: [] };
        }
        return gmResponse;
      }
      if (gmResponse && gmResponse.text) {
        gmResponse.text = await this.optimizeText(gmResponse.text, options?.onProgressUpdate);
        const finalPerformance = validateNarrativePerformance(gmResponse.text, finalUserInput, scenarioStoryPrompt);
        if (hasHardNarrativeViolation(finalPerformance)) {
          gmResponse.text = safeNarrativeFallbackForContext(finalUserInput, scenarioStoryPrompt);
          gmResponse.mid_term_memory = '';
          gmResponse.tavern_commands = [];
          gmResponse.action_options = [];
          console.error('[叙事硬门禁] 最终落稿违规，已丢弃正文与伴随指令：', finalPerformance.issues);
        }
      }

      if (shouldAbort()) {
        console.log('[AI System] Abort detected, skip command execution');
        if (usedLegacyNarrativePilot) {
          gmResponse = { text: '', mid_term_memory: '', tavern_commands: [], action_options: [] };
        }
        return gmResponse;
      }
      if (!gmResponse || !gmResponse.text || gmResponse.text.trim() === '') {
        console.error('[AI双向系统] AI响应为空，原始响应:', String(response).substring(0, 200));
        throw new Error('AI响应为空或格式错误');
      }

      // 普通 Legacy 在提交前即可结束流式层。Pilot 正文等本地事务提交后再发。
      if (useStreaming && options?.onStreamComplete && !usedLegacyNarrativePilot) {
        options.onStreamComplete();
      }
      }
      }
      }
    } catch (error) {
      console.error('[AI双向系统] AI生成失败:', error);
      generationFailed = true;
      gmResponse = {
        text: '（AI生成失败）',
        mid_term_memory: '',
        tavern_commands: [],
        action_options: actionOptionsEnabled ? ['重试当前操作', '查看自身状态', '稍作休息'] : []
      };
    }

    // 不能让“AI生成失败”占位文本写进叙事历史/记忆，也不能执行任何旧命令。
    // 调用方会看到 mid_term_memory 为空并走既有 retryAIResponse 流程。
    if (generationFailed) return gmResponse;

    // 3. 执行AI指令
    options?.onProgressUpdate?.('执行AI指令…');
    if (shouldAbort()) {
      console.log('[AI System] Abort detected, skip command execution');
      if (usedLegacyNarrativePilot) {
        gmResponse = { text: '', mid_term_memory: '', tavern_commands: [], action_options: [] };
      }
      return gmResponse;
    }
    try {
      // 🔥 使用 v3 而不是原始 saveData，因为 maybeTriggerScheduledWorldEvent 可能已修改了 v3（如下次事件时间）
      const dataForProcessing = isSaveDataV3(saveData) ? saveData : migrateSaveDataToLatest(saveData).migrated;
      const { saveData: updatedSaveData, stateChanges, aborted } = await this.processGmResponse(
        gmResponse,
        dataForProcessing as SaveData,
        false,
        options?.shouldAbort,
        {
          userAction: (userMessage && String(userMessage).trim()) || '继续当前活动',
          opportunityAction: options?.opportunityAction,
          eventAction: options?.eventAction,
          openWorldAction: options?.openWorldAction,
          judgementResolution: trustedJudgementResolution ?? undefined,
          narrativeAuthority: usedLegacyNarrativePilot ? 'local_contract' : 'model',
        }
      );
      if (aborted) {
        console.log('[AI System] processGmResponse aborted, skip transaction commit');
        if (usedLegacyNarrativePilot) {
          gmResponse = { text: '', mid_term_memory: '', tavern_commands: [], action_options: [] };
        }
        return gmResponse;
      }
      // 从这里返回的响应已经完成本地状态事务。UI 只能展示，不能再因可选字段
      // 缺失而把同一玩家输入送回 processPlayerAction。
      gmResponse.stateChanges = stateChanges;
      gmResponse.transactionCommitted = true;
      if (usedLegacyNarrativePilot && gmResponse.text) {
        options?.onStreamChunk?.(gmResponse.text);
        options?.onStreamComplete?.();
      }
      if (options?.onStateChange) {
        options.onStateChange(updatedSaveData as unknown as PlainObject);
      }

      return gmResponse;
    } catch (error) {
      console.error('[AI双向系统] 指令执行失败:', error);
      return gmResponse;
    }
    } finally {
      endForegroundAiTurn();
      endTurnTelemetry();
    }
  }

  public async generateInitialMessage(
    systemPrompt: string,
    userPrompt: string,
    options?: ProcessOptions
  ): Promise<GM_Response> {
    beginForegroundAiTurn();
    try {
    const tavernHelper = getTavernHelper();
    const uiStore = useUIStore();
    const actionOptionsEnabled = this.isActionOptionsEnabled(uiStore);

    // 检查AI服务可用性（酒馆或自定义API）
    if (!tavernHelper) {
      const { aiService } = await import('@/services/aiService');
      const availability = aiService.checkAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }
    }

    options?.onProgressUpdate?.('构建提示词并请求AI生成…');
    let gmResponse: GM_Response;
    try {
      // 🔥 [流式传输修复] 优先使用配置中的streaming设置
      const { aiService } = await import('@/services/aiService');
      const aiConfig = aiService.getConfig();
      const useStreaming = options?.useStreaming ?? aiConfig.streaming ?? true;
      const narrativeStreaming = useStreaming && !requiresNarrativeBuffering(userPrompt);
      const generateMode = options?.generateMode || 'generate'; // 默认使用 generate 模式
      const isSplitEnabled = (() => {
        if (typeof options?.splitResponseGeneration === 'boolean') return options.splitResponseGeneration;
        try {
          const raw = localStorage.getItem('dad_game_settings');
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          return parsed?.splitResponseGeneration === true;
        } catch {
          return false;
        }
      })();

      let response = '';

      // 🔥 获取 API 管理配置，判断是否真正需要分步生成
      const { useAPIManagementStore } = await import('@/stores/apiManagementStore');
      const apiStore = useAPIManagementStore();
      const instructionApiConfig = apiStore.getAPIForType('instruction_generation');
      // 判断是否有独立的指令生成 API 配置
      const hasInstructionApi = instructionApiConfig && instructionApiConfig.id !== 'default';

      // 🔥 开局分步生成：只根据开关按钮判断，固定用主API分步
      const shouldActuallySplit = isSplitEnabled;

      if (shouldActuallySplit) {

        const buildInitialSplitSystemPrompt = async (step: 1 | 2): Promise<string> => {
          if (step === 1) {
            // 第1步：只输出正文，不需要JSON格式和指令相关的提示词
            const stepRules = (await getPrompt('splitInitStep1')).trim();
            const worldStandardsPrompt = await getPrompt('worldStandards');
            return `
${stepRules}

---

# 世界观设定
${worldStandardsPrompt}

---

# 角色设定
${userPrompt}
            `.trim();
          }

          // 第2步：指令生成（CoT 自检清单已合并到 splitInitStep2 提示词中）
          const tavernEnv = !!tavernHelper;
          const stepRules = (await getPrompt('splitInitStep2')).trim();
          const [businessRulesPrompt, dataDefinitionsPrompt, textFormatsPrompt, worldStandardsPrompt] = await Promise.all([
            getPrompt('businessRules'),
            getPrompt('dataDefinitions'),
            getPrompt('textFormatRules'),
            getPrompt('worldStandards')
          ]);
          const sanitizedDataDefinitionsPrompt = tavernEnv ? dataDefinitionsPrompt : stripNsfwContent(dataDefinitionsPrompt);
          const sanitizedBusinessRulesPrompt = tavernEnv ? businessRulesPrompt : stripNsfwContent(businessRulesPrompt);

          const sections: string[] = [stepRules];

          // 🔥 酒馆端：注入身体数据生成要求
          if (tavernEnv) {
            sections.push(`## ⚠️ 酒馆端必须生成身体数据
□ 身体：set \`角色.身体\` {身高:num(cm),体重:num(kg),体脂率:num(%),三围:{胸围,腰围,臀围},肤色,发色,瞳色,纹身与印记:[],穿刺:[],敏感点:[],开发度:{},其它:{}}
- 必须根据角色性别/年龄/种族填写合理的具体数值
- 男性身高165-185cm，女性155-170cm，儿童按年龄
- 严禁使用占位文本或照抄示例`);
          }

          sections.push(sanitizedBusinessRulesPrompt, sanitizedDataDefinitionsPrompt, textFormatsPrompt, worldStandardsPrompt);
          return sections.map(s => s.trim()).filter(Boolean).join('\n\n---\n\n').trim();
        };

        type InitialSplitUsageType = 'main' | 'instruction_generation';
        const generateOnce = async (args: { step: 1 | 2; system: string; user: string; should_stream: boolean; usageType?: InitialSplitUsageType; maxTokens: number; onStreamChunk?: (chunk: string) => void; }): Promise<string> => {
          const generationId = `initial_message_split_step${args.step}_${Date.now()}`;
          const usageType = args.usageType || 'main';

          // 始终通过 aiService 调用，让它根据 usageType 决定使用独立 API 还是酒馆代理
          if (generateMode === 'generateRaw') {
            return await aiService.generateRaw({
              ordered_prompts: [
                { role: 'system', content: args.system },
                { role: 'user', content: args.user }
              ],
              should_stream: args.should_stream,
              generation_id: generationId,
              usageType,
              ...initialGenerationRequestLimits(args.maxTokens),
              onStreamChunk: args.onStreamChunk,
            });
          }

          const injects: Array<{ content: string; role: 'system' | 'assistant' | 'user'; depth: number; position: 'in_chat' | 'none' }> = [
            { content: args.system, role: 'user', depth: 4, position: 'in_chat' }
          ];
          return await aiService.generate({
            user_input: args.user,
            should_stream: args.should_stream,
            generation_id: generationId,
            usageType,
            ...initialGenerationRequestLimits(args.maxTokens),
            injects: injects as any,
            onStreamChunk: args.onStreamChunk,
          });
        };

        // ========== 第1步：开局正文生成 ==========
        // 整个分步开局最多 4 次模型调用：Step1/Step2 各一次首调 + 各一次重试。
        // token 预算只约束本次调用，不改用户保存的全局 API 配置。
        let step1Text = '';
        let bestStep1Text = '';
        let lastStep1Error = '';
        const step1SystemPrompt = await buildInitialSplitSystemPrompt(1);

        for (let attempt = 1; attempt <= INITIAL_GENERATION_POLICY.attemptsPerStep; attempt++) {
          const attemptStartedAt = Date.now();
          try {
            if (attempt === 1) {
              options?.onProgressUpdate?.('分步生成：第1步（开局正文）…');
            } else {
              options?.onProgressUpdate?.(`分步生成：第1步自动修复（1/1）${lastStep1Error ? `（${lastStep1Error.slice(0, 80)}）` : ''}`);
            }
            const strictLengthSuffix = attempt === 2
              ? '\n\n# 本次修复的最高优先级要求\n正文必须为完整 JSON，text 严格控制在 600–1000 个中文字符；不要扩写背景，不得超过 1500 字。'
              : '';
            const step1Raw = await generateOnce({
              step: 1,
              system: `${step1SystemPrompt}${strictLengthSuffix}`,
              user: userPrompt,
              should_stream: useStreaming,
              usageType: 'main',
              maxTokens: INITIAL_GENERATION_POLICY.step1MaxTokens,
              onStreamChunk: narrativeStreaming ? options?.onStreamChunk : undefined,
            });

            const candidate = this.extractNarrativeText(String(step1Raw)).trim();
            const narrativeControlCheck = validateNarrativePerformance(candidate, '', userPrompt);
            const hasControlLeak = !narrativeControlCheck.valid;
            console.info('[开局生成遥测]', {
              step: 1,
              attempt,
              maxTokens: INITIAL_GENERATION_POLICY.step1MaxTokens,
              elapsedMs: Date.now() - attemptStartedAt,
              narrativeChars: candidate.length,
              outcome: hasControlLeak
                ? 'retryable_control_leak'
                : (shouldRetryInitialNarrative(candidate.length) ? 'retryable_length' : 'accepted'),
            });
            if (!hasControlLeak && candidate.length >= INITIAL_GENERATION_POLICY.step1MinChars && (!bestStep1Text || candidate.length < bestStep1Text.length)) {
              bestStep1Text = candidate;
            }
            if (!hasControlLeak && !shouldRetryInitialNarrative(candidate.length)) {
              step1Text = candidate;
              break;
            }
            if (hasControlLeak) {
              lastStep1Error = narrativeControlCheck.issues.join('；');
              if (attempt === INITIAL_GENERATION_POLICY.attemptsPerStep) {
                const sanitizedCandidate = hasHardNarrativeViolation(narrativeControlCheck)
                  ? safeNarrativeFallback()
                  : sanitizeAITextForDisplay(candidate).trim();
                if (hasHardNarrativeViolation(narrativeControlCheck) || !shouldRetryInitialNarrative(sanitizedCandidate.length)) {
                  step1Text = sanitizedCandidate;
                  break;
                }
              }
            } else {
              lastStep1Error = candidate.length < INITIAL_GENERATION_POLICY.step1MinChars
                ? `正文过短（${candidate.length}字）`
                : `正文严重超长（${candidate.length}字）`;
            }
          } catch (error) {
            lastStep1Error = error instanceof Error ? error.message : String(error);
            console.info('[开局生成遥测]', {
              step: 1,
              attempt,
              maxTokens: INITIAL_GENERATION_POLICY.step1MaxTokens,
              elapsedMs: Date.now() - attemptStartedAt,
              outcome: 'failed',
              reason: lastStep1Error.slice(0, 160),
            });
            console.warn(`[分步生成-开局] 第1步第${attempt}次失败:`, error);
          }
        }

        if (!step1Text) {
          if (bestStep1Text) {
            // 两次均严重超长时保留更短的完整可解析版本，避免为了长度丢掉整个创角流程。
            step1Text = bestStep1Text;
            options?.onProgressUpdate?.(`分步生成：正文偏长（${step1Text.length}字），继续初始化数据…`);
          } else {
            throw new Error(`开局正文两次生成均不可用：${lastStep1Error || '无有效正文'}`);
          }
        }

        if (useStreaming && options?.onStreamComplete) {
          options.onStreamComplete();
        }

        // ========== 第2步：COT + 指令生成（合并） ==========
        options?.onProgressUpdate?.('分步生成：第2步（思维链+指令生成）…');

        const step2UserPrompt = `
【开局用户提示】
${userPrompt}

【第1步正文】
${step1Text}

请按"分步生成（开局-第2步）"规则输出 JSON。
        `.trim();

        // 🔥 第2步指令生成：可单独控制是否流式（部分API不支持流式）
        const step2StreamingInitial = !!apiStore.aiGenerationSettings?.splitStep2Streaming && useStreaming;
        const initStep2UsageType: APIUsageType = hasInstructionApi ? 'instruction_generation' : 'main';
        const initStep2ForceJson = aiService.isForceJsonEnabled(initStep2UsageType);
        options?.onProgressUpdate?.('分步生成：第2步（指令生成）…');
        let parsedStep2: GM_Response | null = null;
        let lastStep2Error = '';
        for (let attempt = 1; attempt <= INITIAL_GENERATION_POLICY.attemptsPerStep; attempt++) {
          const attemptStartedAt = Date.now();
          try {
            if (attempt > 1) {
              // 玩家可见文案不带内部字段名，技术细节留在遥测日志与下方修复提示里
              const reason = lastStep2Error ? '（上次输出未通过格式校验）' : '';
              options?.onProgressUpdate?.(`分步生成：第2步重试…${reason}`);
            }
            const step2Response = await generateOnce({
              step: 2,
              system: await buildInitialSplitSystemPrompt(2),
              user: attempt === 1
                ? step2UserPrompt
                : `${step2UserPrompt}\n\n【格式修复】上次输出未通过结构校验：${lastStep2Error || '缺少初始化指令'}。只返回一个完整 JSON 对象，必须包含至少一条合法 tavern_commands；不要解释。`,
              should_stream: step2StreamingInitial,
              usageType: initStep2UsageType,
              maxTokens: INITIAL_GENERATION_POLICY.step2MaxTokens,
              onStreamChunk: undefined,
            });
            parsedStep2 = this.parseAIResponse(String(step2Response), initStep2ForceJson, actionOptionsEnabled);
            if (parsedStep2.tavern_commands && parsedStep2.tavern_commands.length > 0) {
              console.info('[开局生成遥测]', {
                step: 2,
                attempt,
                maxTokens: INITIAL_GENERATION_POLICY.step2MaxTokens,
                elapsedMs: Date.now() - attemptStartedAt,
                commandCount: parsedStep2.tavern_commands.length,
                outcome: 'accepted',
              });
              break;
            }
            lastStep2Error = '缺少有效的 tavern_commands';
            console.info('[开局生成遥测]', {
              step: 2,
              attempt,
              maxTokens: INITIAL_GENERATION_POLICY.step2MaxTokens,
              elapsedMs: Date.now() - attemptStartedAt,
              outcome: 'failed',
              reason: lastStep2Error,
            });
            parsedStep2 = null;
          } catch (e) {
            lastStep2Error = e instanceof Error ? e.message : String(e);
            console.info('[开局生成遥测]', {
              step: 2,
              attempt,
              maxTokens: INITIAL_GENERATION_POLICY.step2MaxTokens,
              elapsedMs: Date.now() - attemptStartedAt,
              outcome: 'failed',
              reason: lastStep2Error.slice(0, 160),
            });
            options?.onProgressUpdate?.('分步生成：第2步解析失败，准备重试…');
            console.warn(`[分步生成-开局] 第2步第${attempt}次失败:`, e);
          }
        }
        const step2Degraded = !parsedStep2;
        if (!parsedStep2) {
          options?.onProgressUpdate?.('分步生成：初始化数据两次失败，使用本地安全默认值继续…');
          parsedStep2 = {
            text: '',
            mid_term_memory: step1Text.slice(0, 100),
            tavern_commands: [],
            action_options: []
          } as GM_Response;
        }

        const defaultInitialActionOptions = [
          '四处走动熟悉环境',
          '查看自身状态',
          '与附近的人交谈',
          '寻找修炼之地',
          '打听周围消息'
        ];

        gmResponse = {
          text: step1Text,
          mid_term_memory: parsedStep2.mid_term_memory || '',
          tavern_commands: parsedStep2.tavern_commands || [],
          action_options: actionOptionsEnabled
            ? this.sanitizeActionOptionsForDisplay(parsedStep2.action_options?.length ? parsedStep2.action_options : defaultInitialActionOptions)
            : []
        };
        if (step2Degraded) {
          (gmResponse as any).__initializationDegraded = true;
        }

        // 🔥 文本优化：如果启用，对生成的文本进行润色（分步模式）
        gmResponse.text = await this.optimizeText(gmResponse.text, options?.onProgressUpdate);
      } else if (tavernHelper) {
        // 酒馆模式
        if (generateMode === 'generateRaw') {
          // 🔥 使用 generateRaw 模式：纯净生成，不使用角色卡预设
          console.log('[AI双向系统] 酒馆模式 - 使用 generateRaw 模式生成初始消息');
          response = String(await tavernHelper.generateRaw({
            ordered_prompts: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            should_stream: useStreaming,
            generation_id: `initial_message_raw_${Date.now()}`,
            usageType: 'main',
          }));
        } else {
          // 🔥 使用标准 generate 模式：包含角色卡预设和聊天历史
          console.log('[AI双向系统] 酒馆模式 - 使用 generate 模式生成初始消息');
          const injects: Array<{ content: string; role: 'system' | 'assistant' | 'user'; depth: number; position: 'in_chat' | 'none' }> = [
            {
              content: systemPrompt,
              role: 'user',
              depth: 4,
              position: 'in_chat',
            }
          ];

          response = await tavernHelper.generate({
            user_input: userPrompt,
            should_stream: useStreaming,
            generation_id: `initial_message_${Date.now()}`,
            usageType: 'main',
            injects,
          });
        }
      } else {
        // 自定义API模式
        const { aiService } = await import('@/services/aiService');

        if (generateMode === 'generateRaw') {
          console.log('[AI双向系统] 自定义API模式 - 使用 generateRaw 模式生成初始消息');
          response = await aiService.generateRaw({
            ordered_prompts: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            should_stream: useStreaming,
            generation_id: `initial_message_raw_${Date.now()}`,
            usageType: 'main',
            onStreamChunk: narrativeStreaming ? options?.onStreamChunk : undefined,
          });
        } else {
          console.log('[AI双向系统] 自定义API模式 - 使用 generate 模式生成初始消息');
          const injects: Array<{ content: string; role: 'system' | 'assistant' | 'user'; depth: number; position: 'in_chat' | 'none' }> = [
            {
              content: systemPrompt,
              role: 'user',
              depth: 4,
              position: 'in_chat',
            }
          ];

          response = await aiService.generate({
            user_input: userPrompt,
            should_stream: useStreaming,
            generation_id: `initial_message_${Date.now()}`,
            usageType: 'main',
            injects: injects as any,
            onStreamChunk: narrativeStreaming ? options?.onStreamChunk : undefined,
          });
        }
      }

      // 🔥 非分步模式才需要解析response（分步模式已在上面设置了gmResponse）
      if (!shouldActuallySplit) {
        // 🔥 调试日志：检查酒馆/API返回的原始响应
        console.log('[AI双向系统] 原始响应类型:', typeof response);
        console.log('[AI双向系统] 原始响应长度:', String(response).length);
        console.log('[AI双向系统] 原始响应前500字符:', String(response).substring(0, 500));

        // 🔥 检测空响应并给出更明确的错误提示
        if (!response || String(response).trim().length === 0) {
          throw new Error('AI返回了空响应。可能原因：1) 模型使用了reasoning_content字段而非content字段（如Gemini 3 Pro）；2) API配置错误；3) 网络问题。建议：在酒馆设置中关闭流式传输，或更换模型。');
        }

        // 流式传输通过事件系统在调用方处理
        // 🔥 获取主API的强JSON模式设置
        const initMainForceJson = aiService.isForceJsonEnabled('main');
        try {
          gmResponse = this.parseAIResponse(String(response), initMainForceJson, actionOptionsEnabled);
        } catch (parseError) {
          console.error('[AI双向系统] 初始消息解析失败，尝试容错处理:', parseError);

          // 容错策略：尝试多种方式提取文本内容
          const responseText = String(response).trim();
          let extractedText = '';
          let extractedMemory = '';
          let extractedCommands: any[] = [];

          // 1. 尝试提取JSON代码块（结尾```可选）
          const jsonBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?(?:```|$)/);
          if (jsonBlockMatch && jsonBlockMatch[1]) {
            try {
              const jsonObj = JSON.parse(jsonBlockMatch[1].trim());
              extractedText = jsonObj.text || jsonObj.叙事文本 || jsonObj.narrative || '';
              extractedMemory = jsonObj.mid_term_memory || jsonObj.中期记忆 || '';
              extractedCommands = jsonObj.tavern_commands || jsonObj.指令 || [];
            } catch (e) {
              console.warn('[AI双向系统] JSON代码块解析失败:', e);
            }
          }

          // 2. 如果没有提取到，尝试直接JSON解析
          if (!extractedText) {
            try {
              const jsonObj = JSON.parse(responseText);
              extractedText = jsonObj.text || jsonObj.叙事文本 || jsonObj.narrative || '';
              extractedMemory = jsonObj.mid_term_memory || jsonObj.中期记忆 || '';
              extractedCommands = jsonObj.tavern_commands || jsonObj.指令 || [];
            } catch {
              // 3. 尝试提取JSON中的text字段（使用正则）
              const textMatch = responseText.match(/"(?:text|叙事文本|narrative)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              if (textMatch && textMatch[1]) {
                extractedText = textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
              } else {
                // 4. 尝试查找大括号包裹的JSON
                const jsonMatch = responseText.match(/\{[\s\S]*"text"[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const jsonObj = JSON.parse(jsonMatch[0]);
                    extractedText = jsonObj.text || '';
                    extractedMemory = jsonObj.mid_term_memory || '';
                    extractedCommands = jsonObj.tavern_commands || [];
                  } catch {
                    // 5. 最后降级：使用整个响应作为文本
                    extractedText = responseText;
                  }
                }
              }
            }
          }

          // 🔥 初始消息也需要 action_options
          let extractedActionOptions: string[] = [];
          // 尝试从已解析的JSON中提取
          try {
            const jsonBlockMatch2 = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?(?:```|$)/);
            if (jsonBlockMatch2 && jsonBlockMatch2[1]) {
              const jsonObj = JSON.parse(jsonBlockMatch2[1].trim());
              extractedActionOptions = jsonObj.action_options || [];
            }
          } catch { /* 忽略 */ }

          // 确保不为空
          if (!actionOptionsEnabled) {
            extractedActionOptions = [];
          } else if (!extractedActionOptions || extractedActionOptions.length === 0) {
            console.warn('[AI双向系统] ⚠️ 初始消息：action_options为空，使用默认选项');
            extractedActionOptions = ['四处走动熟悉环境', '查看自身状态', '与附近的人交谈', '寻找修炼之地', '打听周围消息'];
          }

          gmResponse = {
            text: extractedText,
            mid_term_memory: extractedMemory,
            tavern_commands: extractedCommands,
            action_options: this.sanitizeActionOptionsForDisplay(extractedActionOptions)
          };
          console.warn('[AI双向系统] 使用容错模式提取初始消息 - 文本长度:', extractedText.length, '记忆:', extractedMemory.length, '指令数:', extractedCommands.length, '行动选项:', extractedActionOptions.length);
        }

        if (!gmResponse || !gmResponse.text) {
          throw new Error('AI响应解析失败或为空');
        }

        const finalPerformance = validateNarrativePerformance(gmResponse.text, '', userPrompt);
        if (hasHardNarrativeViolation(finalPerformance)) {
          gmResponse.text = safeNarrativeFallback();
          gmResponse.mid_term_memory = '';
          gmResponse.tavern_commands = [];
          gmResponse.action_options = [];
          console.error('[叙事硬门禁] 开局最终落稿违规，已丢弃正文与伴随指令：', finalPerformance.issues);
        }

        // 🔥 文本优化：如果启用，对生成的文本进行润色（非分步模式）
        gmResponse.text = await this.optimizeText(gmResponse.text, options?.onProgressUpdate);
      }

      const finalInitialPerformance = validateNarrativePerformance(gmResponse!.text || '', '', userPrompt);
      if (hasHardNarrativeViolation(finalInitialPerformance)) {
        gmResponse!.text = safeNarrativeFallback();
        gmResponse!.mid_term_memory = '';
        gmResponse!.tavern_commands = [];
        gmResponse!.action_options = [];
        console.error('[叙事硬门禁] 开局优化后落稿违规，已丢弃正文与伴随指令：', finalInitialPerformance.issues);
      }

      // 流式传输完成后调用回调
      if (useStreaming && options?.onStreamComplete) {
        options.onStreamComplete();
      }

      // 最终验证：确保gmResponse已设置
      if (!gmResponse! || !gmResponse!.text) {
        throw new Error('AI响应解析失败或为空');
      }

      return gmResponse!;
    } catch (error) {
      console.error('[AI双向系统] 初始消息生成失败:', error);
      throw new Error(`初始消息生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    } finally {
      endForegroundAiTurn();
    }
  }

  private _getMinutes(gameTime: GameTime): number {
    return gameTime.分钟 ?? 0;
  }
  private _formatGameTime(gameTime: GameTime | undefined): string {
    if (!gameTime) return '【仙历元年】';
    const minutes = this._getMinutes(gameTime);
    return `【仙道${gameTime.年}年${gameTime.月}月${gameTime.日}日 ${String(gameTime.小时).padStart(2, '0')}:${String(minutes).padStart(2, '0')}】`;
  }
  public async processGmResponse(
    response: GM_Response,
    currentSaveData: SaveData,
    isInitialization = false,
    shouldAbort?: () => boolean,
    options?: {
      /**
       * 是否写入系统.历史.叙事（用于主面板正文/主对话展示）
       * - 默认 true
       * - 宗门/后台面板类功能应设为 false，避免污染主对话
       */
      appendNarrativeHistory?: boolean;
      /**
       * 是否将 response.text 写入社交.记忆.短期记忆（用于AI上下文）
       * - 默认 true
       */
      appendShortTermMemoryFromText?: boolean;
      /**
       * 是否将 response.mid_term_memory 写入社交.记忆.隐式中期记忆
       * - 默认 true
       */
      appendImplicitMidMemoryFromMidTerm?: boolean;
      /**
       * 若 response.mid_term_memory 为空，是否为“短期记忆”补一个对应的“隐式中期记忆”
       * - 默认 true（用截断后的 text 兜底）
       */
      ensureImplicitMidForEachShortTerm?: boolean;
      /**
       * ensureImplicitMidForEachShortTerm 为 true 时，隐式中期的兜底内容最大长度
       * - 默认 80
       */
      implicitMidFallbackMaxLen?: number;
      /**
       * 本轮用户动作。用于窄触发的确定性补账，例如“查看/调查某物品”后同步物品描述。
       */
      userAction?: string;
      opportunityAction?: ScenarioOpportunityActionSelection;
      eventAction?: ScenarioEventActionSelection;
      openWorldAction?: WuyuanOpenWorldSelection;
      judgementResolution?: JudgementResolution;
      /** local_contract 时，模型正文与命令均无状态写入权。 */
      narrativeAuthority?: 'model' | 'local_contract';
    }
  ): Promise<{ saveData: SaveData; stateChanges: StateChangeLog; aborted?: boolean; abortReason?: string }> {
    const abortRequested = () => shouldAbort?.() ?? false;
    const abortUncommitted = (reason: string) => {
      console.log(`[AI System] Abort detected, ${reason}`);
      return {
        saveData: currentSaveData,
        stateChanges: { changes: [], timestamp: new Date().toISOString() },
        aborted: true,
        abortReason: reason,
      };
    };
    let deferredEventReconcile: { textContent: string; userAction: string } | null = null;
    if (abortRequested()) {
      return abortUncommitted('skip command processing');
    }
    // 🔥 先修复数据格式，确保所有字段正确
    const { repairSaveData } = await import('./dataRepair');
    const repairedData = repairSaveData(currentSaveData);
    let saveData = cloneDeep(repairedData);
    const changes: StateChange[] = [];
    const startingRuntime = (currentSaveData as any)?.世界?.状态?.剧本模组;
    const startingModId = typeof startingRuntime?.modId === 'string' ? startingRuntime.modId : '';
    const stageEntryTargetBefore = typeof startingRuntime?.stageEntryPresentation?.toStageId === 'string'
      ? String(startingRuntime.stageEntryPresentation.toStageId)
      : '';
    const handoffEventIdBefore = typeof (saveData as any)?.世界?.状态?.剧本模组?.lastSettledBeat?.eventId === 'string'
      ? String((saveData as any).世界.状态.剧本模组.lastSettledBeat.eventId)
      : '';
    // 显式空间/问题合同与事件、机会卡相同：先由本地系统结算，模型命令只能演出回执。
    const openWorldProgress = options?.openWorldAction
      ? settleWuyuanOpenWorldSelection(saveData, options.openWorldAction)
      : undefined;
    if (options?.openWorldAction && !openWorldProgress?.settled) {
      console.warn('[开放世界] 结算未成立', {
        identityId: options.openWorldAction.identityId,
        receiptId: options.openWorldAction.receiptId,
        reason: openWorldProgress?.reason,
      });
    }
    if (openWorldProgress?.settled) {
      changes.push({
        key: '世界.状态.剧本模组.openWorldSlice',
        action: openWorldProgress.idempotent ? 'open_world_idempotent' : 'open_world_settled',
        oldValue: undefined,
        newValue: {
          kind: options?.openWorldAction?.kind,
          identityId: options?.openWorldAction?.identityId,
          settledFacts: openWorldProgress.settledFacts,
        },
      });
    }
    // 非机会卡的本地判定在任何模型命令执行前结算；模型只能演出调用前已确定的结果，
    // 不能先改属性再反向影响本轮 success/partial/failure。
    const eventProgress = options?.eventAction
      ? recordStoryEventStructuredAction(saveData, options.eventAction)
      : undefined;
    if (eventProgress?.attempted) {
      changes.push({
        key: `世界.状态.剧本模组.eventActionStates.${eventProgress.eventId}`,
        action: eventProgress.completed ? 'event_action_completed' : 'event_action_attempted',
        oldValue: undefined,
        newValue: { actionId: eventProgress.actionId, outcome: eventProgress.outcome },
      });
      for (const settlement of eventProgress.inventorySettlements || []) {
        changes.push({
          key: settlement.key,
          action: 'set',
          oldValue: settlement.oldValue,
          newValue: settlement.newValue,
        });
      }
    }
    // 机会卡步骤同样先于模型命令结算。这样“王哲递出锦囊”的正文或命令只能演出，
    // 不能在本地交易之后再补发第二只。
    const opportunityProgress = options?.opportunityAction
      ? recordStoryOpportunityStructuredAction(saveData, options.opportunityAction)
      : recordStoryOpportunityPlayerAction(saveData, options?.userAction || '');
    if (opportunityProgress.progressed) {
      changes.push({
        key: `世界.状态.剧本模组.actorEngine.opportunityStates.${opportunityProgress.opportunityId}`,
        action: opportunityProgress.completed ? 'opportunity_completed' : 'opportunity_progressed',
        oldValue: undefined,
        newValue: opportunityProgress.stepId,
      });
      for (const settlement of opportunityProgress.inventorySettlements || []) {
        changes.push({
          key: settlement.key,
          action: 'set',
          oldValue: settlement.oldValue,
          newValue: settlement.newValue,
        });
      }
    }

    const behavior = {
      appendNarrativeHistory: options?.appendNarrativeHistory !== false,
      appendShortTermMemoryFromText: options?.appendShortTermMemoryFromText !== false,
      appendImplicitMidMemoryFromMidTerm: options?.appendImplicitMidMemoryFromMidTerm !== false,
      ensureImplicitMidForEachShortTerm: options?.ensureImplicitMidForEachShortTerm !== false,
      implicitMidFallbackMaxLen:
        typeof options?.implicitMidFallbackMaxLen === 'number' && Number.isFinite(options.implicitMidFallbackMaxLen)
          ? Math.max(20, Math.min(200, Math.floor(options.implicitMidFallbackMaxLen)))
          : 80,
    };
    const modelNarrativeCanWriteState = options?.narrativeAuthority !== 'local_contract';

    // 仅当需要写入叙事历史时才确保系统.历史.叙事存在
    if (behavior.appendNarrativeHistory) {
      if (!(saveData as any).系统) (saveData as any).系统 = {};
      if (!(saveData as any).系统.历史) (saveData as any).系统.历史 = { 叙事: [] };
      if (!Array.isArray((saveData as any).系统.历史.叙事)) (saveData as any).系统.历史.叙事 = [];
    }

    const timePrefix = this._formatGameTime((saveData as any).元数据?.时间);
    let textContent = clarifyUnobtainedSilkPouchNarrative(
      saveData,
      sanitizeAITextForDisplay(response.text || '').trim(),
    );
    const legacyJudgementMarkers = extractLegacyJudgementMarkers(textContent);
    if (legacyJudgementMarkers.length) {
      console.debug('[判定 P0] 观察到 legacy 正文判定标签（不作为状态事实）:', legacyJudgementMarkers);
      // Model-authored rolls never become UI receipts or memory facts. The local
      // engine already persists the only authoritative resolution and effects.
      textContent = stripLegacyJudgementMarkers(textContent);
    }
    // canonGuard 过去只校验 JSON 指令；正文里的“人变剑/马/功法”会直接污染记忆并被下一轮放大。
    // 仅在严格剧本存档启用低误伤的实体类型拦截，留下冲突日志便于追查。
    if ((saveData as any)?.世界?.状态?.剧本模组?.modId && textContent) {
      const narrativeGuard = stripNarrativeEntityTypeConflicts(textContent);
      if (narrativeGuard.conflicts.length) {
        console.warn('[正典叙事守卫] 已移除冲突句：', narrativeGuard.conflicts);
        textContent = narrativeGuard.text;
      }
    }
    let midTermContent = stripLegacyJudgementMarkers(
      sanitizeAITextForDisplay(response.mid_term_memory || '').trim(),
    );
    if ((saveData as any)?.世界?.状态?.剧本模组?.modId) {
      const introduced = introducedScenarioCharacterNames(saveData);
      const guardText = stripNarrativeUnintroducedCharacters(textContent, introduced);
      const guardMemory = stripNarrativeUnintroducedCharacters(midTermContent, introduced);
      if (guardText.conflicts.length || guardMemory.conflicts.length) {
        console.warn('[正典时间线守卫] 已移除提前登场人物：', [...guardText.conflicts, ...guardMemory.conflicts]);
      }
      textContent = guardText.text;
      midTermContent = guardMemory.text;
    }

    // 处理 text：可选写入叙事历史；可选写入短期记忆
    if (textContent) {
      if (behavior.appendNarrativeHistory) {
        const newNarrative = {
          type: 'gm' as const,
          role: 'assistant' as const,
          content: `${timePrefix}${textContent}`,
          time: timePrefix,
          actionOptions: this.sanitizeActionOptionsForDisplay(response.action_options || [])
        };
        (saveData as any).系统.历史.叙事.push(newNarrative);
        changes.push({
          key: `系统.历史.叙事[${(saveData as any).系统.历史.叙事.length - 1}]`,
          action: 'push',
          oldValue: undefined,
          newValue: cloneDeep(newNarrative)
        });
      }

      if (behavior.appendShortTermMemoryFromText) {
        // #11:逐轮正文入库统一过清洗(剥 JSON 壳/思维链,防双时间戳),脏文本不落库
        const shortMemoryEntry = composeShortTermMemoryEntry(timePrefix, textContent);
        if (shortMemoryEntry) {
          if (!(saveData as any).社交) (saveData as any).社交 = {};
          if (!(saveData as any).社交.记忆) (saveData as any).社交.记忆 = { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] };
          if (!Array.isArray((saveData as any).社交.记忆.短期记忆)) (saveData as any).社交.记忆.短期记忆 = [];
          (saveData as any).社交.记忆.短期记忆.push(shortMemoryEntry);
        }
      }
    }

    // 处理 mid_term_memory：写入隐式中期记忆（用于“短期->中期”过渡/总结）
    if (behavior.appendImplicitMidMemoryFromMidTerm && midTermContent) {
      if (!(saveData as any).社交) (saveData as any).社交 = {};
      if (!(saveData as any).社交.记忆) (saveData as any).社交.记忆 = { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] };
      if (!Array.isArray((saveData as any).社交.记忆.隐式中期记忆)) (saveData as any).社交.记忆.隐式中期记忆 = [];
      (saveData as any).社交.记忆.隐式中期记忆.push(`${timePrefix}${midTermContent}`);
    }

    // 兜底：若这次写入了短期记忆，但 mid_term_memory 为空，则补齐一条对应的隐式中期记忆，保持“短期-隐式中期”一一对应。
    if (
      behavior.appendShortTermMemoryFromText &&
      textContent &&
      behavior.ensureImplicitMidForEachShortTerm &&
      (!midTermContent || !behavior.appendImplicitMidMemoryFromMidTerm)
    ) {
      if (!(saveData as any).社交) (saveData as any).社交 = {};
      if (!(saveData as any).社交.记忆) (saveData as any).社交.记忆 = { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] };
      if (!Array.isArray((saveData as any).社交.记忆.隐式中期记忆)) (saveData as any).社交.记忆.隐式中期记忆 = [];
      const fallback = textContent.length > behavior.implicitMidFallbackMaxLen ? `${textContent.slice(0, behavior.implicitMidFallbackMaxLen)}…` : textContent;
      (saveData as any).社交.记忆.隐式中期记忆.push(`${timePrefix}${fallback}`);
    }

    // 🔥 检查短期记忆是否超限，超限则删除最旧的短期记忆，并将对应的隐式中期记忆转化为正式中期记忆
    // 从 localStorage 读取短期记忆上限配置
    let SHORT_TERM_LIMIT = 5; // 默认值
    try {
      const memorySettings = localStorage.getItem('memory-settings');
      if (memorySettings) {
        const settings = JSON.parse(memorySettings);
        const limit = typeof settings.shortTermLimit === 'number' && settings.shortTermLimit > 0
          ? settings.shortTermLimit
          : (typeof settings.maxShortTerm === 'number' && settings.maxShortTerm > 0 ? settings.maxShortTerm : null);
        if (limit) SHORT_TERM_LIMIT = limit;
      }
    } catch (error) {
      console.warn('[AI双向系统] 读取记忆配置失败，使用默认值:', error);
    }

    while ((saveData as any).社交?.记忆?.短期记忆 && (saveData as any).社交.记忆.短期记忆.length > SHORT_TERM_LIMIT) {
      // 删除最旧的短期记忆（第一个）
      (saveData as any).社交.记忆.短期记忆.shift();
      console.log(`[AI双向系统] 短期记忆超过上限（${SHORT_TERM_LIMIT}条），已删除最旧的短期记忆。当前短期记忆数量: ${(saveData as any).社交.记忆.短期记忆.length}`);

      // 将对应的隐式中期记忆转化为正式中期记忆
      if ((saveData as any).社交.记忆.隐式中期记忆 && (saveData as any).社交.记忆.隐式中期记忆.length > 0) {
        const implicitMidTerm = (saveData as any).社交.记忆.隐式中期记忆.shift();
        if (implicitMidTerm) {
          if (!Array.isArray((saveData as any).社交.记忆.中期记忆)) (saveData as any).社交.记忆.中期记忆 = [];
          (saveData as any).社交.记忆.中期记忆.push(implicitMidTerm);
          console.log(`[AI双向系统] 已将隐式中期记忆转化为正式中期记忆。当前中期记忆数量: ${(saveData as any).社交.记忆.中期记忆.length}`);
        }
      }
    }

    // 🔥 叙事历史存储在IndexedDB中，不限制条数
    // 叙事历史只用于UI显示和导出小说，不需要发送给AI（已在第122行移除）

    // 这里只记录触发意图；主叙事状态提交后才启动辅助总结，避免旧快照竞态。
    let shouldAutoSummarize = false;
    try {
      const memorySettings = JSON.parse(localStorage.getItem('memory-settings') || '{}');
      shouldAutoSummarize = shouldQueueAutomaticMemorySummary(saveData, memorySettings);
    } catch (error) {
      console.warn('[AI双向系统] 检查自动总结阈值时出错:', error);
    }


    if (abortRequested()) {
      return abortUncommitted('discard clone after local settlement');
    }

    const uiStore = useUIStore();
    const protectionMode = this.getCommandProtectionMode(uiStore);

    // 🔥 新增：预处理指令以修复常见的AI错误
    const preprocessingResult = this._preprocessCommands(response.tavern_commands || [], saveData);
    const commandPipeline = await validateModelCommandPipeline(preprocessingResult, saveData);
    const validCommands = commandPipeline.validCommands;
    const rejectedCommands = commandPipeline.rejectedCommands;
    if (commandPipeline.warnings.length > 0) {
      commandPipeline.warnings.forEach((warn) => console.warn(`[AI双向系统] ${warn}`));
    }

    if (!modelNarrativeCanWriteState && validCommands.length > 0) {
      for (const command of validCommands.splice(0)) {
        rejectedCommands.push({ command, errors: ['本回合由本地结构化合同独占状态写入，拒绝模型命令'] });
      }
    }

    const trustedJudgementResolution = verifyResolvedJudgementReceipt(saveData, options?.judgementResolution);
    if (trustedJudgementResolution) {
      const localOnlyPrefixes = ['角色.属性.气血.当前', '角色.属性.神识.当前', '角色.效果'];
      for (let index = validCommands.length - 1; index >= 0; index -= 1) {
        const command = validCommands[index];
        if (localOnlyPrefixes.some(prefix => command.key === prefix || command.key.startsWith(`${prefix}.`) || command.key.startsWith(`${prefix}[`))) {
          validCommands.splice(index, 1);
          rejectedCommands.push({ command, errors: ['本回合核心数值与状态效果由本地判定结算，拒绝 LLM 重复或改写'] });
        }
      }
    }

    // 本地事件合同已经原子发放的物品，模型不得再 set/add 一次。预处理会把
    // “同名但另一个 ID”的 set 归并到既有 ID，因此在预处理后按最终路径拦截即可。
    const locallySettledInventoryPaths = new Set(
      [
        ...(eventProgress?.inventorySettlements || []),
        ...(opportunityProgress.inventorySettlements || []),
      ].map(settlement => settlement.key),
    );
    if (locallySettledInventoryPaths.size > 0) {
      for (let index = validCommands.length - 1; index >= 0; index -= 1) {
        const command = validCommands[index];
        const settledPath = [...locallySettledInventoryPaths].find(path =>
          command.key === path || command.key.startsWith(`${path}.`),
        );
        if (!settledPath) continue;
        validCommands.splice(index, 1);
        rejectedCommands.push({ command, errors: ['该物品已由本地事件合同结算，拒绝 LLM 重复发放或改写'] });
      }
    }

    // 记录被拒绝的指令（格式/只读保护/value 完整性）
    if (rejectedCommands.length > 0) {
      console.error(`[AI双向系统] 共拒绝 ${rejectedCommands.length} 条无效指令（已拦截，不会执行）`);
      rejectedCommands.forEach(({ command, errors }) => {
        changes.unshift({
          key: '❌ 无效指令（已拒绝）',
          action: 'validation_error',
          oldValue: undefined,
          newValue: {
            command: JSON.stringify(command, null, 2),
            errors,
          },
        });
      });
    }

    // 🔥 步骤4：对指令排序，确保 set 上限的操作先于 set/add 当前值的操作
    // 这样突破时先改上限再改当前值，避免当前值被错误限制
    const sortedCommands = [...validCommands].sort((a, b) => {
      const isASetMax = a.action === 'set' && a.key.endsWith('.上限');
      const isBSetMax = b.action === 'set' && b.key.endsWith('.上限');
      if (isASetMax && !isBSetMax) return -1;
      if (!isASetMax && isBSetMax) return 1;
      return 0;
    });

    console.log(`[AI双向系统] 执行 ${sortedCommands.length} 条有效指令，拒绝 ${rejectedCommands.length} 条无效指令`);

    const isOnlineServerLogCommand = (cmd: any): boolean =>
      cmd && cmd.action === 'push' && typeof cmd.key === 'string' && cmd.key === '系统.联机.服务器日志';

    const saveDataSnapshotBeforeCommands = cloneDeep(saveData);
    const commandAppliedChanges: StateChange[] = [];
    const commandErrorChanges: StateChange[] = [];
    let hadExecutionError = false;

    for (const command of sortedCommands) {
      if (abortRequested()) {
        return abortUncommitted('discard clone after partial command execution');
      }
      try {
        // 单机版忽略旧 prompt 或旧存档残留的联机日志命令，且不写入存档。
        if (isOnlineServerLogCommand(command)) {
          continue;
        }

        const oldValue = get(saveData, command.key);
        this.executeCommand(command, saveData, protectionMode);
        const newValue = get(saveData, command.key);
        commandAppliedChanges.push({
          key: command.key,
          action: command.action,
          oldValue: this._summarizeValueForChangeLog(command.key, oldValue, command.action),
          newValue: this._summarizeValueForChangeLog(command.key, newValue, command.action)
        });
      } catch (error) {
        console.error(`[AI双向系统] 指令执行失败:`, command, error);
        hadExecutionError = true;
        commandErrorChanges.unshift({
          key: '? 执行失败',
          action: 'execution_error',
          oldValue: undefined,
          newValue: {
            command: JSON.stringify(command, null, 2),
            error: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }

    if (abortRequested()) {
      return abortUncommitted('discard clone before post-command reconcile');
    }

    const locallySettledInventoryIdentities = new Set(
      [
        ...(eventProgress?.inventorySettlements || []),
        ...(opportunityProgress.inventorySettlements || []),
      ]
        .map(settlement => getInventoryItemIdentityKey(settlement.receipt.itemName))
        .filter(Boolean),
    );
    const reconciledInventoryChanges = modelNarrativeCanWriteState
      ? this.reconcileNarratedInventoryPossessions(saveData, textContent, locallySettledInventoryIdentities)
      : [];
    commandAppliedChanges.push(...reconciledInventoryChanges);

    // 模型正文里的旧判定标签只做观察与剥除，绝不再触发气血写入。
    // 风险行动伤害必须来自结构化本地 judgement resolution。

    const inspectedItemChanges = modelNarrativeCanWriteState
      ? this.reconcileInspectedItemDescriptions(saveData, options?.userAction || '', textContent, sortedCommands)
      : [];
    commandAppliedChanges.push(...inspectedItemChanges);

    const inspectedNpcChanges = modelNarrativeCanWriteState
      ? this.reconcileInspectedNpcAppearance(saveData, options?.userAction || '', textContent, sortedCommands)
      : [];
    commandAppliedChanges.push(...inspectedNpcChanges);

    // 叙事-数据同步兜底（位置 + 跨轮即兴目标）。默认开，可用 localStorage 'narrative-state-reconcile'='off' 关闭。
    const narrativeReconcileEnabled = (() => {
      try {
        return localStorage.getItem('narrative-state-reconcile') !== 'off';
      } catch {
        return true;
      }
    })();
    if (modelNarrativeCanWriteState && narrativeReconcileEnabled) {
      const narrativeStateChanges = reconcileNarrativeState({
        saveDataBefore: saveDataSnapshotBeforeCommands,
        saveData,
        text: textContent,
        commands: sortedCommands,
        userAction: options?.userAction || '',
        summarize: this._summarizeValueForChangeLog.bind(this),
      });
      commandAppliedChanges.push(...narrativeStateChanges);
    }

    // #5：进度审计在上一轮写入的一次性“完成待回报”已经进入本轮 prompt。
    // 正文生成完即确定性消费；随后本轮审计若又确认新目标完成，会在下方重新写入供下一轮使用。
    const completedReceiptPath = '系统.扩展.任务追踪.最近完成待回报';
    const receiptsSeenByNarrator = get(saveDataSnapshotBeforeCommands, completedReceiptPath);
    if (textContent.trim() && Array.isArray(receiptsSeenByNarrator) && receiptsSeenByNarrator.length) {
      const currentReceipts = get(saveData, completedReceiptPath);
      unset(saveData, completedReceiptPath);
      commandAppliedChanges.push({
        key: completedReceiptPath,
        action: 'delete',
        oldValue: this._summarizeValueForChangeLog(completedReceiptPath, currentReceipts, 'delete'),
        newValue: undefined,
      });
    }

    // LLM 指令可直写气血，且 UI 将 0 视为硬死亡；正文未明确写玩家死亡时，
    // 必须把误扣的 0 恢复为濒死/昏迷保底，不能把“昏过去”变成存档死锁。
    const nonfatalRecovery = modelNarrativeCanWriteState
      ? recoverUnmarkedPlayerZeroHealth(saveData, textContent)
      : null;
    if (nonfatalRecovery) {
      console.warn(`[AI双向系统] 非致死叙事气血保底: ${nonfatalRecovery.oldValue} → ${nonfatalRecovery.newValue}`);
      commandAppliedChanges.push({
        key: '角色.属性.气血.当前',
        action: 'set',
        oldValue: this._summarizeValueForChangeLog('角色.属性.气血.当前', nonfatalRecovery.oldValue, 'set'),
        newValue: this._summarizeValueForChangeLog('角色.属性.气血.当前', nonfatalRecovery.newValue, 'set'),
      });
    }

    // 进度审计员（第二层，opt-in，默认关）：确定性兜底之后跑。gated + await；
    // 位于 step1 正文生成之后，不阻塞正文阅读，仅偶发延迟状态/选项更新。失败 no-op。
    try {
      const { useAPIManagementStore } = await import('@/stores/apiManagementStore');
      const apiStore = useAPIManagementStore();
      const currentGoals = get(saveData, '系统.扩展.任务追踪.即兴目标');
      // 已知执行错误（可能回滚）时不浪费一次审计 LLM 调用
      if (modelNarrativeCanWriteState && !hadExecutionError && apiStore.isFunctionEnabled('progress_audit') && shouldRunAudit(options?.userAction || '', currentGoals)) {
        const isolatedSaveData = cloneDeep(saveData);
        const auxStarted = Date.now();
        const auditResult = await runBoundedAuxiliaryTask(() => runProgressAudit({
          saveData: isolatedSaveData,
          recentText: textContent,
          userAction: options?.userAction || '',
          summarize: this._summarizeValueForChangeLog.bind(this),
        }), AUXILIARY_LLM_WAIT_MS);
        noteAuxWaitBeforeUnlock(Date.now() - auxStarted);
        if (auditResult.status === 'completed') {
          const isolatedGoals = get(isolatedSaveData, '系统.扩展.任务追踪.即兴目标');
          if (isolatedGoals !== undefined) set(saveData, '系统.扩展.任务追踪.即兴目标', cloneDeep(isolatedGoals));
          const isolatedReceipts = get(isolatedSaveData, '系统.扩展.任务追踪.最近完成待回报');
          if (isolatedReceipts !== undefined) {
            set(saveData, '系统.扩展.任务追踪.最近完成待回报', cloneDeep(isolatedReceipts));
          }
          commandAppliedChanges.push(...auditResult.value);
        } else if (auditResult.status === 'timed_out') {
          console.warn(`[进度审计] 超过 ${AUXILIARY_LLM_WAIT_MS}ms，主事务继续；晚到结果已隔离`);
        } else {
          console.warn('[进度审计] 辅助任务失败，主事务继续:', auditResult.error);
        }
      }
    } catch (error) {
      console.warn('[进度审计] 跳过（异常）:', error);
    }

    const actionGatePrune = pruneExpiredActionGates(saveData, getNarrativeTurn(saveData));
    if (actionGatePrune.changed) {
      commandAppliedChanges.push({
        key: '系统.扩展.行动门控.recent',
        action: 'set',
        oldValue: this._summarizeValueForChangeLog('系统.扩展.行动门控.recent', actionGatePrune.before, 'set'),
        newValue: this._summarizeValueForChangeLog('系统.扩展.行动门控.recent', actionGatePrune.after, 'set')
      });
    }

    // 🔥 步骤5：执行后安全校验（仅在结构完全损坏时回滚，防止存档被破坏）
    const applyMode = (() => {
      try {
        const raw = localStorage.getItem('command-apply-mode');
        if (raw === 'atomic' || raw === 'atomic_on_invalid_state' || raw === 'best_effort') return raw;
      } catch { /* noop */ }
      return 'best_effort' as const;
    })();

    const { validateSaveDataV3 } = await import('@/utils/saveValidationV3');
    const postValidation = validateSaveDataV3(saveData as any);

    // best_effort 模式：只有致命错误（结构完全损坏）才回滚
    // atomic 模式：任何错误或执行失败都回滚
    const shouldRollback =
      postValidation.criticalErrors.length > 0 ||
      (applyMode === 'atomic' && (hadExecutionError || !postValidation.isValid));

    if (shouldRollback) {
      const reason =
        postValidation.criticalErrors.length > 0
          ? '存档结构严重损坏（已自动回滚）'
          : 'atomic 模式下出现执行错误（已自动回滚）';

      console.error('[AI双向系统] ❌ 指令集回滚:', reason, postValidation.criticalErrors);
      saveData = saveDataSnapshotBeforeCommands;

      if (commandErrorChanges.length > 0) {
        changes.unshift(...commandErrorChanges);
      }

      changes.unshift({
        key: '❌ 指令已回滚',
        action: 'rollback',
        oldValue: undefined,
        newValue: {
          mode: applyMode,
          reason,
          validationErrors: postValidation.criticalErrors,
        },
      });
    } else {
      if (commandErrorChanges.length > 0) {
        changes.unshift(...commandErrorChanges);
      }
      if (commandAppliedChanges.length > 0) {
        changes.push(...commandAppliedChanges);
      }
    }

    updateMasteredSkills(saveData);

    if ((saveData as any).元数据?.时间) {
      (saveData as any).元数据.时间 = normalizeGameTime((saveData as any).元数据.时间);
    }

    // 每次AI响应后，检查并移除过期的状态效果
    const { removedEffects } = updateStatusEffects(saveData);
    if (removedEffects.length > 0) {
      console.log(`[AI双向系统] Pinia状态更新前: 移除了 ${removedEffects.length} 个过期效果: ${removedEffects.join(', ')}`);
    }

    // 乙(分步第2步 LLM 置布尔"主线偏移提议")是玩家主动偏移主线的唯一判定入口（整句意图判断，正则甲已废弃）。
    // 引擎在此据该布尔信号确定性置回主线引子冷却，写入 runtime(世界.状态.剧本模组.steeringCooldown)——
    // 引擎专属字段，canonGuard 保护、LLM 命令写不到；只在当前无冷却时置(guard)，避免每轮反复刷新永不衰减(Codex #2)；
    // 随后 advanceScenarioRuntime 逐轮递减。
    {
      const sys = ((saveData as any).系统 ??= {});
      const ext = (sys.扩展 ??= {});
      const tracker = (ext.任务追踪 ??= {});
      const llmProposed = tracker.主线偏移提议 === true;
      if (tracker.主线偏移提议 !== undefined) delete tracker.主线偏移提议; // 一次性信号，消费即清
      const rt = (saveData as any)?.世界?.状态?.剧本模组;
      if (rt && typeof rt === 'object') {
        const active = typeof rt.steeringCooldown === 'number' && rt.steeringCooldown > 0;
        if (llmProposed && !active) {
          rt.steeringCooldown = STEERING_DIVERGENCE_COOLDOWN;
        }
      }
    }

    // 事件对账（闭环第三环：走偏不卡死）：哨兵触发式——stallTurns 达阈值才跑，核对存档记忆
    // 补落 done/void 事件 flag，随后 advanceScenarioRuntime 当轮即推进解锁。best-effort，失败无影响。
    if (modelNarrativeCanWriteState) try {
      const rtForReconcile = (saveData as any)?.世界?.状态?.剧本模组;
      const highlightChanges = !hadExecutionError && rtForReconcile
        ? runDeterministicHighlightReconcile(saveData, textContent)
        : [];
      if (highlightChanges.length) {
        changes.push(...highlightChanges);
        console.info(`[高光对账] 逐拍证据全部命中，确定性落账 ${highlightChanges.length} 项`);
      }
      const { useAPIManagementStore } = await import('@/stores/apiManagementStore');
      const apiStoreR = useAPIManagementStore();
      const _enabled = apiStoreR.isFunctionEnabled('event_reconcile');
      // 双触发：停滞兜底阈值 || 证据即触发（本轮正文命中链上前几拍 → 当轮追账，玩家不用干等）
      const _should = shouldRunReconcile(rtForReconcile?.stallTurns)
        || (rtForReconcile ? evidenceLikely(textContent, buildChainCandidates(rtForReconcile)) : false);
      // 可选高光与主轴可能在同一轮同时收束；两条对账链必须独立运行，不能因高光
      // 已落账就吞掉主轴当轮证据、迫使玩家再等停滞兜底。
      if (!hadExecutionError && rtForReconcile && _enabled && _should) {
        const deterministicChanges = [
          ...runDeterministicXieyiReconcile(saveData, textContent),
          ...runDeterministicBijiReconcile(saveData, textContent),
        ];
        if (deterministicChanges.length) {
          changes.push(...deterministicChanges);
          console.info(`[事件对账] 谢艺互斥结果确定性落账，变更 ${deterministicChanges.length} 项`);
        } else {
        // 只记录启动意图。真正的后台对账必须等本轮确认写入 live store 之后，
        // 否则 abort 丢弃 clone 后，隔离任务仍可能三方合并并 saveCurrentGame。
        deferredEventReconcile = {
          textContent,
          userAction: options?.userAction || '',
        };
        }
      }
    } catch (error) {
      console.warn('[事件对账] 跳过（异常）:', error);
    }

    const scenarioResult = advanceScenarioRuntime(saveData);
    saveData = scenarioResult.saveData;
    ensureWuyuanOpenWorldSlice(saveData);
    const runtimeAfterAdvance = (saveData as any)?.世界?.状态?.剧本模组;
    if (
      textContent
      && stageEntryTargetBefore
      && runtimeAfterAdvance?.modId === stageEntryTargetBefore
    ) {
      acknowledgeStageEntryPresentation(saveData, stageEntryTargetBefore);
    }
    if (
      textContent
      && handoffEventIdBefore
      && runtimeAfterAdvance?.lastSettledBeat?.eventId === handoffEventIdBefore
    ) {
      acknowledgeStoryBeatHandoff(
        saveData,
        handoffEventIdBefore,
        eventProgress?.attempted ? eventProgress.eventId : undefined,
      );
    }
    if (runtimeAfterAdvance?.returnBridge && textContent) {
      // 桥接合同只消费一次；世界线账本已永久保留玩家的斩线选择。
      delete runtimeAfterAdvance.returnBridge;
    }
    scenarioResult.transitions.forEach(transition => {
      changes.push({
        key: '世界.状态.剧本模组',
        action: transition.type,
        oldValue: undefined,
        newValue: transition.id,
      });
    });
    // 共历事件好感：引擎侧结算，必须进玩家可见的状态流——否则好感涨了玩家不知道为什么，
    // 因果就只存在于代码里。key 用标准路径，复用 stateChangeFormatter 既有的好感度格式化。
    for (const grant of scenarioResult.affinityGrants || []) {
      changes.push({
        key: `社交.关系.${grant.name}.好感度`,
        action: 'shared_experience',
        oldValue: grant.from,
        newValue: grant.to,
      });
    }
    // 承重事件声望：同上，引擎侧结算也必须让玩家看见涨在哪一件事上（P1-4）。
    for (const grant of scenarioResult.reputationGrants || []) {
      changes.push({
        key: '角色.属性.声望',
        action: 'event_reputation',
        oldValue: grant.from,
        newValue: grant.to,
      });
    }
    // 里程碑奖励：称号=故事线正确落点的关卡完成奖励（引擎独占授予，AI 不能自封）
    for (const grantNote of applyMilestoneRewards(saveData, scenarioResult.transitions)) {
      changes.push({ key: '角色.身份.称号', action: 'milestone_reward', oldValue: undefined, newValue: grantNote });
    }
    // 剧情推进可见性：每轮输出推进状态，卡关时直接看 console 就知道差哪个事件/flag（此前要靠扒存档诊断）
    {
      const rt = (saveData as any)?.世界?.状态?.剧本模组;
      if (rt?.currentChapterId !== undefined) {
        const flags = rt.flags || {};
        const pending = (rt.events || [])
          .filter((e: any) => (e.critical !== false) && !(rt.completedEventIds || []).includes(e.id))
          .map((e: any) => `${e.id}${(e.completion || []).map((c: any) => `(${c.path}=${JSON.stringify(flags[String(c.path).replace(/^flags\./, '')])})`).join('')}`);
        console.info(
          `[剧本推进] 章节=${rt.currentChapterId ?? '无'} 活跃=${JSON.stringify(rt.activeEventIds || [])} ` +
          `已完成=${(rt.completedEventIds || []).length} 待完成关键事件=${pending.length ? pending.join(' ') : '无'} ` +
          `${rt.nextStageReadyId ? `✅可切下一关:${rt.nextStageReadyId}` : ''}` +
          (scenarioResult.transitions.length ? ` 本轮转移:${scenarioResult.transitions.map(t => `${t.type}:${t.id}`).join(',')}` : ''),
        );
      }
    }

    // 🔥 将状态变更添加到最新的叙事记录中
    const stateChangesLog: StateChangeLog = { changes, timestamp: new Date().toISOString() };
    if ((saveData as any).系统?.历史?.叙事 && (saveData as any).系统.历史.叙事.length > 0) {
      const latestNarrative = (saveData as any).系统.历史.叙事[(saveData as any).系统.历史.叙事.length - 1];
      (latestNarrative as any).stateChanges = stateChangesLog;
    }

    // 🔥 宗门兜底：若 AI 已生成“玩家创建/担任宗主”的宗门势力，但没初始化社交.宗门成员信息，
    // 则自动补全加入状态，让后续宗门系统（成员/藏经阁/任务等）可直接使用。
    try {
      const currentSectName = String((saveData as any)?.社交?.宗门?.成员信息?.宗门名称 || '').trim();
      if (!currentSectName) {
        const playerName = String((saveData as any)?.角色?.身份?.名字 || '').trim();
        const factions = (saveData as any)?.世界?.信息?.势力信息;

        if (playerName && Array.isArray(factions)) {
          const matchLeader = (f: any): boolean => {
            const leader =
              (typeof f?.领导层?.宗主 === 'string' ? f.领导层.宗主 : '') ||
              (typeof f?.leadership?.宗主 === 'string' ? f.leadership.宗主 : '') ||
              (typeof f?.宗主 === 'string' ? f.宗主 : '');
            return typeof leader === 'string' && leader.trim() === playerName;
          };

          const ownedSect = factions.find(matchLeader);
          if (ownedSect && typeof ownedSect === 'object' && typeof ownedSect.名称 === 'string' && ownedSect.名称.trim()) {
            const { createJoinedSectState } = await import('@/utils/sectSystemFactory');
            const { sectSystem, memberInfo } = createJoinedSectState(ownedSect, { nowIso: new Date().toISOString() });

            // 玩家创建宗门：默认给最高职位（避免“创建了宗门但自己只是外门弟子”的违和感）
            memberInfo.职位 = '宗主';
            memberInfo.贡献 = Math.max(0, Number(memberInfo.贡献 || 0));

            if (!(saveData as any).社交) (saveData as any).社交 = {};
            (saveData as any).社交.宗门 = {
              ...(sectSystem as any),
              成员信息: memberInfo,
            };

            console.log(`[AI双向系统] 已自动初始化宗门系统：${ownedSect.名称}（玩家=宗主）`);
          }
        }
      }
    } catch (e) {
      console.warn('[AI双向系统] 自动初始化宗门系统失败（非致命）:', e);
    }

    if (abortRequested()) {
      return abortUncommitted('discard clone after auxiliary wait');
    }

    if (!isInitialization) {
      const gameStateStore = useGameStateStore();
      const liveModId = String((gameStateStore.worldState as any)?.剧本模组?.modId || '');
      if (startingModId && liveModId && liveModId !== startingModId) {
        console.warn(`[AI双向系统] 关卡已从 ${startingModId} 切换为 ${liveModId}，丢弃旧关回合提交`);
        const liveSave = gameStateStore.toSaveData();
        if (liveSave) saveData = liveSave;
      } else {
        if (abortRequested()) {
          return abortUncommitted('discard clone before store write');
        }
        gameStateStore.loadFromSaveData(saveData);
        if (abortRequested()) {
          gameStateStore.loadFromSaveData(currentSaveData);
          return abortUncommitted('restore store after late abort');
        }
        if (deferredEventReconcile) {
          const baselineSaveData = cloneDeep(saveData);
          const isolatedSaveData = cloneDeep(saveData);
          const characterStore = useCharacterStore();
          const activeAtLaunch = characterStore.rootState.当前激活存档
            ? { ...characterStore.rootState.当前激活存档 }
            : null;
          const modIdAtLaunch = String((baselineSaveData as any)?.世界?.状态?.剧本模组?.modId || '');
          const reconcileText = deferredEventReconcile.textContent;
          const reconcileUserAction = deferredEventReconcile.userAction;
          deferredEventReconcile = null;

          // 事件对账负责主线 flag/分歧账本，不能丢弃；但也不能让二次 LLM 锁住正文、输入和主存档。
          // 在隔离副本继续执行，完成后做三方合并并二次落盘。
          void (async () => {
            try {
              const reconcileChanges = await runEventReconcile({
                saveData: isolatedSaveData,
                recentText: reconcileText,
                userAction: reconcileUserAction,
                summarize: this._summarizeValueForChangeLog.bind(this),
              });
              const activeNow = characterStore.rootState.当前激活存档;
              if (!activeAtLaunch || !activeNow
                || activeNow.角色ID !== activeAtLaunch.角色ID
                || activeNow.存档槽位 !== activeAtLaunch.存档槽位) {
                console.warn('[事件对账] 后台结果到达时已切换存档，安全丢弃');
                return;
              }
              const currentSave = useGameStateStore().toSaveData();
              if (!currentSave) return;
              const currentModId = String((currentSave as any)?.世界?.状态?.剧本模组?.modId || '');
              if (modIdAtLaunch && currentModId && currentModId !== modIdAtLaunch) {
                console.warn('[事件对账] 后台结果到达时关卡已切换，安全丢弃');
                return;
              }
              const merged = mergeDeferredReconcileResult(currentSave, baselineSaveData, isolatedSaveData);
              if (merged) {
                const advanced = advanceScenarioRuntime(currentSave);
                useGameStateStore().loadFromSaveData(advanced.saveData);
                await characterStore.saveCurrentGame();
                toast.info(`事件账本已后台对齐（${reconcileChanges.length} 项）`);
                console.info(`[事件对账] 后台三方合并完成，变更 ${reconcileChanges.length} 项`);
              } else {
                useGameStateStore().loadFromSaveData(currentSave);
                await characterStore.saveCurrentGame();
              }
            } catch (error) {
              console.warn('[事件对账] 后台任务失败，主事务不受影响:', error);
            }
          })();
        }
      }
      if (shouldAutoSummarize) {
        queueIsolatedMemorySummary(
          () => this.triggerMemorySummary({ silent: true }),
          error => console.error('[AI双向系统] 自动记忆总结在后台失败:', error),
        );
      }
    }

    try {
      const characterStore = useCharacterStore();
      const active = characterStore.rootState.当前激活存档;
      if (active?.角色ID && active?.存档槽位) {
        scheduleBackgroundMemoryWork(saveData, `${active.角色ID}_${active.存档槽位}`);
      }
    } catch (error) {
      console.warn('[后台记忆] 调度失败（不影响回合）:', error);
    }

    return { saveData, stateChanges: stateChangesLog };
  }


  /**
   * 触发记忆总结（公开方法，带锁）
   * 无论是自动还是手动，都通过此方法执行，以防止竞态条件。
   *
   * @param options - 总结选项，详见 MemorySummaryOptions 接口说明
   *
   * @example
   * // 默认配置（推荐）：Raw模式 + 非流式
   * await AIBidirectionalSystem.triggerMemorySummary();
   *
   * @example
   * // 标准模式 + 流式传输
   * await AIBidirectionalSystem.triggerMemorySummary({
   *   useRawMode: false,
   *   useStreaming: true
   * });
   */
  public async triggerMemorySummary(options?: MemorySummaryOptions): Promise<void> {
    const silent = options?.silent === true;
    if (this.isSummarizing) {
      if (!silent) toast.warning('已有一个总结任务正在进行中，请稍候...');
      console.log('[AI双向系统] 检测到已有总结任务在运行，本次触发被跳过。');
      return;
    }

    this.isSummarizing = true;
    console.log('[AI双向系统] 开始记忆总结流程...');
    if (!silent) toast.loading('正在调用AI总结中期记忆...', { id: 'memory-summary' });

    try {
      const gameStateStore = useGameStateStore();
      const characterStore = useCharacterStore();
      const saveData = gameStateStore.toSaveData();

      if (!saveData || !(saveData as any).社交?.记忆) {
        throw new Error('无法获取存档数据或记忆模块');
      }

      // 1. 从 localStorage 读取最新配置（容错：防止 JSON 损坏导致整个流程失败）
      let settings: any = {};
      try {
        settings = JSON.parse(localStorage.getItem('memory-settings') || '{}');
      } catch {
        settings = {};
      }
      const midTermTrigger = settings.midTermTrigger ?? 25;
      const midTermKeep = settings.midTermKeep ?? 8;
      const longTermFormat = settings.longTermFormat || '';

      // 2. 再次检查是否需要总结
      const midTermMemories = (saveData as any).社交.记忆.中期记忆 || [];

      // 检查中期记忆数量是否达到触发阈值
      if (midTermMemories.length < midTermTrigger) {
        console.log(`[AI双向系统] 中期记忆数量(${midTermMemories.length})未达到触发阈值(${midTermTrigger})，取消总结。`);
        if (!silent) toast.info(`中期记忆未达到触发阈值(${midTermTrigger}条)，已取消总结`, { id: 'memory-summary' });
        return;
      }

      // 3. 确定要总结和保留的记忆
      // 需要总结的数量 = 触发阈值 - 保留数量（例如：25 - 8 = 17条）
      const numToSummarize = midTermTrigger - midTermKeep;

      if (numToSummarize <= 0) {
        console.log('[AI双向系统] 计算出的总结数量 <= 0，配置错误，取消操作。');
        if (!silent) toast.error('记忆配置错误：触发阈值必须大于保留数量', { id: 'memory-summary' });
        return;
      }

      if (midTermMemories.length < numToSummarize) {
        console.log(`[AI双向系统] 中期记忆数量(${midTermMemories.length})不足以总结${numToSummarize}条，取消总结。`);
        if (!silent) toast.info(`中期记忆不足${numToSummarize}条，已取消总结`, { id: 'memory-summary' });
        return;
      }

      // 从最旧的记忆开始（数组前面），取出需要总结的数量
      const memoriesToSummarize = midTermMemories.slice(0, numToSummarize);
      // 保留剩余的记忆（从 numToSummarize 位置开始到末尾）
      const memoriesToKeep = midTermMemories.slice(numToSummarize);
      const memoriesText = memoriesToSummarize.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n');

      console.log(`[AI双向系统] 准备总结：从${midTermMemories.length}条中期记忆中，总结最旧的${numToSummarize}条，保留最新的${memoriesToKeep.length}条`);
      console.log(`[AI双向系统] 配置：触发阈值=${midTermTrigger}, 保留数量=${midTermKeep}, 总结数量=${numToSummarize}`);

      // 4. 使用用户自定义的记忆总结提示词
      const memorySummaryPrompt = await getPrompt('memorySummary');
      const userPrompt = memorySummaryPrompt.replace('{{记忆内容}}', memoriesText);

      // 5. 调用 AI
      const tavernHelper = getTavernHelper();

      // 从aiService读取通用配置（流式等）
      const { aiService } = await import('@/services/aiService');
      const aiConfig = aiService.getConfig();
      const useStreaming = options?.useStreaming ?? (aiConfig.streaming !== false);

      // 记忆总结模式：从 API管理 的“功能分配 -> 模式”读取（酒馆端有效）
      let useRawMode = typeof options?.useRawMode === 'boolean' ? options.useRawMode : true;
      if (typeof options?.useRawMode !== 'boolean') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useAPIManagementStore } = require('@/stores/apiManagementStore');
          const apiStore = useAPIManagementStore();
          useRawMode = apiStore.getFunctionMode('memory_summary') === 'raw';
        } catch {
          // 兼容旧配置
          useRawMode = aiConfig.memorySummaryMode === 'raw';
        }
      }

      // 检查AI服务可用性
      if (!tavernHelper) {
        const availability = aiService.checkAvailability();
        if (!availability.available) {
          throw new Error(availability.message);
        }
      }

      // 🔥 获取精简版游戏存档数据（只包含记忆总结需要的信息）
      const simplifiedSaveData = this._extractEssentialDataForSummary(saveData);
      const saveDataJson = JSON.stringify(simplifiedSaveData, null, 2);

      console.log(`[AI双向系统] 记忆总结模式: ${useRawMode ? 'Raw模式（纯净总结）' : '标准模式（带预设）'}, 传输方式: ${useStreaming ? '流式' : '非流式'}`);

      let response: string;

      if (tavernHelper) {
        // 酒馆模式
        if (useRawMode) {
          // Raw模式：使用自定义提示词
          const rawResponse = await tavernHelper.generateRaw({
            ordered_prompts: [
              { role: 'system', content: `【游戏存档数据】（供参考）：\n${saveDataJson}` },
              { role: 'user', content: userPrompt },
              { role: 'user', content: ['Continue.', 'Proceed.', 'Next.', 'Go on.', 'Resume.'][Math.floor(Math.random() * 5)] },
              { role: 'assistant', content: '</input>' }
            ],
            should_stream: useStreaming,
            usageType: 'memory_summary'
          });
          response = String(rawResponse);
        } else {
          // 标准模式：使用自定义提示词
          const systemPromptCombined = `${memorySummaryPrompt}

【游戏存档数据】（供参考）：
${saveDataJson}`;

          const standardResponse = await tavernHelper.generate({
            user_input: userPrompt,
            should_stream: useStreaming,
            generation_id: `memory_summary_${Date.now()}`,
            usageType: 'memory_summary',
            injects: [
              {
                content: systemPromptCombined,
                role: 'system',
                depth: 4,  // 插入到较深位置，确保在用户输入之前
                position: 'in_chat'
              },
              // 🛡️ 添加assistant角色的占位消息（防止输入截断）
              {
                content: '</input>',
                role: 'assistant',
                depth: 0,  // 插入到最新位置
                position: 'in_chat'
              }
            ]
          });
          response = String(standardResponse);
        }
      } else {
        // 自定义API模式
        if (useRawMode) {
          console.log('[AI双向系统] 自定义API模式 - Raw模式记忆总结');
          response = await aiService.generateRaw({
            ordered_prompts: [
              { role: 'system', content: `【游戏存档数据】（供参考）：\n${saveDataJson}` },
              { role: 'user', content: userPrompt },
              { role: 'user', content: ['Continue.', 'Proceed.', 'Next.', 'Go on.', 'Resume.'][Math.floor(Math.random() * 5)] }
            ],
            should_stream: useStreaming,
            usageType: 'memory_summary'
          });
        } else {
          console.log('[AI双向系统] 自定义API模式 - 标准模式记忆总结');
          const systemPromptCombined = `${memorySummaryPrompt}

【游戏存档数据】（供参考）：
${saveDataJson}`;

          response = await aiService.generate({
            user_input: userPrompt,
            should_stream: useStreaming,
            generation_id: `memory_summary_${Date.now()}`,
            usageType: 'memory_summary',
            injects: [
              {
                content: systemPromptCombined,
                role: 'system',
                depth: 4,
                position: 'in_chat'
              }
            ] as any
          });
        }
      }

      // 与读档清扫共用同一规则，避免新总结再次写入思维链、JSON 包装或任务说明。
      const summaryText = sanitizePersistedMemoryEntry(response);

      if (!summaryText || summaryText.length === 0) {
        throw new Error('AI返回了空的总结结果');
      }

      console.log('[AI双向系统] 总结文本长度:', summaryText.length, '预览:', summaryText.substring(0, 100));

      // 6. 更新游戏状态
      // 长期记忆不需要时间前缀和【记忆总结】标签，直接存储总结内容
      const newLongTermMemory = summaryText;

      // 确保 memory 对象存在
      if (!gameStateStore.memory) {
        gameStateStore.memory = { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] };
      }

      const remainingCurrentMemories = remainingMemoriesAfterSummary(
        gameStateStore.memory.中期记忆,
        memoriesToSummarize,
      );
      if (!remainingCurrentMemories) {
        throw new Error('总结期间中期记忆前缀已变化，已放弃本次提交以避免覆盖新正文');
      }
      gameStateStore.memory.长期记忆.push(newLongTermMemory);
      gameStateStore.memory.中期记忆 = remainingCurrentMemories;

      // 🔥 同步到长期检索索引：LLM 已结束，只把写索引送进存档互斥队列。
      try {
        const active = characterStore.rootState.当前激活存档;
        const saveSlot = active?.角色ID && active?.存档槽位 ? `${active.角色ID}_${active.存档槽位}` : '';
        await commitMemorySummaryIndex({
          saveSlot,
          write: async () => {
            const { vectorMemoryService } = await import('@/services/vectorMemoryService');
            if (vectorMemoryService.canAutoIndex()) {
              await vectorMemoryService.addMemory(newLongTermMemory, 7);
              console.log('[长期检索] 新长期记忆已添加到检索索引');
            }
          },
        });
      } catch (e) {
        console.warn('[长期检索] 添加到检索索引失败:', e);
      }

      // 7. 保存到存档
      await characterStore.saveCurrentGame();

      console.log(`[AI双向系统] ✅ 总结完成：${numToSummarize}条中期记忆 -> 1条长期记忆。保留 ${remainingCurrentMemories.length} 条。`);
      if (!silent) toast.success(`成功总结 ${numToSummarize} 条记忆！`, { id: 'memory-summary' });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error('[AI双向系统] 记忆总结失败:', error);
      if (!silent) toast.error(`记忆总结失败: ${errorMsg}`, { id: 'memory-summary' });
    } finally {
      this.isSummarizing = false;
      console.log('[AI双向系统] 记忆总结流程结束，已释放锁。');
    }
  }

  private _preprocessCommands(commands: any[], saveData?: SaveData): any[] {
    if (!Array.isArray(commands)) return [];

    const inventoryRootKeys = new Set(['角色.背包.物品', '背包.物品', '物品栏.物品']);
    const allowedRoots = ['元数据', '角色', '社交', '世界', '系统'] as const;

    const normalizeCommandKey = (key: unknown): unknown => {
      if (typeof key !== 'string') return key;
      const trimmed = key.trim();
      if (!trimmed) return key;

      // common "looks-valid" but wrong V3 paths -> correct paths
      if (trimmed === '角色.声望' || trimmed.startsWith('角色.声望.')) return trimmed.replace(/^角色\.声望/, '角色.属性.声望');
      if (trimmed === '角色.气血' || trimmed.startsWith('角色.气血.')) return trimmed.replace(/^角色\.气血/, '角色.属性.气血');
      if (trimmed === '角色.灵气' || trimmed.startsWith('角色.灵气.')) return trimmed.replace(/^角色\.灵气/, '角色.属性.灵气');
      if (trimmed === '角色.神识' || trimmed.startsWith('角色.神识.')) return trimmed.replace(/^角色\.神识/, '角色.属性.神识');
      if (trimmed === '角色.寿命' || trimmed.startsWith('角色.寿命.')) return trimmed.replace(/^角色\.寿命/, '角色.属性.寿命');
      if (trimmed === '角色.境界' || trimmed.startsWith('角色.境界.')) return trimmed.replace(/^角色\.境界/, '角色.属性.境界');
      if (trimmed === '角色.状态效果' || trimmed.startsWith('角色.状态效果')) return trimmed.replace(/^角色\.状态效果/, '角色.效果');

      // legacy time shortcuts -> V3
      if (trimmed === '游戏时间') return '元数据.时间';
      if (trimmed.startsWith('游戏时间.')) return `元数据.时间.${trimmed.slice('游戏时间.'.length)}`;
      if (trimmed === '时间') return '元数据.时间';
      if (trimmed.startsWith('时间.')) return `元数据.时间.${trimmed.slice('时间.'.length)}`;

      // legacy memory shortcuts -> V3
      if (trimmed === '记忆') return '社交.记忆';
      if (trimmed.startsWith('记忆.')) return `社交.记忆.${trimmed.slice('记忆.'.length)}`;

      // legacy relationship shortcuts -> V3 (see docs/save-schema-v3.md)
      if (trimmed === '人物关系' || trimmed === '关系') return '社交.关系';
      if (trimmed.startsWith('人物关系.')) return `社交.关系.${trimmed.slice('人物关系.'.length)}`;
      if (trimmed.startsWith('关系.')) return `社交.关系.${trimmed.slice('关系.'.length)}`;
      if (trimmed === '关系矩阵' || trimmed === '关系网') return '社交.关系矩阵';
      if (trimmed.startsWith('关系矩阵.')) return `社交.关系矩阵.${trimmed.slice('关系矩阵.'.length)}`;
      if (trimmed.startsWith('关系网.')) return `社交.关系矩阵.${trimmed.slice('关系网.'.length)}`;

      // other common legacy shortcuts -> V3 (align with V3 schema mapping table)
      if (trimmed === '宗门系统' || trimmed === '宗门') return '社交.宗门';
      if (trimmed.startsWith('宗门系统.')) return `社交.宗门.${trimmed.slice('宗门系统.'.length)}`;
      if (trimmed.startsWith('宗门.')) return `社交.宗门.${trimmed.slice('宗门.'.length)}`;
      if (trimmed === '世界信息' || trimmed === '世界') return '世界.信息';
      if (trimmed.startsWith('世界信息.')) return `世界.信息.${trimmed.slice('世界信息.'.length)}`;
      if (trimmed.startsWith('世界.')) return trimmed; // keep world root as-is if already V3-like
      if (trimmed === '叙事历史' || trimmed === '历史.叙事') return '系统.历史.叙事';
      if (trimmed.startsWith('叙事历史.')) return `系统.历史.叙事.${trimmed.slice('叙事历史.'.length)}`;
      if (trimmed === '系统配置') return '系统.配置';
      if (trimmed.startsWith('系统配置.')) return `系统.配置.${trimmed.slice('系统配置.'.length)}`;

      // legacy attribute shortcuts -> V3
      if (trimmed === '声望' || trimmed.startsWith('声望.')) return `角色.属性.${trimmed}`;
      if (trimmed === '气血' || trimmed.startsWith('气血.')) return `角色.属性.${trimmed}`;
      if (trimmed === '灵气' || trimmed.startsWith('灵气.')) return `角色.属性.${trimmed}`;
      if (trimmed === '神识' || trimmed.startsWith('神识.')) return `角色.属性.${trimmed}`;
      if (trimmed === '寿命' || trimmed.startsWith('寿命.')) return `角色.属性.${trimmed}`;
      if (trimmed === '境界' || trimmed.startsWith('境界.')) return `角色.属性.${trimmed}`;

      // already V3
      if (allowedRoots.some((r) => trimmed === r || trimmed.startsWith(`${r}.`))) return trimmed;

      // legacy shortcuts -> V3
      if (trimmed === '位置' || trimmed.startsWith('位置.')) return `角色.${trimmed}`;
      if (trimmed === '属性' || trimmed.startsWith('属性.')) return `角色.${trimmed}`;
      if (trimmed === '背包' || trimmed.startsWith('背包.')) return `角色.${trimmed}`;
      if (trimmed === '物品栏' || trimmed.startsWith('物品栏.')) return `角色.背包.${trimmed.slice('物品栏.'.length)}`;
      if (trimmed === '装备' || trimmed.startsWith('装备.')) return `角色.${trimmed}`;
      if (trimmed === '效果' || trimmed.startsWith('效果')) return `角色.${trimmed}`;
      if (trimmed === '大道' || trimmed.startsWith('大道.')) return `角色.${trimmed}`;
      if (trimmed === '修炼' || trimmed.startsWith('修炼.')) return `角色.${trimmed}`;
      if (trimmed === '技能' || trimmed.startsWith('技能.')) return `角色.${trimmed}`;

      return trimmed;
    };

    const expandLegacySetState = (cmd: any): any[] | null => {
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return null;

      // Some models still output the old `{ set_state: { "路径": 值 } }` format.
      const payload = (cmd as any).set_state ?? (cmd as any).setState ?? null;
      if (!payload) return null;

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

      const entries = Object.entries(payload as Record<string, any>);
      if (entries.length === 0) return [];

      console.warn(`[AI双向系统] 预处理: 发现旧指令格式 set_state，已转换为 ${entries.length} 条 set 指令。`);
      return entries.map(([k, v]) => ({
        action: 'set',
        key: normalizeCommandKey(k),
        value: v
      }));
    };

    // 防误伤：AI 常把“更新NPC字段”写成整体 set `社交.关系.某人 = { 好感度: ... }`，
    // 这会覆盖并丢失原有字段，导致“人物不新增/人物消失/数据结构异常”。
    // 这里统一把整体 set 拆成字段级 set，避免覆盖整对象。
    const expandNpcWholeSet = (cmd: any): any[] | null => {
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return null;
      if ((cmd as any).action !== 'set') return null;
      if (typeof (cmd as any).key !== 'string') return null;
      const key = String((cmd as any).key);
      if (!/^社交\.关系\.[^\.]+$/.test(key)) return null;
      const value = (cmd as any).value;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

      const npcNameFromKey = key.split('.')[2];
      const obj = value as Record<string, any>;
      const expanded: any[] = [];

      if (!Object.prototype.hasOwnProperty.call(obj, '名字') && npcNameFromKey) {
        expanded.push({ action: 'set', key: `${key}.名字`, value: npcNameFromKey });
      }

      for (const [k, v] of Object.entries(obj)) {
        expanded.push({ action: 'set', key: `${key}.${k}`, value: v });
      }

      if (expanded.length > 0) {
        console.warn(`[AI双向系统] 预处理: 将整体 set "${key}" 拆分为 ${expanded.length} 条字段 set，避免覆盖丢字段。`);
      }
      return expanded;
    };

    // 兼容：AI 把“新增NPC”写成 `set 社交.关系 = { 张三: {...}, 李四: {...} }`
    // 该写法会被指令保护拒绝（禁止整体 set 社交.关系），因此在这里拆分为逐个 NPC 的 set。
    const expandSocialRelationsWholeSet = (cmd: any): any[] | null => {
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return null;
      if ((cmd as any).action !== 'set') return null;
      if (typeof (cmd as any).key !== 'string') return null;
      const key = String((cmd as any).key);
      if (key !== '社交.关系') return null;
      const value = (cmd as any).value;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

      const expanded: any[] = [];
      for (const [npcName, npcValue] of Object.entries(value as Record<string, any>)) {
        if (!npcName || typeof npcName !== 'string') continue;
        if (!npcValue || typeof npcValue !== 'object') continue;
        // 直接拆成字段 set，避免完整覆盖导致缺字段/被校验拒绝
        const expandedNpc = expandNpcWholeSet({ action: 'set', key: `社交.关系.${npcName}`, value: npcValue });
        if (expandedNpc) expanded.push(...expandedNpc);
        else expanded.push({ action: 'set', key: `社交.关系.${npcName}`, value: npcValue });
      }

      if (expanded.length > 0) {
        console.warn(`[AI双向系统] 预处理: 将整体 set "社交.关系" 拆分为 ${expanded.length} 条 NPC set，避免被保护拒绝。`);
      }
      return expanded;
    };

    // 兼容：AI 把“新增NPC”写成 `push 社交.关系`（但社交.关系 是对象，不是数组，会导致执行时报错）
    const expandSocialRelationsPush = (cmd: any): any[] | null => {
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return null;
      if ((cmd as any).action !== 'push') return null;
      if (typeof (cmd as any).key !== 'string') return null;
      const key = String((cmd as any).key);
      if (key !== '社交.关系') return null;
      const value = (cmd as any).value;
      if (!value) return null;

      // 情况1：push 一个 NPC 对象（包含名字/性别/出生日期之一）
      if (typeof value === 'object' && !Array.isArray(value)) {
        const maybeNpcName = (value as any).名字;
        if (typeof maybeNpcName === 'string' && maybeNpcName.trim()) {
          const expandedNpc = expandNpcWholeSet({ action: 'set', key: `社交.关系.${maybeNpcName.trim()}`, value });
          return expandedNpc || [{ action: 'set', key: `社交.关系.${maybeNpcName.trim()}`, value }];
        }
      }

      // 情况2：push 一个 { 张三: {...} } 的对象（当作关系字典）
      if (typeof value === 'object' && !Array.isArray(value)) {
        const expanded = expandSocialRelationsWholeSet({ action: 'set', key: '社交.关系', value });
        if (expanded) return expanded;
      }

      return null;
    };

    // 兼容：AI 把“NPC记忆/关系变更”等写成 `push 社交.关系.某人`（少了 .记忆 / .关系矩阵 等后缀）
    // - string -> 视为 NPC 记忆：push 到 `社交.关系.<NPC>.记忆`
    // - object -> 视为 NPC 部分/完整数据：转为 set 并继续走 NPC 拆分逻辑
    const expandNpcRootPush = (cmd: any): any[] | null => {
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return null;
      if ((cmd as any).action !== 'push') return null;
      if (typeof (cmd as any).key !== 'string') return null;
      const key = String((cmd as any).key);
      if (!/^社交\.关系\.[^\.]+$/.test(key)) return null;

      const npcName = key.split('.')[2];
      const value = (cmd as any).value;

      if (typeof value === 'string') {
        return [{ action: 'push', key: `社交.关系.${npcName}.记忆`, value }];
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const toSet = { action: 'set', key: `社交.关系.${npcName}`, value };
        const expandedNpc = expandNpcWholeSet(toSet);
        return expandedNpc || [toSet];
      }

      return null;
    };

    // 兼容：AI 把“NPC好感变化”写成 `add 社交.关系.<NPC> 10`
    // 规则：当 add 目标是 NPC 根对象时，默认改写为 add 到 .好感度
    const expandNpcRootAdd = (cmd: any): any[] | null => {
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return null;
      if ((cmd as any).action !== 'add') return null;
      if (typeof (cmd as any).key !== 'string') return null;
      const key = String((cmd as any).key);
      if (!/^社交\.关系\.[^\.]+$/.test(key)) return null;

      const npcName = key.split('.')[2];
      const value = (cmd as any).value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return [{ action: 'add', key: `社交.关系.${npcName}.好感度`, value }];
      }

      return null;
    };

    const out: any[] = [];
    const inventoryPath = '角色.背包.物品';

    // 好感度写入权门禁（R3-9 §7 混合裁定）。逻辑在 affinityLadder，本处只按回合建实例。
    // 本函数只处理 LLM 返回的 tavern_commands，引擎路径（关卡初始化、确定性降档）不经过这里。
    // 注入 lookup/capOf 后，好感上限（affinityCaps）也在此层执行。
    const gateAffinity = createAffinityCommandGate({
      lookup: (npcName: string) => {
        const npc = get(saveData, `社交.关系.${npcName}`) as { 好感度?: unknown; 与玩家关系?: unknown } | undefined;
        if (!npc || typeof npc !== 'object') return undefined;
        return {
          favorability: Number(npc.好感度) || 0,
          relationLabel: typeof npc.与玩家关系 === 'string' ? npc.与玩家关系 : undefined,
        };
      },
      capOf: (npcName: string, relationLabel?: string) => affinityCapFor(npcName, relationLabel),
    });

    const isInventoryRootSet = (cmd: any): boolean => (
      cmd?.action === 'set' &&
      cmd?.key === inventoryPath &&
      cmd.value &&
      typeof cmd.value === 'object' &&
      !Array.isArray(cmd.value) &&
      (((cmd.value as any).物品ID && typeof (cmd.value as any).物品ID === 'string') ||
        (typeof (cmd.value as any).名称 === 'string' && (cmd.value as any).名称) ||
        (typeof (cmd.value as any).类型 === 'string' && (cmd.value as any).类型))
    );

    const isInventoryItemSet = (cmd: any): boolean => (
      cmd?.action === 'set' &&
      typeof cmd.key === 'string' &&
      cmd.key.startsWith(`${inventoryPath}.`) &&
      (cmd.key.match(/\./g) || []).length === 3 &&
      cmd.value &&
      typeof cmd.value === 'object' &&
      !Array.isArray(cmd.value)
    );

    const normalizeInventoryItemPayload = (itemValue: any): any => {
      if (!itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) return itemValue;
      const normalized = { ...itemValue };
      if (typeof normalized.名称 === 'string') {
        const normalizedName = normalizeNarratedItemName(normalized.名称);
        if (normalizedName) normalized.名称 = normalizedName;
      }
      if (!normalized.品质 || typeof normalized.品质 !== 'object') {
        normalized.品质 = { quality: '凡', grade: 1 };
      } else {
        if (normalized.品质.quality === '凡品') normalized.品质.quality = '凡';
        if (normalized.品质.grade === 0 && !/残|破|碎|缺/.test(String(normalized.名称 || normalized.描述 || ''))) {
          normalized.品质.grade = 1;
        }
      }
      return normalized;
    };

    const findExistingInventoryItemId = (itemName: unknown): string | null => {
      if (!saveData || typeof itemName !== 'string') return null;
      const identity = getInventoryItemIdentityKey(itemName);
      if (!identity) return null;
      const items = get(saveData, inventoryPath, {}) as Record<string, any>;
      if (!items || typeof items !== 'object' || Array.isArray(items)) return null;
      for (const [itemId, item] of Object.entries(items)) {
        const existingName = typeof item?.名称 === 'string' ? item.名称 : '';
        if (existingName && getInventoryItemIdentityKey(existingName) === identity) return itemId;
      }
      return null;
    };

    const shouldStackInventoryItem = (itemValue: any): boolean => {
      if (!itemValue || typeof itemValue !== 'object') return false;
      if (itemValue.可叠加 === true) return true;
      return /丹药|丹丸|材料|灵草|灵材|矿石|食物|货物/.test(String(itemValue.类型 || itemValue.名称 || ''));
    };

    const buildDuplicateInventoryCommand = (itemValue: any, existingItemId: string): any | null => {
      if (shouldStackInventoryItem(itemValue)) {
        const amount = typeof itemValue.数量 === 'number' && Number.isFinite(itemValue.数量)
          ? Math.max(1, itemValue.数量)
          : 1;
        return { action: 'add', key: `${inventoryPath}.${existingItemId}.数量`, value: amount };
      }
      return null;
    };

    // 使用队列逐条预处理，确保“展开出来的新指令”也会继续经过后续纠错与拆分
    const queue: any[] = [...commands];
    while (queue.length > 0) {
      const cmd = queue.shift();

      // Expand legacy format first (may turn 1 object into N commands).
      const expanded = expandLegacySetState(cmd);
      if (expanded) {
        queue.unshift(...expanded);
        continue;
      }

      if (!cmd || typeof cmd !== 'object') {
        out.push(cmd);
        continue;
      }

      if (typeof (cmd as any).key === 'string') {
        const normalized = normalizeCommandKey((cmd as any).key);
        if (typeof normalized === 'string' && normalized !== (cmd as any).key) {
          console.warn(`[AI双向系统] 预处理: key 纠正 "${(cmd as any).key}" -> "${normalized}"`);
          (cmd as any).key = normalized;
        }
      }

      const expandedRelations = expandSocialRelationsWholeSet(cmd);
      if (expandedRelations) {
        queue.unshift(...expandedRelations);
        continue;
      }

      const expandedRelationsPush = expandSocialRelationsPush(cmd);
      if (expandedRelationsPush) {
        queue.unshift(...expandedRelationsPush);
        continue;
      }

      const expandedNpcRootPush = expandNpcRootPush(cmd);
      if (expandedNpcRootPush) {
        queue.unshift(...expandedNpcRootPush);
        continue;
      }

      const expandedNpcRootAdd = expandNpcRootAdd(cmd);
      if (expandedNpcRootAdd) {
        queue.unshift(...expandedNpcRootAdd);
        continue;
      }

      // 先做 NPC 整体 set 拆分（避免后续校验把它当作“完整NPC覆盖”而拒绝/或导致覆盖丢字段）
      const expandedNpc = expandNpcWholeSet(cmd);
      if (expandedNpc) {
        queue.unshift(...expandedNpc);
        continue;
      }

      // 修复: set 元数据.时间 时缺少小时/分钟（补齐为 0，避免时间显示异常）
      if (cmd.action === 'set' && cmd.key === '元数据.时间' && cmd.value && typeof cmd.value === 'object' && !Array.isArray(cmd.value)) {
        const t = cmd.value as Record<string, any>;
        if (typeof t.小时 !== 'number') t.小时 = 0;
        if (typeof t.分钟 !== 'number') t.分钟 = 0;
      }

      if (isInventoryItemSet(cmd)) {
        let itemValue = normalizeInventoryItemPayload(cmd.value);
        if (itemValue.类型 === '功法') itemValue = this._repairTechniqueItem(itemValue);
        const existingItemId = findExistingInventoryItemId(itemValue.名称);
        const targetItemId = String(cmd.key).slice(`${inventoryPath}.`.length);
        if (existingItemId && existingItemId !== targetItemId) {
          const replacement = buildDuplicateInventoryCommand(itemValue, existingItemId);
          if (replacement) {
            console.warn(`[AI双向系统] 预处理: 背包同名可叠加物品 "${itemValue.名称}" → add ${inventoryPath}.${existingItemId}.数量`);
            out.push(replacement);
          } else {
            console.warn(`[AI双向系统] 预处理: 跳过重复背包物品 "${itemValue.名称}"（已有 ${existingItemId}）`);
          }
          continue;
        }
        itemValue.物品ID = targetItemId;
        cmd.value = itemValue;
      }

      // 修复: AI 把“新增一个物品”写成 set 角色.背包.物品 = {物品对象}
      if (isInventoryRootSet(cmd)) {
        let itemValue: any = normalizeInventoryItemPayload(cmd.value);
        if (itemValue.类型 === '功法') itemValue = this._repairTechniqueItem(itemValue);
        const existingItemId = findExistingInventoryItemId(itemValue.名称);
        if (existingItemId) {
          const replacement = buildDuplicateInventoryCommand(itemValue, existingItemId);
          if (replacement) {
            console.warn(`[AI双向系统] 预处理: 背包根 set 同名可叠加物品 "${itemValue.名称}" → add ${inventoryPath}.${existingItemId}.数量`);
            out.push(replacement);
          } else {
            console.warn(`[AI双向系统] 预处理: 跳过背包根 set 重复物品 "${itemValue.名称}"（已有 ${existingItemId}）`);
          }
          continue;
        }
        const itemId =
          typeof itemValue.物品ID === 'string' && itemValue.物品ID.trim()
            ? itemValue.物品ID.trim()
            : `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        itemValue.物品ID = itemId;
        console.warn(`[AI双向系统] 预处理: 背包物品 set-root→set 角色.背包.物品.${itemId}`);
        out.push({ action: 'set', key: `角色.背包.物品.${itemId}`, value: itemValue });
        continue;
      }

      // 修复: AI 把背包物品当数组 push（实际是对象字典）
      if (cmd.action === 'push' && typeof cmd.key === 'string' && inventoryRootKeys.has(cmd.key)) {
        let itemValue: any = cmd.value ?? null;

        // 兼容：push 进来的是字符串（物品名）
        if (typeof itemValue === 'string') {
          const itemName = normalizeNarratedItemName(itemValue.trim());
          itemValue = {
            物品ID: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            名称: itemName || '未知物品',
            类型: '杂物',
            品质: { quality: '凡', grade: 1 },
            数量: 1,
            描述: `一个普通的${itemName || '物品'}。`
          };
        }
        itemValue = normalizeInventoryItemPayload(itemValue);

        // 若是功法物品，补齐功法技能等字段，避免后续校验/显示异常
        if (itemValue && typeof itemValue === 'object' && itemValue.类型 === '功法') {
          itemValue = this._repairTechniqueItem(itemValue);
        }

        const existingItemId = itemValue && typeof itemValue === 'object' ? findExistingInventoryItemId(itemValue.名称) : null;
        if (existingItemId) {
          const replacement = buildDuplicateInventoryCommand(itemValue, existingItemId);
          if (replacement) {
            console.warn(`[AI双向系统] 预处理: 背包 push 同名可叠加物品 "${itemValue.名称}" → add ${inventoryPath}.${existingItemId}.数量`);
            out.push(replacement);
          } else {
            console.warn(`[AI双向系统] 预处理: 跳过背包 push 重复物品 "${itemValue.名称}"（已有 ${existingItemId}）`);
          }
          continue;
        }

        const itemId =
          itemValue && typeof itemValue === 'object' && typeof itemValue.物品ID === 'string' && itemValue.物品ID.trim()
            ? itemValue.物品ID.trim()
            : `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        if (itemValue && typeof itemValue === 'object') {
          itemValue.物品ID = itemId;
        }

        console.warn(`[AI双向系统] 预处理: 背包物品 push→set 角色.背包.物品.${itemId}`);
        out.push({
          action: 'set',
          key: `角色.背包.物品.${itemId}`,
          value: itemValue
        });
        continue;
      }

      // 修复: AI推送一个字符串而不是物品对象到物品栏
      if (cmd.action === 'push' && inventoryRootKeys.has(cmd.key) && typeof cmd.value === 'string') {
        console.warn(`[AI双向系统] 预处理: 将字符串物品 "${cmd.value}" 转换为对象。`);
        const itemName = cmd.value;
        out.push({
          ...cmd,
          value: {
            物品ID: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            名称: normalizeNarratedItemName(itemName),
            类型: '杂物',
            品质: { quality: '凡', grade: 1 },
            数量: 1,
            描述: `一个普通的${itemName}。`
          }
        });
        continue;
      }

      // 修复: 新增功法但缺少功法技能数组，导致后续生成/校验报错
      const isInventoryItemCreation =
        (cmd.action === 'push' && inventoryRootKeys.has(cmd.key)) ||
        (cmd.action === 'set' &&
          typeof cmd.key === 'string' &&
          Array.from(inventoryRootKeys).some((root) => cmd.key.startsWith(root + '.')));

      if (isInventoryItemCreation && cmd.value && typeof cmd.value === 'object' && cmd.value.类型 === '功法') {
        out.push({ ...cmd, value: this._repairTechniqueItem(cmd.value) });
        continue;
      }

      const affinityGated = gateAffinity(cmd);
      if (affinityGated.warning) console.warn(`[AI双向系统] ${affinityGated.warning}`);
      if (affinityGated.command === null) continue;
      out.push(affinityGated.command);
    }

    return out;
  }

  private _repairTechniqueItem(item: any): any {
    if (!item || typeof item !== 'object') return item;
    if (item.类型 !== '功法') return item;

    const repaired: any = { ...item };

    const techniqueName = typeof repaired.名称 === 'string' && repaired.名称.trim() ? repaired.名称.trim() : '未知功法';

    // 🔥 补齐功法物品基础字段（否则会在 commandValueValidator 中被拒绝，导致“背包没新增功法”）
    if (typeof repaired.物品ID !== 'string' || !repaired.物品ID.trim()) {
      repaired.物品ID = `gongfa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } else {
      repaired.物品ID = repaired.物品ID.trim();
    }

    repaired.类型 = '功法';

    if (!repaired.品质 || typeof repaired.品质 !== 'object') {
      repaired.品质 = { quality: '凡', grade: 0 };
    } else {
      if (typeof repaired.品质.quality !== 'string' || !repaired.品质.quality.trim()) repaired.品质.quality = '凡';
      if (typeof repaired.品质.grade !== 'number' || !Number.isFinite(repaired.品质.grade)) repaired.品质.grade = 0;
    }

    if (typeof repaired.数量 !== 'number' || !Number.isFinite(repaired.数量)) repaired.数量 = 1;
    if (repaired.描述 === undefined) repaired.描述 = `一部名为《${techniqueName}》的功法。`;

    const progress =
      typeof repaired.修炼进度 === 'number' && Number.isFinite(repaired.修炼进度) ? repaired.修炼进度 : 0;
    repaired.修炼进度 = Math.max(0, Math.min(100, progress));

    if (!Array.isArray(repaired.功法技能)) {
      repaired.功法技能 = [];
    }

    repaired.功法技能 = repaired.功法技能
      .filter((s: any) => s && typeof s === 'object')
      .map((s: any, idx: number) => {
        const skillName =
          typeof s.技能名称 === 'string' && s.技能名称.trim() ? s.技能名称.trim() : `${techniqueName}·招式${idx + 1}`;
        const skillDescription = typeof s.技能描述 === 'string' ? s.技能描述 : '';
        const unlockThreshold =
          typeof s.熟练度要求 === 'number' && Number.isFinite(s.熟练度要求) ? s.熟练度要求 : 0;
        const cost = typeof s.消耗 === 'string' ? s.消耗 : '';
        return { ...s, 技能名称: skillName, 技能描述: skillDescription, 熟练度要求: unlockThreshold, 消耗: cost };
      });

    if (repaired.功法技能.length === 0) {
      console.warn(`[AI双向系统] 预处理: 功法 "${techniqueName}" 缺少功法技能，已自动补齐基础技能以防报错。`);
      repaired.功法技能 = [
        {
          技能名称: `${techniqueName}·入门运功`,
          技能描述: `运转《${techniqueName}》的基础法门，凝聚灵气并稳固气机。`,
          熟练度要求: 0,
          消耗: '灵气10%'
        }
      ];
    }

    if (!Array.isArray(repaired.已解锁技能)) {
      repaired.已解锁技能 = [];
    }
    repaired.已解锁技能 = repaired.已解锁技能
      .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
      .map((v: string) => v.trim());

    for (const s of repaired.功法技能) {
      const unlockThreshold = typeof s.熟练度要求 === 'number' ? s.熟练度要求 : 0;
      if (progress >= unlockThreshold && typeof s.技能名称 === 'string' && !repaired.已解锁技能.includes(s.技能名称)) {
        repaired.已解锁技能.push(s.技能名称);
      }
    }

    if (typeof repaired.已装备 !== 'boolean') {
      repaired.已装备 = false;
    }

    return repaired;
  }

  private reconcileNarratedInventoryPossessions(
    saveData: SaveData,
    text: string,
    locallySettledIdentities: Set<string> = new Set(),
  ): StateChange[] {
    const itemNames = detectNarratedInventoryPossessions(text);
    if (itemNames.length === 0) return [];
    const gainQuantityByIdentity = new Map(
      detectNarratedInventoryGainEntries(text)
        .map((item) => [getInventoryItemIdentityKey(item.名称), item.数量] as const)
        .filter(([identity]) => Boolean(identity))
    );

    const inventoryPath = '角色.背包.物品';
    const items = get(saveData, inventoryPath, {}) as Record<string, any>;
    if (!items || typeof items !== 'object' || Array.isArray(items)) {
      set(saveData, inventoryPath, {});
    }

    const currentItems = get(saveData, inventoryPath, {}) as Record<string, any>;
    const existingItemsByIdentity = new Map<string, [string, any]>();
    for (const [itemId, item] of Object.entries(currentItems)) {
      const identity = typeof item?.名称 === 'string' ? getInventoryItemIdentityKey(item.名称) : '';
      if (identity) existingItemsByIdentity.set(identity, [itemId, item]);
    }
    const changes: StateChange[] = [];

    for (const rawName of itemNames) {
      const name = rawName.trim();
      const identity = getInventoryItemIdentityKey(name);
      if (!name || !identity) continue;
      if (locallySettledIdentities.has(identity)) continue;

      const existing = existingItemsByIdentity.get(identity);
      const narratedGainQuantity = gainQuantityByIdentity.get(identity) || 0;
      if (existing) {
        const [existingItemId, existingItem] = existing;
        if (narratedGainQuantity > 0 && this.shouldReconcileNarratedGainAsStack(existingItem)) {
          const quantityPath = `${inventoryPath}.${existingItemId}.数量`;
          const oldQuantity = get(saveData, quantityPath);
          const currentQuantity = typeof oldQuantity === 'number' && Number.isFinite(oldQuantity) ? oldQuantity : 1;
          const newQuantity = currentQuantity + narratedGainQuantity;
          set(saveData, quantityPath, newQuantity);
          changes.push({
            key: quantityPath,
            action: 'add',
            oldValue: this._summarizeValueForChangeLog(quantityPath, oldQuantity, 'add'),
            newValue: this._summarizeValueForChangeLog(quantityPath, newQuantity, 'add')
          });
          console.warn(`[AI双向系统] 叙事物品数量补账: ${name} +${narratedGainQuantity} -> ${quantityPath}`);
        }
        continue;
      }

      const itemId = this.createNarratedInventoryItemId(name, currentItems);
      const item = this.createNarratedInventoryItem(itemId, name, Math.max(1, narratedGainQuantity || 1));
      set(saveData, `${inventoryPath}.${itemId}`, item);
      currentItems[itemId] = item;
      existingItemsByIdentity.set(identity, [itemId, item]);
      changes.push({
        key: `${inventoryPath}.${itemId}`,
        action: 'set',
        oldValue: undefined,
        newValue: this._summarizeValueForChangeLog(`${inventoryPath}.${itemId}`, item, 'set')
      });
      console.warn(`[AI双向系统] 叙事物品补账: ${name} -> ${inventoryPath}.${itemId}`);
    }

    return changes;
  }

  private shouldReconcileNarratedGainAsStack(itemValue: any): boolean {
    if (!itemValue || typeof itemValue !== 'object') return false;
    const nameAndType = String(`${itemValue.类型 || ''} ${itemValue.名称 || ''}`);
    if (/仙品|神品|白娘子|依附/.test(nameAndType)) return false;
    return /丹药|丹丸|材料|灵草|灵材|矿石|食物|货物/.test(nameAndType);
  }

  private createNarratedInventoryItemId(name: string, existingItems: Record<string, any>): string {
    const ascii = name
      .replace(/仙品[·\-]?/g, '')
      .replace(/[^\w\u4e00-\u9fff]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    const base = `item_narrative_${ascii || Date.now()}`;
    let id = base;
    let index = 2;
    while (Object.prototype.hasOwnProperty.call(existingItems, id)) {
      id = `${base}_${index}`;
      index++;
    }
    return id;
  }

  private createNarratedInventoryItem(itemId: string, name: string, quantity = 1): Record<string, any> {
    const quality = name.includes('神品') ? '神'
      : name.includes('仙品') ? '仙'
        : name.includes('天品') ? '天'
          : name.includes('地品') ? '地'
            : name.includes('玄品') ? '玄'
              : name.includes('黄品') ? '黄'
                : '凡';
    const type = /丹药|丹丸/.test(name) ? '丹药'
      : /灵草|灵材|矿石/.test(name) ? '材料'
        : /功法|秘籍/.test(name) ? '功法'
          : '其他';
    const item: Record<string, any> = {
      物品ID: itemId,
      名称: name,
      类型: type,
      品质: { quality, grade: quality === '凡' ? 1 : 10 },
      数量: Math.max(1, quantity),
      描述: `叙事中已明确由玩家随身持有的物品：${name}。`
    };

    if (type === '功法') {
      return this._repairTechniqueItem(item);
    }

    return item;
  }

  private reconcileInspectedItemDescriptions(
    saveData: SaveData,
    userAction: string,
    responseText: string,
    commands: Array<{ action: string; key: string; value?: unknown }>
  ): StateChange[] {
    const actionText = (userAction || '').trim();
    const text = (responseText || '').trim();
    if (!actionText || !text || text === '（AI生成失败）') return [];
    if (!/(查看|检查|调查|端详|端看|细看|仔细看|研究|观察|辨认|鉴定|翻看|阅读|读取|探查)/.test(actionText)) {
      return [];
    }

    const inventoryPath = '角色.背包.物品';
    const items = get(saveData, inventoryPath, {}) as Record<string, any>;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return [];

    const normalizedAction = this.normalizeInventoryMention(actionText);
    const changes: StateChange[] = [];

    for (const [itemId, item] of Object.entries(items)) {
      const name = typeof item?.名称 === 'string' ? item.名称.trim() : '';
      if (!name) continue;
      if (!this.userActionMentionsInventoryItem(normalizedAction, name)) continue;

      const descPath = `${inventoryPath}.${itemId}.描述`;
      const alreadySetByCommand = commands.some((cmd) =>
        cmd.action === 'set' &&
        typeof cmd.key === 'string' &&
        (cmd.key === descPath || cmd.key === `${inventoryPath}.${itemId}`)
      );
      if (alreadySetByCommand) continue;

      const oldValue = get(saveData, descPath);
      const newDescription = this.buildInspectedItemDescription(name, text);
      if (oldValue === newDescription) continue;

      set(saveData, descPath, newDescription);
      changes.push({
        key: descPath,
        action: 'set',
        oldValue: this._summarizeValueForChangeLog(descPath, oldValue, 'set'),
        newValue: this._summarizeValueForChangeLog(descPath, newDescription, 'set')
      });
      console.warn(`[AI双向系统] 查看物品后同步描述: ${name} -> ${descPath}`);
    }

    return changes;
  }

  private normalizeInventoryMention(value: string): string {
    return value
      .replace(/[【】《》“”"「」『』\s]/g, '')
      .replace(/[·\-—_]/g, '')
      .trim();
  }

  private userActionMentionsInventoryItem(normalizedAction: string, itemName: string): boolean {
    const normalizedName = this.normalizeInventoryMention(itemName);
    if (!normalizedName) return false;
    if (normalizedAction.includes(normalizedName)) return true;

    const withoutQuality = normalizedName.replace(/^(神品|仙品|天品|地品|玄品|黄品|凡品)/, '');
    return !!withoutQuality && withoutQuality.length >= 2 && normalizedAction.includes(withoutQuality);
  }

  private buildInspectedItemDescription(itemName: string, responseText: string): string {
    const summary = this.extractRelevantInspectionSummary(responseText, itemName, 360);
    return `【查看记录】${summary || itemName}`;
  }

  private reconcileInspectedNpcAppearance(
    saveData: SaveData,
    userAction: string,
    responseText: string,
    commands: Array<{ action: string; key: string; value?: unknown }>
  ): StateChange[] {
    const actionText = (userAction || '').trim();
    const text = (responseText || '').trim();
    if (!actionText || !text || text === '（AI生成失败）') return [];
    if (!/(查看|检查|调查|端详|端看|细看|仔细看|观察|打量|审视|凝视|辨认)/.test(actionText)) {
      return [];
    }

    const relationsPath = '社交.关系';
    const relations = get(saveData, relationsPath, {}) as Record<string, any>;
    if (!relations || typeof relations !== 'object' || Array.isArray(relations)) return [];

    const normalizedAction = this.normalizeInventoryMention(actionText);
    const changes: StateChange[] = [];

    for (const [npcKey, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object' || Array.isArray(npc)) continue;
      const npcName = typeof npc.名字 === 'string' && npc.名字.trim() ? npc.名字.trim() : npcKey;
      if (!this.userActionMentionsInventoryItem(normalizedAction, npcName)) continue;

      const statusPath = `${relationsPath}.${npcKey}.当前外貌状态`;
      const appearancePath = `${relationsPath}.${npcKey}.外貌描述`;
      const alreadySetAppearance = commands.some((cmd) =>
        cmd.action === 'set' &&
        typeof cmd.key === 'string' &&
        (cmd.key === statusPath || cmd.key === appearancePath || cmd.key === `${relationsPath}.${npcKey}`)
      );
      if (alreadySetAppearance) continue;

      const newStatus = this.buildInspectedNpcAppearanceState(npcName, text);
      const oldStatus = get(saveData, statusPath);
      if (oldStatus !== newStatus) {
        set(saveData, statusPath, newStatus);
        changes.push({
          key: statusPath,
          action: 'set',
          oldValue: this._summarizeValueForChangeLog(statusPath, oldStatus, 'set'),
          newValue: this._summarizeValueForChangeLog(statusPath, newStatus, 'set')
        });
      }

      const oldAppearance = get(saveData, appearancePath);
      if (this.shouldBackfillNpcAppearanceDescription(oldAppearance)) {
        const newAppearance = this.buildInspectedNpcAppearanceDescription(npcName, text);
        set(saveData, appearancePath, newAppearance);
        changes.push({
          key: appearancePath,
          action: 'set',
          oldValue: this._summarizeValueForChangeLog(appearancePath, oldAppearance, 'set'),
          newValue: this._summarizeValueForChangeLog(appearancePath, newAppearance, 'set')
        });
      }

      if (changes.length > 0) {
        console.warn(`[AI双向系统] 查看NPC后同步外貌状态: ${npcName}`);
      }
    }

    return changes;
  }

  private buildInspectedNpcAppearanceState(npcName: string, responseText: string): string {
    const summary = this.extractRelevantInspectionSummary(responseText, npcName, 180, true);
    return summary || `${npcName}维持着当前可见的外貌状态。`;
  }

  private buildInspectedNpcAppearanceDescription(npcName: string, responseText: string): string {
    const summary = this.extractRelevantInspectionSummary(responseText, npcName, 360, true);
    return `【观察记录】${summary || npcName}`;
  }

  private extractRelevantInspectionSummary(
    responseText: string,
    subjectName: string,
    maxLength: number,
    appearanceOnly = false
  ): string {
    const compact = responseText
      .replace(/\s+/g, ' ')
      .replace(/^【[^】]+】/, '')
      .trim();
    if (!compact) return '';

    const subjectVariants = new Set<string>([
      subjectName,
      this.normalizeInventoryMention(subjectName),
      subjectName.replace(/^(神品|仙品|天品|地品|玄品|黄品|凡品)[·\-]?/, ''),
    ].filter(Boolean));
    const detailPattern = appearanceOnly
      ? /(外貌|容貌|面容|眉眼|眼神|神色|神态|衣|裙|袍|发|鬓|身形|身段|体态|气质|姿态|肤|唇|声音|气息|伤|血|疲惫|狼狈)/
      : /(材质|纹路|颜色|光泽|气息|灵气|重量|触感|裂纹|铭文|符文|内容|记载|用途|来历|效果|机关|封印|波动|温润|清凉|灼热|残缺|完整|品质)/;

    const sentences = compact
      .split(/(?<=[。！？!?；;])|[\n\r]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const picked: string[] = [];
    for (const sentence of sentences) {
      const normalizedSentence = this.normalizeInventoryMention(sentence);
      const mentionsSubject = [...subjectVariants].some(v => v && (sentence.includes(v) || normalizedSentence.includes(v)));
      if (mentionsSubject || detailPattern.test(sentence)) {
        picked.push(sentence);
      }
      if (picked.length >= 2) break;
    }

    const summary = (picked.length > 0 ? picked.join('') : compact).trim();
    return summary.length > maxLength ? `${summary.slice(0, maxLength)}…` : summary;
  }

  private shouldBackfillNpcAppearanceDescription(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    const text = value.trim();
    if (!text) return true;
    if (text.length < 20) return true;
    return /相貌普通|气质平和|未描述|暂无|神态自然/.test(text);
  }

  private executeCommand(
    command: { action: string; key: string; value?: unknown },
    saveData: SaveData,
    protectionMode: 'strict' | 'skeleton' = 'strict'
  ): void {
    const { action, key, value } = command;

    if (!action || !key) {
      throw new Error('指令格式错误：缺少 action 或 key');
    }

    const path = key.toString();
    const allowedRoots = ['元数据', '角色', '社交', '世界', '系统'] as const;
    const isV3Path = allowedRoots.some((root) => path === root || path.startsWith(`${root}.`));
    if (!isV3Path) {
      throw new Error(`指令key必须以 ${allowedRoots.join(' / ')} 开头（V3短路径），当前: ${path}`);
    }

    const playerName = typeof (saveData as any)?.角色?.身份?.名字 === 'string' ? (saveData as any).角色.身份.名字.trim() : '';
    if (playerName) {
      const segments = path.split('.');
      const npcKey = typeof segments[2] === 'string' ? segments[2].trim() : '';
      const isPlayerInRelations = segments[0] === '社交' && segments[1] === '关系' && npcKey === playerName;
      if (isPlayerInRelations && action !== 'delete') {
        console.warn(`[AI双向系统] 阻止将玩家本人写入社交.关系: ${path}`);
        return;
      }
    }

    // 🔥 保护NPC骨干结构：当 AI 直接写入社交.关系.<NPC名> 的子路径时，确保该NPC根对象存在且至少具备名字
    const segments = path.split('.');
    const isNpcSubPath = segments[0] === '社交' && segments[1] === '关系' && typeof segments[2] === 'string' && !!segments[2].trim();
    if (isNpcSubPath && action !== 'delete') {
      const npcName = segments[2].trim();
      if (!playerName || npcName !== playerName) {
        // 确保 社交.关系 是对象
        const relationsRoot = get(saveData, '社交.关系');
        if (!isPlainObject(relationsRoot)) {
          set(saveData, '社交.关系', {});
        }

        const npcRootPath = `社交.关系.${npcName}`;
        const existingNpc = get(saveData, npcRootPath);
        if (protectionMode === 'strict') {
          const gameTime = (saveData as any)?.元数据?.时间;
          // 仅在缺失/明显无效时才补齐，避免每条指令都重复修复造成额外开销
          if (!isPlainObject(existingNpc)) {
            const [ok, repaired] = validateAndRepairNpcProfile({ 名字: npcName }, gameTime);
            if (ok && repaired) set(saveData, npcRootPath, repaired);
          } else {
            const name = typeof (existingNpc as any).名字 === 'string' ? (existingNpc as any).名字.trim() : '';
            if (!name) {
              const [ok, repaired] = validateAndRepairNpcProfile({ ...(existingNpc as any), 名字: npcName }, gameTime);
              if (ok && repaired) set(saveData, npcRootPath, repaired);
            }
          }
        } else {
          // skeleton：只保证是对象 + 有名字，不做重度修复/覆盖
          if (!isPlainObject(existingNpc)) {
            set(saveData, npcRootPath, { 名字: npcName });
          } else {
            const name = typeof (existingNpc as any).名字 === 'string' ? (existingNpc as any).名字.trim() : '';
            if (!name) set(saveData, `${npcRootPath}.名字`, npcName);
          }
        }
      }
    }

    // 🔥 保护关键数组字段，防止被设为 null
    const arrayFields =
      protectionMode === 'strict'
        ? [
            '角色.效果',
            '社交.任务.当前任务列表',
            '社交.记忆.短期记忆',
            '社交.记忆.中期记忆',
            '社交.记忆.长期记忆',
            '社交.记忆.隐式中期记忆',
            '系统.历史.叙事',
          ]
        : ['角色.效果', '社交.记忆.短期记忆', '社交.记忆.中期记忆', '社交.记忆.长期记忆', '社交.记忆.隐式中期记忆', '系统.历史.叙事'];
    // 精确匹配：路径必须完全等于数组字段，或者是数组元素（如 状态效果[0]）但不是其子属性
    const isArrayField = arrayFields.some(field => {
      // 完全匹配
      if (path === field) return true;
      // 匹配数组元素，但不匹配数组元素的子属性
      // 例如：状态效果[0] ✓  状态效果[0].持续时间分钟 ✗
      if (path.startsWith(field + '[') && !path.includes('.', field.length)) return true;
      return false;
    });

    if (action === 'set' && isArrayField) {
      if (value === null || value === undefined) {
        console.warn(`[AI双向系统] 阻止将数组字段 ${path} 设为 null/undefined，改为空数组`);
        set(saveData, path, []);
        return;
      }
      if (!Array.isArray(value)) {
        console.warn(`[AI双向系统] 阻止将数组字段 ${path} 设为非数组值，保持原值`);
        return;
      }
    }

    if (action === 'set') {
      const segments = path.split('.');

      if (protectionMode === 'strict') {
        // 🔥 保护关键模块：使用合并而非覆盖，防止 AI 的 set 操作意外清空数据
        const protectedModulePaths = [
          '角色.背包',
          '角色.功法',
          '角色.技能',
          '角色.大道',
          '角色.修炼',
          '角色.属性',
          '角色.身份',
          '社交.记忆',
          '社交.宗门',
        ];
        if (protectedModulePaths.includes(path) && isPlainObject(value)) {
          const existing = get(saveData, path);
          if (isPlainObject(existing)) {
            const merged = mergePlainObjectsReplacingArrays(existing, value);
            console.log(`[AI双向系统] 保护模块 ${path}：使用合并而非覆盖`);
            set(saveData, path, merged);
            return;
          }
        }
      }

      const isNpcRoot = segments.length === 3 && segments[0] === '社交' && segments[1] === '关系';
      // 🔥 防止把 NPC 根对象写坏：根对象只能 set 为对象（字符串/数字会直接覆盖导致NPC消失）
      if (isNpcRoot && !isPlainObject(value)) {
        console.warn(`[AI双向系统] 阻止将 NPC 根对象 "${path}" set 为非对象值（${typeof value}），请改为设置具体字段。`);
        return;
      }
      if (isNpcRoot && isPlainObject(value)) {
        if (playerName && typeof (value as any).名字 === 'string' && (value as any).名字.trim() === playerName) {
          console.warn(`[AI双向系统] 阻止将玩家本人写入社交.关系: ${path}`);
          return;
        }
        if (protectionMode === 'strict') {
          const existingNpc = get(saveData, path);
          const baseNpc = isPlainObject(existingNpc) ? existingNpc : {};
          const mergedNpc = mergePlainObjectsReplacingArrays(baseNpc, value);
          if (typeof (mergedNpc as any).名字 !== 'string' || !(mergedNpc as any).名字) {
            (mergedNpc as any).名字 = segments[2];
          }
          const gameTime = (saveData as any)?.元数据?.时间;
          const [isValid, repairedNpc] = validateAndRepairNpcProfile(mergedNpc, gameTime);
          if (isValid && repairedNpc) {
            set(saveData, path, repairedNpc);
            return;
          }
        } else {
          // skeleton：不做重度修复，最多补齐名字，允许写入原始对象
          if (typeof (value as any).名字 !== 'string' || !(value as any).名字) {
            (value as any).名字 = segments[2];
          }
        }
      }
    }
    // 🔥 已知数值字段钳制（set/add 双路生效）——LLM 扣过头/直写离谱值的兜底：
    // 实测出过 气血-60/灵气-34（add 无下限）与 NPC 出生年 -210/-344（set 直写负数）。
    const clampKnownNumeric = (p: string, n: number): number => {
      if (!Number.isFinite(n)) return n;
      // 资源当前值：气血/灵气/神识/寿命 ——下限0，上限取同级“上限”（玩家与NPC路径通吃）
      const resMatch = p.match(/\.(气血|灵气|神识|寿命)\.当前$/);
      if (resMatch) {
        const cap = get(saveData, p.replace(/\.当前$/, '.上限'));
        const upper = typeof cap === 'number' && cap > 0 ? cap : Infinity;
        const clamped = Math.max(0, Math.min(upper, n));
        if (clamped !== n) console.warn(`[AI双向系统] ${p} 钳制 ${n} → ${clamped}`);
        return clamped;
      }
      // 货币/灵石/物品数量：不得为负（含旧灵石路径 角色.背包.灵石.下品 等）
      if (p.includes('灵石') || /\.数量$/.test(p)) {
        if (n < 0) { console.warn(`[AI双向系统] ${p} 钳制 ${n} → 0`); return 0; }
        return n;
      }
      // 好感度：[-100, 100]
      if (/好感度$/.test(p)) {
        const clamped = Math.max(-100, Math.min(100, n));
        if (clamped !== n) console.warn(`[AI双向系统] ${p} 钳制 ${n} → ${clamped}`);
        return clamped;
      }
      // 出生年：[1, 当前游戏年]（AI 曾把年龄写成负出生年）
      if (/出生日期\.年$/.test(p)) {
        const nowYear = Number((saveData as any)?.元数据?.时间?.年) || 220;
        const clamped = Math.max(1, Math.min(nowYear, n));
        if (clamped !== n) console.warn(`[AI双向系统] ${p} 出生年钳制 ${n} → ${clamped}`);
        return clamped;
      }
      return n;
    };

    switch (action) {
      case 'set':
        set(saveData, path, typeof value === 'number' ? clampKnownNumeric(path, value) : value);
        break;

      case 'add': {
        const currentValue = get(saveData, path, 0);
        if (typeof currentValue !== 'number' || typeof value !== 'number') {
          throw new Error(`ADD操作要求数值类型，但得到: ${typeof currentValue}, ${typeof value}`);
        }
        const newValue = clampKnownNumeric(path, currentValue + value);
        set(saveData, path, newValue);

        // ?? 大道经验：add 当前经验 时同步累计总经验（仅正增量）
        const daoCurrentExpMatch = path.match(/^角色\.大道\.大道列表\.([^\.]+)\.当前经验$/);
        if (daoCurrentExpMatch && value > 0) {
          const daoName = daoCurrentExpMatch[1];
          const totalPath = `角色.大道.大道列表.${daoName}.总经验`;
          const totalValue = get(saveData, totalPath, 0);
          if (typeof totalValue === 'number') {
            set(saveData, totalPath, Math.max(0, totalValue + value));
          }
        }

        break;
      }

      case 'push': {
        const array = get(saveData, path, []) as unknown[];
        if (!Array.isArray(array)) {
          throw new Error(`PUSH操作要求数组类型，但 ${path} 是 ${typeof array}`);
        }
        let valueToPush: unknown = value ?? null;
        // 当向记忆数组推送时，自动添加时间戳（但跳过隐式中期记忆，因为已在processGmResponse中处理）
        const isMemoryPath =
          path.startsWith('社交.记忆.') || path.startsWith('记忆.');
        const isImplicitMid =
          path === '社交.记忆.隐式中期记忆' || path === '记忆.隐式中期记忆';
        if (typeof valueToPush === 'string' && isMemoryPath && !isImplicitMid) {
          if (!valueToPush.trim()) {
            break;
          }
          const timePrefix = this._formatGameTime((saveData as any).元数据?.时间);
          valueToPush = `${timePrefix}${valueToPush}`;
        }
        array.push(valueToPush);
        // 如果路径不存在，set会创建它
        set(saveData, path, array);
        break;
      }

      case 'delete':
        unset(saveData, path);
        break;

      case 'pull': {
        // 从数组中移除匹配的元素（用于任务系统、状态效果等）
        const array = get(saveData, path, []) as unknown[];
        if (!Array.isArray(array)) {
          throw new Error(`PULL操作要求数组类型，但 ${path} 是 ${typeof array}`);
        }

        // value 应该是一个对象，包含用于匹配的字段
        if (!value || typeof value !== 'object') {
          throw new Error(`PULL操作要求value是对象类型，用于匹配要移除的元素`);
        }

        const matchCriteria = value as Record<string, unknown>;
        const updatedArray = array.filter(item => {
          if (!item || typeof item !== 'object') return true;

          // 检查是否所有匹配条件都满足
          for (const [key, val] of Object.entries(matchCriteria)) {
            if ((item as Record<string, unknown>)[key] !== val) {
              return true; // 不匹配，保留
            }
          }
          return false; // 完全匹配，移除
        });

        set(saveData, path, updatedArray);
        console.log(`[AI双向系统] PULL操作: 从 ${path} 移除了 ${array.length - updatedArray.length} 个元素`);
        break;
      }

      default:
        throw new Error(`未知的操作类型: ${action}`);
    }

    // 🔥 功法进度镜像：UI/功法系统主要读取背包物品上的修炼进度/已解锁技能
    // AI 往往只更新 `角色.功法.功法进度.<功法ID>.*`，导致“变量更新了，但功法面板还不动”。
    // 仅在物品存在且类型为功法时同步，避免凭空创建背包物品。
    if (action === 'set' || action === 'add' || action === 'push') {
      const match = path.match(/^角色\.功法\.功法进度\.([^\.]+)\.(熟练度|已解锁技能)$/);
      if (match) {
        const itemId = match[1];
        const field = match[2];
        const itemPath = `角色.背包.物品.${itemId}`;
        const item = get(saveData, itemPath);
        if (isPlainObject(item) && (item as any).类型 === '功法') {
          if (field === '熟练度') {
            const updated = get(saveData, path);
            const num = typeof updated === 'number' && Number.isFinite(updated) ? updated : 0;
            const clamped = Math.max(0, Math.min(100, Math.round(num)));
            if (clamped !== num) {
              set(saveData, path, clamped);
            }
            set(saveData, `${itemPath}.修炼进度`, clamped);
          } else if (field === '已解锁技能') {
            const updated = get(saveData, path);
            const list = Array.isArray(updated) ? updated : [];
            const normalized = list
              .filter((s) => typeof s === 'string')
              .map((s) => sanitizeAITextForDisplay(s).trim())
              .filter((s) => s.length > 0);
            set(saveData, path, normalized);
            set(saveData, `${itemPath}.已解锁技能`, normalized);
          }
        }
      }
    }

    // 🔥 实时同步位置到 gameStateStore
    if (path === '角色.位置' || path.startsWith('角色.位置.')) {
      const gameStateStore = useGameStateStore();
      const newLocation = get(saveData, '角色.位置');
      if (newLocation) {
        gameStateStore.updateLocation(newLocation);
      }
    }
  }

  /**
   * 提取记忆总结所需的精简存档数据
   * 与正式游戏交互保持一致：移除叙事历史、短期记忆、隐式中期记忆
   */
  private _extractEssentialDataForSummary(saveData: SaveData): SaveData {
    const simplified = cloneDeep(saveData);

    // 🔥 修复：移除叙事历史（正确路径是 系统.历史.叙事）
    if ((simplified as any).系统?.历史?.叙事) {
      delete (simplified as any).系统.历史.叙事;
    }

    // 🔥 修复：移除短期和隐式中期记忆（正确路径是 社交.记忆）
    if ((simplified as any).社交?.记忆) {
      delete (simplified as any).社交.记忆.短期记忆;
      delete (simplified as any).社交.记忆.隐式中期记忆;
    }

    return simplified;
  }

  /**
   * 智能摘要值，避免在状态变更日志中存储大量重复数据
   * 对于大型数组和对象，只记录摘要信息
   */
  /**
   * 为变更日志优化的值摘要方法
   * 对于关键路径（NPC记忆、事件等），保留更多信息以便正确显示
   */
  private _summarizeValueForChangeLog(key: string, value: any, action: string): any {
    // null 或 undefined 直接返回
    if (value === null || value === undefined) {
      return value;
    }

    // 基本类型直接返回
    if (typeof value !== 'object') {
      return value;
    }

    // 🔥 关键路径：对于 push/pull 操作，保留完整的新增/删除值
    if (action === 'push' || action === 'pull') {
      // 对于单个值的 push/pull，完整保留
      return cloneDeep(value);
    }

    // 🔥 关键路径：NPC记忆相关（社交.关系.*.人物记忆）
    if (key.includes('社交.关系.') && key.includes('.人物记忆')) {
      // 对于记忆数组，保留最后一个元素（最新记忆）
      if (Array.isArray(value) && value.length > 0) {
        return {
          __type: 'Array',
          __length: value.length,
          __summary: `[${value.length}条记忆]`,
          __last: cloneDeep(value[value.length - 1])
        };
      }
    }

    // 🔥 关键路径：事件记录
    if (key.includes('社交.事件') || key.includes('系统.事件')) {
      if (Array.isArray(value) && value.length > 0) {
        return {
          __type: 'Array',
          __length: value.length,
          __summary: `[${value.length}个事件]`,
          __last: cloneDeep(value[value.length - 1])
        };
      }
    }

    // 🔥 关键路径：短期记忆、中期记忆
    if (key.includes('记忆.短期记忆') || key.includes('记忆.中期记忆') || key.includes('记忆.隐式中期记忆')) {
      if (Array.isArray(value) && value.length > 0) {
        return {
          __type: 'Array',
          __length: value.length,
          __summary: `[${value.length}条记忆]`,
          __last: cloneDeep(value[value.length - 1])
        };
      }
    }

    // 其他情况使用原有的摘要逻辑
    return this._summarizeValue(value);
  }

  private _summarizeValue(value: any): any {
    // null 或 undefined 直接返回
    if (value === null || value === undefined) {
      return value;
    }

    // 基本类型直接返回
    if (typeof value !== 'object') {
      return value;
    }

    // 数组类型：根据大小决定是否摘要
    if (Array.isArray(value)) {
      // 小数组（≤3个元素）：完整保留
      if (value.length <= 3) {
        return cloneDeep(value);
      }
      // 大数组：只记录摘要信息
      return {
        __type: 'Array',
        __length: value.length,
        __summary: `[数组: ${value.length}个元素]`,
        __first: value[0] ? this._summarizeValue(value[0]) : undefined,
        __last: value[value.length - 1] ? this._summarizeValue(value[value.length - 1]) : undefined
      };
    }

    // 对象类型：检查是否是大型对象
    const keys = Object.keys(value);

    // 小对象（≤5个属性）：完整保留
    if (keys.length <= 5) {
      return cloneDeep(value);
    }

    // 大对象：只记录摘要信息
    const summary: any = {
      __type: 'Object',
      __keys: keys.length,
      __summary: `[对象: ${keys.length}个属性]`
    };

    // 保留前3个属性作为预览
    keys.slice(0, 3).forEach(key => {
      summary[key] = this._summarizeValue(value[key]);
    });

    return summary;
  }

  private parseAIResponse(rawResponse: string, forceJsonMode: boolean = false, enableActionOptions: boolean = true): GM_Response {
    if (!rawResponse || typeof rawResponse !== 'string') {
      throw new Error('AI响应为空或格式错误');
    }

    // 移除 MiniMax <think>、Claude/Gemini thinking 等推理块，只解析正式输出。
    const rawText = stripModelThinking(rawResponse);

    console.log('[parseAIResponse] 原始响应长度:', rawText.length);
    console.log('[parseAIResponse] 原始响应前500字符:', rawText.substring(0, 500));
    console.log('[parseAIResponse] 强JSON模式:', forceJsonMode);

    const standardize = (obj: Record<string, unknown>): GM_Response => {
      const commands = Array.isArray(obj.tavern_commands) ? obj.tavern_commands :
                      Array.isArray(obj.指令) ? obj.指令 :
                      Array.isArray(obj.commands) ? obj.commands : [];

      const tavernCommands = commands.map((cmd: any) => ({
        action: cmd.action || 'set',
        key: cmd.key || '',
        value: cmd.value
      }));

      let actionOptions: unknown[] = [];
      if (enableActionOptions) {
        actionOptions = Array.isArray(obj.action_options) ? obj.action_options :
                        Array.isArray(obj.行动选项) ? obj.行动选项 : [];
      }

      const filtered = (Array.isArray(actionOptions) ? actionOptions : []).filter((opt: unknown) => typeof opt === 'string' && opt.trim().length > 0);

      let normalized = filtered as string[];
      if (enableActionOptions && normalized.length === 0) {
        console.warn('[parseAIResponse] ⚠️ action_options为空，使用默认选项');
        normalized = ['继续当前活动', '观察周围环境', '与附近的人交谈', '查看自身状态', '稍作休息调整'];
      }

      return {
        text: String(obj.text || obj.叙事文本 || obj.narrative || ''),
        mid_term_memory: String(obj.mid_term_memory || obj.中期记忆 || obj.memory || ''),
        tavern_commands: tavernCommands,
        action_options: enableActionOptions ? this.sanitizeActionOptionsForDisplay(normalized) : []
      };
    };

    // 🔥 核心策略：使用统一的智能JSON解析（根据forceJsonMode自动选择策略）
    try {
      const parsedObj = parseJsonSmart<Record<string, unknown>>(rawText, forceJsonMode);
      console.log('[parseAIResponse] ✅ 成功解析JSON对象');
      return standardize(parsedObj);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法解析AI响应：${message}`);
    }
  }
}

export const AIBidirectionalSystem = AIBidirectionalSystemClass.getInstance();

// 导出 getTavernHelper 以供其他模块使用
export { getTavernHelper };
