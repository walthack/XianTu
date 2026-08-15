/**
 * 好感阶梯（R3-9 / R3 项 5「好感分阶段化」）——`社交.关系.<NPC>.好感度` 的**单一真值源**。
 *
 * 规格：docs/R3-9-AFFINITY-LADDER-SPEC-2026-08-14.md
 * 用户裁定（2026-08-14）：8 档（保负向分辨率）／不做时间衰减／intimacy deep 阈值 55→60。
 *
 * 立项理由：好感数值一直在用，却没有语义。本模块落地前，四处门禁对"高好感从哪开始"
 * 分别给出 55（intimacyProfiles）、30（底线门控）、20（失配检测）、60（UI 上色）四个答案。
 * 此后**任何好感门禁都必须引用本模块，不得再自带魔数**。
 *
 * 边界：本模块只做"好感值 → 档位／姿态"的纯投影。它不改变人物是谁——
 * 角色画像、阶段人格、动机锚、知识门禁、正典边界都不在此处，也不可被好感改写。
 */

export type AffinityTierId =
  | 'nemesis' | 'hostile' | 'wary' | 'stranger'
  | 'acquainted' | 'trusted' | 'close' | 'sworn';

/** 三档姿态：表现层（R3-9）消费的粒度。LLM 只看姿态，不看八档。 */
export type AffinityStance = 'low' | 'mid' | 'high';

export interface AffinityTier {
  id: AffinityTierId;
  /** 档位名，直接用于 UI 与 prompt。 */
  name: string;
  min: number;
  max: number;
  stance: AffinityStance;
  /** 一句话语义，供 prompt 与 UI 提示复用。 */
  gist: string;
}

/** 八档阶梯。区间连续且不重叠，覆盖 [-100, 100]。 */
export const AFFINITY_TIERS: readonly AffinityTier[] = [
  { id: 'nemesis',    name: '仇雠', min: -100, max: -60, stance: 'low',  gist: '已认定必须除掉你' },
  { id: 'hostile',    name: '敌意', min: -59,  max: -25, stance: 'low',  gist: '视你为对手，可谈但每句都在算计' },
  { id: 'wary',       name: '戒备', min: -24,  max: -10, stance: 'low',  gist: '不信任，保持距离' },
  { id: 'stranger',   name: '陌路', min: -9,   max: 19,  stance: 'mid',  gist: '无所谓，按公事公办' },
  { id: 'acquainted', name: '相识', min: 20,   max: 39,  stance: 'mid',  gist: '认得你，愿意搭话' },
  { id: 'trusted',    name: '信重', min: 40,   max: 59,  stance: 'high', gist: '把你算进自己的盘子里' },
  { id: 'close',      name: '亲厚', min: 60,   max: 79,  stance: 'high', gist: '关系本身有分量' },
  { id: 'sworn',      name: '生死', min: 80,   max: 100, stance: 'high', gist: '你在其底线之内' },
] as const;

/** 姿态边界：low ≤ -10 ＜ mid ＜ 40 ≤ high。与上表 stance 列一致。 */
export const STANCE_LOW_MAX = -10;
export const STANCE_HIGH_MIN = 40;

/**
 * 阈值锚点：供其它门禁引用，**不要在别处重新写数字**。
 * - `intimacyShallow/Deep/Bonded`：亲密档案揭示层级（deep 由 55 迁到 60，对齐亲厚入口）。
 * - `bottomLineReveal`：人格底线是否喂给 LLM（由 30 迁到 40，"把你算进盘子"才透底线）。
 */
export const AFFINITY_THRESHOLDS = {
  intimacyShallow: 20,
  intimacyDeep: 60,
  intimacyBonded: 80,
  bottomLineReveal: 40,
} as const;

/**
 * 关系标签失配判据（storyContext 的确定性检出用）。
 *
 * 规格 §3.6 原写"改用姿态档"，但实测姿态粒度不够：姿态高的门槛是 40，
 * 敌对标签配好感 25 就不会被检出，比现有 `>=20` 更松。故此处按**档位**表达——
 * 敌对类标签的合法域是"相识档之下"（§4.2），等价于现有判据，语义化而不改行为。
 *
 * 亲密侧 §4.2 声明合法域应是 ≥40，但直接收紧会对存量存档产生误报风暴，
 * 故本轮保守沿用 `<=0`；收紧留到 §4 受控词表落地时连同标签迁移一起做。
 */
export const MISMATCH_HOSTILE_ABOVE = 19;
export const MISMATCH_INTIMATE_AT_OR_BELOW = 0;

/** 变化速率上限（§3.4）。底线触犯等确定性降档走引擎通道，不受 perTurn 限制。 */
export const AFFINITY_LIMITS = {
  /** LLM 日常互动单回合净变化上限。 */
  perTurn: 15,
  /** 单次重大事件上限。 */
  majorEvent: 40,
  /** 触犯人格底线的降幅下沿（唯一可超 majorEvent 的情形）。 */
  bottomLineBreach: 60,
} as const;

/**
 * 共历事件的好感增量（R3-9 §7 的"正典锚点"一类）。
 *
 * 立项理由：此前好感**怎么变**几乎全靠 LLM 自由裁量——门禁只管"不超过 ±15"，
 * 不管"该不该加、加多少"。于是陪人闯过生死关可能 +5、寒暄两句可能 +12，
 * 前面所有档位／姿态／上限都建立在一个随机游走的数值上，玩家感受不到因果。
 *
 * 这里给出**确定性锚点**：一起经历过的事，关系就该有变化，且变化可预期。
 * 数值是初值，按实玩手感调整——机制有没有是结构问题，涨多快是数值问题。
 */
export const AFFINITY_EVENT_GRANT = {
  /** 承重剧情事件（critical）。 */
  critical: 8,
  /** 普通事件。 */
  normal: 3,
} as const;

/** 滞回参数：跨档需越过阈值这么多点，且新档维持这么多游戏日。 */
const HYSTERESIS_MARGIN = 3;
const HYSTERESIS_DAYS = 1;

export const AFFINITY_MIN = -100;
export const AFFINITY_MAX = 100;

export function clampAffinity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(AFFINITY_MAX, Math.max(AFFINITY_MIN, Math.round(value)));
}

/** 好感值 → 档位。越界值先钳制，永不返回 undefined。 */
export function tierOf(favorability: number): AffinityTier {
  const fav = clampAffinity(favorability);
  return AFFINITY_TIERS.find(tier => fav >= tier.min && fav <= tier.max) ?? AFFINITY_TIERS[3];
}

/** 好感值 → 姿态（无滞回的瞬时投影）。需要稳定姿态时用 `projectStance`。 */
export function stanceOf(favorability: number): AffinityStance {
  const fav = clampAffinity(favorability);
  if (fav <= STANCE_LOW_MAX) return 'low';
  if (fav >= STANCE_HIGH_MIN) return 'high';
  return 'mid';
}

/** 可存档的姿态状态。`pending` 记录"正在等待坐实"的目标档。 */
export interface StanceState {
  stance: AffinityStance;
  pending?: { stance: AffinityStance; sinceDay: number };
}

/**
 * 切换到 target 所需的好感门槛是否已越过 —— 带 HYSTERESIS_MARGIN 缓冲。
 * 缓冲让升档与降档的触发线错开，好感在边界附近抖动时不会来回翻档。
 */
function crossedWithMargin(fav: number, from: AffinityStance, to: AffinityStance): boolean {
  if (to === 'high') return fav >= STANCE_HIGH_MIN + HYSTERESIS_MARGIN;
  if (to === 'low') return fav <= STANCE_LOW_MAX - HYSTERESIS_MARGIN;
  // to === 'mid'：从两侧回落／回升到中档，各自离开原档至少 MARGIN。
  if (from === 'high') return fav <= STANCE_HIGH_MIN - 1 - HYSTERESIS_MARGIN;
  return fav >= STANCE_LOW_MAX + 1 + HYSTERESIS_MARGIN;
}

/**
 * 游戏日序号——滞回的"维持 ≥1 个游戏日"需要一个单调递增的日数。
 * 历法取自 `gameStateStore` 的进位规则：30 日/月、12 月/年。
 */
export function gameDayOf(time: { 年?: unknown; 月?: unknown; 日?: unknown } | undefined): number {
  const year = Number(time?.年) || 0;
  const month = Number(time?.月) || 1;
  const day = Number(time?.日) || 1;
  return year * 360 + (month - 1) * 30 + day;
}

/**
 * 带滞回的姿态投影。
 *
 * 路线图 R3-9 G1 要求"避免好感增减 1 点造成角色瞬间翻脸"，故跨档需同时满足
 * ①越过阈值 ≥3 点 ②新档位维持 ≥1 游戏日。任一不满足则保持原姿态。
 *
 * 已接线（2026-08-15）：`runtime.stanceStates` 持久化并跨关继承，由
 * `advanceScenarioRuntime` 每回合调用本函数推进，`storyContext` 只读取结果。
 * 写入权仍不在 prompt 构建层——那一侧只消费，不计算。
 *
 * 纯函数：不修改入参，返回新状态由调用方落存档。
 */
export function projectStance(
  favorability: number,
  previous: StanceState | undefined,
  currentDay: number,
): StanceState {
  const fav = clampAffinity(favorability);
  const raw = stanceOf(fav);
  if (!previous) return { stance: raw };

  const held = previous.stance;
  // 已回到当前档，或缓冲区内的抖动 → 撤销 pending，姿态不动。
  if (raw === held || !crossedWithMargin(fav, held, raw)) return { stance: held };

  const pending = previous.pending;
  if (!pending || pending.stance !== raw) {
    // 首次达标：起算维持期，本轮仍用旧姿态。
    return { stance: held, pending: { stance: raw, sinceDay: currentDay } };
  }
  if (currentDay - pending.sinceDay >= HYSTERESIS_DAYS) return { stance: raw };
  return { stance: held, pending };
}

const AFFINITY_COMMAND_KEY_RE = /^社交\.关系\.([^.]+)\.好感度$/;

export interface AffinityGateDecision {
  /** 放行后的命令；`null` 表示丢弃。 */
  command: Record<string, unknown> | null;
  /** 需要记录的告警；无告警时省略。 */
  warning?: string;
}

/**
 * 好感度写入权门禁（§7 混合裁定）——**每回合建一个**，budget 随实例生命周期。
 *
 * · `set` 一律拒绝：好感的绝对值写入权归引擎（关卡初始化、确定性降档），
 *   模型只能提出增量，不能直接把人推到任意档位。
 * · `add` 受单回合净变化上限约束，且**按 NPC 跨命令累计**——只钳单条的话，
 *   模型拆成三条 +15 就绕过去了。
 *
 * 只作用于 LLM 命令通道；引擎自身不经过此门。
 */
export interface AffinityGateContext {
  /** 取该 NPC 当前的好感与关系标签，用于执行上限（见 affinityCaps）。缺省则不执行上限。 */
  lookup?: (npcName: string) => { favorability: number; relationLabel?: string } | undefined;
  /** 上限查询。注入而非直接 import，避免 affinityLadder 反向依赖 affinityCaps。 */
  capOf?: (npcName: string, relationLabel?: string) => { cap: number; reason: string } | null;
}

export function createAffinityCommandGate(context: AffinityGateContext = {}) {
  const budget = new Map<string, number>();
  return function gate(command: unknown): AffinityGateDecision {
    if (!command || typeof command !== 'object' || Array.isArray(command)) return { command: command as null };
    const cmd = command as Record<string, unknown>;
    const key = typeof cmd.key === 'string' ? cmd.key : '';
    const matched = AFFINITY_COMMAND_KEY_RE.exec(key);
    if (!matched) return { command: cmd };

    // 白名单：只有 add 放行，其余动作一律拒绝。
    // 曾用黑名单（只拒 set）——被独立二审攻破：`delete 社交.关系.<NPC>.好感度` 会走
    // executor 的 `unset`，字段消失后又被 dataRepair 补回 0，等价于一次无上限的归零；
    // 配合同回合 add 可以从 80 跳到 15（净 -65），完全绕过 perTurn。
    if (cmd.action !== 'add') {
      return { command: null, warning: `拒绝模型对好感度执行 ${String(cmd.action)}（只允许 add，写入权归引擎）：${key}` };
    }

    const delta = Number(cmd.value);
    if (!Number.isFinite(delta)) return { command: cmd };

    const npc = matched[1];
    const used = budget.get(npc) ?? 0;
    const limit = AFFINITY_LIMITS.perTurn;
    let allowed = Math.max(-limit, Math.min(limit, used + delta)) - used;

    // 好感上限（affinityCaps）：在**命令层**削掉超出部分，而不是让数值涨上去、再在
    // 表现层假装不亲近——那样存档与叙事会脱节，玩家看到的数字和人物态度对不上。
    // 只削正向增量：cap 不阻止关系恶化。
    let capNote = '';
    if (allowed > 0 && context.lookup && context.capOf) {
      const current = context.lookup(npc);
      const capEntry = current ? context.capOf(npc, current.relationLabel) : null;
      if (capEntry && current) {
        const room = capEntry.cap - current.favorability;
        if (room <= 0) {
          return { command: null, warning: `好感已达上限 ${capEntry.cap}（${capEntry.reason}），丢弃：${key} +${delta}` };
        }
        if (allowed > room) {
          capNote = `，触及上限 ${capEntry.cap}`;
          allowed = room;
        }
      }
    }

    if (allowed === 0) {
      return { command: null, warning: `好感度单回合额度已用尽，丢弃：${key} ${delta > 0 ? '+' : ''}${delta}` };
    }
    budget.set(npc, used + allowed);
    if (allowed === delta) return { command: cmd };
    if (capNote) {
      return {
        command: { ...cmd, value: allowed },
        warning: `好感度钳制 ${delta} → ${allowed}（${key}${capNote}）`,
      };
    }
    return {
      command: { ...cmd, value: allowed },
      warning: `好感度单回合净变化钳制 ${delta} → ${allowed}（${key}，本回合已用 ${used}）`,
    };
  };
}

const STANCE_LABEL: Record<AffinityStance, string> = {
  low: '疏离／敌对',
  mid: '常态',
  high: '亲近',
};

export function stanceLabel(stance: AffinityStance): string {
  return STANCE_LABEL[stance];
}
