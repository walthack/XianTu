# 秦线补全接手交付（QIN-FILL-20261028）

用户授权：2026-10-28 五线补全；本轮接手额度中断的未提交工作。分支 feat/fast-no-legacy；git pull --ff-only 返回 Already up to date。不推送，不动 runtime.ts、AIBidirectionalSystem.ts、frozen-baseline.json。

## 已交付与证据边界

- 内容包关 `lyg.qin_xianyang`（沿用项目书名前缀，不另造 liuchao 关类型）：Q-1–Q-17、Q-23 共18事件，14个默认必经拍上 rail，4个条件拍 Q-3/Q-8/Q-13/Q-15 挂 rail 所在首章、非 critical。四幕的后章保留前章 done activation；现有 rail 贯穿全关，界面按事件显示所属幕名，不声称引擎逐幕切章。
- 线卡13步改为12步：删除收束终步，10步去 pending；Q-20/Q-21 两步仍 pending。知情由 Q-1 完成决定，默认收束由 Q-23 写 `flags['line.qin.outcome']='unresolved'`。没有去秦国的存档不写记录。无主角身份授予，徐君房的客卿不得写成主角身份。
- 固定事件正文、动作文字、回执、rail合同及开场在 `qin-texts.json`；内容包编译器为 stages 支持严格 `$text` 和既有 `$num` 引用。动作单步成本在 `story.qin.actionTimeCost`，schema 规定只能为1。catalog 只由编译器生成。
- 直接以该关创建真实 runtime，逐个完成当前 active 拍，验证默认收束及 stage_ready（夹具给 nextStageId=NEXT，只验证放行门，不代表已有出秦目标）；这证明秦关内部可走通，不代表已接通国家线入口、真实模型、UI或跨关出秦。
- 回归包含：默认逐拍/线卡推进、救援有无的 Q8/Q13、party 开局规则有无及离队排除、汉身份与事件完成分离、晋称呼变体、18事件/轴段/Q2留白、文本和数值引用。可达性/axis序守门已纳入内容包关。

## 待核结论与明确欠账

| 项 | 结论／当前边界 | 后续需要 |
|---|---|---|
| axisSeq 2001–2022 | 已检索 src 所有非 JSON 读取点：runtime 的锚点/同回合完成排序、eventReconcileService 的候选前缀、divergenceControl、storyContext 均在本关事件内排序；strictInitializer 仅复制上下界。未发现用 seq 换算日期或跨关比较全局进度的消费点。秦段独立排序安全。 | 全部 axisId=null，axisMethod 明记扩写，axisAnchor 留原稿章行；没有轴产物，不猜造绑定。 |
| 入点与出点 | strictInitializer.ts:324 起只接受当前 nextStageId/nextStageReadyId；mainQuestAxis.STAGE_ORDER 是单链。秦关 manifest 前后关皆 null，未修改既有链。Q1 条件虽声明 anyLineClosed，但 rail 激活本身不检查该条件，不能把它当入口闸门。 | 独立的国家线调度合同：任一国家线收束→可选秦关（大祭前），保存返回去处、出秦恢复；这属于切关逻辑分叉，按用户要求不硬改。本轮只交方案，不新增伪入口。 |
| Q1/Q3 身份 | 新登记汉舞阳侯、晋盘江少主两个已定身份定义，仅供读取，不加授予规则。已删除上一代理用 done 受封事件代替身份的读取。Q1按晋身份分称呼，Q3按汉身份 exists 激活。 | 宋职身份枚举/授予规则仍空；事件条件只有AND，没有 OR/通配，Q3的“汉或任一宋职”尚未完整实现。不能把完成旧事件当身份。 |
| Q5 互斥军营路 | 无身份默认路线通过军营；当前 rail 对所有档仍是静态序列，不检查 conditions。有汉身份时可以做Q3，但仍不能正确跳过Q5，所以不宣称身份分流已完成。已删除自行编造的“递国书后仍需跑军营”变体。 | 单个 identity 的缺失可由 neq true 且 neq false 表达（读值为 true/false/undefined）；完整宋职集合及 OR/NOT 合同未具备。更关键是 runtime.ts:3967–3985 的 rail 激活/整轨完成逻辑须支持可选互斥拍，或新增通用分支轨合同；冻结文件本轮不改。 |
| Q15 party | ledgerConditions.ts 已接 partyLedger.ts，无需新增读取点；Q15实际条件可用。 | 生产 partyJoins/partyLeaves/partyOpenings 仍空，所以不会自行认为凝羽在队。本轮夹具注入规则验证有队/无队/离队，不冒称生产同行数据已填。完整入离队规则待补。 |
| 虞氏姐妹救援上 rail | rescue_yu_sisters 在太泉余波首章、seq673、critical且未上rail；现rail从01蚁穴起步。单补救援会改变默认必经路径，并牵涉同章seq672前置两拍及674后续；不只是一处排序修正。 | 本轮不动汉线rail；Q8/Q13只读真实救援完成，默认未救就不出现且不挡收束。后续整体核太泉四拍次序，不补写假救援。 |
| 2–3年推进 | 现有 objective_action 的 timeCost 是字面量1，表示动作回合；axisSeq 不推日历。此次只配置动作成本，没有把18回合冒称2–3年。 | 需通用事件/幕间日期推进合同和幂等存档结算，不能只在正文宣称过了数年。此项未实装。 |
| 地区立足度 | 秦关地区映射供线卡识别；旧 regionStanding 仅按 STAGE_ORDER，线性链末尾秦国仍为0，既有六区仍到顶；测试明确这个边界。 | 并行调度落地后改读实际经历，不能靠把秦塞入线性链伪装完成。 |

原著依据使用用户秦稿给出的 lcq/lyl/lyg 行号，仓库可核定的是条件语义、已有事件/人物/地点、客卿归属；本轮未取得缺失正典轴或另做全本原著校对。新事件固定为扩写，不伪称原著有主角亲历咸阳的逐拍。

## Q2 留口

不实现 Q-18 `qin_act3_choose`、Q-19 `qin_act3_trade_route`、Q-20 `qin_act3_baiqi`、Q-21 `qin_raid_branch`、Q-22 `qin_close_overthrow`。等用户定扶持对象后，在 Q-17 后插第三幕分支；Q-23 与 Q-22 改互斥收束，closedWhen 扩为两条 anyOf，并补 resolved 规则。现在只有默认 unresolved，不预选公子稷或其他候选。

## 验证记录

npm test：2752 项，2723 通过、26 失败（全部为缺 canon:build 产物的 ENOENT）、3 跳过；type-check 只有 controller.ts:187 旧错。canon:build 已实际尝试，因缺 `mod-kit/generated/deepseek-v4-flash/qingyu/stages` 在管线启动枚举时 ENOENT；按本次用户明确指定的 npm test/type-check 基线验收，不称 canon 全绿。无需裁定簿改写或 NAS 镜像同步（未修改裁定与受保护字段）。

额外只读检查：人名棘轮仍报7个既有文件超预算；本轮将新增 rail 文案迁入 texts 后，canonRail.ts 的计数与 HEAD 均为490，没有扩大该历史欠账，也未改棘轮基线。
