# R3-5 关系密档知情注入 B/C · 异构小批量 G1 + G2 收口

日期：2026-08-01

## 目标

在首个“谢艺知道碧姬星月湖旧身份链”纵切之外，只增加三个结构差异明确的小样本：不同 holder、事件后解锁、rumor。继续禁止把整份关系密档导入普通关系网、全局花名册或通用 prompt。

## 样本

### 1. 不同 holder：小紫／碧姬的双向母女知情

- `knowledge.npc.qingyu.xiaozi_biji_mother`：holder=小紫，claim=`碧姬是小紫的生母。`
- `knowledge.npc.qingyu.biji_xiaozi_daughter`：holder=碧姬，claim=`小紫是碧姬的亲生女儿。`

两条事实使用不同语义键和不同 cue；聚焦小紫不会得到碧姬的 cue，反之亦然。它们仍不进入 `社交.关系` 或 `社交.关系矩阵`。

### 2. 事件后解锁：`lcq.event.s05_13`

`lcq.stage_05` 的两条母女事实声明 `unlockAfterEventId=lcq.event.s05_13`。事件完成前，claim、cue 和关联门禁均休眠；事件完成后，本地引擎写入 `unlockedAtTurn`。该运行时字段随 JSON 重载和跨关继承，不依赖 LLM 正文。

进入 `lcq.stage_06` 后，母女已经在上一关见面，故该阶段种子不再附同关解锁条件。正常转场以累积账本为准；直接从 stage_06 开局也按该阶段已经揭面处理。

玩家仍不会因“NPC 自己知道”自动获得事实。只有亲历 `lcq.event.s06_04` 并完成第二个确定性动作 `stay_through_xiaozi_decision` 后，两个方向的 confirmed 玩家知识才落账，随后 holder 获得原子 claim 投影。

### 3. rumor：高智商身世梦话

云龙临安关新增：

- holder=阮香凝（本关阶段名“凝姨”）；
- subject=高智商；
- status=`rumor`；
- claim=`高智商曾在瞑寂梦话中说，生父被干爹称作“岳帅”；这只是梦话线索，不能据此确认血缘。`

这条内容只复现原文梦话及其未核实性质。它不得坐实“岳帅之子”，更不得连带推出裁定 #82 的“高智商=真宋主”。玩家在本关开场前已经亲历该梦话，因此 `initialPlayerKnowledge` 同样登记为 rumor。

本批修正了首版代码的 rumor 语义缺口：私有事实为 rumor 时，玩家账本的 rumor 足以表示“知道该传闻存在”并打开 holder 的 rumor 原子投影；confirmed 私有事实仍只接受 confirmed 玩家知识，不能被 rumor 解锁。

## 工程边界

- schema 新增可选 `unlockAfterEventId`；validator 强制它引用同关事件。
- runtime 只在事件进入 `completedEventIds` 后写 `unlockedAtTurn`。
- 通用 prompt state 继续彻底删除 `npcPrivateKnowledge`，包括休眠与已解锁事实。
- rumor 原子提示明确要求保留未核实状态；核对时必须逐字引用 claim，超出部分回答没有证据。
- `lcq.event.s06_04` 增加确定性 `outcomeEffects.playerKnowledge`，因此该事件的完成合同 hash 会随数据更新；不改变事件 ID、完成 flag、顺序或 Canon Rail 结果。

## G1 验收

`tests/r3_5_npc_private_knowledge.test.mjs` 现覆盖：

- `unlockAfterEventId` 引用校验；
- 解锁前 cue/claim 均不注入；
- 事件完成后 `unlockedAtTurn` 落账；
- 小紫与碧姬的 holder 定向 cue 隔离；
- 母女对质动作确定性写入两条 confirmed 玩家知识；
- rumor 玩家知识打开 rumor holder 的原子 claim；
- rumor 不得升级为 confirmed 血缘；
- non-holder 不获得 claim 或 atomic guard；
- JSON 重载、跨关继承、factId 幂等与 LLM 写保护继续通过。

## G2 真机

测试服 `192.168.50.51:8091` 使用主模型 `deepseek/deepseek-v4-flash`，从正式“续前世因缘”UI 载入四个由生产 strict initializer/runtime 机械构建的临时槽。最终 30 项审计通过：

- 小紫 holder：只输出 `碧姬是小紫的生母。`，随后明确其余背景没有证据。
- 碧姬 holder：只输出 `小紫是碧姬的亲生女儿。`，不补来历、相处或第三方传闻。
- 阮香凝 rumor holder：逐字复述梦话 claim，并明确“不能据此确认血缘”；不推出岳帅之子或真宋主。
- 高智商 non-holder：不获得梦话 claim；最终安全答复不含岳帅、高俅生父／亲爹或真宋主。

首轮真机发现并关闭两条真实旁路：

1. non-holder 虽未泄露岳帅传闻，却把公开养父高俅误写为生父。裁定 #147 因此要求 rumor 的事实坐实门持续生效，并在高智商阶段档明确高俅只能是养父／义父。
2. 碧姬正文正确复述原子 claim，但模型把“与小紫的母女关系”写入 `社交.关系.碧姬.当前内心想法`。统一模型命令入口现会拒绝任意把私有关联写入普通关系对象的命令；中性情绪、外貌与好感变化仍可写。修复后同槽重跑，正文保持正确，`社交.关系.碧姬` 未被物化。

修复前后样本、fixture 构建器与审计结果保存在忽略目录 `.xiantu-server/g2-evidence/r3-5-20260801/`。测试角色已从角色列表移除，活动指针恢复到既有短复验角色；临时槽移出服务存储，仅留在忽略证据目录，浏览器标签也已清理。

## 最终门禁

- `npm run type-check`：通过；
- `npm run canon:build`：通过；
- 37/37 关 schema、人工裁定执法、主轴／存档契约：通过；
- 自动化：535/535；
- G2：4 条最终路线、30 项状态／正文审计通过。

## 状态与后续

本次异构小批量 G1 + G2 已关闭；R3-5 关系密档 milestone 仍为 `[~]`，因为其余密档边尚未回填，全库扩量继续冻结。下一批应再选新的跨关 holder／绝密边做小纵切，不得把本批通过解释为全库关系密档已经公开或完成。
