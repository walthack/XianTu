/**
 * 主线轴（R3-10 增补）——让 world_sim 任何时候都答得出"该往哪"。
 *
 * 立项理由（2026-08-15 用户实测）：六朝世界模式下玩家问"我怎么知道主线是什么"，
 * 而 `storyContext` 在该模式下写死了「没有需要玩家逐拍完成的下一任务」，UI 的任务目标
 * 面板也整块 `v-if="!worldMode"` 关掉——**从"不催"滑到了"不说"**。两者是不同的事：
 * 不催＝不施加压力、不卡进度；不说＝玩家根本不知道有什么可做。
 * 用户判词：「上古卷轴虽然是自由大世界，但还是有主轴剧情的。」**自由的是推进节奏，不是方向感。**
 *
 * 【主轴是什么】穿越 → 被王哲救起 → 领受三件托付。整条主线是这份托付被逐层加深。
 * 正典原文（`lcq.stage_02` 事件 axisBeat）：
 *   「王哲托付程宗扬三件事：保管锦囊、修为达六阳后前往太泉古阵祭祀、守护岳帅后人月霜。」
 * 三件里两件是主轴（太泉＝知识／血脉＝权限＋接口＋盲点）；**锦囊归太乙掌教二级线（已定性）**：
 * MiniMax 全书重抽实证——「苏妲己拆开王哲托付的锦囊，发现内仅一张白纸」、
 * 「程宗扬从王哲锦囊信笺中获得指令，被委托**清理太乙真宗门户**、传授九阳神功」、
 * 「**卓云君看信笺后突施杀招**，重创程宗扬经脉，以凤羽剑抵喉逼问九阳神功口诀」
 * → 锦囊内容＝清理门户＋传功，直通太乙真宗，与蓝图 §3「持王哲遗命信笺清洗通魔教御」一致。
 * （燕歌行另有「神秘锦囊」出现在秘境钥匙旁，是贾文和锦囊计，**非王哲这个**，勿混。）
 *
 * ⏳ **锦囊后续是扩展位**（用户裁定 2026-08-16）：原著对锦囊之后写得不细，留作自行续写。
 * 全书扫描里的空当也支持这一点——苏妲己拆开「内仅一张白纸」，程后来却从同一信笺得到指令，
 * 另有高光标题「**锦囊失踪**」。白纸如何变成指令、锦囊失踪于何处、故人是谁，均未写死。
 * 太乙掌教线可据此自行延展，**但不得改写已成立的三条**（清理门户／传功／卓云君杀招）。
 *
 * 【判据】去掉它终局就演不下去。据 ENDING-BLUEPRINT §11 E-②b 终战我方武器逐件回溯：
 *   权限（小紫染色体验证为超级用户）→ 血脉；接口（岳血/岳魂）→ 血脉；
 *   知识（三碎片＋太泉经验）→ 太泉；盲点（程赵之子）→ 血脉；
 *   资源包（国家机器/商业网络）→ §11 明说「只是资源包不同」＝**可替换**＝二级线。
 * 故一切"立势"（汉国朝堂／唐国长安／商队／秦国称帝／星月湖军）不进主轴。
 *
 * 【为什么分层】蓝图开头明写：涉及试验场暗线的内容「不得进常规 prompt 明文」。
 * 主线轴因此不能是一条静态常驻文案，否则开局即剧透终局。照蓝图岳帅冤案
 * 「三层真相逐幕剥」同一根神经做分层揭示：玩家永远答得出该往哪，但答的是他
 * 已经够得着的那一层。**层六在解锁前不得出现在 prompt 任何位置。**
 *
 * 【与既有层的分工】
 *   · 本模块给**长期方向**（这一路要做什么），跨 stage，不要求本轮达成；
 *   · `situation.sourceEvent.objective` 给**当前目标**（此刻可切入点），逐关；
 *   · `系统.扩展.任务追踪.即兴目标` 给玩家侧临时支线。三者并存，互不覆盖。
 *
 * 纪律：不催、不卡、无进度惩罚；玩家可无限期搁置。本模块只描述方向，不产生压力。
 *
 * 【开场切法＝Helgen 洞口】（用户裁定 2026-08-17，见 `docs/R3-10-HELGEN-CUT-2026-08-17.md`）
 *   强制段：`01` → `02` → 白湖脱身。地点是五原商馆，不是南荒商路。
 *   自由世界从五原开始。洞口朝前＝南门商路 → 蛇彝村；本能一直跑就进昭南。
 *   回头、找殇侯解蛊、拖到毒发，都合法。不要做出馆已在死村里，也不要把白湖写成南荒锚。
 *
 * 设计全文见 `docs/R3-10-MAIN-QUEST-AXIS-DRAFT-2026-08-16.md`。
 */

/**
 * 主线完成要求（用户裁定 2026-08-16）——王哲三托付里承重的两条。
 * 锦囊不在此列：它是太乙掌教二级线，定性待查（见设计文档 §4）。
 *
 * 【要求一】修为达六阳，前往太泉古阵**祭祀故人**。
 *   正典依据：`lcq.stage_02` 事件 axisBeat「修为达六阳后前往太泉古阵祭祀」；
 *   MiniMax 全书重抽（`mod-kit/generated/minimax-m2.7/trilogy-reextract-2026-07-16`）原文更全：
 *   「王哲交代三事：保管火漆锦囊待时机拆开；**修为达六阳后往太泉古阵祭祀故人**；守护岳帅之女月霜。」
 *   ⚠ **曾推断「祭祀大阵＝系统入口」，已被全书扫描削弱**：正典写的是"祭祀**故人**"（祭奠某个死者），
 *   全书无任何"祭祀大阵"字样。故人是谁未写明，是钩子；但不得把它叙述成开启装置。
 *   原著中程宗扬从未履行此托付（全书修为最高见「第四级入微境」，且他去太泉是为赤阳圣果救人）。
 *
 * 【要求二】保住至少一名岳血后裔。
 *   **不要求集齐**——如同上古卷轴不加入任何公会、不当领主也能通关。月霜是王哲点名的默认人选，
 *   但可被其他遗孤替代（小紫等）。终局只需一个可用接口。
 *   蓝图 §11 依据：接口＝岳血／岳魂，「血脉线全员终战有功能位」；全灭＝没接口＝终局打不了。
 *
 * 【失败结局】两条都没满足时，后期给一个失败结局（用户裁定，实现待排）。
 *   ⏳ 未定：只满足其中一条时走什么结局。当前按"不足以进真结局、但不落失败结局"处理，待裁定。
 *
 * 主轴自身已满足要求二且有冗余：月霜（事件层首现 `lcq.stage_01`）与小紫（`lcq.stage_05`）
 * 都在主轴关的事件层，纯走主轴即可得两个确认接口；剑玉姬（`stage_08`）、云如瑶（`stage_09`）
 * 在二级线，属可选的额外接口。
 */
export interface MainQuestRequirement {
  id: 'taiquan_rite' | 'bloodline_survivor';
  /** 玩家可见的要求文案。 */
  text: string;
  /** 正典依据或设计推断的出处。 */
  basis: string;
}

export const MAIN_QUEST_REQUIREMENTS: MainQuestRequirement[] = [
  {
    id: 'taiquan_rite',
    text: '修为达六阳，前往太泉古阵祭祀故人。',
    basis: 'lcq.stage_02 axisBeat ＋ MiniMax 全书重抽「修为达六阳后往太泉古阵祭祀故人」。'
      + '曾推断的"祭祀大阵＝系统入口"已被全书扫描削弱（全书无"祭祀大阵"字样），故人身份未写明。',
  },
  {
    id: 'bloodline_survivor',
    text: '至少保住一名岳血后裔。',
    basis: 'ENDING-BLUEPRINT §11：接口＝岳血／岳魂，血脉线全员终战有功能位。不要求集齐。',
  },
];

/** 主线轴层级。数字越大越接近终局真相；层六属试验场暗线，受保密规则约束。 */
export type MainQuestLayer = 1 | 2 | 3 | 4 | 5 | 6;

/** 支柱：主轴的两根承重线。 */
export type MainQuestPillar = 'bloodline' | 'taiquan';

export interface MainQuestLayerDef {
  layer: MainQuestLayer;
  /** 玩家可见的长期方向。层六在解锁前不得进入 prompt。 */
  text: string;
  /** 解锁该层的关卡；玩家推进到其中任一关即升层。空数组＝开局即有。 */
  unlockStageIds: string[];
  /** 涉及试验场暗线，受 WORLD-暗线 使用规则约束，未解锁时一律不出现在 prompt。 */
  restricted?: boolean;
}

export interface MainQuestStageRole {
  stageId: string;
  /** 该关在主轴上承担什么。用于 UI 与调试，不进 prompt。 */
  role: string;
  pillars: MainQuestPillar[];
}

/**
 * 主轴节点：任务节点粒度，不是逐拍。
 *
 * 【为什么不用 situation 的 objective】那一层共 143 条＝每个局势一条，是**逐拍**粒度；
 * 直接当主线显示等于把底层那一级摊给玩家看。对标上古卷轴 5 的主线日志（约 18–19 个节点），
 * 本表压到 20 条：15 关各 1 条，5 个承重关各加 1 条。
 *
 * 【筛选规则】只绑主轴人物（王哲／小紫／月霜／碧姬／谢艺／剑玉姬／云如瑶／赵飞燕／小玲儿）
 * 或不点名；配角拍一律不进（乐明珠、苏荔、祁远、阁罗、武二郎、易彪、达古、李师师…）→ 归二级线。
 * 实测原 143 条里 51%（73 条）点了人名，其中乐明珠 5 次几乎追平小紫的 6 次、
 * `stage_05` 十六拍里乐明珠独占开场两拍——按本规则这些自动出局。
 *
 * 【143 条原始 objective 不动】那些字段 canon_companion 侧栏也在读（`view.objective`），
 * 改了会波及另一个模式。它们留在原地当逐拍细节，本表只是叠在其上的主线层。
 */
export interface MainQuestNode {
  stageId: string;
  text: string;
  /**
   * 这一条落在哪个 event 上。
   *
   * 【为什么必须有】没有它，主轴在**事件层没有落点**——实测 2026-08-16：396 条 event 里
   * 被任一条链认领的只有 54 条，而主轴认领 **0** 条。不是它没内容，是它没有 id 可对，
   * 于是三级认领（主轴 → 二级线 → 人物任务）的第一步就无从开始。
   *
   * 另一个后果是精度：只锚 `stageId` 时主轴的位置只能到"关窗口"（第 1 条＝seq 1–36），
   * 而二级线已经精确到某一拍，两者并排时主轴是一根粗条，也没法参与按 `axisSeq` 的排序校验。
   *
   * 与二级线同口径：`ready` 填现有 id，`new` 填建议 id ＋ 建议挂载关。
   */
  eventId?: string;
  /**
   * 同 `LineNode.status` 三档，区别要守住（用户裁定 2026-08-16）：
   *   · `ready`   现在就走得到；
   *   · `new`     **正典有这一拍、游戏没落地** → 给建议挂载关＋建议 id（如三条隔离关节点）；
   *   · `pending` **正典压根没有**（是我们要编的）→ 只标待扩，**不给建议 id**。
   *
   * 先前六阳入口那条被我标成 `new` 并编了个 id——把我们的设计伪装成待补的既有内容，
   * 与二级线上刚纠正过的是同一个错。
   */
  status?: 'ready' | 'new' | 'pending';
  /**
   * 地点锚（用户裁定 2026-08-16：主线与二级线都该锚地点，不锚关卡）。
   *
   * 【为什么】关卡 ID 是脆的：`canonRail.DEFAULT_LINE_QUARANTINED_STAGE_IDS` 会让默认路线
   * **静默跳过** 8 个关卡（每个拍点都无锚或来源复核发现锚点冲突，只允许显式 IF 进入），
   * 其中 `lcq.stage_03`／`stage_05`／`stage_06` 正在主轴上。只按 `stageId` 精确匹配时，
   * 这三关的节点在默认路线上**永远渲染不出来**——20 条节点死 3 条，且死的正是血脉线开场。
   *
   * 地点不随关卡编排变动。白湖脱身锚五原商馆（`baihu_shang_guan`），
   * 不是南荒商路——那是出馆之后朝前的默认矢量，见 Helgen 切法。
   * 鬼王峒／鬼王宫的地点锚仍是旧关卡匹配的兜底，任务链重构后应退为落点说明。
   *
   * 用 id 不用名字：id 是权威键、不怕重名（已知「白夷」／「白夷谷」这类互含），
   * 而 `resolveCurrentScenarioLocation` 已经把存档里的中文描述串解析成地点对象。
   */
  locationId?: string;
  /**
   * 血脉候选路径——**这一条属于哪个岳血后裔的线**。缺省＝主干（托付与太泉），必经。
   *
   * 【为什么要分】要求二是「保住**至少一名**岳血后裔，不要求集齐」（用户裁定 2026-08-16，
   * 并再次确认「7-11、19-23 都不是必须项」）。月霜、小紫、赵氏这三段因此**互为替代**，
   * 任何一段都不该读成必经。此前它们排成一条直线，玩家会以为都得做——
   * 那与「不要求集齐」相矛盾，也与"上古卷轴不加入任何公会也能通关"的口径相矛盾。
   *
   * 引擎据此可以说清：主干必走，三条候选走通任一条即满足要求二。
   */
  bloodlineBranch?: 'yueshuang' | 'xiaozi' | 'zhao' | 'xiaolinger';
}

/**
 * 六层长期方向。锚在王哲三托付上——故事内已有人向主角下达长期任务，
 * 主线轴不必外部强加，只需把这份托付逐层加深。
 */
export const MAIN_QUEST_LAYERS: MainQuestLayerDef[] = [
  {
    layer: 1,
    text: '活下来，弄清自己是怎么来的。',
    unlockStageIds: [],
  },
  {
    layer: 2,
    text: '王哲把三件事交给了你：拆锦囊、修为到六阳去太泉古阵祭祀、守护岳帅后人月霜。',
    unlockStageIds: ['lcq.stage_02'],
  },
  {
    layer: 3,
    text: '身边这些人各自背着来历，小紫的尤其深。',
    // 门必须挂在**事件层**首现关，不能挂 canon.characters 在场关：
    // 小紫在 stage_03b 只是 canon 名单里有，事件层首现是 stage_05（实测 21 关命中，首关 stage_05）。
    // 挂早一关会让玩家还没见到人就被告知"小紫的来历尤其深"。
    unlockStageIds: ['lcq.stage_05'],
  },
  {
    layer: 4,
    text: '太泉古阵里有说不通的东西——王哲要你去，恐怕不只是为了祭祀。',
    unlockStageIds: ['lyl.taiquan_sacred_fruit'],
  },
  {
    layer: 5,
    // 到达即升层，不设选择：发现"这世界是养人的"之后不可能真忘记，
    // 原文云龙 #141「决定炸毁并遗忘」只是小说的艺术性收尾（用户裁定 2026-08-16）。
    text: '这地方是养人的——而且有人在按名册找人，你身边的人在名册上。',
    unlockStageIds: ['lyl.taiquan_afterfall', 'lyl.han_palace_endgame', 'lyg.mijing_rumen'],
  },
  {
    layer: 6,
    text: '这世界本身在回滚你做的一切。',
    // 解锁靠三碎片认知落 playerKnowledge，不由关卡推进给出，故 unlockStageIds 为空。
    unlockStageIds: [],
    restricted: true,
  },
];

/**
 * 全 37 关链序（经 `manifest.nextStageId` 遍历验证的无分叉单链）。
 * 供层级解析做"是否已抵达"的确定性先后判断——不能靠章节推进，因为 world_sim 的结算
 * 路径只写 `world.r2_*` 与 `offscreenResolvedEventIds`，不写 `flags.event.*.done`，
 * 章节完成条件永不满足（详见设计文档 §1）。
 */
export const STAGE_ORDER: string[] = [
  'lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge',
  'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05', 'lcq.stage_05b',
  'lcq.stage_06', 'lcq.stage_07_qingyuan_jiankang', 'lcq.stage_08_jiankang_coup',
  'lcq.stage_09_trade_and_escape', 'lcq.stage_10_jiangzhou_shadow_war',
  'lcq.stage_11_lieshan_battle', 'lcq.stage_12_jiangzhou_counterwar',
  'lyl.jiangzhou_retreat', 'lyl.lin_an_black_sea', 'lyl.lin_an_bridge',
  'lyl.taiquan_expedition', 'lyl.xiaoyingzhou_blacksea_trap', 'lyl.taiquan_sacred_fruit',
  'lyl.taiquan_core_conflict', 'lyl.taiquan_afterfall', 'lyl.luoyang_cloud_secret',
  'lyl.luoyang_coup', 'lyl.han_palace_endgame',
  'lyg.dingtao_beijing', 'lyg.mijing_rumen', 'lyg.han_succession', 'lyg.changgan_begins',
  'lyg.shixiang_ambush', 'lyg.changgan_interlude', 'lyg.ganlu_bian', 'lyg.liangzhou_league',
  'lyg.buddhist_conspiracy', 'lyg.ganlu_aftershock', 'lyg.shituolin_endgame',
];

/**
 * 主轴关卡 15 关（其余 22 关归二级线）。
 * 归属经数据核实：只扫 `scenario.events` 与 `worldSimulation`——整文件关键词扫描会被
 * 共享正典与地图注入污染（`taiquan_core_conflict` 会假阳性扫出「太泉／核心区」）。
 */
/**
 * 【太泉与秘境是同一套设施的不同节点】（用户裁定 2026-08-16 落账；核实与推断已分开标）
 *
 * **核实**——光柱／传送阵是同一类东西，且太泉内部确有传送把人甩到别处：
 *   · seq 936「吕雉用比目鱼珠开启秘境入口，小紫将盛姬投入**光柱**，众人进入秘境」（汉宫）
 *   · seq 997「胶西邸井中……**白光**现疑似秘境入口」
 *   · seq 686「萧遥逸与阿兰迦**被传送到崖缝**」、713「程宗扬**传送后**遇墨枫林」（均在太泉段内）
 *   · seq 717「通过**传送阵**至首阳山，因**机械守卫**导致充能需十年」
 *   两边门内都是同一类设施：机械守卫、维生系统、AI 冰冰、青铜门、龙睛。
 *
 * **未核实**——**没有任何一拍说胶西邸的白光通向太泉**。936 与 997 都只写"秘境入口"，
 *   而门内所见不同：胶西这边是武帝像／武皇帝墓室／维生系统／冰冰；
 *   太泉那边是赤阳圣果／蚁穴／魔墟／人类居住区。
 *
 * **推断**：同一系统、不同节点。传送阵把多个站点连起来（717 明说能到首阳山），
 *   光柱是站点入口，出来时落点不定——这也解释了 686 萧遥逸为何被甩到崖缝。
 *   故秘境两关（`han_palace_endgame`／`mijing_rumen`）与太泉同属 `taiquan` 支柱，
 *   不是各自独立的两件事。⏳ 待回 EPUB 坐实白光的落点后，两段可考虑合并叙述。
 */
export const MAIN_QUEST_STAGES: MainQuestStageRole[] = [
  { stageId: 'lcq.stage_01', role: '落地：穿越、失去同伴', pillars: [] },
  { stageId: 'lcq.stage_02', role: '王哲三托付；白湖脱身＝强制段终点', pillars: ['bloodline', 'taiquan'] },
  // stage_03 是旧关卡包（赌局至蛇彝村），默认路线隔离。进南荒不是本关任务，
  // 是出白湖后朝前走的默认矢量。谢艺在蛇彝村，属昭南开门之后。
  { stageId: 'lcq.stage_03', role: '（旧包）白湖后续；不承担进南荒', pillars: ['bloodline'] },
  { stageId: 'lcq.stage_03b_snake_flower_bridge', role: '小紫入队', pillars: ['bloodline'] },
  // 谢艺说破「岳帅还有个遗腹女」（`s04b_..._18`, seq 121）落在本关——血脉揭示拍，故收进主轴关。
  { stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', role: '血脉揭示：岳帅遗腹女', pillars: ['bloodline'] },
  { stageId: 'lcq.stage_05', role: '鬼王峒初探；碧姬线浮出', pillars: ['bloodline'] },
  { stageId: 'lcq.stage_05b', role: '鬼王宫潜入', pillars: ['bloodline'] },
  { stageId: 'lcq.stage_06', role: '唤龙授艺；碧姬线收束', pillars: ['bloodline'] },
  { stageId: 'lyl.lin_an_bridge', role: '赵飞燕线起点', pillars: ['bloodline'] },
  { stageId: 'lyl.xiaoyingzhou_blacksea_trap', role: '剑玉姬真身＝岳萼身份揭示；九阳交换', pillars: ['bloodline', 'taiquan'] },
  { stageId: 'lyl.taiquan_sacred_fruit', role: '太泉钥匙；赤阳圣果；高俅秘辛探身世', pillars: ['taiquan', 'bloodline'] },
  // 太泉段整条排进主轴后补进来（2026-08-16）：蚁穴脱困那一拍（`find_exit`, seq 667）落在这一关。
  // 此前排除它是因为共享正典注入会让它假阳性扫出「太泉／核心区」（见上方注释）；
  // 但现在挂的是**实名 event**，不是靠扫描猜的，可以收。
  { stageId: 'lyl.taiquan_core_conflict', role: '太泉蚁穴脱困', pillars: ['taiquan'] },
  { stageId: 'lyl.taiquan_afterfall', role: '探索人类居住区＝揭盅段；云如瑶＝岳霏', pillars: ['taiquan', 'bloodline'] },
  { stageId: 'lyl.han_palace_endgame', role: '秘境入口（光柱；与太泉同系统，见上方注释）', pillars: ['taiquan', 'bloodline'] },
  // ⚠ 旧注写「小玲儿唯一在场关」有误：实测事件层她只出现在 `xiaoyingzhou` 的小瀛洲杀局一条。
  // 本关窗口（986–1012）虽覆盖 seq 1012「被系统认定为超级用户」，但那一拍没有落成 event。
  { stageId: 'lyg.mijing_rumen', role: '秘境续（小玲儿在本关窗口内被认定为超级用户，但事件层未落拍）；与太泉同系统', pillars: ['taiquan', 'bloodline'] },
  { stageId: 'lyg.han_succession', role: '赵飞燕·子嗣线（毕业生受孕锚）', pillars: ['bloodline'] },
  // 百衲衣寻小公主岳霏（seq 1123）落在本关——岳血后裔，属血脉支柱，故收进主轴关。
  { stageId: 'lyg.changgan_interlude', role: '血脉：百衲衣寻岳霏', pillars: ['bloodline'] },
  { stageId: 'lyg.shituolin_endgame', role: '连载断点；鬼王线回响', pillars: [] },
];

/** 主轴 20 节点，按 `STAGE_ORDER` 链序排列。 */
export const MAIN_QUEST_NODES: MainQuestNode[] = [
  // 血脉线开场。要求二「保住至少一名岳血后裔」此前在节点表里**零命中**——
  // 玩家照主轴走完，两条完成要求一条都不会达成（实测 2026-08-16）。
  //
  // ⚠ 只补开场这两拍，**不补三川口护月霜**（用户裁定 2026-08-16）：要求写的是「至少一名」，
  // 月霜只是王哲点名的默认人选、可被小紫等替代。堆三条月霜节点会把可替换的接口
  // 读成唯一路径，与「不要求集齐」相矛盾。小紫那几拍（追问过往／临时协定／托付）
  // 已经是另一个候选接口，主轴不必再替玩家指定保谁。
  { stageId: 'lcq.stage_01', text: '战场遇月霜，卓云君烈火救下你俩，太乙真宗教御全歼兽蛮', status: 'ready', eventId: 'lcq.event.s01_03', bloodlineBranch: 'yueshuang' },
  { stageId: 'lcq.stage_01', text: '月霜强灌丹药，你在真阳驱使下与她性交，寒毒得解', status: 'ready', eventId: 'lcq.event.s01_06', bloodlineBranch: 'yueshuang' },
  // #1 落点＝帅帐见王哲（旅程终点拍）；坠落／半兽人在 s01_01–s01_04。
  { stageId: 'lcq.stage_01', text: '王哲发现你身上有生死根，耗真气筑基，传下九阳神功口诀', status: 'ready', eventId: 'lcq.event.s01_05' },
  { stageId: 'lcq.stage_02', text: '接下王哲三托：保管锦囊、六阳后去太泉古阵、守护月霜', status: 'ready', eventId: 'lcq.event.s02_01' },
  { stageId: 'lcq.stage_02', text: '完整见证左武军覆灭：王哲九阳合一如日轮殉军，你独自离开', status: 'ready', eventId: 'lcq.event.s02_02' },
  // 强制段终点（Helgen 洞口，用户裁定 2026-08-17）。
  // s02_06 只落到「被囚＋追问霓龙丝」，rail 禁止在那一拍脱身。本拍才是出馆。
  // 地点＝五原商馆。不作废成南荒路上的锚定拍。
  // 作废建议 id：`lcq.event.s03b_baihu_caravan_south`（那是按关改挂的旧写法）。
  // 出馆后不要再加「必须到蛇彝村」主干节点——朝前走就会到，回头也合法。
  { stageId: 'lcq.stage_02', text: '从白湖商馆死局里脱身，走出五原商馆', locationId: 'liuchao.location.baihu_shang_guan', status: 'ready', eventId: 'lcq.event.baihu_shangguan_escape' },
  { stageId: 'lcq.stage_03b_snake_flower_bridge', text: '听祁远、谢艺确认蛇彝村是鬼王峒血符屠村——商队仓促撤离', status: 'ready', eventId: 'lcq.event.s03b_snake_flower_bridge_03', bloodlineBranch: 'xiaozi' },
  // #6 隔离关 stage_05（原 s05_11 进峒 + s05_13 辨认碧姬）。可达关无同事实 → new。
  // 建议 id 挂 `lcq.stage_05b` 前缀（不放出隔离）。
  // 血脉揭示（用户裁定 2026-08-16）：玩家得先**知道**某人是岳血，要求二对他才可见。
  // 三条候选各有揭示拍：月霜＝王哲托付（`s02_01`，已在主干）；小紫这条＝本拍。
  { stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', text: '听谢艺谈玻璃技术，并说破岳帅晕血、还有个遗腹女', status: 'ready', eventId: 'lcq.event.s04b_lingfei_baiyi_crisis_18', bloodlineBranch: 'xiaozi' },
  { stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', text: '阁罗召来碧姬，你当面见到谢艺要找的人', locationId: 'liuchao.location.guiwangdong', status: 'ready', eventId: 'lcq.event.geluo_summons_biji', bloodlineBranch: 'xiaozi' },
  { stageId: 'lcq.stage_05b', text: '向碧姬问出：小紫曾主动投向鬼巫王——她不是单纯受害者', status: 'ready', eventId: 'lcq.event.s05b_01_binu_reveals_xiaozi', bloodlineBranch: 'xiaozi' },
  // #8 文案压了两拍：临时协定 s05b_09 ＋ 奴隶倒戈 s05b_10；落倒戈拍（含小紫倒戈）。
  { stageId: 'lcq.stage_05b', text: '小紫倒戈、奴隶暴动，你决定趁乱反杀——乐明珠凤凰宝典异变', status: 'ready', eventId: 'lcq.event.s05b_10_slave_revolt_and_phoenix_change', bloodlineBranch: 'xiaozi' },
  // #9 隔离关 stage_06（s06_03 谢艺托付 + s06_04 碧姬了断）。谢艺托付已由星月湖
  // 并进昭南杀龙 event——复用同一建议 id，不另开。建议挂 `lcq.stage_05b` 后缀。
  { stageId: 'lcq.stage_05b', text: '借小紫指点刺穿龙颅，龙神坠亡；接下重伤谢艺对小紫与星月湖的托付', locationId: 'liuchao.location.gui_wang_gong', status: 'ready', eventId: 'lcq.event.slay_dragon', bloodlineBranch: 'xiaozi' },
  // 太泉段：现成剧情整条排进来（用户裁定 2026-08-16）。此前主轴只取了钥匙与居住区两拍，
  // 而这一段在事件层是完整的探索链——迷楼机关→取果→蚁穴→魔墟→古阵，共 8 条现成 event。
  { stageId: 'lyl.taiquan_sacred_fruit', text: '随陈琳进云涛观迷楼，摸清机关，撞见小紫等人', status: 'ready', eventId: 'lyl.event.taiquan_sacred_fruit_04' },
  { stageId: 'lyl.taiquan_sacred_fruit', text: '经小紫、梦娘问出：岳鹏举把钥匙藏在迷楼，暗号太泉熊谷一四七五', status: 'ready', eventId: 'lyl.event.taiquan_sacred_fruit_05' },
  { stageId: 'lyl.taiquan_sacred_fruit', text: '到火山口争赤阳圣果，最终被萧遥逸吞下一颗', status: 'ready', eventId: 'lyl.event.taiquan_sacred_fruit_10' },
  { stageId: 'lyl.taiquan_core_conflict', text: '蚁穴被咬，虞白樱吸出淫毒——找到通往核心区的出口', status: 'ready', eventId: 'lyl.event.find_exit' },
  { stageId: 'lyl.taiquan_afterfall', text: '进魔墟：玄秘贝已失，周飞找到琉璃天珠，多方开抢', status: 'ready', eventId: 'lyl.event.taiquan_afterfall_03_beat' },
  { stageId: 'lyl.taiquan_afterfall', text: '与小紫探人类居住区，撞见KTV卖场，推测太泉古阵是避难所', status: 'ready', eventId: 'lyl.event.taiquan_afterfall_05_beat' },
  { stageId: 'lyl.taiquan_afterfall', text: '经徐璜向赵飞燕献求子仙符，她因赵合德银链召见你', status: 'ready', bloodlineBranch: 'zhao', eventId: 'lyl.event.taiquan_afterfall_09_beat' },
  { stageId: 'lyl.han_palace_endgame', text: '吕雉以比目鱼珠开秘境，小紫把盛姬投入光柱，众人进入', status: 'ready', eventId: 'lyl.event.han_palace_endgame_07_beat', bloodlineBranch: 'zhao' },
  { stageId: 'lyg.mijing_rumen', text: '赵飞燕中毒昏迷，你用自身血液给她输血', status: 'ready', eventId: 'lyg.event.s02_02', bloodlineBranch: 'zhao' },
  // ⏳ 六阳开启古阵内的入口：正典压根没有这一拍——原著里程宗扬从未履行此托付
  // （全书修为最高见第四级入微境，他去太泉是为赤阳圣果救人）。按扩写口径只标待扩，不细化。
  { stageId: 'lyg.mijing_rumen', text: '在长秋宫分派旧部监控秘境入口，自己率侍奴去探胶西邸', status: 'ready', eventId: 'lyg.event.s02_08', bloodlineBranch: 'zhao' },
  // 小玲儿必须在太泉有一拍（用户裁定 2026-08-16）。正典没把她放进太泉段——
  // 她在 seq 610 小瀛洲（太泉之前）、788 割喉吕奉先、1012 **被系统认定为超级用户**、1016 被擒，
  // 正好卡在太泉前后两头。故这是扩写，只记要求不设计。她与小紫同属「超级用户」那一类。
  { stageId: 'lyg.mijing_rumen', text: '触龙珠唤醒冰冰，拿到超级管理员权限，当场验明谁在名单上', status: 'ready', eventId: 'lyg.event.mijing_superuser_roster' },
  { stageId: 'lyg.han_succession', text: '真气失控昏迷，吕雉指出需双修炼化，赵飞燕以双修助你行功', status: 'ready', eventId: 'lyg.event.han_succession_08_beat', bloodlineBranch: 'zhao' },
  { stageId: 'lyg.han_succession', text: '因孟舍人死气失控，在登基典仪与赵飞燕双修，突破通幽境', status: 'ready', eventId: 'lyg.event.han_succession_09_beat', bloodlineBranch: 'zhao' },
  // #17 文案「武帝像前」偏 s02_09；「安排秘境探索」本体是 s02_08（胶西邸／长秋宫）。
  // 原为 new＋挂隔离关 `lcq.stage_05`，等裁定。2026-08-17 查明**不必新增**：
  // 隔离件 `s05_13`「阁罗召来碧姬」在孤儿救援时已重建为可达的 `geluo_summons_biji`（seq 158），
  // description 明写「程宗扬首次当面见到谢艺寻找的人」，正是这一拍。
  // 与昭南线双喂：昭南读「进峒进展」，主轴读「岳氏血脉候选的当面辨认」。
  { stageId: 'lyg.changgan_interlude', text: '马厩救出廖群玉：他携百衲衣寻岳霏，并牵到齐羽仙、周飞', status: 'ready', bloodlineBranch: 'xiaozi', eventId: 'lyg.event.changgan_interlude_02_beat' },
  // 超级用户名单（用户提议 2026-08-16，已核实）：seq 1010「程触龙珠触发 AI 冰冰，获超级管理员权限；
  // **众人验证身份**，小紫雪雪被电击」、1012「小玲儿……**被系统认定为超级用户**」。
  // 这一拍是**要求二对玩家可见的机制**——系统当场验明谁在名单上，而不是靠叙述告诉玩家谁算岳血。
  // ⚠ 实测：全库 396 条 event 搜「超级用户／超级管理员／冰冰／验证身份」**命中 0**，
  // 且 seq 1007–1012 整段六拍事件层空白。正典有、游戏没落地 → `new`，不是待扩。
  { stageId: 'lyl.taiquan_core_conflict', text: '与尹馥兰商定：用阴阳鱼和地形反制潘金莲——硬刚还是设伏', status: 'ready', eventId: 'lyl.event.plan_counterattack' },
  // #18 与汉国二级线同锚 s08（促成登基）；「长秋宫」字面更近 s06，但护住赵氏／登基收束在大典拍。
  { stageId: 'lyl.taiquan_core_conflict', text: '与尹馥兰用阴阳鱼反击潘金莲，把追兵挡回去', status: 'ready', eventId: 'lyl.event.yin_yang_counter' },
  { stageId: 'lyl.taiquan_afterfall', text: '修为到六阳，开启古阵内的入口（未来待扩）', status: 'pending' },
  { stageId: 'lyl.taiquan_afterfall', text: '小玲儿在太泉的那一拍（未来待扩）', status: 'pending', bloodlineBranch: 'xiaolinger' },
  // 程赵之子按用户裁定只标待扩（2026-08-16）：正典 seq 1052 有「宣布赵飞燕有孕」，
  // 但把它认成「岳血候选」是我们的推演，不是正典写明的血脉认定——不给建议 id，不设计。
  { stageId: 'lyg.han_succession', text: '程赵之子这条血脉如何成立（未来待扩）', status: 'pending', bloodlineBranch: 'zhao' },
  // #20 文案压了两拍：斩断肉身 s12 ＋ 阻止夺舍 s13；落夺舍拍（终局收束）。
];

/**
 * 取当前应显示的主轴节点。
 *
 * 命中条件是**关卡或地点任一**：默认路线会静默跳过隔离关（见 `MainQuestNode.locationId`），
 * 只按关卡匹配会让那些关的节点永远渲染不出来。玩家人在锚点地点上，就该看得见那条节点。
 * 二级线关卡且不在任何锚点上时返回空数组。
 */
export function resolveMainQuestNodes(
  currentStageId: string | undefined,
  currentLocationId?: string,
): MainQuestNode[] {
  if (!currentStageId && !currentLocationId) return [];
  return MAIN_QUEST_NODES.filter(node =>
    (currentStageId && node.stageId === currentStageId)
    || (currentLocationId && node.locationId === currentLocationId));
}

/**
 * 按当前关卡解析已抵达的最高主线轴层（不含层六）。
 * 纯函数：不读存档、不看 playerKnowledge；层六靠三碎片解锁，本函数一律不返回。
 */
export function resolveMainQuestLayer(currentStageId: string | undefined): MainQuestLayerDef | undefined {
  const layerOne = MAIN_QUEST_LAYERS.find(item => item.layer === 1 && !item.restricted);
  const currentIdx = currentStageId ? STAGE_ORDER.indexOf(currentStageId) : -1;
  // 未在链序中或 undefined → 只给开局层，避免未知关卡误升维。
  if (currentIdx < 0) return layerOne;

  let highest: MainQuestLayerDef | undefined;
  for (const layer of MAIN_QUEST_LAYERS) {
    // 层六（restricted）靠 playerKnowledge 三碎片解锁，未解锁绝不能进 prompt／UI。
    if (layer.restricted) continue;
    // 空 unlockStageIds＝开局即有；否则任一解锁关已抵达（下标 ≤ 当前）即算解锁。
    const unlocked = layer.unlockStageIds.length === 0
      || layer.unlockStageIds.some(stageId => {
        const unlockIdx = STAGE_ORDER.indexOf(stageId);
        return unlockIdx >= 0 && unlockIdx <= currentIdx;
      });
    if (!unlocked) continue;
    if (!highest || layer.layer > highest.layer) highest = layer;
  }
  return highest || layerOne;
}
