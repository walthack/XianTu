# 第五批实现交接（2026-10-04）

READY_FOR_RETEST；没有 commit/push，没有运行全量单测、tsc、build、canon:build 或真机。原有工作区全部保留。备份：`/Users/clawbot/Desktop/xiantu-batch5-backup-20261004/pre-change.tgz`、`preexisting.patch`。

## A：搜刮

- 独立 `mod-kit/location-loot.qingyu.json`：81个规范清羽地点，全部 `status: pending`、`entries: []`；没有填写任何南荒掉落内容。按规范地点归一，别名不会获得额外配额。没有规范地点ID的路途节点返回pending、不耗配额，本轮不另造地点ID；填表时如需搜刮这些节点，须先补地点登记。
- 默认每地3次、没有冷却。普通槽65%／25%，稀有3%，大额币2%；普通槽不重复选同一条，稀有最多一件、大额币最多一组；普通地点每次全部货币合计不超过80铜铢等值（银铢100铜、金铢2000铜沿现有货币表）。特殊地点必须明写 `kind: special/maxCopper`，不默认放大。
- 存档新增 `世界.状态.剧本模组.locationLoot`：初始种子、各地次数、一次性条目、已领关键物、含掷骰种子的完整回执。身份／建档信息派生初始种子，地点＋第几次派生骰序，同回合回执防重。pending不消耗配额；旧档无字段时懒初始化，跨关继承。
- `locationLoot.ts:35 settleLocationLoot`：先验证清单和前置，关键物默认必出且仅一次；普通两槽加稀有／货币槽。清单物品必须在当前正典目录里，未登记物不会入包。关键物已在背包、已由合同给出或已搜刮给出，都不再重复给；既有剧情合同入口共用防重，无须迁移合同。
- `AIBidirectionalSystem.ts`：清羽模块自由输入“搜刮／我搜刮这里”先在副本结算，把回执交模型；成功发布才对真实存档入账。传输失败两次停、不消耗次数。三稿正文拒收可用回执正文兜底。清单外观察不拒稿、不授予物品，模块命令无背包写权限；实际未授权物品写入仍经既有目录／指令权限校验。
- pending地点只展示未配置提示；本批真实掉落尚未开放。RNG是可复现的本地伪随机数，目的为读档／重试不改骰，不是防篡改服务。

剧情侧填表模板（填写前保持pending；条目须使用当前关正典物品ID）：

```json
{
  "lcq.location.<规范地点>": {
    "name": "地点名",
    "status": "pending",
    "entries": [
      {
        "id": "条目稳定id",
        "itemId": "现有正典物品id",
        "category": "key",
        "quantity": [1, 1],
        "once": true,
        "afterEventIds": ["必要的已完成事件id"]
      }
    ]
  }
}
```

普通／稀有用 `common/rare`、权重 `weight`、数量区间；币用 `category: currency/currency: 铜铢/large: false或true`。关键可加 `chance`（默认1），关键和稀有实物每次一件。普通地点不配置银／金大额回报；80铜上限不会因为写了银铢而绕过。具体内容、概率权重及前置由剧情策划给，不在本批杜撰物品。

## B：场景卡／事实账本 R1–R10

| 需求 | 实现及限制 |
|---|---|
| R1 | 现有动作字段支持 `cast.present/enter/exit`；演出包按步骤取演员，成功步骤立即记死亡／失踪／离场，而非等整个事件结束。归队清除临时排除。原事件related列表仍供其他引擎使用。 |
| R2 | 演出人物加入gender和称呼；称呼读取现有notes，剧情已核称呼表优先；公开外貌只投影一句、重复特征守卫；种族不含血统。没有修改源卡。 |
| R3 | 普通南荒模块回合顺延两小时；作者明确时段由本地时钟顺时对齐，幂等且不倒拨。行旅原天数结算保留。 |
| R4 | 模型材料增加上一拍要点、当前世界事实、境界／货币／背包／伤病摘要。上一拍取开拍前账本，不把本拍结果当作已演历史。 |
| R5 | `fixedFacts/forbidden/factChecks/fallbackText`接现有演出函数。指定事实由模型润色，事实缺失／越界三稿后发布作者全文，照既定结果推进；原本必须固定的旱洪首步继续固定。 |
| R6 | `sceneLedger`持久化演员状态、伤病、显示名、世界事实、最近一步；一阳记在九阳层次，附在现有高手榜展示名后，不改通用境界或战斗等级。 |
| R7 | 增加固定事实、身份、称谓、紧接人物的性别代词、时间、境界／交易回执等保守校验；未登场专名复用既有角色识别；后台voice/state审计只给当前槽下一轮纠正提示，不反填世界事实。检查不是完整自然语言理解；真模型误拒／漏拒仍需复测。 |
| R8 | 王哲／段强只作为已故账本与禁止现身条目，不再每回合注入十里焦土原句。保留死亡／复活守卫。 |
| R9 | 阴蛛袭击在营地边，新prepare步骤→后事→向导；第四轮旧焚尸文本改写并合并，无第二个重复死亡事件。赴熊耳铺挂后事步骤。旧档已焚尸保留进度、防重演／重收路程。铁桥补武二郎，整合使者／乐明珠逐步演员；使者成交时才解锁阁罗。凝羽开价首步目标由展示投影收窄，不提前谈来源。小紫源race改动待确认，运行时公开投影先为碧鲮族。 |
| R10 | 当前新增按钮／预填为玩家口吻，后事不提前宣告死讯；未报姓名时“同使者谈兵器生意”。作者约束、forbidden留模型材料。D的源actionText没有改。 |

实际覆盖：03b 9事件／12动作，04 7事件／9动作，04b 34事件／46动作，共50事件／67动作。09文档“58步骤”与当前多步合同不一致；按实际全部67动作铺卡，不裁掉多步合同。已降级zixi_intercept、persuade_wuerlang及DEBT ice_gu_coercion不铺试玩场景卡。

五个定案：阴蛛营地边；一阳沿现有显示表附层次；易虎是失踪；K6只有别人的血，不记凝羽受伤；源卡只清理核实矛盾且先确认。花苗新娘在揭名步改用乐明珠；鳄鱼拍不提前出现小紫。

## C：第109–112章事件承接

采用扩大原事件的最小方案。ghost_king_swallowed 的description／axisBeat包含聚杀、决战、布阵、唤龙；axisAnchor采用仓库既有复合axis格式。

这里axis编号比小说实际章号大2：第109章是qingyu.111.*、110是112.*、111是113.*、112是114.*。复合锚点包含对应既有节点，保留主axisId qingyu.114.2、axisSeq、事件ID、rail／前置／完成flag和单动作结算。不新增战斗机制、战斗胜负判定或谢艺生死影响。这是战斗叙事承接，细分战斗操作仍由模块策划另案设计。

## D／待确认

- 对备份逐字段比较：03b／04／04b opening.text，以及全部旧动作actionText，均未改；registry字节也与本批开工备份相同（保留New Bot刷新过的generatedAt）。D由剧情策划处理。
- 小紫源race勘误见 `BATCH5-CHARACTER-CORRECTIONS.md`；待确认后才改源卡并脚本重建。凝羽／苏荔源卡没有擅自删字段。
- 需要剧情策划：确认上述小紫清单、提供各地点掉落条目、逐拍核对50事件67动作。现有境界表没有一阳到通用等级的换算，暂保留原通用等级；若要改变战斗等级须另裁定。

## 验证

21个定向文件串行：200／200通过，0失败／0跳过；`git diff --check`通过。日志 `/tmp/xiantu-batch5-focused-final.log`。另端到端断言证明成功搜刮推进worldTurn，失败不消费配额；种子／关键防重／80铜上限、演员按步、三稿兜底、传输两次、源卡哈希、overlay双套用和builtin重建、行旅跨关、既有锁与库存等已覆盖。

未运行本批全量、tsc、build、canon:build、真实MiniMax或真机；New Bot第四轮全绿只作开工基线。没有重启服务或使用8091，没有commit/push。定向测试为控制夹具证据，不等于真人体验PASS。

## 本轮改动文件（相对开工备份）

- [PROJECT-STATUS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/PROJECT-STATUS.md)
- [docs/PLANNING-ROUNDS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/docs/PLANNING-ROUNDS.md)
- [docs/handoffs/2026-10-04/BATCH5-CHARACTER-CORRECTIONS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/docs/handoffs/2026-10-04/BATCH5-CHARACTER-CORRECTIONS.md)
- [docs/handoffs/2026-10-04/BATCH5-IMPLEMENTATION.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/docs/handoffs/2026-10-04/BATCH5-IMPLEMENTATION.md)
- [mod-kit/canon-authority-overlays/lcq.stage_02.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_02.json)
- [mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json)
- [mod-kit/canon-authority-overlays/lcq.stage_04.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_04.json)
- [mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json)
- [mod-kit/canon-authority-overlays/lcq.stage_05b.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_05b.json)
- [mod-kit/canon-authority-overlays/manifest.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/manifest.json)
- [mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md)
- [mod-kit/location-loot.qingyu.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/location-loot.qingyu.json)
- [src/modules/scenarioMods/builtins/data/lcq.stage_02.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json)
- [src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json)
- [src/modules/scenarioMods/builtins/data/lcq.stage_04.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json)
- [src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json)
- [src/modules/scenarioMods/builtins/data/lcq.stage_05b.json](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json)
- [src/modules/scenarioMods/characterResolver.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/characterResolver.ts)
- [src/modules/scenarioMods/fixedEndingNarratives.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/fixedEndingNarratives.ts)
- [src/modules/scenarioMods/inventoryTransactions.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/inventoryTransactions.ts)
- [src/modules/scenarioMods/legacyNarrativeContract.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/legacyNarrativeContract.ts)
- [src/modules/scenarioMods/legacyNarratorPacket.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/legacyNarratorPacket.ts)
- [src/modules/scenarioMods/locationLoot.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/locationLoot.ts)
- [src/modules/scenarioMods/modularTurn.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/modularTurn.ts)
- [src/modules/scenarioMods/playerActionPresentation.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/playerActionPresentation.ts)
- [src/modules/scenarioMods/presence.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/presence.ts)
- [src/modules/scenarioMods/runtime.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/runtime.ts)
- [src/modules/scenarioMods/schema/scenario.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/schema/scenario.ts)
- [src/modules/scenarioMods/strictInitializer.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/strictInitializer.ts)
- [src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts)
- [src/modules/scenarioMods/travel/travelLedger.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/travel/travelLedger.ts)
- [src/modules/scenarioMods/validator.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/validator.ts)
- [src/utils/AIBidirectionalSystem.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts)
- [src/utils/realmUtils.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/realmUtils.ts)
- [tests/canonAuthorityOverlay.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/canonAuthorityOverlay.test.mjs)
- [tests/locationLoot.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/locationLoot.test.mjs)
- [tests/modularTurn.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/modularTurn.test.mjs)
- [tests/nanhuangSceneLedger.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/nanhuangSceneLedger.test.mjs)
- [tests/nanhuangTravelLedger.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/nanhuangTravelLedger.test.mjs)
- [tests/run4FollowupRepairs.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/run4FollowupRepairs.test.mjs)

未触碰其他任务的 `dev/`、`tests/combatProto.test.mjs` 或第四轮其他未提交文件。CANON-DECISIONS单向镜像到NAS，仅为阅览镜像。
