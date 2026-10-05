/**
 * Canon Rail keeps the default Six Dynasties route on its source-backed beats.
 *
 * A rail is selected by its audited stage, not by player choice. It is not an
 * alternate scenario system: an explicit IF branch remains the only place
 * allowed to replace a canon outcome.
 */

import { GENERATED_CANON_RAIL_PROFILES } from './canonRailProfiles.generated';

/**
 * These legacy stages cannot appear on the default route: either every plot
 * beat is unanchored, or source review found a material anchor conflict. They
 * may only be reached by an explicit IF route after their canon is rebuilt.
 */
export const DEFAULT_LINE_QUARANTINED_STAGE_IDS = new Set([
  'lyl.taiquan_expedition',
  'lcq.stage_03',
  'lcq.stage_05',
  'lcq.stage_06',
  'lyg.ganlu_bian',
  'lyg.shixiang_ambush',
  'lyl.lin_an_black_sea',
  'lyl.luoyang_coup',
]);

export function isDefaultLineQuarantinedStageId(stageId: unknown): boolean {
  return typeof stageId === 'string' && DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(stageId);
}

export interface CanonRailContract {
  eventId: string;
  /** Source-backed result which must happen before this node can be completed. */
  mustReach: string;
  /** Compact, source-backed anchors that must be present in reconciliation evidence. */
  completionEvidence: string[];
  /** Disallowed default-line rewrites; only an explicit IF may authorize them. */
  forbiddenInCanon: string[];
  /** Safe material the narrator may add between fixed beats. */
  allowedElaboration: string;
}

export interface CanonRailProfile {
  id: string;
  modId: string;
  chapterId: string;
  orderedEventIds: string[];
  contracts: CanonRailContract[];
}

/** Hand-reviewed exceptions. The #9/#10 source order fixes the old reversed event conditions. */
const HAND_REVIEWED_CANON_RAIL_PROFILES: CanonRailProfile[] = [
  {
    id: 'qingyu.stage_01',
    modId: 'lcq.stage_01',
    chapterId: 'lcq.chapter.stage_01',
    orderedEventIds: [
      'lcq.event.s01_01',
      'lcq.event.s01_02',
      'lcq.event.s01_03',
      'lcq.event.s01_04',
      'lcq.event.s01_06',
      'lcq.event.s01_05',
    ],
    contracts: [
      {
        eventId: 'lcq.event.s01_01',
        mustReach: '程宗扬与段强在航班上遭紫色雷电击中，并从现代世界消失、坠入异界草原。',
        completionEvidence: ['程宗扬', '段强', '紫色雷电'],
        forbiddenInCanon: ['改写穿越原因', '替换同行者', '提前抵达后续地点'],
        allowedElaboration: '可补足机舱异象、坠落后的感官与两人的即时应对；不得另造穿越原因或改写同行者。',
      },
      {
        eventId: 'lcq.event.s01_02',
        mustReach: '段强在异界草原遭半兽人袭击身亡，程宗扬被迫独自求生。',
        completionEvidence: ['段强', '半兽人', '射杀'],
        forbiddenInCanon: ['段强存活', '段强失踪', '替换死亡结果'],
        allowedElaboration: '可补足遭袭过程、程宗扬的反应与脱险衔接；不得让段强存活、失踪或换成其他结局。',
      },
      {
        eventId: 'lcq.event.s01_03',
        mustReach: '程宗扬在战场与受伤、女扮男装的月霜初遇，冲突由误触其胸部引发。',
        completionEvidence: ['月霜', '初遇', '受伤'],
        forbiddenInCanon: ['提前揭露月霜身世', '提前引入后续人物'],
        allowedElaboration: '可补足战场混乱、彼此误解与短暂协作；不得提前揭露不在场人物的私密背景。',
      },
      {
        eventId: 'lcq.event.s01_04',
        mustReach: '卓云君施救，太乙真宗诸人介入并击退兽蛮，使程宗扬与月霜脱险。',
        completionEvidence: ['卓云君', '兽蛮', '脱险'],
        forbiddenInCanon: ['无关人物获得太乙身份', '改写救援结果'],
        allowedElaboration: '可补足救援过程、战后安置与人物反应；不得把无关人物写成太乙弟子、教御或道门中人。',
      },
      {
        eventId: 'lcq.event.s01_06',
        mustReach: '月霜寒毒危急，真阳进入其体内并压制、化解寒毒。',
        completionEvidence: ['月霜', '寒毒', '真阳'],
        forbiddenInCanon: ['以替代疗法跳过寒毒', '将本拍作废'],
        allowedElaboration: '可补足伤势危机、救治的前因后果与事后关系张力；不得以“作废”或替代疗法跳过此一既定结果。',
      },
      {
        eventId: 'lcq.event.s01_05',
        mustReach: '王哲为程宗扬筑基疗伤，授其九阳神功口诀，程宗扬以自创文字记录。',
        completionEvidence: ['王哲', '筑基', '九阳神功'],
        forbiddenInCanon: ['提前扩写下一关', '改写传功结果'],
        allowedElaboration: '可补足帅帐会面、问答与传功后的余波；不得提前扩写后续关卡剧情。',
      },
    ],
  },
  {
    id: 'qingyu.stage_02',
    modId: 'lcq.stage_02',
    chapterId: 'lcq.chapter.stage_02',
    orderedEventIds: [
      'lcq.event.s02_01',
      'lcq.event.s02_03',
      'lcq.event.s02_02',
      'lcq.event.s02_04',
      'lcq.event.s02_05',
      'lcq.event.s02_06',
      'lcq.event.ningyu_enters_gamble',
      'lcq.event.sudaji_south_pact',
      'lcq.event.gamble_bond_signed',
      'lcq.event.charge_sudaji_fee',
      'lcq.event.free_ajiman',
      'lcq.event.baihu_shangguan_escape',
      'lcq.event.wuerlang_joins',
      'lcq.event.iron_bridge_ambush',
      'lcq.event.ningyu_regicide_offer',
      'lcq.event.zixi_taiyi_intercept',
      'lcq.event.rainforest_black_shoal',
      'lcq.event.silent_sheyi_village',
    
    ],
    contracts: [
      {
        eventId: 'lcq.event.s02_01',
        mustReach: '王哲向程宗扬交付锦囊，并托付太泉祭祀与守护月霜之事。',
        completionEvidence: ['王哲', '锦囊', '月霜'],
        forbiddenInCanon: ['改写王哲的托付', '提前泄露太泉秘密'],
        allowedElaboration: '可补足帅帐问答、传功后的余波和临别反应；不得提前演出后续战局。',
      },
      {
        eventId: 'lcq.event.s02_03',
        mustReach: '天武营秦军与罗马第十二军团交战，罗马战术重创秦军方阵，秦军溃散。',
        completionEvidence: ['秦军', '罗马', '溃散'],
        forbiddenInCanon: ['将本拍改写为程宗扬与月霜逃亡', '改写秦军溃散结果'],
        allowedElaboration: '可补足战场视角、军阵混乱与即时求生；不得新增未登场人物或改写战局结果。',
      },
      {
        eventId: 'lcq.event.s02_02',
        mustReach: '左武第一军团覆灭，王哲留下以九阳神功牺牲，程宗扬带月霜离开。',
        completionEvidence: ['王哲', '左武', '九阳'],
        forbiddenInCanon: ['王哲存活', '左武军完整撤离', '替代牺牲结果'],
        allowedElaboration: '可补足撤离抉择、战场余波与人物反应；不得跳过王哲的托付与牺牲。',
      },
      {
        eventId: 'lcq.event.s02_04',
        mustReach: '程宗扬在五原城被误认为逃奴，遭殴打并被烙上奴隶印记。',
        completionEvidence: ['五原城', '奴隶', '烙印'],
        forbiddenInCanon: ['提前解除奴隶印记', '避免被误抓的既定结果'],
        allowedElaboration: '可补足入城过程、误会升级和程宗扬的应对；不得改写烙印已经落下的事实。',
      },
      {
        eventId: 'lcq.event.s02_05',
        mustReach: '程宗扬被故意放出牢房后遭戈龙伏击，被迫杀死孙疤脸并反抗。',
        completionEvidence: ['戈龙', '孙疤脸', '伏击'],
        forbiddenInCanon: ['跳过伏击', '改写孙疤脸的死亡结果'],
        allowedElaboration: '可补足牢外地形、伏击过程与即时选择；不得提前扩写商馆后续人物关系。',
      },
      {
        eventId: 'lcq.event.s02_06',
        mustReach: '程宗扬识破苏妲己伪装后遭囚禁，并被追问霓龙丝情报。',
        completionEvidence: ['苏妲己', '囚禁', '霓龙丝'],
        forbiddenInCanon: ['将囚禁直接改写为合作交易', '提前解决商馆冲突'],
        allowedElaboration: '可补足对话试探、商馆氛围和信息博弈；不得替程宗扬直接脱身。',
      },
      {
        eventId: 'lcq.event.ningyu_enters_gamble',
        mustReach: '凝羽奉苏妲己之命进入赌局，程宗扬当面认清她被差遣入局的处境。',
        completionEvidence: ['凝羽', '苏妲己', '打赌'],
        forbiddenInCanon: ['改写凝羽入局的主使', '把凝羽写成被卖之人', '提前写成卖身契已签'],
        allowedElaboration: '可补足差遣当场、试装入局与程宗扬的当面回应；不得预写落败签契，也不得改写入局主使。',
      },
      {
        eventId: 'lcq.event.sudaji_south_pact',
        mustReach: '程宗扬与苏妲己订下三个月内赴南荒采集霓龙丝、逾期受炮烙的约定。',
        completionEvidence: ['霓龙丝', '炮烙', '南荒'],
        forbiddenInCanon: ['改写三个月期限', '取消炮烙违约后果', '把霓龙丝产地写成已核实的世界事实'],
        allowedElaboration: '可补足谈判语气、期限与炮烙威胁的当场压力；不得改写约定本身，也不得把程宗扬的产地说辞坐实为已探明的产地。',
      },
      {
        eventId: 'lcq.event.gamble_bond_signed',
        mustReach: '苏妲己作弊加速刻香，程宗扬赌局落败，被迫签下卖身契，成为白湖商馆奴隶。',
        completionEvidence: ['刻香', '卖身契', '苏妲己'],
        forbiddenInCanon: ['改写落败结果', '把卖身契写成凝羽被卖', '让旁人代签或赌局作废'],
        allowedElaboration: '可补足刻香计时、作弊迹象与签字现场；不得把被卖之人改成凝羽，也不得让程宗扬赢下此局。',
      },
      {
        eventId: 'lcq.event.charge_sudaji_fee',
        mustReach: '程宗扬在帮苏妲己取出器物前，谈定并预支六十金铢报酬。',
        completionEvidence: ['六十金铢', '苏妲己', '工钱'],
        forbiddenInCanon: ['改写六十金铢数额', '改写成先帮忙后空口赊账', '提前扩写南荒行程'],
        allowedElaboration: '可补足开价、写条据与取物前后的拉扯；不得改写先定价再动手的顺序。',
      },
      {
        eventId: 'lcq.event.free_ajiman',
        mustReach: '程宗扬取得阿姬曼身契并当面撕毁，随即遭遇出城路线被女侍卫搜查。',
        completionEvidence: ['阿姬曼', '身契', '撕毁'],
        forbiddenInCanon: ['改写撕契还自由的结果', '把阿姬曼写成已被卖走或处死', '跳过身契这一步'],
        allowedElaboration: '可补足五十金铢赎买、当面撕契与发现搜查后的改道；不得把撕契写成未发生。',
      },
      {
        eventId: 'lcq.event.baihu_shangguan_escape',
        mustReach: '程宗扬从白湖商馆脱身出馆，在女侍卫搜查下改道躲避，人仍留在五原城内。',
        completionEvidence: ['女侍卫', '搜查', '五原'],
        forbiddenInCanon: ['让程宗扬当场被抓回商馆死局', '提前写成已出五原城南下', '改写成与苏妲己和解离馆'],
        allowedElaboration: '可补足出馆路线、搜查气氛与改道藏匿；不得写成已离开五原城，也不得让商馆死局未解。',
      },
      {
        eventId: 'lcq.event.wuerlang_joins',
        mustReach: '武二郎去而复返后当面答应加入程宗扬的南荒队伍。',
        completionEvidence: ['南荒', '两银铢', '武二郎'],
        forbiddenInCanon: ['让武二郎拒绝入队并离开', '替换南荒同行者', '把此前解铐写成已经随行'],
        allowedElaboration: '可补足先前否认同行、压价与当面应诺；不得跳过他一度拒约、被迫返回才入队的结果。',
      },
      {
        eventId: 'lcq.event.iron_bridge_ambush',
        mustReach: '程宗扬稳住武二郎伤势，商队在铁索桥遭伏击后脱困续行。',
        completionEvidence: ['铁索桥', '武二郎', '凝羽'],
        forbiddenInCanon: ['改写伏击未发生', '让武二郎死在桥上', '跳过伤势与桥上冲突'],
        allowedElaboration: '可补足疗伤、桥头争夺与突围过程；不得改写商队在此桥遇伏、武二郎带伤随行的结果。',
      },
      {
        eventId: 'lcq.event.ningyu_regicide_offer',
        mustReach: '凝羽私下向程宗扬提出合作除掉苏妲己，并揭开体内阴寒之气来自西门庆。',
        completionEvidence: ['凝羽', '除掉苏妲己', '西门庆'],
        forbiddenInCanon: ['把提议写成已经弑主成功', '改写阴寒来源', '提前扩写苏妲己之死'],
        allowedElaboration: '可补足私下开价、双修探查与她自述旧事；不得把尚未执行的弑主写成既成事实。',
      },
      {
        eventId: 'lcq.event.zixi_taiyi_intercept',
        mustReach: '太乙真宗在紫溪拦截白湖船队，程宗扬被迫现身交涉，祁远被推落水中。',
        completionEvidence: ['紫溪', '元行健', '祁远'],
        forbiddenInCanon: ['改写拦船未发生', '让船队被太乙接管', '让祁远在本拍失踪不归'],
        allowedElaboration: '可补写船头交涉、落水与救回船上；不得改写太乙拦船与程宗扬必须出面的结果。',
      },
      {
        eventId: 'lcq.event.rainforest_black_shoal',
        mustReach: '商队承受雨林伤亡后，依凝羽岸边火堆指引，白湖与云氏两支商队渡过黑石滩。',
        completionEvidence: ['黑石滩', '凝羽', '火堆'],
        forbiddenInCanon: ['改写渡河失败', '抹去雨林伤亡', '把火堆指引改成他人'],
        allowedElaboration: '可补足山洪、迷失与两队协作；不得跳过凝羽火堆指引，也不得改写两队渡河成功。',
      },
      {
        eventId: 'lcq.event.silent_sheyi_village',
        mustReach: '商队抵达无灯火、无人声的蛇彝村，并在村中安置下来。',
        completionEvidence: ['蛇彝', '灯火', '无声'],
        forbiddenInCanon: ['提前写成灭村真相', '改写成灯火通明有人应门', '跳过入村安置'],
        allowedElaboration: '可补足抵寨观察、警戒与借宿安排；不得提前宣告屠村或鬼王峒所为。',
      },
    ],
  },
];

/**
 * Load-bearing default-line beats that already exist as stage events with
 * source axes, but were never generated onto the rail. Tracked here instead of
 * re-running the generator, which would pull every hanging critical onto the
 * spine. Overlay chapter bindings remain the authoritative data hang.
 */
const DEFAULT_LINE_EXTRA_RAIL_BEATS: Array<{
  modId: string;
  afterEventId?: string;
  beforeEventId?: string;
  eventIds: string[];
  contracts: CanonRailContract[];
}> = [
  {
    "modId": "lcq.stage_03b_snake_flower_bridge",
    "afterEventId": "lcq.event.s03b_snake_flower_bridge_07",
    "eventIds": [
      "lcq.event.s03b_wanwu_night",
      "lcq.event.s03b_yinzhu_xiongerpu"
    ],
    "contracts": [
      {
        "eventId": "lcq.event.s03b_wanwu_night",
        "mustReach": "花苗篝火万舞后，程宗扬循谢艺预言入林，发现蛇彝遇害者及笑脸血符，接回受惊的阿葭。只写血符及震撼，不描述遇害者年龄和身体；阿葭本拍不死。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.s03b_yinzhu_xiongerpu",
        "mustReach": "阿葭被阴蛛吸干，武二郎杀蛛，祁远主张焚尸。新娘仍戴面纱。在熊耳铺拒绝秦桧和吴三桂，选择朱八八；秦吴不随队，商队与送亲队同行。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      }
    ]
  },
  {
    "modId": "lcq.stage_04b_lingfei_baiyi_crisis",
    "afterEventId": "lcq.event.s04b_lingfei_baiyi_crisis_12",
    "eventIds": [
      "lcq.event.s04b_xi_furen_trade_route"
    ],
    "contracts": [
      {
        "eventId": "lcq.event.s04b_xi_furen_trade_route",
        "mustReach": "白夷族长已被鬼王峒杀死。樨夫人接任族长，商路只向云氏和白湖商馆开放，金玉珠宝半价；白夷仍附峒观望，不是归附商队。易虎成为血虎留在白夷。只演交易，不演成人情节。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      }
    ]
  },
  {
    "modId": "lcq.stage_04b_lingfei_baiyi_crisis",
    "afterEventId": "lcq.event.s04b_lingfei_baiyi_crisis_17",
    "eventIds": [
      "lcq.event.xiaozi_first_appears"
    ],
    "contracts": [
      {
        "eventId": "lcq.event.xiaozi_first_appears",
        "mustReach": "第70章末，碧鲮少女自称小紫，向众人问好。黑舌尚未死亡，不得提前质问他的死因。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      }
    ]
  },
  {
    "modId": "lcq.stage_04b_lingfei_baiyi_crisis",
    "afterEventId": "lcq.event.s04b_lingfei_baiyi_crisis_19",
    "eventIds": [
      "lcq.event.haishen_hall_merfolk",
      "lcq.event.pull_harpoon_lemingzhu",
      "lcq.event.regroup_caravan_envoy",
      "lcq.event.weapon_deal_with_geluo",
      "lcq.event.spot_dong_informant",
      "lcq.event.biling_bay_stance",
      "lcq.event.ruins_ghost_warriors",
      "lcq.event.wuerlang_slays_dagu",
      "lcq.event.yiyang_repels_yinsha",
      "lcq.event.huamiao_coop_boundary",
      "lcq.event.guiwangdong_coop_pact",
      "lcq.event.enter_dong_with_migu"
    ],
    "contracts": [
      {
        "eventId": "lcq.event.haishen_hall_merfolk",
        "mustReach": "程宗扬在废弃海神殿抵御鲛人袭击，护住受困的乐明珠。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.pull_harpoon_lemingzhu",
        "mustReach": "拔除卡住乐明珠的鱼叉，并稳定她的伤势。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.regroup_caravan_envoy",
        "mustReach": "收拢残余商队，确认鬼王峒使者已抵达海湾。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.weapon_deal_with_geluo",
        "mustReach": "程宗扬以兵器生意与鬼王峒使者阁罗敲定交易，化解眼前危机。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.spot_dong_informant",
        "mustReach": "厘清兵器交易背后的危险，处置偷听的鬼王峒眼线。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.biling_bay_stance",
        "mustReach": "蛇傀下令焚烧碧鲮族，程宗扬率众突袭斩杀蛇傀，碧鲮族获释后反攻鬼王峒。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.ruins_ghost_warriors",
        "mustReach": "在古道废墟识别鬼王峒标记，协助易彪守住阵地。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.wuerlang_slays_dagu",
        "mustReach": "撑住达古率领的围攻，见证武二郎斩杀巫师扭转战局。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.yiyang_repels_yinsha",
        "mustReach": "护住苏荔，并以一阳境阳气逼退阴煞。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.huamiao_coop_boundary",
        "mustReach": "云苍峰坦言云氏欲借机探鬼王峒底细并拉拢部族，程宗扬明确双方是平等合作不是依附。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.guiwangdong_coop_pact",
        "mustReach": "程宗扬安置旧伤复发的凝羽，并与云氏、花苗结成探查鬼王峒的同行约定。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.enter_dong_with_migu",
        "mustReach": "随弥骨进入鬼王峒，阻止接待冲突升级并记清洞内路线与奴隶区。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      }
    ]
  },
  {
    "modId": "lcq.stage_05b",
    "beforeEventId": "lcq.event.s05b_01_binu_reveals_xiaozi",
    "eventIds": [
      "lcq.event.blank_letter_and_dagu",
      "lcq.event.geluo_summons_biji",
      "lcq.event.escape_cave_mechanism",
      "lcq.event.hongmiao_controlled"
    ],
    "contracts": [
      {
        "eventId": "lcq.event.blank_letter_and_dagu",
        "mustReach": "白纸信笺打开仍是白纸；小紫当着阁罗说破达古已死。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.geluo_summons_biji",
        "mustReach": "阁罗召来碧姬，程宗扬第一次当面见到谢艺要找的人。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.escape_cave_mechanism",
        "mustReach": "利用机关异动摆脱看守，从岩壁找出可通行山洞。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.hongmiao_controlled",
        "mustReach": "确认红苗盟友已被鬼王峒控制，把苏荔从阁罗手中暂时保下。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      }
    ]
  },
  {
    "modId": "lcq.stage_05b",
    "afterEventId": "lcq.event.tribes_pledge",
    "eventIds": [
      "lcq.event.s05b_ice_gu_detour",
      "lcq.event.s05b_wuer_suli_depart",
      "lcq.event.shanghou_revealed",
      "lcq.event.s05b_shanghou_reads_letter",
      "lcq.event.s05b_yeao_palm_ningyu_stays",
      "lcq.event.shanghou_cures_ice_gu"
    ],
    "contracts": [
      {
        "eventId": "lcq.event.s05b_ice_gu_detour",
        "mustReach": "祁远算出三个月之约只剩十几天，赶不及回五原或建康，朱老头指路山村一天多。云苍峰与小魏带货物和伤员去白龙江口，程宗扬、祁远、凝羽、乐明珠随朱老头去叶媪山村。期限仅叙事压力，无致命倒计时。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.s05b_wuer_suli_depart",
        "mustReach": "苏荔说明借种壮大花苗的目的，程宗扬拒绝，本拍不发生性关系，苏荔离开。程宗扬向武功全废的武二郎传九阳口诀，按每月两枚银铢结清工钱；武二郎独自修炼，不去建康。云苍峰一行在林子那头分手。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.shanghou_revealed",
        "mustReach": "程宗扬在叶媪引导下见到鸩羽殇侯，确认他就是朱老头；殇侯称他是天命之人。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.s05b_shanghou_reads_letter",
        "mustReach": "殇侯以一斤三两精盐兑盐水，再施玄冰掌，程宗扬吐出裹蛊虫的冰块，冰蛊实际解除。白纸信泼茶显字，约甲子立秋廿载共祭；殇侯讲师兄二十年前围攻自己、引诱阿巫的旧怨，烧毁信笺。不得点破师兄姓名、不得扩写大祭结果。修为九级，五级以上称高手，谢艺六级。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.s05b_yeao_palm_ningyu_stays",
        "mustReach": "叶媪令程宗扬运气，一掌引出屠龙的阴寒反噬，祁远上前被拂退。凝羽经脉阴气过盛，须留山村调养至少半年，程宗扬不能陪留。不得揭露叶媪真实身份。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      },
      {
        "eventId": "lcq.event.shanghou_cures_ice_gu",
        "mustReach": "殇侯解除程宗扬体内的冰蛊。",
        "completionEvidence": [],
        "forbiddenInCanon": [
          "提前演出后续剧情",
          "改写本拍已定结果"
        ],
        "allowedElaboration": "只补当前动作的场景与对话，不代替玩家行动。"
      }
    ]
  },
  {
    modId: 'lcq.stage_04b_lingfei_baiyi_crisis',
    afterEventId: 'lcq.event.s04b_lingfei_baiyi_crisis_16',
    eventIds: ['lcq.event.xieyi_biling_war'],
    contracts: [{
      eventId: 'lcq.event.xieyi_biling_war',
      mustReach: '谢艺讲述碧鲮族与鲛族旧战、朱狐冠来历，并希望程宗扬承接岳帅未竟之事。',
      completionEvidence: [],
      forbiddenInCanon: ['改写本拍原著结果', '提前演出后续剧情'],
      allowedElaboration: '可补足场景、对话、即时行动与相邻拍点之间的过渡。',
    }],
  },
  {
    modId: 'lcq.stage_07_qingyuan_jiankang',
    afterEventId: 'lcq.event.s07_05_eight_steeds_informed',
    eventIds: ['lcq.event.xiao_opens_resources'],
    contracts: [{
      eventId: 'lcq.event.xiao_opens_resources',
      mustReach: '当着萧遥逸听清星月湖眼下能用的资源。死则按遗产路径处理谢艺事务，生还则个人事务仍归本人。',
      completionEvidence: [],
      forbiddenInCanon: ['生还线写成继承或交割', '死亡线把谢艺写成仍在处理个人事务', '提前演出后续剧情'],
      allowedElaboration: '可补足资源清点与当下可用范围，不得改写死／生真值。',
    }],
  },
  {
    modId: 'lyl.lin_an_bridge',
    afterEventId: 'lyl.event.lin_an_bridge_04_beat',
    eventIds: ['lyl.event.lin_an_bridge_xieyi_tomb'],
    contracts: [{
      eventId: 'lyl.event.lin_an_bridge_xieyi_tomb',
      mustReach: '出城迎接月霜等人，到风波亭后拜祭岳鹏举；谢艺墓只在死亡线出现。',
      completionEvidence: [],
      forbiddenInCanon: ['生还线出现谢艺墓或空墓冒充已葬', '提前演出后续剧情'],
      allowedElaboration: '可补足迎接与祭扫过程，不得改写死／生真值。',
    }],
  },
];

function withDefaultLineExtraRailBeats(profiles: CanonRailProfile[]): CanonRailProfile[] {
  return profiles.map(profile => {
    const extras = DEFAULT_LINE_EXTRA_RAIL_BEATS.filter(item => item.modId === profile.modId);
    if (!extras.length) return profile;
    let orderedEventIds = [...profile.orderedEventIds];
    let contracts = [...profile.contracts];
    for (const extra of extras) {
      const already = extra.eventIds.filter(id => orderedEventIds.includes(id));
      if (already.length) {
        throw new Error(`${profile.modId} extra rail beat already present: ${already.join(', ')}`);
      }
      if (extra.contracts.length !== extra.eventIds.length) {
        throw new Error(`${profile.modId} extra rail beat contracts must match eventIds`);
      }
      const anchorId = extra.afterEventId || extra.beforeEventId;
      const afterIndex = anchorId ? orderedEventIds.indexOf(anchorId) : -1;
      if (afterIndex < 0) {
        throw new Error(`${profile.modId} extra rail beat missing insertion anchor ${anchorId}`);
      }
      const insertAt = afterIndex + (extra.beforeEventId ? 0 : 1);
      orderedEventIds = [
        ...orderedEventIds.slice(0, insertAt),
        ...extra.eventIds,
        ...orderedEventIds.slice(insertAt),
      ];
      contracts = [
        ...contracts.slice(0, insertAt),
        ...extra.contracts,
        ...contracts.slice(insertAt),
      ];
    }
    return { ...profile, orderedEventIds, contracts };
  });
}

/**
 * Every source-anchored built-in stage is covered here. Profiles generated
 * from the source axis are deterministic; hand-reviewed profiles above take
 * precedence when a source audit supplied stronger wording or a correction.
 */
export const CANON_RAIL_PROFILES: CanonRailProfile[] = withDefaultLineExtraRailBeats([
  ...HAND_REVIEWED_CANON_RAIL_PROFILES,
  ...GENERATED_CANON_RAIL_PROFILES,
]);

/** Only source-anchored stages may enter the default-line registry. */
export function getCanonRailProfile(runtime: { modId?: unknown } | null | undefined): CanonRailProfile | null {
  if (typeof runtime?.modId !== 'string') return null;
  return CANON_RAIL_PROFILES.find(profile => profile.modId === runtime.modId) || null;
}

export function getCanonRailContract(profile: CanonRailProfile | null, eventId: string): CanonRailContract | null {
  return profile?.contracts.find(contract => contract.eventId === eventId) || null;
}

export function getCanonRailOrder(profile: CanonRailProfile | null): Map<string, number> {
  return new Map((profile?.orderedEventIds || []).map((id, index) => [id, index]));
}

export function isCanonRailChapter(profile: CanonRailProfile | null, chapterId: string | null | undefined): boolean {
  return Boolean(profile && profile.chapterId === chapterId);
}
