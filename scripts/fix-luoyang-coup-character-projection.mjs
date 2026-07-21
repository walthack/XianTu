#!/usr/bin/env node

// R2-11N/O：修复 lyl.luoyang_coup 人物投影（43e4380 来源重建未触及人物层）。
//
// 依据 EPUB 第 66 集《两宫交兵》逐章核对（0359-0371，章序与 yunlong/source-index.json 一致）：
// - 逐拍校准八个事件的 relatedCharacterIds：只收该拍映射章内实际在场并行动的人物；
//   仅被提及、未出场者不挂（桓郁从未出场，故不挂）。
// - s06_04b 移除误挂的班超：《赏格》（0369）一章班超仅被场外提及（"让班超准备了一批钱铢"），
//   本人未出场。班超在 s06_02（0366《侠义》通商里议事）确在场，保留。
// - 缺失的真实参与者按时间门控补入 canon.characters（本关 275-288 时区内登场，补空不覆盖）。
//
// R2-11O 修订（用户裁定）：跨关复制整个角色条目会把后期身份/经历/外貌带进早期时间线
// （如金蜜镝的凉州军阵外貌、中行说的「内宅总管」、齐羽仙的「玉姬」race），
// 改为**本关最小字段白名单投影**——条目只含：
//   id / name / description / role / gender / affiliations / locationId / profile{origin(, notes)}
// description、affiliations、locationId 一律按本关时区人工撰写或裁剪；
// 静态档案（appearance/personality/attributes/spiritRoot/talents）不写入 stage，
// 由 canon:build 卡投影与运行时 registry（character-registry.json）还原。
// 境界（realm）、技能/物品引用属进度量，一律不写。
//
// 左悺／刘子骏／吕戟三人无总卡，按 R2-10L「stage-canon-gap-recovered」先例补最小卡，
// 只采用本次原文核对坐实的事实，不外推外貌、台词与未知关系。
//
// 幂等且自修复：同 id 条目先删后写，可重复运行。
// 备份永不覆盖原始快照：stages-pre-r2-11n-charfix-backup/ 与
// character-cards-v3.json.pre-r2-11n.bak 只在不存在时创建。

import { cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const stagePath = join(gen, 'yunlong/stages/lyl.luoyang_coup.json');
const cardsPath = join(gen, 'character-canon/character-cards-v3.json');

// ─── 八拍 relatedCharacterIds 校准（拍 ← 源章，证据见各行注释）───────────────
const RELATED = {
  // 280《凌辱》+281《治丧》：藻井目睹；义姁六识禁绝丹、胡夫人拟声、张恽服侍吕冀皆为假死局在场执行者。
  'lyl.event.s06_01b': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.zhao_he_de',
    'liuchao.character.lv_ji', 'lyl.character.np060',
    'liuchao.character.zhang_yun', 'liuchao.character.yi_xin', 'liuchao.character.hu_fu_ren',
  ],
  // 282《矫诏》：换内侍服护二赵撤回长秋宫；刘建矫诏劫持吕冀、中行说持刀参与、金蜜镝请皇后回宫并留守护驾。
  'lyl.event.s06_01': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.zhao_feiyan',
    'liuchao.character.zhao_he_de', 'liuchao.character.lv_ji',
    'lyl.character.liu_jian', 'liuchao.character.zhong_hangyue', 'liuchao.character.jin_mi_di',
  ],
  // 283《侠义》：通商里议事定拥立并分派任务；班超、高智商、吴三桂均在场受命。
  'lyl.event.s06_02': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.yun_dan_liu',
    'liuchao.character.qin_hui', 'liuchao.character.np069',
    'lyl.character.np016', 'liuchao.character.np007',
    'liuchao.character.guo_jie', 'lyl.character.np067',
    'liuchao.character.gao_zhishang', 'liuchao.character.wu_san_gui',
  ],
  // 284《乱军》：密道潜回、皇后下诏授金蜜镝宫禁、封门救徐璜唐衡左悺；吕冀仅被提及（伤重不能理事），移除。
  'lyl.event.s06_03': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.yun_dan_liu',
    'liuchao.character.np007', 'liuchao.character.zhao_feiyan',
    'liuchao.character.jin_mi_di', 'liuchao.character.cai_jingzhong',
    'liuchao.character.xu_huang', 'liuchao.character.tang_heng',
    'lyl.character.zuo_huan', 'lyl.character.liu_jian',
  ],
  // 285《空饷》：长秋宫守卫战；刘子骏率中垒军主攻、苍鹭指挥、齐羽仙随刘建军、左悺被推入敌阵失踪。
  'lyl.event.s06_04': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.cai_jingzhong',
    'liuchao.character.ao_run', 'lyl.character.liu_jian',
    'lyl.character.cang_lu', 'lyl.character.liu_zijun',
    'liuchao.character.wu_san_gui', 'liuchao.character.yun_dan_liu',
    'liuchao.character.lu_jing', 'lyl.character.zuo_huan',
    'liuchao.character.qi_yu_xian',
  ],
  // 286《赏格》：派敖润赴池阳宫、立赏格、蔡敬仲为北宫内侍力争；班超仅被场外提及，移除（用户裁定+原文核对）。
  'lyl.event.s06_04b': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.ao_run',
    'liuchao.character.cai_jingzhong', 'liuchao.character.zhao_feiyan',
    'liuchao.character.lu_jing',
  ],
  // 287《诱动》：谈判；吴三桂巡视发现投奔的中垒军军司马并报信（"听战况"一步的来源）。
  'lyl.event.s06_05': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.jian_yu_ji',
    'liuchao.character.cai_jingzhong', 'liuchao.character.wu_san_gui',
  ],
  // 288《阻境》：通宵拖住齐羽仙、阙楼观战、移宫路线转告齐羽仙；蔡敬仲击杀吕戟并泄移宫计划给程宗扬。
  'lyl.event.s06_06': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.qi_yu_xian',
    'liuchao.character.cai_jingzhong', 'liuchao.character.lv_fengxian',
    'lyl.character.lv_ji_changshui', 'lyl.character.cang_lu',
    'lyl.character.liu_jian', 'liuchao.character.yun_dan_liu',
    'liuchao.character.lu_jing',
  ],
};

// ─── canon.characters 补入（11 人，本关最小字段白名单）─────────────────────
// 白名单：id / name / description / role / gender / affiliations / locationId / profile{origin(, notes)}。
// description 与 affiliations 按本关时区撰写；origin 取总卡 identitySummary 中本时区已成立的部分。
const CHARACTER_ADDITIONS = [
  {
    id: 'liuchao.character.ao_run',
    name: '敖润',
    description: '敖润虽然身材短小、貌不惊人，坐在那里总是一副臊眉耷眼的样子，但性情粗豪豪爽、心直口快，是程宗扬麾下最重情重义的铁杆兄弟。',
    role: '护卫',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.pan_jiang_cheng', category: 'organization', role: '护卫' },
      { factionId: 'liuchao.faction.xue_sun', category: 'organization', role: '团员' },
      { factionId: 'liuchao.faction.x2d33e1eaf9', category: 'organization', role: '队员' },
    ],
    locationId: 'lyl.location.changqiu_palace',
    profile: { origin: '护卫头领' },
  },
  {
    id: 'liuchao.character.qi_yu_xian',
    name: '齐羽仙',
    description: '齐羽仙是黑魔海巫宗仙姬、剑玉姬麾下执行者，雪肤玉颜、心如机括；洛都政变中她以黑衣面纱之身随刘建军中运筹，又奉剑玉姬之命与程宗扬彻夜谈判。',
    role: '次要反派',
    gender: '女',
    affiliations: [
      { factionId: 'liuchao.faction.wu_zong', category: 'sect', role: '门人' },
      { factionId: 'liuchao.faction.hei_mo_hai', category: 'organization', role: '执行者/仙姬近侍' },
    ],
    locationId: 'liuchao.location.luoyang',
    profile: { origin: '黑魔海巫宗仙姬，剑玉姬麾下执行者' },
  },
  {
    id: 'liuchao.character.jin_mi_di',
    name: '金蜜镝',
    description: '金蜜镝是车骑将军，匈奴浑邪王血脉的社稷重臣；天子暴毙当夜他光脚乘驭马驰入宫，探得鼻息后当场呕血，随后率期门武士护佐皇后退守长秋宫。',
    role: '车骑将军',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'military', role: '车骑将军' },
    ],
    locationId: 'lyl.location.zhaoyang_palace',
    profile: { origin: '汉国社稷之臣，与霍子孟齐名并列朝廷栋梁' },
  },
  {
    id: 'liuchao.character.xu_huang',
    name: '徐璜',
    description: '徐璜身为中常侍，总是满脸堆欢地赔着笑脸，但那圆滑奉承底下藏着贪婪的心机，稍有不顺便脸色铁青，易怒却又不失谨慎，是个善变的盟友。',
    role: '盟友',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'state', role: '中常侍' },
      { factionId: 'lyg.faction.eunuch_group', category: 'organization', role: '成员' },
    ],
    locationId: 'lyl.location.changqiu_palace',
    profile: { origin: '内臣/宦官/天子家奴' },
  },
  {
    id: 'liuchao.character.tang_heng',
    name: '唐衡',
    description: '唐衡是中常侍，阴沉隐忍、善于察言观色；洛都政变中与徐璜、左悺同被吕氏擒拿关押，经程宗扬一行斩镣救出。',
    role: '中常侍（内臣/宦官）',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'state', role: '中常侍（金珰右貂）' },
      { factionId: 'lyg.faction.eunuch_group', category: 'organization', role: '天子心腹' },
    ],
    locationId: 'lyl.location.changqiu_palace',
    profile: { origin: '中常侍（内臣/宦官）' },
  },
  {
    id: 'liuchao.character.zhong_hangyue',
    name: '中行说',
    description: '中行说是天子近侍的中常侍，下巴光溜溜，一脸桀骜不驯的傲气；天子暴毙后他持刀劫持吕冀逼问先帝死因，随后随刘建突围出宫。',
    role: '中常侍（天子近侍）',
    gender: '男',
    // 时间门控：本时区他尚未投奔程宗扬，「内宅总管」是燕歌行时区身份，
    // 由 scripts/project-affiliations-to-stages.mjs 的排除表防止投影回灌。
    affiliations: [
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'state', role: '中常侍/天子近侍' },
    ],
    locationId: 'liuchao.location.luoyang',
    profile: { origin: '太监' },
  },
  {
    id: 'liuchao.character.gao_zhishang',
    name: '高智商',
    description: '矮胖圆脸、瘸着腿的宋国太尉之子，师从程宗扬，自诩聪明绝顶，靠一张巧嘴四处应酬，可惜藏不住心事，一激就跳脚，带着几分天真的傲气。',
    role: '弟子',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.x2d33e1eaf9', category: 'organization', role: '徒弟/随从' },
    ],
    locationId: 'liuchao.location.luoyang',
    profile: { origin: '宋国太尉高俅义子（人称高衙内），拜程宗扬为师' },
  },
  {
    id: 'liuchao.character.wu_san_gui',
    name: '吴三桂',
    description: '吴三桂是殇侯指派跟随程宗扬的护卫，沉默如铁；洛都政变中他领二十名好手随程宗扬潜入宫城，又率武士突阵剖开中垒军的方阵。',
    role: '护卫',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.x8b538653d9', category: 'organization', role: '部属' },
      { factionId: 'liuchao.faction.cheng_shi_shang_hui', category: 'organization', role: '随从（殇侯指派协助程宗扬）' },
      { factionId: 'liuchao.faction.x2d33e1eaf9', category: 'organization', role: '护卫/随从' },
      { factionId: 'liuchao.faction.xing_yue_hu', category: 'military', role: '中尉连长' },
    ],
    locationId: 'lyl.location.changqiu_palace',
    profile: { origin: '殇侯麾下将领，后受命跟随程宗扬' },
  },
  {
    id: 'lyl.character.zuo_huan',
    name: '左悺',
    description: '左悺是中常侍之一，洛都政变中被吕氏擒拿关押，受审时赌咒发誓自证；经程宗扬一行从玉堂前殿救出后惊魂未定，长秋宫守卫战中被蔡敬仲拖到阵前、推入敌阵后下落不明。',
    role: '中常侍',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'state', role: '中常侍' },
      { factionId: 'lyg.faction.eunuch_group', category: 'organization', role: '成员' },
    ],
    locationId: 'lyl.location.changqiu_palace',
    profile: {
      origin: '中常侍（内臣/宦官）',
      notes: ['【主轴】洛都政变中被擒，程宗扬一行斩镣救出；长秋宫守卫战被推入敌阵，下落不明。'],
    },
  },
  {
    id: 'lyl.character.liu_zijun',
    name: '刘子骏',
    description: '刘子骏是刘氏宗亲出身的中垒校尉，率七百名中垒军投奔刘建，强攻南宫、进逼长秋宫三十六级台阶；后轻车突进永安宫劝太后移宫，被射声军射杀。',
    role: '中垒校尉',
    gender: '男',
    affiliations: [
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'military', role: '中垒校尉' },
      { factionId: 'lyl.faction.liu_jian', category: 'organization', role: '投靠校尉' },
    ],
    locationId: 'liuchao.location.luoyang',
    profile: {
      origin: '中垒校尉（刘氏宗亲）',
      notes: ['【主轴】率中垒军投刘建，攻南宫、逼长秋宫；永安宫前被射声军射杀，太后下令连其家人一并厚葬。'],
    },
  },
  {
    // 吕冀已占 liuchao.character.lv_ji；flag slug 取 id 末段，故以官职消歧，避免两人状态折叠。
    id: 'lyl.character.lv_ji_changshui',
    name: '吕戟',
    description: '吕戟是太后吕雉的侄儿、长水校尉，宿醉方醒便妄言诛人九族；率宣曲长水军入长秋宫接收后妃、调戏林婕妤，被蔡敬仲一掌击毙。',
    role: '长水校尉',
    gender: '男',
    affiliations: [
      { factionId: 'lyl.faction.lyu_clan', category: 'clan', role: '吕氏族人' },
      { factionId: 'liuchao.faction.han_guo_chao_ting', category: 'military', role: '长水校尉' },
    ],
    locationId: 'lyl.location.weiyang_palace',
    profile: {
      origin: '长水校尉（吕氏族人，称太后吕雉为姑母）',
      notes: ['【主轴】率长水军入长秋宫接收后妃，被蔡敬仲击毙。'],
    },
  },
];

// ─── 三张最小总卡（R2-10L 先例：stage-canon-gap-recovered，只用原文坐实事实）──
const CARD_REVIEW = {
  approved: false,
  reviewed: true,
  flags: ['stage-canon-gap-recovered'],
  conflicts: [],
  note: '结构化缺卡审计补建；仅采用已入库关卡正典，不外推原作未载事实',
};
const CARD_ADDITIONS = [
  {
    canonicalName: '左悺',
    gender: '男',
    books: ['yunlong'],
    tier: '次要',
    review: { ...CARD_REVIEW },
    staticProfile: {
      identitySummary: '中常侍（内臣/宦官）',
      personality: ['胆小怕事', '急于自保'],
      appearance: '',
      speechStyle: '',
      principles: [],
      goals: [],
      weaknesses: [],
      signatureAbilities: [],
      relationToProtagonist: ['被程宗扬一行从玉堂前殿救出'],
      formsOfAddress: [],
      joining: [],
      keyEvents: [
        '洛都政变中被吕氏擒拿关押，受审时赌咒发誓自证',
        '程宗扬、云丹琉斩铁镣将其救出',
        '长秋宫守卫战中被蔡敬仲拖到阵前、推入敌阵，下落不明',
      ],
      ending: ['长秋宫守卫战中被推入敌阵，下落不明'],
      affiliations: [{ faction: '宦官集团', role: '中常侍' }],
      debutLocation: {
        location: '洛都南宫玉堂前殿',
        locator: 'lyl.luoyang_coup',
        scene: '政变中被吕氏擒拿关押于玉堂前殿，经程宗扬一行救出',
      },
    },
    phaseIdentities: [],
    sourceCards: [],
  },
  {
    canonicalName: '刘子骏',
    gender: '男',
    books: ['yunlong'],
    tier: '次要',
    review: { ...CARD_REVIEW },
    staticProfile: {
      identitySummary: '中垒校尉（刘氏宗亲）',
      personality: ['急进轻率'],
      appearance: '',
      speechStyle: '',
      principles: [],
      goals: [],
      weaknesses: [],
      signatureAbilities: [],
      relationToProtagonist: ['长秋宫守卫战中的攻方将领'],
      formsOfAddress: [],
      joining: [],
      keyEvents: [
        '率七百名中垒军投奔刘建，强攻南宫、进逼长秋宫三十六级台阶',
        '轻车突进永安宫劝太后移宫，被射声军射杀',
      ],
      ending: ['永安宫前被射声军射杀，太后下令连其家人一并厚葬'],
      affiliations: [
        { faction: '汉国朝廷', role: '中垒校尉' },
        { faction: '刘建集团', role: '投靠校尉' },
      ],
      debutLocation: {
        location: '洛都南宫',
        locator: 'lyl.luoyang_coup',
        scene: '率中垒军投刘建，强攻南宫',
      },
    },
    phaseIdentities: [],
    sourceCards: [],
  },
  {
    canonicalName: '吕戟',
    gender: '男',
    books: ['yunlong'],
    tier: '次要',
    review: { ...CARD_REVIEW },
    staticProfile: {
      identitySummary: '长水校尉（吕氏族人，太后吕雉之侄）',
      personality: ['狂妄', '贪杯误事'],
      appearance: '',
      speechStyle: '',
      principles: [],
      goals: [],
      weaknesses: [],
      signatureAbilities: [],
      relationToProtagonist: ['率长水军入长秋宫接收后妃，被蔡敬仲击毙'],
      formsOfAddress: [],
      joining: [],
      keyEvents: [
        '宿醉方醒妄言诛九族，被吕雉斥为蠢才',
        '率宣曲长水军入长秋宫接收后妃、调戏林婕妤，被蔡敬仲一掌击毙',
      ],
      ending: ['长秋宫被蔡敬仲击毙'],
      affiliations: [
        { faction: '吕氏集团', role: '族人' },
        { faction: '汉国朝廷', role: '长水校尉' },
      ],
      debutLocation: {
        location: '洛都永安宫',
        locator: 'lyl.luoyang_coup',
        scene: '永安宫御前宿醉妄言，后率长水军入长秋宫',
      },
    },
    phaseIdentities: [],
    sourceCards: [],
  },
];

// ─── 备份（永不覆盖原始快照：只在不存在时创建）──
const backupDir = join(gen, 'yunlong/stages-pre-r2-11n-charfix-backup');
const backupCreated = !existsSync(backupDir);
if (backupCreated) await cp(join(gen, 'yunlong/stages'), backupDir, { recursive: true });
const cardsBackupCreated = !existsSync(`${cardsPath}.pre-r2-11n.bak`);
if (cardsBackupCreated) await writeFile(`${cardsPath}.pre-r2-11n.bak`, await readFile(cardsPath, 'utf8'));

// ─── stage：白名单补人物（同 id 先删后写，自修复）+ 校准 relatedCharacterIds ───
const stage = JSON.parse(await readFile(stagePath, 'utf8'));
const additionIds = new Set(CHARACTER_ADDITIONS.map(c => c.id));
const kept = stage.canon.characters.filter(c => !additionIds.has(c.id));
stage.canon.characters = [...kept, ...CHARACTER_ADDITIONS.map(c => structuredClone(c))];

const relChanged = [];
for (const event of stage.scenario.events) {
  const next = RELATED[event.id];
  if (!next) continue;
  if (JSON.stringify(event.relatedCharacterIds) !== JSON.stringify(next)) {
    event.relatedCharacterIds = next;
    relChanged.push(event.id);
  }
}
await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);

// ─── 总卡：补三张最小卡（已存在则跳过，不覆盖）──
const cardsDoc = JSON.parse(await readFile(cardsPath, 'utf8'));
const covered = new Set(cardsDoc.characters.map(c => c.canonicalName));
const cardsAdded = [];
for (const card of CARD_ADDITIONS) {
  if (covered.has(card.canonicalName)) continue;
  cardsDoc.characters.push(card);
  cardsAdded.push(card.canonicalName);
}
await writeFile(cardsPath, `${JSON.stringify(cardsDoc, null, 2)}\n`);

console.log(JSON.stringify({
  backupCreated,
  backupPreserved: !backupCreated,
  cardsBackupCreated,
  charactersUpserted: [...additionIds],
  relatedCalibrated: relChanged,
  cardsAdded,
}, null, 2));
