# 事实账本 + 秘密与好感 · P0交接

状态：**P0代码交付，三门静态PASS；设计验收尚未闭合。P1未开始。** 不commit/push；第十一、十二批、黑魔海与独立战斗原型已有改动全部保留。只撤用户指定的第十二批宽性别守卫，并把旧步骤内姓名紧邻代词拒稿降为shadow候选。

## 依据与边界

全文依据桌面19、19a、19b、20号稿及用户20:30指示；裁定#194。备份：`/tmp/xiantu-ledger-p0-before-20261004-203701.tgz`。裁定簿单文件单向rsync至NAS已cmp一致。没有改年龄、成人设定、合意接口、双修收益或judgementEngine/intimacyProfiles/characterQuests。

- Q1采用每关增量预算，不钳绝对好感；Q2全来源每回合20（含重要拍）；Q3未标记minor、旧档不补发不扣；这些在P2才实现，P0没有修改现行数值。
- Q4女性/名单/40/+2或3只登记默认；用户20:32已取消日限和关限、20:33额外状态限制仅待审，受Q8冻结，未接线。
- Q5剧情侧定私下窗口；Q6世界秘密可以只有public+rumor；Q7先只有行为提示；后续阶段实施。
- Q8及20号稿6.4整段等待用户决定；不换接口、不新造替代同意口径。
- beatKind及秘密/好感Gate属于后续schema与数据阶段，P0未提前标记作者事件或重写剧情。

## 改动

1. `narrativeBoundaries.ts` 撤批12 `validateKnownGenderNarrative`；`modularTurn.ts` 的旧步骤内紧邻性别判断不再拒稿；AIB调用`genderShadowFindings`，与其它既有事实守卫分离。`legacyNarratorPacket.ts` 的在场者加pronoun（他/她/称姓名）。新候选仅soft/shadow，不抛错，不新增确定性性别规则上线。既有岳帅等命名正典规则暂保留，按迁移计划后续收口。
2. `ledger/affinityIdentity.ts` 提供旧档唯一回填、按ID只读`relationshipOf/affinityOf`；新关系写`角色ID`，共历好感按ID寻址，跨关回填在快照之前。当前模组canon唯一精确匹配优先；否则用registry别名与已裁定阶段名。歧义/未知只日志，不改数值、不合并同名人物。同ID重复条目也不选择其中一个。`overrides.json`仅补既有花苗新娘阶段名供内部ID查找，不是新的身份公开门。
3. `ledger/guardFramework.ts` 规则mode=enforce/shadow/off、总开关（localStorage `xiantu.entityLedger.guard.v1=off`）、单行JSON日志与`ModuleReceipt.guard`。soft规则即使mode=enforce也不能直接拒稿。P0仅接性别候选；真正封闭式语义核验器按P5实现，目前未调用。
4. 记忆入口：候选保留原sentenceIds；候选/返回摘录/延迟落账再检查，快照防后台任务因新事件解锁而越过生成当时的门。近期记忆注入也检查。P0暂复用原有南荒正典门，不创建第二份秘密规则表；P1/P3改为统一账本来源。shadow命中的引文也不进入摘录。未经授权的旧污染正文仍保留为原历史证据，送回模型的摘录会过滤。
5. `tests/fixtures/entity-ledger/r11-replay.json` 收录110篇真实模型原文及最小场景元数据，不收API配置或完整prompt。14篇仅有19a的性别误拒审核、#156已知性别错误，其余未审核；不得把14篇或110篇宣称完整事实干净集。`replay-entity-ledger.mjs` 可重放并输出不满足正式验收的标记。
6. 人名字面量棘轮接入canon:build；按文件扫描src的ts/vue，排除builtins与作者JSON，当前3277处，预算只供后续删除迁移。不是已消除硬编码；禁止新增人名补丁。P0存下baseline，后续只有迁移证据与裁定才能调低，不允许调高。

## 证据

| 检查 | 结果 | 日志 |
|---|---|---|
| 定向4文件 | 39/39通过 | `/tmp/ledger-p0-focused.log` |
| tsc --noEmit | 0错，exit0 | `/tmp/ledger-p0-tsc.log` |
| npm test | 1309项：1304过/0败/5既有skip | `/tmp/ledger-p0-npm-test.log` |
| canon:build | 全步骤通过，48.5s；内置单测同计数 | `/tmp/ledger-p0-canon.log` |
| diff --check | 通过 | 完成后检查 |
| r11回放 | 110篇、14篇性别专项已审核；新候选0命中/0拒稿 | 仅说明新规则不拒稿，不证明召回率 |
| #156原文记忆隔离 | 原文含遗腹女，关闭门后过滤结果不含遗腹女，保留720字 | 原始夹具r11-156，另直接调用filterLedgerMemory验证 |

旧sharedExperienceAffinity六项曾红：模组自定义ID与registry同名ID被误当歧义；修为当前模组canon优先，原断言未改，最终全绿。修改批12与nanhuangSceneLedger性别测试是落实用户撤拒稿的行为变化，不是放宽其它门禁。实际验收涵盖乐明珠揭名后、朱八八→殇侯、跨关继承、唯一回填幂等、自定义模组ID、歧义不猜、重复ID不合并、三种mode、原句ID不偏移、父系旧污染与合法揭示不误删。

## 未闭合验收／下一阶段依赖

- 正式hard误拒门：≥300篇人工确认干净语料、独立holdout和每规则机会数，尚未提供；未启用新hard性别规则。0/110的新规则拒稿是shadow设计结果，不能当作误拒率或召回验收。
- soft触发≤15%、真机重写≤3%、兜底≤0.5%尚未实测。本轮未做真机，没有宣称语义核验已接。
- P1作者输入待提供：16个缺gender人物、关系/秘密表（含章节+好感门与揭示脚本）、别名用法、beatKind/作者兜底、好感权重与起点、dev/holdout变异种子。不能自造未知性别、秘密窗口或私下剧情。
- 当前4关canon按ID并集实读40（19b旧统计41），其中16个在当前canon和registry均无gender：小魏、石刚、卡瓦、阿葭、叶媪、白夷族长、樨夫人、易勇、蛇傀、黑舌、小津、易雄、达古、六朝石匠、娄蒙、黑衣丽人。未按名字猜填。
- 已向用户请求上述材料路径；P0完整验收与P1实体补全不能凭估算签核。下一步按材料完成P0误拒基准，再推进P1，不把框架空表说成作者数据已完成。

## 本轮相对开工备份的文件

- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `scripts/canon-build.mjs`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/legacyNarratorPacket.ts`
- `src/modules/scenarioMods/modularTurn.ts`
- `src/modules/scenarioMods/narrativeBoundaries.ts`
- `src/modules/scenarioMods/relationships.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/strictInitializer.ts`
- `src/services/modularTurnBackground.ts`
- `src/types/game.d.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `tests/nanhuangSceneLedger.test.mjs`
- `mod-kit/entity-ledger/overrides.json`
- `mod-kit/entity-ledger/ratchet-baseline.json`
- `scripts/replay-entity-ledger.mjs`
- `scripts/validate-ledger-ratchet.mjs`
- `src/modules/scenarioMods/ledger/affinityIdentity.ts`
- `src/modules/scenarioMods/ledger/guardFramework.ts`
- `tests/batch12RetestRepairs.test.mjs`
- `tests/fixtures/entity-ledger/r11-replay.json`
- `tests/ledgerP0.test.mjs`

registry变化仅为canon:build刷新generatedAt，未改卡数据。未动源卡、overlays和已有阶段数据；builtins已有dirty差异来自此前批次，保留。

## 20:31补充 · 所有人物记录ID化（2026-10-05补录）

用户补充覆盖此前只回填角色ID、保留姓名键的方案；裁定#195。开工备份：`/tmp/xiantu-p0-id-before-20261004-210015.tgz`。

- 关系/好感/个人记忆以角色ID为唯一可枚举、可序列化键；姓名只作显示。旧档唯一匹配迁移，不猜同名；未知/歧义保留独立本地ID、原键与身份待核标记，数值与记忆不合并。唯一旧称的非枚举getter仅作过渡读取边界，不进入JSON或structuredClone。
- `affinityIdentity.ts:18`统一解析含点号的ID路径；人物命令使用JSON引号方括号。预处理只把唯一旧姓名解析到ID；已登记ID不可被命令换成另一个ID。模型提示词删除“方括号只能数组索引”冲突规则。
- 关系边、姿态、演员伤病/离场账、随机NPC和事件关联人物、面板选中/记忆编辑/后台总结/删除、人物操作队列全按ID；姓名是显示快照。普通状态回执附角色ID与当时显示名，不把ID显示成人名。旧队列身份不唯一的原记录保留待核，不误消费。
- 同名人物分别保存、分别寻址；朱八八→殇侯有真实揭示事件单次增益、JSON重载后个人记忆编辑与跨阶段迁移测试；乐明珠揭名共历结算有实际关卡测试。数值与原事件结果未改，仅同步确实失效的姓名键/关系边旧schema断言。
- 补充定向12文件177/177；tsc0错；全量1314项1309过/0败/5既有skip；canon:build全步骤绿49.1秒，内置单测同计数；build绿（Vue页面编译），diffcheck绿。日志`/tmp/p0-id-final-{focus,tsc,npm,canon,build}.log`。无真机，不宣称玩家体验或P0正式误拒验收通过。
- Q4最新用户更新取消日/关次数限制，受Q8冻结未上线；“对象未处于被控制或昏迷”仅待审、不实现。其余现行条件/数值未变。
- P1所需21/22作者表已收到，正在核对2026-10-05 00:41原著章节门及身份冲突裁定；本交接不再声称16个gender作者输入未交。

### 本补充文件（相对20:31开工备份）

- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `src/components/dashboard/RelationshipNetworkPanel.vue`
- `src/modules/scenarioMods/affinityCaps.ts`
- `src/modules/scenarioMods/affinityLadder.ts`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/canonGuard.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/ledger/affinityIdentity.ts`
- `src/modules/scenarioMods/legacyNarratorPacket.ts`
- `src/modules/scenarioMods/presence.ts`
- `src/modules/scenarioMods/relationships.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/storyContext.ts`
- `src/modules/scenarioMods/strictInitializer.ts`
- `src/services/initialization/characterInitialization.ts`
- `src/services/prompts/defaultPrompts.ts`
- `src/stores/actionQueueStore.ts`
- `src/stores/characterStore.ts`
- `src/stores/gameStateStore.ts`
- `src/types/game.d.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `src/utils/commandValidator.ts`
- `src/utils/commandValueValidator.ts`
- `src/utils/generators/eventGenerators.ts`
- `src/utils/narrativeStateReconciler.ts`
- `src/utils/prompts/cot/cotCore.ts`
- `src/utils/prompts/definitions/businessRules.ts`
- `src/utils/prompts/definitions/coreRules.ts`
- `src/utils/prompts/definitions/dataDefinitions.ts`
- `src/utils/prompts/promptAssembler.ts`
- `src/utils/prompts/tasks/characterInitializationPrompts.ts`
- `src/utils/stateChangeFormatter.ts`
- `tests/affinityLadder.test.mjs`
- `tests/ledgerP0.test.mjs`
- `tests/nanhuangExpansion.test.mjs`
- `tests/narrativeStateReconciler.test.mjs`
- `tests/qingyuStage02ContractWalker.test.mjs`
- `tests/scenarioModStrictInitializer.test.mjs`
- `tests/sharedExperienceAffinity.test.mjs`
- `tests/xingyuehuB1LocalBranch.test.mjs`
- `src/stores/actionQueueStore.ts`（旧队列身份迁移、同名操作分开）
- `src/utils/generators/eventGenerators.ts`（事件人物引用ID）
- `PROJECT-STATUS.md`、`docs/PLANNING-ROUNDS.md`及本交接。

registry生成时间戳由门禁刷新；未改canon人物事实。全部既有未提交工作保留，不commit/push。
