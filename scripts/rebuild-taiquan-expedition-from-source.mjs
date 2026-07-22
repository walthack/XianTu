#!/usr/bin/env node

// R2-11Q：按 EPUB《六朝云龙吟》第 12–14 章重建 lyl.taiquan_expedition。
//
// 此历史 stage id 名为 taiquan_expedition，但 sourceStart=12/sourceEnd=14 与
// axisSeq=563–566 都属于临安《镖局》《宝刀》《处子》。真正太泉剧情从源 85
// 以后开始，且已有 taiquan_sacred_fruit/core_conflict/afterfall 覆盖。因此保留
// 冻结 stage/event/chapter id 作为存档键，只纠正本关语义，不复制后期太泉线。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash/yunlong');
const stagePath = join(generated, 'stages/lyl.taiquan_expedition.json');
const referencePath = join(generated, 'stages/lyl.lin_an_black_sea.json');
const stagePlanPath = join(generated, 'stage-plan.json');
const backupDir = join(generated, 'stages-pre-r2-11q-source-rebuild-backup');
const backupPath = join(backupDir, 'lyl.taiquan_expedition.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};
const action = (id, label, actionText, options = {}) => ({ id, label, actionText, timeCost: 1, outcomeText, ...options });
const contract = actions => ({ kind: 'objective_action', settleOn: ['success'], actions });

const EVENTS = [
  {
    id: 'liuchao.event.enter_taiquan',
    name: '接获江州三份军情',
    description: '程宗扬离开橡树瓦后收到线人蜡丸：贾师宪拟以丹阳换晋国表态，并筹措江州军费；秦翰还请命借和谈刺杀孟非卿。林清浦的水镜被围城法阵阻断，程宗扬只得改派快马传讯。',
    objective: '核对三份军情，改用人力把秦翰计划送往江州',
    locationId: 'liuchao.location.linan_city',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan', 'liuchao.character.lin_qing_pu'],
    relatedFactionIds: ['liuchao.faction.x2d33e1eaf9'],
    actions: [
      action('read_jiangzhou_reports', '逐份核对江州军情', '我与秦桧、俞子元逐份核对丹阳交涉、军费札子和秦翰请命刺杀孟非卿三条军情。', { kind: 'prepare', grantsPreparation: 'reports_checked' }),
      action('dispatch_jiangzhou_messenger', '派快马向江州示警', '林清浦确认水镜被围城法阵阻断后，我命俞子元立即派人以最快速度赶往江州示警。', { requiresPreparation: ['reports_checked'] }),
    ],
  },
  {
    id: 'liuchao.event.reconnoiter',
    name: '象牙为礼拜访威远镖局',
    description: '程宗扬以两根猛玛牙作押镖委托，登门试探李寅臣夫妇；他从夫妇争执中确认，威远镖局因失镖受制，阮香琳力主把李师师送入太尉府以求脱身。',
    objective: '以押运象牙为名试探李寅臣夫妇，查明他们对李师师婚事的决定',
    locationId: 'liuchao.location.linan_city',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'canon.character.7718ae444a', 'liuchao.character.ruan_xiang_lin', 'liuchao.character.li_shi_shi'],
    relatedFactionIds: ['liuchao.faction.wei_yuan_escort'],
    axisId: 'yunlong.12.1', axisSeq: 563, axisAnchor: '六朝云龙吟·#12·镖局',
    axisBeat: '程宗扬以押镖为名拜访威远镖局，得知李寅臣夫妇决定将李师师嫁给高衙内。', axisMethod: 'source-rebuilt',
    actions: [
      action('offer_mammoth_tusks', '以猛玛牙委托押运', '我让人抬出两根猛玛牙，向李寅臣提出送往晴州的押运委托，以此打开话头。', { kind: 'prepare', grantsPreparation: 'escort_offer_made' }),
      action('hear_weiyuan_decision', '听清夫妇对婚事的争执', '我在厅中等候时留意后堂动静，确认阮香琳主张以李师师的婚事换取太尉府放过镖局。', { requiresPreparation: ['escort_offer_made'] }),
    ],
  },
  {
    id: 'liuchao.event.du_zong_raid',
    name: '司营巷旁观屠龙刀伏击',
    description: '程宗扬在司营巷旁观灰衣人向林冲兜售屠龙刀，判断这是高衙内布下的圈套。两名刺客随后以藏剑竹杖袭击鲁智深，林冲拔刀相助，两人合力击退刺客。',
    objective: '旁观林冲买刀并确认伏击结果，不贸然打断高衙内的布局',
    locationId: 'liuchao.location.linan_city',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.lin_chong', 'liuchao.character.lu_zhi_shen'],
    relatedFactionIds: [],
    axisId: 'yunlong.13.1', axisSeq: 564, axisAnchor: '六朝云龙吟·#13·宝刀',
    axisBeat: '林冲在巷中买下屠龙刀，随后遭遇刺客，鲁智深与林冲击退刺客。', axisMethod: 'source-rebuilt',
    actions: [
      action('observe_tulong_sale', '看清林冲买下屠龙刀', '我留在司营巷旁看灰衣人将屠龙刀卖给林冲，并提醒随从这是高衙内设下的局。', { kind: 'prepare', grantsPreparation: 'sale_observed' }),
      action('witness_assassins_repulsed', '确认林冲与鲁智深击退刺客', '藏剑竹杖骤然发难后，我没有抢先改写局面，只看清林冲拔刀援手、与鲁智深合力击退刺客。', { requiresPreparation: ['sale_observed'] }),
    ],
  },
  {
    id: 'liuchao.event.fruit_conflict',
    name: '林家识破凝姨秘密',
    description: '程宗扬与秦桧、敖润、青面兽到林家作客。他在楼上认出李师师所称的凝姨正是林娘子阮香凝，并从近距离观察中发现她与成婚多年的表象不符，由此怀疑她与黑魔海有关。',
    objective: '在林家确认凝姨的真实身份，并保留刚发现的疑点',
    locationId: 'liuchao.location.linan_city',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui', 'liuchao.character.ao_run', 'liuchao.character.qing_mian_shou', 'liuchao.character.lin_chong', 'liuchao.character.ruan_xiang_ning', 'liuchao.character.li_shi_shi', 'liuchao.character.ruan_xiang_lin'],
    relatedFactionIds: [],
    axisId: 'yunlong.14.1', axisSeq: 565, axisAnchor: '六朝云龙吟·#14·处子',
    axisBeat: '程宗扬在林家发现林娘子的隐秘，推测其与黑魔海有关。', axisMethod: 'source-rebuilt',
    actions: [
      action('identify_aunt_as_madam_lin', '确认凝姨就是林娘子阮香凝', '我在林家楼上认出李师师口中的凝姨就是林冲之妻阮香凝，先不当面揭破。', { kind: 'prepare', grantsPreparation: 'identity_confirmed' }),
      action('retain_black_sea_suspicion', '记下与黑魔海有关的疑点', '我把观察到的反常之处与此前线索相互印证，只将黑魔海关联作为待查疑点，不向在场众人下定论。', { requiresPreparation: ['identity_confirmed'] }),
    ],
  },
  {
    id: 'liuchao.event.escape_taiquan',
    name: '潜入西湖别业窃听密谋',
    description: '俞子元跟踪阮香琳至西湖附近，程宗扬独自潜入临湖别业，从梁上听见高衙内与陆谦复盘失镖圈套，并确认他们还准备继续设计林冲。',
    objective: '跟踪阮香琳进入西湖别业，听清失镖圈套与对付林冲的计划',
    locationId: 'liuchao.location.linan_city',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.yu_zi_yuan', 'liuchao.character.gao_zhishang', 'liuchao.character.lu_qian', 'liuchao.character.ruan_xiang_lin'],
    relatedFactionIds: ['liuchao.faction.tai_wei_fu'],
    axisId: 'yunlong.14.2', axisSeq: 566, axisAnchor: '六朝云龙吟·#14·处子',
    axisBeat: '高衙内与陆谦在西湖别业密谋，透露已控制阮香琳，并计划对付林冲。', axisMethod: 'source-rebuilt',
    actions: [
      action('follow_carriage_to_villa', '循车辙追到西湖别业', '我与俞子元循着威远镖局马车的车辙追到西湖岔路，随后让他在湖边接应，独自潜入别业。', { kind: 'prepare', grantsPreparation: 'villa_infiltrated' }),
      action('overhear_yanei_luqian_plot', '在梁上听清陆谦的布局', '我伏在水榭梁上，听陆谦亲口说明如何劫走镖货、逼阮香琳就范，以及下一步如何对付林冲。', { requiresPreparation: ['villa_infiltrated'] }),
    ],
  },
];

const CHAPTERS = [
  ['liuchao.chapter.arrival_in_canglan', '江州急报', '接获三份军情，并在水镜受阻后改派快马示警。'],
  ['liuchao.chapter.taiquan_exploration', '威远试探', '以象牙押运委托试探李寅臣夫妇，确认李师师婚事。'],
  ['liuchao.chapter.alliance_and_conflict', '宝刀伏击', '旁观林冲购刀与林、鲁二人击退刺客。'],
  ['liuchao.chapter.hunt_for_fruit', '林家疑云', '在林家确认凝姨身份，并发现黑魔海疑点。'],
  ['liuchao.chapter.final_showdown', '西湖密谋', '追踪阮香琳至西湖别业，窃听高衙内与陆谦密谋。'],
];

const MINIMAL_CHARACTERS = new Map([
  ['canon.character.7718ae444a', { id: 'canon.character.7718ae444a', name: '李寅臣', description: '临安威远镖局总镖头，因丢失太尉府货物而受制。', role: '威远镖局总镖头', gender: '男', affiliations: [{ factionId: 'liuchao.faction.wei_yuan_escort', category: 'organization', role: '总镖头' }], locationId: 'liuchao.location.linan_city', profile: { origin: '威远镖局总镖头' } }],
  ['liuchao.character.ruan_xiang_lin', { id: 'liuchao.character.ruan_xiang_lin', name: '阮香琳', description: '李寅臣之妻、李师师之母；此时主张以攀附太尉府化解失镖危机。', role: '威远镖局镖头夫人', gender: '女', affiliations: [{ factionId: 'liuchao.faction.wei_yuan_escort', category: 'organization', role: '镖头夫人' }], locationId: 'liuchao.location.linan_city', profile: { origin: '威远镖局镖头夫人' } }],
  ['liuchao.character.ruan_xiang_ning', { id: 'liuchao.character.ruan_xiang_ning', name: '阮香凝', description: '林冲之妻，也是李师师此前称作凝姨的人；程宗扬刚开始怀疑她另有隐秘身份。', role: '林娘子', gender: '女', affiliations: [], locationId: 'liuchao.location.linan_city', profile: { origin: '林冲之妻；其门派身份尚属程宗扬的疑点' } }],
  ['liuchao.character.gao_zhishang', { id: 'liuchao.character.gao_zhishang', name: '高衙内', description: '高俅养子，借太尉府权势勒索威远镖局，并与陆谦谋划对付林冲。', role: '太尉府衙内', gender: '男', affiliations: [{ factionId: 'liuchao.faction.tai_wei_fu', category: 'organization', role: '衙内' }], locationId: 'liuchao.location.linan_city', profile: { origin: '高俅养子' } }],
  ['liuchao.character.lu_qian', { id: 'liuchao.character.lu_qian', name: '陆谦', description: '太尉府虞候，高衙内的谋划执行者；他安排了威远失镖圈套。', role: '太尉府虞候', gender: '男', affiliations: [{ factionId: 'liuchao.faction.tai_wei_fu', category: 'organization', role: '虞候' }], locationId: 'liuchao.location.linan_city', profile: { origin: '高衙内党羽' } }],
]);

const AFFILIATIONS = new Map([
  ['liuchao.character.cheng_zongyang', ['liuchao.faction.xing_yue_hu', 'liuchao.faction.pan_jiang_cheng']],
  ['liuchao.character.qin_hui', ['liuchao.faction.pan_jiang_cheng']],
  ['liuchao.character.yu_zi_yuan', ['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.xing_yue_hu']],
  ['liuchao.character.lin_qing_pu', ['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.x2d33e1eaf9']],
  ['liuchao.character.ao_run', ['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.x2d33e1eaf9']],
  ['liuchao.character.qing_mian_shou', ['liuchao.faction.pan_jiang_cheng', 'liuchao.faction.x2d33e1eaf9']],
  ['liuchao.character.li_shi_shi', ['liuchao.faction.guang_ming_guan_tang', 'liuchao.faction.wei_yuan_escort']],
  ['liuchao.character.lin_chong', ['liuchao.faction.huang_cheng_si', 'liuchao.faction.jin_jun']],
  ['liuchao.character.lu_zhi_shen', ['liuchao.faction.mingqing_temple']],
  ...[...MINIMAL_CHARACTERS].map(([id, character]) => [id, character.affiliations.map(item => item.factionId)]),
]);

async function main() {
  if (!existsSync(backupPath)) {
    await mkdir(backupDir, { recursive: true });
    await cp(stagePath, backupPath);
  }
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const reference = JSON.parse(await readFile(referencePath, 'utf8'));
  const originalById = new Map(document.scenario.events.map(event => [event.id, event]));
  if (originalById.size !== EVENTS.length || EVENTS.some(event => !originalById.has(event.id))) throw new Error('eventId contract changed; refusing to rebuild');

  document.manifest.name = '六朝云龙吟·镖局、宝刀与处子';
  document.manifest.description = 'Strict 模式，按《六朝云龙吟》第12–14章重建：江州军情、威远镖局试探、屠龙刀伏击、林家疑云与西湖别业密谋。历史 stage id 保留，不代表太泉时区。';
  document.manifest.axisSeqLo = 563;
  document.manifest.axisSeqHi = 566;
  document.world.era = '宋国临安·《镖局》《宝刀》《处子》时段';
  document.world.background = '雷峰塔冲突之后，威远镖局仍受失镖危机所困；江州战局又传来三份紧急情报。程宗扬留在临安处理军情，并继续追查高衙内围绕李师师与林冲布下的圈套。太泉古阵此时尚未进入本关时间线。';
  document.world.continents = document.world.continents.filter(continent => continent.id === 'liuchao.continent.zhongzhou');
  document.scenario.opening.text = '你仍在临安。离开橡树瓦后，秦桧交来线人送到的蜡丸，里面有三份关系江州战局的急报；先核清情报并设法示警，再处理威远镖局一线。';
  document.scenario.opening.locationId = 'liuchao.location.linan_city';
  document.scenario.opening.featuredCharacterIds = ['liuchao.character.qin_hui', 'liuchao.character.yu_zi_yuan', 'liuchao.character.lin_qing_pu', 'liuchao.character.li_shi_shi', 'liuchao.character.lin_chong'];

  const requiredIds = new Set([document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds, ...EVENTS.flatMap(event => event.relatedCharacterIds)]);
  const existing = new Map([...document.canon.characters, ...reference.canon.characters].map(character => [character.id, character]));
  document.canon.characters = [...requiredIds].map(id => structuredClone(MINIMAL_CHARACTERS.get(id) || existing.get(id))).map(character => {
    if (!character) throw new Error('required character missing');
    const allowed = new Set(AFFILIATIONS.get(character.id) || []);
    character.affiliations = (character.affiliations || []).filter(item => allowed.has(item.factionId));
    character.locationId = 'liuchao.location.linan_city';
    return character;
  });

  // 复用前关演员时一并闭合其结构化技能/功法/物品引用；不保留旧太泉专属内容。
  const contentFields = [['skills', 'skillIds'], ['techniques', 'techniqueIds'], ['items', 'itemIds']];
  for (const [contentKey, characterKey] of contentFields) {
    const requiredContentIds = new Set(document.canon.characters.flatMap(character => character[characterKey] || []));
    const pool = new Map([...(document.content[contentKey] || []), ...(reference.content[contentKey] || [])].map(item => [item.id, item]));
    document.content[contentKey] = [...requiredContentIds].map(id => structuredClone(pool.get(id))).map(item => {
      if (!item) throw new Error(`required ${contentKey} definition missing`);
      return item;
    });
  }

  const requiredFactionIds = new Set([...EVENTS.flatMap(event => event.relatedFactionIds || []), ...document.canon.characters.flatMap(character => character.affiliations.map(item => item.factionId))]);
  const factionPool = new Map([...document.canon.factions, ...reference.canon.factions].map(faction => [faction.id, faction]));
  document.canon.factions = [...requiredFactionIds].map(id => structuredClone(factionPool.get(id))).map(faction => {
    if (!faction) throw new Error('required faction missing');
    delete faction.headquartersLocationId;
    delete faction.territory;
    return faction;
  });
  const locationPool = new Map([...document.canon.locations, ...reference.canon.locations].map(location => [location.id, location]));
  document.canon.locations = [structuredClone(locationPool.get('liuchao.location.linan_city'))];
  document.canon.factionRelationships = [];
  document.canon.relationships = [];
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.qin_hui', relation: '主从', favorability: 60, memories: ['江州战后随行临安'] },
    { characterId: 'liuchao.character.yu_zi_yuan', relation: '主从', favorability: 50, memories: ['负责临安联络与追踪'] },
    { characterId: 'liuchao.character.lin_qing_pu', relation: '主从', favorability: 50, memories: ['负责水镜联络'] },
    { characterId: 'liuchao.character.ao_run', relation: '主从', favorability: 50 },
    { characterId: 'liuchao.character.qing_mian_shou', relation: '主从', favorability: 5 },
    { characterId: 'liuchao.character.li_shi_shi', relation: '旧识', favorability: 10, memories: ['雷峰塔冲突后继续关注威远危机'] },
  ];
  const availableContentIds = new Set(Object.values(document.content).flatMap(items => items.map(item => item.id)));
  document.rules.contentAccess = (document.rules.contentAccess || []).map(rule => ({
    ...rule,
    allowedCharacterIds: (rule.allowedCharacterIds || []).filter(id => requiredIds.has(id)),
  })).filter(rule => availableContentIds.has(rule.contentId) && (rule.playerAllowed || rule.allowedCharacterIds.length));

  document.scenario.events = EVENTS.map((definition, index) => {
    const { actions, ...eventDefinition } = definition;
    return {
      ...eventDefinition,
      completion: originalById.get(definition.id).completion,
      critical: true,
      conditions: index === 0
        ? [{ path: 'flags.chapter.arrival_in_canglan.started', operator: 'eq', value: true }]
        : [{ path: originalById.get(EVENTS[index - 1].id).completion[0].path, operator: 'eq', value: true }],
      playerCompletionContract: contract(actions),
    };
  });
  const oldChapters = new Map(document.scenario.chapters.map(chapter => [chapter.id, chapter]));
  document.scenario.chapters = CHAPTERS.map(([id, title, summary], index) => ({
    id, title, summary,
    ...(index === 0 ? {} : { activation: structuredClone(oldChapters.get(id).activation) }),
    completion: structuredClone(oldChapters.get(id).completion),
    eventIds: [EVENTS[index].id],
  }));
  const initialFlags = { 'chapter.arrival_in_canglan.started': true };
  for (const chapter of document.scenario.chapters) for (const completion of chapter.completion || []) initialFlags[completion.path.slice(6)] = false;
  for (const event of document.scenario.events) initialFlags[event.completion[0].path.slice(6)] = false;
  document.scenario.initialFlags = initialFlags;

  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);

  const stagePlan = JSON.parse(await readFile(stagePlanPath, 'utf8'));
  const plan = stagePlan.stages.find(item => item.id === 'lyl.taiquan_expedition');
  if (!plan) throw new Error('stage plan entry missing');
  Object.assign(plan, {
    title: '镖局、宝刀与处子',
    era: '宋国临安·《镖局》《宝刀》《处子》时段',
    imminentConflict: '江州军情无法经水镜送达；威远失镖、高衙内布局与林娘子疑点依次浮出。',
    completedFacts: ['雷峰塔冲突已结束', '程宗扬仍在临安', '威远镖局失镖危机尚未解决'],
    forbiddenFutureFacts: ['真正太泉古阵剧情', '后续小瀛洲杀局', '阮香凝的完整门派身份与结局', '高衙内的未来身世'],
    featuredCharacters: ['程宗扬', '秦桧', '李师师', '林冲', '阮香琳', '阮香凝', '高衙内', '陆谦'],
    reason: '历史 stage id 保留为存档键；实际内容必须服从 sourceIndex 12–14 与 axisSeq 563–566。',
    mappingReason: 'EPUB 第12–14章依次为《镖局》《宝刀》《处子》，轴 563–566 也逐条落在临安；旧“太泉探险”语义没有来源。真正太泉从源85后开始，且已有后续独立关卡覆盖，故本关纠正为临安五拍而不复制太泉线。',
  });
  await writeFile(stagePlanPath, `${JSON.stringify(stagePlan, null, 2)}\n`);
}

await main();
