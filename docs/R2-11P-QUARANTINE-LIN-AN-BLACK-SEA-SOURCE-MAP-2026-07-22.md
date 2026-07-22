# R2-11P：隔离关 `lyl.lin_an_black_sea` 逐拍来源映射与重建（2026-07-22）

## 结论

本关只覆盖 EPUB《六朝云龙吟》第 6–8 章：`0011.html`《临安》、`0012.html`《雷峰》、`0013.html`《衙内》。旧数据把第 9–14 章及若干无来源推演混入本关，不能直接补 completion contract。

`event.id` 受 append-only 存档合同保护，因此保留全部 15 个旧 ID；本次只重写名称、描述、目标、人物、依赖顺序与人工合同。部分 ID（如 `debut_ruan_sisters`、`you_chan_meeting`）仅为历史存档键，名称不再代表事件语义。

## 发现的确定性缺陷

1. `stage-plan` 指定本关 `sourceStartIndex=5/sourceEndIndex=8`、开场位于《血誓》之后《临安》之前；旧事件却混入第 9–14 章的便门瓦、小瀛洲、林娘子与阮香琳后续。
2. 旧开场直接宣告林冲调档、雷峰塔解围、薛延山托付和游婵会面，把本关尚未发生的事件全部当作既成事实。
3. 15 个事件大多无条件并发激活，章节之间依赖旧 `chapter.*.done`，无法保证按原文顺序游玩。
4. 三条已有轴 `yunlong.6.1 / 8.1 / 8.2` 可以保留；第 7 章和章内细拍没有现成轴证据，不新增猜测轴节点。
5. 江州铁傀儡属于场外插叙，程宗扬当时不知情；合同与文案必须显式保留视角隔离。
6. 旧 `canon.characters` 还投进 19 个本关未登场角色，并以“阮香凝/林冲之妻/黑魔海玉姬”完整揭露第 7–8 章只称“凝姨”的人物，构成直接机密泄漏。
7. 冻结 ID `lyl.event.mingqingsi_encounter` 还残留一份来自后续章节旧语义的“高衙内/阮香凝/水镜”高光证据 fallback；来源重建后该兼容映射已失效，必须随旧语义一并删除。
8. 收口演员集后，8 个只因旧关卡误投影而标成 `stagePresent` 的总卡恢复为 `canonOnly`，其中 7 个 registry ID 随 stage ID 映射变化；旧 `sourceHash` 只哈希角色卡原文件，无法触发本地 Character RAG 重建，会留下失配的旧向量 ID。
9. 旧 `world.background` 仍把游婵、齐羽仙、剑玉姬与西门庆的后续布局写成当前事实；角色静态归属投影也会把李师师、高衙内等人的后续阵营关系重新加回。世界背景、地点、势力与逐人 affiliations 必须共同按本关时区收口。

## 来源顺序

| 顺序 | 冻结 eventId | 重建后事件 | 原文 |
|---:|---|---|---|
| 1 | `lyl.event.debut_ruan_sisters` | 抵达临安，拜祭谢艺 | 6《临安》 |
| 2 | `liuchao.event.wei_yuan_first_contact` | 尾随李师师至威远镖局 | 6《临安》 |
| 3 | `lyl.event.ruan_xiangning_secret` | 查勘武穆王府 | 6《临安》 |
| 4 | `liuchao.event.lin_chong_confront` | 识破皇城司尾随 | 6《临安》 |
| 5 | `lyl.event.mingqingsi_encounter` | 明庆寺旁观林鲁初会 | 6《临安》 |
| 6 | `liuchao.event.gather_intel` | 解读便门瓦接头字条 | 7《雷峰》 |
| 7 | `liuchao.event.factory_registration` | 吏部报到，档案被调 | 7《雷峰》 |
| 8 | `liuchao.event.xue_sun_meeting` | 西湖农居会见薛延山 | 7《雷峰》 |
| 9 | `liuchao.event.cold_poison_mystery` | 辨认薛延山寒毒 | 7《雷峰》 |
| 10 | `lyl.event.ruan_xianglin_scheme` | 应李师师之邀登雷峰塔 | 7《雷峰》 |
| 11 | `liuchao.event.wei_yuan_crisis_deepen` | 查明失镖勒索全貌 | 8《衙内》 |
| 12 | `liuchao.event.gao_yanei_showdown` | 雷峰塔逼退高衙内 | 8《衙内》 |
| 13 | `liuchao.event.you_chan_meeting` | 决定继续追查威远失镖 | 8《衙内》 |
| 14 | `liuchao.event.black_sea_approach` | 江州铁傀儡场外拍 | 8《衙内》 |
| 15 | `liuchao.event.final_preparations` | 经过叩天石，前往便门瓦 | 8《衙内》 |

## 合同与回放

- 15 拍全部采用人工 `objective_action`，没有 `advance_declared_objective`。
- 五个旧 chapterId 同样保留；每章列出的 critical events 全部完成后，由 runtime 派生标准 chapter flag，再激活下一章。
- 空存档可以依次完成 15 拍和 5 章；JSON 往返后输出逐字节一致。
- `liuchao.event.black_sea_approach` 明示为场外插叙，动作文本明示“程宗扬对此尚不知情”。
- 关卡人物集合严格等于 opening 与事件实际引用演员；“凝姨”与本关漏投影的冯源使用最小字段白名单，均不写境界、技能、物品和未来身份。
- “凝姨”的时间门控同时落在构建期角色卡投影、势力投影和运行时 registry 物化三处，避免一次全量构建或新开档重新补出真名、婚姻、黑魔海身份与未来画像。
- `lyl.event.mingqingsi_encounter` 已改为第 6 章明庆寺林冲、鲁智深初会，不再参与旧“半预制高光”批次，也没有旧快照证据 fallback；BGM 的 `intrigue` 映射仍与新事件相符，保留。
- Character registry 的 `sourceHash` 改为哈希最终稳定排序条目，角色卡、stage-derived ID、`stagePresence` 或 `embedText` 任一变化都会让 Character RAG 重新建索引。
- `world.background` 改回刚入临安的时点；地点只保留本关四处，势力集合严格等于事件与角色归属实际引用，15 名演员的 affiliation 集合由本关锁定，构建期不得用跨书静态卡扩写。
- 本关仍保留在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`，来源重建不等于放行。

## 产物

- 重建脚本：`scripts/rebuild-lin-an-black-sea-from-source.mjs`
- 回归：`tests/r2_11p_lin_an_black_sea_source_rebuild.test.mjs`
- 批量边界：`tests/r2_11j_objective_action_scale.test.mjs`
- 首次快照：`yunlong/stages-pre-r2-11p-source-rebuild-backup/lyl.lin_an_black_sea.json`（生成目录内，仅本地/NAS 工作源）

覆盖：`316/381` → `331/381`；剩余六个隔离关共 50 个事件。

## 验证与停点

- `npm run canon:build`：37 关 schema、人工裁定执法、主轴/存档契约与 445 tests 全绿。
- `npm run validate:all`：TypeScript、445 tests、14 个 IF 分支与 37 个内置关卡全绿。
- `npm run build`：production webpack 成功。
- 重建脚本连续执行输出相同，首次备份目录仅有目标关一个文件；source 与 builtin JSON 模型一致。
- 本轮停在 quarantine release audit 之前：未解除隔离、未提交、未同步 NAS。
