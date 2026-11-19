// 新界面场面（战斗）卡的摆法：把老卡上那段简报（controller.sceneBrief）按参与方拆开——
// 对手进场景框（剪影＋名字牌＋状态小字），我方（玩家本人、助战）一行，其余（目标、中立方、局势、可用、本拍提示）照原句列出。
// 只重排、不新造：每一行字都和 sceneBrief 同一来源、同一拼法（tests/combatView.test.mjs 逐行对过）。
import type { ActiveScene } from '@/modules/sceneModule/host/ext';
import type { Contract } from '@/modules/sceneModule/types';
import { evalExpr } from '@/modules/sceneModule/conditions';
import { isDowned } from '@/modules/sceneModule/statuses';
import { partyName, renderRefs } from '@/modules/sceneModule/host/refs';
import { sceneProgressBars, type SceneProgressBar } from '@/modules/sceneModule/host/progressBars';

export interface CombatFigure {
  id: string;
  name: string;
  /** 名字牌下的小字：轨道档位＋状态，和简报里这一方的两行同字。 */
  status: string;
  /** 'opposed' 对手；'third' 第三方（同样画在场景框里，换个色）。 */
  side: 'opposed' | 'third';
  downed: boolean;
  /** 这一拍预览里被针对的（预览 targets 里的参与方）。 */
  targeted: boolean;
}

export interface CombatView {
  beat: number;
  /** 简报第一行：场面目标（分阶段的取当前阶段）。 */
  objective: string;
  foes: CombatFigure[];
  /** 我方：玩家本人在前，然后助战／同伴；每项＝简报里这一方的行（名字：档位、状态）。 */
  ours: string[];
  /** 其余简报行（中立方、不在场者的状态、局势、可用、本拍提示），原句照列。 */
  others: string[];
  /** 中立方进度条（老卡同一个 sceneProgressBars）。 */
  bars: SceneProgressBar[];
}

export function combatView(c: Contract, a: ActiveScene, runtime: unknown): CombatView {
  const s = a.state;
  const name = (id: string) => partyName(c, runtime, id);
  const statusText = (id: string) => (s.statuses[id] || []).map(status => c.statuses?.find(def => def.id === status.id)?.label || '状态变化').join('、');
  const trackText = (party: Contract['parties'][number]) => (party.tracks || []).map(track => {
    const id = track.track || track.id || '';
    return track.scale?.[s.tracks[party.id]?.[id] || 0] || '';
  }).filter(Boolean).join('、');
  const targeted = new Set((a.pending?.preview.targets || []).map(target => target.party));
  const foes: CombatFigure[] = [], ours: string[] = [], others: string[] = [];
  const shown = new Set<string>();
  // 在场判断与简报同式
  const visible = c.parties.filter(p => (s.present[p.id] !== false && !p.absent || s.present[p.id] === true) && !s.departed.includes(p.id));
  for (const party of visible) {
    const tracks = trackText(party), statuses = statusText(party.id);
    const line = `${name(party.id)}${tracks ? '：' + tracks : ''}${statuses ? '；' + statuses : ''}`;
    if (party.side === 'opposed' || party.side === 'third') {
      foes.push({ id: party.id, name: name(party.id), status: [tracks, statuses].filter(Boolean).join('；'), side: party.side, downed: isDowned(s, c, undefined, party.id), targeted: targeted.has(party.id) });
    } else if (party.side === 'player_side') {
      if (party.player) ours.unshift(line); else ours.push(line);
    } else {
      others.push(line);
    }
    shown.add(party.id);
  }
  for (const [party, statuses] of Object.entries(s.statuses)) {
    if (statuses.length && !shown.has(party)) others.push(name(party) + '：' + statusText(party));
  }
  const tags = s.tags.map(tag => tag.label);
  if (tags.length) others.push('当前局势：' + tags.join('、'));
  const elements = (c.elements || []).filter(element => (!element.availability?.fromBeat || s.beat >= element.availability.fromBeat) && (!element.availability?.untilBeat || s.beat <= element.availability.untilBeat));
  if (elements.length) others.push('可用：' + elements.map(element => element.label).join('、'));
  const beat = c.beats?.[Math.min(s.beat - 1, c.beats.length - 1)];
  if (beat?.prompt) others.push(renderRefs(beat.prompt, runtime));
  return {
    beat: s.beat,
    objective: c.objective.phases?.find(phase => evalExpr(phase.when, c, s))?.text || c.objective.text,
    foes, ours, others,
    bars: sceneProgressBars(c, s),
  };
}

/** 场景框里最多画几个对手剪影；多出的写「等 N 人」。 */
export const COMBAT_FOE_MAX = 4;

/** 档位名：照抄 SceneEncounterCard.vue 的 tierName（同一张表）。 */
export const UN_TIER_NAMES: Record<string, string> = { great_success: '大成功', success: '成功', failure: '失败', critical_failure: '大失败' };
