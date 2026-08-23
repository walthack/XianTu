# Grok 工作包：editionPack 阶段 1

你在只读 plan 模式下为 XianTu 产出代码补丁草案。不要修改工作树，不要提交 Git，不要调用子 agent，不要联网。

工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`

## 背景与已批准范围

三方架构审计已经完成，Claude verdict 为 `GO-WITH-CHANGES`。采用：制作期审核变体库；新档用 seed 确定性绑定 `slotId -> contentId`；同一存档持久化绑定、状态和幂等回执。人物性格、初始设定、知识边界、正典故事线和关键结果固定。

本工作包只做阶段 1：新增一个完全独立、未接 runtime 的 `editionPack` 纯函数模块及聚焦测试。不得修改现有 demo、canon、核心 prompt、冻结 ID、`AIBidirectionalSystem.ts`、`MainGamePanel.vue`、`storyContext.ts`、`narrativePromptState.ts` 或正式存档 schema。不得删除或绕过 `tavern_commands`。

## 必读参考

1. `docs/SAVE-SCOPED-EDITION-PACK-ARCHITECTURE-BRIEF-2026-08-22.md`
2. `/Users/clawbot/.claude/plans/xiantu-git-cryptic-owl.md`
3. `src/modules/scenarioMods/openWorldSlice.ts`
4. `tests/openWorldSlice.test.mjs`
5. `tests/gameStateScenarioPersistence.test.mjs`
6. `src/modules/npcDecisionCore.ts` 中稳定序列化与 hash 的既有风格

## 需要产出的代码

仅为以下两个新文件给出完整 unified diff：

- `src/modules/scenarioMods/editionPack.ts`
- `tests/editionPack.test.mjs`

模块至少覆盖：

1. 明确的 TypeScript 类型：pack/version/seed/generatorVersion/sourceModVersion、slot binding、library item、receipt 与状态。
2. 旧档 hydrate：缺字段时可初始化；已有 seed、slot、receipt 不重抽、不清空；库升级不能洗牌旧槽位。
3. 确定性绑定：输入至少含 seed、slotId、poolId、generatorVersion、排序后的 eligible content IDs；相同输入始终选中同一 contentId。
4. `inputHash` 用稳定、可排序、同步的审计 hash；明确它不是密码学 hash。`contentHash` 由制作期库提供，runtime 只校验，不伪装成 SHA-256。
5. 幂等与冲突：同 receiptId + 同 inputHash 重试为 idempotent；同 receiptId 或同 slotId 身份冲突必须 fail closed，不得静默重绑。
6. 内容漂移：已绑定 contentId 缺失或 contentHash 不一致时仅将该槽标为 invalidated 并写幂等回执；不得自动换内容或牵连其他槽位。
7. 状态转换至少支持 selected -> revealed -> consumed；非法转换拒绝；重复转换幂等。
8. 知识边界投影只能返回 revealed/consumed 槽位的最小公开绑定；selected/invalidated 的 payload 和 ID 不得进入投影。
9. 所有 API 必须是本地确定性逻辑，不调用 LLM、不使用随机数、不读写 store、不依赖浏览器或 Node 专用 crypto。

测试至少覆盖：

- eligible ID 顺序变化不影响 inputHash 和选择。
- 相同 seed/slot 输入跨重试一致；不同新档 seed 在可用样本中能产生可辨差异，但测试不能假设任意两个 seed 必然不同。
- 旧档 hydrate 保留 seed、绑定、revealed/consumed 状态与 receipts。
- 新库增加其他候选不会改变已绑定槽。
- receipt/slot 冲突关闭。
- content 缺失与 hash 漂移只 invalidated 当前槽且重复 hydrate 幂等。
- selected 不出现在公开投影；revealed/consumed 才出现。
- 输入对象和已存在 pack 不被意外修改。

遵循现有测试的 TypeScript loader 风格。不要引入依赖。不要为了测试修改现有文件。

## 输出格式

先给不超过 12 行的设计摘要，再给一个可直接应用的完整 unified diff，最后列出建议运行的精确测试命令。不要输出无法应用的伪代码，不要省略文件内容。
