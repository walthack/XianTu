# Grok 工作包 A：只产出 editionPack.ts

只读代码生成任务。不要修改文件，不要提交，不要联网，不要使用子 agent。最终只输出一个完整 unified diff，新增 `src/modules/scenarioMods/editionPack.ts`；不要输出测试，不要改任何已有文件。

这是未接 runtime 的纯 TypeScript 模块。它不能读写 store、不能调用 LLM、不能使用随机数、不能依赖浏览器或 Node crypto。

实现这些公开能力：

- `hydrateEditionPack(raw, init, library)`：旧档缺失时创建；已有 seed/slots/receipts/status 必须保留；不得因库新增候选重抽。
- `bindEditionSlot(pack, library, request)`：用 seed、slotId、poolId、generatorVersion、排序去重的 eligibleContentIds 形成稳定 inputHash，并确定性选择；返回新 pack，不修改输入。
- `revealEditionSlot(pack, slotId, turn)` 与 `consumeEditionSlot(pack, slotId, turn)`：selected -> revealed -> consumed；非法转换拒绝，重复转换幂等。
- `projectRevealedEditionBindings(pack)`：只返回 revealed/consumed 的最小公开字段；selected/invalidated 一律不返回。
- 导出清晰的 pack/library/binding/receipt/result 类型。

合同：

- `contentHash` 由制作期 library 提供，runtime 只校验。
- inputHash 是同步稳定审计 hash，注明非密码学用途；对象 key 排序、eligible IDs 排序。
- receipt 至少有 receiptId/inputHash/phase；同 receiptId+同 inputHash 重试幂等，身份冲突 fail closed。
- 已绑定 contentId 缺失或 contentHash 漂移时，仅 invalidated 当前 slot 并写幂等 invalidation receipt；不自动替换，不影响其他 slot。
- library contentId 唯一，并校验 slotId/poolId/contentHash。
- 结果状态使用 `settled | idempotent | rejected`，rejected 带稳定 reason。
- 所有操作使用 clone-on-write，输入对象不变。
- 不引入依赖；代码风格参考项目已有 `openWorldSlice.ts` 的本地确定性合同，但无需读取其他大型文件。

最终输出必须是可直接 `git apply` 的完整 unified diff，不得省略代码，不得用伪代码。
