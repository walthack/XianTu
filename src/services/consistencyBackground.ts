import { currentDiagnosticTurnId, diagnosticContext, reserveDiagnosticBackground, noteDiagnosticCancellation } from './requestLifecycleDiagnostics';
import { filterLedgerMemory } from '@/modules/scenarioMods/ledger/guardFramework';
import { relationshipOf, splitRecordPath } from '@/modules/scenarioMods/ledger/affinityIdentity';
import { computeScenarioPresence } from '@/modules/scenarioMods/storyContext';
import { fieldLayer, pickAbsentRelationFields, projectNpcMemory, PROMPT_LAYERS } from '@/modules/scenarioMods/promptLayers';
import { calculateAgeFromBirthdate } from '@/utils/lifespanCalculator';
import { parseJsonFromText } from '@/utils/jsonExtract';
import { logEvent } from '@/modules/diagnostics/log';
import { useAPIManagementStore } from '@/stores/apiManagementStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useUIStore } from '@/stores/uiStore';
import { isContentModerationError } from './apiErrorMessage';
import { isGameModuleEnabled, resolveGameModuleRoute, runGameModelModule } from './gameModelModules';
import { GAME_MODEL_MODULES, type ModelModuleInput } from './moduleModelRuntime';
import { DUAL_MODEL_CONFIG, needsPaidConfirm } from './dualModelConfig';
import type { SaveData } from '@/types/game';

/**
 * 双模型后端（consistency 模块，设计稿 2026-11-03-双模型分工 ①③④⑥「合规写法」；用户 22:26 定稿）。
 * - 输入：代码按白名单组装（turnId、游戏时间、最近 summaryWindow 条概要、在场角色账、在场角色基础层设定、时间线、本回合变化），
 *   只读 历史.叙事 条目的 summary 字段；不读正文（content）、本地全文副本、短期记忆、玩家原始输入。私密层与 私密信息 一律不进。
 * - 输出：模型 JSON 经校验后变成待落账指令入队，不当场写存档；落账前核对角色、槽位、epoch、回执未回滚（仿 modularTurnBackground）。
 * - 队列：前台开始时不取消在途；前台忙只排队，下次前台提交后先落账；落后超 maxLagTurns 的等待任务丢弃；切档或关闭作废并清已存提示。
 * - 写入：relationshipOf 定位、追加 记忆 并按 npcMemoryKeep 封顶；好感不写；连续性提示存 系统.扩展.<extensionKey>。
 * - 422/1026：标记该回合概要 summaryFlag=moderated，去掉概要与 NPC 记忆重发 degradedAttempts 次；仍失败丢弃。其他错误/超时丢弃。
 *   丢弃只记 LCQ-NET-020，不提示玩家。不导入任何 freeAction/ 路径（freeAction/memory.ts 不收模型文字）。
 */
const BACKEND = DUAL_MODEL_CONFIG.dualModel.backend;
const MODULE_ID = BACKEND.moduleId;
const definition = GAME_MODEL_MODULES.find(item => item.id === MODULE_ID)!;
const IS_DEV_BUILD = typeof MODULE_DEV_DEFAULTS !== 'undefined' ? MODULE_DEV_DEFAULTS === true : false;
const HOUR_MS = 60 * 60 * 1000;
const CONTINUITY_KINDS = new Set(['timeline', 'canon', 'fact']);
export const MODERATED_FLAG = 'moderated';

type UnknownRecord = Record<string, any>;
const chars = (text: string) => Array.from(text).length;
const isRecord = (value: unknown): value is UnknownRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** 本回合回执：主叙事路径用 历史.叙事 末条 gm 的下标＋detailId＋概要定位，回滚或改写即对不上。 */
export interface ConsistencyTurn { turnId: string; index: number; detailId: string; summary: string; /** 第几条 gm（落后回合数按它算） */ ordinal: number; }

export interface ConsistencyInput {
  turnId: string;
  游戏时间: unknown;
  summaries: Array<{ turnId: string; summary: string }>;
  ledger: UnknownRecord[];
  canonBase: UnknownRecord[];
  timeline: { 开局已过年数: number; 当前年?: number; 年龄: Record<string, number> };
  stateDelta: { 位置?: unknown; 好感: Array<{ id: string; 变化: number }> };
}

export interface ConsistencyInstruction {
  turnId: string; turnIndex: number; detailId: string; summary: string;
  characterId: string; slotId: string; epoch: number;
  npcMemory: Array<{ id: string; entry: string }>;
  relationNotes: Array<{ id: string; 关系: string }>;
  continuity: Array<{ kind: string; about: string; note: string }>;
  summaryCheck: { ok: boolean; issue: string };
  /** 'moderated'＝本回合概要被后端请求拒过；只有这一项时表示后台结果已丢弃，只落标记。 */
  summaryFlag?: typeof MODERATED_FLAG;
  /** false＝无后端结果（降级仍失败），落账只写 summaryFlag。 */
  hasResult: boolean;
}

/** 落账与读取存档的边界：调用方（MainGamePanel）用自己的 store 组装；测试注入假实现。 */
export interface ConsistencyHost {
  scope(): { characterId: string; slotId: string };
  /** 只读快照（gameStateStore.toSaveData）。 */
  snapshot(): SaveData | null;
  /** 活的 社交.关系 / 历史.叙事 / 系统.扩展，落账直接改它们。 */
  relations(): UnknownRecord | null;
  history(): UnknownRecord[] | null;
  extensions(): UnknownRecord;
  isBusy(): boolean;
  persist(): Promise<unknown>;
  enabled?(): boolean;
  paidConfirmNeeded?(): boolean;
  run?(input: ModelModuleInput): Promise<{ raw: string }>;
  now?(): number;
}

export interface StartConsistencyOptions {
  /** 本回合 stateChanges.changes（只取 角色.位置 与 社交.关系.<id>.好感度 两类键）。 */
  stateChanges?: { changes?: Array<{ key?: string; oldValue?: unknown; newValue?: unknown }> } | null;
  diagnosticTurnId?: string | null;
}

// ---------------------------------------------------------------- 输入组装（白名单）

function gmEntries(history: readonly unknown[] | null | undefined): Array<{ index: number; entry: UnknownRecord }> {
  return (Array.isArray(history) ? history : [])
    .map((entry, index) => ({ index, entry: entry as UnknownRecord }))
    .filter(({ entry }) => isRecord(entry) && entry.type === 'gm');
}

const turnIdOf = (index: number, detailId: string) => `${index}:${detailId}`;

/** 最新一条带概要的 gm 条目；只读 summary／detailId，不读 content。 */
export function latestConsistencyTurn(save: SaveData | null | undefined): ConsistencyTurn | null {
  const entries = gmEntries((save as UnknownRecord | null)?.系统?.历史?.叙事);
  const last = entries.at(-1);
  if (!last) return null;
  const summary = asText(last.entry.summary);
  if (!summary) return null;
  const detailId = asText(last.entry.detailId);
  return { turnId: turnIdOf(last.index, detailId), index: last.index, detailId, summary, ordinal: entries.length - 1 };
}

interface PresentCharacter { id: string; key: string; profile: UnknownRecord; canon?: UnknownRecord; }

/** 在场判定的近期叙事兜底只给它概要：历史.叙事 换成 {role,type,summary→正文位}，正文与玩家意图不进。 */
function presenceView(save: SaveData): SaveData {
  const source = save as UnknownRecord;
  const history = (Array.isArray(source.系统?.历史?.叙事) ? source.系统.历史.叙事 : [])
    .map((entry: UnknownRecord) => ({ role: entry?.role, type: entry?.type, content: asText(entry?.summary) }));
  return { ...source, 系统: { ...source.系统, 历史: { 叙事: history } } } as SaveData;
}

/** 本回合在场且已登记（社交.关系 里 角色ID 唯一可定位）的角色；在场口径同 18:07 投影（computeScenarioPresence，不带玩家输入）。 */
export function presentCharacters(save: SaveData): PresentCharacter[] {
  const presence = computeScenarioPresence(presenceView(save), '');
  if (!presence) return [];
  const canon = presence.runtime.canon?.characters || [];
  const out: PresentCharacter[] = [];
  for (const [key, npc] of Object.entries(((save as UnknownRecord).社交?.关系 || {}) as UnknownRecord)) {
    if (!isRecord(npc)) continue;
    const name = String(npc.名字 || key);
    if (!presence.presentNames.has(key) && !presence.presentNames.has(name)) continue;
    const id = asText(npc.角色ID);
    if (!id || relationshipOf(save as any, id)?.key !== key) continue;
    out.push({ id, key, profile: npc, canon: canon.find(item => item.id === id) as UnknownRecord | undefined });
  }
  return out;
}

function ledgerOf(present: PresentCharacter, withMemory: boolean): UnknownRecord {
  const entry: UnknownRecord = { ...(pickAbsentRelationFields(present.profile) || {}), 角色ID: present.id };
  if (withMemory) entry.记忆 = projectNpcMemory(Array.isArray(present.profile.记忆) ? present.profile.记忆 : []).slice(-BACKEND.ledgerMemoryPerNpc);
  return entry;
}

/** 基础层：只取 promptLayers 登记为 base 的字段（身份、性格）；gated／secret／私密层不取。 */
function canonBaseOf(present: PresentCharacter): UnknownRecord | null {
  const character = present.canon;
  if (!character) return null;
  const profile = isRecord(character.profile) ? character.profile : {};
  const base: UnknownRecord = { id: present.id, 名字: character.name };
  const identity = asText(character.description) || asText(profile.origin);
  if (fieldLayer('identitySummary') === 'base' && identity) base.身份 = identity;
  if (fieldLayer('personality') === 'base' && Array.isArray(profile.personality) && profile.personality.length) base.性格 = profile.personality;
  return base;
}

function timelineOf(save: SaveData, present: PresentCharacter[]): ConsistencyInput['timeline'] {
  const now = (save as UnknownRecord).元数据?.时间;
  const ages: Record<string, number> = {};
  for (const item of present) {
    const birth = item.profile.出生日期;
    if (isRecord(now) && Number.isFinite(now.年) && isRecord(birth) && Number.isFinite(birth.年)) ages[item.id] = calculateAgeFromBirthdate(birth as any, now as any);
  }
  return { 开局已过年数: BACKEND.timeline.yearsElapsedAtOpening, ...(isRecord(now) && Number.isFinite(now.年) ? { 当前年: now.年 } : {}), 年龄: ages };
}

function stateDeltaOf(options: StartConsistencyOptions, present: PresentCharacter[]): ConsistencyInput['stateDelta'] {
  const delta: ConsistencyInput['stateDelta'] = { 好感: [] };
  const byKey = new Map(present.flatMap(item => [[item.key, item.id], [item.id, item.id]] as const));
  for (const change of options.stateChanges?.changes || []) {
    const parts = splitRecordPath(String(change?.key || ''));
    if (parts[0] === '角色' && parts[1] === '位置') delta.位置 = isRecord(change.newValue) ? change.newValue.描述 ?? delta.位置 : change.newValue;
    if (parts[0] === '社交' && parts[1] === '关系' && parts[3] === '好感度' && parts.length === 4 && byKey.has(parts[2])) {
      const diff = Number(change.newValue) - Number(change.oldValue || 0);
      if (Number.isFinite(diff) && diff !== 0) delta.好感.push({ id: byKey.get(parts[2])!, 变化: diff });
    }
  }
  return delta;
}

/**
 * 组装后端输入（白名单）。degraded＝审核降级：去掉概要与 NPC 记忆，只留账的数值部分与设定。
 * 超 maxInputChars 时依次丢最旧概要、去账里的记忆、去基础设定；仍超返回 null（本回合不发）。
 */
export function buildConsistencyInput(save: SaveData, turn: ConsistencyTurn, options: StartConsistencyOptions = {}, degraded = false): ConsistencyInput | null {
  const present = presentCharacters(save);
  const placeholder = DUAL_MODEL_CONFIG.memory.moderatedPlaceholder;
  const summaries = degraded ? [] : gmEntries((save as UnknownRecord).系统?.历史?.叙事)
    .filter(item => item.index <= turn.index && asText(item.entry.summary))
    .slice(-BACKEND.summaryWindow)
    .map(({ index, entry }) => ({
      turnId: turnIdOf(index, asText(entry.detailId)),
      summary: entry.summaryFlag === MODERATED_FLAG ? placeholder : asText(entry.summary),
    }));
  let withMemory = !degraded;
  let withCanon = true;
  const assemble = (): ConsistencyInput => ({
    turnId: turn.turnId,
    游戏时间: (save as UnknownRecord).元数据?.时间,
    summaries,
    ledger: present.map(item => ledgerOf(item, withMemory)),
    canonBase: withCanon ? present.map(canonBaseOf).filter((item): item is UnknownRecord => !!item) : [],
    timeline: timelineOf(save, present),
    stateDelta: stateDeltaOf(options, present),
  });
  let input = assemble();
  const fits = () => JSON.stringify(input).length <= BACKEND.maxInputChars;
  while (!fits() && summaries.length > 1) { summaries.shift(); input = assemble(); }
  if (!fits() && withMemory) { withMemory = false; input = assemble(); }
  if (!fits() && withCanon) { withCanon = false; input = assemble(); }
  return fits() ? input : null;
}

// ---------------------------------------------------------------- 输出校验

export interface ConsistencyValidation {
  npcMemory: ConsistencyInstruction['npcMemory'];
  relationNotes: ConsistencyInstruction['relationNotes'];
  continuity: ConsistencyInstruction['continuity'];
  summaryCheck: ConsistencyInstruction['summaryCheck'];
  rejected: Array<{ id: string; reason: string }>;
}

/**
 * 解析并校验后端输出；整体不合格抛错。逐条：id 须本回合在场且已登记；NPC 记忆每条 ≤ npcEntryMaxChars 并过事实守卫
 * （filterLedgerMemory）；continuity 只留合法 kind，最多 continuityMaxItems 条。
 */
export function validateConsistencyOutput(raw: string, turn: ConsistencyTurn, save: SaveData): ConsistencyValidation {
  const parsed = parseJsonFromText<UnknownRecord>(raw);
  if (!isRecord(parsed)) throw new Error('后端输出不是 JSON 对象');
  if (parsed.turnId !== undefined && String(parsed.turnId) !== turn.turnId) throw new Error('后端输出 turnId 与本回合不符');
  const presentIds = new Set(presentCharacters(save).map(item => item.id));
  const rejected: ConsistencyValidation['rejected'] = [];
  const npcMemory: ConsistencyValidation['npcMemory'] = [];
  for (const item of Array.isArray(parsed.npcMemory) ? parsed.npcMemory : []) {
    const id = asText(item?.id); const entry = asText(item?.entry);
    if (!presentIds.has(id)) { rejected.push({ id, reason: 'not_present' }); continue; }
    if (!entry) { rejected.push({ id, reason: 'empty' }); continue; }
    if (chars(entry) > PROMPT_LAYERS.memory.npcEntryMaxChars) { rejected.push({ id, reason: 'too_long' }); continue; }
    const safe = filterLedgerMemory(entry, save);
    if (!safe) { rejected.push({ id, reason: 'guard' }); continue; }
    npcMemory.push({ id, entry: safe });
  }
  const relationNotes: ConsistencyValidation['relationNotes'] = [];
  for (const item of Array.isArray(parsed.relationNotes) ? parsed.relationNotes : []) {
    const id = asText(item?.id); const relation = asText(item?.关系);
    if (!presentIds.has(id)) { rejected.push({ id, reason: 'not_present' }); continue; }
    if (relation) relationNotes.push({ id, 关系: relation });
  }
  const continuity = (Array.isArray(parsed.continuity) ? parsed.continuity : [])
    .map((item: any) => ({ kind: asText(item?.kind), about: asText(item?.about), note: asText(item?.note) }))
    .filter((item: { kind: string; note: string }) => CONTINUITY_KINDS.has(item.kind) && item.note)
    .slice(0, BACKEND.continuityMaxItems);
  const check = isRecord(parsed.summaryCheck) ? parsed.summaryCheck : {};
  return { npcMemory, relationNotes, continuity, summaryCheck: { ok: check.ok !== false, issue: asText(check.issue) }, rejected };
}

// ---------------------------------------------------------------- 队列与落账

interface Job { turn: ConsistencyTurn; characterId: string; slotId: string; epoch: number; options: StartConsistencyOptions; diagnosticTurnId: string | null; }

let epoch = 0;
let inFlight: { job: Job; controller: AbortController } | null = null;
const waiting: Job[] = [];
const pending: ConsistencyInstruction[] = [];
const requestTimes: number[] = [];
let persistQueue: Promise<unknown> = Promise.resolve();

function drop(reason: string, detail: Record<string, unknown> = {}): void {
  logEvent({ code: 'LCQ-NET-020', detail: { reason, ...detail }, echo: false });
}

/** 落账：核对角色、槽位、epoch 与回执（同下标、同 detailId、同概要）；返回是否写入。 */
export function applyConsistencyInstruction(host: ConsistencyHost, item: ConsistencyInstruction): boolean {
  const scope = host.scope();
  if (item.characterId !== scope.characterId || item.slotId !== scope.slotId || item.epoch !== epoch) return false;
  const receipt = host.history()?.[item.turnIndex];
  if (!isRecord(receipt) || receipt.type !== 'gm' || asText(receipt.detailId) !== item.detailId || asText(receipt.summary) !== item.summary) return false;
  if (item.summaryFlag) receipt.summaryFlag = item.summaryFlag;
  if (!item.hasResult) return !!item.summaryFlag;
  const relations = host.relations() || {};
  for (const memory of item.npcMemory) {
    const profile = relationshipOf({ 社交: { 关系: relations } } as any, memory.id)?.profile as UnknownRecord | undefined;
    if (!profile) continue;
    const list: unknown[] = Array.isArray(profile.记忆) ? profile.记忆 : [];
    if (list.at(-1) !== memory.entry) list.push(memory.entry);
    profile.记忆 = list.slice(-BACKEND.npcMemoryKeep);
  }
  const extensions = host.extensions();
  const previous = extensions[BACKEND.extensionKey];
  // 迟到的旧回合结果不覆盖新回合已落的提示。
  if (!(isRecord(previous) && Number(previous.turnIndex) > item.turnIndex)) {
    extensions[BACKEND.extensionKey] = {
      turnId: item.turnId, turnIndex: item.turnIndex,
      continuity: item.continuity, relationNotes: item.relationNotes, summaryCheck: item.summaryCheck,
    };
  }
  return true;
}

function persist(host: ConsistencyHost, item: ConsistencyInstruction): void {
  persistQueue = persistQueue.catch(() => { /* lcq-allow: 上一笔失败已记日志，这里只接续队列 */ }).then(async () => {
    if (host.isBusy()) { pending.push(item); return; }
    if (applyConsistencyInstruction(host, item)) await host.persist();
  // lcq-allow: 经 drop() 记 LCQ-NET-020。
  }).catch(error => drop('persist_failed', { turnId: item.turnId, error: String((error as Error)?.message || error).slice(0, 200) }));
}

function flushPending(host: ConsistencyHost): Promise<unknown> {
  if (!pending.length) return persistQueue;
  const queued = pending.splice(0);
  persistQueue = persistQueue.catch(() => { /* lcq-allow: 上一笔失败已记日志，这里只接续队列 */ }).then(async () => {
    if (queued.map(item => applyConsistencyInstruction(host, item)).some(Boolean)) await host.persist();
  // lcq-allow: 经 drop() 记 LCQ-NET-020。
  }).catch(error => drop('persist_failed', { error: String((error as Error)?.message || error).slice(0, 200) }));
  return persistQueue;
}

function withinBudget(now: number): boolean {
  while (requestTimes.length && now - requestTimes[0] >= HOUR_MS) requestTimes.shift();
  return requestTimes.length < BACKEND.hourlyBudget;
}

const isEnabled = (host: ConsistencyHost) => (host.enabled ? host.enabled() : isGameModuleEnabled(definition));

function paidConfirmNeeded(host: ConsistencyHost): boolean {
  if (host.paidConfirmNeeded) return host.paidConfirmNeeded();
  const route = resolveGameModuleRoute(definition);
  const apiId = route.viaHost ? 'host' : route.config?.id || '';
  const model = route.viaHost ? '' : route.config?.model || '';
  return needsPaidConfirm(model, IS_DEV_BUILD, useAPIManagementStore().isPaidModelConfirmed(apiId, model));
}

async function request(host: ConsistencyHost, job: Job, input: ConsistencyInput, controller: AbortController, attempt: number): Promise<string> {
  requestTimes.push(host.now ? host.now() : Date.now());
  const system = BACKEND.instruction
    .replace('{npcEntryMaxChars}', String(PROMPT_LAYERS.memory.npcEntryMaxChars))
    .replace('{continuityMaxItems}', String(BACKEND.continuityMaxItems));
  const generationId = `consistency_${job.turn.turnId}_${attempt}`;
  const moduleInput: ModelModuleInput = {
    diagnostics: diagnosticContext(MODULE_ID, generationId, true, job.diagnosticTurnId),
    generationId, signal: controller.signal, system, input: JSON.stringify(input),
  };
  const result = host.run ? await host.run(moduleInput) : await runGameModelModule(MODULE_ID, moduleInput);
  return result.raw;
}

async function runJob(host: ConsistencyHost, job: Job, controller: AbortController): Promise<ConsistencyInstruction | null> {
  const base = {
    turnId: job.turn.turnId, turnIndex: job.turn.index, detailId: job.turn.detailId, summary: job.turn.summary,
    characterId: job.characterId, slotId: job.slotId, epoch: job.epoch,
    npcMemory: [], relationNotes: [], continuity: [], summaryCheck: { ok: true, issue: '' },
  };
  const save = host.snapshot();
  if (!save) return null;
  let flag: ConsistencyInstruction['summaryFlag'];
  for (let attempt = 0; attempt <= (flag ? BACKEND.degradedAttempts : 0); attempt += 1) {
    const input = buildConsistencyInput(save, job.turn, job.options, !!flag);
    if (!input) { drop('input_too_large', { turnId: job.turn.turnId }); break; }
    if (!withinBudget(host.now ? host.now() : Date.now())) { drop('budget', { turnId: job.turn.turnId }); break; }
    try {
      const raw = await request(host, job, input, controller, attempt);
      const checked = validateConsistencyOutput(raw, job.turn, save);
      const { rejected, ...accepted } = checked;
      if (rejected.length) drop('entries_rejected', { turnId: job.turn.turnId, rejected });
      return { ...base, ...accepted, ...(flag ? { summaryFlag: flag } : {}), hasResult: true };
    } catch (error) {
      // lcq-allow: 取消静默；其余分支经 drop() 记 LCQ-NET-020，不提示玩家。
      if (controller.signal.aborted) return null;
      if (isContentModerationError(error)) {
        if (!flag) { flag = MODERATED_FLAG; drop('moderated', { turnId: job.turn.turnId, attempt }); continue; }
        drop('moderated_degraded', { turnId: job.turn.turnId, attempt });
        continue;
      }
      drop('failed', { turnId: job.turn.turnId, attempt, error: String((error as Error)?.message || error).slice(0, 200) });
      break;
    }
  }
  return flag ? { ...base, summaryFlag: flag, hasResult: false } : null;
}

function pump(host: ConsistencyHost): void {
  if (inFlight || host.isBusy() || !waiting.length) return;
  const latest = Math.max(...waiting.map(job => job.turn.ordinal));
  // 落后超过 maxLagTurns 的等待任务丢弃；输入窗口仍覆盖它们的概要。
  for (let i = waiting.length - 1; i >= 0; i -= 1) {
    if (latest - waiting[i].turn.ordinal > BACKEND.maxLagTurns) drop('lag', { turnId: waiting.splice(i, 1)[0].turn.turnId });
  }
  const job = waiting.shift();
  if (!job) return;
  const controller = new AbortController();
  inFlight = { job, controller };
  const releaseDiagnostic = reserveDiagnosticBackground(job.diagnosticTurnId);
  void runJob(host, job, controller).then(item => {
    if (item && item.epoch === epoch) persist(host, item);
  // lcq-allow: 经 drop() 记 LCQ-NET-020。
  }).catch(error => drop('failed', { turnId: job.turn.turnId, error: String((error as Error)?.message || error).slice(0, 200) }))
    .finally(() => {
      if (inFlight?.controller === controller) inFlight = null;
      releaseDiagnostic();
      pump(host);
    });
}

/** 切档／卸载／关闭后端：作废在途与排队结果，并清掉已存的连续性提示（防止重开时注入过期内容）。 */
export function cancelConsistencyBackground(host?: Pick<ConsistencyHost, 'extensions'>): void {
  epoch += 1;
  pending.length = 0;
  waiting.length = 0;
  if (inFlight) { noteDiagnosticCancellation(inFlight.controller.signal, 'scope_change'); inFlight.controller.abort(); inFlight = null; }
  if (host) {
    const extensions = host.extensions();
    if (extensions && BACKEND.extensionKey in extensions) delete extensions[BACKEND.extensionKey];
  }
}

/**
 * 前台提交并存档后调用：先落账排队结果，再为本回合排一个后端任务。
 * 开关关（dualModel.enabled 或玩家开关）＝作废并清提示，不发请求；正式版名单外模型未确认＝不发请求。
 * 前台在途时不取消后端；前台忙时只排队，下次调用再发。
 */
export function startConsistencyBackground(host: ConsistencyHost, options: StartConsistencyOptions = {}): void {
  if (!isEnabled(host)) {
    if (pending.length || waiting.length || inFlight || BACKEND.extensionKey in (host.extensions() || {})) cancelConsistencyBackground(host);
    return;
  }
  if (host.isBusy()) return;
  void flushPending(host);
  if (paidConfirmNeeded(host)) return;
  const save = host.snapshot();
  const turn = latestConsistencyTurn(save);
  if (!turn) return;
  const scope = host.scope();
  if (!scope.characterId || !scope.slotId) return;
  const known = [inFlight?.job, ...waiting].some(job => job && job.turn.turnId === turn.turnId && job.epoch === epoch);
  const applied = host.extensions()?.[BACKEND.extensionKey]?.turnId === turn.turnId;
  if (!known && !applied) {
    waiting.push({ turn, ...scope, epoch, options, diagnosticTurnId: options.diagnosticTurnId ?? currentDiagnosticTurnId() });
  }
  pump(host);
}

/** 默认边界：读写 gameStateStore／uiStore，角色与槽位、存盘由调用方传入的 characterStore 提供（本文件不导入它）。 */
export function consistencyHostFrom(character: { rootState: { 当前激活存档?: { 角色ID?: string; 存档槽位?: string } | null }; saveCurrentGame(): Promise<unknown> }): ConsistencyHost {
  const state = useGameStateStore();
  return {
    scope: () => ({ characterId: character.rootState.当前激活存档?.角色ID || '', slotId: character.rootState.当前激活存档?.存档槽位 || '' }),
    snapshot: () => state.toSaveData(),
    relations: () => state.relationships as UnknownRecord | null,
    history: () => state.narrativeHistory as unknown as UnknownRecord[] | null,
    extensions: () => (state.systemExtensions ||= {}),
    isBusy: () => useUIStore().isAIProcessing,
    persist: () => character.saveCurrentGame(),
  };
}

/** 测试用：等落账队列跑完、读队列状态。 */
export function consistencyBackgroundState() {
  return { epoch, inFlight: inFlight?.job.turn.turnId ?? null, waiting: waiting.map(job => job.turn.turnId), pending: pending.map(item => item.turnId), settled: () => persistQueue };
}
