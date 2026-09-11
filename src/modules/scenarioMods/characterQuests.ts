/**
 * 第三级：人物任务。
 *
 * **形态是插入段，不是第三条节点序列**（用户裁定 2026-08-16）：
 *
 * > 「角色剧情是**二级线的下层插入事件**……这样才能产生——
 * >  **如果这个角色不在场，这个 event 会变成另外一个样**的效果。」
 *
 * 所以每一拍都挂在一个**已存在的故事 event** 上，回答的是「这一拍因为带着谁而不同」，
 * 而不是「第几步做什么」。三级权重依次递减：主轴 － 二级线 － 人物任务；
 * 人物任务**不抢上级已认领的 event**，只在它下面当插入段（`insert`）。
 *
 * 数据由 `docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md` 机械抽取生成，
 * 抽取器见 scratchpad `extract_cq.py`／`gen_cq.py`。**改内容改文档再重抽，不要手改本文件的表。**
 * 抽取时逐条把文档里的 id 解析成真实 event id（跨书重名用 `axisSeq` 消歧），
 * 解析不了的会报错——所以本文件里的 `ready`／`insert` id 都是真实存在的。
 */

export type CharacterBeatStatus =
  /** 已有独立 event 承载这一拍。 */
  | 'ready'
  /** 正典有、游戏没落地，`eventIds` 是建议 id，**尚不存在**。 */
  | 'new'
  /** 挂在上级链已认领的 event 下面当插入段——同一拍，两边读到的东西不同。 */
  | 'insert';

export interface CharacterQuestBeat {
  /** 制作侧事件结果摘要；玩家目标由绑定 event 的固定 objective 提供。 */
  reviewSummary: string;
  status: CharacterBeatStatus;
  /** `ready`／`insert` 为真实 event id（两拍并进时多个）；`new` 为建议 id。 */
  eventIds: string[];
}

export interface CharacterQuest {
  id: string;
  /** 人物名——与正典角色表同名，供 UI 与提示词直接用。 */
  name: string;
  beats: CharacterQuestBeat[];
}

/**
 * A 档单点高光：**不成线**，但这一拍是属于这个人的。
 *
 * 来源是孤儿归类（2026-08-17）——它们本来就在事件层里，只是没人认领。
 * 「料不够并不是这个角色不需要登场的理由」（用户裁定），故一律保留为挂点，
 * 够料的日后升格成 `CHARACTER_QUESTS` 里的线。
 */
export interface CharacterHighlight {
  name: string;
  /** 这一拍/这几拍的真实 event id。 */
  eventIds: string[];
  /** 制作侧摘要；不直接作为玩家任务目标。 */
  reviewSummary: string;
}

export const CHARACTER_QUESTS: CharacterQuest[] = [
  {
    id: 'xiaozi',
    name: '小紫',
    beats: [
      { reviewSummary: '你质问她，揭穿她一直在用的控制手段——她不是白痴', status: 'ready', eventIds: ['lcq.event.s05b_02_xiaozi_exposed'] },
      { reviewSummary: '她把乐明珠捉进深井。你下去救人，也第一次看清她做事的方式', status: 'ready', eventIds: ['lcq.event.s05b_07_xiaozi_trap'] },
      { reviewSummary: '她以毒戒制服卓云君，再用细针秘术把人压成玩物', status: 'ready', eventIds: ['lcq.event.s07_03_xiaozi_appears'] },
      { reviewSummary: '她重伤——你得决定护到什么程度', status: 'ready', eventIds: ['lcq.event.s09_03_xiaozi_wounded'] },
      { reviewSummary: '江州要人，你拒绝交出她', status: 'ready', eventIds: ['lcq.event.s09_10_separation'] },
      { reviewSummary: '兰汤馆，她压不住要吸血——你当场按住她', status: 'ready', eventIds: ['lcq.event.s10_10_xiaozi_crisis'] },
      { reviewSummary: '她以幽冥宗法术出手，点破辰星七妖，并牵出龙宸', status: 'insert', eventIds: ['lcq.event.s12_14_chenxing_appears'] },
      { reviewSummary: '她与莫如霖对质母亲碧姬的旧事', status: 'ready', eventIds: ['lyl.event.taiquan_afterfall_04_beat'] },
      { reviewSummary: '你向杨玉环打听离魂症——她母亲的病，可能也在她身上', status: 'ready', eventIds: ['lyg.event.s06_01'] },
      { reviewSummary: '送她到渭水水下闭关，冲五级', status: 'ready', eventIds: ['lyg.event.s06_07'] },
      { reviewSummary: '她没回来。内宅警铃响', status: 'ready', eventIds: ['lyg.event.s06_09'] },
      { reviewSummary: '她在渭水被掳走。你去找她', status: 'ready', eventIds: ['lyg.event.buddhist_conspiracy_02_beat'] },
    ],
  },
  {
    id: 'zhuoyunjun',
    name: '卓云君',
    beats: [
      { reviewSummary: '半兽人围上来。她用烈火法术救下你和月霜', status: 'insert', eventIds: ['lcq.event.s01_03'] },
      { reviewSummary: '玄真观：你斩杀吴行德，救下她', status: 'ready', eventIds: ['lcq.event.s07_02_kill_wu'] },
      { reviewSummary: '小紫以毒戒制服重伤的她；细针秘术和残酷折磨让这位太乙教御彻底崩溃，沦为任人摆布的玩物', status: 'ready', eventIds: ['lcq.event.s07_03_xiaozi_appears', 'lcq.event.s07_04_zhuo_subdued'] },
      { reviewSummary: '你与小紫设局，迫使她放弃抵抗，同意以性奴身份赚钱赎身', status: 'ready', eventIds: ['lcq.event.s07_09_hengtang_ambush'] },
      { reviewSummary: '同夜你为她破处，确立人身依附。她坦白：失身是恩将仇报的报应；师叔被蔺采泉杀害；求你杀蔺，承诺终身为你的妓女', status: 'new', eventIds: ['lcq.event.s07_zhuo_price'] },
      { reviewSummary: '沐羽城庆典，你认出云中仙子就是她。小紫以更高权威再压一次，她为保命放弃抵抗，并指导徒儿侍奉', status: 'ready', eventIds: ['lcq.event.s12_02_recognize_zhuo', 'lcq.event.s12_03_xiaozi_controls_zhuo'] },
      { reviewSummary: '你以「新任掌教」身份迫使她与申婉盈屈服，胁迫双修', status: 'new', eventIds: ['lcq.event.s12_zhuo_forced'] },
      { reviewSummary: '翠微园。她把 ZY5 的价拿到你面前兑现：你承诺对付现任掌教蔺采泉，并写下盘江程氏股份', status: 'insert', eventIds: ['lyl.event.sacred_against_lin', 'lyl.event.taiquan_sacred_fruit_02'] },
    ],
  },
  {
    id: 'xieyi',
    name: '谢艺',
    beats: [
      { reviewSummary: '空村里，他指出尸体旁的鬼王峒血符。你第一次看见他本人动手', status: 'insert', eventIds: ['lcq.event.s03b_snake_flower_bridge_03', 'lcq.event.s03_12'] },
      { reviewSummary: '他独入地宫，杀光使者与武士，拷问碧宛下落无果后斩首', status: 'ready', eventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_13'] },
      { reviewSummary: '你质问阿夕异常。他承认设计让你接触阿葭，并暗示灵飞镜会在南荒重逢', status: 'ready', eventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_15'] },
      { reviewSummary: '他换上现代休闲装，跟你谈玻璃，并吐出岳帅晕血、遗腹女', status: 'ready', eventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_18'] },
      { reviewSummary: '他讲清海湾旧战与朱狐冠，并希望你继承岳帅的使命。你保持警惕', status: 'ready', eventIds: ['lcq.event.xieyi_biling_war'] },
      { reviewSummary: '龙神这一仗后，你赶到重伤的他身边，听清把小紫带往星月湖的托付', status: 'insert', eventIds: ['lcq.event.xieyi_entrustment'] },
    ],
  },
  {
    id: 'lemingzhu',
    name: '乐明珠',
    beats: [
      { reviewSummary: '她承认自己是光明观堂弟子，假扮新娘是为了刺杀鬼巫王', status: 'insert', eventIds: ['lcq.event.s04_03'] },
      { reviewSummary: '她挺身战鸦人，经验不够被擒。你在鸦人营地救她', status: 'ready', eventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_02'] },
      { reviewSummary: '废弃海神殿：鲛人因朱狐冠发狂。你护住她，拔掉卡在她身上的鱼叉', status: 'new', eventIds: ['lcq.event.s04b_lemingzhu_haishen'] },
      { reviewSummary: '鬼王宫里她脱险现身，你与她重逢', status: 'ready', eventIds: ['lcq.event.s05b_06_breakout_and_reunion'] },
      { reviewSummary: '小紫把她捉进深井。你追下去营救', status: 'ready', eventIds: ['lcq.event.s05b_07_xiaozi_trap'] },
      { reviewSummary: '花房：师姐潘金莲闯入，发现她与你、小紫在一起，强行把她带回师门', status: 'new', eventIds: ['lcq.event.s07_pan_takes_pearl'] },
      { reviewSummary: '岸边重逢。她决定随你同船去晴州，参与筹建慈幼院', status: 'new', eventIds: ['lcq.event.s10_lemingzhu_returns'] },
    ],
  },
  {
    id: 'xiaoyaoyi',
    name: '萧遥逸',
    beats: [
      { reviewSummary: '他在左武旧案之前上门：死则接骨灰，生还则接伤员', status: 'ready', eventIds: ['lcq.event.xiaoyaoyi_arrives'] },
      { reviewSummary: '舟侧两名水鬼。他警觉，与你联手击杀', status: 'ready', eventIds: ['lcq.event.s07_06_water_assassins'] },
      { reviewSummary: '他告诉你：王大将军战死可能有内奸。线索指向拜火教', status: 'ready', eventIds: ['lcq.event.s07_10_dragon_fang'] },
      { reviewSummary: '他代表星月湖宣布：全力支持你，向你开放所有资源', status: 'insert', eventIds: ['lcq.event.xiao_opens_resources'] },
      { reviewSummary: '苏妲己追杀你。他和小紫赶到，把人打退', status: 'ready', eventIds: ['lcq.event.s08_06_pursuit_repelled'] },
      { reviewSummary: '秦翰生擒他。你救不救', status: 'insert', eventIds: ['lcq.event.s12_10_rescue_xiao'] },
    ],
  },
  {
    id: 'yangyuhuan',
    name: '杨玉环',
    beats: [
      { reviewSummary: '你留在现场，完成这块招牌接触卡', status: 'ready', eventIds: ['lyg.event.debut_yangyuhuan'] },
      { reviewSummary: '长安街：她驾车把人踩在地上训。对上眼', status: 'insert', eventIds: ['lyg.event.s03_03'] },
      { reviewSummary: '紫云楼顶层：她出题（云如瑶、密码箱、手枪）。你答过关', status: 'ready', eventIds: ['lyg.event.s03_07'] },
      { reviewSummary: '她当众称你姑父，看宗室什么脸。你接下或拆穿', status: 'ready', eventIds: ['lyg.event.changgan_interlude_05_beat'] },
      { reviewSummary: '你向她打听离魂症。她想起岳帅提过类似的病，警告不能让外人知道', status: 'ready', eventIds: ['lyg.event.s06_01'] },
    ],
  },
  {
    id: 'zhaohede',
    name: '赵合德',
    beats: [
      { reviewSummary: '玉佩逼她承认：皇后胞妹，上清观避祸', status: 'ready', eventIds: ['lyl.event.debut_zhaohede'] },
      { reviewSummary: '徐璜传口谕：送她入宫封昭仪，应二鹅之象', status: 'ready', eventIds: ['lyl.event.s05_06'] },
      { reviewSummary: '乐津里人市：你用昭仪身份诱友通期去做替身', status: 'ready', eventIds: ['lyl.event.s05_07'] },
      { reviewSummary: '你把方案说给她听。她同意，并问自己怎么办', status: 'ready', eventIds: ['lyl.event.s05_08'] },
      { reviewSummary: '天子暴毙。你扮内侍，把她和赵飞燕从昭阳宫送回长秋宫', status: 'new', eventIds: ['lyl.event.han_escort_zhao'] },
      { reviewSummary: '山谷里你杀魏疾救下她。事后她同意做妾，约定关系', status: 'new', eventIds: ['lyg.event.mijing_zhaohede_concubine'] },
    ],
  },
  {
    id: 'ningyu',
    name: '凝羽',
    beats: [
      { reviewSummary: '她以肉体为诱，要求你用巫术与她合作除掉苏妲己，并说自己也会赴死。随后双修，你探明她体内阴寒之气来自西门庆把她当鼎炉调教', status: 'new', eventIds: ['lcq.event.s03b_ningyu_regicide'] },
      { reviewSummary: '蛇彝人袭来。她斩杀来敌', status: 'ready', eventIds: ['lcq.event.s03b_snake_flower_bridge_01'] },
      { reviewSummary: '她因麻古成瘾痛苦。你向乐明珠求解毒', status: 'ready', eventIds: ['lcq.event.s04_06'] },
      { reviewSummary: '她从暗处刺穿鬼王峒使者的手掌', status: 'ready', eventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_12'] },
    ],
  },
];

export const CHARACTER_HIGHLIGHTS: CharacterHighlight[] = [
  { name: '尹馥兰', eventIds: ['lyl.event.yin_fulan_aid', 'lyl.event.taiquan_afterfall_02_beat', 'lyl.event.decide_yin_fulan_fate'], reviewSummary: 'yin_fulan_aid 主动报伏并要后续安排／taiquan_afterfall_02_beat (688) 被弃下水道向你求救／decide_yin_fulan_fate 决定她与何漪莲的去留' },
  { name: '吕雉', eventIds: ['lyg.event.debut_lvzhi', 'lyg.event.han_succession_03_beat'], reviewSummary: 'debut_lvzhi 凤辇临朝立威、点破霍子孟三面受制／han_succession_03_beat (1033) 坦白弑君弑夫旧事、求留程府' },
  { name: '云如瑶', eventIds: ['lcq.event.s09_02_yun_ruyao_faints', 'lyl.event.taiquan_afterfall_06_beat'], reviewSummary: 's09_02_yun_ruyao_faints (344) 昏厥暴露病线／taiquan_afterfall_06_beat (718) 提亲受阻后私奔' },
  { name: '林冲', eventIds: ['lyl.event.lin_an_bridge_04_beat', 'lyl.event.xiaoyingzhou_blacksea_trap_03_beat'], reviewSummary: 'lin_an_bridge_04_beat (562) 明庆寺相会暴露忍辱处境／xiaoyingzhou_blacksea_trap_03_beat (584) 白虎堂后刺配江州，要你去救' },
  { name: '卓云君', eventIds: ['lcq.event.s07_04_zhuo_subdued', 'lcq.event.s12_03_xiaozi_controls_zhuo'], reviewSummary: 's07_04_zhuo_subdued (248) 崩溃失权／s12_03_xiaozi_controls_zhuo (484) 为保命放弃抵抗' },
  { name: '黛绮丝', eventIds: ['lyg.event.debut_daiqisi'], reviewSummary: '认定你是拯救者、誓为主仆，暴露摩尼教善母被禁锢的来历' },
  { name: '苏妲己', eventIds: ['lcq.event.s02_06'], reviewSummary: '揭开商馆主人伪装、追问霓龙丝——她向你要情报' },
  { name: '易虎', eventIds: ['lcq.event.s04_05'], reviewSummary: '救人受创、被洪水吞没——他自己的代价' },
  { name: '李师师', eventIds: ['lyl.event.lin_an_bridge_02_beat'], reviewSummary: '初遇小瀛洲、要你护她' },
  { name: '静善', eventIds: ['lyl.event.xiaoyingzhou_blacksea_trap_05_beat'], reviewSummary: '为袈裟符文夜袭索物' },
  { name: '虞白樱', eventIds: ['lyl.event.yu_baiying_truce'], reviewSummary: '脚踝受伤要你去魔墟救她，并提合作条件' },
  { name: '左彤芝', eventIds: ['lyl.event.taiquan_sacred_fruit_09'], reviewSummary: '宋三下毒要劫持的是她（武二郎只是在场）' },
  { name: '郭解', eventIds: ['lyg.event.s01_06'], reviewSummary: '临终把定陶王托付给你' },
  { name: '董卓', eventIds: ['lyg.event.s01_07'], reviewSummary: '自陈戎马收场，留下胡骑军情遗命' },
  { name: '赵合德', eventIds: ['lyl.event.han_palace_endgame_03_beat'], reviewSummary: '含光殿要救的昭仪是她' },
  { name: '云丹琉', eventIds: ['lyg.event.s02_04'], reviewSummary: '闯府质问被遗忘的婚事' },
  { name: '云苍峰', eventIds: ['lyg.event.s02_05'], reviewSummary: '谈婚礼与纸钞，承诺支援十万金铢' },
  { name: '霍子孟', eventIds: ['lyg.event.s02_06'], reviewSummary: '国丧期间应允证婚，把政治信用押给你' },
  { name: '秦桧', eventIds: ['lcq.event.s07_debut_qinhui'], reviewSummary: '殇侯点破他「灵敏有余，志浅易变」' },
  { name: '班超', eventIds: ['lyg.event.highlight_banchao_lamb_leg'], reviewSummary: '羊腿镇场立规矩，为田荣留退路' },
  { name: '潘金莲', eventIds: ['lyl.event.pan_jinlian_ambush'], reviewSummary: '在太泉核心区主动设伏' },
  { name: '袁天罡', eventIds: ['lyg.event.s03_05'], reviewSummary: '自述底层穿越者来历、童身换预知的代价' },
  { name: '杨玉环', eventIds: ['lyg.event.s03_06'], reviewSummary: '四朝履历被查到，疑与岳飞有关' },
  { name: '李药师', eventIds: ['lyg.event.changgan_interlude_01_beat'], reviewSummary: '赠令箭、派南霁云——向你开资源口' },
  { name: '赵飞燕', eventIds: ['lyg.event.changgan_interlude_07_beat'], reviewSummary: '病中接受舞都会社，要一个安置' },
  { name: '白霓裳', eventIds: ['lyg.event.s06_08'], reviewSummary: '要人安抚后庭恐惧' },
  { name: '释特昧普', eventIds: ['lyg.event.ganlu_aftershock_01_beat'], reviewSummary: '自封金身法王，邀你去慈恩寺' },
  { name: '高阳', eventIds: ['lyg.event.shituolin_endgame_03_beat'], reviewSummary: '疑冢超百丈、宫内报丧失踪——他的下场' },
  { name: '小紫', eventIds: ['lcq.event.s09_04_weaving_trade'], reviewSummary: '为拉链坊归属兴师问罪，以织坊交换平息（补进 §3）' },
  { name: '吕雉', eventIds: ['lyg.event.s03_08'], reviewSummary: '塔里不止小紫——汉太后落在十方丛林手里' },
  { name: '吕雉', eventIds: ['lyg.event.shituolin_endgame_12_beat'], reviewSummary: '他扑上来咬她，把真身露给你——三度失算里有她' },
  { name: '秦桧', eventIds: ['lyl.event.mingqingsi_lin_lu_meeting'], reviewSummary: '他急着上去攀林鲁——你按住的是这股热乎' },
  { name: '秦桧', eventIds: ['lyl.event.decide_chase_weiyuan'], reviewSummary: '观堂不管弟子家事——打听高衙内和失镖，你仍压给他' },
  { name: '惊理', eventIds: ['lyl.event.debut_jingli'], reviewSummary: '庭院刺杀里露面——瑶池宗叛出去的那个，如今替龙宸拿刀' },
  { name: '惊理', eventIds: ['lcq.event.s12_15_capture_jingli'], reviewSummary: '小紫抽了她的阴魂——她成了你追龙宸的活口' },
  { name: '惊理', eventIds: ['lyg.event.buddhist_conspiracy_05_beat'], reviewSummary: '魏博牙兵、僧人和龙宸抢她——她这条命现在值钱了' },
  { name: '乐明珠', eventIds: ['lcq.event.debut_lemingzhu'], reviewSummary: '商队沿白象足迹进入密林途中——花苗族待嫁新娘（随商队前往鬼王峒完婚），随身携带师' },
  { name: '云丹琉', eventIds: ['lyl.event.debut_yundanliu'], reviewSummary: '云家海蜃楼院中，程宗扬翻墙逃匿时被其喝问——云家大小姐（贵族世家出身的年轻女子）' },
  { name: '云如瑶', eventIds: ['lyl.event.debut_yunruyao'], reviewSummary: '云宅小楼楼梯尽头——云苍峰之庶出幼妹，病弱足不出户的闺阁少女' },
  { name: '剑玉姬', eventIds: ['lyl.event.debut_jianyuji'], reviewSummary: '游婵与程宗扬密会时提及——黑魔海「仙姬」/上位供奉，通过游婵传讯' },
  { name: '卓云君', eventIds: ['lyl.event.debut_zhuoyunjun'], reviewSummary: '程宗扬在临安某处——太乙真宗教御（蔺贼势力败落后被小紫收服的逃亡者，三魂七魄留有' },
  { name: '尹馥兰', eventIds: ['lyl.event.debut_yinfulan'], reviewSummary: '建康，程宅——醉月楼老鸨（青楼管事）' },
  { name: '成光', eventIds: ['lyg.event.debut_chengguang'], reviewSummary: '一处宴席场所——仅以"江都王王后"身份被提及，尚未正式登场' },
  { name: '月霜', eventIds: ['lcq.event.debut_yueshuang'], reviewSummary: '太乙真宗众人救下受伤的月霜途中——大汉左武军第一军团帅帐亲兵，左武卫大将军王哲的' },
  { name: '泉玉姬', eventIds: ['lyg.event.debut_quanyuji'], reviewSummary: '建康徐府内院，刑案现场——长安六扇门女捕头' },
  { name: '潘金莲', eventIds: ['lcq.event.debut_panjinlian'], reviewSummary: '程宗扬居所/建康商馆房间——光明观堂弟子，乐明珠的师姐，武二郎的准嫂嫂' },
  { name: '白霓裳', eventIds: ['lyg.event.debut_bainichang'], reviewSummary: '静室内，赵归真引荐——瑶池宗奉玦仙子，瑶池宗未来宗主候选人' },
  { name: '萧遥逸', eventIds: ['lcq.event.xiaoyaoyi_arrives'], reviewSummary: '少陵侯嫡子萧遥逸在左武旧案之前上门，按谢艺命运接骨灰或接伤员。' },
  { name: '蛇夫人', eventIds: ['lyg.event.debut_shefuren'], reviewSummary: '程宗扬通过窥视孔偷看卧室——小紫的侍奴、江湖中人' },
  { name: '贾文和', eventIds: ['lyg.event.debut_jiawenhe'], reviewSummary: '凉州军逼近洛都城门，战车之上——破虏将军董卓麾下谋士' },
  { name: '齐羽仙', eventIds: ['lyg.event.debut_qiyuxian'], reviewSummary: '翠微园门外，夜间阶下——黑魔海剑玉姬麾下得力干将，程宗扬旧识' },
  { name: '小紫', eventIds: ['lcq.event.s03b_snake_flower_bridge_03'], reviewSummary: '听祁远、谢艺确认蛇彝村是鬼王峒血符屠村——商队仓促撤离' },
  { name: '小紫', eventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_18'], reviewSummary: '听谢艺谈玻璃技术，并说破岳帅晕血、还有个遗腹女' },
  { name: '小紫', eventIds: ['lcq.event.geluo_summons_biji'], reviewSummary: '阁罗召来碧姬，你当面见到谢艺要找的人' },
  { name: '小紫', eventIds: ['lcq.event.s05b_01_binu_reveals_xiaozi'], reviewSummary: '向碧姬问出：小紫曾主动投向鬼巫王——她不是单纯受害者' },
  { name: '小紫', eventIds: ['lcq.event.s05b_10_slave_revolt_and_phoenix_change'], reviewSummary: '小紫倒戈、奴隶暴动，你决定趁乱反杀——乐明珠凤凰宝典异变' },
  { name: '小紫', eventIds: ['lcq.event.slay_dragon'], reviewSummary: '借小紫指点刺穿龙颅，龙神坠亡' },
  { name: '赵飞燕', eventIds: ['lyl.event.taiquan_afterfall_09_beat'], reviewSummary: '经徐璜向赵飞燕献求子仙符，她因赵合德银链召见你' },
  { name: '赵飞燕', eventIds: ['lyl.event.han_palace_endgame_07_beat'], reviewSummary: '吕雉以比目鱼珠开秘境，小紫把盛姬投入光柱，众人进入' },
  { name: '赵飞燕', eventIds: ['lyg.event.s02_02'], reviewSummary: '赵飞燕中毒昏迷，你用自身血液给她输血' },
  { name: '赵飞燕', eventIds: ['lyg.event.s02_08'], reviewSummary: '在长秋宫分派旧部监控秘境入口，自己率侍奴去探胶西邸' },
  { name: '赵飞燕', eventIds: ['lyg.event.han_succession_08_beat'], reviewSummary: '真气失控昏迷，吕雉指出需双修炼化，赵飞燕以双修助你行功' },
  { name: '赵飞燕', eventIds: ['lyg.event.han_succession_09_beat'], reviewSummary: '因孟舍人死气失控，在登基典仪与赵飞燕双修，突破通幽境' },
  { name: '小紫', eventIds: ['lyg.event.changgan_interlude_02_beat'], reviewSummary: '马厩救出廖群玉：他携百衲衣寻岳霏，并牵到齐羽仙、周飞' },
];

/**
 * 当前这一拍上，有谁的戏。
 *
 * 这是人物任务唯一的运行时入口——它不问"进行到第几步"，只问
 * **"我现在踩着的这个 event，因为谁而不一样"**。这与形态一致：插入段不是序列。
 * `new` 的拍不返回：那些 event 还不存在，返回了就是把玩家指向走不到的地方。
 */
export function characterBeatsAt(eventId: string | undefined): Array<{ name: string; reviewSummary: string }> {
  if (!eventId) return [];
  const out: Array<{ name: string; reviewSummary: string }> = [];
  for (const quest of CHARACTER_QUESTS) {
    for (const beat of quest.beats) {
      if (beat.status !== 'new' && beat.eventIds.includes(eventId)) {
        out.push({ name: quest.name, reviewSummary: beat.reviewSummary });
      }
    }
  }
  for (const highlight of CHARACTER_HIGHLIGHTS) {
    if (highlight.eventIds.includes(eventId)) {
      out.push({ name: highlight.name, reviewSummary: highlight.reviewSummary });
    }
  }
  return out;
}

/** 每条人物线走了多少——只统计真实可走的拍（`new` 不计入分母，它还不存在）。 */
export function characterQuestProgress(
  completedEventIds: readonly string[] | undefined,
): Array<{ id: string; name: string; done: number; total: number }> {
  const done = new Set(completedEventIds || []);
  return CHARACTER_QUESTS.map(quest => {
    const walkable = quest.beats.filter(b => b.status !== 'new');
    return {
      id: quest.id,
      name: quest.name,
      // 一拍可能并进多个 event，任一完成即算这一拍走过。
      done: walkable.filter(b => b.eventIds.some(id => done.has(id))).length,
      total: walkable.length,
    };
  });
}
