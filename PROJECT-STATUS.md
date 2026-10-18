# 六朝仙途 · 当前项目状态

更新时间：2026-10-19（Asia/Singapore）；分支 `feat/fast-no-legacy`。  
**权威进度入口**：本文件。跟踪勾选表见 [`_newbot_tmp/PROJECT-TRACKER.md`](_newbot_tmp/PROJECT-TRACKER.md)。历史全文见 [PROJECT-STATUS-ARCHIVE-2026-10-12.md](PROJECT-STATUS-ARCHIVE-2026-10-12.md)。

## 一句话现状

HEAD `3b8c1be2`；8097 现包 `combat-trial.js` SHA 前缀 `1f2c41525ce2`（PID 65144 未重启）；numbers 三分包已落 `3b8c1be2`；真机通过；战内逃跑搁置；遇敌+连续战斗草案待拍；同拍共历进行中；角色总表补人中；Sol 周一/周四 03:00（Asia/Singapore）；已批未落扫描中。

## 当前交付与版本

| 项 | 值 |
|---|---|
| 分支 | `feat/fast-no-legacy`（跟踪 `origin/feat/fast-no-legacy`） |
| HEAD | `3b8c1be2`（全长 `3b8c1be260863e02d03a4ce54f6478aac8915d3d`）— numbers registry 最小方案：三分包合并、6 条硬编码迁入 |
| 8097 包 | `dev/combat-trial/dist/combat-trial.js` SHA-256 前缀 **`1f2c41525ce2`**；进程 `node … serve.mjs --port 8097` PID **65144**（长期未重启；包文件已更新到该哈希） |
| numbers 三分包 | `mod-kit/numbers-combat.json` / `numbers-progress.json` / `numbers-runtime.json` + `NUMBERS-AUTHORITY.md`；生成物 `mod-kit/game-numbers.qingyu.json`；提交 **`3b8c1be2`** |
| 最近合入基线 | diagnostics / drain / scene-danger / baseline-p0·p1·p2 已 merge 进本分支（见 git log） |

## 进度总表（防发散）

### Done（已完成）

- [x] 诊断/错误码日志系统合入（`cceb2e7a` → merge）
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
- [x] numbers registry + 三分包 + 6 条硬编码迁入（`3b8c1be2`）
- [x] 8097 现包对齐 `1f2c41525ce2`；**真机通过**（本轮产品口径）
- [x] 地点危险档 dangerTier + 判定数值进配置（scene-danger 合入）

### In progress（进行中）

- [ ] **同拍共历**：设计/实现进行中（避免拍间历法分叉）
- [ ] **角色总表补人**：总表补齐进行中（对照约 333 条规模，见近期核对笔记）
- [ ] **已批未落扫描**：对照 GAP / 裁定 / 已批方案，扫清「批了但未落盘」项
- [ ] Sol 例行：**周一、周四 03:00（Asia/Singapore）**

### Approved-not-done（已批未落 / 扫描中）

> 状态：扫描进行中。已知仍未落或需再批的硬编码见 GAP 附录（numbers 本轮后剩 11 条）。

- [ ] numbers 剩余硬编码（冻结侧）：南荒每拍 120 分钟（❄ AIBidirectionalSystem）
- [ ] numbers 剩余：节奏 10/6/4、对账停滞 10（❄ runtime + eventReconcile 成对）
- [ ] numbers 剩余：态度钳制 -100..100（runtime 冻结部分需再批）
- [ ] numbers 其余桶：REALM_AGE_RANGE／寿元、inputPolicy caps、识别加分矩阵、worldStandards 声望档等（见 `_newbot_tmp/GAP-TABLE-2026-10-18.md` 附录）
- [ ] 扫描产出：完整「已批未落」清单（本轮目标，尚未收口）

### Shelved（搁置）

- [ ] **战内逃跑**：用户已定先不做（尚无随机遇敌）；草案仅预留 `flee` outcome 名，不实装 UI/规则（见 `_newbot_tmp/DESIGN-ENCOUNTER-AND-CHAINED-COMBAT-2026-10-19.md`）

### Waiting-user（待拍 / 待用户）

- [ ] **随机遇敌 + 连续战斗**设计草案待拍板（同文件；概率/冷却/触发时机等示意值勿当已定）
- [ ] 冻结文件改动类 numbers 迁入（需显式批准后再动 `runtime.ts` / `AIBidirectionalSystem.ts`）

## 与旧文档差距校对（过期条目）

对照 **2026-10-12 版 PROJECT-STATUS**、**GAP-TABLE-2026-10-18**、**PROGRESS-0b**：

| 旧说法 | 2026-10-19 判定 |
|---|---|
| 当前执行批次 1012TESTCFG / 1012FIXLIST / 1012DEPLOYTRACE 为「当前」 | **过期**。已归档口径；现权威以本文件 10-19 一句话与进度总表为准 |
| 8097 为诊断提交 `af7aa6d9…`、combat-trial SHA `f112193c…` | **过期**。现包 SHA 前缀 **`1f2c41525ce2`**；PID 65144 仍在 |
| 修复源码 `2886f559…` 为最新修复焦点 | **过期**。后续已大量合入；HEAD 现为 **`3b8c1be2`** |
| P0「社交目标错误扣战斗级差」「F07 逃兵旗标跨关丢失」作当前 P0 | **过期（已修已发）**。保留历史证据链接，不再作当前 P0 |
| P1「约 30 秒中止诊断已部署、真实中止复测待执行」作当前主 P1 | **降级/归档**。diagnostics 已合入主干分支；完整 30s SLA 真人验收仍缺，但不占本轮主线标题 |
| P1「F09 一阳结构化 ID」待办语气 | **过期（已发布）** |
| P1「新场胜率偏高热改方案未实施」 | **仍可能有效，但非本轮主线**；未重新授权则不自动开工 |
| GAP 表 P0：存档备份 / 异常兜底 / 版本号「缺口」 | **已落盘（过期为缺口）** — 对应 `fb01fdd2` / `3915e2d5` / `13d0c524` 等 |
| GAP 表 P1：迁移链 / 读档校验 / 模型容错 / 反馈包 / e2e / CI Node+audit | **已落盘（过期为缺口）** — 见上方 Done |
| GAP 表 P2：性能监控缺聚合告警 | **已落盘（过期为缺口）** — `101fc986` |
| GAP / numbers 草案：硬编码「全未搬」 | **部分过期**：已搬 6 条（`3b8c1be2`）；附录 **11 条仍未搬** 仍有效 |
| PROGRESS-0b：待 push p2 / 周审 | **过期**：p2 已 merge（`7ea583a7`）并已 push；其后又有 numbers 提交 |

## 记录入口

- 跟踪勾选：[`_newbot_tmp/PROJECT-TRACKER.md`](_newbot_tmp/PROJECT-TRACKER.md)
- numbers 交接：[`_newbot_tmp/HANDOFF-NUMBERS-REGISTRY-2026-10-19.md`](_newbot_tmp/HANDOFF-NUMBERS-REGISTRY-2026-10-19.md)
- 遇敌草案：[`_newbot_tmp/DESIGN-ENCOUNTER-AND-CHAINED-COMBAT-2026-10-19.md`](_newbot_tmp/DESIGN-ENCOUNTER-AND-CHAINED-COMBAT-2026-10-19.md)
- 工程健壮性核对（多项已落，附录硬编码仍有效）：[`_newbot_tmp/GAP-TABLE-2026-10-18.md`](_newbot_tmp/GAP-TABLE-2026-10-18.md)
- 策划轮次（不替代本文件权威）：[docs/PLANNING-ROUNDS.md](docs/PLANNING-ROUNDS.md)
- 历史状态归档：[PROJECT-STATUS-ARCHIVE-2026-10-12.md](PROJECT-STATUS-ARCHIVE-2026-10-12.md)
