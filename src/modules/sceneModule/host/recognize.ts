// 识别：把玩家原话变成“行动提议”。模型只提议（受限 JSON），规则词表是兜底；
// 无论谁提议，都要过 validateProposal（白名单、证据是原话子串且为肯定句），数字 / 结果字段一律整份丢弃。
import { validateProposal, type ActionPlan, type Contract, type GoalDef, type SceneState } from '../index';
import { isPresent, partyOf } from '../queries';
import { goalsOf } from '../plan';
import { displayName } from './refs';
import { GAME_NUMBERS, registerNumbersValidator } from '../numbers';

export interface ModelRequest { system: string; user: string }

const ATTACK = /砍|劈|刺|戳|射|打|踢|撞|扑|冲|拔|扔|掷|推|拽|抓|按|压|杀|攻|击|斩|割|砸|捅|擒|制住|制服|擂|轰|逼|拦|截|追|围|夹击|牵制|缠住|拖住/;
const PROTECT = /防守|招架|格挡|护|挡|掩护|保护|守住|拦在|躲在.*前|替.*挡/;
const OBSERVE = /看清|观察|查看|搜|找|打量|环顾|瞧|留意|察看|探查|辨认/;
const HEAVY = /杀死|击杀|毙命|斩杀|秒杀|了结|终结|斩首|歼灭|全部杀|一刀毙/;
const MEDIUM = /重创|砍倒|击倒|逼退|制服|按住|制住|压制|摧毁|打倒|擒住|拿下|打趴/;
const ALL = /所有|全部|每一个|每个|他们|它们|一网打尽/;

const PASSIVE = /张开双手不躲|不躲.{0,5}不挡|不招架|不还手|放下刀|硬吃.{0,8}刀/;
const NON_COMBAT = /看.*天色|雾什么时候.*散|聊天气|哼.*曲|泡面/;
const compact = (value: string): string => String(value || '').normalize('NFKC').replace(/\s+/g, '');

function available(item: { availability?: { fromBeat?: number; untilBeat?: number } }, state: SceneState): boolean {
  return (!item.availability?.fromBeat || state.beat >= item.availability.fromBeat) && (!item.availability?.untilBeat || state.beat <= item.availability.untilBeat);
}
function explicitYield(contract: Contract, goal: GoalDef, text: string): boolean {
 if(!['yield_guard','expose_self'].includes(goal.id))return true;
 const activeText=text.replace(/不还手|不招架|不躲|不挡/g,'');
 if(/(?:举刀|拔剑|反击|招架|格挡|挡开|还手|防守)/.test(activeText))return false;
 const affirmative=text.split(/[，。；！？]/).filter(clause=>!/(?:绝不|不会|不再|拒绝|不要|不愿|不肯|不打算).{0,8}(?:投降|放下|停止|任|不挡|不还手)/.test(clause));
 return affirmative.some(clause=>!/不(?:投降|放下|停止|任)/.test(clause) && (PASSIVE.test(clause)||(goal.aliases||[]).some(a=>clause.includes(a))||/^(?:我)?(?:投降|停止抵抗|放弃抵抗)$/.test(clause)));
}
function groundedProposal(contract: Contract, state: SceneState, raw: Record<string, unknown>, text: string, runtime?: unknown): Record<string, unknown> {
  const next = { ...raw };
  const own = goalsOf(contract).find(g => g.id === next.goal);
  const ownPush = !!own && (own.type || 'push') === 'push' && (own.aliases || []).some(a => compact(a).length >= 2 && compact(text).includes(compact(a)));
  if(!ownPush&&/砍|劈|刺|戳|斩|捅|击打/.test(text)&&!contract.parties.filter(p=>p.side==='player_side'&&!p.player).some(p=>(p.aliases||[]).some(a=>text.includes(a)))){const direct=goalsOf(contract).find(g=>available(g,state)&&g.type==='push'&&/攻击/.test(g.label||''));if(direct)next.goal=direct.id;}
  if(NON_COMBAT.test(text)){next.goal='';return next;}
  if(PASSIVE.test(text)&&goalsOf(contract).some(g=>['yield_guard','expose_self'].includes(g.id)&&explicitYield(contract,g,text))){next.goal=goalsOf(contract).find(g=>g.id==='yield_guard'||g.id==='expose_self')?.id||'';next.levers=[];next.claim={magnitude:1,scope:'single',targets:[]};return next;}
  const blood = (contract.elements || []).find(e => e.id === 'true_yang_blood');
  const activeBlood = new RegExp(blood?.actionPattern || '$^').test(text) && !/不用血|不抹血|不让血/.test(text);
  if (blood && (!activeBlood || !available(blood, state))) {
    next.levers = (Array.isArray(raw.levers) ? raw.levers : []).filter((l: any) => l.element !== blood.id);
    if (next.goal === 'destroy_tiger') next.goal = state.beat >= 4 ? 'survive_tiger' : 'survive_duel';
  } else if (blood && !(Array.isArray(raw.levers) ? raw.levers : []).some((l: any) => l.element === blood.id)) {
    // 玩家主动用血、模型却漏了这个杠杆：按玩家原话补上（依据仍是原话里的词，照常过 validateProposal）。
    const verb = (blood.verbs || []).find(v => (v.goalTags || []).includes('destroy_tiger')) || (blood.verbs || [])[0];
    const evidence = [...wordsOf(blood), ...(verb?.aliases || [])].find(w => compact(text).includes(compact(w)));
    if (verb && evidence) next.levers = [...(Array.isArray(raw.levers) ? raw.levers : []), { element: blood.id, verb: verb.id, evidence }];
  }
  const explicit = goalsOf(contract).find(g => available(g,state) && (g.aliases || []).some(alias => text.includes(alias)) && g.id === 'expose_self');
  if (explicit && !/不扔刀|不会不动|不任/.test(text)) { next.goal = explicit.id; next.levers = []; next.claim = { magnitude:1,scope:'single',targets:[] }; }
  // 铺垫类目标只给标签、不推轨道：玩家原话命中某个推进目标的别称、或点名了有专属推进目标的参与方（村口、火楼……），又没提铺垫目标自己的词时，改归到那个推进目标，免得每拍都落在不改胜负的铺垫上。
  const chosen = goalsOf(contract).find(g => g.id === next.goal);
  if (chosen && (chosen.type || 'push') === 'support' && !wordsOf(chosen).some(w => compact(text).includes(compact(w)))) {
    const routed = pushGoalFor(contract, state, text, (Array.isArray(next.levers) ? next.levers : []).map((l: any) => String(l?.element)), runtime);
    if (routed) {
      const claim = (next.claim && typeof next.claim === 'object' ? next.claim : {}) as Record<string, unknown>;
      next.goal = routed.goal.id;
      next.claim = { ...claim, targets: routed.targets };
    }
  }
  if (!goalsOf(contract).some(g => g.id === next.goal && available(g,state) && explicitYield(contract,g,text))) next.goal = '';
  return next;
}

function wordsOf(item: { label?: string; aliases?: string[] }): string[] {
  return [item.label, ...(item.aliases || [])].filter((w): w is string => !!w && compact(w).length >= 2);
}

/** 玩家原话点名的在场参与方（别称 / 组名 / 引用名，至少 2 字）。 */
function namedParties(contract: Contract, state: SceneState, text: string, runtime?: unknown): string[] {
  const t = compact(text);
  const ids: string[] = [];
  for (const party of contract.parties) {
    if (!isPresent(state, party.id) || party.player) continue;
    const shown = party.group?.label || displayName(runtime, party.ref);
    const names = [...(party.aliases || []), ...(shown && shown !== party.ref ? [shown] : /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(party.ref) ? [] : [party.ref])];
    if (names.some(w => compact(w).length >= 2 && t.includes(compact(w)))) ids.push(party.id);
  }
  return ids;
}
/** 该推进目标在这个参与方身上是否还有空间（轨道没到终态）。 */
function trackOpen(contract: Contract, state: SceneState, goal: GoalDef, partyId: string): boolean {
  const party = partyOf(contract, partyId);
  return !!party && (party.tracks || []).some(tr => (!goal.track || (tr.track ?? tr.id) === goal.track)
    && (state.tracks[partyId]?.[String(tr.track ?? tr.id)] ?? 0) < (tr.ending?.finalState ? (tr.scale || []).indexOf(tr.ending.finalState) : (tr.scale || []).length - 1));
}

/** 该推进目标此刻能作用的参与方：合同指定的作用对象（没指定就是在场敌方）里轨道没到终态的；玩家点名的排在前面。轨道要求特定杠杆（如真阳之血）而提议里没有时不算。 */
function openTargets(contract: Contract, state: SceneState, goal: GoalDef, named: string[], levers: string[] = []): string[] {
  const needs = (id: string): boolean => (partyOf(contract, id)?.tracks || []).some(tr => (!goal.track || (tr.track ?? tr.id) === goal.track)
    && (tr.requiresLever || []).some(element => !levers.includes(element)));
  const live = contract.parties.filter(p => isPresent(state, p.id) && !p.player && !needs(p.id)
    && (goal.targetIds ? goal.targetIds.includes(p.id) : p.side === 'opposed') && trackOpen(contract, state, goal, p.id)).map(p => p.id);
  const picked = named.filter(id => live.includes(id));
  return picked.length ? picked : live.slice(0, 1);
}
/** 玩家原话指向的推进目标：先看别称（取命中最长的），再看点名的参与方；轨道都已到终态的不算。 */
function pushGoalFor(contract: Contract, state: SceneState, text: string, levers: string[], runtime?: unknown): { goal: GoalDef; targets: string[] } | undefined {
  const t = compact(text), named = namedParties(contract, state, text, runtime);
  const pushes = goalsOf(contract).filter(g => available(g, state) && (g.type || 'push') === 'push' && explicitYield(contract, g, text));
  const hit = (g: GoalDef): number => Math.max(0, ...(g.aliases || []).filter(a => compact(a).length >= 2 && t.includes(compact(a))).map(a => compact(a).length));
  const byAlias = pushes.filter(g => hit(g) && openTargets(contract, state, g, named, levers).length).sort((a, b) => hit(b) - hit(a))[0];
  const byParty = pushes.find(g => (g.targetIds || []).some(id => named.includes(id)) && openTargets(contract, state, g, named, levers).some(id => named.includes(id)));
  const goal = byAlias || byParty;
  return goal && { goal, targets: openTargets(contract, state, goal, named, levers) };
}

export function buildRecognitionPrompt(contract: Contract, state: SceneState, text: string, runtime: unknown): ModelRequest {
  const goals = goalsOf(contract).filter(g => available(g,state)).map(g => `- ${g.id}：${g.label || g.text || g.id}（${(g.type || 'push') === 'push' ? '作用于对方' : '铺垫 / 支援'}）`);
  const parties = contract.parties.filter(p => isPresent(state, p.id)).map(p => `- ${p.id}：${p.group?.label || displayName(runtime, p.ref)}（${p.side}；轨道=${JSON.stringify(state.tracks[p.id]||{})}）`);
  const elements = (contract.elements || []).filter(e => available(e,state)).map(e => {
    const verbs = (e.verbs || []).map(v => `${v.id}（${(v.aliases || []).join('、') || v.id}）`).join('；') || '无可用动词';
    return `- ${e.id}：${e.label}｜动词：${verbs}`;
  });
  const system = [
    '你是游戏的“行动识别器”：只把玩家的话翻译成结构化的行动提议，不判断成败，不写剧情，不解释。只输出一个 JSON 对象。',
    '格式：{"goal":"<目标 id>","claim":{"magnitude":1,"scope":"single","targets":["<参与方 id>"]},"levers":[{"element":"<要素 id>","verb":"<动词 id>","evidence":"<玩家原话里连续出现的原文片段>"}],"cash":[],"certainty":"high"}',
    '规则：',
    '1. goal、targets、element、verb 只能从清单里选，清单里没有的不要写；',
    '2. evidence 必须是玩家原话里连续出现的原文（至少 2 个字），且所在的句子是肯定句，不是问句、假设或否定；找不到依据就不要列这个杠杆；',
    '3. magnitude 只看玩家想达到多大的效果：1＝牵制 / 轻微，2＝逼退 / 制住 / 明显，3＝重创 / 击杀 / 终结，不要考虑能不能成；',
    '4. scope：只对一个目标用 single，对一组用 group，对对方所有人用 all；',
    '已终态的对手不再选择；逐个解决仍有行动能力的对手，直接挥刀攻击不能归成同伴接手。',
    '5. 不要输出难度、骰点、成败、伤害等任何数值或结果字段；',
    '6. 无关聊天、看天气或估计雾何时散不算战斗行动，goal空；不躲不挡、不还手、放下刀不属于攻击或防御，应选yield_guard/expose_self。',
  ].join('\n');
  const user = [
    '【本场目标】', ...goals,
    '【在场参与方】', ...parties,
    '【可用要素】', ...elements,
    `【玩家原话】${text}`,
  ].join('\n');
  return { system, user };
}

export function parseRecognition(raw: string): Record<string, unknown> | null {
  const body = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function scoreGoal(goal: GoalDef, contract: Contract, text: string, hasAttack: boolean, hasProtect: boolean, hasObserve: boolean, named: string[] = []): number {
  const t = compact(text);
  let score = (goal.aliases || []).some(alias => compact(alias).length >= 2 && t.includes(compact(alias))) ? 12 : 0;
  const label = compact(goal.label || goal.text || '');
  if (label.length >= 2 && t.includes(label)) score += 8;
  for (const element of contract.elements || []) {
    const mentioned = wordsOf(element).some(w => t.includes(compact(w)));
    for (const verb of element.verbs || []) {
      const verbHit = (verb.aliases || []).some(a => compact(a).length >= 2 && t.includes(compact(a)));
      if ((verb.goalTags || []).includes(goal.id)) score += verbHit ? 6 : mentioned ? 2 : 0;
    }
  }
  const type = goal.type || 'push';
  if (type === 'push' && (goal.targetIds || []).some(id => named.includes(id))) score += 10;
  if (hasProtect && type === 'support' && (goal.onSuccess?.tag || /防守|撑住|护|掩/.test(goal.label || ''))) score += 5;
  if (hasObserve && type === 'support' && /看|观察|察/.test(goal.label || '')) score += 5;
  if (hasAttack && type === 'push') score += /攻击|砍倒/.test(goal.label || '') ? 8 : 3;
  return score;
}

/** 规则兜底识别：词表 + 要素别称。输出与模型相同的提议格式，仍要过 validateProposal。 */
/** 合同里有没有能承接交涉的目标（modifierProfile / judgementKind 为 social）。 */
export function contractSupportsNegotiation(contract: Contract): boolean {
  return goalsOf(contract).some(goal => goal.modifierProfile === 'social' || goal.judgementKind === 'social');
}

/** 交涉说法的词表（GAME_NUMBERS.combat.negotiation）：patterns 是交涉说法（正则片段），ignoreNouns 是指人的称呼（“袭击者”里的“击”不算动手）。 */
export interface NegotiationConfig { patterns: string[]; ignoreNouns: string[]; notice: string }
export const negotiationConfig = (): NegotiationConfig => (GAME_NUMBERS.combat as unknown as { negotiation: NegotiationConfig }).negotiation;
/** 配置体检：交涉词表每条都得是能编译的正则片段，提示文字不能空。 */
export function validateNegotiationConfig(cfg: NegotiationConfig = negotiationConfig()): string[] {
  const errors: string[] = [];
  if (!Array.isArray(cfg?.patterns) || !cfg.patterns.length) return ['combat.negotiation.patterns 须为非空数组'];
  for (const pattern of cfg.patterns) { try { new RegExp(pattern); } catch { /* lcq-allow: 体检把坏正则记进错误列表，由 numbers 校验（LCQ-NUM-006）报出 */ errors.push(`combat.negotiation.patterns 里 ${pattern} 不是合法正则`); } }
  if (!Array.isArray(cfg.ignoreNouns) || cfg.ignoreNouns.some(noun => typeof noun !== 'string' || !noun.trim())) errors.push('combat.negotiation.ignoreNouns 须为非空字符串数组');
  if (typeof cfg.notice !== 'string' || !cfg.notice.trim()) errors.push('combat.negotiation.notice 不能为空');
  return errors;
}
registerNumbersValidator(() => validateNegotiationConfig());

/** 玩家这句是不是交涉：命中交涉说法，且去掉交涉说法、指人的称呼（配置里的、合同参与方的别称）之后不剩动手的字眼。 */
export function isNegotiationText(contract: Contract, text: string, cfg: NegotiationConfig = negotiationConfig()): boolean {
  const said = compact(text), pattern = cfg.patterns.join('|');
  if (!pattern || !new RegExp(pattern).test(said)) return false;
  const nouns = [...cfg.ignoreNouns, ...contract.parties.flatMap(p => p.aliases || [])].map(compact).filter(Boolean).sort((a, b) => b.length - a.length);
  const rest = nouns.reduce((left, noun) => left.split(noun).join('，'), said.replace(new RegExp(pattern, 'g'), '，'));
  return !ATTACK.test(rest);
}

/** 玩家这句是交涉，而本场合同没有交涉目标：宿主给一句明确提示，不改判成攻击或防守。在模型识别之前判，模型说什么都不影响。 */
export function negotiationUnsupported(contract: Contract, text: string): boolean {
  return !contractSupportsNegotiation(contract) && isNegotiationText(contract, text);
}

export function recognizeByRules(contract: Contract, state: SceneState, text: string, runtime?: unknown): Record<string, unknown> | null {
  const t = compact(text);
  if (!t || NON_COMBAT.test(text)) return null;
  if(PASSIVE.test(text)&&goalsOf(contract).some(g=>['yield_guard','expose_self'].includes(g.id)&&explicitYield(contract,g,text))){const goal=goalsOf(contract).find(g=>g.id==='yield_guard'||g.id==='expose_self');return goal?{goal:goal.id,claim:{magnitude:1,scope:'single',targets:[]},levers:[],cash:[]}:null;}
  const hasAttack = ATTACK.test(text) && !(/防守|格挡|招架|挡开/.test(text)&&!/砍|劈|斩|捅|刺|射/.test(text));
  const hasProtect = PROTECT.test(text);
  const hasObserve = OBSERVE.test(text);
  const named = namedParties(contract, state, text, runtime);
  const goals = goalsOf(contract).filter(g => available(g,state) && explicitYield(contract,g,text));
  if (!goals.length) return null;
  const ranked = goals.map(goal => ({ goal, score: scoreGoal(goal, contract, text, hasAttack, hasProtect, hasObserve, named) })).sort((a, b) => b.score - a.score);
  if(ranked[0].score<=0)return null;
  const best = ranked[0].goal;
  const goal = best;
  const push = (goal.type || 'push') === 'push';

  const owned = (id: string): boolean => !push || !goal.targetIds || goal.targetIds.includes(id);
  const targets: string[] = named.filter(owned);
  let scope: 'single' | 'group' | 'all' = targets.length > 1 ? 'group' : 'single';
  if (push && !targets.length) {
    const open = contract.parties.filter(p => p.side === 'opposed' && isPresent(state, p.id) && owned(p.id)
      && (p.tracks || []).some(tr => (!goal.track || (tr.track ?? tr.id) === goal.track) && (state.tracks[p.id]?.[String(tr.track??tr.id)]??0)<(tr.ending?.finalState ? (tr.scale||[]).indexOf(tr.ending.finalState) : (tr.scale||[]).length-1)));
    if (ALL.test(text)) { scope = 'all'; targets.push(...open.map(p => p.id).slice(0, 1)); }
    else if (open[0]) targets.push(open[0].id);
  } else if (ALL.test(text) && push) scope = 'all';

  const levers: Array<{ element: string; verb: string; evidence: string }> = [];
  for (const element of contract.elements || []) {
    if (!(element.verbs || []).length) continue;
    let evidence = '';
    let verbId = '';
    for (const verb of element.verbs || []) {
      const hit = (verb.aliases || []).find(a => compact(a).length >= 2 && t.includes(compact(a)));
      if (hit) { evidence = hit; verbId = verb.id; break; }
    }
    if (!evidence) {
      const hit = wordsOf(element).find(w => t.includes(compact(w)));
      if (hit) {
        evidence = hit;
        verbId = (element.verbs || []).find(v => (v.goalTags || []).includes(goal.id))?.id || element.verbs![0].id;
      }
    }
    if (evidence) levers.push({ element: element.id, verb: verbId, evidence });
  }
  const cash = state.tags.filter(tag => compact(tag.label).length >= 2 && t.includes(compact(tag.label))).map(tag => tag.id);
  const magnitude = HEAVY.test(text) ? 3 : MEDIUM.test(text) ? 2 : 1;
  return { goal: goal.id, claim: { magnitude, scope, targets }, levers, cash, certainty: 'low' };
}

export interface Recognized {
  plan: ActionPlan | null;
  dropped: string[];
  by: 'model' | 'rules';
}

/** 先让模型识别（可用时），不合格或失败就退回规则；两者都不行返回 plan:null（宿主会让玩家澄清）。 */
export async function recognizeAction(
  contract: Contract,
  state: SceneState,
  text: string,
  runtime: unknown,
  ask?: (request: ModelRequest) => Promise<string>,
): Promise<Recognized> {
  const dropped: string[] = [];
  if (ask) {
    try {
      const raw = await ask(buildRecognitionPrompt(contract, state, text, runtime));
      const parsed = parseRecognition(raw);
      if (parsed) {
        const checked = validateProposal(contract, state, groundedProposal(contract,state,parsed,text,runtime), text);
        dropped.push(...checked.dropped);
        if (checked.plan) {
          const rule = recognizeByRules(contract, state, text, runtime);
          checked.plan.magnitude = Math.max(checked.plan.magnitude, Number((rule?.claim as {magnitude?:number}|undefined)?.magnitude) || 1) as 1|2|3;
          return { plan: checked.plan, dropped, by: 'model' };
        }
      } else dropped.push('模型的识别结果不是合法 JSON，改用规则识别');
    } catch (error) {
      dropped.push(`模型识别不可用：${String((error as Error)?.message || error).slice(0, 80)}，改用规则识别`);
    }
  }
  const fallback = recognizeByRules(contract, state, text, runtime);
  if (fallback) {
    const checked = validateProposal(contract, state, groundedProposal(contract,state,fallback,text,runtime), text);
    dropped.push(...checked.dropped);
    if (checked.plan) return { plan: checked.plan, dropped, by: 'rules' };
  }
  void partyOf;
  return { plan: null, dropped, by: 'rules' };
}
