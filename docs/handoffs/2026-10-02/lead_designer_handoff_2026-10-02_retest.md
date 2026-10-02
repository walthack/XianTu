# 《六朝仙途》测试 + 剧情交接（2026-10-02 续测后）

- 来自：剧情策划兼测试｜2026-10-02 SGT
- 路径约定：仓库 = `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`；测试产物 = `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/playtest-2026-09-28/`（下文简写 `work/playtest-2026-09-28/`）

## F. 分工说明（请先看）

请只改代码，改完回复改了什么即可；全量测试和真机复测由我（测试）来跑，不用你自己跑测试。

---

## A. 用户拍板：模型路由（最优先，对应 B1）

1. **演出请求换成 MiniMax 路由**。现在是 `typesafe/jev-router` 经 openrouter；对照测试里 MiniMax 23/23 成功。
2. **改成流式请求**；按首字时间 / 空闲时间判超时，不再用 60 秒总超时。
3. **关掉 reasoning**。现在 effort=low，推理 token 约占输出 40%。
4. **失败提示「2次未通过」与实际请求次数对齐**。

数据：`work/playtest-2026-09-28/b6/logs/o2-analysis.txt`
- 96 次请求，46 成功，50 超时；
- 超时全部是 `firstContentAt=null`（首字都没到）；
- 慢档只有 11–21 tok/s；成功请求平均 reasoningTok≈488 / outTok≈821。

我顺手查到的相关位置（只读，供参考，以你判断为准）：
- 模型配置：运行时在 localStorage `api_management_config`（provider=openrouter, model=`typesafe/jev-router`）；
- reasoning：`src/services/optionalReasoningParams.ts`（默认返回 `{ reasoning: { effort: 'low' } }`）；
- 60 秒：`src/services/qingyuTurnLongRequests.ts` 的 `QINGYU_TURN_DEADLINE_MS = 60000`、`src/services/aiService.ts:832`（total 超时）；
- 「N次未通过」文案：`src/utils/AIBidirectionalSystem.ts:774–775`、`src/components/dashboard/XingyuehuQuestPlaytestHud.vue:16`。

---

## B. Bug 清单（B1–B17，建议先修 B1–B5 再回归）

| # | 严重度 | 事件 | 现象 / 复现 | 证据 |
|---|---|---|---|---|
| B1 | 高 | 全程 | 演出请求 52–62% 在 60 秒超时，非流式，第二稿来不及发；提示文案说「2次未通过」，实际只发了 1 次请求 | net.log、o2-analysis.txt |
| B2 | 高 | sudaji_south_pact | 谈期限第 1 步后两个按钮变成无说明的「前往/行动 · 苏妲己」；点「行动」直接填入死亡选项原句，玩家容易误触死亡（两条分支各复现一次） | 报告 16:27/16:34 段 |
| B3 | 高 | escape → sheyi_village | stage_02 后半段位置一直卡在「五原·白湖商馆门前街」，HUD 前缀也一直是「去五原城」；正文因此错位（刚过铁索桥又回到商馆侧墙） | narrative.log T6、存档 `角色.位置` |
| B4 | 高 | zixi / black_shoal | 模型退化出的无标点长句（「…画蛇添足之举可以休矣」）直接展示并写进存档，没有质量守卫 | `叙事[35]/[36]`、`receipts[14]/[15]` |
| B5 | 中 | wuerlang_joins（冰蛊） | 死亡结局回合没有死亡正文，反而写武二郎跟上来，和结局卡矛盾 | 截图 010、adv5.out |
| B6 | 中 | free_ajiman 第 1 步 | 锁出现前，正文已经替玩家把身契「纳进贴身衣襟」，等于预演了不撕选项；没写五十金铢买契，反而编造身契「事先备妥」的来历；阿姬曼不出场 | 截图 049 |
| B7 | 中 | free_ajiman 撕契 | 没写「当着阿姬曼的面」，也没有「阿姬曼生气」这场戏；有孤立的「你没接话」 | 截图 009-c2-T-tear-r2 |
| B8 | 中 | wuerlang_joins 第 2 步 | 按钮填入的是第 1 步原句，引擎却记为 `secure_wuerlang_southbound`，玩家发出的句子和落账动作不一致；后半段按钮只有「观察/行动/交谈」，无说明 | adv6.out T2/T3 |
| B9 | 中 | sudaji_south_pact | 两条分支都编造「蜡封竹片」道具，没进背包 | 报告前段 |
| B10 | 中 | black_shoal / zixi / escape | NPC/叙事越权并落档：编造伤亡数字、编造此前约定、替玩家认人、凝羽替玩家定出城方案 | receipts[10]、叙事[36] |
| B11 | 中 | 多处 | 「。；」拼接残留（显示正文和记忆字段 receipts[].memory.value；系统.历史.叙事 存的是分段，问题在显示/记忆拼装层） | 多张截图 |
| B12 | 中 | sudaji_south_pact 第 2 步 | 等 37 秒只显示一句 47 字固定句 | receipts 08:35 |
| B13 | 中 | sudaji_south_pact A3 | 正文结尾「别让他死了」和死亡结局矛盾；结局事实用「依约执行」，但玩家正是拒约 | 报告 A3 段 |
| B14 | 轻 | ningyu_enters_gamble | 「接赌」发出的原句和正文都没写出接下赌局 | 报告前段 |
| B15 | 轻 | escape / wuerlang / 多处 | 武二郎凭空出现；武二郎、阿姬曼不进人物关系；凝羽、苏妲己常只写「她/对方」 | — |
| B16 | 轻 | 全局 | `[DEMO_MODULE_ONLY]` 用 console.info，非调试模式看不到；失败日志 `AI生成失败` 丢了 message | 报告 O1/O2 |
| B17 | 轻—需拍板 | 单测 | F1 伪造动作只给通用失败文案；F2 新测在 s01_01 中断（path=local）；F3 测试自身比较缺陷；F4 隔离守卫被去掉；F5–F7 只有旧路径断言，模块路径没有替代测试 | `b6/unit-tests.log` |

完整报告：`work/playtest-2026-09-28/REPORT-2026-10-02-nolegacy-retest.md`（「续测」一节）。

---

## C. 死亡结局改固定文本

固定正文在 `~/Desktop/narrative/结局/`（已核对存在）：
- `E01-不赌·炮烙.md`
- `E02-不撕·冰蛊.md`
- `E03-拒约·炮烙.md`
- `E04-不走·王哲自爆.md`

规格：结局触发时，先由模型写 1–2 句接住玩家的选择，后面接固定正文（约 600 字，第二人称）。

B5 的冰蛊结局正文缺失可以一起用 E02 解决。

结局配图还在重新调风格（目录里的 jpg 是过程稿），**这次先不要接具体图片**。

---

## D. 需求：图片 cut-in 通用功能

剧情数据里任意一拍（不只是死亡结局）都能标一张图，到这一拍时插图显示。图片同编号命名（如 `E01-xxx.jpg`）。先做通用口子，图后续给。

---

## E. 角色卡勘误（请审阅后再改）

勘误清单：`~/Desktop/narrative/角色卡勘误_给主策划.md`

今天在文末追加了「待定补充（2026-10-02）」一节：
- 总则：所有设计角色都满 18 岁；成年角色可以娃娃脸，但涉性内容一律按成年人写；
- 小玲儿、安乐公主改为满 18 岁。

另外，邓晶、蛇夫人、小玲儿、危月燕、襄城君（即孙寿，两张卡合并为一张）的勘误条目目前还没写进清单，黛绮丝也只在 A23（黛姬雪娜卡）里被提到、没有单独条目；这些我整理好后再补。

**规则：改角色卡之前请先确认，清单内容请审阅后再改，不要直接动卡。**
