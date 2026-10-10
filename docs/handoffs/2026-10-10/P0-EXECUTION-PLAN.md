# 六朝仙途 · P0 总体执行计划（2026-10-10，Claude 起草，派其他模型执行）

用户裁定（2026-10-10）：
1. **真人试玩反馈取代内部验收矩阵，成为后续排序主依据。**
2. **P0 立即开始**；10-10 验收债用**本机 Playwright** 收口，不再用 GPT-6 Luna 沙箱（两次 BLOCKED，原因均为沙箱禁止 Chromium mach bootstrap）。
3. **Claude 只做评估与计划；修改和执行交给其他模型。** 本文即交接物，执行方按任务卡认领，完成后回写 `PROJECT-STATUS.md` 顶部与 `docs/PLANNING-ROUNDS.md`。

总体顺序：**P0-A 收口验收债 → P0-B 提交工作区 → P0-C 真人试玩开收 →（P1）Content Pack 合同**。P0-A 与 P0-C 可并行；P0-B 依赖 P0-A 的门禁结果但不依赖其行为结论。

---

## P0-A · 10-10 验收债收口（只测不修）

### 任务卡

- 任务ID／批次：`P0A-ACCEPT-20261010`
- 接收角色：游戏测试（建议 Grok 4.6 执行，必须在**非沙箱**环境运行，或由能起 Chromium 的本机进程运行）
- 工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`
- 玩家体验目标：证明 10-08 三处修复（V03 前置验证 / V04、V07 结算路由）在留出组上成立，并拿到一条 ≥20 次真实提交的新档路线与 15 分钟理解度记录。
- 依据：`docs/handoffs/2026-10-10/ACCEPTANCE-CONTINUATION-GPT6-LUNA.md`（执行书，全部规则沿用）；冻结样本 `_newbot_tmp/acceptance-20261010-luna-b1/FROZEN-CASES-20261010.md`（SHA-256 见同目录 `frozen.sha256`，**不得更换**）。
- 权限：**不改产品源码、数据、提示词、词表；不提交/推送；不碰 8097（PID 65144）、正式存档、`user_config_api_management_v1.json`。** 只能在 `_newbot_tmp/acceptance-20261010-luna-b1/` 下写证据。
- 候选基线：HEAD `3e0144dd` + 工作区 12 文件未提交；被测包 = `_newbot_tmp/acceptance-20261010-luna-b1/pkg/`，`combat-trial.js` SHA-256 `aef6963f89fd18e9afe4c046cc8a91d073f41216939f93e30e19efc6f79a58f4`（Claude 10-10 复核与 `dev/combat-trial/dist/` 及 8097 served 字节一致）。

### 已核实的环境事实（直接复用，别重新摸索）

| 项 | 事实 |
|---|---|
| 浏览器驱动 | 复用 `_newbot_tmp/acceptance-20261007-luna-a1/driver.mjs`（95 行，HTTP 控制面 127.0.0.1:9491，端点 `/open /nav /eval /snap /click /clickcss /fill /submit /upload /filechooser /buttons /store /events /quit`）。改三处即可：`run` 路径指向 b1 目录；`profile` 用 b1 新建子目录；`/open` 默认 URL 改成本轮独占端口。Chromium 可执行文件 `~/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`，playwright-core 在 `../playtest-2026-09-28/tools/node_modules/`。 |
| API 配置 | 该 driver 已通过 `addInitScript` 把 `runtime-api-config.private.json` 注入 `localStorage.api_management_config`（combat-trial 包 `REMOTE_SAVE_STORAGE_ENABLED=false`，无后端，localStorage 是唯一来源，这里注入是**必须**的，不违反 selftest skill 的"别注入"原则）。该私有文件 = 后端 `user_config_api_management_v1.json` 的副本；当前 `apiAssignments.main` → `Jev`（openrouter `typesafe/jev-router`）。**报告里写模型名前先从 `logs/*-events.json` 的 `chat-start.model` 字段确认**，不要照抄配置。 |
| 隔离 | driver 用 `context.route` 把 `/api/v1/save-storage` 全部 501，非 GET 写请求全部 501；chat/embeddings 只放行配置里出现的 host。沿用。 |
| 静态服务 | 任选未占用端口（避开 8091/8097/8098/8099/8137/8399/9491/18097/18098/9333），绑 127.0.0.1，根目录 = b1/pkg。载入前/中/后各算一次 served 哈希。 |
| 检查点 | **V03 第一步前**：`_newbot_tmp/acceptance-20261007-luna-a1/v0304/after-fix/V03-step1-before.json`（生成脚本 `v0304/scripts/generate-v03-step1-fresh.mjs`，可重生）；第二步前需在第一步合法完成后抓存档（`capture-save.mjs` 思路：`/eval` 取 `gameState.getCurrentSaveData()`）。**V04 插入拍前**：`v0304/checkpoints/V04-insertion-before.json`（worldTurn=7）。**V07 山涧**：同一 V04 停点可用（10-08 已如此用）。**F05/F10/F13**：`node scripts/generate-scene-combat-checkpoints.mjs <b1 专属输出目录>` 重生，或复用 a1/checkpoints/F*-before.json（受控夹具，只作前置，不作证据）。 |
| 装载路径 | 刷新后"继续上次"固定回 `char_combat_trial_v1 / 战斗试玩` 槽，**不是 bug**；独立槽须经存档面板"导入"（`SavePanel.vue` `importSaves` → `characterStore.importSave`，bundle 形状 `{type:'saves',saves:[{存档名,存档数据}]}`），再回 `/game`。10-07 报告第 78 行已验证此路径。 |
| 回合落定判据 | driver `/submit` 以"输入框可用 && `ui.isAIProcessing!==true` 持续 600ms"为前台落定；后台请求可能在提交后 `net::ERR_ABORTED`，**单独计数，不算失败也不算 PASS**。30 秒首包中止统一记传输层事件。 |
| 守卫 | 开测前后复制 `guard-pre.json` 的 15 项正式文件哈希比对（b1 已有 `guard-pre.json`，续跑直接对比）。 |

### 执行顺序与停机

1. 基线锁定：复核包哈希、冻结文件哈希、`git status --porcelain` 快照、守卫快照。
2. V03 留出组（H3/H4/N3/X1/A2 用第一步前停点；H5 用第二步前停点）→ V04 留出组（每条从 `V04-insertion-before` 新分支）→ V07（H2/N2 新分支；P1 在 H2 成功分支上保存→刷新→经存档 UI 读同槽，比对 `activeRef.slot` 与剩余时长）。
3. V05-P（唯一命名新槽练功→保存→刷新→同槽读回）、V06（先试生成公开后合法存档，生成不了记 BLOCKED 并写清缺什么）、V02-S。
4. WIN-F05/F10/F13：自然骰，每场最多 3 次同检查点重开，未赢记 NOT_REACHED，报实际骰与 DC。
5. ROUTE（新档 ≥20 次真实提交，须经"地方"UI 越过五原点数商店入口，至少一次保存刷新后继续）+ UX15。

每条冻结输入最多提交一次；仅传输层失败允许原句重发一次，两次都入分母。连续 5 次传输失败暂停。每完成一项写 `progress.json`。

### 判定与交付

- V03/V04/V07 各自：原样本（10-08 已过，不重跑）+ 本轮 H 组全过 + N/X/A 组无误抓 → `CLOSED_ISOLATED`；否则 PARTIAL 并按"候选生成／语义识别／前置验证／结算路由／范围外"归类，给最小复现，**不修**。
- 总结论上限 `ISOLATED_CANDIDATE_PASS`（针对包 `aef6963f…`），不得写成 8097 通过或发布 PASS。
- 交付：报告追加到 `../playtest-2026-09-28/REPORT-2026-10-10-luna-continuation.md`（新节"本机 Playwright 续跑"）；`docs/PLANNING-ROUNDS.md` 追加一节；**PROJECT-STATUS 由复核方（Claude）更新**。
- 独立二审：Claude 只读复核报告与 `logs/*-events.json`，不复跑。

---

## P0-B · 工作区 12 文件提交

- 任务ID：`P0B-COMMIT-20261010`；接收角色：主策划/控制面（Grok）。
- 前置：P0-A 的门禁部分（不依赖行为结论）——在当前工作区跑 `npm run type-check`（Claude 10-10 已过）、`npm test`、`npm run canon:build`（10-10 合包记录 1632 项 1627 过/0 败/5 跳，提交前**重跑**）。
- 范围：`git status` 里现有 12 个 M 文件 + `docs/handoffs/2026-10-10/`、`docs/handoffs/2026-10-08/`、`docs/handoffs/2026-10-07/`、`docs/COMPLIANCE-REQUIREMENTS.md.bak-*` 不提交（.bak）；`_newbot_tmp/` 不提交。
- 纪律：提交前 `git status --porcelain`，索引里出现非本任务文件就停下问用户；用 `git commit -- <路径>` 限定 pathspec。提交信息写明"合包部署 aef6963f 对应源码"。推送 `origin/feat/fast-no-legacy` 需用户授权。
- 验收：`git log -1` 的 tree 能重建出同哈希的 combat-trial 包（`node dev/combat-trial/build.mjs` 到临时目录比对 `combat-trial.js` SHA-256；若 build 不可重现，记录差异原因，不阻塞提交）。
- 此后规则：**每次换 8097 包必须对应一个 commit**，部署记录写 commit hash。

---

## P0-C · 真人小范围试玩开收（一周只收不修）

- 任务ID：`P0C-PLAYTEST-20261010`；接收角色：主策划（Grok）登记，用户召集玩家。
- 入口：`http://192.168.50.51:8097/`（LAN）；玩家用自己的 API 配置。路线：山涧雾战（默认）与"返回道途→历史试玩／开发测试→清羽记开局"。
- 台账：新建 `docs/PLAYTEST-FEEDBACK-LEDGER-2026-10.md`，格式沿用 `docs/PLAYTEST-FEEDBACK-LEDGER.md`（编号 / 玩家 / 时间 / 原话 / 复现步骤 / 核实结论 / 归类 / 处置）。**每条先核实再定性**，不在台账里直接开工。
- 指引：复用 `docs/PLAYTEST-GUIDE-SMALL-CIRCLE-2026-07-17.md` 结构，按当前两条入口改写；问卷开放式，重点问"15 分钟内是否明白处境/目标"、"自由输入有没有被理解"、"选择有没有回响"、"卡在哪"。
- 规则：一周内只收不修（P0 级崩溃/丢档除外，须用户授权）；一周后由用户圈选，**排序依据改为台账频次×严重度**，内部验收矩阵剩余格子降为 P2。
- 交付：台账 + 一页汇总（出现≥2 次的问题、唯一崩溃、玩家原话 Top5）。

---

## P1 预告 · Content Pack 合同（P0-A/B 收口后开工，需用户授权改框架文件）

目标：新增一场战斗合同或一个 demo 段落，**零 TS 改动**即可被游戏选中并过门禁。
迁移顺序（按杠杆）：
1. `src/modules/sceneModule/contracts/registry.ts` 改 manifest/目录驱动，`f14.draft` 定稿作试金石；
2. `playtestNarrativeScope.ts` / `qingyuOpeningPlaytest.ts` 的 18 条事件白名单与终点/入口 → 从 stage json `playtest` 字段读取；
3. `fixedEndingNarratives.ts` / `qingyuOpeningTexts.ts` → 数据文件（先例 `mod-kit/ending-images.qingyu.json`）；
4. `ModeSelection.vue` 入口由 manifest `entries` 渲染；
5. 第 3 阶段 F06–F09 必须用 pack 合同实现，作为实证验收；
6. `runtime.ts` / `AIBidirectionalSystem.ts` 冻结为 bugfix-only。
分工建议：Grok 实现 1–4，Claude 只读二审 + 真机复核，F06–F09 为验收用例。详细 spec 另开文档，不在本文展开。
