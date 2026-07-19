# R2-10B · NPC 确定性决策内核规格（s01_05 实验）

- 日期：2026-07-19
- 来源：Codex 提案（三国志式人物决策器）+ Claude 复审修订四条 + 用户拍板
- 上位设计：`RELEASE-ROADMAP.md`「世界/NPC 引擎设计参照系」节（总原则/借鉴映射/拒绝清单）
- 执行方：Codex
- 门控：**本实验完成并过验收前，暂缓下一轮小范围测试**（用户裁定 2026-07-19：当前完成度不足以产生有效反馈）

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

## 7. 规模边界（修订四）

全量 NPCState 只建给**承重角色**（每关约 5–15 名，s01_05 首批 3–4 名）。Codex 案末"再扩到几百名角色"重新表述为**分层覆盖**：次要角色永远走轻量唤醒，不做几百份手工数值档案——那是给 302 人 registry 再挖一个数据治理深坑，且违反 R3-8 稀缺加权的精力分配原则。

## 8. 验收标准（s01_05 实验）

1. 同一局势输入下，董卓/贾文和/霍子孟（吕雉可选）稳定产出**性格鲜明、后果不同**的行动——即 Codex 案给的四人对照（控宫门/设退路/争程序/试忠诚）能从数值+行动库**计算出来**，不靠手写脚本。
2. 确定性可重放：同输入同输出；决策回执可答"为什么是这个行动、为什么不是次优项"。
3. 构造一条违反 `forbiddenBefore` 的高分候选，验证被**淘汰**而非降权。
4. 现有玩家可见层（机会卡/回执/权限）行为不回退，三路线（诏令/入宫/不介入）真机重放仍通过。
5. 决策全程 0 LLM 调用；渲染层 mustNotInvent 违规能被既有门禁退回。
6. stage 局势值只在白名单内变动，跨关无泄漏。

验收通过 → 回 roadmap 定分层扩量批次；不通过 → 修维度/行动库，不推翻可见层。
