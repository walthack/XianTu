#!/usr/bin/env node

// R2-11V：按《六朝燕歌行》开场切点 source126 后至 source132 重建 lyg.ganlu_bian。
// 十个 event id、四个 chapter id 与 completion path 均已冻结；本脚本只重写语义、时序与时点投影。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash/yange');
const stagePath = join(generated, 'stages/lyg.ganlu_bian.json');
const stagePlanPath = join(generated, 'stage-plan.json');
const backupDir = join(generated, 'stages-pre-r2-11v-source-rebuild-backup');
const backupPath = join(backupDir, 'lyg.ganlu_bian.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};
const action = (id, label, actionText, options = {}) => ({ id, label, actionText, timeCost: 1, outcomeText, ...options });
const contract = actions => ({ kind: 'objective_action', settleOn: ['success'], actions });

const EVENTS = [
  {
    id: 'lyg.event.li_jinxiang_meeting', name: '接下李昂托付的闭门密令',
    description: '李昂向杨玉环说明甘露诛宦计划，请她转告天策府闭门不涉并设法牵制鱼朝恩。杨玉环质疑他防忌天策府，却仍答应传话。',
    objective: '听清李昂对天策府与鱼朝恩的安排', locationId: 'lyg.location.daming_palace',
    relatedCharacterIds: ['liuchao.character.li_ang', 'liuchao.character.yang_yuhuan'],
    relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting', 'lyg.faction.eunuch_group'],
    axisId: 'yange.127.1', axisSeq: 1193, axisAnchor: '六朝燕歌行·#127·',
    axisBeat: '李昂向杨玉环透露甘露诛宦计划，请她转告天策府闭门并牵制鱼朝恩。',
    actions: [
      action('hear_liang_closed_gate_request', '确认闭门请求', '我通过杨玉环确认李昂要求天策府闭门不涉的原话与时限。', { kind: 'prepare', grantsPreparation: 'liang_request_heard' }),
      action('record_yu_chaoen_assignment', '记录牵制目标', '我把牵制鱼朝恩与天策府闭门分开记录，不把杨玉环的质疑误写成计划取消。', { requiresPreparation: ['liang_request_heard'] }),
    ],
  },
  {
    id: 'lyg.event.yang_yuhuan_report', name: '赴阳禄门院会见黎锦香',
    description: '程宗扬依鱼玄机纸条在废客栈会见黎锦香。黎锦香承认刺杀王守澄时曾暗中相助，并透露广源行以人质和婚姻控制周飞等人。',
    objective: '核对黎锦香对王守澄案与广源行的说法', locationId: 'lyg.location.yanglu_menyuan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.li_jinxiang', 'liuchao.character.zhou_fei'],
    relatedFactionIds: ['lyg.faction.guangyuan_hang'],
    axisId: 'yange.128.1', axisSeq: 1195, axisAnchor: '六朝燕歌行·#128·',
    axisBeat: '程宗扬与黎锦香私会，得知她曾协助刺杀王守澄并开始揭露广源行控制手段。',
    actions: [
      action('verify_li_aid_in_wang_case', '核对王守澄案协助', '我让黎锦香说明她在王守澄案中实际做过什么，并与已知现场分开比对。', { kind: 'prepare', grantsPreparation: 'li_wang_case_checked' }),
      action('open_guangyuan_inquiry', '追问广源行控制方式', '确认会面可信后，我追问广源行如何利用人质、婚姻和晋升控制周飞。', { requiresPreparation: ['li_wang_case_checked'] }),
    ],
  },
  {
    id: 'lyg.event.jia_wenhe_plan', name: '厘清广源行等级控制',
    description: '黎锦香解释广源行把年轻人分为儿马、白口马等等级，以权势诱饵与人质惩罚维持控制，并指出周飞已成为其傀儡。',
    objective: '记录广源行等级制及周飞的受控状态', locationId: 'lyg.location.yanglu_menyuan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.li_jinxiang', 'liuchao.character.zhou_fei'],
    relatedFactionIds: ['lyg.faction.guangyuan_hang'],
    axisId: 'yange.128.2', axisSeq: 1196, axisAnchor: '六朝燕歌行·#128·',
    axisBeat: '黎锦香讲述广源行等级制，点明周飞已在权势与人质控制下成为傀儡。',
    actions: [
      action('map_guangyuan_ranks', '记录等级制', '我把黎锦香提到的等级、奖惩与人质手段逐项记下。', { kind: 'prepare', grantsPreparation: 'guangyuan_ranks_mapped' }),
      action('separate_zhou_choice_and_control', '区分周飞选择与受控', '我区分周飞主动逐权与广源行控制造成的后果，不替他免除责任。', { requiresPreparation: ['guangyuan_ranks_mapped'] }),
    ],
  },
  {
    id: 'lyg.event.soul_summoning', name: '确认周飞与十方丛林合谋',
    description: '黎锦香揭露周飞与十方丛林合谋瓜分程宅，并把孙寿与小紫列为优先目标；针对小紫的计划还试图破除其护身巫术。',
    objective: '确认周飞与十方丛林针对程宅的合谋', locationId: 'lyg.location.yanglu_menyuan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.li_jinxiang', 'liuchao.character.zhou_fei', 'liuchao.character.xiao_zi'],
    relatedFactionIds: ['lyg.faction.guangyuan_hang', 'liuchao.faction.shi_fang_cong_lin'],
    axisId: 'yange.129.1', axisSeq: 1198, axisAnchor: '六朝燕歌行·#129·',
    axisBeat: '黎锦香揭露周飞与十方丛林合谋针对程宅，并把孙寿与小紫列为目标。',
    actions: [
      action('identify_zhou_buddhist_terms', '核对合谋条件', '我让黎锦香说清周飞与十方丛林交换的条件和目标名单。', { kind: 'prepare', grantsPreparation: 'zhou_plot_terms_known' }),
      action('set_household_counterwatch', '布置程宅反监视', '我依据已知目标布置反监视，只防备已证实的计划，不把威胁写成既成伤害。', { requiresPreparation: ['zhou_plot_terms_known'] }),
    ],
  },
  {
    id: 'lyg.event.bai_nichang_defeat', name: '核对黎锦香潜入与劫俘经过',
    description: '转入阳禄门院密室后，黎锦香承认曾潜入程宅刺杀未果，并说明自己劫走飞鸟萤子的经过。',
    objective: '核对黎锦香潜入程宅与带走飞鸟萤子的经过', locationId: 'lyg.location.yanglu_menyuan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.li_jinxiang', 'liuchao.character.fei_niao_ying_zi'],
    relatedFactionIds: ['lyg.faction.guangyuan_hang'],
    axisId: 'yange.130.1', axisSeq: 1199, axisAnchor: '六朝燕歌行·#130·阳禄门院',
    axisBeat: '黎锦香坦承曾潜入程宅刺杀未果，并劫走飞鸟萤子。',
    actions: [
      action('reconstruct_li_house_infiltration', '复盘潜入经过', '我让黎锦香按进入、失手和撤离顺序复盘潜入程宅的过程。', { kind: 'prepare', grantsPreparation: 'li_infiltration_reconstructed' }),
      action('locate_feiniao_custody', '确认飞鸟萤子状态', '我确认飞鸟萤子被带到何处、目前是否能回答问题，再进入下一步审讯。', { requiresPreparation: ['li_infiltration_reconstructed'] }),
    ],
  },
  {
    id: 'lyg.event.liangzhou_victory', name: '问出飞鸟家族与剑柄线索',
    description: '黎锦香唤醒飞鸟萤子。飞鸟萤子供认受黑魔海雇佣寻找藤原秀子后裔，并说明布都御魂剑柄与东瀛印信线索。',
    objective: '核验飞鸟萤子的雇佣目标与信物线索', locationId: 'lyg.location.yanglu_menyuan',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'lyg.character.li_jinxiang', 'liuchao.character.fei_niao_ying_zi'],
    relatedFactionIds: ['liuchao.faction.hei_mo_hai'],
    axisId: 'yange.130.2', axisSeq: 1200, axisAnchor: '六朝燕歌行·#130·阳禄门院',
    axisBeat: '飞鸟萤子供认黑魔海雇佣目标，并透露藤原秀子后裔与布都御魂剑柄线索。',
    actions: [
      action('ask_feiniao_employer_target', '确认雇佣目标', '我先确认谁雇佣飞鸟萤子、要寻找何人，避免把推测当作家族真相。', { kind: 'prepare', grantsPreparation: 'feiniao_target_stated' }),
      action('log_futsu_and_seal_clues', '记录剑柄与印信线索', '我把布都御魂剑柄、藤原秀子后裔和印信线索分别记录，等待后续实物核验。', { requiresPreparation: ['feiniao_target_stated'] }),
    ],
  },
  {
    id: 'lyg.event.release_jingnian', name: '旁听博陆王府权宦追凶',
    description: '李辅国召集鱼朝恩、仇士良与田令孜追查王守澄之死，以六道神目威慑众人，命鱼朝恩主理追凶并警告田令孜远离绛王。',
    objective: '确认权宦追凶分工与内部猜忌', locationId: 'lyg.location.bolu_wangfu',
    relatedCharacterIds: ['liuchao.character.li_fuguo', 'lyg.character.yu_chaoen', 'lyg.character.chou_shiliang', 'liuchao.character.tian_ling_zi'],
    relatedFactionIds: ['lyg.faction.eunuch_group', 'liuchao.faction.tang_guo_chao_ting'],
    axisId: 'yange.131.1', axisSeq: 1201, axisAnchor: '六朝燕歌行·#131·六道神目',
    axisBeat: '李辅国召集权宦追查王守澄之死，命鱼朝恩主理并警告田令孜。',
    actions: [
      action('record_eunuch_inquiry_roles', '记录追凶分工', '我从可靠消息中确认李辅国、鱼朝恩、仇士良与田令孜在追凶中的位置。', { kind: 'prepare', grantsPreparation: 'eunuch_roles_logged' }),
      action('identify_eunuch_suspicion_lines', '标记猜忌方向', '我把李辅国对田令孜与绛王的警告列为内部猜忌，不预判哪一方已经动手。', { requiresPreparation: ['eunuch_roles_logged'] }),
    ],
  },
  {
    id: 'lyg.event.su_sha_identified', name: '汇总甘露局势并采纳搅局计',
    description: '杨玉环向程宗扬说明郑注赴凤翔、李训与郑注内讧及窥基可能入局。贾文和建议释放净念与纳觉容部，利用十方丛林内部矛盾转移注意。',
    objective: '汇总甘露局势并决定是否释放番僧搅局', locationId: 'lyg.location.wuyang_houfu',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yang_yuhuan', 'liuchao.character.jia_wenhe'],
    relatedFactionIds: ['liuchao.faction.tang_guo_chao_ting', 'liuchao.faction.shi_fang_cong_lin', 'lyg.faction.eunuch_group'],
    axisId: 'yange.131.2', axisSeq: 1202, axisAnchor: '六朝燕歌行·#131·六道神目',
    axisBeat: '杨玉环汇报甘露密谋与内讧，贾文和建议释放番僧利用佛门矛盾搅局。',
    actions: [
      action('assemble_ganlu_intelligence', '汇总甘露情报', '我把郑注、李训、窥基和宦官集团的动向按来源与时间排好。', { kind: 'prepare', grantsPreparation: 'ganlu_intelligence_assembled' }),
      action('approve_monk_release_gambit', '采纳释放搅局计', '我在明确不替番僧承诺立场的前提下，同意释放净念与纳觉容部转移窥基注意。', { requiresPreparation: ['ganlu_intelligence_assembled'] }),
    ],
  },
  {
    id: 'lyg.event.xiao_zi_departure', name: '小紫询问瑶池宗修行法',
    description: '小紫向白霓裳询问瑶池宗提升气海的办法，得知朱殷曾被强行提升、后续潜力受限；她只记录方法与代价，尚未前往渭水闭关。',
    objective: '确认瑶池宗强提气海的代价', locationId: 'lyg.location.wuyang_houfu',
    relatedCharacterIds: ['liuchao.character.xiao_zi', 'liuchao.character.bai_nichang'],
    relatedFactionIds: ['liuchao.faction.yao_chi_zong'],
    axisMethod: 'reviewed-no-anchor',
    actions: [
      action('ask_yaochi_qihai_method', '询问气海提升法', '我让白霓裳说明瑶池宗强提气海的步骤与适用条件。', { kind: 'prepare', grantsPreparation: 'yaochi_method_heard' }),
      action('record_forced_upgrade_cost', '记录强提代价', '我确认朱殷潜力受限是已知代价，不把询问写成小紫已经闭关或晋级。', { requiresPreparation: ['yaochi_method_heard'] }),
    ],
  },
  {
    id: 'lyg.event.ganlu_crisis_final', name: '见证程宅战榜张贴',
    description: '杨玉环击败白霓裳，在程宅张贴内宅比武榜并自居首位。程宗扬由此确认下一阶段的比武秩序，但凉州盟正式赛程尚未开始。',
    objective: '核对程宅战榜并完成本关交接', locationId: 'lyg.location.wuyang_houfu',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yang_yuhuan', 'liuchao.character.bai_nichang', 'liuchao.character.lv_zhi'],
    relatedFactionIds: ['liuchao.faction.yao_chi_zong'],
    axisMethod: 'reviewed-no-anchor',
    actions: [
      action('verify_household_duel_result', '核对比武结果', '我确认杨玉环与白霓裳的实际胜负以及榜上记录。', { kind: 'prepare', grantsPreparation: 'household_board_verified' }),
      action('close_before_liangzhou_bouts', '在凉州赛前收束', '我把程宅战榜作为本关交接点，不提前宣告铁马堂八强或凉州盟下一场对阵。', { requiresPreparation: ['household_board_verified'] }),
    ],
  },
];

const FROZEN_IDS = new Set(EVENTS.map(event => event.id));
const LEGACY_COMPLETION_PATHS = new Map([
  ['lyg.event.li_jinxiang_meeting', 'flags.event.li_jinxiang_meeting_done'],
  ['lyg.event.yang_yuhuan_report', 'flags.event.yang_yuhuan_report_done'],
  ['lyg.event.jia_wenhe_plan', 'flags.event.jia_wenhe_plan_done'],
  ['lyg.event.soul_summoning', 'flags.event.soul_summoning_done'],
  ['lyg.event.bai_nichang_defeat', 'flags.event.bai_nichang_defeat_done'],
  ['lyg.event.liangzhou_victory', 'flags.event.liangzhou_victory_done'],
  ['lyg.event.su_sha_identified', 'flags.event.su_sha_identified'],
  ['lyg.event.xiao_zi_departure', 'flags.event.xiao_zi_departure_done'],
  ['lyg.event.release_jingnian', 'flags.event.qiankui_plan_foiled'],
  ['lyg.event.ganlu_crisis_final', 'flags.chapter.ganlu_crisis.done'],
]);
const completionPath = id => LEGACY_COMPLETION_PATHS.get(id);
const person = (id, name, description, role, gender, origin, locationId) => ({
  id, name, description, role, gender, affiliations: [], ...(locationId ? { locationId } : {}), profile: { origin },
});
const CHARACTERS = new Map([
  ['liuchao.character.cheng_zongyang', person('liuchao.character.cheng_zongyang', '程宗扬', '汉使与舞阳侯，正在王守澄死后搜集甘露密谋情报。', '舞阳侯', '男', '现代来客。', 'lyg.location.wuyang_houfu')],
  ['liuchao.character.li_ang', person('liuchao.character.li_ang', '李昂', '决定借王守澄发丧发动诛宦行动的唐皇。', '唐皇', '男', '唐国皇帝。', 'lyg.location.daming_palace')],
  ['liuchao.character.yang_yuhuan', person('liuchao.character.yang_yuhuan', '杨玉环', '受李昂托付传递密令，同时质疑其防忌天策府。', '镇国大长公主', '女', '唐国宗室。', 'lyg.location.wuyang_houfu')],
  ['lyg.character.li_jinxiang', person('lyg.character.li_jinxiang', '黎锦香', '周飞之妻、剑霄门人物，正在秘密揭露广源行与王守澄案线索。', '秘密情报提供者', '女', '剑霄门弟子。', 'lyg.location.yanglu_menyuan')],
  ['liuchao.character.zhou_fei', person('liuchao.character.zhou_fei', '周飞', '受广源行控制并与十方丛林合谋针对程宅。', '广源行代理人', '男', '周族青年。')],
  ['liuchao.character.fei_niao_ying_zi', person('liuchao.character.fei_niao_ying_zi', '飞鸟萤子', '被黎锦香控制并接受询问的东瀛女忍。', '被俘女忍', '女', '东瀛飞鸟家族。', 'lyg.location.yanglu_menyuan')],
  ['liuchao.character.li_fuguo', person('liuchao.character.li_fuguo', '李辅国', '召集权宦追查王守澄之死的博陆王。', '博陆王', '男', '唐国权宦。', 'lyg.location.bolu_wangfu')],
  ['lyg.character.yu_chaoen', person('lyg.character.yu_chaoen', '鱼朝恩', '被李辅国指定主理王守澄案的权宦。', '权宦', '男', '唐国内廷。', 'lyg.location.bolu_wangfu')],
  ['lyg.character.chou_shiliang', person('lyg.character.chou_shiliang', '仇士良', '参加博陆王府追凶会议的神策军权宦。', '神策军权宦', '男', '唐国内廷。', 'lyg.location.bolu_wangfu')],
  ['liuchao.character.tian_ling_zi', person('liuchao.character.tian_ling_zi', '田令孜', '因接近绛王而受到李辅国警告的内侍。', '唐国内侍', '男', '唐国内廷。', 'lyg.location.bolu_wangfu')],
  ['liuchao.character.jia_wenhe', person('liuchao.character.jia_wenhe', '贾文和', '为程宗扬分析甘露局势并提出释放番僧搅局。', '谋士', '男', '程氏幕僚。', 'lyg.location.wuyang_houfu')],
  ['liuchao.character.xiao_zi', person('liuchao.character.xiao_zi', '小紫', '向白霓裳询问瑶池宗强提气海方法与代价。', '程宅核心成员', '女', '岳帅遗孤、黑魔海毒宗传人。', 'lyg.location.wuyang_houfu')],
  ['liuchao.character.bai_nichang', person('liuchao.character.bai_nichang', '白霓裳', '瑶池宗弟子，向小紫解释强提气海的代价并与杨玉环比武。', '瑶池宗弟子', '女', '瑶池宗门下。', 'lyg.location.wuyang_houfu')],
  ['liuchao.character.lv_zhi', person('liuchao.character.lv_zhi', '吕雉', '暂居程宅，在杨玉环张贴比武榜时仍负责内宅杂务。', '程宅内眷', '女', '汉国前太后。', 'lyg.location.wuyang_houfu')],
]);

async function main() {
  if (!existsSync(backupPath)) {
    await mkdir(backupDir, { recursive: true });
    await cp(stagePath, backupPath);
  }
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const sourceDocument = JSON.parse(await readFile(backupPath, 'utf8'));
  const originalIds = new Set(document.scenario.events.map(event => event.id));
  for (const id of FROZEN_IDS) if (!originalIds.has(id)) throw new Error(`frozen event missing: ${id}`);
  for (const id of originalIds) if (!FROZEN_IDS.has(id)) throw new Error(`unexpected event id: ${id}`);

  Object.assign(document.manifest, {
    name: '六朝燕歌行·甘露密谋至程宅战榜',
    description: 'Strict 模式，按开场后 source127–132 重建：李昂密令、广源行阴谋、权宦追凶、甘露情报与程宅战榜。',
    axisSeqLo: 1193, axisSeqHi: 1202,
  });
  document.world.era = '甘露之变前夕，王守澄死后两日倒计时';
  document.world.background = '王守澄已死，李昂已在清思殿决定后日借发丧诛宦。杨玉环刚受命向天策府传话；黎锦香、权宦追凶和程宅战榜均尚未落账。';
  document.world.continents = [structuredClone(sourceDocument.world.continents.find(item => item.id === 'liuchao.continent.zhongzhou'))];
  document.scenario.opening.text = '王守澄已死。密报显示，李昂已在清思殿定下后日借发丧诛宦的计划。此刻杨玉环正从宫中带出一项给天策府的闭门请求；你尚不知道权宦会如何追凶，也还没有赴黎锦香的秘密会面。';
  document.scenario.opening.playerRole = '汉国舞阳侯、汉使与程氏商会首领';
  document.scenario.opening.locationId = 'lyg.location.wuyang_houfu';
  document.scenario.opening.featuredCharacterIds = ['liuchao.character.yang_yuhuan', 'liuchao.character.jia_wenhe'];

  const requiredCharacterIds = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...EVENTS.flatMap(event => event.relatedCharacterIds),
  ]);
  document.canon.characters = [...requiredCharacterIds].map(id => structuredClone(CHARACTERS.get(id))).map(item => {
    if (!item) throw new Error('required minimal character missing');
    return item;
  });
  document.content = { items: [], techniques: [], skills: [] };
  document.rules.contentAccess = [];
  const factionPool = new Map([...sourceDocument.canon.factions, ...document.canon.factions].map(item => [item.id, item]));
  document.canon.factions = [...new Set(EVENTS.flatMap(event => event.relatedFactionIds))].map(id => structuredClone(factionPool.get(id))).map(item => {
    if (!item) throw new Error('required faction missing');
    delete item.headquartersLocationId;
    delete item.territory;
    return item;
  });
  const locationPool = new Map([...sourceDocument.canon.locations, ...document.canon.locations].map(item => [item.id, item]));
  const requiredLocations = new Set([document.scenario.opening.locationId, ...EVENTS.map(event => event.locationId)]);
  document.canon.locations = [...requiredLocations].map(id => structuredClone(locationPool.get(id))).map(item => {
    if (!item) throw new Error('required location missing');
    delete item.factionId;
    return item;
  });
  document.canon.relationships = [];
  document.canon.factionRelationships = [];
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.yang_yuhuan', relation: '政治盟友', favorability: 55 },
    { characterId: 'lyg.character.li_jinxiang', relation: '秘密情报提供者', favorability: 25 },
    { characterId: 'liuchao.character.jia_wenhe', relation: '首席谋士', favorability: 75 },
  ];

  document.scenario.events = EVENTS.map((definition, index) => {
    const { actions, ...base } = definition;
    return {
      ...base, critical: true, axisMethod: definition.axisMethod || 'source-rebuilt',
      conditions: index === 0 ? [] : [{ path: completionPath(EVENTS[index - 1].id), operator: 'eq', value: true }],
      completion: [{ path: completionPath(definition.id), operator: 'eq', value: true }],
      playerCompletionContract: contract(actions),
    };
  });
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  document.scenario.chapters = [
    { id: 'lyg.chapter.arrival', title: '密令与广源行', summary: '接下李昂密令，并赴阳禄门院与黎锦香接触。', completion: [byId.get('lyg.event.li_jinxiang_meeting').completion[0], byId.get('lyg.event.yang_yuhuan_report').completion[0]], eventIds: EVENTS.slice(0, 2).map(event => event.id) },
    { id: 'lyg.chapter.manipulation', title: '广源行阴谋与权宦追凶', summary: '厘清广源行控制、周飞合谋与飞鸟萤子的东瀛线索，并在博陆王府确认权宦追凶分工。', activation: [byId.get('lyg.event.li_jinxiang_meeting').completion[0], byId.get('lyg.event.yang_yuhuan_report').completion[0]], completion: [byId.get('lyg.event.soul_summoning').completion[0], byId.get('lyg.event.release_jingnian').completion[0]], eventIds: EVENTS.slice(2, 7).map(event => event.id) },
    { id: 'lyg.chapter.power_gathering', title: '甘露搅局与小紫问法', summary: '汇总甘露局势并采纳释放番僧的搅局计，再承接小紫向白霓裳核对强开气海的代价。', activation: [byId.get('lyg.event.soul_summoning').completion[0], byId.get('lyg.event.release_jingnian').completion[0]], completion: [byId.get('lyg.event.su_sha_identified').completion[0], byId.get('lyg.event.xiao_zi_departure').completion[0]], eventIds: EVENTS.slice(7, 9).map(event => event.id) },
    { id: 'lyg.chapter.ganlu_crisis', title: '程宅战榜交接', summary: '小紫核对修行代价，杨玉环张贴程宅战榜；在凉州盟正式赛程前收束。', activation: [byId.get('lyg.event.su_sha_identified').completion[0], byId.get('lyg.event.xiao_zi_departure').completion[0]], completion: [byId.get('lyg.event.ganlu_crisis_final').completion[0]], eventIds: EVENTS.slice(9).map(event => event.id) },
  ];
  document.scenario.initialFlags = Object.fromEntries([
    ...EVENTS.map(event => [completionPath(event.id).replace(/^flags\./, ''), false]),
    ['chapter.ganlu_crisis.started', false],
  ]);
  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);

  const stagePlan = JSON.parse(await readFile(stagePlanPath, 'utf8'));
  const plan = stagePlan.stages.find(item => item.id === 'lyg.ganlu_bian');
  if (!plan) throw new Error('stage plan entry missing');
  Object.assign(plan, {
    title: '甘露密谋至程宅战榜', sourceEndIndex: 132,
    era: '甘露之变前夕，王守澄死后两日倒计时',
    imminentConflict: '李昂已决定后日借王守澄发丧诛宦，杨玉环正带出要求天策府闭门并牵制鱼朝恩的密令。',
    completedFacts: ['王守澄已死', '李昂已在清思殿定下后日诛宦计划'],
    forbiddenFutureFacts: ['杨玉环已经传达闭门密令', '黎锦香已经揭露广源行阴谋', '飞鸟萤子已经供出东瀛信物', '权宦集团已经完成追凶分工', '小紫已经前往渭水闭关', '凉州盟比武已经开始'],
    featuredCharacters: ['程宗扬', '杨玉环', '黎锦香', '贾文和', '李辅国', '小紫', '白霓裳'],
    reason: '从李昂密令的第一轮传递开始，覆盖阳禄门院、权宦追凶与程宅战榜；source133 凉州盟正式比武由下一关承接。',
    mappingReason: '旧 sourceEnd=135 与下一关 source132–138 重叠，并把 source133 凉州盟、source134 招魂、source135 小紫闭关同时写入两关。切点纠正为 source132《程宅战榜》后；十个冻结 ID 按 source127–132 重写。source127.2、128.3 成人私密拍以及 source132 活扣与诊病旁支不承担主线合同。',
  });
  await writeFile(stagePlanPath, `${JSON.stringify(stagePlan, null, 2)}\n`);
}

await main();
