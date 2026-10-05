// 敌方出手：敌人按合同出手，被打的人用防御 / 豁免对抗；没挡住，就给那个人挂合同写的具体状态。
// 防御检定用独立的骰流，增减敌方出手不会挪动玩家检定的骰面。

import { evalExpr } from './conditions';
import { isPresent, partyOf, playerParty, trackInfo, trackStep } from './queries';
import { applyStatus, isDowned, statusMode, statusRollModifier, type StatusEvent } from './statuses';
import { peekDefenseDie } from './dice';
import { pickFace, resolveSettings, rollMode } from './tiers';
import type { Contract, EnemyActionDef, SceneContext, SceneState } from './types';

export interface EnemyRoll {
  actionId: string;
  label: string;
  party: string;
  partyRef: string;
  target: string;
  targetRef: string;
  dc: number;
  edgeBonus: number;
  defenseBonus: number;
  face: number;
  total: number;
  outcome: 'blocked' | 'hit';
  margin: number;
  crushed: boolean;
  statuses: StatusEvent[];
  text?: string;
}

export interface EnemyPhaseResult {
  rolls: EnemyRoll[];
  statusEvents: StatusEvent[];
  truncated: boolean;
}

function scheduled(action: EnemyActionDef, beat: number): boolean {
  const s = action.schedule;
  if (!s) return true;
  if (s.fromBeat !== undefined && beat < s.fromBeat) return false;
  if (s.untilBeat !== undefined && beat > s.untilBeat) return false;
  if (s.onBeats && !s.onBeats.includes(beat)) return false;
  if (s.every && s.every > 1 && (beat - (s.fromBeat ?? 1)) % s.every !== 0) return false;
  return true;
}

/** 一个参与方的任一轨道已被推到头，就不再出手。 */
function defeatedParty(contract: Contract, state: SceneState, party: string): boolean {
  const def = partyOf(contract, party);
  return !!def?.tracks?.some(entry => {
    const info = trackInfo(contract, party, String(entry.track ?? entry.id ?? ''));
    return !!info && info.limit > info.initial && trackStep(state, party, info.id) >= info.limit;
  });
}

export function dueEnemyActions(contract: Contract, state: SceneState, ctx: Pick<SceneContext, 'catalog'> | undefined): EnemyActionDef[] {
  return (contract.enemyActions || []).filter(action => {
    if (!isPresent(state, action.party)) return false;
    if (isDowned(state, contract, ctx, action.party) || defeatedParty(contract, state, action.party)) return false;
    if (!scheduled(action, state.beat)) return false;
    return !action.when || evalExpr(action.when, contract, state, ctx);
  });
}

function targetsOf(contract: Contract, state: SceneState, ctx: Pick<SceneContext, 'catalog'> | undefined, action: EnemyActionDef): string[] {
  const player = playerParty(contract)?.id;
  const eligible = (id: string): boolean => {
    const party = partyOf(contract, id);
    if (!party || !isPresent(state, id) || isDowned(state, contract, ctx, id)) return false;
    return !party.protected || !!action.allowProtected;
  };
  const t = action.target;
  if (t === 'player') return player && eligible(player) ? [player] : [];
  if ('party' in t) return eligible(t.party) ? [t.party] : [];
  if ('rotate' in t) {
    const pool = t.rotate.filter(eligible);
    return pool.length ? [pool[(state.beat - 1) % pool.length]] : [];
  }
  return contract.parties.filter(p => p.side === t.each && eligible(p.id)).map(p => p.id);
}

export function resolveEnemyPhase(contract: Contract, state: SceneState, ctx: SceneContext): EnemyPhaseResult {
  const settings = resolveSettings(contract.settings);
  const player = playerParty(contract)?.id;
  const result: EnemyPhaseResult = { rolls: [], statusEvents: [], truncated: false };
  for (const action of dueEnemyActions(contract, state, ctx)) {
    const attacker = partyOf(contract, action.party)!;
    for (const targetId of targetsOf(contract, state, ctx, action)) {
      if (result.rolls.length >= settings.enemyPhase.maxRollsPerBeat) { result.truncated = true; return result; }
      const target = partyOf(contract, targetId)!;
      const tagsFor = (id: string, side: string) => state.tags.filter(tag => tag.on === id || tag.on === side || tag.on === 'scene');
      const edgeBonus = state.tags
        .filter(tag => tag.effect.enemyDcBonus && (tag.on === 'opposed' || tag.on === attacker.id || tag.on === attacker.side))
        .reduce((sum, tag) => sum + (tag.effect.enemyDcBonus || 0), 0);
      const dc = action.attack.dc + edgeBonus;
      const defenseBonus =
        (targetId === player ? ctx.playerDefense ?? 0 : target.defense?.bonus ?? 0)
        + statusRollModifier(state, contract, ctx, targetId, 'defense')
        + tagsFor(targetId, target.side).reduce((sum, tag) => sum + (tag.effect.defenseBonus || 0), 0);
      const mode = statusMode(state, contract, ctx, targetId, 'defense');
      const rollKind = rollMode(mode.advantage, mode.disadvantage);
      const first = peekDefenseDie(state);
      state.cursors.defense += 1;
      let second = first;
      if (rollKind !== 'normal') {
        second = peekDefenseDie(state);
        state.cursors.defense += 1;
      }
      const face = pickFace([first, second], rollKind);
      state.counters.defenseRolls += 1;
      const total = face + defenseBonus;
      const hit = total < dc;
      const margin = dc - total;
      const crushed = hit && !!action.onCrush && margin >= action.onCrush.margin;
      const events: StatusEvent[] = [];
      if (hit) {
        const plan = crushed ? action.onCrush! : action.onHit;
        for (const ref of plan.statuses) events.push(...applyStatus(state, contract, ctx, targetId, ref, { cause: 'combat', sourceId: action.id }));
      }
      result.statusEvents.push(...events);
      result.rolls.push({
        actionId: action.id, label: action.label, party: attacker.id, partyRef: attacker.ref, target: targetId, targetRef: target.ref,
        dc, edgeBonus, defenseBonus, face, total, outcome: hit ? 'hit' : 'blocked', margin: hit ? margin : total - dc, crushed,
        statuses: events,
        text: hit ? (crushed ? action.onCrush!.text : action.onHit.text) : action.onBlocked?.text,
      });
    }
  }
  return result;
}

/** 最坏情形（只用于危险拍预警）：本拍所有会出手的敌人都打中、且每次都按更重的那组状态算，不掷骰、不动游标。 */
export function applyWorstCaseEnemyPhase(contract: Contract, state: SceneState, ctx: SceneContext): void {
  const settings = resolveSettings(contract.settings);
  let rolls = 0;
  for (const action of dueEnemyActions(contract, state, ctx)) {
    for (const targetId of targetsOf(contract, state, ctx, action)) {
      if (rolls >= settings.enemyPhase.maxRollsPerBeat) return;
      rolls += 1;
      const plan = action.onCrush || action.onHit;
      for (const ref of plan.statuses) applyStatus(state, contract, ctx, targetId, ref, { cause: 'combat', sourceId: action.id });
    }
  }
}
