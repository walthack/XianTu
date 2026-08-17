# R3-10 可达孤儿归类·合并单 · 2026-08-17

> 186 条可达孤儿的归属裁定。三批由 Grok 归类、口径由 Claude 定。
> **隔离孤儿 86 条不在本单内**——那需要先决定八个隔离关怎么处置。

## 汇总

| 档 | 条数 | 落法 |
|---|---:|---|
| A 人物高光 | 36 | 归人物任务插入点（改人物线文档，不动代码） |
| B 场景子拍 | 95 | 并进已认领 event，**不建节点** |
| C 二级线漏认 | 35 | 补进对应线的节点表 |
| D 主轴漏认 | 12 | **逐条对判据后**再决定是否进主轴 |
| E 背景 | 8 | 不归任何链 |

**真正没人要的只有 8 条（4%）**。所谓 66% 孤儿，一半是过程细节（B），
另有 47% 是该归而没归（A/C/D 共 83 条）——不是内容不够，是认领没做完。

## D 档：主轴漏认（12 条）

⚠ **不要照落**：主轴刚按「一切立势不进主轴」清过（砍了临安落脚／剑玉姬真身／登云府提亲／斩李辅国四条）。这 12 条须逐条对两根支柱——血脉（岳血后裔／小紫／月霜／赵飞燕／小玲儿）与太泉（古阵／秘境／超级用户）——不符的退回 C 或 A。

| seq | event | 名称 | 归属／理由 |
|---:|---|---|---|
| — | `lyl.event.plan_counterattack` | 制定反制计划 | 太泉核心区怎么过的反制计划；主轴只认领了蚁穴出口 `find_exit` 与之后的魔墟。 |
| — | `lyl.event.yin_yang_counter` | 阴阳鱼反击 | 核心区用阴阳鱼反击是太泉段中间杀局，主轴两端（蚁穴／魔墟）已认、本拍漏认。 |
| 768 | `lyl.event.taiquan_afterfall_09_beat` | 赵飞燕召见 | 赵飞燕：借求子仙符召见、汉宫内线就此接上，主轴血脉到秘境才认她 |
| 929 | `lyl.event.han_palace_endgame_06_beat` | 定陶王得救 | 赵飞燕：闻清语掳走她与赵合德——血脉承重被劫；定陶王已被云丹琉救下，不是本拍主料 |
| 1043 | `lyg.event.han_succession_05_beat` | 蛇夫人计划 | 蛇夫人计划要赵飞燕怀上程子以破局，是赵飞燕／程赵血脉支柱漏认。 |
| 1123 | `lyg.event.changgan_interlude_02_beat` | 百衲衣线索 | 百衲衣寻小公主岳霏，是岳血后裔支柱漏认（不是宋线已认领的索赔）。 |


### ⚠ 6 条已从 D 改判 A（2026-08-17）

用户裁定：「**小紫是很重要的角色，必须有自己的专属剧情**（哪有游戏不给女主剧情）」。

此前这 6 条只能往主轴塞，因为 Claude 在 Grok 任务书里自作主张写了「小紫是特例，不开线」——
**那不是用户裁定**，且理由站不住（"对主轴重要"不构成"不能有自己的线"，而她是全场事件层
出现最多的人：50 条／未认领 42）。塞进主轴又违反「一切立势不进主轴」那条判据——
**是这条自造规则造的死结，不是数据的问题**。

改判后归小紫本人的线（见人物线文档 §3，12 个插入点全是现成 event）：

| 381 | `lcq.event.s09_10_separation` | 失散收束 | 拒绝交出小紫、月霜线暂时失散，是血脉候选人的安危／归属，主轴未认领。 |
| 429 | `lcq.event.s10_10_xiaozi_crisis` | 小紫危局 | 小紫因伤势／异术失控吸血，要玩家当场按住——血脉承重的代价拍，主轴在江州段未认 |
| 698 | `lyl.event.taiquan_afterfall_04_beat` | 莫氏对质 | 小紫：与莫如霖对质碧姬旧事和珠宝失踪，是血脉／来历续拍，主轴停在了断 |
| 1209 | `lyg.event.s06_07` | 小紫准备晋级五级 | 小紫压不住修为要去渭水闭关晋级，是小紫血脉支柱漏认。 |
| 1216 | `lyg.event.s06_09` | 程宗扬心焦小紫未归，内宅报警铃响 | 小紫未归引发内宅警报，是她闭关／失踪血脉拍的下一拍。 |
| 1223 | `lyg.event.buddhist_conspiracy_02_beat` | 小紫失踪 | 小紫在渭水被鲛人掳走，是小紫血脉支柱漏认。 |

## C 档：二级线漏认（35 条）

按线分组见下方统计。补节点时按 `axisSeq` 插入正确位置，门禁会校序。

| seq | event | 名称 | 归属／理由 |
|---:|---|---|---|
| — | `lcq.event.s07_qinhui_join` | 秦桧归入麾下 | 殇侯把秦桧等手下交你差遣，是黑魔海庇护关系落地；秦桧本人未开价。 |
| 289 | `lcq.event.s08_04_sudaji_enters` | 苏妲己入局 | 苏妲己代表黑魔海直入建康庭院摊牌，链上从殇侯击掌跳到内隙，漏了这一拍。 |
| 297 | `lcq.event.s08_05_breakthrough` | 入微突破 | 九阳入微逼退苏妲己，是黑魔海建康高压的收束战，同样未被认领。 |
| 347 | `lcq.event.s09_03_xiaozi_wounded` | 小紫重伤 | 苏妲己暗算致小紫重伤坠江，是黑魔海在建康的追杀，链上未认领。 |
| 362 | `lcq.event.s09_05_drain_escape` | 排水沟沉江 | 苏妲己追到排水沟、三人沉江逃出建康，是黑魔海追杀的收束，链未认领。 |
| 397 | `lcq.event.s10_03_ninja_trace` | 东瀛忍者现踪 | 晴州再浮东瀛女忍／黑魔海暗线，链上从内隙直接跳到捣巢，漏了这节追踪。 |
| 433 | `lcq.event.s11_01_pengri_arrives` | 捧日军抵烈山 | 宋国：捧日军抵烈山、三川口成形，玩家可侦察；宋线只认了粮战／围城，没认这支御林军到位 |
| 500 | `lcq.event.s12_06_dragon_guard_routs` | 龙卫第一军溃败 | 星月湖：桑怿战死、龙卫第一军被撕开，是三川口之后反攻高潮；星月湖线跳到了接管鹏翼社 |
| 505 | `lcq.event.s12_07_left_wing_raid` | 突袭龙卫左厢 | 星月湖：突袭龙卫左厢、摧毁指挥体系，同属未认领的江州反攻链 |
| 511 | `lcq.event.s12_08_dingchuan_raid` | 定川寨奇袭 | 星月湖：孟非卿主持奇袭定川寨、志在阵斩葛怀敏，反攻链本体尚未有人认 |
| 516 | `lcq.event.s12_09_ge_huaimin_killed` | 葛怀敏伏诛 | 星月湖：定川寨外雷区斩葛怀敏、宋军主将线崩，是上一拍的完成键，两边都未入链故仍记本线漏认 |
| 539 | `lcq.event.s12_14_chenxing_appears` | 辰星七妖现身 | 黑魔海：辰星七妖＝龙宸刺客现身江州；小紫用法术点破身份，她是在场出手不是本拍开价 |
| 540 | `lcq.event.s12_15_capture_jingli` | 擒获惊理 | 黑魔海：擒惊理后明确写成「追查龙宸与黑魔海阴谋的入口」，本线未认这条江州入口 |
| 551 | `lyl.event.s01_01` | 江州宋军大溃与退军 | 宋国：夏用和／秦翰主持决战后退军，江州战役收束；宋线从火攻直接跳到临安落脚 |
| 553 | `lyl.event.s01_03` | 荆溪村寨被屠 | 宋国：王团练乡兵屠荆溪，是退军后的地方失控，后手要拿他做常平仓诱局 |
| 561 | `lyl.event.lin_an_bridge_03_beat` | 林娘子疑云 | 黑魔海：研判其经林娘子渗透禁军；访鲁智深只是问路，不是鲁的高光 |
| 569 | `lyl.event.xiaoyingzhou_blacksea_trap_01_beat` | 途中遇袭 | 宋国：赴梵天寺遭禁军伏击，林冲线外部压力升高；禁军出手尚未被宋线认领 |
| 589 | `lyl.event.xiaoyingzhou_blacksea_trap_04_beat` | 野猪林乱战 | 黑魔海：野猪林乱战里衣钵被夺、袈裟符文成线索；林冲重伤是战损，新料是符文 |
| 652 | `lyl.event.taiquan_sacred_fruit_08` | 殇侯出手 | 黑魔海：殇侯以赤婴粉耗尽真元后杀君雄飞；他没向玩家开价，是本线在太泉门口的漏拍 |
| 776 | `lyl.event.taiquan_afterfall_10_beat` | 襄城君受控 | 汉国：襄城君府里露出刺杀韩定国的暗线；小紫是已动手的执行者，本拍要查的是汉廷权斗 |
| 781 | `lyl.event.s05_05` | 黑鸦使者现身 | 黑魔海：黑鸦使者从宅下飞出、卧底暴露，本线在洛都未认这条眼线 |
| 785 | `lyl.event.s05_09` | 云氏金铢押运遇劫 | 晋国：云氏五万金铢被龙宸劫走，对上晋线已写的「广源行／龙宸旧账」，却没人认这记劫镖 |
| 925 | `lyl.event.han_palace_endgame_05_beat` | 吕巨君自焚 | 汉国：吕巨君自焚、诸吕旧局急转；汉线认了真空／拥立／吕冀赐死，没认这一拍自裁 |
| 949 | `lyg.event.s01_02` | 贾文和劫持定陶王 | 汉国：贾文和挟定陶王为人质对峙放行；汉线认了拥立／承认定陶王，没认这记劫持 |
| 950 | `lyg.event.s01_03` | 董卓挟持定陶王出洛都 | 汉国：董卓率凉州军挟定陶王出洛都；已认的是「董卓无符入京」，出城挟持未认 |
| 951 | `lyg.event.s01_04` | 霍子孟见吕雉 | 汉国：吕雉在长秋宫宣布退位、处置吕冀、支持立定陶王——拥立的关键表态，链上没有这一拍 |
| 968 | `lyg.event.s01_08` | 阮香凝透露定陶王与盛姬关联 | 阮香凝点破定陶王因盛姬亲近她、盛姬是御姬奴，属黑魔海线漏认。 |
| 989 | `lyg.event.s02_01` | 郭解送葬 | 送葬并让郭靖袭舞阳侯，是汉国线封侯收束的现成拍，链上没认领。 |
| 995 | `lyg.event.s02_07` | 程宗扬探视金蜜镝并谈论帝统 | 金蜜镝默许借成亲改帝统，是汉廷权力漏拍，不是某人高光。 |
| 1038 | `lyg.event.han_succession_04_beat` | 拥立阴谋 | 中行说要害死后帝、拥立程宗扬，是汉国继统阴谋漏认。 |
| 1058 | `lyg.event.han_succession_10_beat` | 审问汪臻 | 审汪臻追白员外／诗文，是唐国穿越者线的种子，链上没认领。 |
| 1069 | `lyg.event.s03_04` | 潘金莲在长安出现 | 潘金莲在长安为杨玉环警戒现身，属黑魔海线漏认，她并未向玩家开价。 |
| 1206 | `lyg.event.s06_04` | 仇士良夺取神策军兵权并怀疑田令孜 | 仇士良夺神策军兵权并疑田令孜，是唐国北司兵权漏认。 |
| 1309 | `lyg.event.ganlu_aftershock_06_beat` | 杀李昂议 | 贾文和建议杀李昂、玩家要抉择，是唐国帝位去留漏认。 |
| 1399 | `lyg.event.shituolin_endgame_15_beat` | 黑魔海旧怨开放口 | 庵堂审讯齐羽仙追剑玉姬／泉玉姬与龙神旧怨，属黑魔海线开放口漏认。 |

## A 档：人物高光（36 条）

人物线还只在文档里（`docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md`），故本档落在文档而非代码。

| seq | event | 名称 | 归属／理由 |
|---:|---|---|---|
| — | `lcq.event.s07_debut_qinhui` | 秦桧初登场 | 秦桧首次到场，殇侯点破其「灵敏有余，志浅易变」，是他的来历／人品拍，不是黑魔海节点。 |
| — | `lyg.event.debut_daiqisi` | 佛堂善母 | 黛绮丝认定你是拯救者并誓为主仆，同时暴露摩尼教善母被十方丛林禁锢的来历与代价。 |
| — | `lyg.event.debut_lvzhi` | 凤辇临朝 | 吕雉凤辇临朝立威、点破霍子孟三面受制，是她本人的出场／开价；汉国认领的是 `s01_09` 赐死。 |
| — | `lyg.event.highlight_banchao_lamb_leg` | 班超羊腿镇场 | 班超以羊腿镇场立规矩、并为田荣留退路，是他自己的开价／代价，不归汉国权力链。 |
| — | `lyl.event.decide_yin_fulan_fate` | 局势收尾 | 决定尹馥兰（及何漪莲）去留，是她向玩家要一个位置的收束开价。 |
| — | `lyl.event.pan_jinlian_ambush` | 潘金莲的伏击 | 潘金莲在太泉核心区主动设伏向你下手，是她的杀着／开价，不是古阵节点。 |
| — | `lyl.event.yin_fulan_aid` | 尹馥兰出手相助 | 尹馥兰主动报伏、伸援手并要后续安排，是她向玩家开的价。 |
| 35 | `lcq.event.s02_06` | 程宗扬见苏妲己 | 苏妲己揭开商馆主人伪装并追问霓龙丝，是她向玩家要情报的开价；脱身另有主轴出馆拍。 |
| 80 | `lcq.event.s04_05` | 旱洪与易虎之死 | 易虎救人、受创、被洪吞没，是他自己的代价高光，不是赶路也不是昭南立场。 |
| 166 | `lcq.event.s05b_02_xiaozi_exposed` | 小紫暴露 | 质问并揭穿小紫的控制／伪装／残忍，是她自己的来历拍（主轴只认领了碧姬追问与倒戈）。 |
| 248 | `lcq.event.s07_04_zhuo_subdued` | 卓云君受制 | 卓云君在小紫压迫下崩溃失权，是她的代价拍；太乙把收服留给人物线，任务链未认领。 |
| 344 | `lcq.event.s09_02_yun_ruyao_faints` | 云如瑶昏厥 | 云如瑶突然昏厥，向玩家暴露她的病线／身体代价，不是晋国分赃过程。 |
| 359 | `lcq.event.s09_04_weaving_trade` | 织坊换局 | 小紫为拉链坊归属兴师问罪，以织坊交换平息，是她向玩家开的价。 |
| 484 | `lcq.event.s12_03_xiaozi_controls_zhuo` | 小紫压制卓云君 | 卓云君：她为保命当场放弃抵抗，受制关系重新锁定——是她的代价，不是小紫向玩家开价 |
| 560 | `lyl.event.lin_an_bridge_02_beat` | 小瀛洲初遇 | 李师师：初遇小瀛洲、要你护她，并卷入梁公子冲突——她自己的处境向玩家开口 |
| 562 | `lyl.event.lin_an_bridge_04_beat` | 明庆寺相会 | 林冲：明庆寺会面暴露他忍辱处境，并写成后续冲突入口——是他的代价，不是宋线节点 |
| 584 | `lyl.event.xiaoyingzhou_blacksea_trap_03_beat` | 林冲刺配 | 林冲：白虎堂后被刺配江州，这一拍要玩家去救——是他的诉求／代价 |
| 596 | `lyl.event.xiaoyingzhou_blacksea_trap_05_beat` | 静善夜袭 | 静善：为袈裟符文夜袭、向在场者动手索物——是她自己的开价 |
| 656 | `lyl.event.taiquan_sacred_fruit_09` | 酒店下毒乱战 | 左彤芝：宋三下毒要劫持的是她；武二郎只是在场打仗，本拍要处置的是她的安危 |
| 666 | `lyl.event.yu_baiying_truce` | 虞白樱的临时合作 | 虞白樱：脚踝受伤要求去魔墟救她，并可能提出合作条件——典型开价 |
| 688 | `lyl.event.taiquan_afterfall_02_beat` | 下水道救人 | 何漪莲／尹馥兰：被弃下水道、这一拍向玩家求救；小紫弃人只是成因，不是她向你开价 |
| 718 | `lyl.event.taiquan_afterfall_06_beat` | 云如瑶私奔 | 云如瑶：登门提亲受阻后被带走私奔——是她的去向／选择，不是晋国节点 |
| 910 | `lyl.event.han_palace_endgame_03_beat` | 含光殿救人 | 赵合德：含光殿要救的昭仪是她（入宫封昭仪已在她的人物料里），不是赵飞燕血脉节点 |
| 956 | `lyg.event.s01_06` | 郭解之死 | 郭解临终把定陶王托付给玩家，是他本人的托孤／代价。 |
| 957 | `lyg.event.s01_07` | 董卓之死 | 董卓自陈戎马收场并留下胡骑军情遗命，是他向玩家交的后事。 |
| 992 | `lyg.event.s02_04` | 云丹琉闯入质问婚事 | 云丹琉闯府质问遗忘婚事，是她向玩家讨的说法。 |
| 993 | `lyg.event.s02_05` | 程宗扬与云苍峰商议婚事与财政 | 云苍峰谈婚礼／纸钞并承诺支援十万金铢，是他向玩家开的价。 |
| 994 | `lyg.event.s02_06` | 程宗扬请霍子孟做媒 | 霍子孟应允国丧期间证婚，是他把政治信用押给玩家。 |
| 1033 | `lyg.event.han_succession_03_beat` | 吕雉入府 | 吕雉坦白弑君弑夫旧事并求留程府，是她向玩家要的安身。 |
| 1070 | `lyg.event.s03_05` | 袁天罡心态崩溃与道出经历 | 袁天罡崩溃自述底层穿越者来历与童身换预知的代价。 |
| 1071 | `lyg.event.s03_06` | 贾文和调查杨玉环背景 | 查到杨玉环四朝履历并疑与岳飞有关，是她来历向玩家摊开。 |
| 1116 | `lyg.event.changgan_interlude_01_beat` | 拜访李药师 | 李药师赠令箭并派南霁云，是他向玩家开的资源口。 |
| 1154 | `lyg.event.changgan_interlude_07_beat` | 赵飞燕病线 | 病中赵飞燕接受舞都会社并敞开支棱，是她向玩家要的安置。 |
| 1210 | `lyg.event.s06_08` | 程宗扬与白霓裳亲密并召吕雉侍寝 | 白霓裳要人安抚后庭恐惧，是她向玩家要的安置。 |
| 1281 | `lyg.event.ganlu_aftershock_01_beat` | 金身法王 | 释特昧普自封金身法王并邀玩家去慈恩寺，是他向玩家开的口。 |
| 1342 | `lyg.event.shituolin_endgame_03_beat` | 高阳疑冢 | 高阳疑冢超百丈、宫内报丧失踪，是他来历／下场向玩家暴露。 |

## B 档：场景子拍（95 条）

**不建节点**。这一档的价值是：说明那 95 条不是缺内容，而是已被上级 event 覆盖的过程细节。

| seq | event | 名称 | 归属／理由 |
|---:|---|---|---|
| — | `lyg.event.dengji_yuzuo_yinhuan` | 登基大典御座隐欢 | 主轴已认领 `lyg.event.han_succession_09_beat` 登基典仪行功，本拍是同场私密余波。 |
| — | `lyg.event.lvzhi_zhenjiu` | 亲裁诸吕 | 汉国已认领 `lyg.event.s01_09`「吕冀赐死，见证吕雉亲裁诸吕」，本拍是亲裁方案的前戏。 |
| 1 | `lcq.event.s01_01` | 程宗扬与段强穿越 | 主轴 `lcq.event.s01_05` 已把「从坠落处活下来走到帅帐」收口，本拍是穿越降落过程。 |
| 2 | `lcq.event.s01_02` | 段强被射杀 | 段强被射杀是坠落求生过程，并进主轴 `lcq.event.s01_05`；他未向玩家开价。 |
| 22 | `lcq.event.s02_03` | 秦军与罗马军团交战 | 同一战场邻部秦军溃散，是主轴已认领 `lcq.event.s02_02` 王哲殉军的观战过程。 |
| 31 | `lcq.event.s02_04` | 程宗扬在五原城被误抓为奴隶 | 被当逃奴烙印，是主轴 `lcq.event.baihu_shangguan_escape` 白湖死局的入口过程。 |
| 33 | `lcq.event.s02_05` | 程宗扬与阿姬曼·芭娜相遇 | 阿姬曼牢房圈套／戈龙伏击是出馆前的过程，并进 `lcq.event.baihu_shangguan_escape`；她只是局中饵，未自己开价。 |
| 65 | `lcq.event.s03b_snake_flower_bridge_05` | 巨藤断桥 | 万古巨藤断桥是昭南已认领 `lcq.event.s03b_snake_flower_bridge_04` 跟商队进南荒的赶路。 |
| 66 | `lcq.event.s03b_snake_flower_bridge_06` | 花苗救援 | 苏荔救援登崖是昭南 `lcq.event.s03b_snake_flower_bridge_07`「问清花苗站哪边」的接触／寒暄。 |
| 71 | `lcq.event.s04_02` | 鬼王峒武士袭击 | 路上遇鬼王峒武士，是花苗立场拍之后的遭遇战，并进 `lcq.event.s03b_snake_flower_bridge_07`。 |
| 75 | `lcq.event.s04_01` | 向导朱八八与鬼王峒计划 | 昭南已写明 Z3 把「密谋刺王」并进花苗立场，目标即 `lcq.event.s03b_snake_flower_bridge_07`。 |
| 88 | `lcq.event.s04b_lingfei_baiyi_crisis_01` | 夺镜计划 | 与武二郎商议夺镜，是后来查清白夷投峒的取证前置，并进昭南 `lcq.event.s04_07`。 |
| 91 | `lcq.event.s04b_lingfei_baiyi_crisis_03` | 斩杀鸦人 | 斩杀鸦人是黑魔海已认领 `lcq.event.s04b_lingfei_baiyi_crisis_04` 搜出羊皮纸之前的战斗过程。 |
| 95 | `lcq.event.s04b_lingfei_baiyi_crisis_05` | 取得灵飞镜 | 取得灵飞镜是查清白夷投峒的取证过程，并进昭南 `lcq.event.s04_07`。 |
| 96 | `lcq.event.s04b_lingfei_baiyi_crisis_06` | 花白联手 | 花苗／白夷商议联手，是「问清白夷站哪边」的立场寒暄，并进 `lcq.event.s04_07`。 |
| 100 | `lcq.event.s04b_lingfei_baiyi_crisis_07` | 水镜传讯苏妲己 | 水镜把羊皮纸线报给苏妲己并挨「别招惹」的骂，是黑魔海入口 `…_crisis_04` 的后续过程。 |
| 102 | `lcq.event.s04b_lingfei_baiyi_crisis_08` | 识破白夷阴谋 | 昭南已写明 Z4 把「识破投峒」并进白夷立场，目标即 `lcq.event.s04_07`。 |
| 103 | `lcq.event.s04b_lingfei_baiyi_crisis_09` | 白夷生变 | 昭南 Z4 同样并进「族长被换」，目标 `lcq.event.s04_07`。 |
| 105 | `lcq.event.s04b_lingfei_baiyi_crisis_10` | 地宫陷阱 | 追入地宫躲陷阱，是识破白夷投峒之后的追击过程，并进 `lcq.event.s04_07`。 |
| 106 | `lcq.event.s04b_lingfei_baiyi_crisis_11` | 血虎现身 | 血虎扑场是同一场地宫战的遭遇，并进 `lcq.event.s04_07`；易虎此时只是被改造的兵器，不再开价。 |
| 113 | `lcq.event.s04b_lingfei_baiyi_crisis_14` | 同往碧鲮 | 商议先同往碧鲮，是昭南已认领 `lcq.event.biling_bay_stance`「赶到碧鲮湾看立场」的动身决定。 |
| 119 | `lcq.event.s04b_lingfei_baiyi_crisis_17` | 鳄鱼险境 | 湿热盆地鳄鱼险是前往碧鲮的赶路，并进 `lcq.event.biling_bay_stance`。 |
| 122 | `lcq.event.s04b_lingfei_baiyi_crisis_19` | 大潮突至 | 大潮淹没竹楼后逃生，是主轴 `lcq.event.s04b_lingfei_baiyi_crisis_18` 谢艺说破遗腹女同夜的善后。 |
| 168 | `lcq.event.s05b_03_saan_secret_path` | 萨安情报 | 逼萨安问出密道，是昭南 `lcq.event.s05b_05a_meet_ghost_king` 潜入见鬼巫王的前置。 |
| 169 | `lcq.event.s05b_04_enter_ghost_palace` | 潜入鬼王宫 | 进入鬼王宫是「当面见鬼巫王」的入场／赶路，并进 `lcq.event.s05b_05a_meet_ghost_king`。 |
| 173 | `lcq.event.s05b_05b_ideology_duel_and_defeat` | 理念交锋与败退 | 昭南已写明 Z7 把理念交锋并进见鬼巫王，目标即 `lcq.event.s05b_05a_meet_ghost_king`。 |
| 180 | `lcq.event.s05b_08a_rescue_suli` | 井底营救苏荔 | 井底救苏荔是鬼王宫倒戈仗的过程，并进昭南／主轴 `lcq.event.s05b_10_slave_revolt_and_phoenix_change`；她未开新价。 |
| 182 | `lcq.event.s05b_08b_altar_corpse_fight_and_danchen` | 祭台尸鬼与丹宸 | 祭台尸鬼与丹宸之死是见鬼巫王同一场交锋的败退过程，并进 `lcq.event.s05b_05a_meet_ghost_king`。 |
| 189 | `lcq.event.s05b_09_temporary_pact_with_xiaozi` | 临时协定 | 主轴已声明「临时协定＋奴隶倒戈」并进倒戈拍，目标 `lcq.event.s05b_10_slave_revolt_and_phoenix_change`。 |
| 266 | `lcq.event.s07_08_palace_escape` | 宫险分逃 | 与云丹琉交手后分逃，是晋国已认领 `lcq.event.s07_07_dragon_hall` 夜探神龙殿的善后。 |
| 285 | `lcq.event.s08_02_wood_fort` | 木垒血战 | 木垒死守是晋国 `lcq.event.s08_01_eagle_valley` 鹰愁峪入瓮之后的战斗过程。 |
| 287 | `lcq.event.s08_03_beifu_rescue` | 北府兵解围 | 晋国已写明 J2 把北府解围并进入瓮拍，目标 `lcq.event.s08_01_eagle_valley`。 |
| 304 | `lcq.event.s08_07_palace_ninja` | 宫中忍影 | 击杀飞鸟熊藏、摸宫中线索，是晋国 `lcq.event.s08_10_xuanwu_rescue` 救驾前的宫中过程。 |
| 311 | `lcq.event.s08_09_zhaoming_night` | 昭明宫夜战 | 刑室逼走古冥隐，是星月湖已认领 `lcq.event.s08_08_gumingyin_plot` 点破第八骏的当夜对峙。 |
| 367 | `lcq.event.s09_07_feiniao_infiltration` | 飞鸟潜伏 | 假飞鸟潜伏摸广阳，是黑魔海已认领 `lcq.event.s09_06_blacksea_fracture` 查清内隙的潜入过程。 |
| 372 | `lcq.event.s09_08_six_doors_confession` | 六扇门供认 | 泉玉姬供认六扇门与擒月霜，是 `lcq.event.s09_06_blacksea_fracture` 节点文案「听她供认御姬奴」的审讯过程。 |
| 376 | `lcq.event.s09_09_jiangzhou_crisis` | 江州危急 | 揭穿泉玉姬御姬奴真身，是同一条黑魔海供认正文，并进 `lcq.event.s09_06_blacksea_fracture`。 |
| 390 | `lcq.event.s10_02_yeying_pass` | 夜影关封航 | 云水封航改走陆路，是宋国已认领 `lcq.event.s10_01_jiangzhou_order` 江州开打后的赶路。 |
| 419 | `lcq.event.s10_08_lair_reversal` | 巢穴逆转 | 并进 `lcq.event.s10_07_preemptive_strike`：黑魔海已认「捣江州巢穴」，此拍是洞穴战被鱼无夷毒网逆转的过程 |
| 421 | `lcq.event.s10_09_yin_yang_fish` | 阴阳鱼线索 | 并进 `lcq.event.s10_07_preemptive_strike`：该节点已写「拿到阴阳鱼」，七海客栈寻鱼是取物落地，不是新链 |
| 458 | `lcq.event.s11_07_camp_falls` | 中军陷落 | 并进 `lcq.event.s11_06_snow_battle`：三川口雪原鏖战的中军陷落，是同一场仗的过程 |
| 464 | `lcq.event.s11_08_jiangzhou_lockdown` | 江州戒严 | 并进 `lcq.event.s12_11_siege_begins`：兵临城下的全城戒严，是已认「江州围城」的前置城防 |
| 465 | `lcq.event.s11_09_grain_plan` | 粮战全盘 | 并进 `lcq.event.s11_02_cement_fortress`：宋线已认「问清粮战怎么做」，此拍是向云苍峰摊牌并布暗桩的实施 |
| 471 | `lcq.event.s11_10_sanchuankou_defeat` | 三川口败局 | 并进 `lcq.event.s11_06_snow_battle`：雪原「拼到底」的收束，宋军因后军脱逃溃败 |
| 481 | `lcq.event.s12_01_grain_route_blocked` | 粮路受阻 | 并进 `lcq.event.s11_02_cement_fortress`：粮战运路在浮凌江乱石滩卡住，属已认粮战的执行细节 |
| 489 | `lcq.event.s12_04_river_granary` | 江边设粮仓 | 并进 `lcq.event.s11_02_cement_fortress`：说服滕知州设江边仓、掩护运粮，是粮战落地，不是滕甫自己的高光 |
| 496 | `lcq.event.s12_05_granary_fire_plan` | 常平仓火计 | 并进 `lcq.event.s11_02_cement_fortress`：烧毁常平仓的操盘，仍是已认粮战的实操 |
| 533 | `lcq.event.s12_13_long_siege` | 长期围困 | 并进 `lcq.event.s12_11_siege_begins`：土山与地道的长期消耗，是已认围城的延续 |
| 550 | `lcq.event.s12_18_linan_grain_order` | 临安粮战令 | 并进 `lcq.event.s11_02_cement_fortress`：令秦桧在筠州抛粮、散布和谈，是粮战收束而非秦桧开价 |
| 552 | `lyl.event.s01_02` | 程宗扬离开江州赴临安 | 并进 `lyl.event.lin_an_bridge_01_beat`：乘船赴临安的赶路（途中谢幼度退敌只是在场打仗） |
| 554 | `lyl.event.s01_04` | 程宗扬与滕甫交易三十万石粮食 | 并进 `lcq.event.s11_02_cement_fortress`：与滕甫成交三十万石，是粮战的交割，不是滕甫另开一条价 |
| 555 | `lyl.event.s01_05` | 王团练上钩与常平仓失火 | 并进 `lcq.event.s11_02_cement_fortress`：诱王团练换粮、常平仓失火，是已策划火计的兑现 |
| 620 | `lyl.event.taiquan_sacred_fruit_02` | 黑魔海撤出谈判 | 并进 `lyl.event.xiaoyingzhou_cement_truce`：翠微园花厅谈撤出条件，是已认「水泥换五年不入宋」的善后分派 |
| 648 | `lyl.event.taiquan_sacred_fruit_07` | 抵达苍澜镇 | 并进 `lyl.event.taiquan_sacred_fruit_10`：苍澜镇采购备装、环境提示风险，是已认「争赤阳圣果」的赶路落地 |
| 668 | `lyl.event.taiquan_afterfall_01_beat` | 蚁穴脱险 | 并进 `lyl.event.find_exit`：与主轴「困在蚁穴里先找到出路」同一件事 |
| 728 | `lyl.event.taiquan_afterfall_07_beat` | 洛都风波 | 并进 `lyl.event.s05_01`：人到洛都、平亭侯下诏狱，汉线已把它降成「到城」地理拍，挂在买官立脚前 |
| 748 | `lyl.event.taiquan_afterfall_08_beat` | 卖官渠道 | 并进 `lyl.event.s05_01`：结交冯子都、探出卖官渠道，是已认「买下官身」的铺路 |
| 778 | `lyl.event.s05_02` | 徐璜同意买官名单 | 并进 `lyl.event.s05_01`：名单交给徐璜、八日筹八万金铢，是买官手续 |
| 780 | `lyl.event.s05_04` | 宅院被毁与哈迷蚩重伤 | 并进 `lyl.event.s05_03`：吕氏死士攻宅、哈迷蚩血战重伤，是已认「吕氏围杀」的宅院战；哈迷蚩没有向玩家开价 |
| 900 | `lyl.event.han_palace_endgame_01_beat` | 吕冀重伤 | 并进 `lyl.event.han_power_vacuum`：吕冀遭刺重伤，是已认「天子死、宫中真空」的引爆前因 |
| 904 | `lyl.event.han_palace_endgame_02_beat` | 左武军入宫 | 并进 `lyl.event.han_palace_endgame_08_beat`：吕巨君率左武军／兽蛮入宫，是已认宫变的入宫过程 |
| 916 | `lyl.event.han_palace_endgame_04_beat` | 复道遇伏 | 并进 `lyl.event.han_palace_endgame_07_beat`：复道遇伏、秦桧掩护脱身，是已认「抵达秘境入口」前的撤离 |
| 944 | `lyl.event.han_palace_endgame_09_beat` | 永安宫攻入 | 并进 `lyl.event.han_palace_endgame_08_beat`：攻入永安宫、刘建退守阙楼，是「刘建伏诛」的攻城过程 |
| 947 | `lyl.event.han_palace_endgame_10_beat` | 秦桧斩逆 | 并进 `lyl.event.han_palace_endgame_08_beat`：秦桧阙楼斩刘建，即该节点所写「刘建伏诛」本体 |
| 948 | `lyg.event.s01_01` | 秦桧斩刘建 | 并进 `lyl.event.han_palace_endgame_08_beat`：跨关重复「秦桧斩刘建」，不另开链 |
| 991 | `lyg.event.s02_03` | 程宗扬割腕输血救赵飞燕 | 割腕输血是已认领「保住赵飞燕」的疗伤过程，并进 `lyg.event.s02_02`。 |
| 1006 | `lyg.event.s02_09` | 程宗扬在武帝像前引发真龙异象 | 武帝像前真龙异象是已认领「安排秘境探索」的现场过程，并进 `lyg.event.s02_08`。 |
| 1013 | `lyg.event.han_succession_01_beat` | 帝陵分兵 | 帝陵分兵是护赵／登基前的赶路清场，并进 `lyg.event.han_succession_08_beat`。 |
| 1023 | `lyg.event.han_succession_02_beat` | 赵氏父兄失踪 | 赵氏父兄失踪是已认领「护住赵氏一门」的起因调查，并进 `lyg.event.han_succession_08_beat`。 |
| 1047 | `lyg.event.han_succession_06_beat` | 加速登基 | 加速定陶登基是已认领护赵／登基节点的推进，并进 `lyg.event.han_succession_08_beat`。 |
| 1048 | `lyg.event.han_succession_07_beat` | 长秋宫夜入 | 密道夜入交合是已认领登基行功的前段过程，并进 `lyg.event.han_succession_09_beat`。 |
| 1067 | `lyg.event.s03_02` | 程宗扬与祁远重逢叙旧 | 与祁远叙旧是已认领宣平坊落脚的寒暄，并进 `lyg.event.s03_01`。 |
| 1090 | `lyg.event.s03_09` | 程宗扬在紫云楼宴后夜访大慈恩寺 | 夜访慈恩、亮汉使救小紫出塔，是已认领围塔危机的收束，并进 `lyg.event.s03_08`。 |
| 1137 | `lyg.event.changgan_interlude_04_beat` | 密约谈崩 | 昭南密约谈崩是已认领「接下昭南索赔」的谈判过程，并进 `lyg.event.changgan_interlude_03_beat`。 |
| 1158 | `lyg.event.changgan_interlude_08_beat` | 以吕雉为饵 | 以吕雉为饵引十方丛林，是已认领「要刺汉使」的布局，并进 `lyg.event.changgan_interlude_06_beat`。 |
| 1177 | `lyg.event.changgan_interlude_09_beat` | 返程伏击 | 返程黑衣人伏击是刺汉使线的战斗过程，并进 `lyg.event.changgan_interlude_06_beat`。 |
| 1182 | `lyg.event.changgan_interlude_10_beat` | 救出白霓裳 | 救出白霓裳、击杀王守澄是刺汉使伏击的收束，并进 `lyg.event.changgan_interlude_06_beat`。 |
| 1207 | `lyg.event.s06_05` | 袁天罡与徐君房实施招魂术，王守澄鬼魂显形 | 招魂让王守澄显形是刺汉使／杀王守澄后的取证过程，并进 `lyg.event.changgan_interlude_06_beat`。 |
| 1208 | `lyg.event.s06_06` | 仇士良从王守澄鬼魂口中推断凶手指向田令孜 | 从鬼魂口供指向田令孜，仍是王守澄命案追查的收束，并进 `lyg.event.changgan_interlude_06_beat`。 |
| 1237 | `lyg.event.buddhist_conspiracy_04_beat` | 兴唐寺火遁 | 兴唐寺火遁斩龙宸是已认领「扛住十方丛林围杀」的战斗过程，并进 `lyg.event.buddhist_conspiracy_03_beat`。 |
| 1239 | `lyg.event.buddhist_conspiracy_05_beat` | 惊理争夺 | 截翼火蛇救惊理是围杀战里的救人子拍，并进 `lyg.event.buddhist_conspiracy_03_beat`。 |
| 1241 | `lyg.event.buddhist_conspiracy_06_beat` | 大雁塔佛咒 | 大雁塔佛咒幻境是围杀战的困局过程，并进 `lyg.event.buddhist_conspiracy_03_beat`。 |
| 1253 | `lyg.event.buddhist_conspiracy_07_beat` | 先取田令孜 | 先取田令孜是已认领「揭穿窥基伪诏」前的破局计策，并进 `lyg.event.buddhist_conspiracy_08_beat`。 |
| 1278 | `lyg.event.buddhist_conspiracy_09_beat` | 窥基众叛 | 众僧揭伪造法旨是已认领揭穿伪诏的当场面，并进 `lyg.event.buddhist_conspiracy_08_beat`。 |
| 1279 | `lyg.event.buddhist_conspiracy_10_beat` | 弃佛入魔 | 窥基刺胸弃佛遁走是揭穿伪诏的收束，并进 `lyg.event.buddhist_conspiracy_08_beat`。 |
| 1285 | `lyg.event.ganlu_aftershock_02_beat` | 蓬莱秘阁 | 持令入蓬莱秘阁探听是已认领「旁观李辅国审判」的入场过程，并进 `lyg.event.ganlu_aftershock_05_beat`。 |
| 1289 | `lyg.event.ganlu_aftershock_03_beat` | 长安劫掠 | 长安趁乱劫掠是已认领「甘露变爆发」的城内余波，并进 `lyg.event.buddhist_conspiracy_11_beat`。 |
| 1305 | `lyg.event.ganlu_aftershock_04_beat` | 秘阁供词 | 李训秘阁供词是审判拍的取证过程，并进 `lyg.event.ganlu_aftershock_05_beat`。 |
| 1312 | `lyg.event.ganlu_aftershock_07_beat` | 唐皇弑逆 | 鱼弘志弑李昂是已认领「唐皇被弑」的现场，并进 `lyg.event.ganlu_aftershock_05_beat`。 |
| 1313 | `lyg.event.ganlu_aftershock_08_beat` | 仇士良返宫 | 仇士良闻弑君返宫是审判／弑君后的探明，并进 `lyg.event.ganlu_aftershock_05_beat`。 |
| 1320 | `lyg.event.ganlu_aftershock_09_beat` | 惨案传闻 | 听罗令讲惨案是弑君余波转述，并进 `lyg.event.ganlu_aftershock_05_beat`。 |
| 1347 | `lyg.event.shituolin_endgame_04_beat` | 尸陀林主现身 | 窥基显尸陀林主真身是已认领「消灭窥基魔身」的开战，并进 `lyg.event.shituolin_endgame_05_beat`。 |
| 1355 | `lyg.event.shituolin_endgame_06_beat` | 江王入宫 | 江王入宫是已认领「阻止太皇太后被夺舍」前的入局，并进 `lyg.event.shituolin_endgame_13_beat`。 |
| 1358 | `lyg.event.shituolin_endgame_07_beat` | 太液池黑雾 | 太液池黑雾是夺舍法阵铺垫，并进 `lyg.event.shituolin_endgame_13_beat`。 |
| 1363 | `lyg.event.shituolin_endgame_08_beat` | 婆娑宝树 | 婆娑宝树／点明夺舍目标是夺舍预备过程，并进 `lyg.event.shituolin_endgame_13_beat`。 |

## E 档：背景（8 条）

世界在动但玩家无事可做。不归任何链，留作氛围。

| seq | event | 名称 | 归属／理由 |
|---:|---|---|---|
| — | `lyg.event.buddhist_conspiracy_lore_nuclear_treaty` | 核武不扩散条约·惊魂 | 「核武不扩散」谐音梗一次性趣谈，不推进唐国围杀链，也无可做的线内事。 |
| — | `lyg.event.yangwuhou_rumor` | 《阳武侯小史》流言四起 | 《阳武侯小史》是汉都舆论炮制的假血统笑话，不归岳血支柱，也不进汉国旧案／拥立链。 |
| 644 | `lyl.event.taiquan_sacred_fruit_06` | 盘江股东大会 | 盘江程氏股东大会（分红／股票／粮业），世界在动但不归八条线或两根主轴 |
| 1204 | `lyg.event.s06_02` | 凉州盟比武大赛进展 | 凉州盟比武晋级是场外赛事在走，不归八条链或血脉／太泉。 |
| 1205 | `lyg.event.s06_03` | 阮香琳离开程宅返回舞都 | 遣阮香琳回舞都报信是内宅差事，她未向玩家开价，也不归任何链。 |
| 1217 | `lyg.event.buddhist_conspiracy_01_beat` | 宦官嫁祸 | 李宏自残嫁祸是北司内讧表演，玩家只到场看现场，不归已认领甘露节点。 |
| 1321 | `lyg.event.shituolin_endgame_01_beat` | 宦官再分权 | 李辅国重分宦官职权，玩家只去内侍省探听，没有可站的队。 |
| 1335 | `lyg.event.shituolin_endgame_02_beat` | 独柳树刑场 | 独柳树腰斩宰执是恐怖统治在演，玩家赶去看行刑，不归链。 |

## C 档按线分布

- **黑魔海** 15 条
- **汉国** 7 条
- **宋国** 4 条
- **星月湖** 4 条
- **唐国** 3 条
- **晋国** 1 条

黑魔海占 15 条，远超其他线——它是"✅ 最多"的一条，却认领得最少。
