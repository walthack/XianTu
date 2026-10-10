# P0修复只读二审（2026-10-11）

初审job `claude-2026-10-10T18-31-35-293Z-3f9bbd63`，Opus 5.5，exit0/sourceGuardPassed=true。审查有一次未跟踪复现文件误写，审查方核对后已删除；无产品源码改动。

## 二审结论：不通过（需修 1 个新增 P1，另有 2 个 P1 等你定口径）

HEAD 已用 `git rev-parse` 核对，是 `5ca11358…`。V02（`controller.ts`）和 V03（`settledStepScene` 接线）没发现阻断缺陷。问题集中在 V07 的状态挂载这一侧。

**先交代一个操作失误：** 写复现脚本时，我多打了一条 `cp`，把临时测试文件 `p0repro.test.mjs` 写进了仓库根目录。我核对它是未跟踪文件、和 `/tmp` 里的原件一致后删掉了，`git status` 里已经没有它。除此之外没有改动工作区、没有提交，也没有碰浏览器、游戏 API 或密钥。复现脚本放在 `/tmp` 下跑，相关测试另外跑了一次：3 个文件 20 过 0 败。

---

### P1-a（新增回归）：路由带回状态提案后，正文里写的醉酒不再挂载，正文否认也拦不住
`src/modules/sceneModule/host/freeTextStatus.ts:66-72`

只要路由返回了 `statusProposals`（空数组也算），`evidenceScope` 就是 `'input'`。这时正文裁定只保留 `freeText==='narrative'` 的状态，而 drunk 是目录里唯一的 `input` 类状态，于是：
- **正文写的醉酒丢了。** 例：输入「我端起酒碗陪他们一碗接一碗地喝。」，提案为 `[]`，正文「你喝得酩酊大醉，脚下发飘。」。旧逻辑挂 `[醉酒]`，新逻辑挂 `[]`（已复现）。
- **正文否认的守卫也没了。** 旧逻辑第 44 行有 `!told.some(m=>!real(m.clause))`，正文否认时玩家自述不生效；新的语义路径绕过了它。现在这组用例碰巧仍然挂上醉酒，但那是因为旧逻辑的否认识别本身也没认出这句，不能算守卫在工作。

语义系统提示自己写的是「input条目可从玩家输入或正文识别」，任务口径「不覆盖旁白伤势裁定」也只针对伤势。所以这是范围外的行为变化，不是设计意图。现有测试（`p0StatusSemantic` 第 46–57 行）只覆盖了 narrative 类状态，没测到这一点。
**修法：** 在 input 范围下，正文裁定改为 `adjudicateFreeTextStatuses(narrative,'')` 覆盖全部 freeText 状态，再与语义提案的 input id 取并集；正文明确否认某状态时，从语义 id 里剔除它。补两条测试：正文写醉要挂；正文否认时不挂。

### P1-b（覆盖缺口，需确认口径）：无候选及其他不调模型的路径，没有语义识别
`naturalIntentRouter.ts:389-391`（`!candidates.length` 时不调模型直接返回 free），另外快速路径、alias、练功正则、`!isScopedNaturalIntentSave`、`no_classifier`，以及纯开放世界候选失败时的降级（第 86 行）也一样。

这些路径上 `freeTextStatusResolution` 都是 undefined，会退回关键词裁定。V07-H2 原句「我连灌了几碗烈酒，头重脚轻，站都站不稳。」不含任何别名，在这些状态下不会挂醉酒。所以真机通过的前提是测试存档当时有剧情候选。
「共用 intent 请求」本身就意味着没有请求就没有识别，这不算新代码写错。但如果 V07 固定组里有样本落在无候选的时刻，就会失败。请确认固定样本所在的状态；或者在无候选时仍发一次只带 statusCatalog 的同模型请求。

### P1-c（会误挡负例，可恢复）：低置信度的非主角提案也会被要求澄清
`freeTextStatusSemantic.ts:46`

`confidence < 0.9` 的判断在 actor/assertion 分支之前，所以 `actor:'other'`、`assertion:'denied'` 或 `'hypothetical'` 的提案只要置信度低，就返回 clarify。路由第 425 行再把它变成 hold，连同已经匹配上的剧情动作一起被挡住。已复现：
- 「他喝醉了，我扶他坐下问话。」，提案 other、置信度 0.8 → clarify
- 「我滴酒未沾。」，提案 denied、置信度 0.85 → clarify

不会把状态结算错，但负例和与主角无关的句子会被误挡，结果取决于模型给的置信度。
**修法：** 置信度阈值只作用于 `actor==='player' && assertion==='current'`；other、denied、hypothetical 直接 continue。

---

### P2
1. `naturalIntentRouter.ts:423-424`：模型漏掉 `statusProposals` 字段时退回关键词裁定。注释说明这是为兼容旧响应，可以接受；只是生产提示要求必须带这个字段，漏字段时也许应该记一条审计。
2. `freeTextStatusSemantic.ts:40-42`：input 范围下，模型提出 narrative 类 id 或 `source:'narrative'` 时整句被挡。可恢复，属于健壮性问题。
3. `AIBidirectionalSystem.ts:818-819`：「本轮已验证主角状态」给演出模型的是 `['drunk']` 这样的 id，不是 label「醉酒」。
4. 既有问题，非本次引入：`AIBidirectionalSystem.ts` 约 2936 行，未登场人物守卫用 `stepScene(eventAction)` 的 fixedFacts 当姓名白名单，没有检查 `attempted`。未尝试的 eventAction 会放宽守卫，但不会进提示词。

### 核过、没有问题的点
- **V03 未尝试不泄漏：** moduleOnly 路径在 `!attempted` 时直接抛错；legacy 路径的 `settlementAttempted = attempted||completed`。所以「作者步骤限定」那段 actionText 只在已尝试时注入。删掉的凝羽两条硬编码说明，在已尝试时由对应卡片的 fixedFacts 和 `validateQingyuNarrativeFacts` 覆盖。未尝试时只剩 focus 的 objective，以及按事件声明的边界提示，没有固定条件。
- **V02：** 只缓存「模型给出、有 plan、inputClass 为 action」的结果，老的失败缓存不再命中；测试锁定了「失败后同快照重试」和「正向结果复用」两种情况。
- **生命周期/跨槽：** 状态提案在路由的取消检查和快照指纹检查之后才做验证；MainGamePanel 拿到结果后又核对了输入、槽位和指纹。clarify 走 finally 释放处理状态，不写存档。
- **没有关键词扩词：** 目录只传了 `meaning: d.source`，`statuses.json` 没有改动。
- **模型配置：** 仍走 `runGameModelModule('intent')`，4096 的 token 预算够用；`recognizeFreeTextStatuses` 只在测试里用到。

未测的部分（V07/V03 其余固定组、canon:build）我没有判成通过或失败。P1-a 修好后 V07 才能判通过；P1-b、P1-c 请你决定是否列进本轮。

## 实施裁定

P1-a核实为新增回归，恢复全部正文状态原裁定与既有否定守卫；P1-c属于同一语义识别机制，修正无关/否定提案不因低置信阻断；P1-b无候选路径仍发同配置intent状态请求，快按钮/别名/练功/legacy保持既有兼容路径，不扩功能。新增3项聚焦测试21项全过。定向复审job `claude-2026-10-10T18-37-59-859Z-ef510125`进行中。初审不通过保留，不能因修复未测直接改PASS。

## 定向复审完成

job `claude-2026-10-10T18-37-59-859Z-ef510125`，exit0/sourceGuardPassed=true。

**PASS at code level.** P1-a, P1-b and P1-c are all closed, and I found no new P0 or P1. The real-model rerun of the new package hasn't happened yet, so it doesn't count as a real PASS.

I didn't edit any repo files. Tests ran with `JITI_FS_CACHE=false`, and my probe scripts are only in `/tmp`. During the review a new untracked folder appeared, `docs/handoffs/2026-10-11/P0-READONLY-REVIEW.md` (timestamped 02:39). Some other process wrote it, not this review.

## Status of the three findings

**P1-a, drunk lost when stated only in the narrative: closed.** In `src/modules/sceneModule/host/freeTextStatus.ts:66-73`, when the semantic result covers only the player's input, the code still runs the existing narrative check (`adjudicateFreeTextStatuses(narrative, '')`). A status the model proposes from the input is also blocked if the narrative has a "你" sentence that negates it or calls it hypothetical (the existing `mentions`/`real` guards). No new words were added. Probes run in `/tmp`, all using the existing name list:
- Empty semantic result plus "你醉酒了" in the narrative → drunk is mounted (same as the old behaviour).
- Semantic says drunk, narrative says "你并未醉酒" or "你若是醉酒" → not mounted.
- "他醉酒了" → not mounted.
- Semantic says drunk, narrative says nothing → mounted.
- A drunk status the narrative model added on its own, with no evidence → still removed.

**P1-b, no action candidates means no semantic recognition: closed.** `naturalIntentRouter.ts:388` no longer returns early, so it sends the same configured intent request with an empty candidate list plus the status catalog. If the action is `none` or not in the list, verification fails, so nothing can be settled. The worry was that the new request could block a player with no candidates if it fails. It doesn't: `onClassifierFailure` with an empty list gives `free` with a warning notice, not a hold. Button, alias, cultivation and legacy-save paths still return before the model call, which matches the agreed scope.

**P1-c, irrelevant low-confidence proposals blocking a valid action: closed.** In `freeTextStatusSemantic.ts:46-49`, catalog, field, source, evidence and confidence-range checks still run first. Then `other` and `hypothetical` proposals are skipped, `denied` is recorded, and the 0.9 threshold applies only to a player status stated as current. Probes:
- A low-confidence `other` proposal next to a valid player one → `resolved [drunk]`.
- `unknown` plus `denied` at low confidence → `resolved []`.
- An `other` proposal whose evidence isn't in the text → still asks for clarification, because contract checks are unchanged.
- `denied` plus `current` for the same status → asks for clarification about the contradiction.

## Tests
`tests/p0StatusSemantic.test.mjs`, `naturalIntentRouter.test.mjs` and `sceneHostWiring.test.mjs`: 51 passed, 0 failed. These include the three new tests.

## Not blocking
- If an old-format response lacks `statusProposals`, the code falls back to keyword matching (the P2 you already listed).
- When the player says they weren't drunk earlier but are now, the denied and current proposals conflict and the game asks the player to clarify. That's a safe fallback the player can recover from, so it stays P2.

The new-package rerun of the same sample set and the final full canon test run are still to do.
