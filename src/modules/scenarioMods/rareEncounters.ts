/**
 * 稀有遇见（通用；REPORT-8091-f76e07a7 重构，白尾豹是其中一条）。
 *
 * 配置 encounter.rareEncounters.entries：每条 id（如 nanhuang.white_tail_leopard）带地区、地点、几率、效果（体力回复比例＋增益状态）、
 * 增益回合数、遇见描写与同伴台词键。别国照样加一条即可用，不改代码。遇见不攻击；体力＝角色.属性.气血。
 * 几率：条目 chance → 覆盖（函数参数优先，其次 URL／会话：xiantu.test.rare.<id> 定值、xiantu.test.rareChanceMul 总倍率），夹在 0..1。
 * 旧参数 leopardChance（函数参数、URL xiantu.test.leopardChance、南荒测试开关）只映射到 legacyLeopardEntryId 那一条，行为与原白尾豹一致。
 * 每个故事回合收尾调一次，按 worldTurn 幂等；一回合至多遇见一条。状态写 剧本模组[stateKey]（白尾豹沿用旧字段 whiteTailLeopard），
 * 其余条目写 剧本模组.rareEncounters[id]；另写增益解除旗标、气血、角色.效果 与 sceneLedger.statusRecords。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { STATUS_CATALOG } from '../sceneModule/statuses';
import { toPlayerStatusEffect } from '../sceneModule/statusAdapters';
import { injuryStore, renderInjuryViews, sceneTime } from '../sceneModule/host/injuries';
import { activeScene } from '../sceneModule/host/ext';
import { CONTENT_PACKS } from '../contentPacks';
import { encounterLocKey, placeMatches, nanhuangTestRates, nanhuangChanceOverride, applyChanceOverride, readTestNumberParam, type EncounterChanceOverride } from './randomEncounter';
import { presentCompanionIds } from './locationLoot';
import { scenarioPlayerId } from './playerIdentity';
import { appendToLatestNarrative } from './fixedEndingNarratives';
import { seedHash, seededRoller, saveSeed } from './seededRng';

export interface RareEncounterEntry {
  id: string; enabled: boolean; region: string; hostile: false;
  locations: Array<{ key: string; subPlace?: string }>;
  chance: number; durationTurns: number;
  effect: { staminaRestoreRatio: number; buff: { statusId: string; name: string } };
  textKey: string;
  companionLines: Array<{ characterId: string; textKey: string }>;
  /** 存档里的状态字段；缺省写 剧本模组.rareEncounters[id]（白尾豹沿用旧字段 whiteTailLeopard）。 */
  stateKey?: string;
  /** 角色.效果／状态账里的来源标记；缺省 rareEncounter:<id>（白尾豹沿用旧值）。 */
  buffSource?: string;
}
export interface RareEncountersConfig { note?: string; legacyLeopardEntryId: string; entries: RareEncounterEntry[] }
export interface RareEncounterState { lastTickTurn: number; buffUntilTurn?: number; sightings: Array<{ turn: number; locKey: string; restored: number; speaker?: string }> }

export const rareEncountersConfig = (): RareEncountersConfig => (GAME_NUMBERS as any).encounter.rareEncounters;
export const rareEncounterEntry = (id: string): RareEncounterEntry | undefined => rareEncountersConfig().entries.find(e => e.id === id);
export const rareBuffSource = (entry: RareEncounterEntry): string => entry.buffSource || `rareEncounter:${entry.id}`;
const runtimeOf = (save: SaveData): any => (save as any)?.世界?.状态?.剧本模组;

export function rareEncounterState(runtime: any, entry: RareEncounterEntry, create = false): RareEncounterState | undefined {
  if (!runtime) return undefined;
  if (entry.stateKey) return create ? (runtime[entry.stateKey] ||= { lastTickTurn: Number(runtime.worldTurn) || 0, sightings: [] }) : runtime[entry.stateKey];
  return create ? ((runtime.rareEncounters ||= {})[entry.id] ||= { lastTickTurn: Number(runtime.worldTurn) || 0, sightings: [] }) : runtime.rareEncounters?.[entry.id];
}

/** 测试覆盖（URL／会话）：参数名读 e2eSmoke.rareEncounters（每条 paramPrefix+id，倍率 chanceMulParam）；旧 leopardChance 照旧读。 */
export function rareChanceOverrideFromUrl(cfg: RareEncountersConfig = rareEncountersConfig()): EncounterChanceOverride | undefined {
  const names = (GAME_NUMBERS as any).e2eSmoke?.rareEncounters as { paramPrefix: string; chanceMulParam: string } | undefined;
  const out: EncounterChanceOverride = {};
  if (names) {
    for (const entry of cfg.entries) {
      const value = readTestNumberParam(names.paramPrefix + entry.id);
      if (value !== undefined) (out.rare ||= {})[entry.id] = value;
    }
    const mul = readTestNumberParam(names.chanceMulParam);
    if (mul !== undefined) out.rareChanceMul = mul;
  }
  const legacy = nanhuangChanceOverride()?.leopardChance;
  if (legacy !== undefined) out.leopardChance = legacy;
  return Object.keys(out).length ? out : undefined;
}

/** 本条的实际几率：基础值（白尾豹在南荒测试开关开时用其 leopardChance）→ 定值覆盖（rare[id]，白尾豹另认 leopardChance）→ 总倍率；夹 0..1。 */
export function rareEncounterChance(entry: RareEncounterEntry, override?: EncounterChanceOverride, cfg: RareEncountersConfig = rareEncountersConfig()): number {
  const legacy = entry.id === cfg.legacyLeopardEntryId;
  const ov = override ?? rareChanceOverrideFromUrl(cfg);
  const base = legacy ? (nanhuangTestRates()?.leopardChance ?? entry.chance) : entry.chance;
  const fixed = ov?.rare?.[entry.id] ?? (legacy ? ov?.leopardChance : undefined);
  return applyChanceOverride(base, fixed, ov?.rareChanceMul);
}

/** 本地同伴开口：按配置顺序取第一位在场的；没有就不开口。 */
export function rareCompanionLine(save: SaveData, entry: RareEncounterEntry): { characterId: string; text: string } | undefined {
  const present = new Set(presentCompanionIds(save, runtimeOf(save)));
  const line = entry.companionLines.find(l => present.has(l.characterId) && typeof CONTENT_PACKS.texts[l.textKey] === 'string');
  return line ? { characterId: line.characterId, text: CONTENT_PACKS.texts[line.textKey] } : undefined;
}

/** 增益状态在目录里登记的解除旗标（story 规则）：到期时写上，挂上时清掉。 */
const expiryFlags = (entry: RareEncounterEntry): string[] =>
  (STATUS_CATALOG.find(d => d.id === entry.effect.buff.statusId)?.remove || []).flatMap(rule => rule.kind === 'story' ? [rule.flag] : []);
function removeBuff(save: SaveData, entry: RareEncounterEntry): void {
  const runtime = runtimeOf(save), source = rareBuffSource(entry);
  for (const flag of expiryFlags(entry)) (runtime.flags ||= {})[flag] = true;
  const def = STATUS_CATALOG.find(d => d.id === entry.effect.buff.statusId);
  const effects = (save as any).角色?.效果;
  if (Array.isArray(effects)) (save as any).角色.效果 = effects.filter((e: any) => !(e?.来源 === source && e?.状态名称 === (def?.label ?? entry.effect.buff.name)));
  const playerId = scenarioPlayerId(save);
  if (!playerId) return;
  const store = injuryStore(save);
  store.actors[playerId] = (store.actors[playerId] || []).filter((row: any) => row.sourceScene !== source);
  renderInjuryViews(save);
}
function mountBuff(save: SaveData, entry: RareEncounterEntry): void {
  const def = STATUS_CATALOG.find(d => d.id === entry.effect.buff.statusId);
  if (!def) throw new Error(`稀有遇见增益状态未登记：${entry.effect.buff.statusId}`);
  const runtime = runtimeOf(save), source = rareBuffSource(entry);
  for (const flag of expiryFlags(entry)) if (runtime.flags) delete runtime.flags[flag];
  const now = (save as any).元数据?.时间 || {};
  const playerId = scenarioPlayerId(save);
  const effect = toPlayerStatusEffect({ party: 'player', ref: playerId || 'player', status: def.id, label: def.label, minutes: null, cause: def.cause, source }, now, def);
  const role = (save as any).角色 ||= {};
  role.效果 = [...(Array.isArray(role.效果) ? role.效果.filter((e: any) => e?.来源 !== source) : []), effect];
  if (!playerId) return;
  const store = injuryStore(save), t = sceneTime(save);
  store.actors[playerId] = (store.actors[playerId] || []).filter((row: any) => row.sourceScene !== source);
  store.actors[playerId].push({ player: true, statusId: def.id, label: def.label, sourceScene: source, cause: def.cause, source: def.source, appliedAt: t, expiresAt: null, effects: structuredClone(def.effects), remove: structuredClone(def.remove || []) } as any);
  renderInjuryViews(save);
}

/** 体力回复：按气血上限的比例，不超上限；返回实际回复量。 */
function restoreStamina(save: SaveData, ratio: number): number {
  const hp = (save as any).角色?.属性?.气血;
  const max = Number(hp?.上限), now = Number(hp?.当前);
  if (!Number.isFinite(max) || !Number.isFinite(now) || max <= 0) return 0;
  const next = Math.min(max, now + Math.round(max * ratio));
  hp.当前 = next;
  return next - now;
}

/** 到期摘除本条增益：worldTurn 到 buffUntilTurn 即摘（角色.效果、状态账、正在打的场面里的同名状态）。与几率无关，幂等。 */
export function expireRareEncounter(save: SaveData, entry: RareEncounterEntry): boolean {
  const runtime = runtimeOf(save), prior = rareEncounterState(runtime, entry);
  if (prior?.buffUntilTurn === undefined || (Number(runtime.worldTurn) || 0) < prior.buffUntilTurn) return false;
  removeBuff(save, entry);
  const scene = activeScene(save);
  if (scene) for (const party of Object.keys(scene.state.statuses)) scene.state.statuses[party] = scene.state.statuses[party].filter(s => s.id !== entry.effect.buff.statusId);
  delete prior.buffUntilTurn;
  return true;
}
/** 所有条目到期摘除（场面每拍／收场与故事回合收尾调用）。 */
export function expireRareEncounters(save: SaveData, cfg: RareEncountersConfig = rareEncountersConfig()): boolean {
  let changed = false;
  for (const entry of cfg.entries) changed = expireRareEncounter(save, entry) || changed;
  return changed;
}

/** 单条检定。返回 changed＝存档有改动；text＝遇见描写（没遇见为空）。 */
export function tickRareEncounter(save: SaveData, entry: RareEncounterEntry, override?: EncounterChanceOverride, cfg: RareEncountersConfig = rareEncountersConfig()): { changed: boolean; text: string } {
  const runtime = runtimeOf(save);
  if (!runtime || !entry?.enabled) return { changed: false, text: '' };
  const turn = Number(runtime.worldTurn) || 0;
  const prior = rareEncounterState(runtime, entry);
  if (prior?.lastTickTurn === turn) return { changed: false, text: '' };
  const changed = expireRareEncounter(save, entry);
  const locKey = encounterLocKey(save);
  const here = entry.locations.some(place => placeMatches(save, place, locKey));
  const pendingFight = runtime.encounter?.pending && runtime.encounter.pending.stage !== 'foreshadow';
  if (!here || runtime.gameOver || activeScene(save) || pendingFight || prior?.buffUntilTurn !== undefined) {
    if (prior) prior.lastTickTurn = turn;
    return { changed: changed || !!prior, text: '' };
  }
  const state = rareEncounterState(runtime, entry, true)!;
  state.lastTickTurn = turn;
  const roll = seededRoller(seedHash(`${saveSeed(save, entry.stateKey || entry.id)}:${locKey}:${turn}`))();
  if (!(roll < rareEncounterChance(entry, override, cfg))) return { changed: true, text: '' };
  const restored = restoreStamina(save, entry.effect.staminaRestoreRatio);
  mountBuff(save, entry);
  state.buffUntilTurn = turn + entry.durationTurns;
  const line = rareCompanionLine(save, entry);
  state.sightings.push({ turn, locKey: locKey!, restored, ...(line ? { speaker: line.characterId } : {}) });
  const text = [CONTENT_PACKS.texts[entry.textKey], line?.text].filter(Boolean).join('\n\n');
  appendToLatestNarrative(save, text);
  return { changed: true, text };
}

/** 每个故事回合收尾调一次：按配置顺序逐条检定，一回合至多遇见一条。 */
export function tickRareEncounters(save: SaveData, override?: EncounterChanceOverride, cfg: RareEncountersConfig = rareEncountersConfig()): { changed: boolean; text: string } {
  let changed = false;
  for (const entry of cfg.entries) {
    const result = tickRareEncounter(save, entry, override, cfg);
    changed = changed || result.changed;
    if (result.text) return { changed: true, text: result.text };
  }
  return { changed, text: '' };
}

registerNumbersValidator(() => {
  const cfg = (GAME_NUMBERS as any).encounter?.rareEncounters as RareEncountersConfig | undefined;
  if (!cfg) return [];
  const errors: string[] = [], ids = new Set<string>();
  for (const e of cfg.entries || []) {
    const at = `encounter.rareEncounters.entries[${e?.id}]`;
    if (typeof e?.id !== 'string' || !e.id || ids.has(e.id)) errors.push(`${at}: id 缺失或重复`);
    ids.add(e?.id);
    if (typeof e?.region !== 'string' || !e.region) errors.push(`${at}.region 须为非空字符串`);
    if (!Array.isArray(e?.locations) || !e.locations.length || e.locations.some(p => typeof p?.key !== 'string' || !p.key)) errors.push(`${at}.locations 须为非空地点表`);
    if (!(e?.chance >= 0 && e.chance <= 1)) errors.push(`${at}.chance 须在 0–1`);
    if (!(Number.isInteger(e?.durationTurns) && e.durationTurns >= 1)) errors.push(`${at}.durationTurns 须为正整数`);
    if (!(e?.effect?.staminaRestoreRatio >= 0 && e.effect.staminaRestoreRatio <= 1)) errors.push(`${at}.effect.staminaRestoreRatio 须在 0–1`);
    if (typeof e?.effect?.buff?.statusId !== 'string' || !e.effect.buff.statusId) errors.push(`${at}.effect.buff.statusId 缺失`);
    if (typeof e?.textKey !== 'string' || !e.textKey) errors.push(`${at}.textKey 缺失`);
    if (!Array.isArray(e?.companionLines)) errors.push(`${at}.companionLines 须为数组`);
  }
  if (cfg.legacyLeopardEntryId && !ids.has(cfg.legacyLeopardEntryId)) errors.push('encounter.rareEncounters.legacyLeopardEntryId 不在 entries 里');
  return errors;
});
