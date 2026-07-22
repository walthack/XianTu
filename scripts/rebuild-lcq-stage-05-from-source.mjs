#!/usr/bin/env node

// R2-11T：按 EPUB《六朝清羽记》第74–92章重建 lcq.stage_05。
// 保留十个冻结 event id；为原稿遗漏的关键转折与第85–92章过渡 append-only 补七拍。
// 本脚本只纠正来源、顺序、投影和人工完成合同，不解除默认线隔离。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash/qingyu');
const stagePath = join(generated, 'stages/lcq.stage_05.json');
const stagePlanPath = join(generated, 'stage-plan.json');
const backupDir = join(generated, 'stages-pre-r2-11t-source-rebuild-backup');
const backupPath = join(backupDir, 'lcq.stage_05.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};
const action = (id, label, actionText, options = {}) => ({ id, label, actionText, timeCost: 1, outcomeText, ...options });
const contract = actions => ({ kind: 'objective_action', settleOn: ['success'], actions });

const EVENTS = [
  {
    id: 'lcq.event.s05_01', name: '海神殿抵御鲛人',
    description: '天文大潮后，程宗扬与乐明珠被困废弃海神殿。鲛人因碧鲮族旧怨与朱狐冠发动袭击，程宗扬以珊瑚匕首和海蛇金角应战。',
    objective: '护住受困的乐明珠，并击退海神殿中的鲛人',
    locationId: 'liuchao.location.sea_temple',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu'],
    relatedFactionIds: ['liuchao.faction.biyu'],
    axisId: 'qingyu.76.1', axisSeq: 124, axisAnchor: '六朝清羽记·#76·第74章·鲛人',
    axisBeat: '鲛人现身攻击程宗扬和乐明珠，并因乐明珠头戴朱狐冠而疯狂进攻。', axisMethod: 'source-rebuilt',
    actions: [
      action('shield_mingzhu_from_merfolk', '护住乐明珠', '我先利用殿内石像和珊瑚匕首护住受困的乐明珠，辨清鲛人的攻击方向。', { kind: 'prepare', grantsPreparation: 'merfolk_attack_faced' }),
      action('repel_merfolk_with_sea_horn', '击退鲛人', '我抓住鲛人扑近的时机，以海蛇金角完成反击，让海神殿中的袭击暂时停下。', { requiresPreparation: ['merfolk_attack_faced'] }),
    ],
  },
  {
    id: 'lcq.event.s05_02', name: '拔除鱼叉救治乐明珠',
    description: '鲛人退去后，乐明珠仍被鱼叉卡住并持续失血；程宗扬必须先拔除鱼叉，再以她能够接受的方式稳定伤势。',
    objective: '拔除鱼叉并稳定乐明珠的伤势',
    locationId: 'liuchao.location.sea_temple',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu'],
    relatedFactionIds: ['liuchao.faction.guang_ming_guan_tang'],
    axisId: 'qingyu.77.1', axisSeq: 125, axisAnchor: '六朝清羽记·#77·第75章·戏问',
    axisBeat: '程宗扬帮助被鲛人鱼叉卡住的乐明珠脱困，拔除鱼叉并治疗伤势。', axisMethod: 'source-rebuilt',
    actions: [
      action('remove_mingzhu_harpoon', '拔除鱼叉', '我确认倒刺和伤口方向，稳住乐明珠后拔除鲛人留下的鱼叉。', { kind: 'prepare', grantsPreparation: 'harpoon_removed' }),
      action('stabilize_mingzhu_wound', '稳定伤势', '我立即止血包扎并确认乐明珠能够行动，不把救治过程扩写成后期关系。', { requiresPreparation: ['harpoon_removed'] }),
    ],
  },
  {
    id: 'lcq.event.s05_03', name: '谢艺讲述碧鲮旧战',
    description: '谢艺找到海神殿，讲述碧鲮族、鲛族与岳帅旧战，也指出朱狐冠牵连光明观堂往事；他希望程宗扬承接岳帅未竟之事，程宗扬仍保持警惕。',
    objective: '听清海湾旧战与朱狐冠来历，并回应谢艺的托付',
    locationId: 'liuchao.location.sea_temple',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu', 'liuchao.character.xie_yi'],
    relatedFactionIds: ['liuchao.faction.biyu', 'liuchao.faction.xing_yue_hu', 'liuchao.faction.guang_ming_guan_tang'],
    axisId: 'qingyu.78.3', axisSeq: 128, axisAnchor: '六朝清羽记·#78·第76章·回忆',
    axisBeat: '谢艺讲述碧鲮与鲛族旧战、朱狐冠来历，并希望程宗扬继承岳帅的使命。', axisMethod: 'source-rebuilt',
    actions: [
      action('hear_biyu_war_history', '听清旧战与朱狐冠线索', '我让谢艺把碧鲮、鲛族、岳帅旧战和朱狐冠的关联分别说清。', { kind: 'prepare', grantsPreparation: 'sea_history_heard' }),
      action('answer_xieyi_mission', '回应谢艺的托付', '我承认这些线索的重要性，但不把相似等同于继承，明确保留自己的判断。', { requiresPreparation: ['sea_history_heard'] }),
    ],
  },
  {
    id: 'lcq.event.s05_07', name: '失踪搜寻与鬼王峒使者抵达',
    description: '商队仍未找到祁远、石刚等失踪者，阿夕的异常也让程宗扬警觉；鬼王峒使者乘白象抵达海湾，迫使残余队伍暂停撤离。',
    objective: '收拢残余商队，并确认鬼王峒使者已经抵达海湾',
    locationId: 'liuchao.location.biyu_village',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.a_xi', 'liuchao.character.qi_yuan', 'lcq.character.np006'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.gui_wang_dong'],
    axisId: 'qingyu.79.3', axisSeq: 131, axisAnchor: '六朝清羽记·#79·第77章·进贡',
    axisBeat: '商队搜寻失踪者未果之际，鬼王峒使者乘白象抵达海湾。', axisMethod: 'source-rebuilt',
    actions: [
      action('account_for_missing_caravan', '清点失踪与留守人员', '我核对仍失踪的祁远、石刚等人和能够行动的队员，先定下撤离底线。', { kind: 'prepare', grantsPreparation: 'caravan_accounted' }),
      action('observe_guiwang_envoy_arrival', '确认使者抵达', '白象与鬼王峒使者出现后，我停止贸然撤离，观察使者与碧鲮首领的接触。', { requiresPreparation: ['caravan_accounted'] }),
    ],
  },
  {
    id: 'lcq.event.s05_04', name: '以兵器生意化解危机',
    description: '祁远被碧鲮老者告发后冒充军火商人，程宗扬顺势以回扣打动阁罗，双方敲定兵器交易，商队暂时从俘虏变成客商。',
    objective: '接住祁远的军火商说辞，并以回扣敲定兵器交易',
    locationId: 'liuchao.location.biyu_village',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qi_yuan', 'lcq.character.np006'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.gui_wang_dong'],
    axisId: 'qingyu.80.3', axisSeq: 134, axisAnchor: '六朝清羽记·#80·第78章·转机',
    axisBeat: '祁远以兵器商身份谈判，程宗扬用回扣敲定交易，使商队获得阁罗信任。', axisMethod: 'source-rebuilt',
    actions: [
      action('support_qiyuan_arms_cover', '接住军火商说辞', '我沿着祁远的说法补足货源与交易条件，让阁罗相信我们是能供货的客商。', { kind: 'prepare', grantsPreparation: 'arms_cover_accepted' }),
      action('settle_geluo_kickback', '敲定回扣与交易', '我把给阁罗的回扣和兵器交易条件说透，换取商队人员暂时安全。', { requiresPreparation: ['arms_cover_accepted'] }),
    ],
  },
  {
    id: 'lcq.event.s05_06', name: '查出鬼王峒眼线',
    description: '程宗扬从阁罗口中得知碧姬与小紫的关系，又与云苍峰判断鬼王峒购置军器另有图谋；两人随后发现潜伏偷听的眼线并阻止消息外泄。',
    objective: '厘清兵器交易背后的危险，并处置偷听的鬼王峒眼线',
    locationId: 'liuchao.location.biyu_village',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yun_cang_feng', 'liuchao.character.xiao_zi', 'liuchao.character.bi_ji'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong', 'liuchao.faction.yun_shi_shang_hui', 'liuchao.faction.biyu'],
    axisId: 'qingyu.81.3', axisSeq: 137, axisAnchor: '六朝清羽记·#81·第79章·眼线',
    axisBeat: '程宗扬与云苍峰分析军器图谋，并发现潜伏偷听的鬼王峒眼线。', axisMethod: 'source-rebuilt',
    actions: [
      action('assess_guiwang_arms_intent', '分析军器图谋', '我与云苍峰把鬼王峒采购数量、用途和北上风险逐项对照，确认这不只是普通交易。', { kind: 'prepare', grantsPreparation: 'arms_intent_assessed' }),
      action('stop_guiwang_spy', '处置偷听眼线', '发现偷听者后，我立即阻断其传讯并完成现场处置，避免商队判断外泄。', { requiresPreparation: ['arms_intent_assessed'] }),
    ],
  },
  {
    id: 'lcq.event.debut_xiaozi', name: '小紫以碧鲮少女身份现身', critical: false,
    description: '程宗扬在海边发现黑舌的诡异尸体，随后遇到以天真无知姿态出现的小紫。此时只能确认她是碧鲮少女，不能提前写入毒宗嫡传、岳帅遗孤或后期掌控者身份。',
    objective: '记录黑舌死亡疑点，并以眼前身份回应初次现身的小紫',
    locationId: 'liuchao.location.biyu_village',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi'],
    relatedFactionIds: ['liuchao.faction.biyu'],
    axisMethod: 'reviewed-no-anchor',
    actions: [
      action('inspect_blacktongue_death', '记录黑舌死亡疑点', '我检查黑舌被蚌壳困住溺死的现场，只记录可见痕迹，不先指定凶手。', { kind: 'prepare', grantsPreparation: 'blacktongue_clue_logged' }),
      action('meet_xiaozi_as_biyu_girl', '回应小紫初次现身', '我把小紫当作刚遇见的碧鲮少女回应，保留她的天真表象与来历疑点。', { requiresPreparation: ['blacktongue_clue_logged'] }),
    ],
  },
  {
    id: 'lcq.event.s05_16', name: '斩杀蛇傀解救碧鲮族',
    description: '鬼王峒蛇傀下令焚烧碧鲮族村寨，程宗扬率商队突袭并斩杀蛇傀及随从，使受制的碧鲮族人暂时脱离鬼王峒控制。',
    objective: '阻止蛇傀焚烧村寨，并解除鬼王峒对碧鲮族的现场控制',
    locationId: 'liuchao.location.biyu_village',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi', 'lcq.character.np004', 'liuchao.character.wu_er_lang'],
    relatedFactionIds: ['liuchao.faction.biyu', 'liuchao.faction.gui_wang_dong', 'liuchao.faction.yun_shi_shang_hui'],
    axisId: 'qingyu.82.2', axisSeq: 139, axisAnchor: '六朝清羽记·#82·第80章·前路',
    axisBeat: '鬼王峒蛇傀下令焚烧碧鲮族，程宗扬率众突袭斩杀蛇傀及随从，使碧鲮族暂时脱离控制。', axisMethod: 'source-rebuilt-append-only-review-fix',
    actions: [
      action('interrupt_snake_puppet_order', '打断蛇傀焚村命令', '蛇傀下令纵火时，我立即召集能够作战的人，从其随从与火源之间切入。', { kind: 'prepare', grantsPreparation: 'snake_puppet_assault_opened' }),
      action('defeat_snake_puppet_group', '斩杀蛇傀解救族人', '我配合商队突袭斩杀蛇傀及其随从，确认碧鲮族人已摆脱现场控制。', { requiresPreparation: ['snake_puppet_assault_opened'] }),
    ],
  },
  {
    id: 'lcq.event.s05_08', name: '古道废墟迎击鬼战士',
    description: '程宗扬追赶夺走朱狐冠的猴子后与商队失散，小紫带路抵达远古废墟；众人发现鬼脸标记并在易彪组织下迎击来袭的鬼王峒战士。',
    objective: '识别废墟中的鬼王峒标记，并协助易彪守住阵地',
    locationId: 'lcq.location.turtle_road_ruins',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi', 'lcq.character.np004'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong', 'liuchao.faction.yun_shi_shang_hui'],
    axisId: 'qingyu.84.2', axisSeq: 143, axisAnchor: '六朝清羽记·#84·第82章·迎敌',
    axisBeat: '众人在废墟确认鬼王峒营地标记，易彪率商队布阵迎击鬼战士。', axisMethod: 'source-rebuilt',
    actions: [
      action('identify_guiwang_ruins', '识别鬼脸标记', '我确认废墟中的鬼脸标记属于鬼王峒，立即把宿营转为迎敌准备。', { kind: 'prepare', grantsPreparation: 'ruins_defense_ready' }),
      action('support_yibiao_defense', '协助易彪守阵', '鬼战士来袭后，我配合易彪的阵形与弓弩火力守住废墟入口。', { requiresPreparation: ['ruins_defense_ready'] }),
    ],
  },
  {
    id: 'lcq.event.s05_05', name: '武二郎斩杀巫师达古',
    description: '巫师达古率数倍鬼战士压迫商队，谈判失败后武二郎以五虎断门刀杀穿防线并斩杀达古，失去巫术支撑的鬼战士随即崩溃。',
    objective: '撑住达古率领的围攻，见证武二郎斩杀巫师扭转战局',
    locationId: 'lcq.location.turtle_road_ruins',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.wu_er_lang', 'lcq.character.np004'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong', 'liuchao.faction.yun_shi_shang_hui'],
    axisId: 'qingyu.85.2', axisSeq: 145, axisAnchor: '六朝清羽记·#85·第83章·虎威',
    axisBeat: '武二郎杀穿鬼战士防线并一刀斩杀达古，商队转危为安。', axisMethod: 'source-rebuilt',
    actions: [
      action('hold_against_dagu_force', '撑住达古围攻', '谈判被拒后，我继续组织弓弩和近战防线，为武二郎突击争取空间。', { kind: 'prepare', grantsPreparation: 'dagu_line_held' }),
      action('witness_wuerlang_kill_dagu', '确认达古战败', '武二郎斩杀达古后，我确认鬼战士失去巫术支撑、商队已经脱险。', { requiresPreparation: ['dagu_line_held'] }),
    ],
  },
  {
    id: 'lcq.event.s05_09', name: '一阳境逼退阴煞',
    description: '阴煞袭击花苗营地时，程宗扬与苏荔一同受困。程宗扬丹田真气爆发，突破至一阳境并以阳气暂时逼退阴煞，但花苗仍付出伤亡。',
    objective: '护住苏荔并以一阳境阳气逼退阴煞',
    locationId: 'lcq.location.nanhuang_camp',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_li'],
    relatedFactionIds: ['liuchao.faction.hua_miao'],
    axisId: 'qingyu.86.2', axisSeq: 147, axisAnchor: '六朝清羽记·#86·第84章·阴煞',
    axisBeat: '程宗扬在阴煞袭击中突破至一阳境界，以阳气暂时克制阴煞。', axisMethod: 'source-rebuilt',
    actions: [
      action('shield_suli_from_yinsha', '护住苏荔', '阴煞逼近时，我先阻止苏荔以自己换取片刻安全，正面承受阴寒压力。', { kind: 'prepare', grantsPreparation: 'yinsha_pressure_faced' }),
      action('repel_yinsha_at_yiyang', '以一阳境逼退阴煞', '丹田真气爆发后，我稳住新破的一阳境，以阳气把阴煞暂时逼退。', { requiresPreparation: ['yinsha_pressure_faced'] }),
    ],
  },
  {
    id: 'lcq.event.s05_10', name: '结成探查鬼王峒的同行约定',
    description: '花苗伤亡之后，谢艺带回旧伤复发的凝羽；云苍峰表明云氏要探查鬼王峒，苏荔也说明红苗与黑獠的反抗计划。程宗扬确认三方只是平等合作。',
    objective: '安置凝羽，并与云氏、花苗谈清进入鬼王峒的合作边界',
    locationId: 'lcq.location.nanhuang_camp',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.ning_yu', 'liuchao.character.xie_yi', 'liuchao.character.yun_cang_feng', 'liuchao.character.su_li'],
    relatedFactionIds: ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.yun_shi_shang_hui', 'liuchao.faction.hua_miao'],
    axisId: 'qingyu.87.4', axisSeq: 151, axisAnchor: '六朝清羽记·#87·第85章·幽路',
    axisBeat: '众人安置旧伤复发的凝羽，并以平等合作方式商定探查鬼王峒。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('settle_ningyu_after_relapse', '安置旧伤复发的凝羽', '谢艺带回昏迷的凝羽后，我先确认她的旧伤和照护安排，不把后期来历写进当前诊断。', { kind: 'prepare', grantsPreparation: 'ningyu_settled' }),
      action('agree_equal_guiwang_probe', '谈清平等合作边界', '我与云苍峰、苏荔明确三方各自目的、可用人手和退出条件，以平等合作进入鬼王峒。', { requiresPreparation: ['ningyu_settled'] }),
    ],
  },
  {
    id: 'lcq.event.s05_11', name: '随弥骨进入鬼王峒',
    description: '商队到达鬼王峒入口，接待者弥骨试图带走苏荔，引发武二郎对峙；云苍峰与谢艺化解冲突后，队伍被带入迷宫般的洞窟与奴隶区。',
    objective: '阻止接待冲突升级，并记清进入鬼王峒后的路线与奴隶区',
    locationId: 'liuchao.location.guiwang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.wu_er_lang', 'liuchao.character.xie_yi', 'liuchao.character.yun_cang_feng', 'liuchao.character.su_li'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong', 'liuchao.faction.hua_miao'],
    axisId: 'qingyu.88.3', axisSeq: 154, axisAnchor: '六朝清羽记·#88·第86章·鬼峒',
    axisBeat: '接待冲突被化解后，商队深入鬼王峒多层洞穴与奴隶区。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('deescalate_migu_reception', '化解入口冲突', '接待者要带走苏荔、武二郎拔刀时，我配合云苍峰与谢艺把冲突压回交涉。', { kind: 'prepare', grantsPreparation: 'guiwang_entry_cleared' }),
      action('map_guiwang_slave_routes', '记清洞窟路线', '进入鬼王峒后，我沿途记录岔路、层级与奴隶区位置，也确认苏荔的脚铃联络没有回应。', { requiresPreparation: ['guiwang_entry_cleared'] }),
    ],
  },
  {
    id: 'lcq.event.s05_12', name: '白纸信笺与达古死讯',
    description: '白夷族交付的信笺打开仍是一张白纸，谢艺据此判断目的地可能不在鬼王峒；小紫随后当着阁罗说出达古已死，使商队一度陷入暴露危机。',
    objective: '保留白纸信笺疑点，并应对小紫说破达古死讯后的局面',
    locationId: 'liuchao.location.guiwang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xie_yi', 'liuchao.character.xiao_zi', 'lcq.character.np006'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong'],
    axisId: 'qingyu.89.2', axisSeq: 156, axisAnchor: '六朝清羽记·#89·第87章·淫戏',
    axisBeat: '白纸信笺引出目的地疑问；小紫当面说出达古死讯，使商队陷入危机。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('preserve_blank_letter_clue', '保留白纸信笺疑点', '我与谢艺确认信笺仍是白纸，只把目的地不明记录为推测。', { kind: 'prepare', grantsPreparation: 'blank_letter_logged' }),
      action('contain_dagu_revelation', '应对达古死讯暴露', '小紫说出达古已死后，我立即观察阁罗反应并调整说辞，避免商队当场被定为敌人。', { requiresPreparation: ['blank_letter_logged'] }),
    ],
  },
  {
    id: 'lcq.event.s05_13', name: '阁罗召来碧姬',
    description: '阁罗只展示鬼王峒的部分实力，不肯透露控制诸族的关键。随后他召来被峒中称作“碧奴”的碧姬；程宗扬首次当面见到谢艺寻找的人。',
    objective: '从阁罗口中确认控制线索的边界，并当面辨认碧姬',
    locationId: 'liuchao.location.guiwang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lcq.character.np006', 'liuchao.character.bi_ji', 'liuchao.character.xie_yi'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong', 'liuchao.faction.biyu'],
    axisId: 'qingyu.90.2', axisSeq: 158, axisAnchor: '六朝清羽记·#90·第88章·碧奴',
    axisBeat: '阁罗拒绝透露鬼王峒控制秘密，随后召来峒中称作“碧奴”的碧姬。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('probe_geluo_control_limits', '试探控制秘密', '我用兵器生意与诸族反应试探阁罗，只记录他明确展示或拒绝的内容。', { kind: 'prepare', grantsPreparation: 'geluo_limits_known' }),
      action('identify_biji_in_person', '当面辨认碧姬', '碧姬被召来后，我依据谢艺此前线索确认她的身份，同时区分本名与鬼王峒使用的蔑称。', { requiresPreparation: ['geluo_limits_known'] }),
    ],
  },
  {
    id: 'lcq.event.s05_14', name: '机关惊动后从山洞脱困',
    description: '有人触动机关，阁罗中断聚会赶去处置；混乱中程宗扬被困在岩壁附近，最终用匕首撬开岩石，找到一条可继续深入的山洞。',
    objective: '利用机关异动摆脱看守，并从岩壁中找出可通行山洞',
    locationId: 'liuchao.location.guiwang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lcq.character.np006'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong'],
    axisId: 'qingyu.92.1', axisSeq: 160, axisAnchor: '六朝清羽记·#92·第90章·觅源',
    axisBeat: '阁罗因机关异动离开后，程宗扬用匕首撬开岩石脱困并发现可通行山洞。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('use_alarm_to_break_watch', '借机关异动摆脱看守', '阁罗被机关惊动离开时，我利用守卫注意转移寻找脱身位置。', { kind: 'prepare', grantsPreparation: 'cave_escape_opened' }),
      action('pry_open_cave_passage', '撬开山洞通路', '我用匕首试探岩缝并撬开松动石块，确认前方山洞可以通行。', { requiresPreparation: ['cave_escape_opened'] }),
    ],
  },
  {
    id: 'lcq.event.s05_15', name: '确认红苗受控并护住苏荔',
    description: '程宗扬与苏荔沿山洞找到红苗盟友，却发现众人已经失神受控。回到阁罗视线后，程宗扬以要求私下会见碧姬为由转移阁罗注意，暂时护住苏荔。',
    objective: '确认红苗盟友已被鬼王峒控制，并把苏荔从阁罗手中暂时保下',
    locationId: 'liuchao.location.guiwang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.su_li', 'liuchao.character.dan_chen', 'lcq.character.np006', 'liuchao.character.bi_ji'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong', 'liuchao.faction.hong_miao', 'liuchao.faction.hua_miao'],
    axisId: 'qingyu.94.1', axisSeq: 162, axisAnchor: '六朝清羽记·#94·第92章·媚奴',
    axisBeat: '程宗扬确认红苗盟友已受控，并以会见碧姬为由暂时阻止阁罗带走苏荔。', axisMethod: 'source-rebuilt-append-only',
    actions: [
      action('confirm_redmiao_control', '确认红苗受控', '我与苏荔找到红苗人后，通过失神状态和无法回应确认他们已受鬼王峒控制。', { kind: 'prepare', grantsPreparation: 'redmiao_control_confirmed' }),
      action('redirect_geluo_from_suli', '转移阁罗注意护住苏荔', '面对阁罗对苏荔的企图，我以私下会见碧姬为由转移其注意，先把苏荔留在同行者一边。', { requiresPreparation: ['redmiao_control_confirmed'] }),
    ],
  },
];

const FROZEN_IDS = new Set([
  'lcq.event.debut_xiaozi',
  ...Array.from({ length: 9 }, (_, index) => `lcq.event.s05_${String(index + 1).padStart(2, '0')}`),
]);
const APPENDED_IDS = new Set(Array.from({ length: 7 }, (_, index) => `lcq.event.s05_${String(index + 10).padStart(2, '0')}`));
const ALLOWED_AFFILIATIONS = new Map([
  ['liuchao.character.cheng_zongyang', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.le_mingzhu', ['liuchao.faction.guang_ming_guan_tang']],
  ['liuchao.character.xiao_zi', ['liuchao.faction.biyu']],
  ['liuchao.character.xie_yi', ['liuchao.faction.xing_yue_hu']],
  ['liuchao.character.yun_cang_feng', ['liuchao.faction.yun_shi_shang_hui']],
  ['liuchao.character.ning_yu', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.wu_er_lang', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.su_li', ['liuchao.faction.hua_miao']],
  ['liuchao.character.qi_yuan', ['liuchao.faction.bai_hu_shang_guan']],
  ['lcq.character.np004', ['liuchao.faction.yun_shi_shang_hui']],
  ['lcq.character.np006', ['liuchao.faction.gui_wang_dong']],
  ['liuchao.character.bi_ji', ['liuchao.faction.gui_wang_dong', 'liuchao.faction.biyu']],
  ['liuchao.character.a_xi', ['liuchao.faction.hua_miao']],
  ['liuchao.character.dan_chen', ['liuchao.faction.hong_miao']],
]);

const minimalCharacter = (id, name, description, role, gender, origin, locationId) => ({
  id, name, description, role, gender, affiliations: [], ...(locationId ? { locationId } : {}), profile: { origin },
});
const MINIMAL_CHARACTERS = new Map([
  ['liuchao.character.cheng_zongyang', minimalCharacter('liuchao.character.cheng_zongyang', '程宗扬', '随商队深入南荒、刚在海湾大潮中与同伴失散的异乡人。', '商队成员', '男', '现代来客；此时仍受白湖商馆冰蛊约束。', 'liuchao.location.sea_temple')],
  ['liuchao.character.le_mingzhu', minimalCharacter('liuchao.character.le_mingzhu', '乐明珠', '光明观堂弟子，随程宗扬在海神殿受困并遭鲛人袭击。', '光明观堂弟子', '女', '光明观堂门下。', 'liuchao.location.sea_temple')],
  ['liuchao.character.xiao_zi', minimalCharacter('liuchao.character.xiao_zi', '小紫', '以天真无知姿态出现在海湾的碧鲮少女，真实心性与来历尚未揭开。', '碧鲮少女', '女', '碧鲮族少女；更深身份尚未揭露。', 'liuchao.location.biyu_village')],
  ['liuchao.character.xie_yi', minimalCharacter('liuchao.character.xie_yi', '谢艺', '温和沉稳的同行刀客，已向程宗扬讲述部分星月湖旧事。', '同行刀客', '男', '星月湖旧部。')],
  ['liuchao.character.yun_cang_feng', minimalCharacter('liuchao.character.yun_cang_feng', '云苍峰', '云氏商会执事，准备以平等合作方式探查鬼王峒。', '云氏商会执事', '男', '云氏商会执事。')],
  ['liuchao.character.ning_yu', minimalCharacter('liuchao.character.ning_yu', '凝羽', '白湖商馆护卫，南荒途中旧伤复发。', '商队护卫', '女', '白湖商馆护卫；更深来历尚未揭露。')],
  ['liuchao.character.wu_er_lang', minimalCharacter('liuchao.character.wu_er_lang', '武二郎', '随商队南行的白武族刀客，以五虎断门刀正面破阵。', '商队护卫', '男', '白武族勇士。')],
  ['liuchao.character.su_li', minimalCharacter('liuchao.character.su_li', '苏荔', '花苗族长，正联络红苗等部族反抗鬼王峒。', '花苗族长', '女', '花苗族长。')],
  ['liuchao.character.qi_yuan', minimalCharacter('liuchao.character.qi_yuan', '祁远', '熟悉南荒与交易门道的白湖商馆老伙计。', '商队管事', '男', '白湖商馆伙计。')],
  ['lcq.character.np004', minimalCharacter('lcq.character.np004', '易彪', '云氏商队护卫，善于组织队伍迎敌。', '商队护卫', '男', '云氏商队护卫。')],
  ['lcq.character.np006', minimalCharacter('lcq.character.np006', '阁罗', '代表鬼王峒接收贡物与洽谈兵器交易的使者。', '鬼王峒使者', '男', '鬼王峒使者。', 'liuchao.location.guiwang_dong')],
  ['liuchao.character.bi_ji', minimalCharacter('liuchao.character.bi_ji', '碧姬', '被鬼王峒控制的碧鲮族女子；峒中以“碧奴”蔑称她。', '鬼王峒舞姬', '女', '碧鲮族人，现受鬼王峒控制。', 'liuchao.location.guiwang_dong')],
  ['liuchao.character.a_xi', minimalCharacter('liuchao.character.a_xi', '阿夕', '随花苗队伍行动的女子，近期行为出现难以解释的异常。', '花苗族人', '女', '花苗族人。', 'liuchao.location.biyu_village')],
  ['liuchao.character.dan_chen', minimalCharacter('liuchao.character.dan_chen', '丹宸', '苏荔在红苗中的盟友之一，已显出受鬼王峒控制的迹象。', '红苗族人', '女', '红苗族人。', 'liuchao.location.guiwang_dong')],
]);

const completionPath = id => `flags.event.${id.split('.').at(-1)}.done`;

async function main() {
  if (!existsSync(backupPath)) {
    await mkdir(backupDir, { recursive: true });
    await cp(stagePath, backupPath);
  }
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const originalById = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const id of FROZEN_IDS) if (!originalById.has(id)) throw new Error(`frozen event missing: ${id}`);
  for (const id of originalById.keys()) if (!FROZEN_IDS.has(id) && !APPENDED_IDS.has(id)) throw new Error(`unexpected event id: ${id}`);

  document.manifest.name = '六朝清羽记·海湾遇袭至鬼王峒初探';
  document.manifest.description = 'Strict 模式，按《六朝清羽记》第74–92章重建：鲛人袭击、兵器交易、古道迎敌、阴煞与鬼王峒初探。';
  document.manifest.axisSeqLo = 124;
  document.manifest.axisSeqHi = 162;
  document.world.era = '碧鲮湾至鬼王峒初探';
  document.world.background = '天文大潮冲毁碧鲮湾竹楼，商队多人失踪。程宗扬与乐明珠已被困在废弃海神殿并取得珊瑚匕首；鲛人尚未发动正面袭击。';
  document.world.continents = document.world.continents.filter(item => item.id === 'liuchao.continent.nanhuang');
  document.scenario.opening.text = '大潮退去后，废弃海神殿里只剩潮声。你与乐明珠被困在石像之间，手中只有刚取得的珊瑚匕首；殿外水影正在逼近。';
  document.scenario.opening.playerRole = '海神殿中的受困商队成员';
  document.scenario.opening.locationId = 'liuchao.location.sea_temple';
  document.scenario.opening.featuredCharacterIds = ['liuchao.character.le_mingzhu'];

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

  const factionPool = new Map(document.canon.factions.map(faction => [faction.id, faction]));
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
    structuredClone(locationPool.get('liuchao.location.sea_temple')),
    structuredClone(locationPool.get('liuchao.location.biyu_village')),
    { id: 'lcq.location.turtle_road_ruins', name: '龟纹古道废墟', description: '南荒密林中的远古废墟，留有鬼王峒鬼脸标记。', type: '遗迹', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 4700, y: 7700 }, features: [] },
    { id: 'lcq.location.nanhuang_camp', name: '花苗营地', description: '古道战后临时扎营之地，阴煞曾在夜间来袭。', type: '营地', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 4900, y: 7900 }, features: [] },
    structuredClone(locationPool.get('liuchao.location.guiwang_dong')),
  ];
  if (document.canon.locations.some(item => !item)) throw new Error('required location missing');

  document.canon.relationships = [];
  document.canon.factionRelationships = [];
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.le_mingzhu', relation: '同行者', favorability: 35 },
    { characterId: 'liuchao.character.xiao_zi', relation: '初识的碧鲮少女', favorability: 0 },
    { characterId: 'liuchao.character.xie_yi', relation: '同行刀客', favorability: 30 },
  ];

  document.scenario.events = EVENTS.map((definition, index) => {
    const { actions, ...eventDefinition } = definition;
    const previous = EVENTS[index - 1];
    return {
      ...eventDefinition,
      critical: definition.critical !== false,
      conditions: index === 0
        ? [{ path: 'flags.chapter.lcq.stage_05.started', operator: 'eq', value: true }]
        : [{ path: completionPath(previous.id), operator: 'eq', value: true }],
      completion: structuredClone(originalById.get(definition.id)?.completion || [{ path: completionPath(definition.id), operator: 'eq', value: true }]),
      playerCompletionContract: contract(actions),
    };
  });
  document.scenario.chapters = [{
    id: 'lcq.chapter.stage_05',
    title: '第74–92章·碧鲮湾至鬼王峒初探',
    summary: '程宗扬从海神殿鲛人袭击中脱身，以兵器生意混入鬼王峒势力范围，经历古道迎敌与阴煞后进入洞窟，确认红苗盟友已受控制并暂时护住苏荔。',
    activation: [{ path: 'flags.chapter.lcq.stage_05.started', operator: 'eq', value: true }],
    completion: [{ path: 'flags.event.s05_15.done', operator: 'eq', value: true }],
    eventIds: EVENTS.map(event => event.id),
  }];
  document.scenario.initialFlags = {
    'chapter.lcq.stage_05.started': true,
    'chapter.lcq.stage_05.done': false,
    ...Object.fromEntries(EVENTS.map(event => [`event.${event.id.split('.').at(-1)}.done`, false])),
  };

  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);

  const stagePlan = JSON.parse(await readFile(stagePlanPath, 'utf8'));
  const plan = stagePlan.stages.find(item => item.id === 'lcq.stage_05');
  if (!plan) throw new Error('stage plan entry missing');
  Object.assign(plan, {
    title: '碧鲮湾至鬼王峒初探',
    era: '碧鲮湾至鬼王峒初探',
    imminentConflict: '程宗扬与乐明珠已被大潮困在海神殿，水影逼近；鲛人袭击尚未落账。',
    completedFacts: ['碧鲮湾遭遇天文大潮', '程宗扬与乐明珠被困海神殿', '程宗扬已取得珊瑚匕首'],
    forbiddenFutureFacts: ['鲛人已被击退', '谢艺已托付岳帅使命', '祁远已谈成兵器生意', '小紫真实心性已经揭露', '商队已进入鬼王峒', '碧姬已经现身', '红苗盟友已经受控'],
    featuredCharacters: ['程宗扬', '乐明珠', '谢艺', '小紫', '苏荔', '阁罗'],
    reason: '从第74章鲛人袭击开始，依次经历碧鲮湾、古道迎敌和鬼王峒初探；第93章碧姬与小紫关系冲突由下一关承接。',
    mappingReason: '旧稿重复绑定 qingyu.76.1 与 qingyu.85.2，事件顺序跨章倒置，并在第84章阴煞后提前收尾，漏掉第85–92章进入鬼王峒、碧姬现身、脱困与红苗受控等必要过渡。冻结 ID 逐拍重写，append-only 补 s05_10–15。',
  });
  await writeFile(stagePlanPath, `${JSON.stringify(stagePlan, null, 2)}\n`);
}

await main();
