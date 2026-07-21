# R2-11I：截止所有权与分层唤醒复验（2026-07-21）

## 结论

Claude 二审指出的一个 P0 与一个 P1 均已关闭，R2-11 可以继续按事件结构扩量。

## P0：截止同回合的亲历优先权

此前 `resolveOffscreenWorldEvents` 只保护已完成的机会卡合同，没有保护非机会卡 `local_condition` 合同。玩家若恰在绝对截止回合成功，态度与记忆已经记录亲历，下一次推进却可能把事件登记为场外。

修复后，场外结算同时检查：

- 当前事件确实声明 `local_condition`；
- 运行时合同 hash 与当前数据一致；
- `eventActionStates[eventId].readyAtTurn` 已存在。

三项同时成立时，亲历完成优先于场外结算。回归用例把 `s01_09` 精确推进至 `worldTurn=6`，在临界回合成功宣旨，再推进一次，断言事件只进入 `completedEventIds`、timeline 为 `participated`、场外 flag 未写，并保留对应态度与长期经历。

## P1：真实休眠与跳过证据

跨书测试不再只断言演员醒着。清羽与云龙分别构造演员均不在场、未被点名、势力未受影响且非重大事件的 round-1 上下文，断言：

- 全部 wakeAudit 为 `awake:false / sleeping`；
- sleeping actor 不产生任何 decision；
- core、局势、actor 与 context 经 JSON 往返后，完整输出逐字节一致。

运行态的 faction cadence、local/minor presence 与 active action 证据仍由原测试保留；文档已把二者区分，不再把“运行态观察”写成“所有分支都在同一真机路径触发”。

## 扩量门

以上修复只解决合同所有权竞态和验收证据，不改变任何正典事件内容。后续迁移仍必须先分类事件结构；不得从 LLM 正文或模糊关键词反推完成真值。
