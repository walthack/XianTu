# R3-10 角色登场／加入条件盘点（2026-08-16）

> 配套：`src/modules/scenarioMods/mainQuestAxis.ts`（`STAGE_ORDER` / `MAIN_QUEST_STAGES`）、`src/modules/scenarioMods/characterResolver.ts`（`phaseProfileValue(..., 'joining')` → `【入伙】`）、`src/modules/scenarioMods/stanceProfiles.ts`、`src/modules/scenarioMods/builtins/character-registry.json`。
> 关卡数据：`mod-kit/generated/deepseek-v4-flash/{qingyu,yunlong,yange}/stages/<stageId>.json`。
> 扫描纪律：登场事件只读 `scenario.events` 的 `relatedCharacterIds`、`name`、`objective`（必要时对照 `description`）。不扫整包 JSON。

---

## 0. 口径

### 0.1 `joining` 怎么进游戏

`characterResolver.ts`：`phaseProfileValue(profile, currentPhase, 'joining')` 写入人物 notes 的 `【入伙】`。

- 本关 `phaseIdentities` 里若 **自带** `joining` 键，用阶段值；否则回落 `staticProfile.joining`。
- 实测：registry 315 人全部有 `staticProfile.joining` 数组；**非空 47、空 268**。`phaseIdentities[].joining` **0 条**——运行时看到的入伙文案＝静态字段，不随关卡切换。

### 0.2 「可获得」盘点范围（87 人）

运行时没有独立的「入队 flag」。本表取并集，避免只扫 `joining` 时漏掉小紫／月霜／秦桧：

1. registry `staticProfile.joining` 非空（47，含 8 条「非队伍」否定句）
2. `stanceProfiles.ts` 的 `names[]`（49 组）
3. 事件名含「招牌登场／初登场」且 `relatedCharacterIds` 点到的人

主角程宗扬不入表。

**未进并集的主轴承重例外**：`小玲儿`（`liuchao.character.xiao_ling_er`）joining 空、无 stance、无招牌事件，单列 §4。

### 0.3 列定义

| 列 | 取值规则 |
|---|---|
| 首次登场关卡 | `STAGE_ORDER` 上，该角色 **首次** 出现在某事件 `relatedCharacterIds` 的关；若从未进 related，再看事件 `name`/`objective` 是否含正名或别名。角色表 `canon.characters` 更早出现只作脚注，不当作首次登场——`stage_03b` 等关注入了大批尚未出场的人。 |
| 登场事件 | 上款对应的那条事件。另有更晚的「招牌登场」会附注。 |
| 加入条件 | registry `joining` 原文；空数组写 **缺**。 |
| 加入所在关 | **仅当** 事件 `name`/`objective` 写明该人入伙／归入麾下／加入队伍，且 related 含该人。静态 joining 没有对应事件时写「无事件级判据」。否定句写「数据写明不加入」。 |
| stanceProfile | `stanceProfiles.ts` 的 `names` 是否命中正名或别名。 |

排序：首次登场关卡的 `STAGE_ORDER` 下标；无事件点名的排在同批角色表最早关之后、最后是角色表与事件皆缺。

---

## 1. 总表（87）

| 角色 | 首次登场关卡 | 登场事件 | 加入条件（joining 原文） | 加入所在关 | 是否有 stanceProfile |
|---|---|---|---|---|---|
| 卓云君 | `lcq.stage_01`（主轴） | `lcq.event.s01_04` 太乙真宗介入 〔relatedCharacterIds〕；另有招牌 `lyl.jiangzhou_retreat` `lyl.event.debut_zhuoyunjun` | 缺 | 缺（`s01_04` 是加入太乙阵营，不是卓云君入队） | 是 |
| 月霜 | `lcq.stage_01`（主轴） | `lcq.event.s01_03` 程宗扬与月霜初遇 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 凝羽 | `lcq.stage_02`（主轴） | `lcq.event.s02_06` 程宗扬见苏妲己 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 苏妲己 | `lcq.stage_02`（主轴） | `lcq.event.s02_06` 程宗扬见苏妲己 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 黛姬雪娜 | 缺事件点名；角色表最早 `lcq.stage_02` | 缺 | 非程宗扬队伍或后宫成员 | 数据写明不加入 | 否 |
| 云苍峰 | `lcq.stage_03`（主轴） | `lcq.event.s03_11` 雨林恶兆与黑石滩渡河 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 武二郎 | `lcq.stage_03`（主轴） | `lcq.event.s03_06` 武二郎被迫加入南荒队伍 〔relatedCharacterIds〕 | 因共同利益、义气与“钱景”结伴同行，并非苏妲己指派雇佣。 | `lcq.stage_03` `lcq.event.s03_06`（objective＝取得他随队南行的明确承诺；`flags.event.s03_06.done`） | 是 |
| 祁远 | `lcq.stage_03`（主轴） | `lcq.event.s03_05` 苏妲己以冰蛊逼迫南行 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 谢艺 | `lcq.stage_03`（主轴） | `lcq.event.s03_12` 抵达寂静的蛇彝村 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 阿姬曼·芭娜 | `lcq.stage_03`（主轴） | `lcq.event.s03_04` 赎买并释放阿姬曼 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 吴战威 | 缺事件点名；角色表最早 `lcq.stage_03b_snake_flower_bridge` | 缺 | 云氏商会护卫之一，程宗扬在南荒起事时收纳的旧部，为程家初期骨干。 | 无事件级判据（joining 为静态文案） | 否 |
| 张少煌 | 缺事件点名；角色表最早 `lcq.stage_03b_snake_flower_bridge` | 缺 | 第281章，股份扩充时作为建康世家势力加入程宗扬的商业集团 | 无事件级判据（joining 为静态文案） | 否 |
| 梦娘 | 缺事件点名；角色表最早 `lcq.stage_03b_snake_flower_bridge` | 缺 | 被程宗扬从黑魔海解救，免于沦为奴妓淫玩终生（记忆已被抹去，未恢复）。 | 无事件级判据（joining 为静态文案） | 否 |
| 申婉盈 | 缺事件点名；角色表最早 `lcq.stage_03b_snake_flower_bridge` | 缺 | 第255章，因程宗扬以师傅性命相胁，被迫献身，后成为师徒共侍之一员；第2章受卓云君设计失身于程宗扬，后成为其情人及得力助手 | 无事件级判据（joining 为静态文案） | 否 |
| 雁儿 | 缺事件点名；角色表最早 `lcq.stage_03b_snake_flower_bridge` | 缺 | 第3章丹庭：用一斛珍珠从石超手中换来的俏婢 | 无事件级判据（joining 为静态文案） | 否 |
| 乐明珠 | `lcq.stage_04`（二级） | `lcq.event.s04_03` 乐明珠身份揭露 〔relatedCharacterIds〕；另有招牌 `lcq.stage_05b` `lcq.event.debut_lemingzhu` | 非明确加入队伍，已为程宗扬性伴侣 | 无事件级判据（joining 为静态文案） | 是 |
| 殇侯 | `lcq.stage_04`（二级） | `lcq.event.s04_01` 向导朱八八与鬼王峒计划 〔relatedCharacterIds〕 | 非程宗扬队伍成员或后宫，故留空。；第44章，在熊耳铺被云式商会找来做向导 | 数据写明不加入（后半句只是向导） | 是 |
| 苏荔 | `lcq.stage_04`（二级） | `lcq.event.s04_01` 向导朱八八与鬼王峒计划 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 丹宸 | `lcq.stage_05`（主轴） | `lcq.event.s05_15` 确认红苗受控并护住苏荔 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 小紫 | `lcq.stage_05`（主轴） | `lcq.event.s05_06` 查出鬼王峒眼线 〔relatedCharacterIds〕；本关另有 `lcq.event.debut_xiaozi`「小紫以碧鲮少女身份现身」 | 缺 | 缺 | 是 |
| 易彪 | `lcq.stage_05`（主轴） | `lcq.event.s05_16` 斩杀蛇傀解救碧鲮族 〔relatedCharacterIds〕 | 作为北府兵军官加入商队，后成为主角下属之一 | 无事件级判据（joining 为静态文案） | 否 |
| 碧姬 | `lcq.stage_05`（主轴） | `lcq.event.s05_06` 查出鬼王峒眼线 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 阿夕 | `lcq.stage_05`（主轴） | `lcq.event.s05_07` 失踪搜寻与鬼王峒使者抵达 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 鬼巫王 | `lcq.stage_05b`（主轴） | `lcq.event.s05b_05a_meet_ghost_king` 初见鬼巫王 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 吴三桂 | `lcq.stage_07_qingyuan_jiankang`（二级） | `lcq.event.s07_qinhui_join` 秦桧归入麾下 〔relatedCharacterIds〕 | 第124章（授艺）：受殇侯指派，与秦桧一同归程宗扬指使，成为程宗扬的随行人员 | `lcq.stage_07` `lcq.event.s07_qinhui_join`（description 写殇侯把秦桧、吴三桂交给程差遣；`flags.event.s07_qinhui_join.done`） | 否 |
| 孟非卿 | `lcq.stage_07_qingyuan_jiankang`（二级） | `lcq.event.s07_05_eight_steeds_informed` 八骏得讯 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 秦桧 | `lcq.stage_07_qingyuan_jiankang`（二级） | `lcq.event.s07_debut_qinhui` 秦桧初登场 〔relatedCharacterIds〕 | 缺 | `lcq.stage_07` `lcq.event.s07_qinhui_join`（objective＝确认秦桧归入麾下后的职责与约束；`flags.event.s07_qinhui_join.done`） | 是 |
| 潘金莲 | `lcq.stage_08_jiankang_coup`（二级） | `lcq.event.debut_panjinlian` 潘金莲·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 萧遥逸 | `lcq.stage_08_jiankang_coup`（二级） | `lcq.event.s08_debut_xiaoyaoyi` 萧遥逸接骨灰 〔relatedCharacterIds〕 | 无需加入，已是程宗扬的同伴 | 无事件级判据（joining 为静态文案） | 否 |
| 相雅 | `lyl.jiangzhou_retreat`（二级） | `lyl.event.s01_03` 荆溪村寨被屠 〔relatedCharacterIds〕 | 第2章被程宗扬从军汉手中救下；第3章为报仇和部族生存而带领族人投靠；第4章单膝跪地效忠。 | 无事件级判据（joining 为静态文案） | 是 |
| 金兀术 | `lyl.jiangzhou_retreat`（二级） | `lyl.event.s01_03` 荆溪村寨被屠 〔relatedCharacterIds〕 | 金兀术加入盘江程氏之前就是兽蛮营的首领，后整个兽蛮营加入程宗扬麾下。 | 无事件级判据（joining 为静态文案） | 否 |
| 青面兽 | `lyl.jiangzhou_retreat`（二级） | `lyl.event.s01_03` 荆溪村寨被屠 〔relatedCharacterIds〕 | 因想吃羊肉而跟随程宗扬，成为其队伍成员。 | 无事件级判据（joining 为静态文案） | 否 |
| 冯源 | `lyl.lin_an_black_sea`（二级） | `lyl.event.debut_ruan_sisters` 抵达临安，拜祭谢艺 〔relatedCharacterIds〕 | 第242章提及从瓠山到晴州一路上的交情，几千银铢的上等货拿来送人，可见早前已加入程宗扬的队伍/后宫。非后宫。 | 无事件级判据（joining 为静态文案） | 否 |
| 李师师 | `lyl.lin_an_black_sea`（二级） | `liuchao.event.wei_yuan_first_contact` 尾随李师师至威远镖局 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 林清浦 | `lyl.lin_an_black_sea`（二级） | `lyl.event.debut_ruan_sisters` 抵达临安，拜祭谢艺 〔relatedCharacterIds〕 | 第4章左右正式成为程宗扬情报负责人 | 无事件级判据（joining 为静态文案） | 否 |
| 阮香凝 | `lyl.lin_an_black_sea`（二级） | `lyl.event.ruan_xianglin_scheme` 应李师师之邀登雷峰塔 〔relatedCharacterIds〕 | 未明确提及加入细节，但出现在程宗扬的阵营中，受程宗扬庇护。 | 无事件级判据（joining 为静态文案） | 是 |
| 云丹琉 | `lyl.lin_an_bridge`（主轴） | `lyl.event.debut_yundanliu` 云丹琉·招牌登场 〔relatedCharacterIds〕 | 汉国篇30集3章「欲醉」正式加入程宗扬后宫 | 无事件级判据（joining 为静态文案） | 是 |
| 云如瑶 | `lyl.lin_an_bridge`（主轴） | `lyl.event.debut_yunruyao` 云如瑶·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 刘骜 | 缺事件点名；角色表最早 `lyl.lin_an_bridge` | 缺 | 非程宗扬队伍或后宫成员 | 数据写明不加入 | 否 |
| 剑玉姬 | `lyl.lin_an_bridge`（主轴） | `lyl.event.debut_jianyuji` 剑玉姬·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 尹馥兰 | `lyl.lin_an_bridge`（主轴） | `lyl.event.debut_yinfulan` 尹馥兰·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 惊理 | `lyl.lin_an_bridge`（主轴） | `lyl.event.debut_jingli` 惊理·招牌登场 〔relatedCharacterIds〕 | 《六朝清羽记》第三章“猛虎出柙”中被小紫用计擒住，后成为程宗扬阵营成员。 | 无事件级判据（joining 为静态文案） | 是 |
| 赵合德 | `lyl.lin_an_bridge`（主轴） | `lyl.event.debut_zhaohede` 赵合德·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 李寅臣 | `lyl.taiquan_expedition`（二级） | `liuchao.event.reconnoiter` 象牙为礼拜访威远镖局 〔relatedCharacterIds〕 | 非程宗扬队伍成员或后宫 | 数据写明不加入 | 否 |
| 阮香琳 | `lyl.taiquan_expedition`（二级） | `liuchao.event.reconnoiter` 象牙为礼拜访威远镖局 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 富安 | 缺事件点名；角色表最早 `lyl.taiquan_core_conflict` | 缺 | 第7章大会，作为新加入的宋国股东登场 | 无事件级判据（joining 为静态文案） | 否 |
| 徐君房 | `lyl.taiquan_core_conflict`（二级） | `lyl.event.find_exit` 寻找出口 〔relatedCharacterIds〕 | 太泉古阵段与程宗扬同行/互相求生 | 无事件级判据（joining 为静态文案） | 否 |
| 罂粟女 | 缺事件点名；角色表最早 `lyl.taiquan_core_conflict` | 缺 | 未明确交代，但提及‘妈妈吩咐过’，推测由紫夫人（妈妈）调教后分配给程宗扬 | 无事件级判据（joining 为静态文案） | 否 |
| 蒋安世 | 缺事件点名；角色表最早 `lyl.taiquan_core_conflict` | 缺 | 原在孟老大直属营，江州之战后被派往洛都负责鹏翼社经营 | 无事件级判据（joining 为静态文案） | 否 |
| 虞白樱 | `lyl.taiquan_core_conflict`（二级） | `lyl.event.find_exit` 寻找出口 〔relatedCharacterIds〕 | 第1章魔墟中与程宗扬在地宫做交易，后第4章宝库重逢，逐渐成为后宫一员 | 无事件级判据（joining 为静态文案） | 是 |
| 莫如霖 | `lyl.taiquan_afterfall`（主轴） | `lyl.event.taiquan_afterfall_04_beat` 莫氏对质 〔name/objective〕 | 非程宗扬队伍成员或后宫，是外姓人首领，与程宗扬达成商路合作协议 | 数据写明不加入 | 否 |
| 襄城君 | `lyl.taiquan_afterfall`（主轴） | `lyl.event.taiquan_afterfall_10_beat` 襄城君受控 〔name/objective〕 | 缺 | 缺 | 是 |
| 义姁 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_01b` 吕冀淫辱伪赵昭仪（友通期） 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 友通期 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_01b` 吕冀淫辱伪赵昭仪（友通期） 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 吕奉先 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_06` 吕奉先单骑破阵 〔relatedCharacterIds〕 | 程宗扬的徒弟 | 无事件级判据（joining 为静态文案） | 否 |
| 张恽 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_01b` 吕冀淫辱伪赵昭仪（友通期） 〔relatedCharacterIds〕 | “张恽先是跟随吕氏，吕氏失势，又投到刘建门下，这样一个双重叛逆……第六七章起成为程宗扬手下爪牙/家奴，几章后沦为被程宗扬犹豫是否处死的累赘” | 无事件级判据（joining 为静态文案） | 否 |
| 班超 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_02` 程宗扬安排退路与联络 〔relatedCharacterIds〕 | 第1章后，程宗扬主动招揽，班超被信重打动，称为属下 | 无事件级判据（joining 为静态文案） | 否 |
| 胡夫人 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_01b` 吕冀淫辱伪赵昭仪（友通期） 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 赵飞燕 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_01` 天子暴毙消息传遍洛都 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 齐羽仙 | `lyl.luoyang_coup`（二级） | `lyl.event.s06_04` 长秋宫守卫战 〔relatedCharacterIds〕；另有招牌 `lyg.dingtao_beijing` `lyg.event.debut_qiyuxian` | 缺 | 缺 | 是 |
| 吕雉 | `lyg.dingtao_beijing`（二级） | `lyg.event.s01_04` 霍子孟见吕雉 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 孙寿 | `lyg.dingtao_beijing`（二级） | `lyg.event.s01_09` 吕冀赐死 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 成光 | `lyg.dingtao_beijing`（二级） | `lyg.event.s01_01` 秦桧斩刘建 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 贾文和 | `lyg.dingtao_beijing`（二级） | `lyg.event.s01_02` 贾文和劫持定陶王 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 匡仲玉 | `lyg.mijing_rumen`（主轴） | `lyg.event.s02_08` 程宗扬安排武帝秘境探索 〔relatedCharacterIds〕 | 星月湖大营第一团第一营第一连上尉，奉命向程宗扬报到；非后宫成员；为星月湖大营旧部，随程宗扬行动 | 无事件级判据（joining 为静态文案） | 否 |
| 哈迷蚩 | `lyg.mijing_rumen`（主轴） | `lyg.event.s02_05` 程宗扬与云苍峰商议婚事与财政 〔relatedCharacterIds〕 | 第3章提及哈迷蚩、阿合马、青面兽便带着投奔程氏商会的兽蛮人先行离开，表明其已加入程宗扬势力，非后宫成员。 | 无事件级判据（joining 为静态文案） | 否 |
| 阿合马 | 缺事件点名；角色表最早 `lyg.mijing_rumen` | 缺 | 第5章起带领兽蛮武者帮程宗扬处理事务，第7章程宗扬将兽蛮武士集合由阿合马带领，在首阳山放牧（第8章） | 无事件级判据（joining 为静态文案） | 否 |
| 安乐公主 | 缺事件点名；角色表最早 `lyg.han_succession` | 缺 | 被程宗扬从御榻旁的羊毛口袋中发现并强占，夺其元红，成为程宗扬的性奴 | 无事件级判据（joining 为静态文案） | 否 |
| 杨玉环 | `lyg.han_succession`（主轴） | `lyg.event.debut_yangyuhuan` 杨玉环·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 泉玉姬 | `lyg.han_succession`（主轴） | `lyg.event.debut_quanyuji` 泉玉姬·招牌登场 〔relatedCharacterIds〕 | 最初是六扇门派来装成教坊女子暗中监视程宗扬，后被程宗扬收服，魂丹被掌控，成为其性奴和探子。 | 无事件级判据（joining 为静态文案） | 是 |
| 白霓裳 | `lyg.han_succession`（主轴） | `lyg.event.debut_bainichang` 白霓裳·招牌登场 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 苏骁 | 缺事件点名；角色表最早 `lyg.han_succession` | 缺 | 星月湖旧部，大草原战后幸存，六营残部，后随程宗扬行动 | 无事件级判据（joining 为静态文案） | 否 |
| 萧氏 | 缺事件点名；角色表最早 `lyg.han_succession` | 缺 | 被吕雉从皇宫带回（见0239节），供程宗扬凌辱，并非正式队伍成员。 | 无事件级判据（joining 为静态文案） | 否 |
| 小环 | `lyg.changgan_begins`（二级） | `lyg.event.s03_09` 程宗扬在紫云楼宴后夜访大慈恩寺 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 蛇夫人 | `lyg.changgan_begins`（二级） | `lyg.event.debut_shefuren` 蛇夫人·招牌登场 〔relatedCharacterIds〕 | 原为黑魔海巫宗边缘人物……带着麾下姁奴与秘药财富主动投奔程宗扬，名义上"做生意"+"当管家"。 | 无事件级判据（joining 为静态文案） | 是 |
| 袁天罡 | `lyg.changgan_begins`（二级） | `lyg.event.s03_01` 入住长安宣平坊宅院 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 飞鸟萤子 | `lyg.shixiang_ambush`（二级） | `lyg.event.investigate_te_master` 潜入青龙寺查探特大师 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 廖群玉 | `lyg.changgan_interlude`（二级） | `lyg.event.changgan_interlude_02_beat` 百衲衣线索 〔name/objective〕 | 作为宋国股东加入盘江程氏，第7章股东大会中列为新加入的宋国股东 | 无事件级判据（joining 为静态文案） | 否 |
| 黛绮丝 | `lyg.changgan_interlude`（二级） | `lyg.event.debut_daiqisi` 佛堂善母 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 黎锦香 | `lyg.ganlu_bian`（二级） | `lyg.event.yang_yuhuan_report` 赴阳禄门院会见黎锦香 〔relatedCharacterIds〕 | 缺 | 缺 | 是 |
| 孙天羽 | 缺 | 缺 | 第4章乱战中被程宗扬擒获，为活命当场认爹，成为程宗扬安插在皇城司的内线 | 无事件级判据（joining 为静态文案） | 否 |
| 宁素 | 缺 | 缺 | 师傅死后，被萧遥逸和程宗扬带入队伍同行。 | 无事件级判据（joining 为静态文案） | 否 |
| 玄萝 | 缺 | 缺 | 非固定队伍成员，多次与程宗扬同行历练，属于松散伙伴关系。 | 数据写明不加入 | 否 |
| 王彦章 | 缺 | 缺 | 第2章从皇图天策府请来，作为援军随程宗扬行动 | 无事件级判据（joining 为静态文案） | 否 |
| 童贯 | 缺 | 缺 | 非队伍或后宫成员，仅作为使团随员/传令者 | 数据写明不加入 | 否 |
| 韩玉 | 缺 | 缺 | 自程宗扬到汉国起一直跟随，鞍马劳顿，出生入死（第3章 共醉） | 无事件级判据（joining 为静态文案） | 否 |
| 飞鸟熊藏 | 缺 | 缺 | 黑魔海幽长老从东瀛招揽，位列教中供奉；非程宗扬团队成员 | 数据写明不加入 | 否 |

计数：87 行。joining 非空 47（其中 8 条否定句）。stanceProfile「是」45 人（`stanceProfiles.ts` 49 组里，贾文和／贾诩算一人；未进本表的组没有额外独立角色）。事件级加入只有 **武二郎、秦桧、吴三桂** 三人。

---

## 2. 有 joining 但登场关缺事件支撑

「数据上能加入（或文案写已加入），玩家在 `scenario.events` 里找不到可发现路径」——`relatedCharacterIds` 与事件 `name`/`objective` 均未点名。

| 角色 | joining 极性 | 角色表最早关 | 事件点名 | 缺口 |
|---|---|---|---|---|
| 吴战威 | 正（云氏护卫／旧部） | `lcq.stage_03b` | 无 | 角色表注入，无事件 |
| 张少煌 | 正（建康世家入股） | `lcq.stage_03b` | 无 | 同上 |
| 梦娘 | 正（从黑魔海解救） | `lcq.stage_03b` | 无 | 蓝图 §12 点过她；events 层未落地 |
| 申婉盈 | 正（卓云君徒弟／共侍） | `lcq.stage_03b` | 无 | 卓云君招牌事件 related 未含她 |
| 雁儿 | 正（买来的婢） | `lcq.stage_03b` | 无 | 角色表注入 |
| 富安 | 正（宋国股东） | `lyl.taiquan_core_conflict` | 无 | 无股东大会事件 |
| 罂粟女 | 正（文案自标「推测」） | `lyl.taiquan_core_conflict` | 无 | joining 原文已是推测 |
| 蒋安世 | 正（鹏翼社） | `lyl.taiquan_core_conflict` | 无 | 无 |
| 阿合马 | 正（兽蛮武者） | `lyg.mijing_rumen` | 无 | 哈迷蚩事件未带她 |
| 安乐公主 | 正（性奴） | `lyg.han_succession` | 无 | 角色表在主轴关，事件未点名 |
| 苏骁 | 正（星月湖旧部） | `lyg.han_succession` | 无 | 星月湖线关键武将，events 层缺席 |
| 萧氏 | 正（吕雉带回；文案写并非正式队伍） | `lyg.han_succession` | 无 |  |
| 孙天羽 | 正（皇城司内线） | **角色表也缺** | 无 | joining 有、37 关角色表与事件皆无 |
| 宁素 | 正（师傅死后入队） | 角色表缺 | 无 | 同上 |
| 王彦章 | 正（皇图天策府援军） | 角色表缺 | 无 | 同上 |
| 韩玉 | 正（汉国起一直跟随） | 角色表缺 | 无 | 同上 |

另 8 条 joining 是否定句（黛姬雪娜、殇侯、刘骜、李寅臣、莫如霖、玄萝、童贯、飞鸟熊藏）——不是「可获得」，不进本缺口的「能加入」统计。

**核心同伴 joining 为空（对称缺口）**：小紫、月霜、凝羽、谢艺、秦桧、卓云君、潘金莲、赵飞燕、云苍峰、孟非卿、祁远、吕雉、贾文和、齐羽仙、云如瑶、杨玉环、李师师、袁天罡、白霓裳、剑玉姬、苏妲己、碧姬——运行时 `【入伙】` 不会出现。秦桧反而有事件 `s07_qinhui_join`，字段却是空数组。

---

## 3. 主轴 15 关内可获得 vs 只在二级线可获得

前提：**推断**「只打主轴」＝将来允许跳过 22 关。当前 `STAGE_ORDER` 仍是无分叉单链，运行时还跳不了。

判定：在 15 个 `MAIN_QUEST_STAGES` 的 `scenario.events` 里，是否至少有一次 `relatedCharacterIds` 或 `name`/`objective` 点名（不含否定句 joining 的 8 人）。

### 3.1 主轴 15 关内会出现（39）

打主轴能在事件层遇见。不保证有 joining，也不保证已「入伙」。

月霜、卓云君、凝羽、苏妲己、云苍峰、武二郎、祁远、谢艺、阿姬曼·芭娜、丹宸、小紫、易彪、碧姬、阿夕、鬼巫王、乐明珠、云丹琉、云如瑶、剑玉姬、尹馥兰、惊理、赵合德、襄城君、匡仲玉、哈迷蚩、杨玉环、泉玉姬、白霓裳、赵飞燕、吕雉、秦桧、孙寿、齐羽仙、义姁、阮香凝、李师师、蛇夫人、莫如霖（否定句，仅出现）、殇侯（否定句，仅出现）。

其中几人 **首次** 事件在二级关，但后来主轴关会再点名：

| 角色 | 首次事件（二级） | 主轴关也会点名 |
|---|---|---|
| 乐明珠 | `lcq.stage_04` | `stage_05` / `05b` / `06` |
| 赵飞燕 | `lyl.luoyang_coup` | `taiquan_afterfall`、`mijing_rumen`、`han_succession` |
| 吕雉 | `lyg.dingtao_beijing` | `mijing_rumen`、`han_succession` |
| 秦桧 | `lcq.stage_07`（且加入事件在此） | `han_palace_endgame`、`mijing_rumen` |
| 孙寿 | `lyg.dingtao_beijing` | （主轴有点名，见扫描） |
| 齐羽仙 | `lyl.luoyang_coup` | 后续主轴有点名 |

赵飞燕：设计稿把 `lyl.lin_an_bridge` 写成「全库最早在场处」——那是 `canon.characters`。事件层 `relatedCharacterIds` 最早是 `lyl.luoyang_coup` `s06_01`。`lin_an_bridge` 的 `debut_zhaohede` description 提到「皇后赵飞燕的胞妹」，related 只有赵合德。

小紫：设计稿／`MAIN_QUEST_STAGES` 写 `stage_03b`「小紫入队」。核实：`stage_03b` 的 `canon.characters` 有她，**该关 0 条事件点名**。事件层最早是主轴 `stage_05` `s05_06` / `debut_xiaozi`。`stage_03b` 入队是轴角色文案，不是事件。

### 3.2 只在二级线关卡可获得（24）

15 个主轴关的 events **从未** 点名。只打主轴会错过整个人。

| 角色 | 首次事件关（二级线） | joining | stance |
|---|---|---|---|
| 孟非卿 | `lcq.stage_07` 八骏得讯 | 缺 | 是 |
| 潘金莲 | `lcq.stage_08` 招牌登场 | 缺 | 是 |
| 萧遥逸 | `lcq.stage_08` 接骨灰（`stage_07` 已有同门旧案，仍非主轴） | 无需加入，已是同伴 | 否 |
| 相雅 | `lyl.jiangzhou_retreat` | 有（投靠／跪地效忠） | 是 |
| 金兀术 | `lyl.jiangzhou_retreat` | 有（兽蛮营入麾下） | 否 |
| 青面兽 | `lyl.jiangzhou_retreat` | 有（跟随入队） | 否 |
| 冯源 | `lyl.lin_an_black_sea` | 有 | 否 |
| 林清浦 | `lyl.lin_an_black_sea` | 有（情报负责人） | 否 |
| 阮香琳 | `lyl.taiquan_expedition` | 缺 | 是 |
| 徐君房 | `lyl.taiquan_core_conflict` | 有（同行求生） | 否 |
| 虞白樱 | `lyl.taiquan_core_conflict` | 有 | 是 |
| 友通期 | `lyl.luoyang_coup` | 缺 | 是 |
| 吕奉先 | `lyl.luoyang_coup` | 有（徒弟） | 否 |
| 张恽 | `lyl.luoyang_coup` | 有 | 否 |
| 班超 | `lyl.luoyang_coup` | 有（招揽为属下） | 否 |
| 胡夫人 | `lyl.luoyang_coup` | 缺 | 是 |
| 成光 | `lyg.dingtao_beijing` | 缺 | 是 |
| 贾文和 | `lyg.dingtao_beijing` | 缺 | 是 |
| 小环 | `lyg.changgan_begins` | 缺 | 是 |
| 袁天罡 | `lyg.changgan_begins` | 缺 | 是 |
| 飞鸟萤子 | `lyg.shixiang_ambush` | 缺 | 是 |
| 廖群玉 | `lyg.changgan_interlude` | 有（宋国股东） | 否 |
| 黛绮丝 | `lyg.changgan_interlude` | 缺 | 是 |
| 黎锦香 | `lyg.ganlu_bian` | 缺 | 是 |

对「只打主轴」影响最大的几人：

- **孟非卿／萧遥逸**：星月湖八骏，线在二级江州段；主轴 events 不点他们。
- **潘金莲**：蓝图第二幕对决对象；主轴 15 关 events 不点名。
- **贾文和／成光／袁天罡／黎锦香／黛绮丝**：唐／汉二级线班底。
- **秦桧不在此列**：加入事件在二级 `stage_07`，但主轴 `han_palace_endgame` / `mijing_rumen` 仍会点名——跳过二级会错过「归入麾下」，未必错过见面。

### 3.3 有 joining、两边事件都不点名（16）

§2 那 16 人。跳不跳二级都看不见。苏骁（星月湖旧部）尤其碍事。

---

## 4. 小玲儿（未进 87 人并集）

| 项 | 值 |
|---|---|
| id | `liuchao.character.xiao_ling_er` |
| joining | 缺（空数组） |
| stanceProfile | 否 |
| 角色表 | 仅 `lyg.mijing_rumen`（主轴） |
| 事件 relatedCharacterIds | **37 关 0 次** |
| 事件 name/objective | 无 |
| description 提及 | `lyl.xiaoyingzhou_blacksea_trap` `xiaoyingzhou_blacksea_trap_08_beat`「小瀛洲杀局」（主轴）——名字在描述里，related 未挂 |

主轴设计把 `mijing_rumen` 标成「小玲儿唯一在场关」。角色表在，事件没点名。只打主轴也 **不会** 从 objective／related 走到她。

---

## 5. 角色表早于事件（共享注入，不是登场）

`canon.characters` 首次出现早于事件点名的，至少包括：凝羽／苏妲己（表在 `stage_01`，事件 `stage_02`）；`stage_03b` 一次性注入小紫、秦桧、孟非卿、潘金莲、萧遥逸、乐明珠、碧姬、吴三桂、梦娘等——事件要晚 1–5 关，或永远不来。`lyl.lin_an_bridge` 角色表有赵飞燕／吕雉／班超／孙寿，事件点名分别要到洛都政变或定陶。

以后不要用「角色表是否在本关」当首次登场。

---

## 6. 核实 vs 推断

**已核实**

- joining 47／268／phase 0 条，来自 registry。
- `【入伙】` 注入路径来自 `characterResolver.ts:203`。
- 事件 related／name／objective 点名；completion 只有 `flags.event.*.done`。
- stance 名单来自 `stanceProfiles.ts` 的 `names:`。
- 主轴 15 vs 二级 22 的划分来自 `mainQuestAxis.ts`。

**推断**

- 「可获得」并集口径（joining ∪ stance ∪ 招牌事件）——引擎没有入队实体。
- 「只打主轴会错过」以将来可跳过 22 关为前提。
- 秦桧在主轴关再出场 ≠ 已经入伙；入伙事件只在 `stage_07`。
