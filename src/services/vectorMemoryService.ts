import { STATUS_CATALOG } from '../modules/sceneModule/statuses';
/**
 * 向量记忆服务
 *
 * 使用共享 Embedding API 存储长期记忆向量，实现智能检索
 * 支持标签提取、向量化、相似度检索
 *
 * 特点：
 * - 纯前端实现，使用 IndexedDB 存储
 * - 使用 API 管理里分配给 Embedding 的共享 API
 * - 支持标签过滤 + 向量相似度混合检索
 * - 保留全量发送模式作为备选
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { APIProvider } from '@/services/aiService';
import { isTavernEnv } from '@/utils/tavern';
import {
  createEmbeddings,
  normalizeBaseUrl,
  normalizeToUnitVector,
  type EmbeddingRequestConfig,
} from '@/services/embeddingService';

// ============ 类型定义 ============

export interface VectorMemoryEntry {
  id: string;
  content: string;
  tags: string[];
  vector: number[];
  vectorType?: 'tfidf' | 'embedding';
  embeddingModel?: string;
  timestamp: number;
  importance: number;
  category: 'combat' | 'social' | 'cultivation' | 'exploration' | 'event' | 'other';
  metadata?: {
    npcs?: string[];
    locations?: string[];
    items?: string[];
    time?: string;
  };
}

export interface MemorySearchResult {
  entry: VectorMemoryEntry;
  score: number;
  matchedTags: string[];
}

export interface VectorMemoryConfig {
  enabled: boolean;
  maxRetrieveCount: number;  // 最多检索多少条
  minSimilarity: number;     // 最低相似度阈值
  tagWeight: number;         // 标签匹配权重 (0-1)
  vectorWeight: number;      // 向量相似度权重 (0-1)
  embeddingApiId?: string;   // Embedding API ID（可选，默认使用 'embedding' 类型分配的API）
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: VectorMemoryConfig = {
  enabled: false,  // 默认关闭，保留全量发送
  maxRetrieveCount: 10,
  minSimilarity: 0.3,
  tagWeight: 0.4,
  vectorWeight: 0.6,
  embeddingApiId: undefined,  // 默认使用 'embedding' 类型分配的API
};

// ============ 中文分词和关键词提取 ============

// 修仙相关关键词词典
const CULTIVATION_KEYWORDS = new Set([
  // 境界
  '无修为', '筑基', '内视', '生象', '入微', '坐照', '通幽', '归元', '至臻', '入神',
  '初期', '中期', '后期', '突破', '瓶颈',
  // 修炼
  '修炼', '闭关', '悟道', '感悟', '丹田', '经脉', '灵气', '真气', '法力', '神识',
  // 战斗
  '战斗', '交手', '斩杀', '击败', ...STATUS_CATALOG.filter(s => s.id === 'wound.severe').flatMap(s => [s.label,...(s.aliases || [])]), '轻伤', ...STATUS_CATALOG.filter(s => s.id === 'dying').flatMap(s => [s.label,...(s.aliases || [])]), '陨落',
  // 物品
  '丹药', '法宝', '功法', '秘籍', '材料', '灵草',
  // 关系
  '师父', '徒弟', '道友', '敌人', '仇人', '盟友', '宗门', '门派',
  // 地点
  '洞府', '山门', '秘境', '禁地', '坊市', '城池',
  // 事件
  '拜师', '入门', '出关', '历练', '任务', '机缘', '劫难',
]);

// 停用词
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '有', '和', '与', '或', '也', '都', '就', '着', '被', '让',
  '把', '给', '从', '到', '向', '往', '对', '于', '为', '而', '但', '却', '因', '所',
  '这', '那', '它', '他', '她', '我', '你', '们', '自', '其', '此', '彼',
  '一', '个', '些', '很', '更', '最', '非', '不', '无', '没', '未',
]);

/**
 * 简单中文分词（基于词典 + 单字切分）
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 先提取词典中的关键词
  for (const keyword of CULTIVATION_KEYWORDS) {
    if (text.includes(keyword)) tokens.push(keyword);
  }

  // 提取人名（两到四个汉字，前后没有常见词缀）
  const namePattern = /[\u4e00-\u9fa5]{2,4}/g;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const word = match[0];
    if (!STOP_WORDS.has(word) && !CULTIVATION_KEYWORDS.has(word)) {
      tokens.push(word);
    }
  }

  return [...new Set(tokens)]; // 去重
}

/**
 * 从记忆内容中提取标签
 */
export function extractTags(content: string): string[] {
  const tags: string[] = [];
  const tokens = tokenize(content);

  for (const token of tokens) {
    // 优先添加修仙关键词
    if (CULTIVATION_KEYWORDS.has(token)) {
      tags.push(token);
    }
  }

  // 提取可能的人名（连续2-3个汉字，不在词典中）
  const namePattern = /[\u4e00-\u9fa5]{2,3}/g;
  let match;
  while ((match = namePattern.exec(content)) !== null) {
    const word = match[0];
    if (!STOP_WORDS.has(word) && !CULTIVATION_KEYWORDS.has(word)) {
      // 可能是人名或地名
      if (tags.length < 15) {
        tags.push(word);
      }
    }
  }

  return [...new Set(tags)].slice(0, 20); // 最多20个标签
}

/**
 * 推断记忆分类
 */
export function inferCategory(content: string, tags: string[]): VectorMemoryEntry['category'] {
  const combatKeywords = ['战斗', '交手', '斩杀', '击败', ...STATUS_CATALOG.filter(s => s.id === 'wound.severe').flatMap(s => [s.label,...(s.aliases || [])]), '攻击', '防御'];
  const socialKeywords = ['师父', '徒弟', '道友', '拜师', '结交', '好感', '关系'];
  const cultivationKeywords = ['修炼', '闭关', '突破', '感悟', '境界', '功法'];
  const explorationKeywords = ['探索', '发现', '秘境', '历练', '寻找'];
  const eventKeywords = ['机缘', '劫难', '事件', '任务', '完成'];

  const check = (keywords: string[]) =>
    keywords.some(k => content.includes(k) || tags.includes(k));

  if (check(combatKeywords)) return 'combat';
  if (check(socialKeywords)) return 'social';
  if (check(cultivationKeywords)) return 'cultivation';
  if (check(explorationKeywords)) return 'exploration';
  if (check(eventKeywords)) return 'event';
  return 'other';
}

// ============ 向量记忆服务类 ============

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableMemoryId(content: string): string {
  const normalized = (content || '').trim().replace(/\s+/g, ' ');
  return `mem_${fnv1a32(normalized)}`;
}

class VectorMemoryService {
  private db: IDBPDatabase | null = null;
  private config: VectorMemoryConfig;
  private saveSlot: string = '';

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.loadConfig();
  }

  /**
   * 初始化数据库
   */
  async init(saveSlot: string): Promise<void> {
    this.saveSlot = saveSlot;
    const dbName = `vector-memory-${saveSlot}`;

    this.db = await openDB(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('memories')) {
          const store = db.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('tags', 'tags', { multiEntry: true });
          store.createIndex('category', 'category');
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });

    console.log(`[向量记忆] 初始化完成: ${dbName}`);
  }

  /**
   * 加载配置
   */
  private loadConfig(): void {
    try {
      const saved = localStorage.getItem('vectorMemoryConfig');
      if (saved) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('[向量记忆] 加载配置失败，使用默认配置');
    }
  }

  /**
   * 保存配置
   */
  saveConfig(config: Partial<VectorMemoryConfig>): void {
    this.config = { ...this.config, ...config };
    localStorage.setItem('vectorMemoryConfig', JSON.stringify(this.config));
  }

  /**
   * 获取当前配置
   */
  getConfig(): VectorMemoryConfig {
    return { ...this.config };
  }

  /**
   * 是否启用向量检索：必须开启长期检索配置，并配置共享 Embedding API
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.getEmbeddingRequestConfig();
  }

  /**
   * 是否允许自动写入索引：长期检索和叙事检索共用 API 管理里的 Embedding 配置
   */
  canAutoIndex(): boolean {
    return !!this.db && !!this.getEmbeddingRequestConfig();
  }

  private getEmbeddingRequestConfig(): EmbeddingRequestConfig | null {
    try {
      // 动态导入 store 避免循环依赖
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAPIManagementStore } = require('@/stores/apiManagementStore');
      const apiStore = useAPIManagementStore();

      // 🔥 首先检查 embedding 功能是否在 API 管理中启用
      if (!apiStore.isFunctionEnabled('embedding')) {
        return null;
      }

      // 如果配置了特定的 API ID，使用该 API；否则使用 'embedding' 类型分配的 API
      let cfg;
      if (this.config.embeddingApiId) {
        cfg = apiStore.apiConfigs.find((api: any) => api.id === this.config.embeddingApiId && api.enabled);
      } else {
        cfg = apiStore.getAPIForType('embedding');
      }

      if (!cfg || cfg.enabled === false) return null;

      // 如果返回的是 default API，说明没有专门配置 embedding API，不应使用
      if (cfg.id === 'default') return null;

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

    if (isTavernEnv()) {
      return { available: false, reason: '酒馆环境下需为 Embedding 分配独立API（非默认）并填写 Key/模型' };
    }
    return {
      available: false,
      reason:
        '请在 API管理 中为 Embedding 配置 API 地址/Key/模型；硅基流动推荐使用 BAAI/bge-m3 模型；阿里百炼请用 DashScope 原生域名',
    };
  }

  private async embedText(text: string): Promise<{ vector: number[]; model: string } | null> {
    const cfg = this.getEmbeddingRequestConfig();
    if (!cfg) return null;
    try {
      const [vec] = await createEmbeddings(cfg, [text]);
      return { vector: normalizeToUnitVector(vec), model: cfg.model };
    } catch (e) {
      console.warn('[长期检索] Embedding 生成失败，跳过向量写入/检索:', e);
      return null;
    }
  }

  private async embedBatch(texts: string[]): Promise<{ vectors: number[][]; model: string } | null> {
    const cfg = this.getEmbeddingRequestConfig();
    if (!cfg) return null;
    try {
      const vecs = await createEmbeddings(cfg, texts);
      return { vectors: vecs.map(v => normalizeToUnitVector(v)), model: cfg.model };
    } catch (e) {
      console.warn('[长期检索] Embedding 批量生成失败，跳过向量写入:', e);
      return null;
    }
  }

  /**
   * 添加记忆到向量库
   */
  async addMemory(content: string, importance: number = 5): Promise<VectorMemoryEntry | null> {
    if (!this.db) {
      console.warn('[向量记忆] 数据库未初始化');
      return null;
    }

    const trimmed = (content || '').trim();
    if (!trimmed) return null;

    const tags = extractTags(content);
    const category = inferCategory(content, tags);
    const embedded = await this.embedText(trimmed);
    if (!embedded) return null;

    const entry: VectorMemoryEntry = {
      id: stableMemoryId(trimmed),
      content: trimmed,
      tags,
      vector: embedded.vector,
      vectorType: 'embedding',
      embeddingModel: embedded.model,
      timestamp: Date.now(),
      importance,
      category,
      metadata: {
        npcs: tags.filter(t => !CULTIVATION_KEYWORDS.has(t)).slice(0, 5),
      },
    };

    await this.db.put('memories', entry);
    console.log(`[向量记忆] 添加记忆: ${content.substring(0, 50)}... 标签: ${tags.join(', ')}`);
    return entry;
  }

  /**
   * 重建向量库：清空后将长期记忆全部向量化写入
   * - 必须使用 API 管理里分配给 Embedding 的独立 API，不做本地向量兜底
   */
  async rebuildFromLongTermMemories(
    memories: string[],
    options?: {
      importance?: number;
      batchSize?: number;
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<{ imported: number; vectorType: 'embedding'; embeddingModel?: string }> {
    if (!this.db) throw new Error('向量库未初始化');
    if (!this.getEmbeddingRequestConfig()) throw new Error('未配置独立 Embedding API，无法生成长期检索索引');
    const list = (memories || []).map(m => (m || '').trim()).filter(Boolean);
    const total = list.length;
    const importance = options?.importance ?? 7;
    const batchSize = Math.max(1, Math.min(64, options?.batchSize ?? 24));

    await this.clear();

    let imported = 0;
    let usedEmbeddingModel: string | undefined;

    for (let i = 0; i < list.length; i += batchSize) {
      const chunk = list.slice(i, i + batchSize);
      const embedded = await this.embedBatch(chunk);
      if (!embedded || embedded.vectors.length !== chunk.length) {
        throw new Error('Embedding 生成失败，长期检索索引未写入完整');
      }

      usedEmbeddingModel = embedded.model;
      for (let j = 0; j < chunk.length; j++) {
        const content = chunk[j];
        const tags = extractTags(content);
        const category = inferCategory(content, tags);
        const entry: VectorMemoryEntry = {
          id: stableMemoryId(content),
          content,
          tags,
          vector: embedded.vectors[j],
          vectorType: 'embedding',
          embeddingModel: embedded.model,
          timestamp: Date.now(),
          importance,
          category,
          metadata: { npcs: tags.filter(t => !CULTIVATION_KEYWORDS.has(t)).slice(0, 5) },
        };
        await this.db.put('memories', entry);
        imported++;
      }

      options?.onProgress?.(Math.min(i + chunk.length, total), total);
    }

    console.log(`[长期检索] 重建完成：${imported}/${total} 条，Embedding=${usedEmbeddingModel || 'unknown'}`);
    return { imported, vectorType: 'embedding', embeddingModel: usedEmbeddingModel };
  }

  /**
   * 批量导入长期记忆
   */
  async importLongTermMemories(memories: string[]): Promise<number> {
    let count = 0;
    for (const memory of memories) {
      if (memory && memory.trim()) {
        const added = await this.addMemory(memory, 7); // 长期记忆重要性较高
        if (added) count++;
      }
    }
    console.log(`[向量记忆] 导入 ${count} 条长期记忆`);
    return count;
  }

  /**
   * 将当前存档的长期记忆同步成本地向量索引。
   * - 新增/变更的长期记忆会写入 IndexedDB
   * - 已从存档删除的长期记忆会从索引移除
   * - 旧的本地 TF-IDF 条目会被忽略，不参与同步计数
   */
  async syncFromLongTermMemories(
    memories: string[],
    options?: {
      importance?: number;
      batchSize?: number;
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<{ added: number; removed: number; total: number }> {
    if (!this.db) throw new Error('向量库未初始化');
    if (!this.getEmbeddingRequestConfig()) throw new Error('未配置独立 Embedding API，无法同步长期检索索引');

    const list = [...new Set((memories || []).map(m => (m || '').trim()).filter(Boolean))];
    const expectedIds = new Set(list.map(content => stableMemoryId(content)));
    const existing = await this.db.getAll('memories') as VectorMemoryEntry[];

    let removed = 0;
    for (const entry of existing) {
      if (entry.vectorType !== 'embedding' || !expectedIds.has(entry.id)) {
        await this.db.delete('memories', entry.id);
        removed++;
      }
    }

    const existingEmbeddingIds = new Set(
      existing
        .filter(entry => entry.vectorType === 'embedding' && expectedIds.has(entry.id))
        .map(entry => entry.id),
    );
    const pending = list.filter(content => !existingEmbeddingIds.has(stableMemoryId(content)));
    const batchSize = Math.max(1, Math.min(64, options?.batchSize ?? 24));
    const importance = options?.importance ?? 7;
    let added = 0;

    for (let i = 0; i < pending.length; i += batchSize) {
      const chunk = pending.slice(i, i + batchSize);
      const embedded = await this.embedBatch(chunk);
      if (!embedded || embedded.vectors.length !== chunk.length) {
        throw new Error('Embedding 生成失败，长期检索索引未写入完整');
      }

      for (let j = 0; j < chunk.length; j++) {
        const content = chunk[j];
        const tags = extractTags(content);
        const category = inferCategory(content, tags);
        const entry: VectorMemoryEntry = {
          id: stableMemoryId(content),
          content,
          tags,
          vector: embedded.vectors[j],
          vectorType: 'embedding',
          embeddingModel: embedded.model,
          timestamp: Date.now(),
          importance,
          category,
          metadata: { npcs: tags.filter(t => !CULTIVATION_KEYWORDS.has(t)).slice(0, 5) },
        };
        await this.db.put('memories', entry);
        added++;
      }
      options?.onProgress?.(Math.min(i + chunk.length, pending.length), pending.length);
    }

    if (added || removed) {
      console.log(`[长期检索] 索引同步完成：新增 ${added} 条，移除 ${removed} 条，总数 ${list.length}`);
    }
    return { added, removed, total: list.length };
  }

  /**
   * 检索相关记忆
   */
  async searchMemories(query: string, context?: {
    currentLocation?: string;
    involvedNpcs?: string[];
    recentEvents?: string[];
  }): Promise<MemorySearchResult[]> {
    if (!this.db || !this.isEnabled()) {
      return [];
    }

    const queryTags = extractTags(query);

    // 添加上下文标签
    if (context?.involvedNpcs) {
      queryTags.push(...context.involvedNpcs);
    }
    if (context?.currentLocation) {
      queryTags.push(context.currentLocation);
    }

    const allMemories = await this.db.getAll('memories') as VectorMemoryEntry[];
    const results: MemorySearchResult[] = [];

    const queryTextForEmbedding = [
      query,
      context?.currentLocation ? `地点: ${context.currentLocation}` : '',
      ...(context?.recentEvents || []).slice(0, 3).map(e => `事件: ${e}`),
    ].filter(Boolean).join('\n');

    const embeddedQuery = await this.embedText(queryTextForEmbedding);
    const embeddingModel = embeddedQuery?.model;
    const embeddingQueryVector = embeddedQuery?.vector;
    if (!embeddingQueryVector) return [];

    const scored: MemorySearchResult[] = [];

    for (const entry of allMemories) {
      const entryVectorType = (entry.vectorType || 'tfidf') as 'embedding' | 'tfidf';
      if (entryVectorType !== 'embedding') continue;
      if (embeddingModel && entry.embeddingModel && entry.embeddingModel !== embeddingModel) continue;
      if (entry.vector.length !== embeddingQueryVector.length) continue;

      // 计算标签匹配分数
      const matchedTags = entry.tags.filter(t => queryTags.includes(t));
      const tagScore = matchedTags.length / Math.max(queryTags.length, 1);

      // 计算向量相似度
      let vectorScore = 0;
      for (let i = 0; i < embeddingQueryVector.length; i++) vectorScore += embeddingQueryVector[i] * entry.vector[i];

      // 综合分数
      const score = tagScore * this.config.tagWeight + vectorScore * this.config.vectorWeight;

      scored.push({ entry, score, matchedTags });
    }

    // 按分数排序，取前 N 条
    scored.sort((a, b) => b.score - a.score);

    const filtered = scored.filter(r => r.score >= this.config.minSimilarity);
    const picked = (filtered.length > 0 ? filtered : scored).slice(0, this.config.maxRetrieveCount);
    results.push(...picked);
    return results;
  }

  /**
   * 获取所有记忆（用于全量发送模式）
   */
  async getAllMemories(): Promise<VectorMemoryEntry[]> {
    if (!this.db) return [];
    const memories = await this.db.getAll('memories') as VectorMemoryEntry[];
    return memories.filter(mem => mem.vectorType === 'embedding');
  }

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    topTags: { tag: string; count: number }[];
    byVectorType: Record<string, number>;
    byEmbeddingModel: Record<string, number>;
  }> {
    if (!this.db) {
      return { total: 0, byCategory: {}, topTags: [], byVectorType: {}, byEmbeddingModel: {} };
    }

    const memories = (await this.db.getAll('memories') as VectorMemoryEntry[])
      .filter(mem => mem.vectorType === 'embedding');
    const byCategory: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    const byVectorType: Record<string, number> = {};
    const byEmbeddingModel: Record<string, number> = {};

    for (const mem of memories) {
      byCategory[mem.category] = (byCategory[mem.category] || 0) + 1;
      const vt = mem.vectorType || 'tfidf';
      byVectorType[vt] = (byVectorType[vt] || 0) + 1;
      if (vt === 'embedding' && mem.embeddingModel) {
        byEmbeddingModel[mem.embeddingModel] = (byEmbeddingModel[mem.embeddingModel] || 0) + 1;
      }
      for (const tag of mem.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      total: memories.length,
      byCategory,
      topTags,
      byVectorType,
      byEmbeddingModel,
    };
  }

  /**
   * 清空向量库
   */
  async clear(): Promise<void> {
    if (!this.db) return;
    await this.db.clear('memories');
    console.log('[向量记忆] 已清空向量库');
  }

  /**
   * 格式化检索结果为发送给 AI 的文本
   */
  formatForAI(results: MemorySearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    const lines = [
      '# 【长期记忆检索结果】',
      '以下内容来自本角色当前存档的“长期记忆”向量检索结果，是已经总结沉淀的事实、关系、承诺、重大事件或长期状态。',
      '使用要求：只在与当前输入相关时参考这些记忆来保持连续性；不要把它们当作本轮新发生的剧情；不要逐条复述；如果与当前情境冲突，以当前游戏状态和最新叙事为准。',
      '',
    ];
    let index = 1;
    for (const { entry, matchedTags, score } of results) {
      const tagStr = matchedTags.length > 0 ? `[${matchedTags.join(',')}]` : '';
      const scoreStr = Number.isFinite(score) ? `相似度 ${score.toFixed(3)}` : '相似度未知';
      lines.push(`${index}. ${tagStr ? `${tagStr} ` : ''}${entry.content}（${scoreStr}）`);
      index++;
    }
    return lines.join('\n');
  }
}

// 导出单例
export const vectorMemoryService = new VectorMemoryService();
