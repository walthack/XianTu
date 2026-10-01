# 星月湖 B1 · Claude 真机验收结果

> 日期：2026-09-14
> 状态：**EXECUTED / VERDICT = FAIL**
> 规格：`docs/XINGYUEHU-B1-CLAUDE-TRUE-DEVICE-ACCEPTANCE-2026-09-14.md`
> 执行 HEAD：`09871cdeb4c623ae9a6b8bfd6d5364c4fece5bee`（与冻结候选 `4154fa6` 的差异仅 `PROJECT-STATUS.md` + 该规格文档，无应用代码差异）
> 执行者：Claude Code 真机通道；证据根 `<验收 worktree>/.xiantu-server/claude-xingyuehu-b1-true-device-20260914/`
> 本文**不**改变项目阶段状态。B1 是否改判仍由 Grok 控制面依据本结果另行裁决。

```
VERDICT: FAIL
CODE: B1_TRUE_DEVICE_FAIL_FATE_ACTIONS_INDISTINGUISHABLE
SOURCE_GUARD: PASS
DEAD_ROUTE: PASS
LONGREST_ROUTE: PASS
G2/B1_CLOSURE: NOT_EXECUTED / NOT_CLOSED
```

## 1. 一句话结论

两态命运骨架本身立得住——dead 与 longrest 的本地权威、判定回执、骨灰／transfer、关系、幂等与读档不可重放**全部按合同落账**，没有重骰、没有命运翻转、没有重复发奖，LLM 没有拿到生死或骰点的写入权。FAIL 出在玩家可见层：**玩家在界面上分辨不出自己选的是【承接】还是【救治】**，且两条拒绝输入被模型正文写成了既成事实。按规格 §9，PASS 要求 T0 与 T7 通过。

## 2. 逐项结果

| 用例 | 结果 | 说明 |
|---|---|---|
| T0 命运拍 UI | **FAIL** | 两动作按钮文案完全相同，点击填入的不是冻结 actionText（B1-01） |
| T1 承接 → dead | PASS | 全部权威回执命中，正文与真值一致 |
| T2 预检／撤回／读档 | PASS | pending 跨刷新同 ID；撤回归档 `cancelled`、零 roll、零扣减、二选一恢复 |
| T3 救治真骰 → longrest | PASS | 第 1/10 槽即自然 `success`，`testOverride=null` |
| T4 非 success+ 一致性 | NOT_SAMPLED | 首骰即成功；按规格 §5 不阻塞两态 |
| T5 刷新／重载／不可重放 | PASS | 两槽均刷新＋重新载入＋跑一个后续动作 |
| T6 pending 边界 | NOT_APPLICABLE_UI | 无离场控件；pending 时一切行动被阻止（留有 DOM 证据） |
| T7 拒绝语义 | **FAIL** | 权威层守住，模型正文越界（B1-02、B1-03） |

## 3. 关键状态前后

### 3.1 T1 承接 → dead（槽 `T1承接r2`）

| 项 | before | 落定 | 重载后 | 后续动作后 |
|---|---|---|---|---|
| worldTurn | 30 | 31 | 31 | 32 |
| `event.xieyi_entrustment.done` | false | **true** | true | true |
| `event.s06_03.done` | — | **true** | true | true |
| `event.s06_03.void` | — | 未置 | 未置 | 未置 |
| `character.xie_yi.status` | 未写 | **dead** | dead | dead |
| `branch.lcq.if_xieyi_longrest.active` | — | 未置 | 未置 | 未置 |
| `world.xieyi_absence.active` | — | 未置 | 未置 | 未置 |
| `world.xieyi_ashes.generated` | false | **true** | true | true |
| 背包骨灰 / transfer receipt | 0 / 0 | **1 / 1** | 1 / 1 | **1 / 1（不重复）** |
| 谢艺好感 | 88 | 88 | 88 | **96（+8，仅一次）** |
| `affinityGrantedEventIds` 含本事件 | 否 | 否 | 否 | **是** |

> **共历好感 +8 落在下一拍**（与离线 `settleChoice` 的两次 advance 行为一致）。只读落定当拍会把它误判成「未 +8」——后续复核请照 T1 第 5 步再推一拍。

正文：「他的头缓缓垂下，呼吸彻底停了，胸口再没有起伏。」无「仍有气息／已救回／长养／失踪／生还」。重载后二选一消失（动作按钮 2 → 1）。

### 3.2 T3 救治 → longrest（槽 `T3救治01`，第 1 次真骰）

只点【确认并掷骰】，未用【大成功（测试）】。

- 页面结果卡：`本地判定结果 · success` / 骰点 **7** / 总值 **26** / 难度 **25** / 策略 `route_process_only`
- 存档回执：同一 ID `judge-0-10bd7y6-mu0jdlvc-1`，`roll=7`、`total=26`、`outcome=success`、**`testOverride=null`**
- 因子核对：该槽预检 六司 5 + 同伴·乐明珠针灸 8 + 幸运 3 + 环境 0 = 19；7+19 = 26 ✔ 卡面与回执一致
- 神识 30 → **28**（`Math.round(上限×5%) = 2`，`judgementEngine.ts` `spiritCostEffects`）；气血 100/100 未回血（`applyCultivationRecovery:false` 生效）
- 权威：`xieyi_entrustment.done=true`、`s06_03.void=true`、`s06_03.done` 未置、`character.xie_yi.status=longrest`、`branch.lcq.if_xieyi_longrest.active=true`、`world.xieyi_absence.active` 未置、**骨灰 flag／物品／transfer 全 0**
- 成功后无第二次确认窗；世界线记录：「乐明珠施针、你运功护持成功。谢艺伤势压住，进入长养，可密送。（谢艺：长养）」
- 正文红线扫描：骨灰／发丧／墓／辞世／遗产／继承／失踪 **均未出现**
- 下一拍好感 88 → **96**（+8，仅一次），判定不重回 pending、不产生新 roll

### 3.3 T2 预检与撤回

判定卡逐字合同一致：`行动判定（尚未掷骰） · cultivate`、冻结 actionText「让乐明珠施针，我运功护持。不灌补心丹。」、六司 +5、**同伴·乐明珠针灸 +8**、幸运 +0、环境 +0、**难度 25**、目标 `liuchao.character.xie_yi`、六档 stakes 一致。确认前 worldTurn 30／叙事 0／神识 30-30／气血 100-100／命运字段全空／无骰点；刷新重载后 pending 仍是 `judge-0-10bd7y6-mu0jbbo6-1`；撤回后 recent 记 `cancelled`、`roll=null`、`appliedEffects=[]`，零扣减，二选一恢复。

## 4. Blocking findings

### B1-01 · 命运拍两个动作按钮无法分辨，且填入的不是冻结 actionText

命运拍只给两个按钮，两者 innerText 完全相同：

```
主线  去鬼王峒 · 见谢艺 · 见小紫：听清谢艺把小紫带往星月湖的托付，并决定承接遗言或施针救治 · 耗时 1 回合
主线  去鬼王峒 · 见谢艺 · 见小紫：听清谢艺把小紫带往星月湖的托付，并决定承接遗言或施针救治 · 耗时 1 回合
```

点任一个，输入框填入的都是同一句罗盘文案，**不是**规格 T0.3 要求的
`我陪谢艺把话说完，不打断、不施针。` / `让乐明珠施针，我运功护持。不灌补心丹。`
命中 T0 失败条件「按钮重复」。

**根因（逐层核实，非基准构造假象）**

1. canon 里存在**两个同名「鬼王峒」**：`liuchao.location.guiwang_dong`（数组序 4）与 `liuchao.location.gui_wang_dong`（数组序 41）
2. `lcq.event.slay_dragon.locationId = liuchao.location.gui_wang_dong`；`movePlayerToEventLocation` 按该 id 的 **name** 写入 `角色.位置.描述 = "南荒·鬼王峒"`（`src/modules/scenarioMods/runtime.ts` 约 2049 行）
3. 回解时 `resolveLocationIdFromPosition` 只按 name 子串匹配、同长按数组序取首个（`src/modules/scenarioMods/secondaryLines.ts` 约 950 行），解回 `liuchao.location.guiwang_dong`
4. `xieyi_entrustment.locationId` 同为 `gui_wang_dong` ≠ 解析值 ⇒ `traveling = true` ⇒ `useCompass = true`
5. `getCurrentStoryEventActions` 遂把 `label` 与 `playerLine` 双双替换成同一条罗盘串（`runtime.ts` 约 1331–1334 行），丢掉 `承接/救治` 身份与 `actionText`

即：引擎自己写下的地点字符串，自己再也认不回来。任何斩龙后走到这一拍的玩家都会遇到。

**不受影响的部分**：结算走 `selectedScenarioEngineAction` 结构化选项而非文本意图匹配，故命运路由本身仍然正确（T1／T3 已证）。这是纯呈现层缺陷，但足以让玩家误选。

**修法候选（本次未改代码）**：给 `resolveLocationIdFromPosition` 增加 id 级消歧，或去重同名 canon 地点；或令 `useCompass` 在既有的 `sameSceneLocation()` 为真时不生效。

### B1-02 · 补心丹被正文写成已经生效

输入「我给谢艺灌补心丹救他」后权威层守住（命运字段全空、无判定、无 longrest），但正文写道：

> 「丹药入腹，一股暖流自他心口扩散。谢艺的呼吸渐渐平稳了些，胸口的血也止住了……他缓缓睁开眼……」

合同 §1.1 明定补心丹是拒用物件、不得当救命条件；规格 T7 明定正文不得把补心丹说成已经成功的权威事实。

### B1-03 · 失踪被正文写成既成事实

输入「让谢艺失踪」后权威层守住（`world.xieyi_absence.active` 未写、事件仍 active、命运字段全空；发送瞬间已取证），但正文写道：

> 「而谢艺原本站立的位置，只剩下一个空荡荡的阴影……谢艺的失踪，究竟是早有预谋的退路，还是被什么东西卷走了？」

真值是谢艺重伤在场、命运未结算；玩家看到的却是他已经离场消失。命中规格 §6「玩家可见正文与本地真值矛盾」。该段还把不在场的苏璃写进了场景（P1-5）。

## 5. Non-blocking findings

- **P1-1** 判定回执把神识**扣减**显示为「神识恢复至 28」：`src/utils/judgementEngine.ts` 的 effect 文案对 `action === 'set'` 一律套「恢复至」模板，而 `spiritCostEffects` 正是用 `set` 写扣减后的值；正文随之附和「神识……恢复了些许」。数值与回执一致故不阻塞，但同时误导玩家与模型。
- **P1-2** 存在 pending 判定时发送其他行动被静默吞掉：输入框保留原文、90 秒内无回合、无 toast、无 console 提示；判定卡在屏是唯一线索。
- **P1-3** dead 槽命运落定后，右侧「个人目标（可选）」仍显示「决定是否承接谢艺遗言，送小紫去星月湖」「决定是否对昏迷的小紫施针救治」（longrest 槽已正确切换为「护送小紫前往星月湖／待谢艺长养稳定后密送其出峒」）。
- **P1-4** 首次 T1 真机回合无产出：主叙事输出触顶 `maxTokens=8192`（`src/services/aiService.ts` 对 main 的硬上限，后端配置的 20000 被 clamp）被截断，重试遇 network error，整轮 282 秒无结果；复跑 35 秒正常落定。属外部模型层抖动，非 B1 合同问题。
- **P1-5** T7 失踪 正文出现不在场角色苏璃。

## 6. 未证明项

1. **T4**：真实【救治】的非 success+ 自然样本未取到（首骰即 success）→ `NOT_SAMPLED`，按规格不阻塞两态；确定性 outcome 映射继续由聚焦合同测试负责。
2. **T7 通用判定的 success+ 分支**：「我独自运功救活谢艺」生成的是**通用自由行动判定**（actionText 为玩家原文、因子无乐明珠 +8、stakes 为通用文案），真掷得 `roll=3 / total=11 / failure`，命运字段仍全空。其「不得写 longrest」另有代码硬门控——命运映射要求 `resolution.authorityReceipt.kind === 'event_action_judgement'` 且 eventId／actionId／contractHash 三者匹配，否则 `stale_judgement`（`runtime.ts` 约 1713 行）。该通用判定的 success+ 样本未在真机取到，此项为代码核实＋failure 分支实测。
3. **开场自动演出正文**：机械基准叙事条数为 0，命运拍无 LLM 开场演出，页面显示的是空叙事占位文案「开局生成失败，请检查API上下文长度……」（`src/components/dashboard/MainGamePanel.vue`）——**不是真实生成失败**，全量网络捕获显示该时刻根本没有主模型请求。故 T0.5「开场正文不得预写命运」只对占位文案取样（其不含任何命运词）。

## 7. 执行环境与流程偏差

- 隔离服务 127.0.0.1:8097；`/` 与 `/XianTu.js` 均 200；bundle 51,056,923 字节，sha256 `456ca838d344b901…`；同时命中 `lcq.event.xieyi_entrustment` / `accept_entrustment` / `rescue_xieyi` / `offscreen.lcq.xieyi_entrustment.default_death`；bundle 与存档内嵌事件 `afterStallTurns` 均为 `2`
- 网络实测：主叙事 `openrouter.ai · deepseek/deepseek-v4-flash-0731`；次级功能 `api.minimaxi.com · MiniMax-M2.7-highspeed`；嵌入 `api.siliconflow.cn · BAAI/bge-m3` —— 与后端权威配置的 `apiAssignments` 一致，未注入、未换模型
- 基准由生产 API 链构造（`createMinimalSaveDataV3` → strict initializer → 仅 `getCurrentStoryEventActions` / `recordStoryEventStructuredAction` / `advanceScenarioRuntime`，18 步全链见 `fixture-provenance.json`），**§4.2 的 20 项断言全部通过、0 失败**；基准谢艺好感 **88**（种子 24 + 沿途 8 次共历 +8），后续 ±8 均相对该基准计
- **流程偏差（须控制面裁决是否接受）**：规格 §3.1 要求控制面预先准备干净 detached worktree，且「Claude 不自行创建、切换或修改 Git worktree」。控制面未准备该环境，用户明确授权执行者代做，故由 Claude 执行了：`git worktree add --detach <WT> 09871cd`（写入主仓 `.git` metadata，属 §2.2 越界）、软链 `node_modules`、将后端权威 `user_config_api_management_v1.json` 以只读副本放入隔离 `save-storage`（未复制任何玩家人物／槽／active-save 指针）。另未用 `npm run serve`：其 `preserve` 钩子 `sync-builtin-mods.mjs` 依赖未跟踪的 `mod-kit/generated/**/stages/*.json`，干净 worktree 中 ENOENT；改为直接起 `webpack-dev-server`，builtins data 为 HEAD 已提交产物且与主工作区 sha256 一致
- 其余守则全部遵守：未改 `src/`、`tests/`、canon、核心 prompt、冻结 ID、authority overlay、builtin 数据、存档 schema；未触碰主工作区 `.xiantu-server/save-storage/` 玩家数据与共享 8091；未向 localStorage 注入 API 配置；未用「大成功（测试）」；未直接改存档命运字段；三份 08-30 未跟踪文档未触碰
- 结束守卫：隔离服务已停、临时浏览器 profile（含全部临时角色／槽／active-save 指针）已删；两个工作树 HEAD 均为 `09871cd`，验收 worktree `git status` 干净、`git diff --check` PASS，主工作区仅剩原有三份未跟踪文档

## 8. 证据

证据根：`<验收 worktree>/.xiantu-server/claude-xingyuehu-b1-true-device-20260914/`（约 37 MB）

`REPORT.md`、`summary.json`、`cases.jsonl`、`timings.csv`、`requests-redacted.jsonl`（89 处 `[REDACTED]`，密钥零泄漏）、`console-errors.txt`、`service.txt`、`git-guard-before.txt`、`git-guard-after.txt`、`fixture-provenance.json`、`snapshots/`（baseline 与各槽 before·pending·resolved·after_reload·after_followup）、`screenshots/`、`t3-attempts.jsonl`、`t3-results.json`、`t7-results.jsonl`、`cleanup.txt`。

驱动脚本在同 worktree 的 `.xiantu-server/b1-scripts/`（被 `.gitignore` 覆盖，不污染工作树），含离线一行复现：

```bash
node .xiantu-server/b1-scripts/check-location.mjs
# playerLocationId 解析 => liuchao.location.guiwang_dong
# 事件 locationId      => liuchao.location.gui_wang_dong
# traveling(=不相等)  => true
```

## 9. 范围声明

本文**不**宣布 G2 PASS、**不**宣布 B2–B4 完成、**不**关闭 B1、**不**解除 `lcq.stage_06` 隔离、**不**改变 B1 阶段状态。是否改判由 Grok 控制面另行裁决。
