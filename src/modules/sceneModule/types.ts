// 场面模块（通用）的数据类型。合同和状态都是纯 JSON，状态可以直接进存档。
// 模块不自带人头数、拍数、胜负门槛：这些只从每场「本场合同」读取。

export type Side = 'player_side' | 'opposed' | 'neutral' | 'third';

/** 四档判定的档位 id，与游戏判定引擎的 great_success / critical_failure 同名同义；“部分成功”并入失败。 */
export type TierId = 'great_success' | 'success' | 'failure' | 'critical_failure';

export const TIER_LABELS: Record<TierId, string> = {
  great_success: '大成功',
  success: '成功',
  failure: '失败',
  critical_failure: '大失败',
};

// ---------- 条件表达式（胜负、敌方出手时机、红线等都用它） ----------

export type Cond =
  | { kind: 'trackReaches'; party: string; track: string; reach: 'final' | string }
  | { kind: 'statusPresent'; party: string; status: string }
  | { kind: 'partyDowned'; party: string }
  | { kind: 'sideDowned'; side: Side }
  | { kind: 'partyDeparted'; party: string }
  | { kind: 'partyPresent'; party: string }
  | { kind: 'tagActive'; tag: string }
  | { kind: 'beatAtLeast'; beat: number }
  | { kind: 'not'; cond: Cond | Expr };

export type Expr = { all: Array<Cond | Expr> } | { any: Array<Cond | Expr> };

// ---------- 状态定义（接统一状态系统的接口形态） ----------

/** 模块会执行的效果（硬规则）与只透传给统一状态系统的描述性效果。 */
export type StatusEffectSpec =
  | { kind: 'rollModifier'; scope: 'action' | 'defense'; value: number }
  | { kind: 'disadvantage'; scope: 'action' | 'defense' }
  | { kind: 'advantage'; scope: 'action' | 'defense' }
  | { kind: 'lockLever'; elements?: string[]; elementKinds?: string[] }
  | { kind: 'downed' }
  | { kind: 'note'; field: 'appearance' | 'memory' | 'attribute' | 'text'; text: string; attr?: string; delta?: number };

export type StatusRemoveRule =
  | { kind: 'scene_end' }
  | { kind: 'time'; minutes: number }
  | { kind: 'item'; ref: string }
  | { kind: 'story'; flag: string }
  | { kind: 'rest' };

export interface StatusDef {
  id: string;
  label: string;
  /** 通用状态 / 本书特有状态。 */
  tier: 'general' | 'book';
  /** 原因类别：药物物品 / 剧情 / 战斗 / 环境。 */
  cause: 'combat' | 'item' | 'story' | 'environment';
  kind: 'debuff' | 'buff';
  /** 来源说明（给人看）。 */
  source?: string;
  effects: StatusEffectSpec[];
  /** 场内持续拍数；null / 缺省＝场内不自动过期。 */
  durationBeats?: number | null;
  /** 场景结束后是否保留：null＝按 remove 规则解除；数字＝保留多少分钟；缺省＝场景结束即消失。 */
  afterScene?: { minutes: number | null };
  remove?: StatusRemoveRule[];
  /** 再次被同类状态命中时升级成哪个状态（同一类的轻→重→倒下）。 */
  upgradesTo?: string;
  /** 仍是临时定义，等总策划的状态目录落地后以目录为准。 */
  provisional?: boolean;
}

export interface ActiveStatus {
  id: string;
  appliedBeat: number;
  /** 场内到期拍（含）；null＝不自动过期。 */
  expiresBeat: number | null;
  severity?: number;
  cause: StatusDef['cause'];
  sourceId: string;
}

// ---------- 合同 ----------

export interface TrackDef {
  id: string;
  kind: 'harm' | 'stance' | 'agenda' | 'resource' | 'progress';
  /** 有序刻度，每格一个标签。 */
  scale: string[];
  owner?: string;
  direction?: 'up' | 'down';
  initial?: number;
}

export interface EndingDef {
  preset?: string;
  finalState: string;
  causedBy?: 'player_side' | 'third_party' | 'self' | 'event';
  /** 过程中玩家的主张最多把这条轨道从起点推几格（累计，不是每次）。0＝推不动。 */
  ceiling?: number;
  previewText?: string;
  clampText?: string;
  permittedMarks?: Array<{ id: string; requires?: { magnitude?: number } | string; text: string }>;
}

/** 参与方的一条轨道：引用全场 tracks[] 里的定义（track），或直接内联定义（id + scale）。 */
export interface PartyTrack {
  track?: string;
  id?: string;
  kind?: TrackDef['kind'];
  scale?: string[];
  owner?: string;
  direction?: 'up' | 'down';
  initial?: number;
  ending?: EndingDef;
}

export interface PartyDef {
  id: string;
  side: Side;
  /** 角色库 id 或字面标签；显示名运行时从角色数据取，模块代码里不写人名。 */
  ref: string;
  /** 恰有一个参与方是玩家本人。 */
  player?: boolean;
  protected?: boolean;
  /** 防御 / 豁免加值与显示名（由合同给，玩家本人的加值另由宿主提供）。 */
  defense?: { bonus?: number; label?: string };
  /** 目标抗性：直接加在玩家对它出手的难度上。 */
  resistance?: number;
  /** 开场是否在场，缺省在场。 */
  absent?: boolean;
  tracks?: PartyTrack[];
}

export interface VerbDef {
  id: string;
  aliases?: string[];
  power: number;
  goalTags?: string[];
  creates?: string;
  cost?: string;
  requires?: string[];
}

export interface ElementDef {
  id: string;
  kind: string;
  label: string;
  aliases?: string[];
  source: string;
  /** 使用者（参与方 id），缺省＝玩家。状态“兵器脱手”之类按它锁定。 */
  owner?: string;
  verbs?: VerbDef[];
  availability?: { fromBeat?: number; untilBeat?: number };
  excludes?: string[];
  /** 可用次数，缺省不限；达到 1 的杠杆就是一次性杠杆。 */
  uses?: number | null;
}

export interface TagDef {
  id: string;
  label: string;
  /** 参与方 id、'scene'、'player_side' 或 'opposed'。 */
  on: string;
  durationBeats: number | null;
  effect?: { cash?: number; defenseBonus?: number; enemyDcBonus?: number; advantage?: boolean; text?: string } | string;
}

export interface GoalDef {
  id: string;
  label?: string;
  text?: string;
  baseDifficulty: number;
  /** 推进的轨道 id（玩家方向的轨道）；缺省＝参与方的第一条轨道。 */
  track?: string;
  /** push＝推敌方轨道；support＝只铺垫（成功时生成 onSuccess.tag）。 */
  type?: 'push' | 'support';
  judgementKind?: string;
  onSuccess?: { tag?: TagDef; tagOn?: 'targets' | 'allies' | 'self' };
}

export interface LockDef {
  id: string;
  matchHints: string[];
  reply: string;
  redirectTo?: string;
}

export interface FixedEventEffect {
  setTrack?: { party?: string; track: string; to: string };
  depart?: string;
  arrive?: string;
  tag?: TagDef;
  status?: { party: string; status: string; severity?: number };
}

export interface FixedEvent {
  id: string;
  atBeat?: number;
  atClose?: boolean;
  onStart?: boolean;
  text?: string;
  effects?: FixedEventEffect[];
}

export type TimeoutRule =
  | { type: 'close'; as: 'timeout' | 'win' | 'lose' }
  | { type: 'continue'; events?: FixedEventEffect[]; text?: string };

export interface ClockDef {
  /** 总拍数。缺省＝不设拍数（打到一方倒下才结束）。 */
  beats?: number;
  onTimeout?: TimeoutRule;
  fixedEvents?: FixedEvent[];
}

export interface StatusApplyRef {
  status: string;
  severity?: number;
  durationBeats?: number | null;
}

export interface EnemyActionDef {
  id: string;
  party: string;
  label: string;
  target:
    | 'player'
    | { party: string }
    | { rotate: string[] }
    | { each: Side };
  attack: { dc: number };
  /** 只用于显示：闪避 / 格挡 / 抵抗……。 */
  defense?: { label?: string };
  onHit: { statuses: StatusApplyRef[]; text?: string };
  /** 没挡住的差距 ≥ margin 时，改挂这组更重的状态。 */
  onCrush?: { margin: number; statuses: StatusApplyRef[]; text?: string };
  onBlocked?: { text?: string };
  schedule?: { fromBeat?: number; untilBeat?: number; onBeats?: number[]; every?: number };
  when?: Cond | Expr;
  /** 允许攻击 protected 的参与方（默认不允许）。 */
  allowProtected?: boolean;
}

export type ConsequenceTarget = 'actor' | 'committed' | { party: string };

export type Consequence =
  | { kind: 'status'; status: string; severity?: number; durationBeats?: number | null }
  | { kind: 'trackShift'; party?: string; track: string; steps: number };

export interface FumbleEntry {
  id: string;
  /** 适用的目标类型 / 杠杆种类；缺省＝任何情形。 */
  when?: { goal?: string; goalType?: 'push' | 'support'; elementKind?: string };
  target: ConsequenceTarget;
  consequence: Consequence;
  text?: string;
}

export interface FixedCost {
  id: string;
  target: string;
  effect?: string;
  statuses?: StatusApplyRef[];
  anchorText?: string;
}

export interface AfterState {
  id: string;
  ref: string;
  requirement: string;
  forbiddenNarration?: string[];
  /** 可选的结构化校验，收束时执行。 */
  check?: Cond | Expr;
}

export interface SettleRule {
  party?: string;
  side?: Side;
  track?: string;
  onlyUnfinished?: boolean;
  to: string;
}

export interface ClosingBranch {
  settle?: SettleRule[];
  fixedCosts?: FixedCost[];
  afterState?: AfterState[];
  rewards?: Array<Record<string, unknown>>;
  flags?: Record<string, string | number | boolean>;
  next?: string | null;
  text?: string;
}

export interface PlayerChoiceCond {
  kind: 'playerChoice';
  choices: Array<{ id: string; label: string; matchHints: string[]; endingId: string; confirmText: string }>;
}

export interface DefeatDef {
  conditions: Array<Cond | Expr | PlayerChoiceCond>;
  outcome?: { type: 'ending'; endingId: string } | { type: 'continue' } | { type: 'tiered' };
  guards?: { warnText?: string; warnPre?: boolean };
}

export interface RedLine {
  party: string;
  track?: string;
  forbiddenFinalState: string;
  forbiddenNarration?: string[];
}

export interface BeatDef {
  id: string;
  title?: string;
  prompt?: string;
  pressure?: number;
  reveal?: string[];
}

export interface SceneSettings {
  tiers?: {
    critSuccessMargin?: number;
    critFailMargin?: number;
    nat20?: { grounded?: 'crit' | 'success' | 'none'; ungrounded?: 'crit' | 'success' | 'none' };
    nat1?: 'stepDown' | 'fumble' | 'off';
    critBonus?: Array<'noExposure' | 'tagPlus1' | 'credit' | 'flourish'>;
    failure?: { edge?: number; spendOneShot?: boolean };
  };
  pricing?: {
    premium?: Record<string, number>;
    leverCap?: number;
    leverMax?: number;
    novelty?: number;
    tagCash?: number;
  };
  attentionCap?: Record<string, { primaryTargets: number; rangeClaim?: boolean }>;
  allowPlayerHarmAllies?: boolean;
  enemyPhase?: { maxRollsPerBeat?: number };
  brief?: { maxChars?: number; digestKeep?: number };
}

export interface Contract {
  meta: {
    id: string;
    version: number;
    scene: { kind: string };
    hook: { eventId?: string; required?: boolean; ambushAfterStall?: number; inputPolicy?: Record<string, unknown> };
  };
  objective: { text: string; previewHint?: string; win: Expr | Cond };
  parties: PartyDef[];
  tracks?: TrackDef[];
  statuses?: StatusDef[];
  clock?: ClockDef;
  beats?: BeatDef[];
  elements?: ElementDef[];
  tags?: TagDef[];
  goals?: GoalDef[];
  locks?: LockDef[];
  enemyActions?: EnemyActionDef[];
  /** 大失败的后果表：按顺序找第一批适用的，用骰面在其中选一条（确定、可复现）。 */
  fumble?: FumbleEntry[];
  closing?: { win?: ClosingBranch; lose?: ClosingBranch; timeout?: ClosingBranch };
  defeat?: DefeatDef;
  redLines?: RedLine[];
  narration?: { fixedTexts?: Record<string, string> | string[]; requiredFacts?: string[]; forbidden?: string[] };
  settings?: SceneSettings;
}

// ---------- 状态 ----------

export interface ActiveTag {
  id: string;
  label: string;
  on: string;
  expiresBeat: number | null;
  effect: { cash?: number; defenseBonus?: number; enemyDcBonus?: number; advantage?: boolean; text?: string };
  /** 谁、哪一拍造成的，便于审计。 */
  sourceId: string;
}

export type SceneOutcomeKind = 'win' | 'lose' | 'timeout';

export interface SceneOutcome {
  kind: SceneOutcomeKind;
  reason: string;
  endingId?: string;
}

export interface AuditEntry {
  beat: number;
  index: number;
  text?: string;
  goal: string;
  magnitude: number;
  face: number;
  total: number;
  difficulty: number;
  margin: number;
  mode: 'normal' | 'advantage' | 'disadvantage';
  tier: TierId;
  baseTier: TierId;
  natTriggered: 'nat20' | 'nat1' | null;
  grounded: boolean;
}

export interface SceneState {
  version: 1;
  contractId: string;
  contractVersion: number;
  status: 'engaged' | 'decided' | 'closed';
  /** 当前是第几拍（从 1 起）。 */
  beat: number;
  seed: number;
  cursors: { action: number; defense: number };
  /** 开发复现用的指定骰面（产品里不写）。 */
  forced?: { action?: Array<number | [number, number]>; defense?: number[] };
  present: Record<string, boolean>;
  departed: string[];
  tracks: Record<string, Record<string, number>>;
  sceneTracks: Record<string, number>;
  statuses: Record<string, ActiveStatus[]>;
  tags: ActiveTag[];
  leverUses: Record<string, number>;
  noveltySeen: string[];
  credits: string[];
  firedEvents: string[];
  flags: Record<string, string | number | boolean>;
  digest: string[];
  digestOlder: number;
  audit: AuditEntry[];
  counters: { actions: number; checks: number; defenseRolls: number };
  outcome?: SceneOutcome;
  closed?: boolean;
}

// ---------- 玩家行动（识别层的输出，经校验后进入结算） ----------

export interface PlanLever {
  element: string;
  verb: string;
  evidence?: string;
}

export interface ActionPlan {
  goal: string;
  magnitude: 1 | 2 | 3;
  scope?: 'single' | 'group' | 'all';
  targets: string[];
  levers: PlanLever[];
  /** 要兑现的已铺好的态势（标签 id）。 */
  cash?: string[];
  text?: string;
}

export interface SceneContext {
  /** 玩家本人的判定加值（宿主用游戏判定引擎的真实因子求和）。 */
  factors: number;
  /** 玩家本人的防御 / 豁免加值，缺省 0。 */
  playerDefense?: number;
  /** 宿主的统一状态目录；有则优先于合同里的临时定义。 */
  catalog?: (id: string) => StatusDef | undefined;
}
