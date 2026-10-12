# 1012FIXLIST 修复与验证记录

本线程用户清单为准。基线HEAD `aac321a0`，工作区已有六个社交修正相关文件改动；本轮保留并补齐，初始diff存在私有证据目录。未提交/推送；不改8097及受保护服务、不删除文件、不改合规/纯战斗数值。证据层上限为隔离候选，不是部署/真人体验验收。

| 项 | 结果 | 证据与边界 |
|---|---|---|
| 1 社交判定 | 修复/定向通过 | 合同modifierProfile→game-numbers.goalModifiers.social；host读取现有social权重，禁级差且缺属性不回退combat；combat/guard保持原规则。F06及阁罗合同v2兼容v1，要求重新预览。 |
| 2 F07跨关旗标 | 产品bug修复/真实来源回放+生产UI通过 | `strictInitializer.ts`旧继承白名单在04b→05b丢掉非scene前缀的逃兵旗标；新版派生合同hook flag白名单。旧真实败局档前true后undefined，新版前后true。生产UI第87章触发盘问，自然骰12胜、geluo_checked=true、接阁罗召碧奴。 |
| 3 中止/慢回合 | 仅方案 | [原因及方案](1012FIXLIST-REQUEST-PROPOSAL.md)，未实施超时/重试/模块策略改动。 |
| 4 一阳 | 结构化ID记录补齐/定向通过 | 原代码已保存`角色.属性.境界.九阳层次`；旧“没结构化保存”归因过强。本轮新增sceneLedger.cultivation['lcq.technique.jiuyang']的stage/eventId/actionId；胜败JSON读回、跨关、幂等通过。原有旧receipt不自动补新字段，不从历史演出文字猜写。 |
| 5 F06/F07重测 | 隔离生产UI通过 | F06交涉DC7/加值0（旧-12），同一自然局16次检定后胜并接拔叉疗伤；中间失败、可恢复澄清和请求abort保留。F07源档派生前置真实，盘问触发与结算消费标记通过。 |
| 6 D项与一期自然终点 | D2/D4/D5补证；一期NOT_REACHED | D2浏览器生产入口旧动作拒绝，save逐字不变；该F10合同没有prepare动作，不虚构准备动作真机PASS。D4新档自然过stage02、正文精确，普通初始化不替换；D5两条范围内自然输入+一条激活范围外输入回执齐全。一期从新档开始自然连续推进，同一局在F01铁桥三次检定13/17/16均失败、自然死亡，未达终点；不控骰、不导检查点、不重开刷赢。 |
| 7 热改数值建议 | 方案交付；F06未合格 | [热改方案/候选值及统计](1012FIXLIST-TUNING-PROPOSAL.md)。F07/F08/F09/F14参考64.75/64.75/55.80/66.75%；F06拒绝候选94.95%且101局未收束，未纳入热改。F08/F14等级缺失单列。所有生产数值不变。 |
| 8 项目状态清理 | 已完成 | PROJECT-STATUS只保留当前状态/当前P0/P1；原全文逐字保留在根目录PROJECT-STATUS-ARCHIVE-2026-10-12.md，相对链接位置不变，未删除历史。 |

## 门禁与审核

- 新增定向测试5项通过；完整canon:build：1663通过/0失败/5跳过（216.6秒），含37关、合同lint、数值模拟与全量测试；type-check通过。构建产物仅内容包编译器生成。registry只有日期/生成时间改变，经结构化比较内容相等后保留旧元数据。
- Claude job `claude-2026-10-11T18-04-51-443Z-2161b76e`，Opus5.5只读复核：代码PASS，无P0/P1。其自报写了plan文件，未修改产品；未启用sourceGuard，不能把工具默认sourceGuardPassed当作前后快照证明。不升级为真机/8097PASS。通知标reported并暂停。
- 二审P2观察留档不扩修：参考检查点生成器缺social参考ctx（生产不受影响）；未知modifierProfile运行时回默认但构建lint拦截；社交场面brief/敌方阶段仍有级差表述/计算（本次只改玩家goal）；新ID记录暂无消费者，旧receipt不自动回填。数值打磨只交方案。

## 证据位置

私有目录 `_newbot_tmp/1012fixlist/`。初始diff、旧新F07派生log/raw、F06/F07完整结束存档、D2门禁JSON、D4连续保存/开场比对、D5有效与无效前置尝试及逐请求日志均保留。

- UI包 `220531f211dfe2ea6c4048c86d01d593a9eb0706c5d35d43377a3c545ce3afb6`：F06/F07，18424私有服务。
- 框架探针包 `0be9a444cfb4c74ee8d8da916a8b847883134df821a04b234e02a83c9f613173`：18425，只多暴露生产导出供隔离D2 `/eval` 使用，不发布探针。
- 8097仍是旧包`9d9e1333…`，本轮未构建/替换其目录。15份正式文件守卫的哈希/大小/mtime前后完全一致，原8097 PID65144及包哈希不变。9506/9507/9508浏览器与18424/18425私有服务已关闭；证据文件未删除。

## 逐项根因与改动文件

### 第1条（目标修正配置；单一机制）

- 类型由合同goal的`modifierProfile`指定，配置指向`game-numbers.goalModifiers`；`social`读取既有weights.social，不把parley等目标ID写进TS。未知profile构建lint拒绝；缺失social属性ctx抛明确错误，不回落combat。
- 正例：F06 parley及F07阁罗交涉；留出合约自定义bluff support与guard，未知/同级/极大级差比较；host当前social权重计算等式，负例缺属性/未知profile。战斗/防御仍有级差。未改语义候选/结算/内容。
- 改动：`mod-kit/game-numbers.qingyu.json`；`src/modules/sceneModule/{types,levels,numbers,plan,lint}.ts`；`src/modules/sceneModule/host/factors.ts`；`src/modules/contentPacks/packs/qingyu/{f06,f07-geluo}.json`；编译器生成`src/modules/contentPacks/generated/catalog.json`；`scripts/combat-simulation.mjs`仅补参考ctx的属性profile，不改生产数值；`tests/goalModifierProfiles.test.mjs`。其中部分社交改动为开工前已有，原diff保留。
- 门禁：3项定向测试+全量canon/type-check通过；F06生产UI交涉DC7/0、随后的战斗仍有级差。

### 第2条（唯一分类：前置验证事实跨关继承）

真实来源：`_newbot_tmp/truedevice-p0p1-20261012-codex-01/evidence/CF07-lose-full-save.json`。旧生产初始化在04b→05b时，`lcq.f07.escaped`由true变undefined；因此原派生档缺标记不是简单夹具手工漏写。修复合同hook持久事实白名单后，同样生产回放前后true。未手工补旗标，未按失败句补关键词。

- 改动：`src/modules/contentPacks/index.ts`、`src/modules/scenarioMods/strictInitializer.ts`、`tests/crossStageContractFacts.test.mjs`。
- 回归：合同required/escape/consumed flag的true和false均跨关保留；无关关内flag不继承；JSON round-trip；第87章production UI合法前置触发盘问、消费checked旗标，接下一拍。
- 原F07败局真实；其后回放生成第87章前置含F08/F09控制胜局，只算合法前置的定向盘问测试，**不算整条旅程自然连续证据**。原坏夹具/新夹具/逐步丢失log都保留。

### 第3条（调查/方案）

只读源代码及原/本轮请求日志，不改deadline、重试、流式、后台策略。具体建议和确认/推断边界见请求方案；需用户裁定后另开实施。

### 第4条（唯一分类：结算路由补结构化ID回执）

原代码已有`角色.属性.境界.九阳层次`并跨关保留；未伪报“原来完全没存”。缺口是技能ID可追溯回执。本轮沿用既有ledgerEffects.jiuyang，新增`sceneLedger.cultivation['lcq.technique.jiuyang']={stage,eventId,actionId}`。

- 改动：`src/modules/scenarioMods/fixedEndingNarratives.ts`与第2条共用测试文件。
- 门禁：F09胜/败原样写值、幂等、JSON读回、跨关persist通过；不从演出文本猜一阳，不回填已结算旧receipt。其后第87章合法档UI显示一阳，存档保有原结构化层次与新ID行。

### 第5条（生产UI重测）

F06导入生产前置，交涉后继续同一局；自然16检定胜局，不控骰，中间可恢复澄清与失败、三次约30秒abort保留，接拔叉疗伤。F07导入修复后合法派生档，自然骰12胜、escaped/geluo_checked为true。此条只有证据/测试工件，不另改产品。

### 第6条（补测结果）

- D2：浏览器真实生产导出旧动作`advance_declared_objective`被`scene_module_required`拒绝；克隆save逐字不变，未在live save上注入动作/旗标。该实际F10合同没有prepare动作，prepare真机子项N/A；不把通用机制单测冒充该场prepare UI通过。
- D4：新建qingyu入口档，真实UI自然过stage01→stage02；前两条为typed自然输入，后续为可见作者动作。标记档开场精确等于packText；普通初始化不带标记保留原开场。普通支路仅初始化对比，不声明普通整程UI通过。
- D5：两条范围内自然输入有modular receipt；有效stage03派生档由生产advanceScenarioRuntime激活s03_01，输入霓龙丝线索走modular，无DEMO_LEGACY_BLOCKED。`isScopedPlayerPresentationEvent(s03_01)=false`；save仍有试玩标记，`isScopedPlaytestSave=true`是正常语义，不能误报save判定false。首次未激活夹具输入的eventId=null失败尝试保留，不算通过。
- nanhuang-1：从入口新建档、未导checkpoint、未控骰、未reset。保留全部往返/恢复尝试，在stage02 worldTurn49、combat.f01.iron_bridge败局触发lcq.ending.fail.combat，发行终点未到。三次检定：13−4对12；17−4对16；16−3对16，均失败。本局3action checks/5defense rolls。死亡真实收束，停止，不为取得终点重开刷赢或顺手改旧战斗。
- 测试脚本错误单列：曾向隐藏主线动作填文、首个地方选项导致往返市集/店铺、分支等待器只认文本框。修的是私有驱动，不是产品；同一存档继续，所有错误尝试保留。CONT3-turn7的108.430秒含人工修正分支等待，不能当纯产品耗时。

### 第7/8条（方案及落档）

热改原/候选值、2000局完整分母、F06拒绝原因见独立方案和JSON。没有生产数值改动。PROJECT-STATUS重写前全文逐字归档；`docs/PLANNING-ROUNDS.md`沿用1012FIXLIST追加交付与未验收项，根CHANGELOG未动。

## 本轮请求全分母与结束保护

3份browser-events日志共105 chat starts：90 HTTP200、0 HTTP503、15 ERR_ABORTED；其中13次约30秒，另2次约15.130/24.996秒，原因未逐请求定位，不能全部算相同deadline。33次embedding starts；结束时全部tracked请求已drain，chat无未终结项。无pageerror。

驱动记录74个submit等候项，14项≥30秒，原始nearest-rank P95 45.371秒；另存9份foreground/分支计时记录。两种计时不直接相加：旧驱动在分支界面的ready判定与后续点击可能重叠，部分长值包含驱动修正，往返/澄清同样入分母。因此本轮**不验收完整回合SLA，也不拿过滤后的快回合宣布改善**。详细分项/取消ID/时点见`_newbot_tmp/1012fixlist/request-summary.json`及三份原日志。

15正式文件守卫、冻结源码无改动、8097哈希与PID保护已验证。候选只读Claude复核是代码层PASS；本轮总体仍PARTIAL。第6条终点与第7条F06门槛未合格均明示，有限执行到此停止；没有提交、推送、8097部署或合规改动。


## 后续用户裁定：1012DECIDE（2026-10-12 08:14）

本文上方为FIXLIST隔离执行时点的历史结果；后续修复提交2886f559并已授权发布8097。诊断另提交但不部署，热调不实施。当前提交/包/守卫与诊断验证见[1012DECIDE交付](1012DECIDE-DELIVERY.md)及PROJECT-STATUS，不把本文旧“未部署”口径当作当前状态。
