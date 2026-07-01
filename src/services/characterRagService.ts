/**
 * 角色表向量检索服务（Character RAG）
 *
 * 镜像 narrativeRagService 的结构，专门用于：
 * - 索引全局角色注册表（character-registry.json）
 * - 语义召回与当前场景相关的角色（含离场/历史角色）
 * - 注入 prompt 作为正典参考上下文
 *
 * 核心差异：
 * - 语料为全局静态注册表，非 per-存档
 * - IndexedDB 名 `character-rag`，全局单库
 * - 索引元数据键控：registryHash + embeddingModel + dimension
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { APIProvider } from '@/services/aiService';
import {
  createEmbeddings,
  normalizeBaseUrl,
  normalizeToUnitVector,
  type EmbeddingRequestConfig,
} from '@/services/embeddingService';
import registryJson from '@/modules/scenarioMods/builtins/character-registry.json';

export interface RegistryEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  gender?: string;
  books?: string[];
  tier?: string;
  stagePresence: boolean;
  staticProfile: {
    identitySummary?: string;
    personality?: string;
    appearance?: string;
    relationToProtagonist?: string;
    formsOfAddress?: string[];
    notes?: string[];
    keyEvents?: string[];
    [key: string]: any;
  };
  phaseIdentities: any[];
  embedText: string;
}

export interface RegistryMeta {
  schema: string;
  version: string;
  sourceHash: string;
  characters: RegistryEntry[];
}

export interface CharacterRagEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  vector: number[];
  embeddingModel: string;
  dimension: number;
  registryHash: string;
}

export interface CharacterRagSearchResult {
  id: string;
  canonicalName: string;
  score: number;
}

const DB_NAME = 'character-rag';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

function dot(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

class CharacterRagService {
  private db: IDBPDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        },
      });
      console.log('[角色RAG] 初始化完成: character-rag');
    } catch (error) {
      console.warn('[角色RAG] IndexedDB 初始化失败:', error);
      this.db = null;
    }
  }

  private getEmbeddingRequestConfig(): EmbeddingRequestConfig | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAPIManagementStore } = require('@/stores/apiManagementStore');
      const apiStore = useAPIManagementStore();
      if (!apiStore.isFunctionEnabled('embedding')) return null;

      const cfg = apiStore.getAPIForType('embedding');
      if (!cfg || cfg.enabled === false || cfg.id === 'default') return null;

      const baseUrl = normalizeBaseUrl(cfg.url);
      const apiKey = (cfg.apiKey || '').trim();
      const model = (cfg.model || '').trim();
      if (!baseUrl || !apiKey || !model) return null;

      return {
        provider: cfg.provider as APIProvider,
        url: baseUrl,
        apiKey,
        model,
      };
    } catch {
      return null;
    }
  }

  isEnabled(): boolean {
    return !!this.getEmbeddingRequestConfig();
  }

  getEmbeddingStatus(): { available: boolean; provider?: APIProvider; model?: string; reason?: string } {
    const cfg = this.getEmbeddingRequestConfig();
    if (cfg) return { available: true, provider: cfg.provider, model: cfg.model };
    return { available: false, reason: '未配置独立 Embedding API，角色检索不会启用或注入' };
  }

  private async embedBatch(texts: string[]): Promise<{ vectors: number[][]; model: string } | null> {
    const cfg = this.getEmbeddingRequestConfig();
    if (!cfg) return null;
    try {
      const vectors = await createEmbeddings(cfg, texts);
      return { vectors: vectors.map(v => normalizeToUnitVector(v)), model: cfg.model };
    } catch (error) {
      console.warn('[角色RAG] Embedding 生成失败，跳过角色检索:', error);
      return null;
    }
  }

  private async embedText(text: string): Promise<{ vector: number[]; model: string } | null> {
    const embedded = await this.embedBatch([text]);
    if (!embedded || embedded.vectors.length !== 1) return null;
    return { vector: embedded.vectors[0], model: embedded.model };
  }

  private getRegistryInfo(): { hash: string; entries: RegistryEntry[] } {
    const reg = registryJson as unknown as RegistryMeta;
    const hash = reg?.sourceHash || '';
    const characters = Array.isArray(reg?.characters) ? reg.characters : [];
    return { hash, entries: characters as RegistryEntry[] };
  }

  async ensureIndexed(options?: { batchSize?: number; onProgress?: (done: number, total: number) => void }): Promise<number> {
    if (!this.db) return 0;
    if (!this.isEnabled()) return 0;

    try {
      const { hash: registryHash, entries: registryEntries } = this.getRegistryInfo();
      if (registryEntries.length === 0) return 0;

      const cfg = this.getEmbeddingRequestConfig();
      if (!cfg) return 0;
      const expectedModel = cfg.model;

      // 读取索引元数据，做键控比对
      const allEntries = await this.db.getAll(STORE_NAME);
      const metaEntry = allEntries.find(e => e.id === '__meta__') as { registryHash?: string; embeddingModel?: string; dimension?: number } | undefined;

      if (metaEntry) {
        const sameModel = metaEntry.embeddingModel === expectedModel;
        const sameHash = metaEntry.registryHash === registryHash;
        if (sameModel && sameHash) {
          console.log('[角色RAG] 索引已是最新（hash & model 未变），跳过');
          return 0;
        } else {
          console.log('[角色RAG] 索引配置变更，清库重建');
          await this.db.clear(STORE_NAME);
        }
      }

      // 收集已有 entry id（排除 meta）
      const existingIds = new Set<string>();
      for (const entry of allEntries) {
        if (entry.id !== '__meta__') existingIds.add(entry.id);
      }

      // 过滤出未索引的
      const pending = registryEntries.filter(entry => !existingIds.has(entry.id));
      if (pending.length === 0) {
        await this.db.put(STORE_NAME, { id: '__meta__', registryHash, embeddingModel: expectedModel, dimension: 0 });
        console.log('[角色RAG] 已全部索引');
        return 0;
      }

      const batchSize = Math.max(1, Math.min(64, options?.batchSize ?? 32));
      let added = 0;

      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        const texts = batch.map(entry => entry.embedText);
        const embedded = await this.embedBatch(texts);
        if (!embedded || embedded.vectors.length !== batch.length) {
          console.warn('[角色RAG] Embedding 批次大小不匹配，跳过该批次');
          continue;
        }

        for (let j = 0; j < batch.length; j++) {
          const entry = batch[j];
          const record: CharacterRagEntry = {
            id: entry.id,
            canonicalName: entry.canonicalName,
            aliases: entry.aliases,
            vector: embedded.vectors[j],
            embeddingModel: embedded.model,
            dimension: embedded.vectors[j].length,
            registryHash,
          };
          await this.db.put(STORE_NAME, record);
          added++;
        }

        options?.onProgress?.(Math.min(i + batch.length, pending.length), pending.length);
      }

      // 写入元数据锚点
      await this.db.put(STORE_NAME, {
        id: '__meta__',
        registryHash,
        embeddingModel: expectedModel,
        dimension: added > 0 ? (await this.db.get(STORE_NAME, pending[0].id))?.dimension ?? 0 : 0,
      });

      console.log(`[角色RAG] 已索引 ${added} 条角色向量`);
      return added;
    } catch (error) {
      console.warn('[角色RAG] ensureIndexed 失败:', error);
      return 0;
    }
  }

  async search(query: string, opts?: { topK?: number; minScore?: number; excludeIds?: string[] }): Promise<CharacterRagSearchResult[]> {
    if (!this.isEnabled() || !this.db) return [];
    if (!query?.trim()) return [];

    try {
      const topK = Math.max(1, Math.min(20, opts?.topK ?? 6));
      const minScore = Math.max(0, Math.min(1, opts?.minScore ?? 0.3));
      const excludeIds = new Set(opts?.excludeIds ?? []);

      const allEntries = await this.db.getAll(STORE_NAME);
      const entries = allEntries.filter(e => e.id !== '__meta__') as CharacterRagEntry[];
      if (entries.length === 0) return [];

      const embeddedQuery = await this.embedText(query.trim());
      if (!embeddedQuery) return [];

      const scored: CharacterRagSearchResult[] = [];

      for (const entry of entries) {
        // 跳过 embeddingModel 不匹配的向量（与 narrativeRagService 第 280 行一致）
        if (entry.embeddingModel && entry.embeddingModel !== embeddedQuery.model) continue;
        if (entry.vector.length !== embeddedQuery.vector.length) continue;
        if (excludeIds.has(entry.id)) continue;

        const score = dot(embeddedQuery.vector, entry.vector);
        if (score >= minScore) {
          scored.push({ id: entry.id, canonicalName: entry.canonicalName, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    } catch (error) {
      console.warn('[角色RAG] search 失败:', error);
      return [];
    }
  }

  async buildSectionForPrompt(query: string, opts?: { topK?: number; minScore?: number; excludeIds?: string[] }): Promise<string> {
    if (!this.isEnabled() || !this.db) return '';

    try {
      const results = await this.search(query, opts);
      if (results.length === 0) return '';

      const { entries: registryEntries } = this.getRegistryInfo();
      const entryMap = new Map<string, RegistryEntry>();
      for (const entry of registryEntries) {
        entryMap.set(entry.id, entry);
      }

      const lines: string[] = [
        '## 检索召回的相关角色（正典参考，可能未在场）',
        '',
      ];

      let totalChars = lines.reduce((s, l) => s + l.length, 0);
      const MAX_CHARS = 2000;
      const MAX_PER_ENTRY = 300;

      for (const result of results) {
        const regEntry = entryMap.get(result.id);
        if (!regEntry) continue;

        const { canonicalName, gender, tier, staticProfile } = regEntry;
        const meta = [gender, tier].filter(Boolean).join('；');
        const identity = staticProfile?.identitySummary || '';
        const personality = Array.isArray(staticProfile?.personality)
          ? staticProfile.personality.join('、')
          : (staticProfile?.personality || '');
        const relation = Array.isArray(staticProfile?.relationToProtagonist)
          ? staticProfile.relationToProtagonist.join('；')
          : (staticProfile?.relationToProtagonist || '');
        const notes = Array.isArray(staticProfile?.notes)
          ? staticProfile.notes.slice(0, 4).join('；')
          : '';

        const parts: string[] = [];
        if (identity) parts.push(identity);
        if (personality) parts.push(`性格：${personality}`);
        if (relation) parts.push(`与主角关系：${relation}`);
        if (notes) parts.push(`正典备注：${notes}`);

        const scoreText = Number.isFinite(result.score) ? `（${result.score.toFixed(2)}）` : '';
        let line = `- **${canonicalName}**${meta ? `（${meta}）` : ''}${scoreText}`;
        if (parts.length > 0) {
          line += `：${parts.join('；')}`;
        }

        const truncated = line.length > MAX_PER_ENTRY ? line.slice(0, MAX_PER_ENTRY - 3) + '...' : line;
        if (totalChars + truncated.length + 1 > MAX_CHARS) break;
        lines.push(truncated);
        totalChars += truncated.length + 1;
      }

      lines.push('');
      lines.push('【说明】以上为按当前场景语义召回的正典角色参考（含可能不在场者）；仅作背景知识与一致性参考，不得凭空让其登场，除非剧情/玩家引入。');

      return lines.join('\n');
    } catch (error) {
      console.warn('[角色RAG] buildSectionForPrompt 失败:', error);
      return '';
    }
  }

  async getStats(): Promise<{ total: number; indexedModel?: string; dimension?: number; registryHash?: string }> {
    if (!this.db) return { total: 0 };
    try {
      const allEntries = await this.db.getAll(STORE_NAME);
      const metaEntry = allEntries.find(e => e.id === '__meta__') as { registryHash?: string; embeddingModel?: string; dimension?: number } | undefined;
      const entries = allEntries.filter(e => e.id !== '__meta__');
      return {
        total: entries.length,
        indexedModel: metaEntry?.embeddingModel,
        dimension: metaEntry?.dimension,
        registryHash: metaEntry?.registryHash,
      };
    } catch (error) {
      console.warn('[角色RAG] getStats 失败:', error);
      return { total: 0 };
    }
  }

  async clear(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.clear(STORE_NAME);
      console.log('[角色RAG] 已清空检索索引');
    } catch (error) {
      console.warn('[角色RAG] clear 失败:', error);
    }
  }
}

export const characterRagService = new CharacterRagService();
