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
const CASUALTY_QUANTITY = new RegExp(
  `(?:死|死亡|阵亡|战殁|击杀|杀死|被杀|毙命|伤|受伤|重伤|轻伤|失踪|失散)[^。！？\\n]{0,10}${QUANTITY_NUMBER}\\s*(?:人|名|个|员|伙计|军士|弟兄|同伴|武士)`
  + `|${QUANTITY_NUMBER}\\s*(?:人|名|个|员|伙计|军士|弟兄|同伴|武士)[^。！？\\n]{0,10}(?:死|死亡|阵亡|战殁|击杀|杀死|被杀|毙命|伤|受伤|重伤|轻伤|失踪|失散)`
  + `|${QUANTITY_NUMBER}\\s*具\\s*(?:尸体|尸首|遗体)`,
);
const MATERIAL_LOSS_QUANTITY = new RegExp(
  `(?:损失|损毁|毁|冲翻|冲走|泡烂|沉没|遗失|丢失|跑了|死了|伤了|受惊)[^。！？\\n]{0,12}${QUANTITY_NUMBER}\\s*(?:辆|匹|艘|箱|担|车|船|骡|马)`
  + `|${QUANTITY_NUMBER}\\s*(?:辆|匹|艘|箱|担|车|船|骡|马)[^。！？\\n]{0,12}(?:损失|损毁|毁|冲翻|冲走|泡烂|沉没|遗失|丢失|跑了|死了|伤了|受惊)`,
);
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

function parseGroundedHandoffLossClaims(scenarioPrompt: string): string[] {
  const marker = 'renderGuard.groundedHandoffLossClaims=';
  const start = scenarioPrompt.indexOf(marker);
  if (start < 0) return [];
  const valueStart = start + marker.length;
  const end = scenarioPrompt.indexOf('；', valueStart);
  if (end < 0) return [];
  try {
    const parsed = JSON.parse(scenarioPrompt.slice(valueStart, end));
    return Array.isArray(parsed)
      ? parsed.filter((claim): claim is string => typeof claim === 'string' && Boolean(claim.trim()))
      : [];
  } catch {
    return [];
  }
}

interface ForbiddenAssociation {
  subjects: string[];
  predicates: string[];
  maxDistance?: number;
  allowHypothetical?: boolean;
}

interface AtomicPrivateClaim {
  holderName: string;
  claim: string;
  relatedTerms?: string[];
}

function parseForbiddenAssociations(scenarioPrompt: string): ForbiddenAssociation[] {
  const marker = 'renderGuard.forbiddenAssociations=';
  const associations: ForbiddenAssociation[] = [];
  let searchFrom = 0;
  while (searchFrom < scenarioPrompt.length) {
    const start = scenarioPrompt.indexOf(marker, searchFrom);
    if (start < 0) break;
    const valueStart = start + marker.length;
    const end = scenarioPrompt.indexOf('；renderGuard.', valueStart);
    if (end < 0) break;
    try {
      const parsed = JSON.parse(scenarioPrompt.slice(valueStart, end));
      if (Array.isArray(parsed)) associations.push(...parsed);
    } catch {
      // 配置装载时由 validator 拒绝；渲染门禁遇到损坏提示词时保持保守但不中断回合。
    }
    searchFrom = end + 1;
  }
  return associations;
}

function parseAtomicPrivateClaims(scenarioPrompt: string): AtomicPrivateClaim[] {
  const marker = 'renderGuard.atomicPrivateClaims=';
  const claims: AtomicPrivateClaim[] = [];
  let searchFrom = 0;
  while (searchFrom < scenarioPrompt.length) {
    const start = scenarioPrompt.indexOf(marker, searchFrom);
    if (start < 0) break;
    const valueStart = start + marker.length;
    const end = scenarioPrompt.indexOf('；renderGuard.', valueStart);
    if (end < 0) break;
    try {
      const parsed = JSON.parse(scenarioPrompt.slice(valueStart, end));
      if (Array.isArray(parsed)) claims.push(...parsed);
    } catch {
      // 配置由聚焦提示词编译器生成；损坏时不让解析异常中断整个叙事回合。
    }
    searchFrom = end + 1;
  }
  return claims.filter(item =>
    typeof item?.holderName === 'string'
    && Boolean(item.holderName.trim())
    && typeof item?.claim === 'string'
    && Boolean(item.claim.trim())
  );
}

const ATOMIC_FACT_AUDIT_REQUEST = /只说|仅说|确定知道|亲自知道|有证据|没有证据|复核|核对|确认事实/;
const ATOMIC_FACT_UNCERTAINTY = /不知道|不知情|不清楚|无从得知|没有证据|无证据|不能确认|无法确认|说不上来|未曾得知|仅此|就这些/;
const ATOMIC_FACT_DETAIL = /亲眼|我曾|我见|见过|当年|那时|曾经|后来|之后|出事|覆灭|散了|失踪|死了|住了|待了|跟着|带回|送来|贡品|端茶|研墨|穿(?:着|的是)|站在|帘(?:子)?后|议事|有人说|据说/;

function atomicPrivateClaimViolation(
  narrative: string,
  userInput: string,
  claims: AtomicPrivateClaim[],
): string | undefined {
  if (!ATOMIC_FACT_AUDIT_REQUEST.test(userInput)) return undefined;
  return claims.find(contract => userInput.includes(contract.holderName) && !narrative.includes(contract.claim))
    ? '核对私有事实时未逐字复述账本原子 claim'
    : claims.find(contract => {
        if (!userInput.includes(contract.holderName)) return false;
        const remainder = narrative.split(contract.claim).join('');
        const relatedTerms = (contract.relatedTerms || []).filter(Boolean);
        return remainder.split(/[。！？\n]/).some(sentence => {
          if (!ATOMIC_FACT_DETAIL.test(sentence) || ATOMIC_FACT_UNCERTAINTY.test(sentence)) return false;
          return /她|他|其/.test(sentence) || relatedTerms.some(term => sentence.includes(term));
        });
      })
      ? '核对私有事实时补写了原子 claim 之外的无来源经历或背景'
      : undefined;
}

function sentenceHasUnauthorizedQuantity(sentence: string, scenarioPrompt: string): boolean {
  if (
    /renderGuard\.allowUnverifiedQuantities=true/.test(scenarioPrompt)
    && hasExplicitUnverifiedQuantityContext(sentence)
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

function hasExplicitUnverifiedQuantityContext(sentence: string): boolean {
  return QUANTITY_CLAIM_SOURCE.test(sentence)
    && UNVERIFIED_QUANTITY_CONTEXT.test(sentence)
    && !AUTHORITATIVE_QUANTITY_CONTEXT.test(sentence);
}

function concreteQuantityViolation(narrative: string, scenarioPrompt: string): boolean {
  const guarded = /renderGuard\.rejectConcreteQuantities=true/.test(scenarioPrompt)
    || /mustNotInvent=[^。\n]*具体兵力数字/.test(scenarioPrompt);
  if (!guarded) return false;
  return narrative.split(/[。！？\n]/).some(sentence =>
    sentenceHasUnauthorizedQuantity(sentence, scenarioPrompt)
  );
}

function ungroundedHandoffLossViolation(narrative: string, scenarioPrompt: string): boolean {
  if (!/renderGuard\.rejectUngroundedHandoffLosses=true/.test(scenarioPrompt)) return false;
  const groundedClaims = parseGroundedHandoffLossClaims(scenarioPrompt);
  return narrative.split(/[。！？\n]/).some(sentence => {
    if (hasExplicitUnverifiedQuantityContext(sentence)) return false;
    const ungroundedRemainder = groundedClaims.reduce(
      (remainder, claim) => remainder.split(claim).join(''),
      sentence,
    );
    return CASUALTY_QUANTITY.test(ungroundedRemainder)
      || MATERIAL_LOSS_QUANTITY.test(ungroundedRemainder);
  });
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
  return /mustNotInvent=|renderGuard\.(?:forbiddenTerms|forbiddenAssociations|rejectConcreteQuantities|reservedFutureTerms|rejectUngroundedHandoffLosses|atomicPrivateClaims)=/.test(scenarioPrompt);
}

export function safeNarrativeFallback(): string {
  return '本轮只呈现已经确认的公开动静，未出现新的可核实细节。你先前的行动仍然有效，世界会依照既定事实继续推进。';
}

export function safeNarrativeFallbackForContext(userInput: string, scenarioPrompt: string): string {
  if (!ATOMIC_FACT_AUDIT_REQUEST.test(userInput)) return safeNarrativeFallback();
  const contract = parseAtomicPrivateClaims(scenarioPrompt)
    .find(item => userInput.includes(item.holderName));
  return contract
    ? `${contract.holderName}只复核已经确认的事实：“${contract.claim}”其余背景没有证据，无法确认。`
    : safeNarrativeFallback();
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
  if (ungroundedHandoffLossViolation(narrative, scenarioPrompt)) {
    issues.push(`${HARD_ISSUE_PREFIX}跨拍正文补造了无来源的精确伤亡或财货损失`);
  }
  const atomicClaimIssue = atomicPrivateClaimViolation(
    narrative,
    userInput,
    parseAtomicPrivateClaims(scenarioPrompt),
  );
  if (atomicClaimIssue) issues.push(`${HARD_ISSUE_PREFIX}${atomicClaimIssue}`);
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
  return `上稿未通过内部检查：${issues.join('；')}。这段检查说明只供重写时使用，严禁复述到正文。保留已接地事实，整段重写；不得提前演出被标为后续步骤保留内容的动作、台词或结果。若提示词给出 atomicPrivateClaims 且玩家明确要求核对有证据事实，必须逐字复述其中 claim；除此之外只可回答不知道／没有证据，不得补写回忆、见闻、服饰、时长、地点、来源或传闻。必须让被点名角色亲口说出或亲自实施一个具体可行动方案（含先手、后手、代价或退出条件之一），随后把选择留给玩家。不得让主角代为分析/下令，不得新增存档与正典没有的兵力、伤亡、人物或事件。跨拍余波没有结构化损失回执时，伤亡、伤者、财货、车船与牲畜损失只写定性结果或“仍待清点”，不得补精确数量。涉及军务、护卫或路线时，改写为不带数字的职责、通行、次序、联络和可见动作，不得补人数、距离或比例；命中的禁词或秘密关联改用已经公开的表象承接，不得换一种肯定说法再次坐实。`;
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
    narrative: shouldRetry
      ? ''
      : (hasHardViolation
          ? safeNarrativeFallbackForContext(userInput, scenarioPrompt)
          : narrative),
    shouldRetry,
    retryInstruction: performance.valid ? '' : performanceRetryInstruction(performance.issues),
  };
}
