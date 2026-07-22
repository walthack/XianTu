# R2-11Q：隔离关 `lyl.taiquan_expedition` 来源重建（2026-07-22）

## 结论

这个历史 ID 并不覆盖太泉。`stage-plan` 把来源窗口固定为 EPUB 第 12–14 章，manifest 又固定 `axisSeq=563–566`；两套证据都落在临安《镖局》《宝刀》《处子》。旧稿的苍澜、太泉古阵、赤阳圣果、多派结盟与撤离均无本窗口来源。

真正太泉从源 85 后开始，且已有 `lyl.taiquan_sacred_fruit`、`lyl.taiquan_core_conflict`、`lyl.taiquan_afterfall` 覆盖。本次因此保留 `lyl.taiquan_expedition` 及五个 eventId/chapterId 作为冻结存档键，只纠正关卡语义，不把它迁到后期制造重复剧情。

## 来源映射

| 顺序 | 冻结 eventId | 重建后事件 | 原文/轴 |
|---:|---|---|---|
| 1 | `liuchao.event.enter_taiquan` | 接获江州三份军情，水镜受阻后改派快马示警 | 12《镖局》章内细拍，无现成轴 |
| 2 | `liuchao.event.reconnoiter` | 象牙为礼拜访威远镖局 | `yunlong.12.1` / 563 |
| 3 | `liuchao.event.du_zong_raid` | 司营巷旁观屠龙刀伏击 | `yunlong.13.1` / 564 |
| 4 | `liuchao.event.fruit_conflict` | 林家确认凝姨身份与黑魔海疑点 | `yunlong.14.1` / 565 |
| 5 | `liuchao.event.escape_taiquan` | 潜入西湖别业窃听高衙内、陆谦密谋 | `yunlong.14.2` / 566 |

第 1 拍只采用原文明确细节，不伪造新轴。其余四拍逐条复用既有时间轴。五拍串成唯一依赖链，全部使用人工 `objective_action`，不含机械动作 `advance_declared_objective`。

## 投影边界

- 世界只保留中州与临安城；opening 从橡树瓦后的蜡丸军情开始。
- 演员集合严格闭合于 opening 与五拍引用，共 14 人；势力集合严格闭合于事件与演员当时归属。
- 李寅臣、阮香琳、阮香凝、高衙内、陆谦使用本关时点最小投影。五人的构建期角色卡与运行时 registry 物化均设时间门控；全体演员的 affiliations 由本关白名单锁定。
- 阮香凝只揭示到“凝姨＝林娘子、程宗扬开始怀疑黑魔海关联”，不补完整御姬身份与后续关系；高衙内不泄漏未来身世。
- stage-plan 同步改正标题、时区、已完成事实、未来禁区与 mappingReason，`sourceStartIndex=12/sourceEndIndex=14` 不变。

## 合同、回放与停点

- 五个冻结事件、五个冻结章节及全部 completion path 不变。
- 空存档跨 JSON 往返可依次完成五拍、五章，完成后再次推进逐字节一致；没有场外伪记。
- 目标关仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`。来源重建不是解除隔离；须在统一 release audit 后再决定回接 Canon Rail。
- 覆盖从 `331/381` 增至 `336/381`；剩余五个隔离关共 45 个事件。
- `npm run canon:build`：450 tests、37 关 schema 与 381 event ID 契约全绿；`npm run validate:all`、production build 全绿。
- 首次全量 schema 检查发现复用演员携带的技能／功法／物品引用未同步定义，以及旧小紫 `contentAccess` 残片；重建脚本现按演员引用闭合 content 并过滤访问规则，回归后通过。

产物：

- `scripts/rebuild-taiquan-expedition-from-source.mjs`
- `tests/r2_11q_taiquan_expedition_source_rebuild.test.mjs`
- `tests/r2_11j_objective_action_scale.test.mjs`
- 生成目录首次快照：`yunlong/stages-pre-r2-11q-source-rebuild-backup/lyl.taiquan_expedition.json`
