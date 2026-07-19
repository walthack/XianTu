import { findInternalNarrativeControlLeaks } from '@/utils/textSanitizer';

export interface NarrativePerformanceCheck {
  valid: boolean;
  issues: string[];
}

export interface NarrativePerformanceAttemptDecision extends NarrativePerformanceCheck {
  narrative: string;
  shouldRetry: boolean;
  retryInstruction: string;
}

const DECISION_SCENE = /情报|敌情|局势|侦察|探子|计划|打算|安排|怎么办|如何行动|下一步|计策|谋划|决策/;
const ACTIVE_PLAN = /我已|我让|我命|我先|我会|已经安排|你现在|你只需|先[^。！？]{0,24}再|退路|后手|备用|若[^。！？]{0,24}便/;
const HARD_ISSUE_PREFIX = '硬门禁：';
const QUANTITY_NUMBER = String.raw`(?:\d+(?:\.\d+)?|[零〇一二三四五六七八九十百千万两]+)`;
const DIRECT_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*(?:骑|兵|军士|甲士|部众|校尉|亲兵|家兵|营|队)`);
const PERSON_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*(?:名|人)`);
const DISTANCE_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*(?:步|尺|里|坊)`);
const RATIO_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*成`);
const MILITARY_CONTEXT = /军|兵|骑|甲|校尉|宫门|要道|伏|驻|调动|集结|列队|入宫|守卫|兵力/;
const DISTANCE_CONTEXT = /距离|相隔|开外|以内|界碑|宫门|布置|驻扎|列阵|行军|路线|要道/;
const RATIO_CONTEXT = /增|减|税|比例|折|抽|征|份额/;
const INVENTION_GUARDS: Array<{ marker: RegExp; violation: RegExp; issue: string }> = [
  {
    marker: /mustNotInvent=[^。\n]*具体兵力数字/,
    violation: /(?:\d+|[一二三四五六七八九十百千万两]+)\s*(?:名|人|骑|兵|军士|甲士|部众)/,
    issue: '渲染补造了 mustNotInvent 禁止的具体兵力数字',
  },
  {
    marker: /mustNotInvent=[^。\n]*(?:秘密盟约|具体秘密盟约)/,
    violation: /密约|秘密盟约|歃血为盟|暗中结盟/,
    issue: '渲染补造了 mustNotInvent 禁止的秘密盟约',
  },
  {
    marker: /mustNotInvent=[^。\n]*阮香凝的黑魔海身份/,
    violation: /阮香凝[^。！？]{0,32}(?:凝玉姬|黑魔海|玉姬|暗桩)|(?:凝玉姬|黑魔海玉姬)[^。！？]{0,16}阮香凝/,
    issue: '渲染泄露了 mustNotInvent 禁止的阮香凝机密身份',
  },
  {
    marker: /mustNotInvent=[^。\n]*(?:郭解或董卓后续生死|郭解[^。\n]*后续生死|董卓[^。\n]*后续生死)/,
    violation: /(?:郭解|董卓)[^。！？]{0,48}(?:伤及心脉|撑不了|死志|托孤|临终|身亡|死亡|被杀|永久失能)/,
    issue: '渲染提前演出了 mustNotInvent 禁止的郭解或董卓后续生死节点',
  },
];

function namedSpeech(text: string, name: string): string {
  const start = text.indexOf(name);
  return start >= 0 ? text.slice(start) : text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseForbiddenTerms(scenarioPrompt: string): string[] {
  const match = scenarioPrompt.match(/renderGuard\.forbiddenTerms=([^；。\n]*)/);
  if (!match?.[1]) return [];
  return match[1].split('|').map(item => item.trim()).filter(Boolean);
}

function concreteQuantityViolation(narrative: string, scenarioPrompt: string): boolean {
  if (!/renderGuard\.rejectConcreteQuantities=true/.test(scenarioPrompt)) return false;
  return narrative.split(/[。！？\n]/).some(sentence =>
    DIRECT_QUANTITY.test(sentence)
    || (PERSON_QUANTITY.test(sentence) && MILITARY_CONTEXT.test(sentence))
    || (DISTANCE_QUANTITY.test(sentence) && DISTANCE_CONTEXT.test(sentence))
    || (RATIO_QUANTITY.test(sentence) && RATIO_CONTEXT.test(sentence))
  );
}

export function requiresNarrativeBuffering(scenarioPrompt: string): boolean {
  return /mustNotInvent=|renderGuard\.(?:forbiddenTerms|rejectConcreteQuantities)=/.test(scenarioPrompt);
}

export function safeNarrativeFallback(): string {
  return '本轮只呈现已经确认的公开动静，未出现新的可核实细节。你先前的行动仍然有效，世界会依照既定事实继续推进。';
}

export function hasHardNarrativeViolation(check: NarrativePerformanceCheck): boolean {
  return check.issues.some(issue => issue.startsWith(HARD_ISSUE_PREFIX));
}

/** 只检查已接 Voice Card 的点名决策场景；普通闲聊与生活戏不加谋略 KPI。 */
export function validateNarrativePerformance(
  narrative: string,
  userInput: string,
  scenarioPrompt: string,
): NarrativePerformanceCheck {
  const issues: string[] = [];
  const controlLeaks = findInternalNarrativeControlLeaks(narrative);
  if (controlLeaks.length) {
    issues.push(`正文复述内部控制协议：${controlLeaks.join('、')}`);
  }
  for (const guard of INVENTION_GUARDS) {
    if (guard.marker.test(scenarioPrompt) && guard.violation.test(narrative)) issues.push(`${HARD_ISSUE_PREFIX}${guard.issue}`);
  }
  const forbiddenTerms = parseForbiddenTerms(scenarioPrompt);
  const leakedTerm = forbiddenTerms.find(term => new RegExp(escapeRegExp(term), 'u').test(narrative));
  if (leakedTerm) {
    issues.push(`${HARD_ISSUE_PREFIX}正文命中阶段禁词“${leakedTerm}”`);
  }
  if (concreteQuantityViolation(narrative, scenarioPrompt)) {
    issues.push(`${HARD_ISSUE_PREFIX}正文补造了具体人数、兵力、距离或比例`);
  }
  if (!DECISION_SCENE.test(userInput)) return { valid: issues.length === 0, issues };
  for (const name of ['小紫', '贾文和']) {
    if (!scenarioPrompt.includes(`【${name}·角色表演卡`) || !narrative.includes(name)) continue;
    const speech = namedSpeech(narrative, name);
    if (!ACTIVE_PLAN.test(speech)) {
      issues.push(`${name}只汇报/等待，没有亲自提出或实施会改变本轮选择的具体方案`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function performanceRetryInstruction(issues: string[]): string {
  return `上稿未通过内部检查：${issues.join('；')}。这段检查说明只供重写时使用，严禁复述到正文。保留已接地事实，整段重写；必须让被点名角色亲口说出或亲自实施一个具体可行动方案（含先手、后手、代价或退出条件之一），随后把选择留给玩家。不得让主角代为分析/下令，不得新增存档与正典没有的兵力、伤亡、人物或事件。`;
}

/**
 * 一般表演问题在末次保留模型正文；正典/发明硬门禁在末次改用本地安全正文，
 * 保证违规草稿既不进入 Step 2，也不进入显示与存档。
 */
export function decideNarrativePerformanceAttempt(
  narrative: string,
  userInput: string,
  scenarioPrompt: string,
  attempt: number,
  maxAttempts: number,
): NarrativePerformanceAttemptDecision {
  const performance = validateNarrativePerformance(narrative, userInput, scenarioPrompt);
  const hasHardViolation = hasHardNarrativeViolation(performance);
  // 正典/发明硬违规不可展示，也不值得再支付一次非确定性调用；
  // 当轮直接使用本地安全正文。普通表演问题仍保留一次模型重写。
  const shouldRetry = !hasHardViolation && !performance.valid && attempt < maxAttempts;
  return {
    ...performance,
    narrative: shouldRetry ? '' : (hasHardViolation ? safeNarrativeFallback() : narrative),
    shouldRetry,
    retryInstruction: performance.valid ? '' : performanceRetryInstruction(performance.issues),
  };
}
