/**
 * 随机遇敌引擎（用户 2026-10-28 13:48 第1、2、4、6条；10-19 三步 §3.0、§3.4；总策划技术决定）。
 *
 * 三步：① 危区叙事 → ② 代码按存档种子掷骰（检不检/中不中/遇谁/几个/几级）→ ③ 遇敌叙事 → 待开战。
 * 本模块只做到「遇敌叙事已演出 → 待开战」（pending.stage='battle'）；开战、输赢、战后搜尸在 sceneModule 宿主（encounter-2），
 * 收场时调 settleRandomEncounterClose 清掉待开战、回执补 outcome。
 * 模型只描写：本模块给出事实包（encounterPromptFacts），不透出几率、骰面、等级或档位。
 *
 * 硬约束：状态只写 世界.状态.剧本模组.encounter；不写 flags / completedEventIds / activeEventIds / sceneLedger /
 * 身份账 / 角色 / 背包，不建 activeScene，不推进剧本运行时——随机战不写剧情事件，检中不得直接开战。
 * 纯模块：不 import Vue 或 store。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { activeScene } from '../sceneModule/host/ext';
import { sceneContractForEvent } from '../sceneModule/contracts/registry';
import { logEventOnce } from '../diagnostics/log';
import { getCurrentStoryEventActions } from './runtime';
import { currentLocation } from './travel/travelLedger';
import { canonicalLocationId } from './travel/locationIds';
import { isStepSceneStage } from './travel/stepScene';
import { namedEntity, entityName } from './namedEntities';
import { enemyPresetConfig } from './actorLevels';
import { seedHash, seededRoller, saveSeed } from './seededRng';

export interface EncounterWindow { afterEventIds?: string[]; untilEventIds?: string[] }
export interface EncounterZone { key: string; tier: string; activeWhen?: EncounterWindow; source?: string }
export type EncounterVariant = 'normal' | 'elite';
export interface EncounterPoolEntry {
  enemyId: string;
  /** 精英变体是同敌的独立池条目，单独权重与等级（总策划定）；缺省 normal。 */
  variant?: EncounterVariant;
  level: number | null; levelOffset?: number | null;
  zones: string[]; tiers?: string[]; activeWhen?: EncounterWindow;
  weight: number; count: [number, number]; source?: string;
}
export interface EncounterRegion {
  modIdPattern: string;
  /** 无合同但落在危险窗口里的剧情拍：这些事件进行中按「当前事件进行中」跳过检定（总策划定，不为此补合同）。 */
  skipDuringEventIds?: string[];
  zones: EncounterZone[]; pool: EncounterPoolEntry[];
}
export interface EncounterConfig {
  enabled: boolean;
  tiers: Record<string, { chance: number; cooldownTurns: number }>;
  difficulty: Record<string, { chanceMul: number; levelShift: number }>;
  maxCount: number; receiptsKeep: number;
  prompt: { foreshadow: string; reveal: string };
  regions: Record<string, EncounterRegion>;
}

export type EncounterPending =
  | { stage: 'foreshadow'; locKey: string; tier: string; setTurn: number }
  | { stage: 'reveal' | 'battle'; id: string; locKey: string; tier: string; enemyId: string; variant: EncounterVariant;
    count: number; level: number | null; levelOffset?: number; setTurn: number };
/** 待开战（③ 已演出）。注：stage 是 'reveal'|'battle' 联合，不能用 Extract<…, {stage:'battle'}>（会得 never）。 */
export type BattlePending = Extract<EncounterPending, { id: string }> & { stage: 'battle' };
export interface EncounterReceipt {
  id: string; turn: number; locKey: string; tier: string; preset: string; chance: number; roll: number; hit: boolean;
  reason?: 'empty_pool'; enemyId?: string; variant?: EncounterVariant; count?: number; level?: number | null;
  /** void＝随机遇敌合同实例化失败，本次不开战（LCQ-SAV-034）。 */
  outcome?: 'preempted' | 'left' | 'win' | 'lose' | 'void';
}
export interface EncounterState {
  version: 1; seed: number; lastTickTurn: number;
  foreshadowed: Record<string, { tier: string; atTurn: number }>;
  lastCheckTurn: Record<string, number>;
  pending: EncounterPending | null;
  receipts: EncounterReceipt[];
}

export type EncounterGateReason = 'disabled' | 'no_runtime' | 'game_over' | 'active_scene' | 'no_region' | 'no_zone' | 'safe_tier' | 'story_contract' | 'story_event';

const numError = (message: string): Error => Object.assign(Error(`[LCQ-NUM-007] ${message}`), { code: 'LCQ-NUM-007' });
const sameKeys = (a: object, b: object) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());

/** 深层校验（registry 只管形状）：档位键＝freeAction.dangerTiers，难度键＝difficulty.presets，正则可编译。zones/pool 单条问题不在这里，见 validEntries。 */
export function validateEncounterConfig(cfg: EncounterConfig | undefined): string[] {
  if (!cfg || typeof cfg !== 'object') return ['encounter 段缺失'];
  const errors: string[] = [];
  const dangerTiers: string[] = (GAME_NUMBERS as any).freeAction.dangerTiers;
  if (!cfg.tiers || !sameKeys(cfg.tiers, Object.fromEntries(dangerTiers.map(t => [t, 1])))) errors.push(`encounter.tiers 的键须为 ${dangerTiers.join('/')}`);
  for (const [tier, t] of Object.entries(cfg.tiers || {})) {
    if (!(typeof t?.chance === 'number' && t.chance >= 0 && t.chance <= 1)) errors.push(`encounter.tiers.${tier}.chance 须在 0..1`);
    if (!(Number.isInteger(t?.cooldownTurns) && t.cooldownTurns >= 0)) errors.push(`encounter.tiers.${tier}.cooldownTurns 须为 ≥0 的整数`);
  }
  if (!cfg.difficulty || !sameKeys(cfg.difficulty, GAME_NUMBERS.difficulty.presets)) errors.push('encounter.difficulty 的键须与 difficulty.presets 一致');
  for (const [preset, d] of Object.entries(cfg.difficulty || {})) {
    if (!(typeof d?.chanceMul === 'number' && Number.isFinite(d.chanceMul) && d.chanceMul >= 0)) errors.push(`encounter.difficulty.${preset}.chanceMul 须 ≥0`);
    if (!Number.isInteger(d?.levelShift)) errors.push(`encounter.difficulty.${preset}.levelShift 须为整数`);
  }
  for (const [key, region] of Object.entries(cfg.regions || {})) {
    try { new RegExp(region?.modIdPattern); if (typeof region?.modIdPattern !== 'string') throw Error(); }
    catch { errors.push(`encounter.regions.${key}.modIdPattern 不是合法正则`); /* lcq-allow: 校验结果随 LCQ-NUM-007 抛出 */ }
    if (!Array.isArray(region?.zones) || !Array.isArray(region?.pool)) errors.push(`encounter.regions.${key} 须有 zones、pool 数组`);
    if (region?.skipDuringEventIds !== undefined && !(Array.isArray(region.skipDuringEventIds) && region.skipDuringEventIds.every(id => typeof id === 'string'))) errors.push(`encounter.regions.${key}.skipDuringEventIds 须为事件 id 数组`);
  }
  return errors;
}
registerNumbersValidator(() => validateEncounterConfig((GAME_NUMBERS as any).encounter));

let checkedDefaults = false;
/** 读 GAME_NUMBERS.encounter；首次读取时校验，不过就抛 LCQ-NUM-007（热改由 registerNumbersValidator 整份拒绝）。 */
export function encounterConfig(): EncounterConfig {
  const cfg = (GAME_NUMBERS as any).encounter as EncounterConfig;
  if (!checkedDefaults) {
    const problems = validateEncounterConfig(cfg);
    if (problems.length) throw numError(`随机遇敌配置无效：${problems.join('；')}`);
    checkedDefaults = true;
  }
  return cfg;
}
function resolveConfig(config?: EncounterConfig): EncounterConfig {
  if (!config) return encounterConfig();
  const problems = validateEncounterConfig(config);
  if (problems.length) throw numError(`随机遇敌配置无效：${problems.join('；')}`);
  return config;
}

const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;
const doneEvents = (runtime: any) => new Set<string>([...(runtime?.completedEventIds || []), ...(runtime?.travelLedger?.doneEventIds || [])]);
const windowOpen = (w: EncounterWindow | undefined, done: Set<string>) =>
  (w?.afterEventIds || []).every(id => done.has(id)) && !(w?.untilEventIds || []).some(id => done.has(id));

/** 难度档位名：存档记的 preset → 按两项设置唯一反查 → defaultPreset。
 *  旧档没存 preset：宽松与标准两项完全相同、分不出，按规则 3 得「标准」。 */
export function encounterPresetOf(save: SaveData | null | undefined): string {
  const d = (save as any)?.系统?.难度设置;
  const presets = GAME_NUMBERS.difficulty.presets as Record<string, { autoRaiseLevel: boolean; trainingCap: string }>;
  if (typeof d?.preset === 'string' && d.preset in presets) return d.preset;
  const hits = Object.entries(presets).filter(([, p]) => p.autoRaiseLevel === d?.autoRaiseLevel && p.trainingCap === d?.trainingCap);
  return hits.length === 1 ? hits[0][0] : GAME_NUMBERS.difficulty.defaultPreset;
}

/** 当前地点 key：规范地点 id，取不到再用行旅 zoneId。 */
export function encounterLocKey(save: SaveData | null | undefined): string | undefined {
  const loc = currentLocation(save);
  return loc.canonicalLocationId || loc.zoneId || undefined;
}

const VARIANTS: readonly EncounterVariant[] = ['normal', 'elite'];
function poolEntryProblem(e: EncounterPoolEntry): string | undefined {
  const enemy = typeof e?.enemyId === 'string' ? namedEntity('enemy', e.enemyId) : undefined;
  if (!enemy) return 'unknown_enemy';
  if (enemy.unnamed !== true) return 'named_enemy';
  const [min, max]: unknown[] = Array.isArray(e.count) ? e.count : [];
  if (!(Number.isInteger(min) && Number.isInteger(max) && (min as number) >= 0 && (min as number) <= (max as number))) return 'bad_count';
  if (!(typeof e.weight === 'number' && e.weight > 0)) return 'bad_weight';
  if (e.variant !== undefined && !VARIANTS.includes(e.variant)) return 'bad_variant';
  if (!Array.isArray(e.zones)) return 'bad_zones';
  const hasLevel = Number.isInteger(e.level), hasOffset = Number.isInteger(e.levelOffset);
  if (!hasLevel && !hasOffset && !enemyPresetConfig()?.types?.[String(enemy.id || e.enemyId)]) return 'no_level';
  return undefined;
}
/** 单条无效只跳过该条，按条目 key 每会话记一次 LCQ-SAV-033。 */
function validEntries<T>(region: string, kind: 'zone' | 'pool', list: T[], problemOf: (item: T) => string | undefined, keyOf: (item: T, i: number) => string): T[] {
  return (list || []).filter((item, i) => {
    const reason = problemOf(item);
    if (!reason) return true;
    const key = keyOf(item, i);
    logEventOnce(`LCQ-SAV-033:${region}:${kind}:${key}`, { code: 'LCQ-SAV-033', detail: { region, kind, key, reason } });
    return false;
  });
}
const validZones = (regionKey: string, region: EncounterRegion, cfg: EncounterConfig) => validEntries(regionKey, 'zone', region.zones,
  z => (typeof z?.key !== 'string' || !z.key ? 'no_key' : !(z.tier in cfg.tiers) ? 'bad_tier' : undefined), (z, i) => `${i}:${(z as any)?.key}`);
const validPool = (regionKey: string, region: EncounterRegion) => validEntries(regionKey, 'pool', region.pool,
  poolEntryProblem, (e, i) => `${i}:${(e as any)?.enemyId}:${(e as any)?.variant || 'normal'}`);

function regionOf(runtime: any, cfg: EncounterConfig): [string, EncounterRegion] | undefined {
  const modId = String(runtime?.modId || '');
  return Object.entries(cfg.regions || {}).find(([, r]) => new RegExp(r.modIdPattern).test(modId));
}
function zoneAt(regionKey: string, region: EncounterRegion, cfg: EncounterConfig, locKey: string | undefined, done: Set<string>): EncounterZone | undefined {
  if (!locKey) return undefined;
  return validZones(regionKey, region, cfg).find(z => canonicalLocationId(z.key) === locKey && windowOpen(z.activeWhen, done));
}
/** 当前事件动作。读取会顺手初始化 eventActionStates，这里在运行时副本上读，保证本模块只写 runtime.encounter。 */
function currentEventIds(save: SaveData): string[] {
  const world = (save as any).世界, sandbox = { ...save, 世界: { ...world, 状态: { ...world.状态, 剧本模组: structuredClone(world.状态.剧本模组) } } } as SaveData;
  return getCurrentStoryEventActions(sandbox).map(action => action.eventId);
}
/** 剧情必经战优先（总策划定）：当前事件挂必经或限时合同时不检随机遇敌。 */
function storyContractBlocks(eventIds: string[], runtime: any): boolean {
  return eventIds.some(eventId => {
    const contract = sceneContractForEvent(eventId, runtime.flags || {});
    return Boolean(contract && (contract.meta.hook.required || contract.clock));
  });
}
/** 配置的窗口排除表：这些事件正在进行（当前事件或已激活未完成）时跳过检定。 */
function storyEventBlocks(eventIds: string[], runtime: any, region: EncounterRegion): boolean {
  const skip = new Set(region.skipDuringEventIds || []);
  if (!skip.size) return false;
  const done = new Set<string>(runtime.completedEventIds || []);
  return (runtime.activeEventIds || []).some((id: string) => skip.has(id) && !done.has(id))
    || eventIds.some(id => skip.has(id));
}

/** 不检的原因；null＝可以检。 */
export function encounterGate(save: SaveData, cfg: EncounterConfig = encounterConfig()): EncounterGateReason | null {
  if (!cfg.enabled) return 'disabled';
  const runtime = runtimeOf(save);
  if (!runtime) return 'no_runtime';
  if (runtime.gameOver) return 'game_over';
  if (activeScene(save)) return 'active_scene';
  const region = regionOf(runtime, cfg);
  if (!region) return 'no_region';
  const zone = zoneAt(region[0], region[1], cfg, encounterLocKey(save), doneEvents(runtime));
  if (!zone) return 'no_zone';
  if (!(cfg.tiers[zone.tier]?.chance > 0)) return 'safe_tier';
  const eventIds = currentEventIds(save);
  if (storyContractBlocks(eventIds, runtime)) return 'story_contract';
  if (storyEventBlocks(eventIds, runtime, region[1])) return 'story_event';
  return null;
}

function newState(save: SaveData): EncounterState {
  return { version: 1, seed: saveSeed(save, 'encounter'), lastTickTurn: -1, foreshadowed: {}, lastCheckTurn: {}, pending: null, receipts: [] };
}
function markReceipt(state: EncounterState, id: string, outcome: EncounterReceipt['outcome']): void {
  const receipt = state.receipts.find(r => r.id === id);
  if (receipt) receipt.outcome = outcome;
}

/**
 * 每个故事回合结束后调用一次；按 worldTurn 幂等。narrated＝本回合正文确实由模型按事实包演出（固定文本回合为 false）。
 * 只写 runtime.encounter。
 */
export function tickRandomEncounter(save: SaveData, { narrated, config }: { narrated: boolean; config?: EncounterConfig }): { changed: boolean; reason?: string } {
  const cfg = resolveConfig(config);
  const runtime = runtimeOf(save);
  if (!runtime) return { changed: false, reason: 'no_runtime' };
  const turn = Number(runtime.worldTurn) || 0;
  const existing: EncounterState | undefined = runtime.encounter;
  if (existing && existing.lastTickTurn === turn) return { changed: false, reason: 'same_turn' };
  const gate = encounterGate(save, cfg);
  // 还没有遇敌状态且本回合不检：不新建（南荒以外、非危险地点的存档保持原样）。
  if (!existing && gate) return { changed: false, reason: gate };
  const state: EncounterState = existing || newState(save);
  runtime.encounter = state;
  state.lastTickTurn = turn;
  const locKey = encounterLocKey(save);

  // 先清理：人已离开 → 撤销待定（③ 及以后记 left）；离开再回来要重新走 ①。
  if (state.pending && state.pending.locKey !== locKey) {
    if (state.pending.stage !== 'foreshadow') markReceipt(state, state.pending.id, 'left');
    state.pending = null;
  }
  for (const key of Object.keys(state.foreshadowed)) if (key !== locKey) delete state.foreshadowed[key];

  if (gate) {
    // 必经战优先：当前事件有必经／限时合同（或在窗口排除表里）时撤掉随机遇敌。
    // 人还在原地但此处已不再危险（剧情完成关掉了窗口、配置关掉）：未开战的待定也撤掉，免得下一轮事实包还写敌人现身。
    const closed = gate === 'disabled' || gate === 'no_region' || gate === 'no_zone' || gate === 'safe_tier';
    if (state.pending && (gate === 'story_contract' || gate === 'story_event' || (closed && state.pending.stage !== 'battle'))) {
      if (state.pending.stage !== 'foreshadow') markReceipt(state, state.pending.id, 'preempted');
      state.pending = null;
    }
    return { changed: true, reason: gate };
  }
  const region = regionOf(runtime, cfg)!;
  const zone = zoneAt(region[0], region[1], cfg, locKey, doneEvents(runtime))!;
  const loc = locKey!;
  const pending = state.pending;
  if (pending?.stage === 'foreshadow') {
    // ① 危区叙事已演出。
    if (narrated && turn > pending.setTurn) { state.foreshadowed[loc] = { tier: pending.tier, atTurn: turn }; state.pending = null; }
    return { changed: true };
  }
  if (pending?.stage === 'reveal') {
    // ③ 遇敌叙事已演出 → 待开战（下一张单从这里接手）。
    if (narrated && turn > pending.setTurn) state.pending = { ...pending, stage: 'battle' };
    return { changed: true };
  }
  if (pending) return { changed: true };
  const seen = state.foreshadowed[loc];
  if (!seen) {
    state.pending = { stage: 'foreshadow', locKey: loc, tier: zone.tier, setTurn: turn };
    return { changed: true };
  }
  const tier = cfg.tiers[zone.tier];
  if (!(turn > seen.atTurn) || turn - (state.lastCheckTurn[loc] ?? -Infinity) < tier.cooldownTurns) return { changed: true };

  // ② 代码几率检。
  const roll = seededRoller(seedHash(`${state.seed}:encounter:${loc}:${turn}`));
  const preset = encounterPresetOf(save);
  const diff = cfg.difficulty[preset] || { chanceMul: 1, levelShift: 0 };
  const chance = Math.min(1, tier.chance * diff.chanceMul);
  const face = roll();
  const id = `enc:${loc}:${turn}`;
  const receipt: EncounterReceipt = { id, turn, locKey: loc, tier: zone.tier, preset, chance, roll: face, hit: face < chance };
  state.lastCheckTurn[loc] = turn;
  if (receipt.hit) {
    const done = doneEvents(runtime);
    const candidates = validPool(region[0], region[1]).filter(e => e.zones.some(z => canonicalLocationId(z) === loc)
      && (!e.tiers || e.tiers.includes(zone.tier)) && windowOpen(e.activeWhen, done));
    const total = candidates.reduce((sum, e) => sum + e.weight, 0);
    if (!candidates.length || !(total > 0)) {
      receipt.hit = false;
      receipt.reason = 'empty_pool';
    } else {
      let cursor = roll() * total;
      const entry = candidates.find(e => (cursor -= e.weight) < 0) || candidates[candidates.length - 1];
      const [min, max] = entry.count;
      const count = Math.min(cfg.maxCount, min + Math.floor(roll() * (max - min + 1)));
      const level = Number.isInteger(entry.level) ? Math.max(0, (entry.level as number) + diff.levelShift) : null;
      const variant = entry.variant || 'normal';
      Object.assign(receipt, { enemyId: entry.enemyId, variant, count, level });
      state.pending = { stage: 'reveal', id, locKey: loc, tier: zone.tier, enemyId: entry.enemyId, variant, count, level,
        ...(level === null && Number.isInteger(entry.levelOffset) ? { levelOffset: entry.levelOffset as number } : {}), setTurn: turn };
    }
  }
  state.receipts.push(receipt);
  if (state.receipts.length > cfg.receiptsKeep) state.receipts.splice(0, state.receipts.length - cfg.receiptsKeep);
  return { changed: true };
}

function placeName(save: SaveData, locKey: string): string {
  const name = namedEntity('location', locKey)?.name;
  if (typeof name === 'string' && name) return name;
  return String((save as any)?.角色?.位置?.描述 || '').split('·').at(-1) || '此地';
}

/** 事实包（纯读）：① 待演出时给 危区，③ 待演出时给 遇敌；不透出几率、骰面、等级或档位。 */
export function encounterPromptFacts(save: SaveData | null | undefined, config?: EncounterConfig): Record<string, unknown> {
  const pending: EncounterPending | null | undefined = runtimeOf(save)?.encounter?.pending;
  if (!pending || !save) return {};
  let cfg: EncounterConfig;
  try { cfg = config || encounterConfig(); } catch { return {}; /* lcq-allow: 配置坏时回合 tick 记 LCQ-SAV-032，事实包只留空 */ }
  if (pending.stage === 'foreshadow') {
    if (encounterLocKey(save) !== pending.locKey) return {};
    return { 危区: { 地点: placeName(save, pending.locKey), 要求: cfg.prompt.foreshadow } };
  }
  if (pending.stage === 'reveal') return { 遇敌: { 对手: entityName('enemy', pending.enemyId), 数量: pending.count, 要求: cfg.prompt.reveal } };
  return {};
}

/** 待开战的随机遇敌（③ 已演出）；供下一张单开战。 */
export function pendingRandomBattle(save: SaveData | null | undefined): BattlePending | null {
  const pending: EncounterPending | null | undefined = runtimeOf(save)?.encounter?.pending;
  return pending?.stage === 'battle' ? pending as BattlePending : null;
}

/**
 * 本回合事实包是否真的送到了叙事模型：固定文本（path local）不算；模块路径（path modular）只有逐拍演出关卡带「账本摘要」，
 * 其余关卡（如 05b）模块路径不带事实包，也不算；原链路（无模块回执）经 storyContext 的【遇敌事实】行，算。
 */
export function encounterNarratedBy(save: SaveData | null | undefined, path: string | undefined): boolean {
  if (path === 'local' || path === 'card') return false;
  if (path === 'modular') return isStepSceneStage(String(runtimeOf(save)?.modId || ''));
  return true;
}

/**
 * 随机战收场（或实例化失败作废）：清掉对应的待开战、回执补 outcome、该地点冷却从当前回合重算。只写 runtime.encounter。
 * 返回被清掉的待开战（取 locKey 给战后搜尸）；对不上 id 时返回 null。
 */
export function settleRandomEncounterClose(save: SaveData, { id, outcome }: { id: string; outcome: 'win' | 'lose' | 'void' }): BattlePending | null {
  const runtime = runtimeOf(save), state: EncounterState | undefined = runtime?.encounter;
  if (!state) return null;
  const pending = state.pending?.stage === 'battle' && state.pending.id === id ? state.pending as BattlePending : null;
  if (pending) state.pending = null;
  markReceipt(state, id, outcome);
  const locKey = pending?.locKey ?? state.receipts.find(r => r.id === id)?.locKey;
  if (locKey) state.lastCheckTurn[locKey] = Number(runtime.worldTurn) || 0;
  return pending;
}
