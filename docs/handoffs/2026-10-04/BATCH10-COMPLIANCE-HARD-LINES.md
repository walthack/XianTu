# 第十批：合规硬线窄修

本批按用户2026-10-04 12:25清单及11:39总裁定执行，只改C01/C02指定触线项。保留全部既有未提交改动，未commit/push，未做真机。当前为**三项门禁全绿、待独立复测**。本批中间红灯记录保留在下文，五条过期测试口径已依据最新要求和已批准裁定同步关闭。

## 逐项交付

| 项 | 改了什么 | 文件与当前行号 |
|---|---|---|
| 1 | 估龄优先读角色profile/registry的storyAge，其次以当前游戏年减birthYear；下限18。称谓不再给4–12/13–18段；未知年龄沿用成年境界区间。出生年不相容时也不生成未成年生日。旧档关系人物仅修未满18的生日，已成年生日不动，按月份/日期计算实际足岁。 | `relationships.ts:41/62/172`；`characterResolver.ts:260`年龄事实读取；`schema/canon.ts:51`年龄字段；`runtime.ts:3700`旧档兜底。新增真实新档/旧档、源卡优先、生日周年及幂等测试。 |
| 2 | 阿夕静态身份改“花苗成年少女”，软肋只去“年龄小”，身体柔弱等其他字段保留。 | 源`character-cards-v3.json:45886/45899`，registry由脚本生成。 |
| 3 | 05b阿夕仅把“小孩子气”改“天真跳脱”，骄傲、主动、淫媚、任性保留；源卡补05b阶段personality，不仅改镜像。 | `lcq.stage_05b.json` overlay:1272/2883；builtin:1704；源卡05b phase。 |
| 4 | 安乐公主只替换洋娃娃比喻为“眉目精致”，补storyAge=18及用户裁定依据；出生年不擅改。 | 源卡:13723/13764；对应六个燕歌关生成基底/镜像同步措辞，registry重建。 |
| 5 | 小玲儿静态身份“成年杀手”、身形娇小但已成年；外貌去“童颜”，阶段描述去“稚嫩”，其他成年外貌/性格字段不软化。 | 源卡:15144/15150/15225；`lyg.mijing_rumen.json`源/镜像同步。 |
| 6 | 双修/采补只有明确双方合意且无强迫/药物/控制/拒绝等信号才能结算；未知合意或强迫均failure、effects空，不恢复/不发buff，也不能用高骰点、外部effects或testOutcome覆盖。普通独自调息不变。 | `judgementEngine.ts:468/506/611`。两个原成功测试只补合意输入夹具，原结果/数值断言不变。 |
| 7 | 删除s12_zhuo_forced的人物任务登记，留下暂停说明，等待剧情侧替换。原来status=new，本来就不计可走进度；仓库没有对应已实装事件。其他82–85行不修改，触发审计见下表。 | `characterQuests.ts:86`。 |
| 8 | preferences不再指示半强迫或反复结合，改为对旧事的怨愤/敌意；shallow/deep不再解锁非自愿亲密。保留一句明确标注的原著事实记忆，限定只记录既成事实、不演出、不重复、不作亲密档位；敌意、傲娇、双标及不可软化边界保留。 | `intimacyProfiles.ts:174/181/185/186`。事实说明在hardLimits，不以好感解锁；未提前往新档灌尚未发生的历史。 |
| 9 | 核对原著：第54章L7961–7971确认药物依赖与程宗扬责任，具体药物侵害在第19章L3110（第20章L3239延续药后状态）。属原著事实，留一条中性记忆并明确不可演出/重复；旧档canon与NPC记忆中的精确旧句也迁移。 | `lcq.stage_02.json` overlay.to:1055；builtin:1609；`runtime.ts:3705`旧档。overlay.from保留原来源事实，未篡改严格drift检查。 |

上表路径缩写：TypeScript为`src/modules/scenarioMods/`（judgementEngine为`src/utils/`）；源卡为`mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`；overlay为`mod-kit/canon-authority-overlays/`；builtin为`src/modules/scenarioMods/builtins/data/`。行号以后续文档/代码改动可能顺移。

乐明珠“童颜”、小紫“成年女子/成年少女”均保留。受保护birthYear/阵营/登场未覆盖；安乐公主storyAge补值及三人措辞已由裁定#189登记用户解锁。源卡与裁定簿已单向同步NAS阅览镜像。

## 第7项：82–85行触发方式（只审计，不处理）

人物任务表不是另一套触发器：`characterBeatsAt`在当前event匹配时向storyContext提供摘要；`new`项不返回，进度统计也不计。实际完成归属见各关`playerCompletionContract`。

| 原行 | 事件 | 实际触发/玩家入口 | 判断 |
|---|---|---|---|
| 82 | s07_03_xiaozi_appears / s07_04_zhuo_subdued | 07主线事件激活后，玩家执行“协助小紫制服卓云君”/“配合小紫控制卓云君”的objective_action，成功才完成；前者还有NPC机会卡选择。 | 强迫行为主要由小紫施行，但玩家配合合同明确存在；不是单纯自动过场。 |
| 83 | s07_09_hengtang_ambush | 玩家主动执行“在横塘设局迫使卓云君屈服”，按钮/自由输入进入同一objective_action。 | 明确玩家参与的设局合同。另现有name/description写横塘遇袭、axisBeat/目标却写逼迫屈服，数据口径不一致；本批不动。 |
| 84 | s07_zhuo_price | status=new；37关数据没有这个event，人物摘要/进度入口排除new。 | 未实装，无玩家入口，也无自动过场；只能算待设计登记。 |
| 85 | s12_02_recognize_zhuo / s12_03_xiaozi_controls_zhuo | 玩家分别执行“在沐羽城庆典中确认卓云君身份”和“观察小紫如何压制卓云君”的objective_action。后者小紫为施行者，玩家点观察后演出。 | 玩家主动确认/观看NPC压制；不是纯后台自动完成。侍奉口径待用户裁定。 |

出处：`characterQuests.ts:82–85/235/259`、`storyContext.ts`的characterBeatsAt调用、07/12关scenario.events中的合同。未因本批审计改这四行或其事件。

## 额外必要门禁修复

本批完整门禁同时暴露两项第九批遗留代码问题，未靠改测试期望绕过：

- `locationLoot.ts:110/113`误读清单不存在的entry.name（tsc红）。改从实际canon.items按itemId取名称，`AIBidirectionalSystem.ts:856`传入本拍物品表；掉落种子/概率/数量/上限和入账不变。
- `s02_04`与`huamiao_coop_boundary`已改目标却未同步合同label，违反机械目标/按钮一致性原测试。只对齐label，旧actionText/结算/前置不变，overlay.to落源；`runtime.ts:982`精确双哈希迁移保留旧准备和尝试，不放宽其他合同失效保护。新增迁移测试并验证真实五原流水线。

## 验证与当前阻塞

最终代码冻结后执行：

- `npm run type-check`（tsc --noEmit）：PASS，0错误，`/tmp/xiantu-b10-tsc-final.log`。
- 九文件定向：109/109，0败；新合规文件9/9。日志`/tmp/xiantu-b10-focused-final.log`。
- `npm test`：1279项，1269过/5败/5既有skip，`/tmp/xiantu-b10-npm-test-final.log`。
- `npm run canon:build`：registry、卡/归属投影、同门派生、内置同步、裁定、主轴/存档、地点、37关schema均通过；内置单测同为1269过/5败/5skip，exit1，`/tmp/xiantu-b10-canon-final.log`。
- `git diff --check`：PASS。未commit/push/真机。

剩余五败都是旧裁定断言：

1. `npcAgeEstimate.test.mjs:10/16/39`三项仍要求幼帝/幼子4–12岁、少女13–18岁，与本批C01冲突。
2. `batch8DisclosureAndEndings.test.mjs:18/25`两项仍要求小紫“南荒人”，与第九批B1用户“70章起碧鲮族”裁定冲突；同一测试后段还将旧交易done视为母系自动揭示，与B6演出回执要求冲突。

第九批明确“不改测试期望”的限制尚未获同步授权，已通过问题卡请求用户只同步这些旧口径；没有skip、放宽drift、环境特判或修改断言来掩盖失败。当前不能宣称“三项全绿”。授权后同步对应断言，重跑三项门禁即可。

## 本轮文件清单

保留开工前所有修改；以下只列本批新增差异：

- `PROJECT-STATUS.md`、`docs/PLANNING-ROUNDS.md`、本交接。
- 源卡`character-cards-v3.json`、裁定簿`CANON-DECISIONS.md`（卡为ignored源权威；未git add -f）。
- `mod-kit/canon-authority-overlays/lcq.stage_02.json`、`lcq.stage_04b_lingfei_baiyi_crisis.json`、`lcq.stage_05b.json`。
- `src/modules/scenarioMods/relationships.ts`、`characterResolver.ts`、`characterQuests.ts`、`intimacyProfiles.ts`、`schema/canon.ts`、`runtime.ts`、`locationLoot.ts`。
- `src/utils/judgementEngine.ts`、`AIBidirectionalSystem.ts`。
- `builtins/character-registry.json`、`builtins/manifest.json`（脚本产物）。
- `builtins/data/lcq.stage_02.json`、`lcq.stage_04b_lingfei_baiyi_crisis.json`、`lcq.stage_05b.json`。
- `builtins/data/lyg.han_succession.json`、`lyg.shituolin_endgame.json`、`lyg.changgan_interlude.json`、`lyg.buddhist_conspiracy.json`、`lyg.ganlu_aftershock.json`、`lyg.mijing_rumen.json`、`lyg.liangzhou_league.json`。
- `tests/judgementEngine.test.mjs`（只补合意输入）、新增`tests/batch10Compliance.test.mjs`。
- ignored generated阶段同步相应角色措辞/人格，非本批角色/事件不变。

开工备份：`/Users/clawbot/Desktop/xiantu-batch10-backup-20261004/pre-change.tgz`，runtime另存同目录。未动战斗原型、行旅系统、其他成人内容；测试与canon结果为静态证据，不是真实模型合规表现PASS。

## 同批续验：三项全绿

用户再次重申本批全员18+及三项全绿要求后，按第九批B1/B6与第十批C01已批准行为同步两个旧测试文件，不改实现来迎合失效裁定：

- `tests/npcAgeEstimate.test.mjs`：幼帝/幼子/少女预期改为18+并保留寿元上限约束；其他下限16也收紧为18，不以称谓推断未成年。
- `tests/batch8DisclosureAndEndings.test.mjs`：70章起碧鲮族；交易done只允许疑父未证，母系须演出账本回执；实际回执后母系碧姬、105第一步后父系确证。保留敏感身份/师承泄漏检查、未知父系拒绝与已知放行，并补交易done无回执仍拒绝母系断言。
- 没有新增skip、放宽drift、环境特判或删去场景约束。第九批“不改旧期望”的当批历史保留，本批按新裁定同步其过期口径。

最终验证（测试期间未修改代码）：

| 门禁 | 结果 | 日志 |
|---|---|---|
| 三文件定向 | 20/20，0败 | `/tmp/xiantu-b10-policy-focus.log` |
| tsc --noEmit | PASS，0错误 | `/tmp/xiantu-b10-tsc-green.log` |
| npm test | 1279项：1274通过／0失败／5既有冻结skip | `/tmp/xiantu-b10-npm-test-green.log` |
| canon:build | 全步骤PASS，46.5s；内置单测同为1274通过／0失败／5skip，exit0 | `/tmp/xiantu-b10-canon-green.log` |
| git diff --check | PASS | 本轮命令回执 |

manifest为`86d357d09fbb`。新增差异文件是上述两份测试；此前文件清单和所有既有工作区改动保留。没有运行build/真机，没有commit/push。后续由New Bot独立复核及用户决定是否提交；卓云君82–85拍替换仍等待剧情侧裁定。

## 15:03 用户裁定：补回第十批

用户最新裁定覆盖14:12、14:22回滚要求，重新授权本批已撤回内容；依据已登记的清单附录B补回原实现，没有扩充条目。使用14:22回滚前备份恢复，内置数据重建manifest恢复86d357d09fbb。14:58名称类型修复和旧口径同步合并保留；两处合同label及精确旧档哈希迁移一并恢复，机械合同测试恢复原严格label/目标一致性检查。补回第十批测试与本文。仓库清单同步剧情侧附录B；其中历史回滚状态由15:03裁定覆盖。未提交、未推送，门禁结果见本节续记。

### 15:03补回复验结果
- tsc：0错误；日志`/tmp/xiantu-1503-tsc.log`。
- npm test：1279项，1274通过、0失败、5既有skip；日志`/tmp/xiantu-1503-test.log`。
- canon:build：全步骤通过，46.3秒，内置单测同上；日志`/tmp/xiantu-1503-canon.log`。
- diffcheck通过；实现、测试与canon源逐文件核对，和回滚前备份一致（产物生成时间另计）。manifest 86d357d09fbb。无无法补回项，无commit/push，未做真机。
