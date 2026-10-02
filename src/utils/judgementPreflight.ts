import {
  createJudgementProposal,
  environmentFactorFor,
  getJudgementState,
  persistPendingJudgement,
  type CreateJudgementProposalInput,
  type JudgementKind,
  type JudgementProposal,
  type JudgementResolution,
} from './judgementEngine';
import type { ScenarioEventActionJudgement } from '@/modules/scenarioMods/schema';
import { calculateTurnJudgementData } from './judgementRules';
import { getCanonRailContract, getCanonRailProfile } from '@/modules/scenarioMods/canonRail';
import { getNarrativeAnchorEvent } from '@/modules/scenarioMods/runtime';
import { findWorldSimulationIntervention } from '@/modules/scenarioMods/worldSimulation';
import { fastNarrativeDemoShortKnifeFactor } from '@/modules/scenarioMods/fastNarrativeDemoAdjudication';

const RISK_RULES: Array<[JudgementKind, RegExp]> = [
  ['combat', /攻击|出手|偷袭|斩杀|刺杀|搏杀|斗法|交手|战斗|迎战|应战|反击|格挡|挡住|阻击|拦住|制服|擒拿|对决|打晕|击晕|下毒|抢劫|抢夺(?!先机|时间|机会|话语权)|抢下.{0,8}(?:手里|手中|手上).{0,6}(?:短刀|长刀|刀剑|佩刀|佩剑|剑|匕首|斧|枪|矛|弓|兵器|武器)|(?:斩|砍|刺|杀|宰|击|射)(?:向|出|了|死|伤|中|退|倒|那|这|他|她|它|敌|贼|妖|守卫|对手)|打(?:向|死|伤|中|退|倒|那|这|他|她|它|敌|贼|妖|守卫|对手)|打了(?:他|她|它|敌人|守卫|对手)|打出(?:一|两|三|数)?(?:拳|掌|招|击)/],
  ['escape', /逃跑|逃走|逃离|逃出去|跑掉|撤退|脱身|突围|甩开|摆脱|冲出包围|避开追兵|躲开.{0,8}(?:射来的|飞来的|袭来的)?箭/],
  ['stealth', /潜入|潜行|隐匿|藏身|敛息|偷窃|偷走|盗取|顺走|暗杀|撬锁|偷听|刺探|窥探|躲过|瞒过守卫|避开守卫/],
  ['craft', /炼丹|炼器|制符|布阵|炼制|锻造|打造|配药|制药|制作(?:丹药|法器|符箓|阵盘)/],
  ['cultivate', /突破|冲击境界|冲关|闭关|修炼|运功|双修|调息|疗伤|疗愈|修复经脉/],
  ['social', /说服|劝说|劝服|游说|劝他|劝她|威胁|交涉|谈判|讨价还价|收服|招揽|请求放行/],
  ['scheme', /欺骗|骗(?:过|他|她|取|到)|撒谎|说谎|伪装|冒充|设局|布局|策反|栽赃|蒙混过关/],
  ['explore', /探索|搜查|搜索|搜寻|探查|调查|侦察|勘察|追踪|查验|检查伤势|翻越|闯入|寻找(?:暗门|机关|线索|入口)/],
];
const EXPLICIT_IF_INTENT = /收服|招揽|结盟|策反|纳入后宫|纳妾|改写命运|救下.*不死|提前杀死/;

/** Clicked event/open-world contracts are already locally settled; keyword risk cards must not intercept them. */
export function shouldSkipJudgementPreflight(input: {
  skipPreflight?: boolean;
  selectedSource?: string;
  selectedPlayerLine?: string;
  userMessage?: string;
}): boolean {
  if (input.skipPreflight) return true;
  if (input.selectedSource === 'open_world_engine') return true;
  if (input.selectedSource === 'baihu_gamble_refusal_engine') return true;
  return input.selectedSource === 'event_engine'
    && Boolean(input.selectedPlayerLine)
    && input.selectedPlayerLine === input.userMessage;
}

/** The queued action is part of the submitted intent and must be preflighted too. */
export function composeJudgementAction(intentText: string, actionQueueText: string): string {
  const intent = intentText.trim();
  const queue = actionQueueText.trim();
  if (!queue || intent.includes(queue)) return intent;
  if (!intent) return queue;
  return `${intent}\n\n${queue}`;
}

const STAT_WEIGHTS: Record<JudgementKind, Array<[string, number]>> = {
  combat: [['根骨', .5], ['灵性', .3], ['气运', .2]], cultivate: [['悟性', .5], ['灵性', .3], ['心性', .2]],
  craft: [['悟性', .5], ['灵性', .3], ['心性', .2]], explore: [['气运', .5], ['灵性', .3], ['悟性', .2]],
  social: [['魅力', .5], ['悟性', .3], ['心性', .2]], escape: [['灵性', .5], ['气运', .3], ['根骨', .2]],
  stealth: [['灵性', .5], ['气运', .3], ['心性', .2]], scheme: [['悟性', .5], ['心性', .3], ['魅力', .2]],
};

function numeric(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function stateFactors(kind: JudgementKind, saveData: any) {
  const innate = saveData?.角色?.身份?.先天六司 || {};
  const acquired = saveData?.角色?.身份?.后天六司 || {};
  const weighted = STAT_WEIGHTS[kind].reduce((sum, [key, weight]) => sum + (numeric(innate[key]) + numeric(acquired[key])) * weight, 0);
  const factors: any[] = [{ label: '六司', value: Math.round(weighted), source: 'attribute' }];
  const hp = saveData?.角色?.属性?.气血;
  if (numeric(hp?.上限) > 0 && numeric(hp?.当前) / numeric(hp?.上限) < .25) factors.push({ label: '重伤', value: -15, source: 'condition' });
  return factors;
}

const SKILL_KIND_HINTS: Record<JudgementKind, RegExp> = {
  combat: /刀|剑|拳|掌|枪|矛|弓|战|攻|杀|破甲|护体|真气|劲/,
  cultivate: /功法|内功|心法|修炼|真气|灵气|疗伤|调息|双修|生机|经脉/,
  craft: /炼丹|炼器|制符|布阵|锻造|药|丹|器|阵|符/,
  explore: /探查|探索|感应|追踪|辨识|寻路|侦察|生死气息/,
  social: /口才|交涉|说服|威慑|魅惑|礼法|辩/,
  escape: /身法|轻功|遁|逃|步法|疾行/,
  stealth: /潜行|隐匿|敛息|藏形|暗杀/,
  scheme: /谋略|计策|筹算|布局|权谋/,
};
const UNAVAILABLE_SKILL = /未传授|并未传授|尚未传授|未学会|尚未掌握|不会施展|不能使用|不可使用/;

function masteredSkillEntries(saveData: any): Array<{ name: string; mastery: number }> {
  const raw = saveData?.角色?.技能?.掌握技能;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: any) => {
    if (typeof entry === 'string' && entry.trim()) return [{ name: entry.trim(), mastery: 0 }];
    const name = typeof entry?.技能名称 === 'string' ? entry.技能名称.trim() : '';
    return name ? [{ name, mastery: Math.max(0, Math.min(100, numeric(entry?.熟练度))) }] : [];
  });
}

/** 只消费“运行时正典存在 + 存档已掌握 + 本轮显式点名 + 语义适配”的技能，拒绝模型临场自报。 */
function scenarioSkillFactors(kind: JudgementKind, actionText: string, saveData: any) {
  const canonSkills = saveData?.世界?.状态?.剧本模组?.canon?.skills;
  if (!Array.isArray(canonSkills)) return [];
  const mastered = new Map(masteredSkillEntries(saveData).map(entry => [entry.name, entry.mastery]));
  const candidates = canonSkills.flatMap((skill: any) => {
    const name = typeof skill?.name === 'string' ? skill.name.trim() : '';
    const description = [
      skill?.description,
      skill?.type,
      ...(Array.isArray(skill?.effects) ? skill.effects : []),
    ].filter((value): value is string => typeof value === 'string').join('；');
    if (
      name.length < 2
      || !actionText.includes(name)
      || !mastered.has(name)
      || UNAVAILABLE_SKILL.test(description)
      || !SKILL_KIND_HINTS[kind].test(`${name}；${description}`)
    ) return [];
    const mastery = mastered.get(name) || 0;
    return [{ label: `正典技能·${name}`, value: Math.min(12, 6 + Math.floor(mastery / 20)), source: 'skill' as const }];
  });
  return candidates.sort((a, b) => b.value - a.value).slice(0, 1);
}

/** 天赋只在玩家本轮点名且语义匹配时提供小幅情境因子；不直接改面板数值。 */
function explicitTalentFactors(kind: JudgementKind, actionText: string, saveData: any) {
  const raw = saveData?.角色?.身份?.天赋;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: any) => {
    const name = typeof entry === 'string' ? entry.trim() : String(entry?.name || entry?.名称 || '').trim();
    const description = typeof entry === 'object'
      ? String(entry?.description || entry?.描述 || entry?.effect || entry?.效果 || '')
      : '';
    if (name.length < 2 || !actionText.includes(name) || !SKILL_KIND_HINTS[kind].test(`${name}；${description}`)) return [];
    return [{ label: `天赋·${name}`, value: 4, source: 'talent' as const }];
  }).slice(0, 1);
}

function difficultyFor(kind: JudgementKind): CreateJudgementProposalInput['difficulty'] {
  if (['combat', 'escape', 'stealth'].includes(kind)) return { band: 'hard', value: 20 };
  if (['cultivate', 'craft'].includes(kind)) return { band: 'severe', value: 25 };
  return { band: 'normal', value: 15 };
}

/** Conservative local classifier: uncertainty is left to normal narration, never silently rolled. */
export function buildLocalJudgementPreflight(
  actionText: string,
  saveData: any,
  currentTurn: number,
  storage?: { getItem(key: string): string | null },
): JudgementProposal | null {
  const normalized = actionText.trim();
  const runtime = saveData?.世界?.状态?.剧本模组;
  const profile = getCanonRailProfile(runtime);
  const activeEventId = getNarrativeAnchorEvent(runtime || {})?.id
    || (Array.isArray(runtime?.activeEventIds) ? runtime.activeEventIds[0] : undefined);
  const contract = activeEventId ? getCanonRailContract(profile, activeEventId) : null;
  const worldIntervention = findWorldSimulationIntervention(saveData, normalized);
  if (worldIntervention) {
    const { situation, outcome, branchId, intervention } = worldIntervention;
    const kind = intervention.kind;
    const data = calculateTurnJudgementData(
      saveData?.角色?.身份?.先天六司,
      saveData?.角色?.身份?.后天六司,
      saveData?.角色?.位置,
    );
    return createJudgementProposal({
      actionText: normalized,
      kind,
      target: intervention.characterState.characterId,
      whyNow: `当前局势“${situation.title}”存在一次会改变默认枢纽结果的介入窗口。判定成功后仍须由玩家确认正式 IF。`,
      difficulty: { band: intervention.difficulty, value: intervention.difficultyValue },
      factors: [
        ...stateFactors(kind, saveData),
        ...scenarioSkillFactors(kind, normalized, saveData),
        ...explicitTalentFactors(kind, normalized, saveData),
        { label: '幸运', value: data.幸运点, source: 'condition' },
        environmentFactorFor(kind, data),
      ],
      stakes: {
        perfect: '达到替代默认结果的本地门槛，并保留额外余裕；仍须确认 IF。',
        greatSuccess: '达到替代默认结果的本地门槛；仍须确认 IF。',
        success: '达到替代默认结果的本地门槛；仍须确认 IF。',
        partial: '只保住局部目标或争取到时间，不足以确认生还 IF。',
        failure: '行动受阻，默认枢纽结果仍会按世界期限推进。',
        criticalFailure: '行动失败并留下更重余波，默认枢纽结果不被替代。',
      },
      canonPolicy: 'route_process_only',
      sourceEventId: outcome.sourceEventId,
      authorityReceipt: {
        kind: 'world_sim_intervention',
        situationId: situation.id,
        outcomeId: outcome.id,
        sourceEventId: outcome.sourceEventId,
        branchId,
        interventionId: intervention.id,
      },
      createdAtTurn: currentTurn,
    });
  }
  // IF 改写是正典边界，不依赖“战斗/潜入”等普通风险词命中。
  if (runtime?.storyMode !== 'world_sim' && contract && EXPLICIT_IF_INTENT.test(normalized)) {
    return createJudgementProposal({
      actionText: normalized, kind: 'scheme', whyNow: '此行动会改写活动正典拍，默认线必须先进入显式 IF。',
      difficulty: { band: 'extreme', value: 100 }, factors: [],
      stakes: { greatSuccess: '仅 IF 支线可继续裁定。', success: '仅 IF 支线可继续裁定。', partial: '默认线不产生部分成功。', failure: '默认线拒绝执行。' },
      canonPolicy: 'if_only', sourceEventId: contract.eventId, createdAtTurn: currentTurn,
    });
  }
  const matched = RISK_RULES.find(([, matcher]) => matcher.test(normalized));
  if (!matched) return null;
  const [kind] = matched;
  const data = calculateTurnJudgementData(
    saveData?.角色?.身份?.先天六司,
    saveData?.角色?.身份?.后天六司,
    saveData?.角色?.位置,
  );
  const stakes = {
    perfect: '以压倒性优势达成目标，且不留下额外代价。',
    greatSuccess: '大幅推进当前目标，并取得额外收益。',
    success: '按当前做法取得直接进展。',
    partial: '达成部分目标，但会留下代价或余波。',
    failure: '行动受阻，局势可能恶化；可以换做法或先准备。',
    criticalFailure: '局势显著恶化，必须承接更重的余波。',
  };
  const sceneItemFactor = fastNarrativeDemoShortKnifeFactor(saveData, normalized, storage);
  return createJudgementProposal({
    actionText: normalized,
    kind,
    whyNow: '该行动存在可见风险或资源代价，需在叙事前确认。',
    difficulty: difficultyFor(kind),
    factors: [
      ...stateFactors(kind, saveData),
      ...scenarioSkillFactors(kind, normalized, saveData),
      ...explicitTalentFactors(kind, normalized, saveData),
      ...(sceneItemFactor ? [sceneItemFactor] : []),
      { label: '幸运', value: data.幸运点, source: 'condition' },
      environmentFactorFor(kind, data),
    ],
    stakes,
    canonPolicy: runtime?.storyMode !== 'world_sim' && contract ? 'route_process_only' : 'free',
    ...(runtime?.storyMode !== 'world_sim' && contract ? { sourceEventId: contract.eventId } : {}),
    createdAtTurn: currentTurn,
  });
}

export interface EventActionJudgementSelection {
  eventId: string;
  actionId: string;
  actionText: string;
  contractHash: string;
  judgement?: ScenarioEventActionJudgement;
}

function allyFactorsFor(
  actionText: string,
  spec: ScenarioEventActionJudgement,
  saveData: any,
): Array<{ label: string; value: number; source: 'ally' }> {
  const characters = saveData?.世界?.状态?.剧本模组?.canon?.characters;
  return (spec.allyFactors || []).flatMap(factor => {
    const name = Array.isArray(characters)
      ? String(characters.find((item: any) => item?.id === factor.characterId)?.name || '').trim()
      : '';
    if (factor.requireNamed !== false && name && !actionText.includes(name)) return [];
    return [{ label: factor.label, value: Number(factor.value) || 0, source: 'ally' as const }];
  });
}

/** 此前动作回执因子：只认已落账的 success 尝试，布尔计一次（读档/重试不叠加）。 */
function receiptFactorsFor(
  spec: ScenarioEventActionJudgement,
  saveData: any,
): Array<{ label: string; value: number; source: 'condition' }> {
  const states = saveData?.世界?.状态?.剧本模组?.eventActionStates || {};
  return (spec.receiptFactors || []).flatMap(factor => {
    const attempts = states[factor.eventId]?.attempts;
    const settled = Array.isArray(attempts)
      && attempts.some((attempt: any) => attempt?.actionId === factor.actionId && attempt?.outcome === 'success');
    return settled ? [{ label: factor.label, value: Number(factor.value) || 0, source: 'condition' as const }] : [];
  });
}

function eventActionReceiptMatches(
  receipt: JudgementProposal['authorityReceipt'],
  selection: EventActionJudgementSelection,
): boolean {
  return receipt?.kind === 'event_action_judgement'
    && receipt.eventId === selection.eventId
    && receipt.actionId === selection.actionId
    && receipt.contractHash === selection.contractHash;
}

/** 已掷出的合同判定按 id 锁定；取消档不得冒充已结算。 */
export function findResolvedEventActionJudgement(
  saveData: unknown,
  selection: EventActionJudgementSelection,
): JudgementResolution | null {
  if (!selection.judgement) return null;
  const state = getJudgementState(saveData);
  const found = state.recent.find(item => (
    item.status === 'resolved'
    && eventActionReceiptMatches(item.authorityReceipt, selection)
  ));
  return found || null;
}

/**
 * 由事件动作合同签发一次本地判定。不走关键词分类，也不签发 if_only/100。
 */
export function buildEventActionJudgementProposal(
  saveData: any,
  currentTurn: number,
  selection: EventActionJudgementSelection,
): JudgementProposal {
  const spec = selection.judgement;
  if (!spec) throw new Error('事件动作未声明判定合同');
  const normalized = selection.actionText.trim();
  const kind = spec.kind;
  const data = calculateTurnJudgementData(
    saveData?.角色?.身份?.先天六司,
    saveData?.角色?.身份?.后天六司,
    saveData?.角色?.位置,
  );
  const stakes = spec.stakes || {
    perfect: '以压倒性优势达成目标，且不留下额外代价。',
    greatSuccess: '大幅推进当前目标，并取得额外收益。',
    success: '按当前做法取得直接进展。',
    partial: '达成部分目标，但会留下代价或余波。',
    failure: '行动受阻，局势可能恶化；可以换做法或先准备。',
    criticalFailure: '局势显著恶化，必须承接更重的余波。',
  };
  return createJudgementProposal({
    actionText: normalized,
    kind,
    ...(spec.target ? { target: spec.target } : {}),
    whyNow: spec.whyNow || '此行动由事件合同签发一次本地判定。',
    difficulty: { band: spec.difficulty, value: spec.difficultyValue },
    factors: [
      ...stateFactors(kind, saveData),
      ...scenarioSkillFactors(kind, normalized, saveData),
      ...explicitTalentFactors(kind, normalized, saveData),
      ...allyFactorsFor(normalized, spec, saveData),
      ...receiptFactorsFor(spec, saveData),
      { label: '幸运', value: data.幸运点, source: 'condition' },
      environmentFactorFor(kind, data),
    ],
    stakes,
    canonPolicy: 'route_process_only',
    sourceEventId: selection.eventId,
    authorityReceipt: {
      kind: 'event_action_judgement',
      eventId: selection.eventId,
      actionId: selection.actionId,
      contractHash: selection.contractHash,
    },
    applyCultivationRecovery: spec.applyCultivationRecovery === true,
    ...(spec.spiritCost ? { spiritCost: spec.spiritCost } : {}),
    createdAtTurn: currentTurn,
  });
}

export type PreparedEventActionJudgement =
  | { kind: 'none' }
  | { kind: 'issued'; proposal: JudgementProposal }
  | { kind: 'pending'; proposal: JudgementProposal }
  | { kind: 'resolved'; resolution: JudgementResolution };

/**
 * 合同判定优先于普通事件动作的跳过预检：未掷则签发，已掷则锁定回执。
 * 不改 shouldSkipJudgementPreflight 的全局规则。
 */
export function prepareEventActionJudgement(
  saveData: unknown,
  selection: EventActionJudgementSelection | undefined,
  currentTurn: number,
): PreparedEventActionJudgement {
  if (!selection?.judgement) return { kind: 'none' };
  const resolved = findResolvedEventActionJudgement(saveData, selection);
  if (resolved) return { kind: 'resolved', resolution: resolved };
  const state = getJudgementState(saveData);
  if (state.pending && eventActionReceiptMatches(state.pending.authorityReceipt, selection)) {
    return { kind: 'pending', proposal: state.pending };
  }
  const proposal = persistPendingJudgement(
    saveData,
    buildEventActionJudgementProposal(saveData, currentTurn, selection),
  );
  return { kind: 'issued', proposal };
}
