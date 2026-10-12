import type { RequestDiagnosticContext } from './requestLifecycleDiagnostics';
/**
 * 叙事 RAG 检索服务
 *
 * 来自“织界”的 RAG 方案适配版：
 * - 只索引系统历史中的 assistant/GM 叙事文本，不索引玩家输入
 * - 每个存档使用独立 IndexedDB
 * - 必须使用 API 管理里分配给 Embedding 的独立 API；未配置或失败时不建索引、不检索
 * - 发送前检索相关叙事片段，作为轻量上下文注入主提示词
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { APIProvider } from '@/services/aiService';
import {
  createEmbeddings,
  normalizeBaseUrl,
  normalizeToUnitVector,
  type EmbeddingRequestConfig,
} from '@/services/embeddingService';

export interface NarrativeRagEntry {
  id: string;
  content: string;
  vector: number[];
  vectorType: 'hash' | 'embedding';
  embeddingModel?: string;
  narrativeIndex: number;
  timestamp: number;
  time?: string;
}

export interface NarrativeRagSearchResult {
  entry: NarrativeRagEntry;
  score: number;
}

export interface NarrativeRagConfig {
  enabled: boolean;
  topK: number;
  minSimilarity: number;
  maxContextChars: number;
  autoIndex: boolean;
}

const DEFAULT_CONFIG: NarrativeRagConfig = {
  enabled: false,
  topK: 4,
  minSimilarity: 0.6,
  maxContextChars: 1500,
  autoIndex: true,
};

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableNarrativeId(index: number, content: string): string {
  const normalized = (content || '').trim().replace(/\s+/g, ' ');
  return `nar_${index}_${fnv1a32(normalized).toString(16).padStart(8, '0')}`;
}

function dot(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

function getNarrativeItems(saveData: any): Array<{ index: number; content: string; time?: string }> {
  const list = saveData?.系统?.历史?.叙事;
  if (!Array.isArray(list)) return [];

  const result: Array<{ index: number; content: string; time?: string }> = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const role = String(item.role || '');
    const type = String(item.type || '');
    if (role && role !== 'assistant') continue;
    if (type && type !== 'gm' && type !== 'assistant') continue;

    const content = String(item.content || '').trim();
    if (!content) continue;
    result.push({ index: i, content, time: typeof item.time === 'string' ? item.time : undefined });
  }
  return result;
}

class NarrativeRagService {
  private db: IDBPDatabase | null = null;
  private saveSlot = '';
  private config: NarrativeRagConfig = { ...DEFAULT_CONFIG };

  constructor() {
    this.loadConfig();
  }

  async init(saveSlot: string): Promise<void> {
    const normalized = (saveSlot || 'default').replace(/[^\w\u4e00-\u9fff-]/g, '_');
    if (this.db && this.saveSlot === normalized) return;

    this.saveSlot = normalized;
    this.db = await openDB(`narrative-rag-${normalized}`, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' });
          store.createIndex('narrativeIndex', 'narrativeIndex');
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('vectorType', 'vectorType');
        }
      },
    });
    console.log(`[叙事RAG] 初始化完成: narrative-rag-${normalized}`);
  }

  private loadConfig(): void {
    try {
      const raw = localStorage.getItem('narrativeRagConfig');
      if (raw) this.config = this.normalizeConfig(JSON.parse(raw));
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private normalizeConfig(input: Partial<NarrativeRagConfig>): NarrativeRagConfig {
    return {
      enabled: input.enabled === true,
      topK: Math.max(1, Math.min(20, Math.floor(Number(input.topK) || DEFAULT_CONFIG.topK))),
      minSimilarity: Math.max(0.05, Math.min(1, Number(input.minSimilarity) || DEFAULT_CONFIG.minSimilarity)),
      maxContextChars: Math.max(200, Math.min(10000, Math.floor(Number(input.maxContextChars) || DEFAULT_CONFIG.maxContextChars))),
      autoIndex: input.autoIndex !== false,
    };
  }

  saveConfig(config: Partial<NarrativeRagConfig>): void {
    this.config = this.normalizeConfig({ ...this.config, ...config });
    localStorage.setItem('narrativeRagConfig', JSON.stringify(this.config));
  }

  getConfig(): NarrativeRagConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled && !!this.getEmbeddingRequestConfig();
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

  getEmbeddingStatus(): { available: boolean; provider?: APIProvider; model?: string; reason?: string } {
    const cfg = this.getEmbeddingRequestConfig();
    if (cfg) return { available: true, provider: cfg.provider, model: cfg.model };
    return { available: false, reason: '未配置独立 Embedding API，叙事检索不会启用或注入' };
  }

  private async embedBatch(texts: string[], diagnostics?: RequestDiagnosticContext): Promise<{ vectors: number[][]; model: string } | null> {
    const cfg = this.getEmbeddingRequestConfig();
    if (!cfg) return null;
    try {
      const vectors = await createEmbeddings(cfg, texts, diagnostics);
      return { vectors: vectors.map(v => normalizeToUnitVector(v)), model: cfg.model };
    } catch (error) {
      console.warn('[叙事检索] Embedding 生成失败，跳过叙事检索:', error);
      return null;
    }
  }

  private async embedText(text: string): Promise<{ vector: number[]; model: string } | null> {
    const embedded = await this.embedBatch([text]);
    if (!embedded || embedded.vectors.length !== 1) return null;
    return { vector: embedded.vectors[0], model: embedded.model };
  }

  async reconcile(saveData: any): Promise<number> {
    if (!this.db) return 0;
    const entries = await this.getAllEntries();
    if (entries.length === 0) return 0;

    const expected = new Map<string, string>();
    for (const item of getNarrativeItems(saveData)) {
      expected.set(stableNarrativeId(item.index, item.content), item.content);
    }

    let removed = 0;
    for (const entry of entries) {
      if (expected.get(entry.id) !== entry.content) {
        await this.db.delete('entries', entry.id);
        removed++;
      }
    }
    if (removed > 0) console.log(`[叙事RAG] 清理失效条目 ${removed} 条`);
    return removed;
  }

  async ensureIndexed(saveData: any, options?: { diagnostics?: RequestDiagnosticContext; batchSize?: number; onProgress?: (done: number, total: number) => void }): Promise<number> {
    if (!this.db) return 0;
    if (!this.getEmbeddingRequestConfig()) {
      throw new Error('未配置独立 Embedding API，无法同步叙事检索索引');
    }
    const items = getNarrativeItems(saveData);
    if (items.length === 0) return 0;

    await this.reconcile(saveData);

    const existingIds = new Set((await this.getAllEntries()).map(e => e.id));
    const pending = items.filter(item => !existingIds.has(stableNarrativeId(item.index, item.content)));
    if (pending.length === 0) return 0;

    const batchSize = Math.max(1, Math.min(64, options?.batchSize ?? 32));
    let added = 0;

    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const texts = batch.map(item => item.content);
      const embedded = await this.embedBatch(texts, options?.diagnostics);
      if (!embedded || embedded.vectors.length !== batch.length) {
        throw new Error('Embedding 生成失败，叙事检索索引未写入');
      }

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const entry: NarrativeRagEntry = {
          id: stableNarrativeId(item.index, item.content),
          content: item.content,
          vector: embedded.vectors[j],
          vectorType: 'embedding',
          embeddingModel: embedded.model,
          narrativeIndex: item.index,
          timestamp: Date.now(),
          time: item.time,
        };
        await this.db.put('entries', entry);
        added++;
      }
      options?.onProgress?.(Math.min(i + batch.length, pending.length), pending.length);
    }

    console.log(`[叙事RAG] 已补齐 ${added} 条叙事向量`);
    return added;
  }

  async search(query: string): Promise<NarrativeRagSearchResult[]> {
    if (!this.db || !this.isEnabled()) return [];
    const entries = await this.getAllEntries();
    if (entries.length === 0) return [];

    const embeddedQuery = await this.embedText(query);
    if (!embeddedQuery) return [];
    const scored: NarrativeRagSearchResult[] = [];

    for (const entry of entries) {
      if (entry.vectorType !== 'embedding') continue;
      if (entry.embeddingModel && entry.embeddingModel !== embeddedQuery.model) continue;
      if (entry.vector.length !== embeddedQuery.vector.length) continue;
      scored.push({ entry, score: dot(embeddedQuery.vector, entry.vector) });
    }

    scored.sort((a, b) => b.score - a.score);
    const filtered = scored.filter(item => item.score >= this.config.minSimilarity);
    const picked = (filtered.length > 0 ? filtered : scored.filter(item => item.score > 0)).slice(0, this.config.topK);
    return picked.sort((a, b) => a.entry.narrativeIndex - b.entry.narrativeIndex);
  }

  async buildSectionForPrompt(query: string, saveData: any): Promise<string> {
    if (!this.isEnabled() || !this.db) return '';
    if (this.config.autoIndex) {
      await this.ensureIndexed(saveData);
    }

    const results = await this.search(query);
    if (results.length === 0) return '';

    const lines = [
      '# 【历史叙事检索结果】',
      '以下内容来自本角色当前存档的“历史叙事正文”向量检索结果，是此前已经发生过的具体剧情片段。',
      '使用要求：只在与当前输入相关时参考这些片段，用于保持前后因果、地点细节、人物承诺、战斗经过和事件连续性；不要把它们当作本轮新发生的剧情；不要机械复述；如果与当前游戏状态冲突，以当前游戏状态和最新叙事为准。',
      '',
    ];
    let chars = 0;
    let idx = 1;
    for (const result of results) {
      const text = result.entry.content.trim();
      if (!text) continue;
      if (chars + text.length > this.config.maxContextChars) break;
      const scoreText = Number.isFinite(result.score) ? `（相似度 ${result.score.toFixed(3)}）` : '';
      lines.push(`${idx}. ${text}${scoreText}`);
      chars += text.length;
      idx++;
    }

    return idx > 1 ? lines.join('\n') : '';
  }

  async getAllEntries(): Promise<NarrativeRagEntry[]> {
    if (!this.db) return [];
    const entries = await this.db.getAll('entries') as NarrativeRagEntry[];
    return entries.filter(entry => entry.vectorType === 'embedding');
  }

  async getStats(): Promise<{ total: number; byVectorType: Record<string, number>; pending?: number }> {
    const entries = await this.getAllEntries();
    const byVectorType: Record<string, number> = {};
    for (const entry of entries) {
      byVectorType[entry.vectorType] = (byVectorType[entry.vectorType] || 0) + 1;
    }
    return { total: entries.length, byVectorType };
  }

  countVectorizableNarratives(saveData: any): number {
    return getNarrativeItems(saveData).length;
  }

  async countPending(saveData: any): Promise<number> {
    if (!this.db) return 0;
    const existingIds = new Set((await this.getAllEntries()).map(e => e.id));
    return getNarrativeItems(saveData).filter(item => !existingIds.has(stableNarrativeId(item.index, item.content))).length;
  }

  async clear(): Promise<void> {
    if (!this.db) return;
    await this.db.clear('entries');
    console.log('[叙事检索] 已清空检索索引');
  }
}

export const narrativeRagService = new NarrativeRagService();
