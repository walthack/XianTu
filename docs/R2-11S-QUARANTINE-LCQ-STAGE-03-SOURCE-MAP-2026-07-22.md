# R2-11S：隔离关 `lcq.stage_03` 来源重建（2026-07-22）

## 结论

旧关卡把第24章才发生的冰蛊、赌局后关系与南荒行程预载进 opening；`s03_07` 与 `s03_08` 又重复绑定 `qingyu.33.1`。更严重的是，旧章节在第33章双修拍即收束，完全遗漏第33章太乙拦船及第34–36章雨林、黑石滩和抵达蛇彝村，无法自然接到下一关第37章《危命》。

本次逐章复核 EPUB 第18–36章（source index 20–38）。十个冻结 event ID 全部保留并按原文重写；对旧稿无 ID 可承载、又是下关成立前提的三段过渡，按 append-only 新增 `s03_10–12`。本关仍在 quarantine，不回接默认 Canon Rail。

## 来源映射

| 顺序 | eventId | 重建后事件 | 原文/轴 |
|---:|---|---|---|
| 1 | `lcq.event.s03_01` | 与苏妲己订下三个月南荒之约 | `qingyu.20.2` / 36 |
| 2 | `lcq.event.debut_ningyu` | 凝羽奉命进入赌局 | 章内展示拍，无独立轴 |
| 3 | `lcq.event.s03_02` | 赌局落败并签下卖身契 | `qingyu.21.1` / 37 |
| 4 | `lcq.event.s03_03` | 以新奇器物向苏妲己索酬 | `qingyu.23.1` / 38 |
| 5 | `lcq.event.s03_04` | 赎买并释放阿姬曼 | `qingyu.25.1` / 40 |
| 6 | `lcq.event.s03_05` | 苏妲己以冰蛊逼迫南行 | `qingyu.26.1` / 42 |
| 7 | `lcq.event.s03_06` | 武二郎被迫明确加入南荒队伍 | `qingyu.31.2` / 47 |
| 8 | `lcq.event.s03_07` | 武二郎中毒后又逢铁索桥伏击 | `qingyu.32.2` / 50 |
| 9 | `lcq.event.s03_08` | 劝住武二郎继续南行 | `qingyu.33.1` / 51 |
| 10 | `lcq.event.s03_09` | 凝羽提出弑主并揭开体内寒气 | `qingyu.35.1` / 53 |
| 11 | `lcq.event.s03_10` | 太乙真宗拦截紫溪船队 | `qingyu.35.2` / 54（append-only） |
| 12 | `lcq.event.s03_11` | 雨林恶兆与黑石滩渡河 | `qingyu.37.2` / 58（append-only，收束 55–58） |
| 13 | `lcq.event.s03_12` | 抵达异常寂静的蛇彝村 | `qingyu.38.1` / 59（append-only，承接 60） |

`s03_11` 将青藤蛇伤亡、山洪阻路、两队迷失与凝羽举火视为同一次连续行程危机；不伪造新轴。`s03_12` 只写抵达时可见的寂静与对谢艺军旅来历的推测，不提前宣告第37–38章才揭开的袭击与灭村真相。

## 投影与合同边界

- opening 停在 `qingyu.20.1` 之后、`20.2` 谈判之前：程宗扬已被识破并扣押，但三个月期限、赌局结果、冰蛊与南行均未发生。
- 演员从混入跨期人物的旧投影收口为九人；全员采用第18章时点最小卡，并在构建期角色卡、势力投影与运行时 registry 三层门控。
- 凝羽只保留白湖商馆侍卫长身份；谢艺只保留同行刀客与“可能有北方军旅经历”的推测；西门庆不提前获得黑魔海归属；程宗扬、祁远不回灌后期商号身份。
- 地点收口为白湖商馆、五原、南荒商路与蛇彝村；蛇彝村描述只含本关可见异常。
- 13 拍全部为人工双步 `objective_action`，无 `advance_declared_objective`，无凭空属性阈值；空档可按唯一依赖链重放至整章完成。

## 验证与停点

- 专项回归覆盖：冻结/新增 ID、轴唯一性、opening 时间边界、最小投影、运行时 prompt 泄漏、SAVE-CONTRACT 与全章 JSON 重放。
- 事件总数 `381→384`；确定性合同覆盖 `342/381→355/384`；剩余三个隔离关共 29 个事件。
- `npm run canon:build`：463 tests、37 关 schema、384 event ID 契约全绿；`validate:all` 与 production build 全绿。本关来源重建完成后进入 Claude 二审停点。
- 本关仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`；来源重建不等于 release audit。

产物：

- `scripts/rebuild-lcq-stage-03-from-source.mjs`
- `tests/r2_11s_lcq_stage_03_source_rebuild.test.mjs`
- 首次快照：`qingyu/stages-pre-r2-11s-source-rebuild-backup/lcq.stage_03.json`
