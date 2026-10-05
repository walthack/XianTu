# 28号称呼账本落实（2026-10-05）

已接续断点完成实现；不提交、不推送。以角色 id 为键，分旁白、主角当面称呼、主角心称、面板名、自报姓名及其他人物称呼，各按章生效。

- 权威：mod-kit/entity-ledger/overrides.json；新增 ledger/naming.ts 投影。殇侯旁白121章切换，面板仍朱老头；自报朱八八保留。碧奴115章前、碧姬115章起；花苗新娘等是描述标签，不是新人物。
- relationships.ts、runtime.ts、strictInitializer.ts：旧档和换关刷新名字，保持角色 id、好感与记忆；不再以旧显示名覆盖新名。
- legacyNarratorPacket.ts、eventNarrativeView.ts、storyContext.ts、AIBidirectionalSystem.ts 与 RightSidebar.vue 接账本投影；白夷地宫无名使者与阁罗分开。
- characterResolver.ts：南荒逐关缺字段不读全书终点；源人物卡补全956个逐关字段，保留已有作者内容，无依据字段显式为空；挡住殇侯身世链与义姁。scripts/build-character-registry.mjs 投影 naming 字段；同步 registry、generated 与严格 overlay 快照。
- 祁远老四、武二/二爷、云执事/云老哥、老吴等按28号登记。保留血虎状态与早期易虎失踪的历史叙述；不把殇侯门等势力名改为人物显示名。
- 用户裁定已登记 CANON-DECISIONS.md #199。合规及成人相关静态字段未改。第八、九批及其他工作区改动保留。

断点定向验收61/61通过；此前全量1443项：1438通过、0失败、5跳过。当前最终门禁和E07一起复核后补记。未做真机；请复测乐明珠揭名、朱老头身份揭示及碧奴115章门前后各出口。

## 相对开工备份的变更文件（含生成源）

- `src/components/dashboard/RightSidebar.vue`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/characterResolver.ts`
- `src/modules/scenarioMods/eventNarrativeView.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/ledger/affinityIdentity.ts`
- `src/modules/scenarioMods/legacyNarratorPacket.ts`
- `src/modules/scenarioMods/relationships.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/storyContext.ts`
- `src/modules/scenarioMods/strictInitializer.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `tests/batch11RetestRepairs.test.mjs`
- `tests/batch8DisclosureAndEndings.test.mjs`
- `tests/batch9CanonAndGuidance.test.mjs`
- `tests/bijiNaming.test.mjs`
- `tests/nanhuangExpansion.test.mjs`
- `tests/r2_11r_lcq_stage_06_source_rebuild.test.mjs`
- `tests/r2_11t_lcq_stage_05_source_rebuild.test.mjs`
- `scripts/build-character-registry.mjs`
- `mod-kit/entity-ledger/overrides.json`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_05b.json`
- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`

新增：`src/modules/scenarioMods/ledger/naming.ts`、`tests/chapterNaming.test.mjs`、本交接。最终工作区还包含其他执行批次与模块策划文件，本清单不授权撤销它们。

## 最终验收

- tsc --noEmit：0错误。
- npm test 最后完整复跑：1455项，1450通过、0失败、5跳过。
- canon:build：全绿（54.9秒，内含1450通过、0失败、5跳过）；人名字面量预算未放宽。
- git diff --check：通过。未做真机、不提交、不推送。
- 过程记录：战斗试玩启动曾偶发失败，单跑12/12通过；另一次全量与模块策划canon重建并发，短暂ENOENT，文件自行恢复后完整复跑全绿。没有改动模块策划文件或放宽测试。
