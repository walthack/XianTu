# 六朝仙途 · 当前项目状态

更新时间：2026-10-19（Asia/Singapore）；分支 `feat/fast-no-legacy`。
**权威进度入口（双件）**：本文件（叙述与勾选总表）+ [docs/MASTER-GANTT.md](docs/MASTER-GANTT.md)（总甘特时间线）。勿另造第二份 status。  
`_newbot_tmp/PROJECT-TRACKER.md` **非权威**（草稿勾选；权威=本文件+总甘特）。历史全文见 [PROJECT-STATUS-ARCHIVE-2026-10-12.md](PROJECT-STATUS-ARCHIVE-2026-10-12.md)。

## 一句话现状

HEAD `3763e22e`；8097 现包 `combat-trial.js` SHA 前缀 `1f2c41525ce2`（PID 65144 未重启）；numbers 三分包已落 `3b8c1be2`；真机通过；**同拍闸已落**（共历好感接入 `affinityBeatTaken`，`3763e22e`）；**轻回执仍已批未落**；角色总表合入／补人中；**角色按拍卡（身份／官爵／结缘转换）记为内容扩展待办**；战内逃跑搁置；遇敌+连续战斗草案待拍；Sol 周一/周四 03:00（Asia/Singapore）；STATUS 日更例行。**优先级：底座优先，内容可同步但略低。** 时间线见 [docs/MASTER-GANTT.md](docs/MASTER-GANTT.md)。

## 优先级口径（底座 vs 内容）

| 层 | 含义 | 本轮项 | 排期 |
|---|---|---|---|
| **底座** | 引擎／结算闸／配置／健壮性——挡住玩法正确性的 | 同拍共历收口、轻回执、numbers 冻结迁入（需再批）、已批未落扫描 | **优先** |
| **内容** | 剧情／人设／拍卡文案／总表补人——可与底座并行 | 角色总表合入／补人、**角色按拍卡扩展（身份／官爵／结缘转换）** | **可同步，优先级略低**；不抢底座解禁／合入带宽 |

说明：内容扩展**不阻塞**底座开工；底座缺口（尤其已批未落）不因内容热闹而降档。

## 当前交付与版本

| 项 | 值 |
|---|---|
| 分支 | `feat/fast-no-legacy`（跟踪 `origin/feat/fast-no-legacy`） |
| HEAD | `3763e22e`（全长 `3763e22e834ecf41f47613c67cb1afd1bba8381f`）— 共历好感接入同拍闸 |
| 8097 包 | `dev/combat-trial/dist/combat-trial.js` SHA-256 前缀 **`1f2c41525ce2`**；进程 `node … serve.mjs --port 8097` PID **65144**（长期未重启；包文件已更新到该哈希） |
| numbers 三分包 | `mod-kit/numbers-combat.json` / `numbers-progress.json` / `numbers-runtime.json` + `NUMBERS-AUTHORITY.md`；生成物 `mod-kit/game-numbers.qingyu.json`；提交 **`3b8c1be2`** |
| 最近合入基线 | diagnostics / drain / scene-danger / baseline-p0·p1·p2 已 merge；同拍闸 `3763e22e` |

## 进度总表（防发散）

### Done（已完成）

- [x] **npm test 内容回归修复**：恢复 `2ee6fa09` 误伤的 character-registry + 4 南荒阶段 JSON 至 `2ee6fa09^`（132→1；非 numbers 引入）。笔记 `_newbot_tmp/NPM-TEST-FAILURES-2026-10-19.md`


> 甘特泳道「已完成」主线：diagnostics → P0 → P1 → P2 → numbers 三分包 → 真机 → **同拍闸**（日期见总甘特）。

- [x] 诊断/错误码日志系统合入（diagnostics；`cceb2e7a` → merge）
- [x] 存档滚动备份与损坏回退（`fb01fdd2` 等）
- [x] 全局异常兜底：Vue errorHandler + 启动失败兜底页（`3915e2d5`）
- [x] 版本号与构建号注入 + 存档盖章（`13d0c524`）
- [x] 存档 schema 迁移链与未来版本拒载（`7b00791e`）
- [x] 读档前校验 + 致命回退滚动备份（`f06ad2ce`）
- [x] 模型调用容错：可重试状态、指数退避、Retry-After（`859f3f44`）
- [x] 一键反馈包 zip（`d2370cd3`）
- [x] e2e:smoke 聚合（`6add1bcb`）
- [x] CI Node 20+、串行 test:ci、非阻塞 npm audit（`0753d051`）
- [x] turnTelemetry p50/p95 超阈值 warn（`101fc986`）
- [x] numbers registry + **三分包** + 6 条硬编码迁入（`3b8c1be2`；甘特「已完成」）
- [x] 8097 现包对齐 `1f2c41525ce2`；**真机通过**（本轮产品口径；甘特「已完成」）
- [x] 地点危险档 dangerTier + 判定数值进配置（scene-danger 合入）
- [x] **同拍共历 · 同拍闸**：`settleSharedExperienceAffinity` 查 `affinityBeatTaken`／记 `affinityTurn`（`3763e22e`；§15.6 已接入；底座）

### In progress（进行中）

- [ ] **npm test 冻结门禁 1 红**：`perfTelemetry`「冻结文件零改动…runtime.ts 同」——因 `3763e22e` 同拍闸改了 `runtime.ts`；不回滚功能、不擅自放宽门禁。详见 `_newbot_tmp/NPM-TEST-FAILURES-2026-10-19.md`


- [ ] **同拍共历 · 收口观察**：同拍闸已落；是否还有拍间历法分叉边角，跟已批未落扫描一并收口（甘特「进行中」；底座）
- [ ] **角色总表合入／补人**：总表补齐与合入进行中（对照约 333 条规模；甘特「进行中」；**内容**，可同步、略低）
- [ ] **已批未落扫描**：对照 GAP / 裁定 / `_newbot_tmp/APPROVED-BACKLOG-2026-10-19.md`，扫清「批了但未落盘」项（底座）
- [ ] Sol 例行：**周一、周四 03:00（Asia/Singapore）**（甘特泳道「例行」）
- [ ] **PROJECT-STATUS 日更**：与总甘特同步维护（甘特泳道「例行」）

### Approved-not-done（已批未落）

> 清单样板见 [`_newbot_tmp/APPROVED-BACKLOG-2026-10-19.md`](_newbot_tmp/APPROVED-BACKLOG-2026-10-19.md)（草稿扫描；权威勾选以本表为准）。  
> **同拍闸已从本档移出**（`3763e22e`）。下表为扫漏后仍成立的已批未落／需再批项。

#### 底座（优先）

- [ ] **到顶「可选轻回执」**（1016z 第 4 项可选；P2）：叙事事实 `free.fact.affinity.worn`／`capped` 已落；持久轻回执 UI（`MainGamePanel.vue`／回执渲染）**未做**。批文写「可选」；非冻结。
- [ ] numbers 剩余硬编码（冻结侧／**需再批**）：南荒每拍 120 分钟（❄ AIBidirectionalSystem）
- [ ] numbers 剩余：节奏 10/6/4、对账停滞 10（❄ runtime + eventReconcile 成对）
- [ ] numbers 剩余：态度钳制 -100..100（runtime 冻结部分需再批）
- [ ] numbers 其余桶：REALM_AGE_RANGE／寿元、inputPolicy caps、识别加分矩阵、worldStandards 声望档等（见 `_newbot_tmp/GAP-TABLE-2026-10-18.md` 附录）
- [ ] 扫描产出：完整「已批未落」清单收口（主表已见 APPROVED-BACKLOG；STATUS／甘特本轮已对齐样板项）

#### 内容扩展（可同步，优先级略低）

- [ ] **角色按拍卡扩展**：按拍补身份／官爵／结缘转换等拍卡内容（内容扩展待办；不抢底座带宽；与角色总表合入可并行）
- [ ] P4-1 向高好感角色学功法（用户压后；前置：好感「挣来」口径、NPC 功法内容）

### Shelved（搁置）

- [ ] **战内逃跑**：用户已定先不做（尚无随机遇敌）；草案仅预留 `flee` outcome 名，不实装 UI/规则（甘特泳道「搁置」；见 `_newbot_tmp/DESIGN-ENCOUNTER-AND-CHAINED-COMBAT-2026-10-19.md`）

### Waiting-user（待拍 / 待用户）

- [ ] **随机遇敌 + 连续战斗**设计草案待拍板（甘特泳道「待拍」；同文件；概率/冷却/触发时机等示意值勿当已定）
- [ ] 冻结文件改动类 numbers 迁入（需显式批准后再动 `runtime.ts` / `AIBidirectionalSystem.ts`）

## 与旧文档差距校对（过期条目）

对照 **2026-10-12 版 PROJECT-STATUS**、**GAP-TABLE-2026-10-18**、**PROGRESS-0b**、**APPROVED-BACKLOG-2026-10-19（扫描时 HEAD=ad9b0c8f）**：

| 旧说法 | 2026-10-19 判定 |
|---|---|
| 当前执行批次 1012TESTCFG / 1012FIXLIST / 1012DEPLOYTRACE 为「当前」 | **过期**。已归档口径；现权威以本文件 10-19 一句话、进度总表与 docs/MASTER-GANTT.md 为准 |
| 8097 为诊断提交 `af7aa6d9…`、combat-trial SHA `f112193c…` | **过期**。现包 SHA 前缀 **`1f2c41525ce2`**；PID 65144 仍在 |
| 修复源码 `2886f559…` 为最新修复焦点 | **过期**。后续已大量合入；HEAD 现为 **`3763e22e`** |
| P0「社交目标错误扣战斗级差」「F07 逃兵旗标跨关丢失」作当前 P0 | **过期（已修已发）**。保留历史证据链接，不再作当前 P0 |
| P1「约 30 秒中止诊断已部署、真实中止复测待执行」作当前主 P1 | **降级/归档**。diagnostics 已合入主干分支；完整 30s SLA 真人验收仍缺，但不占本轮主线标题 |
| P1「F09 一阳结构化 ID」待办语气 | **过期（已发布）** |
| P1「新场胜率偏高热改方案未实施」 | **仍可能有效，但非本轮主线**；未重新授权则不自动开工 |
| GAP 表 P0：存档备份 / 异常兜底 / 版本号「缺口」 | **已落盘（过期为缺口）** — 对应 `fb01fdd2` / `3915e2d5` / `13d0c524` 等 |
| GAP 表 P1：迁移链 / 读档校验 / 模型容错 / 反馈包 / e2e / CI Node+audit | **已落盘（过期为缺口）** — 见上方 Done |
| GAP 表 P2：性能监控缺聚合告警 | **已落盘（过期为缺口）** — `101fc986` |
| GAP / numbers 草案：硬编码「全未搬」 | **部分过期**：已搬 6 条（`3b8c1be2`）；附录 **11 条仍未搬** 仍有效 |
| PROGRESS-0b：待 push p2 / 周审 | **过期**：p2 已 merge（`7ea583a7`）并已 push；其后又有 numbers／同拍闸提交 |
| APPROVED-BACKLOG：同拍共历第 6 项因冻结未进 HEAD | **过期（已落）** — `3763e22e`；轻回执仍未落 |
| STATUS 文内 HEAD 仍写 `3b8c1be2` 为当前 HEAD | **过期** — numbers 交付点保留；当前 HEAD=`3763e22e` |

## 记录入口

- **总甘特（权威双件之一）**：[docs/MASTER-GANTT.md](docs/MASTER-GANTT.md)
- 草稿勾选（**非权威**；权威=本文件+总甘特）：[`_newbot_tmp/PROJECT-TRACKER.md`](_newbot_tmp/PROJECT-TRACKER.md)
- 已批未落扫描草稿：[`_newbot_tmp/APPROVED-BACKLOG-2026-10-19.md`](_newbot_tmp/APPROVED-BACKLOG-2026-10-19.md)
- numbers 交接：[`_newbot_tmp/HANDOFF-NUMBERS-REGISTRY-2026-10-19.md`](_newbot_tmp/HANDOFF-NUMBERS-REGISTRY-2026-10-19.md)
- 遇敌草案：[`_newbot_tmp/DESIGN-ENCOUNTER-AND-CHAINED-COMBAT-2026-10-19.md`](_newbot_tmp/DESIGN-ENCOUNTER-AND-CHAINED-COMBAT-2026-10-19.md)
- 工程健壮性核对（多项已落，附录硬编码仍有效）：[`_newbot_tmp/GAP-TABLE-2026-10-18.md`](_newbot_tmp/GAP-TABLE-2026-10-18.md)
- 策划轮次（不替代本文件权威）：[docs/PLANNING-ROUNDS.md](docs/PLANNING-ROUNDS.md)
- 历史状态归档：[PROJECT-STATUS-ARCHIVE-2026-10-12.md](PROJECT-STATUS-ARCHIVE-2026-10-12.md)
