# 战斗第2阶段 · 精简合同交付

日期：2026-10-06 SGT。代码及静态门禁已完成，未提交/推送。用户补充4要求先完成统一id总表后再测第2阶段；本轮不重建8097，不启动第3阶段。原脏工作区保留，合规正文/标记不改。

## 接线结果

| 场次 | 合同/触发 | 结算 |
|---|---|---|
| F01 | contracts/f01.json；iron_bridge_ambush 的 break_iron_bridge_ambush | 主角独战六名刺客；武二郎中毒、凝羽行功为开战状态，不进可行动名单。完整结算3回合未倒下→黑纱女子出手收束；第三回合先判倒下，不能先发胜利。 |
| F02 | contracts/f02.json；s03b_snake_flower_bridge_01 的 advance_declared_objective | 带重伤蛇彝男子对主角；凝羽药效未退不可行动。男子倒下/制住即赢；主角倒下即结束。 |
| F04 | contracts/f04.json；s04b_lingfei_baiyi_crisis_03 的 advance_declared_objective | 主角、乐明珠对鸦人；阿夕被抓/失神不进名单。鸦人倒下即赢，代码定向发剧情道具。前一拍_02保留原事件入口，不额外替换。 |
| F05 | contracts/f05.json；s04b_lingfei_baiyi_crisis_10 的 advance_declared_objective | 主角、武二郎对两名鬼武士、巫师、血虎。前三人分别倒下即赢；无需把血虎再打一遍，濒死转制住；绑在塔柱的花苗人与使者不进战斗名单。后续认血虎/凝羽现身事件保留。 |

所有四场主角倒下使用 lcq.ending.fail.combat 的最简「游戏结束」卡，没有另编结局正文，不恢复倒下角色。未增加旧全文的代价表、问话上限、固定伤情分档、留活口机制等。复用既有宿主/通用检定与状态链，不把旧原著收束硬套到玩家实际胜负。

## 道具总清单现状与新增条目

新增 lcq.item.crow_bamboo_tube，显示名「竹筒」，说明「鸦人携带的竹筒，内装一张空白羊皮信。」；storyItem=true。授权来源是用户补充1–3。

项目实际物品定义是37关 content.items，初始化到 runtime.canon.items；共享atlas没有物品字段，未找到独立全项目道具总表。本轮不另起总表：登记在04b及后续05b的既有物品清单，tracked canon-authority-overlay是源，builtin是生成投影。F04仅引用id；入账和回执从清单取名称；剧情道具排除随机池（即使误配置进随机表也不掉落），普通道具逻辑不变。

全局合并建议交用户审查，不声称两份阶段投影已经是统一总表；缺口已列入同轮盘点。新竹筒名称与说明可由剧情策划后续修订源条目。

## 本轮文件与落点

- src/modules/sceneModule/contracts/f01.json:1、f02.json:1、f04.json:1、f05.json:1：四份新精简合同。
- src/modules/sceneModule/contracts/registry.ts:3、:25：四场正式注册，复用统一宿主与旧路径开关。
- src/modules/sceneModule/host/controller.ts:163：通用终局卡、回执/赢局历史写回。
- src/modules/sceneModule/host/writeback.ts:16、:50：通用失败不恢复倒下；奖励只引用id、清单名称回执。
- src/modules/scenarioMods/schema/content.ts:41：storyItem标记。
- src/modules/scenarioMods/locationLoot.ts:51：剧情道具不进随机掉落。
- mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json:11854、lcq.stage_05b.json:8884：竹筒定义来源，幂等插入。
- src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json、lcq.stage_05b.json：相应物品投影。
- scripts/generate-scene-combat-checkpoints.mjs:12：七个新档回放目标，F01准备完成后捕获战前。
- tests/sceneStage2.test.mjs:1：新增15项真实宿主/合同/掉落验证；tests/sceneCombatCheckpoints.test.mjs：同步七个目标与六场经过。
- PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md、docs/handoffs/2026-10-05/COMBAT-WIRING.md、本交接、ID-AUDIT-SUMMARY.md：当前状态与依赖。
- 门禁生成：builtins/character-registry.json 的 generatedAt 与 builtins/manifest.json 版本产物。未借门禁改角色语义。

以上为本轮清单，不包含工作区其他阶段未提交改动。执行前备份：/tmp/xiantu-stage2-backup-20261006-005043、/tmp/xiantu-stage2-item-backup-20261006-010455。

## 验证

| 验证 | 结果 / 原始日志 |
|---|---|
| 相关定向 | 100/100；/tmp/stage2-focused-final.log |
| tsc --noEmit | 0错误；/tmp/stage2-tsc-final.log |
| 全量串行 | 1531项，1526过/0败/5既有skip；/tmp/stage2-full-final.log；约61秒 |
| canon:build | PASS 64.0秒，内含同一全量计数；/tmp/stage2-canon-final.log |
| git diff --check | 通过 |
| 新档检查点 | DONE7；/tmp/stage2-checkpoints.log |

测试覆盖F01整三回合及第三回合倒下优先、F02敌方重伤、四场主角倒下终局、四场赢后单次事件推进、预览不掷骰、F04自动入账/重复写回不重复发放/不入随机池、F05血虎濒死制住及未倒下不妨碍胜利、sceneModule关闭回旧路径。门禁与确定性回放不是真实模型/真人试玩PASS。

## 检查点与8097

检查点绝对目录：/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/_newbot_tmp/combat-checkpoints/。

新四个文件：F01-before.json、F02-before.json、F04-before.json、F05-before.json；旧F03/F10/F13同时重生。均是游戏原生导出包装 {type:'saves',saves:[…]}，原raw文件保留。通过真实新档初始化与生产宿主的确定性回放生成，不手工强塞旧档状态/完成标记；称呼、关系和状态由当前初始化/账本计算。

待总表及部署获准后，存档界面导入相应-before.json，选择导入的战前档读档，然后输入战斗行动进入预览→确认→结算。沿用检查点读档另建复测档保护原检查点。当前老8097包尚不含新四场，不拿它测这些文件。

8097本轮未重建/重启，本地 dev/combat-trial/dist/combat-trial.js MD5仍 f5e92d4eeb2a2418778fb3127d3ec8fc。主模型跟后台配置保留；保护端口/PID未动。真实模型自由识别、整段体验、3回合叙事节奏均未测，留待总表落地后。

## 未完/需决定

- id统一方案待用户审；完整盘点见 _newbot_tmp/id-audit-2026-10-06.md 与 ID-AUDIT-SUMMARY.md。
- 通用游戏结束只有最简卡，具体结局正文若需要由用户/剧情定，不自行编写。
- 剩余场次F06–F09、F11/F12/F14未开始；F14谢艺只重伤，生死托付，lose→E08口径保留。W07、活口供词成功等既有真机债务不因本轮门禁关闭。
- F01采用合同允许的六人敌群，不额外拆为六套单人行动；五样合同之外的细节交主持模型，不增加机制。

## 后续统一实体接入（同批续做）

上述“待总表/未入包”为历史交付状态，现由[ENTITY-SYSTEMS](ENTITY-SYSTEMS.md)覆盖：道具总表 `mod-kit/entity-catalog/items.json`（309项），竹筒storyItem在此定义、阶段只引用id；七份-before导出均按entitySaveFormat=1的新档流程重生。最终tsc0、全量1550项1545过/0败/5既有skip、canon绿66.0秒。8097已含四场及统一实体改造，LAN/磁盘MD5 `c01331bf004d3ae78d70ac925acd5393`。导入-before文件即可进入新档回放检查点；不要导入raw文件或旧格式档。尚未做本包真模型/玩家体验验收；第3阶段未开。
