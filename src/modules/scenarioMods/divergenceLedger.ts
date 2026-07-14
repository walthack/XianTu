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

interface AutoBranchRule {
  eventId: string;
  branchId: string;
  requiredCharacterId: string;
  acceptedStatuses: RegExp;
  flagCharacterSlug: string;
  normalizedStatus: string;
}

interface AutoConsequenceRule {
  eventId: string;
  requiredCharacterId: string;
  acceptedStatuses: RegExp;
  flagKey: string;
  flagValue: unknown;
}

/**
 * R2-0V 首个纵切运行时 registry。
 * eventId 只召回候选；人物状态才确认分支，避免所有 void 原因都硬塞进同一 IF。
 * 来源：character-canon/qingyu.if-branches.json + CANON-DECISIONS #90。
 */
const AUTO_BRANCH_RULES: AutoBranchRule[] = [{
  eventId: 'lcq.event.s06_03',
  branchId: 'lcq.if_xieyi_longrest',
  requiredCharacterId: 'liuchao.character.xie_yi',
  acceptedStatuses: /^(alive|longrest|incapacitated)$/i,
  flagCharacterSlug: 'xie_yi',
  normalizedStatus: 'longrest',
}, {
  eventId: 'lcq.event.s06_04',
  branchId: 'lcq.if_xiaozi_spares_mother',
  requiredCharacterId: 'liuchao.character.bi_ji',
  acceptedStatuses: /^(alive|longrest|incapacitated)$/i,
  flagCharacterSlug: 'bi_ji',
  normalizedStatus: 'alive',
}, {
  eventId: 'lcq.event.s08_06_pursuit_repelled',
  branchId: 'lcq.if_sudaji_slain_mochou',
  requiredCharacterId: 'liuchao.character.su_daji',
  acceptedStatuses: /^dead$/i,
  flagCharacterSlug: 'su_daji',
  normalizedStatus: 'dead',
}, {
  eventId: 'lyg.event.s01_06',
  branchId: 'lyg.if_guojie_longrest',
  requiredCharacterId: 'liuchao.character.guo_jie',
  acceptedStatuses: /^(alive|longrest|incapacitated)$/i,
  flagCharacterSlug: 'guo_jie',
  normalizedStatus: 'longrest',
}, {
  eventId: 'lyg.event.s01_07',
  branchId: 'lyg.if_dongzhuo_longrest',
  requiredCharacterId: 'liuchao.character.dong_zhuo',
  acceptedStatuses: /^(alive|longrest|incapacitated)$/i,
  flagCharacterSlug: 'dong_zhuo',
  normalizedStatus: 'longrest',
}];

/**
 * 没有把谢艺救回并不等于可以把原著死亡照抄回来。此处只登记“失踪”这个
 * 可续玩的失败后果；它刻意不激活长养 IF，也不伪称玩家完成了死亡事件。
 */
const AUTO_CONSEQUENCE_RULES: AutoConsequenceRule[] = [{
  eventId: 'lcq.event.s06_03',
  requiredCharacterId: 'liuchao.character.xie_yi',
  acceptedStatuses: /^missing$/i,
  flagKey: 'world.xieyi_absence.active',
  flagValue: true,
}];

function setFlag(flags: Record<string, unknown>, key: string, value: unknown): void {
  flags[key] = value;
}

function matchingBranch(input: ReconciledDivergenceInput): AutoBranchRule | undefined {
  if (input.verdict !== 'void') return undefined;
  return AUTO_BRANCH_RULES.find(rule => {
    if (rule.eventId !== input.id) return false;
    const status = input.characterStates?.[rule.requiredCharacterId];
    return typeof status === 'string' && rule.acceptedStatuses.test(status.trim());
  });
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
  input: Pick<ScenarioDivergence, 'id' | 'eventId' | 'worldDelta' | 'evidence'>,
): ScenarioDivergence | undefined {
  const ledger = runtime.divergences ??= [];
  if (ledger.some(item => item.id === input.id)) return undefined;
  const record: ScenarioDivergence = { ...input, characterStates: [], sequence: ledger.length + 1 };
  ledger.push(record);
  return record;
}

export function formatDivergencePrompt(divergences: ScenarioDivergence[] | undefined): string {
  if (!Array.isArray(divergences) || divergences.length === 0) return '';
  const recent = divergences.slice(-5);
  return `【本世界线分歧·已经发生的事实】\n${recent.map(item => {
    const states = item.characterStates.map(s => `${s.characterId}=${s.status}`).join('、');
    const consequence = item.branchId === 'lcq.if_xiaozi_spares_mother'
      ? '小紫不得被写成已弑母；她或同行者必须当场决定如何处置仍活着的碧姬（看守、送离或交由可信者照料），并承接这项决定的余波。'
      : item.branchId === 'lcq.if_sudaji_slain_mochou'
        ? '苏妲己已死，不得让她继续出手追杀；后续应处理黑魔海遗留网络与权力真空，且星月湖战争仍会发生。'
        : item.branchId === 'lyg.if_guojie_longrest'
          ? '郭解重伤生还；托孤已转为受限辅政之约。他不得改写定陶王登基，但应由游侠旧部、洛都耳目或程宗扬的护持具体承接。'
          : item.branchId === 'lyg.if_dongzhuo_longrest'
            ? '董卓重伤未死且不得回京争权；贾文和必须收束凉州旧部、交代边地军情或其退场安排，定陶王登基不变。'
            : item.id === 'offscreen.lcq.xingyuehu_war'
              ? '这是玩家缺席时世界自行结算的战争后果：不得让战争倒带或写成玩家亲自参战；应以战报、伤员、戒严和粮线压力持续承接，玩家仍可选择介入余波或继续置身事外。'
              : item.eventId === 'lcq.event.s06_03'
                && item.characterStates.some(state => state.characterId === 'liuchao.character.xie_yi' && /^missing$/i.test(state.status))
                ? '谢艺下落不明，既不得确认其死亡或安全，也不得启动长养 IF。星月湖须分出人手搜寻，并防备黑魔海借断线渗透；玩家可介入搜寻、护送或调查余波。'
        : '';
    return `- ${item.worldDelta}${states ? `（人物状态：${states}）` : ''}${consequence ? `；${consequence}` : ''}`;
  }).join('\n')}\n叙事必须承认这些变化，并让相关人物据此采取行动；不得把原著旧结果重新写回。优先用世界内后果表现，再用简短回执说明变化。`;
}
