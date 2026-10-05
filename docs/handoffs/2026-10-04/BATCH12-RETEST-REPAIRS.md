# 第十二批 · r11返修交接

保留第十一批、黑魔海引子及其他原工作区改动；不提交、不推送，不改合规字段。备份：`/tmp/xiantu-batch12-before.tgz`。裁定簿新增 #193。

## 逐项根因、改动与验证

1. **第65章朱老头闲聊**：rail仍停在 mirror 章节，闲聊只登记 aftermath 章节；13完成又立即强制离开白夷，两个条件同时阻断。overlay把闲聊登记到 mirror；runtime旧档补章节成员；行旅账将13的半日离城结算延至玩家选择去山谷。主线可直接离开，不强制闲聊；完成闲聊则恢复原强制离城路线。自由输入识别加入 exploration 候选并重新校验，一次完成后不再出现。
   - `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json:10799`；`runtime.ts:2313,3863`；`travel/travelLedger.ts:375`；`naturalIntentRouter.ts:140,198`。测试模拟正常 rail 章节与白夷窗口，验证按钮/原句识别/单次结算/离城半日只记一次。
2. **谢艺性别、苏荔身份、父系泄露**：gender 已在 presentActors，但正文未校验；父系旧守卫要求同句提到小紫，结果材料也直接读事件 description。新增已知性别主语守卫（对象代词不误判）、苏荔花苗族长/非母亲事实守卫；父系无须出现小紫也拦；settledOutcome与最终兜底共同经过105门。18事件 description/axisBeat/选项去掉提前公开的遗腹女，已确认105后仍由身份事实提供。旧档刷新同合同文本，不清进度。
   - `narrativeBoundaries.ts:89,100,125`；`AIBidirectionalSystem.ts:779,818,864,912`；`legacyNarratorPacket.ts:254`；overlay `:8902`；对应 builtin `:4195`；`runtime.ts`同文本合同迁移名单包含18。守卫沿既有静默重写/固定承接，不新增红字。
3. **s02_04引导**：现有花括号解析本来可解析报告所示完整围栏JSON，不能仅凭代码块认定根因。显式去围栏以兼容；无有效动作选择时，盘问/拉扯/逃奴意图仍返回点心铺前置引导，既不误结算也不走模型编自由正文。
   - `naturalIntentRouter.ts:205`；`AIBidirectionalSystem.ts:723`。测试同一分类对象 plain/fenced 意义一致、坏JSON不授权；不改证据/候选匹配检查。
4. **黑魔海地理误读**：材料缺直接释义。模块演出材料明确为勾结鬼王峒的宗派；补海域/封印物误写守卫，不开放毒宗。
   - `AIBidirectionalSystem.ts:818`；`narrativeBoundaries.ts:125`。
5. **凝羽姓名先后、天竺**：固定事实有姓名但无对白顺序约束。材料明确先凝羽说西门庆，再由主角反应；正文守卫拦抢先姓名与天竺编造，沿静默重写。未新增硬编码正文。
   - `AIBidirectionalSystem.ts:819`；`narrativeBoundaries.ts:129`。
6. **重复时间**：模型带裸仙道日期，旧处理仅去括号前缀；push记忆也独立补前缀。模块正文入口去重复日期，历史/短期/push统一使用 composeShortTermMemoryEntry，保留引擎时间。
   - `memorySanitizer.ts:43,50`；`modularTurn.ts:89`；`AIBidirectionalSystem.ts:5083`。测试裸日期与括号前缀组合只留一份时间。
7. **小紫虚构势力**：旧关系字段仍保留自动补出来的占位组织。同步已揭示小紫资料时清理该占位势力与列表，不推测真实组织，不开放师承。
   - `runtime.ts:3741`。
8. **跨关认知次序**：原面板把关内回合当跨关统一时间。按已有 chronicle 全局 sequence 排序，显示来源关与关内回合；没有历史出处显示未记录，不编造全程回合。
   - `eventNarrativeView.ts:230`；`EpistemicLedgerPanel.vue:25,36`。测试02关60回合仍排在04b关3回合之前。挂载测试仅补data-URL加载真实TS模块的适配，不改断言。
9. **血虎与无来源遗物**：正文缺事实约束。材料与守卫禁止把武二郎虎斑当血虎身份线索、禁止编死老头遗物；不改武二郎正常虎斑描写。
   - `AIBidirectionalSystem.ts:818`；`narrativeBoundaries.ts:127`。

## 本轮文件

- overlay04b、对应 builtin04b、manifest；ignored generated qingyu stage04b（源description/axisBeat同步，未强行加入git）。
- canon裁定簿；PROJECT-STATUS.md；PLANNING-ROUNDS.md；本交接。
- runtime.ts、travel/travelLedger.ts、naturalIntentRouter.ts、narrativeBoundaries.ts、legacyNarratorPacket.ts、eventNarrativeView.ts、modularTurn.ts、AIBidirectionalSystem.ts、memorySanitizer.ts、EpistemicLedgerPanel.vue。
- tests/batch12RetestRepairs.test.mjs（新增6例）、nanhuangTravelLedger.test.mjs（夹具先体验可选闲聊后验强制路线，原0移动断言不变；跳过分支由新夹具覆盖）、epistemicLedgerPanelMounted.test.mjs（加载适配，不改断言）。

## 验证与限制

定向9文件58/58；tsc0错；npm test1296项，1291通过/0失败/5既有skip。canon:build与diffcheck结果见下方追加。原第十一批/第八批断言均保留通过；旧档与正常章节窗口有定向夹具，不等同新真机PASS。已知性别守卫只判断有依据的明确主语，复杂指代仍需真机复核；无历史全程回合记录的条目不做猜测迁移。本轮未做真机，不提交推送。

### 最终门禁（代码冻结后）
- tsc --noEmit：exit0，0错误。
- 定向9文件：58/58，exit0。
- npm test：1296项，1291通过/0失败/5既有skip，exit0，5.7s。
- canon:build：全步骤通过，47.6s；内置单测同为1296项1291通过/0失败/5skip；manifest `9184f44b9175`。
- git diff --check：通过；裁定#193已单向同步NAS。没有提交/推送，没有真机复测。
- 复跑途中曾遇scenarioModStoryContext文件Node IPC deserialize错误；单跑31/31通过，之后全量与canon均绿。未改断言/skip以绕过该错误。
- 日志：`/tmp/b12-tsc.log`、`/tmp/b12-focus.log`、`/tmp/b12-test-green.log`、`/tmp/b12-canon.log`；偶发证据`/tmp/b12-test.log`及`/tmp/b12-ipc-single.log`保留。
