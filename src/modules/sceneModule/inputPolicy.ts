// 必经场面期间的输入策略（试玩默认拦截全部；产品放行闲聊、把行动改道给模块）与可观测性。
// 闲聊要有正面证据，行动不需要：宁可把闲聊当行动（多一次预览），也不能把行动当闲聊（绕过判定）。

import type { Contract, SceneState } from './types';

export type InputClass = 'chat' | 'action' | 'unclear';
export type InputDecision = 'passThrough' | 'redirectAction' | 'clarify' | 'intercept' | 'ignored';
export type InputPhase = 'preEncounter' | 'engaged' | 'decided' | 'closed';

export interface InputPolicy {
  mode: 'interceptAll' | 'passThroughChat';
  chat: { requireRuleEvidence: boolean; requireModelAgreement: boolean; guard: boolean; freezeScene: boolean };
  unknown: 'clarify';
  autoFallback: { enabled: boolean; suspects: number; guardRejects: number; notify: boolean };
  log: { enabled: boolean; cap: number };
}

export const DEFAULT_INPUT_POLICY: InputPolicy = {
  mode: 'passThroughChat',
  chat: { requireRuleEvidence: true, requireModelAgreement: true, guard: true, freezeScene: true },
  unknown: 'clarify',
  autoFallback: { enabled: true, suspects: 2, guardRejects: 3, notify: true },
  log: { enabled: true, cap: 500 },
};

/** 取各层里最严格者：任一层要求 interceptAll 就是 interceptAll；自动回退生效时也是。 */
export function resolveInputPolicy(layers: Array<Partial<InputPolicy> | undefined | null>, fallbackActive = false): { policy: InputPolicy; winningLayer: number | 'fallback' | 'default' } {
  const merged: InputPolicy = structuredClone(DEFAULT_INPUT_POLICY);
  let winning: number | 'fallback' | 'default' = 'default';
  layers.forEach((layer, index) => {
    if (!layer) return;
    if (layer.chat) Object.assign(merged.chat, layer.chat);
    if (layer.autoFallback) Object.assign(merged.autoFallback, layer.autoFallback);
    if (layer.log) Object.assign(merged.log, layer.log);
    if (layer.mode === 'interceptAll') { merged.mode = 'interceptAll'; winning = index; }
  });
  if (fallbackActive && merged.mode !== 'interceptAll') { merged.mode = 'interceptAll'; winning = 'fallback'; }
  return { policy: merged, winningLayer: winning };
}

// ---------- 规则判定 ----------

export interface RuleVerdict {
  class: InputClass;
  strength?: 'strong' | 'medium';
  /** 命中的规则 / 词，写进日志。 */
  evidence: string[];
  /** 问句 + 观察 / 搜寻词：按观察行动判定。 */
  observe?: boolean;
}

export interface ModelVerdict {
  used: boolean;
  class?: InputClass;
  evidence?: string;
  error?: string;
}

const ACTION_VERBS = /砍|劈|刺|戳|射|打|踢|撞|扑|冲|拔|扔|掷|推|拉|拽|抓|按|压|挡|躲|闪|避|架|格|跑|逃|追|绕|藏|跳|翻|爬|举|握|点燃|引燃|放火|杀|攻|击|擒|捉|救|护|掩护|拖|踹|斩|割|缠|绊|砸|投|挥|抽|捅|喊|吼|命令|指挥|上前|后退|冲锋|撤|抢/;
const OBSERVE_VERBS = /看|观察|查看|搜|找|打量|环顾|瞧|听|留意|察看|探查|摸索/;
/** 问“有没有 / 周围有什么”就是一个要判定的观察行动，而不是闲聊。 */
const OBSERVE_WORDS = /周围|四周|附近|有没有|有什么|有啥|有无|能用|可以用/;
const QUESTION = /[？?]|(?:吗|呢)\s*[。.!！]*\s*$/;
const FRAME = /如果|要是|假如|倘若|若是|要不要|是不是|怎样|会怎样|她说|他说|别人说|有人说|他们说|他问|她问|并不是|并没有|并非|并未|才怪|才不是|不是要/;
const META = /^(?:\/|（|\(|【|\[)|剧情|设定|存档|读档|菜单|系统|提示词|指令/;
const GREETING = /^(?:嗯+|哦+|啊+|哈+|呵+|好的?|行|谢谢|多谢|你好|再见|等等|等一下|稍等|没事|算了|知道了|明白|懂了|呃+|唉+|哎+)[。.!！~～…，, ]*$/;

export interface RuleDeps {
  /** 宿主可注入游戏里现成的“含糊句式”判断（hasUnclearIntentFrame）。 */
  isUnclearFrame?: (text: string) => boolean;
}

function contractWords(contract: Contract): string[] {
  const words: string[] = [];
  for (const element of contract.elements || []) {
    words.push(element.label, ...(element.aliases || []));
    for (const verb of element.verbs || []) words.push(...(verb.aliases || []));
  }
  for (const party of contract.parties) if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(party.ref)) words.push(party.ref);
  return words.filter(w => w && w.length >= 2);
}

export function classifyByRules(contract: Contract, text: string, deps: RuleDeps = {}): RuleVerdict {
  const raw = String(text || '').normalize('NFKC').trim();
  if (!raw) return { class: 'unclear', evidence: ['空输入'] };
  const evidence: string[] = [];
  const actionHit = raw.match(ACTION_VERBS)?.[0];
  const aliasHit = contractWords(contract).find(w => raw.includes(w));
  const observeHit = raw.match(OBSERVE_VERBS)?.[0];
  const question = QUESTION.test(raw);
  const frame = FRAME.test(raw) || !!deps.isUnclearFrame?.(raw) || META.test(raw);
  const hasAction = !!actionHit;

  const observeWord = raw.match(OBSERVE_WORDS)?.[0];
  if (!hasAction && (observeWord || (question && observeHit))) {
    return { class: 'action', evidence: [`观察 / 搜寻类提问“${observeWord || observeHit}”`], observe: true };
  }
  if (question && hasAction) return { class: 'unclear', evidence: [`问句里带行动词“${actionHit}”`] };
  if (hasAction) return { class: 'action', evidence: [`行动词“${actionHit}”`] };
  if ((question || frame) && !aliasHit) {
    evidence.push(question ? '问句' : '假设 / 转述 / 元指令句式');
    return { class: 'chat', strength: 'strong', evidence };
  }
  if (GREETING.test(raw) && !aliasHit) return { class: 'chat', strength: 'medium', evidence: ['寒暄词表'] };
  return { class: 'action', evidence: [aliasHit ? `提到场内要素“${aliasHit}”` : '没有闲聊的正面证据，按行动处理'] };
}

// ---------- 合并规则与模型的意见，得出处置 ----------

export interface Routed {
  decision: InputDecision;
  reason: string;
  disagreement: boolean;
}

export function phaseOf(state: SceneState | null | undefined): InputPhase {
  if (!state) return 'preEncounter';
  return state.status === 'engaged' ? 'engaged' : state.status === 'decided' ? 'decided' : 'closed';
}

export function route(policy: InputPolicy, phase: InputPhase, rule: RuleVerdict, model: ModelVerdict): Routed {
  if (phase === 'closed') return { decision: 'passThrough', reason: '场面已收束，回主流程', disagreement: false };
  if (rule.class === 'unclear' && !rule.evidence.includes('空输入')) return { decision: 'clarify', reason: '规则无法识别：请用陈述句说出打法', disagreement: false };
  if (rule.evidence.includes('空输入')) return { decision: 'ignored', reason: '空输入', disagreement: false };
  if (policy.mode === 'interceptAll') return { decision: 'intercept', reason: '策略为全部拦截', disagreement: false };

  const modelSaysChat = model.used && model.class === 'chat';
  const modelSaysAction = model.used && model.class === 'action';
  const modelUnsure = model.used && model.class === 'unclear';
  if (rule.class === 'action') {
    return { decision: 'redirectAction', reason: '行动不需要证据：规则判行动', disagreement: modelSaysChat };
  }
  // 规则判闲聊
  if (modelSaysAction) return { decision: 'redirectAction', reason: '规则判闲聊、模型判行动：宁错杀', disagreement: true };
  if (modelUnsure) return { decision: 'clarify', reason: '规则判闲聊、模型不确定', disagreement: true };
  if (modelSaysChat) return { decision: 'passThrough', reason: `规则（${rule.strength}）与模型都判闲聊`, disagreement: false };
  // 模型不可用 / 超时
  if (rule.strength === 'strong' && !policy.chat.requireModelAgreement) return { decision: 'passThrough', reason: '强证据闲聊，不要求模型确认', disagreement: false };
  if (rule.strength === 'strong') return { decision: 'passThrough', reason: '强证据闲聊，模型不可用（无模型确认）', disagreement: false };
  return { decision: 'clarify', reason: '中等证据闲聊但模型不可用：澄清', disagreement: false };
}

// ---------- 日志、计数与自动回退 ----------

export interface InputLogEntry {
  id: number;
  contractId: string;
  beat: number;
  phase: InputPhase;
  text: string;
  rule: RuleVerdict;
  model: ModelVerdict;
  decision: InputDecision;
  reason: string;
  policy: { mode: InputPolicy['mode']; fallbackActive: boolean; layer: number | 'fallback' | 'default' };
  judgement?: { rollIndex?: number; tier?: string } | null;
  guard?: { passed: boolean; rejected?: string[] } | null;
  firewall?: { before: string; after: string; changed: boolean } | null;
  disagreement: boolean;
  suspect: false | string[];
}

export interface InputCounters {
  total: number;
  passThrough: number;
  redirectAction: number;
  clarify: number;
  intercept: number;
  ignored: number;
  disagreements: number;
  guardRejects: number;
  firewallTriggers: number;
  suspects: number;
  fallbacks: number;
  judgements: number;
}

export interface InputLog {
  entries: InputLogEntry[];
  /** 超出 cap 被压成计数的条数。 */
  overflow: number;
  counters: InputCounters;
  fallbackActive: boolean;
}

export const newInputLog = (): InputLog => ({
  entries: [], overflow: 0, fallbackActive: false,
  counters: { total: 0, passThrough: 0, redirectAction: 0, clarify: 0, intercept: 0, ignored: 0, disagreements: 0, guardRejects: 0, firewallTriggers: 0, suspects: 0, fallbacks: 0, judgements: 0 },
});

/** 状态防火墙用的指纹：放行回合前后各取一次，不一致就说明闲聊回合动了场面。 */
export function sceneFingerprint(state: SceneState): string {
  const picked = {
    status: state.status, beat: state.beat, cursors: state.cursors, counters: state.counters, present: state.present, departed: state.departed,
    tracks: state.tracks, sceneTracks: state.sceneTracks, statuses: state.statuses, tags: state.tags, leverUses: state.leverUses,
    credits: state.credits, firedEvents: state.firedEvents, flags: state.flags,
  };
  const text = JSON.stringify(picked);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return `${text.length}:${hash.toString(16)}`;
}

export function appendInput(log: InputLog, entry: Omit<InputLogEntry, 'id'>, policy: InputPolicy): InputLog {
  const next: InputLog = structuredClone(log);
  const full: InputLogEntry = { ...entry, id: next.counters.total + 1 };
  const c = next.counters;
  c.total += 1;
  c[full.decision] += 1;
  if (full.disagreement) c.disagreements += 1;
  if (full.guard && !full.guard.passed) c.guardRejects += 1;
  if (full.firewall?.changed) c.firewallTriggers += 1;
  if (full.suspect) c.suspects += 1;
  if (full.judgement) c.judgements += 1;
  if (policy.log.enabled) {
    next.entries.push(full);
    while (next.entries.length > policy.log.cap) { next.entries.shift(); next.overflow += 1; }
  }
  if (policy.autoFallback.enabled && !next.fallbackActive && (c.suspects >= policy.autoFallback.suspects || c.guardRejects >= policy.autoFallback.guardRejects)) {
    next.fallbackActive = true;
    c.fallbacks += 1;
  }
  return next;
}

/** 下一场重新按配置开始：保留历史条目，清掉回退状态。 */
export function resetFallbackForNewScene(log: InputLog): InputLog {
  return { ...structuredClone(log), fallbackActive: false };
}

/** 计数不变量：输入总数 ＝ 放行 ＋ 改道 ＋ 澄清 ＋ 拦截 ＋ 忽略。 */
export function inputInvariants(log: InputLog): string[] {
  const c = log.counters;
  const problems: string[] = [];
  if (c.total !== c.passThrough + c.redirectAction + c.clarify + c.intercept + c.ignored) problems.push('输入总数 ≠ 放行 + 改道 + 澄清 + 拦截 + 忽略');
  if (log.entries.some(e => e.decision === 'passThrough' && e.firewall?.changed)) problems.push('有放行回合的防火墙已触发');
  return problems;
}

/** 场末“输入分类报告”：计数加上需要人工复核的条目（分歧、嫌疑、守卫丢弃、澄清）。 */
export function inputReport(log: InputLog): { counters: InputCounters; review: InputLogEntry[]; text: string } {
  const review = log.entries.filter(e => e.disagreement || e.suspect || (e.guard && !e.guard.passed) || e.decision === 'clarify');
  const c = log.counters;
  const lines = [
    `输入 ${c.total} 条：放行 ${c.passThrough}，改道 ${c.redirectAction}，澄清 ${c.clarify}，拦截 ${c.intercept}，忽略 ${c.ignored}`,
    `规则与模型分歧 ${c.disagreements}，守卫丢弃 ${c.guardRejects}，防火墙触发 ${c.firewallTriggers}，嫌疑 ${c.suspects}，自动回退 ${c.fallbacks}`,
    ...review.map(e => `#${e.id} 第${e.beat}拍 [${e.decision}] “${e.text.slice(0, 40)}”：${e.reason}${e.suspect ? `｜嫌疑：${e.suspect.join('、')}` : ''}`),
  ];
  return { counters: structuredClone(c), review, text: lines.join('\n') };
}

// ---------- 宿主该做什么 ----------

export type HostAction = 'passToMainFlow' | 'forceEncounter' | 'runActionPipeline' | 'askToFinishClosing' | 'clarify' | 'ignore';

/** 把“处置 + 所处阶段”翻译成宿主要执行的动作（遇敌前的行动＝强制遇敌，这句话本身不判定）。 */
export function hostAction(phase: InputPhase, decision: InputDecision): HostAction {
  if (phase === 'closed') return 'passToMainFlow';
  if (decision === 'ignored') return 'ignore';
  if (decision === 'clarify') return 'clarify';
  if (decision === 'passThrough') return 'passToMainFlow';
  if (phase === 'preEncounter') return 'forceEncounter';
  if (phase === 'decided') return 'askToFinishClosing';
  return 'runActionPipeline';
}
