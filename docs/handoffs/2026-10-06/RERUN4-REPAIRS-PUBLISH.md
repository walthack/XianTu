# RERUN4返修发布 · 补充22系列

用户授权更新项目文档、提交并推送现有origin/feat/fast-no-legacy；不force，不改历史。发布基线e9c541f7，本次hash查git log；此记录随发布提交保存。

## 交付与证据

- 主策划：防守意图、南荒自然输入、练功/冲关确定性写回、NPC时点级数、开局真霓龙丝、F03推进、显示一致性与F05合同数值校准。详见SUPPLEMENT22-RERUN4-FIX.md。
- 剧情：段强初始卡与未来记忆、场景白天/夜景、凝羽寒气五种探问与错误来源、十二项资料核对；五组待核保留。详见SUPPLEMENT22B-STORY-FIX.md。
- 模块策划正式改动：状态目录freeText授权字段、正文/输入状态裁决与目录时长写回、短状态带入新场仍限拍；freeTextStatus.ts与rerun4StatusFreeText.test.mjs纳入提交。未另改状态/合规设计。
- 补充22a：四道具只在合规清单登记“用户定：保持原样”，未改道具数据/掉落。
- 完整工作区：定向47/47；tsc0；npm test 1630项1625过/0败/5跳；build成功；canon:build176.7秒全绿、内含同口径单测与37关检查；diff检查过。日志/tmp/supp22b-final2-*.log与/tmp/supp22b-build.log不提交。

## 部署边界

8097不重建、不重启，也未触碰保护端口/PID。补充22系列尚未进入战斗试玩包，不能将门禁视为新包真机PASS；等部署通知后合包。第3阶段/NPC记忆等未开。

## 排除与源数据

排除整个_newbot_tmp/、docs/COMPLIANCE-REQUIREMENTS.md.bak-20261005-1411、/tmp日志和备份、dist及其他ignored产物。原始ignored character-cards-v3.json不强行入git；其本轮最小差异另附SUPPLEMENT22B-SOURCE-CARD-PATCH.json，其他副本重建须先核对并应用，以免旧源卡覆盖已修registry与overlay。裁定簿为既有tracked文件正常提交，不使用git add -f。

## 正式文件清单（63个）

```text
PROJECT-STATUS.md
docs/COMPLIANCE-REQUIREMENTS.md
docs/PLANNING-ROUNDS.md
docs/handoffs/2026-10-06/RERUN4-REPAIRS-PUBLISH.md
docs/handoffs/2026-10-06/SUPPLEMENT22-RERUN4-FIX.md
docs/handoffs/2026-10-06/SUPPLEMENT22B-SOURCE-CARD-PATCH.json
docs/handoffs/2026-10-06/SUPPLEMENT22B-STORY-FIX.md
mod-kit/canon-authority-overlays/lcq.stage_01.json
mod-kit/canon-authority-overlays/lcq.stage_02.json
mod-kit/canon-authority-overlays/lcq.stage_03.json
mod-kit/canon-authority-overlays/lcq.stage_04.json
mod-kit/canon-authority-overlays/lcq.stage_05.json
mod-kit/canon-authority-overlays/lcq.stage_05b.json
mod-kit/canon-authority-overlays/lcq.stage_07_qingyuan_jiankang.json
mod-kit/canon-authority-overlays/lcq.stage_08_jiankang_coup.json
mod-kit/canon-authority-overlays/lcq.stage_09_trade_and_escape.json
mod-kit/canon-authority-overlays/manifest.json
mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md
mod-kit/quest-lines/resources.json
scripts/build-character-registry.mjs
src/components/dashboard/MainGamePanel.vue
src/components/dashboard/RelationshipNetworkPanel.vue
src/dev/combatTrial/main.ts
src/modules/scenarioMods/builtins/character-registry.json
src/modules/scenarioMods/builtins/data/lcq.stage_01.json
src/modules/scenarioMods/builtins/data/lcq.stage_02.json
src/modules/scenarioMods/builtins/data/lcq.stage_03.json
src/modules/scenarioMods/builtins/data/lcq.stage_04.json
src/modules/scenarioMods/builtins/data/lcq.stage_05.json
src/modules/scenarioMods/builtins/data/lcq.stage_05b.json
src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json
src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json
src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json
src/modules/scenarioMods/builtins/manifest.json
src/modules/scenarioMods/levelProgression.ts
src/modules/scenarioMods/naturalIntentRouter.ts
src/modules/scenarioMods/playtestNarrativeScope.ts
src/modules/scenarioMods/runtime.ts
src/modules/scenarioMods/schema/scenario.ts
src/modules/scenarioMods/strictInitializer.ts
src/modules/sceneModule/brief.ts
src/modules/sceneModule/contracts/f03.json
src/modules/sceneModule/contracts/f04.json
src/modules/sceneModule/contracts/f05.json
src/modules/sceneModule/contracts/statuses.json
src/modules/sceneModule/host/freeTextStatus.ts
src/modules/sceneModule/host/injuries.ts
src/modules/sceneModule/host/narrate.ts
src/modules/sceneModule/host/recognize.ts
src/modules/sceneModule/host/refs.ts
src/modules/sceneModule/plan.ts
src/modules/sceneModule/types.ts
src/services/moduleModelRuntime.ts
src/utils/judgementEngine.ts
src/utils/judgementPreflight.ts
src/utils/narrativeStateReconciler.ts
tests/batch10Compliance.test.mjs
tests/canonAuthorityOverlay.test.mjs
tests/moduleModelRuntime.test.mjs
tests/rerun4StatusFreeText.test.mjs
tests/supplement19RealmCurrency.test.mjs
tests/supplement22Rerun4.test.mjs
tests/supplement22bStoryData.test.mjs
```
