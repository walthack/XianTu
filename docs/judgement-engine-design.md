# 可见行动判定引擎设计

> 状态：设计草案，待独立二审；不改变现有游戏行为。

## 1. 已验证的现状

当前主链为：

`MainGamePanel.sendMessage → AIBidirectionalSystem.processPlayerAction → LLM 正文/命令 → 指令落账与叙事补账 → FormattedText 解析〔判定〕`

- `defaultPrompts.ts`要求 LLM 每轮自行决定是否判定、难度、数值和结果。
- `FormattedText.vue`只从正文中解析 `〔类型:结果,判定值,难度…〕` 后展示，不能验证来源。
- `diceRoller.ts`提供 d20 与最终值工具，但主叙事没有调用它。
- `processPlayerAction`每次都会临时计算幸运点、环境修正并只注入 prompt，不落档；同一行动经重试可能取得不同上下文。
- `FormattedText.vue`还会按正文里的判定值与难度反推并修正展示结果，它也是判定事实链的一部分。
- `actionGate.ts`已经能保存失败/受阻行动的余波，但由 LLM 在结果之后写入，UI 没有专门的可见入口。
- Canon Rail 仅约束承重事件的完成与顺序；普通行动的判定仍由叙事模型自由决定。

因此，当前的“判定”是叙事文本而不是可审计游戏事实。

## 2. 目标与边界

目标：让所有会改变资源、伤势、关系、行动余波或关键事件过程的判定，在结果发生前对玩家可见、可解释、可追溯。

不做：

- 不把普通对话、观察、移动变成掷骰小游戏。
- 不让 LLM 直接决定骰点、难度、成功等级或承重事件是否发生。
- 不让判定引擎替玩家选择行动，也不把 Canon Rail 默认线变成硬拉回。

## 3. 目标链路

```text
玩家行动 / 操作队列
  → 行动预检（无需判定 | 需确认判定 | 明确不可行）
  → 判定卡（风险、依据、代价、替代方案）
  → 玩家执行 / 改变做法 / 撤回
  → 确定性 JudgementEngine 结算并记档
  → 主叙事 LLM 只演出已给定的结果
  → 状态变化、行动余波、Canon Rail reconcile
```

预检不产生结果；它只提出一个 `JudgementProposal`。结果只能由本地引擎写入 `JudgementResolution`。

## 4. 数据契约

所有新增状态放在 `系统.扩展.判定`，旧档缺失时视为空，避免迁移阻断。

```ts
type JudgementKind = 'combat' | 'cultivate' | 'craft' | 'explore' | 'social' | 'escape' | 'stealth' | 'scheme';
type JudgementOutcome = 'critical_failure' | 'failure' | 'partial' | 'success' | 'great_success' | 'perfect';

interface JudgementProposal {
  id: string;
  status: 'pending';
  actionText: string;
  kind: JudgementKind;
  target?: string;
  whyNow: string;                 // 为什么此次行动存在不确定性
  difficulty: { band: 'easy'|'normal'|'hard'|'severe'|'extreme'; value: number };
  factors: Array<{ label: string; value: number; source: 'attribute'|'realm'|'skill'|'item'|'condition'|'environment'|'ally' }>;
  stakes: { success: string; partial: string; failure: string };
  canonPolicy: 'free' | 'route_process_only' | 'if_only';
  sourceEventId?: string;
  createdAtTurn: number;
}

interface JudgementResolution extends JudgementProposal {
  status: 'resolved' | 'cancelled';
  roll?: number;                  // d20 原始值，取消则无
  total?: number;
  outcome?: JudgementOutcome;
  appliedEffects: Array<{ key: string; action: string; value: unknown }>;
  resolvedAtTurn: number;
}
```

`recent` 保留最近 20 条 resolution；`pending` 最多一条，但操作队列可保留多个未消费动作。`pending` 持久化在 `系统.扩展.判定.pending`，带行动摘要哈希与创建回合；读档后仍可执行、改做或取消。resolution 在调用主叙事前落档；流式断开和 `retryAIResponse` 只能复用它，绝不重新掷骰。

新增路径必须先加入 `commandValidator`、skeleton 模式和 `canonGuard` 的 LLM 禁写集；只有本地引擎可写。否则模型能伪造判定结果，整个设计不成立。

## 5. 触发策略

### 不判定

纯对话、观察、已无不确定性的移动、已具备压倒性条件的常规动作。叙事模型直接回应。

### 必须出现判定卡

战斗攻防、危险探索、潜入/偷取、逃脱、炼制、突破、带明确代价的谈判，以及会写入资源/伤势/关系/行动余波的行动。

### 预检实现

第一阶段采用本地规则识别：操作队列已有明确 `type`，自由文本使用动作词、对象、当前事件和活跃行动门控匹配。不能可靠归类时，不暗判；显示“需要明确做法”的澄清卡。`sendMessage` 必须拆为“判类/确认”与“真正发送”两个状态，不能只在现有线性调用前插一个组件。

若一次操作队列命中多项风险，预检生成有序 proposal 列表但只激活第一项；其余动作不消费，待当前判定结算后重新预检，避免“一回合多骰”与 pending 覆盖。

第二阶段才增加可选的轻量 `instruction_generation` 预检模型。它只能输出 `JudgementProposal` 的类别、目标、理由和风险标签；其数值字段由本地规则复算，UI 必须展示其结果后才能执行。

## 6. JudgementEngine

新增纯函数模块 `src/utils/judgementEngine.ts`：

1. 从角色、状态、技能、装备、环境和同伴读取可验证修正。
2. 以 `diceRoller` 产生一次 d20，保存原始骰点。
3. 以单一公式计算基础、修正、总值和 outcome；提示词、i18n、UI 全从该模块导出的规则表读取，删除至少四处重复公式（含幸运/环境临时计算）。
4. 只根据 outcome 生成预定义效果建议；实际写档仍经现有 command validator / canonGuard。resolution 记录已应用路径，叙事伤害/物品/位置补账必须识别本次 resolution，避免重复扣血、重复掉落或重复门控。
5. 生成 `actionGate`：失败、部分成功和被阻断的行动由引擎写入，而非允许 LLM 随意 push。

初版保留既有 d20 口径；`rollD20()` 的“骰到 1 有概率重投”必须在 UI 明示为重投规则，或在 v2 改为无偏 d20，不能静默存在。

## 7. Canon Rail 与 IF

预检通过 `getCanonRailProfile + getCanonRailContract(activeEventId)`即时推导当前策略，而不是假设 `CanonRailContract`已有 `canonPolicy` 字段：

- `route_process_only`：成功/失败只能影响到达该拍的代价、伤势、暴露度、资源和后续门控；不得 set 事件 done、不得 void、不得替代 `mustReach`。
- `if_only`：例如提前收编敌对关键人物，默认线显示“此行动会改写正典，需要显式进入 IF”；不生成普通判定卡。
- `free`：非承重的日常行动按普通规则结算。

事件完成仍只由现有 event reconcile 落账；JudgementEngine 不能触碰 `世界.状态.剧本模组.flags`。pending 存在时暂停 event reconcile、进度审计和自动引导，避免它们在玩家确认前推进 active event；默认线还须做 `mustReach` 文本冲突检测，而不是重造现有 done/void 硬拦截。

## 8. UI 与反馈

在 `MainGamePanel` 输入区上方增加 `JudgementCard`：

- 标题：行动、目标、判定类型、为什么现在判。
- 因素：属性/境界/物品/伤势/环境，显示数值及来源。
- 风险：成功、部分成功、失败的方向性后果；不预告未来剧情。
- 按钮：`执行判定`、`换一种做法`、`先准备`、`撤回`。
- 结算后固定展示骰点、总值、难度、结果、实际状态变化与行动余波；同时把 legacy `〔判定〕` 当作展示镜像，逐步停止解析其为事实。

行动门控在同一区域显示为“未消除的余波”，例如“守卫已警觉：同一路线重试难度 +10，准备伪装或换入口可消除”。

## 9. 迁移与兼容

- 新功能默认 `shadow`：先在后台对现有 LLM 判定做只读比对并写诊断，不改变结果。
- `visible`：显示预检卡，但可由玩家选择沿用 legacy 自动模式。
- `enforced`：仅对战斗、探索、逃跑三类启用引擎结算；社交/关系/IF 在审计后加入。
- 历史正文中的 `〔判定〕` 继续由 `FormattedText` 显示；不回写、不重新解释。
- 旧存档没有 `系统.扩展.判定` 时，不出现待处理卡。

## 10. 实施切片与验收

1. **P0 先封写路径与诊断**：禁止 LLM 直写新判定状态；抽出至少四处重复规则、增加结构化日志；不改 UI/行为。
2. **P1 引擎与存档契约**：先拍板 pending 持久化/取消语义；纯函数、一次性骰点、可重放 resolution、单测。
3. **P2 可见卡（探索/逃跑）**：预检、确认、结算、行动门控 UI；保留 legacy fallback。
4. **P3 战斗与 Canon Rail policy**：验证失败不改变承重结果、不直接落事件 flag。
5. **P4 社交/危险同盟 IF**：关系状态机仅从 resolution 转换，禁止 LLM 直写阶段关系。

验收重点：同一 resolution 不会因刷新重骰；取消不写档；LLM 修改正文中的判定数字无效；无确认的 pending 不会向主叙事请求发送；默认线失败不会造成事件 void 或卡死；状态回执与 UI 卡内容一致。
