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
    entryHint: '王哲既已传功托付，太乙真宗的门就对你开着——去找他问清那份托付。',
    basis: '王哲是把程宗扬拉进太乙的人——`lcq.event.s01_04` objective 字面即「加入太乙真宗阵营」，'
      + '并在 `stage_02` 传功托付。**开局强制剧情就会见到他，等于自动开启**（用户确认 2026-08-16）。'
      + '（山门龙池两个 id 均不可达，故不用地点锚。）',
    nodes: [
      // 这条线不是拉票选盟主，是扳倒现任掌教：蔺采泉杀了卓云君的师叔（seq 273）、
      // 与商乐轩争位（391）、最终自立掌教（581），程宗扬后来承诺对付他（629）。
      { text: '受王哲传功托付，入太乙真宗阵营', status: 'ready', stageId: 'lcq.stage_01', eventId: 'lcq.event.s01_04' },
      { text: '接下锦囊与三托付', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.s02_01' },
      { text: '在紫溪被点名去龙池', status: 'new', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_zixi_intercept' },
      { text: '读王哲密信，受托清理门户', status: 'new', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_wangzhe_letter' },
      { text: '破道观：认出元行健是林之澜的人', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_06_ruined_temple' },
      { text: '听清蔺采泉与商乐轩在争掌教', status: 'new', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_yeying_struggle' },
      // 这是对手开的价，不是盟友协商——文案不要写成结盟。
      { text: '蔺采泉以支持江州，换你承认九阳出自他', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_02_beat' },
      { text: '鹤林观：蔺采泉自立掌教，秋少君升任教御', status: 'new', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_lin_takes_seat' },
      { text: '在翠微园承诺对付现任掌教', status: 'new', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.sacred_against_lin' },
      { text: '问清商乐轩认不认这届鹤林观即位', status: 'new', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiyi_shang_stance' },
      { text: '多数教御到手：选自坐掌教，或扶一个代理人', status: 'new', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiyi_seat_choice' },
      { text: '锦囊出指令、齐羽仙反用（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: '顶点＝**掌教之位**，一条 event 两个出口：自坐，或持王哲遗命扶商乐轩／秋少君坐明面、自己操盘。'
      + '多数判据＝在位教御 2／3（蔺自立后为商／卓／秋，最短路径商＋秋；卓的票留给人物线，本轮不设完成键）。'
      + '正典只写到对手即位（seq 581 `掌教`），**程侧授名 timeline 无拍**，故顶点标需新增。'
      + '卓云君收服链（`s07_02`～`s07_04` 等）按裁定归人物任务，不写成本线节点，只在「承诺对付掌教」一拍旁留插入点。',
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
      { text: '打听岳帅旧事，问清星月湖是什么', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_16' },
      // 不另开 event：托付紧贴杀龙那一刻（谢艺 seq 210 被闪电击落，程宗扬替他杀了龙 211，
      // 他才交代后事），所以**附在昭南的杀龙 event 里**双喂——昭南读了结，本线读托付。
      //
      // **文案不预设他必死**（用户裁定 2026-08-16）：原著里他伤重辞世，但这里不写死。
      // 玩家赶到时他重伤未定，救不救得回来是结果不是前提。⚠ 真做成分岔的代价见
      // `docs/R3-10-BACKLOG` P1-7：他的死是四处承重，其中「萧遥逸接骨灰」是萧的**唯一登场路径**。
      { text: '赶到重伤的谢艺身边，接下他对小紫与星月湖的交代', status: 'new', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_slay_dragon' },
      // 与汉国入口同一 event，待办各说各的：汉国读左武覆灭，本线读番号旧案。
      // 序按 axisSeq：旧案 232 在报丧 251 之前，先前两条排反了。
      { text: '跟着八骏，问清左武军怎么覆灭的', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_01_old_case' },
      // 文案不写「之死」：上游已按裁定改成重伤未定，这里跟着中性化。
      // ⚠ 挂的 event 本身字面即死讯，属 backlog P1-7 四处承重之一，真分岔归 R2-0。
      { text: '把谢艺的下落带给孟非卿', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_05_eight_steeds_informed' },
      { text: '萧遥逸代表星月湖，向你开放资源', status: 'new', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_xiao_opens' },
      { text: '古冥隐点破：第八骏就是萧遥逸', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_08_gumingyin_plot' },
      { text: '八骏离建康，萧遥逸率水师赴江州', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_01_eight_steeds_leave' },
      { text: '以鹏翼社作抵押，替孟非卿筹十万金铢', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_05_war_funds' },
      { text: '受孟非卿之命，率部赴三川口护月霜', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_03_protect_yueshuang' },
      { text: '江州战事：与星月湖并肩', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_04_xingyue_appears' },
      { text: '全盘接管鹏翼社与星月湖暗产', status: 'new', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_pengyi_takeover' },
      { text: '在临安祭岳鹏举与谢艺的墓', status: 'new', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.lin_an_bridge_xieyi_tomb' },
      { text: '岳帅归营、番号恢复、冤案洗雪（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: '顶点＝**全盘接管鹏翼社与星月湖暗产**（seq 534 `第280章·默契`），形态与汉国 979 同构：名分换经营权，'
      + '不是去当第八个骏。旧的「入营判据」pending 作废——正典的完成键就是 534，不该另发明一套军籍手续。'
      + '此前的开放资源（276）、抵押借钱（404）、三川口指挥权（439）、江州并肩都只是**立场**：仍是他们的资源，你在用。',
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
      // 旧表三处挂错，本轮全部纠正：入口挂 `s04_02`（实为鬼王峒武士袭击）→ 改 `s04_04` 发蛊；
      // 「听出天命侯」挂 `s07_03`（实为小紫制服卓云君，零天命侯字样）→ 拆成亮身份与名分两拍；
      // 杀局挂 `_04_beat`（实为野猪林乱战）→ 改 `_08_beat`。
      { text: '南荒发蛊：看清朱老头身边的东西不敢碰他', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_04' },
      { text: '把羊皮纸送到云苍峰，疑黑魔海与鬼王峒勾结', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_04' },
      // 原在隔离关 `stage_06` `s06_05`。**不跟着搬进 05b**：这场面见换个地方谈一样开得了后续，
      // 与杀龙没有硬绑。落清远／建康——硬约束只有一条，必须早于下一拍「不与殇侯为敌」，
      // 那时玩家得已经知道朱老头是谁。形态仍是可玩面见，不是「听说他是侯」。
      { text: '当面确认朱老头就是殇侯，听他称你是天命之人', status: 'new', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_shanghou_revealed' },
      { text: '与萧遥逸击掌：不与殇侯为敌', status: 'new', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_palm_oath' },
      { text: '查清黑魔海内隙，听泉玉姬供认御姬奴', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_06_blacksea_fracture' },
      { text: '先发制人捣江州巢穴，拿到阴阳鱼', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_07_preemptive_strike' },
      { text: '殇侯施尸毒，破开宋军阵线', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_16_corpse_poison' },
      { text: '以人情和经济筹码，请殇侯留守江州', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_17_shanghou_stays' },
      { text: '用晴州水泥代理权，换黑魔海五年不入宋', status: 'new', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_cement_truce' },
      { text: '小瀛洲杀局：逼出剑玉姬真身', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_08_beat' },
      { text: '剑玉姬以成光换你支持刘建，当面回绝', status: 'new', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_jianyu_refused' },
      { text: '让毒宗承认：天命侯的传承在你这边', status: 'new', stageId: 'lyg.mijing_rumen', eventId: 'lyg.event.mijing_tianminghou' },
      { text: '大祭：与潘金莲对决、总坛覆灭（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: '顶点＝**天命侯**（蓝图 §13-C：名义殇侯、毒宗实推程宗扬）。正典有这个词、**没有授名**——'
      + 'seq 222 是殇侯称你「天命之人」的谶语，1155 是中行说私室失言的一声惊呼且被当场怒斥，'
      + '全库 396 条 event 搜「天命侯」命中 0。故不编一道「殇侯当场封侯」，'
      + '而是在既有庇护关系上做成可完成的名分拍：完成键＝毒宗侧承认传承已归程，不是有人叫了一声。',
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
      // 序按 axisSeq：屠村 62 → 血符 63 → 云氏同行 64。
      // 先前把「跟商队进南荒」排在调查之前，与正典反了——你是先撞见被屠的村子，
      // 云家提议同行是你的反应，不是你入南荒的前提。（Z1 并进同关 _03 血符）
      { text: '查清蛇彝村灭村，血符指向鬼王峒', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_02' },
      { text: '跟云苍峰的商队进南荒', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_04' },
      // Z3 并进 lcq.event.s04_01（密谋刺王）
      { text: '问清花苗此刻站在哪一边', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_07' },
      // Z4 并进 s04b_lingfei_baiyi_crisis_08／_09（识破投峒、族长被换）
      { text: '问清白夷此刻站在哪一边', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_07' },
      { text: '赶到碧鲮湾，看清他们此刻敢不敢站出来', status: 'new', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_free_biyu' },
      { text: '跟花苗谈清进鬼王峒的合作边界', status: 'new', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_coop_boundary' },
      // Z7 并进 s05b_05b_ideology_duel_and_defeat
      { text: '潜入鬼王宫，当面见鬼巫王', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_05a_meet_ghost_king' },
      { text: '在鬼王宫里策动奴隶倒戈', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_10_slave_revolt_and_phoenix_change' },
      { text: '在祭台上把鬼巫王这一仗打完', status: 'new', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_ghost_king_swallowed' },
      { text: '在破峒之后了结龙神', status: 'new', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_slay_dragon' },
      { text: '散峒之后，听清三族是否真的站到你这边', status: 'new', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_tribes_pledge' },
    ],
    pendingExpansion: '线形：商队进南荒 → 查清蛇彝 → 取得花苗／白夷／碧鲮立场（观望≠归附）→ 决战鬼巫王／龙神 → 散峒后三族真正归附。'
      + '顶点＝三族真正归附（Z11 `s05b_tribes_pledge`）。隔离关 stage_05／06 不放出；斩蛇傀、合作边界、吞噬、杀龙、散峒改挂 05b 前缀／后缀。'
      + 'Z5／Z6／Z9／Z10／Z11 需新增。谢艺辞世不进本链（星月湖交接）。'
      + '麟趾朝廷、芈氏外家、阖闾破郢、凝羽回归仍是开放线扩展位，不进这 11 条。',
  },
  {
    id: 'jin',
    name: '晋国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.jiankang'],
    entryHint: '建康的宫城里闹鬼——你用灵飞镜窥宫，撞见一个大汉从假山钻出，还回头察觉了你的窥视。'
      + '把这桩怪事说给萧遥逸；夜探台城是他提的。',
    basis: '建康＝晋国都城（官方附录地图 jin-nanzhao 幅在场；描述「晋国都城」）。第 10 关可达。'
      + '**引子按原文重写**（用户 2026-08-16「引子有点弱，看下原文怎么写过去的」）：'
      + '原来的「想插手晋国朝局，去建康」是模板话，正典里他并不是奔着朝局去的——'
      + 'seq 241 用灵飞镜窥宫、撞见可疑大汉从假山钻出且被对方察觉；seq 242 把「宫禁闹鬼」告诉萧遥逸，'
      + '**由萧提议夜探台城**。那个「鬼」后来查出是徐度安插的幽冥宗卧底（seq 268），篡位的前戏——'
      + '即：入线的钩子是一桩鬼故事，不是从政的野心。',
    nodes: [
      { text: '进建康，夜探神龙殿，看清晋帝已被架空', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_07_dragon_hall' },
      // J2 并进 s08_03_beifu_rescue
      { text: '鹰愁峪入瓮，等北府来解围', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_01_eagle_valley' },
      { text: '在玄武湖把晋帝、太后抢回来', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_10_xuanwu_rescue' },
      { text: '问清相府此刻站在哪一边', status: 'new', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_wang_maohong' },
      { text: '问清北府此刻听谁的', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_01_eight_steeds_leave' },
      { text: '看清分赃：萧家江宁、云家盐业、你一无所得', status: 'new', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_fen_zang' },
      { text: '听说晋相腾出江州，让宋军来剿星月湖', status: 'new', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_jin_vacate' },
      { text: '趁晋国大旱收粮，把建康当成营销中心来做', status: 'new', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.sacred_jin_drought' },
      // J9 前半已有 s12_14_chenxing_appears／s12_15_capture_jingli；后半需新增
      { text: '把广源行在晋的旧账揭开（龙宸这条线）', status: 'new', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.jin_guangyuan_ledger' },
      // 顶点占位：原文未明，称号待定（seq 334「程宗扬无所得」）
      { text: '让相府把建康的盐粮路写进你的名下', status: 'new', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.jin_charter' },
    ],
    pendingExpansion: '线形：进建康看清帝室架空 → 宫变调查 → 相府／北府／云家立场（分赃无所得）→ 晋旱收粮＋广源行旧账 → 晋廷承认特许商权。'
      + '顶点＝占位名分，原文未明、称号待定（seq 334 反证）。节点文案不写死官名。'
      + 'J4／J6／J7／J8／J9后半／J10 需新增。J9 前半已有龙宸 s12_14／s12_15。'
      + '旧「清远斩吴」归太乙；「同门旧案」改挂汉国入口。',
  },
  {
    id: 'song',
    name: '宋国',
    kind: 'nation',
    // 江州与临安都收：和汉国同一处毛病——锚只填都城，线就要等到 seq 559 才开，
    // 而它第一个节点在 seq 383。江州是宋国找上门来的地方，比临安早得多。
    anchorLocationIds: ['liuchao.location.jiangzhou', 'liuchao.location.linan', 'liuchao.location.lin_an'],
    entryHint: '卢景带来的信不必等你到临安：贾师宪已经大举集结，江州要打起来了。'
      + '改不改道去援，你自己定。',
    basis: '临安＝宋国都城。`linan` 覆盖 30 关为主，`lin_an` 只 1 关，一并收下防漏；'
      + '`linan_city` 只在隔离关 `taiquan_expedition`，不收。'
      + '**另收江州**（2026-08-16）：正典里宋国不是你走进临安才遇上的——seq 380 卢景带来消息，'
      + '贾师宪大举集结、江州兵危，**程宗扬当场决定改道去援**；seq 383 贾师宪下令攻江州清岳党。'
      + '本线第一个节点就落在 seq 383，而临安要到 seq 559 才落脚：只锚都城等于让入口比第一拍晚 176 拍。'
      + '这与汉国「只锚洛都、把第 10 关的旧案漏掉」是同一个错，一并纠正。',
    nodes: [
      { text: '探查贾师宪攻江州、清岳党的军令', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_01_jiangzhou_order' },
      // S2 并进 s11_09_grain_plan
      { text: '看清江州水泥坚城，问清粮战怎么做', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_02_cement_fortress' },
      // S3 并进 s12_16_corpse_poison
      { text: '扛住江州围城，看宋军阵线怎么破', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_11_siege_begins' },
      // S4 抵达／祭墓建议并进 lin_an_arrive，不单开
      { text: '临安落脚，摸清这座城的暗线', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.lin_an_bridge_01_beat' },
      // S5 另建议 lyl.event.lin_an_libu（临安落册）；文案用屯田司员外郎，不用「客卿」
      { text: '接下屯田司员外郎，去把籍贯落进册', status: 'new', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_tuntian' },
      { text: '问清贾师宪此刻要你推的是什么', status: 'new', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_paper_plan' },
      // 序按 axisSeq：太皇太后 604 在高俅 624 之前，先前两条排反了。
      { text: '问清太皇太后认不认你进宫', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_06_beat' },
      { text: '问清高俅此刻站在哪一边', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_03' },
      { text: '让纸钞能纳税，逼宋军退兵', status: 'new', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_paper_mint' },
      // S10 并进 changgan_interlude_04_beat
      { text: '在长安接下昭南索赔这档子事', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_03_beat' },
      { text: '受礼部侍郎、通问计议使，用这颗印解宋困', status: 'new', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.song_tongwen' },
    ],
    pendingExpansion: '线形：卷入贾师宪清岳党 → 查清粮战与围城 → 相府／太尉／后宫立场 → 纸钞落地逼退＋昭南索赔 → 礼部侍郎、通问计议使。'
      + '顶点＝礼部侍郎、通问计议使（seq 1134）。578 共同监制、1160 出资解困并进 S11，不另封「宝钞使」。'
      + 'S5／S6／S9／S11 需新增。S5 用屯田司员外郎，不用「客卿」。威远／武穆王府不上链。',
  },
  {
    id: 'han',
    name: '汉国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.luoyang', 'lyl.location.luoyang'],
    // 两条路都能入线：跟八骏查左武军的旧案（第 10 关，早得多），或直接走到洛都（第 24 关）。
    anchorCharacterIds: ['liuchao.character.xiao_yao_yi'],
    entryHint: '汉廷的账从一桩旧案查起——找萧遥逸问清左武军是怎么覆灭的；或者直接去洛都。',
    basis: '洛都＝汉国都城。**两个孪生 id 全收**：`liuchao.location.luoyang` 覆盖 24 关、'
      + '`lyl.location.luoyang` 覆盖 6 关（含抵达关 `luoyang_cloud_secret`，那关没有 atlas 那个）。'
      + '早先只填后者是错的——汉国线 6 关里只有 3 关能响，`dingtao_beijing` 与 `han_succession` '
      + '玩家人在洛都却触发不了。',
    nodes: [
      // 入口改挂（2026-08-16）：跟着八骏查左武军覆灭；第 10 关即可入线。同时喂星月湖。
      { text: '跟着八骏，问清左武军怎么覆灭的', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_01_old_case' },
      // 旧案链的中段：seq 400 已有 event；772／871 需新增。第 4 拍才真正进汉廷的账。
      { text: '与孟非卿复盘，查出有人切断补给、泄漏军机', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_04_left_army_review' },
      { text: '追到汉廷朝会：粮草不继究竟是谁的责任', status: 'new', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.han_court_grain_blame' },
      { text: '查出星月湖大营被诬成左武军覆灭的原因', status: 'new', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.han_xingyue_framed' },
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
    pendingExpansion: '入口改挂（2026-08-16）：`s07_01_old_case` 跟着八骏查左武军覆灭，第 10 关即可入线；该节点同时喂星月湖。'
      + '顶点＝封舞阳侯（实封五千户），辞少府只经商（seq 979）；尚无独立 event。'
      + '仍缺 H4 限田／H5 真空传闻／H6 拥立选择。772 朝会粮草账、871 星月湖被诬尚未落地。'
      + '`s10_04_left_army_review` 可加深调查、双喂星月湖。`taiquan_afterfall_07` 降为「人到洛都」地理拍，不再当入口。',
  },
  {
    id: 'tang',
    name: '唐国',
    kind: 'nation',
    anchorLocationIds: ['liuchao.location.changan'],
    entryHint: '你是带着汉国舞阳侯的身份出使唐国的——入长安，落脚宣平坊。'
      + '路上袁天罡会告诉你：番僧在猎杀穿越者。',
    basis: '长安＝唐国都城，第 30 关可达。**这次不是孪生 id 坑**（实测，2026-08-16）：'
      + '`lyg.location.changan` 确实存在于 6 个关，但那 6 关同时都有 `liuchao.location.changan`——'
      + '是真子集，收一个就够，加了等于没加。（旧 basis 写它「live 关查无」，与实测不符，已改。'
      + '结论没变，理由是错的。汉国洛都那次是真孪生：24 关 vs 6 关互不覆盖，必须全收。）'
      + '**引子按原文重写**（用户 2026-08-16）：他不是「想插手唐国朝局」才去的长安——'
      + 'seq 1055「程宗扬**以舞阳侯身份**从舞都出发，乘船逆流前往唐国出使」：'
      + '**汉国线的顶点就是本线的入场券**，两条线在这里咬合。'
      + '把你卷进佛门纷争的钩子在路上：seq 1061 袁天罡透露番僧猎杀穿越者。',
    nodes: [
      // T1 汉使身份并进同关 s03_09
      { text: '以汉使入长安，在宣平坊落脚', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_01' },
      { text: '看见十方丛林围了大雁塔', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_08' },
      { text: '摸清十方丛林要刺汉使', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_06_beat' },
      // T4 并进 buddhist_conspiracy_04／_06（火遁／佛咒，过程）
      { text: '扛住十方丛林围杀', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_03_beat' },
      // T5 并进 _09_beat／_10_beat
      { text: '揭穿窥基伪诏，逼他弃佛入魔', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_08_beat' },
      { text: '甘露变在大明宫爆发', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_11_beat' },
      // T7 并进 ganlu_aftershock_07_beat
      { text: '旁观李辅国审判；唐皇被弑', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_05_beat' },
      { text: '与众人合力消灭窥基魔身', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_05_beat' },
      // T9 并进 shituolin_endgame_10_beat
      { text: '奉诏讨逆，莲座迎战李辅国', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_09_beat' },
      { text: '联手斩断李辅国肉身', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_12_beat' },
      // T11：objective 是阻止夺舍；axisBeat 写明当场没拦住
      { text: '阻止太皇太后被夺舍', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_13_beat' },
      // 序按 axisSeq：搜查宫中 1382 在受封 1396 之前，先前顶点排在了它前面。
      // 搜查宫中那一拍是原著段与续写第二幕的咬合点，但仍早于受封，顶点收尾。
      { text: '搜查宫中找五肉五甘露', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_14_beat' },
      { text: '接旨大都护、上柱国', status: 'new', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_title_daduhu' },
      // T14 用户裁定（2026-08-16）：没剧本，先留空，不要自行续写
      { text: '换身后续：长安驱魂局', status: 'pending' },
    ],
    pendingExpansion: '线形：以汉使入长安 → 卷入佛门纷争 → 大战窥基魔身 → 甘露变 → 李辅国换身暂告一段落。'
      + '**顶点是临时的**（用户裁定 2026-08-16）：大都护、上柱国（恩同亲王，seq 1396）只是原著段用完时的'
      + '收束点，不是这条线的终局——李辅国换身之后还有戏，等剧本写出来再往后扩。'
      + '所以它与其余七条线的顶点不同档：那七条是"这条线打穿了"，唐国这个是"原著素材到此为止"。'
      + 'T12 需新增 `shituolin_endgame_title_daduhu`（1395 登基／1397 辞官劝告并进）。'
      + 'T14 换身后续：长安驱魂局，没剧本，留空待完成。旧「入仕唐廷的判据」作废。',
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
