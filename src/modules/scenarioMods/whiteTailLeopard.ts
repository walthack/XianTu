/**
 * 白尾豹彩蛋（用户 2026-11-01 00:28 定，稿 narrative-drafts/2026-11-01-白尾豹彩蛋.md）。
 *
 * 南荒密林里小概率遇见白尾豹：它不攻击；玩家回复体力（＝角色.属性.气血，仓库没有独立体力字段），
 * 挂增益「山神庇佑」（内容包状态，场面战斗里按其 rollModifier 生效），持续若干回合后摘除。
 * 队里有南荒本地同伴时，按配置顺序由第一位在场者说一句。几率、恢复量、增益、回合数、地点、台词都在配置
 * （numbers-combat encounter.easterEggs.whiteTailLeopard、内容包 texts）。
 * 每个故事回合收尾调一次，按 worldTurn 幂等；只写 剧本模组.whiteTailLeopard、该增益的解除旗标、气血、角色.效果 与 sceneLedger.statusRecords。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { STATUS_CATALOG } from '../sceneModule/statuses';
import { toPlayerStatusEffect } from '../sceneModule/statusAdapters';
import { injuryStore, renderInjuryViews, sceneTime } from '../sceneModule/host/injuries';
import { activeScene } from '../sceneModule/host/ext';
import { CONTENT_PACKS } from '../contentPacks';
import { encounterLocKey, placeMatches } from './randomEncounter';
import { presentCompanionIds } from './locationLoot';
import { scenarioPlayerId } from './playerIdentity';
import { appendToLatestNarrative } from './fixedEndingNarratives';
import { seedHash, seededRoller, saveSeed } from './seededRng';

export interface LeopardConfig {
  enabled: boolean; hostile: false;
  locations: Array<{ key: string; subPlace?: string }>;
  chance: number; staminaRestoreRatio: number;
  buff: { statusId: string; name: string; durationTurns: number };
  textKey: string;
  companionLines: Array<{ characterId: string; textKey: string }>;
}
export interface LeopardState { lastTickTurn: number; buffUntilTurn?: number; sightings: Array<{ turn: number; locKey: string; restored: number; speaker?: string }> }

export const BUFF_SOURCE = 'easterEgg:whiteTailLeopard';
export const leopardConfig = (): LeopardConfig => (GAME_NUMBERS as any).encounter.easterEggs.whiteTailLeopard;
const runtimeOf = (save: SaveData): any => (save as any)?.世界?.状态?.剧本模组;

/** 南荒本地同伴开口：按配置顺序取第一位在场的；没有就不开口。 */
export function leopardCompanionLine(save: SaveData, cfg: LeopardConfig = leopardConfig()): { characterId: string; text: string } | undefined {
  const present = new Set(presentCompanionIds(save, runtimeOf(save)));
  const line = cfg.companionLines.find(l => present.has(l.characterId) && typeof CONTENT_PACKS.texts[l.textKey] === 'string');
  return line ? { characterId: line.characterId, text: CONTENT_PACKS.texts[line.textKey] } : undefined;
}

/** 增益状态在目录里登记的解除旗标（story 规则）：到期时写上，挂上时清掉。 */
const expiryFlags = (cfg: LeopardConfig): string[] =>
  (STATUS_CATALOG.find(d => d.id === cfg.buff.statusId)?.remove || []).flatMap(rule => rule.kind === 'story' ? [rule.flag] : []);
function removeBuff(save: SaveData, cfg: LeopardConfig): void {
  const runtime = runtimeOf(save);
  for (const flag of expiryFlags(cfg)) (runtime.flags ||= {})[flag] = true;
  const def = STATUS_CATALOG.find(d => d.id === cfg.buff.statusId);
  const effects = (save as any).角色?.效果;
  if (Array.isArray(effects)) (save as any).角色.效果 = effects.filter((e: any) => !(e?.来源 === BUFF_SOURCE && e?.状态名称 === (def?.label ?? cfg.buff.name)));
  const playerId = scenarioPlayerId(save);
  if (!playerId) return;
  const store = injuryStore(save);
  store.actors[playerId] = (store.actors[playerId] || []).filter((row: any) => row.sourceScene !== BUFF_SOURCE);
  renderInjuryViews(save);
}
function mountBuff(save: SaveData, cfg: LeopardConfig): void {
  const def = STATUS_CATALOG.find(d => d.id === cfg.buff.statusId);
  if (!def) throw new Error(`白尾豹增益状态未登记：${cfg.buff.statusId}`);
  const runtime = runtimeOf(save);
  for (const flag of expiryFlags(cfg)) if (runtime.flags) delete runtime.flags[flag];
  const now = (save as any).元数据?.时间 || {};
  const playerId = scenarioPlayerId(save);
  const effect = toPlayerStatusEffect({ party: 'player', ref: playerId || 'player', status: def.id, label: def.label, minutes: null, cause: def.cause, source: BUFF_SOURCE }, now, def);
  const role = (save as any).角色 ||= {};
  role.效果 = [...(Array.isArray(role.效果) ? role.效果.filter((e: any) => e?.来源 !== BUFF_SOURCE) : []), effect];
  if (!playerId) return;
  const store = injuryStore(save), t = sceneTime(save);
  store.actors[playerId] = (store.actors[playerId] || []).filter((row: any) => row.sourceScene !== BUFF_SOURCE);
  store.actors[playerId].push({ player: true, statusId: def.id, label: def.label, sourceScene: BUFF_SOURCE, cause: def.cause, source: def.source, appliedAt: t, expiresAt: null, effects: structuredClone(def.effects), remove: structuredClone(def.remove || []) } as any);
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

/** 每个故事回合收尾调一次。返回 changed＝存档有改动；text＝本回合接在正文后的遇见描写（没遇见为空）。 */
export function tickWhiteTailLeopard(save: SaveData, cfg: LeopardConfig = leopardConfig()): { changed: boolean; text: string } {
  const runtime = runtimeOf(save);
  if (!runtime || !cfg?.enabled) return { changed: false, text: '' };
  const turn = Number(runtime.worldTurn) || 0;
  const prior: LeopardState | undefined = runtime.whiteTailLeopard;
  if (prior?.lastTickTurn === turn) return { changed: false, text: '' };
  let changed = false;
  if (prior?.buffUntilTurn !== undefined && turn >= prior.buffUntilTurn) {
    removeBuff(save, cfg);
    delete prior.buffUntilTurn;
    changed = true;
  }
  const locKey = encounterLocKey(save);
  const here = cfg.locations.some(place => placeMatches(save, place, locKey));
  const pendingFight = runtime.encounter?.pending && runtime.encounter.pending.stage !== 'foreshadow';
  if (!here || runtime.gameOver || activeScene(save) || pendingFight || prior?.buffUntilTurn !== undefined) {
    if (prior) prior.lastTickTurn = turn;
    return { changed: changed || !!prior, text: '' };
  }
  const state: LeopardState = runtime.whiteTailLeopard ||= { lastTickTurn: turn, sightings: [] };
  state.lastTickTurn = turn;
  const roll = seededRoller(seedHash(`${saveSeed(save, 'whiteTailLeopard')}:${locKey}:${turn}`))();
  if (!(roll < cfg.chance)) return { changed: true, text: '' };
  const restored = restoreStamina(save, cfg.staminaRestoreRatio);
  mountBuff(save, cfg);
  state.buffUntilTurn = turn + cfg.buff.durationTurns;
  const line = leopardCompanionLine(save, cfg);
  state.sightings.push({ turn, locKey: locKey!, restored, ...(line ? { speaker: line.characterId } : {}) });
  const text = [CONTENT_PACKS.texts[cfg.textKey], line?.text].filter(Boolean).join('\n\n');
  appendToLatestNarrative(save, text);
  return { changed: true, text };
}
