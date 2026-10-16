# 第 5 条复现笔记：自由行动后点主线按钮，报「模块行动已失效」

日期 2026-10-16。**只写复现步骤建议，没有改任何代码**（用户裁定：第 5 条不做修复）。诊断出处：`_newbot_tmp/claude_1016_answer.md` 第 5 条。

## 已核实 / 未核实

- 【已核实】抛错点 `src/utils/AIBidirectionalSystem.ts:746`：`moduleOnly && selected && !fresh`。`fresh` 要求候选里有一条 `source/eventId/actionId/contractHash` 四项全等的动作；候选取自 `saveData` 当前（**未推进**）的存档（`:739`）。
- 【已核实】界面按钮来自 `advanceScenarioRuntime(live).saveData`（`MainGamePanel.vue` 的 `scenarioEngineActionOptions`，约 `:949`）——**推进后**的存档。两边基准不同，是这条报错的结构性嫌疑。
- 【已核实】`docs/handoffs/2026-10-14/BAIHU-NINGYU-LMZ-DEMO-DELIVERY.md` §8.4 已记录同一报错，当时没有自由行动，也没找到纯状态原因——所以它**不一定是自由行动引入的**。
- 【已核实·只读探针】全新的清羽记开局存档上，「未推进」与「推进后」两份存档列出的事件动作四元组完全相同（`s01_01 / advance_declared_objective / 1e82c53c`）。所以**开局存档上复现不了**。
- 【说明】用 `tests/freeActionFixture.mjs` 的 `makeSave` 做同样比较，两边会不同（fixture 手工把 `activeEventIds` 改成 `s01_02`，`advanceScenarioRuntime` 又选回 `s01_01`）。这是夹具造成的，**不能当作复现**，别引用成证据。
- 【说明·第7条之后】自由行动结算现在会给在场却无关系记录的正典人物懒登记一条「相识」记录（`freeAction/encounter.ts`，好感0）。这也是一处新的存档写入；复现第 2 步时，若目标是此类人物，请顺带记录结算前后 `社交.关系` 的键，排除它对候选的影响（目前没有任何证据显示有影响，仅作为变量列出）。
- 【未核实】自由行动是否改变了候选可用性（人物线条件读好感 `questLineContext.ts:16`，自由行动会写好感和 `pendingLineAffinityGrants`）。没有复现，不能下结论。

## 建议的复现步骤（只用浏览器控制台观察，不改代码）

建议用 `xiantu-game-selftest` skill 的 Playwright 方式驱动本机游戏；**不要重启 8097 的 PID 65144**，用 8091 的开发服务（或另起端口）。

1. **基线（排除自由行动）**：载入试玩存档，停在有主线按钮的位置，直接点主线按钮。
   - 不报错 → 继续第 2 步。报错 → 与自由行动无关，按 §8.4 的线索走（先做第 3 步的对比）。
2. **加入自由行动**：同一存档，先发一句触发自由行动票的话（建议先用不掷骰的，如赠物/喂药；再试要掷骰的，如攻击/传功，确认判定后），回合结束后再点主线按钮。
   - 分别记录：自由行动 **有结算**（好感变了）与 **被拒**（只出「未发生」）两种情况，各点一次。
3. **点击前对比（关键）**：在控制台各取一份，比较四元组 `source|eventId|actionId|contractHash`：
   - A：界面按钮列表（`scenarioEngineActionOptions` 的当前值，或 Vue devtools 里读）；
   - B：`getCurrentStoryEventActions(gameStateStore.toSaveData())`，即**未推进**的存档；
   - C：`getCurrentStoryEventActions(advanceScenarioRuntime(gameStateStore.toSaveData()).saveData)`。
   - 预期正常时 A == C。若 A ≠ B 且点击报错，说明就是「推进前后基准不同」；记下哪一项（`contractHash` 还是 `eventId`）不同。
4. **隔离变量（一次只变一个）**：
   - 只改好感（控制台直接改一个相关人物的好感度）后点按钮；
   - 只留下一个待确认判定后点按钮（这时界面应当先要求处理判定）；
   - 回合推进（`advanceTurn` 同口径）前后各点一次。
5. 记录：报错时的 `getNarrativeTurn`、`activeEventIds`、`completedEventIds`、`pendingLineAffinityGrants`、`freeAction.log`、A/B/C 三份列表。

## 判读与后续

| 观察 | 说明 | 下一步 |
|---|---|---|
| A == C 但 A ≠ B，点击报错 | 推进前后基准差异坐实 | 再决定：发送前持久化推进后存档，或让校验用与按钮同一基准（改动落点在 `MainGamePanel.vue` 按钮路径，诊断建议先在发送前调 `verifyFreshSelection`，失败则刷新选项并提示，不把选中项交给冻结文件去抛错） |
| A == B == C，仍报错 | 差异在别处（如选中动作在界面缓存里过期） | 查 `selectedScenarioEngineAction` 的保存与提交之间是否发生了存档重载（`persistJudgementSave` 会 `loadFromSaveData`） |
| 只在自由行动后出现 | 自由行动写入影响了候选 | 对比第 4 步各隔离项，看是好感、`pendingLineAffinityGrants` 还是别的字段 |
| 基线就报错 | 非自由行动引入 | 回到 §8.4 的线索 |

## 约束

- `AIBidirectionalSystem.ts`、`runtime.ts` 冻结为 bugfix-only，**抛错点不用改**；修复只会落在 `MainGamePanel.vue`。
- 未复现就改，风险是把合法按钮也挡掉（诊断原话）。建议先拿到 A/B/C 三份列表再动手。
