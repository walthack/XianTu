# Run4 剩余修复交付（2026-09-30）

> **最终当前状态：READY_FOR_TRUE_DEVICE，可交 Grok 按 Run5 真实模型复测；不是真机 PASS。** 最后 Claude 定向复审 `claude-2026-09-30T14-28-10-164Z-f5ad8449` = PASS_FOR_TRUE_DEVICE（生命周期关闭范围）。此前两次 REJECT 的具体点已逐项返修，不代表全游戏独立审查。独立全量1091/1086pass/5skip、type-check/build:single/diffcheck、新旧两套8091/18097受控浏览器PASS。下方“待复审”段落为历史过程，不再是当前结论。
>
> 审查证据：MainGamePanel `abandonOwnedGameTurn` 与卸载早return前调用、per-turn abort/budget、processGmResponse 多处取消检查；Claude执行mock聚焦19/19。审查未改项目源码，写了自己的plan记录；sourceGuard=false，不声称强源码哈希审计。真实模型与30秒仍未验收。
>
> 非阻断测试缺口：浏览器只测A在B完成后迟到，未测A在B进行中迟到；保护按实例token/turnId，与先后时机无关，Claude判定非已证破坏、不阻断复测。Run5补此真实交错。首次fixture在发A前启动等待超时已保留，复跑双端口通过，原因未证明。

> Codex卸载修复独立复验：全量1091/1086pass/5skip、type-check/build:single/diffcheck通过；只读最后定向复审job `claude-2026-09-30T14-28-10-164Z-f5ad8449` 已登记。新浏览器fixture初次在A发出前输入框等待超时，正在独立复跑，尚不将实现方双端口PASS当独立结果。
> 独立复跑结果：新卸载fixture与既有Run4修复fixture在8091/18097均PASS。首次启动等待超时保留为间歇记录（原因未证明），不隐去；挂起A/离页/返回B/迟到A路径受控通过，仍待最后复审，不是真实模型验收。

> 最新：定向复审 `claude-2026-09-30T13-47-58-657Z-0ed5d918` 再次 REJECT，确认上轮三个具体点关闭；新缺口为组件卸载/重挂载的在途取消、token与共享busy生命周期，静态trace未真机复现。交Grok窄修并补浏览器离页往返；仍待复审，不是真机就绪。

> **当前状态：待复审，不是 READY_FOR_TRUE_DEVICE。** 最新窄返修针对 job `claude-2026-09-30T13-47-58-657Z-0ed5d918`：onUnmounted 生命周期。上轮切档/transport/quantity0 保持关闭。未 commit、未自行二审、未改正式存档/API。P0-1/P0-2 不关闭。30 秒待真机。静态绿 ≠ 真机 PASS。
> Codex 独立复验窄返修：全量1089/1084pass/5skip、聚焦53/53、type-check/build:single/diffcheck、8091/18097受控浏览器均PASS；定向复审 job `claude-2026-09-30T13-47-58-657Z-0ed5d918` 已登记，待结果。

> 历史：实现方曾写 READY；二审 REJECT 后该结论已撤回。下文「已证」是当时范围，不能覆盖审查新反例。审查返修见下一节。

基线 HEAD `09871cdeb4c623ae9a6b8bfd6d5364c4fece5bee`，dirty 为有效候选。

## 已证

### 1. 结构化道具 ID / 当前场景允许集 / 发布拒绝

- 协议字段：`item_references: [{ id, purpose }]`，`purpose` 仅 `owned|scene|claim|grant`。解析同时认 `道具引用`。
- 当前场景允许集 = catalog ID ∪ 已拥有背包 ID ∪ 本轮交付合同 ID。同名字符串不是库存权威。
- 未知 ID、未授权 `claim/grant`、未拥有 `owned` 在 `processGmResponse` 发布路径 fail closed；已登记未拥有的场景道具可 `scene` 提及。
- 未授权领取正文替换为「本轮没有新的道具交付…」，星河剑不得留在发布正文或背包。
- 调用级提示注入允许集和协议；`max_tokens` 被写明不是正文字数上限。8192 仍是 token 输出帽，未膨胀到 16000。
- 完整过程：`processPlayerAction` stub `aiService.generate` 返回 `item_references` claim `lcq.item.star_sword`，实际走到 generate（Node 无 IndexedDB 时提示词回落内存默认），发布拒绝且背包无剑。

未覆盖任意自然语言占有措辞。现有领取/别腰正则不是完整语义保证。

### 2. 清羽一回合最多 2 次长请求

- 共享预算 2，含主生成、截断补救、表演重写、格式重试、UI 链。意图分类 `maxTokens≤1024` 不计长请求。
- UI `sendMessage` 在回合开始 `beginQingyuTurnLongRequests`，`finally` `releaseQingyuTurnLongRequests`；嵌套 `processPlayerAction` 不得把额度补回 2。
- 清羽/固定道具合同成功正文不再为普通表演门禁发第二次长请求；硬越权仍 fail closed。
- 截断先抢救已闭合 `text`，丢掉残缺命令；成功补救不因表演门禁再发长请求。
- 外层格式重试对清羽直接保留输入；`outputTruncated` 先于结构校验处理。
- 发送后立刻置 `isAIProcessing`，避免双击叠回合。

未证：真实模型下每回合墙钟 ≤30 秒。120 秒总截止不是达标。

### 3. 谈清期限真实事件合同

事件 `lcq.event.sudaji_south_pact`。

- 接受：按钮 / 匹配自然句 `offer_nylon_clue_for_term`；`processPlayerAction` 完整 JSON generate 路径落 `south_pact_terms_opened`，事件不提前完成。
- 否定：问句、假设、转述、押手机不伪记同意；`processPlayerAction('提出三个月期限？')` 走到 generate 且不打开期限。
- 截断：有本地合同时可在 ≤2 次长请求内收口准备步。
- 离馆：`processPlayerAction` generate 路径完成 `lcq.event.baihu_shangguan_escape` 后 `hallControlled=false`、`phase=released`，保留未赌未签。
- 拒赌历史、未签南荒约、离馆解押切关继承仍由既有回归覆盖。

### 4. 完整过程测试，不是 prompt 组装失败的伪生成

- `promptStorage` IndexedDB 失败回落内存默认提示词，`loadAll` 不再撞 `db!`。
- generate-publish 测试断言 `calls >= 1 && calls <= 2`。
- 基础设施错误（如 `indexedDB is not defined`）不得本地猜结算。

## 验证

- 聚焦：`tests/run4FollowupRepairs.test.mjs` + `tests/run4Repairs.test.mjs` + `tests/baihuGambleRefusal.test.mjs` 通过。
- 全量：`node --test --test-concurrency=1 tests/*.test.mjs` **1084 total / 1079 pass / 5 skip / 0 fail**。
- `npm run type-check` PASS；`npm run build:single` PASS（`updated=0 skipped=37`）；`git diff --check` PASS。
- `node scripts/smoke-run4-repairs.mjs http://127.0.0.1:8091 http://127.0.0.1:18097` 两端口 PASS。拦截模型与服务器存储，不是真实 LLM。覆盖输入正文绑定、`【】` 清理、结构化截断 ≤2 长请求、自由输入截断保留焦点。

## 未证 / 不能闭环

- 真实模型正文质量、谈期限真机推进、连续落地通关。
- 每回合 30 秒。
- 道具/行动权限的任意措辞语义全覆盖。
- 玩家只选去向却杀人、报名、解甲喂药：现有反例在发布路径被拦，不是全语义。
- reasoning 参数只对已知 o 系列可选附加，未知 Jev 不强塞；未测效果。

## 本轮改动文件（相对本 follow-up）

- `src/modules/scenarioMods/fixedInventoryContracts.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `src/services/prompts/promptStorage.ts`
- `src/services/qingyuTurnLongRequests.ts`
- `src/components/dashboard/MainGamePanel.vue`
- `src/types/AIGameMaster.d.ts`（既有 `item_references`）
- `tests/run4FollowupRepairs.test.mjs`
- `tests/run4Repairs.test.mjs`
- `tests/baihuGambleRefusal.test.mjs`
- `scripts/smoke-run4-repairs.mjs`
- `docs/RUN4-FOLLOWUP-REPAIRS-2026-09-30.md`
- `PROJECT-STATUS.md`

另有既有 dirty 候选（截断抢救、可选 reasoning、行动权限、拒赌、存档保护等）一并保留，未 reset。

## Claude REJECT 窄返修（2026-09-30 夜）

审查 job `claude-2026-09-30T13-08-19-664Z-f7d5243b`，sourceGuard 包装器记录与只读叙述不一致，不可声称强源码 hash 保护。

### P0 回合身份隔离

- `qingyuTurnLongRequests` 按 `turnId` 分账，不再用裸全局 `depth/remaining`。
- `processPlayerAction` 的 `end(turnId)` 与 UI `release(turnId)` 只动本回合；切档后旧 finally 只能 invalidate 自己。
- `resetPanelState`：`cancelAllRequests` + `aiResetToken++` + `invalidateQingyuTurnLongRequests`，并清流式态。旧流回调检查 token，不得写新 busy/新存档。
- 反例：A 在途 invalidate 后 B 新额度仍为 2；A 晚完成 / release 不得把 B 置 null。

### P1 按实际 long transport 计次

- 每次 axios/fetch 流式、非流、stream-unsupported 降级、以及 `executeWithRetry` 的每一次网络尝试各扣 1。
- 清羽回合用户 `maxRetries` 仍可配置，但超额 transport 会抛 `QINGYU_TURN_LONG_REQUEST_BUDGET` 并保持 typed。非清羽模式重试不被全局关闭。
- 截断补救、表演/格式/UI 仍共用同一 turn。
- 酒馆：网页包装器走 `aiService.generate`，计入预算。原生 SillyTavern `window.TavernHelper.generate` 不经过本 HTTP 拦截层，文档限定为此。
- 受控 intercept：`maxRetries=3` 时实际 POST=2 后第三次被预算拦住；流式 unsupported + 非流降级 = fetch1 + post1。

### P2 数量 0 不是 owned

- `ownedInventoryItemIds` 只收 `数量` 有限且 `> 0`。`purpose: owned` 对数量 0 的登记物 fail closed。不引入消耗合同。

### 本轮验证

- 聚焦：`tests/run4FollowupRepairs.test.mjs` + `tests/run4Repairs.test.mjs` + `tests/aiTruncationRetry.test.mjs` **30/30**；`tests/baihuGambleRefusal.test.mjs` **23/23**（拒赌/期限/离馆未退化）。
- 全量：`node --test --test-concurrency=1 tests/*.test.mjs` **1089 total / 1084 pass / 5 skip / 0 fail**。
- `npm run type-check` PASS；`npm run build:single` PASS（updated=0 skipped=37）；`git diff --check` PASS。
- `node scripts/smoke-run4-repairs.mjs http://127.0.0.1:8091 http://127.0.0.1:18097` 两端口 PASS（拦截模型/存储）。
- 首包 30s / 总 120s typed timeout 回归仍绿。

### 残余风险

- P0 切档交错是受控模块 + intercept 证明，不是真机挂起 14 分钟后切角色的现场复现。
- 原生酒馆 helper 不计入本层 transport。
- 道具/行动权限正则仍非全语义。
- 本轮不关闭 P0-1/P0-2，也不以此文修改旧 P0 的权威结论；30 秒 SLA 未证。

## 卸载生命周期窄返修（job `claude-2026-09-30T13-47-58-657Z-0ed5d918`）

同组件切档 / 实际 transport 计数 / quantity0 保持已关。新 P0 为 `onUnmounted` 未取消在途（静态 trace，非真机挂起复现）。

- `abandonOwnedGameTurn`：`aiResetToken++`，只 `invalidate`/`abortQingyuTurnRequests` 本组件 `ownedQingyuTurnId`，仅当 `peekActiveQingyuTurnId` 仍是自己或已空时清共享 busy/stream。切档 `resetPanelState` 与 `onUnmounted` 共用；卸载在 `if (!isTavernEnvFlag) return` 之前调用。
- 旧实例 finally/onStream 仍看 `aiResetToken === resetSnapshot`，不能清新组件 busy 或写新存档。
- 不调用 `cancelAllRequests` 做卸载清理，避免误杀后来者。
- 执行级：`abortQingyuTurnRequests` 只取消 A，provider 忽略 abort 时 A 迟到不扣 B 额度；`processPlayerAction` 迟到不落星河剑。
- 浏览器：`scripts/smoke-run4-unmount-hang.mjs` 拦截模型与 `/api/v1/save-storage`，挂起 A → `$router.push('/')` → 回来发 B → 放行 A。8091/18097 PASS。B long calls ≤ 2；迟到正文不含星河剑；busy 保持 false。

验证：聚焦 `tests/run4FollowupRepairs.test.mjs` 19/19；全量 **1091 / 1086 pass / 5 skip / 0 fail**；type-check / build:single / diffcheck PASS；`smoke-run4-repairs.mjs` 与 `smoke-run4-unmount-hang.mjs` 两端口 PASS。

## 结论

**待复审，不是 READY_FOR_TRUE_DEVICE。** 卸载生命周期已修并有浏览器往返 fixture。下一步由本线程提交 focused 最后复审。原生酒馆 helper 仍不计入本层 transport。P0-1/P0-2/30 秒未证。
