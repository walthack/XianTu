# R2-11R：隔离关 `lcq.stage_06` 来源重建（2026-07-22）

## 结论

本关六个冻结事件大体抓住了鬼王峒决战至殇侯村落的里程碑，但存在三类确定性问题：鬼巫王被吞绑定到下一章复述、龙神死亡与谢艺雷击重复绑定、冰蛊事件附会了原文没有写出的具体解法。三个 objective 也把已经身在现场的程宗扬写成“潜入调查／追击”，并把小紫弑母拍错误写成“阻止碧姬”。

本次逐章复核 EPUB 第112章《唤龙》至第124章《授艺》，保留六个 eventId、chapterId 与 completion path，只纠正来源、目标、演员闭包及人工完成合同。裁定 #90/#92 的两条 IF 稳定引用完整保留。

## 来源映射

| 顺序 | 冻结 eventId | 重建后事件 | 原文/轴 |
|---:|---|---|---|
| 1 | `lcq.event.s06_01` | 鬼巫王反被龙神吞噬，龙神狂暴破山 | `qingyu.114.2` / 205 |
| 2 | `lcq.event.s06_02` | 众人重创龙神，程宗扬最终刺穿龙颅 | `qingyu.117.1` / 211 |
| 3 | `lcq.event.s06_03` | 谢艺遭雷击后托付小紫、伤重辞世 | `qingyu.116.1` / 210（裁定 #90 冻结） |
| 4 | `lcq.event.s06_04` | 小紫与碧姬对质后弑母 | `qingyu.120.1` / 217 |
| 5 | `lcq.event.s06_05` | 朱老头显露殇侯身份与天命之说 | `qingyu.122.2` / 222 |
| 6 | `lcq.event.s06_06` | 殇侯明确确认已经解除冰蛊 | `qingyu.126.2` / 226 |

事件链仍按叙事可玩顺序 `s06_01→02→03→04→05→06`。`s06_02` 的结算包含第115章龙神坠亡；`s06_03` 虽在战后才完成托付与死亡，仍依裁定 #90 保留 `qingyu.116.1`，避免破坏 `lcq.if_xieyi_longrest` 及既有存档引用。

冰蛊一拍只采用第124章殇侯“已经解蛊”的明确确认。原文没有交代旧稿所写的具体术法与材料，因此合同刻意不补机制，只要求接受处置并取得确认。

## 投影与合同边界

- opening 停在苍龙星阵完成、合体尚未逆转；不提前写入龙神死亡、谢艺结局、小紫弑母、殇侯身份或解蛊结果。
- 演员从 42 人收口到 opening 与六拍实际引用的 13 人；地点只保留鬼王峒与殇侯所在南荒山谷，势力由事件及演员归属闭合。
- 关系只保留开场已经成立的同行、伴侣与敌对关系，不把临终托付、弑母、殇侯庇护等未来结果预载到 opening。
- 六拍均为人工双步 `objective_action`，不含 `advance_declared_objective`，不伪造属性阈值。
- `s06_04` 的正常 Rail 明确见证小紫的决断；若本地对账确认碧姬生还，既有 `lcq.if_xiaozi_spares_mother` 仍按裁定 #114 改写处境而不软化小紫内核。

## 验证与停点

- 六个冻结事件与 IF 锚点有专门回归；空存档跨 JSON 往返可依次完成六拍与整章，完成后重复推进逐字节一致，无场外伪记。
- 覆盖从 `336/381` 增至 `342/381`；剩余四个隔离关共 39 个事件。
- `npm run canon:build`：455 tests、37 关 schema、381 event ID 契约全绿；`validate:all` 与 production build 全绿。
- 本关仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`；来源重建不等于解除隔离，等待统一 release audit。

产物：

- `scripts/rebuild-lcq-stage-06-from-source.mjs`
- `tests/r2_11r_lcq_stage_06_source_rebuild.test.mjs`
- `tests/r2_11j_objective_action_scale.test.mjs`
- 首次快照：`qingyu/stages-pre-r2-11r-source-rebuild-backup/lcq.stage_06.json`
