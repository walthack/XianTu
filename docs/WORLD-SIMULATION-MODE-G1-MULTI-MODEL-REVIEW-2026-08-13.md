# 六朝世界模式 G1 多模型复核记录

> 日期：2026-08-13  
> 状态：Grok 设计复核已落实；Claude Code 三轮闭环，最终 P0/P1/P2 PASS

## Grok 设计复核

首次调用因外部模型的文件读取插件失败，未将该次空结果作为评审证据；随后改用自包含的接口、状态机和验收矩阵摘要重新提交，得到以下有效意见：

1. 世界局势焦点与 Canon Rail 必须是双选择器；世界焦点只读，不得借切换焦点写 `done`。Grok 最初建议异常时回落 Rail，后经实现审计与 Claude 二审确认这会使合同耗尽后复活未声明完成权，最终改为世界模式下 fail-closed 为无局势。
2. 不新增第二套分歧真值源；正式 IF 的确认必须复用现有 `recordReconcileDivergences`，且写入形状严格限制为既有 `void + characterStates`。
3. 判定成功与默认期限可能竞态；确认时必须重新检查默认结果，若已结算则 pending 失效。
4. `storyMode` 只能由新存档显式初始化，缺字段按同行线解释，不从剧情状态推断，也不允许存档中途切换。
5. pending 应绑定一次性的本地判定回执；重复确认不得二次应用，失败／部分成功不能建立 pending。
6. 世界模式字段存在但合同缺失时应保留模式、禁用介入，不能静默退化成不受控自由叙事。

以上六项均进入实现与自动化测试。

## Claude Code 只读二审

首轮 job：`claude-2026-08-13T11-43-07-560Z-26774040`  
基线：`78f45d2e50ce20759387cf501b2329a730fa9b4e` + 当前未提交 G1 工作树  
结果：`sourceGuardPassed=true`，只读审查未修改工作区；原样不建议合入。

### 首轮发现与处置

1. **P0：确认生还 IF 后旧期限仍可能写回默认死亡。** 原因是分歧账本与 Rail 的 settlement registry 未同时关闭。修复为正式 IF 成功后将源事件幂等加入 `offscreenResolvedEventIds`；新增“郭解生还后再推进 12 轮”回归，断言默认死亡 flag 不出现、人物仍为 `longrest`、分歧只有一条。
2. **P1：三段局势耗尽后焦点回落 `s01_08` Canon Rail。** 修复为 `storyMode=world_sim` 时合同缺失、引用失效或局势耗尽一律返回无局势；玩家完成权也不得从 `activeEventIds` 回退取得。Route A 新增焦点和 actor anchor 断言。
3. **P2：`recordReconcileDivergences` 若未来合同与硬编码 IF registry 脱钩，可能先写普通 void 再发现 branch 不符。** 在首轮结果返回前已独立修复：确认前用只读 `resolveReconcileBranchId` 预检；validator 构建期核对 event + character state + branchId，并有零写入负例。
4. **P2：原子性依赖 UI 深拷贝调用约定。** 当前 G1 的所有可失败检查均已移到 `recordReconcileDivergences` 之前；之后只有同步、确定性、不可失败的幂等收尾。未为 G1 扩成跨系统事务框架。
5. **P3：`flags.*` 只有前缀约束。** 补为 world contract 条件只能读取 `flags.*`，关键 settlement 条件不得为空；更细的 flags 命名空间仍保留为作者纪律。

### 第二轮聚焦复审

job：`claude-2026-08-13T11-59-11-634Z-986c2451`，`sourceGuardPassed=true`。

该轮证明首个 P0 修复和回归仍不充分：`resolveOffscreenWorldEvents` 原先不读取 settlement registry，且测试未让源事件真实进入 `activeEventIds`；同时指出 world preflight 仍可能落入旧 Canon Rail 显式 IF 判定旁路，右栏内部仍读取旧 Rail 锚点。

处置：

- 场外 resolver 在期限和任何写入之前，以 `isEventSettled` 跳过已经被正式 IF 替代的合同；回归改为真实推进到 `s01_06` active，再确认 IF、再推进 12 轮。
- `world_sim` 禁止进入旧 `EXPLICIT_IF_INTENT` Rail 分支；未命中当前世界介入合同的永久改写措辞不会得到无 authority receipt 的死胡同判定。
- 右栏统一改读 `getScenarioFocusEvent`，移除旧 Rail selector import。

### 最终聚焦复审

job：`claude-2026-08-13T12-11-55-565Z-e9acd864`，`sourceGuardPassed=true`。

结论：P0/P1/P2 全部关闭，未发现新增 P0/P1/P2；复审独立执行 `worldSimulationMode.test.mjs` 15/15 全绿。确认前 IF registry 预检顺序、validator 构建期引用门禁、canonGuard 在世界模式下的 flags 早退也均获确认。仅保留一个不阻塞的 P3 观察：`offscreenResolvedEventIds` 同时承担“默认场外发生”与“正式 IF 已替代该默认期限”的 settlement 语义；G1 下无权限或叙事错误，未来若需要统计参与方式可拆专用 outcome 枚举。

## 可验证 Demo 专项二审

job：`claude-2026-08-13T12-28-31-066Z-ef7a2dc5`，`sourceGuardPassed=true`。

二审确认 Demo 的纯内存、零持久化调用、零 LLM、二段式确认、生产 runtime 复用和新档显式 opt-in
边界均成立。其余发现与处置：

1. 多事件场外合同原先可能重写同组已由玩家或 IF 结算的成员。resolver 改为只处理 `unresolvedIds`，
   同时允许其余成员继续场外推进，并新增“玩家已参与一项＋另一项场外结算”回归。
2. `getCurrentPlayerCompletionEvent` 的世界模式守卫前移到函数入口，未来即使源事件新增完成合同也不会
   暴露动作或把 `done` 写成 `true`。
3. 世界模式下的普通风险判定不再携带旧 Rail 的 `canonPolicy/sourceEventId/authorityReceipt`。
4. validator 增加纵深防御：`rules.mode=expand` 时拒绝 `scenario.worldSimulation`。
5. “生产环境隐藏 Demo”建议不采纳，因为本次用户明确要求交付可直接验证的 Demo；保留主页入口，
   但不放松内存隔离和零存档边界。

修复后聚焦复核 job：`claude-2026-08-13T12-49-51-083Z-2b373bca`，
`sourceGuardPassed=true`。结论：四项全部 PASS，无 P0/P1/P2。其额外 P3 指出探索事件还有一条
与主事件平行的 Rail 完成入口；当前 Demo 数据不可触发，但已继续收口为世界模式下探索动作列表为空、
结构化探索动作也 fail-closed，并纳入同一条伪造合同回归。
