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
 *
 * 内容包 `storyAxis`（F0a）：全局至多一份，含 stageOrder／layers／stages／nodes／requirements 五段；
 * 有包声明时下面五张 TS 表必须全空（二选一，不逐条合并，`resolveStoryAxis`），导出名不变。
 * 数据（B3 起）：五段在核心包 `contentPacks/packs/qingyu/story-axis.json`，权威来源是那份 JSON；
 * 下面五张 TS 表为空表，表内注释随条目进了 JSON 的 `note`。
 */
import { CONTENT_PACKS } from '../contentPacks';
import type { PackStoryAxis } from '../contentPacks/coreFormats';

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
 *   原著中程宗扬从未履行此托付（他去太泉是为赤阳圣果救人；修为第268章入第五级坐照 qyj 41202、燕歌行入第六级通幽 lyg 8080）。
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

export const TS_MAIN_QUEST_REQUIREMENTS: MainQuestRequirement[] = [];

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
 * 或不点名；配角拍一律不进（乐明珠、苏荔、祁远、阁罗、武二郎、易彪、lcq.character.nanhuang_dagu、李师师…）→ 归二级线。
 * 实测原 143 条里 51%（73 条）点了人名，其中乐明珠 5 次几乎追平小紫的 6 次、
 * `stage_05` 十六拍里乐明珠独占开场两拍——按本规则这些自动出局。
 *
 * 【143 条原始 objective 不动】那些字段 canon_companion 侧栏也在读（`view.objective`），
 * 改了会波及另一个模式。它们留在原地当逐拍细节，本表只是叠在其上的主线层。
 */
export interface MainQuestNode {
  stageId: string;
  /**
   * 制作侧事件结果摘要。只供任务链审阅、报表与因果核对，不得直接展示给玩家。
   * 玩家目标始终读取本节点 `eventId` 所绑定 event 的固定 `objective`。
   */
  reviewSummary: string;
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
export const TS_MAIN_QUEST_LAYERS: MainQuestLayerDef[] = [];

/**
 * 全 37 关链序（经 `manifest.nextStageId` 遍历验证的无分叉单链）。
 * 供层级解析做"是否已抵达"的确定性先后判断——不能靠章节推进，因为 world_sim 的结算
 * 路径只写 `world.r2_*` 与 `offscreenResolvedEventIds`，不写 `flags.event.*.done`，
 * 章节完成条件永不满足（详见设计文档 §1）。
 */
export const TS_STAGE_ORDER: string[] = [];

/**
 * 主轴关卡 15 关（其余 22 关归二级线）。
 * 归属经数据核实：只扫 `scenario.events`——整文件关键词扫描会被
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
export const TS_MAIN_QUEST_STAGES: MainQuestStageRole[] = [];

/** 主轴 20 节点，按 `STAGE_ORDER` 链序排列。 */
export const TS_MAIN_QUEST_NODES: MainQuestNode[] = [];

/** 包主轴与 TS 表二选一：catalog 没有 storyAxis 时用 TS 表；有则 TS 五张表必须全空（编译期已查，这里兜底）。 */
export function resolveStoryAxis(ts: PackStoryAxis, pack: PackStoryAxis | null | undefined): PackStoryAxis {
  if (!pack) return ts;
  const left = (Object.keys(ts) as Array<keyof PackStoryAxis>).filter(key => ts[key].length);
  if (left.length) throw new Error(`storyAxis: declared by a content pack, but mainQuestAxis.ts TS tables are not empty (${left.join(', ')})`);
  return pack;
}

const AXIS = resolveStoryAxis({
  stageOrder: TS_STAGE_ORDER, layers: TS_MAIN_QUEST_LAYERS, stages: TS_MAIN_QUEST_STAGES,
  nodes: TS_MAIN_QUEST_NODES, requirements: TS_MAIN_QUEST_REQUIREMENTS,
}, CONTENT_PACKS.storyAxis);
/** 主线完成要求（见 TS_MAIN_QUEST_REQUIREMENTS 的说明）。 */
export const MAIN_QUEST_REQUIREMENTS: MainQuestRequirement[] = AXIS.requirements;
/** 六层长期方向（见 TS_MAIN_QUEST_LAYERS）。 */
export const MAIN_QUEST_LAYERS: MainQuestLayerDef[] = AXIS.layers;
/** 全关链序（见 TS_STAGE_ORDER；编译期核对等于沿 nextStageId 走出的链）。 */
export const STAGE_ORDER: string[] = AXIS.stageOrder;
/** 主轴关卡（见 TS_MAIN_QUEST_STAGES）。 */
export const MAIN_QUEST_STAGES: MainQuestStageRole[] = AXIS.stages;
/** 主轴节点（见 TS_MAIN_QUEST_NODES）。 */
export const MAIN_QUEST_NODES: MainQuestNode[] = AXIS.nodes;

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
 * 当前 event 是否正落在主轴节点上。
 * `pending/new` 不会成为玩家当前目标；它们仍只留在制作侧待办清单。
 */
export function resolveCurrentMainQuestNode(
  currentStageId: string | undefined,
  currentLocationId: string | undefined,
  currentEventId: string | undefined,
): MainQuestNode | undefined {
  if (!currentEventId) return undefined;
  return resolveMainQuestNodes(currentStageId, currentLocationId).find(node =>
    node.status === 'ready' && node.eventId === currentEventId);
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
