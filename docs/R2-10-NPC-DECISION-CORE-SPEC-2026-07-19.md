# R2-10B · NPC 确定性决策内核规格（s01_05 实验）

- 日期：2026-07-19
- 来源：Codex 提案（三国志式人物决策器）+ Claude 复审修订四条 + 用户拍板
- 上位设计：`RELEASE-ROADMAP.md`「世界/NPC 引擎设计参照系」节（总原则/借鉴映射/拒绝清单）
- 执行方：Codex
- 门控：验收拆为 **G1 确定性世界门** 与 **G2 真实 LLM 演出门**。G1 通过后可在隔离分支开始下一批数据扩写；G2 通过前不得把扩写部署到共享测试服、开启下一轮小范围体验测试或宣称本实验总验收完成。

## 1. 目标

把 `s01_05` 现有的董卓/贾文和/霍子孟三条**手写轮换议程**，升级为第一个小型确定性人物决策器：NPC 的"想什么、准备做什么、能不能做到、产生什么后果"全部由引擎计算，LLM 只把已裁定的结果演成对白和正文。验收通过后再谈分层扩量，**不预设"扩到几百名角色"**（见 §7 修订四）。

## 2. 可计算 NPC 状态（NPCState）

每名承重 NPC 保存结构化状态而非模糊小传：

```ts
interface NPCState {
  identity: { factionId: string; office?: string; rank: number };
  personality: Record<string, number>;   // 见修订一：最小维度起步
  motives: Record<string, number>;       // needs 并入动机权重，不单列五维
  resources: { influence: number; wealth: number; troops: number; intelligence: number };
  relationships: Record<string, Record<string, number>>; // 见修订一
  knowledge: string[];                   // 知情图谱条目 id，对接"档案真值≠场内知识"
  agenda: Agenda[];                      // 含升级阶梯 + 进度钟（roadmap 借鉴映射①）
}
```

**修订一（维度最小起步 + 来源可追溯）**：Codex 原案 7 性格 + 5 需求 + 5 关系维是终态想象，不是起点。s01_05 实验只用**能区分四名演员（董卓/贾文和/霍子孟/吕雉）的最小维度集**——建议 personality ≤ 4（如 aggression/caution/honor/ambition）、关系维 ≤ 3（trust/fear/obligation）。每个数值必须能指到正典证据（职务、已发生事件、既有关系边），**禁止无据精确化**；一个维度只有在"删掉它，两名 NPC 的决策就无法区分"时才保留。扩维走后续批次，逐维带证据审。

## 3. 行动库（不自由生成）

首批 30–50 种通用世界行动（收集情报/拉拢人物/请求觐见/公开表态/秘密结盟/调动兵力/封锁道路/散布消息/试探忠诚/背叛阵营/破坏他人议程……），每项声明：

```jsonc
{
  "id": "negotiate_palace_route",
  "requirements": ["office_or_influence >= 4", "knows_court_entry_blocked"],
  "costs": { "influence": 2 },
  "effects": { "courtLegitimacy": 6, "militaryTension": -4 },
  "visibility": "public",        // public / rumor / hidden
  "durationTurns": 2
}
```

**修订三（effects 词表收敛，防全量模拟回流）**：`effects` 只允许写入两类目标——①**本 stage 声明的局势值白名单**（如登基段的 courtLegitimacy/militaryTension，随 stage 数据合同定义、validator 校验）；②**既有权威通道**（关系值、NPC 资源、剧本 flags）。禁止借 effects 新开全局经济/军事/人口模拟通道；stage 局势值不跨关自动继承，跨关影响必须走分歧账本。没有这条，拒绝清单里的"全量资源模拟"会从行动库后门逐步回流。

## 4. 决策评分与正典硬边界

```
score = urgency + personalityFit + motiveFit + factionGoal
      + relationshipMotive + expectedBenefit
      - resourceCost - failureRisk
```

- `canonConflict` **不参与减分**：候选行动违反正典硬边界即**直接淘汰**，进不了评分池。
- 正典约束数据化为 canonPolicy 三段：`invariant`（本阶段必然事实，如定陶王完成登基）/ `forbiddenBefore`（不得提前演出郭解之死、董卓之死，不得公开未揭露机密）/ `processFreedom`（可改变参与者、入宫方式、关系与政治背书）。与既有 `process_only`、IF 生死节点锁定、裁定 lint 同源，不另立平行体系。

**修订二（决策可解释性）**：每次决策必须落**逐项评分分解回执**（该 NPC 本轮候选集、各项得分、淘汰原因），进控制台日志与确定性测试断言。这是文明系 AI 最重要的教训——效用评分不可解释就不可调参；该回执同时是宿敌式玩家可见反馈（"贾文和为何这么做"）的数据源。

**行动结算判定**：NPC 场外行动一律**确定性结算**（阈值/资源对比），不掷骰；只有玩家亲历介入的对抗才走可见掷骰——与台账 #25"可见掷骰单一权威"同一裁定，不新增暗骰源。

## 5. 世界回合管线与分层唤醒

```
事件事实 → 势力目标重估 → 圈定受影响 NPC → 行动库出候选
→ 确定性评分/淘汰 → 引擎结算(资源/关系/议程/局势值)
→ 只挑 1–3 条向玩家显现 → LLM 渲染 → 玩家介入后重算
```

现有 `pressure → agenda → opportunity → receipt/permission` **保留为玩家可见层**，机会卡/回执/权限幂等授予合同全部不动；本内核替换的是可见层底下"议程如何产生行动"的手写轮换。

分层唤醒节奏（照抄 Codex 案）：国家/势力每 3–5 回合；当前地区承重 NPC 每回合；离场承重 NPC 议程到期或重大事件触发；次要 NPC 仅同场/受波及/被点名时唤醒；群众按群体状态。

## 6. LLM 接口合同

LLM 只接收最终结果渲染，例：

```json
{
  "actor": "贾文和",
  "action": "提出伊阙缓冲线方案",
  "reason": "降低两军冲突，同时保留凉州军控制力",
  "knownFacts": ["北军封路", "登基在即"],
  "mustNotInvent": ["具体兵力", "未入档主将", "秘密盟约"]
}
```

`knownFacts` 从 NPCState.knowledge 投影（知情边界裁定 #108/#109 直接适用）；`mustNotInvent` 违规由既有 R2-9 接地护栏/表演门禁捕获退回。决策阶段 **0 次 LLM 调用**。

**数字的认识论边界（2026-07-19 二审修订）**：正文里的具体数字不天然等于世界真值。普通人数（如“一名宫女”“两人对视”）不受兵力门禁；未经授权的权威兵力断言仍须拦截。关卡只有显式开启 `allowUnverifiedQuantities` 时，才允许“消息来源 + 明示未核实”的数字作为角色主张、传闻、夸兵或诱导出现；该数字不得写回 `situationValues`、资源或任何权威状态。

人物未来状态使用关卡数据声明的 `forbiddenAssociations`（主体、禁止谓词、最大距离）执法，通用引擎不得硬编码人物姓名；上下文禁词的假设/否定放行不得被紧邻下一句的确认语句坐实。旧档越界 effect 必须降级并留存审计，配置哈希变化导致 round-0 重建也必须记录旧/新哈希与迁移回合。

## 7. 规模边界（修订四）

全量 NPCState 只建给**承重角色**（每关约 5–15 名，s01_05 首批 3–4 名）。Codex 案末"再扩到几百名角色"重新表述为**分层覆盖**：次要角色永远走轻量唤醒，不做几百份手工数值档案——那是给 302 人 registry 再挖一个数据治理深坑，且违反 R3-8 稀缺加权的精力分配原则。

## 8. 验收标准（s01_05 实验）

1. 同一局势输入下，董卓/贾文和/霍子孟（吕雉可选）稳定产出**性格鲜明、后果不同**的行动——即 Codex 案给的四人对照（控宫门/设退路/争程序/试忠诚）能从数值+行动库**计算出来**，不靠手写脚本。
2. 确定性可重放：同输入同输出；决策回执可答"为什么是这个行动、为什么不是次优项"。
3. 构造一条违反 `forbiddenBefore` 的高分候选，验证被**淘汰**而非降权。
4. 现有玩家可见层（机会卡/回执/权限）行为不回退，三路线（诏令/入宫/不介入）真机重放仍通过。
5. 决策全程 0 LLM 调用；渲染层 mustNotInvent 违规能被既有门禁退回。
6. stage 局势值只在白名单内变动，跨关无泄漏。

### G1 / G2 门禁映射（2026-07-19 用户裁定）

- **G1·确定性世界门（无真实 LLM，硬门）**：从同一个正式 stage fixture 分叉 R3→R1→R2，各推进 10–15 世界回合；机会追踪、玩家完成信号、canonGuard、runtime、场外结算、回执、权限、局势白名单、hidden 可见性、JSON 存档往返与幂等全部走生产代码。G1 必须零网络依赖、同输入同输出，可由 `npm run test:g1:npc` 自动重放。
- **G2·真实 LLM 演出门（真机体验门）**：固定已过 G1 的代码与 fixture，在真实浏览器/模型下检查行动是否自然演出、未来与 hidden 是否泄漏、权威数字是否补造、未核实数字是否保持来源与不确定性、行动选项是否承接机会，以及不读攻略能否辨认三名 NPC 的目标。
- **总验收**：G1 + G2 都通过后，R2-10B 才能从 `[~]` 翻为 `[x]`。G1 单独通过只解锁隔离数据扩写，不解锁部署、外测或总量铺开。

任一门不通过 → 修对应层，不推翻另一层已经取得的证据；代码、Mod 合同或门禁规则变更后，受影响的门必须在新版本上重跑。

## 9. R2-10C 世界事件时间合同（2026-07-20）

重点事件使用相对结构资格的程序时钟，不由 LLM 决定是否到点：

- `canon_anchor`：`notBeforeTurns` 前不激活，`deadlineTurns` 到达后走专用 `offscreenResolution`；
- `window`：在开放期内允许玩家/NPC 改变过程，截止后结算声明的世界后果；
- `emergent`：条件触发、无必然截止，不能为推进主轴而伪造玩家互动。

发生、公开、玩家获知分别记录为 `occurredAtTurn`、`publiclyRevealedAtTurn`、`playerLearnedAtTurn`。未获知的场外事实不得进入 LLM prompt、分歧面板或编年史。截止结算不等于玩家完成，不授机会权限；显式 IF 在截止前仍可替代默认正典。

首批跨事件样本为 `s01_06–08`：郭解/董卓节点验证硬截止与延迟消息，阮香凝节点验证无硬截止的秘密知情事件。G1 报告：`docs/R2-10C-WORLD-TIMELINE-AND-CROSS-EVENT-G1-2026-07-20.md`。

## 10. R2-10D 态度／知识／effects 反馈合同（2026-07-20）

- `actor.knowledge` 使用本事件 `knowledgeFacts` 的 id；行动缺少 `requiresKnowledge` 时在评分前淘汰；
- 态度只使用有正典依据的少维度 `-100..100` 数值，可作为行动阈值或归一化效用，不作全局敌我真值；
- `stateEffects` 只可改变当前决策角色的局部资源、当前 core 内角色态度和声明过的知识条目；
- 跨事件只继承态度与知识，资源仍按事件局部初始化；存档重载不得丢失或重复应用；
- 决策回执只向 LLM 投影行动者实际已知事实，并附参与本次效用的态度值；后台词典存在不等于角色知情。

首批闭环覆盖 `s01_06` 的攻守知识、`s01_08` 的秘密核验链，以及 `s01_05 → s01_07` 贾文和退场次序的跨事件继承。G1 报告：`docs/R2-10D-NPC-FEEDBACK-LOOP-G1-2026-07-20.md`。

## 11. R2-10E 行动冲突、反制与生命周期（2026-07-20）

- `durationTurns>1` 的行动进入 `activeAction`，经历 `started/continuing/completed`；成本与 effects 只在开始时结算一次；
- 行动以 `interaction.domain + stance + power/counters` 声明冲突，不在 LLM 文案中猜测谁压过谁；
- 同域相反 stance 或显式 counter 以“已解释效用分 + power”确定性裁定，平分使用稳定 id；
- 败方标记 `blocked`，不落局势、资源、态度或知识 effects，也不启动／继续生命周期；
- 反制可以中断在途行动，回执必须包含冲突域、对手与双方强度；结果随存档和输入哈希重放。

首批冲突为 `s01_06` 郭解护持对剑玉姬破坏、护送路线对封路；`s01_07/08` 验证持续行动不会重复落账。G1 报告：`docs/R2-10E-NPC-CONFLICT-AND-LIFECYCLE-G1-2026-07-20.md`。

## 12. R2-10F 地区／势力／人物分层唤醒（2026-07-20）

- actor 可声明 `local_critical/faction/offscreen_critical/minor/group` 五档唤醒预算；
- 运行时只以当前地点、在场人物、受影响势力、玩家追踪点名、重大事件首轮和确定性 cadence 构造上下文；
- 在途行动永远唤醒，避免生命周期因预算休眠；未配置的旧 core 保持全员唤醒；
- 休眠 actor 不决策、不扣资源、不推进议程，且每轮以 `wakeAudit` 留下原因；
- 唤醒上下文进入 `inputHash`，同状态同上下文可逐字节重放；
- LLM 不得为未唤醒 actor 擅自追加主动行动，也不得从审计层获知隐藏角色身份。

首批覆盖 `s01_06–08` 的本地关键、场外关键和势力 cadence；次要人物与群体预算由合成测试验证。G1 报告：`docs/R2-10F-LAYERED-WAKE-G1-2026-07-20.md`。

## 13. R2-10G 机会生命周期与长期 NPC 记忆（2026-07-20）

- 机会可由已裁定 actor/action/knowledge 触发；未触发卡不得进入 UI 或 prompt；
- 卡片状态为 `available/tracked/expired/participated/offscreen`，出现、追踪和解决回合均可审计；
- 未追踪卡使用数据声明的世界回合寿命；追踪卡仍受全局介入上限，重复追踪不得续期；
- NPC 经历只记录确定性行动、冲突和机会结果，每条带事件、标签、显著度与回合；
- 每名 NPC 最多保留显著度最高的 12 条；关系、知识和经历一同跨事件，局部资源不继承；
- binding 可声明经历标签效用；只把实际匹配的相关经历写入决策回执，LLM 不得新增经历或修改评分。

首批在 `s01_05–08` 验证触发、过期、参与/缺席记忆及跨事件效用。G1 报告：`docs/R2-10G-OPPORTUNITY-AND-NPC-MEMORY-G1-2026-07-20.md`。

## 14. R2-10H 跨书异构扩量（2026-07-20）

首批跨书不追求铺满，而以两种不同结构证明内核可复用：

- 清羽 `lcq.event.s10_04_left_army_review`：势力级 `emergent`，孟非卿公开复盘与小紫暗查并行；没有硬截止，不因玩家等待伪造解决；
- 云龙 `lyl.event.s05_09`：本地级 `window`，云苍峰收拢资产/联络，云丹琉护送/反击；第 5 回合只按原轴损失惨重场外结算。

两书必须分别声明局势白名单、actor 证据、行动绑定、不变量、未来禁区、机会触发与 wake budget；不得复制燕歌数值或把 LLM 正文回流为真值。跨书数据仍须通过同一 schema、重放哈希、JSON 重载、场外归因和零越权测试。

G1 报告：`docs/R2-10H-CROSS-BOOK-SCALE-G1-2026-07-20.md`。
