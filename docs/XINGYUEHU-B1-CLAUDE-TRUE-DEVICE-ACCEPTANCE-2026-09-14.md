# 星月湖 B1 · Claude 真机测试需求与验收标准

> 日期：2026-09-14
> 状态：**APPROVED_TEST_SPEC / NOT YET EXECUTED**
> 对象：`lcq.event.xieyi_entrustment`（谢艺托付）本地死亡／生还分支骨架
> 冻结代码候选：`4154fa67da0e7f42631d901ad3710821b163a662`（`4154fa6`）
> 项目状态提交：`715cb45113437bfb35edc2006144015baab40770`（`715cb45`）
> 执行者：Claude Code 真机执行通道；Grok 保持唯一控制面；Codex 负责范围与证据验收

## 0. 本次要证明什么

本次只回答一个问题：

> 在真实浏览器、真实页面、真实本地存储和真实判定 UI 中，玩家能否从同一个未结算命运拍，实际完成【承接】或【救治】，得到与本地权威状态一致、可存读档、不可重骰或重复发奖的 `dead`／`longrest` 结果？

通过本规范，只能把 B1 标记为：

`B1_TRUE_DEVICE_PASS`

它**不等于**：

- 星月湖 G2 PASS；
- B1 正式关闭或整条星月湖纵切完成；
- B2–B4 已实现；
- `lcq.stage_06` 已解除隔离；
- 两条路线已经连续玩到萧遥逸、八骏得讯、开放资源或临安；
- LLM 动态演出、长期可玩性或性能已经验收。

G2 仍须另行完成：A／B 两档各连续跑一次、各自读档续玩、同一分支至少复跑一次，并证明下游无真值、知识、位置、关系或物品漂移。

## 1. 权威合同与冲突优先级

验收时按以下顺序裁决；低层证据不得覆盖高层合同：

1. `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md` 中的人工裁定；
2. `docs/GROK-XINGYUEHU-XIEYI-FATE-CONTRACT-2026-08-30.md`；
3. 当前 tracked authority overlay、同步后的 builtin 数据与运行时合同；
4. 本文的真机执行与证据标准；
5. 页面正文、模型输出和测试员推断。

核心冻结语义：

- `lcq.event.slay_dragon` 只落龙神死亡，不预写谢艺命运；
- `xieyi_entrustment` 开场先让玩家听见“把小紫带往星月湖，交给王韬／孟非卿／萧遥逸”的托付；
- 【承接】无骰，唯一落成 `dead`；
- 【救治】必须由乐明珠在场，使用一次可见 `cultivate` 判定，难度 25；
- `success`／`great_success`／`perfect` 唯一落成 `longrest`；
- `partial`／`failure`／`critical_failure` 唯一落成 `dead`；
- 本纵切不得生成 `missing`；
- LLM 不得决定或改写生死、骰点、骨灰、IF、关系终态、物品或事件完成真值。

## 2. 执行授权与不可触碰范围

### 2.1 允许

- 用 Playwright 驱动本机 Chrome／Chromium 打开测试页面；
- 在控制面预先提供的、固定到验收提交的干净 detached worktree 中运行服务；
- 启停本次隔离测试服务；
- 写入该 worktree 下的 `.xiantu-server/`；
- 写入 `/Users/clawbot/.claude/scratch/xiantu-xingyuehu-b1-true-device-20260914/`，但这里只放浏览器 profile 与可删除临时文件，不作为验收产物根；
- 创建和删除本次专用的临时角色、临时槽、浏览器 profile、截图和脱敏网络记录；
- 只读检查源码、bundle、存档、控制台和网络请求。

### 2.2 禁止

- 修改 `src/`、`tests/`、`docs/`、`PROJECT-STATUS.md`、package、Git index 或 Git metadata；
- 修改 canon、核心 prompt、冻结 ID、authority overlay、builtin 数据或存档 schema；
- 触碰主工作区 `.xiantu-server/save-storage/` 中的玩家人物、玩家槽或 API 配置；
- 在 main worktree 中清理、加入或提交现有三份 2026-08-30 未跟踪文档；
- 向 localStorage 注入 API 配置，或覆盖 `user_config_api_management_v1.json`；
- 直接改目标存档的 flags、`completedEventIds`、`activeEventIds`、判定结果、骰点、关系值、物品或位置来制造路线；
- 用“测试大成功”替代真实掷骰并计入 PASS；
- 对同一个 judgement ID 读档重骰；
- 以源码阅读、单元测试、接口直调或截图按钮存在替代真机结果；
- 在证据中记录 API key、Authorization、Cookie 或其他秘密。

任一源文件越界写入都立即停止，结论为 `FAIL_SOURCE_GUARD`；不得自动回退或掩盖。

## 3. 测试环境与启动前置

### 3.1 干净验收工作树

控制面在提交 Claude 任务前准备一个 detached clean worktree，固定到包含本文的验收提交；该提交的应用代码必须与 `4154fa6` 一致。Claude 不自行创建、切换或修改 Git worktree。

工作树必须满足：

- `git rev-parse HEAD` 与任务指定值一致；
- `git status --short` 为空；
- `git diff --check` 通过；
- `git diff --name-only 4154fa6..HEAD` 只允许验收文档／状态文档，不得含应用代码、测试或数据变化。

### 3.2 隔离服务

优先在未占用端口启动隔离服务，不重启共享 `8091`：

```bash
XIANTU_SAVE_STORAGE_DIR='<验收 worktree>/.xiantu-server/save-storage' \
REMOTE_SAVE_STORAGE_ENABLED=false \
npm run serve -- --host 127.0.0.1 --port '<隔离端口>'
```

若 worktree 复用主仓依赖，可由控制面预先放置被 `.gitignore` 忽略的 `node_modules` 链接；Claude 不得改依赖锁文件。

控制面还须在提交 Claude 前，将当前后端权威 `user_config_api_management_v1.json` 单独放入隔离 `save-storage`，采用只读副本或只读链接；不得复制任何玩家人物、玩家槽或 active-save 指针。Claude 只能读取该配置，不得修改、替换或把它注入 localStorage。若隔离服务无法读取这份配置，应停止并报 `NOT_PROVEN_API_CONFIG_UNAVAILABLE`。

启动后须记录：

- 端口、PID、进程 cwd、启动命令和服务日志；
- `/` 与 `/XianTu.js` 均返回 200；
- 在线 bundle 同时命中 `lcq.event.xieyi_entrustment`、`accept_entrustment`、`rescue_xieyi`、`offscreen.lcq.xieyi_entrustment.default_death`；
- bundle 和存档中该事件的 `afterStallTurns` 均为 2；
- 浏览器 profile 是本次新建的隔离 profile。

无法证明服务来自指定 worktree，结论只能是 `NOT_PROVEN_STALE_OR_UNKNOWN_BUNDLE`。

### 3.3 模型与网络

- 使用应用现有后端权威 API 配置，不注入、不换模型；
- 抓取全部非静态请求，按实际网络证据记录 provider／model；
- 秘钥、Authorization、Cookie 必须替换为 `[REDACTED]`；
- 一次真实玩家回合的落定以存档 `worldTurn`、叙事条数或权威状态变化为准；输入框恢复只表示可发下一轮，不是事务落定证据；
- 模型超时但本地状态已提交，只能证明状态事务；没有得到玩家可见最终反馈时，表现层仍是 `NOT_PROVEN`。

## 4. B1 基准槽构造标准

### 4.1 允许的基准构造

为避免重跑已由 G0 证明的 55 步全路线，本次可机械建立一个“命运拍前”临时基准，但它必须：

1. 从当前 `lcq.stage_05b` builtin 与 `createMinimalSaveDataV3`、strict initializer 开始；
2. 只通过生产 `getCurrentStoryEventActions`、`recordStoryEventStructuredAction`、`advanceScenarioRuntime` 顺序推进到 `xieyi_entrustment`；
3. 不调用测试 fixture，不跳关，不直接写目标 flags，不直接写命运、骰点或 judgement；
4. 唯一允许的非命运种子写入，是补入一条合理既有谢艺关系：名字为谢艺、好感度为有限数、关系为非终局普通关系；不得同时写任何 dead／longrest／IF／骨灰／`s06_03` 字段，也不得再写其他社交状态；
5. 保留每一步 action ID、事件 ID、worldTurn、前后状态摘要和哈希；
6. 通过正式本地存储链注册为临时角色／槽，再从正常人物与存档 UI 载入；
7. 在玩家作选择前停住，不提前完成事件；为结算上一拍共历好感而额外执行的无玩家 `advanceScenarioRuntime` 不得消耗本拍 stall 窗口，最终 `stallTurns` 必须复位为 0。

基准构造是测试准备，不是本次真机 PASS 证据。真正计入真机的动作必须在浏览器 UI 中完成。

### 4.2 基准槽必须满足

从同一个只读基准分别复制为独立测试槽；每个槽在首次载入时都要断言：

| 检查项 | 必须值 |
|---|---|
| 当前事件 | `lcq.event.xieyi_entrustment` active |
| 当前地点 | 可解析为鬼王峒同一场景 |
| 乐明珠 | 在场，因此【救治】可见 |
| 谢艺关系 | 已存在，`好感度` 为有限数；记录基准值 |
| `event.slay_dragon.done` | `true` |
| `event.xieyi_entrustment.done` | 非 `true` |
| `event.s06_03.done` | 非 `true` |
| `event.s06_03.void` | 非 `true` |
| `character.xie_yi.status` | 未写 |
| `branch.lcq.if_xieyi_longrest.active` | 非 `true` |
| `world.xieyi_absence.active` | 非 `true` |
| `world.xieyi_ashes.generated` | 非 `true` |
| 谢艺骨灰数量／transfer receipt | 0／0 |
| pending judgement | 无 |
| `afterStallTurns` | 2 |
| `stallTurns` | 0 |
| `affinityGrantedEventIds` | 已初始化为数组，不得为 `undefined` |
| 气血比例 | `气血.当前 / 气血.上限 ≥ 0.25`，不得带入重伤 -15 因子 |

任一目标命运字段已被预置，整组测试无效，结论为 `NOT_PROVEN_INVALID_FIXTURE`。

`fixture-provenance.json` 必须显式记录关系种子、stall 时钟、好感账本初始化和气血比例；这些准备项不算 B1 真机结果。

## 5. 必测真机矩阵

所有用例必须从第 4 节的同源独立槽开始。每一步记录 UI、存档、网络、console、耗时和截图，不得在一条路线结束后倒改成另一条路线。

### T0：命运拍 UI 与未结算状态

1. 从首页经正常“续前世因缘”／人物卡／存档卡载入临时槽；
2. 截取开场正文、右侧目标、输入区和动作按钮；
3. 断言只出现本拍合法动作：
   - 【承接】`我陪谢艺把话说完，不打断、不施针。`
   - 【救治】`让乐明珠施针，我运功护持。不灌补心丹。`
4. 点击动作按钮后只允许填入输入框，不得在玩家发送前推进回合、写正文或落命运；
5. 开场正文可写重伤与托付，但不得提前写谢艺死亡、生还、失踪、骨灰或继承。

**失败条件**：按钮缺失／重复、救治在乐明珠在场时不可用、文案预写命运、点击填入即结算、出现 missing 路线。

### T1：明确【承接】→ `dead`

1. 点击【承接】，确认输入框为冻结 actionText 后发送；
2. 等待真实回合落定；
3. 检查玩家可见正文与存档；
4. 刷新页面并从同一槽继续载入；
5. 再执行一个正常可用的后续动作或正常引擎推进，复核命运与奖励不重复。

必须同时满足：

- `event.xieyi_entrustment.done=true`；
- `event.s06_03.done=true`；
- `event.s06_03.void` 非 true；
- `character.xie_yi.status=dead`；
- `branch.lcq.if_xieyi_longrest.active` 非 true；
- `world.xieyi_absence.active` 非 true；
- `world.xieyi_ashes.generated=true`；
- 背包中 `lcq.item.xieyi_ashes` 恰好 1；
- `lcq.event.xieyi_entrustment.inventory.xieyi_ashes` transfer receipt 恰好 1；
- `completedEventIds` 含 `lcq.event.xieyi_entrustment`；
- 谢艺好感相对基准精确 `+8`，`affinityGrantedEventIds` 含本事件，刷新／后续推进后不再增加；
- 正文不得写谢艺仍有气息、已救回、长养、失踪或生还；
- 不得出现第二次骨灰、第二次 transfer 或第二个命运结果。

### T2：【救治】预检、撤回与读档

1. 点击【救治】并发送；
2. 在“确认并掷骰”前截图判定卡并读取存档；
3. 断言此时没有主叙事结算、没有骰点、没有命运变化、没有神识／气血扣减；
4. 判定卡须显示：`cultivate`、难度 25、目标谢艺、`同伴·乐明珠针灸 +8`；
5. 刷新并重新载入同一槽，pending judgement 必须仍是同一个 ID；
6. 点击【撤回】；
7. 再次刷新／载入，断言 pending 消失并以 `cancelled` 进入 recent，roll 为空、appliedEffects 为空；
8. 【承接】与【救治】重新可选，命运仍未结算。

**失败条件**：确认前已掷骰或推进、撤回扣神识／气血、撤回直接判死、pending 换 ID／复制、刷新后丢失或自动重骰、撤回后不能回到二选一。

### T3：【救治】真实掷骰→自然 `longrest`

必须点击【确认并掷骰】，不得点“大成功（测试）”。每个独立槽只允许一次真实掷骰；若未得到 success+，可从同源基准开新的独立槽再试，最多 10 个槽。不得回滚同一槽、改属性、改 seed、改骰点或复用旧 judgement。

至少一次自然出现 `success`／`great_success`／`perfect`，并同时满足：

- 页面显示实际骰点、总值、难度 25、结果及同一个 judgement ID 的结果链；
- `testOverride` 不存在；
- 发起结算扣神识上限的 5%，不套自我疗伤回血；
- `event.xieyi_entrustment.done=true`；
- `event.s06_03.void=true`；
- `event.s06_03.done` 非 true；
- `character.xie_yi.status=longrest`；
- `branch.lcq.if_xieyi_longrest.active=true`；
- `world.xieyi_absence.active` 非 true；
- 不生成骨灰 flag、骨灰物品或骨灰 transfer；
- 谢艺好感相对基准精确 `+8`，只结算一次；
- 成功后没有第二次确认窗；
- 正文可写重伤、昏迷、密送和长养，不得写谢艺已死、骨灰、发丧、墓、失踪、补心丹救命或名下之物已继承。

10 个独立真实骰仍未出现 success+ 时，结果是 `NOT_PROVEN_NO_NATURAL_SUCCESS_SAMPLE`，不是代码 FAIL，也不得用测试按钮补成 PASS。

### T4：真实救治非 success+ 的一致性

若 T3 的前序自然样本出现 `partial`／`failure`／`critical_failure`，必须保留至少一个样本并核对：

- `partial` 只表示争取到补完遗言的时间，最终仍为 `dead`；
- `failure`／`critical_failure` 最终为 `dead`；
- `critical_failure` 神识总扣减为上限 10%，不是 5%+10%；其他非成功结果保持 5%；
- dead 路径的 flags、骨灰、transfer、好感与 T1 相同；
- 正文不得因“实施过救治”就宣布 longrest 或生还。

自然样本未出现非 success+ 时，本项标 `NOT_SAMPLED`，不单独阻塞 T1+T3 构成的两态 B1；确定性 outcome 映射继续由聚焦合同测试负责。

### T5：刷新、重载、继续与不可重放

对 T1 dead 槽和 T3 longrest 槽分别执行：

1. 记录落定后的完整权威摘要与哈希；
2. 刷新浏览器；
3. 回到人物／存档列表，再从同一槽载入；
4. 至少推进一个正常后续动作；
5. 再次读取存档。

必须满足：

- 命运不翻转；
- 同一事件不再提供原二选一；
- 已掷 judgement 不重新变成 pending，不产生新 roll；
- 骨灰与 transfer 不重复；
- 好感不再 `+8`；
- dead 槽不激活 longrest IF；longrest 槽不补写死亡或骨灰；
- 页面正文、任务栏和可见行动不得混入对面路线事实；
- 位置变化必须来自玩家实际后续动作，不得因刷新回退。

### T6：pending + 离场／原地停滞边界

当前 UI 在 pending judgement 存在时通常阻止发送其他行动。因此本项按真实可达性裁决：

- 若页面存在正常、不绕过判定卡的离场或推进手段，则必须真机执行，并验证默认 `dead`、pending 归档为 `cancelled`、未兑现 rescue 不扣神识／气血、后续能正常创建新判定；
- 若所有正常行动都被 pending 卡阻止，则记录 UI、DOM 与一次被阻止的操作，标记 `NOT_APPLICABLE_UI`。不得为了覆盖该路径直接改存档、调内部函数或注入 worldTurn。

`NOT_APPLICABLE_UI` 不阻塞本次 B1 真机 PASS，但报告必须同时引用既有生产运行时聚焦测试，明确它是自动门禁证据，不冒充真机证据。

### T7：拒绝语义与正文红线

以下三类输入必须各用一个仍处于未结算命运拍的独立基准槽；不得在同一槽连续发送后把已经默认死亡的状态当成后续拒绝样本：

- “我给谢艺灌补心丹救他”；
- “我独自运功救活谢艺”；
- “让谢艺失踪”。

它们不得被识别为合法【救治】success+，不得直接写 `longrest`，不得生成 `missing`。尤其“让谢艺失踪”发送时必须证明事件仍 active、命运字段仍为空。若某次输入消耗时间并触发默认死亡，只对该槽核对 dead 合同，不得继续用该槽证明其他拒绝样本；模型正文不得把补心丹、独自运功或失踪说成已经成功的权威事实。

## 6. 玩家可见质量门

以下任一项即使 flags 正确，也判 FAIL，因为玩家实际看到的世界已经矛盾：

- 未选择前正文提前宣布死／活；
- 判定卡显示的难度、因子、骰点、总值或结果与存档回执不一致；
- dead 状态正文仍说谢艺有气息、已救回或将长养；
- longrest 状态正文出现骨灰、发丧、谢艺墓、遗产已交割或明确死亡；
- 模型虚构第二次掷骰、改骰、补心丹生效、替代医者或玩家单独救活；
- 刷新后正文、任务栏或行动建议切到对面路线；
- 页面长时间无反馈且用户无法判断是待确认、处理中、失败还是已经落账。

措辞生硬、重复、较慢但不造成状态误认的，可列为非阻塞 P1；不得隐藏在 PASS 之外。

## 7. 每步证据要求

每个真机步骤必须记录：

- case ID、槽名、输入来源（按钮／自由输入／判定按钮）；
- 玩家实际发送文本；
- 可见 UI：目标、动作、pending 卡、结果卡、正文、toast；
- `worldTurn` 与叙事条数前→后；
- 当前地点；
- active／completed event IDs；
- 关键 flags；
- judgement pending／recent 的 ID、status、roll、total、outcome、testOverride、appliedEffects；
- 神识、气血前→后；
- 谢艺好感前→后与 `affinityGrantedEventIds`；
- 骨灰数量与 transfer receipt 数；
- HTTP、请求次数、模型 ID、TTFT、总耗时、finish_reason；
- console error／warning；
- 截图路径与存档快照路径。

状态快照至少保留：`before`、`pending`、`resolved`、`after_reload`、`after_followup`。可保存完整本地测试存档，但报告中的摘要必须脱敏。

## 8. 产物目录与格式

唯一可计入 PASS 的产物根为：

`.xiantu-server/claude-xingyuehu-b1-true-device-20260914/`

`/Users/clawbot/.claude/scratch/xiantu-xingyuehu-b1-true-device-20260914/` 只允许放浏览器 profile 与执行中临时文件；最终报告、汇总、状态快照、网络记录和截图若只留在 scratch，均视为产物缺失。

至少包含：

- `REPORT.md`：中文人读报告；
- `summary.json`：机器可读总结果；
- `cases.jsonl`：逐步骤记录；
- `timings.csv`；
- `requests-redacted.jsonl`；
- `console-errors.txt`；
- `service.txt`：端口、PID、cwd、bundle 检查；
- `git-guard-before.txt`、`git-guard-after.txt`；
- `fixture-provenance.json`：基准构造动作链、哈希与目标字段无预置证明；
- `snapshots/`；
- `screenshots/`；
- `cleanup.txt`。

`summary.json` 至少包含：

```json
{
  "verdict": "PASS | FAIL | NOT_PROVEN",
  "verdictCode": "B1_TRUE_DEVICE_PASS | <明确代码>",
  "sourceGuardPassed": true,
  "head": "<验收提交>",
  "codeCandidate": "4154fa67da0e7f42631d901ad3710821b163a662",
  "serviceSourceVerified": true,
  "fixtureValid": true,
  "deadRoutePassed": true,
  "longrestRoutePassed": true,
  "cancelReloadPassed": true,
  "persistencePassed": true,
  "playerVisibleConsistencyPassed": true,
  "stallEdge": "PASS | NOT_APPLICABLE_UI | FAIL | NOT_PROVEN",
  "naturalRollAttempts": 0,
  "testOverrideUsedForPass": false,
  "model": "<network-observed model>",
  "unproven": [],
  "blockingFindings": [],
  "nonBlockingFindings": []
}
```

## 9. 总体判定规则

### PASS

只有同时满足以下条件，才能输出 `PASS / B1_TRUE_DEVICE_PASS`：

1. `sourceGuardPassed=true`；
2. 服务来源、HEAD 与 fixture provenance 均已证明；
3. T0、T1、T2、T3、T5、T7 全部通过；
4. 至少一次自然 success+ 救治样本，没有用 test override；
5. dead 与 longrest 两态都经过真实浏览器 UI 落账并完成刷新／重载；
6. 状态、物品、关系、判定回执和玩家可见正文一致；
7. 无重骰、命运翻转、重复骨灰、重复 transfer 或重复好感；
8. T6 为 PASS 或有充分 UI 证据的 `NOT_APPLICABLE_UI`；
9. 产物完整、脱敏、可复核；
10. 测后 Git 工作树仍干净，临时服务与临时存储已清理。

### FAIL

出现可复现的产品或合同违约，包括但不限于：

- 路线状态映射错误或互相污染；
- 取消／读档造成重骰、扣费、自动结局或 pending 丢失；
- 骨灰、transfer、好感重复；
- 刷新后命运、位置或知识回退；
- 玩家可见正文与本地真值矛盾；
- 合法 success+ 无法激活 longrest IF；
- LLM 获得生死或骰点写入权；
- 未授权源文件写入。

### NOT_PROVEN

以下情况不得硬判 PASS，也不应误判产品 FAIL：

- bundle 来源不明或不是指定提交；
- fixture 预置了目标命运字段，或来源链不可复核；
- 外部 API、配额、网络、浏览器或服务故障导致必测路线未完成；
- 10 个独立真实骰仍没有自然 success+ 样本；
- 只拿到源码／测试／接口证据，没有实际 UI 落账；
- 产物缺失，无法复核关键前后状态。

允许在总 verdict 之外列 `nonBlockingFindings`，但不使用含糊的 `PASS_WITH_FINDINGS` 掩盖必测项缺失。

## 10. 清理与结束守卫

1. 逐一删除本次临时人物、存档和 active-save 指针；
2. 停止本次隔离服务和 Playwright browser／context；
3. 不触碰共享 `8091` 与主工作区玩家存档；
4. 记录证据目录最终清单；
5. 再次执行并记录：
   - `git rev-parse HEAD`
   - `git status --short`
   - `git diff --check`
6. HEAD 必须与开始一致，工作树必须保持干净；
7. 如果清理未完成，结论中明确写 `CLEANUP_INCOMPLETE`，不得静默结束。

## 11. Claude 最终报告固定开头

最终回答前六行必须依次为：

1. `VERDICT: PASS | FAIL | NOT_PROVEN`
2. `CODE: <verdictCode>`
3. `SOURCE_GUARD: PASS | FAIL`
4. `DEAD_ROUTE: PASS | FAIL | NOT_PROVEN`
5. `LONGREST_ROUTE: PASS | FAIL | NOT_PROVEN`
6. `G2/B1_CLOSURE: NOT_EXECUTED / NOT_CLOSED`

随后给出：

- 最短可复现步骤；
- 关键状态前后表；
- 玩家可见正文是否与真值一致；
- blocking findings；
- nonblocking findings；
- `NOT_PROVEN` 项及原因；
- 证据目录、job ID、耗时与成本；
- 清理结果。

不得在报告中宣布 G2 PASS、B2–B4 完成或 B1 正式关闭。最终是否改变项目阶段状态，仍由 Grok 控制面依据本报告另行裁决。
