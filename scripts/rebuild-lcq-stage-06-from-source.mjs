#!/usr/bin/env node

// R2-11R：按 EPUB《六朝清羽记》第 112–124 章重建 lcq.stage_06。
//
// 六个 event id 与 lcq.event.s06_03 / qingyu.116.1 的 IF 锚点均为冻结存档键；
// 本脚本只纠正来源、目标、演员投影和人工完成合同，不解除默认线隔离。

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash/qingyu');
const stagePath = join(generated, 'stages/lcq.stage_06.json');
const stagePlanPath = join(generated, 'stage-plan.json');
const backupDir = join(generated, 'stages-pre-r2-11r-source-rebuild-backup');
const backupPath = join(backupDir, 'lcq.stage_06.json');

const outcomeText = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};
const action = (id, label, actionText, options = {}) => ({ id, label, actionText, timeCost: 1, outcomeText, ...options });
const contract = actions => ({ kind: 'objective_action', settleOn: ['success'], actions });

const EVENTS = [
  {
    id: 'lcq.event.s06_01',
    name: '鬼巫王反被龙神吞噬',
    description: '鬼巫王以祭品唤醒龙神并试图与其合体；龙神拒绝祭品，反以舌卷住鬼巫王。鬼巫王被自己的苍龙星阵束缚，鬼角折断，最终被龙神吞噬，龙神随即狂暴破山。',
    objective: '看清合体逆转，并在龙神吞噬鬼巫王后带同伴撤向高处',
    locationId: 'liuchao.location.gui_wang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu', 'liuchao.character.xie_yi', 'liuchao.character.xiao_zi', 'liuchao.character.gui_wu_wang', 'liuchao.character.dragon_god'],
    relatedFactionIds: ['liuchao.faction.gui_wang_dong'],
    axisId: 'qingyu.114.2', axisSeq: 205, axisAnchor: '六朝清羽记·#114·第112章·唤龙',
    axisBeat: '鬼巫王以祭品唤醒龙神，反被龙神吞噬；苍龙星阵束缚了鬼巫王本人，龙神融合其力量后陷入狂暴。', axisMethod: 'source-rebuilt',
    actions: [
      action('recognize_reversed_fusion', '认清合体已经逆转', '我与乐明珠留在龙角附近，看清龙神拒绝祭品、反将鬼巫王卷住，也看清苍龙星阵束缚的是鬼巫王本人。', { kind: 'prepare', grantsPreparation: 'reverse_fusion_seen' }),
      action('withdraw_from_collapsing_cavern', '在吞噬后撤向高处', '龙神吞下鬼巫王并撞破山体后，我立即呼喊同伴离开崩塌洞窟，向高处撤离。', { requiresPreparation: ['reverse_fusion_seen'] }),
    ],
  },
  {
    id: 'lcq.event.s06_02',
    name: '众人合力杀死龙神',
    description: '凝羽、苏荔、武二郎、谢艺与商队众人先后重创龙神，也付出惨重代价；谢艺剖开龙神颈腹后遭闪电击落。程宗扬依小紫提示找到龙脑，最终借助乐明珠与一股神秘力量刺穿龙颅、破坏星阵，杀死龙神。',
    objective: '承接众人攻势，找到龙脑并刺穿龙颅终结围猎',
    locationId: 'liuchao.location.gui_wang_dong',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xie_yi', 'liuchao.character.wu_er_lang', 'liuchao.character.ning_yu', 'liuchao.character.su_li', 'liuchao.character.le_mingzhu', 'liuchao.character.xiao_zi', 'lcq.character.np006', 'liuchao.character.dragon_god'],
    relatedFactionIds: ['liuchao.faction.bai_wu', 'liuchao.faction.hua_miao'],
    axisId: 'qingyu.117.1', axisSeq: 211, axisAnchor: '六朝清羽记·#117·第115章·杀神',
    axisBeat: '众人相继重创龙神；程宗扬依小紫提示找到龙脑，在乐明珠与神秘力量相助下刺穿龙颅、破坏苍龙星阵，龙神坠亡。', axisMethod: 'source-rebuilt',
    actions: [
      action('reach_dragon_brain', '依小紫提示找到龙脑', '我承接谢艺等人造成的伤势，依小紫手势爬到双角之间，确认细鳞下方才是龙脑所在。', { kind: 'prepare', grantsPreparation: 'dragon_brain_found' }),
      action('pierce_dragon_skull', '合力刺穿龙颅', '我握紧珊瑚匕首，在乐明珠与那股神秘力量相助下贯穿龙颅、破坏苍龙星阵，直到龙神坠亡。', { requiresPreparation: ['dragon_brain_found'] }),
    ],
  },
  {
    id: 'lcq.event.s06_03',
    name: '谢艺伤重辞世',
    description: '谢艺遭龙神引来的闪电贯穿胸膛。龙神死后，程宗扬赶到他身边；谢艺拒绝来历可疑的丹药，将小紫与名下之物托付给程宗扬，请他把小紫带往星月湖，随后伤重辞世。',
    objective: '赶到谢艺身边，听清并接下他对小紫与星月湖的托付',
    locationId: 'liuchao.location.gui_wang_dong',
    relatedCharacterIds: ['liuchao.character.xie_yi', 'liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi', 'liuchao.character.yun_cang_feng'],
    relatedFactionIds: ['liuchao.faction.xing_yue_hu'],
    // 裁定 #90：event id 与 axis id 是纵切稳定引用；即使死亡在后文收束也不得改绑。
    axisId: 'qingyu.116.1', axisSeq: 210, axisAnchor: '六朝清羽记·#116·第114章·围猎',
    axisBeat: '谢艺重创龙神后被闪电贯穿；战后他将小紫托付给程宗扬，请其带往星月湖，随后伤重辞世。', axisMethod: 'source-rebuilt-frozen-if-anchor',
    actions: [
      action('reach_fallen_xieyi', '赶到负伤的谢艺身边', '龙神坠亡后，我立即赶到谢艺身边，与云苍峰一同确认他的伤势，听他说完最后的话。', { kind: 'prepare', grantsPreparation: 'xieyi_last_words_heard' }),
      action('accept_xiaozi_entrustment', '接下小紫与星月湖的托付', '我当着云苍峰接下谢艺的托付：照看小紫，并把她带往星月湖交给王韬、孟非卿或萧遥逸。', { requiresPreparation: ['xieyi_last_words_heard'] }),
    ],
  },
  {
    id: 'lcq.event.s06_04',
    name: '小紫弑母',
    description: '小紫在鬼王峒废墟中拦住母亲碧姬，揭开自己幼年被出卖与虐待的旧恨，并亲手将其杀死。程宗扬与乐明珠赶到时在场见证，事后接住情绪崩溃的小紫。',
    objective: '追上小紫，见证她与碧姬对质后的决断并承接余波',
    locationId: 'liuchao.location.gui_wang_dong',
    relatedCharacterIds: ['liuchao.character.xiao_zi', 'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu', 'liuchao.character.bi_ji'],
    relatedFactionIds: [],
    axisId: 'qingyu.120.1', axisSeq: 217, axisAnchor: '六朝清羽记·#120·第118章·弑亲',
    axisBeat: '小紫与碧姬对质后亲手弑母，揭开幼年被出卖与虐待的旧恨；程宗扬与乐明珠在场见证并承接余波。', axisMethod: 'source-rebuilt',
    actions: [
      action('follow_xiaozi_to_biji', '追上小紫与碧姬', '我与乐明珠追到废墟旁，听清小紫向碧姬质问幼年旧事，不把这场对质错写成阻止碧姬逃亡。', { kind: 'prepare', grantsPreparation: 'mother_daughter_confrontation_seen' }),
      action('stay_through_xiaozi_decision', '留在现场承接小紫的决断', '我留在现场见证小紫作出并完成她的决断，在她事后失控哭泣时接住她，承认这件事留下的余波。', { requiresPreparation: ['mother_daughter_confrontation_seen'] }),
    ],
  },
  {
    id: 'lcq.event.s06_05',
    name: '朱老头显露殇侯身份',
    description: '程宗扬沿朱老头引出的路线进入隐秘村落，在叶媪引导下见到鸩羽殇侯，终于确认一路同行的朱老头就是殇侯的化身；殇侯又自称从星象认定程宗扬是天命之人。',
    objective: '循朱老头留下的路线进入村落，当面确认殇侯身份与天命之说',
    locationId: 'liuchao.location.south_wild_valley',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.shang_zhen_yu'],
    relatedFactionIds: ['liuchao.faction.x8b538653d9'],
    axisId: 'qingyu.122.2', axisSeq: 222, axisAnchor: '六朝清羽记·#122·第120章·殇侯',
    axisBeat: '程宗扬循朱老头的路线进入隐秘村落，见到鸩羽殇侯并确认两者是同一人；殇侯称他是天命之人。', axisMethod: 'source-rebuilt',
    actions: [
      action('follow_zhu_route_to_village', '循朱老头路线进入村落', '我从山径白骨与朱老头刻意引路的痕迹确认其中有诈，仍随接引进入隐秘村落。', { kind: 'prepare', grantsPreparation: 'shanghou_village_entered' }),
      action('confirm_shanghou_identity', '当面确认殇侯与天命之说', '我在堂中见到殇侯，从鬼羽剑、吴三桂与一路疑点确认朱老头就是他的化身，并听他说明所谓天命之人。', { requiresPreparation: ['shanghou_village_entered'] }),
    ],
  },
  {
    id: 'lcq.event.s06_06',
    name: '殇侯解除程宗扬冰蛊',
    description: '程宗扬在殇侯处接受处置；到《授艺》谈话时，殇侯明确指出自己已经替他解去苏妲己所下冰蛊。旧稿捏造的具体解法没有原文依据，予以删除。',
    objective: '接受殇侯处置冰蛊，并确认蛊患已经解除',
    locationId: 'liuchao.location.south_wild_valley',
    relatedCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.shang_zhen_yu'],
    relatedFactionIds: ['liuchao.faction.x8b538653d9'],
    axisId: 'qingyu.126.2', axisSeq: 226, axisAnchor: '六朝清羽记·#126·第124章·授艺',
    axisBeat: '殇侯在授艺前的谈话中明确确认已替程宗扬解除冰蛊；原文未交代玄冰掌或盐水等具体解法。', axisMethod: 'source-rebuilt',
    actions: [
      action('accept_shanghou_treatment', '接受殇侯处置冰蛊', '我把苏妲己所下冰蛊与期限如实交代，接受殇侯在村中作出的处置，不擅自补写原文未载的具体解法。', { kind: 'prepare', grantsPreparation: 'ice_gu_treated' }),
      action('confirm_ice_gu_removed', '确认冰蛊已经解除', '在《授艺》谈话中，我听殇侯亲口确认他已替我解去冰蛊，并把这项救命之恩与后续商号委托分开记清。', { requiresPreparation: ['ice_gu_treated'] }),
    ],
  },
];

const ALLOWED_AFFILIATIONS = new Map([
  ['liuchao.character.cheng_zongyang', []],
  ['liuchao.character.xie_yi', ['liuchao.faction.xing_yue_hu']],
  ['liuchao.character.wu_er_lang', ['liuchao.faction.bai_wu', 'liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.ning_yu', ['liuchao.faction.bai_hu_shang_guan']],
  ['liuchao.character.le_mingzhu', ['liuchao.faction.guang_ming_guan_tang']],
  ['liuchao.character.su_li', ['liuchao.faction.hua_miao']],
  ['liuchao.character.xiao_zi', ['liuchao.faction.gui_wang_dong']],
  ['liuchao.character.gui_wu_wang', ['liuchao.faction.gui_wang_dong']],
  ['liuchao.character.dragon_god', []],
  ['liuchao.character.yun_cang_feng', ['liuchao.faction.yun_shi_shang_hui']],
  ['lcq.character.np006', ['liuchao.faction.gui_wang_dong']],
  ['liuchao.character.bi_ji', ['liuchao.faction.biyu', 'liuchao.faction.gui_wang_dong']],
  ['liuchao.character.shang_zhen_yu', ['liuchao.faction.x8b538653d9']],
]);

const minimalCharacter = (id, name, description, role, gender, origin) => ({
  id, name, description, role, gender,
  affiliations: [],
  locationId: id === 'liuchao.character.shang_zhen_yu'
    ? 'liuchao.location.south_wild_valley'
    : 'liuchao.location.gui_wang_dong',
  profile: { origin },
});

// Stage canon 从 opening 即进入 prompt，因此一律采用第112章开场已经可知的最小卡；
// 托孤、弑母、朱老头真身与解蛊等事实只能由对应事件按序揭露。
const MINIMAL_CHARACTERS = new Map([
  ['liuchao.character.cheng_zongyang', minimalCharacter('liuchao.character.cheng_zongyang', '程宗扬', '来自现代世界、随白湖商馆进入南荒的商队成员。', '主角', '男', '现代来客；此时正与乐明珠困在龙神双角附近。')],
  ['liuchao.character.le_mingzhu', minimalCharacter('liuchao.character.le_mingzhu', '乐明珠', '光明观堂弟子，随程宗扬一同落到龙神附近。', '光明观堂弟子', '女', '随程宗扬参与鬼王峒决战。')],
  ['liuchao.character.xie_yi', minimalCharacter('liuchao.character.xie_yi', '谢艺', '自称星月湖谢艺的刀客，正与鬼巫王和龙神交战。', '星月湖刀客', '男', '星月湖成员，商队同行者。')],
  ['liuchao.character.wu_er_lang', minimalCharacter('liuchao.character.wu_er_lang', '武二郎', '白武族勇士，商队此行的重要战力。', '白武族勇士', '男', '白武族人，随商队进入鬼王峒。')],
  ['liuchao.character.ning_yu', minimalCharacter('liuchao.character.ning_yu', '凝羽', '白湖商馆女护卫，外冷少言，正参与围猎龙神。', '商队护卫', '女', '白湖商馆护卫；更深功法来历尚未揭露。')],
  ['liuchao.character.su_li', minimalCharacter('liuchao.character.su_li', '苏荔', '花苗族长，以弓箭和蝎尾参与围猎龙神。', '花苗族长', '女', '花苗族长。')],
  ['liuchao.character.xiao_zi', minimalCharacter('liuchao.character.xiao_zi', '小紫', '一路同行的少女，常以天真无知的姿态示人。', '同行少女', '女', '暂随商队行动；身世与真实立场须由本关事件揭露。')],
  ['liuchao.character.gui_wu_wang', minimalCharacter('liuchao.character.gui_wu_wang', '鬼巫王', '鬼王峒首领，以苍龙星阵唤醒龙神并谋求合体。', '鬼王峒首领', '男', '鬼王峒首领。')],
  ['liuchao.character.dragon_god', minimalCharacter('liuchao.character.dragon_god', '龙神', '沉睡在鬼王峒深井中的巨龙，已被苍龙星阵唤醒。', '龙神', '未知', '鬼王峒地下沉睡的巨龙。')],
  ['lcq.character.np006', minimalCharacter('lcq.character.np006', '阁罗', '鬼王峒主事者，发现受骗后仍返回攻击龙神。', '鬼王峒主事者', '男', '替鬼巫王处理峒务。')],
  ['liuchao.character.yun_cang_feng', minimalCharacter('liuchao.character.yun_cang_feng', '云苍峰', '云氏商会执事，与白湖商队共同经历鬼王峒之战。', '云氏商会执事', '男', '云氏商会执事。')],
  ['liuchao.character.bi_ji', minimalCharacter('liuchao.character.bi_ji', '碧姬', '从鬼王峒废墟逃出的碧鲮族女子。', '碧鲮族女子', '女', '碧鲮族人；她与小紫的关系须到对质事件才揭露。')],
  ['liuchao.character.shang_zhen_yu', minimalCharacter('liuchao.character.shang_zhen_yu', '殇侯', '居于南荒隐秘村落的年长主人。', '村落主人', '男', '其与朱老头的关系须到会面事件才揭露。')],
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

  document.manifest.name = '六朝清羽记·唤龙至授艺';
  document.manifest.description = 'Strict 模式，按《六朝清羽记》第112–124章重建：鬼巫王被吞、围猎龙神、谢艺托孤、小紫弑母、殇侯现身与冰蛊解除。';
  document.manifest.axisSeqLo = 205;
  document.manifest.axisSeqHi = 226;
  document.world.era = '鬼王峒决战至殇侯村落';
  document.world.background = '鬼巫王已经完成苍龙星阵，正以祭品唤醒龙神；商队众人尚不知道合体会逆转。龙神之死、谢艺结局、小紫与碧姬的对质、殇侯身份和冰蛊解除均尚未落账。';
  document.world.continents = document.world.continents.filter(item => item.id === 'liuchao.continent.nanhuang');
  document.scenario.opening.text = '苍龙星阵已经亮起，龙神从深井中苏醒。鬼巫王正准备完成他设想中的合体，你与乐明珠仍在龙角附近，必须先看清星阵究竟束缚了谁。';
  document.scenario.opening.locationId = 'liuchao.location.gui_wang_dong';
  document.scenario.opening.featuredCharacterIds = ['liuchao.character.le_mingzhu', 'liuchao.character.xie_yi', 'liuchao.character.wu_er_lang', 'liuchao.character.ning_yu', 'liuchao.character.su_li', 'liuchao.character.xiao_zi'];

  const requiredCharacterIds = new Set([
    document.scenario.opening.playerCharacterId,
    ...document.scenario.opening.featuredCharacterIds,
    ...EVENTS.flatMap(event => event.relatedCharacterIds),
  ]);
  const characterPool = new Map(document.canon.characters.map(character => [character.id, character]));
  document.canon.characters = [...requiredCharacterIds].map(id => structuredClone(MINIMAL_CHARACTERS.get(id) || characterPool.get(id))).map(character => {
    if (!character) throw new Error('required character missing');
    const allowed = new Set(ALLOWED_AFFILIATIONS.get(character.id) || []);
    const sourceAffiliations = characterPool.get(character.id)?.affiliations || character.affiliations || [];
    character.affiliations = structuredClone(sourceAffiliations).filter(item => allowed.has(item.factionId));
    character.locationId = ['liuchao.character.shang_zhen_yu'].includes(character.id)
      ? 'liuchao.location.south_wild_valley'
      : 'liuchao.location.gui_wang_dong';
    return character;
  });

  const contentFields = [['skills', 'skillIds'], ['techniques', 'techniqueIds'], ['items', 'itemIds']];
  for (const [contentKey, characterKey] of contentFields) {
    const requiredContentIds = new Set(document.canon.characters.flatMap(character => character[characterKey] || []));
    const pool = new Map((document.content[contentKey] || []).map(item => [item.id, item]));
    document.content[contentKey] = [...requiredContentIds].map(id => structuredClone(pool.get(id))).map(item => {
      if (!item) throw new Error(`required ${contentKey} definition missing`);
      return item;
    });
  }

  const requiredFactionIds = new Set([
    ...EVENTS.flatMap(event => event.relatedFactionIds),
    ...document.canon.characters.flatMap(character => character.affiliations.map(item => item.factionId)),
  ]);
  const factionPool = new Map(document.canon.factions.map(faction => [faction.id, faction]));
  document.canon.factions = [...requiredFactionIds].map(id => structuredClone(factionPool.get(id))).map(faction => {
    if (!faction) throw new Error('required faction missing');
    delete faction.headquartersLocationId;
    delete faction.territory;
    return faction;
  });
  const locationPool = new Map(document.canon.locations.map(location => [location.id, location]));
  document.canon.locations = ['liuchao.location.gui_wang_dong', 'liuchao.location.south_wild_valley']
    .map(id => structuredClone(locationPool.get(id)));
  if (document.canon.locations.some(item => !item)) throw new Error('required location missing');

  document.canon.relationships = [
    { fromCharacterId: 'liuchao.character.wu_er_lang', toCharacterId: 'liuchao.character.su_li', relation: '伴侣', score: 60, direction: 'bidirectional' },
    { fromCharacterId: 'liuchao.character.le_mingzhu', toCharacterId: 'liuchao.character.xiao_zi', relation: '同行朋友', score: 30, direction: 'bidirectional' },
    { fromCharacterId: 'liuchao.character.gui_wu_wang', toCharacterId: 'liuchao.character.xiao_zi', relation: '控制与反抗', score: -40, direction: 'directed' },
  ];
  document.canon.factionRelationships = [];
  document.canon.playerRelationships = [
    { characterId: 'liuchao.character.le_mingzhu', relation: '同行伴侣', favorability: 75 },
    { characterId: 'liuchao.character.ning_yu', relation: '同行伴侣', favorability: 70 },
    { characterId: 'liuchao.character.xiao_zi', relation: '同行者', favorability: 20 },
    { characterId: 'liuchao.character.xie_yi', relation: '战友', favorability: 55 },
    { characterId: 'liuchao.character.wu_er_lang', relation: '兄弟', favorability: 45 },
    { characterId: 'liuchao.character.yun_cang_feng', relation: '商队伙伴', favorability: 35 },
    { characterId: 'liuchao.character.su_li', relation: '盟友', favorability: 10 },
    { characterId: 'liuchao.character.gui_wu_wang', relation: '敌人', favorability: -55 },
    { characterId: 'liuchao.character.dragon_god', relation: '当前威胁', favorability: -55 },
  ];
  const availableContentIds = new Set(Object.values(document.content).flatMap(items => items.map(item => item.id)));
  document.rules.contentAccess = (document.rules.contentAccess || []).map(rule => ({
    ...rule,
    allowedCharacterIds: (rule.allowedCharacterIds || []).filter(id => requiredCharacterIds.has(id)),
  })).filter(rule => availableContentIds.has(rule.contentId) && (rule.playerAllowed || rule.allowedCharacterIds.length));

  document.scenario.events = EVENTS.map((definition, index) => {
    const { actions, ...eventDefinition } = definition;
    return {
      ...eventDefinition,
      critical: true,
      conditions: index === 0
        ? [{ path: 'flags.chapter.lcq.stage_06.started', operator: 'eq', value: true }]
        : [{ path: originalById.get(EVENTS[index - 1].id).completion[0].path, operator: 'eq', value: true }],
      completion: structuredClone(originalById.get(definition.id).completion),
      playerCompletionContract: contract(actions),
    };
  });
  document.scenario.chapters = [{
    id: 'lcq.chapter.stage_06',
    title: '唤龙至授艺',
    summary: '鬼巫王被龙神吞噬后，众人完成围猎并承受谢艺之死；小紫与碧姬清算旧怨，程宗扬随后见到殇侯并解除冰蛊。',
    activation: [{ path: 'flags.chapter.lcq.stage_06.started', operator: 'eq', value: true }],
    completion: structuredClone(document.scenario.chapters[0].completion),
    eventIds: EVENTS.map(event => event.id),
  }];
  document.scenario.initialFlags = {
    'chapter.lcq.stage_06.started': true,
    'chapter.lcq.stage_06.done': false,
    ...Object.fromEntries(EVENTS.map(event => [`event.${event.id.split('.').at(-1)}.done`, false])),
  };

  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);

  const stagePlan = JSON.parse(await readFile(stagePlanPath, 'utf8'));
  const plan = stagePlan.stages.find(item => item.id === 'lcq.stage_06');
  if (!plan) throw new Error('stage plan entry missing');
  Object.assign(plan, {
    title: '唤龙至授艺',
    era: '鬼王峒决战至殇侯村落',
    imminentConflict: '苍龙星阵已经唤醒龙神；鬼巫王尚不知道合体会逆转，商队众人即将面对失控龙神。',
    completedFacts: ['谢艺等人已攻至祭台', '程宗扬与乐明珠已抵达龙角附近', '苍龙星阵已经完成'],
    forbiddenFutureFacts: ['龙神最终被杀', '谢艺辞世', '小紫弑母', '朱老头就是殇侯', '冰蛊已解'],
    featuredCharacters: ['程宗扬', '鬼巫王', '龙神', '谢艺', '武二郎', '凝羽', '乐明珠', '苏荔', '小紫'],
    reason: '玩家从合体逆转前介入，依原文顺序经历鬼王峒决战、战后清算与殇侯村落；六个历史 event id 继续作为存档及 IF 锚点。',
    mappingReason: 'EPUB 第112章明确写出鬼巫王被吞；第114章写谢艺遭雷击，第115章才写龙神坠亡；第118章写小紫弑母；第120章揭露殇侯；第124章由殇侯明确确认冰蛊已解。旧 s06_02/s06_03 重复绑定与“玄冰掌和盐水”均不符合原文。',
  });
  await writeFile(stagePlanPath, `${JSON.stringify(stagePlan, null, 2)}\n`);
}

await main();
