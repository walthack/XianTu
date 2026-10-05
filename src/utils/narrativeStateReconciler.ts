import { splitRecordPath, npcRecordPath, resolveRelationshipId, backfillRelationshipIds, normalizeNpcRecordPath } from '@/modules/scenarioMods/ledger/affinityIdentity';
import { get, set, cloneDeep } from 'lodash';
import type { SaveData, StateChange, StatusEffect } from '@/types/game';

/**
 * 叙事-数据同步兜底（位置 + 跨轮即兴目标 + 少量队伍状态）。
 *
 * 背景：LLM 常在正文里明确让全队抵达新地点、并已用命令更新了多名同队 NPC 的
 * `社交.关系.<NPC>.当前位置`，却漏发 `set 角色.位置`，导致玩家位置停在旧场景。
 * 位置字段早已在第2步自检清单里（却仍会漏），说明光靠提示词到不了 100%，需要一层
 * 确定性兜底。
 *
 * 设计原则：宁可漏一点，绝不误移动。只在“高置信度移动”时补：
 *  - 本轮命令把 ≥2 名 NPC 的当前位置写到了同一个新地点；
 *  - 正文含明确的移动完成词；
 *  - 本轮未写 `角色.位置`；
 *  - 且能从已落账的 NPC 当前位置里拿到带坐标的完整位置对象（避免造假坐标，也避免
 *    只换描述留下旧坐标造成地图错位——拿不到坐标就只记 diagnostic，不补）。
 */

interface ReconcileCommand {
  action: string;
  key: string;
  value?: unknown;
}

export interface NarrativeReconcileInput {
  saveDataBefore: SaveData;
  saveData: SaveData;
  text: string;
  commands: ReconcileCommand[];
  userAction?: string;
  /** 变更日志摘要器（可选，默认原样）。由调用方注入 class 的 _summarizeValueForChangeLog。 */
  summarize?: (key: string, value: unknown, action: string) => unknown;
}

interface LocationObject {
  描述: string;
  x?: number;
  y?: number;
  灵气浓度?: number;
  regionId?: string;
  buildingId?: string;
}

// 移动完成词：明确“已经到了”，不含“准备去/打算去”等未完成意图
const MOVE_COMPLETION_RE = /抵达|登岸|上岸|靠岸|入城|进城|来到|回到|赶到|住进|入住|踏入|落脚/;

// 仅匹配整块位置对象的命令：社交.关系.<NPC>.当前位置（NPC 名不含点）
const NPC_LOCATION_KEY_RE = /^社交\.关系\.([^.]+)\.当前位置$/;
const IMPROV_GOALS_KEY = '系统.扩展.任务追踪.即兴目标';
const MAX_IMPROV_GOALS = 3;
const PLAYER_EFFECTS_KEY = '角色.效果';
const DEATH_ROOT_EFFECT_NAMES = new Set(['生死根·死气积聚', '生死根·杂质伤脉']);

interface ImprovisedGoal {
  标题: string;
}

interface PartyStatusRule {
  npc: string;
  build: (text: string) => string;
}

const LOCAL_HOUSEKEEPING_RE = /清点|休息片刻|稍作休息|包扎|喝水|查看背包|整理背包|询问一句/;
const NEGATED_PURSUIT_RE = /(?:暂不|先不|不再|放弃|搁置|无需).{0,10}(?:追查|查清|寻找|护送|安置|撤离|北上)/;
const EMPTY_STATUS_RE = /^(?:未记录|未知|无|暂无)?$/;
const CLAUSE_NEGATION_RE = /(?:未|尚未|并未|没有|不曾|并无|未能|不能|无法)/;
const CLAUSE_FACT_NEGATION_RE = /(?:未|尚未|并未|没有|不曾|并无|未能)/;

function affirmedClause(text: string, npc: string, signal: RegExp, negation = CLAUSE_NEGATION_RE): string {
  const clauses = String(text || '').split(/[。！？；;，,\n]/).map(clause => clause.trim()).filter(Boolean);
  return clauses.find(clause => clause.includes(npc) && signal.test(clause) && !negation.test(clause)) || '';
}

function affirmedSentence(text: string, npc: string, signal: RegExp): string {
  const sentences = String(text || '').split(/[。！？；;\n]/).map(sentence => sentence.trim()).filter(Boolean);
  return sentences.find(sentence => sentence.includes(npc) && signal.test(sentence) && !CLAUSE_NEGATION_RE.test(sentence)) || '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hypnosisTargetStatus(text: string, source: string, target: string): string {
  const sourceName = escapeRegExp(source);
  const targetName = escapeRegExp(target);
  const application = new RegExp(
    `${sourceName}.{0,12}(?:对|向)?${targetName}.{0,12}(?:施展|施放|发动|催动|使出).{0,8}瞑寂` +
    `|${sourceName}.{0,12}(?:施展|施放|发动|催动|使出).{0,8}瞑寂.{0,18}(?:使|令|催眠).{0,6}${targetName}` +
    `|${targetName}.{0,8}(?:中了|身中|受了|被施以|被种下).{0,12}(?:${sourceName}.{0,8})?瞑寂`
  );
  const effect = new RegExp(
    `${targetName}.{0,16}(?:如坠梦中|陷入梦境|受人驱使|受其驱使|神志恍惚|不自知|被催眠)` +
    `|(?:如坠梦中|陷入梦境|受人驱使|受其驱使|神志恍惚|不自知|被催眠).{0,16}${targetName}`
  );
  const sentences = String(text || '').split(/[。！？；;\n]/).map(sentence => sentence.trim()).filter(Boolean);
  return sentences.some(sentence =>
    sentence.includes(source) &&
    sentence.includes(target) &&
    sentence.includes('瞑寂') &&
    application.test(sentence) &&
    effect.test(sentence) &&
    !CLAUSE_NEGATION_RE.test(sentence)
  )
    ? '受瞑寂催眠，如坠梦中并受人驱使'
    : '';
}

function coldPoisonStatus(text: string, npc: string): string {
  const resolved = affirmedClause(text, npc, /(?:寒毒|寒疾).{0,12}(?:化解|祛除|痊愈|洗净)|(?:真阳|纯阳|龙气).{0,12}(?:化解|祛除|洗净).{0,8}(?:寒毒|寒疾)/);
  if (resolved) return '寒毒已化解';
  const suppressed = affirmedClause(text, npc, /(?:寒毒|寒疾).{0,12}(?:压制|缓解|暂稳)|(?:真阳|纯阳).{0,12}(?:压制|缓解).{0,8}(?:寒毒|寒疾)/);
  if (suppressed) return '寒毒已受真阳压制';
  return affirmedClause(text, npc, /(?:寒毒|寒疾).{0,10}(?:发作|侵体|加重)|(?:身体|四肢).{0,8}(?:冰冷|战栗).{0,8}(?:寒毒|寒疾)/)
    ? '寒毒发作，身体冰冷虚弱'
    : '';
}

const PARTY_STATUS_RULES: PartyStatusRule[] = [
  {
    npc: '小紫',
    build: text => {
      const heart = affirmedClause(
        text,
        '小紫',
        /归海之心.{0,12}(?:温养|护住|稳住|渗入).{0,8}(?:小紫(?:的)?|她的|其)(?:神魂|魂魄)|小紫(?:的)?(?:神魂|魂魄).{0,12}(?:受|被|得到|由).{0,6}归海之心.{0,8}(?:温养|护住|稳住)/
      );
      const relieved = affirmedClause(text, '小紫', /小紫(?:的)?离魂症.{0,10}(?:缓解|好转|压制|稳定)|离魂症.{0,10}(?:缓解|好转|压制|稳定).{0,8}(?:小紫|她)/);
      if (heart || relieved) return heart && relieved ? '归海之心正温养神魂，离魂症已有缓解' : heart ? '归海之心正温养神魂' : '离魂症已有缓解';
      if (affirmedClause(text, '小紫', /(?:闭关|入定).{0,10}(?:晋级|突破|冲击).{0,6}五级|(?:晋级|突破|冲击).{0,6}五级.{0,10}(?:闭关|入定)/)) return '正在闭关冲击五级';
      return affirmedClause(text, '小紫', /(?:神魂|身体).{0,8}虚弱|虚弱.{0,8}(?:休息|静养)|正在休息/) ? '神魂虚弱，正在休息' : '';
    },
  },
  {
    npc: '凝羽',
    build: text => {
      if (affirmedClause(text, '凝羽', /(?:冰蛊|毒瘾).{0,10}(?:解除|根治|祛除)|殇侯.{0,10}(?:解除|根治).{0,8}(?:冰蛊|毒瘾)/)) return '冰蛊毒性已解除';
      return affirmedClause(text, '凝羽', /(?:冰蛊|毒瘾).{0,10}(?:发作|复发)|(?:毒性|寒意).{0,8}(?:发作|侵体)/)
        ? '冰蛊毒性发作，需以真阳压制'
        : '';
    },
  },
  { npc: '月霜', build: text => coldPoisonStatus(text, '月霜') },
  { npc: '云如瑶', build: text => coldPoisonStatus(text, '云如瑶') },
  {
    npc: '赵飞燕',
    build: text => affirmedClause(text, '赵飞燕', /中毒.{0,8}(?:昏迷|不醒)|(?:昏迷|不醒).{0,8}中毒/)
      ? '中毒昏迷，正在救治'
      : '',
  },
  {
    npc: '剑玉姬',
    build: text => affirmedClause(text, '剑玉姬', /(?:受伤|受创|见血|伤口).{0,12}(?:反噬|异动|失控)|(?:反噬|异动).{0,12}(?:伤势|体质)/)
      ? '受创引发易碎体质反噬'
      : '',
  },
  {
    npc: '友通期',
    build: text => affirmedClause(
      text,
      '友通期',
      /(?:失魂|神智尽失|不言不笑).{0,12}(?:瘫痪|不能动|无法动弹)|(?:瘫痪|不能动|无法动弹).{0,12}(?:失魂|神智尽失|不言不笑)/,
      CLAUSE_FACT_NEGATION_RE
    )
      ? '失魂瘫痪，需长期照料'
      : '',
  },
  {
    npc: '齐羽仙',
    build: text => affirmedClause(text, '齐羽仙', /(?:精血|全身精血).{0,10}(?:榨干|耗尽|近乎枯竭)|(?:唇裂血枯|精血枯竭)/)
      ? '精血近乎耗尽，极度虚弱'
      : '',
  },
  {
    npc: '俞子元',
    build: text => affirmedClause(text, '俞子元', /(?:失去|断去|截去).{0,6}(?:一条腿|一腿|左腿|右腿)|(?:断腿|截肢).{0,8}(?:养伤|康复)/)
      ? '失去一腿，正在康复'
      : '',
  },
  {
    npc: '古格尔',
    build: text => {
      const blind = affirmedClause(text, '古格尔', /左眼.{0,8}(?:失明|已盲)|(?:失明|已盲).{0,8}左眼/);
      const burned = affirmedClause(text, '古格尔', /左脸.{0,8}(?:烧毁|焚毁|灼伤)|(?:烈焰|火焰).{0,8}(?:烧毁|焚毁|灼伤).{0,6}左脸/);
      if (blind && burned) return '左脸烧伤，左眼失明';
      return blind ? '左眼失明' : burned ? '左脸遭烈焰烧伤' : '';
    },
  },
  {
    npc: '徐君房',
    build: text => affirmedClause(text, '徐君房', /(?:法宝|阴阳帐).{0,10}(?:被毁|损毁).{0,10}反噬|反噬.{0,10}(?:静修|调养)/)
      ? '法宝损毁反噬，正在静修'
      : '',
  },
  {
    npc: '薛延山',
    build: text => affirmedClause(text, '薛延山', /寒毒.{0,10}(?:濒死|垂危|重伤)|(?:重伤|濒死).{0,10}寒毒/)
      ? '身中寒毒，重伤濒危'
      : coldPoisonStatus(text, '薛延山'),
  },
  {
    npc: '袁天罡',
    build: text => affirmedSentence(
      text,
      '袁天罡',
      /(?:鼻血|鼻中涌血|流鼻血).{0,16}(?:杀意|凶兆|凶险|危险|伏击|示警|预警)|(?:杀意|凶兆|凶险|危险|伏击).{0,16}(?:鼻血|鼻中涌血|流鼻血)/
    )
      ? '鼻血示警，预知自身正有凶险'
      : '',
  },
];

function buildGenericPartyStatus(text: string, npc: string): string {
  const unconscious = affirmedClause(text, npc, /(?:陷入|仍在|一直)?昏迷|不省人事|失去意识/);
  if (unconscious) return '昏迷未醒';

  const severe = affirmedClause(text, npc, /(?:身受|受了?|伤势)?重伤|伤势.{0,6}(?:沉重|严重)/);
  const foundation = affirmedClause(text, npc, /根基.{0,8}(?:受损|受创|损伤)/);
  const stabilized = affirmedClause(text, npc, /(?:服药|用药).{0,8}(?:稍稳|稳定|缓和)|伤势.{0,8}(?:稍稳|稳定|缓和)/);
  if (foundation && stabilized) return '根基受损，服药后伤势稍稳，暂不宜强战';
  if (severe && stabilized) return '身受重伤，服药后伤势稍稳，仍需静养';
  if (foundation) return '根基受损，暂不宜强战';
  if (severe) return '身受重伤，需静养';
  if (stabilized) return '伤势稍稳，仍需静养';

  const spiritWeak = affirmedClause(text, npc, /(?:神魂|魂魄).{0,8}(?:虚弱|不稳|受创)/);
  if (spiritWeak) return '神魂虚弱，正在静养';
  const bodyWeak = affirmedClause(text, npc, /(?:身体|体力|气息).{0,8}(?:虚弱|不支|衰弱)/);
  if (bodyWeak) return '身体虚弱，正在休息';
  return affirmedClause(text, npc, /正在休息|卧床静养|正在静养|休息调养/) ? '正在休息静养' : '';
}

function hasDeathRoot(saveData: SaveData): boolean {
  if (String(get(saveData, '角色.身份.名字') || '').trim() !== '程宗扬') return false;
  const root = get(saveData, '角色.身份.灵根');
  const rootName = typeof root === 'string'
    ? root
    : root && typeof root === 'object'
      ? String((root as { name?: unknown; 名称?: unknown }).name ?? (root as { 名称?: unknown }).名称 ?? '')
      : '';
  if (rootName.includes('生死根')) return true;
  const skills = get(saveData, '角色.技能.掌握技能');
  return Array.isArray(skills) && skills.some(skill =>
    String(skill?.技能名称 ?? skill?.name ?? '').includes('生死根')
  );
}

function playerFactClause(text: string, signal: RegExp): string {
  const clauses = String(text || '').split(/[。！？；;\n]/).map(clause => clause.trim()).filter(Boolean);
  return clauses.find(clause => signal.test(clause) && !CLAUSE_NEGATION_RE.test(clause)) || '';
}

function createDeathRootEffect(saveData: SaveData, name: string, description: string): StatusEffect | null {
  const time = get(saveData, '元数据.时间');
  if (!time || typeof time !== 'object') return null;
  const t = time as Partial<StatusEffect['生成时间']>;
  if (![t.年, t.月, t.日].every(Number.isFinite)) return null;
  return {
    状态名称: name,
    类型: 'debuff',
    生成时间: {
      年: Number(t.年),
      月: Number(t.月),
      日: Number(t.日),
      小时: Number(t.小时) || 0,
      分钟: Number(t.分钟) || 0,
    },
    持续时间分钟: 99999,
    状态描述: description,
    强度: 2,
    来源: '生死根叙事补账',
  };
}

function normalizeGoalTitle(value: unknown): string {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? String((value as { 标题?: unknown }).标题 ?? '')
      : '';
  return raw.replace(/\s+/g, '').replace(/[，。、；！？,.;!?]+$/, '').trim();
}

function readImprovisedGoals(value: unknown): ImprovisedGoal[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const goals: ImprovisedGoal[] = [];
  for (const item of value) {
    const title = normalizeGoalTitle(item);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    goals.push({ 标题: title });
  }
  return goals;
}

function sameGoals(a: ImprovisedGoal[], b: ImprovisedGoal[]): boolean {
  return a.length === b.length && a.every((goal, index) => goal.标题 === b[index]?.标题);
}

function addGoal(goals: ImprovisedGoal[], title: string): void {
  if (goals.length >= MAX_IMPROV_GOALS) return;
  const normalized = normalizeGoalTitle(title);
  if (!normalized || goals.some((goal) => normalizeGoalTitle(goal) === normalized)) return;
  goals.push({ 标题: normalized });
}

function normalizeDesc(desc: unknown): string {
  return typeof desc === 'string'
    ? desc.replace(/\s+/g, '').replace(/[・]/g, '·').trim()
    : '';
}

// 叙事是否把该目的地写出来了：整段命中，或“大区·地点·区域”的末段命中（把移动与目的地绑定）
function narrativeMentionsLocation(text: string, rawDesc: string): boolean {
  const full = normalizeDesc(rawDesc);
  if (!full) return false;
  const t = text.replace(/\s+/g, '');
  if (t.includes(full)) return true;
  const segs = full.split('·').filter(Boolean);
  const last = segs[segs.length - 1];
  return !!last && last.length >= 2 && t.includes(last);
}

function isLocationObjectWithCoords(value: unknown): value is LocationObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.描述 === 'string' &&
    typeof obj.x === 'number' &&
    Number.isFinite(obj.x) &&
    typeof obj.y === 'number' &&
    Number.isFinite(obj.y)
  );
}

/**
 * 位置兜底：当本轮命令把 ≥2 名同队 NPC **真正移动**到同一新地点、正文写出了该地点、
 * 本轮未写玩家位置时，把玩家位置补齐为同一位置对象（整块复制，坐标随之带上）。
 *
 * provenance 严守（宁可漏，绝不误传送）：
 *  - 仅计 `action==='set'` 的整块 `当前位置` 命令；
 *  - 用 saveDataBefore 证明该 NPC 本轮地点确实变了（幂等/失败命令不算移动）；
 *  - 多个"≥2 名"目的地组同时存在 → 歧义，直接拒绝；
 *  - 目的地必须在正文出现（把移动与目的地绑定）；
 *  - 候选 NPC 的落账坐标必须一致，否则跳过。
 */
export function reconcilePlayerLocationFromNarrative(input: NarrativeReconcileInput): StateChange[] {
  const { saveData, saveDataBefore, text, commands } = input;
  const summarize = input.summarize ?? ((_k, v) => v);

  // 本轮已写玩家位置 → 不重复补
  if (commands.some((c) => c.key === '角色.位置' || c.key.startsWith('角色.位置.'))) return [];

  // 必须有移动完成词，否则可能只是 NPC 各自换房间/换镜头，不代表玩家也移动
  if (!MOVE_COMPLETION_RE.test(text)) return [];

  // 收集本轮"真正发生移动"的 NPC：set 整块当前位置，且移动前后地点确实不同
  const movedByDesc = new Map<string, { npcs: Set<string>; rawDesc: string }>();
  for (const cmd of commands) {
    if (cmd.action !== 'set') continue;
    const tokens=splitRecordPath(cmd.key);
    const match=tokens[0]==='社交'&&tokens[1]==='关系'&&tokens.length===4&&tokens[3]==='当前位置' ? [cmd.key,tokens[2]] : null;
    if (!match) continue;
    const rawDesc =
      typeof (cmd.value as { 描述?: unknown } | undefined)?.描述 === 'string'
        ? (cmd.value as { 描述: string }).描述
        : '';
    const desc = normalizeDesc(rawDesc);
    if (!desc) continue;
    const npcName = match[1];
    const prevDesc = normalizeDesc(get(saveDataBefore, ['社交', '关系', npcName, '当前位置', '描述']));
    if (prevDesc === desc) continue; // 没真移动（幂等/失败命令）→ 不计入
    const entry = movedByDesc.get(desc) ?? { npcs: new Set<string>(), rawDesc };
    entry.npcs.add(npcName);
    movedByDesc.set(desc, entry);
  }

  // 候选：≥2 名真正移动到同一地点；多目的地组同时存在则歧义，拒绝
  const candidates = [...movedByDesc.entries()].filter(([, g]) => g.npcs.size >= 2);
  if (candidates.length !== 1) return [];
  const [candidateDesc, group] = candidates[0];

  // 目的地必须在正文出现，把移动与该地点绑定
  if (!narrativeMentionsLocation(text, group.rawDesc)) return [];

  // 玩家已在该地 → 无需补
  if (normalizeDesc(get(saveData, '角色.位置.描述')) === candidateDesc) return [];

  // 取带坐标的完整位置对象，且候选 NPC 间坐标必须一致（避免造假坐标 / 留旧坐标错位）
  let sourceLocation: LocationObject | null = null;
  for (const npcName of group.npcs) {
    const loc = get(saveData, ['社交', '关系', resolveRelationshipId(saveData,npcName)||npcName, '当前位置']);
    if (!isLocationObjectWithCoords(loc) || normalizeDesc(loc.描述) !== candidateDesc) continue;
    if (!sourceLocation) {
      sourceLocation = loc;
    } else if (sourceLocation.x !== loc.x || sourceLocation.y !== loc.y) {
      console.warn(`[AI双向系统] 叙事状态补账: 同队 NPC 对「${candidateDesc}」坐标不一致，跳过（仅诊断）`);
      return [];
    }
  }
  if (!sourceLocation) {
    console.warn(
      `[AI双向系统] 叙事状态补账: 检测到全队移动至「${candidateDesc}」但拿不到带坐标的位置对象，跳过位置补账（仅诊断）`
    );
    return [];
  }

  const oldValue = get(saveData, '角色.位置');
  const newValue = cloneDeep(sourceLocation);
  set(saveData, '角色.位置', newValue);
  console.warn(`[AI双向系统] 叙事状态补账: 玩家位置同步至「${candidateDesc}」（随 ${group.npcs.size} 名真正移动的同队 NPC）`);

  return [
    {
      key: '角色.位置',
      action: 'set',
      oldValue: summarize('角色.位置', oldValue, 'set'),
      newValue: summarize('角色.位置', newValue, 'set'),
    },
  ];
}

/**
 * 即兴目标兜底（高置信度第一层）。
 *
 * 只处理已经在 R2-4/TODO 中冻结的少量“实体 + 强事实/任务动词”组合；复杂的合并、
 * 暂缓和多轮演进仍交给受限的 progress audit。若本轮模型已经维护任务槽，则完全让路，
 * 避免确定性规则覆盖更完整的显式命令。
 */
export function reconcileImprovisedGoalsFromNarrative(input: NarrativeReconcileInput): StateChange[] {
  const { saveData, text, commands } = input;
  const summarize = input.summarize ?? ((_k, v) => v);

  if (commands.some((command) =>
    command.key === IMPROV_GOALS_KEY || command.key.startsWith(`${IMPROV_GOALS_KEY}.`)
  )) return [];

  const oldRaw = get(saveData, IMPROV_GOALS_KEY);
  const persistedGoals = Array.isArray(oldRaw)
    ? oldRaw.map((item) => normalizeGoalTitle(item)).filter(Boolean).map((标题) => ({ 标题 }))
    : [];
  const oldGoals = readImprovisedGoals(oldRaw);
  let nextGoals = oldGoals.map((goal) => ({ ...goal }));
  const compactText = typeof text === 'string' ? text.replace(/\s+/g, '') : '';
  if (!compactText) return [];

  // “救治小紫”只在正文明确写出归海之心已生效 / 离魂症已缓解时结清。
  const xiaoziResolved =
    /归海之心.{0,16}(?:到手|取得|温养|渗入|护住|稳住)/.test(compactText) ||
    /离魂症.{0,12}(?:缓解|好转|压制|稳定)/.test(compactText);
  if (xiaoziResolved) {
    nextGoals = nextGoals.filter((goal) => !/(?:救治|医治|疗救|救醒).{0,6}小紫|小紫.{0,6}(?:离魂症|神魂)/.test(goal.标题));
  }

  const onlyHousekeeping = LOCAL_HOUSEKEEPING_RE.test(compactText) &&
    !/追查|查清|线索|共鸣|撤离|离开|启程|北上|安置|同行|恢复人身/.test(compactText);
  if (!onlyHousekeeping && !NEGATED_PURSUIT_RE.test(compactText)) {
    // 玉牌主人有三个名字（本名碧宛／通称碧姬／鬼王峒蔑称碧奴，见裁定 #11/#141），三者都要能匹配上
    const hasBinuThread = /碧[姬宛奴]玉牌|星月湖船队|龙骥君/.test(compactText) && /追查|查清|线索|共鸣|关联/.test(compactText);
    if (hasBinuThread) {
      addGoal(nextGoals, '查清碧姬玉牌与星月湖船队、龙骥君的关联');
    }

    const hasEvacuation = /撤离|离开|启程|北上|登车|乘车/.test(compactText) &&
      /荒废渔村|安全区域|泊陵鱼氏|黑魔海/.test(compactText);
    if (hasEvacuation) {
      addGoal(nextGoals, '带小紫与归海之心撤离荒废渔村，避开泊陵鱼氏与黑魔海追索');
    }

  }

  if (sameGoals(persistedGoals, nextGoals)) return [];

  set(saveData, IMPROV_GOALS_KEY, nextGoals);
  console.warn(`[AI双向系统] 叙事状态补账: 即兴目标更新为 ${nextGoals.length} 条`);
  return [{
    key: IMPROV_GOALS_KEY,
    action: 'set',
    oldValue: summarize(IMPROV_GOALS_KEY, oldRaw, 'set'),
    newValue: summarize(IMPROV_GOALS_KEY, nextGoals, 'set'),
  }];
}

/**
 * 队伍状态短补丁：角色专属规则与身份无关的通用伤势模板分层处理。
 *
 * 安全边界：
 *  - NPC 必须在本轮开始前已存在于关系表，不创建新关系；
 *  - 当前状态必须为空/未记录，不覆盖任何已有状态；
 *  - 本轮模型已写 NPC 或当前状态时完全让路；
 *  - 只认 NPC 与事实同一分句中的肯定表述；
 *  - 单条状态硬限制 60 字。
 *  - 只写当局存档的 `当前状态`，永不写正典 registry、长期记忆或剧本 flags。
 */
export function reconcilePartyNpcStateFromNarrative(input: NarrativeReconcileInput): StateChange[] {
  const { saveDataBefore, saveData, text, commands } = input;
  const summarize = input.summarize ?? ((_key, value) => value);
  const changes: StateChange[] = [];
  if (!text?.trim()) return changes;

  const relationsBefore = get(saveDataBefore, '社交.关系');
  if (!relationsBefore || typeof relationsBefore !== 'object' || Array.isArray(relationsBefore)) return changes;
  const specialRules = new Map(PARTY_STATUS_RULES.map(rule => [rule.npc, rule]));
  const relationEntries = Object.entries(relationsBefore as Record<string, unknown>);

  // 阮香凝的瞑寂是“施术者专属、状态落在目标身上”的跨角色机制。只有施术者和点名目标
  // 都是本轮前既存关系、正文同时明确施术与中术效果时才补；单纯介绍能力绝不落状态。
  if (Object.prototype.hasOwnProperty.call(relationsBefore, '阮香凝')) {
    for (const [target, relationBefore] of relationEntries) {
      if (
        !target ||
        target === '阮香凝' ||
        !relationBefore ||
        typeof relationBefore !== 'object' ||
        Array.isArray(relationBefore)
      ) continue;
      const relationPath = npcRecordPath(resolveRelationshipId(saveData,target)||target);
      const statusPath = `${relationPath}.当前状态`;
      const relation = get(saveData, relationPath);
      if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
      const oldValue = get(saveData, statusPath);
      if (!EMPTY_STATUS_RE.test(typeof oldValue === 'string' ? oldValue.trim() : oldValue == null ? '' : String(oldValue))) continue;
      if (commands.some(command =>
        normalizeNpcRecordPath(command.key, saveData) === relationPath ||
        normalizeNpcRecordPath(command.key, saveData)?.startsWith(`${relationPath}.`) ||
        relationPath.startsWith(`${normalizeNpcRecordPath(command.key, saveData)}.`)
      )) continue;
      const targetName = String((relationBefore as any).名字 || target);
      const nextValue = hypnosisTargetStatus(text, '阮香凝', targetName).slice(0, 60);
      if (!nextValue) continue;
      set(saveData, statusPath, nextValue);
      console.warn(`[AI双向系统] 叙事状态补账: ${target}当前状态 → ${nextValue}`);
      changes.push({
        key: statusPath,
        action: 'set',
        oldValue: summarize(statusPath, oldValue, 'set'),
        newValue: summarize(statusPath, nextValue, 'set'),
      });
    }
  }

  for (const [npc, relationBefore] of relationEntries) {
    if (!npc || !relationBefore || typeof relationBefore !== 'object' || Array.isArray(relationBefore)) continue;
    const relationPath = npcRecordPath(resolveRelationshipId(saveData,npc)||npc);
    const statusPath = `${relationPath}.当前状态`;
    const relation = get(saveData, relationPath);
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
    const oldValue = get(saveData, statusPath);
    if (!EMPTY_STATUS_RE.test(typeof oldValue === 'string' ? oldValue.trim() : oldValue == null ? '' : String(oldValue))) continue;
    if (commands.some(command =>
      normalizeNpcRecordPath(command.key, saveData) === relationPath ||
      normalizeNpcRecordPath(command.key, saveData)?.startsWith(`${relationPath}.`) ||
      relationPath.startsWith(`${normalizeNpcRecordPath(command.key, saveData)}.`)
    )) continue;
    const npcName = String((relationBefore as any).名字 || npc);
    const nextValue = (specialRules.get(npcName)?.build(text) || buildGenericPartyStatus(text, npcName)).slice(0, 60);
    if (!nextValue) continue;
    set(saveData, statusPath, nextValue);
    console.warn(`[AI双向系统] 叙事状态补账: ${npc}当前状态 → ${nextValue}`);
    changes.push({
      key: statusPath,
      action: 'set',
      oldValue: summarize(statusPath, oldValue, 'set'),
      newValue: summarize(statusPath, nextValue, 'set'),
    });
  }
  return changes;
}

/**
 * 主角专属机制补账：永久能力仍由角色身份/技能保存，这里只维护正文明确发生的动态异常。
 */
export function reconcilePlayerCanonEffectsFromNarrative(input: NarrativeReconcileInput): StateChange[] {
  const { saveData, text, commands } = input;
  const summarize = input.summarize ?? ((_key, value) => value);
  if (!text?.trim() || !hasDeathRoot(saveData)) return [];
  if (commands.some(command =>
    command.key === PLAYER_EFFECTS_KEY || command.key.startsWith(`${PLAYER_EFFECTS_KEY}.`)
  )) return [];

  const oldRaw = get(saveData, PLAYER_EFFECTS_KEY);
  const oldEffects = Array.isArray(oldRaw) ? oldRaw : [];
  const retained = oldEffects.filter(effect => !DEATH_ROOT_EFFECT_NAMES.has(String(effect?.状态名称 || effect?.name || '')));
  let nextEffect: StatusEffect | null = null;

  const residue = playerFactClause(
    text,
    /(?:死气|死气之力).{0,16}(?:已|尽数|全部)?(?:消耗|炼化|耗尽).{0,16}(?:杂质|余滓).{0,10}(?:残留|未清).{0,12}(?:经脉|丹田).{0,10}(?:重创|受损)|(?:杂质|余滓).{0,10}(?:残留|未清).{0,12}(?:经脉|丹田).{0,10}(?:重创|受损)/
  );
  const overloaded = playerFactClause(
    text,
    /(?:生死根.{0,16})?(?:吸纳|吸收|摄取).{0,12}(?:大量|过量)?死气.{0,24}(?:丹田|气旋|经脉).{0,12}(?:膨胀|不稳|失控|胀裂|受损)|死气(?:过重|积聚|淤积).{0,20}(?:丹田|经脉|真气).{0,12}(?:不稳|失控|受损|胀裂)/
  );
  const resolved = playerFactClause(
    text,
    /(?:死气|杂气).{0,12}(?:已|尽数|全部)(?:炼化|消纳|排出|耗尽)|(?:丹田|经脉).{0,10}(?:已经|终于|逐渐)?(?:平复|恢复稳定|恢复如常)/
  );

  if (residue) {
    nextEffect = createDeathRootEffect(saveData, '生死根·杂质伤脉', '死气虽已耗去，残留杂质仍在损伤经脉，需继续调息炼化。');
  } else if (overloaded) {
    nextEffect = createDeathRootEffect(saveData, '生死根·死气积聚', '生死根吸纳死气过量，丹田气旋膨胀不稳，继续强行运功可能伤及经脉。');
  } else if (!resolved) {
    return [];
  }

  const nextEffects = nextEffect ? [...retained, nextEffect] : retained;
  if (
    oldEffects.length === nextEffects.length &&
    oldEffects.every((effect, index) => JSON.stringify(effect) === JSON.stringify(nextEffects[index]))
  ) return [];

  set(saveData, PLAYER_EFFECTS_KEY, nextEffects);
  console.warn(`[AI双向系统] 主角机制补账: 生死根动态状态 → ${nextEffect?.状态名称 || '已解除'}`);
  return [{
    key: PLAYER_EFFECTS_KEY,
    action: 'set',
    oldValue: summarize(PLAYER_EFFECTS_KEY, oldRaw, 'set'),
    newValue: summarize(PLAYER_EFFECTS_KEY, nextEffects, 'set'),
  }];
}

/**
 * 叙事状态兜底入口。位置、即兴目标、NPC 状态与主角专属机制互不覆盖。
 */
export function reconcileNarrativeState(input: NarrativeReconcileInput): StateChange[] {
  backfillRelationshipIds(input.saveData, input.saveData.世界?.状态?.剧本模组?.canon?.characters);
  // Reuse current identities for the pre-turn snapshot, including unnamed local NPCs.
  for (const [key, raw] of Object.entries(input.saveDataBefore.社交?.关系 || {})) {
    if (!raw || typeof raw !== 'object' || (raw as any).角色ID) continue;
    const matches = Object.values(input.saveData.社交?.关系 || {}).filter(v => (v as any)?.原关系键 === key);
    if (matches.length === 1) (raw as any).角色ID = (matches[0] as any).角色ID;
  }
  backfillRelationshipIds(input.saveDataBefore, input.saveDataBefore.世界?.状态?.剧本模组?.canon?.characters);
  return [
    ...reconcilePlayerLocationFromNarrative(input),
    ...reconcileImprovisedGoalsFromNarrative(input),
    ...reconcilePartyNpcStateFromNarrative(input),
    ...reconcilePlayerCanonEffectsFromNarrative(input),
  ];
}
