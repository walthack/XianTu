import { CONTENT_PACKS } from '../contentPacks';
import type { PackIfBranches } from '../contentPacks/coreFormats';

export interface ScenarioDivergenceCharacterState {
  characterId: string;
  status: string;
}

export interface ScenarioDivergence {
  id: string;
  eventId: string;
  branchId?: string;
  worldDelta: string;
  characterStates: ScenarioDivergenceCharacterState[];
  evidence: string;
  sequence: number;
  /** false 表示事实已在世界发生，但尚未公开或被玩家获知。旧档缺省即已知。 */
  revealed?: boolean;
}

interface ReconciledDivergenceInput {
  id: string;
  verdict: 'done' | 'void';
  evidence: string;
  worldDelta?: string;
  characterStates?: Record<string, string>;
}

interface DivergenceRuntime {
  flags: Record<string, unknown>;
  divergences?: ScenarioDivergence[];
}

export interface AutoBranchRule {
  eventId: string;
  branchId: string;
  requiredCharacterId: string;
  acceptedStatuses: RegExp;
  flagCharacterSlug: string;
  normalizedStatus: string;
  /** 分歧提示里这条 IF 的后果说明（formatDivergencePrompt 按 branchId 取）。 */
  prompt?: string;
}

export interface AutoConsequenceRule {
  eventId: string;
  requiredCharacterId: string;
  acceptedStatuses: RegExp;
  flagKey: string;
  flagValue: unknown;
  /** 分歧提示：同一事件、同一人物状态命中本条时的后果说明（匹配不 trim，同原三元式）。 */
  prompt?: string;
}

/**
 * 数据（B5 起）：IF 自动分支 5 条、自动后果 1 条、按分歧记录 id 的后果提示 1 条在人物包
 * `contentPacks/packs/characters/if-branches.json`，权威来源是那份 JSON（原来源注释在其 `note`）；
 * 三张 `TS_*` 为空表，导出名与查询函数不变。
 */
export const TS_AUTO_BRANCH_RULES: AutoBranchRule[] = [];

export const TS_AUTO_CONSEQUENCE_RULES: AutoConsequenceRule[] = [];

export const TS_DIVERGENCE_PROMPTS: Record<string, string> = {};

/** 包里的 acceptedStatuses（小写字母串）编译成与原表同形的正则：一个 → ^x$，多个 → ^(a|b)$，不分大小写（F0a）。 */
export function acceptedStatusPattern(statuses: readonly string[]): RegExp {
  return new RegExp(statuses.length === 1 ? `^${statuses[0]}$` : `^(${statuses.join('|')})$`, 'i');
}

/** TS 表在前、包按 catalog 顺序在后；branchId、分歧提示 id 重复即报错（编译期已查，这里兜底）。 */
export function mergeIfBranches(
  ts: { branches: readonly AutoBranchRule[]; consequences: readonly AutoConsequenceRule[]; prompts: Readonly<Record<string, string>> },
  pack: Partial<PackIfBranches> | undefined,
): { branches: AutoBranchRule[]; consequences: AutoConsequenceRule[]; prompts: Record<string, string> } {
  const branches = [...ts.branches, ...(pack?.branches || []).map(({ acceptedStatuses, ...rule }) => ({ ...rule, acceptedStatuses: acceptedStatusPattern(acceptedStatuses) }))];
  const consequences = [...ts.consequences, ...(pack?.consequences || []).map(({ acceptedStatuses, ...rule }) => ({ ...rule, acceptedStatuses: acceptedStatusPattern(acceptedStatuses) }))];
  const ids = new Set<string>();
  for (const rule of branches) { if (ids.has(rule.branchId)) throw new Error(`if branch ${rule.branchId}: duplicate`); ids.add(rule.branchId); }
  const prompts = { ...ts.prompts };
  for (const [id, text] of Object.entries(pack?.prompts || {})) { if (id in prompts) throw new Error(`divergence prompt ${id}: duplicate`); prompts[id] = text; }
  return { branches, consequences, prompts };
}

const IF_RULES = mergeIfBranches({ branches: TS_AUTO_BRANCH_RULES, consequences: TS_AUTO_CONSEQUENCE_RULES, prompts: TS_DIVERGENCE_PROMPTS }, CONTENT_PACKS.ifBranches);
const AUTO_BRANCH_RULES = IF_RULES.branches;
const AUTO_CONSEQUENCE_RULES = IF_RULES.consequences;
const DIVERGENCE_PROMPTS = IF_RULES.prompts;

/**
 * 分歧记录的后果说明。顺序同原三元式：IF 分支（按 branchId）→ 分歧记录 id → 自动后果（同事件、人物状态命中，状态不 trim）。
 * 命中但没有说明的一档（如无 prompt 的分支）继续往下找。
 */
function divergenceConsequence(item: ScenarioDivergence): string {
  const branch = item.branchId ? AUTO_BRANCH_RULES.find(rule => rule.branchId === item.branchId)?.prompt : undefined;
  if (branch) return branch;
  if (Object.prototype.hasOwnProperty.call(DIVERGENCE_PROMPTS, item.id)) return DIVERGENCE_PROMPTS[item.id];
  return AUTO_CONSEQUENCE_RULES.find(rule => rule.prompt && rule.eventId === item.eventId
    && item.characterStates.some(state => state.characterId === rule.requiredCharacterId && rule.acceptedStatuses.test(state.status)))?.prompt || '';
}

function setFlag(flags: Record<string, unknown>, key: string, value: unknown): void {
  flags[key] = value;
}

function characterFlagSlug(characterId: string): string {
  return characterId.split('.').filter(Boolean).at(-1) || characterId;
}

function matchingBranch(input: ReconciledDivergenceInput): AutoBranchRule | undefined {
  if (input.verdict !== 'void') return undefined;
  return AUTO_BRANCH_RULES.find(rule => {
    if (rule.eventId !== input.id) return false;
    const status = input.characterStates?.[rule.requiredCharacterId];
    return typeof status === 'string' && rule.acceptedStatuses.test(status.trim());
  });
}

/** 只读查询既有 IF registry；世界模式在落账前用它确认合同不会退化成无分支的普通 void。 */
export function resolveReconcileBranchId(input: ReconciledDivergenceInput): string | undefined {
  return matchingBranch(input)?.branchId;
}

function matchingConsequence(input: ReconciledDivergenceInput): AutoConsequenceRule | undefined {
  if (input.verdict !== 'void') return undefined;
  return AUTO_CONSEQUENCE_RULES.find(rule => {
    if (rule.eventId !== input.id) return false;
    const status = input.characterStates?.[rule.requiredCharacterId];
    return typeof status === 'string' && rule.acceptedStatuses.test(status.trim());
  });
}

/** 确定性落分歧账本并激活满足人物状态谓词的 IF；幂等，不接受 LLM 直接写入。 */
export function recordReconcileDivergences(
  runtime: DivergenceRuntime,
  accepted: ReconciledDivergenceInput[],
): ScenarioDivergence[] {
  const ledger = runtime.divergences ??= [];
  const added: ScenarioDivergence[] = [];

  for (const input of accepted) {
    if (input.verdict !== 'void' || !input.worldDelta) continue;
    const branch = matchingBranch(input);
    const consequence = matchingConsequence(input);
    const states = Object.entries(input.characterStates || {})
      .map(([characterId, status]) => ({ characterId, status }));
    const duplicate = ledger.some(item => item.eventId === input.id
      && item.worldDelta === input.worldDelta
      && item.branchId === branch?.branchId);
    if (duplicate) continue;

    const record: ScenarioDivergence = {
      id: `divergence.${input.id}.${ledger.length + 1}`,
      eventId: input.id,
      ...(branch ? { branchId: branch.branchId } : {}),
      worldDelta: input.worldDelta,
      characterStates: states,
      evidence: input.evidence,
      sequence: ledger.length + 1,
    };
    ledger.push(record);
    added.push(record);

    // 所有人物分歧都写入统一状态路径；IF 只是高光承接包，不能垄断人物状态语义。
    // 这样下游任意关卡都能按 relatedCharacterIds 识别 dead/missing/longrest 等现实。
    for (const state of states) {
      setFlag(runtime.flags, `character.${characterFlagSlug(state.characterId)}.status`, state.status.toLowerCase());
    }

    if (branch) {
      setFlag(runtime.flags, `branch.${branch.branchId}.unlocked`, true);
      setFlag(runtime.flags, `branch.${branch.branchId}.active`, true);
      setFlag(runtime.flags, `character.${branch.flagCharacterSlug}.status`, branch.normalizedStatus);
    }
    if (consequence) setFlag(runtime.flags, consequence.flagKey, consequence.flagValue);
  }
  return added;
}

/** 世界级事件不等玩家：引擎结算的缺席后果进入可见账本，但绝不伪装成 LLM 对账或玩家完成。 */
export function recordOffscreenDivergence(
  runtime: DivergenceRuntime,
  input: Pick<ScenarioDivergence, 'id' | 'eventId' | 'worldDelta' | 'evidence'> & { revealed?: boolean },
): ScenarioDivergence | undefined {
  const ledger = runtime.divergences ??= [];
  if (ledger.some(item => item.id === input.id)) return undefined;
  const record: ScenarioDivergence = { ...input, characterStates: [], sequence: ledger.length + 1 };
  ledger.push(record);
  return record;
}

export function formatDivergencePrompt(divergences: ScenarioDivergence[] | undefined): string {
  if (!Array.isArray(divergences) || divergences.length === 0) return '';
  const recent = divergences.filter(item => item.revealed !== false).slice(-5);
  if (!recent.length) return '';
  return `【本世界线分歧·已经发生的事实】\n${recent.map(item => {
    const states = item.characterStates.map(s => `${s.characterId}=${s.status}`).join('、');
    const consequence = divergenceConsequence(item);
    return `- ${item.worldDelta}${states ? `（人物状态：${states}）` : ''}${consequence ? `；${consequence}` : ''}`;
  }).join('\n')}\n叙事必须承认这些变化，并让相关人物据此采取行动；不得把原著旧结果重新写回。优先用世界内后果表现，再用简短回执说明变化。`;
}
