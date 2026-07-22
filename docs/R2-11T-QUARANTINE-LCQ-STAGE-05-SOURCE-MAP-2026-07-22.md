# R2-11T：隔离关 `lcq.stage_05` 来源重建（2026-07-22）

## 结论

旧关卡把鲛人袭击直接写进 opening，十拍又按 `124,124,126,132,145,137,131,145,146` 倒序和重复绑定；章节在第84章阴煞后提前收束，遗漏第85–92章进入鬼王峒、碧姬现身、山洞脱困与红苗受控，无法接到下一关从第93章开始的宫内冲突。

本次逐章复核 EPUB source index 75–94。opening 停在第73章大潮之后、第74章鲛人袭击之前；十个冻结 event ID 全部保留并按原文重写，对旧稿无 ID 可承载的必要过渡 append-only 新增 `s05_10–16`。Claude 二审指出首稿漏掉 `qingyu.82.2` 蛇傀焚村与解救碧鲮族的关键转折，已以 `s05_16` 插回正确位置。本关仍在 quarantine，不回接默认 Canon Rail。

## 来源映射

| 顺序 | eventId | 重建后事件 | 原文/轴 |
|---:|---|---|---|
| 1 | `lcq.event.s05_01` | 海神殿抵御鲛人 | `qingyu.76.1` / 124 |
| 2 | `lcq.event.s05_02` | 拔除鱼叉救治乐明珠 | `qingyu.77.1` / 125 |
| 3 | `lcq.event.s05_03` | 谢艺讲述碧鲮旧战 | `qingyu.78.3` / 128（收束 126–128） |
| 4 | `lcq.event.s05_07` | 失踪搜寻与鬼王峒使者抵达 | `qingyu.79.3` / 131（收束 129–131） |
| 5 | `lcq.event.s05_04` | 以兵器生意化解危机 | `qingyu.80.3` / 134（收束 132–134） |
| 6 | `lcq.event.s05_06` | 查出鬼王峒眼线 | `qingyu.81.3` / 137（收束 135–137） |
| 7 | `lcq.event.debut_xiaozi` | 小紫以碧鲮少女身份现身 | 章内展示拍，无独立轴 |
| 8 | `lcq.event.s05_16` | 斩杀蛇傀解救碧鲮族 | `qingyu.82.2` / 139（append-only，二审 P1 补洞） |
| 9 | `lcq.event.s05_08` | 古道废墟迎击鬼战士 | `qingyu.84.2` / 143（承接 140–143） |
| 10 | `lcq.event.s05_05` | 武二郎斩杀巫师达古 | `qingyu.85.2` / 145 |
| 11 | `lcq.event.s05_09` | 一阳境逼退阴煞 | `qingyu.86.2` / 147（收束 146–147） |
| 12 | `lcq.event.s05_10` | 结成探查鬼王峒的同行约定 | `qingyu.87.4` / 151（append-only，重点收束 149–151；148 为非承重支线） |
| 13 | `lcq.event.s05_11` | 随弥骨进入鬼王峒 | `qingyu.88.3` / 154（append-only，重点收束 153–154；152 为氛围拍） |
| 14 | `lcq.event.s05_12` | 白纸信笺与达古死讯 | `qingyu.89.2` / 156（append-only） |
| 15 | `lcq.event.s05_13` | 阁罗召来碧姬 | `qingyu.90.2` / 158（append-only） |
| 16 | `lcq.event.s05_14` | 机关惊动后从山洞脱困 | `qingyu.92.1` / 160（append-only，承接 159–160） |
| 17 | `lcq.event.s05_15` | 确认红苗受控并护住苏荔 | `qingyu.94.1` / 162（append-only，承接 161–162） |

## 投影与合同边界

- opening 只允许大潮、受困与已经取得珊瑚匕首；鲛人胜负、兵器交易、小紫真相、鬼王峒内部与红苗受控均未落账。
- 十四名演员全部采用第74章时点最小卡；构建期角色卡、势力投影与运行时 registry 三层时间门同步锁定。
- 小紫只以碧鲮少女和天真表象登场，不提前注入毒宗嫡传、岳帅遗孤或后期“紫妈妈”；凝羽、程宗扬、祁远等也不回灌跨书身份。
- 碧姬使用本名；“碧奴”只标记为鬼王峒立场的蔑称，执行裁定 #11。
- 十七拍全部为人工双步 `objective_action`，无 `advance_declared_objective`、无猜造属性阈值；空档可按唯一依赖链重放至整章完成。

## 验证与停点

- 专项回归覆盖冻结/新增 ID、轴唯一性、opening 边界、十四人最小投影与三层时间门、SAVE-CONTRACT、全章 JSON 重放。
- 事件总数 `384→391`；确定性合同覆盖 `355/384→372/391`；剩余两个隔离关共 19 个事件。
- `npm run canon:build`：469 tests、37 关 schema、390 event ID 契约全绿。
- 本关仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`；来源重建不等于 release audit。

产物：

- `scripts/rebuild-lcq-stage-05-from-source.mjs`
- `tests/r2_11t_lcq_stage_05_source_rebuild.test.mjs`
- 首次快照：`qingyu/stages-pre-r2-11t-source-rebuild-backup/lcq.stage_05.json`
