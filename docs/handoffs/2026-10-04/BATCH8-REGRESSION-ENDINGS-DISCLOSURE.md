# 第八批交付：卡投影回归、战斗终局、小紫公开信息（2026-10-04）

状态：代码与数据已交付，静态门禁绿，READY_FOR_TRUE_DEVICE_RETEST；不commit/push。备份：`/Users/clawbot/Desktop/xiantu-batch8-backup-20261004-081947/pre-change.tgz`，含此前全部dirty文件、源卡与投影后的清羽generated。保留此前所有工作及模块策划战斗原型。

## 零：回归根因与修复

1. 类型：`characterResolver.ts`补RegistryPhase.description；`runtime.ts`使用ScenarioModCharacter作为canon.characters类型、记忆过滤回调显式string；`locationLoot.ts`使用JSON边界unknown→LocationLootTable断言（内容结构仍由既有运行时及只读校验验证，未改quantity区间规则）。tsc原10错消除。
2. overlay：第六批改源卡后，canon管线先投影卡与归属，角色数组已不同于旧from。本次在卡投影、归属和同门派生后，重建02/03b/04/04b/05b五条canon.characters整体set的from，保留已有全部其他操作和批准to。04b/05b的to合并小紫表面卡。未放宽source drift、未绕过重建比较、未改任何已有测试期望。
3. 同步安全：`scripts/sync-builtin-mods.mjs:28`把真实同步路径导出为syncBuiltinModData。所有JSON解析、overlay/refinement套用、ID安全与重复检查、人工overlay覆盖检查和内容哈希均先完成，才替换data和manifest；后一个stage漂移也不会写入先完成的stage或清空旧目录。两阶段故障夹具验证目录与manifest逐字节保留，正常预检后才替换。磁盘写入阶段本身不声称事务原子或断电恢复。
4. 37关均已正常重建，manifest version为`ea85fe34c360`。源卡投影同时传导第六批批准的全局性格勘误及本批小紫表面默认值，因此其余关的派生产物有变；未手工扩剧情/修改rail。实际改动目录见末尾。

## A：E06/E07/E08

`fixedEndingNarratives.ts:18`新增BATTLE_ROUT_ENDINGS只读元数据，分别包含endingId/title/kind/sourceEventId/tierFlag/rout/facts；三个固定正文逐字录自`~/Desktop/narrative/16-战斗大败结局正文.md`，映射与三句兜底承接已接入现有fixedEndingNarrative/endingBridge。

| 结局 | id | 关联事件／本地tier | 类型 |
|---|---|---|---|
| E06 天命的指引 | lcq.ending.death.ghost_king_skull | s05b_05b_ideology_duel_and_defeat／lcq.encounter.f10.tier=rout | 死亡 |
| E07 龙首无人 | lcq.ending.death.dragon_well | ghost_king_swallowed／lcq.encounter.f13.tier=rout | 死亡 |
| E08 龙精入体 | lcq.ending.fail.dragon_essence | slay_dragon／lcq.encounter.f14.tier=rout | 存活的失败终局 |

裁定：触发接线等主线战斗正式接入一起做。现有dev/combat及combatProto是独立原型，没有主线本地tier回执可消费，不用普通剧情动作冒充rout，不由模型写flag触发。F14与s06_02只判一次，不采纳旧“龙陨之前”或龙精后续续玩草案。三条结局当前是可消费数据，尚非玩家已可触发战斗分支。

E08使用既有gameOver停局能力即可，不要求主角气血归零；真实运行时夹具验证动作清单为空、章/事件/回合冻结、主角属性不变。现有卡面标签为“本局结束”，不把fail前缀伪称death。

## B：小紫信息门

- 源卡：identitySummary/appearance换表面身份与紫衣黑发；公开人格按定案“天真俏皮、偶露古怪狠劲、对程宗扬好奇”。完整旧身份、外貌说明、真实性格、秘密动机与能力保存在源卡privateProfile（不导出registry、不索引embedding）。年龄、归属、登场、gender/review/aliases源值未变。全局既有关系终点按原关系阶段门保留，避免清除第130章以后已成立的关系。
- **种族真值与玩家字段分离**：registry基础族裔值仍保留原“碧鲮族”（原断言保持），当前南荒公开canon.profile.race和人物面板“种族”在105揭示前均覆写为“南荒人”，揭示后为“碧鲮族（母系）”；没有把全书registry基础值直接当作玩家已知事实。冻结/隔离的旧05/06卡投影不扩大改动。
- 78章：weapon_deal_with_geluo完成/ready回执后才给母系备注；进入05b（87章以后）沿该时序。105章：临时协定第一步本地准备counterstrike_plan_formed（或整拍ready/done）后才给父系备注与母系种族字段。仅激活事件不揭露；母系公开后仍不提前给父系。沿现有多步合同，无新增事件/阶段。
- Resolver及runtime处理旧档公开缓存：移除未揭家世／全书性格，保留已经揭示的记忆和数值字段；公开人物面板与模型角色卡一致。正文守卫同步接受既有准备回执与历史，而不误拒78章后母系对白。
- 无章节上下文的embedding仅索引表面卡，不包含全书归属和阶段链；RAG在02/03b/04及无stage时不召回小紫，04b/05b仅给安全阶段卡（可能未在场，不授权出场）；正常demo从当前演员材料取得信息。声线移除毒宗底牌和紫妈妈称谓泄露，保留原行为约束。
- seqLo/seqHi不是章号：生成器stageSeq取manifest.axisSeqLo/axisSeqHi，stage-projection复制它们；运行时stagePhase按stageId选择，不以这些数值判断章节。03b旧卡把小紫写成已同行是维护卡错误，本批改为尚未登场。03b/04人物数据无小紫，04b初始无她的关系节点；在场门在第70章xiaozi_first_appears激活前排除她。整关预载角色列表不等于玩家已见过。
- 黑魔海毒宗嫡传没有本期已核揭示章，南荒全部不开放；若后续要公开，剧情策划须补最早确证章节/节点。没有将非公开真实人格原封不动回灌到模型或玩家字段。

## 自测与证据边界

- 最终`npx tsc --noEmit`：0错，日志`/tmp/xiantu-batch8-tsc-final.log`。
- 最终`npm run canon:build`：**全绿，exit0，46.3s**；全部步骤通过，内含单测1259项：1254过／0败／5既有冻结skip。日志`/tmp/xiantu-batch8-canon-final2.log`。人工裁定、主轴/存档契约、地点ID、37关schema与源码重建均通过。
- 相关定向16文件分轮全部通过（158个用例）；含原overlay11/11、原batch6三条不改期望、旧05/06冻结投影、R2-12关系/检索/声线兼容、两阶段同步拒绝写盘、78/105门控、旧档缓存、E08真正停局、新三终局映射、行旅与搜刮回归。最终新增文件为batch8DisclosureAndEndings 6/6与syncBuiltinModsSafety 2/2。
- 第一轮管线5个兼容回归已修，未改旧期望；第二轮仅已知Node25 IPC deserialize偶发失败，fastNarrativeDemo单跑20/20，随后完整管线重跑全绿。未为了偶发改门禁或断言。
- `git diff --check`通过；没有另跑npm test/npm run build/serve/watch或真机。用户授权的canon:build本身包含全量单测，不把它当作玩家体验/战斗触发已验收。

## 交接与待确认

1. 模块策划正式接战斗时消费BATTLE_ROUT_ENDINGS，按本地真实rout且每场只结算一次；将E08写入现有gameOver即可终止。不要给它加死亡或后续可玩分支。
2. 剧情策划无需再确认E06–E08全文和已定的78/105口径；请复核临时协定第一步作为父系揭示回执的粒度（它合并多章，不以激活提前开放）。若要在更细的原文对白时点开放，须先提供准确步骤位置。
3. 未核的毒宗嫡传揭示章仍需剧情侧依据；外部10号旧战斗草案须由剧情侧同步作废“龙陨之前”。本批未修改仓库外稿件。
4. New Bot继续统一独立全量／build／真机复测；本批不commit/push。

## 本批改动文件（相对备份）

- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`
- `docs/handoffs/2026-10-04/BATCH8-REGRESSION-ENDINGS-DISCLOSURE.md`
- `mod-kit/canon-authority-overlays/lcq.stage_02.json`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`
- `scripts/build-character-registry.mjs`
- `scripts/sync-builtin-mods.mjs`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_01.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05b.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_10_jiangzhou_shadow_war.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_11_lieshan_battle.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_12_jiangzhou_counterwar.json`
- `src/modules/scenarioMods/builtins/data/lyg.buddhist_conspiracy.json`
- `src/modules/scenarioMods/builtins/data/lyg.changgan_begins.json`
- `src/modules/scenarioMods/builtins/data/lyg.changgan_interlude.json`
- `src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json`
- `src/modules/scenarioMods/builtins/data/lyg.ganlu_aftershock.json`
- `src/modules/scenarioMods/builtins/data/lyg.han_succession.json`
- `src/modules/scenarioMods/builtins/data/lyg.liangzhou_league.json`
- `src/modules/scenarioMods/builtins/data/lyg.mijing_rumen.json`
- `src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json`
- `src/modules/scenarioMods/builtins/data/lyl.han_palace_endgame.json`
- `src/modules/scenarioMods/builtins/data/lyl.jiangzhou_retreat.json`
- `src/modules/scenarioMods/builtins/data/lyl.lin_an_black_sea.json`
- `src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json`
- `src/modules/scenarioMods/builtins/data/lyl.luoyang_cloud_secret.json`
- `src/modules/scenarioMods/builtins/data/lyl.luoyang_coup.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_afterfall.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_core_conflict.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_sacred_fruit.json`
- `src/modules/scenarioMods/builtins/data/lyl.xiaoyingzhou_blacksea_trap.json`
- `src/modules/scenarioMods/builtins/manifest.json`
- `src/modules/scenarioMods/characterResolver.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/locationLoot.ts`
- `src/modules/scenarioMods/narrativeBoundaries.ts`
- `src/modules/scenarioMods/presence.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/voiceCards.ts`
- `src/services/characterRagService.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `tests/batch8DisclosureAndEndings.test.mjs`
- `tests/syncBuiltinModsSafety.test.mjs`
