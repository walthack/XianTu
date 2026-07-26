# R2-13 真机验收后的修复交接单

日期：2026-07-26 · 来源：`lcq.stage_04` `s04_05→s04_07` 真机四回合（Playwright 驱动 localhost:8091，主叙事经网络层确认为 OpenRouter/deepseek-v4-flash）

结论：**跨拍承接达标，固定动词未达标。** 建议 `RELEASE-ROADMAP.md:149` 的 R2-13 不整条翻 `[x]`。

## 已验证通过（不要动）

- 固定动词 live 生效，全程无「主线推进／主线判定」。三步依次 `观察 · 易虎` → `观察 · 易虎` → `交谈 · 易彪`，s04_06 显示 `交谈 · 乐明珠`。
- `lastSettledBeat` 落账正确，`【跨拍承接·只演出不改真值】` 确实进了真实存档的 prompt。
- 送别→解毒正文承接良好：火化收尾→启程→探路→凝羽发作→乐明珠把脉→请求解毒→就近落脚，无硬切、无复演。

---

## P0 · 分步合同的步进边界没进提示词，第一拍演完整拍、第二拍逐句复读

**证据**：prompt 里有 `【高光演出硬合同】…不得摘要、并拍或漏拍；全部演完后才可写完成键`（`src/modules/scenarioMods/storyContext.ts:545`），而合同三步的 `actionId`/`actionText` 在整份 prompt 中 grep **0 命中**。回合1 正文一口气演到「易彪磕头留血印／他是我哥」；回合2 开头把「巨石中胸→水没过腰胸肩头顶→磕头血印」逐句重演。

**修**（`storyContext.ts` 的 `eventSection`）：

1. `runtime.ts` 导出一个 `getCurrentContractStep(saveData)`，复用已有的 `eventActionAvailable(action, state)` + `eventActionStates[event.id].preparations`，返回 `{ index, total, action, remainingLabels }`。
2. 多步合同时注入一行：
   `【本拍分步·第 k/n 步】本轮只演到「<action.label>」为止：<action.actionText>。不得演出后续步骤（<remainingLabels>），它们由玩家在后续回合逐拍触发。`
3. **同步收敛 `:545` 的高光硬合同措辞** —— 它现在和分步直接矛盾。多步时改为：「主轴拍点跨 n 个回合逐步呈现；本轮只完整呈现第 k 步，不得摘要或跳步，也不得提前演出后续步」。
4. `:556` 的 Canon Rail `mustReach` 同理：多步未走完时降级为「以下是本拍跨多轮必须达成的完整结果（不是本轮要求）：…；本轮只推进到第 k 步」。

**验收**：空存档从 s04_05 起，回合1 正文止于「易虎救起易彪与年轻军士」，正文中不出现巨石／吞没／磕头。

---

## P1 · 目标名过半是整句（52%）

**证据**：把派生逻辑跑遍全部内置关，388 个确定性动作中 **202 个（52%）** 取不到 canon 角色名，`targetLabel` 退化成整句 `event.objective`；动词分布 **57% 落在兜底「行动」**。例：`行动 · 在不预写灭村真相的前提下进入蛇彝村并安置商队`、`交谈 · 与白夷族长交涉现款支付`。等于把 `【主线推进】` 前缀换成了 `行动 · `。

**修**（`runtime.ts` 的 `deriveInteraction`）：

1. **绝不用 `event.objective` 当 targetLabel。** 兜底改为：拿不到角色名就退成 `event.name`（短名，如「旱洪与易虎之死」）；若仍超过 ~10 字，只显示纯动词，不显示目标。
2. 新增**可选展示字段** `presentation.targetLabel`，人工短目标（「白夷族长」「蛇彝村」）。
3. ⚠️ **该字段必须挂在事件级、不能进 `playerCompletionContract`**：`stableContractHash(contract)`（`runtime.ts:811,824`）对整个 contract 对象取哈希，contract 内任何新增字段都会让 `contractHash` 变化，进而在 `reconcileEventActionContract` 里**重置进行中事件的 `preparations`**（玩家会丢多步进度）。
4. 数据侧 202 条补短目标可另开工单，引擎侧兜底先落地即可止血。

---

## P1 · 动词误分类

**证据**：`s04_04「查明夜晚发丝袭击事件」→ 攻击`（"袭击"命中 attack 正则，实为调查）；`s04b_17「躲避鳄鱼袭击」→ 攻击`（实为规避）。

**修**（`deriveInteractionVerb`）：

- 把 `袭击` 从 attack 词表移除 —— 它多数出现在「…袭击事件」这类名词短语里；保留 击退／迎战／攻击／斩杀／搏杀／交锋／制伏／制服。
- attack 判定前先过一遍规避语境（`躲避|避开|规避|防备|不被`），命中就不进 attack。
- observe 词表补 `查明|查清|识别|辨认`。
- 回归用例：`查明夜晚发丝袭击事件 → observe`、`躲避鳄鱼袭击 → 非 attack`。

---

## P2 · 同一事件连续两步按钮文案完全相同

`观察 · 易虎` 出现两次，玩家看不出进度。多步合同时在 label 尾部加 `（第 k/n 步）`，数据来自 P0 的 `getCurrentContractStep`。

---

## P2 · 视觉主次为零

确定性按钮与 5 个 LLM 自由选项共用 `.action-option-btn.opportunity-action-btn`，同色同宽同字重，仅隔一条细线；且自由选项里出现「询问乐明珠关于混入送亲队伍的具体计划」，与主线 `交谈 · 乐明珠` 撞同一对象。

**修**（`MainGamePanel.vue:136-145`）：给确定性按钮独立 class（左侧主色竖条 + 更重字重 + 「主线」小标签），自由选项降为描边次级样式，两组之间加「其他行动」小标题。纯 CSS + 一行模板改动。

---

## P2 · 点按钮是预填不是提交，且预填的仍是机器指令

`selectScenarioEngineAction`（`MainGamePanel.vue:1563`）只做 `inputText.value = option.actionText`，玩家要再点发送＝每拍两次点击；且 s04_06 预填的是 `我按当前主线目标行动：请求乐明珠为凝羽解毒` —— 动词只换了按钮皮肤，送进叙事模型的还是老句子。

**修**：保留预填（玩家可改后再发是优点），但增加事件级展示字段 `presentation.playerLine`，填玩家视角自然句（「我请乐明珠替凝羽解毒」）。**不要直接改数据里的 `actionText`** —— 同 P1 第 3 点，会改 `contractHash` 并重置进行中事件的 prepare 进度。按钮下加一行提示「点按填入，可修改后发送」。

---

## P2 · 按钮先于叙事跳拍（硬切从正文挪到了按钮）

s04_06 完成当轮，正文停在山神庙「歇一晚再走」，主线按钮已变成 `交谈 · 与白夷族长交涉现款支付`，白夷族长尚未登场。跨拍承接只作用于下一轮正文，按钮没有等待期。

**修**：`getCurrentStoryEventActions` 或其 UI 消费侧，在 `lastSettledBeat` 存在且 `worldTurn - settledAtTurn <= 1`（与 `storyContext.ts` 承接窗口同判据）时，暂不放出新拍确定性按钮，只留自由输入。**只压一轮**，且必须保留自由输入，否则会造出新的卡死路径。

---

## 次要观察（不一定这轮修）

- 走确定性路径两回合后偏离度升到「中偏 41/100」并弹出 `↩ 斩线回轨`，混在动作区里。
- 游戏时间戳三回合固定 09:37，正文却说「歇一晚再走／明天傍晚能到」。既有问题，非 R2-13 引入。
- 跨关启程入口本轮未验到：s04_07 未完成、`nextStageReadyId` 未就绪，`getStageDepartureOffer` 按设计返回 null。

## 复现基准

角色 `char_1784738715254`，存档槽 `R2-13基准`（停在 s04_05）。纯净副本 `.xiantu-server/save-storage/R2-13-BASELINE-R2-13%E5%9F%BA%E5%87%86.json`，覆盖回 `savedata_char_1784738715254_R2-13%E5%9F%BA%E5%87%86.json` 即可重跑。
⚠️ fixture 必须同时在 `characters.json` 的 `存档列表` 里补一条同名条目，否则 UI 存档区看不见它（原文件备份 `characters.json.bak-r213-*`）。
