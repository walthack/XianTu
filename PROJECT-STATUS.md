# 六朝仙途 · 当前项目状态

更新时间：2026-10-12；当前执行批次：1012TESTCFG（文档交付，承接1012DEPLOYTRACE）。**整体 PARTIAL；1012FIXLIST修复已发布8097，可供用户真机复测；诊断已授权部署8097，等待下一轮真实中止日志。**

## 当前交付与版本

- 1012TESTCFG：28份真机/复测执行书及测试指引加入固定配置前置，[统一规则与完整覆盖清单](docs/TRUE-DEVICE-TEST-API-PREFLIGHT-1012TESTCFG.md)。正式API配置只读派生到私有profile；main固定MiniMax-M2.7-highspeed，Jev/Deepseek分配全部替换，首请求前核实实际模型，读不到配置或gpt-4o默认回退即停。仅文档，未实际注入/发模型请求，未提交，8097不动；产品验收状态不升级。

- 修复源码提交：`2886f559a419d65d637d2e87cb362a3d84a3157d`；后续诊断按1012DECIDE独立提交。私有目录不入提交；未推送。
- 8097现为诊断提交`af7aa6d94e220f7fde4af55094d09392e64797e9`，combat-trial.js SHA `f112193cb6bc9db5bf036aa9e2dd4cafceed401b52c9c06ed0ee0fdf818431a8`；本机/两个LAN接口一致，原PID65144及启动时间不变。上一220531f2整包27文件备份可回滚，未重启。
- 修复发布前canon：1663过/0败/5跳，沿用Claude Opus5.5代码PASS；诊断独立提交门禁：1672过/0败/5跳、type-check/私有构建/内容包过期/diff通过，21项定向及受控浏览器通过。诊断未另报Claude PASS，不等同完整30秒SLA或真人体验PASS。
- 隔离候选生产UI：F06交涉及自然胜局收束、第87章合法逃兵盘问通过；D2旧动作门禁、D4开场、D5范围路由补证。南荒一期新档连续游玩在F01铁桥自然败局死亡，发行终点NOT_REACHED，未重开刷赢。
- 15份正式存档/API文件的哈希、大小、mtime前后完全一致；runtime.ts和AIBidirectionalSystem.ts本轮无改动。测试私有服务/浏览器已关闭，证据保留。

## 当前P0

| 项 | 当前状态 | 交付/证据边界 |
|---|---|---|
| 社交目标错误扣战斗级差 | 修复、候选验证通过；已发布8097 | 合同配置modifierProfile，读取既有social权重；F06 DC7/加值0取代-12；战斗/防御仍按级差。固定机制与边界测试通过。 |
| F07逃兵旗标跨关丢失 | 产品根因已修、候选验证通过；已发布8097 | strictInitializer继承白名单漏合同hook事实；真实败局→04b→05b回放旗标保留，生产UI第87章自然骰12、geluo_checked=true。 |

## 当前P1

| 项 | 当前状态 | 下步/边界 |
|---|---|---|
| 约30秒中止与慢回合 | 诊断已部署8097；真实中止复测待执行 | [请求方案](docs/handoffs/2026-10-12/1012FIXLIST-REQUEST-PROPOSAL.md)。只执行方案第1步日志；分模块预算、重试、模型策略未实施。完整30秒SLA仍未验收。 |
| F09一阳结构化ID | 补齐、候选验证通过；已发布8097 | 旧九阳层次字段已存在；新增sceneLedger.cultivation['lcq.technique.jiuyang']回执，JSON读回/跨关/幂等通过。旧已结算receipt不自动回填。 |
| 新场胜率偏高 | 热改方案交付，未实施 | [候选值及统计](docs/handoffs/2026-10-12/1012FIXLIST-TUNING-PROPOSAL.md)。F07/F08/F09/F14参考64.75/64.75/55.80/66.75%；F06候选94.95%未合格，未纳入热改。F08/F14缺等级限制单列。 |

## 当前未验收与依赖

- 南荒一期发行终点未自然到达；F01本局真实败局，不因此扩本轮战斗机制/数值修复。D2该F10合同无prepare动作，真机prepare项不适用，不虚构PASS。
- 真实玩家反馈、跨模型、长期平衡及完整回合30秒SLA仍缺验收证据；当前真实浏览器执行观察不能替代真人体验。
- 用户10/12 08:14已授权本轮代码提交及8097合包，已完成；第3条方案只补第1步日志、单独提交；09:02再授权从当前HEAD门禁后部署诊断，已完成。热调候选本次不上，超时/重试/模型策略不动。本轮完成授权发布和诊断即停止，不追加漏句/词表或扩大内容、合规范围。
- 本轮DEPLOYTRACE门禁：1672过/0败/5跳（223.8秒）、type-check/内容包/构建/diff绿；已部署页面验证诊断入口及JSON下载，未进行真实模型30秒中止复测。[测试员采集/导出指引](docs/handoffs/2026-10-12/1012DEPLOYTRACE-TESTER-GUIDE.md)。
- 总策划读取本文件及[策划轮次](docs/PLANNING-ROUNDS.md)；模块策划接手打磨时以[逐项结果](docs/handoffs/2026-10-12/1012FIXLIST-RESULT.md)的证据层和未验收项为准。

## 记录入口

- [当前诊断包SHA、日志入口与测试员导出](docs/handoffs/2026-10-12/1012DEPLOYTRACE-TESTER-GUIDE.md)

- [1012DECIDE提交、发布、回滚及诊断验证](docs/handoffs/2026-10-12/1012DECIDE-DELIVERY.md)

- [1012FIXLIST逐项结果、门禁与改动文件](docs/handoffs/2026-10-12/1012FIXLIST-RESULT.md)
- [历史状态归档](PROJECT-STATUS-ARCHIVE-2026-10-12.md)：重写前PROJECT-STATUS全文逐字保留，包括10/06及更早的旧“当前真相”/P0/P1表，以及后续历史段落；未删除。
- [更正版原真机报告](../playtest-2026-09-28/REPORT-2026-10-11-truedevice-p0p1.md)、[原报告Claude复核](docs/handoffs/2026-10-11/TRUE-DEVICE-READONLY-REVIEW.md)。
