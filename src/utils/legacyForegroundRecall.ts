import type { SaveData } from '@/types/game';

export interface LegacyForegroundRecallSections {
  vectorMemorySection: string;
  narrativeRagSection: string;
  characterRagSection: string;
}

export interface LegacyForegroundRecallInput {
  userMessage: string;
  v3: SaveData;
  stateForAI: SaveData;
  saveSlot?: string;
}

type VectorMemoryServiceLike = {
  init(saveSlot: string): Promise<void>;
  isEnabled(): boolean;
  syncFromLongTermMemories(memories: unknown[]): Promise<unknown>;
  getStats(): Promise<{ total: number }>;
  searchMemories(query: string, context?: { currentLocation?: string }): Promise<any[]>;
  formatForAI(results: any[]): string;
};

type NarrativeRagServiceLike = {
  init(saveSlot: string): Promise<void>;
  isEnabled(): boolean;
  buildSectionForPrompt(query: string, saveData: unknown): Promise<string>;
  getStats(): Promise<{ total: number }>;
};

type CharacterRagServiceLike = {
  init(): Promise<void>;
  isEnabled(): boolean;
  ensureIndexed(): Promise<unknown>;
  buildSectionForPrompt(query: string, opts?: { topK?: number; minScore?: number; stageId?: string }): Promise<string>;
  getStats(): Promise<{ total: number }>;
};

export interface LegacyForegroundRecallDeps {
  vectorMemoryService?: VectorMemoryServiceLike;
  narrativeRagService?: NarrativeRagServiceLike;
  characterRagService?: CharacterRagServiceLike;
  getSaveSlot?: () => string | undefined;
}

async function activeSaveSlot(): Promise<string | undefined> {
  try {
    const { useCharacterStore } = await import('@/stores/characterStore');
    const active = useCharacterStore().rootState.当前激活存档;
    if (active?.角色ID && active?.存档槽位) return `${active.角色ID}_${active.存档槽位}`;
  } catch {
    // tests and early boot may not have a Pinia store
  }
  return undefined;
}

/**
 * Ordinary Legacy foreground recall. Pilot paths must not call this.
 * Background indexing is a separate optimization and does not replace this retrieval.
 */
// @deprecated LEGACY：模块化稳定后删除（2026-10-02 用户决定）
export async function resolveLegacyForegroundRecall(
  input: LegacyForegroundRecallInput,
  deps: LegacyForegroundRecallDeps = {},
): Promise<LegacyForegroundRecallSections> {
  const stateForAI = input.stateForAI as any;
  const v3 = input.v3 as any;
  const saveSlot = input.saveSlot || deps.getSaveSlot?.() || await activeSaveSlot();

  let vectorMemorySection = '';
  try {
    const vectorMemoryService = deps.vectorMemoryService
      || (await import('@/services/vectorMemoryService')).vectorMemoryService;
    if (saveSlot) await vectorMemoryService.init(saveSlot);
    const longTermMemories = stateForAI.社交?.记忆?.长期记忆 || [];
    if (vectorMemoryService.isEnabled() && Array.isArray(longTermMemories) && longTermMemories.length > 0) {
      await vectorMemoryService.syncFromLongTermMemories(longTermMemories);
      const stats = await vectorMemoryService.getStats();
      if (stats.total === 0) {
        console.warn('[长期检索] 索引为空：请先在【记忆中心 -> 长期检索】转化长期记忆');
      } else {
        const recentShort = (v3?.社交?.记忆?.短期记忆 || []).slice(-2).join('\n');
        const searchQuery = [input.userMessage || '', recentShort].filter(Boolean).join('\n');
        const results = await vectorMemoryService.searchMemories(searchQuery, {
          currentLocation: stateForAI.角色?.位置?.描述,
        });
        vectorMemorySection = vectorMemoryService.formatForAI(results);
        stateForAI.社交.记忆.长期记忆 = [];
        console.log(`[长期检索] 已注入 ${results.length} 条相关长期记忆（索引总数：${stats.total}）`);
      }
    }
  } catch (error) {
    console.warn('[长期检索] 检索失败，使用全量模式:', error);
  }

  let narrativeRagSection = '';
  try {
    const narrativeRagService = deps.narrativeRagService
      || (await import('@/services/narrativeRagService')).narrativeRagService;
    if (saveSlot) await narrativeRagService.init(saveSlot);
    if (narrativeRagService.isEnabled()) {
      const recentShort = (v3?.社交?.记忆?.短期记忆 || []).slice(-2).join('\n');
      const ragQuery = [input.userMessage || '', recentShort, stateForAI.角色?.位置?.描述 || '']
        .filter(Boolean)
        .join('\n');
      narrativeRagSection = await narrativeRagService.buildSectionForPrompt(ragQuery || '继续当前剧情', v3);
      if (narrativeRagSection) {
        const stats = await narrativeRagService.getStats();
        console.log(`[记忆增强/叙事检索] 已注入相关叙事片段（索引总数：${stats.total}）`);
      }
    }
  } catch (error) {
    console.warn('[记忆增强/叙事检索] 检索失败，跳过叙事增强:', error);
  }

  let characterRagSection = '';
  try {
    const characterRagService = deps.characterRagService
      || (await import('@/services/characterRagService')).characterRagService;
    await characterRagService.init();
    if (characterRagService.isEnabled()) {
      void characterRagService.ensureIndexed().catch(() => {});
      const recentShort = (v3?.社交?.记忆?.短期记忆 || []).slice(-2).join('\n');
      const ragQuery = [input.userMessage || '', recentShort, stateForAI.角色?.位置?.描述 || '']
        .filter(Boolean)
        .join('\n');
      characterRagSection = await characterRagService.buildSectionForPrompt(ragQuery || '继续当前剧情', {
        topK: 6,
        minScore: 0.4,
        stageId: v3?.世界?.状态?.剧本模组?.modId,
      });
      if (characterRagSection) {
        const stats = await characterRagService.getStats();
        console.log(`[角色检索] 已注入召回的相关角色（索引总数：${stats.total}）`);
      }
    }
  } catch (error) {
    console.warn('[角色检索] 检索失败，跳过角色增强:', error);
  }

  return { vectorMemorySection, narrativeRagSection, characterRagSection };
}
