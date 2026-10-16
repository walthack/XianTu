# 六朝合包后续测执行书 · GPT-6 Luna

## 固定开测步骤 · 1012TESTCFG（用户2026-10-12 22:16裁定）

后续执行本文真机/复测前，先只读正式 `.xiantu-server/save-storage/user_config_api_management_v1.json` 的实际配置，注入本轮**测试私有浏览器profile**，不改原文件、不上传正式后台、密钥不外露；加载/刷新前在测试驱动中隔离API配置同步读取与写回，避免正式后台覆盖私有副本。私有副本main固定「minimax high speed」：`MiniMax-M2.7-highspeed`，`api_1782316385574_8wsfb6ors`；Jev/Deepseek按需付费，测试一律不用，所有指向它们的功能/模块/继承分配均在私有profile改到此ID，并禁用被禁连接以防回退。首个请求前核对页面实际路由与发送前payload.model，先把实际apiId/model写进报告；配置不可读、目标连接不可用、仍指向禁用模型或回退`gpt-4o`默认时，拦截请求、停下报告，不得用默认值开测。

本条优先于下文旧模型选择/“沿用后台main”说明，只约束新轮测试，不改写历史结果；原环境与存档守卫继续有效。组织者在开测前完成配置，测试者不接触密钥。完整注入、继承检查与安全报告字段见[统一开测规则](../../TRUE-DEVICE-TEST-API-PREFLIGHT-1012TESTCFG.md)。


日期：2026-10-10（Asia/Singapore）。起草：Claude（Opus 5.5），用户要求直接派给 GPT-6 Luna 无头执行。本文自包含；同时沿用 `docs/handoffs/2026-10-07/ACCEPTANCE-EXECUTION-GPT6-LUNA.md` 的全部环境守卫、记录与判定规则，冲突时以本文为准。

批次名：`LUNA-CONTINUATION-20261010`。

## 1. 任务与授权

对 2026-10-10 合包部署的试玩包做续测，只补上一轮（LUNA-ACCEPTANCE-20261007）留下的 PARTIAL / NOT_TESTED / BLOCKED 项。

**本轮只验收，不修复。** 不改产品源码、数据、数值、提示词、关键词表；不提交/推送、不切分支、不重置工作区；不改合规正文。发现缺陷：按“候选生成／语义识别／前置验证／结算路由／范围外”归类并给最小复现，交回即可。

**不得触碰 8097。** 8097 是当前真人小范围试玩入口（PID 65144），不重建、不重启、不在其上写测试存档、不用它跑验收。正式存档、`user_config_api_management_v1.json` 等 API 配置、save-storage 只读。

允许：在专属目录复制被测包并起独占端口静态服务；新建专属浏览器 profile；用 `scripts/generate-scene-combat-checkpoints.mjs <专属输出目录>` 从新档生产回放生成合法检查点；调用游戏所需的真实模型请求；写报告、进度 JSON、`docs/PLANNING-ROUNDS.md` 新一轮记录。

## 2. 开工必读

工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`。

1. `PROJECT-STATUS.md` 顶部「当前状态 · 2026-10-10」与 `docs/handoffs/2026-10-10/PLAYTEST-MERGE-DEPLOY.md`。
2. `docs/handoffs/2026-10-08/REPAIR-ROUND-ARCHIVE.md`、`ACCEPTANCE-CLOSEOUT-FROZEN-CASES.md`、`ACCEPTANCE-CLOSEOUT-PROGRESS.json`。
3. `../playtest-2026-09-28/REPORT-2026-10-07-luna-acceptance.md`（上一轮全部证据与边界）。
4. 原执行书 `docs/handoffs/2026-10-07/ACCEPTANCE-EXECUTION-GPT6-LUNA.md`（环境守卫、记录字段、性能全分母、判定词汇）。
5. 根 `AGENTS.md`、`docs/COMPLIANCE-REQUIREMENTS.md`。合规观察单列，不作功能 blocker。

## 3. 被测包与基线锁定（先做）

- 被测包 = 8097 当前部署包的**字节副本**：`dev/combat-trial/dist/`。部署记录 `combat-trial.js` SHA-256 = `aef6963f89fd18e9afe4c046cc8a91d073f41216939f93e30e19efc6f79a58f4`（起草时已复核磁盘一致）。
- 把整个 `dev/combat-trial/dist/` 复制到 `_newbot_tmp/acceptance-20261010-luna-<唯一后缀>/pkg/`，复制后再算哈希，必须等于上值；不一致即 BLOCKED，不得改用自行构建的包。不重新构建、不运行 build.mjs。
- 独占端口：选一个当前未被占用的端口（不用 8091/8097/8098/8099/8137/8399/9491/18097），绑定 127.0.0.1。浏览器载入前/中/后各取一次 served 字节哈希。
- 记录开始时 HEAD（应为 `3e0144dd` + 工作区未提交改动）、`git status --porcelain`、端口与 PID。若工作区在测试期间被他人改动，记录但不影响被测包（包已冻结为副本）。
- 正式文件守卫：开测前、中、后记录正式 characters.json、active_save.json、API 配置及正式存档的路径/大小/mtime/哈希（定位方法见上一轮报告守卫段）。

## 4. 数据与模型

- 新建 profile：`_newbot_tmp/acceptance-20261010-luna-<后缀>/profile/`。远程 save-storage 读写在隔离浏览器内拦截，不落正式后台。
- 游戏模型按1012TESTCFG由正式配置只读派生到私有profile，main固定MiniMax-M2.7-highspeed，替换Jev/Deepseek分配且首请求前核实；密钥只进私有 profile，不出现在命令行、截图、日志、报告。不全局 mock 模型。
- 检查点只能由生成脚本从生产回放得到，或由本轮在隔离 UI 中自然推进得到。禁止手改 done 标记、好感、章节、修为、战斗终态。

### 4.1 浏览器驱动（2026-10-10 01:20 补充，首次启动 BLOCKED 后）

无头 `codex exec` 下 CUA 返回 `Capability is not available: visibility`，不可用。改用本机 Playwright：全局安装于 `/Users/clawbot/.local/lib/node_modules/playwright/index.mjs`（`import { chromium } from '/Users/clawbot/.local/lib/node_modules/playwright/index.mjs'`），浏览器缓存 `~/Library/Caches/ms-playwright`。用 `chromium.launchPersistentContext(<本轮专属 profile 目录>, { headless: true })`。驱动脚本写在本轮专属目录，可只读参考 `../playtest-2026-09-28/tools/` 下既有驱动的选择器与落定判据，但不得沿用其 mock/固定骰注入。这是任务书授权的驱动方式，不属于绕过沙箱。若 Chromium 在当前沙箱内确实无法启动，记录完整错误后 BLOCKED 停止，不改沙箱设置。

**2026-10-10 01:25 再补充（Playwright 在沙箱内 BLOCKED 后）**：沙箱禁止 Chromium 的 mach bootstrap，自启浏览器不可行。Claude 已在沙箱外启动一个专供本轮使用的无头 Chromium（Chrome/147，profile 为 `_newbot_tmp/acceptance-20261010-luna-b1/profile-cdp/`，仅监听 `127.0.0.1:9333`）。用 `chromium.connectOverCDP('http://127.0.0.1:9333')` 连接，取 `browser.contexts()[0]`（即该专属 profile）开新页面。不要关闭该浏览器进程（由 Claude 收尾），只关闭你自己开的页面。静态服务仍由你在沙箱内起在独占端口。连不上 9333 才记 BLOCKED。

续跑：已存在的 `_newbot_tmp/acceptance-20261010-luna-b1/`（包副本、冻结样本、守卫快照）直接沿用；先复核包哈希与冻结文件哈希未变，再从第 6 节第 2 步继续，不重新冻结、不更换样本。报告在同一报告文件追加续跑节。

## 5. 范围与冻结样本

### 5.1 冻结规则（执行任何样本前）

在发出第一个模型请求前，把本节全部样本写入 `_newbot_tmp/.../FROZEN-CASES-20261010.md` 并记录 SHA-256 与时间。之后不得更换样本、改输入、降低预期。下列样本均未参与 10/08 修复的实现或调试（起草者从修复交接与冻结文件核对过既有句子，下列句子为新写）。若你发现某句与 10/08 已用句子实质重复，记录并在冻结前替换为同类新句，不得冻结后替换。

每个冻结输入最多提交一次。仅当失败可证明是传输层（客户端约 30 秒首包中止、HTTP 非 200、空响应）时，允许同一输入重发一次，两次都记入分母。

### 5.2 V03 凝羽寒气探问（前置验证修复的留出组）

前置均为合法生产回放存档（第一步前或第二步前，按表）。

| ID | 前置 | 输入 | 预期 |
|---|---|---|---|
| V03-H3 | 第一步前 | `我能为你做些什么？你直说便是。` | 合法探问；只推进第一步一次，不提前完成事件 |
| V03-H4 | 第一步前 | `凝羽姑娘，你要我帮你办的究竟是什么事？` | 同上 |
| V03-H5 | 第二步前 | `你身上这阵寒气，是被什么人伤的？` | 合法指代；至多推进第二步一次；来源与固定事实一致，不归给苏妲己 |
| V03-N3 | 第一步前 | `你的事我暂时不想打听。` | 不推进、不写尝试、不泄露下一步固定文本 |
| V03-X1 | 第一步前 | `这草原上夜里冷不冷？` | 闲聊；不误判为寒气探问 |
| V03-A2 | 第一步前 | `乐明珠的事你知道多少？` | 邻场景人物；不推进凝羽步骤 |

### 5.3 V04 乐明珠插入拍（结算路由修复的留出组）

每条从同一合法插入拍存档的**新分支**开始。

| ID | 输入 | 预期 |
|---|---|---|
| V04-H2 | `放心，这件事我烂在肚子里，谁也不说。` | 对应保密动作；本地只结算一次；动作/尝试计数/回执/好感/记忆一致 |
| V04-H3 | `你救人的事，我替你瞒着就是。` | 同上 |
| V04-N2 | `这种事我可不敢替你瞒。` | 不得结算为保密 |
| V04-X2 | `你这一路跟着我们，累不累？` | 无动作或可恢复澄清；不写动作收据 |

### 5.4 V07 自由文本状态（结算路由修复的留出组）

合法山涧存档，同一场景新分支。

| ID | 输入 | 预期 |
|---|---|---|
| V07-H2 | `我连灌了几碗烈酒，头重脚轻，站都站不稳。` | 挂 `drunk` 一次；时长按目录；角色效果与 sceneLedger 一致 |
| V07-N2 | `我滴酒未沾，脑子清醒得很。` | 不挂 drunk |
| V07-P1 | 在 H2 成功的分支：保存→刷新→读同一槽 | drunk 不复制、不延长；剩余时长一致 |

不得使用目录未授权的 status id；正文没有饮酒事实时记入口限制，不硬判。

### 5.5 上一轮 BLOCKED / NOT_TESTED 项

| ID | 内容 | 判定要点 |
|---|---|---|
| V05-P | 练功写回的**同槽**持久化：在一个命名唯一的新槽内完成一次合法练功结算→保存→刷新→经存档 UI 读**同一槽**（以 `activeRef.slot` 前后一致为证） | 进度一致即 PASS；槽不同则不得下结论 |
| V06 | 谢艺公开前后等级显示 | 先尝试用生成脚本得到公开后（第 65 章附近）合法存档；生成不了记 BLOCKED 并写清缺什么，不手改章节 |
| V02-S | 明示投降**成功**终态（独立 F05 检查点） | 进入既定投降目标并合法收束；危险输入只在独立检查点 |
| WIN | F05 胜局/血虎制伏、F10 胜局、F13 W48 胜局 | 只用自然骰。每场最多 3 次从同一检查点重开的完整尝试；未赢记 NOT_REACHED（不是 FAIL），报告实际掷骰与 DC。UI 无固定骰控件，不得改状态造胜局 |
| ROUTE | 新档连续路线 ≥20 次真实提交，不插检查点、不手改状态 | 从“返回道途→历史试玩／开发测试→清羽记开局”起；上一轮停在五原点数商店入口，本轮必须走过该处（经“地方”UI）。至少一次保存刷新后继续。报告实际终点 |
| UX15 | 路线前 15 分钟理解度 | 处境/目标/动作反馈是否看得懂；选项后果是否回响；按原执行书口径记录 |

## 6. 执行顺序

1. 基线锁定与守卫 → 冻结文件落盘。
2. V03 → V04 → V07 留出组（这三项决定 10/08 修复能否收口）。
3. V05-P、V06、V02-S。
4. WIN（预算内）。
5. ROUTE + UX15。

单项高影响失败：保存样本，停止该路径扩展，继续其他独立项。模型服务普遍失败（连续 5 次传输失败）时暂停，保留已测结果，不持续付费重试。

## 7. 记录与性能

字段沿用原执行书（TURN-BEGIN/END、path、模型、请求次数、耗时、finish_reason、前后状态差异、截图/导出路径；缺失写 UNKNOWN）。

**30 秒首包中止**：统一记为传输层事件，单独统计次数/比例与发生位置，不算功能失败，也不算功能 PASS。所有提交进入分母；click-to-actionable 中位/P95/max、≤30 秒比例、失败率照报。

每完成一项写进度 JSON（completed/next/blocked/closed/out-of-scope），中断后按包哈希与 profile 复核再续跑，不重复已完成项。

## 8. 收口判定

- V03 / V04 / V07 各自收口条件：原样本（10/08 已通过，不重跑）＋本轮同类 H 组全部通过＋N/X/A 组无误抓、无误结算。满足即写 `CLOSED_ISOLATED`，并注明“修复后冻结、非修复前预注册”。任一不满足写 PARTIAL 并归类根因，不修。
- 其余各项：PASS / FAIL / PARTIAL / NOT_TESTED / NOT_REACHED / BLOCKED。无法核实不得 PASS。
- 总结论最高只能是 `ISOLATED_CANDIDATE_PASS`（针对包 `aef6963f…`），不得写成 8097 正式入口通过、READY_FOR_TRUE_DEVICE 或发布 PASS；不改正式 P0 状态。
- 本报告为执行方证据；结论由 Claude 复核后才落入 PROJECT-STATUS。

## 9. 交付

- 报告：`../playtest-2026-09-28/REPORT-2026-10-10-luna-continuation.md`（已存在则加唯一后缀）。
- 原始证据与进度 JSON：`_newbot_tmp/acceptance-20261010-luna-<后缀>/`。
- `docs/PLANNING-ROUNDS.md` 追加一节 `LUNA-CONTINUATION-20261010`（交付/阻塞/未测）。**不改 PROJECT-STATUS.md**（由复核方更新）。
- 公开文档先扫密钥脱敏。
- 收尾：只停本任务启动的服务与浏览器，复查守卫；保留 profile 与证据。
- 最后一条消息输出：主结论、逐项结果表、报告路径、主要失败及最小复现、守卫结果。
