import {levelTier} from './levels';
import { evalExpr } from './conditions';
import { activeAssists } from './assist';
// 给主持模型的材料：一份短而固定结构的“场面简报”，每拍由代码从状态重新生成。
// 模型不用记规则，也不用记场面：规则只有一小段常驻短句，场面事实全部以代码里的状态为准；
// 硬规则（拍数、胜负、红线、结算）由代码执行，简报只负责让模型“看得懂”。

import { isPresent, partyDisplay, trackInfo, trackLabel } from './queries';
import { resolveStatusDef } from './statuses';
import { resolveSettings } from './tiers';
import { woundTierLabel } from './woundRules';
import type { BeatResult } from './scene';
import type { Contract, DefensePart, SceneContext, SceneState } from './types';
import { CONTENT_PACKS } from '../contentPacks';

export interface Brief {
  text: string;
  chars: number;
  /** 超出字数预算时被丢掉的段。 */
  dropped: string[];
}

const RULES = '规则：你只负责描写，不裁决。档位、骰点、轨道变化、状态都已由代码结算，“已结算”里写的是事实，不得改写，不得新增结果；失败写成没做成，大失败要写出后果；不替玩家做没授权的行动；红线内容不得出现。';

interface Section { key: string; text: string; keep: boolean }

export function buildSceneBrief(contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog' | 'assistAffinity'>, warn: 'none' | 'pre' | 'danger' = 'none'): Brief {
  const settings = resolveSettings(contract.settings);
  const beats = contract.clock?.beats;
  const sections: Section[] = [];
  const add = (key: string, text: string, keep = false): void => { if (text) sections.push({ key, text, keep }); };

  add('head', `【场面】${contract.objective.phases?.find(phase => evalExpr(phase.when,contract,state))?.text || contract.objective.text}｜第${state.beat}拍${beats ? `/共${beats}拍` : '（不限拍数）'}｜${state.status === 'engaged' ? '进行中' : '已分出结果'}`, true);

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
  const tagLines = [...new Map(state.tags.map(tag=>[`${tag.label}:${tag.on}`,tag])).values()].map(tag => `${tag.label}@${tag.on === 'scene' || tag.on === 'opposed' || tag.on === 'player_side' ? tag.on : partyDisplay(contract, tag.on)}${tag.expiresBeat === null ? '' : `（余${Math.max(0, tag.expiresBeat - state.beat + 1)}拍）`}`);
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

  const assists = activeAssists(contract, state, ctx);
  if (assists.length) add('assist', `【助战】${assists.map(a => partyDisplay(contract, a.party)).join('、')}在旁助战：不会被敌人攻击、不会受伤；同伴受伤只按“已结算”里的剧情事件写`);
  if (state.digest.length) add('digest', `【已发生】${state.digestOlder ? `（更早 ${state.digestOlder} 拍已略）` : ''}${state.digest.join(' ／ ')}`);
  const player=contract.parties.find(p=>p.player),opponent=contract.parties.find(p=>p.side==='opposed');
  if(state.levels&&player&&opponent)add('level',`本场档位：${levelTier(state.levels[player.id],state.levels[opponent.id])}（代码按当前级数定）。碾压几招解决；占优主动；同级有来有回；吃力多守少攻；被碾压只能周旋或借外力。不得改变结算结果，不自报突破。`,true);
  add('rules', RULES, true);

  // 超出预算：先丢可有可无的段，再截断“已发生”；保留段永不丢。
  const dropped: string[] = [];
  const total = (): number => sections.reduce((sum, section) => sum + section.text.length + 1, 0) - 1;
  for (const key of ['assist', 'elements', 'beat', 'digest']) {
    if (total() <= settings.brief.maxChars) break;
    const index = sections.findIndex(section => section.key === key && !section.keep);
    if (index >= 0) { dropped.push(sections[index].key); sections.splice(index, 1); }
  }
  const text = sections.map(section => section.text).join('\n');
  return { text, chars: text.length, dropped };
}

// ---------- 代码渲染的结果卡与给描写模型的“已结算” ----------

/** 回执文案取内容包 texts（scene.*），{槽位} 由代码填。 */
const receiptText = (id: string, slots: Record<string, string> = {}): string =>
  String(CONTENT_PACKS.texts[id] ?? '').replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? '');
const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));
/** 防御加值写明来源（真机 da893388 #24：加值一直 -4/-5 却看不出从哪来）。 */
function defenseSources(parts: DefensePart[] | undefined): string {
  if (!parts?.length) return '';
  const list = parts.map(part => `${part.label ?? receiptText(`scene.defense.part.${part.key}`)}${signed(part.value)}`).join('、');
  return receiptText('scene.receipt.defense.sources', { parts: list });
}

export function renderResultLines(contract: Contract, result: BeatResult): string[] {
  const lines: string[] = [];
  const nat = result.natTriggered === 'nat20' ? '（自然 20）' : result.natTriggered === 'nat1' ? '（自然 1，降一档）' : '';
  lines.push(`${result.goalLabel}：${result.tierLabel}${nat}｜骰面 ${result.face}${result.mode === 'normal' ? '' : result.mode === 'advantage' ? '（优势）' : '（劣势）'} ＋加值 ${result.modifier} ＝ ${result.total}，难度 ${result.difficulty}`);
  for (const claim of result.claims) {
    if (claim.blocked) lines.push(`${partyDisplay(contract, claim.party)}：${claim.blocked}`);
    else if (claim.realized > 0) lines.push(`${partyDisplay(contract, claim.party)}：推进 ${claim.realized} 格${claim.clamped ? `（主张 ${claim.claimed} 格，被合同夹紧）` : ''} → ${claim.label}`);
    else if (claim.claimed > 0 && (result.tier === 'success' || result.tier === 'great_success')) lines.push(`${partyDisplay(contract, claim.party)}：未能推进（已到你能推到的上限）`);
  }
  // 真机 da893388 #23：「防守撑住：失败」后两次出手都挡住——没做成只让敌方出手更难防，挡没挡住各看防御骰。
  if (result.edge) lines.push(receiptText('scene.receipt.edge', { goal: result.goalLabel, edge: signed(resolveSettings(contract.settings).tiers.failure.edge) }));
  if (result.fumble) {
    const label = result.fumble.statuses.map(e => e.label).join('、');
    lines.push(`大失败的后果：${partyDisplay(contract, result.fumble.target)}${label ? `「${label}」` : ''}${result.fumble.text ? `（${result.fumble.text}）` : ''}`);
  }
  for (const a of result.assist || []) {
    if (a.applied) lines.push(`${partyDisplay(contract, a.party)}助战「${a.label}」${a.effect === 'trackShift' ? `：${partyDisplay(contract, a.target || '')}推进 ${(a.to ?? 0) - (a.from ?? 0)} 格` : ''}`);
  }
  for (const roll of result.enemy) {
    const names = roll.statuses.filter(e => e.op !== 'skipped').map(e => `${e.label}${e.op === 'upgrade' ? '（加重）' : ''}`).join('、');
    const tierMark = woundTierLabel(roll.woundTier);
    const sources = defenseSources(roll.defenseParts), edgeMark = roll.edgeBonus ? receiptText('scene.receipt.defense.edge', { edge: signed(roll.edgeBonus) }) : '';
    if (roll.threatOnly) { lines.push(`${roll.label}：拦截 ${roll.face}＋${roll.defenseBonus}${sources}＝${roll.total} 对 ${roll.dc}${edgeMark}，${roll.outcome === 'hit' ? `没拦住${roll.text ? `（${roll.text}）` : ''}` : '拦住了'}`); continue; }
    lines.push(`${roll.label}→${partyDisplay(contract, roll.target)}：防御 ${roll.face}＋${roll.defenseBonus}${sources}＝${roll.total} 对 ${roll.dc}${edgeMark}，${roll.outcome === 'hit' ? `没挡住${tierMark ? `（${tierMark}）` : ''}${names ? `，挂「${names}」` : ''}` : `挡住了${tierMark ? `（${tierMark}）` : ''}`}`);
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
    required: [...(contract.narration?.requiredFacts || []), ...(contract.continuity?.facts || [])],
    forbidden: forbiddenWords(contract, state.outcome),
    events: result.events.map(e => e.text).filter((t): t is string => !!t),
    flourish: result.tier === 'great_success' && settings.tiers.critBonus.includes('flourish'),
  };
}

/**
 * 禁写词：局中只有合同总则（narration.forbidden）和红线；结果还没分出来，不能套某一分支的事后状态。
 * 分出结果之后，再加上那个分支自己的事后状态禁写词（打输 / 超时不套打赢才有的原著锁）。
 */
function forbiddenWords(contract: Contract, outcome?: SceneState['outcome']): string[] {
  const words = [...(contract.narration?.forbidden || []), ...(contract.continuity?.checks || []).flatMap(check=>check.forbiddenNarration || [])];
  for (const line of contract.redLines || []) words.push(...(line.forbiddenNarration || []));
  if (outcome) for (const after of contract.closing?.[outcome.kind]?.afterState || []) words.push(...(after.forbiddenNarration || []));
  return [...new Set(words)];
}

/** 描写守卫：不得违反禁写词，不得写出没有被判定的结果（未被推到头的参与方，不能写出它的终态）。 */
export function checkNarration(contract: Contract, state: SceneState, result: BeatResult, text: string, names?: (partyId: string) => string[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const body = String(text || '');
  if (!body.trim()) problems.push('描写为空');
  for (const word of forbiddenWords(contract, state.outcome)) if (word && body.includes(word)) problems.push(`出现了禁写内容“${word}”`);
  for (const check of contract.narration?.outputChecks || []) {
    if (evalExpr(check.when,contract,state) && new RegExp(check.pattern).test(body)) problems.push(check.message);
  }
  for (const party of contract.parties) {
    for (const entry of party.tracks || []) {
      const id = String(entry.track ?? entry.id ?? '');
      const info = trackInfo(contract, party.id, id);
      const final = info?.ending?.finalState;
      if (!info || !final) continue;
      const reached = (state.tracks[party.id]?.[id] >= info.limit && info.limit > info.initial);
      if (!reached && assertsTerminal(contract, result, body, party.id, final, names)) problems.push(`写出了还没有被判定的结果“${final}”（${partyDisplay(contract, party.id)}）`);
    }
  }
  if ((result.tier === 'failure' || result.tier === 'critical_failure') && result.claims.some(c => c.realized > 0)) problems.push('结算结果与档位不一致');
  return { ok: problems.length === 0, problems };
}

/** Only direct, affirmative subject–predicate clauses are actionable. Ambiguous prose is not a verdict. */
function assertsTerminal(contract: Contract, result: BeatResult, body: string, partyId: string, final: string, names?: (partyId: string) => string[]): boolean {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const subjects = (id: string) => [...new Set([partyDisplay(contract,id), ...(names?.(id) || [])])].filter(Boolean);
  const own = subjects(partyId);
  const other = contract.parties.filter(p => p.id !== partyId).flatMap(p => subjects(p.id));
  const claimed = [...new Set(result.claims.map(c => c.party))];
  // A lone action target gives an otherwise unnamed pronoun a unique referent; never infer it in multi-target prose.
  const pronoun = claimed.length === 1 && claimed[0] === partyId;
  const prefixes = '(?:已然|已经|已|终于|随即|立刻|当即|应声|就|也|便|径直|直接|重重|彻底|真的|确实|一齐|同时|都|全都|纷纷)*';
  for (const clause of body.replace(/[“「『][^”」』]*[”」』]/g, '').split(/[，,。；;！!\n]/)) {
    if (/[？?]|(?:如果|若是|假如|要是|只要|一旦|否则|险些|差点|差一点|似乎|仿佛|可能|也许|是否|不知|没说|没人说|没有人说|未说|传闻|听说)/.test(clause)) continue;
    for (const subject of own) {
      if (new RegExp(`${escape(subject)}${prefixes}${escape(final)}(?:了|$|[\\s、：:])`).test(clause)) return true;
    }
    if (pronoun && !other.some(s => clause.includes(s)) && /^(?:他|她|它)/.test(clause.trim()) &&
      new RegExp(`^(?:他|她|它)${prefixes}${escape(final)}(?:了|$|[\\s、：:])`).test(clause.trim())) return true;
  }
  return false;
}
