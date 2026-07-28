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
const DIRECT_MILITARY_QUANTITY = new RegExp(
  `${QUANTITY_NUMBER}\\s*(?:骑|兵|骑兵|军士|甲士|部众|校尉|亲兵|亲卫|家兵|营|精锐|部曲|人马(?!上|车|不停蹄|前|后)|兵马|北军|凉州军|禁军|守军|援军)`,
);
const MILITARY_HEADCOUNT = new RegExp(
  `(?:军|兵|骑|甲士|亲卫|北军|凉州军)[^。！？\\n]{0,12}${QUANTITY_NUMBER}\\s*(?:名|人|队|精锐|部曲|人马|兵马)`
  + `|${QUANTITY_NUMBER}\\s*(?:名|人|队)[^。！？\\n]{0,12}(?:驻守|列阵|列队|持兵|披甲|卸刃|围宫|攻城|骑兵|甲士|军士)`,
);
const DISTANCE_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*(?:步|尺|里)`);
const WARD_DISTANCE_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*坊`);
const RATIO_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*成`);
const DISTANCE_CONTEXT = /距离|相隔|开外|以内|界碑|宫门|布置|驻扎|列阵|行军|路线|要道/;
const MILITARY_WARD_CONTEXT = /军|兵|骑|甲士|军士|部众|校尉|亲兵|家兵|营|驻扎|驻守|列阵|行军|布防|设防|围宫|攻城/;
// 比例拦截按「主语」判定，不按动词枚举：折损／抽丁／守军减 与 折价／抽成／减价
// 用的是同一批动词，只有主语能区分军政与商贸。枚举动词必然漏同义表述。
const RATIO_FISCAL_CONTEXT = /税|赋|军饷|军费|军粮|军需|征发|徭役|兵力|伤亡/;
const RATIO_CONTEXT = new RegExp(`${RATIO_FISCAL_CONTEXT.source}|${MILITARY_WARD_CONTEXT.source}|丁`);
const QUANTITY_CLAIM_SOURCE = /探子|斥候|军报|来报|使者|消息|号称|声称|自称|据报|传闻|据说/;
const UNVERIFIED_QUANTITY_CONTEXT = /号称|声称|据报|传闻|据说|未核实|未经核实|尚待核实|无法证实|真假难辨/;
const AUTHORITATIVE_QUANTITY_CONTEXT = /确有|确认|查明|已经核实|确切|实有/;
const HYPOTHETICAL_CONTEXT = /莫非|是否|会不会|难道|假若|倘若|若有|有无(?!数)|有没有|并无|没有|未见|不曾/;
const ASSOCIATION_HYPOTHETICAL_CONTEXT = /莫非|莫不是|是否|会不会|会否|难道|假若|倘若|若有|疑心|怀疑|揣测|猜想|猜测|疑似|还是说|难保|恐怕|多半|八成|若[^。！？\n]{0,6}(?:真是|就是|确是)/;
const CONFIRMING_CONTEXT = /确有|果然|原来|证实|查明|确认|实有|的确|属实/;
const CONTEXTUAL_FORBIDDEN_TERMS = new Set(['暗道', '伏兵', '暗桩', '魂丹']);
const INVENTION_GUARDS: Array<{ marker: RegExp; violation: RegExp; issue: string }> = [
  {
    marker: /mustNotInvent=[^。\n]*(?:秘密盟约|具体秘密盟约)/,
    violation: /密约|秘密盟约|歃血为盟|暗中结盟/,
    issue: '渲染补造了 mustNotInvent 禁止的秘密盟约',
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

function parseReservedFutureTerms(scenarioPrompt: string): string[] {
  const match = scenarioPrompt.match(/renderGuard\.reservedFutureTerms=([^；。\n]*)/);
  if (!match?.[1]) return [];
  return match[1].split('|').map(item => item.trim()).filter(Boolean);
}

interface ForbiddenAssociation {
  subjects: string[];
  predicates: string[];
  maxDistance?: number;
  allowHypothetical?: boolean;
}

function parseForbiddenAssociations(scenarioPrompt: string): ForbiddenAssociation[] {
  const marker = 'renderGuard.forbiddenAssociations=';
  const start = scenarioPrompt.indexOf(marker);
  if (start < 0) return [];
  const valueStart = start + marker.length;
  const end = scenarioPrompt.indexOf('；renderGuard.', valueStart);
  if (end < 0) return [];
  try {
    const parsed = JSON.parse(scenarioPrompt.slice(valueStart, end));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 配置装载时由 validator 拒绝；渲染门禁遇到损坏提示词时保持保守但不中断回合。
    return [];
  }
}

function sentenceHasUnauthorizedQuantity(sentence: string, scenarioPrompt: string): boolean {
  if (
    /renderGuard\.allowUnverifiedQuantities=true/.test(scenarioPrompt)
    && QUANTITY_CLAIM_SOURCE.test(sentence)
    && UNVERIFIED_QUANTITY_CONTEXT.test(sentence)
    && !AUTHORITATIVE_QUANTITY_CONTEXT.test(sentence)
  ) return false;
  // “各退一步”表示双方让步；即使同句谈到入宫路线，也不是军事距离。
  const distanceText = sentence.replace(/各(?:自)?退一(?:小)?步/g, '');
  // “你我三人”是在列谈话参与者；不能被同句较早出现的军职／卸甲语汇污染成兵力。
  const headcountText = sentence.replace(/(?:你我|我等|我们)[二两三四五六七八九十]人/g, '');
  return DIRECT_MILITARY_QUANTITY.test(sentence)
    || MILITARY_HEADCOUNT.test(headcountText)
    || (DISTANCE_QUANTITY.test(distanceText) && DISTANCE_CONTEXT.test(distanceText))
    || (WARD_DISTANCE_QUANTITY.test(sentence) && MILITARY_WARD_CONTEXT.test(sentence))
    || (RATIO_QUANTITY.test(sentence) && RATIO_CONTEXT.test(sentence));
}

function concreteQuantityViolation(narrative: string, scenarioPrompt: string): boolean {
  const guarded = /renderGuard\.rejectConcreteQuantities=true/.test(scenarioPrompt)
    || /mustNotInvent=[^。\n]*具体兵力数字/.test(scenarioPrompt);
  if (!guarded) return false;
  return narrative.split(/[。！？\n]/).some(sentence =>
    sentenceHasUnauthorizedQuantity(sentence, scenarioPrompt)
  );
}

function leakedForbiddenTerm(narrative: string, terms: string[]): string | undefined {
  const sentences = narrative.split(/[。！？\n]/);
  return terms.find(term => sentences.some((sentence, index) => {
    if (!new RegExp(escapeRegExp(term), 'u').test(sentence)) return false;
    if (!CONTEXTUAL_FORBIDDEN_TERMS.has(term) || !HYPOTHETICAL_CONTEXT.test(sentence)) return true;
    // 假设/否定句只在没有被本句或紧邻下一句坐实时放行，防止
    // “是否另有暗道？确有一条通往北阙”用跨句省略主语绕过门禁。
    return CONFIRMING_CONTEXT.test(sentence) || CONFIRMING_CONTEXT.test(sentences[index + 1] || '');
  }));
}

function leakedForbiddenAssociation(
  narrative: string,
  associations: ForbiddenAssociation[],
): ForbiddenAssociation | undefined {
  const sentences = narrative.split(/[。！？\n]/);
  return associations.find(rule => {
    const maxDistance = Number.isInteger(rule.maxDistance) ? rule.maxDistance! : 48;
    return rule.subjects.some(subject => {
      for (let subjectAt = narrative.indexOf(subject); subjectAt >= 0; subjectAt = narrative.indexOf(subject, subjectAt + subject.length)) {
        if (rule.predicates.some(predicate => {
          for (let predicateAt = narrative.indexOf(predicate); predicateAt >= 0; predicateAt = narrative.indexOf(predicate, predicateAt + predicate.length)) {
            if (Math.abs(predicateAt - subjectAt) > maxDistance) continue;
            if (!rule.allowHypothetical) return true;
            const sentenceIndex = narrative.slice(0, predicateAt).split(/[。！？\n]/).length - 1;
            const sentence = sentences[sentenceIndex] || '';
            if (!ASSOCIATION_HYPOTHETICAL_CONTEXT.test(sentence)) return true;
            if (CONFIRMING_CONTEXT.test(sentence) || CONFIRMING_CONTEXT.test(sentences[sentenceIndex + 1] || '')) {
              return true;
            }
          }
          return false;
        })) return true;
      }
      return false;
    });
  });
}

export function requiresNarrativeBuffering(scenarioPrompt: string): boolean {
  return /mustNotInvent=|renderGuard\.(?:forbiddenTerms|forbiddenAssociations|rejectConcreteQuantities|reservedFutureTerms)=/.test(scenarioPrompt);
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
  const leakedTerm = leakedForbiddenTerm(narrative, forbiddenTerms);
  if (leakedTerm) {
    issues.push(`${HARD_ISSUE_PREFIX}正文命中阶段禁词“${leakedTerm}”`);
  }
  const leakedAssociation = leakedForbiddenAssociation(narrative, parseForbiddenAssociations(scenarioPrompt));
  if (leakedAssociation) {
    issues.push(`${HARD_ISSUE_PREFIX}正文提前演出受保护人物的后续状态`);
  }
  const reservedFutureTerm = parseReservedFutureTerms(scenarioPrompt)
    .find(term => narrative.includes(term));
  if (reservedFutureTerm) {
    issues.push(`${HARD_ISSUE_PREFIX}正文提前演出后续步骤保留内容“${reservedFutureTerm}”`);
  }
  if (concreteQuantityViolation(narrative, scenarioPrompt)) {
    issues.push(`${HARD_ISSUE_PREFIX}正文补造了具体兵力数字、军事距离或比例`);
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
  return `上稿未通过内部检查：${issues.join('；')}。这段检查说明只供重写时使用，严禁复述到正文。保留已接地事实，整段重写；不得提前演出被标为后续步骤保留内容的动作、台词或结果。必须让被点名角色亲口说出或亲自实施一个具体可行动方案（含先手、后手、代价或退出条件之一），随后把选择留给玩家。不得让主角代为分析/下令，不得新增存档与正典没有的兵力、伤亡、人物或事件。涉及军务、护卫或路线时，改写为不带数字的职责、通行、次序、联络和可见动作，不得补人数、距离或比例；命中的禁词或秘密关联改用已经公开的表象承接，不得换一种肯定说法再次坐实。`;
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
  // 所有首稿失败均允许一次带明确问题说明的定向重写；硬违规草稿仍保持缓冲，
  // 只有末次继续违规才使用本地安全正文，避免一次误报直接把整轮退化成罐头。
  const shouldRetry = !performance.valid && attempt < maxAttempts;
  return {
    ...performance,
    narrative: shouldRetry ? '' : (hasHardViolation ? safeNarrativeFallback() : narrative),
    shouldRetry,
    retryInstruction: performance.valid ? '' : performanceRetryInstruction(performance.issues),
  };
}
