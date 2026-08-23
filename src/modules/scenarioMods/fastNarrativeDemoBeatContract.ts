import type { JudgementOutcome } from '@/utils/judgementEngine';
import type { FastNarrativeDemoKnifeLocation } from './fastNarrativeDemoAdjudication';

export const FAST_NARRATIVE_DEMO_BEAT_CONTRACT_VERSION = 1 as const;

export const FAST_NARRATIVE_DEMO_OUTCOMES = [
  'critical_failure',
  'failure',
  'partial',
  'success',
  'great_success',
  'perfect',
] as const satisfies readonly JudgementOutcome[];

export const FAST_NARRATIVE_DEMO_KNIFE_LOCATIONS = [
  'scene_held',
  'on_ground',
  'at_corpse',
] as const satisfies readonly FastNarrativeDemoKnifeLocation[];

export const FAST_NARRATIVE_DEMO_OUTCOME_KNIFE_LOCATION = {
  perfect: 'scene_held',
  great_success: 'scene_held',
  success: 'scene_held',
  partial: 'on_ground',
  failure: 'at_corpse',
  critical_failure: 'at_corpse',
} as const satisfies Record<JudgementOutcome, FastNarrativeDemoKnifeLocation>;

export const FAST_NARRATIVE_STYLE_PACES = ['sudden', 'measured', 'delayed'] as const;
export const FAST_NARRATIVE_STYLE_SENSORY = ['grass', 'dust', 'wind', 'steel'] as const;
export const FAST_NARRATIVE_STYLE_CADENCES = ['short', 'clipped', 'rolling'] as const;
export const FAST_NARRATIVE_STYLE_FOCUSES = ['motion', 'grip', 'breath', 'ground'] as const;

export type FastNarrativeStylePace = (typeof FAST_NARRATIVE_STYLE_PACES)[number];
export type FastNarrativeStyleSensory = (typeof FAST_NARRATIVE_STYLE_SENSORY)[number];
export type FastNarrativeStyleCadence = (typeof FAST_NARRATIVE_STYLE_CADENCES)[number];
export type FastNarrativeStyleFocus = (typeof FAST_NARRATIVE_STYLE_FOCUSES)[number];

export type FastNarrativeDemoBeatKind = 'action' | 'sensory' | 'result';

export interface FastNarrativeDemoAuthorizedBeat {
  kind: FastNarrativeDemoBeatKind;
  id: string;
  text: string;
}

export interface FastNarrativeDemoBeatContractInput {
  outcome: JudgementOutcome;
  knifeLocation: FastNarrativeDemoKnifeLocation;
  hasSettledBodilyHarm: boolean;
}

export interface FastNarrativeDemoBeatContract {
  version: 1;
  outcome: JudgementOutcome;
  knifeLocation: FastNarrativeDemoKnifeLocation;
  hasSettledBodilyHarm: boolean;
  actionBeats: readonly FastNarrativeDemoAuthorizedBeat[];
  sensoryBeats: readonly FastNarrativeDemoAuthorizedBeat[];
  resultBeats: readonly FastNarrativeDemoAuthorizedBeat[];
}

export interface FastNarrativeStyleDirective {
  pace: FastNarrativeStylePace;
  sensory: FastNarrativeStyleSensory;
  cadence: FastNarrativeStyleCadence;
  focus: FastNarrativeStyleFocus;
}

export const DEFAULT_FAST_NARRATIVE_STYLE_DIRECTIVE: FastNarrativeStyleDirective = Object.freeze({
  pace: 'sudden',
  sensory: 'grass',
  cadence: 'short',
  focus: 'motion',
});

const OUTCOME_SET = new Set<string>(FAST_NARRATIVE_DEMO_OUTCOMES);
const LOCATION_SET = new Set<string>(FAST_NARRATIVE_DEMO_KNIFE_LOCATIONS);
const PACE_SET = new Set<string>(FAST_NARRATIVE_STYLE_PACES);
const SENSORY_SET = new Set<string>(FAST_NARRATIVE_STYLE_SENSORY);
const CADENCE_SET = new Set<string>(FAST_NARRATIVE_STYLE_CADENCES);
const FOCUS_SET = new Set<string>(FAST_NARRATIVE_STYLE_FOCUSES);
const STYLE_KEYS = ['pace', 'sensory', 'cadence', 'focus'] as const;
const STYLE_ALLOW = {
  pace: PACE_SET,
  sensory: SENSORY_SET,
  cadence: CADENCE_SET,
  focus: FOCUS_SET,
} as const;

const PACE_OPEN: Record<FastNarrativeStylePace, string> = {
  sudden: '猛地',
  measured: '压着节奏',
  delayed: '慢了半拍才',
};

const KNIFE_RESULT_TEXT: Record<FastNarrativeDemoKnifeLocation, string> = {
  scene_held: '那柄凡品短刀被你从指缝里抽出，稳稳握在手里',
  on_ground: '那柄凡品短刀刚从指缝里抽出，便脱手落进乱草与泥地间',
  at_corpse: '那柄凡品短刀仍留在最近的尸体手里，你没能将它取走',
};

const STEEL_SENSORY_TEXT: Record<FastNarrativeDemoKnifeLocation, string> = {
  scene_held: '刀柄凉意贴着手指',
  on_ground: '指腹刚触到刀柄凉意，便已落空',
  at_corpse: '指尖擦过刀柄凉意，却没能扣住',
};

const OUTCOME_RESULT_TEXT: Record<JudgementOutcome, string> = {
  perfect: '这一连串动作干净利落，几乎没有空隙',
  great_success: '眼前这一下比预想更利落',
  success: '眼前这一下已经做成',
  partial: '眼前这一下带着代价做成',
  failure: '眼前这一下没能照原意做成',
  critical_failure: '局面比刚才更加凶险',
};

const SETTLED_BODILY_COST_TEXT = '那份早已压在身上的负担仍未松开';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function freezeBeat(
  kind: FastNarrativeDemoBeatKind,
  id: string,
  text: string,
): FastNarrativeDemoAuthorizedBeat {
  return Object.freeze({ kind, id, text });
}

function freezeBeats(
  beats: FastNarrativeDemoAuthorizedBeat[],
): readonly FastNarrativeDemoAuthorizedBeat[] {
  return Object.freeze(beats.map(beat => freezeBeat(beat.kind, beat.id, beat.text)));
}

export function expectedFastNarrativeDemoKnifeLocation(
  outcome: unknown,
): FastNarrativeDemoKnifeLocation | null {
  if (typeof outcome !== 'string' || !OUTCOME_SET.has(outcome)) return null;
  return FAST_NARRATIVE_DEMO_OUTCOME_KNIFE_LOCATION[outcome as JudgementOutcome];
}

export function stringifyFastNarrativeStyleDirective(
  style: FastNarrativeStyleDirective,
): string | null {
  if (!isValidStyleDirective(style)) return null;
  return `pace=${style.pace};sensory=${style.sensory};cadence=${style.cadence};focus=${style.focus}`;
}

export function parseFastNarrativeStyleDirective(raw: unknown): FastNarrativeStyleDirective | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (/[{}\[\]"'`\n\r\t ]/.test(raw)) return null;
  if (/tavern_commands|mid_term_memory|action_options/i.test(raw)) return null;
  if (/lcq\.(?:event|item|location|character)\.|liuchao\.character\.|judge-\d|flags\.event\./i.test(raw)) return null;
  if (/(?:^|;|-)(?:void|完成)/.test(raw)) return null;
  const parts = raw.split(';');
  if (parts.length !== STYLE_KEYS.length) return null;
  const seen = new Set<string>();
  const parsed: Partial<FastNarrativeStyleDirective> = {};
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0 || part.lastIndexOf('=') !== separator) return null;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (!(STYLE_KEYS as readonly string[]).includes(key)) return null;
    if (seen.has(key) || !value) return null;
    const allowed = STYLE_ALLOW[key as typeof STYLE_KEYS[number]];
    if (!allowed.has(value)) return null;
    seen.add(key);
    (parsed as Record<string, string>)[key] = value;
  }
  if (seen.size !== STYLE_KEYS.length) return null;
  for (const key of STYLE_KEYS) {
    if (!seen.has(key)) return null;
  }
  return {
    pace: parsed.pace as FastNarrativeStylePace,
    sensory: parsed.sensory as FastNarrativeStyleSensory,
    cadence: parsed.cadence as FastNarrativeStyleCadence,
    focus: parsed.focus as FastNarrativeStyleFocus,
  };
}

function isValidStyleDirective(style: unknown): style is FastNarrativeStyleDirective {
  if (!isRecord(style)) return false;
  const keys = Object.keys(style);
  if (keys.length !== STYLE_KEYS.length) return false;
  return STYLE_KEYS.every(key => keys.includes(key) && STYLE_ALLOW[key].has(String(style[key])));
}

export function buildFastNarrativeDemoBeatContract(
  input: FastNarrativeDemoBeatContractInput,
): FastNarrativeDemoBeatContract | null {
  if (!isRecord(input)) return null;
  const outcome = input.outcome;
  const knifeLocation = input.knifeLocation;
  const hasSettledBodilyHarm = input.hasSettledBodilyHarm;
  if (typeof outcome !== 'string' || !OUTCOME_SET.has(outcome)) return null;
  if (typeof knifeLocation !== 'string' || !LOCATION_SET.has(knifeLocation)) return null;
  if (typeof hasSettledBodilyHarm !== 'boolean') return null;
  const expected = FAST_NARRATIVE_DEMO_OUTCOME_KNIFE_LOCATION[outcome];
  if (expected !== knifeLocation) return null;

  const actionBeats = freezeBeats([
    freezeBeat('action', 'action.lunge', '扑向最近的尸体'),
    freezeBeat('action', 'action.seize', '伸手去抢那柄凡品短刀'),
    freezeBeat('action', 'action.roll', '借着草丛翻滚躲开射来的箭'),
    freezeBeat('action', 'action.emphasis.motion', '身体折转，贴着地势滚开'),
    freezeBeat('action', 'action.emphasis.grip', '手指扣进僵硬指缝'),
    freezeBeat('action', 'action.emphasis.breath', '一口气压进胸口'),
    freezeBeat('action', 'action.emphasis.ground', '膝盖擦过泥土'),
  ]);

  const sensoryBeats = freezeBeats([
    freezeBeat('sensory', 'sensory.grass', '草叶刮过脸颊，草根顶着胸膛'),
    freezeBeat('sensory', 'sensory.dust', '尘土灌进鼻腔，碎叶擦过腕侧'),
    freezeBeat('sensory', 'sensory.wind', '风贴着草尖掠过，把碎叶卷起'),
    freezeBeat('sensory', 'sensory.steel', STEEL_SENSORY_TEXT[knifeLocation]),
    freezeBeat('sensory', 'sensory.fill.mud', '泥土的腥气贴上来'),
    freezeBeat('sensory', 'sensory.fill.leaf', '碎叶擦过腕侧'),
    freezeBeat('sensory', 'sensory.fill.air', '周围只剩风声和紧迫的动静'),
  ]);

  const resultBeats = freezeBeats([
    freezeBeat('result', `result.knife.${knifeLocation}`, KNIFE_RESULT_TEXT[knifeLocation]),
    freezeBeat('result', `result.outcome.${outcome}`, OUTCOME_RESULT_TEXT[outcome]),
    ...(hasSettledBodilyHarm
      ? [freezeBeat('result', 'result.settled-bodily-cost', SETTLED_BODILY_COST_TEXT)]
      : []),
  ]);

  return Object.freeze({
    version: FAST_NARRATIVE_DEMO_BEAT_CONTRACT_VERSION,
    outcome,
    knifeLocation,
    hasSettledBodilyHarm,
    actionBeats,
    sensoryBeats,
    resultBeats,
  });
}

function sameDeep(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameDeep(left[index], right[index])) return false;
    }
    return true;
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index]) return false;
    if (!sameDeep(left[key], right[key])) return false;
  }
  return true;
}

function beatText(
  beats: readonly FastNarrativeDemoAuthorizedBeat[],
  id: string,
): string {
  return beats.find(beat => beat.id === id)?.text || '';
}

function stripTerminalPunctuation(text: string): string {
  return text.replace(/[。！？!?]+$/g, '').trim();
}

function joinByCadence(clauses: string[], cadence: FastNarrativeStyleCadence): string {
  const cleaned = clauses.map(stripTerminalPunctuation).filter(Boolean);
  if (!cleaned.length) return '';
  if (cadence === 'rolling') return `${cleaned.join('，')}。`;
  if (cadence === 'clipped') return `${cleaned.join('。')}。`;
  const sentences: string[] = [];
  for (let index = 0; index < cleaned.length; index += 2) {
    sentences.push(`${cleaned.slice(index, index + 2).join('，')}。`);
  }
  return sentences.join('');
}

function withPace(clause: string, pace: FastNarrativeStylePace): string {
  const body = stripTerminalPunctuation(clause).replace(/^你/, '');
  return `你${PACE_OPEN[pace]}${body}`;
}

function orderedActionClauses(
  contract: FastNarrativeDemoBeatContract,
  focus: FastNarrativeStyleFocus,
): string[] {
  const lunge = beatText(contract.actionBeats, 'action.lunge');
  const seize = beatText(contract.actionBeats, 'action.seize');
  const roll = beatText(contract.actionBeats, 'action.roll');
  const emphasis = beatText(contract.actionBeats, `action.emphasis.${focus}`);
  if (focus === 'grip') return [seize, emphasis, lunge, roll];
  if (focus === 'breath' || focus === 'ground') return [emphasis, lunge, seize, roll];
  return [lunge, emphasis, seize, roll];
}

function coreCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function renderFastNarrativeDemoCore(
  contract: FastNarrativeDemoBeatContract,
  style: FastNarrativeStyleDirective = DEFAULT_FAST_NARRATIVE_STYLE_DIRECTIVE,
): string | null {
  if (!isRecord(contract) || !isValidStyleDirective(style)) return null;
  const canonical = buildFastNarrativeDemoBeatContract({
    outcome: contract.outcome,
    knifeLocation: contract.knifeLocation,
    hasSettledBodilyHarm: contract.hasSettledBodilyHarm,
  });
  if (!canonical || !sameDeep(contract, canonical)) return null;

  const actions = orderedActionClauses(canonical, style.focus);
  if (actions.some(clause => !clause)) return null;
  const sensory = beatText(canonical.sensoryBeats, `sensory.${style.sensory}`);
  const knife = beatText(canonical.resultBeats, `result.knife.${canonical.knifeLocation}`);
  const outcome = beatText(canonical.resultBeats, `result.outcome.${canonical.outcome}`);
  const harm = canonical.hasSettledBodilyHarm
    ? beatText(canonical.resultBeats, 'result.settled-bodily-cost')
    : '';
  if (!sensory || !knife || !outcome) return null;
  if (canonical.hasSettledBodilyHarm && harm !== SETTLED_BODILY_COST_TEXT) return null;

  const clauses = [
    withPace(actions[0], style.pace),
    ...actions.slice(1),
    sensory,
    knife,
    outcome,
    ...(harm ? [harm] : []),
    beatText(canonical.sensoryBeats, 'sensory.fill.air'),
  ];
  const fills = [
    beatText(canonical.sensoryBeats, 'sensory.fill.mud'),
    beatText(canonical.sensoryBeats, 'sensory.fill.leaf'),
  ].filter(Boolean);

  let core = joinByCadence(clauses, style.cadence).replace(/\s+/g, '');
  let fillIndex = 0;
  while (coreCharCount(core) < 100 && fillIndex < fills.length) {
    core = joinByCadence(
      [...clauses, ...fills.slice(0, fillIndex + 1)],
      style.cadence,
    ).replace(/\s+/g, '');
    fillIndex += 1;
  }
  const count = coreCharCount(core);
  if (count < 100 || count > 180) return null;
  if (!core.includes('你')) return null;
  return core;
}
