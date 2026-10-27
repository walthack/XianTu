/**
 * 叙事来源日志（总策划 2026-10-28；真机叙事偶有中文夹英文，查不出是哪条路径、哪个提示词模块生成的）。
 * - 模型每生成一段玩家可见正文，记一条 LCQ-NAR-001：生成路径、触发来源、模型模块 id、提示词模块 id 与是否用户自定义、
 *   模型名、回合 / 拍序号、正文字数、正文全文（verbatim，只抹密钥形状），以及本机时区的生成时刻 generatedAt。
 * - 正文里夹在中文之间的拉丁单词（字母数 ≥ minLetters，前后 contextChars 字内有汉字，不在白名单里）再记一条 LCQ-NAR-002，
 *   带命中词、前后各 contextChars 字与同样的来源字段。只记录，不改写正文；永不抛错。
 * - 调用方给了 withheldTerms（主角尚不自知的设定与相关功法词，scenarioMods/undisclosedSelfFacts.ts）时，正文里出现其中的词
 *   再记一条 LCQ-NAR-003，同样只记录、不改写正文。
 * 来源由调用方给：回合正文（MainGamePanel 发送收尾）、场面拍描写与场内闲聊（sceneModule/host）、开局正文（characterInitialization）。
 * 提示词模块的“是否用户自定义”由 promptStorage.get 经 notePromptUse 报到这里；模块模型路由由 gameModelModules 经 noteModelRoute 报到这里。
 * 配置：game-numbers diagnostics.narrativeSource；说明见 docs/NARRATIVE-SOURCE-LOG.md。
 */
import { diagnosticsConfig, type DiagnosticsConfig } from './config';
import { logEvent } from './log';
import { registerStatsProvider } from './statsProviders';
import { localIsoTimestamp } from './store';

/** 记录点：回合正文 / 场面拍描写 / 场内闲聊 / 开局正文。 */
export type NarrativeSite = 'turn' | 'scene_beat' | 'scene_chat' | 'opening';
export interface PromptModuleUse { id: string; custom: boolean }
export interface NarrativeSource {
  site: NarrativeSite;
  /** 生成路径：回合埋点的 path（modular / legacy / legacy_pilot）、场面 sceneModule、开局 opening。 */
  path: string;
  /** 触发来源（现有 id）：freeAction:<actionClass>.<variant>、judgement:<kind>、event:<eventId>#<actionId>、opportunity:<id>、openWorld:<kind>、gambleRefusal:<actionId>、scene:<contractId>。 */
  triggers?: string[];
  /** 模型模块 id（moduleModelRuntime 的 GAME_MODEL_MODULES，如 narrative）；旧链路没有模块卡为 null。 */
  moduleId?: string | null;
  prompts?: PromptModuleUse[];
  model?: string | null;
  provider?: string | null;
  /** 叙事回合序号（系统.历史.叙事 的条数）。 */
  turn?: number | null;
  /** 场面拍序号（SceneState.beat）。 */
  beat?: number | null;
  generationId?: string;
  eventId?: string;
  /** 此刻正文不该出现的词（主角尚不自知的设定及相关功法词）；不进来源字段，只用于 LCQ-NAR-003。 */
  withheldTerms?: string[];
}
export interface MixedLatinHit { word: string; before: string; after: string }

type NarrativeSourceConfig = DiagnosticsConfig['narrativeSource'];
const narrativeSourceConfig = (): NarrativeSourceConfig => diagnosticsConfig().narrativeSource;

// ───────────── 夹英文检测 ─────────────

const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const LATIN_WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

/** 正文里夹在中文之间的拉丁单词；白名单（人名专名 + 程宗扬现代口语）不分大小写整词豁免。 */
export function findMixedLatin(text: string, cfg: NarrativeSourceConfig = narrativeSourceConfig()): MixedLatinHit[] {
  const allowed = new Set([...cfg.nameWhitelist, ...cfg.colloquialWhitelist].map(word => word.trim().toLowerCase()));
  const hits: MixedLatinHit[] = [], body = String(text ?? ''), span = cfg.contextChars;
  for (const match of body.matchAll(LATIN_WORD)) {
    const word = match[0], at = match.index ?? 0;
    if (word.replace(/[^A-Za-z]/g, '').length < cfg.minLetters || allowed.has(word.toLowerCase())) continue;
    // 先按 UTF-16 多取一倍再按字切，避免把扩展区汉字切成半个代理对。
    const before = Array.from(body.slice(Math.max(0, at - span * 2), at)).slice(-span).join('');
    const after = Array.from(body.slice(at + word.length, at + word.length + span * 2)).slice(0, span).join('');
    if (HAN.test(before) || HAN.test(after)) hits.push({ word, before, after });
  }
  return hits;
}

/** 正文里出现的禁词（逐次出现记一条，带前后 contextChars 字）。 */
export function findWithheldTerms(text: string, terms: readonly string[], cfg: NarrativeSourceConfig = narrativeSourceConfig()): MixedLatinHit[] {
  const hits: MixedLatinHit[] = [], body = String(text ?? ''), span = cfg.contextChars;
  for (const word of new Set(terms.filter(Boolean))) {
    for (let at = body.indexOf(word); at >= 0; at = body.indexOf(word, at + word.length)) {
      const before = Array.from(body.slice(Math.max(0, at - span * 2), at)).slice(-span).join('');
      const after = Array.from(body.slice(at + word.length, at + word.length + span * 2)).slice(0, span).join('');
      hits.push({ word, before, after });
    }
  }
  return hits;
}

// ───────────── 来源登记（提示词取用、模块模型路由） ─────────────

const promptUses = new Map<string, { custom: boolean; at: number }>();
const modelRoutes = new Map<string, { model: string | null; provider: string | null; at: number }>();

/** promptStorage.get 每取一次提示词报一次：custom = 用的是用户改过的内容。 */
export function notePromptUse(id: string, custom: boolean): void {
  promptUses.delete(id);
  promptUses.set(id, { custom, at: Date.now() });
}
/** 某提示词模块最近一次取用的情况；没取过为 undefined。 */
export function promptUse(id: string): PromptModuleUse | undefined {
  const use = promptUses.get(id);
  return use ? { id, custom: use.custom } : undefined;
}
/** since（ms）之后取用过的全部提示词模块，按取用先后。 */
export function promptUsesSince(since: number): PromptModuleUse[] {
  return [...promptUses].filter(([, use]) => use.at >= since).sort((a, b) => a[1].at - b[1].at).map(([id, use]) => ({ id, custom: use.custom }));
}

/** gameModelModules 每次跑模块报一次路由（模型名、服务商）。 */
export function noteModelRoute(moduleId: string, route: { model?: string | null; provider?: string | null }): void {
  modelRoutes.set(moduleId, { model: route.model ?? null, provider: route.provider ?? null, at: Date.now() });
}
export function lastModelRoute(moduleId: string): { model: string | null; provider: string | null } | undefined {
  const route = modelRoutes.get(moduleId);
  return route ? { model: route.model, provider: route.provider } : undefined;
}

// ───────────── 触发来源 ─────────────

export interface NarrativeTriggerInput {
  tickets?: ReadonlyArray<{ actionClass?: string; variant?: string }>;
  judgement?: { kind?: string; authorityReceipt?: { kind?: string; actionClass?: string; variant?: string } | null } | null;
  eventAction?: { eventId?: string; actionId?: string } | null;
  opportunity?: { opportunityId?: string; id?: string } | null;
  openWorld?: { kind?: string } | null;
  gambleRefusal?: { actionId?: string } | null;
}

/** 把本回合的票、判定、事件动作等拼成触发来源 id 列表（去重、保序）。 */
export function narrativeTriggers(input: NarrativeTriggerInput): string[] {
  const out: string[] = [];
  const add = (id: string | false | undefined | null): void => { if (id && !out.includes(id)) out.push(id); };
  for (const ticket of input.tickets ?? []) add(ticket.actionClass && ticket.variant && `freeAction:${ticket.actionClass}.${ticket.variant}`);
  const receipt = input.judgement?.authorityReceipt;
  if (receipt?.kind === 'free_action_judgement') add(receipt.actionClass && receipt.variant && `freeAction:${receipt.actionClass}.${receipt.variant}`);
  add(input.judgement?.kind && `judgement:${input.judgement.kind}`);
  add(input.eventAction?.eventId && `event:${input.eventAction.eventId}${input.eventAction.actionId ? `#${input.eventAction.actionId}` : ''}`);
  const opportunity = input.opportunity?.opportunityId ?? input.opportunity?.id;
  add(opportunity && `opportunity:${opportunity}`);
  add(input.openWorld?.kind && `openWorld:${input.openWorld.kind}`);
  add(input.gambleRefusal?.actionId && `gambleRefusal:${input.gambleRefusal.actionId}`);
  return out;
}

// ───────────── 记录 ─────────────

const stats = { records: 0, flagged: 0, withheld: 0, words: new Map<string, number>() };

const sourceFields = (source: NarrativeSource) => ({
  site: source.site, path: source.path, triggers: source.triggers ?? [], moduleId: source.moduleId ?? null,
  prompts: (source.prompts ?? []).map(use => ({ id: use.id, custom: use.custom })),
  model: source.model ?? null, provider: source.provider ?? null,
  turn: source.turn ?? null, beat: source.beat ?? null,
  ...(source.generationId ? { generationId: source.generationId } : {}),
  ...(source.eventId ? { eventId: source.eventId } : {}),
});

/**
 * 记一段模型生成的玩家可见正文：LCQ-NAR-001（来源 + 全文），夹英文时再记 LCQ-NAR-002。
 * generatedAtMs 缺省取现在。返回命中的夹英文词（正文本身不动）。永不抛错。
 */
export function recordNarrativeSource(source: NarrativeSource, text: string, generatedAtMs: number = Date.now()): MixedLatinHit[] {
  try {
    const body = String(text ?? '');
    if (!body.trim()) return [];
    const fields = sourceFields(source), generatedAt = localIsoTimestamp(generatedAtMs), textChars = Array.from(body).length;
    logEvent({
      code: 'LCQ-NAR-001', msg: `叙事来源：${fields.site}/${fields.path}，模型 ${fields.model ?? '未知'}，${textChars}字`,
      detail: { ...fields, generatedAt, textChars }, verbatim: { text: body },
    });
    stats.records++;
    const hits = findMixedLatin(body);
    if (hits.length) {
      const words = [...new Set(hits.map(hit => hit.word))];
      logEvent({
        code: 'LCQ-NAR-002', msg: `叙事正文中文里夹拉丁单词：${words.join('、')}（${fields.site}/${fields.path}）`,
        detail: { ...fields, generatedAt, textChars, words, hits },
      });
      stats.flagged++;
      for (const word of words) stats.words.set(word.toLowerCase(), (stats.words.get(word.toLowerCase()) ?? 0) + 1);
    }
    const withheld = findWithheldTerms(body, source.withheldTerms ?? []);
    if (withheld.length) {
      const words = [...new Set(withheld.map(hit => hit.word))];
      logEvent({
        code: 'LCQ-NAR-003', msg: `叙事正文提前写出主角尚不自知的设定／功法词：${words.join('、')}（${fields.site}/${fields.path}）`,
        detail: { ...fields, generatedAt, textChars, words, terms: source.withheldTerms, hits: withheld },
      });
      stats.withheld++;
    }
    return hits;
  } catch {
    return []; // lcq-allow: 观察用的来源日志不得影响正文发布（配置异常、日志故障都吞掉）
  }
}

/** 回合正文收尾用：ModuleReceipt 与回合埋点只取用到的字段（结构类型，不依赖服务层）。 */
export interface TurnNarrativeInput {
  text: string;
  receipt?: { path?: string; route?: { model?: string; provider?: string } | null; eventId?: string } | null;
  telemetry?: { path?: string; model?: string | null; provider?: string | null; requestStartedAt?: number | null } | null;
  triggers?: string[];
  turn?: number | null;
  generationId?: string;
  /** 本回合开始时刻（ms）：旧链路按这之后取用过的提示词模块记。 */
  startedAt: number;
  /** 模块演出的提示词键（GAME_MODEL_MODULES 里 narrative 的 promptKey）。 */
  narrativePromptKey?: string;
  /** 见 NarrativeSource.withheldTerms；按回合结束后的进度算（点破那一拍已完成，不算违禁）。 */
  withheldTerms?: string[];
}

/**
 * 回合正文是不是模型写的、走的哪条路：有模块回执看回执（modular＝模型；local / card 不请求模型）；
 * 没回执（旧链路）看回合埋点：legacy / legacy_pilot 且本回合确实发过模型请求。是模型正文才记，返回是否记了。
 */
export function recordTurnNarrative(input: TurnNarrativeInput): boolean {
  try {
    const { receipt, telemetry } = input;
    const modular = receipt?.path === 'modular';
    const legacy = !receipt && telemetry?.requestStartedAt != null && (telemetry.path === 'legacy' || telemetry.path === 'legacy_pilot');
    if (!modular && !legacy) return false;
    const key = input.narrativePromptKey;
    recordNarrativeSource({
      site: 'turn', path: modular ? 'modular' : String(telemetry!.path), triggers: input.triggers ?? [],
      moduleId: modular ? 'narrative' : null,
      prompts: modular ? (key ? [promptUse(key) ?? { id: key, custom: false }] : []) : promptUsesSince(input.startedAt),
      model: (modular ? receipt?.route?.model : undefined) ?? telemetry?.model ?? null,
      provider: (modular ? receipt?.route?.provider : undefined) ?? telemetry?.provider ?? null,
      turn: input.turn ?? null, generationId: input.generationId, eventId: receipt?.eventId, withheldTerms: input.withheldTerms,
    }, input.text);
    return true;
  } catch {
    return false; // lcq-allow: 观察用的来源日志不得影响回合收尾
  }
}

/** 统计（诊断导出 / 反馈包的 stats.narrativeSource）：本会话记了几段、几段夹英文、各词出现的段数、几段写了尚不自知的词。 */
export function getNarrativeSourceStats(): { records: number; flagged: number; withheld: number; words: Record<string, number> } {
  return { records: stats.records, flagged: stats.flagged, withheld: stats.withheld, words: Object.fromEntries([...stats.words].sort((a, b) => b[1] - a[1])) };
}
registerStatsProvider('narrativeSource', getNarrativeSourceStats);

/** 仅供测试：清登记与统计。 */
export function resetNarrativeSourceState(): void {
  promptUses.clear(); modelRoutes.clear();
  stats.records = 0; stats.flagged = 0; stats.withheld = 0; stats.words.clear();
}
