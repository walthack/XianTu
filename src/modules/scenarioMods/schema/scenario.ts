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
export type ScenarioPlayerCompletionOutcome = 'success' | 'partial' | 'failure';

/**
 * 本地事件完成后才可进入叙事层的精确事实回执。
 * 该声明位于 completion contract 之外，避免展示事实增量重置进行中的合同进度；
 * 运行时仍须同时匹配 actionId + outcome 并完成事件，不能仅凭数据存在提前注入。
 */
export interface ScenarioNarrativeFactReceipt {
  id: string;
  actionId: string;
  outcome: ScenarioPlayerCompletionOutcome;
  category: 'loss';
  /** 允许渲染层逐字引用的最小事实，不含句末标点或内部控制语汇。 */
  claim: string;
}

/** 玩家认知账本的最小事实；与世界真值、NPC knowledgeFacts 分开存储。 */
export interface ScenarioPlayerKnowledgeFact {
  factId: string;
  /** 同一命题的 rumor/confirmed 演进键；缺省表示旧版三元组记录。 */
  propositionId?: string;
  subjectId: string;
  predicate: string;
  objectId?: string;
  /** 玩家可直接阅读、prompt 可逐字采用的声明；旧档缺省时不得由 UI 猜写。 */
  claim?: string;
  status: ScenarioPlayerKnowledgeStatus;
  disclosureScope: ScenarioPlayerKnowledgeScope;
  learnedAtTurn: number;
  sourceEventId?: string;
  source?: {
    kind: 'observed' | 'npc_statement' | 'document' | 'public_rumor';
    actorId?: string;
    label: string;
  };
  evidenceFactIds?: string[];
  supersedesFactIds?: string[];
}

export type ScenarioInitialPlayerKnowledgeFact = Omit<ScenarioPlayerKnowledgeFact, 'learnedAtTurn'>;

export interface ScenarioPrivateKnowledgeAssociationGuard {
  subjects: string[];
  predicates: string[];
  maxDistance?: number;
  allowHypothetical?: boolean;
}

/**
 * 角色私有知情的最小声明。它不进入普通关系网，也不直接进入通用状态 prompt；
 * 渲染层只向 holder 定向提供 behaviorCue，玩家已确认同一语义事实后才可提供 claim。
 */
export interface ScenarioInitialNpcPrivateKnowledgeFact {
  factId: string;
  holderCharacterIds: string[];
  subjectId: string;
  predicate: string;
  objectId?: string;
  status: ScenarioPlayerKnowledgeStatus;
  /** 世界真值文本；玩家未获知时不得注入叙事 prompt。 */
  claim: string;
  /** 不含秘密答案的角色行为提示。 */
  behaviorCue: string;
  evidence: string;
  sourceEventId?: string;
  /** 同关事件完成前保持休眠；解锁轮次写入运行时并随跨关继承。 */
  unlockAfterEventId?: string;
  forbiddenAssociations?: ScenarioPrivateKnowledgeAssociationGuard[];
}

export interface ScenarioNpcPrivateKnowledgeFact extends ScenarioInitialNpcPrivateKnowledgeFact {
  learnedAtTurn: number;
  sourceStageId: string;
  unlockedAtTurn?: number;
}

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
  /** 纯展示层覆写；不得放进 playerCompletionContract，以免改变合同哈希和进行中准备态。 */
  presentation?: {
    /** 固定动词按钮的短目标；缺省时由当前人物或事件短名派生。 */
    targetLabel?: string;
    /** 点击确定性按钮后预填的玩家视角自然句；不替代 actionText 判定载荷。 */
    playerLine?: string;
    /**
     * 当前动作完成前不得提前演出的后续高光词；键为当前 actionId。
     * 只用于渲染门禁，不进入 playerCompletionContract 或合同哈希。
     */
    stepGuardTerms?: Record<string, string[]>;
  };
  /** 程序层事件时钟；相对“事件首次具备结构条件”的世界回合计时。 */
  timeline?: ScenarioModEventTimeline;
  /** 玩家是否必须在场；见 `ScenarioPlayerPresence`。省略＝可以不在场。 */
  playerPresence?: ScenarioPlayerPresence;
  /** 场景压力：危险在场且逐轮收紧；见该接口注释。 */
  pressure?: ScenarioModEventPressure;
  /** 玩家走进绝路时本局结束；只用于危险已在场的少数拍，见该接口注释。 */
  fatalOutcomes?: ScenarioModEventFatalOutcomes;
  narrativeVariants?: ScenarioModEventNarrativeVariant[];
  /** 玩家长期缺席时由世界自行结算的事件组；不计作玩家完成。 */
  offscreenResolution?: ScenarioModEventOffscreenResolution;
  /** 当前承重拍的世界演员纵切；数据通用、按事件显式启用。 */
  worldActor?: ScenarioWorldActorContract;
  /** 与本地动作及 outcome 绑定的权威叙事事实；完成前不得进入 prompt。 */
  narrativeFactReceipts?: ScenarioNarrativeFactReceipt[];
  /** 无机会卡事件的本地完成合同；动作身份与判定结果均由引擎持有。 */
  playerCompletionContract?: ScenarioPlayerCompletionContract;
  /** 显式允许 non-critical 事件与主线并列展示；未标记的资料事件保持不可操作。 */
  exploration?: {
    role: 'seed' | 'investigate' | 'position' | 'payoff';
    secondaryRole?: 'seed' | 'investigate' | 'position' | 'payoff';
  };
}

export interface ScenarioPlayerCompletionContract {
  /** objective_action 由玩家点击引擎声明动作即成功；local_condition 还会读取本地状态判定。 */
  kind: 'local_condition' | 'objective_action';
  /** 哪些本地判定结果足以完成该事件；failure 默认只能重试或等待场外截止。 */
  settleOn: Array<Exclude<ScenarioPlayerCompletionOutcome, 'failure'>>;
  actions: Array<{
    id: string;
    label: string;
    actionText: string;
    timeCost: 1;
    /** prepare 只改变本事件的准备态，不直接完成事件；缺省为 attempt。 */
    kind?: 'attempt' | 'prepare';
    /** attempt 仅在所列准备全部完成后可见、可执行。 */
    requiresPreparation?: string[];
    /** prepare 成功时授予的事件内准备标记。 */
    grantsPreparation?: string;
    /** 全部条件满足为 success，否则按 unmetOutcome 结算；不读取 LLM 正文。 */
    successWhen?: ScenarioCondition[];
    unmetOutcome?: 'partial' | 'failure';
    /**
     * 自由输入到本地动作身份的保守匹配。只用于解析当前可用动作；
     * 任一 rejectIf 命中即拒绝，歧义时不返回动作。
     */
    intentMatch?: {
      matchAny?: string[];
      matchAll?: string[];
      rejectIf?: string[];
    };
    outcomeText: {
      success: string;
      partial: string;
      failure: string;
    };
    /** 本地 outcome 的确定性反馈；不得写任意世界路径。 */
    outcomeEffects?: Partial<Record<ScenarioPlayerCompletionOutcome, ScenarioPlayerCompletionEffects>>;
  }>;
}

export interface ScenarioPlayerCompletionEffects {
  /**
   * 由本地事件判定原子结算的物品转移。正文与 tavern_commands 只负责演出，
   * 不再拥有这批物品的发放权。transferId 是跨重试/重载的幂等键。
   */
  inventoryTransfers?: Array<{
    transferId: string;
    itemId: string;
    quantity: number;
  }>;
  relationships?: Array<{
    actorId: string;
    targetCharacterId: string;
    dimension: string;
    delta: number;
  }>;
  npcKnowledge?: Array<{
    actorIds: string[];
    factId: string;
  }>;
  playerKnowledge?: Array<{
    factId: string;
    propositionId?: string;
    subjectId: string;
    predicate: string;
    objectId?: string;
    claim?: string;
    status: ScenarioPlayerKnowledgeStatus;
    disclosureScope: ScenarioPlayerKnowledgeScope;
    source?: ScenarioPlayerKnowledgeFact['source'];
    evidenceFactIds?: string[];
    supersedesFactIds?: string[];
  }>;
  pathReceipts?: Array<Omit<ScenarioPathReceipt, 'selectedAtTurn'>>;
  memories?: Array<{
    actorIds: string[];
    summary: string;
    tags: string[];
    salience: number;
  }>;
}

/** 玩家如何抵达同一正典节点的路径回执；不改变节点发生与否。 */
export interface ScenarioPathReceipt {
  receiptId: string;
  sourceEventId: string;
  choiceId: string;
  mutexGroupId: string;
  dimension: 'position' | 'allegiance' | 'method' | 'participation' | 'route';
  label: string;
  selectedAtTurn: number;
  consumeAtEventIds: string[];
  expiresAfterEventId?: string;
}

export type ScenarioModEventTimelineKind = 'canon_anchor' | 'window' | 'emergent';
export type ScenarioModEventKnowledgePolicy = 'immediate' | 'public_report' | 'permission';
export type ScenarioWorldOmenTransmitterKind = 'related_npc' | 'companion' | 'messenger' | 'environment';

/** 承重事件结算前的剧情内征兆；只负责演出，不参与发生、公开、知情或 IF。 */
export interface ScenarioWorldOmen {
  id: string;
  /** 相对事件资格时钟；无 timeline 时用当前局势 stallTurns。必须早于期限。 */
  afterTurns: number;
  /** 可观察事实；不得写成确定结局。 */
  observableFacts: string[];
  /** 候选传递者；引擎不按关系姿态挑选，也不让人物全知。 */
  transmitters?: Array<{
    kind: ScenarioWorldOmenTransmitterKind;
    characterId?: string;
  }>;
  /** 无人可传时的环境异动。 */
  environmentFallback: string;
  presentation: {
    title: string;
    text: string;
  };
}

/**
 * 主角**自己还不知道**的自身设定。
 *
 * 这些字段（灵根、功法、出身…）建档时就写进 `角色.身份`，随人物面板每轮发给模型——
 * **引擎知道 ≠ 角色知道**。若不显式拦，模型会把它当常识写进正文与行动选项：
 * 制作人 2026-08-20 在 demo 第二拍就看到选项「查看斥候伤势，尝试用**生死根**救治」，
 * 而生死根要到 seq 19「王哲发现其身上有生死根」才被点破。
 *
 * 与「未相识者不得直呼其名」同源：都是**档案里有、玩家还不知道**。
 */
export interface ScenarioUndisclosedSelfFact {
  /** 不得出现的词，如「生死根」。 */
  fact: string;
  /** 这一拍完成之后解禁。 */
  untilEventId: string;
  /** 点破的方式，供叙述在解禁那一拍写出来。 */
  disclosedBy?: string;
}

/**
 * 玩家是否必须在场。
 *
 * 用户 2026-08-20：「我们的 event 是有**强制玩家在场**的 event 和**玩家可以不在场**的 event，
 * 所以这个之后每个案例跑的话，会进一步人工来做区分。」
 *
 * · `required`：这一拍只会在玩家眼前发生。到点不是"场外结算"，而是**当场演完**——
 *   箭照样射出去，但镜头在场，口吻是「你插了手，仗也不停」，不是「你没插上手」。
 * · 省略（默认）：保持既有行为，到点由 `offscreenResolution` 按场外口吻结算。
 *
 * 逐拍人工判定，**不要批量推断**。
 */
export type ScenarioPlayerPresence = 'required';

/**
 * 场景压力：危险已经在场并且正在收紧，但**到点不一定死人**。
 *
 * 与 `fatalOutcomes.deadline` 的区别只在后果：那边到点是本局结束，
 * 这边到点由既有的 `offscreenResolution` 把这一拍按默认结果落定
 * （箭照样射出去，只是玩家没插上手）。逼近的演出方式两者共用一套：
 * 逐轮送一条可观察事实，由正文写出来，**不用 UI 倒计时**（裁定 #155）。
 *
 * 用在「战场、火场、追兵在后」这类拍上；日常拍不配，默认仍是 A 档可无限等待。
 */
export interface ScenarioModEventPressure {
  /** 从本拍激活起算，第几轮开始送第一条逼近。 */
  afterTurns: number;
  /** 逐轮送达的可观察事实。不得预告结局，只写正在发生的事。 */
  approach: string[];
}

/** 本局结束时给叙述的事实骨架。引擎只给事实，正文由叙述写——不写成 UI 提示。 */
export interface ScenarioFatalEnding {
  id: string;
  title: string;
  facts: string[];
}

/**
 * 玩家自己走进的绝路：本局在此结束。
 *
 * ⚠ 这**不是**全局超时惩罚。默认仍是 A 档「节点可无限等待，玩家可以去做别的」；
 * 只有「危险已经在场并且正在逼近」的少数拍才配 `deadline`，压力来自场景本身。
 * 逼近必须靠 `approach` 的可观察事实经正文传达，**不得用 UI 倒计时**（裁定 #155）。
 */
export interface ScenarioModEventFatalOutcomes {
  /** 危险逐轮逼近，第 `turns` 轮被吞没。 */
  deadline?: {
    /** 危险从哪一步完成之后开始逼近；省略则从本拍激活起算。 */
    afterActionId?: string;
    turns: number;
    /** 前 `turns - 1` 轮逐轮送达的可观察事实。不得预告死亡，只写正在发生的事。 */
    approach: string[];
    ending: ScenarioFatalEnding;
  };
  /** 玩家主动选择的绝路；与正常动作并列成按钮，选了即结束。 */
  choices?: Array<{
    id: string;
    label: string;
    actionText: string;
    ending: ScenarioFatalEnding;
  }>;
}

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
    /** 事后通过世界内人物／渠道送达主阅读面；不参与发生、公开或知情判定。 */
    presentation?: {
      title: string;
      text: string;
    };
  };
  /** 结算前一次性征兆；不参与期限、知情或合同哈希。 */
  omen?: ScenarioWorldOmen;
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
      /** 当前步骤被本地合同接受后立即结算；机会卡步骤目前只开放稳定物品转移。 */
      outcomeEffects?: Pick<ScenarioPlayerCompletionEffects, 'inventoryTransfers'>;
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
  /** 玩家在场时的落定文案（`playerPresence: 'required'` 时用）。口吻必须是当场，不是场外。 */
  onSceneDelta?: string;
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

export type ScenarioStoryMode = 'canon_companion' | 'world_sim';

export interface ScenarioWorldSituation {
  id: string;
  title: string;
  summary: string;
  /** 复用既有事件的 NPC core、地点、人物和机会卡；不继承其逐拍完成权。 */
  sourceEventId: string;
  /** 任一条件组成立即表示该局势已经收束；组内为 AND，组间为 OR。 */
  settledWhenAny: ScenarioCondition[][];
  anchorIds?: string[];
  outcomeIds?: string[];
  /** 该局势收束前的一次性征兆；只演出，不改结算谓词。 */
  omen?: ScenarioWorldOmen;
}

export interface ScenarioStructuralAnchor {
  id: string;
  summary: string;
  sourceEventIds: string[];
  satisfiedWhenAny: ScenarioCondition[][];
}

export interface ScenarioWorldIntervention {
  id: string;
  label: string;
  actionText: string;
  kind: 'combat' | 'cultivate';
  difficulty: 'hard' | 'severe' | 'extreme';
  difficultyValue: number;
  matchAny: string[];
  rejectIf?: string[];
  successOutcomes: Array<'success' | 'great_success' | 'perfect'>;
  characterState: { characterId: string; status: 'alive' | 'longrest' | 'incapacitated' };
  worldDelta: string;
  evidence: string;
}

export interface ScenarioForkableOutcome {
  id: string;
  sourceEventId: string;
  defaultResolutionId: string;
  defaultWhen: ScenarioCondition[];
  defaultSummary: string;
  replacementBranches: Array<{
    branchId: string;
    activeWhen: ScenarioCondition[];
    summary: string;
    intervention: ScenarioWorldIntervention;
  }>;
  preserveAnchorIds: string[];
}

export interface ScenarioReferenceBeat {
  id: string;
  sourceEventId: string;
  situationId: string;
  /** 只有默认结果已经由本地引擎坐实时才可投影完整原著拍。 */
  availableWhen: ScenarioCondition[];
  invalidWhen?: ScenarioCondition[];
  summary: string;
}

export interface ScenarioWorldSimulation {
  version: 1;
  situations: ScenarioWorldSituation[];
  structuralAnchors: ScenarioStructuralAnchor[];
  forkableOutcomes: ScenarioForkableOutcome[];
  referenceBeats: ScenarioReferenceBeat[];
}

export interface ScenarioModScenario {
  /** 主角自己还不知道的自身设定；见该接口注释。 */
  undisclosedSelfFacts?: ScenarioUndisclosedSelfFact[];
  opening: ScenarioModOpening;
  initialFlags?: Record<string, ScenarioFlagValue>;
  /** 仅为有明确证据的纵切显式声明；旧事件不要求批量回填。 */
  initialPlayerKnowledge?: ScenarioInitialPlayerKnowledgeFact[];
  /** 仅为有明确知情图谱证据的纵切声明；不要求旧事件批量回填。 */
  initialNpcPrivateKnowledge?: ScenarioInitialNpcPrivateKnowledgeFact[];
  chapters?: ScenarioModChapter[];
  events?: ScenarioModEvent[];
  /** 实验性六朝世界模式合同；存在不等于启用，模式只能由新档初始化显式选择。 */
  worldSimulation?: ScenarioWorldSimulation;
}
