# R3-10 二级线盘点（2026-08-16）

> 配套：`docs/R3-10-MAIN-QUEST-AXIS-DRAFT-2026-08-16.md` §5 / §7，`src/modules/scenarioMods/mainQuestAxis.ts` 的 `STAGE_ORDER` 与 `MAIN_QUEST_STAGES`。
> 范围：主轴 15 关之外的 **22 关**。二级线＝公会式可选事业线；家底在续写段解锁对应主线分岔。
> 扫描纪律：关键词与情节只读各关 `scenario.events` 与 `scenario.worldSimulation`。`canon.factions` 仅用来核对势力 **id / name**，不参与归线（共享注入会把太乙／星月湖／黑魔海写进几乎每关）。
> 事件完成判据一律来自该事件 `completion[].path`（全库未见事件级 `flags` 字段；`initialFlags` 也无入伙／加入类键）。

---

## 0. 口径

- **主轴 15 关**（不在本表归线，但会作为二级线的种子关引用）：见 `MAIN_QUEST_STAGES`。
- **22 关**＝`STAGE_ORDER` 减去上述 15 关。
- **归线**：以该关 `events[].name` / `objective` / `description` / `axisBeat` 的情节为据，不以文件名或整包 JSON 关键词为准。`worldSimulation.situations` 只作旁证。
- **加入条件**：必须能落到事件的 `objective` / `completion`。找不到就写「无现成判据（需新增）」。
- **双喂**：一关可同时喂两条线；主归属写在前。
- 标了「推断」的句子不是字段事实。

### 22 关名单（链序）

| # | stageId | manifest.name |
|---|---|---|
| 1 | `lcq.stage_04` | 六朝清羽记·第44章·向导 |
| 2 | `lcq.stage_04b_lingfei_baiyi_crisis` | 六朝清羽记·第56-72章·灵飞镜与白夷危局 |
| 3 | `lcq.stage_07_qingyuan_jiankang` | 六朝清羽记·第130-154章·清远至建康疑局 |
| 4 | `lcq.stage_08_jiankang_coup` | 六朝清羽记·第155-182章·鹰愁峪与建康宫变 |
| 5 | `lcq.stage_09_trade_and_escape` | 六朝清羽记·第183-208章·云氏商局与沉江脱险 |
| 6 | `lcq.stage_10_jiangzhou_shadow_war` | 六朝清羽记·第209-232章·江州前夜与黑魔海巢穴 |
| 7 | `lcq.stage_11_lieshan_battle` | 六朝清羽记·第233-252章·烈山三川口与粮战开局 |
| 8 | `lcq.stage_12_jiangzhou_counterwar` | 六朝清羽记·第253-288章·江州围城与反攻布局 |
| 9 | `lyl.jiangzhou_retreat` | 六朝云龙吟·坠美 |
| 10 | `lyl.lin_an_black_sea` | 六朝云龙吟·血誓 |
| 11 | `lyl.taiquan_expedition` | 六朝云龙吟·镖局、宝刀与处子 |
| 12 | `lyl.taiquan_core_conflict` | 六朝云龙吟·未来 |
| 13 | `lyl.luoyang_cloud_secret` | 六朝云龙吟·天石 |
| 14 | `lyl.luoyang_coup` | 六朝云龙吟·封侯 |
| 15 | `lyg.dingtao_beijing` | 六朝燕歌行·退败 |
| 16 | `lyg.changgan_begins` | 六朝燕歌行·灞桥 |
| 17 | `lyg.shixiang_ambush` | 六朝燕歌行·长安佛门暗潮至水香楼余波 |
| 18 | `lyg.changgan_interlude` | 六朝燕歌行·长安暗潮与失踪伏击 |
| 19 | `lyg.ganlu_bian` | 六朝燕歌行·甘露密谋至程宅战榜 |
| 20 | `lyg.liangzhou_league` | 六朝燕歌行·程宅战榜 |
| 21 | `lyg.buddhist_conspiracy` | 六朝燕歌行·佛门围杀与甘露变爆发 |
| 22 | `lyg.ganlu_aftershock` | 六朝燕歌行·甘露变余波与唐皇弑逆 |

---

## 1. 逐关归属

对照设计稿 §7 草案，按事件层核实。草案把 `stage_02` / `stage_06` 写进太乙线、把临安段写进商队——这两处种子关是主轴，本表只标 22 关。

| 关卡 | 主归属 | 同时喂 | 事件层依据（只列本关 `events`） | 相对 §7 草案 |
|---|---|---|---|---|
| `lcq.stage_04` | **不属于七条二级线** | — | 7 条事件全是南荒向导／鬼王峒武士／乐明珠身份／发蛊／易虎之死／凝羽毒瘾／白夷交涉。无建康、无江州、无朝堂、无入教。 | §7 未列。`云苍峰` 只作为在场人物，不构成商队线关。 |
| `lcq.stage_04b_lingfei_baiyi_crisis` | **不属于七条二级线** | 星月湖（轻） | 19 条事件是夺镜／鸦人／白夷／地宫／血虎。`s04b_…_16`「岳帅旧闻」objective＝向云苍峰打听岳帅旧闻；`s04b_…_13`「谢艺杀使」objective＝潜入地宫查明碧宛下落。 | §7 未列。岳帅旧闻是星月湖情报，不是加入星月湖。 |
| `lcq.stage_07_qingyuan_jiankang` | **建康** | 星月湖；太乙（轻） | `s07_02` 清远斩吴 → `s07_08` 宫险分逃／云丹琉；`s07_05`「八骏得讯」向孟非卿报告谢艺之死；`s07_qinhui_join` 秦桧归入麾下。`s07_04` axisBeat 写卓云君为太乙教御受制。 | 与 §7「建康＝stage_07–09」一致。八骏是星月湖双喂。 |
| `lcq.stage_08_jiankang_coup` | **建康** | 毒宗／黑魔海（轻） | `s08_01`–`s08_10` 鹰愁峪→玄武湖救驾（保护晋帝）；`debut_panjinlian` 潘金莲·招牌登场。 | 与 §7 一致。潘金莲登场是黑魔海／观堂线入口，本关主情节仍是晋宫。 |
| `lcq.stage_09_trade_and_escape` | **建康** | **商队**；毒宗；星月湖（过渡） | `s09_01` 八骏离建康；`s09_02` 云如瑶昏厥；`s09_04` 织坊换局；`s09_05` 排水沟逃离建康；`s09_06`–`s09_07` 黑魔海内隙／飞鸟潜伏；`s09_09` 江州危急。manifest 名即「云氏商局与沉江脱险」。 | §7 同时把本关放进建康与商队——事件层确认双喂。 |
| `lcq.stage_10_jiangzhou_shadow_war` | **星月湖** | 毒宗／黑魔海 | `s10_01` 攻江州令；`s10_04` 与孟非卿复盘左武军；`s10_07`–`s10_08` 先发制人打击黑魔海／星月湖洞穴对抗黑魔海。 | 与 §7「江州段 stage_10–12」一致，并明确双喂黑魔海。 |
| `lcq.stage_11_lieshan_battle` | **星月湖** | — | `s11_03` 奉命护月霜；`s11_04`「星月湖现身」objective＝在雪原对峙星月湖军；`s11_10` 三川口败局。 | 与 §7 一致。对峙≠加入，见 §2.5。 |
| `lcq.stage_12_jiangzhou_counterwar` | **星月湖** | — | `s12_11` 江州全面攻城至 `s12_18` 临安粮战令；`s12_10` 救下萧遥逸；`s12_17` 说服殇侯留守江州。 | 与 §7 一致。 |
| `lyl.jiangzhou_retreat` | **星月湖** | 商队（轻） | `s01_01` 江州宋军大溃与退军；`s01_04` 与滕甫交易三十万石粮食；`s01_02` 离开江州赴临安。 | §7 江州段只写到 stage_12。本关是江州收束，**推断**应并入星月湖线。粮贸是商队轻喂。 |
| `lyl.lin_an_black_sea` | **商队／云氏商局** | 星月湖（轻） | `debut_ruan_sisters` 抵达临安、拜祭谢艺；`wei_yuan_first_contact` 尾随李师师至威远镖局；后续失镖／雷峰塔／高衙内。无云氏商局正文，是宋国临安商业／镖局。 | §7「stage_09、临安段」。拜祭谢艺／武穆王府是星月湖轻喂。 |
| `lyl.taiquan_expedition` | **商队／云氏商局** | — | 5 条事件：接获江州三份军情、象牙为礼拜访威远镖局、司营巷旁观屠龙刀伏击、林家识破凝姨秘密、潜入西湖别业窃听密谋。**事件层无太泉祭祀／无毒宗入教。** | §7 把「太泉段」整体塞给毒宗。本关文件名含 taiquan，但事件是临安镖局续。与主轴设计 §2「`taiquan_expedition`（镖局、屠龙刀）不进主轴」一致——归商队，不归毒宗、不归太泉主轴。 |
| `lyl.taiquan_core_conflict` | **毒宗／黑魔海** | — | `pan_jinlian_ambush` 潘金莲的伏击；`yu_baiying_truce` 魔墟救出虞白樱；`yin_fulan_aid` 尹馥兰出手。无太泉古阵祭祀。 | 与主轴设计 §2「蚁穴、魔墟、潘金莲伏击」一致。属毒宗对抗段，不是入教段。 |
| `lyl.luoyang_cloud_secret` | **汉国朝堂** | **商队** | `s05_01` 云苍峰商议买官与铜矿；`s05_03` 吕氏调动汉军围杀；`s05_06` 天子下诏送赵合德入宫；`s05_09` 云氏金铢押运遇劫。 | 与 §7 一致，并确认商队双喂。 |
| `lyl.luoyang_coup` | **汉国朝堂** | — | `s06_01` 天子暴毙；`s06_02` objective＝「召齐各方定下**拥立定陶王**并分派任务」；`s06_03`–`s06_06` 长秋宫／吕奉先。 | 与 §7 一致。这是汉国线目前唯一接近「入局」的事件。 |
| `lyg.dingtao_beijing` | **汉国朝堂** | — | `s01_01`–`s01_09` 平叛、定陶王、吕雉亲裁诸吕、董卓／郭解。 | 与 §7 一致。 |
| `lyg.changgan_begins` | **唐国长安** | — | `s03_01` 入住长安宣平坊宅院；`s03_03`–`s03_07` 杨玉环；`s03_04` 潘金莲在长安出现（路过，不改主归属）。 | 与 §7「changgan_begins–ganlu_aftershock 7 关」一致。 |
| `lyg.shixiang_ambush` | **唐国长安** | 毒宗（轻） | 兴庆宫／青龙寺／元正朝会／水香楼诱捕；`lure_pan_jinlian` 迁入水香楼布置诱捕。 | 与 §7 一致。潘金莲诱捕是黑魔海轻喂。 |
| `lyg.changgan_interlude` | **唐国长安** | — | 拜访李药师、百衲衣、昭南索赔、十方丛林、救出白霓裳。`events[2].axisAnchor`＝「六朝燕歌行·#96·锦囊」——**只是时间线条目标签，本事件 name/objective/description 无锦囊情节**，不得据此把本关算进太乙／锦囊线。 | 与 §7 一致。 |
| `lyg.ganlu_bian` | **唐国长安** | 商队（广源行，轻） | 甘露局势、`yang_yuhuan_report` 核对黎锦香对王守澄案与**广源行**的说法、`jia_wenhe_plan` 厘清广源行等级控制。 | 与 §7 一致。广源行是商贾终盘对手（蓝图 §10），本关只是情报接触。 |
| `lyg.liangzhou_league` | **唐国长安** | — | 凉州盟比武、仇士良夺神策军、招魂王守澄。 | 与 §7 一致。 |
| `lyg.buddhist_conspiracy` | **唐国长安** | — | 十方丛林围杀、大雁塔佛咒、`buddhist_conspiracy_11_beat` 甘露变爆发。 | 与 §7 一致。 |
| `lyg.ganlu_aftershock` | **唐国长安** | — | `ganlu_aftershock_05_beat` 李辅国审判；`ganlu_aftershock_07_beat` 唐皇弑逆。 | 与 §7 一致。蓝图第一幕引擎＝长安驱魂局／李辅国，本关已把李辅国放到事件层。 |

---

## 2. 七条二级线（落实）

### 2.1 太乙掌教（锦囊）

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 太乙掌教（锦囊） | 设计稿 §7；定性仍 ⏳（§4／§11） |
| 所属势力 | `liuchao.faction.tai_yi_zhen_zong`　太乙真宗 | 各关 `canon.factions`（id/name 核实） |
| 覆盖关卡（22 关内） | **无专属关。** 轻喂：`lcq.stage_07`（卓云君＝太乙教御受制） | `s07_04` axisBeat |
| 种子关（主轴，不计入 22） | `lcq.stage_01` `s01_04`「太乙真宗介入」；`lcq.stage_02` `s02_01`「王哲传功与托付」；`lcq.stage_03` `s03_10`「太乙真宗拦截紫溪船队」（description 含「掌教遗命」） | 只扫 events |
| 加入条件 | **有现成判据，但落在主轴关，不在 22 关。** `lcq.event.s01_04` objective＝「加入太乙真宗阵营」，`completion`＝`flags.event.s01_04.done == true`。锦囊领取：`s02_01` objective＝「前往王哲处，获取锦囊并接受托付」，`flags.event.s02_01.done`。22 关内 **无现成判据（需新增）**——没有「拆锦囊／持遗命信笺／清洗通魔」事件。 | 见上 |
| 续写段作用 | 程持王哲遗命信笺＋九阳神功印证正统，清洗通魔教御，成道门幕后操盘人（不坐掌教位）。资源包＝道门网络。 | 设计稿 §6；`ENDING-BLUEPRINT.md` §3 太乙真宗线、§10 势力收束表 |

缺口：锦囊在 22 关事件正文中 **零命中**（`changgan_interlude` 的 axisAnchor「#96·锦囊」是时间线标签，不是情节）。设计稿 §4 待查「拆锦囊→卓云君起杀心」仍未在 events 层落地。

### 2.2 商队／云氏商局

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 商队／云氏商局 | 设计稿 §7 |
| 所属势力 | `liuchao.faction.yun_shi_shang_hui`　云氏商会；并行商业实体 `liuchao.faction.bai_hu_shang_guan`　白湖商馆、`liuchao.faction.cheng_shi_shang_hui`　程氏商会、`liuchao.faction.pan_jiang_cheng`　盘江程氏。终盘对手（不是本线加入对象）`lyg.faction.guangyuan_hang`　广源行 | `canon.factions` |
| 覆盖关卡（22 关） | 主：`lcq.stage_09`、`lyl.lin_an_black_sea`、`lyl.taiquan_expedition`、`lyl.luoyang_cloud_secret`。轻：`lyl.jiangzhou_retreat`（粮贸）、`lyg.ganlu_bian`（广源行情报） | §1 表 |
| 种子关（主轴） | `lcq.stage_03b` `s03b_snake_flower_bridge_04`「云氏同行」 | 见下 |
| 加入条件 | **有现成判据，落在主轴关。** `lcq.event.s03b_snake_flower_bridge_04` name＝「云氏同行」，objective＝「与云苍峰商队同行，前往白夷族」，`completion`＝`flags.event.s03b_snake_flower_bridge_04.done == true`。22 关内最接近的加码是 `lyl.luoyang_cloud_secret` `s05_01`「前往云苍峰商议买官铜矿」（`flags.event.s05_01.done`）——这是合作加深，不是首次加入。 | events.completion |
| 续写段作用 | 解锁 **商贾明线** 资源包（商业网络→晴州帛系终盘）。称帝／商贾殊途同归同一中枢房间，只是资源包不同。 | 设计稿 §6；蓝图 §6／§10／§11 |

### 2.3 汉国朝堂

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 汉国朝堂 | 设计稿 §7 |
| 所属势力 | `liuchao.faction.han_guo_chao_ting`　汉国朝廷；宫廷变体 `liuchao.faction.x5135b4e3d7`　汉国宫廷 | `canon.factions` |
| 覆盖关卡（22 关） | `lyl.luoyang_cloud_secret`、`lyl.luoyang_coup`、`lyg.dingtao_beijing` | 与 §7 完全一致 |
| 加入条件 | **有现成判据。** `lyl.event.s06_02`（`lyl.luoyang_coup`）objective＝「从密道出宫，召齐各方定下**拥立定陶王**并分派任务」，`completion`＝`flags.event.s06_02.done == true`。**推断**：完成此事件＝玩家站到拥立定陶／反吕一侧，可作「加入汉国朝堂线」的落地开关。更早的 `s05_01` 买官只是商队渗透朝堂，单独不够。 | events |
| 续写段作用 | 解锁 **称帝线** 资源包（国家机器）。秦国篇立国卷是称帝线主战场。 | 设计稿 §6；蓝图 §4／§11 |

### 2.4 唐国长安

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 唐国长安 | 设计稿 §7 |
| 所属势力 | `liuchao.faction.tang_guo_chao_ting`　唐国朝廷 | `canon.factions` |
| 覆盖关卡（22 关） | `lyg.changgan_begins`、`lyg.shixiang_ambush`、`lyg.changgan_interlude`、`lyg.ganlu_bian`、`lyg.liangzhou_league`、`lyg.buddhist_conspiracy`、`lyg.ganlu_aftershock`（7 关，与 §7 一致） | §1 |
| 加入条件 | **无现成判据（需新增）。** 最近似的是 `lyg.event.s03_01` objective＝「前往宣平坊宅院赴宴」，`flags.event.s03_01.done`——只表示进入长安宅邸，不是「加入唐廷／接驱魂局」。7 关没有任何 objective 写成入仕、接旨或加入北司／南衙。 | events |
| 续写段作用 | 接续写 **第一幕·长安驱魂局**（李辅国）。`ganlu_aftershock_05` 已有「李辅国审判」，是原著段把钩子放到位，不是加入条件。 | 设计稿 §6；蓝图 §2 |

### 2.5 星月湖

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 星月湖 | 设计稿 §7 |
| 所属势力 | `liuchao.faction.xing_yue_hu`　星月湖 | `canon.factions` |
| 覆盖关卡（22 关） | 主：`lcq.stage_10`、`lcq.stage_11`、`lcq.stage_12`、`lyl.jiangzhou_retreat`。轻：`lcq.stage_07`（八骏得讯）、`lcq.stage_04b`（岳帅旧闻）、`lcq.stage_09`（江州危急） | §1 |
| 加入条件 | **无现成判据（需新增）。** `s11_04`「星月湖现身」objective＝「在雪原**对峙**星月湖军」，`completion`＝`flags.event.s11_04.done`——完成的是对峙，不是入营。`s07_05` 是向孟非卿报谢艺死讯。全 22 关无「加入星月湖／恢复番号／八骏入伙」objective。 | events |
| 续写段作用 | 岳帅归营、番号恢复、终战岳家军（洗冤三层的人间层＋系统层）。 | 设计稿 §6；蓝图 §3／§10 |

### 2.6 毒宗／黑魔海

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 毒宗／黑魔海 | 设计稿 §7 |
| 所属势力 | `liuchao.faction.hei_mo_hai`　黑魔海；`liuchao.faction.wu_zong`　巫宗。**全 37 关 `canon.factions` 没有名为「毒宗」的 id。** | `canon.factions` 全链扫描 |
| 覆盖关卡（22 关） | 主：`lyl.taiquan_core_conflict`。入口／轻喂：`lcq.stage_08`（潘金莲登场）、`lcq.stage_09`（黑魔海内隙）、`lcq.stage_10`（巢穴）、`lyg.shixiang_ambush`（诱捕潘金莲） | §1 |
| 加入条件 | **无现成判据（需新增）。** 没有「加入毒宗／加入黑魔海／受天命侯名分」事件。`pan_jinlian_ambush` 是被伏击。蓝图写程在黑魔海关系账本上＝毒宗系「被庇护者」，那是关系数据，不是本任务允许扫描的 events／worldSimulation。 | events；蓝图 §3 C1' 仅作续写对照 |
| 续写段作用 | 第二幕大祭：名义天命侯＝殇侯，毒宗以「殇侯传承已归程」推程为实际继承人；资产兼危机。 | 设计稿 §6；蓝图 §3／§13-C |

### 2.7 建康

| 项 | 内容 | 出处 |
|---|---|---|
| 线名 | 建康 | 设计稿 §7（标「支线」） |
| 所属势力 | `lyg.faction.jin_state`　晋国。**没有「建康」独立 faction id。** 北府武装：`liuchao.faction.x2a7011ff97`　北府兵 / `liuchao.faction.xa6417ad274`　北府军 | `canon.factions` |
| 覆盖关卡（22 关） | `lcq.stage_07`、`lcq.stage_08`、`lcq.stage_09` | 与 §7 一致 |
| 加入条件 | **无现成判据（需新增）。** `s08_10` objective＝「在玄武湖保护晋帝」是救驾，不是入朝或受封。无「加入晋廷／留镇建康」事件。 | events |
| 续写段作用 | 设计稿 §7 写「支线」。蓝图六国收束表晋＝龙宸／广源行台前，**不是**称帝或商贾的专属资源包。**推断**：建康线攒下的是晋地人脉与北府关系，续写段可并入商贾线或作独立支线收口，蓝图未单列「建康分岔」。 | 蓝图 §6／§10 |

---

## 3. 22 关里不属于任何二级线的关

| 关卡 | 定性 | 理由 |
|---|---|---|
| `lcq.stage_04` | 南荒过场／支线 | 事件全是向导、袭击、解毒、白夷付款。处在主轴 `stage_03b` 与 `stage_05` 之间，服务鬼王峒／碧姬线的路上段，本身不是公会事业。 |
| `lcq.stage_04b_lingfei_baiyi_crisis` | 南荒支线 | 灵飞镜与白夷危局。`岳帅旧闻` 只是打听，不够升格为星月湖线关。 |

其余 20 关都能归进至少一条二级线（见 §1）。

**不另开新线的说明（避免把过场升级成第八条公会）**：`stage_04`／`04b` 若将来要挂线，最近的是商队（与云苍峰同行的旅途帧）或血脉主轴的路上段——两者都已有主归属，本盘点不新建「南荒线」。

---

## 4. 加入条件总表（供运行时以后接线）

| 二级线 | 现成判据 | 字段 | 所在关（主轴/二级） | 22 关内是否够用 |
|---|---|---|---|---|
| 太乙掌教 | `flags.event.s01_04.done`（加入太乙真宗阵营）＋ `flags.event.s02_01.done`（获取锦囊） | events.completion | 主轴 `stage_01` / `stage_02` | 不够。拆锦囊／遗命兑现需新增 |
| 商队／云氏 | `flags.event.s03b_snake_flower_bridge_04.done`（与云苍峰商队同行） | events.completion | 主轴 `stage_03b` | 首次加入够用；洛都买官是加深 |
| 汉国朝堂 | `flags.event.s06_02.done`（拥立定陶王） | events.completion | 二级 `lyl.luoyang_coup` | 够用（本盘点采纳为加入开关） |
| 唐国长安 | 无 | — | — | 需新增（入住长安不能当入会） |
| 星月湖 | 无 | — | — | 需新增（对峙不能当入营） |
| 毒宗／黑魔海 | 无 | — | — | 需新增（且无「毒宗」faction id） |
| 建康 | 无 | — | — | 需新增；蓝图未给续写分岔 |

所有抽到的 `completion` 形态相同：`[{ "path": "flags.event.<id>.done", "operator": "eq", "value": true }]`。事件对象上的 `flags` 字段全为 `null`。

---

## 5. 与续写段（设计稿 §6 / 蓝图）的对照

```
原著 22 关里攒下的家底
   ├─ 太乙（种子在主轴，22 关几乎空）──→ 道门操盘（蓝图 §3）
   ├─ 商队／云氏 ──→ 商贾明线资源包（蓝图 §11）
   ├─ 汉国朝堂 ──→ 称帝线资源包（蓝图 §4／§11）
   ├─ 唐国长安 ──→ 第一幕驱魂局（蓝图 §2）
   ├─ 星月湖 ──→ 第二幕洗冤＋终战岳家军（蓝图 §3／§10）
   ├─ 毒宗／黑魔海 ──→ 第二幕天命侯（蓝图 §13-C）
   └─ 建康 ──→ 蓝图未单列分岔（§7 自标支线）
```

秦国卷末分岔只认两只资源包：国家机器（称帝）与商业网络（商贾）。七条二级线里 **只有汉国朝堂、商队** 直接对应这两只包；其余四条（太乙／唐／星月湖／毒宗）是续写幕次的事业，不是顶层分岔开关。建康不进分岔。

---

## 6. 核实 vs 推断

**已核实（字段在案）**

- 22 关名单与主轴 15 关互斥，来自 `STAGE_ORDER` − `MAIN_QUEST_STAGES`。
- 上表每条事件的 name／objective／completion path。
- 势力 id／name 来自 `canon.factions`；不存在「毒宗」「建康」这两个名字的 faction。
- `changgan_interlude` 的「锦囊」只出现在 `axisAnchor` 字符串。

**推断（不是字段）**

- 把 `jiangzhou_retreat` 并进星月湖，把 `taiquan_expedition` 并进商队（文件名含 taiquan，事件不是太泉）。
- 把 `s06_02` 拥立定陶王当作汉国朝堂「加入」开关。
- 建康线在续写段并入商贾或作独立支线收口。
- 「只打主轴会跳过这 22 关」是设计意图；当前 `STAGE_ORDER` 仍是无分叉单链，运行时还不能跳。
