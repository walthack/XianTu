#!/usr/bin/env node

// R2-11S：按 EPUB《六朝清羽记》第18–36章重建 lcq.stage_03。
// 保留十个冻结 event id；为原稿完全遗漏的第33–36章过渡 append-only 补三拍。
// 本脚本只纠正来源、目标、投影和人工完成合同，不解除默认线隔离。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash/qingyu');
const stagePath = join(generated, 'stages/lcq.stage_03.json');
const supportStagePath = join(generated, 'stages/lcq.stage_03b_snake_flower_bridge.json');
const stagePlanPath = join(generated, 'stage-plan.json');
const backupDir = join(generated, 'stages-pre-r2-11s-source-rebuild-backup');
const backupPath = join(backupDir, 'lcq.stage_03.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};
const action = (id, label, actionText, options = {}) => ({ id, label, actionText, timeCost: 1, outcomeText, ...options });
const contract = actions => ({ kind: 'objective_action', settleOn: ['success'], actions });

const EVENTS = [
  {
    id: 'lcq.event.s03_01', name: '与苏妲己订下南荒之约',
    description: '程宗扬被苏妲己识破并囚禁后，以霓龙丝线索自保；双方约定三个月内赴南荒寻找霓龙丝，程宗扬颈后的奴隶烙印也被确认。',
    objective: '以霓龙丝线索保住性命，并听清三个月南荒之约',
    locationId: 'liuchao.location.baihu_shang_guan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_daji', 'liuchao.character.ning_yu'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.20.2', axisSeq: 36, axisAnchor: '六朝清羽记·#20·第18章·妲己',
    axisBeat: '程宗扬谎称掌握霓龙丝产地，与苏妲己约定三个月内前往南荒采集霓龙丝；其颈后奴隶烙印被确认。', axisMethod: 'source-rebuilt',
    actions: [
      action('offer_nylon_clue', '以霓龙丝线索自保', '我不与苏妲己硬拼，明确以自己掌握的霓龙丝线索换取活命和行动期限。', { kind: 'prepare', grantsPreparation: 'nylon_bargain_opened' }),
      action('accept_three_month_terms', '听清三个月期限', '我确认三个月内赴南荒寻找霓龙丝的条件、失败代价和颈后烙印现状，把约定记清。', { requiresPreparation: ['nylon_bargain_opened'] }),
    ],
  },
  {
    id: 'lcq.event.debut_ningyu', name: '凝羽奉命进入赌局', critical: false,
    description: '苏妲己命侍卫长凝羽参与新奇物品的演示。凝羽仍以冷峻、服从命令的商馆护卫身份出现；她的隐秘来历与后续经历尚未揭露。',
    objective: '认清凝羽在赌局中的处境并当面回应',
    locationId: 'liuchao.location.baihu_shang_guan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_daji', 'liuchao.character.ning_yu'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisMethod: 'reviewed-no-anchor',
    actions: [
      action('observe_ningyu_position', '观察凝羽的处境', '我先观察凝羽是在苏妲己命令下进入演示，不把她后续身份或关系提前当成已知事实。', { kind: 'prepare', grantsPreparation: 'ningyu_debut_seen' }),
      action('respond_to_ningyu_presence', '当面回应凝羽', '我承认凝羽此刻是商馆侍卫长，并以眼前行为回应她，不借登场事件预写未来经历。', { requiresPreparation: ['ningyu_debut_seen'] }),
    ],
  },
  {
    id: 'lcq.event.s03_02', name: '赌局落败签下卖身契',
    description: '程宗扬与苏妲己以凝羽参与的演示设赌；苏妲己暗中加速刻香，程宗扬落败，最终签下终身卖身契。',
    objective: '完成赌局，并面对苏妲己作弊后的卖身结果',
    locationId: 'liuchao.location.baihu_shang_guan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_daji', 'liuchao.character.ning_yu'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.21.1', axisSeq: 37, axisAnchor: '六朝清羽记·#21·第19章·赌局',
    axisBeat: '程宗扬与苏妲己赌约；苏妲己作弊加速刻香，程宗扬落败，被迫签署卖身契。', axisMethod: 'source-rebuilt',
    actions: [
      action('confirm_wager_terms', '确认赌局条件', '我当面确认赌局时限、胜负条件与双方赌注，不让规则在叙述中被偷换。', { kind: 'prepare', grantsPreparation: 'wager_terms_seen' }),
      action('face_rigged_wager_result', '面对作弊后的结果', '刻香异常加速、赌局被判落败后，我认清苏妲己做局并完成卖身契这一正典结果。', { requiresPreparation: ['wager_terms_seen'] }),
    ],
  },
  {
    id: 'lcq.event.s03_03', name: '以新奇器物向苏妲己索酬',
    description: '苏妲己因不会处置按摩棒而求助；程宗扬借机与她谈判，答应取出器物并预支六十金铢。',
    objective: '在帮助苏妲己取出器物前谈定六十金铢报酬',
    locationId: 'liuchao.location.baihu_shang_guan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_daji'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.23.1', axisSeq: 38, axisAnchor: '六朝清羽记·#23·第21章·戏弄',
    axisBeat: '程宗扬利用按摩棒戏弄苏妲己，最终答应帮她取出，并预支六十金铢工钱。', axisMethod: 'source-rebuilt',
    actions: [
      action('negotiate_device_payment', '谈定预支报酬', '我利用自己懂得器物用法的优势，先与苏妲己谈定六十金铢预支。', { kind: 'prepare', grantsPreparation: 'device_payment_agreed' }),
      action('remove_device_after_payment', '收款后取出器物', '报酬到手后，我按约帮助苏妲己取出器物，不把这拍扩写成关系逆转。', { requiresPreparation: ['device_payment_agreed'] }),
    ],
  },
  {
    id: 'lcq.event.s03_04', name: '赎买并释放阿姬曼',
    description: '程宗扬用五十金铢买下阿姬曼，随后撕毁身契还她自由；阿姬曼因曾参与设局而不肯立刻离开。逃离路线又被商馆侍卫封锁。',
    objective: '取得阿姬曼身契、当面撕毁，并应对被封锁的出城路线',
    locationId: 'liuchao.location.wuyuan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.a_jiman_bana', 'liuchao.character.ning_yu'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.25.1', axisSeq: 40, axisAnchor: '六朝清羽记·#25·第23章·赎身',
    axisBeat: '程宗扬用五十金铢买下阿姬曼并撕毁身契还她自由；阿姬曼因曾出卖他而拒绝离开。', axisMethod: 'source-rebuilt',
    actions: [
      action('buy_ajiman_contract', '取得阿姬曼身契', '我用五十金铢取得阿姬曼的身契，先确认契据与她本人都已离开卖方控制。', { kind: 'prepare', grantsPreparation: 'ajiman_contract_acquired' }),
      action('free_ajiman_and_change_route', '撕毁身契并改变路线', '我当面撕毁身契还阿姬曼自由；发现商馆侍卫封锁岔路后，立即改变路线避开搜查。', { requiresPreparation: ['ajiman_contract_acquired'] }),
    ],
  },
  {
    id: 'lcq.event.s03_05', name: '苏妲己以冰蛊逼迫南行',
    description: '苏妲己把冰蛊藏在酸梅汤的冰块中，迫使程宗扬为她前往南荒；程宗扬必须在无法立刻解蛊的现实下组织车马、护卫与奴隶。',
    objective: '确认冰蛊约束，并在两日内组织南荒队伍',
    locationId: 'liuchao.location.baihu_shang_guan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_daji', 'liuchao.character.ning_yu', 'liuchao.character.qi_yuan'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.26.1', axisSeq: 42, axisAnchor: '六朝清羽记·#26·第24章·诡计',
    axisBeat: '苏妲己在酸梅汤中下冰蛊，威胁程宗扬必须前往南荒办事，否则蛊发身亡。', axisMethod: 'source-rebuilt',
    actions: [
      action('confirm_ice_gu_constraint', '确认冰蛊约束', '我从冰块与身体反应确认苏妲己已经下蛊，听清她以南荒任务换取暂不发作的条件。', { kind: 'prepare', grantsPreparation: 'ice_gu_constraint_known' }),
      action('organize_southbound_caravan', '组织南荒队伍', '我与祁远按两日期限筹备车马、钱帛、护卫和奴隶，接受必须先南行的现实。', { requiresPreparation: ['ice_gu_constraint_known'] }),
    ],
  },
  {
    id: 'lcq.event.s03_06', name: '武二郎被迫加入南荒队伍',
    description: '苏妲己先解开武二郎镣铐准备重用；武二郎行凶后遭全城搜捕，只得返回商馆，最终以极低报酬答应随程宗扬南行。',
    objective: '利用武二郎无路可退的处境，取得他随队南行的明确承诺',
    locationId: 'liuchao.location.baihu_shang_guan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.wu_er_lang', 'liuchao.character.ning_yu'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.bai_wu'],
    axisId: 'qingyu.31.2', axisSeq: 47, axisAnchor: '六朝清羽记·#31·第29章·伏虎',
    axisBeat: '武二郎因满城围捕被迫返回，程宗扬趁机压价，迫其明确答应同行南荒。', axisMethod: 'source-rebuilt',
    actions: [
      action('hear_wuerlang_refusal', '听清武二郎从未应诺', '我让武二郎把先前条件说清，承认他此前只要求解镣，并未真正答应同行。', { kind: 'prepare', grantsPreparation: 'wuerlang_position_known' }),
      action('secure_wuerlang_commitment', '取得明确同行承诺', '武二郎因满城搜捕返回后，我重新谈定报酬，取得他随队南行的明确承诺。', { requiresPreparation: ['wuerlang_position_known'] }),
    ],
  },
  {
    id: 'lcq.event.s03_07', name: '铁索桥遇袭',
    description: '武二郎带伤中毒，凝羽参与救治；商队随后通过铁索桥时遭不明敌人抢占桥头，队伍陷入进退两难。',
    objective: '稳定武二郎伤势，并带队突破铁索桥伏击',
    locationId: 'lcq.location.nanhuang_route',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.wu_er_lang', 'liuchao.character.ning_yu', 'liuchao.character.qi_yuan'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.32.2', axisSeq: 50, axisAnchor: '六朝清羽记·#32·第30章·险路',
    axisBeat: '武二郎中毒受伤后，商队过铁索桥又遭不明敌人偷袭，桥头被控制，队伍陷入险境。', axisMethod: 'source-rebuilt',
    actions: [
      action('stabilize_wuerlang_wound', '稳定武二郎伤势', '我与凝羽先处理武二郎中毒的伤口，承认自己的血并不能直接救治他。', { kind: 'prepare', grantsPreparation: 'wuerlang_stabilized' }),
      action('cross_ambushed_rope_bridge', '应对铁索桥伏击', '桥头遭袭后，我组织商队护住伤员与货物，配合前锋摆脱进退两难的桥面。', { requiresPreparation: ['wuerlang_stabilized'] }),
    ],
  },
  {
    id: 'lcq.event.s03_08', name: '劝住武二郎继续南行',
    description: '武二郎确认自己在醉月楼误杀鱼家客人后暴怒，想返回五原找西门庆报复；程宗扬劝他先完成南荒行程。',
    objective: '阻止武二郎折返五原，并让商队继续南行',
    locationId: 'lcq.location.nanhuang_route',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.wu_er_lang', 'liuchao.character.xi_men_qing'],
    relatedFactionIds: ['liuchao.faction.bai_wu'],
    axisId: 'qingyu.33.1', axisSeq: 51, axisAnchor: '六朝清羽记·#33·第31章·双刀',
    axisBeat: '武二郎得知误杀鱼家客人后欲返回五原找西门庆算账，被程宗扬劝住并继续南行。', axisMethod: 'source-rebuilt',
    actions: [
      action('hear_wuerlang_revenge', '听清武二郎折返理由', '我先让武二郎说明醉月楼误杀与西门庆隐瞒的因果，不把他的怒意写成无端失控。', { kind: 'prepare', grantsPreparation: 'wuerlang_revenge_understood' }),
      action('keep_caravan_southbound', '劝住武二郎继续南行', '我以眼下路程、伤势和同行承诺劝住武二郎，先让整支商队继续往南荒走。', { requiresPreparation: ['wuerlang_revenge_understood'] }),
    ],
  },
  {
    id: 'lcq.event.s03_09', name: '凝羽提出弑主并揭开寒气',
    description: '凝羽私下要求程宗扬与她合作杀死苏妲己；两人随后运功时，程宗扬发现凝羽体内有西门庆留下的阴寒之气，并听她讲述两人旧事。',
    objective: '回应凝羽的弑主提议，并探明她体内阴寒之气的来源',
    locationId: 'lcq.location.nanhuang_route',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.ning_yu', 'liuchao.character.su_daji', 'liuchao.character.xi_men_qing'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan'],
    axisId: 'qingyu.35.1', axisSeq: 53, axisAnchor: '六朝清羽记·#35·第33章·武请',
    axisBeat: '凝羽提出合作除掉苏妲己；程宗扬与她运功后发现其体内阴寒之气，并得知与西门庆旧事有关。', axisMethod: 'source-rebuilt',
    actions: [
      action('answer_ningyu_kill_proposal', '回应凝羽的弑主提议', '我让凝羽把合作杀死苏妲己的条件和代价说清，再明确回应，不把尚未执行的提议写成既成事实。', { kind: 'prepare', grantsPreparation: 'ningyu_proposal_answered' }),
      action('trace_ningyu_cold_qi', '探明凝羽体内寒气', '我与凝羽共同运功，确认她体内阴寒之气与西门庆旧事有关，并听她亲口说明已知经过。', { requiresPreparation: ['ningyu_proposal_answered'] }),
    ],
  },
  {
    id: 'lcq.event.s03_10', name: '太乙真宗拦截紫溪船队',
    description: '太乙真宗门人先在五原试探掌教遗命，后又在紫溪拦住白湖商馆船只，指名要求程宗扬前往龙池；冲突中祁远被推落水。',
    objective: '在紫溪现身交涉，并把落水的祁远救回船队',
    locationId: 'lcq.location.nanhuang_route',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.ning_yu', 'liuchao.character.qi_yuan'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.tai_yi_zhen_zong'],
    axisId: 'qingyu.35.2', axisSeq: 54, axisAnchor: '六朝清羽记·#35·第33章·武请',
    axisBeat: '太乙真宗门人在紫溪拦截白湖商馆船只，指名要程宗扬去龙池；程宗扬被迫出面，祁远落水。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('face_taiyi_interception', '现身回应太乙拦船', '我在对方指名后现身船头，承认太乙真宗追问掌教遗命与龙池之事，同时拒绝让他们直接接管商队。', { kind: 'prepare', grantsPreparation: 'taiyi_interception_faced' }),
      action('recover_qiyuan_from_river', '救回落水的祁远', '冲突中祁远被推落水后，我立即组织船上人手把他救回，并让船队脱离拦截。', { requiresPreparation: ['taiyi_interception_faced'] }),
    ],
  },
  {
    id: 'lcq.event.s03_11', name: '雨林恶兆与黑石滩渡河',
    description: '商队在雨林遭青藤蛇袭击，又被暴雨山洪阻在黑石滩；白湖与云氏两队合力渡河后一度迷失，最终依靠凝羽在岸边点燃的火堆找到方向。',
    objective: '承受雨林伤亡，并依凝羽火光带两支商队渡过黑石滩',
    locationId: 'lcq.location.nanhuang_route',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.ning_yu', 'liuchao.character.wu_er_lang', 'liuchao.character.qi_yuan', 'liuchao.character.yun_cang_feng'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.yun_shi_shang_hui'],
    axisId: 'qingyu.37.2', axisSeq: 58, axisAnchor: '六朝清羽记·#37·第35章·渡河',
    axisBeat: '商队经历青藤蛇与山洪后合力渡河，一度迷失方向；凝羽在岸边点火指引，帮助两支商队成功渡过黑石滩。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('respond_to_jungle_and_flood', '应对雨林伤亡与山洪', '青藤蛇造成伤亡、山洪淹没路标后，我先收拢两队人员货物，与云氏商队商定共同渡河。', { kind: 'prepare', grantsPreparation: 'blackstone_crossing_ready' }),
      action('follow_ningyu_fire_across', '依凝羽火光完成渡河', '队伍在河中迷失后，我以凝羽岸边火光校正方向，带白湖与云氏两支商队完成渡河。', { requiresPreparation: ['blackstone_crossing_ready'] }),
    ],
  },
  {
    id: 'lcq.event.s03_12', name: '抵达寂静的蛇彝村',
    description: '商队抵达蛇彝人村寨，却发现全村无灯火也无人声。程宗扬与祁远在空村中谈起同行的谢艺，只能从其举止推测他可能有北方军旅经历。',
    objective: '在不预写灭村真相的前提下进入蛇彝村并安置商队',
    locationId: 'lcq.location.sheyi_village',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.ning_yu', 'liuchao.character.wu_er_lang', 'liuchao.character.qi_yuan', 'liuchao.character.yun_cang_feng', 'liuchao.character.xie_yi'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.yun_shi_shang_hui'],
    axisId: 'qingyu.38.1', axisSeq: 59, axisAnchor: '六朝清羽记·#38·第36章·蛇村',
    axisBeat: '商队抵达无灯火、无人声的蛇彝村；程宗扬与祁远只对谢艺的北方军旅来历作出推测。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('survey_silent_sheyi_village', '查明村寨异常寂静', '我带人从外围确认蛇彝村没有灯火和回应，只记录眼前异常，不提前宣告下一章才揭开的灭村真相。', { kind: 'prepare', grantsPreparation: 'silent_village_surveyed' }),
      action('secure_caravan_in_village', '安置商队并保留谢艺疑云', '我在空村中安排警戒与宿处；与祁远谈起谢艺时，只保留他可能有北方军旅经历的推测。', { requiresPreparation: ['silent_village_surveyed'] }),
    ],
  },
];

const FROZEN_IDS = new Set([
  'lcq.event.debut_ningyu',
  ...Array.from({ length: 9 }, (_, index) => `lcq.event.s03_${String(index + 1).padStart(2, '0')}`),
]);
const APPENDED_IDS = new Set(['lcq.event.s03_10', 'lcq.event.s03_11', 'lcq.event.s03_12']);
const ALLOWED_AFFILIATIONS = new Map([
  ['liuchao.character.cheng_zongyang', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.su_daji', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.ning_yu', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.a_jiman_bana', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.wu_er_lang', ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.bai_wu']],
  ['liuchao.character.xi_men_qing', []],
  ['liuchao.character.qi_yuan', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.yun_cang_feng', ['liuchao.faction.yun_shi_shang_hui']],
  ['liuchao.character.xie_yi', []],
]);

const minimalCharacter = (id, name, description, role, gender, origin, locationId) => ({
  id, name, description, role, gender, affiliations: [], ...(locationId ? { locationId } : {}), profile: { origin },
});
const MINIMAL_CHARACTERS = new Map([
  ['liuchao.character.cheng_zongyang', minimalCharacter('liuchao.character.cheng_zongyang', '程宗扬', '来自现代世界、刚被苏妲己识破并扣在白湖商馆的年轻人。', '被扣押的异乡人', '男', '现代来客；正以霓龙丝线索争取活命。', 'liuchao.location.baihu_shang_guan')],
  ['liuchao.character.su_daji', minimalCharacter('liuchao.character.su_daji', '苏妲己', '白湖商馆女主人，善于以交易、契约和控制手段驱使他人。', '白湖商馆主人', '女', '五原白湖商馆主人。', 'liuchao.location.baihu_shang_guan')],
  ['liuchao.character.ning_yu', minimalCharacter('liuchao.character.ning_yu', '凝羽', '白湖商馆侍卫长，寡言冷峻，奉苏妲己命令看守程宗扬。', '商馆侍卫长', '女', '白湖商馆护卫；更深来历尚未揭露。', 'liuchao.location.baihu_shang_guan')],
  ['liuchao.character.a_jiman_bana', minimalCharacter('liuchao.character.a_jiman_bana', '阿姬曼·芭娜', '来自天竺的年轻舞姬，此时仍受白湖商馆奴契约束。', '商馆舞姬', '女', '来自天竺，现为白湖商馆奴隶。', 'liuchao.location.baihu_shang_guan')],
  ['liuchao.character.wu_er_lang', minimalCharacter('liuchao.character.wu_er_lang', '武二郎', '自称白武族排行第二的勇士，武力强横而重视自己亲口作出的承诺。', '白武族勇士', '男', '被送入白湖商馆采石场。', 'liuchao.location.wuyuan')],
  ['liuchao.character.xi_men_qing', minimalCharacter('liuchao.character.xi_men_qing', '西门庆', '五原城中行事阔绰、来历复杂的男子，与武二郎有旧怨。', '五原人物', '男', '五原城人物；更深归属尚未揭露。', 'liuchao.location.wuyuan')],
  ['liuchao.character.qi_yuan', minimalCharacter('liuchao.character.qi_yuan', '祁远', '熟悉商路与南荒风险的白湖商馆老伙计。', '商队管事', '男', '白湖商馆伙计，负责南荒商队事务。', 'liuchao.location.baihu_shang_guan')],
  ['liuchao.character.yun_cang_feng', minimalCharacter('liuchao.character.yun_cang_feng', '云苍峰', '云氏商会执事，在黑石滩与白湖商队合力渡河。', '云氏商会执事', '男', '云氏商会执事。')],
  ['liuchao.character.xie_yi', minimalCharacter('liuchao.character.xie_yi', '谢艺', '随云氏商队南行的刀客，自称是写书人，真实军旅来历尚未证实。', '同行刀客', '男', '随云氏商队南行；身份仍是同行者的推测。')],
]);

const completionPath = id => `flags.event.${id.split('.').at(-1)}.done`;

async function main() {
  if (!existsSync(backupPath)) {
    await mkdir(backupDir, { recursive: true });
    await cp(stagePath, backupPath);
  }
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const support = JSON.parse(await readFile(supportStagePath, 'utf8'));
  const originalById = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const id of FROZEN_IDS) if (!originalById.has(id)) throw new Error(`frozen event missing: ${id}`);
  for (const id of originalById.keys()) if (!FROZEN_IDS.has(id) && !APPENDED_IDS.has(id)) throw new Error(`unexpected event id: ${id}`);

  document.manifest.name = '六朝清羽记·白湖赌局至蛇彝村';
  document.manifest.description = 'Strict 模式，按《六朝清羽记》第18–36章重建：南荒之约、赌局、冰蛊、武二郎入队、险路与抵达蛇彝村。';
  document.manifest.axisSeqLo = 36;
  document.manifest.axisSeqHi = 59;
  document.world.era = '白湖商馆至南荒初行';
  document.world.background = '程宗扬已被苏妲己识破并扣在白湖商馆，正以霓龙丝线索争取活命。三个月期限、赌局结果、冰蛊、武二郎同行与蛇彝村异常均尚未落账。';
  document.world.continents = document.world.continents.filter(item => ['liuchao.continent.zhongzhou', 'liuchao.continent.nanhuang'].includes(item.id));
  document.scenario.opening.text = '苏妲己已经识破你的来历并把你扣在白湖商馆。她正追问霓龙丝的产地；你只有手中的现代知识和一个尚未兑现的线索，必须先谈出活路。';
  document.scenario.opening.playerRole = '被白湖商馆扣押的异乡人';
  document.scenario.opening.locationId = 'liuchao.location.baihu_shang_guan';
  document.scenario.opening.featuredCharacterIds = ['liuchao.character.su_daji', 'liuchao.character.ning_yu'];

  const requiredCharacterIds = new Set([
    document.scenario.opening.playerCharacterId,
    ...document.scenario.opening.featuredCharacterIds,
    ...EVENTS.flatMap(event => event.relatedCharacterIds),
  ]);
  document.canon.characters = [...requiredCharacterIds].map(id => structuredClone(MINIMAL_CHARACTERS.get(id))).map(character => {
    if (!character) throw new Error('required minimal character missing');
    character.affiliations = (ALLOWED_AFFILIATIONS.get(character.id) || []).map(factionId => ({ factionId, category: 'organization', role: '成员' }));
    return character;
  });
  document.content.skills = [];
  document.content.techniques = [];
  document.content.items = [];
  document.rules.contentAccess = [];

  const factionPool = new Map([...document.canon.factions, ...support.canon.factions].map(faction => [faction.id, faction]));
  const requiredFactionIds = new Set([
    ...EVENTS.flatMap(event => event.relatedFactionIds),
    ...document.canon.characters.flatMap(character => character.affiliations.map(item => item.factionId)),
  ]);
  document.canon.factions = [...requiredFactionIds].map(id => structuredClone(factionPool.get(id))).map(faction => {
    if (!faction) throw new Error('required faction missing');
    delete faction.headquartersLocationId;
    delete faction.territory;
    return faction;
  });
  const locationPool = new Map(document.canon.locations.map(location => [location.id, location]));
  document.canon.locations = [
    structuredClone(locationPool.get('liuchao.location.baihu_shang_guan')),
    structuredClone(locationPool.get('liuchao.location.wuyuan')),
    { id: 'lcq.location.nanhuang_route', name: '南荒商路', description: '从五原经紫溪、雨林与黑石滩深入南荒的商路。', type: '野外', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 4200, y: 6900 }, features: [] },
    { id: 'lcq.location.sheyi_village', name: '蛇彝村', description: '南荒蛇彝人村寨；商队抵达时无灯火、无人应答，真实情况尚未查明。', type: '村寨', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 4650, y: 7350 }, features: [] },
  ];
  if (document.canon.locations.some(item => !item)) throw new Error('required location missing');

  document.canon.relationships = [
    { fromCharacterId: 'liuchao.character.su_daji', toCharacterId: 'liuchao.character.ning_yu', relation: '主人与侍卫长', score: 30, direction: 'directed' },
  ];
  document.canon.factionRelationships = [];
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.su_daji', relation: '扣押者', favorability: -45 },
    { characterId: 'liuchao.character.ning_yu', relation: '看守者', favorability: -5 },
    { characterId: 'liuchao.character.a_jiman_bana', relation: '曾参与诱捕的舞姬', favorability: -20 },
  ];

  document.scenario.events = EVENTS.map((definition, index) => {
    const { actions, ...eventDefinition } = definition;
    const previous = EVENTS[index - 1];
    return {
      ...eventDefinition,
      critical: definition.critical !== false,
      conditions: index === 0
        ? [{ path: 'flags.chapter.lcq.stage_03.started', operator: 'eq', value: true }]
        : [{ path: completionPath(previous.id), operator: 'eq', value: true }],
      completion: structuredClone(originalById.get(definition.id)?.completion || [{ path: completionPath(definition.id), operator: 'eq', value: true }]),
      playerCompletionContract: contract(actions),
    };
  });
  document.scenario.chapters = [{
    id: 'lcq.chapter.stage_03',
    title: '第18–36章·白湖商馆至蛇彝村',
    summary: '程宗扬从苏妲己手中谈得活路，却在赌局与冰蛊下成为商馆奴隶；他组织队伍进入南荒，经历铁索桥、紫溪与黑石滩，最终抵达异常寂静的蛇彝村。',
    activation: [{ path: 'flags.chapter.lcq.stage_03.started', operator: 'eq', value: true }],
    completion: [{ path: 'flags.event.s03_12.done', operator: 'eq', value: true }],
    eventIds: EVENTS.map(event => event.id),
  }];
  document.scenario.initialFlags = {
    'chapter.lcq.stage_03.started': true,
    'chapter.lcq.stage_03.done': false,
    ...Object.fromEntries(EVENTS.map(event => [`event.${event.id.split('.').at(-1)}.done`, false])),
  };

  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);

  const stagePlan = JSON.parse(await readFile(stagePlanPath, 'utf8'));
  const plan = stagePlan.stages.find(item => item.id === 'lcq.stage_03');
  if (!plan) throw new Error('stage plan entry missing');
  Object.assign(plan, {
    title: '白湖赌局至蛇彝村',
    era: '白湖商馆至南荒初行',
    imminentConflict: '苏妲己已识破并扣押程宗扬，正逼问霓龙丝线索；程宗扬必须先谈出三个月活路。',
    completedFacts: ['程宗扬已被苏妲己识破并扣押', '颈后已有白湖商馆奴隶烙印', '凝羽是苏妲己的侍卫长'],
    forbiddenFutureFacts: ['赌局落败并签下卖身契', '苏妲己已下冰蛊', '武二郎已答应同行', '凝羽提出弑主', '商队已抵达蛇彝村', '蛇彝村灭门真相'],
    featuredCharacters: ['程宗扬', '苏妲己', '凝羽', '阿姬曼·芭娜', '武二郎', '祁远'],
    reason: '从第18章中段南荒之约开始，依次经历白湖商馆与南荒初行；第37章危命由下一关承接。',
    mappingReason: '旧 opening 提前写入第24章冰蛊与第20章后续；s03_07/s03_08 重复绑定 qingyu.33.1，且旧收束停在第33章，漏掉第33章太乙拦船及第34–36章通往蛇彝村的必要过渡。冻结 ID 逐拍重写，另 append-only 补 s03_10–12。',
  });
  await writeFile(stagePlanPath, `${JSON.stringify(stagePlan, null, 2)}\n`);
}

await main();
