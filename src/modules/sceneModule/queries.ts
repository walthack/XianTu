// 合同 / 状态的只读查询。

import type { Contract, EndingDef, PartyDef, PartyTrack, SceneState, TrackDef } from './types';

export interface TrackInfo {
  party: string;
  id: string;
  kind: TrackDef['kind'];
  scale: string[];
  initial: number;
  ending?: EndingDef;
  /** 玩家的主张最多能把它推到哪一格（累计）。 */
  limit: number;
}

export const partyOf = (contract: Contract, id: string): PartyDef | undefined => contract.parties.find(p => p.id === id);

export function playerParty(contract: Contract): PartyDef | undefined {
  return contract.parties.find(p => p.player);
}

export const partyTrackId = (track: PartyTrack): string => String(track.track ?? track.id ?? '');

export function trackInfo(contract: Contract, partyId: string, trackId: string): TrackInfo | undefined {
  const party = partyOf(contract, partyId);
  const entry = party?.tracks?.find(t => partyTrackId(t) === trackId);
  if (!entry) return undefined;
  const global = contract.tracks?.find(t => t.id === trackId);
  const scale = entry.scale || global?.scale;
  if (!scale?.length) return undefined;
  const initial = Math.max(0, Math.min(scale.length - 1, Number(entry.initial ?? global?.initial ?? 0)));
  const ceiling = Math.max(0, Number(entry.ending?.ceiling ?? 0));
  return {
    party: partyId,
    id: trackId,
    kind: entry.kind || global?.kind || 'harm',
    scale,
    initial,
    ending: entry.ending,
    limit: Math.min(scale.length - 1, initial + ceiling),
  };
}

export function allTrackInfos(contract: Contract): TrackInfo[] {
  const out: TrackInfo[] = [];
  for (const party of contract.parties) {
    for (const entry of party.tracks || []) {
      const info = trackInfo(contract, party.id, partyTrackId(entry));
      if (info) out.push(info);
    }
  }
  return out;
}

export function trackStep(state: SceneState, party: string, track: string): number {
  return state.tracks[party]?.[track] ?? 0;
}

export function trackLabel(state: SceneState, contract: Contract, party: string, track: string): string {
  const info = trackInfo(contract, party, track);
  if (!info) return '';
  return info.scale[Math.min(info.scale.length - 1, trackStep(state, party, track))];
}

export const isPresent = (state: SceneState, party: string): boolean => state.present[party] !== false;

export function resolveTagTargets(contract: Contract, on: string): string[] {
  if (on === 'scene') return ['scene'];
  if (on === 'player_side' || on === 'opposed' || on === 'neutral' || on === 'third') {
    return contract.parties.filter(p => p.side === on).map(p => p.id);
  }
  return [on];
}

/** 给叙事 / 日志用的称呼：角色库 id 写成 {{ref:id}} 占位，由宿主换成显示名；字面标签原样输出。 */
export function partyDisplay(contract: Contract, id: string): string {
  const party=partyOf(contract,id);
  if(party?.group)return party.group.label;
  if(party?.instanceId)return `{{enemyInstance:${party.enemyId || party.ref}:${party.instanceId}}}`;
  const ref = party?.ref || id;
  return /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(ref) ? `{{ref:${ref}}}` : ref;
}
