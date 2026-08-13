# 六朝世界模式 G1 实现报告

可直接操作的零 LLM 隔离验收页与创角入口见
[`WORLD-SIMULATION-MODE-G1-DEMO-2026-08-13.md`](./WORLD-SIMULATION-MODE-G1-DEMO-2026-08-13.md)。

> 日期：2026-08-13  
> 范围：`lyg.dingtao_beijing` 的 `lyg.event.s01_05–07` 隔离纵切  
> 默认模式：`canon_companion`（不变）  
> 实验模式：仅由新存档初始化显式传入 `storyMode: "world_sim"`

## 1. 已实现合同

G1 把原著逐拍 Rail 与世界模拟分成两套并存的叙事宿主：

- `canon_companion` 继续使用现有 Canon Rail、完成权、纠偏与章节推进逻辑；旧存档缺字段时仍按此模式运行。
- `world_sim` 读取 Stage 的 `worldSimulation` 合同，以当前 `situation` 作为 actor、机会与 prompt 的焦点。
- `structuralAnchor` 只保存不可被局部改写破坏的大势；本纵切为“定陶王继统进入不可逆阶段”。
- 郭解之死、董卓之死被建模为 `forkableOutcome`：无人有效介入时仍走原著默认结果；本地判定成功并由玩家确认后，才激活已有正式 IF。
- `referenceBeat` 只向 LLM 提供当前可用的演出参考，不授予事件完成权或世界写入权。

## 2. 权威链路

一次可能改写枢纽的玩家行动依次经过：

1. 本地 preflight 匹配当前介入合同；
2. 本地判定引擎生成带签名字段的 `authorityReceipt`；
3. 仅成功结果建立一次性的 `pendingDivergence`，失败／部分成功只留本地行动回执；
4. 玩家确认时重新检查默认结果是否已经结算、承重锚点是否仍成立；
5. 通过后复用现有 `recordReconcileDivergences` 原子写入人物状态、分歧账本和已有 IF branch；
6. 重复确认、过期确认及默认结果竞态均 fail-closed。

LLM 在该链路中只负责演出，不能写 `世界.状态.剧本模组.flags.*`，也不能以正文替代死亡、生还、完成、知识或分支回执。

## 3. 首个纵切

| 当前局势 | 原著默认结果 | 玩家可介入合同 | 获准 IF |
|---|---|---|---|
| `s01_05` 拥立定陶王 | 场外结算政治继统 | 无永久改写入口 | 无 |
| `s01_06` 郭解刺杀 | 郭解死亡 | 本地 `combat` 极难判定，成功后确认 | `lyg.if_guojie_longrest` |
| `s01_07` 董卓交接 | 董卓死亡 | 本地 `cultivate` 严峻判定，成功后确认 | `lyg.if_dongzhuo_longrest` |

两个生还 IF 均声明必须保留政治继统锚点。玩家不介入时，世界推进只结算 `offscreenResolution`，不会伪造玩家完成事件。

## 4. UI 与 prompt

- 右侧栏在世界模式显示“当前局势”、可介入行动、本地行动回执和待确认分歧；旧任务／Rail 区块不显示。
- 介入按钮只预填行动表达，不直接写世界状态。
- 世界模式 prompt 不再输出 Canon Rail、`mustReach`、事件完成键、回轨指令或整份未来合同；只提供当前局势、仍有效的硬锚点、已结算结果、当前参考拍与近期本地回执。
- 当前 Stage 没有有效 `worldSimulation` 合同时保留模式但禁用介入，不回退成 LLM 自由改写。

## 5. 回放矩阵

| 路线 | 验证目标 | 自动化覆盖 |
|---|---|---|
| A | 0 次 LLM 调用推进 `s01_05–07`，只落默认场外结果 | `worldSimulationMode.test.mjs` |
| B | 原著同行线完成权不变 | `r2_10b_g1_replay.test.mjs` |
| C | R2-11 确定性机会完成权不变 | `r2_11_deterministic_opportunity_completion.test.mjs` |
| D | 郭解成功介入必须先 pending，再确认已有 IF | `worldSimulationMode.test.mjs` |
| E | 失败／部分成功不能建立 IF | `worldSimulationMode.test.mjs` |
| F | 董卓成功介入经 JSON 重载后仍可确认；默认结果竞态使 pending 失效 | `worldSimulationMode.test.mjs` |

## 6. G1 边界

- 这是隐藏的隔离初始化能力，尚未把模式选择开放到新建角色 UI，也未部署共享测试服。
- 仅 `s01_05–07` 有世界模拟合同；合同缺失、引用失效或耗尽后焦点 fail-closed 为无局势，不回落 Rail，也不能获得未声明的完成权。
- 不支持同一存档中途切换模式。
- G2 扩量前应先做真人游玩反馈，再决定扩展更多局势、为世界模式增加专用时钟／调度器，或开放创建入口。
