# P0 探针结果（自由行动事件票）

日期 2026-10-15。依据 `FREE-ACTION-TICKET-PLAN.md` §12.1 的 P0 五项。本步只读：探针没有改任何游戏代码、没开 8091/8097、没调用任何模型；探针脚本放在 `/tmp`，不入仓库。

**怎么读标记**
- 【运行】= 用 `tests/loadTs.mjs` 载入真实代码，在构造的存档上执行得到的结果。
- 【读码】= 只读源码得出，没有运行。
- 行号取 2026-10-15 工作区（有大量未提交改动，行号会漂移）。

**先说限制**：计划里提到的 MVP 存档位（`mvp-王哲在场`、`mvp-月霜在场` 等）**不在** `.xiantu-server/save-storage/` 里（该目录只有 `lcq.stage_03`、`lyg.*` 的存档，没有一个含王哲/段强的清羽第一阶段存档）。我没有去翻浏览器本地存储，也没有碰 8091。所以探针①用的是**构造存档**，不是 MVP 原存档。

---

## ① 在场名单是否含王哲/段强

**结论：计划里指定的名单来源 `questLineContext(save).presentActorIds` 在这两个场景里是空的；叙事模型实际看到的名单（`readLocalMemoryCapsule(...).presentNames`）是对的。自由行动的“在场名单”应改用后者。**

【运行】做法：用 `createQingyuOpeningPlaytestSave(lcq.stage_01)` 加 `advanceScenarioRuntime` 得到开局存档，克隆后手工把 `activeEventIds` 设成目标事件、`completedEventIds` 设成它之前的事件（**构造状态，不是真实游玩到的状态**），分别调用两个函数：

| 活动事件 | `questLineContext.presentActorIds` | `readLocalMemoryCapsule(save, undefined, []).presentNames` | 其 `presentActors` 的 characterId |
|---|---|---|---|
| `lcq.event.s01_01`（穿越落地） | `[]` | `["段强"]` | `lcq.character.duan_qiang` |
| `lcq.event.s01_02`（段强被射杀） | `[]` | `["段强"]` | `lcq.character.duan_qiang` |
| `lcq.event.s01_05`（见王哲） | `[]` | `["王哲"]` | `lcq.character.wang_zhe` |

原因【读码】：
- `questLineContext.ts:12–20` 的名单只有三个来源：当前/上一拍事件的 `stepScene(...).cast.present`、`sceneLedger.actors` 里 `status==='present'` 的人、任务线 beat 声明的 `presentActorIds`。清羽 `lcq.stage_01` 的 7 个事件、7 个动作里**没有任何一个带 `cast`**（我用脚本数过：withCast=0）；`QUEST_LINES` 里也没有 beat 的 `presentActorIds` 含王哲/段强。
- 叙事真正用的是 `legacyNarratorPacket.ts:301–306`：先取 `card.cast.present`，没有就取 `readPresentNames(saveData, eventId)`（按地点、关系、事件人物算），只有“一个都没声明”时才回落到 `questLineContext(...).presentActorIds`。所以计划 §3.2 写的“口径一致”不成立：问题不在叙事（叙事有人），在自由行动票的名单若照计划取 `questLineContext` 会是空，票会全部因“目标不在名单”被丢弃。
- 对计划的影响：P1 的 `freeActionRosterOf(save)` 应取 `readLocalMemoryCapsule(save, undefined, [...])` 的 `presentActors`（带 `characterId`），不要直接用 `presentActorIds`。不需要改冻结文件。

未验证：真实 MVP 存档位里的名单；星月湖线（`isScopedNaturalIntentSave` 范围内的另一条）没探。

## ② 确认判定后 intent 是否重跑

**结论：会重跑（读码，未运行）。**

【读码】
- `MainGamePanel.vue:2598` 起的 `executePendingJudgement` 在 `:2616` 调 `sendMessage({ skipPreflight: true, resolution })`。
- `sendMessage` 里 `:1976` 的条件是 `if (saveData && !buttonSelected)`，**没有**判断 `execution`。`:1894` 算出的 `isFollowUpExecution` 只用在 `:1906`、`:2070`，不管 intent。
- 自由输入没有选中按钮，`buttonSelected` 为 false；`executePendingJudgement` 不清 `inputText`（`inputText.value = ''` 只出现在 `:1886`、`:2389`、`:2514`、`:2769`，都不在这条路径上），所以同一句话会再调一次 `resolveNaturalIntent`，可能给出不同结果，也多一次模型调用。
- 计划 §3.4 的处理（票写进判定回执、`:1976` 加条件跳过重跑）仍然适用，且是 P2 必须做的一步。

未做：没有用真机跑一轮来观测；这是代码路径结论。

## ③ 事实行是否进入叙事模型提示

**结论：对“试玩范围、intent 返回 free、无选中动作”的回合，追加在 `finalUserMessage` 末尾的事实行会进入模型提示，且进两处；不需要改 `AIBidirectionalSystem.ts:811–813`。但有一个必须处理的关键词守卫风险。**

【读码】
- `MainGamePanel.vue:2194` 起拼 `finalUserMessage`，`:2217` 是既有的 `【本地判定已结算】…` 行，说明“往这个字符串里追加本地结算行”是现有做法。`:2302` 把它传给 `processPlayerAction`。
- `AIBidirectionalSystem.ts:1237` 把该参数原样作为 `userMessage` 传给 `tryModularTurn`。
- 范围：`isScopedNaturalIntentSave`（`playtestNarrativeScope.ts:43`）= `isScopedPlaytestSave && storyMode!=='world_sim'`，而 `tryModularTurn` 的 `moduleOnly = isDemoModuleOnly = isScopedPlaytestSave`，前者是后者的子集，所以收票的回合一定走 modular。
- 自由回合没有选中动作时 `plan` 为空（`AIBidirectionalSystem.ts:748–750`：`moduleOnly` 时 `oldPlan=null`，`fresh` 为空），`compiled` 为空，场景对象走 `:811` 一支：`action: userMessage`（进 system 提示），同时 `:821` `playerLine = plan?.playerLine || userMessage` 作为模型 `input`。事实行因此出现两次。
- 判定类走 `:812` 的 `公开判定: formatVerifiedJudgementReceiptForPrompt(options.judgementResolution)`，不依赖事实行。
- 不适用的情形：`intent.kind` 是 `matched/alias`（有选中动作、`plan` 非空）时，`action` 不进场景、`input` 是 `plan.playerLine`，事实行到不了模型。票只在 `kind==='free'` 时收，所以不受影响，但要在文档里写明不可放宽。

**风险（计划里没有）**【读码】：`userMessage` 还会被若干关键词守卫扫描，事实行的用词会碰到它们：
- `AIBidirectionalSystem.ts:760` `previewWangZheStayEnding(saveData, userMessage)`（`runtime.ts:3765–3772`）：在 `lcq.event.s02_02` 且 `witness_wang_zhe_nine_suns` 成功之后，文本含“留下 / 留在原地 / 不逃 / 不撤 / 我不走”会直接触发王哲留守死亡结局；含引号 `“”「」`、`他说/她说`、`不是`、`离开` 等则被豁免。**这恰好是“攻击王哲”会发生的场景**，事实行（如“留下伤痕”“没有离开”）必须避开这些词，P1/P2 要加一条单测：任何事实模板渲染结果都不能让 `previewWangZheStayEnding` 返回非空。
- `:742` `/盘问|拉扯|逃奴/.test(userMessage)`、`:726`/`:2743` `isLocationLootInput(playerIntentText || userMessage)`、`:910` `assertPlayerAgency(text, userMessage, present)`。后两者里 `playerIntentText` 是不带事实行的原话（`MainGamePanel.vue:2263`），所以只有前面几处会看到事实行。
- 结论：可以走 `finalUserMessage` 通道，不动冻结文件；事实行用词要受测试约束。

未做：没有运行一次真实的 `tryModularTurn` 来看最终提示文本。

## ④ grant 是否进状态流

**结论：会（读码，未运行）。往 `runtime.pendingLineAffinityGrants` 追加的条目，会在同一回合的 `processGmResponse` 里被取走并变成状态流条目。**

【读码】
- `runtime.ts:3842–3843`：`advanceScenarioRuntime` 取走 `pendingLineAffinityGrants` 并 `delete`。
- `AIBidirectionalSystem.ts:3497`：`processGmResponse`（`:2654` 起）内调用 `advanceScenarioRuntime(saveData)`；`:3533–3541` 把每个 grant 变成 `{key: npcRecordPath(id,'好感度'), action:'shared_experience', oldValue: from, newValue: to, targetName: name, characterId}`。所以 grant 必须有 `characterId/from/to/name` 四个字段。
- modular 回合也经过这里：`processGmResponse` 内有 `response.moduleReceipt` 分支（`:2722`、`:3287` 等）；我列了 `:2654–:3497` 之间函数层级的 `return`，只有 `abortUncommitted(...)`（`:2713`、`:3115`、`:3206`、`:3239`）和两个与 grant 无关的内部函数返回，所以未中止的 modular 回合会走到 `:3497`。
- 取不走的情形（【读码】`runtime.ts:3825–3834`）：`advanceScenarioRuntime` 在 `activeScene(next)`（场面模块进行中）、`gameOver`、或触发失败结局时**先返回**，grant 留在存档里等下一次推进。场面期间输入本来由 `submitSceneInput` 接管（`MainGamePanel.vue:1881–1888`），自由行动不介入，所以不冲突。

未做：没有端到端运行；也没有验证“MainGamePanel 里 `toSaveData → 结算 → loadFromSaveData` 之后 `processPlayerAction` 读到的就是含 grant 的存档”，这条沿用 `persistJudgementSave`（`:651`）同一模式，属推断。

## ⑤ `mustSurvive` 能否从角色卡/总表读出

**结论：现在读不出（字段不存在），而且“加在总表里就能读”不成立：总表→运行时角色有一道白名单，构建脚本也有一道白名单。不改冻结文件就能解决，但需要三处小改。**

【运行/读码】
- 仓库全文搜 `mustSurvive`：除计划文档外无命中（`src scripts mod-kit tests docs`）。
- 总表条目（`character-registry.json`，王哲为例）的顶层键：`id, canonicalName, aliases, gender, books, tier, stagePresence, staticProfile, phaseIdentities, review, embedText`。
- 运行时角色（角色卡的来源）由 `characterResolver.ts:296 resolveOne` 从总表**按字段名复制**（`entityType/gender/role/description/profile.*`）。新增的顶层字段不会被带到 `runtime.canon.characters[]`，`npcCardLayer.readNpcCard`（读的是 `runtime.canon.characters`）因此也读不到。
- 构建脚本 `scripts/build-character-registry.mjs:138–150` 用显式键列表生成总表条目，可选字段用条件展开（`entityType/presenceWindow/naming` 都是这个写法）。新字段若不在这里加一行，会被丢掉。
- 可行读法：在 `characterResolver.ts` 按已有先例加 `getRegistryMustSurvive(id)`（先例：`getRegistryAgeFacts :276`、`getRegistrySpeechStyleById :393`，`npcCardLayer.ts` 已在用后者），`RegistryEntry` 接口加 `mustSurvive?: boolean`；构建脚本加一行 `...(c.mustSurvive !== undefined ? { mustSurvive: c.mustSurvive } : {})`；源卡 `character-cards-v3` 里打标。**不需要**让 `resolveOne` 复制，也不进提示词。以上三处都不是冻结文件。
- 没核实：`canon:build` 的 37 关里有没有对总表顶层键做严格白名单校验（我没读 `scripts/canon-build.mjs` 里各关的内容）；改源卡/总表需先读 `CANON-DECISIONS.md` 并在同一提交追加裁定。

---

## 冻结文件结论

| 项 | 是否需要改 `runtime.ts` / `AIBidirectionalSystem.ts` |
|---|---|
| ① 名单 | 否（改取名单来源即可） |
| ② intent 重跑 | 否（`MainGamePanel.vue`） |
| ③ 事实行进提示 | 否，但用词受 `AIBidirectionalSystem.ts:760` 守卫约束，须单测 |
| ④ grant 进状态流 | 否 |
| ⑤ mustSurvive | 否 |

没有任何一项需要动冻结文件，所以计划里 D12（授权改 `AIBidirectionalSystem.ts:811–813`）不需要批准。

---

# 本步另外两项改动（非探针）

## A. “她说”类转述误判

**定位**：同一组转述词（她说/他说/别人说/有人说/他们说/他问/她问）在仓库里有多份拷贝。我复现了“她说你要砍我吗”及变体在各处的实际结果（【运行】）：

| 位置 | 修复前 |
|---|---|
| `naturalIntentRouter.ts:107 hasUnclearIntentFrame` | 全部判“含糊句式”（正确，不当作动作）。但是**子串匹配**，`我对她说…`、`她说完，我一刀砍向她`、`我跟她说话` 也被误判为含糊——这一支是“漏掉玩家动作”，方向相反，**本步未改**，见“需用户决定” |
| `sceneModule/inputPolicy.ts classifyByRules` | `她说你要砍我吗`→`unclear`（会让玩家澄清，不算误判）；**`她说你要砍我`、`他说你要攻击我`→`action`（误判）**，因为行动词判断排在转述判断前面；`她说你看到周围有什么吗` 这类带观察词的转述会被当“观察行动” |
| `utils/judgementPreflight.ts buildLocalJudgementPreflight` | **`他说你要攻击我`、`别人说你偷袭了她`→`combat` 判定卡（误判）**，`RISK_RULES` 没有任何转述/问句守卫 |
| `baihuGambleRefusal.ts:36`、`runtime.ts:1545/3771` | 已有各自的转述守卫；`runtime.ts` 是冻结文件，没动 |

所以“她说你要砍我吗”这句话本身，在我查的三处里没有被当作动作；会被误判的是**不带问号/“吗”或换成“攻击/偷袭”等词**的变体。我如实写出，没有把它说成“已复现原句误判”。

**修复**（只动场面输入分类与判定预检这两处会误判的地方）：
- `inputPolicy.ts` 新增并导出 `stripReportedSpeech(text)`：从转述标记起到句末的内容视为别人的话；`对/跟/向/朝/和/同/给/替/诉` 之后的“她说”（玩家自己在说话）和 `她说完/他说话` 不算转述。
- `classifyByRules` 的行动词、观察词、场内要素只在剥掉转述之后的文字里找；问句、`FRAME` 判断仍用原文。结果：纯转述句判 `chat`（strong），仍受 `route()` 的“模型判行动则改道”兜底。
- `buildLocalJudgementPreflight` 的 `RISK_RULES` 只在剥掉转述之后的文字上匹配；世界模拟介入与 IF 意图分支不动。

**单测**：`tests/reportedSpeechFrame.test.mjs`（4 条）：剥离函数的边界；场面分类中 9 句转述不判行动、7 句玩家自述照常判行动；预检中 5 句转述不发卡、4 句玩家动作照常发卡。

## B. 意图票/状态提案的“丢弃原因”日志

**现状**：计划里的“自由行动票”（`freeAction/ticket.ts`）还不存在，没有它的丢弃路径可加；现有的“票”是：意图路由的候选选择、状态提案（`statusProposals`）。给这两类各丢弃路径加了日志，将来 P1 的自由行动票调同一个函数即可。

**实现**：`services/requestLifecycleDiagnostics.ts` 新增 `noteTicketDiscard(kind, reason, key?)`、`peekTicketDiscards()`、`clearTicketDiscards()`。只记 `{kind, reason, key, turnId, at}`；字段过 `token()`（只允许 ASCII 字母数字/`._:-`、≤160 字符、拒绝 `sk-`/`bearer` 开头），中文、过长、像密钥的内容记为 `unknown`/`null`，所以**玩家原文、模型证据、报错原文都进不了日志**。环形缓冲 500 条，并 `console.info('[票丢弃]', row)`。

接入点与原因码：
- `naturalIntentRouter.ts`：`low_certainty`、`missing_action`、`bad_evidence`、`rejected_intent`、`non_affirmative_evidence`、`stale_or_ambiguous_candidate`、`missing_affinity_assessment`（票键=模型给的 actionId）；`malformed`、`classifier_error`（在 `onClassifierFailure` 里）；`stale`、`state_changed`。模型明说 `none` 不是丢弃票，不记。
- `MainGamePanel.vue`：`input_changed`、`slot_changed`、`save_changed`、`fresh_selection_failed`（意图返回后被丢弃的四处，票键=actionId）。
- `sceneModule/host/freeTextStatusSemantic.ts`：`clarify` 增加原因码参数，`unparsable`、`bad_structure`、`bad_list`、`bad_item`、`extra_fields`、`out_of_contract`、`bad_evidence`、`uncertain_actor`、`input_only_status`、`contradictory`、`ask_failed`；被忽略的提案 `ignored_other_actor`、`ignored_hypothetical`（票键=statusId）。返回给玩家的文字与 `resolved` 的结构都没变。

**单测**：`tests/ticketDiscardLog.test.mjs`（4 条）：日志字段过滤（中文/过长/`sk-` 不入）；意图票 4 条丢弃路径逐条断言原因码、票键且不含玩家原文与证据；`none` 不记、生成函数抛错记 `classifier_error`；状态提案 10 个原因码。

**没覆盖**：`MainGamePanel.vue` 里那四处是 Vue 组件内的单行调用，没有单测，只做了语法层面的核对（见汇报）；真机未验。
