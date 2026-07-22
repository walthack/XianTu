import {
  createJudgementProposal,
  environmentFactorFor,
  type CreateJudgementProposalInput,
  type JudgementKind,
  type JudgementProposal,
} from './judgementEngine';
import { calculateTurnJudgementData } from './judgementRules';
import { getCanonRailContract, getCanonRailProfile } from '@/modules/scenarioMods/canonRail';
import { getNarrativeAnchorEvent } from '@/modules/scenarioMods/runtime';

const RISK_RULES: Array<[JudgementKind, RegExp]> = [
  ['combat', /攻击|出手|偷袭|斩杀|刺杀|搏杀|斗法|交手|战斗|迎战|应战|反击|格挡|挡住|阻击|拦住|制服|擒拿|对决|打晕|击晕|下毒|抢劫|抢夺(?!先机|时间|机会|话语权)|(?:斩|砍|刺|杀|击|射)(?:向|出|了|死|伤|中|退|倒|那|这|他|她|它|敌|贼|妖|守卫|对手)|打(?:向|死|伤|中|退|倒|那|这|他|她|它|敌|贼|妖|守卫|对手)|打了(?:他|她|它|敌人|守卫|对手)|打出(?:一|两|三|数)?(?:拳|掌|招|击)/],
  ['escape', /逃跑|逃走|逃离|逃出去|跑掉|撤退|脱身|突围|甩开|摆脱|冲出包围|避开追兵/],
  ['stealth', /潜入|潜行|隐匿|藏身|敛息|偷窃|偷走|盗取|顺走|暗杀|撬锁|偷听|刺探|窥探|躲过|瞒过守卫|避开守卫/],
  ['craft', /炼丹|炼器|制符|布阵|炼制|锻造|打造|配药|制药|制作(?:丹药|法器|符箓|阵盘)/],
  ['cultivate', /突破|冲击境界|冲关|闭关|修炼|运功|双修|调息|疗伤|疗愈|修复经脉/],
  ['social', /说服|劝说|劝服|游说|劝他|劝她|威胁|交涉|谈判|讨价还价|收服|招揽|请求放行/],
  ['scheme', /欺骗|骗(?:过|他|她|取|到)|撒谎|说谎|伪装|冒充|设局|布局|策反|栽赃|蒙混过关/],
  ['explore', /探索|搜查|搜索|搜寻|探查|调查|侦察|勘察|追踪|查验|检查伤势|翻越|闯入|寻找(?:暗门|机关|线索|入口)/],
];
const EXPLICIT_IF_INTENT = /收服|招揽|结盟|策反|纳入后宫|纳妾|改写命运|救下.*不死|提前杀死/;

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
): JudgementProposal | null {
  const normalized = actionText.trim();
  const runtime = saveData?.世界?.状态?.剧本模组;
  const profile = getCanonRailProfile(runtime);
  const activeEventId = getNarrativeAnchorEvent(runtime || {})?.id
    || (Array.isArray(runtime?.activeEventIds) ? runtime.activeEventIds[0] : undefined);
  const contract = activeEventId ? getCanonRailContract(profile, activeEventId) : null;
  // IF 改写是正典边界，不依赖“战斗/潜入”等普通风险词命中。
  if (contract && EXPLICIT_IF_INTENT.test(normalized)) {
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
  return createJudgementProposal({
    actionText: normalized,
    kind,
    whyNow: '该行动存在可见风险或资源代价，需在叙事前确认。',
    difficulty: difficultyFor(kind),
    factors: [
      ...stateFactors(kind, saveData),
      ...scenarioSkillFactors(kind, normalized, saveData),
      ...explicitTalentFactors(kind, normalized, saveData),
      { label: '幸运', value: data.幸运点, source: 'condition' },
      environmentFactorFor(kind, data),
    ],
    stakes,
    canonPolicy: contract ? 'route_process_only' : 'free',
    ...(contract ? { sourceEventId: contract.eventId } : {}),
    createdAtTurn: currentTurn,
  });
}
