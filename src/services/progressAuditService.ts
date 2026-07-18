import { get, set } from 'lodash';
import type { SaveData, StateChange } from '@/types/game';
import { parseJsonSmart } from '@/utils/jsonExtract';

/**
 * 进度审计员（TODO §9 第二层）。
 *
 * 定位：不替代第一层的确定性兜底（位置），只处理规则难稳判的「跨轮即兴目标」管理——
 * 合并/暂停/放弃/多轮演进/玩家意图改变。默认关闭（opt-in），后台事后追更（不阻塞正文）。
 *
 * 权限边界：只写 `系统.扩展.任务追踪.即兴目标`。绝不碰剧本 flag/背包/属性/关系/位置。
 * 所有模型输出必须过下方确定性 validator；模型不被信任去重、截断或凭空删目标。
 */

export const AUDIT_CONFIDENCE_THRESHOLD = 0.75;
export const MAX_IMPROV_GOALS = 3;
// 审计调用超时：挂起的辅助模型请求不得无限拖住这一轮
const AUDIT_TIMEOUT_MS = 20000;
const TITLE_MIN = 6;
const TITLE_MAX = 40;
const GOALS_PATH = ['系统', '扩展', '任务追踪', '即兴目标'];

// 剧透 / 远闻类：不得作为 active 目标或裁定依据
const REJECT_TITLE_RE = /听闻|远处|据说|下一站|准备前往|打算去|传来|遥望/;

interface AuditVerdict {
  title?: unknown;
  status?: unknown;
  evidence?: unknown;
  confidence?: unknown;
}
interface AuditRecommend {
  标题?: unknown;
  evidence?: unknown;
  confidence?: unknown;
}
export interface RawAuditOutput {
  goals?: unknown;
  recommended?: unknown;
}

export interface ValidateResult {
  finalGoals: { 标题: string }[];
  changed: boolean;
  diagnostics: string[];
}

function normalizeTitle(t: unknown): string {
  return typeof t === 'string'
    ? t.replace(/\s+/g, '').replace(/[，。、；！？,.;!?]+$/, '').trim()
    : '';
}

function currentGoalTitles(currentGoals: unknown): string[] {
  if (!Array.isArray(currentGoals)) return [];
  return currentGoals
    .map((g) => (typeof g === 'string' ? g : g && typeof g === 'object' ? (g as { 标题?: unknown }).标题 : ''))
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

function toNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

// 删除接地：只有当目标标题或其 evidence 确实出现在最近正文/玩家输入里，才允许移除旧目标。
// 模型本身不被信任，故其 evidence 文本必须能在真实上下文里对上，否则视为凭空删、拒绝。
function isDeletionGrounded(title: string, evidence: unknown, normContext: string): boolean {
  if (!normContext) return false;
  const nt = normalizeTitle(title);
  if (nt && normContext.includes(nt)) return true;
  const ne = normalizeTitle(evidence);
  return ne.length >= 4 && normContext.includes(ne);
}

// 新增接地（#12）：模型可能把预训练里的原著桥段当本局事实立目标（渔村撤离案）。
// evidence 是转述而非逐字引用，故校验放宽为「≥4 字连续片段命中本轮上下文」
// （与事件对账 matchedCore 同标准）；一个片段都命不中即视为凭空编造，拒绝。
function hasGroundedRun(text: unknown, normContext: string, minRun = 4): boolean {
  if (!normContext) return false;
  const nt = normalizeTitle(text);
  if (nt.length < minRun) return false;
  for (let i = 0; i + minRun <= nt.length; i++) {
    if (normContext.includes(nt.slice(i, i + minRun))) return true;
  }
  return false;
}

/**
 * 确定性 validator：把模型输出收敛为可写入的即兴目标数组。纯函数，可脱离 LLM 单测。
 * 契约：
 *  - 保留当前目标，只有 status∈{completed,abandoned}、有 evidence、confidence≥阈值、
 *    且 evidence/标题能在最近上下文里接地 才移除（不凭空删）。
 *  - 完全相同（标准化后同名）的当前目标去重（视为同一目标，非删除）。
 *  - 现存目标即使超过 3 条也不截断（截断=无据删除）；上限 3 只约束"新增"。
 *  - 新增 recommended 需：标题 6-40 字、有 evidence、confidence≥阈值、非听闻/远方类、不重复。
 *  - 去重与截断由本地执行，不信任模型。
 * @param context 最近正文 + 本轮玩家输入（用于给删除接地）；缺省则不允许任何删除。
 */
export function validateAuditedGoals(raw: unknown, currentGoals: unknown, context = ''): ValidateResult {
  const diagnostics: string[] = [];
  const r = raw && typeof raw === 'object' ? (raw as RawAuditOutput) : {};
  const goals: AuditVerdict[] = Array.isArray(r.goals) ? (r.goals as AuditVerdict[]) : [];
  const recommended: AuditRecommend[] = Array.isArray(r.recommended) ? (r.recommended as AuditRecommend[]) : [];
  const normContext = typeof context === 'string' ? context.replace(/\s+/g, '') : '';

  const verdictByTitle = new Map<string, AuditVerdict>();
  for (const v of goals) {
    const nt = normalizeTitle(v?.title);
    if (nt) verdictByTitle.set(nt, v);
  }

  const currentTitles = currentGoalTitles(currentGoals);
  const finalNorm: string[] = [];
  const finalObjs: { 标题: string }[] = [];
  const seen = new Set<string>();

  // 1) 保留当前目标——仅在高置信、接地的 completed/abandoned 时移除
  for (const title of currentTitles) {
    const nt = normalizeTitle(title);
    if (!nt) continue;
    if (seen.has(nt)) {
      // 与已保留目标标准化后同名 → 同一目标去重（不是删除一个独立目标）
      diagnostics.push(`去重当前目标「${title}」（与已保留目标同名）`);
      continue;
    }
    const v = verdictByTitle.get(nt);
    const status = typeof v?.status === 'string' ? v.status : '';
    const claimsDone = status === 'completed' || status === 'abandoned';
    const removable =
      claimsDone &&
      isNonEmptyString(v?.evidence) &&
      toNumber(v?.confidence) >= AUDIT_CONFIDENCE_THRESHOLD &&
      isDeletionGrounded(title, v?.evidence, normContext);
    if (removable) {
      diagnostics.push(`移除旧目标「${title}」（${status}, conf=${toNumber(v?.confidence)}）`);
      continue;
    }
    if (claimsDone) {
      diagnostics.push(`保留旧目标「${title}」：判为 ${status} 但 evidence/置信/接地不足，不凭空删`);
    }
    seen.add(nt);
    finalNorm.push(nt);
    finalObjs.push({ 标题: title.trim() });
  }

  // 2) 新增 recommended——逐条校验
  for (const rec of recommended) {
    if (finalObjs.length >= MAX_IMPROV_GOALS) {
      diagnostics.push('已达上限 3 条，截断后续新增');
      break;
    }
    const title = typeof rec?.标题 === 'string' ? rec.标题.trim() : '';
    const nt = normalizeTitle(title);
    if (!nt) continue;
    if (seen.has(nt)) {
      diagnostics.push(`跳过重复新增「${title}」`);
      continue;
    }
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      diagnostics.push(`拒绝新增「${title}」：标题长度越界`);
      continue;
    }
    if (REJECT_TITLE_RE.test(title)) {
      diagnostics.push(`拒绝新增「${title}」：听闻/远方类不作目标`);
      continue;
    }
    if (!isNonEmptyString(rec?.evidence)) {
      diagnostics.push(`拒绝新增「${title}」：缺 evidence`);
      continue;
    }
    if (!hasGroundedRun(rec?.evidence, normContext) && !hasGroundedRun(title, normContext)) {
      diagnostics.push(`拒绝新增「${title}」：evidence/标题未命中本轮上下文（疑似凭空或原著知识泄漏）`);
      continue;
    }
    if (toNumber(rec?.confidence) < AUDIT_CONFIDENCE_THRESHOLD) {
      diagnostics.push(`拒绝新增「${title}」：置信 ${toNumber(rec?.confidence)} < ${AUDIT_CONFIDENCE_THRESHOLD}`);
      continue;
    }
    seen.add(nt);
    finalNorm.push(nt);
    finalObjs.push({ 标题: title });
  }

  const currentNorm = currentTitles.map(normalizeTitle);
  const changed =
    currentNorm.length !== finalNorm.length || currentNorm.some((t, i) => t !== finalNorm[i]);

  return { finalGoals: finalObjs, changed, diagnostics };
}

// 玩家侧跨轮意图词：出现即值得让审计员看一眼目标是否要变
const PLAYER_INTENT_RE = /决定|放弃|暂缓|先不|不再|追查|查清|启程|北上|南下|回头|改道|安置|护送|接下来|任务|目标/;

/**
 * 触发门控（保守版）：有效时才调用；此处再判断本轮是否值得跑审计——
 * 已有即兴目标（可能需更新/移除）或玩家输入含跨轮意图词（可能新增/放弃）。
 * 其余（纯场景内动作、无目标无意图）不跑，控成本。
 */
export function shouldRunAudit(userAction: string, currentGoals: unknown): boolean {
  const hasGoals = currentGoalTitles(currentGoals).length > 0;
  const hasIntent = typeof userAction === 'string' && PLAYER_INTENT_RE.test(userAction);
  return hasGoals || hasIntent;
}

export interface ProgressAuditInput {
  saveData: SaveData;
  /** 最近数轮正文片段（由调用方裁剪，禁止塞完整背包/正典/未来章节） */
  recentText: string;
  /** 本轮玩家输入 */
  userAction: string;
  /** 剧本章节/活跃事件/已完成事件名 + 关键同队 NPC 短状态（由调用方拼好的窄上下文） */
  scenarioContext?: string;
  /** 变更日志摘要器（可选，默认原样） */
  summarize?: (key: string, value: unknown, action: string) => unknown;
  /** 注入的 LLM 调用（可选，便于测试；默认走 aiService.generateRaw + progressAudit 提示词） */
  generate?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

async function callWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('progress-audit timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildAuditUserPrompt(input: ProgressAuditInput): string {
  const currentGoals = currentGoalTitles(get(input.saveData, GOALS_PATH));
  const playerDesc = get(input.saveData, '角色.位置.描述');
  return [
    '【当前即兴目标】',
    currentGoals.length ? currentGoals.map((g, i) => `${i + 1}. ${g}`).join('\n') : '（无）',
    '',
    '【玩家位置】',
    typeof playerDesc === 'string' && playerDesc ? playerDesc : '（未知）',
    '',
    input.scenarioContext ? `【剧本与同队状态】\n${input.scenarioContext}\n` : '',
    '【本轮玩家输入】',
    input.userAction || '（无）',
    '',
    '【最近正文】',
    input.recentText || '（无）',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * 运行进度审计。async、best-effort：任何失败（未配置/网络/JSON 解析）都返回空、不影响主流程。
 * 只在校验后确有变化时写 `系统.扩展.任务追踪.即兴目标` 并返回一条 StateChange。
 */
export async function runProgressAudit(input: ProgressAuditInput): Promise<StateChange[]> {
  const userPrompt = buildAuditUserPrompt(input);

  let rawText: string;
  try {
    const call = async (): Promise<string> => {
      if (input.generate) return input.generate('', userPrompt);
      const { getPrompt } = await import('@/services/defaultPrompts');
      const { aiService } = await import('@/services/aiService');
      const systemPrompt = await getPrompt('progressAudit');
      return aiService.generateRaw({
        ordered_prompts: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        should_stream: false,
        generation_id: `progress_audit_${Date.now()}`,
        usageType: 'progress_audit',
      });
    };
    rawText = await callWithTimeout(call, AUDIT_TIMEOUT_MS);
  } catch (error) {
    console.warn('[进度审计] 调用失败/超时，跳过本轮审计:', error);
    return [];
  }

  let parsed: unknown;
  try {
    parsed = parseJsonSmart(rawText, true);
  } catch {
    console.warn('[进度审计] JSON 解析失败，跳过');
    return [];
  }

  const currentGoals = get(input.saveData, GOALS_PATH);
  const auditContext = `${input.recentText || ''}\n${input.userAction || ''}`;
  const { finalGoals, changed, diagnostics } = validateAuditedGoals(parsed, currentGoals, auditContext);
  for (const d of diagnostics) console.log('[进度审计]', d);
  if (!changed) return [];

  const summarize = input.summarize ?? ((_k, v) => v);
  const oldValue = get(input.saveData, GOALS_PATH);
  set(input.saveData, GOALS_PATH, finalGoals);
  console.warn(`[进度审计] 即兴目标已更新为 ${finalGoals.length} 条`);

  return [
    {
      key: '系统.扩展.任务追踪.即兴目标',
      action: 'set',
      oldValue: summarize('系统.扩展.任务追踪.即兴目标', oldValue, 'set'),
      newValue: summarize('系统.扩展.任务追踪.即兴目标', finalGoals, 'set'),
    },
  ];
}
