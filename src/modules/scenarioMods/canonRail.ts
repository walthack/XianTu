import { CONTENT_PACKS } from '../contentPacks';
import {entityText,entityTemplateText} from './namedEntities';
import { quarantinedStageIds } from '../contentPacks/stageMeta';
import { mergeExtraRailBeats, type CanonRailExtraBeats } from './canonRailMerge';
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
export const TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS: ReadonlySet<string> = new Set([
  'lcq.stage_05',
  'lcq.stage_06',
  'lyg.ganlu_bian',
  'lyg.shixiang_ambush',
  'lyl.luoyang_coup',
]);

/** 合并后的隔离集合：内容包 stageMeta 写了 defaultLineQuarantined 的关按它，没写的沿用上面的 TS 表（编译期校验两边不重复）。 */
export const DEFAULT_LINE_QUARANTINED_STAGE_IDS = quarantinedStageIds(CONTENT_PACKS.stageMeta || [], TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS);

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
// 塞外线 S4：原有的两个塞外手审档已搬进 packs/saiwai/rails.json（handReviewed: true），这里留空
const HAND_REVIEWED_CANON_RAIL_PROFILES: CanonRailProfile[] = [];

/**
 * Load-bearing default-line beats that already exist as stage events with
 * source axes, but were never generated onto the rail. Tracked here instead of
 * re-running the generator, which would pull every hanging critical onto the
 * spine. Overlay chapter bindings remain the authoritative data hang.
 */
export const DEFAULT_LINE_EXTRA_RAIL_BEATS: CanonRailExtraBeats[] = [
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
        "mustReach": entityText("第70章末，碧鲮少女自称小紫，向众人问好。{{entity:character:lcq.character.nanhuang_heishe}}尚未死亡，不得提前质问他的死因。"),
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
        "mustReach": entityText("{{entity:character:lcq.character.nanhuang_shekui}}下令焚烧碧鲮族，程宗扬率众突袭斩杀{{entity:character:lcq.character.nanhuang_shekui}}，碧鲮族获释后反攻鬼王峒。"),
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
        "mustReach": entityText("撑住{{entity:character:lcq.character.nanhuang_dagu}}率领的围攻，见证武二郎斩杀巫师扭转战局。"),
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
        "mustReach": entityText("白纸信笺打开仍是白纸；小紫当着阁罗说破{{entity:character:lcq.character.nanhuang_dagu}}已死。"),
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
        "mustReach": entityText("祁远算出三个月之约只剩十几天，赶不及回五原或建康，朱老头指路山村一天多。云苍峰与{{entity:character:lcq.character.nanhuang_xiaowei}}带货物和伤员去白龙江口，程宗扬、祁远、凝羽、乐明珠随朱老头去叶媪山村。冰蛊发作在即，须赶在发作前解蛊。"),
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
  // 汉线补全（剧情策划 2026-10-28 五线补全·汉 H1–H20；用户 2026-10-28 01:26 授权）：欠账拍按原著序挂章上 rail，新建拍同上 rail。
  // 排序：按 axisSeq，同 seq 按原著行序（yly）——718：H1 抵舞都 22618 → 云如瑶私奔 22934；898：赏格争胡骑 47300 → 回绝剑玉姬 47483。
  // H17 汉宫真空（901）、H18 是否拥立（902）是「没亲历宫变之夜」的条件拍（conditions 取反），只挂汉宫突入章、不上 rail。
  {
    modId: 'lyl.luoyang_cloud_secret',
    afterEventId: 'lyl.event.s05_09',
    eventIds: ['lyl.event.han_yuedan_ping', 'lyl.event.han_huo_villa', 'lyl.event.han_xingyue_framed', 'lyl.event.han_limit_field'],
    contracts: [
      {
        eventId: 'lyl.event.han_yuedan_ping',
        mustReach: '程宗扬随朱老头赴石室书院月旦评，听桓谭与许杨、廖扶争谶纬、众人议「代汉者，当涂高」，见识谶纬如何左右洛都风向，并认出在座的吕巨君。',
        completionEvidence: [],
        forbiddenInCanon: ['在月旦评上与吕巨君当场冲突', '本拍就找到严君平', '提前演出后续剧情'],
        allowedElaboration: '可补足书院里的辩论与朱老头的胡侃，不得改写谶纬议论的走向。',
      },
      {
        eventId: 'lyl.event.han_huo_villa',
        mustReach: '程宗扬与斯明信趁夜潜入霍家别院，从厨娘口中问出关人的去处，摸到池边木屋的暗室寻找严君平的下落。',
        completionEvidence: [],
        forbiddenInCanon: ['惊动霍家与霍家人动手', '本拍点破暗室里是谁', '提前演出后续剧情'],
        allowedElaboration: '可补足别院的池沼台榭与斯明信的手段，不得提前写出暗室里找到的人。',
      },
      {
        eventId: 'lyl.event.han_xingyue_framed',
        mustReach: '程宗扬以手表为信物取得严君平信任，听他说出星月湖大营被诬是左武军覆没的原因，以及最后一块玉牌藏在胶西。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就替星月湖洗清冤屈', '提前演出后续剧情'],
        allowedElaboration: '可补足对暗号与严君平的叙述，不得改写被诬的说法与玉牌下落。',
      },
      {
        eventId: 'lyl.event.han_limit_field',
        mustReach: '程宗扬与云秀峰、郭解联手，用每亩四金铢的纸钞从洛都商贾手里买下一千五百顷田地，一千归云氏、五百归程氏，看清限田令要把云家卷进削豪强。',
        completionEvidence: [],
        forbiddenInCanon: ['改用金铢买田', '提前演出后续剧情'],
        allowedElaboration: '可补足议价与交割的经过，不得改写田数与分成。',
      },
    ],
  },
  {
    modId: 'lyl.han_palace_endgame',
    beforeEventId: 'lyl.event.han_palace_endgame_01_beat',
    eventIds: [
      'lyl.event.lvji_defiles_consort',
      'lyl.event.emperor_death_spreads',
      'lyl.event.arrange_escape_route',
      'lyl.event.liujian_takes_nangong',
      'lyl.event.changqiu_palace_defense',
      'lyl.event.bounty_and_hu_cavalry',
      'lyl.event.han_jianyu_refused',
      'lyl.event.lvfengxian_breaks_line',
    ],
    contracts: [
      {
        eventId: 'lyl.event.lvji_defiles_consort',
        mustReach: '程宗扬与赵合德藏在含光殿藻井上，屏息看完吕冀淫辱伪赵昭仪友通期的全过程，没有暴露行藏。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬现身阻止', '提前演出后续剧情'],
        allowedElaboration: '可补足藻井上的屏息与殿中情形，不得改写两人未被发现的结果。',
      },
      {
        eventId: 'lyl.event.emperor_death_spreads',
        mustReach: '天子暴毙的消息传遍洛都，程宗扬扮作内侍混出昭阳宫，护送赵飞燕与赵合德撤回长秋宫。',
        completionEvidence: [],
        forbiddenInCanon: ['救活天子', '提前演出后续剧情'],
        allowedElaboration: '可补足宫中的混乱与混出宫门的经过，不得改写天子之死。',
      },
      {
        eventId: 'lyl.event.arrange_escape_route',
        mustReach: '程宗扬从密道出宫，召齐各方定下拥立定陶王，并分派任务。',
        completionEvidence: [],
        forbiddenInCanon: ['改立他人', '提前演出后续剧情'],
        allowedElaboration: '可补足密道出宫与众人议事，不得改写拥立定陶王的决定。',
      },
      {
        eventId: 'lyl.event.liujian_takes_nangong',
        mustReach: '刘建起兵攻占南宫与武库，程宗扬确认了这一局面。',
        completionEvidence: [],
        forbiddenInCanon: ['阻止刘建攻占南宫', '提前演出后续剧情'],
        allowedElaboration: '可补足乱军入宫与武库起火的消息，不得改写刘建得手的结果。',
      },
      {
        eventId: 'lyl.event.changqiu_palace_defense',
        mustReach: '程宗扬守住长秋宫台阶，同时看住刘建的性命此时不能丢。',
        completionEvidence: [],
        forbiddenInCanon: ['长秋宫失守', '此时杀死刘建', '提前演出后续剧情'],
        allowedElaboration: '可补足台阶上的攻守，不得改写守住长秋宫的结果。',
      },
      {
        eventId: 'lyl.event.bounty_and_hu_cavalry',
        mustReach: '程宗扬立下赏格稳住长秋宫守军，并抢在两方使节之前争取胡骑校尉桓郁。',
        completionEvidence: [],
        forbiddenInCanon: ['桓郁倒向刘建或吕氏', '提前演出后续剧情'],
        allowedElaboration: '可补足赏格的数目与派人召桓郁的经过，不得改写争取到胡骑的结果。',
      },
      {
        eventId: 'lyl.event.han_jianyu_refused',
        mustReach: '剑玉姬以成光为条件换程宗扬支持刘建，蔡敬仲揭出刘建劣迹后，程宗扬当面回绝。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬答应剑玉姬', '本拍与剑玉姬分出生死', '提前演出后续剧情'],
        allowedElaboration: '可补足剑玉姬开出的条件与两人的言语交锋，不得改写回绝的结果。',
      },
      {
        eventId: 'lyl.event.lvfengxian_breaks_line',
        mustReach: '程宗扬看住阿阁战局，不让吕氏把赵皇后接往北宫；吕奉先单骑破阵。',
        completionEvidence: [],
        forbiddenInCanon: ['赵皇后被吕氏接走', '提前演出后续剧情'],
        allowedElaboration: '可补足阿阁一带的混战与吕奉先破阵的声势，不得改写赵皇后未被接走的结果。',
      },
    ],
  },
  {
    modId: 'lyg.dingtao_beijing',
    afterEventId: 'lyg.event.s01_08',
    eventIds: ['lyg.event.han_marquis_wuyang_enfeoff'],
    contracts: [{
      eventId: 'lyg.event.han_marquis_wuyang_enfeoff',
      mustReach: '秦桧、班超与霍子孟一方谈定酬功协议：程宗扬以拥立首功受封舞阳侯，实封五千户，封地在首阳山与舞都七里坊之间；他推掉少府，只要经营权。',
      completionEvidence: [],
      forbiddenInCanon: ['改封别的爵号或万户', '程宗扬接下少府留朝做官', '提前演出后续剧情'],
      allowedElaboration: '可补足翻看协议条款与众人的议论，不得改写封号、户数与封地。',
    }],
  },
  {
    modId: 'lyg.mijing_rumen',
    afterEventId: 'lyg.event.s02_09',
    eventIds: ['lyg.event.mijing_superuser_roster'],
    contracts: [{
      eventId: 'lyg.event.mijing_superuser_roster',
      mustReach: '程宗扬触龙珠触发冰冰、获超级管理员权限，冰冰当场验明在场众人身份、谁在超级用户名单上。',
      completionEvidence: [],
      forbiddenInCanon: ['改写名单上的人', '提前演出后续剧情'],
      allowedElaboration: '可补足冰冰现身与逐一验明的过程，不得改写验明结果。',
    }],
  },  // 唐线补全（剧情策划 2026-10-28 五线补全·唐 T1–T24；用户 2026-10-28 01:26 授权）：欠账拍按原著序挂章上 rail，新建拍同上 rail。
  // 留仙坪三拍排在 s03_01 之前（rail 章改为新首章「留仙坪」）；青龙寺（1096）接 s03_09 之后——它在本关，比下一关首拍北司佛门（1093）晚 3 个 seq，
  // 原著 #69 公敌（ygx 12301）确在 #72 婴衣（12812）之前，属跨关小倒序；overlay 不能删事件，挪关要改生成源，本次不动，已报待核。
  // 鸿胪寺致歉、元正朝会按原著汉使版（Q1 跳过汉线、无汉使身份时的分档待用户拍板，未实现）。
  {
    modId: 'lyg.changgan_begins',
    beforeEventId: 'lyg.event.s03_01',
    eventIds: ['lyg.event.tang_liuxianping_arrive', 'lyg.event.tang_liuxianping_xiangshi', 'lyg.event.changgan_fanseng_hunt'],
    contracts: [
      {
        eventId: 'lyg.event.tang_liuxianping_arrive',
        mustReach: '程宗扬在山中小镇留仙坪多留一日，在留仙客栈盯着周族少主周飞一伙与同行的廖群玉。',
        completionEvidence: [],
        forbiddenInCanon: ['与周飞当场结仇动手', '本拍就点破老相士的来历', '提前演出后续剧情', '行商入唐写成舞阳侯、汉使身份、舞都或汉国随行'],
        allowedElaboration: '可补足客栈里的人与白员外遇狐的传说，不得改写同住客栈的这几伙人。',
      },
      {
        eventId: 'lyg.event.tang_liuxianping_xiangshi',
        mustReach: '程宗扬识破留仙坪那个落魄老相士的伪装，相士承认自己是魂魄降世的穿越者、借名袁天罡，两人约定合作。',
        completionEvidence: [],
        forbiddenInCanon: ['袁天罡拒绝合作或被杀', '本拍就找到回去的办法', '提前演出后续剧情'],
        allowedElaboration: '可补足逼问与两人互相试探的对话，不得改写袁天罡的来历与合作的结果。',
      },
      {
        eventId: 'lyg.event.changgan_fanseng_hunt',
        mustReach: '袁天罡讲出当年主家小姐被番僧以魔症带走的旧事，坦言不知道番僧是否专冲穿越者而来；程宗扬由此起疑。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就与番僧交手', '提前演出后续剧情', '坐实番僧专门猎杀穿越者'],
        allowedElaboration: '可补足袁天罡讲述时的忌惮与程宗扬的追问。',
      },
    ],
  },
  {
    modId: 'lyg.changgan_begins',
    afterEventId: 'lyg.event.s03_09',
    eventIds: ['lyg.event.qinglongsi_te_master'],
    contracts: [{
      eventId: 'lyg.event.qinglongsi_te_master',
      mustReach: '程宗扬与小紫潜入青龙寺，查到释特昧普的扩张方式与外援（分赃、波斯女信徒与黑魔海女忍的线索），在暴露前撤离。',
      completionEvidence: [],
      forbiddenInCanon: ['在青龙寺与释特昧普正面交手', '提前演出后续剧情'],
      allowedElaboration: '可补足潜入与撤离的经过，不得改写查到的外援线索。',
    }],
  },
  {
    modId: 'lyg.changgan_interlude',
    beforeEventId: 'lyg.event.changgan_interlude_01_beat',
    eventIds: [
      'lyg.event.north_bureau_buddhist_moves',
      'lyg.event.honglusi_amends',
      'lyg.event.cien_red_lotus',
      'lyg.event.yuanzheng_globe',
      'lyg.event.xuanping_eunuch_murder',
      'lyg.event.survey_xingqing_palace',
      'lyg.event.prince_injury_control',
      'lyg.event.shuixiang_lure_setup',
      'lyg.event.spot_poison_assassin',
      'lyg.event.poolside_capture',
      'lyg.event.blast_moni_temple',
      'lyg.event.xinyong_reveals_fanmi',
      'lyg.event.interrogate_feiniao_yingzi',
    ],
    contracts: [
      {
        eventId: 'lyg.event.north_bureau_buddhist_moves',
        mustReach: '杨玉环向程宗扬说明北司宦官正借佛门查探他的底细，程宗扬厘清北司与佛门各自的查探方向。',
        completionEvidence: [],
        forbiddenInCanon: ['把北司与佛门坐实为同一主使', '提前演出后续剧情'],
        allowedElaboration: '可补足紫云楼的情报交换与潘金莲在旁的观察，不得提前触发尚未发生的杀局。',
      },
      {
        eventId: 'lyg.event.honglusi_amends',
        mustReach: '鸿胪寺少卿段文楚为此前失礼登门致歉，恢复汉使礼遇，并确认程宗扬可以参加元正朝会。',
        completionEvidence: [],
        forbiddenInCanon: ['鸿胪寺拒不认错', '取消程宗扬的朝会资格', '提前演出后续剧情'],
        allowedElaboration: '可补足段文楚致歉的场面与礼遇细节，不得改写恢复礼遇与朝会资格的结果。',
      },
      {
        eventId: 'lyg.event.cien_red_lotus',
        mustReach: '大慈恩寺红莲演法暴露密宗势力的进逼，唐皇随后亲临大慈恩寺，要求窥基约束僧众；程宗扬看清演法与敕令之间的张力。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬当场揭穿红莲演法', '提前演出后续剧情'],
        allowedElaboration: '可补足演法场面与唐皇敕令的余波，不得改写唐皇要窥基约束僧众的结果。',
      },
      {
        eventId: 'lyg.event.yuanzheng_globe',
        mustReach: '程宗扬以汉使身份赴大明宫元正朝会，徐君房展示地球仪并自称秦国使者；程宗扬认出其中的现代地理知识，先判断这条异世线索的真伪与政治风险。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬当朝揭穿徐君房', '提前演出后续剧情'],
        allowedElaboration: '可补足朝会礼仪与各国使节的反应，不得改写徐君房展示地球仪、自称秦使的结果。',
      },
      {
        eventId: 'lyg.event.xuanping_eunuch_murder',
        mustReach: '一名宦官在宣平坊外遇刺，现场留下针对宦官的口号；程宗扬勘查现场，保留私仇、党争信号或诱饵几种可能。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就定下幕后主使', '提前演出后续剧情'],
        allowedElaboration: '可补足勘查现场的经过，不得把幕后坐实为某一方。',
      },
      {
        eventId: 'lyg.event.survey_xingqing_palace',
        mustReach: '程宗扬一行进入废弃的兴庆宫，在荒废宫苑中发现地下入口，确认宫城下方另有隐秘通路。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就深入地下', '提前演出后续剧情'],
        allowedElaboration: '可补足废宫的景象与寻找入口的过程，不得写出地下的去向。',
      },
      {
        eventId: 'lyg.event.prince_injury_control',
        mustReach: '杨玉环误射太子，义姁紧急施救；程宗扬在太子伤势稳定前封锁现场，以虚构刺客的说法压住误伤消息。',
        completionEvidence: [],
        forbiddenInCanon: ['太子伤重不治', '误伤真相当场传开', '提前演出后续剧情'],
        allowedElaboration: '可补足救治与封锁现场的经过，不得改写太子伤势稳住、消息压下的结果。',
      },
      {
        eventId: 'lyg.event.shuixiang_lure_setup',
        mustReach: '程宗扬把家眷迁入水香楼，布下明暗哨与包围圈，准备在不惊动周边势力的情况下引出潘金莲。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就引出潘金莲', '提前演出后续剧情'],
        allowedElaboration: '可补足迁居与布哨的安排，不得提前写出诱捕的结果。',
      },
      {
        eventId: 'lyg.event.spot_poison_assassin',
        mustReach: '假扮小厮的刺客送来涂毒药方，程宗扬与成光中毒麻痹，刺客藏入楼内；程宗扬先稳住毒势，再封锁水香楼。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬未中毒', '本拍就擒下刺客', '提前演出后续剧情'],
        allowedElaboration: '可补足中毒后的应对，不得改写刺客藏入楼内的结果。',
      },
      {
        eventId: 'lyg.event.poolside_capture',
        mustReach: '潘金莲与黑魔海女忍飞鸟萤子在水香楼交锋，战到池畔、放出毒烟；程宗扬识破飞鸟萤子的示弱，将她擒下。',
        completionEvidence: [],
        forbiddenInCanon: ['飞鸟萤子逃脱或被杀', '提前演出后续剧情'],
        allowedElaboration: '可补足池畔混战与隔离毒烟的经过，不得改写擒获的结果。',
      },
      {
        eventId: 'lyg.event.blast_moni_temple',
        mustReach: '观海等密宗僧人拷问摩尼女师并强行灌顶，程宗扬引爆僧舍制造营救窗口，却没能把女师救出。',
        completionEvidence: [],
        forbiddenInCanon: ['救出摩尼女师', '提前演出后续剧情'],
        allowedElaboration: '可补足爆破与混乱中的营救尝试，不得改写女师未被救出的结果。',
      },
      {
        eventId: 'lyg.event.xinyong_reveals_fanmi',
        mustReach: '信永拜访程宗扬，讲清蕃密灌顶与释特昧普败坏佛门的内幕，建议暂避锋芒；程宗扬掌握风险后仍选择继续抵抗。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬听劝退让', '提前演出后续剧情'],
        allowedElaboration: '可补足信永的讲述与程宗扬的权衡，不得改写继续抵抗的决定。',
      },
      {
        eventId: 'lyg.event.interrogate_feiniao_yingzi',
        mustReach: '程宗扬审讯被俘的飞鸟萤子并提出三个问题，飞鸟萤子拒绝合作，审讯没有得到可靠口供。',
        completionEvidence: [],
        forbiddenInCanon: ['飞鸟萤子吐露口供', '提前演出后续剧情'],
        allowedElaboration: '可补足审讯的交锋，不得改写拒绝合作的结果。',
      },
    ],
  },
  {
    modId: 'lyg.changgan_interlude',
    afterEventId: 'lyg.event.changgan_interlude_03_beat',
    eventIds: ['lyg.event.song_tongwen'],
    contracts: [{
      eventId: 'lyg.event.song_tongwen',
      mustReach: '童贯到程宅口传宋主圣谕：程宗扬特授礼部侍郎，差赴唐国充任通问计议使，全权处置对唐国事务与昭南交涉；童贯奉上正使符印、节杖，自己改任副使。',
      completionEvidence: [],
      forbiddenInCanon: ['程宗扬推辞不受', '提前演出后续剧情'],
      allowedElaboration: '可补足童贯传旨与奉印的场面，不得改写官职与差遣。',
    }],
  },
  {
    modId: 'lyg.changgan_interlude',
    afterEventId: 'lyg.event.changgan_interlude_04_beat',
    eventIds: ['lyg.event.tang_secret_treaty_signed'],
    contracts: [{
      eventId: 'lyg.event.tang_secret_treaty_signed',
      mustReach: '宋国与昭南在升平客栈连夜谈判，密约条款大致谈妥，只卡在昭南要张亢的人头；程宗扬定下条款不再让步、张亢不交两条底线，改从私下给申服君好处入手。',
      completionEvidence: [],
      forbiddenInCanon: ['交出张亢', '谈判破裂', '本拍就公布和约', '提前演出后续剧情'],
      allowedElaboration: '可补足通宵谈判的拉锯与内宅里的商议，不得改写两条底线。',
    }],
  },
  {
    modId: 'lyg.changgan_interlude',
    afterEventId: 'lyg.event.changgan_interlude_08_beat',
    eventIds: ['lyg.event.honglusi_treaty_announced'],
    contracts: [{
      eventId: 'lyg.event.honglusi_treaty_announced',
      mustReach: '正月初九，昭南与宋国的使者同赴鸿胪寺正式宣布和约，战事一夜平息；程宗扬成了长安各方关注的焦点。',
      completionEvidence: [],
      forbiddenInCanon: ['公开密约条款', '和约破裂', '提前演出后续剧情'],
      allowedElaboration: '可补足长安各方的议论与传言，不得改写和约公布的结果。',
    }],
  },
  {
    modId: 'lyg.changgan_interlude',
    afterEventId: 'lyg.event.changgan_interlude_10_beat',
    eventIds: ['lyg.event.liang_secret_order', 'lyg.event.zhoufei_conspiracy', 'lyg.event.feiniao_hilt_clue'],
    contracts: [
      {
        eventId: 'lyg.event.liang_secret_order',
        mustReach: '杨玉环当面把李昂托付的闭门密令交给程宗扬：天策府闭门不涉，并牵制鱼朝恩。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬拒接密令', '提前演出甘露之变', '提前演出后续剧情'],
        allowedElaboration: '可补足杨玉环转交密令的场面，不得改写密令内容。',
      },
      {
        eventId: 'lyg.event.zhoufei_conspiracy',
        mustReach: '黎锦香当面说清：周飞与十方丛林合谋，针对程宅。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就与周飞交手', '提前演出后续剧情'],
        allowedElaboration: '可补足黎锦香的讲述与程宗扬的追问，不得改写合谋的双方与目标。',
      },
      {
        eventId: 'lyg.event.feiniao_hilt_clue',
        mustReach: '程宗扬当面问出飞鸟家族与布都御魂剑柄的线索。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就找到剑柄', '提前演出后续剧情'],
        allowedElaboration: '可补足问话的经过，不得改写线索指向飞鸟家族。',
      },
    ],
  },
  {
    modId: 'lyg.shituolin_endgame',
    beforeEventId: 'lyg.event.shituolin_endgame_14_beat',
    eventIds: ['lyg.event.shituolin_endgame_title_daduhu'],
    contracts: [{
      eventId: 'lyg.event.shituolin_endgame_title_daduhu',
      mustReach: '段文楚在程侯府外设香案宣诏，唐国以宾礼待之，授这位外臣正式官职大都护、勋位上柱国，另有大批赏赐；没有授郡公、国公或郡王之类的爵位。',
      completionEvidence: [],
      forbiddenInCanon: ['改授亲王或其他爵位', '程宗扬跪接诏书', '提前演出后续剧情'],
      allowedElaboration: '可补足宣诏场面与段文楚解释大都护份量的谈话，不得改写所授官职与勋位。',
    }],
  },
];

function withDefaultLineExtraRailBeats(profiles: CanonRailProfile[]): CanonRailProfile[] {
  return mergeExtraRailBeats(profiles, DEFAULT_LINE_EXTRA_RAIL_BEATS);
}

/** 包 rail 文案里的 {{entity:…}}／{{entityLabel:…}} 在这里解析成名字（编译期已校验实体与标签存在；名字不冻进 catalog）。 */
function withEntityText<T>(value: T): T {
  if (typeof value === 'string') return entityTemplateText(value) as T;
  if (Array.isArray(value)) return value.map(withEntityText) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withEntityText(v)])) as T;
  return value;
}

/**
 * Every source-anchored built-in stage is covered here. Profiles generated
 * from the source axis are deterministic; hand-reviewed profiles above take
 * precedence when a source audit supplied stronger wording or a correction.
 */
// 内容包的 rail（manifest.rails，编译期已校验关、拍、文案）；旧 catalog 没有这一段时为空，编译器自身的导入链也会走到这里
const PACK_RAILS = (CONTENT_PACKS.rails || []).map(withEntityText);
const PACK_STAGE_IDS = new Set(CONTENT_PACKS.stages.map(stage => stage.manifest.id));
const byModId = (a: CanonRailProfile, b: CanonRailProfile) => (a.modId < b.modId ? -1 : a.modId > b.modId ? 1 : 0);
// 包 rail 写了 handReviewed: true 的是搬进包的手审档（塞外，挂内置关；编译期禁止挂包内关）：去掉标记，接在 TS 手审档之后、按包顺序与文件内顺序
const PACK_HAND_REVIEWED = PACK_RAILS.filter(profile => profile.handReviewed === true).map(({ handReviewed: _mark, ...profile }) => profile);

export const CANON_RAIL_PROFILES: CanonRailProfile[] = withDefaultLineExtraRailBeats([
  ...HAND_REVIEWED_CANON_RAIL_PROFILES,
  ...PACK_HAND_REVIEWED,
  // 挂包内关的 rail（秦）排在手审档之后
  ...PACK_RAILS.filter(profile => PACK_STAGE_IDS.has(profile.modId)),
  // 挂内置关的包 rail（生成档搬进包的，如宋 rails.generated.json）与生成档一起按 modId 排：即生成器按关文件名写出的顺序
  ...[...PACK_RAILS.filter(profile => profile.handReviewed !== true && !PACK_STAGE_IDS.has(profile.modId)), ...GENERATED_CANON_RAIL_PROFILES].sort(byModId),
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
