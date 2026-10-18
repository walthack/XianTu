# 已批未落清单 · 2026-10-19

**范围（只读）**：对照 `_newbot_tmp` 内 1016z／1017／1018 类 answer、`docs/handoffs/2026-10-15/FREE-ACTION-TICKET-PLAN.md`、`GAP-TABLE-2026-10-18.md`、`PROGRESS-0b.md`，以及权威 `PROJECT-STATUS.md`／`docs/MASTER-GANTT.md`。  
**代码基线**：`feat/fast-no-legacy` **已提交 HEAD**（扫描时 `ad9b0c8f` / `ad9b0c8fb22e`；STATUS 文内仍写 `3b8c1be2` 的 numbers 交付点）。工作区未提交改动**不算已落地**。  
**样板**：同拍共历第 6 项——用户已批接入，因冻结文件未进 HEAD。

**本清单排除（按用户指定）**
- 逃跑／带人逃跑（已搁置；§15.4 只写文档）
- 遇敌＋连续战斗（仅设计草案，待拍）
- 角色总表补人（剧情策划在做；`2ee6fa09` 等合入另计）

**判定口径**
- 「已批」= prompt／裁定／FREE-ACTION §15.6 等写明用户批准要做的实现。
- 「未落」= **已提交 HEAD** 无对应行为；仅工作区脏改不算落地。
- 「需再批」≠ 已批：GAP 附录 numbers 冻结项、STATUS Waiting-user 明示者，列入文末「易混」，不进主表。

---

## 主表 · 用户已批准但 HEAD 仍未落地

### 1. 同拍共历 · 共历事件通道纳入「同一拍只结算一次」（1016z 第 6 项）

| 字段 | 内容 |
|---|---|
| **批点** | 共历好感结算须与自由行动共用 `affinityBeatTaken`／`affinityTurn`，同一拍同一目标只改一次好感。 |
| **证据** | `_newbot_tmp/claude_1016z_prompt.txt` 决定 6)；`claude_1016z_answer.md`「第 6 项…禁改而没接入」；`FREE-ACTION-TICKET-PLAN.md` §15.6（工作区稿已写成「已接入」，**已提交树仍无**）。 |
| **HEAD 核** | `git show HEAD:src/modules/scenarioMods/runtime.ts` **无** `affinityBeatTaken`；`affinityBeatTaken` 仅在 `freeAction/state.ts` 供自由行动用。 |
| **卡冻结？** | **是** — 必须改 `src/modules/scenarioMods/runtime.ts` 的 `settleSharedExperienceAffinity`。 |
| **工作区** | 已有未提交补丁：`runtime.ts` +6 行；`tests/freeActionAffinityShape.test.mjs` A18／A19；fixture 加载 runtime。解禁后可直接收口提交。 |
| **优先级** | **P0**（甘特「同拍共历」主缺口；与 §15.6 已批整形闭合）。 |

### 2. 到顶「可选轻回执」（1016z 第 4 项可选部分）· **已落**

| 字段 | 内容 |
|---|---|
| **批点** | 「到顶」除叙事事实外，可选加轻量持久回执；事实文案已落，轻回执未做。 |
| **证据** | `claude_1016z_prompt.txt` 决定 4)「叙事事实传达，**可选**轻回执」；`claude_1016z_answer.md`「可选轻回执：没加，需要动 MainGamePanel.vue 和回执渲染」；§15.6「没有加持久回执」。 |
| **HEAD 核** | 已落：`affinityNotes` + `free.receipt.affinity` + `affinity.lightReceipt`（默认 true）。 |
| **卡冻结？** | **否**（`MainGamePanel.vue` 等非冻结）。 |
| **优先级** | **P2**（批文写「可选」；叙事事实已覆盖主路径）。 |

### 3. P4-1 向高好感角色学功法（用户明确压后的意向）

| 字段 | 内容 |
|---|---|
| **批点** | 未来可找高好感角色学其功法；登记为低优先待办，非本轮实现。 |
| **证据** | `docs/R3-10-BACKLOG-2026-08-16.md` P4-1；commit `712778c2`（用户 2026-08-20「放低优先级待办」）。 |
| **HEAD 核** | 无教学变体／写入路径；前置（好感「挣来」口径、NPC 功法内容）仍空。 |
| **卡冻结？** | **否**（设计阶段）；真做时或碰冻结，另批。 |
| **优先级** | **P4**（用户压后；前置未解）。 |

---

## 易混 · 勿当「已批未落」（需再批／本版明确不做）

| 项 | 为何不算 |
|---|---|
| numbers 剩：南荒每拍 120（❄ AIBidirectionalSystem） | GAP 附录／STATUS：**需批准**后才动冻结文件 |
| numbers 剩：节奏 10／6／4＋对账停滞 10（❄ runtime 成对） | 同上 |
| numbers 剩：态度钳制 −100..100（runtime 侧） | 同上 |
| numbers 其余：寿元／inputPolicy／识别矩阵／声望档等 | 「太大／需用户定」桶，未批搬迁 |
| `physical.bind` 捆绑 | 第四轮**已定本版不实现**（`enabled:false`） |
| 「教授」变体 | 1016z 决定 8)**不做** |
| 护卫 `guard.shield` | §15.5 用户后续裁定**关闭**（可改 true 恢复，非未落） |
| GAP 表原 P0–P2 十条健壮性 | PROGRESS／git：**已落盘**（备份／兜底／版本／迁移／读档校验／容错／反馈包／e2e:smoke／CI Node+audit／遥测告警） |
| ErrorBoundary 未包主面板 | GAP 建议项；1018q／r 批准任务只做了 errorHandler＋启动兜底，**未单批**扩边界 |
| e2e／`validate:all` 进 CI | GAP 拍板点；批准实现停在本地 `e2e:smoke`＋CI audit，**未批**进 CI job |
| 识别失败回落关键词（afaae50b） | 与「不回落」裁定可能冲突；1017l／n **待用户确认**是否要改回，非已确认未落 |

---

## 工作区提示（解禁即可收口）

当前脏树与第 1 项直接相关（勿当已 push／已合入）：

- `src/modules/scenarioMods/runtime.ts` — `settleSharedExperienceAffinity` 内调 `affinityBeatTaken`／记 `affinityTurn`
- `tests/freeActionAffinityShape.test.mjs` — A18／A19
- `tests/freeActionFixture.mjs` — 暴露 `runtime`
- `docs/handoffs/2026-10-15/FREE-ACTION-TICKET-PLAN.md` — §15.6 文案已提前写成「已接入」（与 HEAD 不符，提交时应与代码同批）

---

## 建议开工顺序

1. **解禁 `runtime.ts`（仅共历同拍）** → 收口工作区第 1 项＋测试 → 再改 STATUS／甘特「同拍共历」。  
2. 轻回执（P2）按需。  
3. numbers 冻结迁入：**先显式再批**，勿与第 1 项混交。  
4. P4-1 等前置数据／好感口径后再排。

---

## 扫描元数据

| 项 | 值 |
|---|---|
| 日期 | 2026-10-19（Asia/Singapore） |
| 仓库 | `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu` |
| 分支 | `feat/fast-no-legacy` |
| 只读 | 是；本文件为唯一写入物；未改游戏代码 |
| 主表条数 | **3**（另附易混表；不够 8 条是因 GAP 已大部分落地，且 STATUS 若干「Approved-not-done」实为需再批） |
