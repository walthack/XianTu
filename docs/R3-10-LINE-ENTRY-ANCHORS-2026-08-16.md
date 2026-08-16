# R3-10 二级线入口地点锚（location id）· 2026-08-16

> 配套：`docs/R3-10-SECONDARY-LINES-2026-08-16.md`（八条线、完成度、§11 待补）；`src/modules/scenarioMods/mainQuestAxis.ts` 的 `MainQuestNode.locationId` 注释。
> **只产出本文。不改 `src/`、不改 JSON、不 commit。**
> 设计前提（用户裁定 2026-08-16）：二级线发展不能靠 LLM 自己发挥，必须是**确定性地点触发**，类似上古卷轴走到一个地方就接到派系任务。LLM 只安排非重要小支线／流言。

---

## 0. 口径

### 0.1 为什么锚地点、不锚关卡

`canonRail.DEFAULT_LINE_QUARANTINED_STAGE_IDS` 让默认路线**静默跳过** 8 关：

`lyl.taiquan_expedition`、`lcq.stage_03`、`lcq.stage_05`、`lcq.stage_06`、`lyg.ganlu_bian`、`lyg.shixiang_ambush`、`lyl.lin_an_black_sea`、`lyl.luoyang_coup`。

主轴已因此死过 3 条节点（锚在 `stage_03`／`05`／`06`），改地点锚后复活。二级线入口若锚在这 8 关上，同样会死。

链序以 `STAGE_ORDER`（37 关）为准。下文「第 N 关」＝该数组下标 + 1。

### 0.2 扫描范围（已核实）

| 用 | 不用 |
|---|---|
| `scenario.events` 的 `name`／`description`／`objective`／`axisBeat` | `relatedFactionIds`、`axisAnchor`、整包 JSON 关键词 |
| `scenario.worldSimulation` 全部字符串字段 | `canon.locations` 当「玩家到得了」 |
| `canon.locations[].id`／`name` 只核 id 是否真实存在 | 关卡 `manifest.description`（除非另标） |
| 官方附录分幅 OCR：`shared-atlas/ocr/*.vision.json`（`source-maps/` 五幅） | 把 `events.locationId` 单独当成事件层（只作抵达旁证） |

共享地图会把建康／洛都／长安等注入几乎每一关的 `canon.locations`。**注入 ≠ 可达。** 可达＝该地点 **name** 出现在未隔离关的事件层或 worldSimulation。

### 0.3 抵达 vs 点名

事件层出现地名，有时只是「以昭南人名义」「护送来洛都」，人并不在那儿。本文把两类分开标：

- **抵达**：该关有 `前往X`／`在X` 的 objective，或 `events.locationId` 指向该 id，且描述写人在现场。
- **点名**：事件层出现该 name，但人在别处。

入口必须能「走到」。只点名不当主入口。

### 0.4 置信度

| 档 | 含义 |
|---|---|
| **高** | id 在至少一个未隔离关的 `canon.locations` 里核实存在；name 在该关事件层出现；有抵达证据；与该线关系直接（山门／大营／都城／腹地入口／现成加入拍） |
| **中** | 地点真实且未隔离可达，但不是该线正营（路过对抗、兼用地盘），或抵达偏弱 |
| **低** | 不要当入口。只登记，不硬凑 |

低置信度条目**不写成主入口**。正营级找不到就写「无高置信入口，需新增」。

### 0.5 同名多 id（实现时必看）

同一中文名在不同关有多套 id。`MainQuestNode` 用 id 精确匹配，**选错套在抵达关匹配不上**。

| 中文名 | 建议入口用 | 别套（为何） |
|---|---|---|
| 熊耳铺 | `liuchao.location.xiongerpu`（atlas；`stage_03b` 在场） | `liuchao.location.xiong_er_pu` 只在 `stage_04`；该关 `s04_01.locationId` 写的是这套 |
| 临安 | `liuchao.location.linan`（atlas；未隔离关普遍在场） | `liuchao.location.lin_an` **只在隔离关** `lyl.lin_an_black_sea`；`linan_city` 只在隔离关 `taiquan_expedition` |
| 洛都 | `lyl.location.luoyang`（抵达关 `luoyang_cloud_secret` 在场且是 `s05_01`／`s05_09` 的 locationId） | `liuchao.location.luoyang` 是 atlas 孪生，**该抵达关不在场** |
| 龙池 | （死锚，勿用）`liuchao.location.longchi` | `lcq.location.longchi` 只在 `stage_01` 注入 |
| 长安 | `liuchao.location.changan` | `lyg.location.changan`（名「长安城」）在抽查的 live 关 **NOWHERE** |
| 星月湖大营 | **不要用** `liuchao.location.xingyue_lake` | 该 id 只在主轴 `lyg.mijing_rumen` 注入；江州段各关没有这个对象。用江州城 |

---

## 1. 总表

| 线 | 主入口 `locationId` | 名 | 最早抵达（默认线） | 置信 | 正营缺口 |
|---|---|---|---|---|---|
| 太乙真宗 | `lcq.location.grassland` | 草原 | 第 1 关 `lcq.stage_01` | **高**（加入拍） | 山门「龙池」死锚，需新增可达山门 |
| 星月湖 | `liuchao.location.jiangzhou` | 江州 | 第 13 关 `lcq.stage_10` | **高** | 无（江州描述即大营所在地） |
| 黑魔海／毒宗 | — | — | — | **无高置信总坛入口，需新增** | 蓝图总坛在昭南，事件层未落地 |
| 昭南 | `liuchao.location.xiongerpu` | 熊耳铺 | 第 4 关 `stage_03b` 起程，第 5 关 `stage_04` 落地 | **高**（腹地入口） | 都城麟趾／昭南城未抵达 |
| 晋国 | `liuchao.location.jiankang` | 建康 | 第 10 关 `stage_07`（本关后半） | **高** | 无 |
| 宋国 | `liuchao.location.jiangzhou`（江州段）＋ `liuchao.location.linan`（临安段） | 江州／临安 | 第 13 关／第 18 关 | **高**／**高** | 临安官场细点（吏部／威远／武穆王府）全在隔离关 |
| 汉国 | `lyl.location.luoyang` | 洛都 | 第 24 关 `luoyang_cloud_secret` | **高** | 拥立拍在隔离关 `luoyang_coup`，不挡地点入口 |
| 唐国 | `liuchao.location.changan` | 长安 | 第 30 关 `changgan_begins` | **高** | 灞桥对象在场但事件层零命中 |

**完全找不到可用入口的线：0。**  
**正营级（山门／总坛／都城）需新增：3 处**——太乙龙池、黑魔海昭南总坛、昭南麟趾城。

---

## 2. 太乙真宗（锦囊）

### 2.1 主入口（加入拍）

| 字段 | 内容 |
|---|---|
| `locationId` | `lcq.location.grassland` |
| 地点名 | 草原 |
| 为什么是这里 | 全库唯一 objective 写成「加入太乙真宗阵营」的事件 `lcq.event.s01_04` 的 `locationId` 就是这里。axisBeat：太乙四位教御现身、全歼兽蛮、收留程宗扬。worldSim「帅帐夜问起根」的前置也在本关。 |
| 可达性（未隔离） | **第 1 关** `lcq.stage_01`：事件四字段＋worldSimulation 均有「草原／帅帐」；`s01_04.locationId`＝本 id。id 在该关 `canon.locations` **核实存在**。 |
| 触发时机 | 链序第 1 关。默认线开局即可走。 |
| 置信度 | **高**（现成加入拍＋抵达）。语义上是战场接触，不是山门。 |

### 2.2 次入口（掌教帐／锦囊）

| 字段 | 内容 |
|---|---|
| `locationId` | `lcq.location.shuai_zhang` |
| 地点名 | 帅帐 |
| 为什么是这里 | 王哲帅帐。`s01_05` 描述「程宗扬在帅帐中向王哲坦白」；`s02_01` locationId＝本 id，objective＝「前往王哲处，获取锦囊并接受托付」。主轴节点原文也写「走到太乙真宗帅帐见着王哲」。 |
| 可达性 | 事件层「帅帐」：**第 1–2 关** `stage_01`／`stage_02`（均未隔离）。**id 只在 `stage_02` 的 `canon.locations` 里**——第 1 关事件层写得出「帅帐」，但本关地点表没有这个对象。按 id 精确匹配时，第 1 关匹配不上。 |
| 触发时机 | 稳妥按第 2 关。 |
| 置信度 | **高**（领锦囊／见掌教）。不是山门。 |

### 2.3 筛掉／需新增

| 候选 | 结果 | 依据 |
|---|---|---|
| `liuchao.location.longchi`／`lcq.location.longchi` **龙池**（atlas 描述＝太乙总部／山门／总坛） | **死锚** | 事件层「龙池」**只在隔离关** `lcq.stage_03`（`s03_10` axisBeat「指名要程宗扬去龙池」）。默认线跳过本关，入口永不触发。官方五幅 OCR **无「龙池」标签**（atlas 是正文补点，不是图上明示）。 |
| `lcq.location.taiyi_temple` **太乙真宗道观** | **事件层零命中** | id 只在 `stage_02` 注入；name 从未进入事件四字段或 worldSim。 |

**结论：** 加入／领锦囊有高置信落点。山门级入口 **无高置信，需新增**（把龙池放进某条未隔离关的事件层，或另造可达山门）。不得把入口锚在 `stage_03`。

---

## 3. 星月湖（含八骏）

### 3.1 主入口

| 字段 | 内容 |
|---|---|
| `locationId` | `liuchao.location.jiangzhou` |
| 地点名 | 江州 |
| 为什么是这里 | atlas／关卡描述原文：「**星月湖大营所在地**，宋国边境重要城市」。二级线盘点：江州段是星月湖主战场（`stage_10`／`11`／`12`、`jiangzhou_retreat`）。`s10_01` objective＝「前往江州城，探查贾师宪的军令部署」；`s11_04` 在江州战线「对峙星月湖军」；`s12_*` 守江州城。 |
| 可达性（未隔离） | 事件层「江州」：第 12 `stage_09`（点名「江州危急」，人还在建康／晴州交接）、**第 13–16** `stage_10`／`11`／`12`／`jiangzhou_retreat`（抵达），以及更后的 `xiaoyingzhou`、`changgan_begins`（点名）。隔离关 `lin_an_black_sea`／`taiquan_expedition` 也有点名，可忽略。id 在共享 atlas 与上述 live 关均 **核实存在**。 |
| 触发时机 | **第 13 关** `lcq.stage_10` 最早抵达。第 12 关只点名。 |
| 置信度 | **高**。 |

官方地图：`liuchao-world` OCR 有「江州」；`song-taiquan`／`jin-nanzhao`／`tang` 作「江江州」（OCR 粘连）。分幅把江州放在宋境／晋宋交界，与 `region`＝宋国、描述「宋国边境」一致。

### 3.2 次入口

| 候选 | 主次 | 说明 |
|---|---|---|
| `liuchao.location.jinmingzhai`／`jinming_zhai` 金明寨 | 次（宋军大营，不是星月湖营） | 描述＝江州城东南十五里宋军垒。事件层未隔离命中只有 `jiangzhou_retreat` `s01_01`（宋军大溃）。可作江州段边营，**不要当星月湖入营点**。 |
| 「星月湖大营」字面 | 勿单独锚 id | 事件层第 15／30／34 关出现「星月湖大营」字样；对象 `liuchao.location.xingyue_lake` **只在** `lyg.mijing_rumen` 注入，江州各关地点表没有它。用江州城。 |

### 3.3 筛掉

无「只在隔离关出现」的星月湖正营候选。`lin_an_black_sea` 的拜祭／武穆王府是轻喂且整关隔离，不当入口。

---

## 4. 黑魔海／毒宗系

### 4.1 主入口

**无高置信总坛入口，需新增。**

蓝图 §6 核实：昭南一行底牌写「**黑魔海总坛**、鬼王峒／南荒……」。事件层「昭南」从未写成总坛／大祭现场（见 §5.3）。全 37 关 **没有** 名为「黑魔海总坛」的 location id。「毒宗」字面 **只在隔离关** `lcq.stage_05`。`lyl.location.anmo_ju` 暗魔居（洛都据点）、`lyl.location.moxu_building` 魔墟大楼：事件层 name **零命中**。

不能拿「模型觉得该给你夺名分了」代替地点。这条线目前缺一个走得到的总坛／受名分处。

### 4.2 可用对抗落点（中，不是正营）

这些能「走到并碰上黑魔海」，可当临时钩子，**不能冒充总坛入口**。

| 主次 | `locationId` | 名 | 关系 | 未隔离可达 | 最早 | 置信 |
|---|---|---|---|---|---|---|
| 对抗主 | `liuchao.location.qingzhou` | 晴州 | `stage_10` 夜探破道观，「确认黑魔海势力介入晴州」；随后 `s10_07`／`s10_08` 先发制人、洞穴对战。atlas 描述另写泊陵鱼氏与黑魔海曾在此联手。晴州本身是星月湖／商路据点，兼用地盘。 | 第 12–14 关事件层「晴州」；第 13 关抵达暗线 | 第 13 关 | **中** |
| 高潮 | `lyl.location.ant_hill` | 蚁丘迷窟 | 盘点定的公会主覆盖关 `taiquan_core_conflict`：`find_exit`／`yu_baiying_truce` 的 locationId；objective「在蚁穴中寻找出口」「前往魔墟救出虞白樱」。未隔离。 | **仅第 22 关** | 第 22 关 | **中**（地点对、太晚、是高潮不是入口） |
| 兼用 | `liuchao.location.jiankang` | 建康 | `stage_08` 苏妲己入局「黑魔海高压对局正式展开」、宫中忍者取黑魔海信件、潘金莲招牌登场。是晋国都城，双喂。 | 第 10–12 关 | 第 11 关 | **中**（对抗开场，不是总坛） |

`s10_08` objective「在星月湖洞穴对抗黑魔海袭击」——洞穴 **没有** 独立 location id，不能锚。

### 4.3 筛掉

| 候选 | 结果 |
|---|---|
| 广阳 `liuchao.location.guangyang` | `s09_07` 只是潜伏后「得知黑魔海在广阳的布局」，随即「脱身返回建康」。**点名，未抵达。** 分幅：`jin-nanzhao` 与 `han-qin` 均有「廣陽」（晋－汉边境，先例归晋）。不当入口。 |
| `liuchao.location.nanzhao` 当总坛 | 事件层「昭南」只在第 16 关「以昭南人名义」粮贸、第 32 关昭南卿士索赔。人在江州／长安。 |
| 毒宗／`stage_05` | 隔离关。死锚。 |
| `shixiang_ambush` 诱捕潘金莲、`ganlu_bian` 飞鸟供认 | 两关都在隔离名单。死锚。 |
| `lin_an_black_sea` 的威远／游婵 | 隔离关。死锚。 |

---

## 5. 昭南（国家／地区；开放线）

南荒是昭南的蛮荒腹地（盘点 §3.1：大陆 bounds ＋ atlas `region`／`continentId`，不是推断）。本线已有关是腹地部族局，不是麟趾朝廷。

### 5.1 主入口（腹地）

| 字段 | 内容 |
|---|---|
| `locationId` | `liuchao.location.xiongerpu` |
| 地点名 | 熊耳铺 |
| 为什么是这里 | atlas 描述：「**南荒入口处的村寨**，程宗扬在此选向导。」`stage_03b` `s03b_07` objective＝「前往熊耳铺，探查贡物详情」（贡物／龙神新娘送往此处）。`stage_04` `s04_01` 在熊耳铺选朱八八为向导——昭南腹地事业从这里进场。 |
| 可达性（未隔离） | 事件层「熊耳铺」：第 4 关 `stage_03b`、第 5 关 `stage_04`。id `xiongerpu` 在 `stage_03b` 地点表 **核实存在**（atlas 亦有）。第 5 关事件 `locationId` 写的是孪生 id `liuchao.location.xiong_er_pu`（只在该关地点表），**同名同地、另一套键**。 |
| 触发时机 | 第 4 关起程（objective 已是「前往」）；人落地按第 5 关。 |
| 置信度 | **高**（腹地入口）。不是都城。 |

官方地图：`liuchao-world`／`jin-nanzhao`／`tang` OCR 均有「熊耳鋪」。与「昭南」同在晋－昭南／南荒分幅，不在汉秦分幅当汉土。

### 5.2 次入口

| 主次 | `locationId` | 名 | 说明 | 置信 |
|---|---|---|---|---|
| 次 | `liuchao.location.baiyi` | 白夷族 | `s03b_04`「与云苍峰商队同行，前往白夷族」；`s04_07` locationId＝本 id，「商队到达白夷族」。`stage_04b` 夺镜／族长被换。未隔离第 4–6 关。是部族交涉点，不是入朝。 | **高**（抵达）／线义上是腹地第二站 |
| 兼用 | `liuchao.location.guiwangdong` | 鬼王峒 | 盘点：并入昭南地缘、不做公会。未隔离第 4／5／6／8／37 关事件层。主轴也锚这里。双喂血脉主轴。 | **高**可达，**中**作昭南「入线」（峒不是朝廷） |

### 5.3 都城：无高置信入口，需新增

| 候选 | 结果 |
|---|---|
| `liuchao.location.nanzhao` 昭南 | atlas 描述＝南方国度、**都城麟趾城**。事件层「昭南」只在第 16、32 关当「昭南人／卿士」，**玩家从未抵达**。 |
| 麟趾 | 全库事件层 **零命中**。无 location id。蓝图「昭南麟趾」挂凝羽回归，22 关未落地。 |
| `liuchao.location.diqiu` 帝丘、`kunwu` 昆吾 | atlas `region`＝昭南。事件层 **零命中**。 |
| `lcq.location.nanhuang_camp` 花苗营地 | 事件层／locationId **只在隔离关** `stage_05`。死锚。 |

OCR：`jin-nanzhao`／`tang`／`liuchao-world`／`song-taiquan` 均有「昭南」城号，图上有点、事件层走不到。

---

## 6. 晋国（建康段）

### 6.1 主入口

| 字段 | 内容 |
|---|---|
| `locationId` | `liuchao.location.jiankang` |
| 地点名 | 建康 |
| 为什么是这里 | atlas `region`＝晋国，描述＝「**晋国都城**」。盘点：`07`–`09` 事件层是晋帝／北府／昭明宫／玄武湖／晋国世家，三关零命中「宋」。`s07_07` 神龙殿夜探晋帝；`s08_10`「在玄武湖保护晋帝」；`s09_01`「在建康与萧遥逸会面」。 |
| 可达性（未隔离） | 事件层「建康」：第 10–12 关主覆盖，其后 `lin_an_bridge`、`han_succession` 点名。三关事件均无 `locationId` 字段，靠四字段＋worldSim 的「建康／晋帝／北府」。id 在 atlas 与这些关 **核实存在**。 |
| 触发时机 | 第 10 关后半（本关开场在清远，随后入建康）。 |
| 置信度 | **高**。 |

官方地图：`jin-nanzhao`、`liuchao-world` OCR「建康」。用户裁定（2026-08-16）建康按地图从宋国拆出——分幅与事件层一致。

### 6.2 次入口

| 主次 | `locationId` | 名 | 说明 | 置信 |
|---|---|---|---|---|
| 次（边镇／入晋第一城） | `liuchao.location.qingyuan_jin` | 清远 | atlas：「晋国北境城邑」。`s07_02` objective＝「在清远斩杀吴行德救卓云君」。只第 10 关。 | **高** |
| 勿用 id | 神龙殿／昭明宫／玄武湖／鹰愁峪 | — | 事件层有这些字，**全库无对应 location id**。不能锚。 | — |
| 勿用 | `liuchao.location.jiankang_yuji_xiang` 建康玉鸡巷 | 玉鸡巷 | 多关注入；事件层 name **零命中**。 | 低 |
| 勿用 | `liuchao.location.ningzhou` 宁州 | 宁州 | 事件层零命中。盘点已写 22 关无专属关。 | 低 |

---

## 7. 宋国（江州段 ＋ 临安段）

一条国家线、两个阶段，两个入口。都要标。

### 7.1 主入口 · 江州段

与星月湖 **同一地点** `liuchao.location.jiangzhou`。正交：公会管番号／入营，国家线管宋军攻清岳党、粮战、围城（盘点 §0.1）。同一关双喂，不算打架。

| 字段 | 内容 |
|---|---|
| `locationId` | `liuchao.location.jiangzhou` |
| 地点名 | 江州 |
| 为什么是这里 | `s10_01` 贾师宪下令攻江州；`s11_02`／`s11_08` 水泥坚城／戒严；`s12_11` 全面攻城；`jiangzhou_retreat` `s01_01`／`s01_02` locationId＝金明寨／江州，宋军大溃后离江州。`jiangzhou_retreat` 的 `location.region`＝宋国（盘点旁证）。 |
| 可达性 | 同 §3.1。未隔离。 |
| 触发时机 | 第 13 关。 |
| 置信度 | **高**。 |

### 7.2 次入口 · 临安段（都城）

| 字段 | 内容 |
|---|---|
| `locationId` | `liuchao.location.linan` |
| 地点名 | 临安 |
| 为什么是这里 | atlas：`region`＝宋国，「**宋国都城**」。盘点临安段＝官场＋镖局＋商路。默认线跳过 `lin_an_black_sea` 之后，主轴关 `lyl.lin_an_bridge` 仍在临安：opening「江州之后，临安的市井情报……」；事件「临安权贵与市井线交汇」；worldSim「临安巷口的茶摊」。 |
| 可达性（未隔离） | 事件层「临安」：第 15 `stage_12`（粮战令，**尚未抵达**）、第 16 `jiangzhou_retreat` `s01_02`「乘船前往临安」（在途）、**第 18** `lin_an_bridge`（立足）、第 20–21 点名。隔离关 17／19 也有，其中 17 才是「抵达落脚／客卿报到」正文。 |
| 触发时机 | 默认线 **第 18 关** `lyl.lin_an_bridge` 最早走得到。第 15–16 关是预告／登船。 |
| 置信度 | **高**（都城可达）。官场细点不够，见下。 |

官方地图：`song-taiquan` OCR「臨安」。

### 7.3 筛掉（临安细点全在隔离关）

| 候选 | 结果 |
|---|---|
| `liuchao.location.lin_an` | **只在** `lyl.lin_an_black_sea`。死 id。 |
| `liuchao.location.linan_city` 临安城 | **只在** `lyl.taiquan_expedition`（该关 5 条事件 locationId 全是它）。死 id。 |
| 武穆王府、吏部、威远、`mingqing_temple` 当临安官场入口 | 「武穆王府／吏部／威远」事件层 **只在隔离关 17／19**。明庆寺在第 18／20 关仍有（拜访鲁智深），是寺不是官场入口。 |
| `factory_registration` 客卿报到 | 盘点采纳的卷入判据，落在 **隔离关** `lin_an_black_sea`。默认线进得了临安城，**踩不到这条判据**。地点锚用 `linan` 仍然活；卷入开关是另一件事。 |

---

## 8. 汉国

### 8.1 主入口

| 字段 | 内容 |
|---|---|
| `locationId` | `lyl.location.luoyang` |
| 地点名 | 洛都 |
| 为什么是这里 | atlas 孪生 `liuchao.location.luoyang` 描述＝「**汉国都城**」。抵达关用的是本书前缀这套 id：`luoyang_cloud_secret` `s05_01`／`s05_09` locationId＝`lyl.location.luoyang`（买官铜矿、云氏金铢）。随后吕氏围杀、送赵合德入宫，都是同一套汉廷机器。 |
| 可达性（未隔离） | 事件层「洛都」：第 18 关点名（赵合德「护送来洛都」，人在临安）、第 23 关点名、**第 24 关抵达**、第 26–28 关。隔离关 `luoyang_coup` 也有，可忽略。**抵达关地点表里是 `lyl.location.luoyang`，没有 atlas 那套 `liuchao.location.luoyang`。** |
| 触发时机 | 第 24 关。 |
| 置信度 | **高**。 |

官方地图：`han-qin` OCR「洛陽」（正文／atlas 作洛都）。

### 8.2 次入口

| 主次 | `locationId` | 名 | 说明 | 置信 |
|---|---|---|---|---|
| 次（宫廷机关） | `liuchao.location.changqiu_palace` | 长秋宫 | 盘点：长秋宫并入汉国线。未隔离事件层：第 18（点名）、**第 27** `dingtao_beijing`（`s01_02`／`s01_04` locationId）、第 28–29 关。拥立正文 `s06_02` 的 locationId 在隔离关 `luoyang_coup`（`lyl.location.changqiu_palace`）。 | **高**可达宫廷；**中**作「入线」——拥立拍被隔离，地点仍走得到 |
| 兼用 | `liuchao.location.wudu` 舞都 | 舞都 | `s05_09` 云氏从舞都运金铢往洛都。atlas 写舞阳侯封邑。不是都城入口。 | 中 |

### 8.3 筛掉

| 候选 | 结果 |
|---|---|
| 把入口锚在 `lyl.luoyang_coup` | 隔离关。拥立判据还在，**地点入口不要挂这关**。改挂第 24 关洛都。 |
| `lyl.location.pengyi_she` 鹏翼社 | 事件层未隔离命中在第 13 关（过早点名）；locationId 在隔离关 coup。不当汉廷入口。 |
| `lyl.location.yulin_camp` 羽林大营 | 事件层零命中。 |

---

## 9. 唐国

### 9.1 主入口

| 字段 | 内容 |
|---|---|
| `locationId` | `liuchao.location.changan` |
| 地点名 | 长安 |
| 为什么是这里 | atlas：`region`＝唐国，「**唐国都城**」。`changgan_begins` `s03_01` locationId＝本 id，name＝「入住长安宣平坊宅院」，objective＝「前往宣平坊宅院赴宴」，描述「众人赶在宵禁前进入长安」。同关 `s03_03`–`s03_05` locationId 仍是长安。 |
| 可达性（未隔离） | 事件层「长安」：第 29 关点名、**第 30** 抵达、第 32／36／37 关。id 在 atlas 与 `changgan_begins` **核实存在**。 |
| 触发时机 | 第 30 关。 |
| 置信度 | **高**。 |

官方地图：`tang` OCR「長安雲」（粘连）；`liuchao-world` 同行。分幅是唐国专幅，不是晋／宋误挂。

### 9.2 次入口

| 主次 | `locationId` | 名 | 说明 | 置信 |
|---|---|---|---|---|
| 次（进城后的宅） | （勿用 `lyg.location.xuanping_fang` 当唯一键） | 宣平坊 | 事件层「宣平坊」在 **第 30 关**（未隔离）。对象名是「宣平坊程宅」，id 的 `locationId` 使用集中在隔离关 `shixiang_ambush`。实现若按 id 匹配，第 30 关应用都城 `changan`，或同时认 name「宣平坊」。 | 文本 **高**；id **中**（别名／隔离关绑定） |
| 次（稍后宫廷） | `lyg.location.daming_palace` 大明宫 | 大明宫 | 未隔离第 35–37 关事件层。locationId 使用多在隔离关 31／33。偏甘露变，不是进城入口。 | 中 |
| 兼用 | `lyg.location.daciensi` 大慈恩寺 | 大慈恩寺 | 第 30 关 `s03_09` locationId；十方丛林围大雁塔。唐国敌对佛门落点，不是入仕处。 | 中 |

### 9.3 筛掉

| 候选 | 结果 |
|---|---|
| `lyg.location.chanqiao` **灞桥** | 对象在 `changgan_begins` 地点表里，**事件层「灞桥」全 37 关零命中**（连 worldSim 也无）。关卡展示名「灞桥」不是事件层。**死锚（只注入不到达）**。 |
| 鸿胪寺／元正朝会 | 事件层 **只在隔离关** `shixiang_ambush`。盘点里最接近的弱钩子 `shixiang_s11` 正好死在这关。 |
| 把入口锚在 `shixiang_ambush`／`ganlu_bian` | 隔离关。 |

---

## 10. 被隔离关筛掉的候选（汇总）

只列「本来像入口、因只在隔离关出现而作废」的。

| 线 | 候选 | 只出现在 | 改用 |
|---|---|---|---|
| 太乙 | 龙池（山门／总部） | `lcq.stage_03` | 草原／帅帐；山门需新增 |
| 太乙 | 「去龙池」追问遗命 | 同上 | 同上 |
| 黑魔海 | 「毒宗」字面 | `lcq.stage_05` | 无总坛；对抗用晴州／蚁丘 |
| 黑魔海 | 诱捕潘金莲、飞鸟供认雇佣 | `shixiang_ambush`、`ganlu_bian` | 同上 |
| 黑魔海／宋 | 威远镖局、游婵、客卿报到正文 | `lin_an_black_sea`、`taiquan_expedition` | 临安城改挂 `linan`＋`lin_an_bridge` |
| 宋 | `lin_an`、`linan_city` 两套临安 id | 17／19 两关 | `liuchao.location.linan` |
| 宋 | 武穆王府、吏部 | `lin_an_black_sea` | 都城仍可达；官场细点需新增到未隔离关 |
| 昭南 | 花苗营地 | `lcq.stage_05` | 熊耳铺／白夷 |
| 汉 | 拥立／长秋宫 locationId | `luoyang_coup` | 洛都改挂 `luoyang_cloud_secret`；长秋宫改挂 `dingtao_beijing` 的 `liuchao.location.changqiu_palace` |
| 唐 | 宣平坊程宅的 locationId 使用、鸿胪寺、大明宫 locationId | `shixiang_ambush`／`ganlu_bian` | 长安都城；宣平坊用第 30 关文本 |

另：灞桥、太乙道观、暗魔居、魔墟大楼、帝丘、昆吾、麟趾、宁州、玉鸡巷——不是被隔离筛掉，是事件层根本走不到或没有 id。

---

## 11. 核实 vs 推断

**已核实（字段／OCR／名单）**

- 8 个隔离关 id 与 `canonRail.ts` 一致；`STAGE_ORDER` 37 关文件齐全。
- 上表每个 `locationId` 都在至少一个指定关的 `canon.locations` 里对过（§0.5 写明哪套键在哪关）。
- 事件层命中按 §0.2 重跑：四字段＋`worldSimulation`，不含 `canon.locations` 注入、不含 `relatedFactionIds`。
- `s01_04`／`s02_01`／`s03b_07`／`s04_01`／`s04_07`／`s10_01`／`s05_01`／`s03_01` 的 objective 与 `locationId`。
- 官方分幅 OCR：建康、江州／江江州、臨安、洛陽、長安、昭南、熊耳鋪、廣陽。五幅均无「龙池」。
- `xingyue_lake` 只在 `mijing_rumen`；`lin_an` 只在 `lin_an_black_sea`；`linan_city` 只在 `taiquan_expedition`。

**推断（不是字段）**

- 把草原／帅帐当成太乙「可触发加入」的地点入口（加入拍已在，地点只是锚）。
- 把江州当成星月湖入营点（描述写大营所在地；事件层仍无「加入／入营」objective——盘点 §2.2 待补仍在）。
- 把熊耳铺当成昭南线入口（腹地入口；入朝／入族判据仍无）。
- 黑魔海「需新增总坛地点」：蓝图写总坛在昭南，事件层未落地——缺口判断。
- 默认线跳过 `lin_an_black_sea` 后，玩家仍在第 18 关身处临安：依据是该关事件层／worldSim 写临安现场，不是 `events.locationId`。

---

## 12. 给实现的短清单

入口运行时应对齐主轴：`currentLocationId === locationId`（或当前关事件层已把玩家放在该 name 上），**不要** `currentStageId === 某二级关`。

| 线 | 写入节点时用的 id |
|---|---|
| 太乙 | `lcq.location.grassland`（可并行 `lcq.location.shuai_zhang`） |
| 星月湖 | `liuchao.location.jiangzhou` |
| 黑魔海 | **先不要写死**。总坛未建。若必须先挂对抗钩子：`liuchao.location.qingzhou`（中） |
| 昭南 | `liuchao.location.xiongerpu`（`stage_04` 须同时认 `xiong_er_pu`） |
| 晋国 | `liuchao.location.jiankang`（可并行 `qingyuan_jin`） |
| 宋国 | 江州 `jiangzhou` ＋ 临安 `linan`（禁止 `lin_an`／`linan_city`） |
| 汉国 | `lyl.location.luoyang`（禁止只写 atlas 的 `liuchao.location.luoyang`） |
| 唐国 | `liuchao.location.changan`（禁止灞桥） |

本表不解决盘点 §11 的加入／卷入判据。地点锚只保证「走到能接到」，「接了算入哪条线」仍是另一张表。
