# 状态清单体检与整改（2026-10-19，Asia/Singapore）

基线 tip `cca8d41c`，整改提交 `691d18c5`（体检表按这个版本的 `src/modules/sceneModule/contracts/statuses.json` 共 45 条）；整改后 25 条，再加上冰蛊，共 26 条。用户的整改方案是 2026-10-19 拍板的（含 22:27 那次追加）。
说明：任务原定写到 `/workspace/status-audit-2026-10-19.md`，但这台 Mac 上没有 `/workspace`，所以改放到仓库里的 `docs/status-audit-2026-10-19.md`。

## 一、体检表（cca8d41c 版本，45 条）

各列说明：
- **实效**：「仅 note」表示只有叙事文字，没有机制效果。
- **解除**：✓ 表示真能触发；✗ 表示规则写了，但没有任何代码、剧情或物品能触发它。判定方法：rest 一律可触发；time 要求 afterScene 有有限分钟数；item 要求物品表里有带该标签的物品；story 要求在状态文件以外能找到写这个旗标的地方。
- **挂上处**：合同里引用这条状态的位置，分普通打中、woundRule 和剧情/结局/失手三类。
- **原著依据**：只采用仓库内的文字。
- **引入提交**：用 `git log -S` 查到的。

| id 名称 | buff/debuff | 通用/本书 | 来源 | 实效 | 解除（可触发？） | provisional | 挂上处 | 原著依据 | 引入提交 | 处置 |
|---|---|---|---|---|---|---|---|---|---|---|
| wound.external.shoulder 肩伤 | debuff | book | combat | 机制：rollModifier(action -1),rollModifier(defense -1) | time✓ rest✓ | 是 | f03.escape_followup 剧情/结局/失手；f03.mountain_stream_fog 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 合并→wound.external(bodyPart 肩) |
| wound.external.back 背伤 | debuff | book | combat | 机制：rollModifier(action -1),rollModifier(defense -1) | time✓ rest✓ | 是 | f03.mountain_stream_fog 剧情/结局/失手；f10.ghost_king_clash/axe_from_behind 普通打中；f10.ghost_king_clash 剧情/结局/失手；f14.dragon_god 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 合并→wound.external(背) |
| wound.external.thigh 腿伤 | debuff | book | combat | 机制：rollModifier(action -1),rollModifier(defense -1) | time✓ rest✓ | 是 | f10.ghost_king_clash/dan_chen_bite 普通打中；f10.ghost_king_clash 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 合并→wound.external(大腿) |
| wound.external.right_arm 右臂伤 | debuff | book | combat | 机制：rollModifier(action -1),rollModifier(defense -1) | time✓ rest✓ | 是 | f10.ghost_king_clash/ghost_feather_sword 普通打中；f10.ghost_king_clash 剧情/结局/失手；f08.dagu_ruins 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 合并→wound.external(右臂) |
| gear.blade_damaged 刀损 | debuff | book | combat | 仅 note | item:repair✗ | 是 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 删除（无兵器损坏） |
| gear.blades_dulled 双刀卷刃 | debuff | book | combat | 机制：lockLever | item:repair✗ | 是 | f10.ghost_king_clash/bone_claw 普通打中；f10.ghost_king_clash 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 删除（无兵器损坏） |
| wound.external.waist 腰伤 | debuff | book | combat | 仅 note | story:wound.external.waist.resolved✗ | 是 | — | F05 第63章 | e9c541f7 2026-10-06 | 合并→wound.external(腰) |
| wound.external.chest 胸伤 | debuff | book | combat | 仅 note | story:wound.external.chest.resolved✗ | 是 | — | F04 第57章 | e9c541f7 2026-10-06 | 合并→wound.external(胸) |
| wound.burn 灼伤 | debuff | book | combat | 仅 note | story:wound.burn.resolved✗ | 是 | f07.biling_village/burn 普通打中；f07.biling_village 剧情/结局/失手 | F07 第80章；F11 第99章 | e9c541f7 2026-10-06 | 改通用：实效 action-1/defense-1、rest/heal/时限 7 天、去 provisional、进 afterWin |
| wound.drowning 呛水伤 | debuff | book | combat | 仅 note | story:wound.drowning.resolved✗ | 是 | f06.merfolk/fork 重击(onCrush)；f06.merfolk 剧情/结局/失手 | F06 第74章 | e9c541f7 2026-10-06 | 删除（编造）→通用挂伤 |
| wound.cold 阴寒余伤 | debuff | book | combat | 仅 note | story:wound.cold.resolved✗ | 是 | f09.yinsha/cold 普通打中；f09.yinsha 剧情/结局/失手 | F09 第84章；F14 第113–115章 | e9c541f7 2026-10-06 | 删除（编造）→通用挂伤；≠寒毒 poison.cold |
| wound.exhaustion 真气透支 | debuff | general | combat | 机制：rollModifier(action -1) | rest✓ time✓ | 否 | — | 连续强行运功、催动秘术或久战，真气耗尽。原著出处：F09 第84章；F12 第102章；F14 第113–115章。 | e9c541f7 2026-10-06 | 保留 |
| wound.blood_loss 失血 | debuff | general | combat | 机制：rollModifier(action -1),rollModifier(defense -1) | rest✓ item:heal✗ time✓ | 否 | — | 大量出血，或流血未止又再受伤。原著出处：F11 第98–100章。 | e9c541f7 2026-10-06 | 保留 |
| wound.soul_aftershock 噬魂余波 | debuff | book | combat | 仅 note | story:wound.soul_aftershock.resolved✗ | 是 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 补实效＋rest/时限、去 provisional；只由噬魂类特攻挂 |
| wound.fright 惊惧 | debuff | general | story | 机制：rollModifier(action -1) | rest✓ time✓ | 否 | f09.yinsha 剧情/结局/失手 | 目睹或亲历惨烈、诡异的险境，心有余悸。原著出处：F06 第74章；F09 第84章。 | e9c541f7 2026-10-06 | 保留 |
| yin.sha_arm 阴煞噬臂（轻） | debuff | book | combat | 仅 note | story:yin.sha_arm.resolved✗ | 否 | f13.ghost_king_final 剧情/结局/失手 | 第109章102–104、114段；第111章82段；第113章55段（W-48，人物状态 B类4.3） | e9c541f7 2026-10-06 | 保留（原著剧情）；白名单 |
| wound.severe 重伤 | debuff | general | combat | 机制：rollModifier(action -3),rollModifier(defense -3),appearance | rest✓ item:heal✗ | 否 | f08.dagu_ruins 剧情/结局/失手；f14.dragon_god 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| weak.body 虚弱 | debuff | general | story | 机制：rollModifier(action -1) | rest✓ time✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| wound.soul 神魂受创 | debuff | general | combat | 机制：rollModifier(action -2),psyche(-2) | rest✓ item:heal✗ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留；并入 fatigue.mental（别名） |
| unconscious 昏迷 | debuff | general | combat | 机制：downed | time✓ item:antidote✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| poisoned 中毒 | debuff | general | item | 机制：rollModifier(action -1),rollModifier(defense -1),psyche(-1),appearance | item:antidote✓ | 否 | — | 毒针、毒药、毒虫或毒瘴；环境类毒也用它，在来源里写明。原本书「毒伤」（F01 第30章；F02 第37章）并入此条。 | e9c541f7 2026-10-06 | 保留 |
| dying 濒死 | debuff | general | combat | 机制：downed | item:heal✗ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留（合规条目不碰）；白名单（缺带 heal 标签的药） |
| poison.cold 寒毒 | debuff | book | story | 机制：rollModifier(action -2),rollModifier(defense -1) | story:poison.cold.resolved✗ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留（寒毒）；白名单 |
| poison.cold.suppressed 寒毒受压制 | debuff | book | story | 仅 note | story:poison.cold.suppressed.resolved✗ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留；白名单 |
| wound.external 外伤 | debuff | general | combat | 机制：rollModifier(action -1),rollModifier(defense -1) | time✓ rest✓ item:heal✗ | 否 | f03.escape_followup 剧情/结局/失手；f03.mountain_stream_fog 剧情/结局/失手；f10.ghost_king_clash/bone_claw 普通打中；f10.ghost_king_clash 剧情/结局/失手；f14.dragon_god/claw 普通打中；f06.merfolk 剧情/结局/失手；f07.biling_village 剧情/结局/失手；f08.dagu_ruins 剧情/结局/失手 | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| wound.external.heavy 外伤（重） | debuff | general | combat | 机制：rollModifier(action -3),rollModifier(defense -3) | rest✓ item:heal✗ | 否 | f10.ghost_king_clash 剧情/结局/失手；f13.ghost_king_final 剧情/结局/失手 | 仓库内无原文依据 | d2fa5334 2026-10-19 | 保留 |
| bleeding 流血 | debuff | general | combat | 机制：rollModifier(action -1) | item:hemostatic✗ rest✓ time✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| fracture 骨折 | debuff | general | combat | 机制：rollModifier(action -2),rollModifier(defense -2) | item:splint✗ rest✓ time✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| dizzy 晕眩 | debuff | general | combat | 机制：disadvantage,rollModifier(defense -1) | time✓ rest✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| drunk 醉酒 | debuff | general | item | 机制：rollModifier(action -1),rollModifier(defense -1) | time✓ rest✓ item:sober✗ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| acupoint.sealed 被点穴 | debuff | general | combat | 机制：disadvantage,disadvantage,rollModifier(action -2) | time✓ item:unseal✗ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| paralyzed 麻痹 | debuff | general | item | 机制：rollModifier(action -2),rollModifier(defense -1) | item:antidote✓ time✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| qi.disordered 内力紊乱 | debuff | general | combat | 机制：rollModifier(action -2) | rest✓ time✓ | 否 | — | 仓库内无原文依据 | e9c541f7 2026-10-06 | 保留 |
| mind.confused 神志不清 | debuff | general | story | 机制：consciousness:confused,psyche(-2),rollModifier(action -2) | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 保留；provisional 待拍板 |
| sense.sight 目力受损 | debuff | general | combat | 机制：sense(-2):sight,rollModifier(action -1) | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 合并→sense.impaired(senses) |
| sense.hearing 耳力受损 | debuff | general | combat | 机制：sense(-2):hearing | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 合并→sense.impaired |
| sense.smell 嗅觉受损 | debuff | general | environment | 机制：sense(-2):smell | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 合并→sense.impaired |
| sense.taste 味觉受损 | debuff | general | item | 机制：sense(-2):taste | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 合并→sense.impaired |
| sense.touch 触觉迟钝 | debuff | general | item | 机制：sense(-2):touch,rollModifier(action -1) | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 合并→sense.impaired |
| fatigue.weary 疲惫 | debuff | general | story | 机制：rollModifier(action -1),psyche(-1),restrict | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 删除 |
| fatigue.mental 心神耗竭 | debuff | general | story | 机制：psyche(-2),rollModifier(action -1) | rest✓ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 合并→wound.soul |
| restrict.arm 单臂乏力 | debuff | general | combat | 机制：restrict,rollModifier(action -2),appearance | rest✓ item:heal✗ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 删除 |
| restrict.leg 腿脚难行 | debuff | general | combat | 机制：restrict,rollModifier(defense -1),appearance | rest✓ item:heal✗ time✓ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 删除 |
| disability.one_eye 一目失明 | debuff | book | combat | 机制：sense(-2):sight,appearance | story:disability.one_eye.resolved✗ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 删除（无永久伤残） |
| disability.lame_leg 跛足 | debuff | book | combat | 机制：restrict,appearance | story:disability.lame_leg.resolved✗ | 是 | — | 仓库内无原文依据 | 4269b98e 2026-10-16 | 删除（无永久伤残） |

## 二、问题条目与处置（已按用户方案实施）

| 问题 | 条目 | 处置 |
|---|---|---|
| 按部位拆出来的重复状态（按原因定义，而不是按部位） | 肩伤、背伤、腿伤、右臂伤、腰伤、胸伤 | 合并进 `wound.external`，部位写在 `params.bodyPart`（由合同给）。伤在新部位时并进同一条，不算旧伤加重；同一部位再伤才沿升级链加重（`statuses.ts applyStatus`） |
| 编造的状态，解除也触发不了 | 呛水伤 `wound.drowning`、阴寒余伤 `wound.cold` | 删除。F06、F09 改走通用挂伤（普通打中只扣气血，重击挂外伤）。寒毒 `poison.cold` 是另一回事，保留 |
| 兵器损坏（用户定：不需要） | 刀损、双刀卷刃 | 删除，`repair` 标签一并删除 |
| 只有叙事、没有实效，或解除触发不了 | 灼伤 `wound.burn` | 改成通用状态：行动 -1、防御 -1，可由休整、疗伤药或 7 天时限解除，去掉 provisional，并加入战后清轻伤（afterWin） |
| 解除触发不了 | 噬魂余波 `wound.soul_aftershock` | 补实效（神志恍惚、精神 -1、行动 -1），可由休整或 1 天时限解除，去掉 provisional。只由噬魂类特殊攻击挂上 |
| 五感拆成五条 | 视、听、嗅、味、触 | 合并为「六识受损」`sense.impaired`，用 `params.senses` 指明哪几识受损。配置里的 senses 增加了 `mind`（意识） |
| 重复 | 心神疲惫 `fatigue.mental` | 并入神魂受创 `wound.soul`，作为别名 |
| 编造的状态，或永久伤残（用户定：游戏里没有永久伤残） | 单臂乏力、腿脚难行、疲惫、一目失明、跛脚 | 删除 |
| 还挂着 provisional，等用户确认 | 神志不清 `mind.confused` | 保留，provisional 暂不去，等拍板 |
| 只有叙事，或解除旗标没人写（剧情状态） | 阴煞入臂 `yin.sha_arm`、寒毒 `poison.cold`、寒毒被压制 `poison.cold.suppressed` | 保留（原著剧情），列入测试白名单并写明原因 |
| 解除物品缺失 | 濒死 `dying`（合规条目） | 按要求不动这一条，列入白名单。物品表里没有带 heal 标签的药，要不要补待定 |

数值都在配置或状态目录里，代码没有写死数字。旧档迁移表在 `src/modules/sceneModule/contracts/statuses.migrations.json`：伤势存储（injuryStore）和进行中场面的 state.statuses 读取时都会迁移，迁移是幂等的。

## 三、附带检查

### 1. 调息疗伤的判定是否吃「重伤」减值（修复前：吃）
- 修复前，`src/utils/judgementPreflight.ts:59-67`（cca8d41c）的 `stateFactors` 只要气血低于 25% 就加 -15（`mod-kit/numbers-combat.json:200-202` judgement.injury）。调用处有三个：
  - `judgementPreflight.ts:164` 自由文本
  - `:270` 事件动作
  - `src/modules/scenarioMods/freeAction/judgement.ts:49` 自由行动
- 恢复类判定也照吃，所以 HP 1 时掷出自然 20 也只得到「部分成功」。
- 现在 `stateFactors(kind, save, { recovery })` 对恢复判定跳过「重伤」这一项：
  - `judgementPreflight.ts:169`：cultivate 且命中疗伤关键词时
  - `:275`：事件 applyCultivationRecovery 时
  - `freeAction/judgement.ts:50`：变体 applyRecovery 时
- 普通判定照旧吃减值。

### 2. 旧档线 F06→F13 伤一直不清的原因
1. 战后清轻伤（afterWin，`numbers-combat.json` woundRules.afterWin）只列了 `wound.external`。这几场挂的都是书内专用伤：呛水伤、灼伤、阴寒余伤、部位伤、双刀卷刃。它们唯一的解除方式是剧情旗标 `scene.status.*.resolved`，而这个旗标没有任何代码会写（只有测试写过）。
2. HP 停在 1（keepHp=1）时，调息还要吃 -15，几乎调不成功。
3. 修复：删除或合并这些状态，afterWin 加上灼伤，恢复判定免减值，并做旧档迁移。真实存档验证见第五节。
4. 「求生类赢局触发战后休整」：按时撑过去的场在代码里本来就收成赢（outcome.kind='win'，`host/writeback.ts:31` 只在赢局清轻伤），所以已经满足，不需要改，测试已覆盖。

### 3. F08–F12 成功率 0% 却不会输的原因（只报告，不改胜负设计）
- 败局条件只有两类：
  - 我方全员倒下（partyDowned），用于 F06、F07、F08、F14；
  - 个别场的剧情轨或选择，用于 F09 的阳气耗尽，以及 F10、F13。
- 通用挂伤下，普通打中只扣气血，而且 keepHp=1，气血扣不到倒下。要倒下只能走「外伤 → 外伤（重）→ 倒下」这条链，靠相邻两拍连续重击。
- 剧情轨照样往赢的方向推；没有「超时判输」；拍数上限 beatLimit 只记日志 LCQ-SAV-020，不改判。
- 测试 bot 的场次编号按游玩顺序：F10＝拦路守卫，F11＝阁罗盘问，F12＝combat.f10，F13＝combat.f13。

## 四、噬魂来源依据、冰蛊、麻古与 buff 清单

- **噬魂余波的来源**：小紫（`liuchao.character.xiao_zi`）用主角的血施展噬魂巫术。原著依据是第 102 章段 92–100、第 103 章段 3–5（见 `mod-kit/source-documents/31-南荒全部固定战斗合同草案.md` 第 459、472 行）。仓库里没有查到「噬魂灵」这类敌人实体。
- **冰蛊**：本轮已实装。改动的文件：
  - `src/modules/sceneModule/contracts/statuses.json`：新增 `poison.ice_gu`，效果 qiCap，挂上规则 storyApply
  - `src/modules/sceneModule/types.ts`：效果 qiCap、字段 storyApply
  - `mod-kit/numbers-progress.json`：`status.bingGu`，包括 qiCapRatio=0.7、qiActions、寒气反噬的 dc 和 hpLossRatio、失败挂的状态 qi.disordered
  - `src/modules/sceneModule/numbersRegistry.ts`
  - 新增 `src/modules/scenarioMods/freeAction/bingGu.ts`
  - `freeAction/gates.ts`：可用真气按压低后的上限算
  - `freeAction/settle.ts`：运功、传功、双修、夺元结算后，当前真气超过上限就做一次寒气反噬检定，用这次判定的骰面
  - `src/utils/narrativeStateReconciler.ts`：每回合补挂剧情来源的状态
  - `src/modules/contentPacks/packs/qingyu/texts.json`：寒气反噬的两条事实文案
  - `tests/statusCatalogAudit.test.mjs`
  - 挂上条件：`event.ice_gu_coercion.done` 为真，或当前剧本段是 `lcq.stage_05` / `lcq.stage_05b`（换段时旗标会重置）。
  - 解除只走剧情：`event.shanghou_cures_ice_gu.done`，或 `event.s05b_shanghou_reads_letter.ice_gu_cured`。
  - 每段首次推进时的身体阴寒提示保留在原处（canonRail / scene-pilot-overlays），没有改。
  - 冻结文件没动。
- **麻古（本轮未实装）**：现有定义在 `src/modules/contentPacks/packs/qingyu/statuses.json:32` 的 `addiction.maigu`，物品是 `lcq.item.np006`。这次要求的三段机制是：「情欲亢奋」降低心性判定、对主角好感上升、双修更容易成立，药效过后成瘾，断药后神志不清，再由主角喂药重新开始。这等于把「用药物控制他人、换取性方面的顺从」做成玩法回路，与仓库合规要求 C02/C03/B6 以及红线 #177 冲突，所以没有实装，交回用户决定。
- **buff 清单**：没有专门的 buff 清单。目前只有 qingyu 包里的 `guarded`（`kind:"buff"`，只有叙事，可由休整解除），以及双修的「阴阳调和」（judgementEngine selfBuffEffect / dualBuffConfig）。

## 五、验证

- **胜率模拟**（参考打法，每场 300 局）：

  | 场次 | 改前（胜/300） | 改后（胜/300） | 改后赢局残留状态 |
  |---|---|---|---|
  | F10 | 248 | 242 | 外伤（重）49 局 |
  | F06 | 300 | 300 | 无（改前残留呛水伤 19 局） |
  | F07 | 300 | 300 | 无（改前小金残留灼伤 24 局） |
  | F08 | 300 | 300 | 无 |
  | F09 | 299 | 299 | 无（改前残留阴寒余伤 23 局） |
  | F13 | 193 | 193 | 无 |
  | 葛罗 | 284 | 284 | 失衡 7 局 |

  - F10 胜率变化来自部位伤并进同一条外伤链。
  - 外伤（重）设计上就会留到战后。

- **真实存档代码链路**（`playtest-2026-09-28/checkpoints-ca414354432d/` 旧档线，10 个存档）：
  - 迁移后，呛水伤、阴寒余伤、双刀卷刃全部移除，只剩外伤（重）；进行中场面的 statuses 同步迁移。
  - HP 1 时，普通 cultivate 判定吃「重伤」，恢复判定不吃。
  - 调息成功后外伤（重）解除。
  - F11 / F12 / F13 前三个存档（05b 段）自动补挂冰蛊，真气上限压到 35/50。
- **测试**：
  - 全量结果见提交说明，只剩原有的 `chapterIdentitySwitch` 红。
  - 冻结门禁 `perfTelemetry` 绿。
  - `tsc --noEmit` 通过。
  - runtime.ts 和 AIBidirectionalSystem.ts 没有改动。

## 六、待拍板

1. 神志不清 `mind.confused` 要不要去掉 provisional。
2. 白名单里的阴煞入臂、寒毒、寒毒被压制，要接哪个剧情事件来写解除旗标；濒死要不要补带 heal 标签的药。
3. F06 和 F09 的败局文案还提到呛水、阴寒（只是叙事，不挂状态），要不要改。
4. F08–F12 成功率 0% 不会输的问题要不要改胜负设计，比如超时判输或拍数上限判输。
5. 麻古三段机制已拒绝，需要用户决定（合规冲突）。
6. 冰蛊寒气反噬的 dc=11、hpLossRatio=0.1、qiCapRatio=0.7 都是初值，可以热调。
