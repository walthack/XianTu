# V03–V04 自然意图与结算路由修复交接

日期：2026-10-08（SGT）  
工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`  
范围：仅处理已授权的 V03/V04 自然输入验收失败；不扩大其他项目。

## 根因与修改

- V03 第一步“听凝羽说明条件”把直接询问视为自然提问，但 `hear_ningyu_regicide_price` 未配置 `intentMatch.allowInquiry: true`。补入该字段；正典裁定簿已读，未改受保护正典字段。
- V04 自由输入由真实分类请求高置信命中 `act.lmz.promise_silence`，来源为 `exploration_engine`，证据短语与玩家原文一致，分类器返回 `affinityDelta: 8`。原回合入口只把 `event_engine` 的自然分类结果传入事件结算，遗漏 `exploration_engine`；因此叙事已承诺保密，但子事件 `attemptCount` 仍为0、无子事件收据。
- 将 `routedIntentAction.source` 为 `event_engine` 或 `exploration_engine` 的结果都交给既有本地事件结算。改动位于 `src/components/dashboard/MainGamePanel.vue`；没有改语义词表或好感处理逻辑。

## 验证证据

- `npm run canon:build`：通过，37阶段门禁完成；单测1630项，1625通过、0失败、5跳过。之后仅对 overlay 做格式对齐，JSON 解析通过，语义内容未变。
- `npm run build:single`：通过。
- 私有 combat-trial 隔离包：`_newbot_tmp/acceptance-20261007-luna-a1/pkg/combat-trial.js`；SHA-256 `26dcc7b9eb0af272675e95ffb4a0a90d0c84c8e22058d3e017f2d251e73f7ec0`，8137 served 字节与本地包一致。
- `npm run type-check`：通过。
- `node --test tests/naturalIntentRouter.test.mjs`：9/9通过。问句、假设句、他人转述即使分类器提议动作也不结算；无候选时不结算。
- V03 fresh production-replay stop save：原始询问“你希望我替你做什么？”在真实隔离 UI 中通过，单次分类/主模型请求完成，动作尝试计数增至1，命中 `hear_ningyu_regicide_price`，事件未提前完成。证据截图 `288-V03-step1-after-inquiry-fix.png`。
- V03 错误来源边界和第二步留出输入遭遇主模型传输中止/驱动等待超时；状态未写入，不能记作通过。前置确定性 route checks 对原问题、第二步问题、显式 none 错误来源、假设句分别得到预期路由结果。
- V04 原样自由输入的真实分类输出命中正确探索动作，但首次 UI 状态显示未结算，定位为上述结算路由缺口。
- 补丁后以该真实分类输出作为固定分类结果，在真实隔离 UI 回合中执行路由和本地结算；叙事也使用固定隔离响应。结构化状态证实子事件 `attemptCount=1`、动作成功、子事件完成、`questLineState` 收据和乐明珠记忆均写入。好感48→64：父事件延迟奖励+8、本动作+8。截图 `310-routefix-mocked-ui-positive.png`。这验证 UI 结算链，不是实时模型复测。
- V04 原始自由输入的其他实时请求遭约30秒客户端中止；不得记为 PASS。固定输出 UI 验证完成代码链路，但同类自然语言留出句的实时模型覆盖不足。

## 结论与边界

- 缺陷分类：V03 为前置验证配置；V04 为结算路由。两者分别处理，没有扩词表。
- 本轮修复已通过对应静态门禁和受控 UI 路由落账；V03 原始问句有真实模型/UI PASS。V03 负向实时边界、V03 第二步真实留出、V04 同类自然语言留出仍有传输失败或未完整实测，不能把两条能力整体签为 PASS。
- 整轮功能验收仍为 PARTIAL；V02/V08/V09/V10/V11/V12/V13、无检查点20提交路线、15分钟理解度及其余前置场景维持各自原结论。内容观察单独待复核，不作为本轮功能 blocker。
- 未触碰8097或其他共享服务；无正式存档/配置写入；未提交、未推送。独占8137与9491已关闭。

## 2026-10-08 后续：V03-H1回归与V07路由修复

- V03-H1在live-runtime matcher/hash迁移后，以原冻结输入和旧哈希 `e23c70e6` 存档做一次真实隔离UI回归。最终隔离包SHA-256 `80491efa90cea128d048e0f4cdf9a7ede1260925d33e4d8375a8d72e84470493`；served响应与本地包相同。分类命中 `hear_ningyu_regicide_price` 后，合同哈希更新为 `9e66a2a6`，本地结算成功，`attemptCount=1`、准备标记正确，事件活动且未提前完成。证据：主截图 `evidence/614-v03-h1-post-livefix.png`，结构化快照 `evidence/615-v03-h1-post-livefix-structured.json`，请求/响应摘要 `logs/v03-post-livefix-events.json`。
- V07调用链根因归为**结算路由**：`local_contract` 阻断通用叙事reconcile，令已存在的自由文本状态挂载器没有运行。只在成功 `moduleReceipt.path === 'modular'` 时显式调用 `reconcilePlayerFreeTextStatuses`；判定仍完全由既有状态目录、玩家输入/正文、否定和主体规则控制，不开放模型状态命令，不添加ID/关键词。
- 测试新增V07精确输入与旁白转述样本，确认只写入目录已有 `drunk`、sceneLedger期限按目录360分钟；已有他人主体、否定、假设及正文否认边界仍覆盖。自由文本状态与自然意图定向测试21/21通过；`npm run type-check`、`npm run build:single`、`git diff --check`通过。
- 用户澄清冻结条款限制重复探索、不是禁止修复后必要回归后，复用合法V04插入拍 `worldTurn=7` 停点，在最终包对V07原句提交一次。原始快照哈希和前置状态见`evidence/627-v07-postfix-precondition.json`。真实模块回执 `path=modular`；分类 `none`、正文生成成功；角色 `效果`只有一条 `醉酒`，对应sceneLedger只有一条 `drunk`，`source=narrative:drunk`，目录时长360分钟；插入拍承诺事件仍 `attemptCount=0`。结构化证据 `evidence/623-v07-postfix-structured.json`，modular回执 `evidence/626-v07-postfix-modular-receipt.json`，最终请求日志 `evidence/625-v07-postfix-events-final.json`，画面 `evidence/622-v07-postfix-original-input.png`。前台分类/正文HTTP 200；后台chat id3在回合提交后以 `net::ERR_ABORTED` 结束，登记一次，未循环。
- 正式数据守卫：专属隔离浏览器profile；driver拦截 `/api/v1/save-storage`，日志确认PUT配置与GET存档请求均返回阻断响应；无正式存档API、8097或共享服务写入。modular receipt标记 `inherited=true`（OpenRouter / `typesafe/jev-router`），模型设置未改。
- 成熟度：V03-H1该单一冻结输入真实隔离UI通过；V07原失败冻结输入在修复后真实UI通过，冻结留出/误判边界的扩展仍为代码测试层；整轮PARTIAL。V03-N1叙事泄漏、V05/V06及路线/战斗未测项保留原状态。合规观察单独登记，不作为功能blocker。无commit/push/deploy，8137/9491已关闭。
