# 69ab6bdd 试玩报告修复记录

仅工作区修改，未 commit/push。实际 HEAD `6e9d4c54` 是 `69ab6bdd` 后的文档提交，源码基线一致。既有未跟踪 `_newbot_tmp/p1-pack-test-Dcoq1o/` 保留。输入为 `/tmp/report69.md`，未读取 Mac 存档/真实模型响应，也未连接模型或读取凭据/API 配置。

## 逐项结论

| 项 | 结论、根因与改法 | 自动化证据（tests/report69.test.mjs 内测试名） |
|---|---|---|
| P0 | 已修。CharacterManagement → characterStore.loadGame → resetLastConversationIfForeign 删除滚动槽 → gameStateStore.loadFromSaveData 的 assertEntitySaveFormat 才拒绝旧档。现以档案副本执行读取/修复，提前检查实体格式/版本；载入成功后才激活、清理内存备份与保存元数据，读档清理不再删除磁盘备份。云端读取和旧结构迁移不在校验前写入，迁移只在内存；隔离工作槽只在载入成功后创建文件。回滚也先检查格式、版本、结构并成功载入，再覆盖当前槽。滚动候选拒绝旧实体格式。 | `P0 旧实体档/未来版本/解析失败/验证拒绝/末端loadFromSaveData拒绝不删除、不写存档、不更改激活槽`；`P0 回滚…不写入、不删除`（4项）；`P0 检查点复测工作槽失败也不得写入`；`P0 迁移后验证失败不写备份或原槽`；`P0 滚动候选旧实体格式拒绝且不读取备用覆盖它`。实际提取生产函数执行，存储边界用 spy。另更新 lastConversationIsolation 回归。 |
| 1 | 已修。HTTP 局域网缺 randomUUID。共用 uuid.ts 优先原生 UUID、其次 getRandomValues v4、最后 Math.random v4；替换地图2处、两个面板及 affinityIdentity 的半套兜底。冻结文件无直接调用。debugCategories.ts（config.ts 使用的分类表）及文档登记新文件。 | `1 UUID native/getRandomValues/Math.random生成唯一v4，地图select不抛`，各1000个ID。 |
| 2 | 冻结边界，未修解析器。SkillsPanel 队列 cultivation.days/actionId → MainGamePanel cultivationSelections → AIBS → settleActionTime 已接通。代表样本“正文 + 仅指令JSON”在冻结的 parseAIResponse 中成功解析JSON却返回空 text；分步 extractNarrativeText 见代码围栏后也丢弃外部正文。空值检查抛错后还没到时间结算。报告没有原始响应，不能断言实机样本唯一根因；未发现另设闭关 schema。 | `2 冻结解析器复现：完整正文+仅指令JSON得到空text；独立天数结算7日正确`：直接提取两段冻结生产方法验证；合法 JSON text 样本及可信7日选择结算10080分钟。 |
| 3 | 已修。江州 country 已为晋，region/description 仍是宋；同步总表、所有 stageVariants、builtins、overlay 的 to 与 pack。晴州源数据 country 已为宋，但 strictInitializer 投影到世界.信息.地点信息漏传 country；地图 normalizeLocationsData 从该字段集读取，不是直接展示 canon。现初始化透传，标准化旧存档时按权威地点总表补 country；晴州 region 对齐宋。overlay.from 保留作为原补丁匹配条件。 | `3 江州/晴州总表及全部阶段变体字段一致`；`3 晴州country贯穿初始化与旧存档地图标准化`；内容包编译和 --check。 |
| 4 | 五原已修：原 mapRoutes 同国直接返回[]；现同国目标是本国代表点时按总表坐标距离计算天数，coordinateLi/minDays/enabled 配置写入 numbers-runtime.crossCountryTravel.domesticRepresentative，复用 liPerDay=80；向上取整至少1日，同点不重复旅行，作者路线仍优先。咸阳保留门槛：现有 qinEntryWiring 与 crossCountryTravel 明确断言未达标/大祭后不可选择咸阳，按用户“若破坏既有门槛设计/测试则保留”的条件处理。 | `4 草原→五原国内代表点按坐标80里每日且至少1日结算`；crossCountryTravel 的国内代表点、作者锁路、秦入口回归；qinEntryWiring。 |
| 5 | 已修。mapTravelPreview/mapTravelConfirmed 为无副作用纯函数；弹窗显示约N日，第一次点击仅进入确认状态，取消不结算，确认后重新核对来源/目标/路程再 settle。切换选中地点取消确认。秦剧情入口不另扣天数，因此预览明确显示剧情转场，不虚构N日。 | `5 地图预览纯函数显示32日；取消/首次/过期确认不可提交`，并核对 Vue 接线先确认再 settle。 |
| 6 | 已修。mapPreparation 没有生产调用方，仅存在文案并不能保证展示/注入；通用六档提示虽有地图要求，也不能保证模型照写。新增 mapPreparationNotice，由 MainGamePanel 在回合正文下展示“跨国出行请打开世界地图选择目的地”。不改提示词。 | `6 打字跨国展示系统提示，否定/国内不提示`。 |
| 7 | 已修。DeepCultivationModal 文案固定带加号，再填入倍率-1后的负数，造成+-44%。新增格式函数按舍入后的数值决定符号，i18n模板接收完整百分比。 | `7 功法倍率正负号与零值`：0.56→-44%、1.44→+44%、1→+0%、接近零不显示负零。 |
| 8 | 只报告，未改推进或位置权限。questCompassPhrases 按 relatedCharacterIds 生成“见段强”，不是见面完成条件；到场也不等于合同动作完成。stage_01 首拍仍要求本地合同落账，单纯19轮叙事同行不会自动完成。缺原存档，不能确认其焦点/合同状态或首拍门禁是否异常。位置方面已复现：草原与五原都属中立边陲，canonGuard 当前只拒跨国/未知目标，同国模型命令可以写回草原；该代码不冻结，但直接禁止所有同国移动会改变国内旅行权限，因此本轮不作无证据范围扩大。叙事位置是否由该命令引起也待原存档/命令回执核对。 | `8 见段强是相关人物罗盘，并非完成条件；同国模型位置回写可复现`：真实初始化、罗盘与 canonGuard。 |

## 冻结边界

FROZEN-NEEDED: 2 `src/utils/AIBidirectionalSystem.ts` 的 `extractNarrativeText` / `parseAIResponse` 与最终判空路径。建议在解析到“仅指令JSON”且存在非空JSON外正文时明确保留正文；缺正文仍失败，保持指令校验和事务边界，不应通过提前扣天掩盖解析失败。补分步/非分步混合输出与截断输出测试后再解冻落地。本轮只加复现与独立时间回归，未修改冻结文件。

第8项未证明必须改冻结文件，故不伪造 FROZEN-NEEDED；原存档不可用，保留调查结论与可复现权限证据。

## 验证

- `npm run type-check`：退出0。
- `npm test`：3052项，3039通过、0失败、13跳过（242.18秒，退出0）；新增专项23/23通过。13项为既有跳过项，本轮未新增skip。
- 首轮全量发现3项旧断言/登记未同步（原country-only字段保护、debug分类文档、catch声明）；修正后完整重跑结果如上。
- `node scripts/content-packs.mjs` 重建成功，`--check`通过；4个改动Vue组件的SFC脚本与模板编译通过；`git diff --check`通过。
- 最终存档/报告专项28/28通过；冻结文件逐字节比对HEAD一致，无新增require或诊断码。
- 完整文件清单共61个（包括本报告、项目状态和测试）。

未做浏览器/局域网真机、真实模型或 Mac 存档重放；没有把离线测试记为实机验收。冻结三文件及全部 AIBidirectionalSystem.ts 差分为空，无新增 require/错误码，无提示词模板变更。没有部署、NAS同步或修改用户API配置。

## 改动文件

以下完整列表由本轮工作区差分生成（既有未跟踪临时目录不计）。
- `PROJECT-STATUS.md`
- `docs/DEBUG-LOG.md`
- `docs/handoffs/2026-10-31/REPORT69-FIXES.md`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/entity-catalog/locations.json`
- `mod-kit/game-numbers.qingyu.json`
- `mod-kit/numbers-runtime.json`
- `src/components/common/DeepCultivationModal.vue`
- `src/components/dashboard/GameMapPanel.vue`
- `src/components/dashboard/MainGamePanel.vue`
- `src/components/dashboard/SkillsPanel.vue`
- `src/i18n/index.ts`
- `src/modules/contentPacks/generated/catalog.json`
- `src/modules/contentPacks/packs/qingyu/stage-qin-xianyang.json`
- `src/modules/diagnostics/debugCategories.ts`
- `src/modules/scenarioMods/builtins/data/lcq.stage_01.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_02.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
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
- `src/modules/scenarioMods/ledger/affinityIdentity.ts`
- `src/modules/scenarioMods/strictInitializer.ts`
- `src/modules/scenarioMods/travel/mapTravel.ts`
- `src/stores/characterStore.ts`
- `src/utils/coordinateConverter.ts`
- `src/utils/cultivationSpeedCalculator.ts`
- `src/utils/saveLoadFallback.ts`
- `src/utils/uuid.ts`
- `tests/actionTime.test.mjs`
- `tests/crossCountryTravel.test.mjs`
- `tests/lastConversationIsolation.test.mjs`
- `tests/report69.test.mjs`
