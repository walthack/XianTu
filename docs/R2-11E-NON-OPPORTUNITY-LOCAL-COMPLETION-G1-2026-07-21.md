# R2-11E · 非机会卡本地判定完成合同 G1

日期：2026-07-21

## 结论

R2-11 的引擎独占完成权已从机会卡扩到首个非机会卡事件。`s01_09` 不再依赖 LLM 写 `done`：主界面提供事件合同声明的固定动作，程序读取行动前存档执行 `success / partial / failure` 判定，模型只演出既定结果。

## 合同与事务边界

- `ScenarioModEvent.playerCompletionContract.kind = local_condition`；
- 动作携带 `eventId / actionId / contractHash / timeCost`，旧合同按钮会被拒绝；
- `successWhen` 只读取本地状态，本纵切以主角魅力作为朝廷礼法主持能力的确定性条件；
- 条件满足记 `success`，条件不足记 `partial`；两者都允许正典处置发生，但政治余波分账；
- 判定在任何模型命令执行前落账，LLM 不能先改属性再影响本轮结果；
- 模型请求会收到既定 outcome 与反馈，只能演出，不能另掷骰或写事件完成标记；
- 完成 flag 仍由下一次 runtime 事务独占写入。

## 不介入收束

`s01_09` 新增六回合绝对截止。玩家不执行本地动作时，宫中官署仍会按太后懿旨场外完成处置：事件记 `offscreen`、不伪记玩家亲历，Rail 依据 settled 状态正常收章和进入下一 stage。

## G1 证据

- 高条件路线：固定动作 → success → participated；
- 低条件路线：固定动作 → partial → participated，余波进入可重放 `eventActionStates`；
- 完全忽略：六回合截止 → offscreen，事件链不死锁；
- 合同热更后的旧按钮拒绝；
- LLM 直接写 `s01_09.done` 被 canon guard 拒绝；
- validator 拒绝无本地条件与非标准完成 flag 的合同；
- 回归入口：`tests/r2_11e_non_opportunity_completion.test.mjs`。

## 下一门

当前已覆盖“机会卡动作序列”和“非机会卡本地条件判定”两类完成结构。下一步应把 outcome 接入显式 effects／关系／知识反馈，并另选需要地点或资源前置的事件验证失败后可准备、可重试；不做全库机械迁移。
