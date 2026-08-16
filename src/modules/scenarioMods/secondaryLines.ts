/**
 * 二级线入口（R3-10）——把"能不能接到这条线"从模型自觉改成引擎确定性。
 *
 * 立项理由（2026-08-16 用户裁定）：
 *   「二级主线的发展不能靠 LLM 自己发挥，而是稳定可靠、随着玩家自己随时能够触发的
 *    （类似上古卷轴走到一个地方触发事件，接到派系主线任务）。
 *    LLM 的发挥尽量安排在那些非重要小支线或者流言这种程度。」
 *
 * 【锚的分类】用户裁定的规则，直接落在既有两类线上：
 *   · **国家／地区线 → 锚地点**：国家就是一片地，走到就算到了；
 *   · **宗派线 → 锚相关人**：宗派是一群人，得有人引你进门。
 *   秘密组织尤其如此——黑魔海不可能靠走进总坛加入，正典里程宗扬是毒宗系「被庇护者」，
 *   那层关系从殇侯（朱老头）来，不是从地理来。
 *
 * 【为什么不锚关卡】`canonRail.DEFAULT_LINE_QUARANTINED_STAGE_IDS` 让默认路线静默跳过
 * 8 个关卡。主轴已经因此死过 3 条节点。关卡编排会变，地点与人不会。
 *
 * 【为什么人物锚比地点锚还稳】它读相识账本（`acquaintanceLedger`，持久化＋跨关继承），
 * 而"见没见过某人"是**引擎落账的事实**，不是模型说了算。地点则依赖模型写的
 * `角色.位置.描述`，再由 `resolveCurrentScenarioLocation` 反查——多一道解析。
 *
 * 【纪律】本模块只回答"这条线现在接得到吗"，**不回答"玩家加入了没有"**。
 * 锚一满足就把入口指引作为**待办**显示——不设"接受任务"这道手续（用户裁定 2026-08-16）：
 * 与主线轴的长期方向同一口径，引擎只把话说清楚，照着做就是加入，不做也不损失什么。
 *
 * 归属与入口调研见 `docs/R3-10-SECONDARY-LINES-2026-08-16.md`
 * 与 `docs/R3-10-LINE-ENTRY-ANCHORS-2026-08-16.md`。
 */

import { acquaintanceOf, rankOf, type AcquaintanceLedger } from './acquaintanceLedger';

export type SecondaryLineKind = 'sect' | 'nation';

export interface SecondaryLine {
  id: string;
  name: string;
  kind: SecondaryLineKind;
  /** 宗派线：引你进门的人。多个＝任一见过即可（如星月湖的八骏，见谁都算搭上线）。 */
  anchorCharacterIds?: string[];
  /**
   * 国家／地区线：走到就算到了的那个地方。
   *
   * **多个＝同一地方的孪生 id 全收。** 孪生不是"二选一挑对的那个"，而是同一处地方在不同关卡
   * 用了不同 id——只填一个，锚就只在那批关里响。实测洛都：`liuchao.location.luoyang` 覆盖 24 关、
   * `lyl.location.luoyang` 覆盖 6 关，早先只填后者，导致汉国锚在 6 关里只有 3 关能响
   * （`dingtao_beijing`／`han_succession` 玩家人在洛都却触发不了）。
   */
  anchorLocationIds?: string[];
  /**
   * 玩家可见的入口指引：**去哪里找谁**。
   *
   * 锚一满足就作为待办显示，**不需要玩家点击确认**（用户裁定 2026-08-16）——
   * 与主线轴的长期方向同一口径：引擎只把话说清楚，不替玩家签字，也不设"接受任务"这道手续。
   * 照着做就是加入，不做也不损失什么。
   */
  entryHint: string;
  /** 锚为什么是这个——正典依据，便于日后复核。 */
  basis: string;
  /** 线内节点。骨架先搭齐，缺内容的标 `pending` 待扩。 */
  nodes: LineNode[];
  /** 这条线还缺什么（beat 级盘点结论）。空＝原著段已够打穿。 */
  pendingExpansion?: string;
}

/**
 * 线内节点。粒度同主轴 `MAIN_QUEST_NODES`——任务节点，不是逐拍。
 *
 * `status` 三档：
 *   · `ready`   已有 stage＋event 承载，玩家现在就走得到；
 *   · `new`     内容在原著里有、游戏里没落地，**需新增 event**（已给建议 id）；
 *   · `pending` **待扩**：这一段还没规划，占位而已。
 */
export interface LineNode {
  text: string;
  status: 'ready' | 'new' | 'pending';
  /** `ready` 必填；`new` 填建议挂载关。 */
  stageId?: string;
  /** `ready` 填现有 event id；`new` 填建议 id。 */
  eventId?: string;
}

/**
 * 八条二级线的入口锚。
 *
 * ⚠ **孪生 id 陷阱**：同一个地方常有多个 id，各自只在一部分关卡里出现。
 * **处置是"全收"，不是"挑对的那个"**——只填一个，锚就只在那批关里响。
 * 实测各地 id 覆盖：临安 `linan` 30 关／`lin_an` 1 关（均收）；洛都 `liuchao.location.luoyang` 24 关／
 * `lyl.location.luoyang` 6 关（均收）；建康、长安各只有一个 id。
 * 确实该排除的只有两类：只在隔离关出现的（临安 `linan_city` 在 `taiquan_expedition`）、
 * 以及 live 关查无的（`lyg.location.changan`）。
 * 太乙山门「龙池」两个 id 都不可达，故太乙改走人物锚。
 */
export const SECONDARY_LINES: SecondaryLine[] = [
  // —— 宗派线：锚人 ——
  {
    id: 'taiyi',
    name: '太乙真宗',
    kind: 'sect',
    anchorCharacterIds: ['lcq.character.wang_zhe'],
    entryHint: '王哲既已传功托付，太乙真宗的门就对你开着——去找他，或日后去找教御蔺采泉。',
    basis: '王哲是把程宗扬拉进太乙的人——`lcq.event.s01_04` objective 字面即「加入太乙真宗阵营」，'
      + '并在 `stage_02` 传功托付。**开局强制剧情就会见到他，等于自动开启**（用户确认 2026-08-16）。'
      + '（山门龙池两个 id 均不可达，故不用地点锚。）',
    nodes: [
      { text: '受王哲传功托付，入太乙真宗阵营', status: 'ready', stageId: 'lcq.stage_01', eventId: 'lcq.event.s01_04' },
      { text: '接下锦囊：清理门户、传授九阳', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.s02_01' },
      { text: '与蔺采泉重议九阳的出处与名分', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_02_beat' },
      { text: '清洗通魔教御，坐实道门操盘人', status: 'pending' },
      { text: '锦囊后续：白纸如何变指令、失踪于何处、故人是谁', status: 'pending' },
    ],
    pendingExpansion: 'beat 级三分类 ✅6／⚠8／⏳2——八条线里 ⚠ 最多。加入之后的掌教斗争大面积没落地，锦囊停在"领取"。',
  },
  {
    id: 'xingyuehu',
    name: '星月湖',
    kind: 'sect',
    anchorCharacterIds: [
      'liuchao.character.xie_yi',      // 谢艺　 第 4 关（最早）·护岳帅父女
      'liuchao.character.xiao_yao_yi', // 萧遥逸 第 10 关·掌谍报商网
    ],
    entryHint: '想搭上星月湖，去找八骏——先是谢艺，江州之后可找萧遥逸。',
    basis: '**用八骏，不用月霜**（用户裁定 2026-08-16）：月霜是要护的人，不是引你进门的人；'
      + '八骏才是星月湖建制（蓝图 §10：孟非卿掌军／萧遥逸掌谍报商网／谢艺护岳帅父女）。'
      + '**八骏里只取谢艺与萧遥逸**（用户裁定 2026-08-16）：这两人才是程宗扬实际打交道的，'
      + '孟非卿／卢景／王韬／斯明信不作入口，崔茂在默认线事件层不可达。'
      + '任一见过即开线，最早由谢艺第 4 关触发——比月霜第 1 关合理，开局就开星月湖太早。',
    nodes: [
      { text: '在南荒结识谢艺，搭上星月湖', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_04' },
      { text: '建康与八骏会合', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_01_eight_steeds_leave' },
      { text: '江州战事：与星月湖并肩', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_04_xingyue_appears' },
      { text: '入营判据：怎样才算真正编入星月湖', status: 'pending' },
      { text: '岳帅冤案洗雪的收束', status: 'pending' },
    ],
    pendingExpansion: 'beat 级 ✅10／⚠3／⏳3——内容已连续落地，缺的是入营判据与洗冤收束，不是没故事。',
  },
  {
    id: 'heimohai',
    name: '黑魔海／毒宗',
    kind: 'sect',
    anchorCharacterIds: ['liuchao.character.shang_zhen_yu'],
    entryHint: '毒宗的名分不在总坛里，在人身上——去找殇侯（你先认识的那位朱老头）。',
    basis: '秘密组织不靠走进总坛加入（蓝图总坛在昭南，事件层从未落地）。正典里程宗扬是毒宗系'
      + '「被庇护者」，蓝图 §13-C 定案「名义天命侯＝殇侯，毒宗实推的继承人＝程宗扬」。'
      + '同一 id 两个名字：第 5 关以「朱老头」现身，第 10 关以「殇侯」现身。'
      + '**用殇侯不用小紫**（用户授权判断 2026-08-16）：小紫第 8 关才可达（首现关 `stage_05` 被隔离），'
      + '且她已是主轴血脉线核心承重（层三解锁门／遗孤名册／大祭备用容器），'
      + '兼作黑魔海入口会让玩家分不清"认识小紫"是在推血脉还是在入毒宗。',
    nodes: [
      { text: '南荒遇朱老头，落进毒宗的庇护', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_02' },
      { text: '建康再见殇侯，听出天命侯这回事', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_03_xiaozi_appears' },
      { text: '太泉段卷入黑魔海的巢穴与杀局', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_04_beat' },
      { text: '天命侯名分：玩家侧怎么争', status: 'pending' },
      { text: '大祭与潘金莲的对决（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: 'beat 级 ✅13／⚠3／⏳3——故事最多的一条。半成品的是**玩家侧名分**：「天命侯」全库 0 条 event。',
  },
  // —— 国家／地区线：锚地 ——
  {
    id: 'zhaonan',
    name: '昭南',
    kind: 'nation',
    // ⚠ 唯一用人物锚的国家／地区线。破例的理由是数据给的，不是随手定的——见 basis。
    anchorCharacterIds: [
      'liuchao.character.yun_cang_feng', // 云苍峰 第 4 关·商队带你进南荒
      'liuchao.character.wu_er_lang',    // 武二郎 第 5 关·南荒队伍成员
    ],
    entryHint: '南荒没有可投的朝廷，只有带你进去的人——跟云苍峰的商队同行，队里还有武二郎。',
    basis: '**破例用人物锚**（用户提出 2026-08-16）：其余四条国家线都能走进都城，昭南不能——'
      + '麟趾／昭南城在事件层从未抵达，玩家到的全是部族聚落。'
      + '**不变量是"进南荒得跟商队"**：`stage_03b` 的 `云氏同行` objective 字面即'
      + '「与云苍峰商队同行，前往白夷族」；那片地方没有别的进法。'
      + '⚠ 冰蛊胁迫（`stage_03`：苏妲己订下三个月南荒之约 → 以冰蛊逼迫南行 → 两日内组织南荒队伍）'
      + '**只是正典默认路径，不是结构必然**——它前面那串（流落街头→落进苏妲己手里→赌局卖身）'
      + '每一环都可能不发生，本作又有 IF 分歧。故锚取"带路的商队人"而非"被谁逼的"：'
      + '不论玩家是被押去的还是自己走通商路去的，商队这一条都成立。'
      + '（原锚熊耳铺已废：它是 `stage_03b` 最后一个事件「龙神新娘｜前往熊耳铺」的落点，'
      + '在南荒之行的尾巴上，是深处不是门。）',
    nodes: [
      { text: '跟云苍峰的商队进南荒', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_04' },
      { text: '查清蛇彝村灭村，血符指向鬼王峒', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_02' },
      { text: '在花苗、白夷、碧鲮之间选边', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_04' },
      { text: '昭南朝廷（麟趾／昭南城）：事件层从未抵达', status: 'pending' },
      { text: '开放线扩展位：芈氏外家 vs 程系经济渗透、阖闾破郢原型、凝羽回归线', status: 'pending' },
    ],
    pendingExpansion: 'beat 级 ✅8／⚠3／⏳5——腹地几乎全 ✅，但都城没抵达。**开放线，作者本人也没写完**，扩展位见蓝图 §6／§12。',
  },
  {
    id: 'jin',
    name: '晋国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.jiankang'],
    entryHint: '想插手晋国朝局，去建康。',
    basis: '建康＝晋国都城（官方附录地图 jin-nanzhao 幅在场；描述「晋国都城」）。第 10 关可达。',
    nodes: [
      { text: '清远入晋，卷进建康疑局', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_02_kill_wu' },
      { text: '玄武湖宫变', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_03_beifu_rescue' },
      { text: '云氏商局与沉江脱险', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_04_weaving_trade' },
      { text: '商战终局：广源行旧账清算', status: 'pending' },
    ],
    pendingExpansion: 'beat 级 ✅4／⚠5／⏳3——宫变中篇已在，缺商战终局。蓝图 §6 把晋写成商战副本（云如瑶＝岳霏揭晓地、小玲儿身世）。',
  },
  {
    id: 'song',
    name: '宋国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.linan', 'liuchao.location.lin_an'],
    entryHint: '想插手宋国朝局，去临安。',
    basis: '临安＝宋国都城。`linan` 覆盖 30 关为主，`lin_an` 只 1 关，一并收下防漏；'
      + '`linan_city` 只在隔离关 `taiquan_expedition`，不收。',
    nodes: [
      { text: '江州坚守与粮战', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_02_cement_fortress' },
      { text: '江州围城与反攻', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_01_grain_route_blocked' },
      { text: '临安落脚，摸清这座城的暗线', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.lin_an_bridge_01_beat' },
      { text: '临安官场：吏部／威远／武穆王府（细点全在隔离关）', status: 'pending' },
    ],
    pendingExpansion: 'beat 级 ✅6／⚠2／⏳2——江州＋临安已成块，缺临安官场细点。',
  },
  {
    id: 'han',
    name: '汉国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.luoyang', 'lyl.location.luoyang'],
    entryHint: '想插手汉国朝局，去洛都。',
    basis: '洛都＝汉国都城。**两个孪生 id 全收**：`liuchao.location.luoyang` 覆盖 24 关、'
      + '`lyl.location.luoyang` 覆盖 6 关（含抵达关 `luoyang_cloud_secret`，那关没有 atlas 那个）。'
      + '早先只填后者是错的——汉国线 6 关里只有 3 关能响，`dingtao_beijing` 与 `han_succession` '
      + '玩家人在洛都却触发不了。',
    nodes: [
      { text: '去洛都，摸清入朝的口子', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_07_beat' },
      { text: '买下官身，在汉廷立住脚', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_01' },
      { text: '扛住吕氏动用汉军的围杀', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_03' },
      { text: '用纸钞买田；看清限田令要把云家卷进削豪强', status: 'new', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.han_limit_field' },
      { text: '从传闻得知：天子已死，含光殿落到吕冀手里，刘建已起兵占了南宫', status: 'new', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_power_vacuum' },
      { text: '决定是否出面拥立定陶王', status: 'new', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_sponsor_dingtao' },
      { text: '董卓无符入京；刘建伏诛', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_08_beat' },
      { text: '到场或听任新朝承认定陶王', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_05' },
      { text: '吕冀赐死，见证吕雉亲裁诸吕', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_09' },
      { text: '护住赵氏，促成新帝登基，自己以辅政定型', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_08_beat' },
    ],
    pendingExpansion: 'beat 级 ✅5／⚠2／⏳3，八条里对齐度最高。缺 3 条新 event（H4／H5／H6），其中 H5 靠流言获知、H6 给玩家拥立与否的选择。详见 docs/R3-10-HAN-QUESTLINE-2026-08-16.md。',
  },
  {
    id: 'tang',
    name: '唐国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.changan'],
    entryHint: '想插手唐国朝局，去长安。',
    basis: '长安＝唐国都城。须用 `liuchao.location.changan`——`lyg.location.changan`（名「长安城」）'
      + '在抽查的 live 关查无。第 30 关可达。',
    nodes: [
      { text: '以汉使入长安，灞桥落脚', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_01' },
      { text: '摸清佛门暗潮冲着谁来', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_02_beat' },
      { text: '甘露变：赶在密令落地前弄明白谁在动手', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_01_beat' },
      { text: '长安失序与弑君余波', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_03_beat' },
      { text: '入仕唐廷的判据（现无）', status: 'pending' },
    ],
    pendingExpansion: 'beat 级 ✅8／⚠1／⏳3——⚠ 最少的一条，原著段几乎打穿（甘露变收到李辅国肉身亡）。缺入仕判据。',
  },
];

/**
 * 人物锚的门槛：**真的见过**才算接得到。
 * 相识账本四档 `rumored | introduced | encountered | joined`——只听过传闻不算，
 * 否则"世上有这么个人"就能开线，那又回到了模型说了算。
 */
export const LINE_ANCHOR_MIN_ACQUAINTANCE = 'encountered' as const;

/**
 * 当前接得到哪些二级线。纯函数：只看地点与相识账本，不读别的存档字段、不产生副作用。
 *
 * 只回答"接得到"，不回答"加入了"——见模块头纪律。返回的每条都带 `entryHint`，
 * 上层直接当待办显示即可，无需玩家确认。
 */
export function resolveAvailableLines(
  currentLocationId: string | undefined,
  ledger: AcquaintanceLedger | undefined,
): SecondaryLine[] {
  const threshold = rankOf(LINE_ANCHOR_MIN_ACQUAINTANCE);
  return SECONDARY_LINES.filter(line => {
    if (line.anchorLocationIds?.length) {
      return Boolean(currentLocationId) && line.anchorLocationIds.includes(currentLocationId!);
    }
    if (line.anchorCharacterIds?.length) {
      // 任一锚人见过即算搭上线——八骏见谁都算。
      return line.anchorCharacterIds.some(id => {
        const record = acquaintanceOf(ledger, id);
        return record ? rankOf(record.kind) >= threshold : false;
      });
    }
    return false;
  });
}

/**
 * 线承重事件：**玩家没接这条线之前，世界不许替他把这件事办了。**
 *
 * 立项理由（用户裁定 2026-08-16）：
 *   「如果没启动汉国线，汉国线相关事件就不能自动发生并且推进。」
 *   「world_sim 的『世界自行推进』是需要审核而且小范围限定死的，不是全部事件。」
 *
 * 【现状核实】全库 396 个事件里只有 **24 条**带 `offscreenResolution`（会自行结算），
 * 占 6%；`deadlineTurns` 一条没有。所以"自行推进"本来就是小集合，问题不在范围大，
 * 在于**这 24 条不是一类东西**。
 *
 * **本轮只处置其中一类：权力格局级**——帝统归谁、谁被拥立、谁被赐死，**玩家该有得选**，
 * 故列入本表，所属线未开启时不结算。
 *
 * ⏳ **其余 14 条尚未审核，先留空**（用户裁定 2026-08-16）。曾把它们归为"世界背景级、
 * 保留自行推进"，但那个分法站不住：「旱洪与易虎之死」是队伍共同经历、「捧日军抵烈山」
 * 直接牵动江州战局，说"玩家在不在都一样"太草率。**未审核的一律维持现状**（照旧自行结算），
 * 不要因为没进本表就当成已经判过。
 *
 * 【世界背景级的去向】用户给了方向（2026-08-16）：这一类不是"要不要自行推进"的分类问题，
 * 而是**环境事件层的种子，可以自行扩写**——类比上古卷轴加入军团／风暴斗篷之后，
 * 各地随之爆发战斗。它是玩家选边的回响，不是主线。
 * 这一档正好落在既有的分工线上：**LLM 的发挥留给小支线与流言**（见模块头立项理由），
 * 环境层就是那一档。故它与本表是两件事：本表管"世界不许替玩家做决定"，
 * 环境层管"玩家的选择在世界里有回响"。实现另排。
 *
 * 典型反例是「吕冀赐死」，它的 worldDelta 自己写着「**你未在时限内前往永巷**」——
 * 这话默认玩家知道有这回事、只是没去。可玩家若从没接过汉国线，他连永巷有个时限都不知道，
 * 这句就成了凭空的责备。
 *
 * 【纪律】只收**审核过**的事件。别为了省事把整批塞进来——世界该转还得转，
 * 冻住整个世界等玩家，比替玩家做决定更糟。
 */
export const LINE_CRITICAL_EVENTS: Record<string, string> = {
  // 汉国：帝统归属在 dingtao_beijing 这一关定下
  'lyg.event.s01_01': 'han', // 秦桧斩刘建
  'lyg.event.s01_02': 'han', // 贾文和劫持定陶王
  'lyg.event.s01_03': 'han', // 董卓挟持定陶王出洛都
  'lyg.event.s01_04': 'han', // 霍子孟见吕雉
  'lyg.event.s01_05': 'han', // 董卓拥立定陶王为帝
  'lyg.event.s01_09': 'han', // 吕冀赐死
  // 汉国：政变中段。这四条在隔离关 lyl.luoyang_coup 上，当前默认路线够不到，
  // 先登记；该关的处置见 docs/R3-10-HAN-QUESTLINE-2026-08-16.md
  'lyl.event.s06_01': 'han', // 天子暴毙消息传遍洛都
  'lyl.event.s06_03': 'han', // 刘建攻占南宫与武库
  'lyl.event.s06_04': 'han', // 长秋宫守卫战
  'lyl.event.s06_06': 'han', // 吕奉先单骑破阵
};

/**
 * 从存档的位置描述反查地点 id。
 *
 * 存档里存的是中文串（如「中州·白湖商馆」），与 `storyContext.resolveCurrentScenarioLocation`
 * 同口径：按地点名做**最长匹配**，处理「白夷」／「白夷谷」这类互相包含。
 * 放在本模块而不是 import storyContext——后者依赖 runtime，反向 import 会成环。
 */
export function resolveLocationIdFromPosition(
  positionDescription: unknown,
  locations: ReadonlyArray<{ id: string; name: string }> | undefined,
): string | undefined {
  const desc = String(positionDescription || '').replace(/\s+/g, '');
  if (!desc || !locations?.length) return undefined;
  return locations
    .filter(l => l.name && l.name.length >= 2 && desc.includes(l.name.replace(/\s+/g, '')))
    .sort((a, b) => b.name.length - a.name.length)[0]?.id;
}

/**
 * 线承重事件的冻结判据：**玩家没到现场，这件事就不许自行推进**（用户裁定 2026-08-16）。
 *
 * 「到现场」两级判定，因为并非每条事件都带地点——实测 10 条里 7 条有 `locationId`，
 * 「秦桧斩刘建」「吕冀赐死」「吕奉先单骑破阵」三条没有：
 *
 *   1. 事件带 `locationId` → 玩家当前地点与之相同才算到场；
 *   2. 事件无 `locationId` → 退到关卡级：玩家人在该事件所属关卡即算到场。
 *
 * 到场之后不再特殊照顾——照常规规则走，玩家可以介入，也可以放着让它场外结算。
 * **冻结只保证"玩家有得选"，不保证"玩家一定参与"。**
 *
 * 【裁定原文】用户 2026-08-16：「任务指引玩家去皇宫，玩家不去，剧情就不推进，
 * 也没有汉帝被杀需要拥立新王的事情。如果玩家在董卓到来的时候临时起意跑到唐国，
 * 那用例时间也就停着等玩家回来再继续。」
 * 即：**不是"发生了而玩家没赶上"，是那件事根本没发生**；整条链停着等人，不设超时。
 *
 * ⚠ **与 R2-10／R2-11 既有验收冲突，尚未解决**（5 条测试红）。那批断言的是
 * 「玩家不介入 → 到期场外结算，世界不因缺席而冻结」，与本规则相反。分歧实质是
 * "玩家缺席"算不算"玩家的选择"——旧验收假定玩家知道有这回事而选择不去，
 * 本规则针对的是玩家人在这一关、却从没被告知昭阳宫今晚要拥立新帝，那不叫选择叫没通知。
 *
 * ⏳ **时效性 objective 待做过滤**（用户 2026-08-16）：确有一些 objective 需要时效、
 * 玩家没选择就该自动发生。那批要单独过滤出来豁免本闸，**做完之后再回头重判上述 5 条**。
 * 在此之前二级主线按本写法默认冻结。
 */
export function lineCriticalFrozen(
  event: { id: string; locationId?: string },
  currentStageId: string | undefined,
  currentLocationId: string | undefined,
  locationDataAvailable = true,
): boolean {
  if (!LINE_CRITICAL_EVENTS[event.id]) return false;
  // **判定不了就不判**：没有 `canon.locations` 时无从知道玩家在不在现场，
  // 此时冻结等于凭一个测不出来的条件卡住世界。真实存档一定带 locations（共享正典注入到每关），
  // 缺失的只有手搭 fixture，那些用例本就不在验证到场与否。
  if (!locationDataAvailable) return false;
  // 「现场」＝**那个地点**，不是那一关（用户裁定 2026-08-16）。
  // 关卡级判定在此处是空转：`runtime.events` 本就只装当前关的事件（`runtime.ts:2091`
  // `structuredClone(mod.scenario.events)`），玩家没到那一关，这些事件根本不在候选里。
  // 故只有地点级才真正拦得住"人在这一关、却没去那座殿，帝统就自行定了"。
  if (!event.locationId) return !currentStageId; // 无地点的退到关卡级（10 条里有 3 条）
  return event.locationId !== currentLocationId;
}
