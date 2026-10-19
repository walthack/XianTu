// 同伴助战：player_side 的同伴缺省是“助战者”——不当敌人攻击目标、不算级差、不挂伤、不出防御行。
// 助战效果按角色库 id 读 numbers-assist.json（assist.byActor），按好感档取值（好感越高效果越强），分两类：
//   被动 buff（passive）：在场即生效，加在主角的行动或防御检定上；
//   每拍自动技能（skills）：按拍触发，只给态势（主角防御加值 / 敌方出手更好挡）；
//   只有合同 assist.finishers 点名的技能才可以直接推进敌方轨道（剧情指定的终结）。
// 同时生效的助战者最多 assist.maxActive 人。模块代码里不写任何数值与人名，全部来自配置与合同。

import { GAME_NUMBERS, registerNumbersValidator } from './numbers';
import { isPresent, partyOf, playerParty, trackInfo, trackStep } from './queries';
import { isDowned } from './statuses';
import type { ActiveTag, Contract, PartyDef, SceneContext, SceneState } from './types';

export type AssistScope = 'action' | 'defense';
export type AssistSkillEffect = 'defenseBonus' | 'enemyDcBonus' | 'trackShift';

export interface AssistPassiveDef { id: string; label: string; scope: AssistScope; values: number[] }
export interface AssistSkillDef {
  id: string; label: string; fromBeat: number; every: number;
  on: 'player' | 'opposed'; effect: AssistSkillEffect; values: number[]; durationBeats: number; text?: string;
}
export interface AssistActorDef { priority: number; passive: AssistPassiveDef[]; skills: AssistSkillDef[] }
export interface AssistConfig {
  defaultRole: 'assist' | 'combatant';
  maxActive: number;
  levelCount: number;
  simulationAffinity: number;
  affinityLevels: Record<string, number>;
  byActor: Record<string, AssistActorDef>;
}

export interface ActiveAssist { party: string; ref: string; affinity: number; tier: string; level: number; def: AssistActorDef }
export interface AssistEvent {
  party: string; ref: string; skill: string; label: string; level: number; effect: AssistSkillEffect; value: number;
  on: string; text?: string; applied: boolean; skipped?: string; target?: string; from?: number; to?: number;
}

export const assistConfig = (): AssistConfig => (GAME_NUMBERS as unknown as { assist: AssistConfig }).assist;

/** 参与方的形态：玩家本人与非 player_side 一律 combatant；player_side 同伴缺省取配置的 defaultRole。 */
export function partyRole(party: PartyDef | undefined): 'combatant' | 'assist' {
  if (!party || party.player || party.side !== 'player_side') return 'combatant';
  return party.role ?? assistConfig().defaultRole;
}

export const isAssistParty = (contract: Contract, id: string): boolean => partyRole(partyOf(contract, id)) === 'assist';

/** 好感值 → 好感档 id（numbers-progress affinity.tiers）→ 助战档（assist.affinityLevels；-1＝不助战）。 */
export function assistLevelOf(affinity: number): { tier: string; level: number } {
  const tiers = GAME_NUMBERS.affinity.tiers as unknown as Record<string, [number, number]>;
  const entries = Object.entries(tiers);
  const lo = Math.min(...entries.map(([, r]) => r[0])), hi = Math.max(...entries.map(([, r]) => r[1]));
  const v = Math.max(lo, Math.min(hi, Number.isFinite(affinity) ? affinity : 0));
  const tier = entries.find(([, r]) => v >= r[0] && v <= r[1])?.[0]
    ?? entries.reduce((best, cur) => (v >= cur[1][0] ? cur : best), entries[0])[0];
  const cfg = assistConfig();
  const level = Number.isInteger(cfg.affinityLevels[tier]) ? Math.min(cfg.levelCount - 1, cfg.affinityLevels[tier]) : -1;
  return { tier, level };
}

/** 当前生效的助战者（在场、未倒下、非受保护、本场未禁用、配置里有这个角色、好感档 ≥0），按档高、优先级排序后取前 maxActive 人。 */
export function activeAssists(contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog' | 'assistAffinity'>): ActiveAssist[] {
  const cfg = assistConfig();
  const disabled = new Set(contract.assist?.disabled || []);
  const out: ActiveAssist[] = [];
  contract.parties.forEach(party => {
    if (partyRole(party) !== 'assist' || party.protected || disabled.has(party.id)) return;
    if (!isPresent(state, party.id) || isDowned(state, contract, ctx, party.id)) return;
    const def = cfg.byActor[party.ref];
    if (!def) return;
    const affinity = ctx?.assistAffinity?.[party.ref] ?? cfg.simulationAffinity;
    const { tier, level } = assistLevelOf(affinity);
    if (level < 0) return;
    out.push({ party: party.id, ref: party.ref, affinity, tier, level, def });
  });
  const order = new Map(contract.parties.map((p, i) => [p.id, i]));
  out.sort((a, b) => b.level - a.level || a.def.priority - b.def.priority || (order.get(a.party)! - order.get(b.party)!));
  return out.slice(0, Math.max(0, cfg.maxActive));
}

/** 被动 buff：生效助战者在这个检定上的加值合计。 */
export function assistModifier(contract: Contract, state: SceneState, ctx: Pick<SceneContext, 'catalog' | 'assistAffinity'> | undefined, scope: AssistScope): number {
  return activeAssists(contract, state, ctx)
    .reduce((sum, a) => sum + a.def.passive.filter(p => p.scope === scope).reduce((s, p) => s + (p.values[a.level] ?? 0), 0), 0);
}

const skillDue = (skill: AssistSkillDef, beat: number): boolean =>
  beat >= skill.fromBeat && (beat - skill.fromBeat) % Math.max(1, skill.every) === 0;

/** 每拍自动技能：玩家行动之后、敌方出手之前结算。只挂态势；推进敌方轨道只在合同 assist.finishers 点名时才执行。 */
export function resolveAssistSkills(contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog' | 'assistAffinity'>): AssistEvent[] {
  const events: AssistEvent[] = [];
  const player = playerParty(contract)?.id || '';
  const finishers = new Set(contract.assist?.finishers || []);
  for (const a of activeAssists(contract, state, ctx)) {
    for (const skill of a.def.skills) {
      if (!skillDue(skill, state.beat)) continue;
      const value = skill.values[a.level] ?? 0;
      const base = { party: a.party, ref: a.ref, skill: skill.id, label: skill.label, level: a.level, effect: skill.effect, value, text: skill.text };
      if (skill.effect === 'trackShift') {
        if (!finishers.has(skill.id)) { events.push({ ...base, on: 'opposed', applied: false, skipped: '剧情未指定：自动技能不直接伤敌、不终结战斗' }); continue; }
        const target = contract.parties.find(p => p.side === 'opposed' && isPresent(state, p.id) && !isDowned(state, contract, ctx, p.id)
          && (p.tracks || []).some(t => { const info = trackInfo(contract, p.id, String(t.track ?? t.id ?? '')); return !!info && trackStep(state, p.id, info.id) < info.limit; }));
        const entry = target?.tracks?.find(t => { const info = trackInfo(contract, target.id, String(t.track ?? t.id ?? '')); return !!info && trackStep(state, target.id, info.id) < info.limit; });
        const info = target && entry ? trackInfo(contract, target.id, String(entry.track ?? entry.id ?? '')) : undefined;
        if (!target || !info) { events.push({ ...base, on: 'opposed', applied: false, skipped: '没有可推进的敌方轨道' }); continue; }
        const from = trackStep(state, target.id, info.id), to = Math.max(0, Math.min(info.limit, from + value));
        (state.tracks[target.id] ||= {})[info.id] = to;
        events.push({ ...base, on: target.id, applied: to !== from, target: target.id, from, to });
        continue;
      }
      if (!value) { events.push({ ...base, on: skill.on, applied: false, skipped: '本档没有效果' }); continue; }
      const on = skill.on === 'player' ? player : 'opposed';
      const tag: ActiveTag = {
        id: `assist:${skill.id}`, label: skill.label, on, sourceId: `assist:${a.party}`,
        expiresBeat: state.beat + Math.max(0, skill.durationBeats),
        effect: { [skill.effect]: value, ...(skill.text ? { text: skill.text } : {}) },
      };
      state.tags = state.tags.filter(t => !(t.id === tag.id && t.on === tag.on));
      state.tags.push(tag);
      events.push({ ...base, on, applied: true });
    }
  }
  return events;
}

/** 配置体检（热改合并后跑；不过整份退回）。 */
export function checkAssistNumbers(): string[] {
  const cfg = assistConfig();
  const errors: string[] = [];
  if (!cfg || typeof cfg !== 'object') return ['assist：缺少同伴助战配置'];
  if (!['assist', 'combatant'].includes(cfg.defaultRole)) errors.push('assist.defaultRole 只能是 assist / combatant');
  if (!Number.isInteger(cfg.maxActive) || cfg.maxActive < 0) errors.push('assist.maxActive 须为非负整数');
  if (!Number.isInteger(cfg.levelCount) || cfg.levelCount < 1) errors.push('assist.levelCount 须为正整数');
  const tiers = Object.keys(GAME_NUMBERS.affinity.tiers);
  for (const tier of tiers) if (!Number.isInteger(cfg.affinityLevels?.[tier])) errors.push(`assist.affinityLevels.${tier} 缺失或不是整数`);
  for (const [tier, level] of Object.entries(cfg.affinityLevels || {})) {
    if (!tiers.includes(tier)) errors.push(`assist.affinityLevels.${tier}：不是好感档`);
    else if (level < -1 || level >= cfg.levelCount) errors.push(`assist.affinityLevels.${tier} 须在 -1…${cfg.levelCount - 1}`);
  }
  const values = (where: string, list: unknown): void => {
    if (!Array.isArray(list) || list.length !== cfg.levelCount || list.some(v => typeof v !== 'number' || !Number.isFinite(v))) errors.push(`${where}.values 须为 ${cfg.levelCount} 个数字（按助战档）`);
  };
  const ids = new Set<string>();
  for (const [ref, def] of Object.entries(cfg.byActor || {})) {
    const where = `assist.byActor.${ref}`;
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(ref)) errors.push(`${where}：键必须是角色库 id`);
    if (typeof def.priority !== 'number') errors.push(`${where}.priority 须为数字`);
    for (const p of def.passive || []) {
      if (ids.has(p.id)) errors.push(`${where}：效果 id 重复 ${p.id}`); ids.add(p.id);
      if (!['action', 'defense'].includes(p.scope)) errors.push(`${where}.passive.${p.id}.scope 只能是 action / defense`);
      values(`${where}.passive.${p.id}`, p.values);
    }
    for (const s of def.skills || []) {
      if (ids.has(s.id)) errors.push(`${where}：效果 id 重复 ${s.id}`); ids.add(s.id);
      if (!['defenseBonus', 'enemyDcBonus', 'trackShift'].includes(s.effect)) errors.push(`${where}.skills.${s.id}.effect 只能是 defenseBonus / enemyDcBonus / trackShift`);
      if (!['player', 'opposed'].includes(s.on)) errors.push(`${where}.skills.${s.id}.on 只能是 player / opposed`);
      if (s.effect === 'defenseBonus' && s.on !== 'player') errors.push(`${where}.skills.${s.id}：defenseBonus 只能挂在主角身上`);
      if (s.effect !== 'defenseBonus' && s.on !== 'opposed') errors.push(`${where}.skills.${s.id}：${s.effect} 只能作用于敌方`);
      if (!Number.isInteger(s.every) || s.every < 1) errors.push(`${where}.skills.${s.id}.every 须为正整数`);
      if (!Number.isInteger(s.fromBeat) || s.fromBeat < 1) errors.push(`${where}.skills.${s.id}.fromBeat 须为正整数`);
      if (!Number.isInteger(s.durationBeats) || s.durationBeats < 0) errors.push(`${where}.skills.${s.id}.durationBeats 须为非负整数`);
      values(`${where}.skills.${s.id}`, s.values);
    }
  }
  return errors;
}
registerNumbersValidator(checkAssistNumbers);

/** 所有配置里的自动技能 id（合同 lint 核对 assist.finishers 用）。 */
export const assistSkillIds = (): string[] => Object.values(assistConfig().byActor || {}).flatMap(d => (d.skills || []).map(s => s.id));
