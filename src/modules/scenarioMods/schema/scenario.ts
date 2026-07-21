export type ScenarioConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes' | 'exists';
export type ScenarioFlagValue = string | number | boolean | null;

export interface ScenarioCondition {
  path: string;
  operator: ScenarioConditionOperator;
  value?: ScenarioFlagValue;
}

export interface ScenarioModOpening {
  text: string;
  playerRole?: string;
  playerCharacterId?: string;
  creationPreset?: ScenarioModCreationPreset;
  locationId?: string;
  featuredCharacterIds?: string[];
}

export interface ScenarioModCreationPresetNamedEntry {
  name: string;
  description: string;
}

export interface ScenarioModCreationPresetSpiritRoot extends ScenarioModCreationPresetNamedEntry {
  tier: string;
  specialEffects?: string[];
}

export interface ScenarioModCreationPresetAttributes {
  rootBone: number;
  spirituality: number;
  comprehension: number;
  fortune: number;
  charm: number;
  temperament: number;
}

export interface ScenarioModCreationPreset {
  characterName: string;
  gender: string;
  race: string;
  age: number;
  talentTier: ScenarioModCreationPresetNamedEntry;
  origin: ScenarioModCreationPresetNamedEntry;
  spiritRoot: ScenarioModCreationPresetSpiritRoot;
  talents: ScenarioModCreationPresetNamedEntry[];
  attributes: ScenarioModCreationPresetAttributes;
  locked?: boolean;
}

export type ScenarioPlayerKnowledgeStatus = 'confirmed' | 'rumor';
export type ScenarioPlayerKnowledgeScope = 'player' | 'public';

/** 玩家认知账本的最小事实；与世界真值、NPC knowledgeFacts 分开存储。 */
export interface ScenarioPlayerKnowledgeFact {
  factId: string;
  subjectId: string;
  predicate: string;
  objectId?: string;
  status: ScenarioPlayerKnowledgeStatus;
  disclosureScope: ScenarioPlayerKnowledgeScope;
  learnedAtTurn: number;
  sourceEventId?: string;
}

export type ScenarioInitialPlayerKnowledgeFact = Omit<ScenarioPlayerKnowledgeFact, 'learnedAtTurn'>;

export interface ScenarioModEvent {
  id: string;
  name: string;
  description: string;
  axisId?: string | null;
  axisMethod?: string;
  axisBeat?: string;
  axisAnchor?: string;
  axisSeq?: number;
  critical?: boolean;
  conditions?: ScenarioCondition[];
  completion?: ScenarioCondition[];
  /** 全部命中本轮正文时可确定性落账；仅用于逐拍高光合同。 */
  completionEvidence?: string[];
  relatedCharacterIds?: string[];
  relatedFactionIds?: string[];
  locationId?: string;
  objective?: string;
  /** 程序层事件时钟；相对“事件首次具备结构条件”的世界回合计时。 */
  timeline?: ScenarioModEventTimeline;
  narrativeVariants?: ScenarioModEventNarrativeVariant[];
  /** 玩家长期缺席时由世界自行结算的事件组；不计作玩家完成。 */
  offscreenResolution?: ScenarioModEventOffscreenResolution;
  /** 当前承重拍的世界演员纵切；数据通用、按事件显式启用。 */
  worldActor?: ScenarioWorldActorContract;
  /** 无机会卡事件的本地完成合同；动作身份与判定结果均由引擎持有。 */
  playerCompletionContract?: ScenarioPlayerCompletionContract;
}

export type ScenarioPlayerCompletionOutcome = 'success' | 'partial' | 'failure';

export interface ScenarioPlayerCompletionContract {
  kind: 'local_condition';
  /** 哪些本地判定结果足以完成该事件；failure 默认只能重试或等待场外截止。 */
  settleOn: Array<Exclude<ScenarioPlayerCompletionOutcome, 'failure'>>;
  actions: Array<{
    id: string;
    label: string;
    actionText: string;
    timeCost: 1;
    /** 全部条件满足为 success，否则按 unmetOutcome 结算；不读取 LLM 正文。 */
    successWhen: ScenarioCondition[];
    unmetOutcome: 'partial' | 'failure';
    outcomeText: {
      success: string;
      partial: string;
      failure: string;
    };
  }>;
}

export type ScenarioModEventTimelineKind = 'canon_anchor' | 'window' | 'emergent';
export type ScenarioModEventKnowledgePolicy = 'immediate' | 'public_report' | 'permission';

export interface ScenarioModEventTimeline {
  kind: ScenarioModEventTimelineKind;
  /** 具备结构条件后至少等待多少世界回合才可成为叙事锚点。 */
  notBeforeTurns: number;
  /** 到达后由本事件的 offscreenResolution 确定性结算；emergent 可省略。 */
  deadlineTurns?: number;
  reveal: {
    /** 事件发生后多少回合成为公共消息；省略表示不会自动公开。 */
    publicAfterTurns?: number;
    /** 玩家何时可把结果当成已知事实。 */
    playerKnowledge: ScenarioModEventKnowledgePolicy;
    /** playerKnowledge=permission 时必须持有的世界演员权限。 */
    permissionKey?: string;
  };
}

export type ScenarioWorldActorCanonPolicy = 'process_only' | 'local_state' | 'divergence_allowed' | 'if_only';
export type ScenarioWorldActorScope = 'world' | 'state' | 'region' | 'faction' | 'local' | 'character';

export interface ScenarioWorldActorPressure {
  id: string;
  scope: ScenarioWorldActorScope;
  summary: string;
  domains?: string[];
  geography?: string[];
  factionIds?: string[];
  intensity: 1 | 2 | 3;
  canonPolicy: ScenarioWorldActorCanonPolicy;
}

export interface ScenarioWorldActorAgenda {
  id: string;
  characterId: string;
  goal: string;
  nextAction: string;
  visibleSignal: string;
  offscreenAction: string;
  forbiddenOutcomes?: string[];
}

export type ScenarioNpcDecisionVisibility = 'public' | 'rumor' | 'hidden';
export type ScenarioNpcDecisionResource = 'influence' | 'wealth' | 'troops' | 'intelligence';
export type ScenarioNpcKnowledgeAccess = 'public' | 'restricted' | 'secret';
export type ScenarioNpcWakeTier = 'local_critical' | 'faction' | 'offscreen_critical' | 'minor' | 'group';

export interface ScenarioNpcKnowledgeFact {
  text: string;
  access: ScenarioNpcKnowledgeAccess;
  evidence: string;
}

export interface ScenarioNpcRelationshipRequirement {
  targetCharacterId: string;
  dimension: string;
  min?: number;
  max?: number;
}

export interface ScenarioNpcRelationshipUtility {
  targetCharacterId: string;
  dimension: string;
  weight: number;
}

export interface ScenarioNpcDecisionStateEffects {
  /** 对行动发起者自身资源的增减；行动成本仍由 costs 单独结算。 */
  resources?: Partial<Record<ScenarioNpcDecisionResource, number>>;
  /** actorId 省略时修改行动发起者；显式 actorId 可表达对方态度变化。 */
  relationships?: Array<{
    actorId?: string;
    targetCharacterId: string;
    deltas: Record<string, number>;
  }>;
  /** actorIds 省略时修改行动发起者；知识只能引用本 core 的 knowledgeFacts。 */
  knowledge?: Array<{
    actorIds?: string[];
    add?: string[];
    remove?: string[];
  }>;
}

export interface ScenarioNpcDecisionAgenda {
  id: string;
  goal: string;
  clock: number;
  escalation: string[];
}

export interface ScenarioNpcMemoryEpisode {
  id: string;
  eventId: string;
  summary: string;
  tags: string[];
  salience: number;
  occurredAtTurn: number;
}

export interface ScenarioNpcDecisionActor {
  characterId: string;
  identity: { factionId: string; office?: string; rank: number };
  personality: Record<string, number>;
  motives: Record<string, number>;
  resources: Record<ScenarioNpcDecisionResource, number>;
  relationships: Record<string, Record<string, number>>;
  knowledge: string[];
  agendas: ScenarioNpcDecisionAgenda[];
  allowedActionIds: string[];
  /** 无配置时兼容旧 core：每轮唤醒；新扩量必须声明分层预算。 */
  wake?: {
    tier: ScenarioNpcWakeTier;
    cadenceTurns?: 2 | 3 | 4 | 5;
    locationIds?: string[];
    factionIds?: string[];
  };
  /** 运行时长期经历；按显著度和时间封顶，正典配置可省略。 */
  memories?: ScenarioNpcMemoryEpisode[];
  /** 运行时字段：行动在持续期内不可被重复裁定；正典配置可省略。 */
  actionCooldowns?: Record<string, number>;
  /** 运行时字段：durationTurns>1 的行动在后续世界行动轮继续推进。 */
  activeAction?: {
    actionId: string;
    remainingTurns: number;
    score: number;
  };
  /** 每个数值字段的正典依据；键为 identity.rank/personality.* 等相对路径。 */
  evidence: Record<string, string>;
}

export interface ScenarioNpcDecisionActionBinding {
  actionId: string;
  actorIds?: string[];
  label: string;
  reason: string;
  knownFacts: string[];
  /** 新合同使用知识条目 id；knownFacts 保留为旧数据兼容层。 */
  knownFactIds?: string[];
  requiresKnowledge?: string[];
  relationshipRequirements?: ScenarioNpcRelationshipRequirement[];
  mustNotInvent: string[];
  visibleSignal: string;
  offscreenAction: string;
  requirements?: Partial<Record<ScenarioNpcDecisionResource, number>>;
  costs?: Partial<Record<ScenarioNpcDecisionResource, number>>;
  effects?: Record<string, number>;
  /** 资源、态度和知识的确定性反馈；不得写全局自由路径。 */
  stateEffects?: ScenarioNpcDecisionStateEffects;
  utility?: {
    urgency?: number;
    factionGoal?: number;
    expectedBenefit?: number;
    failureRisk?: number;
    /** 局势键到效用权重；局势值先按 limits 归一到 -1..1。 */
    situation?: Record<string, number>;
    relationships?: ScenarioNpcRelationshipUtility[];
    /** 长期经历标签到效用权重；按匹配经历的最高显著度归一。 */
    memories?: Array<{ tag: string; weight: number }>;
    /** 当前议程升级阶梯对该行动的权重。 */
    escalation?: number;
  };
  canonTags?: string[];
  visibility: ScenarioNpcDecisionVisibility;
  durationTurns: number;
  /** 同一 domain 中相反 stance 的行动由本地内核确定性解决冲突。 */
  interaction?: {
    domain: string;
    stance: 'advance' | 'defend';
    power?: number;
    counters?: string[];
  };
}

export interface ScenarioNpcDecisionCore {
  /** 角色知识的本地权威词典；actor.knowledge 存其中的 id。 */
  knowledgeFacts?: Record<string, ScenarioNpcKnowledgeFact>;
  situation: {
    whitelist: string[];
    initialValues: Record<string, number>;
    limits?: Record<string, { min: number; max: number }>;
  };
  canonPolicy: {
    invariant: string[];
    forbiddenBefore: string[];
    processFreedom: string[];
  };
  actors: ScenarioNpcDecisionActor[];
  actionBindings: ScenarioNpcDecisionActionBinding[];
  maxVisibleActions: 1 | 2 | 3;
  /** 只约束 LLM 渲染，不参与本地决策和结算。 */
  narrativeGuard?: {
    forbiddenTerms?: string[];
    /** 数据驱动的“主体 + 禁止谓词”近邻门禁，避免把某一关人物硬编码进通用引擎。 */
    forbiddenAssociations?: Array<{
      subjects: string[];
      predicates: string[];
      maxDistance?: number;
      /** 允许角色提出未坐实的怀疑；本句或紧邻下句确认时仍拦截。 */
      allowHypothetical?: boolean;
    }>;
    rejectConcreteQuantities?: boolean;
    /** 允许“某来源声称 + 明示未核实”的数字；它只是传闻，不会写回局势真值。 */
    allowUnverifiedQuantities?: boolean;
  };
}

export interface ScenarioStoryOpportunity {
  id: string;
  title: string;
  characterIds: string[];
  whyNow: string;
  nextStep: string;
  stakes: string;
  rewardPreview: string;
  futureHint: string;
  actionText: string;
  rewardKey: string;
  rewardLabel: string;
  /** 无 trigger 的旧卡在锚点建立时立即出现；新卡由已裁定行动/知识确定性触发。 */
  trigger?: {
    actorIds?: string[];
    actionIds?: string[];
    knowledgeFactIds?: string[];
  };
  /** 未追踪卡在出现后的确定性世界回合寿命；追踪后沿用全局介入上限。 */
  expiresAfterTurns?: number;
  /**
   * 玩家亲历路线的确定性完成合同。每次成功结算的玩家回合最多推进一个 step；
   * 只读取玩家输入，不读取 LLM 正文，因此模型无权把“写到了”冒充“做到了”。
   */
  completionContract?: {
    kind: 'player_action_sequence';
    /** immediate 默认在步骤完成后落账；timeline_deadline 等事件硬截止到达才坐实结果。 */
    settlement?: 'immediate' | 'timeline_deadline';
    /** persistent 用于无截止且不得场外完成的事件，避免唯一引擎完成入口过期后永久卡轴。 */
    expiry?: 'standard' | 'persistent';
    steps: Array<{
      id: string;
      label: string;
      /** 引擎声明的确定性推进动作；文本匹配仅保留为自由输入兼容层。 */
      actions?: Array<{
        id: string;
        label: string;
        actionText: string;
        timeCost: 1;
      }>;
      /** 至少命中一项；未声明时只检查 matchAll。 */
      matchAny?: string[];
      /** 必须全部命中；未声明时只检查 matchAny。 */
      matchAll?: string[];
      /** 任一否定/撤回词命中即不推进该步。 */
      rejectIf?: string[];
    }>;
  };
}

export interface ScenarioWorldActorContract {
  pressure: ScenarioWorldActorPressure;
  /** 旧存档兼容层；配置 decisionCore 时不再参与调度。 */
  agendas?: ScenarioWorldActorAgenda[];
  decisionCore?: ScenarioNpcDecisionCore;
  opportunities: ScenarioStoryOpportunity[];
}

export interface ScenarioModEventOffscreenResolution {
  id: string;
  afterStallTurns: number;
  flagKey: string;
  resolvedEventIds: string[];
  worldDelta: string;
  evidence: string;
}

/** 已发生分歧下的叙事投影；不改完成链，只替换玩家看到/LLM 续写的当前事件表述。 */
export interface ScenarioModEventNarrativeVariant {
  when: ScenarioCondition[];
  /** 明确替代默认正典合同的分歧投影；普通条件化文案不得关闭 Canon Rail。 */
  replacesCanonRail?: boolean;
  name?: string;
  description?: string;
  axisBeat?: string;
  objective?: string;
}

export interface ScenarioModChapter {
  id: string;
  title: string;
  summary: string;
  activation?: ScenarioCondition[];
  completion?: ScenarioCondition[];
  eventIds?: string[];
}

export interface ScenarioModScenario {
  opening: ScenarioModOpening;
  initialFlags?: Record<string, ScenarioFlagValue>;
  /** 仅为有明确证据的纵切显式声明；旧事件不要求批量回填。 */
  initialPlayerKnowledge?: ScenarioInitialPlayerKnowledgeFact[];
  chapters?: ScenarioModChapter[];
  events?: ScenarioModEvent[];
}
