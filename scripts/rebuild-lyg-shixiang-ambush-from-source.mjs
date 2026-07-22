#!/usr/bin/env node

// R2-11U：按《六朝燕歌行》source 69–84 重建 lyg.shixiang_ambush。
// 保留九个冻结 event id，并以 append-only 五拍补齐长安年节至水香楼后的承重转折。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash/yange');
const stagePath = join(generated, 'stages/lyg.shixiang_ambush.json');
const stagePlanPath = join(generated, 'stage-plan.json');
const backupDir = join(generated, 'stages-pre-r2-11u-source-rebuild-backup');
const backupPath = join(backupDir, 'lyg.shixiang_ambush.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};
const action = (id, label, actionText, options = {}) => ({ id, label, actionText, timeCost: 1, outcomeText, ...options });
const contract = actions => ({ kind: 'objective_action', settleOn: ['success'], actions });

const EVENTS = [
  {
    id: 'lyg.event.shixiang_s10', name: '听取北司与佛门动向',
    description: '杨玉环召程宗扬到紫云楼，说明北司宦官正借佛门查探他的底细；潘金莲在旁观察，使这场情报交换也带上试探意味。',
    objective: '从杨玉环处厘清北司与佛门的查探方向', locationId: 'lyg.location.ziyun_lou',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yang_yuhuan', 'liuchao.character.pan_jinlian'],
    relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting', 'liuchao.faction.shi_fang_cong_lin'],
    axisId: 'yange.69.2', axisSeq: 1093, axisAnchor: '六朝燕歌行·#69·第669章·公敌',
    axisBeat: '杨玉环说明北司宦官正借佛门查探程宗扬底细，潘金莲在旁观察。',
    actions: [
      action('separate_palace_and_buddhist_leads', '拆分两路查探', '我请杨玉环分别说明北司与佛门掌握的线索，不把两路势力预先视为同一主使。', { kind: 'prepare', grantsPreparation: 'palace_buddhist_leads_split' }),
      action('set_response_boundary', '确定应对边界', '我据此确定眼下只做防备与查证，不提前触发尚未发生的水香楼杀局。', { requiresPreparation: ['palace_buddhist_leads_split'] }),
    ],
  },
  {
    id: 'lyg.event.investigate_te_master', name: '潜入青龙寺查探特大师',
    description: '释特昧普以强制灌顶收服摩尼寺并杀死阿诺后，程宗扬与小紫潜入青龙寺，发现分赃、波斯女信徒与黑魔海女忍线索，随即谨慎撤离。',
    objective: '潜入青龙寺确认释特昧普的扩张方式与外援', locationId: 'lyg.location.qinglongsi',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi', 'lyg.character.shi_temeipu', 'liuchao.character.fei_niao_ying_zi'],
    relatedFactionIds: ['lyg.faction.qinglongsi', 'liuchao.faction.shi_fang_cong_lin', 'liuchao.faction.hei_mo_hai', 'liuchao.faction.x3a190100e6'],
    axisId: 'yange.72.1', axisSeq: 1096, axisAnchor: 'yange.71.1+yange.72.1',
    axisBeat: '程宗扬与小紫潜入青龙寺，发现释特昧普分赃、波斯信徒与黑魔海女忍线索后撤离。',
    actions: [
      action('observe_qinglongsi_spoils', '查明寺内异状', '我与小紫隐蔽观察青龙寺内的分赃与外来人员，记录释特昧普扩张后的可见证据。', { kind: 'prepare', grantsPreparation: 'qinglongsi_evidence_logged' }),
      action('withdraw_before_exposure', '在暴露前撤离', '确认黑魔海女忍也在场后，我停止深入，在身份暴露前带小紫撤出青龙寺。', { requiresPreparation: ['qinglongsi_evidence_logged'] }),
    ],
  },
  {
    id: 'lyg.event.shixiang_s11', name: '接受鸿胪寺补救安排',
    description: '段文楚为此前失礼道歉，交还使节礼遇并同意程宗扬参加元正朝会，使他重新获得公开进入唐廷议程的渠道。',
    objective: '确认鸿胪寺恢复的礼遇与元正朝会资格', locationId: 'lyg.location.xuanping_fang',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.np031'], relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.73.1', axisSeq: 1097, axisAnchor: '六朝燕歌行·#73·第673章·双燕',
    axisBeat: '段文楚登门致歉，恢复使节礼遇并确认程宗扬可参加元正朝会。',
    actions: [
      action('verify_envoy_privileges', '核对使节礼遇', '我让段文楚把恢复的出入与居停礼遇逐项说清，避免口头致歉替代实际安排。', { kind: 'prepare', grantsPreparation: 'envoy_privileges_verified' }),
      action('accept_new_year_court_access', '确认元正朝会资格', '我接受补救安排，并确认自己将以汉使身份参加元正朝会。', { requiresPreparation: ['envoy_privileges_verified'] }),
    ],
  },
  {
    id: 'lyg.event.shixiang_s12', name: '见证慈恩寺红莲演法',
    description: '窥基接待乐从训与观海，红莲演法暴露密宗势力的进逼；唐皇随后亲临大慈恩寺，要求窥基约束僧众。',
    objective: '确认红莲演法与唐皇敕令之间的张力', locationId: 'lyg.location.daciensi',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.kuiji', 'lyg.character.guan_hai', 'lyg.character.np041', 'liuchao.character.li_ang'],
    relatedFactionIds: ['lyg.faction.daciensi', 'liuchao.faction.shi_fang_cong_lin', 'liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.75.2', axisSeq: 1100, axisAnchor: 'yange.74.1+yange.75.2',
    axisBeat: '红莲演法后，唐皇亲临大慈恩寺并要求窥基约束僧众。',
    actions: [
      action('record_red_lotus_alignment', '记录寺内结盟迹象', '我把窥基、观海与乐从训在红莲演法中的立场分别记下，确认佛门内部并非铁板一块。', { kind: 'prepare', grantsPreparation: 'red_lotus_alignment_logged' }),
      action('compare_emperor_restraint_order', '对照唐皇敕令', '唐皇要求约束僧众后，我对照寺内实际动向，判断敕令能否真正限制密宗扩张。', { requiresPreparation: ['red_lotus_alignment_logged'] }),
    ],
  },
  {
    id: 'lyg.event.shixiang_s13', name: '元正朝会辨认地球仪',
    description: '元正朝会上，徐君房展示地球仪并自称秦国使者。程宗扬认出其现代地理知识，却必须先判断这份异世线索的真伪与政治风险。',
    objective: '核验徐君房的地球仪知识与秦使说辞', locationId: 'lyg.location.daming_palace',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xu_junfang', 'liuchao.character.li_ang'],
    relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.77.1', axisSeq: 1102, axisAnchor: 'yange.76.1+yange.77.1',
    axisBeat: '徐君房在元正朝会展示地球仪并自称秦国使者。',
    actions: [
      action('test_globe_knowledge', '核验地球仪知识', '我用不暴露自身来历的问题核验徐君房对地球仪与地理的理解。', { kind: 'prepare', grantsPreparation: 'globe_claim_tested' }),
      action('record_qin_envoy_claim', '记录秦使说辞', '我把徐君房自称秦使的说法与朝会反应分别记下，暂不替唐廷确认其身份。', { requiresPreparation: ['globe_claim_tested'] }),
    ],
  },
  {
    id: 'lyg.event.track_dagger_attacker', name: '追查宣平坊宦官命案',
    description: '一名宦官在宣平坊外被刺杀，现场留下针对宦官的口号。程宗扬需要判断这是私人复仇、党争信号还是诱饵。',
    objective: '勘查宦官命案并保留多种幕后可能', locationId: 'lyg.location.xuanping_fang',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang'], relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.77.2', axisSeq: 1103, axisAnchor: '六朝燕歌行·#77·朝会',
    axisBeat: '宦官在宣平坊外遭刺杀，现场留下针对宦官的口号。',
    actions: [
      action('inspect_eunuch_murder_scene', '勘查命案现场', '我核对尸体、出入口与口号留下方式，先区分事实和刻意布置。', { kind: 'prepare', grantsPreparation: 'eunuch_murder_logged' }),
      action('preserve_motive_branches', '保留幕后分支', '我把私人复仇、朝局冲突与诱饵三种可能分别立档，不因口号直接锁定主使。', { requiresPreparation: ['eunuch_murder_logged'] }),
    ],
  },
  {
    id: 'lyg.event.shixiang_s14', name: '探查废弃兴庆宫',
    description: '程宗扬一行进入废弃的兴庆宫，在荒废宫苑中发现悬空的地下入口，确认宫城下方另有隐秘通路。',
    objective: '勘查兴庆宫并标记地下入口', locationId: 'lyg.location.xingqing_palace',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yang_yuhuan'], relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.78.1', axisSeq: 1104, axisAnchor: '六朝燕歌行·#78·街险',
    axisBeat: '众人探索废弃兴庆宫，发现隐藏在宫苑中的地下入口。',
    actions: [
      action('survey_abandoned_palace', '勘查废弃宫苑', '我沿兴庆宫的残垣与旧路排查异常，确认没有把后续通道位置预先写进地图。', { kind: 'prepare', grantsPreparation: 'xingqing_route_surveyed' }),
      action('mark_underground_entrance', '标记地下入口', '发现悬空入口后，我记录方位与进入风险，暂不越过本段证据继续推演。', { requiresPreparation: ['xingqing_route_surveyed'] }),
    ],
  },
  {
    id: 'lyg.event.escape_or_counter', name: '处置太子误伤风波',
    description: '杨玉环误射太子李弘，义姁紧急救治；程宗扬必须在太子伤势稳定前封锁现场，并以虚构刺客说法争取处置时间。',
    objective: '稳定太子伤势并控制误伤消息', locationId: 'lyg.location.daming_palace',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yang_yuhuan', 'liuchao.character.yi_xin'],
    relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.79.1', axisSeq: 1105, axisAnchor: '六朝燕歌行·#79·美射',
    axisBeat: '杨玉环误射太子，义姁施救，众人以虚构刺客说法掩护现场。',
    actions: [
      action('secure_prince_treatment', '护住救治现场', '我先封锁现场并协助义姁取得救治空间，确保太子伤势不因混乱恶化。', { kind: 'prepare', grantsPreparation: 'prince_treatment_secured' }),
      action('contain_accidental_shooting', '控制误伤消息', '伤势暂稳后，我统一对外口径为追查虚构刺客，争取查清与善后的时间。', { requiresPreparation: ['prince_treatment_secured'] }),
    ],
  },
  {
    id: 'lyg.event.lure_pan_jinlian', name: '迁入水香楼布置诱捕',
    description: '程宗扬将家眷迁入水香楼，布置明暗哨与包围圈，准备在不惊动周边势力的情况下引出潘金莲。',
    objective: '完成水香楼警戒与诱捕布置', locationId: 'lyg.location.shuixiang_lou',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.pan_jinlian', 'liuchao.character.xiao_zi'],
    relatedFactionIds: ['liuchao.faction.guang_ming_guan_tang'],
    axisId: 'yange.79.2', axisSeq: 1106, axisAnchor: '六朝燕歌行·#79·美射',
    axisBeat: '程宗扬将家眷迁至水香楼，设明暗哨和包围圈准备引出潘金莲。',
    actions: [
      action('establish_shuixiang_watch', '布置明暗哨', '我按水香楼出入口安排明暗哨，先确保家眷与无关人员可以撤离。', { kind: 'prepare', grantsPreparation: 'shuixiang_watch_ready' }),
      action('set_pan_capture_lane', '设置诱捕区', '警戒就位后，我划定只针对潘金莲的诱捕区，避免把其他来客预判为敌人。', { requiresPreparation: ['shuixiang_watch_ready'] }),
    ],
  },
  {
    id: 'lyg.event.ambush_at_shuixiang', name: '识破毒方刺客',
    description: '假扮王府小厮的刺客送来涂有麻痹毒药的药方，使程宗扬与成光中毒倒地后藏入楼内。程宗扬必须先稳住毒势，再封锁水香楼。',
    objective: '控制麻痹毒势并封锁刺客藏身范围', locationId: 'lyg.location.shuixiang_lou',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.cheng_guang'], relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.80.1', axisSeq: 1107, axisAnchor: '六朝燕歌行·#80·行刺',
    axisBeat: '刺客假扮小厮送来涂毒药方，使程宗扬与成光麻痹后藏入楼内。',
    actions: [
      action('stabilize_prescription_poison', '稳住麻痹毒势', '我阻止继续接触药方，检查自己与成光的中毒程度并发出警讯。', { kind: 'prepare', grantsPreparation: 'prescription_poison_contained' }),
      action('seal_hidden_assassin_routes', '封锁刺客退路', '毒势受控后，我命明暗哨封住楼内通道，缩小假小厮的藏身范围。', { requiresPreparation: ['prescription_poison_contained'] }),
    ],
  },
  {
    id: 'lyg.event.final_showdown', name: '制止池畔混战并擒获女忍',
    description: '潘金莲与黑魔海女忍飞鸟萤子在水香楼交锋，战斗延伸至池畔并出现毒烟。程宗扬识破飞鸟萤子的示弱，将其制伏并结束混战。',
    objective: '隔离毒烟并擒获飞鸟萤子', locationId: 'lyg.location.shuixiang_lou',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.pan_jinlian', 'liuchao.character.fei_niao_ying_zi'],
    relatedFactionIds: ['liuchao.faction.hei_mo_hai', 'liuchao.faction.guang_ming_guan_tang'],
    axisId: 'yange.81.1', axisSeq: 1110, axisAnchor: 'yange.80.2+yange.80.3+yange.81.1',
    axisBeat: '水香楼池畔混战中，程宗扬识破飞鸟萤子的示弱并将其擒获。',
    actions: [
      action('clear_poolside_toxic_smoke', '隔离池畔毒烟', '我先让无关人员退出毒烟范围，并切断潘金莲与女忍继续缠斗的路线。', { kind: 'prepare', grantsPreparation: 'poolside_hazard_cleared' }),
      action('capture_feiniao_feint', '识破示弱并擒敌', '飞鸟萤子佯装无力时，我保持戒备、封住反击角度并将她制伏。', { requiresPreparation: ['poolside_hazard_cleared'] }),
    ],
  },
  {
    id: 'lyg.event.raid_qinglongsi', name: '爆破摩尼寺营救女师',
    description: '观海等密宗僧人拷问摩尼女师并强行灌顶。程宗扬引爆僧舍试图救人，虽未能救出女师，却确认密宗转化手段已经用于俘虏。',
    objective: '制造营救窗口并确认女师是否脱险', locationId: 'lyg.location.qinglongsi',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.guan_hai'], relatedFactionIds: ['lyg.faction.qinglongsi', 'liuchao.faction.x3a190100e6'],
    axisId: 'yange.83.1', axisSeq: 1113, axisAnchor: '六朝燕歌行·#83·天雷',
    axisBeat: '观海强行度化摩尼女师，程宗扬引爆僧舍但未能将她救出。',
    actions: [
      action('open_mani_rescue_window', '引爆僧舍制造窗口', '我在确认俘虏位置后引爆僧舍外围，为撤离制造短暂窗口。', { kind: 'prepare', grantsPreparation: 'mani_rescue_window_opened' }),
      action('verify_mani_rescue_outcome', '确认营救结果', '撤离前我确认女师未能脱险，并把失败结果与密宗灌顶证据如实记录。', { requiresPreparation: ['mani_rescue_window_opened'] }),
    ],
  },
  {
    id: 'lyg.event.forewarned_from_xinyong', name: '信永揭示蕃密邪径',
    description: '信永拜访程宗扬，说明蕃密灌顶与释特昧普败坏佛门的内幕，并建议暂避锋芒；程宗扬在掌握风险后选择继续抵抗。',
    objective: '听清蕃密内幕并作出有依据的应对决定', locationId: 'lyg.location.xuanping_fang',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xin_yong', 'lyg.character.shi_temeipu'],
    relatedFactionIds: ['liuchao.faction.suo_fan_si', 'liuchao.faction.shi_fang_cong_lin'],
    axisId: 'yange.83.2', axisSeq: 1114, axisAnchor: '六朝燕歌行·#83·天雷',
    axisBeat: '信永揭露蕃密邪径并建议避让，程宗扬决定继续抵抗。',
    actions: [
      action('hear_tantric_warning', '听清蕃密内幕', '我让信永区分亲眼所见、佛门传闻与个人判断，厘清释特昧普的真实手段。', { kind: 'prepare', grantsPreparation: 'tantric_warning_heard' }),
      action('choose_informed_resistance', '决定继续抵抗', '掌握风险后，我拒绝无准备地硬闯，但明确不会因威胁放弃查证与抵抗。', { requiresPreparation: ['tantric_warning_heard'] }),
    ],
  },
  {
    id: 'lyg.event.capture_feiniao', name: '审讯飞鸟萤子',
    description: '程宗扬审讯被俘的飞鸟萤子，承认与其兄之死有关并提出三个问题；飞鸟萤子拒绝合作，审讯没有得到可靠口供。',
    objective: '完成三项询问并如实记录拒答结果', locationId: 'lyg.location.shuixiang_lou',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.fei_niao_ying_zi'], relatedFactionIds: ['liuchao.faction.hei_mo_hai'],
    axisId: 'yange.84.1', axisSeq: 1115, axisAnchor: '六朝燕歌行·#84·蕃密',
    axisBeat: '程宗扬向飞鸟萤子提出三个问题，飞鸟萤子拒绝合作。',
    actions: [
      action('state_feiniao_case_context', '说明审讯前提', '我先说明她兄长之死与当前俘虏状态，不以虚假承诺换取口供。', { kind: 'prepare', grantsPreparation: 'feiniao_context_stated' }),
      action('record_feiniao_refusal', '完成询问并记录拒答', '我依次提出三个问题，并将飞鸟萤子的拒绝合作记录为结果，不伪造情报收获。', { requiresPreparation: ['feiniao_context_stated'] }),
    ],
  },
];

const FROZEN_IDS = new Set([
  'lyg.event.ambush_at_shuixiang', 'lyg.event.forewarned_from_xinyong', 'lyg.event.investigate_te_master',
  'lyg.event.lure_pan_jinlian', 'lyg.event.capture_feiniao', 'lyg.event.track_dagger_attacker',
  'lyg.event.raid_qinglongsi', 'lyg.event.escape_or_counter', 'lyg.event.final_showdown',
]);
const APPENDED_IDS = new Set(Array.from({ length: 5 }, (_, index) => `lyg.event.shixiang_s${index + 10}`));

const character = (id, name, description, role, gender, origin, locationId) => ({
  id, name, description, role, gender, affiliations: [], ...(locationId ? { locationId } : {}), profile: { origin },
});
const CHARACTERS = new Map([
  ['liuchao.character.cheng_zongyang', character('liuchao.character.cheng_zongyang', '程宗扬', '汉国舞阳侯与使节，刚被十方丛林列为佛门公敌。', '汉使', '男', '现代来客。', 'lyg.location.xuanping_fang')],
  ['liuchao.character.xiao_zi', character('liuchao.character.xiao_zi', '小紫', '程宗扬的未婚妻与行动搭档，擅长毒术、机关与隐蔽侦察。', '行动搭档', '女', '岳帅遗孤、黑魔海毒宗传人；此时身份已揭露。', 'lyg.location.xuanping_fang')],
  ['liuchao.character.yang_yuhuan', character('liuchao.character.yang_yuhuan', '杨玉环', '唐国镇国大长公主，向程宗扬提供宫廷与北司情报。', '镇国大长公主', '女', '唐国宗室。', 'lyg.location.ziyun_lou')],
  ['liuchao.character.pan_jinlian', character('liuchao.character.pan_jinlian', '潘金莲', '光明观堂鹤羽剑姬，正与程宗扬彼此试探。', '鹤羽剑姬', '女', '光明观堂弟子。')],
  ['lyg.character.shi_temeipu', character('lyg.character.shi_temeipu', '释特昧普', '以强制灌顶扩张势力的蕃密领袖。', '青龙寺蕃密首领', '男', '大孚灵鹫寺首座。', 'lyg.location.qinglongsi')],
  ['lyg.character.kuiji', character('lyg.character.kuiji', '窥基', '大慈恩寺主持，奉十方丛林法旨敌视程宗扬。', '大慈恩寺主持', '男', '十方丛林高层僧侣。', 'lyg.location.daciensi')],
  ['lyg.character.guan_hai', character('lyg.character.guan_hai', '观海', '追随释特昧普演法并执行灌顶的密宗僧人。', '密宗僧人', '男', '释特昧普同门。', 'lyg.location.qinglongsi')],
  ['lyg.character.np041', character('lyg.character.np041', '乐从训', '受邀观看红莲演法的唐廷军政人物。', '唐廷军政人物', '男', '唐国人物。', 'lyg.location.daciensi')],
  ['lyg.character.np031', character('lyg.character.np031', '段文楚', '负责使节礼仪并登门补救失礼的鸿胪寺少卿。', '鸿胪寺少卿', '男', '唐国官员。', 'lyg.location.xuanping_fang')],
  ['liuchao.character.li_ang', character('liuchao.character.li_ang', '李昂', '受宦官掣肘但仍试图约束佛门的唐国皇帝。', '唐皇', '男', '唐国皇帝。', 'lyg.location.daming_palace')],
  ['liuchao.character.xu_junfang', character('liuchao.character.xu_junfang', '徐君房', '在元正朝会展示地球仪并自称秦国使者的异人。', '自称秦使的异人', '男', '来历待核。', 'lyg.location.daming_palace')],
  ['liuchao.character.yi_xin', character('liuchao.character.yi_xin', '义姁', '光明观堂医者，在太子误伤后负责紧急救治。', '医者', '女', '光明观堂弟子。', 'lyg.location.daming_palace')],
  ['liuchao.character.cheng_guang', character('liuchao.character.cheng_guang', '成光', '随程宗扬居于水香楼并一同接触毒方的侍从。', '内宅侍从', '女', '已被程宗扬收编。', 'lyg.location.shuixiang_lou')],
  ['liuchao.character.fei_niao_ying_zi', character('liuchao.character.fei_niao_ying_zi', '飞鸟萤子', '受黑魔海线索牵引进入长安的东瀛女忍。', '女忍刺客', '女', '东瀛忍者。', 'lyg.location.shuixiang_lou')],
  ['liuchao.character.xin_yong', character('liuchao.character.xin_yong', '信永', '熟悉十方丛林内情、愿向程宗扬示警的娑梵寺僧人。', '情报提供者', '男', '娑梵寺僧人。')],
]);

const LEGACY_COMPLETION_PATHS = new Map([
  ['lyg.event.ambush_at_shuixiang', 'flags.event.ambush_at_shuixiang.triggered'],
  ['lyg.event.forewarned_from_xinyong', 'flags.event.forewarned_from_xinyong.triggered'],
  ['lyg.event.investigate_te_master', 'flags.event.investigate_te_master.triggered'],
  ['lyg.event.lure_pan_jinlian', 'flags.event.lure_pan_jinlian.triggered'],
  ['lyg.event.capture_feiniao', 'flags.event.capture_feiniao.done'],
  ['lyg.event.track_dagger_attacker', 'flags.event.track_dagger_attacker.triggered'],
  ['lyg.event.raid_qinglongsi', 'flags.event.raid_qinglongsi.done'],
  ['lyg.event.escape_or_counter', 'flags.event.escape_or_counter.triggered'],
  ['lyg.event.final_showdown', 'flags.event.final_showdown.triggered'],
]);
const completionPath = id => LEGACY_COMPLETION_PATHS.get(id) || `flags.event.${id.split('.').at(-1)}.done`;

async function main() {
  if (!existsSync(backupPath)) {
    await mkdir(backupDir, { recursive: true });
    await cp(stagePath, backupPath);
  }
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const sourceDocument = JSON.parse(await readFile(backupPath, 'utf8'));
  const originalById = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const id of FROZEN_IDS) if (!originalById.has(id)) throw new Error(`frozen event missing: ${id}`);
  for (const id of originalById.keys()) if (!FROZEN_IDS.has(id) && !APPENDED_IDS.has(id)) throw new Error(`unexpected event id: ${id}`);

  Object.assign(document.manifest, {
    name: '六朝燕歌行·长安佛门暗潮至水香楼余波',
    description: 'Strict 模式，按 source 69–84 重建：佛门敌意、元正朝会、兴庆宫疑道、水香楼混战与蕃密警告。',
    axisSeqLo: 1092, axisSeqHi: 1115,
  });
  document.world.era = '长安元正前后，十方丛林围猎初起';
  document.world.background = '十方丛林上院已将程宗扬列为佛门公敌，释特昧普即将由盩厔进入长安；水香楼邀局、毒方刺客与女忍混战均尚未发生。';
  document.world.continents = [structuredClone(sourceDocument.world.continents.find(item => item.id === 'liuchao.continent.zhongzhou'))];
  document.scenario.opening.text = '你刚从大慈恩寺送来的消息中确认：十方丛林已正式把你列为佛门公敌。杨玉环此刻派人请你去紫云楼，声称北司也在借佛门查你的底细。释特昧普尚未进入长安，下一步应先弄清谁在彼此借刀。';
  document.scenario.opening.playerRole = '汉国舞阳侯、汉使与程氏商会首领';
  document.scenario.opening.locationId = 'lyg.location.xuanping_fang';
  document.scenario.opening.featuredCharacterIds = ['liuchao.character.yang_yuhuan', 'liuchao.character.xiao_zi'];

  const requiredCharacterIds = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...EVENTS.flatMap(event => event.relatedCharacterIds),
  ]);
  document.canon.characters = [...requiredCharacterIds].map(id => structuredClone(CHARACTERS.get(id))).map(item => {
    if (!item) throw new Error('required minimal character missing');
    return item;
  });
  document.content.skills = [];
  document.content.techniques = [];
  document.content.items = [];
  document.rules.contentAccess = [];

  const factionPool = new Map([...sourceDocument.canon.factions, ...document.canon.factions].map(item => [item.id, item]));
  const requiredFactionIds = new Set(EVENTS.flatMap(event => event.relatedFactionIds));
  document.canon.factions = [...requiredFactionIds].map(id => structuredClone(factionPool.get(id))).map(item => {
    if (!item) throw new Error('required faction missing');
    delete item.headquartersLocationId;
    delete item.territory;
    return item;
  });
  const locationPool = new Map([...sourceDocument.canon.locations, ...document.canon.locations].map(item => [item.id, item]));
  const requiredLocationIds = new Set([
    document.scenario.opening.locationId,
    ...EVENTS.map(event => event.locationId),
    ...document.canon.characters.map(item => item.locationId).filter(Boolean),
  ]);
  document.canon.locations = [...requiredLocationIds].map(id => structuredClone(locationPool.get(id))).map(item => {
    if (!item) throw new Error('required location missing');
    return item;
  });
  document.canon.relationships = [];
  document.canon.factionRelationships = [];
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.xiao_zi', relation: '未婚妻与行动搭档', favorability: 90 },
    { characterId: 'liuchao.character.yang_yuhuan', relation: '盟友', favorability: 55 },
    { characterId: 'liuchao.character.pan_jinlian', relation: '相互试探', favorability: 10 },
    { characterId: 'liuchao.character.xin_yong', relation: '佛门情报盟友', favorability: 40 },
  ];

  document.scenario.events = EVENTS.map((definition, index) => {
    const { actions, ...base } = definition;
    const previous = EVENTS[index - 1];
    return {
      ...base, critical: true, axisMethod: 'source-rebuilt',
      conditions: index === 0
        ? [{ path: 'flags.chapter.lyg.shixiang_ambush.started', operator: 'eq', value: true }]
        : [{ path: completionPath(previous.id), operator: 'eq', value: true }],
      completion: [{ path: completionPath(definition.id), operator: 'eq', value: true }],
      playerCompletionContract: contract(actions),
    };
  });
  document.scenario.chapters = [
    {
      id: 'lyg.chapter.ambush', title: '佛门暗潮与使节回归',
      summary: '从杨玉环示警到青龙寺侦察、鸿胪寺补救与慈恩寺演法，确认长安佛门冲突的第一层结构。',
      completion: [{ path: 'flags.chapter.ambush.done', operator: 'eq', value: true }],
      eventIds: EVENTS.slice(0, 4).map(event => event.id),
    },
    {
      id: 'lyg.chapter.multiple_enemies', title: '元正朝会与宫城疑道',
      summary: '核验徐君房、勘查宦官命案与兴庆宫暗道，并处理太子误伤风波。',
      activation: [{ path: 'flags.chapter.ambush.done', operator: 'eq', value: true }],
      completion: [{ path: 'flags.chapter.multiple_enemies.done', operator: 'eq', value: true }],
      eventIds: EVENTS.slice(4, 8).map(event => event.id),
    },
    {
      id: 'lyg.chapter.resolve', title: '水香楼毒方与混战',
      summary: '布置水香楼诱捕、控制毒方刺客，并在池畔混战中擒获飞鸟萤子。',
      activation: [{ path: 'flags.chapter.multiple_enemies.done', operator: 'eq', value: true }],
      completion: [{ path: 'flags.chapter.resolve.done', operator: 'eq', value: true }],
      eventIds: EVENTS.slice(8, 11).map(event => event.id),
    },
    {
      id: 'lyg.chapter.final_move', title: '蕃密警告与审俘',
      summary: '摩尼寺营救失败后听取信永警告，并完成对飞鸟萤子的首次审讯。',
      activation: [{ path: 'flags.chapter.resolve.done', operator: 'eq', value: true }],
      completion: [{ path: completionPath('lyg.event.capture_feiniao'), operator: 'eq', value: true }],
      eventIds: EVENTS.slice(11).map(event => event.id),
    },
  ];
  document.scenario.initialFlags = {
    'chapter.lyg.shixiang_ambush.started': true,
    'chapter.lyg.shixiang_ambush.done': false,
    'chapter.ambush.done': false,
    'chapter.multiple_enemies.done': false,
    'chapter.resolve.done': false,
    ...Object.fromEntries(EVENTS.map(event => [completionPath(event.id).replace(/^flags\./, ''), false])),
  };

  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);

  const stagePlan = JSON.parse(await readFile(stagePlanPath, 'utf8'));
  const plan = stagePlan.stages.find(item => item.id === 'lyg.shixiang_ambush');
  if (!plan) throw new Error('stage plan entry missing');
  Object.assign(plan, {
    title: '长安佛门暗潮至水香楼余波',
    era: '长安元正前后，十方丛林围猎初起',
    imminentConflict: '十方丛林已将程宗扬列为佛门公敌，杨玉环刚送来北司借佛门查探的消息；释特昧普尚未进入长安。',
    completedFacts: ['十方丛林上院已将程宗扬列为佛门公敌', '杨玉环已派人邀程宗扬前往紫云楼'],
    forbiddenFutureFacts: ['释特昧普已经控制摩尼寺', '水香楼邀捕已经布置', '毒方刺客已经潜入', '飞鸟萤子已经被擒', '信永已经揭露蕃密内幕', '程宗扬已经拜访李药师'],
    featuredCharacters: ['程宗扬', '小紫', '杨玉环', '释特昧普', '潘金莲', '信永', '飞鸟萤子'],
    reason: '从佛门正式敌对后的第一轮情报战开始，覆盖青龙寺、元正朝会、兴庆宫与水香楼余波；下一关从第685章拜访李药师承接。',
    mappingReason: '旧稿开场提前泄露 source79–80 水香楼邀捕、毒方刺客与女忍，九个冻结事件又三次重复 yange.79.2、两次重复 yange.83.2，且执行顺序跨章倒置。冻结 ID 重写并 append-only 补 shixiang_s10–s14；source70 的吕雉私密场景及 source81–82 的成人场景不承担主线因果，不机械转成合同。',
  });
  await writeFile(stagePlanPath, `${JSON.stringify(stagePlan, null, 2)}\n`);
}

await main();
