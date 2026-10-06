// 识别：把玩家原话变成“行动提议”。模型只提议（受限 JSON），规则词表是兜底；
// 无论谁提议，都要过 validateProposal（白名单、证据是原话子串且为肯定句），数字 / 结果字段一律整份丢弃。
import { validateProposal, type ActionPlan, type Contract, type GoalDef, type SceneState } from '../index';
import { isPresent, partyOf } from '../queries';
import { goalsOf } from '../plan';
import { displayName } from './refs';

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
function groundedProposal(contract: Contract, state: SceneState, raw: Record<string, unknown>, text: string): Record<string, unknown> {
  const next = { ...raw };
  if(/砍|劈|刺|戳|斩|捅|击打/.test(text)&&!contract.parties.filter(p=>p.side==='player_side'&&!p.player).some(p=>(p.aliases||[]).some(a=>text.includes(a)))){const direct=goalsOf(contract).find(g=>available(g,state)&&g.type==='push'&&/攻击/.test(g.label||''));if(direct)next.goal=direct.id;}
  if(NON_COMBAT.test(text)){next.goal='';return next;}
  if(PASSIVE.test(text)&&goalsOf(contract).some(g=>['yield_guard','expose_self'].includes(g.id)&&explicitYield(contract,g,text))){next.goal=goalsOf(contract).find(g=>g.id==='yield_guard'||g.id==='expose_self')?.id||'';next.levers=[];next.claim={magnitude:1,scope:'single',targets:[]};return next;}
  const activeBlood = /(?:用|抹|涂|洒|泼|以|让)[^，。；]{0,8}(?:血|沾血)|(?:把|将)[^，。；]{0,5}血[^，。；]{0,8}(?:抹|滴|涂|洒|泼|沾)/.test(text) && !/不用血|不抹血|不让血/.test(text);
  const blood = (contract.elements || []).find(e => e.id === 'true_yang_blood');
  if (blood && (!activeBlood || !available(blood, state))) {
    next.levers = (Array.isArray(raw.levers) ? raw.levers : []).filter((l: any) => l.element !== blood.id);
    if (next.goal === 'destroy_tiger') next.goal = state.beat >= 4 ? 'survive_tiger' : 'survive_duel';
  }
  const explicit = goalsOf(contract).find(g => available(g,state) && (g.aliases || []).some(alias => text.includes(alias)) && g.id === 'expose_self');
  if (explicit && !/不扔刀|不会不动|不任/.test(text)) { next.goal = explicit.id; next.levers = []; next.claim = { magnitude:1,scope:'single',targets:[] }; }
  if (!goalsOf(contract).some(g => g.id === next.goal && available(g,state) && explicitYield(contract,g,text))) next.goal = '';
  return next;
}

function wordsOf(item: { label?: string; aliases?: string[] }): string[] {
  return [item.label, ...(item.aliases || [])].filter((w): w is string => !!w && compact(w).length >= 2);
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

function scoreGoal(goal: GoalDef, contract: Contract, text: string, hasAttack: boolean, hasProtect: boolean, hasObserve: boolean): number {
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
  if (hasProtect && type === 'support' && (goal.onSuccess?.tag || /防守|撑住|护|掩/.test(goal.label || ''))) score += 5;
  if (hasObserve && type === 'support' && /看|观察|察/.test(goal.label || '')) score += 5;
  if (hasAttack && type === 'push') score += /攻击|砍倒/.test(goal.label || '') ? 8 : 3;
  return score;
}

/** 规则兜底识别：词表 + 要素别称。输出与模型相同的提议格式，仍要过 validateProposal。 */
export function recognizeByRules(contract: Contract, state: SceneState, text: string, runtime?: unknown): Record<string, unknown> | null {
  const t = compact(text);
  if (!t || NON_COMBAT.test(text)) return null;
  if(PASSIVE.test(text)&&goalsOf(contract).some(g=>['yield_guard','expose_self'].includes(g.id)&&explicitYield(contract,g,text))){const goal=goalsOf(contract).find(g=>g.id==='yield_guard'||g.id==='expose_self');return goal?{goal:goal.id,claim:{magnitude:1,scope:'single',targets:[]},levers:[],cash:[]}:null;}
  const hasAttack = ATTACK.test(text) && !(/防守|格挡|招架|挡开/.test(text)&&!/砍|劈|斩|捅|刺|射/.test(text));
  const hasProtect = PROTECT.test(text);
  const hasObserve = OBSERVE.test(text);
  const goals = goalsOf(contract).filter(g => available(g,state) && explicitYield(contract,g,text));
  if (!goals.length) return null;
  const ranked = goals.map(goal => ({ goal, score: scoreGoal(goal, contract, text, hasAttack, hasProtect, hasObserve) })).sort((a, b) => b.score - a.score);
  if(ranked[0].score<=0)return null;
  const best = ranked[0].goal;
  const goal = best;
  const push = (goal.type || 'push') === 'push';

  const targets: string[] = [];
  for (const party of contract.parties) {
    if (!isPresent(state, party.id) || party.player) continue;
    const shown = party.group?.label || displayName(runtime, party.ref);
    const names = [...(party.aliases || []), ...(shown && shown !== party.ref ? [shown] : /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(party.ref) ? [] : [party.ref])];
    if (names.some(w => compact(w).length >= 2 && t.includes(compact(w)))) targets.push(party.id);
  }
  let scope: 'single' | 'group' | 'all' = targets.length > 1 ? 'group' : 'single';
  if (push && !targets.length) {
    const open = contract.parties.filter(p => p.side === 'opposed' && isPresent(state, p.id)
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
        const checked = validateProposal(contract, state, groundedProposal(contract,state,parsed,text), text);
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
    const checked = validateProposal(contract, state, groundedProposal(contract,state,fallback,text), text);
    dropped.push(...checked.dropped);
    if (checked.plan) return { plan: checked.plan, dropped, by: 'rules' };
  }
  void partyOf;
  return { plan: null, dropped, by: 'rules' };
}
