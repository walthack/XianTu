# 去 legacy（no-legacy）真机复测报告 · 2026-10-02 15:30– SGT（进行中，逐项追加）

驱动：`tools/driverb6.mjs`（driverb5r.mjs 拷贝；输出目录改 `b6/`、端口 9480；console 过滤额外抓 `DEMO_*` / `AI双向系统` / 模块日志；不带 PATCH），Playwright + Chrome for Testing 无头，打 `http://127.0.0.1:8091`，真实 LLM。
推进脚本：`tools/advb6.mjs`（advb5r 拷贝）；辅助：`tools/rb6.sh`。日志 `b6/logs/`，截图 `b6/shots/`，单测日志 `b6/unit-tests.log`。
profile：`profile/` 整份拷贝到 `b6/profile-A/`，在拷贝里重置落地连续档新开；检查点为整目录拷贝 `b6/ckpt-*`。`profile/`、`lrt/`、`b5r/` 原件未动；driverlrt PID 79521 未动；另有一个非本轮的 caffeinate PID 42209 未动。
仓库：未改任何文件。开测 git status 53 行（/tmp/gitstatus-b6-pre.txt；比 b5r 开测多 legacyNarratorPacket.ts，为主策划本轮改动）。save-storage 守卫 md5 存 /tmp/ss-b6-pre.txt（characters 3e3a7a05…、active_save ea80e167…、api_config 40a1dd80…）。
caffeinate PID 65779（本轮），driverb6 PID 65780。

## Step 2 · 8091 是否已是新代码 —— PASS
- 8091 = launchd `com.xiantu.devserver`，node PID 39112（未重启）。`/XianTu.js` 200，52,348,392 B，md5 `18c77dbecacfbd0f2c910963b15e4b1a`（b5r 时为 33e75542…，已热更新）。
- bundle 含 `assertDemoModulePath` → `console.error('[DEMO_LEGACY_BLOCKED]'…)` + throw；`console.info('[DEMO_MODULE_ONLY]', {path,eventId,promptChars})`；`generationError.code: moduleOnly ? 'DEMO_MODULE_FAILED'`。无需重启。

## Step 1 · 全量单测（串行）—— 1138 pass / 7 fail / 5 skipped（共 1150）
命令：`node --test --test-concurrency=1 tests/*.test.mjs`（package.json `test` 脚本加串行），15:35 SGT 起，38.5s，日志 `b6/unit-tests.log`（第一次启动被工具进程组回收，半截日志另存 `b6/unit-tests-killed-partial.log`，结果以第二次完整跑为准）。上次串行 1142 pass；本次新增约 8 条用例。
注：旧 smoke-module-framework.mjs 不在 tests/*.test.mjs 内，本次无「回落 legacy」断言失败。7 条失败分类：

| # | 文件:行 | 用例 | 分类 | 原因 |
|---|---|---|---|---|
| F1 | tests/baihuGambleRefusal.test.mjs:725（断言 801） | 拒赌 live chain，伪造 contractHash 的过期动作 | **(b) 真回归（轻）** | 期望 `当前拒赌选择已经过期或无效。`，实得 `（AI生成失败）`。过期/伪造动作现在只给通用失败文案，与主策划报告「过期动作…提示重新选择」不符 |
| F2 | tests/baihuGambleRefusal.test.mjs:1336（断言 1363） | 主策划新增：25 个声明事件全进模块 | **(b) 新测本身不过** | `lcq.event.s02_01` 回执 path=`local` ≠ 期望 `modular`（固定本地正文短路）。用例在第 8 个事件即中断，**s02_02 及之后 17 个事件的模块覆盖没有被这条测试验证到** |
| F3 | tests/baihuGambleRefusal.test.mjs:1374（断言 1412） | s02_02 推进/问句不订约/两次失败不落账 | 测试缺陷（非产品回归） | 前面各断言（calls=2、未提交、`DEMO_MODULE_FAILED`）都已通过；最后 deepEqual 只差 `元数据.更新时间` 10ms——`gameStateStore.toSaveData()` 每次调用都写 `更新时间=now`（src/stores/gameStateStore.ts:578），比较需排除该字段 |
| F4 | tests/modularTurn.test.mjs:120 | 存档标记本身不能让非隔离 profile 切到模块 | **(b) 回归/需拍板** | 只带 `星月湖落地连续试玩.kind` 标记、非 localOnly 的存档，现在被强制走模块并抛 `模块演出2次未通过…模块没有可用模型配置：narrative`；旧隔离守卫（必须 localOnly）被去掉。需主策划确认：是更新该测，还是恢复「仅隔离 profile 生效」 |
| F5–F7 | tests/run4FollowupRepairs.test.mjs:289/324/367 | generate-publish 路径：拒无回执道具 / 未授权杀人 fail-close / item_references 协议 | (a) 类：旧 legacy 生成路径预期 | fixture 用 `createQingyuOpeningPlaytestSave`（带 demo 标记），现走模块，旧 `aiService.generate` 调用 0 次。属旧路径断言；但这三条守卫（无回执道具、未授权杀人）在模块路径上**没有对应替代测试**，建议改测时一并补模块版 |

## Step 3 · 真机（进行中）

### 开局（15:34 SGT）
- 主页 → 星月湖任务线试玩 → 重置落地连续档 → 确认（`b6/shots/003-reset.png`、`004-reset2.png`）。存档带 `系统.扩展.星月湖落地连续试玩.kind = xingyuehu-landing-through-v1`（demo 标记生效范围内）。
- 推进：`advb6.mjs` 自动点主线建议 → 回车；失败 toast 时同句手动重发一次。另起 `tools/rcptb6.mjs` 每 8s 读 `系统.扩展.回合模块试玩.receipts`，新回执写 `b6/logs/receipts.log`（path/eventId/promptChars/foregroundMs/正文长度/末 40 字），非 modular/local 打 `!!!NON-MODULE!!!`。

### 观察 O1 · `[DEMO_MODULE_ONLY]` 成功日志在正常模式下看不到（低）
- bundle 里 `console.info` 被全局包装为 `if (isDebugMode()) original.info(...)`，而 `[DEMO_MODULE_ONLY]` 用的是 `console.info` → 非调试模式下浏览器控制台永远不出现这条成功日志（本轮 console.log 0 条）。`[DEMO_LEGACY_BLOCKED]` 用 console.error，不受影响。
- 本轮改用 HUD「本轮模块演出 · X秒 · 输入N字」+ 存档回执 `回合模块试玩.receipts[].path` 作为每回合来源证据；另 `[回合埋点]`（console.error）也带 `path:"modular"`、`promptBytes`。
- 建议：成功日志改 console.error/warn 之外的常驻通道，或在报告里说明需开调试模式。

### 观察 O2 · 外部模型（openrouter typesafe/jev-router）仍大量 60s 总超时（高，影响可玩性，非 legacy）
- stage_01 前 10 回合：演出请求只有 1.6k–3.2k 字（远小于旧 8 万字），成功的耗时 10–53s；但约一半请求在 60.0s 被总超时中止（net.log `FAIL #1 #4 #5 …`，ttfb 2–4s 即拿到响应头，正文迟迟不完）。toast：「模块演出2次未通过，本轮未执行，请重试：AI请求总耗时超时（60秒）」。
- 失败行为符合设计：输入框保留原句，无事务提交，无第三次 legacy 请求。
- 小问题：toast 说「2次未通过」，但每次失败回合 net.log 只发出 1 个演出请求（60s 总预算被第一稿用完，第二稿没发）。文案与实际不符。console 里 `[AI双向系统] AI生成失败: {"name":"Error"}` 不带 message（序列化丢失）。

### 进度 16:07 SGT · stage_01 全部 + s02_01/s02_03 完成，s02_02 已推进 2 步
- 回执（receipts.log）：s01_01–s01_06、s02_01、s02_03、s02_02×2 全部 `path=modular`，model typesafe/jev-router，promptChars 1,653–3,155。**0 条 legacy/fast/card；console 0 条 `[DEMO_LEGACY_BLOCKED]`。**
- **s02_02「左武军开战」**：演出请求 inChars 2,771–2,993 字（旧 b5r 时约 8.1 万字）。步骤真实推进：`eventActionStates[s02_02].attempts` = `hold_left_army_line` success（turn 3, 19.3s）→ `witness_wang_zhe_nine_suns` success（turn 4, 7.9s），`preparations=[sequence_step_1, sequence_step_2]`，按钮由「观察」变「观察 · 王哲」。但该事件中间仍有连续 60s 超时：15:56–16:06 SGT 共 8 次 60s 失败（net.log #32–#35 等），失败均为外部模型慢（见 O2 补充），不是请求过大。
- advb6 因 HUD 文案在多步事件中不变触发「same HUD」停机（脚本限制，非游戏 bug），重新启动继续。

### 进度 16:20 SGT · s02_02 完成 → 五原（s02_04）→ 水牢/商馆 → 赌局锁
- s02_02 第 3 步 16:10 成功（重试 11.9s），事件完成，切到「去五原城」。**s02_02 全程模块、请求 2.7–3.0k 字、剧情真实推进 3 步：PASS**（但期间超时多，见 O2）。
- **s02_04 五原落奴：无崩溃 PASS**。五原地方按钮（前往·五原露天市集 / 前往·点心铺 / 用话头拖住他们）各 0.6s 本地结算、0 次模型请求，回执 `path=local`（receipts.log 16:14:26，eventId 为空）。console 无 PAGEERROR / detectBranchDecision 报错（不需要 PATCH）。
- s02_05（水牢，1,639 字，40.5s）、s02_06（2,792 字，45.4s）、ningyu_enters_gamble 第 1 步（2,842 字，10.3s）全部 modular。
- **锁①赌局**：截图 `b6/shots/077-lock1.png`。DOM 中无 textarea.game-input（输入框隐藏），只有「剧情分支需要做出决定 / 接赌 / 不赌 / 这一步只能从下面的选项中选择一项。」，无步数；上轮的「↩ 斩线回轨」按钮本次未出现。**PASS。**
- 检查点：游戏内手动存档「B6-赌局锁」（存档列表因此 10/10 满）+ 整目录拷贝 `b6/ckpt-G`。
- 正文瑕疵（第 6 项）：凝羽入局一段出现「此刻并未真正成为退路。；你停下步子…」「…死令。…；她嘴上分毫不让」——句号后紧跟「；」的拼接残留（模块多句拼接用「；」连接）。五原本地正文「人数差距使你最终仍被制住。代价：外地口音…应对失败或部分成功后你仍被制住」读起来像合同字段直拼，「仍被制住」重复。

### 死亡结局 A1 · 不赌 → 炮烙 —— 结局卡 PASS；正文有拼接残留
- 16:21 点「不赌」，一次成功：模块演出 40.0s，输入 2,203 字（回执 modular，eventId ningyu_enters_gamble），无超时。截图 `b6/shots/082-A1-refuse.png`。
- 结局卡：「本局结束 · 炮烙 / 这条路走到了尽头。本局结局如下。/ 程宗扬当面回绝白湖商馆的赌局 / 苏妲己下令执行炮烙 / 赌局未开，卖身契未签」+「回到上一轮」「返回角色选择」。存档 `gameOver = {endingId: lcq.ending.death.paolao, facts:[同上三条], sourceEventId: ningyu_enters_gamble, atTurn:12}`。
- 结束后：game-input 禁用、占位「本局已结束」；无「接赌/不赌」、无主线建议、无「斩线回轨」残留按钮 ✔。
- 正文（原文）：「你当面回绝了那场赌局。；炮烙。；你认得这东西。……她不能放你干干净净地走。；铜柱散出的热浪……」——「。；」拼接 3 处，「炮烙。」孤立成句（第 6 项 FAIL，轻）。正文没写到苏妲己本人下令，靠结局卡补齐。
- 之后游戏内读档「B6-赌局锁」：回到锁，接赌/不赌恢复、gameOver=null ✔。

### 接赌 → 谈期限（sudaji_south_pact）· 16:23–16:35 SGT
- 「接赌」一次成功（31.2s，2,508 字，modular）。**旧瑕疵仍在**：点「接赌」发出的原句是「我当面回应凝羽。」，正文只写转身面对凝羽、她说「你走不了」，没有写「接下赌局」这件事。之后锁解除、输入框恢复 ✔。检查点 `b6/ckpt-P`（谈期限开头）。
- 自由问句「要是三个月回不来怎么办？」：38.8s，识别 794 字（max_tokens 1024，reasoning none）+ 演出 963 字（回执 modular，promptChars **866**）。sudaji_south_pact 未被自动完成 ✔；苏妲己只反问「你拿什么担保？」，**没有自编惩罚** ✔。但自由交谈的上下文只有 866 字，正文全程只用「她」，读不出是苏妲己还是凝羽（同场景两人都在）。
- 第 1 步「以霓龙丝线索换三个月期限」：53.3s / 55.3s（两次分支各一次）成功。**两次都自编道具**：「你从袖中取出一枚极小的蜡封竹片」「一枚薄薄的竹片，上面只有几个字迹」——玩家背包里没有竹片（第 7 项相关：叙事替玩家添物，未落背包）。
- **新 BUG（高）· 谈期限第 1 步后死亡选项失去标签**：第 1 步完成后，主线按钮变成「前往 · 苏妲己 · 耗时 1 回合」和「行动 · 苏妲己 · 耗时 1 回合」两个无说明按钮。点「行动 · 苏妲己」填入的是死亡选项原句「我不接三个月的条件，当面对苏妲己说：要炮烙就现在动手。」；点「前往 · 苏妲己」填入「我当面订下三个月南荒之约。」。第 1 步之前两按钮带说明「以霓龙丝线索换三个月期限」「拒绝期限，要她现在就动炮烙」。两个分支各复现一次（16:27 profile-A 误点直接走到死亡；16:34 profile-P2 只填入不发送）。玩家只看按钮会误触死亡结局。
- 第 2 步「我当面订下三个月南荒之约。」：37.4s，回执 modular，但显示正文只有固定句 47 字：「你当面与苏妲己订下南荒之约：三个月内前往南荒采集霓龙丝，逾期受炮烙。这份约定成为你南下的由头。」（模型正文未展示，疑被守卫换成固定句；玩家等 37s 只得一句）。
- **第 5 项「逾期受炮烙」写入：PASS**。写在 `系统.历史.叙事[20]`、`社交.记忆.短期记忆[4]`、`社交.记忆.隐式中期记忆[3]`、回执 receipts[19].text/memory。事件 sudaji_south_pact 完成，激活 gamble_bond_signed。检查点 `b6/ckpt-S`。

### 死亡结局 A3 · 拒绝三月之约 → 炮烙 —— 结局卡 PASS（因上面的按钮 BUG 误触发）
- 16:27 发出「我不接三个月的条件，当面对苏妲己说：要炮烙就现在动手。」，模块演出 42.3s（2,126 字，modular）。
- 结局卡：「炮烙 / 程宗扬当面拒绝三个月南荒之约 / 苏妲己依约执行炮烙 / 霓龙丝无人去采，南荒之行未曾成行」，`gameOver.endingId = lcq.ending.death.paolao, sourceEventId = sudaji_south_pact, atTurn 15`。结束后只剩「回到上一轮 / 返回角色选择」，无残留主线按钮 ✔。
- 正文问题：结尾苏妲己说「别让他死了。我要他活着看。」，与死亡结局矛盾；结局事实写「依约执行」，但玩家正是拒约，「依约」用词不对；另有 3 处「。；」拼接。
- 恢复：退出 driver，把 `ckpt-P` 拷贝为 `b6/profile-P2` 后重开（拷贝里删了 Chrome 遗留的 Singleton* 锁链接，仅限本轮拷贝目录）。


---
## 续测（第二位测试员接手，16:52 SGT 起）
接手时状态：driverb6 PID 89808（PROFILE=b6/profile-P2，端口 9480）、rcptb6 PID 69765、caffeinate PID 66373 均在跑，直接复用。前一位已从 ckpt-S 往后推进：gamble_bond_signed 两步完成（16:36/16:37，modular），进入 charge_sudaji_fee 后 16:38–16:51 连续约 14 次 60s 超时（advb6.log T1–T8 + fee-free-r1/r2）。
注：advb6 用普通后台方式启动会随工具调用进程组被回收，改用 `tools/spawn.py`（setsid 双 fork）启动。

### 第 5 项 · O2 超时分析 —— 结论：外部路由慢（吞吐双峰），不是输出过长
脚本 `tools/o2b6.mjs`（只读 net.log），结果存 `b6/logs/o2-analysis.txt`。统计范围 15:34–16:51 SGT 全部 chat/completions。
- **请求参数**：演出路由 `typesafe/jev-router`（openrouter），`max_tokens=8192`，`reasoning={"effort":"low"}`，**stream=false**；识别路由同模型 `max_tokens=1024`、`effort:none`；记忆/摘要走 `MiniMax-M2.7-highspeed`（api.minimaxi.com）`max_tokens=4096`。
- **「中止前收到多少正文」= 0**：stream=false，`[回合埋点]` 同时标 `bufferedFullResponse:true`；所有 38 次超时的埋点都是 `firstContentAt:null / responseCompletedAt:null`。net.log 里 FAIL 的 ttfb 2.4–8.2s 只是 openrouter 先回响应头（非流式保活），之后 60.0s 被总预算 abort（`net::ERR_ABORTED 59998–60003ms`），一个字正文都没收到。所以无法用「已收字数」来判断，只能用成功请求反推。
- **演出路由 8192/low：61 次，成功 23，超时 38（62%）**。成功请求：outTok 平均 730（最大 1,932，其中 reasoningTok 平均 314），可见正文平均 590 字、最大 908 字，finish 全部 `stop`，**没有一次接近 max_tokens**。输入：成功平均 2,596 字，超时平均 2,993 字（相差不大，都只有 1.6k–3.2k 字）。
- **吞吐是双峰**：快档 58–99 tok/s（10.4s/10.5s/11.5s/8.0s/19.4s 那几次），慢档 11–21 tok/s（大部分 31–59s 的成功）。按慢档 ~12 tok/s 算，730 token 就要 ~60s；超时那 38 次基本就是落到慢档、且输出略多于 ~700 token。同一句、同样大小的 prompt 重试，有时 15s 成功，有时 60s 超时（如 16:54 `我先开出六十金铢工价。` 15.0s 成功，此前同句 12 次全超时）。
- 对照：MiniMax 路由 23/23 成功，40–60 tok/s 稳定；识别路由（1024/none）4 次 1 次 10s 超时。
- **结论**：主要是 **openrouter typesafe/jev-router 路由不稳定/慢（上游 provider 吞吐 11–20 tok/s 的时段）**，不是输出过长、也不是 prompt 过大。次要因素：①reasoning effort low 每次还要多耗 150–1,550 个推理 token（平均 314，占输出 43%），慢档下就是 15–25s；②非流式 + 60s 总预算，一旦超时整稿作废、第二稿没时间发（toast「2次未通过」名不副实，见 O2 原文）。建议：演出路由换稳定 provider 或在 openrouter 上固定 provider 排序；reasoning 设 none；改成 stream 并按首字/空闲超时，而不是 60s 总超时。

### charge_sudaji_fee（谈定六十金铢）· 16:54–16:58 SGT —— 完成，modular
- 第 1 步「我先开出六十金铢工价。」16:54 一次 15.0s 成功（此前同句 12 次 60s 超时）；第 2 步「谈定报酬后，我才按约取出器物。」16:58 第二次 6.9s 成功（第一次 60s 超时）。回执两条 modular，promptChars 2,787 / 2,301。
- 正文问题（轻）：第 2 步全程只用「对方」「那物什」，没写出苏妲己、也没写出是什么器物；「随着那一声轻轻的颔首应允」替苏妲己代答应下（合同要求「苏妲己当面应下」，但正文没有她说一句话）。

### 第 1 项 · 锁②（free_ajiman 撕契锁）—— PASS（正文有越权/拼接问题）
- free_ajiman 第 1 步「我把阿姬曼的身契拿到手里。」17:01 第二次成功（42.2s，2,515 字，modular；第一次 60s 超时）。之后立即出现锁：截图 `b6/shots/049-lock2.png`（续测重启后同样状态 `003-c2-cont.png`）。
- 锁表现：game-input 文本框不在 DOM 可见区（advb6 等 inputReady 等满 150s 即证明），只有「剧情分支需要做出决定 / 当面撕契并改道出城 / 先收起身契，出城再说 / 这一步只能从下面的选项中选择一项。」；无步数、无主线建议按钮、无「斩线回轨」（谈六十金铢时右栏还有「↩ 斩线回轨」，锁出现后消失）✔。存档 `eventActionStates[free_ajiman]` = attempts[take_ajiman_bond_in_hand success turn19]、preparations=[ajiman_bond_in_hand] ✔。
- 退出浏览器→重开→「继续落地连续档」后锁原样恢复 ✔。
- 锁间距：锁① ningyu_enters_gamble(axisSeq 35) 与锁② free_ajiman(40) 之间隔 sudaji_south_pact / gamble_bond_signed / charge_sudaji_fee 3 个事件，满足「≥3 个事件」✔。
- 检查点：整目录 `b6/ckpt-L2`（锁②出现时，未选择）。游戏内存档栏已满 10/10，本次未新建游戏内存档。
- **正文问题（中）· 第 1 步替玩家做了「不撕」的动作**：正文写「你……将契纸……妥帖地纳进贴身衣襟内侧」「目光在你胸口衣襟的方向停驻」——在玩家还没在锁上二选一之前，叙事已经把身契收进怀里，等于预演了致命选项「先收起身契」。另：没有写「用五十金铢买下」（合同 actionText 有），反写成「事先备妥的小匣子……先前议定时一并交到你手上」（编造来历）；阿姬曼没有出场点名，只有「那双一贯冷淡的眼睛」「她」（读不出是凝羽还是阿姬曼）；「。；」拼接 4 处。原文见 `b6/logs/narrative.log` T4 段 / 截图 049。

### 第 2 项 · 死亡结局 A2 · 不撕 → 冰蛊 —— 结局卡 PASS；死亡正文缺失（中）
- 17:06 在锁②点「先收起身契，出城再说」：一次成功 52.5s（3,002 字，modular）。free_ajiman 照常完成，存档 `pathReceipts["lcq.event.free_ajiman.path.bond_pocketed"]`（choiceId pocket_ajiman_bond，selectedAtTurn 20，consumeAt wuerlang_joins）；**当场 gameOver=null**（符合裁定 #169「延后到武二郎入队」）。右栏「认知与路径」出现「◇ 没有撕掉阿姬曼的身契（苏妲己已下令追查买走舞姬的人）· 路径记录 · method · 第 20 回合」。截图 `b6/shots/005-c2-A2.png`。
- baihu_shangguan_escape「我走出五原商馆。」第 1 次 60s 超时，重试 13.9s 成功（3,221 字，modular）→ 激活 wuerlang_joins（注意：wuerlang_joins 不在 `QINGYU_OPENING_PLAYTEST_EVENT_IDS` 里，但仍被激活并走 modular，冰蛊才可达）。
- wuerlang_joins 第 1 步「我问清走投无路的武二郎是否随队南行」55.9s 成功（3,019 字，modular）→ **同回合结算冰蛊**：结局卡「本局结束 / 冰蛊 / 这条路走到了尽头。本局结局如下。」+ 9 条事实（没撕身契只收进怀里 / 阿姬曼不信他 / 冰蛊之后在冰镇酸梅汤里种下 / 身契让苏妲己查到 / 寒气冻住心脏脑浆当场毙命 / 阿姬曼押往黑魔海 / 哑奴母亲卖给晋国商人 / 哥哥等不到 / 最后一点盼头熄灭）。存档 `gameOver={endingId: lcq.ending.death.ajiman_bond, title: 冰蛊, sourceEventId: lcq.event.wuerlang_joins, atTurn: 23}`。截图 `b6/shots/010-c2-A2-end.png`。
- 结束后：game-input 禁用、占位「本局已结束」；主线建议按钮全部消失，只剩「回到上一轮 / 返回角色选择」✔。
- 重载：goto 主页 → 星月湖任务线试玩 → 继续落地连续档，结局卡原样、input 仍禁用 ✔。「回到上一轮」弹页内「回滚确认」→ 确认回滚：回到武二郎第 1 步前，gameOver=null、input 恢复、bond_pocketed 回执保留 ✔（`017-c2-A2-rollback.png`）。
- **BUG（中）· 冰蛊结局没有死亡正文**：结局回合显示的正文是武二郎第 1 步的普通演出——「你盯着他眼睛，又问：“那便随队南行。你肯不肯？”；你嗯了一声……身后传来他站起身……脚步声，跟了上来。」紧接着就是「本局结束 · 冰蛊」卡。正文里没有苏妲己、没有冰蛊发作、没有死亡，反而写武二郎跟上来，与结局卡直接矛盾（A1 炮烙是有死亡正文的）。单测 baihuGambleRefusal 要求结局回合 prompt 带「【本局结束·结局正文】…标题是“冰蛊”」，真机看不到这段正文。另「。”；」拼接 1 处；问句是玩家自己问、又由叙事替玩家「嗯了一声」。
- 小问题：白湖脱身正文完全没出现武二郎，下一拍 HUD 直接「问清走投无路的武二郎是否随队南行」、正文「你盯着他眼睛」——武二郎凭空出现；该步按钮只显示「观察 · 耗时 1 回合」无说明；HUD 前缀「去五原城 · 见苏妲己：从白湖商馆的死局里脱身」但苏妲己不在场。

### 第 3 项 · 撕契分支（从 ckpt-L2 恢复，profile 拷贝 `b6/profile-T`）· 17:13–17:31 SGT
- 「当面撕契并改道出城」前 2 次 60s 超时，**超时后锁原样回来**（input 仍隐藏、两个选项仍在，没有半提交）✔；第 3 次 16.1s 成功（2,993 字，modular）。free_ajiman 完成，`pathReceipts` 为空（不写 bond_pocketed）✔。截图 `b6/shots/009-c2-T-tear-r2.png`。
- 撕契正文问题：阿姬曼仍未出场/点名，「当着阿姬曼的面」没有写出来；分支注释说「阿姬曼生气并入同一场戏」，**正文没有阿姬曼生气这一段**；开头孤立的「你没接话。」（前面没人说话，拼接残留）；凝羽主动给出「南边水巷的侧门，丑时换班，只有半刻空当」——NPC 替玩家安排出城方案，且写进 `receipts[10].memory.value`/短期记忆（轻度越权，已落档）。
- 之后 advb6 自动推进（`b6/logs/adv6.out`、`adv7.out`）：baihu_shangguan_escape → wuerlang_joins（2 步，**撕契路径不触发冰蛊** ✔ gameOver=null）→ iron_bridge_ambush（2 步）→ ningyu_regicide_offer（2 步）→ zixi_taiyi_intercept（2 步）→ rainforest_black_shoal（2 步）→ silent_sheyi_village（2 步）→「收拾行装，继续旅程」→ 进入 `lcq.stage_03b_snake_flower_bridge`（章节「蛇彝危命」，位置变为「南荒·碧鲮族」），bridge_01/02 各 1 步完成。全部回执 modular（会话内 20/20），0 条 NON-MODULE、console 0 条 `[DEMO_LEGACY_BLOCKED]`、0 PAGEERROR。
- **更多锁**：demo 内只有锁①赌局、锁②撕契两把（`branchDecision.ts` LOCKED_DECISIONS 第三把「支援谢艺」在 `s05b_09`，demo 走不到）。凝羽开价弑主、紫溪、黑石滩、蛇彝村均无锁 ✔（符合「表外不锁」）。锁间距 ①→② 隔 3 事件 ✔，② 之后在 demo 内没有第三把锁，无法观察更远间距。
- **BUG（高）· stage_02 后半段位置不更新**：从白湖脱身到铁索桥、紫溪拦船、雨林黑石滩、蛇彝村，`角色.位置.描述` 一直是「中州·五原·白湖商馆门前街」，顶栏也一直显示五原；HUD 前缀一直是「去五原城 · 见凝羽：…」。叙事因此错位：刚过完铁索桥，凝羽开价那一拍正文开头又是「白湖商馆门前街的日头偏西……凝羽把你引到商馆侧墙的阴影里」（`narrative.log` T6）。直到 stage_03b 才跳到「南荒·碧鲮族」。
- **BUG（高）· 模型退化正文直接展示并落档**：紫溪第 2 步正文结尾退化成无标点长句「……像根定海神针一样让人莫名安心些许也好歹算是撑住了场面不至于全乱套吧大概就是这样一种感觉存在于空气当中挥之不去令人无法忽视其存在意义所在之处即是答案本身无需赘述其他任何多余言语皆属画蛇添足之举可以休矣。」；黑石滩第 1 步后半段整段没有标点（「人群中一片沉默只有柴火的噼啪声……只是点了点头」）。两段都写进 `系统.历史.叙事[35]/[36]` 和 `receipts[14]/[15].shortTermEntry`。没有任何质量守卫拦下。
- **越权 / 编造（中）**：黑石滩正文替玩家宣布「我们死了五个朋友丢了三分之一的货」并编出具体伤亡（三驮盐包、两头骡子宰掉），合同只要求「承认损失」；黑石滩第 2 步「正是先前与你约定过的位置」（编造此前约定）；紫溪替玩家说「人在我船上，这一点不必否认」（替玩家认下）。均已落档（叙事历史 + 回执记忆）。
- **合同/输入不一致（中）**：武二郎第 2 步按钮「行动 · 耗时 1 回合」填入的仍是第 1 步原句「我问清走投无路的武二郎是否随队南行」，但引擎记为 `secure_wuerlang_southbound success`；即玩家看到/发出的句子和落账的动作不是同一件事。同类：stage_02 后半段主线按钮只有「观察 / 行动 / 交谈 · 耗时 1 回合」，无说明。
- 其它（轻）：武二郎/阿姬曼不进 `社交.关系`（武二郎已入队仍没有关系条目）；凝羽多处只写「她」「那双清冷的眸子」；凝羽说出「西门庆」这一关键信息的步骤，正文没出现「西门庆」。
- 检查点：`b6/ckpt-A2end-rolledback`（不撕路径，回滚到武二郎第 1 步前）、`b6/profile-T`（撕契路径，停在 s03b_snake_flower_bridge_03）。

### 第 4 项 · 每回合模块/本地 + 拼接 + 越权（续测汇总）
- 续测期间回执全部 modular（charge_sudaji_fee ×2、free_ajiman ×2/×2（两条分支）、escape、wuerlang ×1/×2、iron_bridge ×2、regicide ×2、zixi ×2、black_shoal ×2、sheyi ×2、s03b ×2），**从未出现 legacy / `[DEMO_LEGACY_BLOCKED]`**。
- 「。；」拼接：在显示正文里仍常见（free_ajiman 第 1 步 4 处、不撕 3 处、撕契 3 处、武二郎冰蛊回合 1 处）；同一段在 `系统.历史.叙事[].content` 里是分段空行，`receipts[].memory.value` 里是「；」——拼接发生在显示/记忆拼装层。快档（10–20s）返回的回合基本没有这种残留。
- 越权落档：见上（凝羽出城方案、黑石滩伤亡数字、紫溪认人、竹片道具（前测））。

### O2 补充（续测后重算，`b6/logs/o2-analysis.txt`）
- 全程演出路由 96 次：成功 46、超时 50（52%）；成功 outTok 平均 821、最大 2,230，可见正文最大 908 字，仍无一次接近 8192。结论不变：外部路由慢/不稳，不是输出过长。（注：driver 重启后请求编号从 1 重算，o2b6 的「fail inChars」字段在多次重启后配对不准，以首轮 61 次统计为准：成功 2,596 / 超时 2,993。）

### 收尾 · 17:32 SGT
- 结束本轮进程：driverb6（PID 7680，及其 Chrome）、rcptb6（PID 69765）、caffeinate（PID 66373）、advb6 均已停止。driverlrt PID 79521、caffeinate PID 42209、8091 launchd 未动。仓库未改、未执行任何 git 写操作。

---
## 回归（主策划 17:55 修复后）· 20:27–20:58 SGT
环境：8091 已热更新（`/XianTu.js` md5 `56e26766…`，52,416,954 B，含 MiniMax-M3 / 无标点守卫 / fixedEndingNarratives）。仓库 git status 72 行（开测快照 `/tmp/gitstatus-b7-pre.txt`，收尾一致）；save-storage 三个 md5 与 b6 开测一致（只读）。驱动 `tools/driverb7.mjs`（9480，输出 `b7/`）+ `tools/driverb7e.mjs`（9482，全新档，输出 `b7e/`），两者另把每个 chat 响应正文写进 `logs/bodies.log`。advb7 的 loc 改读存档 `角色.位置.描述`。

### R1 · 单测 —— 1135 pass / 10 fail / 5 skip（共 1150；上次 1138/7）
`b7/unit-tests.log`（文件头有一次路径写错的空跑，忽略；以 1150 那次为准）。
- 旧 7 条仍失败：F1 baihuGambleRefusal:801（过期动作仍是「（AI生成失败）」）；F2 :1362 现在报「演出需要已启用的 MiniMax-M3 直连配置」；F3 :1399 变成 `Cannot read properties of undefined (reading 'path')`；F4 modularTurn:125 同 MiniMax-M3 配置错误；F5–F7 run4FollowupRepairs 315/… `generate calls=0`。
- **新增 3 条**：① modularTurn.test.mjs:103 记忆选句——期望「你提出交换。；期限没有落定。」实得「你提出交换。\n\n期限没有落定。」（改了记忆拼接，测试没跟）；② r2_13_interaction_handoff_demo:86 期望按钮「观察 · 易虎」实得「观察 · 易虎 · 应对山洪并见证易虎先救两人」；③ r2_13…:296 期望「行动」实得「行动 · 处理眼前事务」（B2 加了动作说明，旧断言没更新）。
### R1b · canon:build —— **不绿**
在 `/tmp/xt-canon`（仓库整份拷贝，node_modules 软链，不碰原仓库）跑 `npm run canon:build`：registry → 投影 → 同门 → 内置同步 → 人工裁定执法 → 主轴/存档契约 → 37 关 schema 全部通过；**卡在「单元测试」**（同上 1135/10），管线 exit 1。日志 `b7/canon-build.log`。数据步只改动了 `builtins/character-registry.json` 的 version/generatedAt 时间戳和末尾换行（内容 hash 不变）。

### R2 · 路由与超时
- 演出：`MiniMax-M3`（api.minimaxi.com）`max_tokens=4096 stream=true` ✔，40 次传输全部 200，**0 次超时**，ttfb 0.8–12.5s，单次 3–36s。但埋点仍标 `bufferedFullResponse:true`。
- 记忆选句：MiniMax-M2.7-highspeed 20/20 成功；响应正文带 `</think>` 残留（`bodies.log`），thinking 没关干净。
- **仍走 openrouter 的两条路由在失败**：①自由输入识别 `typesafe/jev-router` 1024/非流式，**8/8 在 10.0s 超时** → 「行动没能识别，本回合没有推进」（b7e net.log #1–#8）；②后台「连续性审计员」`typesafe/jev-router` 4096/low，11 次里 10 次约 2s 被 abort、1 次 90s abort，伴随 toast「恢复／重试本轮后台」。
- 合计 chat 请求 79：传输失败 18（23%），全部是 openrouter；MiniMax 0 失败。另有 16 次 MiniMax 演出传输成功但被死亡承接守卫打回（见 R6）。失败文案已改为「实发N次」，计数与 net.log 一致 ✔。

### R3 · B2 谈期限按钮 —— PASS
ckpt-G → 接赌 → 期限第 1 步前后按钮都是「行动 · 苏妲己 · 以霓龙丝线索换三个月期限」/「前往 · 苏妲己 · 当面订下三个月南荒之约」+「拒绝期限，要她现在就动炮烙（本局结束）」，死亡标记一直在（`b7/shots/013-g-accept.png` 及之后）。

### R4 · B3 出城后位置 —— PASS
撕契路径：白湖商馆内院 → 门前街 → 中州·南荒途中·铁索桥 → 商队宿处 → 紫溪 → 雨林黑石滩 → 中州·南荒·蛇彝村 → 南荒·碧鲮族；HUD 不再带「去五原城」前缀（`b7/logs/adv2.out`）。

### R5 · B4 无标点守卫 —— PASS（规则层），真机未触发
`readModuleNarrative` 新增：任一标点分段 >120 字即拒稿。用上轮两段实测退化正文验证：紫溪段最长 153 字 → 拦；黑石滩段 125 字 → 拦（只比阈值多 5 字，边界偏紧）；「死了五个朋友」那句 42 字不拦（它属越权，不属无标点）。本轮真机 0 次触发。

### R6 · 四个死亡
- **A1 不赌·炮烙（E01）—— FAIL（不可达）**：「不赌」5 次 × 每次实发 2 稿 = 10 次请求全部被拒：「死亡承接须为1–2句，不继续普通同行剧情」。模型写 97–609 字、3–6 句完整受刑场面（`b7/logs/bodies.log`），守卫（AIBidirectionalSystem.ts:772：>220 字或 >2 个句末标点）不给兜底，固定 E01 正文永远到不了。
- **A3 拒约·炮烙（E03）—— FAIL（不可达）**：同上，5 次 / 10 次请求全拒（bodies.log 12:38:59 / 12:39:04 两稿各 224 / 197 字，4–5 句，另编出「程宗主」称呼）。B13 只能看代码：runtime.ts:1726 把「依约执行炮烙」替换为「下令执行炮烙」。
- **A2 不撕·冰蛊（E02）—— PASS（承接句缺失）**：武二郎第 1 步同回合结束；显示的正文与 `~/Desktop/narrative/结局/E02` 固定文本逐字一致，9 条结局事实、input 禁用「本局已结束」、只剩「回到上一轮/返回角色选择」，回滚后 gameOver=null ✔。但模型那句 71 字承接（bodies #2）没有显示，正文直接从固定文本开头起。
- **E04 王哲自爆 —— 不可达（BLOCKED）**：全新档 17 回合推到 s02_02 第 2 步后（检查点 `b7e/ckpt-W`），死亡需要「不走」再过 3 回合；界面只有第 3 步按钮，自由输入「我不走，留在战场上看着王哲。」等 4 种说法共 8 次全部因识别路由 10s 超时被拒，回合不推进。

### R7 · B6–B16 快检
- B6 买契固定文本：**FAIL** —— 第 1 步落账了（attempt success），但显示正文为空、历史没有新条目、回执 len=0（12:40:44）。「先收起身契」同样 len=0（12:43:08）。
- B7 撕契：**FAIL** —— 只显示一句「随后，你发现商馆侍卫封住出城岔路，改道避开搜查。」（「随后」开头，前半撕契句丢了），阿姬曼未出场，也没有生气那场戏。
- B8 武二郎第 2 步预填：**PASS** —— 按钮/预填已变成「取得武二郎随队南行的明确承诺」；但第 2 步回执 len=0（12:48:53），同 B6 空正文。
- B9 竹片道具：**PASS**（期限第 1 步改固定文本）；但谈六十金铢第 1 步模型又编出「刻着“白湖”二字的铜牌」并收进衣袋，背包里没有。
- B10 越权：紫溪 / 黑石滩改为固定短句，不再编伤亡 ✔；谈六十金铢第 2 步凝羽替苏妲己定「待她验看无误，当日便与你结清。你且在这里候着」（轻）。
- B11 「。；」：**PASS**（显示正文计数 0；记忆改成分段，所以 F 新增 ①）。
- B12 定约 37s 只得一句：**PASS**（0.6s 本地固定句）。
- B13：真机不可达（见 A3），代码层已替换。
- B14 接赌：**PASS** —— 0 请求，固定句「你当面回应凝羽，接下苏妲己提出的赌局。凝羽奉命上场，赌局就此开始。」
- B15 阿姬曼/武二郎关系：**FAIL** —— 撕契路径走完武二郎入队到蛇彝村，`社交.关系` 仍没有这两人（注：存档起点是修复前的 ckpt-L2）。
- B16 日志：`AI生成失败` 现在带 message ✔；`[DEMO_MODULE_ONLY]` 仍是 0 条（console.info 问题未变）。
- legacy：0 条 `[DEMO_LEGACY_BLOCKED]`、0 PAGEERROR、回执 0 条 NON-MODULE ✔。

### 新 bug
- N1（高）死亡承接守卫没有兜底 → A1/A3 永远进不了结局（见 R6）。
- N2（高）关键固定文本动作空正文：买契、收起身契、武二郎第 2 步落账但无任何显示；撕契只显示后半句。
- N3（高）自由输入识别仍走 openrouter，10s 超时 8/8 → 自由输入完全不可用，E04 因此不可达。
- N4（中）stage_02 后半段大量改成 30–47 字本地固定句（紫溪 2 步、黑石滩 2 步、武二郎、白湖脱身），铁索桥模型稿也只有 42/84 字：这一段读起来像任务日志。
- N5（中）s01_06 正文几乎逐字重复 s01_04（「你把水囊收回来，拧紧盖子……你收回目光，继续往前走。」，b7e 存档 receipts[3]/[4]）。
- N6（中）后台连续性审计员仍走 openrouter，频繁被 abort，toast「恢复／重试本轮后台」反复弹。
- N7（轻）按钮说明重复：「去帅帐 · 见王哲：在帅帐里把来历说清楚，先让对方诊治你的伤 · 在帅帐里把来历说清楚，先让对方诊治你的伤 · 耗时 1 回合」；「去五原城 · 见苏妲己：…走出五原商馆 · 走出五原商馆」。
- N8（轻）记忆选句响应带 `</think>` 残留；收起身契后输入框里残留原句。
- N9（轻）s02_02 第 2 步模型编出刺客射箭、王哲帐内盘坐（原著是飞上高空）。

### 收尾
停止本轮进程：driverb7 / driverb7e（及 Chrome）、advb7*、rcptb7 / rcptb7e、caffeinate（本轮 86875）。driverlrt 79521、8091 未动；仓库无写入；`/tmp/xt-canon` 临时拷贝已删除。

---

## 回归2（主策划 21:14 SGT 第二轮修复后；测于 2026-10-03 00:40–01:45 SGT）

规则同前：无 git 写、无仓库改动、未碰 driverlrt 79521 / 8091；canon:build 在 /tmp/xt-canon2 副本执行（已删除）。git status 与测前快照一致；save-storage 三键 md5 未变；bundle md5 `2999edb7…`。

### 结果表
| 项 | 结果 | 说明 |
|---|---|---|
| 单元测试（仓库） | **FAIL** | 1140：1130 过 / 5 败 / 5 skip。1 个为 Node25 IPC flake（scenarioModRuntime 单跑 28/28 过）；**4 个真失败**：baihuGambleRefusal:1351（固定契约文案多了【仙道200年1月1日 08:00】前缀）、moduleModelRuntime:28（期望 timeout 10000 得 undefined）、r2_13_interaction_handoff_demo:122（按钮名多拼了目标「· 请求乐明珠为凝羽解毒」）、run4FollowupRepairs:321（期望 DEMO_MODULE_FAILED 得 undefined） |
| canon:build（/tmp 副本） | **FAIL** | 数据/校验/37 stage schema 全过；卡在单测步 1153：1144 过 / 4 败，exit 1（同上 4 个） |
| A1 不赌→E01 | PASS | 2 句模型引子 + E01 固定文案原文 + 结局卡（炮烙+3 事实）；输入框禁用「本局已结束」；回滚可用 |
| A3 拒绝期限→E03 | PASS | 2 句引子 + E03 固定文案；结局事实「苏妲己下令执行炮烙」（B13 PASS） |
| A2 收契→冰蛊 E02 | PASS | 续写现在显示（武二郎 2 句）+ E02 固定文案 + 9 条事实结局卡 |
| E04 十里焦土 | PASS（附观察） | 自由输入可用；ckpt-W 后 2 次「蹲着照看月霜」→ 2 句引子 + E04 固定文案 + 结局卡（4 事实），输入禁用。观察：首轮测「我不走，留在战场上看着王哲」被识别为 step3 record_battlefield_aftermath（high），直接完成 s02_02 逃过 E04——“留下看着”本身语义贴近 step3，设计上需主策划确认；approach 预警两句未见显示 |
| 接赌 / 订约 / 60 金 / 王哲 step2 | PASS | 全为固定文案，0 请求，~0.6s |
| B6 买契 | PASS | 「你用五十金铢从祁老四手里买下阿姬曼，接过她的身契…」 |
| 收契 | PASS | 固定文案非空 |
| B7 撕契 + 阿姬曼生气 | PASS | 「…她生气地别开脸，没有道谢…」，两条路径（检查点/新档）一致 |
| B8 武二郎 step2 | PASS | 完整固定文案（重新谈定报酬…明确答应同行） |
| B15 关系 | PASS | 新档路径（本轮 reset → ckpt-W → 一路推进）社交.关系 含「阿姬曼·芭娜」「武二郎」（共 13 人）；外貌描述仅填名字（占位） |
| 自由输入识别 | PASS | MiniMax-M3 流式，7/7 成功，耗时 1.15–5.05s（中位 ~1.9s），0 超时 |
| 审计中止弹窗 | PASS | 全程 0 个「恢复/重试本轮后台」toast；审计（MiniMax）正常返回 findings |
| `</think>` 残留 | PASS | bodies 0 处 |
| 输入框提交后清空 | PASS | |
| 按钮去重 | **部分 FAIL** | 五原露天市集出现两个相同「地方 查看 · 现场消息」 |
| B4 无标点长句 guard | **回归风险** | modularTurn.ts:71 阈值已改 200；上轮两例退化稿（最长段 153/125 字）现在都会放行 |

### 统计（保留下来的 net.log，驱动重启会覆盖旧段）
- 请求 72 个全部 MiniMax-M3 / stream=true（4096×65，1024×7=识别），72/72 HTTP 200，**0 失败 / 0 超时 / 0 abort**；无 openrouter 请求。
- 叙事类平均 6.2s，最大 26.7s。回合墙钟 0.6s（固定文案）/ 5–27s（生成）。
- console：AI处理失败 0、DEMO_LEGACY_BLOCKED 0、PAGEERROR 0、DEMO_MODULE_FAILED 0、[DEMO_MODULE_ONLY] 41 条（正常模式可见 ✓）。NON-MODULE 回执 0。

### 新问题 / 观察
1. **[P1] 4 个单测失败 → canon:build 红**（见上表）。
2. **[P2] 剧情漂移**：s02_02 完成后 s02_04 的自由输入「none」回合，模型写出“焦土裂开、王哲焦黑的手伸出来、月霜认出袖口”，与王哲殉身正典冲突；模型自由发挥无约束。
3. **[P2] 金铢账未落**：拿 60 金、花 50 金后，背包「金铢」仍为 0，也没有身契物品（审计自己也报了 state_mismatch）。
4. **[P3] 按钮去重不完整**（重复「查看 · 现场消息」）；「地方」按钮「耗时 回合」缺数字。
5. **[P3] stage_02 短文本**仍有机械复述：「你从中州·帅帐出发。你抵达五原露天市集。路程消耗1轮。你从帅帐抵达五原露天市集。」（主策划已说只修了一部分）
6. **[P3] 章节标签**到了五原/南荒仍显示「第10章·军团」。
7. [观察] [回合埋点] 以 console.error 级别输出；firstSafeSentenceAt 始终 null（流式未逐句先显？）。
8. s01_06 重复未处理（已知，本轮未复测）。

### 结论
- (a) commit/push：**不可以**，canon:build 不绿（4 个单测失败）。
- (b) 人工试玩：**可以有条件开放**。主线三条死亡结局（A1/A2/A3）和 E04 都能正常出现，B6/B7/B8 的固定文案都在，关系表正常，MiniMax 全链路 0 超时，没有中止弹窗。试玩者需要先知道第 2、3 条问题（王哲“复活”漂移、金铢不记账）。

---

## 回归3（主策划 01:58 SGT 第三轮修复后；测于 2026-10-03 02:20–02:38 SGT）

规则同前：无 git 写、无仓库源码改动、未碰 driverlrt **79521** / 8091（webpack **39112**）；`canon:build` 在 `/tmp/xt-canon3` 副本执行（已删除）。测前 git status 快照 `/tmp/gitstatus-b9-pre.txt`（`feat/fast-no-legacy`，与测后 short status 一致）；bundle `http://127.0.0.1:8091/XianTu.js` md5 `3dfef3c0fc849c7c2d41ae5563620220`。驱动 `tools/driverb9.mjs`（DPORT **9480**，输出 `b9/`）+ `rcptb9.mjs`；检查点复用 `b7e/ckpt-W`、`b6/ckpt-S`、`b8/ckpt-L2`（仅拷贝进 `b9/prof-*`，原目录未改）。Codex task_complete 已见 **13**；主策划回复「已改完这 6 项」。

### 结果表
| 项 | 结果 | 说明 |
|---|---|---|
| 1. 单元测试（仓库） | **FAIL**（附：旧 4 条已绿） | 1138：1131 过 / **2** 败 / 5 skip。日志 `b9/logs/unit-tests.log`。**回归2 的 4 条真失败均已过**（focus 复跑 `b9/logs/unit-focus.log`：baihuGambleRefusal 时间戳前缀、moduleModelRuntime timeout、r2_13 乐明珠按钮、run4FollowupRepairs DEMO_MODULE_FAILED）。**新失败 1**：`tests/baihuGambleRefusal.test.mjs`「sixty-zhu payment…」期望金铢 60 得 0——同回合连记两步触发 `already_attempted`（`lastAttemptAtTurn === worldTurn`）；测试未 `worldTurn++`。手工把 turn+1 后同逻辑得 gold=60，买契后 gold=10 + `lcq.item.ajiman_bond`（`b9/logs/gold-probe-turn.log`）。另 1 败为 Node25 IPC flake：`fastNarrativeDemo.test.mjs` deserialize；单跑 **20/20 过**（`b9/logs/unit-fastNarrative.log`）。 |
| 1b. canon:build（/tmp 副本） | **FAIL** | 数据/校验/37 stage schema 全过；卡在单测步 1156：1150 过 / **1** 败（同上 sixty-zhu）/ 5 skip，exit 1。日志 `b9/logs/canon-build.log`。 |
| 2. P2 王哲漂移 | **PASS**（附观察） | s02_02 完成后自由输入「我先稳住呼吸…」（shot `b9/shots/006-drift-free.png`）：**未**出现「焦土裂开 / 焦黑手伸出 / 复活」类正文；守卫串 `正典冲突：王哲已死` 已在 bundle。观察：模型仍把王哲写成帐内闭目运功（守卫只拦复活/伸出等关键词，未拦“仍活着运功”）。 |
| 3. P2 金铢+身契记账 | **PASS**（真机） | 自 `b6/ckpt-S` 重放：fee2 后金铢 **60**（flag `trade…lock_fee_then_remove_device`）；买契后金铢 **10** + 物品「阿姬曼身契」`lcq.item.ajiman_bond`×1（flag `trade…take_ajiman_bond_in_hand`）。旧 `ckpt-L2` 仍为 0/无契（修复前存档，不计入）。单测 sixty-zhu 因同回合未推进 turn 仍红（见上）。 |
| 4. P3 UI | **PASS** | 五原露天市集（`b9/shots/009-wuyuan-market-ui.png`）：**0** 个重复「查看 · 现场消息」；地方按钮均为「耗时 **1** 回合」（无「耗时 回合」缺数字）；章节「**章节：五原**」（不再卡「第10章·军团」）；旅行短文「你从中州·帅帐出发。你抵达五原露天市集。路程消耗1轮。露天货棚…」——抵达只出现 **1** 次，无机械复述第二句「你从帅帐抵达…」。 |
| 5. E04 留下→死亡 | **PASS** | `b7e/ckpt-W` 后自由输入「我不走，留在战场上看着王哲」→ `gameOver.endingId=lcq.ending.death.wangzhe_blast` / 标题「十里焦土」/ 4 事实；**未**完成 step3 `record_battlefield_aftermath`（attempts 仍停在 step2）。预警两句已显示：「热浪先一步到了…」「光墙已经推到近前…」+ E04 固定正文。输入禁用「本局已结束」。shot `b9/shots/004-E04-stay.png`。 |
| 6. B4 阈值 ~120 | **PASS** | `modularTurn.ts:71` `length > 120`；served `/XianTu.js` 同为 **120**（含「正文出现无标点长句」）。 |

### 证据摘要
- 单测/canon：`b9/logs/unit-tests.log`、`unit-focus.log`、`unit-fastNarrative.log`、`canon-build.log`、`gold-probe-turn.log`
- E04：`b9/shots/004-E04-stay.png`；金铢路径存档态见当时 `/eval`（60→10+身契）
- 漂移/市集：`b9/shots/006-drift-free.png`、`008-travel-wuyuan.png`、`009-wuyuan-market-ui.png`
- 回执：`b9/logs/receipts.log`（本轮未见 NON-MODULE）；console 无 PAGEERROR / DEMO_LEGACY_BLOCKED（本轮检索）
- 保护进程：79521 / 8091 全程未动

### 新问题 / 观察
1. **[P1] canon:build 仍红**：新单测 `sixty-zhu payment settles once…` 未在两步之间 `worldTurn++`，与引擎「每回合只能尝试一次」守卫冲突；**真机记账已通**。请主策划给该测试补 turn 递增（或等价推进），勿改结算逻辑。
2. **[观察][P2 软漂移]**：s02_02 完成后自由回合仍可能把王哲写成帐内运功活人（非焦土伸手复活）。若要严格「已死不得再出场」，需加宽正典约束关键词/场景规则。
3. **[观察]** E04 / 买契 个别 `/turn` 墙钟打满 300s（`timedOut=true`），但结局/锁 UI 已正确落账——疑 `isAIProcessing` 收尾偏慢，非功能失败。
4. Node25 `fastNarrativeDemo` IPC deserialize flake：单跑稳定绿，全量偶发，可忽略或隔离重试。

### 结论
- (a) commit/push：**不可以**（`NOT_READY`）。真机 6 项关键修复（含 E04/金铢/P3/B4）基本到位，但 **单元测试 + canon:build 未绿**（sixty-zhu 单测）。
- (b) 人工试玩：**可以有条件开放**。E04「留下」已进死亡且预警可见；60 金/50 买契会记账；五原 UI 章节/耗时/去重/旅行短文正常。试玩者可知：自由输入偶发仍把王哲写成活人运功；canon:build 需主策划先修上述单测再提交。

### 收尾
已停本轮 `driverb9` / `rcptb9` / 本轮 `caffeinate`（PID 28702）。未动 driverlrt 79521、8091、他会话 caffeinate 30233。`/tmp/xt-canon3` 已删。仓库无写入。

---

## 回归3（主策划 01:58 SGT 修复后；测于 2026-10-03 02:19–02:45 SGT）

规则同回归2：没有 git 写操作，没删仓库里的任何东西，没碰 8091 和 79521；canon:build 在 /tmp/xt-canon3 副本里跑，跑完已删。git status 前后一致，save-storage 三个键 md5 没变。bundle 已热更（md5 `3dfef3c0…`）。

### 结果表
| 项 | 结果 | 说明 |
|---|---|---|
| 1 单测 / canon:build | **FAIL** | 回归2 的 4 个失败都修好了。但新增失败 1 个：`tests/baihuGambleRefusal.test.mjs:1475`「sixty-zhu payment settles once on the second verified fee action」，期望 60，实际 0。直接调 `rtm.recordStoryEventStructuredAction` 时没有加 60 金铢。全量 1156：1150 过 / 1 败 / 5 跳过。canon:build 卡在单测这一步，同一个失败，exit≠0。第一次跑 canon:build 时有 112 个文件报 Cannot find module，判断是环境问题，单独重跑后只剩这 1 个 |
| 2 王哲不复现 | PASS | 做完 step3 后连续 3 轮引诱输入（找他、喊他、等他回来）：王哲始终是琉璃里的人形轮廓，「已经不在任何地方了」，没有复活，也没有伸手 |
| 3 金铢 / 身契 | PASS（实机） | 0 → 60（谈定报酬）→ 10（买契），「阿姬曼身契」进了物品栏；撕契后从物品栏移除；收契后保留。但对应单测失败（见第 1 项） |
| 4a 重复按钮 | PASS | 不再出现两个「查看 · 现场消息」。新问题：按钮名把整段来源和可信度都塞进去了，非常长 |
| 4b 耗时数字 | PASS | 「耗时 1 回合」 |
| 4c 章节标签 | PASS | 帅帐「第10章·军团」→ 五原「五原」→ 铁索桥「南荒商路」 |
| 4d stage_02 重复 | 部分 | 「你从帅帐抵达…」那句重复已去掉；点心铺一段仍有「你沿…前往点心铺。路程消耗1轮。你沿街面进入点心铺。」，抓捕段仍有「应对失败或部分成功后你仍被制住」这种机械句 |
| 5 E04 留下看王哲 | PASS | 「我不走，留在战场上看着王哲。」一轮直接进 E04：引子 + 两句预警（热浪先一步 / 光墙已经推到近前）+ 固定文案 + 结局卡；输入框禁用。小问题：引子已经写了王哲「化为飞灰」，接下来的固定文案又从他悬在空中写起，时序倒了 |
| 6 B4 阈值 | PASS | modularTurn.ts:71 改成 `> 120` |
| A1 / A2 / A3 / E04 | PASS | 都是 ≤2 句引子 + 固定文案 + 结局卡，输入框禁用，回滚可用 |
| B6 / B7 / B8 | PASS | 买契、撕契（阿姬曼生气）、武二郎 step2，全文都在 |
| MiniMax | PASS（附注） | 本轮 36 个请求全部是 MiniMax-M3 流式：33 个 200、1 个 422（A3 死亡回合的后台请求，返回体为空，玩家看不到影响）、2 个 ERR_ABORTED（后台审计在下一轮前台开始时被中止，没有弹窗）。超时 0；「AI处理失败」/ 页面报错 / DEMO_MODULE_FAILED / `</think>` 都是 0 |

### 结论
- commit/push：**还不行**。canon:build 仍有 1 个单测失败。
- 人工试玩：**可以**。实机功能全部通过；剩下的都是单测和文案打磨。

---

## 回归3b（主策划 02:44 / 02:46 SGT 两轮修改后；测于 2026-10-03 03:07–03:11 SGT）

规则同前：无 git 写、无仓库改动（测前后 `git status --porcelain` 与 `git diff` md5 一致）、未碰 8091 / driverlrt 79521。仓库 rsync 到 `/tmp/xt-canon3`（排除 node_modules），node_modules 用 APFS 克隆 `cp -cR` 拷入（真实文件，非符号链接；本轮 0 个 Cannot find module）；跑完已删除副本。Node v25.8.1。日志：`r3b/logs/`（unit / canon / r213 单跑 / wuyuan 单跑）。

主策划本段 Codex 有两轮（task_complete 13→15）：
- 02:44 「已只改测试，两步之间补了 `runtime.worldTurn++`」——回应回归3 的单测失败；
- 02:46 「测试按真实前置路径进入工价拍；短文去重、查看按钮缩短；E04 引子改为固定句」——回应另一条（New Bot）回归3 消息的 P1+3 条 P3，动了 `wuyuanOpenWorldSlice.ts`、`AIBidirectionalSystem.ts`、`fixedEndingNarratives.ts` 等源码。

### 结果表
| 项 | 结果 | 说明 |
|---|---|---|
| sixty-zhu 单测 | **PASS** | `baihuGambleRefusal.test.mjs` 单跑 32/32 过；全量与 canon:build 中「sixty-zhu payment settles once on the second verified fee action」均 ✔ |
| 单元测试（`npm test`） | **FAIL** | 1153：1146 过 / **2** 败 / 5 skip。① `r2_13_interaction_handoff_demo.test.mjs` Node25 IPC「Unable to deserialize cloned data」flake——单跑 **9/9 过**，忽略。② **新真失败**：`tests/wuyuanOpenWorldSlice.test.mjs:212`「pastry hop preview names 点心铺 and does not commit the clone」，`:220` `assert.match(text, /沿街面进入点心铺/)` 不满足；实际文本「你从五原露天市集出发。你沿“沿人多的街面过去”前往点心铺。路程消耗1轮。点心铺这一侧，甜香和麦粉味压过街面的尘。」。单跑 15/16，稳定复现 |
| canon:build（/tmp 副本） | **FAIL** | 数据步/裁定/契约/37 关 schema 全过；单元测试步（concurrency=1）1156：1150 过 / **1** 败（同上 wuyuan 点心铺）/ 5 skip，exit 1 |

### 原因
02:46 那轮按 P3「短文去重」把 `composeWuyuanOpenWorldNarrative` 中点心铺分支的「你沿街面进入点心铺。」删了（去重本身符合预期），但旧单测仍断言这句。只需改测试断言（例如改为 `/前往点心铺/` 或 `/点心铺这一侧/`），不需要回退去重。

### 结论
- commit/push：**还不行**（canon:build 仍红，1 个单测）。
- sixty-zhu 已绿；剩下的是去重改动引起的测试断言过期。

---

## 回归3c（主策划 03:14 SGT 改断言后；测于 2026-10-03 03:14–03:15 SGT）

规则同回归3b：无 git 写、无仓库改动（测前后 status / diff md5 一致），未碰 8091 / 79521；`/tmp/xt-canon3` 副本（rsync 排除 node_modules + `cp -cR` APFS 克隆 node_modules）跑完已删。Codex task_complete 15→**16**，回复「已只将该断言改为 `/前往点心铺/`，未改正文逻辑」。日志 `r3b/logs/xt-r3c-unit.log`、`xt-r3c-canon.log`。

| 项 | 结果 | 说明 |
|---|---|---|
| 单元测试（`npm test`） | **PASS** | 1156：**1151 过 / 0 败** / 5 skip；本轮未出现 Node25 IPC flake，0 个 Cannot find module |
| canon:build（/tmp 副本） | **PASS** | 全部步骤通过，单测步 1156：1151 过 / 0 败 / 5 skip，「✅ canon:build 完成（35.7s）」，exit 0 |
| sixty-zhu / 点心铺 | PASS | 两条均 ✔ |

### 结论
- commit/push：**可以**（`READY`）。已请主策划 commit+push `feat/fast-no-legacy`（今天全部改动），并更新 GitHub 与 PROJECT-STATUS.md。
