// 给主持模型的材料：一份短而固定结构的“场面简报”，每拍由代码从状态重新生成。
// 模型不用记规则，也不用记场面：规则只有一小段常驻短句，场面事实全部以代码里的状态为准；
// 硬规则（拍数、胜负、红线、结算）由代码执行，简报只负责让模型“看得懂”。

import { isPresent, partyDisplay, trackInfo, trackLabel } from './queries';
import { resolveStatusDef } from './statuses';
import { resolveSettings } from './tiers';
import type { BeatResult } from './scene';
import type { Contract, SceneContext, SceneState } from './types';

export interface Brief {
  text: string;
  chars: number;
  /** 超出字数预算时被丢掉的段。 */
  dropped: string[];
}

const RULES = '规则：你只负责描写，不裁决。档位、骰点、轨道变化、状态都已由代码结算，“已结算”里写的是事实，不得改写，不得新增结果；失败写成没做成，大失败要写出后果；不替玩家做没授权的行动；红线内容不得出现。';

interface Section { key: string; text: string; keep: boolean }

export function buildSceneBrief(contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog'>, warn: 'none' | 'pre' | 'danger' = 'none'): Brief {
  const settings = resolveSettings(contract.settings);
  const beats = contract.clock?.beats;
  const sections: Section[] = [];
  const add = (key: string, text: string, keep = false): void => { if (text) sections.push({ key, text, keep }); };

  add('head', `【场面】${contract.objective.text}｜第${state.beat}拍${beats ? `/共${beats}拍` : '（不限拍数）'}｜${state.status === 'engaged' ? '进行中' : '已分出结果'}`, true);

  const tracks: string[] = [];
  for (const party of contract.parties) {
    if (!isPresent(state, party.id) || !party.tracks?.length || party.side === 'player_side') continue;
    for (const entry of party.tracks) {
      const id = String(entry.track ?? entry.id ?? '');
      if (trackInfo(contract, party.id, id)) tracks.push(`${partyDisplay(contract, party.id)}${trackLabel(state, contract, party.id, id)}`);
    }
  }
  for (const track of contract.tracks || []) {
    if (state.sceneTracks[track.id] !== undefined) tracks.push(`${track.id}:${track.scale[state.sceneTracks[track.id]]}`);
  }
  const left = state.departed.map(id => partyDisplay(contract, id));
  add('tracks', `【局势】${tracks.join('；') || '—'}${left.length ? `｜已离场：${left.join('、')}` : ''}`, true);

  const statusLines: string[] = [];
  for (const [party, list] of Object.entries(state.statuses)) {
    for (const item of list) {
      const def = resolveStatusDef(item.id, contract, ctx);
      const left = item.expiresBeat === null ? '' : `（余${Math.max(0, item.expiresBeat - state.beat + 1)}拍）`;
      statusLines.push(`${partyDisplay(contract, party)}：${def?.label || item.id}${left}`);
    }
  }
  const tagLines = state.tags.map(tag => `${tag.label}@${tag.on === 'scene' || tag.on === 'opposed' || tag.on === 'player_side' ? tag.on : partyDisplay(contract, tag.on)}${tag.expiresBeat === null ? '' : `（余${Math.max(0, tag.expiresBeat - state.beat + 1)}拍）`}`);
  add('status', `【状态】${statusLines.join('；') || '无'}${tagLines.length ? `｜态势：${tagLines.join('；')}` : ''}`, true);

  const usable = (contract.elements || [])
    .filter(e => (e.availability?.fromBeat ?? 1) <= state.beat && (e.availability?.untilBeat ?? Infinity) >= state.beat
      && (e.uses === undefined || e.uses === null || (state.leverUses[e.id] || 0) < e.uses))
    .map(e => `${e.label}[${(e.verbs || []).map(v => v.id).join('/')}]`);
  add('elements', usable.length ? `【可用】${usable.slice(0, 8).join('；')}` : '');

  const beatDef = contract.beats?.[state.beat - 1];
  add('beat', beatDef?.prompt ? `【本拍】${beatDef.title ? `${beatDef.title}：` : ''}${beatDef.prompt}` : '');

  const fixed = [
    ...(contract.redLines || []).map(line => `${partyDisplay(contract, line.party)}不得${line.forbiddenFinalState}`),
    ...(contract.narration?.forbidden || []).slice(0, 4).map(word => `不得写“${word}”`),
  ];
  add('redlines', fixed.length ? `【红线】${fixed.join('；')}` : '', true);
  if (warn !== 'none') add('warn', `【预警】${contract.defeat?.guards?.warnText || (warn === 'danger' ? '此拍若出差错将触发败局' : '败局临近')}`, true);

  if (state.digest.length) add('digest', `【已发生】${state.digestOlder ? `（更早 ${state.digestOlder} 拍已略）` : ''}${state.digest.join(' ／ ')}`);
  add('rules', RULES, true);

  // 超出预算：先丢可有可无的段，再截断“已发生”；保留段永不丢。
  const dropped: string[] = [];
  const total = (): number => sections.reduce((sum, section) => sum + section.text.length + 1, 0) - 1;
  for (const key of ['elements', 'beat', 'digest']) {
    if (total() <= settings.brief.maxChars) break;
    const index = sections.findIndex(section => section.key === key && !section.keep);
    if (index >= 0) { dropped.push(sections[index].key); sections.splice(index, 1); }
  }
  const text = sections.map(section => section.text).join('\n');
  return { text, chars: text.length, dropped };
}

// ---------- 代码渲染的结果卡与给描写模型的“已结算” ----------

export function renderResultLines(contract: Contract, result: BeatResult): string[] {
  const lines: string[] = [];
  const nat = result.natTriggered === 'nat20' ? '（自然 20）' : result.natTriggered === 'nat1' ? '（自然 1，降一档）' : '';
  lines.push(`${result.goalLabel}：${result.tierLabel}${nat}｜骰面 ${result.face}${result.mode === 'normal' ? '' : result.mode === 'advantage' ? '（优势）' : '（劣势）'} ＋加值 ${result.modifier} ＝ ${result.total}，难度 ${result.difficulty}`);
  for (const claim of result.claims) {
    if (claim.blocked) lines.push(`${partyDisplay(contract, claim.party)}：${claim.blocked}`);
    else if (claim.realized > 0) lines.push(`${partyDisplay(contract, claim.party)}：推进 ${claim.realized} 格${claim.clamped ? `（主张 ${claim.claimed} 格，被合同夹紧）` : ''} → ${claim.label}`);
    else if (result.tier === 'success' || result.tier === 'great_success') lines.push(`${partyDisplay(contract, claim.party)}：未能推进（已到你能推到的上限）`);
  }
  if (result.edge) lines.push('局面往敌人那边偏：本拍敌方出手更难防');
  if (result.fumble) {
    const label = result.fumble.statuses.map(e => e.label).join('、');
    lines.push(`大失败的后果：${partyDisplay(contract, result.fumble.target)}${label ? `「${label}」` : ''}${result.fumble.text ? `（${result.fumble.text}）` : ''}`);
  }
  for (const roll of result.enemy) {
    const names = roll.statuses.filter(e => e.op !== 'skipped').map(e => `${e.label}${e.op === 'upgrade' ? '（加重）' : ''}`).join('、');
    lines.push(`${roll.label}→${partyDisplay(contract, roll.target)}：防御 ${roll.face}＋${roll.defenseBonus}＝${roll.total} 对 ${roll.dc}，${roll.outcome === 'hit' ? `没挡住${names ? `，挂「${names}」` : ''}` : '挡住了'}`);
  }
  if (result.outcome) lines.push(`场面结果：${result.outcome.kind === 'win' ? '胜' : result.outcome.kind === 'lose' ? '败' : '超时收束'}`);
  return lines;
}

export interface NarrationInput {
  brief: Brief;
  settled: string;
  required: string[];
  forbidden: string[];
  events: string[];
  flourish: boolean;
}

export function buildNarrationInput(contract: Contract, state: SceneState, result: BeatResult, ctx?: Pick<SceneContext, 'catalog'>): NarrationInput {
  const settings = resolveSettings(contract.settings);
  return {
    brief: buildSceneBrief(contract, state, ctx, result.warn),
    settled: renderResultLines(contract, result).join('\n'),
    required: contract.narration?.requiredFacts || [],
    forbidden: forbiddenWords(contract),
    events: result.events.map(e => e.text).filter((t): t is string => !!t),
    flourish: result.tier === 'great_success' && settings.tiers.critBonus.includes('flourish'),
  };
}

function forbiddenWords(contract: Contract): string[] {
  const words = [...(contract.narration?.forbidden || [])];
  for (const line of contract.redLines || []) words.push(...(line.forbiddenNarration || []));
  for (const branch of Object.values(contract.closing || {})) for (const after of branch?.afterState || []) words.push(...(after.forbiddenNarration || []));
  return [...new Set(words)];
}

/** 描写守卫：不得违反禁写词，不得写出没有被判定的结果（未被推到头的参与方，不能写出它的终态）。 */
export function checkNarration(contract: Contract, state: SceneState, result: BeatResult, text: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const body = String(text || '');
  if (!body.trim()) problems.push('描写为空');
  for (const word of forbiddenWords(contract)) if (word && body.includes(word)) problems.push(`出现了禁写内容“${word}”`);
  for (const party of contract.parties) {
    for (const entry of party.tracks || []) {
      const id = String(entry.track ?? entry.id ?? '');
      const info = trackInfo(contract, party.id, id);
      const final = info?.ending?.finalState;
      if (!info || !final) continue;
      const reached = state.outcome?.kind === 'win' || (state.tracks[party.id]?.[id] >= info.limit && info.limit > info.initial);
      if (!reached && body.includes(final)) problems.push(`写出了还没有被判定的结果“${final}”（${partyDisplay(contract, party.id)}）`);
    }
  }
  if ((result.tier === 'failure' || result.tier === 'critical_failure') && result.claims.some(c => c.realized > 0)) problems.push('结算结果与档位不一致');
  return { ok: problems.length === 0, problems };
}
