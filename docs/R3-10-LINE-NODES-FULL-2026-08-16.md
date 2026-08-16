# 八条二级线 · 节点全表（2026-08-16）

> 源：`src/modules/scenarioMods/secondaryLines.ts` 的 `SECONDARY_LINES`。
> 状态三档：**✅ ready**＝已有 stage+event 承载，玩家现在就走得到；
> **🆕 new**＝原著有、游戏没落地，需新增 event（已给建议挂载关与建议 id）；
> **⏳ pending**＝待扩，这一段还没规划，占位而已。

---

## 太乙真宗　

| 项 | 内容 |
|---|---|
| 类型 | 宗派线 · **锚人** |
| 锚 | `lcq.character.wang_zhe` |
| 入口指引 | 王哲既已传功托付，太乙真宗的门就对你开着——去找他，或日后去找教御蔺采泉。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 受王哲传功托付，入太乙真宗阵营 | `lcq.stage_01` | `lcq.event.s01_04` |
| 2 | ✅ | 接下锦囊：清理门户、传授九阳 | `lcq.stage_02` | `lcq.event.s02_01` |
| 3 | ✅ | 与蔺采泉重议九阳的出处与名分 | `lyl.xiaoyingzhou_blacksea_trap` | `lyl.event.xiaoyingzhou_blacksea_trap_02_beat` |
| 4 | ⏳ | 清洗通魔教御，坐实道门操盘人 | — | — |
| 5 | ⏳ | 锦囊后续：白纸如何变指令、失踪于何处、故人是谁 | — | — |

**计**：✅ 3　🆕 0　⏳ 2（共 5）

**待扩**：beat 级三分类 ✅6／⚠8／⏳2——八条线里 ⚠ 最多。加入之后的掌教斗争大面积没落地，锦囊停在"领取"。

<details><summary>锚的正典依据</summary>

王哲是把程宗扬拉进太乙的人——`lcq.event.s01_04` objective 字面即「加入太乙真宗阵营」，并在 `stage_02` 传功托付。**开局强制剧情就会见到他，等于自动开启**（用户确认 2026-08-16）。（山门龙池两个 id 均不可达，故不用地点锚。）

</details>

---

## 星月湖　

| 项 | 内容 |
|---|---|
| 类型 | 宗派线 · **锚人** |
| 锚 | `liuchao.character.xie_yi`<br>`liuchao.character.xiao_yao_yi` |
| 入口指引 | 想搭上星月湖，去找八骏——先是谢艺，江州之后可找萧遥逸。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 在南荒结识谢艺，搭上星月湖 | `lcq.stage_03b_snake_flower_bridge` | `lcq.event.s03b_snake_flower_bridge_04` |
| 2 | ✅ | 建康与八骏会合 | `lcq.stage_09_trade_and_escape` | `lcq.event.s09_01_eight_steeds_leave` |
| 3 | ✅ | 江州战事：与星月湖并肩 | `lcq.stage_11_lieshan_battle` | `lcq.event.s11_04_xingyue_appears` |
| 4 | ⏳ | 入营判据：怎样才算真正编入星月湖 | — | — |
| 5 | ⏳ | 岳帅冤案洗雪的收束 | — | — |

**计**：✅ 3　🆕 0　⏳ 2（共 5）

**待扩**：beat 级 ✅10／⚠3／⏳3——内容已连续落地，缺的是入营判据与洗冤收束，不是没故事。

<details><summary>锚的正典依据</summary>

**用八骏，不用月霜**（用户裁定 2026-08-16）：月霜是要护的人，不是引你进门的人；八骏才是星月湖建制（蓝图 §10：孟非卿掌军／萧遥逸掌谍报商网／谢艺护岳帅父女）。**八骏里只取谢艺与萧遥逸**（用户裁定 2026-08-16）：这两人才是程宗扬实际打交道的，孟非卿／卢景／王韬／斯明信不作入口，崔茂在默认线事件层不可达。任一见过即开线，最早由谢艺第 4 关触发——比月霜第 1 关合理，开局就开星月湖太早。

</details>

---

## 黑魔海／毒宗　

| 项 | 内容 |
|---|---|
| 类型 | 宗派线 · **锚人** |
| 锚 | `liuchao.character.shang_zhen_yu` |
| 入口指引 | 毒宗的名分不在总坛里，在人身上——去找殇侯（你先认识的那位朱老头）。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 南荒遇朱老头，落进毒宗的庇护 | `lcq.stage_04` | `lcq.event.s04_02` |
| 2 | ✅ | 建康再见殇侯，听出天命侯这回事 | `lcq.stage_07_qingyuan_jiankang` | `lcq.event.s07_03_xiaozi_appears` |
| 3 | ✅ | 太泉段卷入黑魔海的巢穴与杀局 | `lyl.xiaoyingzhou_blacksea_trap` | `lyl.event.xiaoyingzhou_blacksea_trap_04_beat` |
| 4 | ⏳ | 天命侯名分：玩家侧怎么争 | — | — |
| 5 | ⏳ | 大祭与潘金莲的对决（续写第二幕） | — | — |

**计**：✅ 3　🆕 0　⏳ 2（共 5）

**待扩**：beat 级 ✅13／⚠3／⏳3——故事最多的一条。半成品的是**玩家侧名分**：「天命侯」全库 0 条 event。

<details><summary>锚的正典依据</summary>

秘密组织不靠走进总坛加入（蓝图总坛在昭南，事件层从未落地）。正典里程宗扬是毒宗系「被庇护者」，蓝图 §13-C 定案「名义天命侯＝殇侯，毒宗实推的继承人＝程宗扬」。同一 id 两个名字：第 5 关以「朱老头」现身，第 10 关以「殇侯」现身。**用殇侯不用小紫**（用户授权判断 2026-08-16）：小紫第 8 关才可达（首现关 `stage_05` 被隔离），且她已是主轴血脉线核心承重（层三解锁门／遗孤名册／大祭备用容器），兼作黑魔海入口会让玩家分不清"认识小紫"是在推血脉还是在入毒宗。

</details>

---

## 昭南　

| 项 | 内容 |
|---|---|
| 类型 | 国家／地区线 · **锚地** |
| 锚 | `liuchao.character.yun_cang_feng`<br>`liuchao.character.wu_er_lang` |
| 入口指引 | 南荒没有可投的朝廷，只有带你进去的人——跟云苍峰的商队同行，队里还有武二郎。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 跟云苍峰的商队进南荒 | `lcq.stage_03b_snake_flower_bridge` | `lcq.event.s03b_snake_flower_bridge_04` |
| 2 | ✅ | 查清蛇彝村灭村，血符指向鬼王峒 | `lcq.stage_03b_snake_flower_bridge` | `lcq.event.s03b_snake_flower_bridge_02` |
| 3 | ✅ | 在花苗、白夷、碧鲮之间选边 | `lcq.stage_04b_lingfei_baiyi_crisis` | `lcq.event.s04b_lingfei_baiyi_crisis_04` |
| 4 | ⏳ | 昭南朝廷（麟趾／昭南城）：事件层从未抵达 | — | — |
| 5 | ⏳ | 开放线扩展位：芈氏外家 vs 程系经济渗透、阖闾破郢原型、凝羽回归线 | — | — |

**计**：✅ 3　🆕 0　⏳ 2（共 5）

**待扩**：beat 级 ✅8／⚠3／⏳5——腹地几乎全 ✅，但都城没抵达。**开放线，作者本人也没写完**，扩展位见蓝图 §6／§12。

<details><summary>锚的正典依据</summary>

**破例用人物锚**（用户提出 2026-08-16）：其余四条国家线都能走进都城，昭南不能——麟趾／昭南城在事件层从未抵达，玩家到的全是部族聚落。**不变量是"进南荒得跟商队"**：`stage_03b` 的 `云氏同行` objective 字面即「与云苍峰商队同行，前往白夷族」；那片地方没有别的进法。⚠ 冰蛊胁迫（`stage_03`：苏妲己订下三个月南荒之约 → 以冰蛊逼迫南行 → 两日内组织南荒队伍）**只是正典默认路径，不是结构必然**——它前面那串（流落街头→落进苏妲己手里→赌局卖身）每一环都可能不发生，本作又有 IF 分歧。故锚取"带路的商队人"而非"被谁逼的"：不论玩家是被押去的还是自己走通商路去的，商队这一条都成立。（原锚熊耳铺已废：它是 `stage_03b` 最后一个事件「龙神新娘｜前往熊耳铺」的落点，在南荒之行的尾巴上，是深处不是门。）

</details>

---

## 晋国　

| 项 | 内容 |
|---|---|
| 类型 | 国家／地区线 · **锚地** |
| 锚 | `liuchao.location.jiankang` |
| 入口指引 | 想插手晋国朝局，去建康。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 清远入晋，卷进建康疑局 | `lcq.stage_07_qingyuan_jiankang` | `lcq.event.s07_02_kill_wu` |
| 2 | ✅ | 玄武湖宫变 | `lcq.stage_08_jiankang_coup` | `lcq.event.s08_03_beifu_rescue` |
| 3 | ✅ | 云氏商局与沉江脱险 | `lcq.stage_09_trade_and_escape` | `lcq.event.s09_04_weaving_trade` |
| 4 | ⏳ | 商战终局：广源行旧账清算 | — | — |

**计**：✅ 3　🆕 0　⏳ 1（共 4）

**待扩**：beat 级 ✅4／⚠5／⏳3——宫变中篇已在，缺商战终局。蓝图 §6 把晋写成商战副本（云如瑶＝岳霏揭晓地、小玲儿身世）。

<details><summary>锚的正典依据</summary>

建康＝晋国都城（官方附录地图 jin-nanzhao 幅在场；描述「晋国都城」）。第 10 关可达。

</details>

---

## 宋国　

| 项 | 内容 |
|---|---|
| 类型 | 国家／地区线 · **锚地** |
| 锚 | `liuchao.location.linan`<br>`liuchao.location.lin_an` |
| 入口指引 | 想插手宋国朝局，去临安。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 江州坚守与粮战 | `lcq.stage_11_lieshan_battle` | `lcq.event.s11_02_cement_fortress` |
| 2 | ✅ | 江州围城与反攻 | `lcq.stage_12_jiangzhou_counterwar` | `lcq.event.s12_01_grain_route_blocked` |
| 3 | ✅ | 临安落脚，摸清这座城的暗线 | `lyl.lin_an_bridge` | `lyl.event.lin_an_bridge_01_beat` |
| 4 | ⏳ | 临安官场：吏部／威远／武穆王府（细点全在隔离关） | — | — |

**计**：✅ 3　🆕 0　⏳ 1（共 4）

**待扩**：beat 级 ✅6／⚠2／⏳2——江州＋临安已成块，缺临安官场细点。

<details><summary>锚的正典依据</summary>

临安＝宋国都城。`linan` 覆盖 30 关为主，`lin_an` 只 1 关，一并收下防漏；`linan_city` 只在隔离关 `taiquan_expedition`，不收。

</details>

---

## 汉国　

| 项 | 内容 |
|---|---|
| 类型 | 国家／地区线 · **锚地** |
| 锚 | `liuchao.location.luoyang`<br>`lyl.location.luoyang` |
| 入口指引 | 想插手汉国朝局，去洛都。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 去洛都，摸清入朝的口子 | `lyl.taiquan_afterfall` | `lyl.event.taiquan_afterfall_07_beat` |
| 2 | ✅ | 买下官身，在汉廷立住脚 | `lyl.luoyang_cloud_secret` | `lyl.event.s05_01` |
| 3 | ✅ | 扛住吕氏动用汉军的围杀 | `lyl.luoyang_cloud_secret` | `lyl.event.s05_03` |
| 4 | 🆕 | 用纸钞买田；看清限田令要把云家卷进削豪强 | `lyl.luoyang_cloud_secret` | `lyl.event.han_limit_field` |
| 5 | 🆕 | 从传闻得知：天子已死，含光殿落到吕冀手里，刘建已起兵占了南宫 | `lyl.han_palace_endgame` | `lyl.event.han_power_vacuum` |
| 6 | 🆕 | 决定是否出面拥立定陶王 | `lyl.han_palace_endgame` | `lyl.event.han_sponsor_dingtao` |
| 7 | ✅ | 董卓无符入京；刘建伏诛 | `lyl.han_palace_endgame` | `lyl.event.han_palace_endgame_08_beat` |
| 8 | ✅ | 到场或听任新朝承认定陶王 | `lyg.dingtao_beijing` | `lyg.event.s01_05` |
| 9 | ✅ | 吕冀赐死，见证吕雉亲裁诸吕 | `lyg.dingtao_beijing` | `lyg.event.s01_09` |
| 10 | ✅ | 护住赵氏，促成新帝登基，自己以辅政定型 | `lyg.han_succession` | `lyg.event.han_succession_08_beat` |

**计**：✅ 7　🆕 3　⏳ 0（共 10）

**待扩**：beat 级 ✅5／⚠2／⏳3，八条里对齐度最高。缺 3 条新 event（H4／H5／H6），其中 H5 靠流言获知、H6 给玩家拥立与否的选择。详见 docs/R3-10-HAN-QUESTLINE-2026-08-16.md。

<details><summary>锚的正典依据</summary>

洛都＝汉国都城。**两个孪生 id 全收**：`liuchao.location.luoyang` 覆盖 24 关、`lyl.location.luoyang` 覆盖 6 关（含抵达关 `luoyang_cloud_secret`，那关没有 atlas 那个）。早先只填后者是错的——汉国线 6 关里只有 3 关能响，`dingtao_beijing` 与 `han_succession` 玩家人在洛都却触发不了。

</details>

---

## 唐国　

| 项 | 内容 |
|---|---|
| 类型 | 国家／地区线 · **锚地** |
| 锚 | `liuchao.location.changan` |
| 入口指引 | 想插手唐国朝局，去长安。 |

| # | 状 | 节点 | 承载关卡 | 事件 id |
|---|---|---|---|---|
| 1 | ✅ | 以汉使入长安，灞桥落脚 | `lyg.changgan_begins` | `lyg.event.s03_01` |
| 2 | ✅ | 摸清佛门暗潮冲着谁来 | `lyg.changgan_interlude` | `lyg.event.changgan_interlude_02_beat` |
| 3 | ✅ | 甘露变：赶在密令落地前弄明白谁在动手 | `lyg.buddhist_conspiracy` | `lyg.event.buddhist_conspiracy_01_beat` |
| 4 | ✅ | 长安失序与弑君余波 | `lyg.ganlu_aftershock` | `lyg.event.ganlu_aftershock_03_beat` |
| 5 | ⏳ | 入仕唐廷的判据（现无） | — | — |

**计**：✅ 4　🆕 0　⏳ 1（共 5）

**待扩**：beat 级 ✅8／⚠1／⏳3——⚠ 最少的一条，原著段几乎打穿（甘露变收到李辅国肉身亡）。缺入仕判据。

<details><summary>锚的正典依据</summary>

长安＝唐国都城。须用 `liuchao.location.changan`——`lyg.location.changan`（名「长安城」）在抽查的 live 关查无。第 30 关可达。

</details>

---

## 总计

八条线共 **43 个节点**：✅ 29　🆕 3　⏳ 11
