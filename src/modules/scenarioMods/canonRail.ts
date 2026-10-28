import { packText } from '../contentPacks';
import {entityName,entityRecognitionLabel} from './namedEntities';
import {entityText} from './namedEntities';
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
        completionEvidence: [entityName("character","liuchao.character.cheng_zongyang"), entityName("character","lcq.character.duan_qiang"), '紫色雷电'],
        forbiddenInCanon: ['改写穿越原因', '替换同行者', '提前抵达后续地点'],
        allowedElaboration: '可补足机舱异象、坠落后的感官与两人的即时应对；不得另造穿越原因或改写同行者。',
      },
      {
        eventId: 'lcq.event.s01_02',
        mustReach: '段强在异界草原遭半兽人袭击身亡，程宗扬被迫独自求生。',
        completionEvidence: [entityName("character","lcq.character.duan_qiang"), '半兽人', '射杀'],
        forbiddenInCanon: ['段强存活', '段强失踪', '替换死亡结果'],
        allowedElaboration: '可补足遭袭过程、程宗扬的反应与脱险衔接；不得让段强存活、失踪或换成其他结局。',
      },
      {
        eventId: 'lcq.event.s01_03',
        mustReach: '程宗扬在战场与受伤、女扮男装的月霜初遇，冲突由误触其胸部引发。',
        completionEvidence: [entityName("character","lcq.character.yue_shuang"), '初遇', '受伤'],
        forbiddenInCanon: ['提前揭露月霜身世', '提前引入后续人物'],
        allowedElaboration: '可补足战场混乱、彼此误解与短暂协作；不得提前揭露不在场人物的私密背景。',
      },
      {
        eventId: 'lcq.event.s01_04',
        mustReach: '卓云君施救，太乙真宗诸人介入并击退兽蛮，使程宗扬与月霜脱险。',
        completionEvidence: [entityName("character","liuchao.character.zhuo_yunjun"), '兽蛮', '脱险'],
        forbiddenInCanon: ['无关人物获得太乙身份', '改写救援结果'],
        allowedElaboration: '可补足救援过程、战后安置与人物反应；不得把无关人物写成太乙弟子、教御或道门中人。',
      },
      {
        eventId: 'lcq.event.s01_06',
        mustReach: '月霜寒毒危急，真阳进入其体内并压制、化解寒毒。',
        completionEvidence: [entityName("character","lcq.character.yue_shuang"), '寒毒', '真阳'],
        forbiddenInCanon: ['以替代疗法跳过寒毒', '将本拍作废'],
        allowedElaboration: '可补足伤势危机、救治的前因后果与事后关系张力；不得以“作废”或替代疗法跳过此一既定结果。',
      },
      {
        eventId: 'lcq.event.s01_05',
        mustReach: '王哲为程宗扬筑基疗伤，授其九阳神功口诀，程宗扬以自创文字记录。',
        completionEvidence: [entityName("character","lcq.character.wang_zhe"), '筑基', '九阳神功'],
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
        completionEvidence: [entityName("character","lcq.character.wang_zhe"), '锦囊', entityName("character","lcq.character.yue_shuang")],
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
        completionEvidence: [entityName("character","lcq.character.wang_zhe"), '左武', '九阳'],
        forbiddenInCanon: ['王哲存活', '左武军完整撤离', '替代牺牲结果'],
        allowedElaboration: '可补足撤离抉择、战场余波与人物反应；不得跳过王哲的托付与牺牲。',
      },
      {
        eventId: 'lcq.event.s02_04',
        mustReach: '程宗扬在五原城被误认为逃奴，遭殴打并被烙上奴隶印记。',
        completionEvidence: [entityName("location","liuchao.location.wuyuan"), '奴隶', '烙印'],
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
        completionEvidence: [entityName("character","liuchao.character.su_daji"), '囚禁', '霓龙丝'],
        forbiddenInCanon: ['将囚禁直接改写为合作交易', '提前解决商馆冲突'],
        allowedElaboration: '可补足对话试探、商馆氛围和信息博弈；不得替程宗扬直接脱身。',
      },
      {
        eventId: 'lcq.event.ningyu_enters_gamble',
        mustReach: '凝羽奉苏妲己之命进入赌局，程宗扬当面认清她被差遣入局的处境。',
        completionEvidence: [entityName("character","liuchao.character.ning_yu"), entityName("character","liuchao.character.su_daji"), '打赌'],
        forbiddenInCanon: ['改写凝羽入局的主使', '把凝羽写成被卖之人', '提前写成卖身契已签'],
        allowedElaboration: '可补足差遣当场、试装入局与程宗扬的当面回应；不得预写落败签契，也不得改写入局主使。',
      },
      {
        eventId: 'lcq.event.sudaji_south_pact',
        mustReach: '程宗扬与苏妲己订下三个月内赴南荒采集霓龙丝、逾期受炮烙的约定。',
        completionEvidence: ['霓龙丝', entityName("ending","lcq.ending.death.paolao"), '南荒'],
        forbiddenInCanon: ['改写三个月期限', '取消炮烙违约后果', '把霓龙丝产地写成已核实的世界事实'],
        allowedElaboration: '可补足谈判语气、期限与炮烙威胁的当场压力；不得改写约定本身，也不得把程宗扬的产地说辞坐实为已探明的产地。',
      },
      {
        eventId: 'lcq.event.gamble_bond_signed',
        mustReach: '苏妲己作弊加速刻香，程宗扬赌局落败，被迫签下卖身契，成为白湖商馆奴隶。',
        completionEvidence: ['刻香', '卖身契', entityName("character","liuchao.character.su_daji")],
        forbiddenInCanon: ['改写落败结果', '把卖身契写成凝羽被卖', '让旁人代签或赌局作废'],
        allowedElaboration: '可补足刻香计时、作弊迹象与签字现场；不得把被卖之人改成凝羽，也不得让程宗扬赢下此局。',
      },
      {
        eventId: 'lcq.event.charge_sudaji_fee',
        mustReach: '程宗扬在帮苏妲己取出器物前，谈定并预支六十金铢报酬。',
        completionEvidence: ['六十金铢', entityName("character","liuchao.character.su_daji"), '工钱'],
        forbiddenInCanon: ['改写六十金铢数额', '改写成先帮忙后空口赊账', '提前扩写南荒行程'],
        allowedElaboration: '可补足开价、写条据与取物前后的拉扯；不得改写先定价再动手的顺序。',
      },
      {
        eventId: 'lcq.event.free_ajiman',
        mustReach: '程宗扬取得阿姬曼身契并当面撕毁，随即遭遇出城路线被女侍卫搜查。',
        completionEvidence: [entityRecognitionLabel('character','liuchao.character.a_jiman_bana','short'), '身契', '撕毁'],
        forbiddenInCanon: ['改写撕契还自由的结果', '把阿姬曼写成已被卖走或处死', '跳过身契这一步'],
        allowedElaboration: '可补足五十金铢赎买、当面撕契与发现搜查后的改道；不得把撕契写成未发生。',
      },
      {
        eventId: 'lcq.event.baihu_shangguan_escape',
        mustReach: '程宗扬从白湖商馆脱身出馆，在女侍卫搜查下改道躲避，人仍留在五原城内。',
        completionEvidence: ['女侍卫', '搜查', entityRecognitionLabel('location','liuchao.location.wuyuan','short')],
        forbiddenInCanon: ['让程宗扬当场被抓回商馆死局', '提前写成已出五原城南下', '改写成与苏妲己和解离馆'],
        allowedElaboration: '可补足出馆路线、搜查气氛与改道藏匿；不得写成已离开五原城，也不得让商馆死局未解。',
      },
      {
        eventId: 'lcq.event.wuerlang_joins',
        mustReach: '武二郎去而复返后当面答应加入程宗扬的南荒队伍。',
        completionEvidence: ['南荒', '两银铢', entityName("character","liuchao.character.wu_er_lang")],
        forbiddenInCanon: ['让武二郎拒绝入队并离开', '替换南荒同行者', '把此前解铐写成已经随行'],
        allowedElaboration: '可补足先前否认同行、压价与当面应诺；不得跳过他一度拒约、被迫返回才入队的结果。',
      },
      {
        eventId: 'lcq.event.iron_bridge_ambush',
        mustReach: '程宗扬稳住武二郎伤势，商队在铁索桥遭伏击后脱困续行。',
        completionEvidence: ['铁索桥', entityName("character","liuchao.character.wu_er_lang"), entityName("character","liuchao.character.ning_yu")],
        forbiddenInCanon: ['改写伏击未发生', '让武二郎死在桥上', '跳过伤势与桥上冲突'],
        allowedElaboration: '可补足疗伤、桥头争夺与突围过程；不得改写商队在此桥遇伏、武二郎带伤随行的结果。',
      },
      {
        eventId: 'lcq.event.ningyu_regicide_offer',
        mustReach: '凝羽私下向程宗扬提出合作除掉苏妲己，并揭开体内阴寒之气来自西门庆。',
        completionEvidence: [entityName("character","liuchao.character.ning_yu"), '除掉苏妲己', entityName("character","liuchao.character.xi_men_qing")],
        forbiddenInCanon: ['把提议写成已经弑主成功', '改写阴寒来源', '提前扩写苏妲己之死'],
        allowedElaboration: '可补足私下开价、双修探查与她自述旧事；不得把尚未执行的弑主写成既成事实。',
      },
      {
        eventId: 'lcq.event.zixi_taiyi_intercept',
        mustReach: '太乙真宗在紫溪拦截白湖船队，程宗扬被迫现身交涉，祁远被推落水中。',
        completionEvidence: [entityName("location","nh.zixi"), '元行健', entityName("character","liuchao.character.qi_yuan")],
        forbiddenInCanon: ['改写拦船未发生', '让船队被太乙接管', '让祁远在本拍失踪不归'],
        allowedElaboration: '可补写船头交涉、落水与救回船上；不得改写太乙拦船与程宗扬必须出面的结果。',
      },
      {
        eventId: 'lcq.event.rainforest_black_shoal',
        mustReach: '商队承受雨林伤亡后，依凝羽岸边火堆指引，白湖与云氏两支商队渡过黑石滩。',
        completionEvidence: ['黑石滩', entityName("character","liuchao.character.ning_yu"), '火堆'],
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
  {
    // 秦线（五线补全·秦 Q-1–Q-17、Q-23，2026-10-28）：全部为扩写，不挂原著轴；内容包关（packs/qingyu/stage-qin-xianyang.json）。
    // 第三幕 Q-18–Q-22（推翻结局）待用户拍板 Q2，拍板后插在 qin_close_default 之前，收束改为二选一。
    id: 'qin.xianyang',
    modId: 'lyg.qin_xianyang',
    chapterId: 'lyg.chapter.qin_xianyang_prologue',
    orderedEventIds: [
      'liuchao.event.qin_hook_fangshi_rumor',
      'liuchao.event.qin_enter_xianyang',
      'liuchao.event.qin_find_xu',
      'liuchao.event.qin_entry_camp',
      'liuchao.event.qin_king_refuses',
      'liuchao.event.qin_xu_auspice',
      'liuchao.event.qin_new_year_banquet',
      'liuchao.event.qin_palace_sealed',
      'liuchao.event.qin_succession_fight',
      'liuchao.event.qin_purge_hunted',
      'liuchao.event.qin_heimohai_message',
      'liuchao.event.qin_xiaoling_villa',
      'liuchao.event.qin_bo_family',
      'liuchao.event.qin_close_default',
    ],
    contracts: [
      {
        eventId: 'liuchao.event.qin_hook_fangshi_rumor',
        mustReach: packText("qin.rail.text.1"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.2"), packText("qin.rail.text.3")],
        allowedElaboration: packText("qin.rail.text.4"),
      },
      {
        eventId: 'liuchao.event.qin_enter_xianyang',
        mustReach: packText("qin.rail.text.5"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.6"), packText("qin.rail.text.7")],
        allowedElaboration: packText("qin.rail.text.8"),
      },
      {
        eventId: 'liuchao.event.qin_find_xu',
        mustReach: packText("qin.rail.text.9"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.10"), packText("qin.rail.text.11"), packText("qin.rail.text.12")],
        allowedElaboration: packText("qin.rail.text.13"),
      },
      {
        eventId: 'liuchao.event.qin_entry_camp',
        mustReach: packText("qin.rail.text.14"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.15"), packText("qin.rail.text.16"), packText("qin.rail.text.17")],
        allowedElaboration: packText("qin.rail.text.18"),
      },
      {
        eventId: 'liuchao.event.qin_king_refuses',
        mustReach: packText("qin.rail.text.19"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.20"), packText("qin.rail.text.21"), packText("qin.rail.text.22")],
        allowedElaboration: packText("qin.rail.text.23"),
      },
      {
        eventId: 'liuchao.event.qin_xu_auspice',
        mustReach: packText("qin.rail.text.24"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.25"), packText("qin.rail.text.26"), packText("qin.rail.text.27")],
        allowedElaboration: packText("qin.rail.text.28"),
      },
      {
        eventId: 'liuchao.event.qin_new_year_banquet',
        mustReach: packText("qin.rail.text.29"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.30"), packText("qin.rail.text.31"), packText("qin.rail.text.32")],
        allowedElaboration: packText("qin.rail.text.33"),
      },
      {
        eventId: 'liuchao.event.qin_palace_sealed',
        mustReach: packText("qin.rail.text.34"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.35"), packText("qin.rail.text.36"), packText("qin.rail.text.37")],
        allowedElaboration: packText("qin.rail.text.38"),
      },
      {
        eventId: 'liuchao.event.qin_succession_fight',
        mustReach: packText("qin.rail.text.39"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.40"), packText("qin.rail.text.41"), packText("qin.rail.text.42")],
        allowedElaboration: packText("qin.rail.text.43"),
      },
      {
        eventId: 'liuchao.event.qin_purge_hunted',
        mustReach: packText("qin.rail.text.44"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.45"), packText("qin.rail.text.46"), packText("qin.rail.text.47")],
        allowedElaboration: packText("qin.rail.text.48"),
      },
      {
        eventId: 'liuchao.event.qin_heimohai_message',
        mustReach: packText("qin.rail.text.49"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.50"), packText("qin.rail.text.51"), packText("qin.rail.text.52")],
        allowedElaboration: packText("qin.rail.text.53"),
      },
      {
        eventId: 'liuchao.event.qin_xiaoling_villa',
        mustReach: packText("qin.rail.text.54"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.55"), packText("qin.rail.text.56"), packText("qin.rail.text.57")],
        allowedElaboration: packText("qin.rail.text.58"),
      },
      {
        eventId: 'liuchao.event.qin_bo_family',
        mustReach: packText("qin.rail.text.59"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.60"), packText("qin.rail.text.61")],
        allowedElaboration: packText("qin.rail.text.62"),
      },
      {
        eventId: 'liuchao.event.qin_close_default',
        mustReach: packText("qin.rail.text.63"),
        completionEvidence: [],
        forbiddenInCanon: [packText("qin.rail.text.64"), packText("qin.rail.text.65"), packText("qin.rail.text.66")],
        allowedElaboration: packText("qin.rail.text.67"),
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
  // 晋线补全（剧情策划 2026-10-28 五线补全·晋 J1–J6；用户 2026-10-28 01:26 授权）：原欠账拍按原著序挂章上 rail。
  {
    modId: 'lcq.stage_07_qingyuan_jiankang',
    afterEventId: 'lcq.event.s07_02_kill_wu',
    eventIds: ['lcq.event.wangzhe_letter'],
    contracts: [{
      eventId: 'lcq.event.wangzhe_letter',
      mustReach: '斩吴行德后，程宗扬在清远玄真观以水浸开王哲锦囊里的空白信笺，读到王哲委托他清理太乙真宗门户。',
      completionEvidence: [],
      forbiddenInCanon: ['信中写明掌教之位传给谁', '信中给程宗扬师徒名分或信物', '提前演出后续剧情'],
      allowedElaboration: '可补足显字过程与程宗扬读信时的反应，不得替王哲补写信中没有的名分。',
    }],
  },
  {
    modId: 'lcq.stage_07_qingyuan_jiankang',
    afterEventId: 'lcq.event.s07_03_xiaozi_appears',
    eventIds: ['lcq.event.palace_haunting_rumor', 'lcq.event.jin_panjiang_shaozhu'],
    contracts: [
      {
        eventId: 'lcq.event.palace_haunting_rumor',
        mustReach: '程宗扬用灵飞镜窥探宫城，撞见可疑大汉从假山钻出并被察觉，宫禁闹鬼的传闻传开。',
        completionEvidence: [],
        forbiddenInCanon: ['点破假山大汉的身份与来历', '提前演出后续剧情'],
        allowedElaboration: '可补足窥镜所见与传闻在建康的传播，不得提前揭开闹鬼底下的真相。',
      },
      {
        eventId: 'lcq.event.jin_panjiang_shaozhu',
        mustReach: '云家宴席僵局中程宗扬起身解围，云家主人当众称他是「盘江程氏的少主」，一向在南方。',
        completionEvidence: [],
        forbiddenInCanon: ['改由程宗扬自封名头', '提前演出后续剧情'],
        allowedElaboration: '可补足宴席众人的反应与名头在世家间传开的过程。',
      },
    ],
  },
  {
    modId: 'lcq.stage_08_jiankang_coup',
    afterEventId: 'lcq.event.s08_06_pursuit_repelled',
    eventIds: ['lcq.event.palm_oath_shanghou'],
    contracts: [{
      eventId: 'lcq.event.palm_oath_shanghou',
      mustReach: '程宗扬向萧遥逸透露秦桧等人与黑魔海毒宗的关系，萧遥逸承诺不与殇侯为敌，双方击掌立约。',
      completionEvidence: [],
      forbiddenInCanon: ['萧遥逸拒绝立约', '提前演出后续剧情'],
      allowedElaboration: '可补足两人谈殇侯、议合作的对话与击掌前后的过渡。',
    }],
  },
  {
    modId: 'lcq.stage_09_trade_and_escape',
    beforeEventId: 'lcq.event.s09_01_eight_steeds_leave',
    eventIds: ['lcq.event.spoils_split'],
    contracts: [{
      eventId: 'lcq.event.spoils_split',
      mustReach: '宫变后分赃落定：王茂弘、谢安等各方妥协，萧家获江、宁二州，云家得盐业，程宗扬一无所得。',
      completionEvidence: [],
      forbiddenInCanon: ['程宗扬分得州郡或盐利', '提前演出后续剧情'],
      allowedElaboration: '可补足分赃名单的来由与程宗扬的反应，不得改写分赃结果。',
    }],
  },
  {
    modId: 'lcq.stage_09_trade_and_escape',
    afterEventId: 'lcq.event.s09_01_eight_steeds_leave',
    eventIds: ['lcq.event.xiangfu_stance'],
    contracts: [{
      eventId: 'lcq.event.xiangfu_stance',
      mustReach: '程宗扬当面问清王茂弘：相府此刻站在哪一边。王茂弘阐述无为而治，愿让权于萧侯等年轻人，并承诺保晋国二十年太平。',
      completionEvidence: [],
      forbiddenInCanon: ['王茂弘倒向某一家争权', '提前演出后续剧情'],
      allowedElaboration: '可补足相府会面的场景与问答，不得改写王茂弘的立场。',
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
  // 宋线补全（剧情策划 2026-10-28 五线补全·宋 S1–S30；用户 2026-10-28 01:26 授权）：原欠账拍按原著序挂章上 rail。
  // 排序：按 axisSeq，同 seq 按原著行序（yly／qyj）；S1 风波亭（556）排在尾随李师师（555）之前——原著 766→795，
  // 尾随的主轴改绑 yunlong.6.1 仍按 R-14 暂缓，这里只做「抵达后才触发」的过渡前置。
  {
    modId: 'lcq.stage_10_jiangzhou_shadow_war',
    afterEventId: 'lcq.event.s10_02_yeying_pass',
    eventIds: ['lcq.event.yeying_seat_struggle'],
    contracts: [{
      eventId: 'lcq.event.yeying_seat_struggle',
      mustReach: '程宗扬在夜影关听清：蔺采泉与商乐轩表面追查卓云君叛教，实则在争太乙掌教之位。',
      completionEvidence: [],
      forbiddenInCanon: ['让掌教之争在本拍分出胜负', '提前演出后续剧情'],
      allowedElaboration: '可补足夜影关见闻与两人言语间的机锋，不得提前定下掌教人选。',
    }],
  },
  {
    modId: 'lcq.stage_12_jiangzhou_counterwar',
    afterEventId: 'lcq.event.s12_03_xiaozi_controls_zhuo',
    eventIds: ['lcq.event.jin_vacate_jiangzhou'],
    contracts: [{
      eventId: 'lcq.event.jin_vacate_jiangzhou',
      mustReach: '晋国丞相与重臣定计腾出江州，让宋军入境剿星月湖，不惜毁城应对。',
      completionEvidence: [],
      forbiddenInCanon: ['晋廷出兵护江州', '提前演出后续剧情'],
      allowedElaboration: '可补足消息传到江州的经过与众人的反应，不得改写晋廷让地的决定。',
    }],
  },
  {
    modId: 'lcq.stage_12_jiangzhou_counterwar',
    afterEventId: 'lcq.event.s12_04_river_granary',
    eventIds: ['lcq.event.tuntian_post'],
    contracts: [{
      eventId: 'lcq.event.tuntian_post',
      mustReach: '滕甫赞赏程宗扬的义举，为他捐官屯田司员外郎；程宗扬接下职位，把籍贯落进册。',
      completionEvidence: [],
      forbiddenInCanon: ['改授团练等别的官职', '把员外郎写成实权要职', '提前演出后续剧情'],
      allowedElaboration: '可补足滕甫推官、秦桧比较品秩与落籍的过程，不得改写所授官职。',
    }],
  },
  {
    modId: 'lcq.stage_12_jiangzhou_counterwar',
    afterEventId: 'lcq.event.s12_13_long_siege',
    eventIds: ['lcq.event.pengyi_takeover'],
    contracts: [{
      eventId: 'lcq.event.pengyi_takeover',
      mustReach: '程宗扬取得孟非卿许可，全盘接管鹏翼社及星月湖大营暗中操控的产业。',
      completionEvidence: [],
      forbiddenInCanon: ['孟非卿拒绝入股或收回产业', '提前演出后续剧情'],
      allowedElaboration: '可补足营帐内谈入股与交接产业的细节，不得改写接管结果。',
    }],
  },
  {
    modId: 'lyl.lin_an_bridge',
    beforeEventId: 'lyl.event.lin_an_bridge_01_beat',
    eventIds: [
      'lyl.event.linan_arrive_fengbo',
      'lyl.event.tail_li_shishi',
      'lyl.event.survey_wumu_mansion',
      'lyl.event.evade_huangchengsi',
      'lyl.event.mingqingsi_lin_lu_meeting',
      'lyl.event.decode_bianmenwa_note',
      'lyl.event.weiyuan_extortion',
      'lyl.event.libu_registration',
      'lyl.event.meet_xue_yanshan',
      'lyl.event.blacksea_iron_puppet',
      'lyl.event.identify_xue_cold_poison',
      'lyl.event.leifeng_pagoda_invite',
    ],
    contracts: [
      {
        eventId: 'lyl.event.linan_arrive_fengbo',
        mustReach: '程宗扬一行由钱塘门进入临安，途经风波亭后赶往落脚处；熟识谢艺时在亭后谢艺墓前上香叩首，未识谢艺不出谢艺；谢艺长养线不得出现谢艺墓。',
        completionEvidence: [],
        forbiddenInCanon: ['拜祭岳鹏举的空坟', '谢艺长养线出现谢艺墓或空墓冒充已葬', '提前演出后续剧情'],
        allowedElaboration: '可补足入城所见、风波亭的冷落与众人致意，不得改写死／生真值。',
      },
      {
        eventId: 'lyl.event.tail_li_shishi',
        mustReach: '程宗扬尾随李师师的马车至威远镖局，确认她为何突然返回临安。',
        completionEvidence: [],
        forbiddenInCanon: ['与李师师当面相认', '提前演出后续剧情'],
        allowedElaboration: '可补足沿街尾随与打听镖局底细，不得把她回家的缘故改成别的。',
      },
      {
        eventId: 'lyl.event.survey_wumu_mansion',
        mustReach: '程宗扬绕武穆王府查清建筑方位，不惊动周边暗梢。',
        completionEvidence: [],
        forbiddenInCanon: ['当场潜入王府', '提前演出后续剧情'],
        allowedElaboration: '可补足王府封条与府内楼阁的外观，不得写入府所见。',
      },
      {
        eventId: 'lyl.event.evade_huangchengsi',
        mustReach: '程宗扬识破皇城司尾随，不动手，以富商身份掩护行踪进入明庆寺。',
        completionEvidence: [],
        forbiddenInCanon: ['与盯梢者动手', '提前演出后续剧情'],
        allowedElaboration: '可补足买香、拜佛与寺中僧人的市侩，不得暴露真实身份。',
      },
      {
        eventId: 'lyl.event.mingqingsi_lin_lu_meeting',
        mustReach: '程宗扬在明庆寺菜园外旁观鲁智深倒拔垂杨柳、林冲上前通名，判断时机未到，没有贸然结交便离寺。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍与林冲或鲁智深结交', '提前演出后续剧情'],
        allowedElaboration: '可补足拔柳场面与两人通名，不得让程宗扬当场露面结识。',
      },
      {
        eventId: 'lyl.event.decode_bianmenwa_note',
        mustReach: '程宗扬解读祈福榜上的接头暗号，并答复薛延山的会面请求。',
        completionEvidence: [],
        forbiddenInCanon: ['点破线人的真实身份', '提前演出后续剧情'],
        allowedElaboration: '可补足字条内容与秦桧的进言，不得提前写出会面结果。',
      },
      {
        eventId: 'lyl.event.weiyuan_extortion',
        mustReach: '程宗扬听取俞子元的调查，确认高衙内勒索威远镖局的条件。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬替威远镖局出头顶下这桩事', '提前演出后续剧情'],
        allowedElaboration: '可补足失镖来由与高衙内的来历，不得改写勒索条件。',
      },
      {
        eventId: 'lyl.event.libu_registration',
        mustReach: '程宗扬完成吏部报到，查明林冲调走了哪些档案。',
        completionEvidence: [],
        forbiddenInCanon: ['在吏部与林冲翻脸', '提前演出后续剧情'],
        allowedElaboration: '可补足报到过场与打点书吏，不得改写林冲调档的事实。',
      },
      {
        eventId: 'lyl.event.meet_xue_yanshan',
        mustReach: '程宗扬在西湖农居听完薛延山讲述太湖遇袭，并接下照管雪隼残部的托付。',
        completionEvidence: [],
        forbiddenInCanon: ['点破袭击者身份', '让薛延山在本拍伤愈', '提前演出后续剧情'],
        allowedElaboration: '可补足农居见面与遇袭经过，不得提前写出薛延山的结局。',
      },
      {
        eventId: 'lyl.event.blacksea_iron_puppet',
        mustReach: '程宗扬人在临安，经水镜看见江州场外铁傀儡重创虎翼军，小紫取走龙睛玉并抽取一名军官阴魂试驱傀儡。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬亲临江州', '点破同行老者的身份', '提前演出后续剧情'],
        allowedElaboration: '可补足水镜里的战场与小紫的举动，不得改写战果。',
      },
      {
        eventId: 'lyl.event.identify_xue_cold_poison',
        mustReach: '程宗扬检查薛延山身上的寒毒，并确认他是否见过鬼牙。',
        completionEvidence: [],
        forbiddenInCanon: ['当场解去寒毒', '提前演出后续剧情'],
        allowedElaboration: '可补足诊脉与比对鬼牙的过程，不得写成已经治愈。',
      },
      {
        eventId: 'lyl.event.leifeng_pagoda_invite',
        mustReach: '程宗扬应李师师之邀，与她一同登上雷峰塔。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就与高衙内冲突', '提前演出后续剧情'],
        allowedElaboration: '可补足雷峰夕照与塔上闲谈，不得提前写出后续冲突。',
      },
    ],
  },
  {
    modId: 'lyl.lin_an_bridge',
    afterEventId: 'lyl.event.lin_an_bridge_01_beat',
    eventIds: ['lyl.event.leifeng_repel_gao'],
    contracts: [{
      eventId: 'lyl.event.leifeng_repel_gao',
      mustReach: '程宗扬在雷峰塔阻止陆谦强带走李师师，逼高衙内一行退走。',
      completionEvidence: [],
      forbiddenInCanon: ['当场重伤或杀死高衙内', '提前演出后续剧情'],
      allowedElaboration: '可补足陆谦出手与秦桧解围的细节，不得改写高衙内退走的结果。',
    }],
  },
  {
    modId: 'lyl.lin_an_bridge',
    afterEventId: 'lyl.event.lin_an_bridge_02_beat',
    eventIds: ['lyl.event.decide_chase_weiyuan'],
    contracts: [{
      eventId: 'lyl.event.decide_chase_weiyuan',
      mustReach: '程宗扬与秦桧复盘雷峰塔冲突，决定继续调查威远失镖。',
      completionEvidence: [],
      forbiddenInCanon: ['本拍查出劫镖之人', '提前演出后续剧情'],
      allowedElaboration: '可补足车中议论与对光明观堂的分析，不得提前揭开失镖真相。',
    }],
  },
  {
    modId: 'lyl.lin_an_bridge',
    afterEventId: 'lyl.event.lin_an_bridge_03_beat',
    eventIds: ['lyl.event.pass_kotian_stone'],
    contracts: [{
      eventId: 'lyl.event.pass_kotian_stone',
      mustReach: '程宗扬看过朝天门下的叩天石，按暗号约定前往便门瓦。',
      completionEvidence: [],
      forbiddenInCanon: ['取走叩天石上的剑', '提前演出后续剧情'],
      allowedElaboration: '可补足剑铭与秦桧的议论，不得改写去便门瓦的约定。',
    }],
  },
  {
    modId: 'lyl.lin_an_bridge',
    afterEventId: 'lyl.event.lin_an_bridge_04_beat',
    eventIds: ['lyl.event.ivory_visit_weiyuan', 'lyl.event.siying_lane_saber_ambush'],
    contracts: [
      {
        eventId: 'lyl.event.ivory_visit_weiyuan',
        mustReach: '程宗扬以押运象牙为名试探李寅臣夫妇，查明他们对李师师婚事的决定。',
        completionEvidence: [],
        forbiddenInCanon: ['当场替李师师退婚', '提前演出后续剧情'],
        allowedElaboration: '可补足登门送礼与阮香琳的言谈，不得改写夫妇俩的决定。',
      },
      {
        eventId: 'lyl.event.siying_lane_saber_ambush',
        mustReach: '程宗扬在司营巷旁观林冲买刀并确认伏击结果，不贸然打断高衙内的布局。',
        completionEvidence: [],
        forbiddenInCanon: ['出手打断买刀或伏击', '提前演出后续剧情'],
        allowedElaboration: '可补足卖刀汉子与林冲的交易，不得改写伏击结果。',
      },
    ],
  },
  {
    modId: 'lyl.xiaoyingzhou_blacksea_trap',
    beforeEventId: 'lyl.event.xiaoyingzhou_blacksea_trap_01_beat',
    eventIds: ['lyl.event.linjia_sees_ningyi', 'lyl.event.xihu_villa_eavesdrop'],
    contracts: [
      {
        eventId: 'lyl.event.linjia_sees_ningyi',
        mustReach: '程宗扬在林家认出凝姨就是阮香凝，发现她与成婚多年的表象不符，怀疑她与黑魔海有关。',
        completionEvidence: [],
        forbiddenInCanon: ['坐实阮香凝的黑魔海身份', '提前演出后续剧情'],
        allowedElaboration: '可补足林家作客的场面，疑点只记下不点破。',
      },
      {
        eventId: 'lyl.event.xihu_villa_eavesdrop',
        mustReach: '程宗扬潜入西湖别业，从梁上听见高衙内与陆谦复盘失镖圈套，并确认他们还要继续设计林冲。',
        completionEvidence: [],
        forbiddenInCanon: ['当场现身阻止', '提前演出后续剧情'],
        allowedElaboration: '可补足循车辙追踪与梁上所闻，不得改写密谋内容。',
      },
    ],
  },
  {
    modId: 'lyl.xiaoyingzhou_blacksea_trap',
    afterEventId: 'lyl.event.xiaoyingzhou_blacksea_trap_02_beat',
    eventIds: [
      'lyl.event.xiaoyingzhou_paper_plan',
      'lyl.event.xiaoyingzhou_paper_mint',
      'lyl.event.xiaoyingzhou_lin_takes_seat',
      'lyl.event.song_baochao_appointed',
    ],
    contracts: [
      {
        eventId: 'lyl.event.xiaoyingzhou_paper_plan',
        mustReach: '程宗扬在多宝阁与贾师宪会面，贾师宪提出发行纸币，程宗扬要求纸币能纳税、发行数量须经认可。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬拒绝推纸币', '提前演出后续剧情'],
        allowedElaboration: '可补足会面的讨价还价，不得改写两项条件。',
      },
      {
        eventId: 'lyl.event.xiaoyingzhou_paper_mint',
        mustReach: '程宗扬由童贯引见入宫觐见宋主，宋主同意纸币用于缴纳赋税，并要求双方共同监制。',
        completionEvidence: [],
        forbiddenInCanon: ['纸币由程宗扬独自发行', '提前演出后续剧情'],
        allowedElaboration: '可补足觐见过程与宋主的问答，不得改写共同监制的安排。',
      },
      {
        eventId: 'lyl.event.xiaoyingzhou_lin_takes_seat',
        mustReach: '蔺采泉在临安鹤林观宣布继承太乙真宗掌教，秋少君填补齐放鹤空缺出任教御。',
        completionEvidence: [],
        forbiddenInCanon: ['改由他人继任掌教', '提前演出后续剧情'],
        allowedElaboration: '可补足鹤林观的仪式与在场众人，不得改写继任结果。',
      },
      {
        eventId: 'lyl.event.song_baochao_appointed',
        mustReach: '户部新设宝钞局，宋主亲笔点程宗扬以屯田司员外郎兼任宝钞局主事，诏旨下达。',
        completionEvidence: [],
        forbiddenInCanon: ['改封宝钞使或别的官名', '把宝钞局写成有衙门的实权机构', '提前演出后续剧情'],
        allowedElaboration: '可补足消息先一步传来与诏书送到的经过，不得改写所授差使。',
      },
    ],
  },
  {
    modId: 'lyl.xiaoyingzhou_blacksea_trap',
    afterEventId: 'lyl.event.xiaoyingzhou_blacksea_trap_10_beat',
    eventIds: ['lyl.event.xiaoyingzhou_cement_truce'],
    contracts: [{
      eventId: 'lyl.event.xiaoyingzhou_cement_truce',
      mustReach: '程宗扬与剑玉姬在丰乐楼谈定：黑魔海获晴州水泥五年代理权，承诺五年不踏入宋国。',
      completionEvidence: [],
      forbiddenInCanon: ['谈判破裂', '黑魔海就此退出六朝', '提前演出后续剧情'],
      allowedElaboration: '可补足丰乐楼的交锋与齐羽仙的威胁，不得改写协议条款。',
    }],
  },
  {
    modId: 'lyl.taiquan_sacred_fruit',
    afterEventId: 'lyl.event.taiquan_sacred_fruit_03',
    eventIds: ['lyl.event.sacred_against_lin', 'lyl.event.sacred_jin_drought'],
    contracts: [
      {
        eventId: 'lyl.event.sacred_against_lin',
        mustReach: '程宗扬在翠微园向卓云君承诺对付现任掌教蔺采泉，并写下盘江程氏的股份分配。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就对蔺采泉动手', '提前演出后续剧情'],
        allowedElaboration: '可补足两人的讨论与股份的写法，不得改写承诺内容。',
      },
      {
        eventId: 'lyl.event.sacred_jin_drought',
        mustReach: '程宗扬与张少煌会面，得知晋国大旱与王茂弘的意图，决定全力收粮，并把建康当成营销中心来做。',
        completionEvidence: [],
        forbiddenInCanon: ['改为放弃晋国粮市', '提前演出后续剧情'],
        allowedElaboration: '可补足会面与收粮的盘算，不得改写决定。',
      },
    ],
  },
  // 汉线补全（剧情策划 2026-10-28 五线补全·汉 H1–H20；用户 2026-10-28 01:26 授权）：欠账拍按原著序挂章上 rail，新建拍同上 rail。
  // 排序：按 axisSeq，同 seq 按原著行序（yly）——718：H1 抵舞都 22618 → 云如瑶私奔 22934；898：赏格争胡骑 47300 → 回绝剑玉姬 47483。
  // H17 汉宫真空（901）、H18 是否拥立（902）是「没亲历宫变之夜」的条件拍（conditions 取反），只挂汉宫突入章、不上 rail。
  {
    modId: 'lyl.taiquan_afterfall',
    beforeEventId: 'lyl.event.taiquan_afterfall_06_beat',
    eventIds: ['lyl.event.han_shouyang_gaoyanei'],
    contracts: [{
      eventId: 'lyl.event.han_shouyang_gaoyanei',
      mustReach: '程宗扬下首阳山，在山脚与冯源、哈迷蚩、青面兽和高智商一行会合，得知此地是汉国首阳山，随即赶往舞都。',
      completionEvidence: [],
      forbiddenInCanon: ['在首阳山脚久留不去舞都', '本拍就见到云如瑶', '提前演出后续剧情'],
      allowedElaboration: '可补足下山所见、山棚里的重逢与赶路，不得改写会合的人与去向。',
    }],
  },
  {
    modId: 'lyl.taiquan_afterfall',
    afterEventId: 'lyl.event.taiquan_afterfall_07_beat',
    eventIds: ['lyl.event.han_wudu_bingsi', 'lyl.event.jin_guangyuan_ledger'],
    contracts: [
      {
        eventId: 'lyl.event.han_wudu_bingsi',
        mustReach: '云如瑶决定亲自去七里坊游冶台对面的饼肆做工，程宗扬下灶和面蒸饼、拉高智商打下手，帮她把饼肆撑起来。',
        completionEvidence: [],
        forbiddenInCanon: ['程宗扬劝住云如瑶不去饼肆', '提前演出后续剧情'],
        allowedElaboration: '可补足和面蒸饼的忙乱与饼肆外的人潮，不得改写云如瑶做饼的决定。',
      },
      {
        eventId: 'lyl.event.jin_guangyuan_ledger',
        mustReach: '程宗扬把广源行在晋国的旧账揭开，对上龙宸这条线。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就与龙宸正面交手', '提前演出后续剧情'],
        allowedElaboration: '可补足翻查旧账的经过，不得改写账目指向龙宸的结论。',
      },
    ],
  },
  {
    modId: 'lyl.taiquan_afterfall',
    afterEventId: 'lyl.event.taiquan_afterfall_09_beat',
    eventIds: ['lyl.event.han_court_grain_blame'],
    contracts: [{
      eventId: 'lyl.event.han_court_grain_blame',
      mustReach: '汉廷朝会上御史王温舒攻击丞相韦玄成，左武军粮草因此不继；程宗扬追问究竟是谁的责任。',
      completionEvidence: [],
      forbiddenInCanon: ['本拍就定下罪责', '提前演出后续剧情'],
      allowedElaboration: '可补足朝会上的争执与打听来的内情，不得改写粮草不继的起因。',
    }],
  },
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
        mustReach: '程宗扬一行赴唐途中在山中小镇留仙坪的留仙客栈歇脚，撞见周族少主周飞一伙与同行的廖群玉，程宗扬留在镇上盯着他们。',
        completionEvidence: [],
        forbiddenInCanon: ['与周飞当场结仇动手', '本拍就点破老相士的来历', '提前演出后续剧情'],
        allowedElaboration: '可补足翻山赶路、客栈里的人与白员外遇狐的传说，不得改写同住客栈的这几伙人。',
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
        mustReach: '袁天罡向程宗扬透露番僧在猎杀穿越者。',
        completionEvidence: [],
        forbiddenInCanon: ['本拍就与番僧交手', '提前演出后续剧情'],
        allowedElaboration: '可补足袁天罡讲述时的忌惮与程宗扬的追问，不得改写番僧猎杀穿越者这件事。',
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
