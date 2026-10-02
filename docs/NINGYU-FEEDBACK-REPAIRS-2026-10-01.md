# 凝羽亲密试玩反馈修复 · 2026-10-01

负责人：Claude（模块策划）。依据：[凝羽亲密对照测试报告](../../playtest-2026-09-28/REPORT-2026-10-01-ningyu-intimacy.md)；主策划复核 [NINGYU-INTIMACY-REVIEW-2026-10-01.md](NINGYU-INTIMACY-REVIEW-2026-10-01.md)。
范围：报告 #1、#2（用户指定"先改"），以及用户当场裁定的"赌还是不赌"分支锁。基线 `4d56a44`，**未提交**；正式 API 配置、正式存档、正典数据均未改。无第三方签核。

## 改了什么

| # | 问题 | 修复 | 玩家看到的变化 |
|---|---|---|---|
| 1 | 道具门禁命中一次就把整段正文（5444 字）换成"本轮没有新的道具交付" | 结构化字段越权（未知道具 ID、未授权写入/引用）只丢弃指令与 `item_references`，正文不动；正文里没有交付回执的"获得"只删所在句，删后仍检出或剩余不足 40 字才回落整段提示；中期记忆同步删句，涉及该物品的行动选项去掉。背包仍只认本地交付回执 | 正文基本完整；只少了"拿到某物"那一句，背包里也不会多出东西 |
| 2 | 意图识别 10 秒超时/报错 → 整回合中止 | 行动解释模块卡 `onFail` 改为 `free_action`：超时、报错、格式坏时按既有"拿不准"降级——照常演出、**不结算任何剧情动作**、不回落关键词判定，并弹提示。取消、过期、存档已变仍中止 | 不再卡住；会看到提示"行动识别没有及时完成，本回合按自由行动处理，不结算剧情动作。" |
| 3 | （用户裁定）重大分支不能让自由输入绕过 | **只用于白湖"赌还是不赌"**：拒赌窗口开启期间（赌局提出后到契书签下前，含面对契书那一拍），输入框只读，选项下方显示「剧情分支需要做出决定」；只能点选继续赌局的主线选项或「拒绝这场赌局」，选中后按发送确认。拒赌后被拿下的反抗/逃跑/服软**不锁**，沿用 Run3 自然识别；其他事件**不锁**，是否推广逐个裁定 | 这一刻打不了字，只能点选项再发送 |

### 第 2、3 条的关系（需知会）

`RUN5-REPAIRS-2026-10-01.md` 曾把"分类失败后当自由输入继续"作为问题修掉（改为中止保留输入），理由是承重拍被当成自由行动演完、状态却没推进。第 2 条把非分支场景改回降级继续，风险由两点控制：降级时**一律不结算**任何剧情动作；"赌还是不赌"这种关键分支已由第 3 条锁死，根本不会走到识别。其余单步承重拍（如谈期限）在识别超时后会按自由行动演出、但不推进——真机时请专门观察这种"正文像谈成了、进度没动"的情况。

## 代码位置

- `src/modules/scenarioMods/fixedInventoryContracts.ts`：`stripUnsupportedGainClauses`、`MIN_KEPT_NARRATIVE_CHARS`
- `src/utils/AIBidirectionalSystem.ts`：固定道具门禁分支（结构化与正文分开处理）
- `src/modules/scenarioMods/naturalIntentRouter.ts`：`degradeToFreeAction`、`NATURAL_INTENT_DEGRADED_NOTICE`、结果 `notice` 字段
- `src/services/moduleModelRuntime.ts`：intent 模块卡 `onFail: 'free_action'`
- `src/modules/scenarioMods/branchDecision.ts`（新增）：`detectBranchDecision`、`branchDecisionAllowsSend`
- `src/components/dashboard/MainGamePanel.vue`：提示弹出、分支横幅、输入框只读、发送校验

## 验证（受控，未用真实模型）

- `npm run type-check`：PASS；全量 `node --test --test-concurrency=1 tests/*.test.mjs`：**1134 total / 1129 pass / 5 skip / 0 fail**；单页生产构建 PASS；`git diff --check` PASS。
- 新增/改写单测：长正文 + 未知道具 ID 保留正文；正文只有一句越权获得时只删那一句；识别失败降级断言；赌局真实夹具上——赌局提出时锁定、自由文本与改写文本不能发送、选中任一选项可发送、被拿下后不锁、窗口外不锁、面对契书那一拍仍在窗口内。
- 浏览器（8091，模型与存储请求全拦截）：
  - `scripts/smoke-baihu-refusal.mjs` **PASS**，已改为验证锁定：横幅出现、输入框只读、未选前发送禁用、点「拒绝这场赌局」后发送 → 被拿下 → 存读档 → 反抗 → 扣押，全程无模型请求。
  - `scripts/smoke-run3-intent.mjs`：`malformed` 在修复前副本（`4d56a44`，临时端口 18110）为"中止并提示"，修复后为"照常演出、无事件结算" **PASS**；`late` 两边 PASS。`matched` 模式修复前后**同样失败**（脚本仍按 Run3 精简路线断言，链路后来已改），非本次回归，未修。正文桩已改为合法 JSON。
  - `scripts/smoke-module-framework.mjs` PASS（回归）。

## 真机请重点看

1. 道具相关回合：正文是否完整、背包是否没有凭空多东西。
2. 自然输入时识别变慢：是否出现提示并继续，而不是卡住；**承重拍是否出现"正文写成已完成、进度没动"**。
3. 白湖赌局提出后：输入框是否打不了字、横幅是否清楚、点选后能否正常发送；被拿下后能否用自然语言反抗/逃跑/服软。

## 未处理

报告 #3 空响应、#4 高好感亲密被世界调度反复打断（待用户裁定）、#5 被拒绝后好感上涨、#6 人称漂移。

## 回滚

本轮改动集中在上述文件；回滚 `branchDecision.ts` 的引用与 `MainGamePanel.vue` 中 `branchDecision` 相关几行即可撤销分支锁，不影响存档结构。

---

## 第二轮：复测后的裁定落地（2026-10-01 晚，用户裁定"先做决定 1 和 2"）

依据：[三项修复真机复测](../../playtest-2026-09-28/REPORT-2026-10-01-fix3-retest.md)。复测结论：道具门禁 PASS、拒赌锁 PASS、识别降级 PARTIAL——fx-pact2 降级后正文写「三个月，我准了」，事件仍停在第 2/2 步，即本说明档上文预警的风险已复现。

**设计原则（用户确认）**：关键决定之后是固定事件链；自由说话可以有，但永远推进不了链，也不能被当作已推进。

### 决定 1：固定事件链上识别失败，停下而不降级（取代上文第 2 条）

| 情况 | 行为 |
|---|---|
| 候选里有合同动作（主线事件、拒赌应对、机会卡）——正在固定事件链上 | 停下：不演出、不结算、保留输入；输入框上方**常驻提示**「这一步关系到当前剧情进度，行动没能识别，本回合没有推进。输入已保留，请点选上方选项，或换个说法再发送。」玩家改输入或重新发送即消失 |
| 只剩地方行动可选 | 仍按上文第 2 条降级：照常演出、不结算、弹提示 |

- 识别器只在有候选动作时才调用，试玩主线上几乎总有合同动作，所以实际效果接近 Run5 的"失败就停"，区别是提示常驻可见（复测与上一轮报告都反映弹窗一闪而过）。
- 模块卡 `intent.onFail` 改为 `hold_on_contract`。代码：`naturalIntentRouter.ts::onClassifierFailure`、`NATURAL_INTENT_CONTRACT_HOLD`；`MainGamePanel.vue` 的 `intentHoldMessage`（放在 `.input-section` 内、输入行之上，与判定确认卡同层；最初放在输入容器内会被裁掉，已经截图确认改正）。
- **根因未在代码里解决**：识别请求已发 `reasoning.effort=none`，但 Jev 不执行，1024 token 全耗在推理（复测 finish=length，另一次 9.8 秒贴近 10 秒截止）。应在 API 设置「回合模块模型」给「行动解释」单独指定不强制推理的快模型，候选模型需先实测。

### 决定 2：契书拍结果显式化（不改名）

- `event.gamble_bond_signed.done` 的含义固定为"这一拍已结案"——签契与拒赌被拿下都会结案。事件 ID 被正典轨道、任务表与存档引用，完成标记路径按项目规则只增不改，**不改名**。
- 新增显式结果标记 `flags.event.gamble_bond_signed.outcome`：拒赌被拿下时写 `'refused'`；读取统一用 `baihuGambleRefusal.ts::gambleBondOutcome()` → `'signed' | 'refused' | 'open'`。下游要判断"签没签"一律读它，不读 `done`。
- 该标记与 `refused_capture` 同等保护：模型命令不得写（`canonGuard.ts`），切关继承（`strictInitializer.ts`）。
- 已核对现有读取方：叙事变体按 `refused_capture` 区分；主线/支线表里"签下卖身契"只是制作侧摘要，不进玩家界面。

### 复测里另外两项结论（未改代码）

- **契书与谈期限的先后**：EPUB 逐章重建记录（R2-11S）原文顺序为南荒之约（qingyu.20.2）→ 赌局落败签卖身契（qingyu.21.1），所以"继续赌局后先谈期限、再面对契书"与原著一致。面对契书那一拍的锁已由单测（真实夹具 `atBond`）覆盖；真机需从谈期限继续往下走才能验证。另有一处小出入（原文凝羽入局在南荒之约之后，数据在之前）交剧情策划。
- **小问题（待用户点头再做）**：「收进怀里/塞进侧袋」未被门禁识别；正文漏出「钩子」（提示词术语被模型照抄）；每回合弹「天机重现」（原版成功提示，与模块链路无关）。

### 第二轮验证

- type-check PASS；全量 **1136 total / 1131 pass / 5 skip / 0 fail**；单页生产构建 PASS；diffcheck PASS。
- 新增单测：识别失败在合同链上停下（主线/拒赌/机会卡三类来源）、只剩地方行动时降级；契书结果三态（开放、拒赌三种应对均为 refused 且 done=true、正常签契为 signed）、模型写 outcome 被拒。
- 浏览器（8091，模型与存储全拦截）：`smoke-run3-intent` malformed——只发 1 次识别请求、不演出不结算、输入保留、常驻提示可见（截图 `.xiantu-server/run3-intent-malformed-hold.png`）PASS；late PASS；`smoke-baihu-refusal`、`smoke-module-framework` 回归 PASS。

### 第二轮真机请看

1. 谈期限等承重拍用自然输入，若识别失败：是否停下、提示是否一直可见、输入是否保留，且**不再出现"正文谈成、进度没动"**。
2. 拒赌三种应对后，存档里 `event.gamble_bond_signed.outcome = 'refused'`。
