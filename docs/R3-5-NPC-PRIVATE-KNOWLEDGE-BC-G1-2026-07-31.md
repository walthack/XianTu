# R3-5 关系密档知情注入 B/C · 首个 G1 + G2 纵切

日期：2026-07-31

## 目标

让“世界真值存在”与“哪名 NPC 知道”成为两个不同的程序状态，同时不把密档边放进玩家可见关系网或通用提示词。首个样本只覆盖清羽记 `lcq.stage_05→06`：谢艺知道碧姬的星月湖旧身份链，其他人物不自动继承。

这不是全库关系图谱回填，也不解除 `RELATIONSHIPS-SECRET.md` 其余密档边的隔离。

## 最小合同

关卡可选声明 `scenario.initialNpcPrivateKnowledge[]`：

- `factId`：跨关幂等键；
- `holderCharacterIds`：明确知情者；
- `subjectId/predicate/objectId?`：与玩家知识账本可比较的语义键；
- `status`：`confirmed | rumor`；
- `claim`：世界真值文本；
- `behaviorCue`：不含答案的角色行为提示；
- `evidence`：来源；
- `forbiddenAssociations`：玩家未确认时的渲染关联门禁。

运行时另存 `npcPrivateKnowledge`，并记录 `learnedAtTurn/sourceStageId`。它不进入 `社交.关系`、`社交.关系矩阵`、全局花名册或 actor core 的普通知识词典。

## 注入边界

1. `createScenarioPromptState` 完全删除私有账本，因此 claim、证据和 holder 清单不会经通用状态 JSON 泄漏。
2. 只有当前关仍包含 subject/holder、且当前聚焦人物命中 `holderCharacterIds` 时，才注入该人物的 `behaviorCue`；非 holder 零注入，每名 holder 每轮最多 4 条。
3. 玩家尚未确认同一 `subjectId + predicate + objectId` 时，claim 不进 prompt，关联门禁阻止正文坐实。
4. 玩家通过独立 `playerKnowledge` 获得 confirmed 事实后，才向 holder 投影 claim。
5. 多个模块独立编译的 `forbiddenAssociations` 会全部执行，不再只消费 prompt 中第一组。
6. LLM 被禁止写 `世界.状态.剧本模组.npcPrivateKnowledge`。

## 纵切数据

裁定 #144 解锁一条：

- holder：谢艺；
- subject：碧姬；
- 事实：碧姬／碧宛／岳帅姬妾身份链；
- 阶段：`lcq.stage_05` 与 `lcq.stage_06`；
- 玩家解锁：`lcq.event.s05_13` 的第二个确定性动作 `identify_biji_in_person` 成功后，由 `outcomeEffects.playerKnowledge` 写入，不依赖 LLM 正文或命令。

同一事实在 JSON 重载与跨关后保持一个 factId；目标关种子不会覆盖此前的获知轮次和来源关卡。已有老存档在生产 registry reconcile 时只补缺失声明，不覆盖累积记录。

## G1

新增 `tests/r3_5_npc_private_knowledge.test.mjs`，覆盖：

- validator 接受合法声明，拒绝未知 holder 与把玩家角色放进 NPC 私有账本；
- claim 从通用 prompt state 完全剥离；
- holder 得到安全 cue，非 holder 不得到；
- 未确认关联坐实被拦、允许的怀疑表达放行；
- 确定性两步动作产生玩家知识，之后才向谢艺投影 claim；
- JSON 重载、跨关继承与 factId 幂等；
- LLM 写路径封禁；
- 两个独立关联门禁块均执行。

门禁结果：`npm run type-check`、531/531 自动化测试、37 关 schema/引用校验与完整 `npm run canon:build` 全绿。

## G2 真机

Claude Opus 5 在冻结快照 `d674a577` 上通过独立 webpack 服务驱动两条真实 LLM 路线；任务 `claude-2026-07-31T15-08-28-165Z-755afcf1`，40/40 断言通过，`sourceGuardPassed=true`：

- **holder（谢艺）**：实际 prompt 含逐字 claim、`renderGuard.atomicPrivateClaims` 与原子披露边界。模型两稿都改动了原句引号／标点，门禁均拒绝；最终由本地上下文化降级只落“逐字 claim + 其余背景没有证据”，没有补造经历、地点、来源或关系，也没有新增世界真值。
- **non-holder（小紫）**：实际 prompt 不含 claim 或 atomic claim 投影，只保留未揭露关联门禁；最终没有坐实身份链。目标 `playerKnowledge` 仍不存在，`s05_13` 仍未完成，私有账本、关系、flags 与编年史均未被正文反写。
- 两路线使用独立角色与存档，清空旧叙事／记忆层后再跑；共 4 次真实 OpenRouter `deepseek/deepseek-v4-flash` 请求，无额度或网络失败。Git 开始／结束均干净，测试服务已清理，主项目 8091 未触碰。

本轮同时证明原子事实的安全降级路径确实可用；模型逐字保真差与 non-holder 回复偏罐头属于后续演出优化，不阻塞该纵切。

## 结论与后续

首个 B/C G1 + G2 纵切通过，但 milestone 仍为 `[~]`。下一步应做小规模异构扩量，而不是导入整份密档：至少再选一条“知情者不同”、一条“阶段后解锁”、一条“传闻状态”的关系，随后用真机验证知情者行为差异、非 holder 不泄底和揭露前后 prompt 切换。
