/**
 * 一键反馈包：把日志 + 版本信息 + 模型连接配置摘要（+ 可选当前存档）打成单个 zip（store 模式，见 zip.ts）。
 * - 存档默认不带；includeSave 为真才读。叙事原文是否脱敏由 game-numbers 的 feedback 段决定（默认脱敏）。
 * - 密钥一律脱敏，与是否带存档、是否脱敏叙事无关：键名命中 diagnostics.redactKeys 整值替换，字符串里命中
 *   diagnostics.redactPatterns 的密钥形状（sk-…、Bearer …）替换；模型配置摘要只挑白名单字段，且只记“是否填了密钥”。
 * - 不依赖 Pinia / Vue：启动失败兜底界面（Vue 未挂载）也能调用；存档与配置读取都可注入，便于测试。
 */
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { diagnosticsConfig, type DiagnosticsConfig } from './config';
import { buildLogExport, saveBlob } from './export';
import { getBuildInfo } from './buildInfo';
import { SESSION_ID, logError } from './log';
import { REDACTED, isSecretKey, scrubString } from './redact';
import { logStore } from './store';
import { createZip, type ZipFile } from './zip';

export interface FeedbackConfig {
  /** 带存档时是否把叙事原文替换成占位（只留字数）。默认 true。 */
  redactSaveNarrative: boolean;
  /** 存档里叙事原文所在的键路径（数组按透明处理，不含下标）。 */
  narrativePaths: string[][];
  /** 叙事路径下仍原样保留的键名（如消息的 type / time）。 */
  narrativeKeepKeys: string[];
}

export const feedbackConfig = (): FeedbackConfig => (GAME_NUMBERS as { feedback: FeedbackConfig }).feedback;

export function validateFeedbackConfig(cfg: FeedbackConfig | undefined = (GAME_NUMBERS as { feedback?: FeedbackConfig }).feedback): string[] {
  if (!cfg || typeof cfg !== 'object') return ['feedback 段缺失'];
  const problems: string[] = [], names = (v: unknown): v is string[] => Array.isArray(v) && v.every(item => typeof item === 'string' && item.length > 0);
  if (typeof cfg.redactSaveNarrative !== 'boolean') problems.push('feedback.redactSaveNarrative 须为布尔');
  if (!Array.isArray(cfg.narrativePaths) || cfg.narrativePaths.some(path => !names(path) || path.length === 0)) problems.push('feedback.narrativePaths 须为非空键名数组组成的数组');
  if (!names(cfg.narrativeKeepKeys)) problems.push('feedback.narrativeKeepKeys 须为非空字符串数组');
  return problems;
}
registerNumbersValidator(() => validateFeedbackConfig());

// ───────────── 脱敏 ─────────────

const MAX_DEPTH = 64;
const narrativePlaceholder = (text: string): string => `[叙事原文已脱敏，${[...text].length}字]`;
const samePath = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * 深度脱敏（不改入参，返回新结构）：密钥键整值替换、字符串里的密钥形状替换；
 * narrative 非空时，其 narrativePaths 子树内的字符串换成占位（narrativeKeepKeys 下的除外）。永不抛错。
 */
export function scrubDeep(value: unknown, cfg: DiagnosticsConfig = diagnosticsConfig(), narrative: FeedbackConfig | null = null): unknown {
  const seen = new WeakSet<object>();
  const walk = (node: unknown, path: string[], inNarrative: boolean, key: string | undefined, depth: number): unknown => {
    if (key !== undefined && isSecretKey(key, cfg)) return REDACTED;
    if (typeof node === 'string') {
      if (inNarrative && !(key !== undefined && narrative?.narrativeKeepKeys.includes(key))) return narrativePlaceholder(node);
      return scrubString(node, cfg, Number.MAX_SAFE_INTEGER);
    }
    if (node === null || node === undefined || typeof node === 'number' || typeof node === 'boolean') return node;
    if (typeof node === 'bigint') return String(node);
    if (typeof node !== 'object') return `[${typeof node}]`;
    if (seen.has(node)) return '[循环引用]';
    if (depth >= MAX_DEPTH) return '[嵌套过深]';
    seen.add(node);
    const out = Array.isArray(node)
      ? node.map(item => walk(item, path, inNarrative, undefined, depth + 1))
      : Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => {
          const childPath = [...path, k];
          return [k, walk(v, childPath, inNarrative || !!narrative?.narrativePaths.some(p => samePath(p, childPath)), k, depth + 1)];
        }));
    seen.delete(node);
    return out;
  };
  try {
    return walk(value, [], false, undefined, 0);
  } catch {
    return '[无法脱敏，已整体省略]'; // lcq-allow: 脱敏失败宁可整体丢弃（getter 抛错、Proxy 等），也不能让原文漏出去
  }
}

// ───────────── 模型连接配置摘要 ─────────────

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const hasText = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
const pick = (source: Rec, keys: string[]): Rec => Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));

/** 只留 协议://主机[:端口]/路径：去掉账号口令、查询串、锚点（密钥常带在这些位置）。 */
export function describeUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return scrubString(url.split(/[?#]/)[0].replace(/\/\/[^/@\s]*@/, '//')); // lcq-allow: 非标准 URL 降级为去查询串后的脱敏文本，摘要不因此失败
  }
}

const describeApi = (api: Rec): Rec => ({
  ...pick(api, ['id', 'name', 'provider', 'model', 'temperature', 'maxTokens', 'enabled', 'forceJsonOutput']),
  url: describeUrl(api.url),
  keySet: hasText(api.apiKey), // 只记填没填，不记长度、不记前后缀
});

/** 把 localStorage 里的 API 管理配置与 AI 服务配置压成摘要（白名单字段）。入参形状错误也不抛。 */
export function summarizeModelConfig(raw: { apiManagement?: unknown; aiService?: unknown }): Rec {
  const mgmt = asRec(raw.apiManagement), service = asRec(raw.aiService), custom = asRec(service.customAPI);
  return {
    apiManagement: {
      apis: asList(mgmt.apiConfigs).map(api => describeApi(asRec(api))),
      apiAssignments: asList(mgmt.apiAssignments).map(a => pick(asRec(a), ['type', 'apiId'])),
      moduleAssignments: asList(mgmt.moduleAssignments).map(a => pick(asRec(a), ['moduleId', 'apiId'])),
      functionModes: asList(mgmt.functionModes).map(a => pick(asRec(a), ['type', 'mode'])),
      functionEnabled: asList(mgmt.functionEnabled).map(a => pick(asRec(a), ['type', 'enabled'])),
      moduleEnabled: asRec(mgmt.moduleEnabled),
    },
    aiService: {
      ...pick(service, ['mode', 'streaming', 'maxRetries']),
      customAPI: describeApi(custom),
    },
  };
}

function readStoredJson(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : undefined;
  } catch {
    return { unreadable: true }; // lcq-allow: 配置读不出就在摘要里标“不可读”，反馈包照常导出
  }
}
const readModelConfig = (): Rec => summarizeModelConfig({ apiManagement: readStoredJson('api_management_config'), aiService: readStoredJson('ai_service_config') });

// ───────────── 当前存档 ─────────────

export interface LoadedSave { slot: string; data: unknown }

/** 默认读取：当前激活存档（只读本机 IndexedDB，不弹提示、不改任何存档）。动态引入，兜底界面的轻量路径不背存档库依赖。 */
async function loadActiveSave(): Promise<LoadedSave | null> {
  const db = await import('@/utils/indexedDBManager');
  const active = (await db.loadRootData()).当前激活存档;
  if (!active) return null;
  const data = await db.loadSaveDataStrict(active.角色ID, active.存档槽位, { localOnly: true });
  return data ? { slot: active.存档槽位, data } : null;
}

// ───────────── 组包 ─────────────

export interface FeedbackOptions { includeSave?: boolean }
export interface FeedbackDeps {
  loadSave?: () => Promise<LoadedSave | null>;
  readModelConfig?: () => unknown;
  now?: () => Date;
}
export interface FeedbackManifest {
  formatVersion: 1;
  app: string;
  createdAt: string;
  files: Array<{ name: string; bytes: number }>;
  save: { requested: boolean; included: boolean; slot?: string; narrativeRedacted?: boolean; note?: string };
}
export interface FeedbackPack { fileName: string; bytes: Uint8Array; manifest: FeedbackManifest }
export interface FeedbackResult { ok: boolean; /** 勾选了存档但没带上时为 false，原因见 saveNote。 */ saveIncluded: boolean; saveNote?: string }

export const feedbackFileName = (at: Date = new Date()): string => `lcq-feedback-${at.toISOString().replace(/[:.]/g, '-')}.zip`;

export async function buildFeedbackPack(options: FeedbackOptions = {}, deps: FeedbackDeps = {}): Promise<FeedbackPack> {
  const now = (deps.now ?? (() => new Date()))(), cfg = diagnosticsConfig(), fb = feedbackConfig();
  await logStore.flush();
  const logs = await buildLogExport(), build = getBuildInfo();
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const files: ZipFile[] = [];
  const addJson = (name: string, value: unknown, pretty = true) => files.push({ name, data: JSON.stringify(scrubDeep(value, cfg), null, pretty ? 2 : 0) });

  addJson('version.json', {
    app: logs.app, gameVersion: build.version, buildId: build.buildId, gitSha: build.gitSha, contentPackVersion: build.contentPackVersion,
    exportedAt: now.toISOString(), sessionId: SESSION_ID, userAgent: nav?.userAgent, language: nav?.language,
  });
  addJson('logs.json', logs);
  addJson('model-config.json', (deps.readModelConfig ?? readModelConfig)());

  const save: FeedbackManifest['save'] = { requested: !!options.includeSave, included: false };
  if (options.includeSave) {
    try {
      const loaded = await (deps.loadSave ?? loadActiveSave)();
      if (!loaded) save.note = '没有找到当前存档';
      else {
        files.push({ name: 'save.json', data: JSON.stringify(scrubDeep(loaded.data, cfg, fb.redactSaveNarrative ? fb : null)) });
        Object.assign(save, { included: true, slot: scrubString(loaded.slot, cfg), narrativeRedacted: fb.redactSaveNarrative });
      }
    } catch (error) {
      logError('LCQ-SAV-018', error);
      save.note = '读取存档失败，反馈包未带存档';
    }
  }

  const encoder = new TextEncoder();
  const manifest: FeedbackManifest = {
    formatVersion: 1, app: logs.app, createdAt: now.toISOString(), save,
    files: files.map(file => ({ name: file.name, bytes: typeof file.data === 'string' ? encoder.encode(file.data).length : file.data.length })),
  };
  files.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  return { fileName: feedbackFileName(now), bytes: createZip(files, now), manifest };
}

/** 组包并触发下载；失败记 LCQ-UI-006 并返回 ok:false（不抛错）。 */
export async function downloadFeedbackPack(options: FeedbackOptions = {}, deps: FeedbackDeps = {}): Promise<FeedbackResult> {
  try {
    const pack = await buildFeedbackPack(options, deps);
    saveBlob(new Blob([pack.bytes as BlobPart], { type: 'application/zip' }), pack.fileName);
    return { ok: true, saveIncluded: pack.manifest.save.included, saveNote: pack.manifest.save.note };
  } catch (error) {
    logError('LCQ-UI-006', error);
    return { ok: false, saveIncluded: false };
  }
}
