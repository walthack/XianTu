/**
 * 二级线入口（R3-10）——把"能不能接到这条线"从模型自觉改成引擎确定性。
 *
 * 立项理由（2026-08-16 用户裁定）：
 *   「二级主线的发展不能靠 LLM 自己发挥，而是稳定可靠、随着玩家自己随时能够触发的
 *    （类似上古卷轴走到一个地方触发事件，接到派系主线任务）。
 *    LLM 的发挥尽量安排在那些非重要小支线或者流言这种程度。」
 *
 * 【锚是什么】**锚＝你知道那件事的那一拍**（用户裁定 2026-08-16，收窄了原规则）。
 *   原来的规则是「国家线锚地点、宗派线锚人」——用户指出那两种**都太宽泛**：
 *   走进建康只是"你到了能知道的位置"，不等于知道宫里闹鬼；见到谢艺也不等于知道星月湖是什么。
 *   **线是被"知道"打开的，不是被"到场"打开的。**
 *   地点与人退为指引落点说明（指向哪里／谁），不再参与判定。
 *   样板是黑魔海：云苍峰把空白羊皮纸解读成秘法传讯的那一刻——用户类比上古卷轴的血手信。
 *
 * 【锚只能落 event，"知道"却是 beat 层的事实】beat 1399 条、event 396 条，约 3.5 : 1；
 *   引擎能观测的只有 `completedEventIds`，所以锚必须落 event。两层对得上的线就精确锚，
 *   对不上的要**为那一拍补 event**——八条里有两条如此（晋国闹鬼 seq 241–242、
 *   唐国番僧猎杀穿越者 seq 1061），见 `anchorEventPending`。
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

export type SecondaryLineKind = 'sect' | 'nation' | 'commerce' | 'expedition';

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
   * **锚：你知道了那件事的那一拍。**
   *
   * 这不是"第三种锚"——是原来那两种太宽泛（用户裁定 2026-08-16）。
   * 走进建康只是"你到了能知道的位置"，不等于知道宫里闹鬼；见到谢艺也不等于知道星月湖是什么。
   * 线是被"知道"打开的，不是被"到场"打开的。
   *
   * 样板是黑魔海：云苍峰把那张空白羊皮纸解读成秘法传讯的瞬间，玩家才第一次知道这个名字。
   * 用户类比上古卷轴的血手信——你不是被派去查它，是有人把它塞进了你手里。
   * 注意它落在第 2 拍而非第 1 拍：见到朱老头（发蛊那关）更早，拿他当门会让线在你知道名字之前就开。
   * 所以是逐条判断"哪一拍是知道"，不是机械取第一个节点。
   *
   * **声明了它就由它单独判定**；`anchorLocationIds`／`anchorCharacterIds` 退为指引落点说明，
   * 只回答"指引把玩家指向哪里／谁"，不参与判定。
   */
  anchorEventIds?: string[];
  /**
   * 锚事件还没写出来——**在它落地之前，退回地点／人这类粗锚**。
   *
   * 八条线里有两条的「知道那一刻」在 beat 层有、event 层没有（实测 2026-08-16）：
   * 晋国的宫城闹鬼（seq 241–242，事件层最近的 seq 264 已经是"去夜探"了）、
   * 唐国的番僧猎杀穿越者（seq 1061，seq 1059–1065 整段事件层空白）。
   * 锚到不存在的 id 上＝这条线永远打不开——主轴已经这么死过 3 条节点，不重蹈。
   *
   * 所以这两条先挂 `new` 节点把 event 补上，锚 id 照写，用本标志声明"暂用粗锚"。
   * event 一旦补出来，去掉本标志即自动切到精确锚。
   */
  anchorEventPending?: true;
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
  /**
   * 制作侧事件结果摘要。玩家当前目标读取 `eventId` 所绑定 event 的固定 `objective`，
   * 不得把本字段直接投到 UI 或主叙事提示词。
   */
  reviewSummary: string;
  status: 'ready' | 'new' | 'pending';
  /** `ready` 必填；`new` 填建议挂载关。 */
  stageId?: string;
  /** `ready` 填现有 event id；`new` 填建议 id。 */
  eventId?: string;
}

/** 当前 event 属于哪些已落地二级线节点。 */
export function secondaryLinesAtEvent(eventId: string | undefined): SecondaryLine[] {
  if (!eventId) return [];
  return SECONDARY_LINES.filter(line => line.nodes.some(node =>
    node.status === 'ready' && node.eventId === eventId));
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
  // —— 商业线：锚事 ——
  {
    id: 'commerce',
    name: '商道',
    kind: 'commerce',
    // 锚＝你第一次发现"生意能办武力办不成的事"那一拍（用户 2026-08-17 指出本线缺失）。
    anchorEventIds: ['lcq.event.weapon_deal_with_geluo'],
    entryHint: '兵器一笔买卖就化开了刀兵——这条路你走得通，往下还有织坊、粮仓、钱庄和一整个商社。',
    basis: '**本线此前完全缺失**（用户 2026-08-17 由「盘江股东大会」一条孤儿反查发现）。'
      + '实测事件层以商业为主语的拍共 18 条，去掉 3 条隔离件后是一条**从 seq 134 贯到 885 的完整弧**，'
      + '跨度为八条线之最：兵器生意（134）→ 织坊换局（359）→ 十万金铢军资（404）→ 粮战全盘（465）'
      + '→ 常平仓火计（496）→ 接管鹏翼社（534）→ 临安粮战令（550）→ 问清纸钞／纸钞纳税（575／578）'
      + '→ 水泥换休战（618）→ 盘江股东大会（644）→ 纸钞买田（885）。'
      + '主语一路在变：先是**换钱**，接着是**换军资**，再往后是**定粮价**、**接管商社**、'
      + '**发行货币**、**开股东大会**，最后用自己发的钞去**买田**——'
      + '这是全书唯一一条把「有钱」变成「有权」的链，而它一条节点都没落。'
      + '锚不取更早的 `s03_03`（seq 38「以新奇器物向苏妲己索酬」）：那一拍在隔离关 `lcq.stage_03`，锚上去线就打不开。'
      + '**双喂说明**：134／404／534／575／578／618／885 已被昭南、江州、宋国等线认领，本线共用不独占——'
      + '同一拍在不同线里问的问题不同（那边问「仗怎么打赢」，这边问「钱从哪来、之后归谁」）。',
    nodes: [
      { reviewSummary: '以兵器生意跟鬼王峒使者阁罗敲定交易，化解眼前危机', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.weapon_deal_with_geluo' },
      { reviewSummary: '以织坊交换，暂时平息小紫为拉链坊兴师问罪', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_04_weaving_trade' },
      { reviewSummary: '以鹏翼社抵押向陶弘敏借得十万金铢，解孟非卿军资', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_05_war_funds' },
      { reviewSummary: '向云苍峰摊开粮战全盘，先从筠州布行暗桩切入', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_09_grain_plan' },
      { reviewSummary: '探明浮凌江乱石滩难通航，粮食转运陷入成本危机', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_01_grain_route_blocked' },
      { reviewSummary: '让滕知州同意江边粮仓交程记粮铺经营，秦桧改口借用', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_04_river_granary' },
      { reviewSummary: '定下烧毁常平仓的火计，粮战进入实操', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_05_granary_fire_plan' },
      { reviewSummary: '得孟非卿许可，接管鹏翼社及星月湖暗控产业', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.pengyi_takeover' },
      { reviewSummary: '水镜令秦桧在筠州抛粮并散布和谈谣言，为临安压价铺路', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_18_linan_grain_order' },
      { reviewSummary: '当面问清贾师宪要推纸币——你要求能纳税且限量', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_paper_plan' },
      { reviewSummary: '让纸钞能纳税——自己发的钱，官府认了', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_paper_mint' },
      { reviewSummary: '用晴州水泥代理权，换黑魔海五年不入宋', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_cement_truce' },
      { reviewSummary: '开盘江程氏第一次股东大会：分红、发股、定主业', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_06' },
      { reviewSummary: '在苍澜镇采购衣物兵器，记下这里贵得不正常', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_07' },
      { reviewSummary: '用纸钞与云秀峰、郭解联手买田——限田令要削到云家', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.han_limit_field' },
      { reviewSummary: '程氏商会方案被囊瓦回绝，兑付改成八折、年五百万、十年', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_04_beat' },
      { reviewSummary: '商社成势之后归谁、能换到什么（未来待扩）', status: 'pending' },
    ],
    pendingExpansion: '⚠ **本线的设计意图与另外八条不同**（用户 2026-08-17）：'
      + '「商业线单独做成一条二级线，我本来的设想是后期通过**商业版图的扩展**'
      + '（攻略各个国家获得**地区声望**）来获得**稳定的金钱／物品**。」'
      + '——即它不是第九条平行故事线，而是**下游汇聚层**：其余八条线打下的地盘，在这条线上结算成收入。'
      + '下面这条 seq 134→885 的节点弧只是它的**故事脊椎**。实测地基（2026-08-17，'
      + '⚠ 先前此处写「地区声望不存在」是错的——按中文 grep 漏看了英文命名的引擎模块，已更正）：'
      + '① **全局声望已是引擎因果**：`settleEventReputation`（runtime.ts）按承重事件确定性给分'
      + '（critical 20／normal 6，见 `reputationLedger.REPUTATION_EVENT_GRANT`）。'
      + '② **地区立足度已实现**：`reputationLedger.regionStanding()` 返回 `地区 → 0..100`，'
      + '键沿用国家线同一套（塞外／昭南／晋国／宋国／汉国／唐国／太泉…），正是本线要消费的形状。'
      + '**但它目前零消费者**——写出来没有任何地方调用。'
      + '③ 钱包齐备：`src/utils/currencySystem.ts` 多币种钱包，目前只有 `InventoryPanel` 在写。'
      + '④ **真正缺的只有折现层**：`regionStanding` × 本线进度 → 每回合收益结进钱包。'
      + '`reputationLedger` 的文件头当初就是这么立项的：「它是商队经营层的前置。'
      + '经营层的定义是『别处的地位在此处折现』」。'
      + '⑤ **待裁定的设计问题**：`regionStanding` 由 `STAGE_ORDER` 走过比例**派生**，'
      + '即「主线打到哪就在哪有分量」，玩家无法主动经营某地。'
      + '若要玩家能选择投入，需另加一个本线节点可推的分量；否则就是「打到哪赚到哪」。'
      + '\n\n**正典写到「用纸钞买田」（seq 885）为止**，再往后商社的政治收束无拍，标待扩不细化。'
      + '另有 3 条在隔离关（`final_preparations`／`s05_04`／`s06_02`），其中 `s05_04`「以兵器生意化解危机」'
      + '与本线首节点 `weapon_deal_with_geluo` 同为 seq 134 同一拍的双版本，取可达那件即可，不申请放出隔离。',
  },
  // —— 太泉：条件一的落点，自成一段 ——
  {
    id: 'taiquan',
    name: '太泉古阵',
    kind: 'expedition',
    // 锚＝你第一次知道「钥匙在迷楼」那一拍（用户 2026-08-19 裁定太泉单独拿出来）。
    anchorEventIds: ['lyl.event.taiquan_sacred_fruit_02'],
    entryHint: '岳鹏举把太泉的钥匙藏在云涛观迷楼里，暗号是「太泉熊谷一四七五」——那地方进得去。',
    basis: '**用户裁定 2026-08-19**：「太泉这一段，我觉得照理说应该单独拿出来，不应该放在原先的主轴里。」\n'
      + '此前这 8 拍挂在主轴上，而主轴按同日裁定只保留「开局→王哲三托付」＋两个通关条件，'
      + '不再作为任务清单展示。太泉恰是**条件一（修为达六阳，前往太泉古阵祭祀故人）的落点**，'
      + '内容上也自成一条完整的弧：摸迷楼机关 → 问出钥匙暗号 → 争赤阳圣果 → 反制潘金莲的追兵 '
      + '→ 找到核心区出口 → 魔墟夺宝 → 进人类居住区。\n'
      + '⚠ `kind: expedition` 是新档位：它既不是宗派（无法统）也不是国家（不是政权地盘），'
      + '是一处**远征目的地**。故不受「国家线跟玩家在这个国家的行动」那条地理规则约束。\n'
      + '⚠ 「太泉古阵＝系统入口」是我们的设计推断，**正典只写「祭祀故人」，全书无「祭祀大阵」字样**'
      + '（见主轴文档与裁定 #159／#160）。本线文案不得把它叙述成开启装置。',
    nodes: [
      { reviewSummary: '随陈琳进云涛观迷楼，摸清机关，撞见小紫等人', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_04' },
      { reviewSummary: '经小紫、梦娘问出：岳鹏举把钥匙藏在迷楼，暗号太泉熊谷一四七五', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_05' },
      { reviewSummary: '到火山口争赤阳圣果，最终被萧遥逸吞下一颗', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_10' },
      { reviewSummary: '与尹馥兰商定：用阴阳鱼和地形反制潘金莲——硬刚还是设伏', status: 'ready', stageId: 'lyl.taiquan_core_conflict', eventId: 'lyl.event.plan_counterattack' },
      { reviewSummary: '与尹馥兰用阴阳鱼反击潘金莲，把追兵挡回去', status: 'ready', stageId: 'lyl.taiquan_core_conflict', eventId: 'lyl.event.yin_yang_counter' },
      { reviewSummary: '蚁穴被咬，虞白樱吸出淫毒——找到通往核心区的出口', status: 'ready', stageId: 'lyl.taiquan_core_conflict', eventId: 'lyl.event.find_exit' },
      { reviewSummary: '天井玻璃破了，赤阳藤外侵、行淫兽盘踞——尹馥兰被触肢缠在幕内', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.xingyin_beast_traps' },
      { reviewSummary: '潘金莲与虞紫薇互推进触肢；潘金莲夺走虞白樱的赤阳圣果走了', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.pan_yu_tentacle_clash' },
      { reviewSummary: '凿碎玻璃、以死气护身穿过触肢丛，把虞白樱与虞紫薇救出来', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.rescue_yu_sisters' },
      { reviewSummary: '小紫用雪雪打服虞白樱，合金手铐一锁——姐妹俩成了她的侍奴', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.xiaozi_binds_yu_sisters' },
      { reviewSummary: '进魔墟：玄秘贝已失，周飞找到琉璃天珠，多方开抢', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_03_beat' },
      { reviewSummary: '与小紫探人类居住区，撞见KTV卖场，推测太泉古阵是避难所', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_05_beat' },
      { reviewSummary: '居住区里潘金莲循迹逼问你是不是黑魔海的人——用阴阳鱼污了她的净化术', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.pan_settlement_clash' },
      { reviewSummary: '潘金莲凭《河图》从拱门带走朱殷与乐明珠，出了太泉', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.pan_hetu_exit' },
      { reviewSummary: '焚无尘被假圣果戏弄后临死自爆——秘境入口就此毁了', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.fen_wuchen_destroys_gate' },
      { reviewSummary: '与小紫、朱老头经传送阵离开太泉，落在首阳山一带；阵要十年才能再充能', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_portal_exit' },
    ],
    pendingExpansion: '正典写到进入人类居住区、推测古阵是避难所为止。'
      + '「修为达六阳后祭祀故人」这一拍**正典无对应 event**（原著中程宗扬从未履行此托付，'
      + '全书修为最高见入微境），属待扩，不在本阶段设计。',
  },
  // —— 宗派线：锚人 ——
  {
    id: 'taiyi',
    name: '太乙真宗',
    kind: 'sect',
    // 锚＝你知道那件事的那一拍（用户裁定 2026-08-16）。
    anchorEventIds: ['lcq.event.s01_04'],
    anchorCharacterIds: ['lcq.character.wang_zhe'],
    entryHint: '太乙真宗的修士已经在战场上报了名号；先随他们离开，等见到王哲时再问清这条门路。',
    basis: '王哲是把程宗扬拉进太乙的人——`lcq.event.s01_04` objective 字面即「加入太乙真宗阵营」，'
      + '并在 `stage_02` 传功托付。**开局强制剧情就会见到他，等于自动开启**（用户确认 2026-08-16）。'
      + '（山门龙池两个 id 均不可达，故不用地点锚。）',
    nodes: [
      // 这条线不是拉票选盟主，是扳倒现任掌教：蔺采泉杀了卓云君的师叔（seq 273）、
      // 与商乐轩争位（391）、最终自立掌教（581），程宗扬后来承诺对付他（629）。
      { reviewSummary: '太乙四教御救下你并收留：蔺采泉、商乐轩、夙未央、卓云君', status: 'ready', stageId: 'lcq.stage_01', eventId: 'lcq.event.s01_04' },
      { reviewSummary: '王哲为你筑基传九阳，托下锦囊、太泉古阵与守护月霜', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.s02_01' },
      { reviewSummary: '王哲九阳合一如日轮殉军——太乙掌教之位就此空出', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.s02_02' },
      { reviewSummary: '紫溪被迫出面：元行健拦船点名去龙池，祁远被推落水', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.zixi_intercept' },
      { reviewSummary: '顶住太乙在紫溪拦船，交涉并把落水的祁远救回', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.zixi_taiyi_intercept' },
      { reviewSummary: '读王哲留下的密信：他要你替他清理太乙的门户', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.wangzhe_letter' },
      { reviewSummary: '夜影关听清：蔺采泉与商乐轩借查卓云君叛教，实在争掌教之位', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.yeying_seat_struggle' },
      // 这是对手开的价，不是盟友协商——文案不要写成结盟。
      { reviewSummary: '破道观又撞见元行健——他替林之澜办事，而线索指向黑魔海', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_06_ruined_temple' },
      { reviewSummary: '审出元行健：暗算月霜是林之澜指使，蔺采泉因拜火教来晴州', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.yuanxingjian_interrogated' },
      { reviewSummary: '亲手了结元行健——审出他是林之澜的人之后', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.yuanxingjian_disposed' },
      // ⏳ 扩写部分，本阶段不再细化（用户裁定 2026-08-16）：正典无此拍，只标未来待扩。
      { reviewSummary: '听清秋少君因元行健之死与林之澜决裂——还被疑卓云君失踪', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.qiushaojun_breaks_with_linzhilan' },
      { reviewSummary: '蔺采泉开价：他支持江州，换你承认九阳神功出自太乙、出自他', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_02_beat' },
      { reviewSummary: '到鹤林观看清：蔺采泉继任掌教，秋少君补齐放鹤出任教御', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_lin_takes_seat' },
      { reviewSummary: '在翠微园向卓云君承诺对付蔺采泉，并写下盘江程氏股份', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.sacred_against_lin' },
      { reviewSummary: '扳倒现任掌教、取得掌教之位（未来待扩）', status: 'pending' },
      { reviewSummary: '锦囊出指令、齐羽仙反用（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: '**顶点是扩写，本阶段只标待扩**（用户裁定 2026-08-16）：正典写到对手蔺采泉自立掌教（seq 581）'
      + '与程宗扬承诺对付他（seq 629）为止，**程侧授名 timeline 无拍**。扳倒掌教、多数教御、自坐或扶代理人——这些都是我们的扩写，不在本阶段细化。'
      + '卓云君收服链（`s07_02`～`s07_04` 等）按裁定归人物任务，不写成本线节点，只在「承诺对付掌教」一拍旁留插入点。',
  },
  {
    id: 'xingyuehu',
    name: '星月湖',
    kind: 'sect',
    // 锚＝你知道那件事的那一拍（用户裁定 2026-08-16）。
    anchorEventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_16'],
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
      { reviewSummary: '向云苍峰问清岳帅生平与星月湖渊源——谢艺要找的或是岳帅姬妾', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_16' },
      // 杀龙与托付已拆拍：`slay_dragon` 只收龙神死亡；命运在 `xieyi_entrustment`。
      // 玩家赶到时他重伤未定，救不救得回来是结果不是前提。
      { reviewSummary: '听谢艺讲清碧鲮与鲛族旧战、朱狐冠来历，他要你接岳帅未竟之事', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.xieyi_biling_war' },
      // 与汉国入口同一 event，待办各说各的：汉国读左武覆灭，本线读番号旧案。
      // 序按 axisSeq：旧案 232 在报丧 251 之前，先前两条排反了。
      { reviewSummary: '刺穿龙颅破苍龙星阵，龙神坠亡', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.slay_dragon' },
      { reviewSummary: '赶到重伤谢艺身边，听清把小紫带往星月湖的托付', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.xieyi_entrustment' },
      // 文案不写「之死」：上游已按裁定改成重伤未定，这里跟着中性化。
      // ⚠ 挂的 event 本身字面即死讯，属 backlog P1-7 四处承重之一，真分岔归 R2-0。
      { reviewSummary: '萧遥逸在左武旧案之前上门：死则接骨灰，生还则接伤员', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.xiaoyaoyi_arrives' },
      { reviewSummary: '萧遥逸交代左武军怎么覆灭，以及岳帅旧案上的分歧', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_01_old_case' },
      { reviewSummary: '按谢艺命运向孟非卿说明下场，并留下实质安排', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_05_eight_steeds_informed' },
      { reviewSummary: '萧遥逸代表星月湖，向你开放资源', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.xiao_opens_resources' },
      { reviewSummary: '古冥隐点破第八骏是萧遥逸，要以太后贵妃为饵杀剑玉姬——身份已暴露', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_08_gumingyin_plot' },
      { reviewSummary: '看萧遥逸闯入昭明宫刑室，把古冥隐逼走', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_09_zhaoming_night' },
      { reviewSummary: '与萧遥逸复盘：八骏已离、幽长老被杀、谢幼度夺北府兵', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_01_eight_steeds_leave' },
      { reviewSummary: '以鹏翼社抵押，向陶弘敏月息两分借十万金铢解孟非卿军资', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_05_war_funds' },
      // 高潮战不只一拍：它的展开在事件层现成躺着，先前每场仗只挑了中间那一条代表拍。
      { reviewSummary: '受命率一营与雪隼六百赴三川口护月霜，并拿到前线指挥权', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_03_protect_yueshuang' },
      { reviewSummary: '星月湖中央军自雪中现身，齐声口号震慑捧日军前锋', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_04_xingyue_appears' },
      { reviewSummary: '抵挡王韬焚天斧——他一人突入宋军前阵，防线崩溃', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_05_wangtao_breaks' },
      { reviewSummary: '星月湖四营与宋军铁甲营在三川口血战，双方伤亡过半仍不退', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_06_snow_battle' },
      { reviewSummary: '桑怿与斯明信、卢景激战被斩，龙卫第一军溃败', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_06_dragon_guard_routs' },
      { reviewSummary: '突袭龙卫左厢摧毁指挥，耿傅率残部结阵死守待援', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_07_left_wing_raid' },
      { reviewSummary: '孟非卿拍板奇袭定川寨，目标阵斩葛怀敏以扭兵力劣势', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_08_dingchuan_raid' },
      { reviewSummary: '定川寨外，孟非卿以雷区伏击突围宋军，阵斩葛怀敏', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_09_ge_huaimin_killed' },
      { reviewSummary: '取得孟非卿许可，全盘接管鹏翼社与星月湖暗产', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.pengyi_takeover' },
      { reviewSummary: '解读祈福暗号，并答复薛延山的会面请求', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.decode_bianmenwa_note' },
      { reviewSummary: '西湖农居听薛延山讲完太湖遇袭，接下照管雪隼残部的托付', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.meet_xue_yanshan' },
      { reviewSummary: '查清薛延山身上寒毒，并确认他是否见过鬼牙', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.identify_xue_cold_poison' },
      { reviewSummary: '查明薛延山在西湖藏身处被杀、首级被取，冯源逃回报信', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.xue_yanshan_slain' },
      { reviewSummary: '出城接月霜等股东，到风波亭祭岳鹏举与谢艺墓', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.lin_an_bridge_xieyi_tomb' },
      { reviewSummary: '岳帅归营、番号恢复、冤案洗雪（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: '顶点＝**全盘接管鹏翼社与星月湖暗产**（seq 534 `第280章·默契`），形态与汉国 979 同构：名分换经营权，'
      + '不是去当第八个骏。旧的「入营判据」pending 作废——正典的完成键就是 534，不该另发明一套军籍手续。'
      + '此前的开放资源（276）、抵押借钱（404）、三川口指挥权（439）、江州并肩都只是**立场**：仍是他们的资源，你在用。',
  },
  {
    id: 'heimohai',
    name: '黑魔海／毒宗',
    kind: 'sect',
    // 线开在「信被解读出来」那一刻，不开在见到某个人（用户裁定 2026-08-16）。
    anchorEventIds: ['lcq.event.s04b_lingfei_baiyi_crisis_04'],
    // 保留但不参与判定：指引把玩家指向朱老头，说明"去问谁"。
    anchorCharacterIds: ['liuchao.character.shang_zhen_yu'],
    entryHint: '鸦人尸体上搜出一张白纸，云苍峰说那是秘法传讯——黑魔海与鬼王峒勾结；'
      + '苏妲己的回话只有一句：别惹他们。要找门路，问同行的朱老头。',
    basis: '**引子＝玩家怎么第一次知道"黑魔海"这个名字**（用户裁定 2026-08-16）：'
      + '原来那句「名分不在总坛里，在人身上」是讲给设计者听的机制说明，不是钩子。'
      + '正典最早两拍：seq 93 从鸦人尸体上搜出一张**空白羊皮纸**，云苍峰鉴定是秘法传讯，'
      + '指向黑魔海与鬼王峒勾结；seq 100 程宗扬报给苏妲己，**她的回话是警告他别招惹**。'
      + '用户点评：「这张白纸就透露了黑魔海这个组织，很像上古卷轴的血手信」——'
      + '即你不是被派去查它，是有人把它塞进了你手里。'
      + '（该拍已是本线第 2 节点 `s04b_lingfei_baiyi_crisis_04`，指引与节点同源。）'
      + '秘密组织不靠走进总坛加入（蓝图总坛在昭南，事件层从未落地）。正典里程宗扬是毒宗系'
      + '「被庇护者」，蓝图 §13-C 定案「名义天命侯＝殇侯，毒宗实推的继承人＝程宗扬」。'
      + '同一 id 两个名字：第 5 关以「朱老头」现身，第 10 关以「殇侯」现身。'
      + '**用殇侯不用小紫**（用户授权判断 2026-08-16）：小紫第 8 关才可达（首现关 `stage_05` 被隔离），'
      + '且她已是主轴血脉线核心承重（层三解锁门／遗孤名册／大祭备用容器），'
      + '兼作黑魔海入口会让玩家分不清"认识小紫"是在推血脉还是在入毒宗。',
    nodes: [
      // 旧表三处挂错，本轮全部纠正：入口挂 `s04_02`（实为鬼王峒武士袭击）→ 改 `s04_04` 发蛊；
      // 「听出天命侯」挂 `s07_03`（实为小紫制服卓云君，零天命侯字样）→ 拆成亮身份与名分两拍；
      // 杀局挂 `_04_beat`（实为野猪林乱战）→ 改 `_08_beat`。
      { reviewSummary: '查清夜间发丝是叶媪发蛊，逼近朱老头却退缩', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_04' },
      { reviewSummary: '把羊皮纸交云苍峰鉴定：疑黑魔海与鬼王峒勾结白夷', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_04' },
      // 原在隔离关 `stage_06` `s06_05`。**不跟着搬进 05b**：这场面见换个地方谈一样开得了后续，
      // 与杀龙没有硬绑。落清远／建康——硬约束只有一条，必须早于下一拍「不与殇侯为敌」，
      // 那时玩家得已经知道朱老头是谁。形态仍是可玩面见，不是「听说他是侯」。
      { reviewSummary: '当面确认朱老头就是殇侯，听他称你是天命之人', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.shanghou_revealed' },
      { reviewSummary: '收下殇侯交出的秦桧——他改称主公，成你身边第一智囊', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_qinhui_join' },
      { reviewSummary: '让殇侯把你身上的冰蛊解了', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.shanghou_cures_ice_gu' },
      { reviewSummary: '在庭院迎入苏妲己——黑魔海高压对局正式摊开', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_04_sudaji_enters' },
      { reviewSummary: '向萧遥逸点破秦桧与毒宗，击掌约下不与殇侯为敌', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.palm_oath_shanghou' },
      { reviewSummary: '古冥隐设毒计：剑玉姬这条线第一次露面', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_08_gumingyin_plot' },
      { reviewSummary: '挡下苏妲己追杀，靠小紫血祭之术从排水沟坠江脱身', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_05_drain_escape' },
      { reviewSummary: '查清：游婵杀死内堂太监，黑魔海嫡传与外聘香主裂开', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_06_blacksea_fracture' },
      { reviewSummary: '以飞鸟熊藏身份从游婵处问清黑魔海广阳布局', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_07_feiniao_infiltration' },
      { reviewSummary: '揭穿泉玉姬潜伏六扇门十年，她是黑魔海御姬奴', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_09_jiangzhou_crisis' },
      // 高潮战不只一拍：它的展开在事件层现成躺着，先前每场仗只挑了中间那一条代表拍。
      { reviewSummary: '追查月霜遇袭：石之隼判定是东瀛忍者，其人已逃', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_03_ninja_trace' },
      { reviewSummary: '定下先发制人打黑魔海——为护月霜、除江州后患', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_07_preemptive_strike' },
      { reviewSummary: '洞穴激战：辛卯泄出星月湖，鱼无夷毒网偷袭孟非卿', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_08_lair_reversal' },
      { reviewSummary: '从鱼无夷濒死处拿到阴阳鱼所在，当作反制黑魔海的钥匙', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_09_yin_yang_fish' },
      { reviewSummary: '从黑魔海银库取出五万金铢，与孟非卿谈定四六分成', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.blacksea_vault_split' },
      { reviewSummary: '小紫擒获龙宸刺客惊理——拿到追查龙宸与黑魔海的入口', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_15_capture_jingli' },
      { reviewSummary: '殇侯施尸毒破开宋军阵线，你因此得救', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_16_corpse_poison' },
      { reviewSummary: '用人情和经济筹码请殇侯留守两月，换来近卫军协防', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_17_shanghou_stays' },
      // ⏳ 扩写部分，本阶段不再细化（用户裁定 2026-08-16）：正典无此拍，只标未来待扩。
      { reviewSummary: '尾随李师师的马车到威远镖局，弄清她为何突然回临安', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.tail_li_shishi' },
      { reviewSummary: '水镜看见小紫驱铁傀儡重创虎翼军，取龙睛玉并以阴魂试傀儡', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.blacksea_iron_puppet' },
      { reviewSummary: '野猪林乱战：林冲重伤衣钵被夺，你抄下袈裟符文', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_04_beat' },
      { reviewSummary: '静善为袈裟符文夜袭，被炸弹击退——你也受了伤', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_05_beat' },
      { reviewSummary: '明庆寺撞见旧识郭槐', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_06_beat' },
      { reviewSummary: '在太医局查医档，摸清剑玉姬已借刘太后用药落子', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_07_beat' },
      { reviewSummary: '在小瀛洲设伏对上剑玉姬、西门庆——西门庆与李师师受伤', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_08_beat' },
      { reviewSummary: '在保宁寺放生池逼出剑玉姬真身——屠龙刀异变龙吟', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_09_beat' },
      { reviewSummary: '保宁寺突围：卓云君腰斩西门庆，剑玉姬带人撤走', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_10_beat' },
      { reviewSummary: '撤回翠微园收拾残局——游婵被劫，直属营伤亡惨重', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_01' },
      { reviewSummary: '用晴州水泥代理权，换黑魔海五年不入宋', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_cement_truce' },
      { reviewSummary: '殇侯用赤婴粉耗尽君雄飞真元后拧颈灭魂', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_08' },
      { reviewSummary: '查清宅下异动：惊理发现黑魔海黑鸦使者，其是卧底', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_05' },
      { reviewSummary: '听剑玉姬以成光换支持刘建，蔡敬仲揭劣迹后当面回绝', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_jianyu_refused' },
      { reviewSummary: '郭解被剑玉姬刺穿心脉，临终把定陶王托付给你', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_06' },
      { reviewSummary: '听阮香凝说定陶王因盛姬亲近她——盛姬是黑魔海御姬奴', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_08' },
      { reviewSummary: '在庵堂性交安抚鱼玄机，同时审讯齐羽仙追问双姬旧怨', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_15_beat' },
      { reviewSummary: '取得天命侯名分（未来待扩）', status: 'pending' },
      { reviewSummary: '大祭：与潘金莲对决、总坛覆灭（续写第二幕）', status: 'pending' },
    ],
    pendingExpansion: '**顶点是扩写，本阶段只标待扩**（用户裁定 2026-08-16）。天命侯（蓝图 §13-C：名义殇侯、毒宗实推程宗扬）正典有词、**无授名**——'
      + 'seq 222 是殇侯称你「天命之人」的谶语，1155 是中行说私室失言的一声惊呼且被当场怒斥，'
      + '全库 396 条 event 搜「天命侯」命中 0。故不编一道「殇侯当场封侯」，'
      + '而是在既有庇护关系上做成可完成的名分拍：完成键＝毒宗侧承认传承已归程，不是有人叫了一声。',
  },
  // —— 国家／地区线：锚地 ——
  {
    id: 'zhaonan',
    name: '昭南',
    kind: 'nation',
    // 锚＝你知道那件事的那一拍（用户裁定 2026-08-16）。
    anchorEventIds: ['lcq.event.s03b_snake_flower_bridge_02'],
    // Helgen 切法之后指引指的是**方向不是人**（「出五原南门一直走」，9ac33d8），
    // 锚的元数据得跟着改：补上五原城这个落点，否则指引与所声明的锚对不上。
    // **孪生 id 全收**：`wuyuan` 30 关／`wu_yuan_cheng` 1 关。
    anchorLocationIds: ['liuchao.location.wuyuan', 'liuchao.location.wu_yuan_cheng'],
    // 云苍峰／武二郎保留为引路人说明，不参与判定（判定在事件锚）。
    anchorCharacterIds: [
      'liuchao.character.yun_cang_feng', // 云苍峰 第 4 关·商队带你进南荒
      'liuchao.character.wu_er_lang',    // 武二郎 第 5 关·南荒队伍成员
    ],
    entryHint: '南荒没有可投的朝廷。跟云苍峰的商队走，或者自己出五原南门沿商路南下——'
      + '到了蛇彝村，才会知道这一带出了什么事。',
    basis: '**原破例已作废**（Helgen 切法 9ac33d8，2026-08-17）：先前昭南是唯一用人物锚的国家线，'
      + '理由是「南荒没有可投的朝廷，只有带你进去的人」。现在入口改成「出五原南门一直走」——'
      + '那是个地方，商队降为默认矢量上最常见的交通、不是门票，破例的前提不再成立。'
      + '**两条路都算**（用户 2026-08-16）：跟商队走，或自己南下到蛇彝村见证——'
      + '同汉国的双路入口。故回归常规国家线：锚五原城（**孪生 id 全收**：`wuyuan` 30 关／`wu_yuan_cheng` 1 关），'
      + '云苍峰／武二郎保留为引路人说明、不参与判定。判定仍在事件锚（灭村那一拍）。',
    nodes: [
      // 序按 axisSeq：屠村 62 → 血符 63 → 云氏同行 64。
      // 先前把「跟商队进南荒」排在调查之前，与正典反了——你是先撞见被屠的村子，
      // 云家提议同行是你的反应，不是你入南荒的前提。（Z1 并进同关 _03 血符）
      { reviewSummary: '当面认清凝羽处境并回应——她奉苏妲己之命进赌局', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.ningyu_enters_gamble' },
      { reviewSummary: '识破白湖商馆主人苏妲己的伪装——她要的是霓龙丝的下落', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.s02_06' },
      { reviewSummary: '与苏妲己订下三月南荒之约——采霓龙丝，否则炮烙', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.sudaji_south_pact' },
      // Z3 并进 lcq.event.s04_01（密谋刺王）
      { reviewSummary: '赌局落败，苏妲己作弊——签下卖身契，落入白湖商馆奴籍', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.gamble_bond_signed' },
      // Z4 并进 s04b_lingfei_baiyi_crisis_08／_09（识破投峒、族长被换）
      { reviewSummary: '帮苏妲己取物前，谈定六十金铢报酬', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.charge_sudaji_fee' },
      { reviewSummary: '撕毁阿姬曼身契——出城路线已被封锁', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.free_ajiman' },
      { reviewSummary: '从白湖商馆的死局里脱身，走出五原商馆', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.baihu_shangguan_escape' },
      // Z7 并进 s05b_05b_ideology_duel_and_defeat
      { reviewSummary: '苏妲己以冰蛊逼你南行——两日内必须凑齐队伍', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.ice_gu_coercion' },
      { reviewSummary: '满城围捕下逼出武二郎入队——他走投无路才答应', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.wuerlang_joins' },
      { reviewSummary: '利用武二郎无路可退的处境，取得他随队南行的明确承诺', status: 'ready', stageId: 'lcq.stage_03', eventId: 'lcq.event.s03_06' },
      { reviewSummary: '稳住武二郎伤势，带队突破铁索桥伏击', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.iron_bridge_ambush' },
      { reviewSummary: '劝住要折返五原的武二郎，商队继续南行', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.persuade_wuerlang' },
      { reviewSummary: '阻止武二郎折返五原，并让商队继续南行——西门庆登场', status: 'ready', stageId: 'lcq.stage_03', eventId: 'lcq.event.s03_08' },
      { reviewSummary: '听清凝羽弑主开价，并探明她体内阴寒之气来源', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.ningyu_regicide_offer' },
      { reviewSummary: '在紫溪现身交涉，并把落水的祁远救回船队', status: 'ready', stageId: 'lcq.stage_03', eventId: 'lcq.event.s03_10' },
      { reviewSummary: '在紫溪现身跟太乙交涉，并把落水的祁远救回船队', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.zixi_taiyi_intercept' },
      { reviewSummary: '依凝羽火光带两支商队渡过黑石滩——雨林有伤亡', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.rainforest_black_shoal' },
      { reviewSummary: '把商队安进无灯火无人声的蛇彝村', status: 'ready', stageId: 'lcq.stage_02', eventId: 'lcq.event.silent_sheyi_village' },
      { reviewSummary: '查清蛇彝长屋屠村，痕迹指向鬼王峒，焚屋撤离', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_02' },
      { reviewSummary: '与云苍峰同行赴白夷，透露霓龙丝——谢艺给出碧鲮线索', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_04' },
      { reviewSummary: '带着商队攀万古巨藤，藤桥一断被困半空石壁', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_05' },
      { reviewSummary: '求助花苗族长，脱离困境——苏荔登场', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_06' },
      { reviewSummary: '问清花苗：苏荔被迫送出龙神新娘与贡物——去向熊耳铺', status: 'ready', stageId: 'lcq.stage_03b_snake_flower_bridge', eventId: 'lcq.event.s03b_snake_flower_bridge_07' },
      { reviewSummary: '乐明珠自认光明观堂弟子：她假扮花苗新娘，是为刺杀鬼巫王', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_03' },
      { reviewSummary: '探查鬼王峒送亲队内情——秦桧、吴三桂登场', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_01' },
      { reviewSummary: '与白夷族长交涉：他改要十日五万银铢现款，不再以货易货', status: 'ready', stageId: 'lcq.stage_04', eventId: 'lcq.event.s04_07' },
      { reviewSummary: '说服武二郎，把明晚夺取灵飞镜的计划谈定', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_01' },
      { reviewSummary: '趁机斩下鸦人，救下乐明珠和阿夕', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_03' },
      { reviewSummary: '在白夷祭坛下坠洞，得武二郎相救后寻得灵飞镜', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_05' },
      { reviewSummary: '听云苍峰与苏荔谈定：花苗准备联手白夷抗峒', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_06' },
      { reviewSummary: '借易勇水镜向苏妲己报黑魔海——她警告快寻霓龙丝', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_07' },
      { reviewSummary: '用灵飞镜查探白夷阴谋——樨夫人登场', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_08' },
      { reviewSummary: '看清鬼王峒使者换掉族长，樨夫人接掌白夷', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_09' },
      { reviewSummary: '追入地宫甬道，躲开鬼王峒使者的陷阱与鬼武士', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_10' },
      { reviewSummary: '挡下血虎易虎扑向武二郎，易彪没能唤醒兄长', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_11' },
      { reviewSummary: '压住苏荔硬闯鬼王峒，先同武二郎等人改往碧鲮', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_14' },
      { reviewSummary: '看祁远下水取回龙睛玉，苏荔射杀鳄鱼救险', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_17' },
      { reviewSummary: '与凝羽从淹没竹楼逃出，改去寻找云苍峰', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_19' },
      { reviewSummary: '记下黑舌死亡疑点，并当面回应碧鲮少女小紫登场', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.xiaozi_first_appears' },
      { reviewSummary: '在废弃海神殿挡住鲛人，护住受困的乐明珠', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.haishen_hall_merfolk' },
      { reviewSummary: '拔除鱼叉稳定乐明珠伤势', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.pull_harpoon_lemingzhu' },
      { reviewSummary: '收拢残余商队，确认鬼王峒使者已抵达海湾', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.regroup_caravan_envoy' },
      { reviewSummary: '以兵器生意跟鬼王峒使者阁罗敲定交易，化解眼前危机', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.weapon_deal_with_geluo' },
      { reviewSummary: '接住祁远的军火商说辞，并以回扣敲定兵器交易——阁罗登场', status: 'ready', stageId: 'lcq.stage_05', eventId: 'lcq.event.s05_04' },
      { reviewSummary: '处置偷听的鬼王峒眼线，厘清兵器交易背后的危险', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.spot_dong_informant' },
      { reviewSummary: '厘清兵器交易背后的危险，并处置偷听的鬼王峒眼线——碧姬登场', status: 'ready', stageId: 'lcq.stage_05', eventId: 'lcq.event.s05_06' },
      { reviewSummary: '赶到碧鲮湾斩杀蛇傀——碧鲮族获释后反攻鬼王峒', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.biling_bay_stance' },
      { reviewSummary: '在古道废墟认出鬼王峒标记，帮易彪守住阵地', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.ruins_ghost_warriors' },
      { reviewSummary: '撑住达古围攻，见证武二郎斩达古扭转战局', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.wuerlang_slays_dagu' },
      { reviewSummary: '护住苏荔以一阳境逼退阴煞', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.yiyang_repels_yinsha' },
      { reviewSummary: '跟花苗谈清进峒边界：与云氏平等合作，不是依附', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.huamiao_coop_boundary' },
      { reviewSummary: '安置旧伤复发的凝羽，与云氏、花苗谈成探峒同行', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.guiwangdong_coop_pact' },
      { reviewSummary: '随弥骨进峒，拦住接待冲突，记清路线与奴隶区', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.enter_dong_with_migu' },
      { reviewSummary: '打开白纸信笺仍是白纸，小紫当着阁罗说破达古已死', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.blank_letter_and_dagu' },
      { reviewSummary: '阁罗召来碧奴碧姬——当面见到谢艺要找的人', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.geluo_summons_biji' },
      { reviewSummary: '借机关异动摆脱看守，从岩壁找出可通行山洞', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.escape_cave_mechanism' },
      { reviewSummary: '看出红苗已被峒里控制，先把苏荔保下来', status: 'ready', stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', eventId: 'lcq.event.hongmiao_controlled' },
      { reviewSummary: '从萨安处获取鬼王宫密道', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_03_saan_secret_path' },
      { reviewSummary: '同谢艺、武二郎、凝羽潜入鬼王宫，循小紫痕迹先找乐明珠', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_04_enter_ghost_palace' },
      { reviewSummary: '潜入鬼王宫见鬼巫王——听清统一南荒与龙神计划', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_05a_meet_ghost_king' },
      { reviewSummary: '与鬼巫王交锋，设法脱身——丹宸登场', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_05b_ideology_duel_and_defeat' },
      { reviewSummary: '跃入深井平台救苏荔，解开螺旋长针脱身', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_08a_rescue_suli' },
      { reviewSummary: '在祭台对抗尸鬼，寻找突围机会——朱诺登场', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_08b_altar_corpse_fight_and_danchen' },
      { reviewSummary: '稳住乐明珠药效，以岳鹏举身份线劝小紫临时反杀鬼巫王', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_09_temporary_pact_with_xiaozi' },
      { reviewSummary: '小紫倒戈、奴隶暴动，你决定反杀——乐明珠凤凰宝典异变', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.s05b_10_slave_revolt_and_phoenix_change' },
      { reviewSummary: '祭台决战：鬼巫王唤醒龙神，反被龙神一口吞掉', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.ghost_king_swallowed' },
      { reviewSummary: '借小紫指点了结龙神', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.slay_dragon' },
      { reviewSummary: '赶到重伤谢艺身边，听清把小紫带往星月湖的托付', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.xieyi_entrustment' },
      { reviewSummary: '追上小紫，见证她对质后亲手弑母碧姬并接下余波', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.xiaozi_kills_mother' },
      { reviewSummary: '解散鬼王峒，令三族共处，龙神尸骸收益分十份', status: 'ready', stageId: 'lcq.stage_05b', eventId: 'lcq.event.tribes_pledge' },
      { reviewSummary: '循朱老头留下的路线进入村落，当面确认殇侯身份与天命之说', status: 'ready', stageId: 'lcq.stage_06', eventId: 'lcq.event.s06_05' },
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
    // 锚事件已于 2026-08-17 写出（`palace_haunting_rumor`, seq 241），故摘掉 anchorEventPending，
    // 由事件锚精确判定；建康地点锚退为指引落点说明。
    anchorEventIds: ['lcq.event.palace_haunting_rumor'],
    anchorLocationIds: ['liuchao.location.jiankang'],
    entryHint: '建康宫城闹鬼的传闻。',
    basis: '建康＝晋国都城（官方附录地图 jin-nanzhao 幅在场；描述「晋国都城」）。第 10 关可达。'
      + '**引子＝世界此刻的状态，不是原著那一场戏**（用户 2026-08-16 两轮裁定）：'
      + '先是「想插手晋国朝局，去建康」这种模板话被打回；改写后我又写成了场景复述'
      + '（用灵飞镜窥宫、撞见大汉从假山钻出、萧遥逸提议夜探台城），同样被打回——'
      + '**那等于把玩家绑回原著的单一路径：他必须以那个方式撞见才算入线。**'
      + '现在只给传闻，怎么撞见是玩家的事。'
      + '正典依据：seq 241 灵飞镜窥宫撞见可疑大汉、seq 242 与萧遥逸谈「宫禁闹鬼」并夜探台城，'
      + 'seq 268 查出那是徐度安插的幽冥宗卧底——篡位的前戏。这些是**闹鬼传闻底下的真相**，'
      + '不写进指引（引擎不替玩家剧透）。',
    nodes: [
      // 锚事件：seq 241–242 灵飞镜窥宫、与萧遥逸谈「宫禁闹鬼」。beat 有、event 无，需新增。
      { reviewSummary: '萧遥逸在左武旧案之前上门：死则接骨灰，生还则接伤员', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.xiaoyaoyi_arrives' },
      { reviewSummary: '萧遥逸交代左武军怎么覆灭，以及岳帅旧案上的分歧', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_01_old_case' },
      { reviewSummary: '用灵飞镜窥见假山大汉钻出，被他察觉——宫禁闹鬼传开', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.palace_haunting_rumor' },
      // J2 并进 s08_03_beifu_rescue
      { reviewSummary: '与萧遥逸夜探神龙殿：晋帝昏迷如死，似遭操控', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_07_dragon_hall' },
      { reviewSummary: '在皇宫与云丹琉交手后逃生', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_08_palace_escape' },
      { reviewSummary: '萧遥逸一行入鹰愁峪，遭徐敖州府兵军弩伏击，被困谷中', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_01_eagle_valley' },
      { reviewSummary: '与吴三桂死守木垒，重伤仍击退州府兵', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_02_wood_fort' },
      { reviewSummary: '易彪率北府兵扮禁军全歼州府兵——萧遥逸识破他们身份', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_03_beifu_rescue' },
      { reviewSummary: '九阳修复经脉，突破入微境，以珊瑚匕首逼退苏妲己', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_05_breakthrough' },
      { reviewSummary: '在宫室应对东瀛忍者——飞鸟熊藏登场', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_07_palace_ninja' },
      { reviewSummary: '随萧遥逸闯昭明宫刑室，逼退古冥隐', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_09_zhaoming_night' },
      { reviewSummary: '玄武湖上秦桧、吴三桂救下晋帝太后，古冥隐败逃', status: 'ready', stageId: 'lcq.stage_08_jiankang_coup', eventId: 'lcq.event.s08_10_xuanwu_rescue' },
      // J9 前半已有 s12_14_chenxing_appears／s12_15_capture_jingli；后半需新增
      { reviewSummary: '看清分赃：萧家江宁、云家盐业、你一无所得', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.spoils_split' },
      { reviewSummary: '与萧遥逸复盘：八骏已离，幽长老被杀，北府兵权归谢幼度', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_01_eight_steeds_leave' },
      // 顶点占位：原文未明，称号待定（seq 334「程宗扬无所得」）
      // ⏳ 扩写部分，本阶段不再细化（用户裁定 2026-08-16）：正典无此拍，只标未来待扩。
      { reviewSummary: '问清王茂弘：相府无为让权给萧侯，承诺保晋国二十年太平', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.xiangfu_stance' },
      { reviewSummary: '与小紫、卓云君从排水沟逃出建康，挡下苏妲己追杀', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_05_drain_escape' },
      { reviewSummary: '以飞鸟熊藏身份潜伏，从游婵处摸清广阳布局后脱身', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_07_feiniao_infiltration' },
      { reviewSummary: '收下泉玉姬用一魂一魄炼的魂丹，她的生死自此在你手里', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.quanyuji_soul_pill' },
      { reviewSummary: '在六扇门审问泉玉姬', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_08_six_doors_confession' },
      { reviewSummary: '揭穿泉玉姬是黑魔海御姬奴，并得知江州危急', status: 'ready', stageId: 'lcq.stage_09_trade_and_escape', eventId: 'lcq.event.s09_09_jiangzhou_crisis' },
      { reviewSummary: '确认晋相腾出江州让宋军剿星月湖，不惜毁城', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.jin_vacate_jiangzhou' },
      { reviewSummary: '听张少煌得知晋旱与王茂弘意图，决定全力收粮，建康做营销中心', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.sacred_jin_drought' },
      { reviewSummary: '把广源行在晋的旧账揭开（龙宸这条线）', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.jin_guangyuan_ledger' },
      { reviewSummary: '押运云氏五万金铢至伊水，被龙宸杀手劫走，反击损失惨重', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_09' },
      { reviewSummary: '在晋廷取得一个名分（未来待扩，原文未明）', status: 'pending' },
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
    // 锚＝你知道那件事的那一拍（用户裁定 2026-08-16）。
    anchorEventIds: ['lcq.event.s10_01_jiangzhou_order'],
    anchorLocationIds: ['liuchao.location.jiangzhou', 'liuchao.location.linan', 'liuchao.location.lin_an'],
    entryHint: '贾师宪已经大举集结，江州要打起来了。',
    basis: '临安＝宋国都城。`linan` 覆盖 30 关为主，`lin_an` 只 1 关，一并收下防漏；'
      + '`linan_city` 只在隔离关 `taiquan_expedition`，不收。'
      + '**另收江州**（2026-08-16）：正典里宋国不是你走进临安才遇上的——seq 380 卢景带来消息，'
      + '贾师宪大举集结、江州兵危，程宗扬当场决定改道去援；seq 383 贾师宪下令攻江州清岳党。'
      + '（指引只说这个局势本身，不写"卢景带信来"——**报信人是谁不该写死**，同晋、唐两条。）'
      + '本线第一个节点就落在 seq 383，而临安要到 seq 559 才落脚：只锚都城等于让入口比第一拍晚 176 拍。'
      + '这与汉国「只锚洛都、把第 10 关的旧案漏掉」是同一个错，一并纠正。',
    nodes: [
      { reviewSummary: '探明贾师宪无视王丞相回书，下令攻江州清岳党，还要用上四军示威', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_01_jiangzhou_order' },
      { reviewSummary: '在夜影关因宋军封锁云水航道，改走陆路去晴州', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_02_yeying_pass' },
      // S2 并进 s11_09_grain_plan
      { reviewSummary: '从濒死的鱼无夷处拿到阴阳鱼藏在七海客栈的线索', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_09_yin_yang_fish' },
      // S3 并进 s12_16_corpse_poison
      // 高潮战不只一拍：它的展开在事件层现成躺着，先前每场仗只挑了中间那一条代表拍。
      { reviewSummary: '侦察烈山：捧日军骑兵已到，刘宜孙、张亢选营，三川口成形', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_01_pengri_arrives' },
      { reviewSummary: '萧遥逸展示十二座水泥城堡与悬楼，江州城防大幅提升', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_02_cement_fortress' },
      { reviewSummary: '与小紫、孟非卿守中军，木栅仍被术者与御林军破开', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_07_camp_falls' },
      { reviewSummary: '向江州问清三川口的结局——捧日军三个军被星月湖击溃，不是捷报', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.sanchuankou_result_rumor' },
      { reviewSummary: '赶回江州，协助全城戒严并加固城防', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_08_jiangzhou_lockdown' },
      { reviewSummary: '在三川口抵御西夏围攻，后军黄德和脱逃改写前线', status: 'ready', stageId: 'lcq.stage_11_lieshan_battle', eventId: 'lcq.event.s11_10_sanchuankou_defeat' },
      { reviewSummary: '同萧遥逸、云苍峰探明浮凌江乱石滩，粮运走不通', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_01_grain_route_blocked' },
      { reviewSummary: '说动滕知州在江边设粮仓交程记粮铺经营——秦桧改口说只是借用', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_04_river_granary' },
      { reviewSummary: '接下滕甫捐来的屯田司员外郎，把籍贯落进册', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.tuntian_post' },
      { reviewSummary: '从秦翰手里拼死救下萧遥逸，击伤其一指，重伤线开启', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_10_rescue_xiao' },
      // S4 抵达／祭墓建议并进 lin_an_arrive，不单开
      { reviewSummary: '防守江州：宋军连夜两万余人携投石机、巢车、云梯全面攻城', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_11_siege_begins' },
      { reviewSummary: '城门用水泥门闸和滚油烧掉宋军冲车，江州守城占先', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_12_gate_fire' },
      { reviewSummary: '应对宋军改用土山和地道，江州进入长期围困', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_13_long_siege' },
      { reviewSummary: '小紫点破刺客是辰星七妖——背后是龙宸', status: 'ready', stageId: 'lcq.stage_12_jiangzhou_counterwar', eventId: 'lcq.event.s12_14_chenxing_appears' },
      { reviewSummary: '协助江州退军：宋军粮尽大溃，秦翰选锋营断后', status: 'ready', stageId: 'lyl.jiangzhou_retreat', eventId: 'lyl.event.s01_01' },
      { reviewSummary: '乘船前往临安——鱼长老登场', status: 'ready', stageId: 'lyl.jiangzhou_retreat', eventId: 'lyl.event.s01_02' },
      { reviewSummary: '赶到荆溪村寨，斩杀屠寨凌辱妇女的王团练乡兵', status: 'ready', stageId: 'lyl.jiangzhou_retreat', eventId: 'lyl.event.s01_03' },
      { reviewSummary: '尾随李师师马车到威远镖局，确认她突然回临安的缘故', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.tail_li_shishi' },
      // S5 另建议 lyl.event.lin_an_libu（临安落册）；文案用屯田司员外郎，不用「客卿」
      { reviewSummary: '识破皇城司盯梢，不动手，以富商身份掩护进明庆寺', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.evade_huangchengsi' },
      // 序按 axisSeq：太皇太后 604 在高俅 624 之前，先前两条排反了。
      { reviewSummary: '绕武穆王府查清建筑方位，没惊动周边暗梢', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.survey_wumu_mansion' },
      { reviewSummary: '在风波亭后拜祭谢艺并安顿临安落脚处——敖润、冯源、林清浦登场', status: 'ready', stageId: 'lyl.lin_an_black_sea', eventId: 'lyl.event.debut_ruan_sisters' },
      { reviewSummary: '听俞子元回报，确认高衙内勒索威远镖局的条件', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.weiyuan_extortion' },
      // S10 并进 changgan_interlude_04_beat
      { reviewSummary: '明庆寺外看鲁智深倒拔垂杨柳、林冲上前通名——你按住秦桧，没有贸然结交', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.mingqingsi_lin_lu_meeting' },
      { reviewSummary: '办完吏部报到，查明林冲调走了哪些档案', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.libu_registration' },
      { reviewSummary: '便门瓦牡丹棚摸到宋军部署、贾师宪决策、林冲底细，线人疑在皇城司', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.lin_an_bridge_01_beat' },
      { reviewSummary: '应李师师之邀登雷峰塔', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.leifeng_pagoda_invite' },
      { reviewSummary: '雷峰塔拦住陆谦强带走李师师，逼退高衙内一行', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.leifeng_repel_gao' },
      { reviewSummary: '研判黑魔海或经林娘子渗禁军，决定去拜访鲁智深', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.lin_an_bridge_03_beat' },
      { reviewSummary: '与秦桧复盘雷峰塔冲突，决定继续追查威远失镖', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.decide_chase_weiyuan' },
      { reviewSummary: '看过叩天石，按暗号约定赶往便门瓦接头', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.pass_kotian_stone' },
      { reviewSummary: '以押运象牙为名试探李寅臣夫妇，查明他们对李师师婚事的决定', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.ivory_visit_weiyuan' },
      { reviewSummary: '以押运象牙为名试探李寅臣夫妇，查明他们对李师师婚事的决定——阮香琳登场', status: 'ready', stageId: 'lyl.taiquan_expedition', eventId: 'liuchao.event.reconnoiter' },
      { reviewSummary: '司营巷旁观林冲买刀，确认伏击结果，不打断高衙内的局', status: 'ready', stageId: 'lyl.lin_an_bridge', eventId: 'lyl.event.siying_lane_saber_ambush' },
      { reviewSummary: '林家认出凝姨是阮香凝，婚后表象不对，疑她通黑魔海', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.linjia_sees_ningyi' },
      { reviewSummary: '在林家确认凝姨的真实身份，并保留刚发现的疑点——青面兽、阮香凝登场', status: 'ready', stageId: 'lyl.taiquan_expedition', eventId: 'liuchao.event.fruit_conflict' },
      { reviewSummary: '潜入西湖别业，听清高衙内与陆谦复盘失镖圈套，还要继续设计林冲', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xihu_villa_eavesdrop' },
      { reviewSummary: '偕李师师赴梵天寺遭禁军伏击，马车被毁，俞子元掩护', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_01_beat' },
      { reviewSummary: '多宝阁问清贾师宪要你推纸币——你要纸币能纳税、发行量须经认可', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_paper_plan' },
      { reviewSummary: '童贯引见宋主，纸币获准纳税并共同监制', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_paper_mint' },
      { reviewSummary: '林冲持刀闯白虎堂被刺配江州，你与鲁智深计划营救', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_03_beat' },
      { reviewSummary: '坐实林冲没被救下——刺配照旧，他仍要去江州', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.linchong_still_exiled' },
      { reviewSummary: '潜入明庆寺观音殿，被郭槐、封德明制住，太皇太后认出劳力士后放人', status: 'ready', stageId: 'lyl.xiaoyingzhou_blacksea_trap', eventId: 'lyl.event.xiaoyingzhou_blacksea_trap_06_beat' },
      { reviewSummary: '与高俅密谈，得知宋主生母是韦太后等宫廷身世疑云', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_03' },
    ],
    pendingExpansion: '线形：卷入贾师宪清岳党 → 查清粮战与围城 → 相府／太尉／后宫立场 → 纸钞落地逼退＋昭南索赔 → 礼部侍郎、通问计议使。'
      + '顶点＝礼部侍郎、通问计议使（seq 1134）。578 共同监制、1160 出资解困并进 S11，不另封「宝钞使」。'
      + 'S5／S6／S9／S11 需新增。S5 用屯田司员外郎，不用「客卿」。威远／武穆王府不上链。',
  },
  {
    id: 'han',
    name: '汉国',
    kind: 'nation',
    // 锚＝你知道那件事的那一拍（用户裁定 2026-08-16）。
    anchorEventIds: ['lcq.event.s07_01_old_case'],
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
      { reviewSummary: '萧遥逸在左武旧案之前上门：死则接骨灰，生还则接伤员', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.xiaoyaoyi_arrives' },
      { reviewSummary: '萧遥逸交代左武军怎么覆灭，以及岳帅旧案上的分歧', status: 'ready', stageId: 'lcq.stage_07_qingyuan_jiankang', eventId: 'lcq.event.s07_01_old_case' },
      // 旧案链的中段：seq 400 已有 event；772／871 需新增。第 4 拍才真正进汉廷的账。
      { reviewSummary: '与孟非卿复盘王哲左武军覆灭：有人切断补给、泄军机，排除金蜜镝', status: 'ready', stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_04_left_army_review' },
      { reviewSummary: '抵达苍澜镇，看清昂贵物价与太泉异常', status: 'ready', stageId: 'lyl.taiquan_sacred_fruit', eventId: 'lyl.event.taiquan_sacred_fruit_07' },
      { reviewSummary: '与虞白樱从蚁穴脱险，太泉余波进了身体', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_01_beat' },
      { reviewSummary: '前往洛都查明风波——宁成登场', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_07_beat' },
      { reviewSummary: '与冯子都结交探听渠道——高智商、徐璜登场', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_08_beat' },
      { reviewSummary: '汉廷朝会上追问：王温舒攻韦玄成，左武军粮草不继究竟谁的责', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.han_court_grain_blame' },
      { reviewSummary: '襄城君府密室发现小紫已控制孙寿，并透露刺杀韩定国', status: 'ready', stageId: 'lyl.taiquan_afterfall', eventId: 'lyl.event.taiquan_afterfall_10_beat' },
      { reviewSummary: '与云苍峰商定开首阳山铜矿，并经西邸买二千石官与郡县小吏', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_01' },
      { reviewSummary: '在山口镇应对吕氏兄弟调来的卫尉、屯骑等四军围杀', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_03' },
      { reviewSummary: '在宅院抵御吕氏死士进攻——哈迷蚩登场', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_04' },
      { reviewSummary: '严君平告知星月湖被诬致左武军覆没，末块玉牌藏胶西', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.han_xingyue_framed' },
      { reviewSummary: '与云秀峰、郭解用纸钞买下一千五百顷田，看清限田令要卷进云家', status: 'ready', stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.han_limit_field' },
      { reviewSummary: '与赵合德藏在含光殿藻井，看完吕冀淫辱友通期全过程', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.lvji_defiles_consort' },
      { reviewSummary: '在藻井上屏息藏住自己与赵合德，看完含光殿中发生的一切——刘骜、义姁登场', status: 'ready', stageId: 'lyl.luoyang_coup', eventId: 'lyl.event.s06_01b' },
      { reviewSummary: '扮作内侍混出昭阳宫，护赵飞燕与赵合德撤回长秋宫', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.emperor_death_spreads' },
      { reviewSummary: '扮作内侍混出昭阳宫，护送赵飞燕与赵合德撤回长秋宫——中行说、刘建登场', status: 'ready', stageId: 'lyl.luoyang_coup', eventId: 'lyl.event.s06_01' },
      { reviewSummary: '从密道出宫召齐各方：定下拥立定陶王，分派任务', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.arrange_escape_route' },
      { reviewSummary: '从密道出宫，召齐各方定下拥立定陶王并分派任务——程郑登场', status: 'ready', stageId: 'lyl.luoyang_coup', eventId: 'lyl.event.s06_02' },
      { reviewSummary: '确认刘建已起兵攻占南宫与武库', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.liujian_takes_nangong' },
      { reviewSummary: '守住长秋宫台阶，同时留着刘建的命', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.changqiu_palace_defense' },
      { reviewSummary: '守住长秋宫台阶，并看住刘建的性命不能在此时丢掉——蔡敬仲登场', status: 'ready', stageId: 'lyl.luoyang_coup', eventId: 'lyl.event.s06_04' },
      { reviewSummary: '立赏格稳住长秋宫守军，抢在两方使节前争取到胡骑校尉桓郁', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.bounty_and_hu_cavalry' },
      { reviewSummary: '看住阿阁不让吕氏接走赵皇后——吕奉先已单骑破阵', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.lvfengxian_breaks_line' },
      { reviewSummary: '前往吕冀营帐查探情况——吕雉登场', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_01_beat' },
      { reviewSummary: '从传闻得知：天子已死，含光殿落到吕冀手里，刘建已起兵占了南宫', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_power_vacuum' },
      { reviewSummary: '决定是否出面拥立定陶王', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_sponsor_dingtao' },
      { reviewSummary: '随左武军进入皇宫——古格尔、吕巨君登场', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_02_beat' },
      { reviewSummary: '走复道遇伏，借秦桧烟雾脱身', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_04_beat' },
      { reviewSummary: '赶到平朔殿，吕巨君已与廖扶自焚', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_05_beat' },
      { reviewSummary: '闻清语掳走赵飞燕赵合德，云丹琉救下定陶王', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_06_beat' },
      { reviewSummary: '接应逃出北宫的赵飞燕、赵合德——合德把姐姐救了出来', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.zhao_sisters_flee_north_palace' },
      { reviewSummary: '赶往洛都津门：董卓率三千凉州军无虎符入京，斩杀骑手', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_08_beat' },
      { reviewSummary: '随金蜜镝攻入永安宫，把刘建逼上阙楼', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_09_beat' },
      { reviewSummary: '赶到阙楼，由秦桧斩下刘建并取其首', status: 'ready', stageId: 'lyl.han_palace_endgame', eventId: 'lyl.event.han_palace_endgame_10_beat' },
      { reviewSummary: '贾文和挟持定陶王对峙，最终以五名扈卫代价放行', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_02' },
      { reviewSummary: '随董卓凉州军挟定陶王出洛都，军士割袍追随', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_03' },
      { reviewSummary: '长秋宫听吕雉向霍子孟宣布退位、处置吕冀，支持立定陶王', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_04' },
      { reviewSummary: '到昭阳宫：董卓拥立定陶王为帝，贾文和献大赦、选材、迁都', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_05' },
      { reviewSummary: '剑玉姬刺穿郭解心脉，他临终把定陶王托付给你', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_06' },
      { reviewSummary: '董卓死在贾文和怀里，留下胡骑异动、边地将有剧变的军情', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_07' },
      { reviewSummary: '奉懿旨至永巷当众凌辱并赐死吕冀，其妻孙寿发配为奴', status: 'ready', stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_09' },
      { reviewSummary: '率众为郭解送葬，立郭靖为义子并让他继承舞阳侯', status: 'ready', stageId: 'lyg.mijing_rumen', eventId: 'lyg.event.s02_01' },
      { reviewSummary: '探视金蜜镝——他装伤避嫌；你以成亲相胁，他默许不干涉帝统', status: 'ready', stageId: 'lyg.mijing_rumen', eventId: 'lyg.event.s02_07' },
      { reviewSummary: '触龙珠唤醒冰冰，拿到超级管理员权限——当场验明谁在名单上', status: 'ready', stageId: 'lyg.mijing_rumen', eventId: 'lyg.event.mijing_superuser_roster' },
      { reviewSummary: '分兵：自己与云丹琉追巫宗，卓云君等人回帝陵', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_01_beat' },
      { reviewSummary: '在帝陵调查赵氏父兄下落——单超登场', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_02_beat' },
      { reviewSummary: '蔡敬仲转来：中行说要贾文和害死后帝，拥立你为帝', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_04_beat' },
      { reviewSummary: '赵合德说让赵飞燕怀你的孩子破中行说，并称你是阳武侯之子', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_05_beat' },
      { reviewSummary: '与赵飞燕决定加速定陶王登基', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_06_beat' },
      { reviewSummary: '从密道夜入长秋宫见赵飞燕、赵合德，察觉自己真元滞涩', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_07_beat' },
      { reviewSummary: '登基大典上真气失控，吕雉点破须双修，赵飞燕以双修之姿助你行功', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_08_beat' },
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
    // 锚事件待补：番僧猎杀穿越者在 beat 层（seq 1061）有，event 层 1059–1065 整段空白。
    anchorEventIds: ['lyg.event.changgan_fanseng_hunt'],
    anchorLocationIds: ['liuchao.location.changan'],
    entryHint: '番僧在猎杀穿越者，而且近来在长安大肆扩张——唐国本来崇道，如今佛门要压过道门。',
    basis: '长安＝唐国都城，第 30 关可达。**这次不是孪生 id 坑**（实测，2026-08-16）：'
      + '`lyg.location.changan` 确实存在于 6 个关，但那 6 关同时都有 `liuchao.location.changan`——'
      + '是真子集，收一个就够，加了等于没加。（旧 basis 写它「live 关查无」，与实测不符，已改。'
      + '结论没变，理由是错的。汉国洛都那次是真孪生：24 关 vs 6 关互不覆盖，必须全收。）'
      + '**引子＝世界此刻的状态**（用户 2026-08-16）：番僧猎杀穿越者（seq 1061 袁天罡透露），'
      + '且正在长安大肆扩张（`investigate_te_master` 的 objective 即「确认释特昧普的**扩张方式**与外援」，'
      + '手法是强制灌顶收服摩尼寺）。'
      + '**「唐国本来崇道」是正典明写的设定**（用户指出，已核）：卓云君卷「在**崇信道家的唐宋两国**，'
      + '太乙真宗的教御每每受到国师的礼遇」；申婉盈卷「太乙真宗在唐国和宋国势力极强」；'
      + '赵归真卷「唐国佛门势力固然强大，道门势力也不小」；'
      + '最硬的一条是**杨玉环本人**——「先皇钦命太乙真宗、阳钧宗、乾贞道、长青宗、瑶池宗一同授箓传道」，'
      + '她的别名「太真公主」就是道号：朝廷把自己的贵妃送进道门受箓，比任何描述都能说明国朝的立场。'
      + '于是这条线的赌注也清楚了——沮渠二世卷：「如果能让**唐国正式将佛门列为国教，彻底压倒道门**，'
      + '绝对是一椿不世奇功」。番僧要的不是杀几个穿越者，是夺国教之位。'
      + '（另记一处结构：seq 1055 他是**以舞阳侯身份**出使唐国的——**汉国线的顶点就是本线的入场券**，'
      + '八条线里第一处明确的"顶点喂入口"。这层不写进指引，只作日后分层的依据。）',
    nodes: [
      // 锚事件：seq 1061 袁天罡透露番僧猎杀穿越者。seq 1059–1065 事件层整段空白，需新增。
      { reviewSummary: '审汪臻，问明白员外传说多是编造', status: 'ready', stageId: 'lyg.han_succession', eventId: 'lyg.event.han_succession_10_beat' },
      // T1 汉使身份并进同关 s03_09
      { reviewSummary: '听袁天罡说破：番僧在猎杀穿越者', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.changgan_fanseng_hunt' },
      { reviewSummary: '入长安宣平坊落脚，石超接风——吕奉先已在城中惹事', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_01' },
      { reviewSummary: '街头撞见杨玉环驾轻车伤人训话，潘金莲提剑为她警戒', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_03' },
      // T4 并进 buddhist_conspiracy_04／_06（火遁／佛咒，过程）
      { reviewSummary: '听小紫的说法：她称不是闯进去的，是从兴庆宫遗迹被传送进塔——僧众不认', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.xiaozi_teleported_into_dayanta' },
      // T5 并进 _09_beat／_10_beat
      { reviewSummary: '要救大雁塔里的小紫与吕雉——窥基断水，她握着铸铁炸弹', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_08' },
      { reviewSummary: '夜访慈恩寺，碑上疑白行简是穿越者；汉使身份救走炸塔的小紫', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.s03_09' },
      // T7 并进 ganlu_aftershock_07_beat
      { reviewSummary: '从杨玉环处厘清北司与佛门各自在查什么', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.north_bureau_buddhist_moves' },
      { reviewSummary: '与小紫潜入青龙寺，摸清释特昧普的扩张方式与外援', status: 'ready', stageId: 'lyg.changgan_begins', eventId: 'lyg.event.qinglongsi_te_master' },
      // T9 并进 shituolin_endgame_10_beat
      // 高潮战不只一拍：它的展开在事件层现成躺着，先前每场仗只挑了中间那一条代表拍。
      { reviewSummary: '潜入青龙寺确认释特昧普的扩张方式与外援', status: 'ready', stageId: 'lyg.shixiang_ambush', eventId: 'lyg.event.investigate_te_master' },
      { reviewSummary: '把鸿胪寺的礼遇和朝会资格拿回来', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.honglusi_amends' },
      { reviewSummary: '确认鸿胪寺恢复的礼遇与元正朝会资格——段文楚登场', status: 'ready', stageId: 'lyg.shixiang_ambush', eventId: 'lyg.event.shixiang_s11' },
      { reviewSummary: '确认慈恩寺红莲演法与唐皇敕令之间的张力', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.cien_red_lotus' },
      // T11：objective 是阻止夺舍；axisBeat 写明当场没拦住
      { reviewSummary: '确认红莲演法与唐皇敕令之间的张力——观海登场', status: 'ready', stageId: 'lyg.shixiang_ambush', eventId: 'lyg.event.shixiang_s12' },
      // 序按 axisSeq：搜查宫中 1382 在受封 1396 之前，先前顶点排在了它前面。
      // 搜查宫中那一拍是原著段与续写第二幕的咬合点，但仍早于受封，顶点收尾。
      { reviewSummary: '元正朝会上核验徐君房的地球仪，对照秦使说辞', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.yuanzheng_globe' },
      { reviewSummary: '核验徐君房的地球仪知识与秦使说辞', status: 'ready', stageId: 'lyg.shixiang_ambush', eventId: 'lyg.event.shixiang_s13' },
      // T14 用户裁定（2026-08-16）：没剧本，先留空，不要自行续写
      { reviewSummary: '查宣平坊那桩宦官命案，别急着定谁是幕后', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.xuanping_eunuch_murder' },
      { reviewSummary: '摸清废弃兴庆宫，标出地下入口', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.survey_xingqing_palace' },
      { reviewSummary: '稳住太子伤势，把误伤消息压下去', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.prince_injury_control' },
      { reviewSummary: '在水香楼布好诱捕', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.shuixiang_lure_setup' },
      { reviewSummary: '压住麻痹毒势，封住毒方刺客的藏身范围', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.spot_poison_assassin' },
      { reviewSummary: '池畔隔开毒烟，把飞鸟萤子擒下', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.poolside_capture' },
      { reviewSummary: '隔离毒烟并擒获飞鸟萤子', status: 'ready', stageId: 'lyg.shixiang_ambush', eventId: 'lyg.event.final_showdown' },
      { reviewSummary: '炸开摩尼寺打开营救窗口，女师是否脱险待确认', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.blast_moni_temple' },
      { reviewSummary: '听信永讲清蕃密邪径内幕，据此决定怎么应对', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.xinyong_reveals_fanmi' },
      { reviewSummary: '听清蕃密内幕并作出有依据的应对决定——信永登场', status: 'ready', stageId: 'lyg.shixiang_ambush', eventId: 'lyg.event.forewarned_from_xinyong' },
      { reviewSummary: '审飞鸟萤子，她拒绝合作', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.interrogate_feiniao_yingzi' },
      { reviewSummary: '在长安面见唐皇，接下昭南索赔：交张亢、赔款，否则兴兵', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_03_beat' },
      { reviewSummary: '受礼部侍郎、通问计议使，用这颗印解宋困', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.song_tongwen' },
      { reviewSummary: '与昭南卿士囊瓦谈崩，他拒了程氏方案并加码兑付', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_04_beat' },
      { reviewSummary: '摸清窥基改唆娑梵寺主刺你——瑶池宗已退出', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_06_beat' },
      { reviewSummary: '疑吕雉泄了赵飞燕的消息，计划以她为饵钓十方丛林', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_08_beat' },
      { reviewSummary: '返程迎战四十余名黑衣人伏击', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_09_beat' },
      { reviewSummary: '救出白霓裳，击杀王守澄——墨枫林登场', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.changgan_interlude_10_beat' },
      { reviewSummary: '从杨玉环接下李昂密令：天策府闭门不涉，去牵制鱼朝恩', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.liang_secret_order' },
      { reviewSummary: '听清李昂对天策府与鱼朝恩的安排', status: 'ready', stageId: 'lyg.ganlu_bian', eventId: 'lyg.event.li_jinxiang_meeting' },
      { reviewSummary: '核对黎锦香对王守澄案与广源行的说法——鱼玄机登场', status: 'ready', stageId: 'lyg.ganlu_bian', eventId: 'lyg.event.yang_yuhuan_report' },
      { reviewSummary: '听黎锦香说清：周飞与十方丛林合谋针对程宅', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.zhoufei_conspiracy' },
      { reviewSummary: '问出飞鸟家族与布都御魂剑柄的关系', status: 'ready', stageId: 'lyg.changgan_interlude', eventId: 'lyg.event.feiniao_hilt_clue' },
      { reviewSummary: '确认权宦追凶分工与内部猜忌——李辅国、田令孜、仇士良登场', status: 'ready', stageId: 'lyg.ganlu_bian', eventId: 'lyg.event.release_jingnian' },
      { reviewSummary: '汇总甘露局势并决定是否释放番僧搅局——李训、郑注、净念登场', status: 'ready', stageId: 'lyg.ganlu_bian', eventId: 'lyg.event.su_sha_identified' },
      { reviewSummary: '铁马堂擂台进八强，周飞三家全胜——下一场对丹霞宗悬殊', status: 'ready', stageId: 'lyg.liangzhou_league', eventId: 'lyg.event.s06_02' },
      { reviewSummary: '查清仇士良夺神策军：张承业、杨家接管，疑田令孜联佛门藩镇杀王守澄', status: 'ready', stageId: 'lyg.liangzhou_league', eventId: 'lyg.event.s06_04' },
      { reviewSummary: '查清李宏在仇士良门前刺匡佑、自残嫁祸和尚，意在宦官内讧', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_01_beat' },
      { reviewSummary: '自称不拾一世转世，念真经震慑十方丛林围杀', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_03_beat' },
      { reviewSummary: '砍断兴唐寺灯树，在火海里斩了龙宸的杀手脱身', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_04_beat' },
      { reviewSummary: '拦截龙宸翼火蛇，救下惊理——王彦章、燕姣然登场', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_05_beat' },
      { reviewSummary: '随吕雉飞入大雁塔，被释特昧普困进佛咒幻境', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_06_beat' },
      { reviewSummary: '采纳贾文和之计，部署先取田令孜以乱破局', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_07_beat' },
      { reviewSummary: '拒了窥基假诏和剃度，刘贞亮传诏被挡，当场动手', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_08_beat' },
      { reviewSummary: '在程宅揭穿窥基伪造法旨——沮渠二世、净空登场', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_09_beat' },
      { reviewSummary: '在程宅应对窥基弃佛入魔，看他施血海遁走', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_10_beat' },
      { reviewSummary: '在大明宫躲开仇士良神策军屠城，乱党正被满城搜捕', status: 'ready', stageId: 'lyg.buddhist_conspiracy', eventId: 'lyg.event.buddhist_conspiracy_11_beat' },
      { reviewSummary: '持仇士良令牌经杨玉环入宫，潜入蓬莱秘阁见他威逼李昂', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_02_beat' },
      { reviewSummary: '查清窥基弃佛后长安寺庙道观遭劫，官府已瘫痪', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_03_beat' },
      { reviewSummary: '听取李训在秘阁的供词——鱼弘志登场', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_04_beat' },
      { reviewSummary: '旁观李辅国审宦官：田令孜、刘贞亮死，鱼弘志净身待赐死', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_05_beat' },
      { reviewSummary: '听贾文和建议杀李昂以安天下——你还没决定', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_06_beat' },
      { reviewSummary: '到曲江苑看到鱼弘志被程元振逼着弑了李昂，王德妃已先死', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_07_beat' },
      { reviewSummary: '随仇士良返宫，得知李辅国已弑君、萧太后失踪', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_08_beat' },
      { reviewSummary: '向罗令询问惨案详情', status: 'ready', stageId: 'lyg.ganlu_aftershock', eventId: 'lyg.event.ganlu_aftershock_09_beat' },
      { reviewSummary: '探听李辅国重分职权：程元振任枢密使，仇士良留用，继位人选在议', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_01_beat' },
      { reviewSummary: '赶到独柳树，看着王涯、舒元舆等宰执家眷被腰斩', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_02_beat' },
      { reviewSummary: '赶到现场，看清窥基已显尸陀林主真身，释特昧普正在对抗', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_04_beat' },
      { reviewSummary: '合力打散窥基魔身——头颅附老太监跑了，释特昧普也逃了', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_05_beat' },
      { reviewSummary: '接中行说急报，赶回宫确认江王李炎已入宫', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_06_beat' },
      { reviewSummary: '查清太液池黑雾是李辅国夺舍的护持之法', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_07_beat' },
      { reviewSummary: '探查婆娑宝树培育地点——安乐公主登场', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_08_beat' },
      { reviewSummary: '随杨玉环奉诏讨逆：她宣布李辅国假传圣旨，杀向大明宫', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_09_beat' },
      { reviewSummary: '莲座前砍向李辅国，受伤后被潘金莲、白霓裳救下', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_10_beat' },
      { reviewSummary: '李辅国把你和杨玉环、吕雉、潘金莲、白霓裳收进浮屠塔', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_11_beat' },
      { reviewSummary: '以生死根吸尽死气，联手斩断李辅国肉身', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_12_beat' },
      { reviewSummary: '你拦不住：李辅国魂魄占了返老的太皇太后郭氏，李炎把你打断', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_13_beat' },
      { reviewSummary: '谎称斩了李辅国喂的妖祟，以血藤为证，避开弑后的罪', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.claim_slew_demon' },
      { reviewSummary: '接旨大都护、上柱国', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_title_daduhu' },
      { reviewSummary: '听贾文和：找五肉五甘露可驱李辅国魂——太皇太后魂魄或还在', status: 'ready', stageId: 'lyg.shituolin_endgame', eventId: 'lyg.event.shituolin_endgame_14_beat' },
      { reviewSummary: '换身后续：长安驱魂局', status: 'pending' },
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
  completedEventIds?: readonly string[],
): SecondaryLine[] {
  const threshold = rankOf(LINE_ANCHOR_MIN_ACQUAINTANCE);
  const done = completedEventIds?.length ? new Set(completedEventIds) : undefined;
  return SECONDARY_LINES.filter(line => {
    // 事件锚优先：声明了它就由它单独判定，见 `anchorEventIds` 的说明。
    // `anchorEventPending` ＝ 那条 event 还没写出来，此时不能用它判定（否则线永远打不开），
    // 落回下面的粗锚。
    if (line.anchorEventIds?.length && !line.anchorEventPending) {
      return Boolean(done) && line.anchorEventIds.some(id => done!.has(id));
    }
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
