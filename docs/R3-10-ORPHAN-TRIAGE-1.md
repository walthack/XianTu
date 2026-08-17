# 无人认领 event 归类 · 第 1 批（62 条）

> 只读四字段与 `secondaryLines.ts`／`mainQuestAxis.ts` 的 `eventId`。未改 `src/`、未改 JSON。
> 每条只选一档。B 的并进目标必须是任务链**已经认领**的 id。

| 档 | 含义 |
|---|---|
| A | 人物高光：这一拍是某人自己的诉求／来历／代价／开价 |
| B | 场景子拍：已认领 event 的战斗／赶路／寒暄／善后，应并进该 id |
| C | 二级线漏认：属八条线之一但无人认领 |
| D | 主轴漏认：血脉（岳血后裔／小紫／月霜／赵飞燕／小玲儿）或太泉（古阵／秘境／超级用户／冰冰） |
| E | 背景：世界在动，没有玩家可做的链内事 |

| seq | event id | 档 | 理由 |
|---:|---|:-:|---|
| 0 | `lcq.event.s07_debut_qinhui` | A | 秦桧首次到场，殇侯点破其「灵敏有余，志浅易变」，是他的来历／人品拍，不是黑魔海节点。 |
| 0 | `lcq.event.s07_qinhui_join` | C | 殇侯把秦桧等手下交你差遣，是黑魔海庇护关系落地；秦桧本人未开价。 |
| 0 | `lyg.event.buddhist_conspiracy_lore_nuclear_treaty` | E | 「核武不扩散」谐音梗一次性趣谈，不推进唐国围杀链，也无可做的线内事。 |
| 0 | `lyg.event.debut_daiqisi` | A | 黛绮丝认定你是拯救者并誓为主仆，同时暴露摩尼教善母被十方丛林禁锢的来历与代价。 |
| 0 | `lyg.event.debut_lvzhi` | A | 吕雉凤辇临朝立威、点破霍子孟三面受制，是她本人的出场／开价；汉国认领的是 `s01_09` 赐死。 |
| 0 | `lyg.event.highlight_banchao_lamb_leg` | A | 班超以羊腿镇场立规矩、并为田荣留退路，是他自己的开价／代价，不归汉国权力链。 |
| 0 | `lyg.event.lvzhi_zhenjiu` | B | 汉国已认领 `lyg.event.s01_09`「吕冀赐死，见证吕雉亲裁诸吕」，本拍是亲裁方案的前戏。 |
| 0 | `lyg.event.dengji_yuzuo_yinhuan` | B | 主轴已认领 `lyg.event.han_succession_09_beat` 登基典仪行功，本拍是同场私密余波。 |
| 0 | `lyg.event.yangwuhou_rumor` | E | 《阳武侯小史》是汉都舆论炮制的假血统笑话，不归岳血支柱，也不进汉国旧案／拥立链。 |
| 0 | `lyl.event.decide_yin_fulan_fate` | A | 决定尹馥兰（及何漪莲）去留，是她向玩家要一个位置的收束开价。 |
| 0 | `lyl.event.pan_jinlian_ambush` | A | 潘金莲在太泉核心区主动设伏向你下手，是她的杀着／开价，不是古阵节点。 |
| 0 | `lyl.event.plan_counterattack` | D | 太泉核心区怎么过的反制计划；主轴只认领了蚁穴出口 `find_exit` 与之后的魔墟。 |
| 0 | `lyl.event.yin_fulan_aid` | A | 尹馥兰主动报伏、伸援手并要后续安排，是她向玩家开的价。 |
| 0 | `lyl.event.yin_yang_counter` | D | 核心区用阴阳鱼反击是太泉段中间杀局，主轴两端（蚁穴／魔墟）已认、本拍漏认。 |
| 1 | `lcq.event.s01_01` | B | 主轴 `lcq.event.s01_05` 已把「从坠落处活下来走到帅帐」收口，本拍是穿越降落过程。 |
| 2 | `lcq.event.s01_02` | B | 段强被射杀是坠落求生过程，并进主轴 `lcq.event.s01_05`；他未向玩家开价。 |
| 22 | `lcq.event.s02_03` | B | 同一战场邻部秦军溃散，是主轴已认领 `lcq.event.s02_02` 王哲殉军的观战过程。 |
| 31 | `lcq.event.s02_04` | B | 被当逃奴烙印，是主轴 `lcq.event.baihu_shangguan_escape` 白湖死局的入口过程。 |
| 33 | `lcq.event.s02_05` | B | 阿姬曼牢房圈套／戈龙伏击是出馆前的过程，并进 `lcq.event.baihu_shangguan_escape`；她只是局中饵，未自己开价。 |
| 35 | `lcq.event.s02_06` | A | 苏妲己揭开商馆主人伪装并追问霓龙丝，是她向玩家要情报的开价；脱身另有主轴出馆拍。 |
| 65 | `lcq.event.s03b_snake_flower_bridge_05` | B | 万古巨藤断桥是昭南已认领 `lcq.event.s03b_snake_flower_bridge_04` 跟商队进南荒的赶路。 |
| 66 | `lcq.event.s03b_snake_flower_bridge_06` | B | 苏荔救援登崖是昭南 `lcq.event.s03b_snake_flower_bridge_07`「问清花苗站哪边」的接触／寒暄。 |
| 71 | `lcq.event.s04_02` | B | 路上遇鬼王峒武士，是花苗立场拍之后的遭遇战，并进 `lcq.event.s03b_snake_flower_bridge_07`。 |
| 75 | `lcq.event.s04_01` | B | 昭南已写明 Z3 把「密谋刺王」并进花苗立场，目标即 `lcq.event.s03b_snake_flower_bridge_07`。 |
| 80 | `lcq.event.s04_05` | A | 易虎救人、受创、被洪吞没，是他自己的代价高光，不是赶路也不是昭南立场。 |
| 88 | `lcq.event.s04b_lingfei_baiyi_crisis_01` | B | 与武二郎商议夺镜，是后来查清白夷投峒的取证前置，并进昭南 `lcq.event.s04_07`。 |
| 91 | `lcq.event.s04b_lingfei_baiyi_crisis_03` | B | 斩杀鸦人是黑魔海已认领 `lcq.event.s04b_lingfei_baiyi_crisis_04` 搜出羊皮纸之前的战斗过程。 |
| 95 | `lcq.event.s04b_lingfei_baiyi_crisis_05` | B | 取得灵飞镜是查清白夷投峒的取证过程，并进昭南 `lcq.event.s04_07`。 |
| 96 | `lcq.event.s04b_lingfei_baiyi_crisis_06` | B | 花苗／白夷商议联手，是「问清白夷站哪边」的立场寒暄，并进 `lcq.event.s04_07`。 |
| 100 | `lcq.event.s04b_lingfei_baiyi_crisis_07` | B | 水镜把羊皮纸线报给苏妲己并挨「别招惹」的骂，是黑魔海入口 `…_crisis_04` 的后续过程。 |
| 102 | `lcq.event.s04b_lingfei_baiyi_crisis_08` | B | 昭南已写明 Z4 把「识破投峒」并进白夷立场，目标即 `lcq.event.s04_07`。 |
| 103 | `lcq.event.s04b_lingfei_baiyi_crisis_09` | B | 昭南 Z4 同样并进「族长被换」，目标 `lcq.event.s04_07`。 |
| 105 | `lcq.event.s04b_lingfei_baiyi_crisis_10` | B | 追入地宫躲陷阱，是识破白夷投峒之后的追击过程，并进 `lcq.event.s04_07`。 |
| 106 | `lcq.event.s04b_lingfei_baiyi_crisis_11` | B | 血虎扑场是同一场地宫战的遭遇，并进 `lcq.event.s04_07`；易虎此时只是被改造的兵器，不再开价。 |
| 113 | `lcq.event.s04b_lingfei_baiyi_crisis_14` | B | 商议先同往碧鲮，是昭南已认领 `lcq.event.biling_bay_stance`「赶到碧鲮湾看立场」的动身决定。 |
| 119 | `lcq.event.s04b_lingfei_baiyi_crisis_17` | B | 湿热盆地鳄鱼险是前往碧鲮的赶路，并进 `lcq.event.biling_bay_stance`。 |
| 122 | `lcq.event.s04b_lingfei_baiyi_crisis_19` | B | 大潮淹没竹楼后逃生，是主轴 `lcq.event.s04b_lingfei_baiyi_crisis_18` 谢艺说破遗腹女同夜的善后。 |
| 166 | `lcq.event.s05b_02_xiaozi_exposed` | A | 质问并揭穿小紫的控制／伪装／残忍，是她自己的来历拍（主轴只认领了碧姬追问与倒戈）。 |
| 168 | `lcq.event.s05b_03_saan_secret_path` | B | 逼萨安问出密道，是昭南 `lcq.event.s05b_05a_meet_ghost_king` 潜入见鬼巫王的前置。 |
| 169 | `lcq.event.s05b_04_enter_ghost_palace` | B | 进入鬼王宫是「当面见鬼巫王」的入场／赶路，并进 `lcq.event.s05b_05a_meet_ghost_king`。 |
| 173 | `lcq.event.s05b_05b_ideology_duel_and_defeat` | B | 昭南已写明 Z7 把理念交锋并进见鬼巫王，目标即 `lcq.event.s05b_05a_meet_ghost_king`。 |
| 180 | `lcq.event.s05b_08a_rescue_suli` | B | 井底救苏荔是鬼王宫倒戈仗的过程，并进昭南／主轴 `lcq.event.s05b_10_slave_revolt_and_phoenix_change`；她未开新价。 |
| 182 | `lcq.event.s05b_08b_altar_corpse_fight_and_danchen` | B | 祭台尸鬼与丹宸之死是见鬼巫王同一场交锋的败退过程，并进 `lcq.event.s05b_05a_meet_ghost_king`。 |
| 189 | `lcq.event.s05b_09_temporary_pact_with_xiaozi` | B | 主轴已声明「临时协定＋奴隶倒戈」并进倒戈拍，目标 `lcq.event.s05b_10_slave_revolt_and_phoenix_change`。 |
| 248 | `lcq.event.s07_04_zhuo_subdued` | A | 卓云君在小紫压迫下崩溃失权，是她的代价拍；太乙把收服留给人物线，任务链未认领。 |
| 266 | `lcq.event.s07_08_palace_escape` | B | 与云丹琉交手后分逃，是晋国已认领 `lcq.event.s07_07_dragon_hall` 夜探神龙殿的善后。 |
| 285 | `lcq.event.s08_02_wood_fort` | B | 木垒死守是晋国 `lcq.event.s08_01_eagle_valley` 鹰愁峪入瓮之后的战斗过程。 |
| 287 | `lcq.event.s08_03_beifu_rescue` | B | 晋国已写明 J2 把北府解围并进入瓮拍，目标 `lcq.event.s08_01_eagle_valley`。 |
| 289 | `lcq.event.s08_04_sudaji_enters` | C | 苏妲己代表黑魔海直入建康庭院摊牌，链上从殇侯击掌跳到内隙，漏了这一拍。 |
| 297 | `lcq.event.s08_05_breakthrough` | C | 九阳入微逼退苏妲己，是黑魔海建康高压的收束战，同样未被认领。 |
| 304 | `lcq.event.s08_07_palace_ninja` | B | 击杀飞鸟熊藏、摸宫中线索，是晋国 `lcq.event.s08_10_xuanwu_rescue` 救驾前的宫中过程。 |
| 311 | `lcq.event.s08_09_zhaoming_night` | B | 刑室逼走古冥隐，是星月湖已认领 `lcq.event.s08_08_gumingyin_plot` 点破第八骏的当夜对峙。 |
| 344 | `lcq.event.s09_02_yun_ruyao_faints` | A | 云如瑶突然昏厥，向玩家暴露她的病线／身体代价，不是晋国分赃过程。 |
| 347 | `lcq.event.s09_03_xiaozi_wounded` | C | 苏妲己暗算致小紫重伤坠江，是黑魔海在建康的追杀，链上未认领。 |
| 359 | `lcq.event.s09_04_weaving_trade` | A | 小紫为拉链坊归属兴师问罪，以织坊交换平息，是她向玩家开的价。 |
| 362 | `lcq.event.s09_05_drain_escape` | C | 苏妲己追到排水沟、三人沉江逃出建康，是黑魔海追杀的收束，链未认领。 |
| 367 | `lcq.event.s09_07_feiniao_infiltration` | B | 假飞鸟潜伏摸广阳，是黑魔海已认领 `lcq.event.s09_06_blacksea_fracture` 查清内隙的潜入过程。 |
| 372 | `lcq.event.s09_08_six_doors_confession` | B | 泉玉姬供认六扇门与擒月霜，是 `lcq.event.s09_06_blacksea_fracture` 节点文案「听她供认御姬奴」的审讯过程。 |
| 376 | `lcq.event.s09_09_jiangzhou_crisis` | B | 揭穿泉玉姬御姬奴真身，是同一条黑魔海供认正文，并进 `lcq.event.s09_06_blacksea_fracture`。 |
| 381 | `lcq.event.s09_10_separation` | D | 拒绝交出小紫、月霜线暂时失散，是血脉候选人的安危／归属，主轴未认领。 |
| 390 | `lcq.event.s10_02_yeying_pass` | B | 云水封航改走陆路，是宋国已认领 `lcq.event.s10_01_jiangzhou_order` 江州开打后的赶路。 |
| 397 | `lcq.event.s10_03_ninja_trace` | C | 晴州再浮东瀛女忍／黑魔海暗线，链上从内隙直接跳到捣巢，漏了这节追踪。 |

## 档位合计

| 档 | 条数 |
|---|---:|
| A | 13 |
| B | 38 |
| C | 6 |
| D | 3 |
| E | 2 |
| 合计 | 62 |
