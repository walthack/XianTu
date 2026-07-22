#!/usr/bin/env node

// R2-11P：按 EPUB《六朝云龙吟》第 6–8 章重建 lyl.lin_an_black_sea。
//
// 旧关卡把 source 9–14 的临安后续、未发生的黑魔海会面与阮氏姐妹揭密混入
// sourceStart=5/sourceEnd=8 的开局，并让 15 个事件无依赖并发激活。eventId 已冻结，
// 因此本脚本保留全部旧 id，只重写本关时区内的名称、描述、目标、人物、顺序与合同。
// 三条已有主轴仅绑定原文明确覆盖的 6.1 / 8.1 / 8.2；第 7 章与章内细拍不伪造轴。
//
// 备份只在首次运行时创建，后续重复运行不会覆盖原始快照。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagePath = join(root, 'mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.lin_an_black_sea.json');
const backupDir = join(root, 'mod-kit/generated/deepseek-v4-flash/yunlong/stages-pre-r2-11p-source-rebuild-backup');
const backupPath = join(backupDir, 'lyl.lin_an_black_sea.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};

function action(id, label, actionText, options = {}) {
  return { id, label, actionText, timeCost: 1, outcomeText, ...options };
}

function contract(actions) {
  return { kind: 'objective_action', settleOn: ['success'], actions };
}

const EVENTS = [
  {
    id: 'lyl.event.debut_ruan_sisters',
    name: '抵达临安，拜祭谢艺',
    description: '程宗扬一行由钱塘门进入临安，先到风波亭后拜祭谢艺。俞子元与星月湖军士行礼，秦桧、林清浦、敖润和冯源也各自致意。',
    objective: '在风波亭后拜祭谢艺并安顿临安落脚处',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: [
      'liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui',
      'liuchao.character.yu_zi_yuan', 'liuchao.character.lin_qing_pu',
      'liuchao.character.ao_run', 'liuchao.character.feng_yuan',
    ],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    axisId: 'yunlong.6.1', axisSeq: 556, axisAnchor: '六朝云龙吟·#6·临安',
    axisBeat: '程宗扬一行抵达临安，先到风波亭后拜祭谢艺。', axisMethod: 'source-rebuilt',
    actions: [
      action('honor_xie_yi_grave', '在谢艺墓前上香行礼', '我在谢艺墓前点上三炷香，认真叩首，把江州近况和星月湖重聚的消息告诉他。'),
    ],
  },
  {
    id: 'liuchao.event.wei_yuan_first_contact',
    name: '尾随李师师至威远镖局',
    description: '离开风波亭后，程宗扬认出匆匆入城的李师师，尾随她来到威远镖局；秦桧随后查明她是总镖头李寅臣之女，此番因家事返乡。',
    objective: '跟上李师师的马车，确认她为何突然返回临安',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan', 'liuchao.character.li_shi_shi'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('follow_li_shishi_carriage', '让俞子元跟住李师师的马车', '我让俞子元调整车向，保持距离跟住那辆风尘仆仆的马车，直到它停在威远镖局门前。'),
    ],
  },
  {
    id: 'lyl.event.ruan_xiangning_secret',
    name: '查勘武穆王府',
    description: '程宗扬带秦桧、俞子元与青面兽绕行被封的武穆王府，辨认府内建筑方位，准备日后再来寻找岳鹏举留下的线索。',
    objective: '绕武穆王府查清建筑方位，不惊动周边暗梢',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan', 'liuchao.character.qing_mian_shou'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('survey_wumu_mansion', '沿外墙查清王府建筑方位', '我装作逛街的富商，沿武穆王府外墙走上一圈，只记下亭台楼阁的方位，不去碰门上的封条。'),
    ],
  },
  {
    id: 'liuchao.event.lin_chong_confront',
    name: '识破皇城司尾随',
    description: '离开武穆王府前往明庆寺时，秦桧从铜镜中发现有人尾随；俞子元认出对方属于皇城司，程宗扬改扮成挥金如土的外地富商以消除怀疑。',
    objective: '不与皇城司动手，以富商身份掩护行踪进入明庆寺',
    locationId: 'liuchao.location.mingqing_temple',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan', 'liuchao.character.lin_chong', 'liuchao.character.qing_mian_shou'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('maintain_merchant_disguise', '买下香摊，维持外地富商伪装', '我让青面兽背起整摊供香，摆出财大气粗的外地富商模样，从容进入明庆寺。'),
    ],
  },
  {
    id: 'lyl.event.mingqingsi_encounter',
    name: '明庆寺旁观林鲁初会',
    description: '明庆寺菜园中，鲁智深与佛心庵少女杨柳因花狗动手。鲁智深倒拔垂杨柳后，尾随而来的林冲上前通名，两名好汉一见如故；程宗扬判断时机未到，没有贸然结交。',
    objective: '旁观鲁智深与林冲相识，在身份暴露前离开',
    locationId: 'liuchao.location.mingqing_temple',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.lin_chong', 'liuchao.character.lu_zhi_shen'],
    relatedFactionIds: [],
    actions: [
      action('observe_lin_lu_meeting', '看清林冲与鲁智深通名相交', '我留在菜园外看林冲翻墙入内，与刚倒拔垂杨柳的鲁智深通名结交。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('leave_before_contact', '判断时机未到，先行离寺', '我按住准备上前的秦桧，只说一句「不到时候」，随后回祈福榜取下接头字条离寺。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
  {
    id: 'liuchao.event.gather_intel',
    name: '解读便门瓦接头字条',
    description: '回到保和坊后，程宗扬解读祈福榜上的暗号，确认二月十九申时在便门瓦与星月湖卧底接头；冯源同时传来薛延山重伤、希望会面的消息。',
    objective: '解读祈福暗号，并答复薛延山的会面请求',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.feng_yuan'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9', 'liuchao.faction.xue_sun'],
    actions: [
      action('decode_bianmenwa_note', '确认便门瓦接头时间与暗号', '我把祈福榜字条铺平，按「君子」开头和落款解出便门瓦、二月十九申时与张官人的接头信息。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('accept_xuesun_meeting', '答应次日下午去见薛延山', '我让冯源回复雪隼分舵：吏部报到之后，我会亲自去西湖农居见薛延山。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
  {
    id: 'liuchao.event.factory_registration',
    name: '吏部报到，档案被调',
    description: '程宗扬以盘江为籍贯完成工部屯田司员外郎报到，却在吏部撞见林冲。林冲当场起疑，并调走了程宗扬刚填写的籍贯与出身档案。',
    objective: '完成客卿报到，并查明林冲调走了哪些档案',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.lin_chong'],
    relatedFactionIds: [],
    actions: [
      action('register_as_panjiang_guest', '以盘江籍贯完成吏部报到', '我按既定身份填下盘江籍贯，验明正身，领到工部屯田司员外郎的告身与官袍。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('verify_dossier_taken', '暗中向书吏核实林冲调档', '我递给书吏几枚金铢，确认林冲已经把我刚填的籍贯、出身等档案一并调走。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
  {
    id: 'liuchao.event.xue_sun_meeting',
    name: '西湖农居会见薛延山',
    description: '敖润引程宗扬到西湖农居会见薛延山。重伤的薛延山说明雪隼团在太湖遭水匪围攻，二百余人几乎尽没，并请求程宗扬照管残部。',
    objective: '听完薛延山讲述太湖遇袭，并接下照管雪隼残部的托付',
    locationId: 'liuchao.location.west_lake_cottage',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xue_yan_shan', 'liuchao.character.ao_run'],
    relatedFactionIds: ['liuchao.faction.xue_sun', 'liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('hear_taihu_ambush', '听薛延山讲完太湖遇袭经过', '我让旁人安静下来，听薛延山把三条座船被水鬼凿沉、雪隼团在湖中血战的经过讲完。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('accept_xuesun_remnants', '承诺照管雪隼团残部', '我当面答应薛延山：他的兄弟就是我的手足，雪隼团留下的人我会照管。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
  {
    id: 'liuchao.event.cold_poison_mystery',
    name: '辨认薛延山寒毒',
    description: '程宗扬诊脉后确认薛延山所中寒毒与云如瑶、月霜身上的寒毒同源，并用鬼牙询问遇袭线索；薛延山无法辨认袭击者。',
    objective: '检查薛延山的寒毒，并确认他是否见过鬼牙',
    locationId: 'liuchao.location.west_lake_cottage',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xue_yan_shan'],
    relatedFactionIds: ['liuchao.faction.xue_sun'],
    actions: [
      action('diagnose_xuesun_cold_poison', '扣脉确认寒毒同源', '我扣住薛延山的脉门仔细辨认，确认这股吞噬精血的寒毒与云如瑶、月霜体内的寒毒同源。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('show_ghost_fang', '取出鬼牙询问袭击者线索', '我取出萧遥逸给我的鬼牙，请薛延山仔细辨认；他看过之后仍无法确认袭击者身份。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
  {
    id: 'lyl.event.ruan_xianglin_scheme',
    name: '应李师师之邀登雷峰塔',
    description: '离开西湖农居后，程宗扬再次遇见李师师与她称作凝姨的美妇。李师师主动邀请程宗扬同游雷峰塔，借机寻求帮助。',
    objective: '接受李师师的邀请，与她一同登上雷峰塔',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.li_shi_shi', 'liuchao.character.ruan_xiang_ning', 'liuchao.character.qin_hui'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('join_leifeng_excursion', '答应陪李师师游雷峰塔', '我接受李师师的邀请，与她和凝姨一同登上雷峰塔，等她说明真正的来意。'),
    ],
  },
  {
    id: 'liuchao.event.wei_yuan_crisis_deepen',
    name: '查明失镖勒索全貌',
    description: '俞子元查明威远镖局丢失的是高衙内价值十万贯、并含御赐玉带的货物；高衙内以免于问罪为条件，逼迫李师师进入太尉府。',
    objective: '听取俞子元的调查，确认高衙内勒索威远镖局的条件',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan', 'liuchao.character.li_shi_shi', 'liuchao.character.gao_zhishang'],
    relatedFactionIds: [],
    axisId: 'yunlong.8.1', axisSeq: 557, axisAnchor: '六朝云龙吟·#8·衙内',
    axisBeat: '程宗扬查明威远镖局失镖与高衙内勒索的全貌。', axisMethod: 'source-rebuilt',
    actions: [
      action('hear_weiyuan_terms', '听俞子元说明失镖与勒索条件', '我暂离塔身，听俞子元说明失镖价值、御赐玉带和高衙内开出的条件，确认这不是普通债务。'),
    ],
  },
  {
    id: 'liuchao.event.gao_yanei_showdown',
    name: '雷峰塔逼退高衙内',
    description: '高衙内带十三太保与陆谦登塔强索李师师。李师师先制住高衙内，陆谦出手后秦桧以惊魔指迫其松手，程宗扬最终喝退众人。',
    objective: '在雷峰塔阻止陆谦强带李师师，并逼高衙内一行退走',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.li_shi_shi', 'liuchao.character.gao_zhishang', 'liuchao.character.lu_qian', 'liuchao.character.qin_hui'],
    relatedFactionIds: [],
    actions: [
      action('break_luqian_grip', '让秦桧逼陆谦放开李师师', '陆谦抓住李师师手腕时，我示意秦桧上前，以一指震麻他的经脉，先把人解开。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('drive_yanei_away', '当面喝退高衙内一行', '我当面喝出高俅之名，以真气震响塔檐铜铃，迫使陆谦判断不能硬来，带高衙内退走。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
  {
    id: 'liuchao.event.you_chan_meeting',
    name: '决定继续追查威远失镖',
    description: '高衙内退走后，李师师致谢离开。秦桧解释光明观堂不介入江湖恩怨的立场，程宗扬决定继续打听失镖线索，能帮便帮。',
    objective: '与秦桧复盘雷峰塔冲突，决定继续调查失镖',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.li_shi_shi'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('order_weiyuan_inquiry', '让秦桧继续打听失镖线索', '我听完秦桧解释光明观堂的立场，仍让他继续打听威远失镖：能帮李师师一把便帮一把。'),
    ],
  },
  {
    id: 'liuchao.event.black_sea_approach',
    name: '江州铁傀儡场外拍',
    description: '场外插叙：小紫与一名身份未明的老者在江州城外试验铁傀儡。铁傀儡重创虎翼军，小紫取走龙睛玉，并抽取一名军官阴魂尝试驱动傀儡。',
    objective: '看完江州场外插叙，不把场外事件写成主角亲历',
    locationId: 'liuchao.location.jiangzhou',
    relatedCharacterIds: ['liuchao.character.xiao_zi'],
    relatedFactionIds: [],
    axisId: 'yunlong.8.2', axisSeq: 558, axisAnchor: '六朝云龙吟·#8·衙内',
    axisBeat: '虎翼军遭铁傀儡重创，小紫取走龙睛玉并尝试以阴魂驱动傀儡。', axisMethod: 'source-rebuilt',
    actions: [
      action('acknowledge_offscreen_interlude', '完成江州场外插叙', '【场外插叙】镜头停在江州城外：小紫收起龙睛玉，以阴魂试验铁傀儡；程宗扬对此尚不知情。'),
    ],
  },
  {
    id: 'liuchao.event.final_preparations',
    name: '经过叩天石，前往便门瓦',
    description: '程宗扬在御街经过朝天门，看到王哲留在叩天石上的巨剑，与秦桧谈及争霸与生意，随后按约前往便门瓦接头。',
    objective: '看过叩天石后，按暗号约定前往便门瓦',
    locationId: 'liuchao.location.lin_an',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('inspect_qingtian_sword', '经过朝天门查看叩天石巨剑', '我在朝天门前看过斩开叩天石的巨剑，与秦桧说清自己眼下只想一步一步经营。', { kind: 'prepare', grantsPreparation: 'sequence_step_1' }),
      action('depart_for_bianmenwa', '按约前往便门瓦接头', '我敲了敲车厢，让车夫转向便门瓦，去赴祈福字条上约定的接头。', { requiresPreparation: ['sequence_step_1'] }),
    ],
  },
];

const CHAPTERS = [
  { id: 'liuchao.chapter.arrival', title: '初抵临安', summary: '入城拜祭谢艺、跟到威远镖局、查勘武穆王府并在明庆寺避开皇城司。', eventIds: EVENTS.slice(0, 5).map(event => event.id) },
  { id: 'liuchao.chapter.lin_chong_track', title: '暗号与调档', summary: '解读便门瓦暗号，并在吏部确认林冲已经调走新填档案。', eventIds: EVENTS.slice(5, 7).map(event => event.id) },
  { id: 'liuchao.chapter.wei_yuan_affair', title: '雪隼托付', summary: '会见薛延山、辨认寒毒，再接受李师师的雷峰塔邀请。', eventIds: EVENTS.slice(7, 10).map(event => event.id) },
  { id: 'liuchao.chapter.xue_sun_trust', title: '雷峰解围', summary: '查明失镖勒索全貌，在雷峰塔逼退高衙内并决定继续调查。', eventIds: EVENTS.slice(10, 13).map(event => event.id) },
  { id: 'liuchao.chapter.black_sea_prelude', title: '江州场外与便门瓦', summary: '江州铁傀儡场外拍落定；临安一线经过叩天石后转入便门瓦接头。', eventIds: EVENTS.slice(13).map(event => event.id) },
];

const chapterDonePaths = [
  'flags.chapter.arrival.done', 'flags.chapter.lin_chong.done', 'flags.chapter.wei_yuan.done',
  'flags.chapter.xue_sun.done', 'flags.chapter.black_sea_prelude.done',
];

const STAGE_AFFILIATIONS = new Map([
  ['liuchao.character.cheng_zongyang', new Set(['liuchao.faction.xing_yue_hu', 'liuchao.faction.pan_jiang_cheng'])],
  ['liuchao.character.qin_hui', new Set(['liuchao.faction.pan_jiang_cheng'])],
  ['liuchao.character.yu_zi_yuan', new Set(['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.xing_yue_hu'])],
  ['liuchao.character.lin_chong', new Set(['liuchao.faction.huang_cheng_si', 'liuchao.faction.jin_jun'])],
  ['liuchao.character.li_shi_shi', new Set(['liuchao.faction.guang_ming_guan_tang', 'liuchao.faction.wei_yuan_escort'])],
  ['liuchao.character.lu_zhi_shen', new Set(['liuchao.faction.mingqing_temple'])],
  ['liuchao.character.xue_yan_shan', new Set(['liuchao.faction.xue_sun'])],
  ['liuchao.character.lin_qing_pu', new Set(['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.x2d33e1eaf9'])],
  ['liuchao.character.ao_run', new Set(['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.xue_sun', 'liuchao.faction.x2d33e1eaf9'])],
  ['liuchao.character.feng_yuan', new Set(['liuchao.faction.xue_sun', 'liuchao.faction.x2d33e1eaf9'])],
  ['liuchao.character.qing_mian_shou', new Set(['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.x2d33e1eaf9'])],
  ['liuchao.character.ruan_xiang_ning', new Set()],
  ['liuchao.character.gao_zhishang', new Set(['liuchao.faction.tai_wei_fu'])],
  ['liuchao.character.lu_qian', new Set(['liuchao.faction.tai_wei_fu'])],
  ['liuchao.character.xiao_zi', new Set(['liuchao.faction.xing_yue_hu'])],
]);

const STAGE_LOCATION_IDS = new Set([
  'liuchao.location.lin_an', 'liuchao.location.mingqing_temple',
  'liuchao.location.west_lake_cottage', 'liuchao.location.jiangzhou',
]);

const STAGE_FACTION_DESCRIPTIONS = new Map([
  ['liuchao.faction.xing_yue_hu', '岳鹏举旧部组成的军政力量；程宗扬在江州战后已获其支持。'],
  ['liuchao.faction.huang_cheng_si', '宋国负责侦缉与监察的机构，林冲现任教头。'],
  ['liuchao.faction.tai_wei_fu', '高俅掌管的宋国权势机构，高衙内与陆谦由此而来。'],
  ['liuchao.faction.wei_yuan_escort', '临安镖局，李师师的父亲李寅臣任总镖头。'],
  ['liuchao.faction.guang_ming_guan_tang', '李师师所属宗门；门规不主动介入江湖恩怨。'],
  ['liuchao.faction.pan_jiang_cheng', '程宗扬建立并经营的商会与随行班底。'],
  ['liuchao.faction.xue_sun', '由薛延山统领的佣兵团，敖润、冯源等人与其有旧。'],
  ['liuchao.faction.mingqing_temple', '临安佛寺，鲁智深此时在寺中挂单。'],
  ['liuchao.faction.jin_jun', '宋国禁军体系，林冲以八十万禁军教头身份闻名。'],
  ['liuchao.faction.x2d33e1eaf9', '程宗扬在江州战后带入临安的随行人员与办事班底。'],
]);

async function main() {
  if (!existsSync(backupPath)) {
    await mkdir(backupDir, { recursive: true });
    await cp(stagePath, backupPath);
  }
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const originalById = new Map(document.scenario.events.map(event => [event.id, event]));
  if (originalById.size !== EVENTS.length || EVENTS.some(event => !originalById.has(event.id))) {
    throw new Error('eventId contract changed; refusing to rebuild');
  }

  document.manifest.description = 'Strict 模式，按《六朝云龙吟》第6–8章《临安》《雷峰》《衙内》重建：入城、皇城司疑线、雪隼托付、雷峰塔解围与江州铁傀儡场外拍。';
  document.manifest.axisSeqLo = 556;
  document.manifest.axisSeqHi = 558;
  document.world.background = '江州战后，程宗扬以宋国工部屯田司员外郎身份抵达临安。他先要拜祭谢艺，再按星月湖留在明庆寺祈福榜上的线索寻找接头人；威远镖局、雪隼团与皇城司各线此时尚未展开。';
  document.scenario.opening.text = '你刚由钱塘门进入临安，首先要去风波亭后拜祭谢艺。威远镖局、皇城司与雪隼团的线索尚未展开；你只知道星月湖在明庆寺祈福榜留下了接头暗号。';
  document.scenario.opening.featuredCharacterIds = [
    'liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan',
    'liuchao.character.lin_chong', 'liuchao.character.li_shi_shi',
    'liuchao.character.lu_zhi_shen', 'liuchao.character.xue_yan_shan',
  ];

  // 人物层同样按本关时区收口：只保留开场/事件实际需要的演员。
  // 「凝姨」在第 7–8 章尚未揭示真实姓名与黑魔海身份；冯源本关在场但旧 stage 漏投影。
  const requiredCharacterIds = new Set([
    document.scenario.opening.playerCharacterId,
    ...document.scenario.opening.featuredCharacterIds,
    ...EVENTS.flatMap(event => event.relatedCharacterIds || []),
  ]);
  const minimalCharacters = new Map([
    ['liuchao.character.ruan_xiang_ning', {
      id: 'liuchao.character.ruan_xiang_ning',
      name: '凝姨',
      description: '李师师称作姨母的美妇，言谈温和，陪她同游雷峰塔；此时真实姓名、婚姻与门派身份均未揭示。',
      role: '李师师的姨母（自称）',
      gender: '女',
      affiliations: [],
      locationId: 'liuchao.location.lin_an',
      profile: { origin: '李师师称作「凝姨」的同行长辈；其余身份在本关尚未揭示' },
    }],
    ['liuchao.character.feng_yuan', {
      id: 'liuchao.character.feng_yuan',
      name: '冯源',
      description: '随程宗扬抵达临安的平山宗火法师；拜祭谢艺后，他负责往来雪隼分舵并传递薛延山的会面请求。',
      role: '火法师/随从',
      gender: '男',
      affiliations: [
        { factionId: 'liuchao.faction.x2d33e1eaf9', category: 'organization', role: '法师/随从' },
      ],
      locationId: 'liuchao.location.lin_an',
      profile: { origin: '平山宗火法师，程宗扬随从' },
    }],
  ]);
  const existingCharacters = new Map(document.canon.characters.map(character => [character.id, character]));
  document.canon.characters = [...requiredCharacterIds].map(id => {
    if (minimalCharacters.has(id)) return minimalCharacters.get(id);
    const character = existingCharacters.get(id);
    if (!character) throw new Error(`required stage character missing: ${id}`);
    return character;
  });
  for (const character of document.canon.characters) {
    const allowed = STAGE_AFFILIATIONS.get(character.id);
    if (!allowed) throw new Error(`missing stage affiliation adjudication: ${character.id}`);
    character.affiliations = (character.affiliations || []).filter(affiliation => allowed.has(affiliation.factionId));
  }
  const requiredFactionIds = new Set([
    ...EVENTS.flatMap(event => event.relatedFactionIds || []),
    ...document.canon.characters.flatMap(character => (character.affiliations || []).map(affiliation => affiliation.factionId)),
  ]);
  document.canon.factions = document.canon.factions.filter(faction => requiredFactionIds.has(faction.id));
  for (const faction of document.canon.factions) {
    const description = STAGE_FACTION_DESCRIPTIONS.get(faction.id);
    if (!description) throw new Error(`missing stage faction description: ${faction.id}`);
    faction.description = description;
    delete faction.headquartersLocationId;
    delete faction.territory;
  }
  document.canon.locations = document.canon.locations.filter(location => STAGE_LOCATION_IDS.has(location.id));
  document.canon.factionRelationships = (document.canon.factionRelationships || []).filter(relationship =>
    requiredFactionIds.has(relationship.fromFactionId) && requiredFactionIds.has(relationship.toFactionId));
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.qin_hui', relation: '主从', favorability: 60, memories: ['筠州粮食合作与江州同行'] },
    { characterId: 'liuchao.character.yu_zi_yuan', relation: '主从', favorability: 50, memories: ['星月湖旧部，负责临安落脚'] },
    { characterId: 'liuchao.character.lin_qing_pu', relation: '主从', favorability: 50, memories: ['江州联络与随行'] },
    { characterId: 'liuchao.character.ao_run', relation: '主从', favorability: 50, memories: ['雪隼旧部，已加入程氏'] },
    { characterId: 'liuchao.character.feng_yuan', relation: '主从', favorability: 40, memories: ['平山宗火法师，随队抵达临安'] },
    { characterId: 'liuchao.character.qing_mian_shou', relation: '主从', favorability: 5 },
    { characterId: 'liuchao.character.xiao_zi', relation: '伴侣', favorability: 80 },
    { characterId: 'liuchao.character.li_shi_shi', relation: '旧识', favorability: 10, memories: ['此前在江州军中见过'] },
  ];
  document.canon.relationships = (document.canon.relationships || []).filter(relationship =>
    requiredCharacterIds.has(relationship.fromCharacterId)
    && requiredCharacterIds.has(relationship.toCharacterId)
    && relationship.fromCharacterId !== 'liuchao.character.ruan_xiang_ning'
    && relationship.toCharacterId !== 'liuchao.character.ruan_xiang_ning');

  document.scenario.events = EVENTS.map((definition, index) => {
    const completion = originalById.get(definition.id).completion;
    const event = { ...definition, completion, critical: true };
    delete event.actions;
    event.conditions = index === 0
      ? [{ path: 'flags.chapter.arrival.started', operator: 'eq', value: true }]
      : [{ path: originalById.get(EVENTS[index - 1].id).completion[0].path, operator: 'eq', value: true }];
    event.playerCompletionContract = contract(definition.actions);
    return event;
  });

  document.scenario.chapters = CHAPTERS.map((chapter, index) => ({
    ...chapter,
    // 首章无 activation 即为唯一根；若也用初始即为 true 的 started flag，静态分析器会把
    // 所有后续章误判为可反向回到首章，从而构造假循环。
    ...(index === 0 ? {} : { activation: [{ path: chapterDonePaths[index - 1], operator: 'eq', value: true }] }),
    // runtime 在本章列出的 critical events 全部完成后，确定性派生标准 chapter flag；
    // 下一章继续依赖该 flag，避免让 LLM 额外写真值。
    completion: [{ path: chapterDonePaths[index], operator: 'eq', value: true }],
  }));

  const initialFlags = { 'chapter.arrival.started': true };
  for (const path of chapterDonePaths) initialFlags[path.slice('flags.'.length)] = false;
  for (const event of document.scenario.events) initialFlags[event.completion[0].path.slice('flags.'.length)] = false;
  document.scenario.initialFlags = initialFlags;

  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);
}

await main();
