
import {entityAliases} from './namedEntities';

import {isNamedEntityLabel} from './namedEntities';
import {entityNamePattern} from './namedEntities';
/**
 * 角色档案运行时还原（Character Resolver）—— 全量 P4 的核心。
 *
 * mod 阶段文件里角色只保留动态字段（id/name/role/realm/affiliations/skillIds…），
 * 静态档案（appearance/personality/origin/派生 notes）从共享 character-registry.json
 * 在「物化到存档」那一刻按 id/name 还原回来。
 *
 * 关键性质：
 * - 纯静态查表（非 RAG），与 embedding 是否启用无关 → embedding 关的用户也能拿到完整角色。
 * - 只在新开档物化时运行；旧档已烘焙完整角色，不受影响。
 * - 还原逻辑与构建期 scripts/apply-character-cards-v3-to-mod.mjs 的 buildNotes/applyCardToCharacter 一一对应。
 */
import registryJson from './builtins/character-registry.json';
import { syncCharacterNaming, namingChapter, namingFor, isSouthernStage } from './ledger/naming';
import ledgerOverrides from '../../../mod-kit/entity-ledger/overrides.json';

interface RegistryPhase {
  scope?: string;
  stageId?: string;
  seq?: string;
  identity?: string;
  description?: string;
  role?: string;
  status?: string;
  forbidden?: string[];
  appearance?: string;
  personality?: string[];
  relationToProtagonist?: string[] | string;
  formsOfAddress?: string[] | string;
  speechStyle?: string[] | string;
  principles?: string[] | string;
  goals?: string[] | string;
  weaknesses?: string[] | string;
  signatureAbilities?: string[] | string;
  joining?: string[] | string;
  keyEvents?: string[];
  ending?: string[] | string;
  hideCanonicalAlias?: boolean;
  blockedStageNotePrefixes?: string[];
}
/** 换装换不掉的体貌；与 visualOutfits 成对，见 portrait-visual-master.json 的分层说明 */
interface VisualIdentity {
  hairColor?: string;
  hair?: string;
  eyes?: string;
  face?: string;
  build?: string;
  marks?: string[];
  /** 真身特征（狐尾/蝎尾/龙鳞）：属身份秘密，注入时必须带门控，见 buildNotes */
  trueForm?: string[];
  canonOverride?: string;
}
interface VisualOutfit {
  id: string;
  label?: string;
  /** default | stage:<stageId> | phase:<label> | unassigned */
  scope: string;
  outfit: string;
  accessories?: string;
  palette?: string[];
  props?: string;
}
interface RegistryStaticProfile {
  identitySummary?: string;
  appearance?: string;
  visualIdentity?: VisualIdentity;
  visualOutfits?: VisualOutfit[];
  race?: string;
  personality?: string[];
  relationToProtagonist?: string[] | string;
  formsOfAddress?: string[] | string;
  speechStyle?: string[] | string;
  principles?: string[] | string;
  goals?: string[] | string;
  weaknesses?: string[] | string;
  signatureAbilities?: string[] | string;
  joining?: string[] | string;
  keyEvents?: string[];
  ending?: string[] | string;
  crossStageMemories?: Array<{ bookRank?: number; label?: string; text?: string }>;
  birthYear?: number;
  storyAge?: { value?: unknown; basis?: string };
}
interface RegistryEntry {
  id: string;
  canonicalName: string;
  aliases?: string[];
  gender?: string;
  entityType?: 'character' | 'creature';
  tier?: string;
  staticProfile?: RegistryStaticProfile;
  phaseIdentities?: RegistryPhase[];
  review?: { humanNotes?: string[]; aliasMerged?: string[]; followUps?: string[] };
}

const DERIVED_TAGS = [
  '【历程】', '【生辰】',
  '【关系】', '【称呼】', '【谈吐】', '【底线】', '【目标】', '【软肋】', '【绝技】',
  '【入伙】', '【情节】', '【结局】', '【阶段身份】', '【本阶段禁用】', '【人工正典】',
  '【体貌】', '【装束】', '【真身特征】',
];

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}
function unique(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values.flat().filter(v => v !== undefined && v !== null && v !== '')) {
    const key = String(value).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
function compact(value: unknown, max = 260): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
function stagePhase(entry: RegistryEntry, stageId: string): RegistryPhase | undefined {
  return asArray(entry.phaseIdentities).find(p => p.scope === 'stage-projection' && p.stageId === stageId);
}
function relationshipPhases(entry: RegistryEntry): RegistryPhase[] {
  return asArray(entry.phaseIdentities).filter(p => p.scope === 'relationship-chain' || p.scope === 'identity-chain');
}

/**
 * 本关身份已表明归属 → 转折已经发生，转折前的禁令不再适用。
 * 依据是 registry 里 role 本来就按关卡区分了前后：孙寿在云龙是「吕氏外戚女眷」、
 * 在燕歌是「程宗扬内宅侍婢」；吕雉在云龙是「汉国太后与吕氏权力核心」、
 * 在燕歌是「原汉国太后，现为程宗扬性奴婢」。
 */
const AFTER_TURNING_POINT_RE = /后宫|侍妾|妾室|侍婢|侍奴|女奴|内宅|心腹|性奴|奴婢|道侣|伴侣|夫妻|情人/;
function phaseProfileValue<K extends keyof RegistryStaticProfile>(
  profile: RegistryStaticProfile,
  currentPhase: RegistryPhase | undefined,
  key: K,
): RegistryStaticProfile[K] {
  return currentPhase && Object.prototype.hasOwnProperty.call(currentPhase, key)
    ? currentPhase[key as keyof RegistryPhase] as RegistryStaticProfile[K]
    : currentPhase?.stageId && isSouthernStage(currentPhase.stageId) ? undefined as RegistryStaticProfile[K] : profile[key];
}
// 关卡所属书序：lcq(清羽)=0 / lyl(云龙)=1 / lyg(燕歌)=2；未知前缀视为最末（全量注入历程）
function stageBookRank(stageId: string): number {
  if (stageId.startsWith('lcq.')) return 0;
  if (stageId.startsWith('lyl.')) return 1;
  if (stageId.startsWith('lyg.')) return 2;
  return 99;
}

/**
 * 选出该关卡应穿的那套装束：绑定到本关的优先，否则回落到常态那套。
 * 独立导出是为了可单测，也供将来的出图脚本按同一规则取装束。
 */
export function pickOutfitForStage(outfits: VisualOutfit[] | undefined, stageId: string): VisualOutfit | undefined {
  if (!Array.isArray(outfits) || !outfits.length) return undefined;
  return outfits.find(o => o.scope === `stage:${stageId}`) || outfits.find(o => o.scope === 'default');
}

function buildNotes(entry: RegistryEntry, currentPhase: RegistryPhase | undefined, stageId = ''): string[] {
  const profile = entry.staticProfile || {};
  const notes: string[] = [];
  const add = (tag: string, value: unknown, max = 360) => {
    const values = unique(asArray(value as unknown[])).map(item => compact(item, max));
    if (values.length) notes.push(`【${tag}】${values.join('；')}`);
  };
  // 体貌与装束分层：服装随场景更换，体貌不变。分开注入是为了让 storyContext 规则 4
  // （换装须取其族裔样式、并保留刺青饰物发式）有据可依，而不是靠 race 字段猜。
  const vi = profile.visualIdentity;
  if (vi) {
    const body = [vi.hair, vi.eyes, vi.face, vi.build, ...(vi.marks || [])].filter(Boolean);
    if (body.length) add('体貌', `${body.join('；')}——换装不改变这些特征`, 420);
  }
  const outfits = profile.visualOutfits || [];
  if (outfits.length) {
    const worn = pickOutfitForStage(outfits, stageId);
    if (worn) {
      const parts = [worn.outfit, worn.accessories, (worn.palette || []).join('／'), worn.props].filter(Boolean);
      const label = worn.label ? `（${worn.label}）` : '';
      add('装束', `${label}${parts.join('；')}——此为当前常态装束，可随场景更换`, 420);
    }
  }
  // 真身特征单独注入并带门控：狐尾/蝎尾这类是身份秘密，且原文中平时以「化身藏形」隐去。
  // 不能与常态体貌混写，否则 LLM 会当作人人可见的外观直接写进正文（storyContext 规则 5 管这个）。
  if (vi?.trueForm?.length) {
    add('真身特征', `${vi.trueForm.join('；')}——仅在其显露真身时可见，平时隐去；`
      + '场内人物是否知情按【人物真身】规则判断，不得作为既知前提', 320);
  }

  // 跨本历程：只注入早于当前关卡所属书的经历（跨本长期记忆·方案A；不含本书/后书防剧透）
  const rank = stageBookRank(stageId);
  for (const mem of asArray(profile.crossStageMemories)) {
    if (mem && typeof mem.bookRank === 'number' && mem.bookRank < rank && mem.text) {
      add('历程', `${mem.label || ''}${mem.text}`, 300);
    }
  }
  if (typeof profile.birthYear === 'number') add('生辰', `约纪元${profile.birthYear}年生（防误算：这是出生年，非年龄）`);
  // 走向类字段（关系/入伙/情节/结局）在静态卡里是全书终点快照，只在两种情况下取值：
  // ① 本关 phase 覆盖了该字段；② 角色在关系链上声明了转折（allowed-after-turning-point），
  //    且本关有投影却留空——既有约定：转折前逐关写“尚未…”，转折后留空沿用终态。
  // 没有转折声明的角色（凝羽、月霜等），或本关根本没有投影时，不回落静态卡，
  // 否则早期关卡会提前注入后期关系、成人情节与结局。
  const finalStateAllowed = Boolean(currentPhase)
    && relationshipPhases(entry).some(phase => phase.status === 'allowed-after-turning-point');
  const trajectory = <K extends 'relationToProtagonist' | 'joining' | 'keyEvents' | 'ending'>(key: K) => (
    currentPhase && Object.prototype.hasOwnProperty.call(currentPhase, key)
      ? currentPhase[key]
      : isSouthernStage(stageId) ? undefined : finalStateAllowed ? profile[key] : undefined
  );
  add('关系', trajectory('relationToProtagonist'));
  add('称呼', phaseProfileValue(profile, currentPhase, 'formsOfAddress'));
  add('谈吐', phaseProfileValue(profile, currentPhase, 'speechStyle'));
  add('底线', phaseProfileValue(profile, currentPhase, 'principles'));
  add('目标', phaseProfileValue(profile, currentPhase, 'goals'));
  add('软肋', phaseProfileValue(profile, currentPhase, 'weaknesses'));
  add('绝技', phaseProfileValue(profile, currentPhase, 'signatureAbilities'));
  add('入伙', trajectory('joining'));
  add('情节', asArray(trajectory('keyEvents')).slice(0, 8));
  add('结局', trajectory('ending'));
  // 有明确关卡投影时，只注入该关开场身份；完整关系链包含未来分支，不能进游戏提示词。
  if (!currentPhase) {
    for (const phase of relationshipPhases(entry)) {
      const line = [phase.seq, phase.identity, phase.status ? `status=${phase.status}` : ''].filter(Boolean).join('：');
      add('阶段身份', line, 520);
      if (phase.forbidden?.length) add('本阶段禁用', `${phase.seq}：${phase.forbidden.join('、')}`, 360);
    }
  }
  if (currentPhase) {
    add('阶段身份', currentPhase.identity || currentPhase.role || '', 520);
    if (currentPhase.forbidden?.length) add('本阶段禁用', `${currentPhase.stageId}：${currentPhase.forbidden.join('、')}`, 360);
    // 「转折前禁止提前写成后宫／侍妾／情人」是**纯约束、不含未来信息**，与上面被刻意排除的
    // 「转折后才可写入」不同。此前两者被同一个 `if (!currentPhase)` 一起丢弃——恰恰在角色
    // 真正登场的关卡里失效：实测 33 名角色、302 个「角色×关卡」组合无一注入（小紫 33 关、
    // 卓云君 24 关、潘金莲 20 关、吕雉 18 关全丢）。现按本关身份判断后单独补回。
    const settled = AFTER_TURNING_POINT_RE.test(`${currentPhase.identity || ''} ${currentPhase.role || ''}`);
    if (!settled) {
      for (const phase of relationshipPhases(entry)) {
        if (phase.status !== 'forbid-final-state-before-turning-point') continue;
        add('关系身份门禁', `${phase.seq || '转折前'}：${phase.identity || ''}`, 360);
      }
    }
  }
  // review.humanNotes / followUps 是内部维护记录（含日期/"扫描抓了…"等工程语），不进游戏
  // （曾泄漏到人物面板与 LLM 提示词）。别名合并信息对 LLM 有用且不尴尬，保留。
  if (!currentPhase?.hideCanonicalAlias) {
    add('人工正典', entry.review?.aliasMerged?.map(alias => `${alias} 已并入 ${entry.canonicalName}`));
  }
  return unique(notes);
}

// stable id / name / alias -> registry entry
const byId = new Map<string, RegistryEntry>();
const byName = new Map<string, RegistryEntry>();
for (const entry of (registryJson as { characters: RegistryEntry[] }).characters || []) {
  byId.set(entry.id, entry);
  for(const alias of (entry as any).idAliases||[])byId.set(alias,entry);
  byName.set(entry.canonicalName, entry);
  for (const alias of entry.aliases || []) if (!byName.has(alias)) byName.set(alias, entry);
}

/** 年龄只取源卡事实，不解析角色称谓，也不把出生年当年龄。 */
export function getRegistryAgeFacts(character: { id?: string; name?: string }) {
  const entry = byId.get(character.id || '') || byName.get(character.name || '');
  return { birthYear: entry?.staticProfile?.birthYear, storyAge: entry?.staticProfile?.storyAge };
}

// 与构建期 apply-character-cards-v3-to-mod.mjs 同步：早期关卡里的未揭示称谓
// 不得因 alias 命中全局 registry 而在新档物化时补出未来身份或画像。
const CARD_TIME_GATE_EXCLUSIONS: Record<string, Set<string>> = {
  'lcq.stage_03b_snake_flower_bridge': new Set(['liuchao.character.shang_zhen_yu', 'liuchao.character.le_mingzhu']),
  'lcq.stage_04': new Set(['liuchao.character.shang_zhen_yu', 'liuchao.character.le_mingzhu']),
  'lcq.stage_04b_lingfei_baiyi_crisis': new Set(['liuchao.character.shang_zhen_yu']),
  'lcq.stage_05b': new Set(['liuchao.character.shang_zhen_yu']),
  'lcq.stage_05': new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu',
    'liuchao.character.xiao_zi', 'liuchao.character.xie_yi',
    'liuchao.character.yun_cang_feng', 'liuchao.character.ning_yu',
    'liuchao.character.wu_er_lang', 'liuchao.character.su_li',
    'liuchao.character.qi_yuan', 'lcq.character.np004',
    'lcq.character.np006', 'liuchao.character.bi_ji',
    'liuchao.character.a_xi', 'liuchao.character.dan_chen',
  ]),
  'lcq.stage_03': new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.su_daji',
    'liuchao.character.ning_yu', 'liuchao.character.a_jiman_bana',
    'liuchao.character.wu_er_lang', 'liuchao.character.xi_men_qing',
    'liuchao.character.qi_yuan', 'liuchao.character.yun_cang_feng',
    'liuchao.character.xie_yi',
  ]),
  'lcq.stage_06': new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu',
    'liuchao.character.xie_yi', 'liuchao.character.wu_er_lang',
    'liuchao.character.ning_yu', 'liuchao.character.su_li',
    'liuchao.character.xiao_zi', 'liuchao.character.gui_wu_wang',
    'liuchao.character.dragon_god', 'lcq.character.np006',
    'liuchao.character.yun_cang_feng', 'liuchao.character.bi_ji',
    'liuchao.character.shang_zhen_yu',
  ]),
  'lyl.lin_an_black_sea': new Set([
    'liuchao.character.ruan_xiang_ning',
  ]),
  'lyl.lin_an_bridge': new Set([
    'liuchao.character.ruan_xiang_ning',
  ]),
  'lyl.xiaoyingzhou_blacksea_trap': new Set([
    'liuchao.character.ruan_xiang_ning',
  ]),
  'lyl.taiquan_expedition': new Set([
    'canon.character.7718ae444a',
    'liuchao.character.ruan_xiang_lin',
    'liuchao.character.ruan_xiang_ning',
    'liuchao.character.gao_zhishang',
    'liuchao.character.lu_qian',
  ]),
};

/**
 * 用注册表把一个精简角色还原为完整角色（原地修改 character.profile）。
 * 已经带完整 profile 的旧档角色也安全：force 覆盖为正典静态档，动态字段保留。
 */
function resolveOne(character: any, stageId: string): boolean {
  if (CARD_TIME_GATE_EXCLUSIONS[stageId]?.has(character?.id)) return false;
  const entry = byId.get(character?.id) || byName.get(character?.name);
  if (!entry) return false;
  const profile = character.profile || {};
  const staticProfile = entry.staticProfile || {};
  const currentPhase = stagePhase(entry, stageId);
  const origin = currentPhase?.identity || staticProfile.identitySummary || '';

  // appearance/origin：场景/提取特定 → 仅缺失时才从正典填（保持 no-force）。
  // personality：稳定属性，卡为准 → 卡(registry)非空则覆盖，让改卡传导到确定性字段（不截断，卡已人工控长）。
  if (entry.entityType) character.entityType = entry.entityType;
  if (entry.entityType === 'creature' || (entry.gender && (!character.gender || character.gender === '未知'))) character.gender = entry.gender;
  if (currentPhase?.role) character.role = currentPhase.role;
  if (origin && !profile.origin) profile.origin = origin;
  if (currentPhase && Object.prototype.hasOwnProperty.call(currentPhase, 'appearance')) {
    if (currentPhase.appearance) profile.appearance = currentPhase.appearance;
    else delete profile.appearance;
  } else if (staticProfile.appearance && !profile.appearance) {
    profile.appearance = staticProfile.appearance;
  }
  // race：正典权威（种族形态基准/族裔文化规则按它匹配）——registry 有值则覆盖，
  // 抽取期默认的"人族"曾让兽蛮/碧鲮/羽族角色全部丢失族裔（青面兽被写成人类壮汉的病根）。
  if (staticProfile.race && (!profile.race || profile.race === '人族' || isNamedEntityLabel("character","liuchao.character.qi_yuan",entry.canonicalName))) profile.race = staticProfile.race;
  if (isNamedEntityLabel("character","liuchao.character.qi_yuan",entry.canonicalName) && new RegExp("(?:"+entityNamePattern("location","liuchao.location.biyu_village")+")","").test(String(profile.origin || ''))) profile.origin = origin;
  const personality = unique(asArray(phaseProfileValue(staticProfile, currentPhase, 'personality')));
  if (personality.length) profile.personality = personality;

  const blockedPrefixes = asArray(currentPhase?.blockedStageNotePrefixes);
  const keptNotes = asArray<string>(profile.notes).filter(note =>
    !DERIVED_TAGS.some(tag => String(note).startsWith(tag))
    && !blockedPrefixes.some(prefix => String(note).startsWith(prefix)),
  );
  profile.notes = [...keptNotes, ...buildNotes(entry, currentPhase, stageId)];
  // 70章刚见面的小紫仅投射表面性格；保留registry种族、外貌和当前阶段资料。
  if (stageId === 'lcq.stage_04b_lingfei_baiyi_crisis' && character.id === 'liuchao.character.xiao_zi') {
    profile.personality = ['看上去天真灵动，笑语亲切，言行令旁人难以捉摸。'];
  }
  // 第六批逐关公开卡以已批准的阶段身份为准，避免旧档沿用全书身份和外貌。
  if (['lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis'].includes(stageId)
    && [...entityAliases("character","liuchao.character.cheng_zongyang"), ...entityAliases("character","liuchao.character.ning_yu"), ...entityAliases("character","liuchao.character.su_li"), ...entityAliases("character","liuchao.character.a_xi"), ...entityAliases("character","liuchao.character.xie_yi"), ...entityAliases("character","liuchao.character.wu_er_lang"), ...entityAliases("character","liuchao.character.qi_yuan"), ...entityAliases("character","liuchao.character.yun_cang_feng")].includes(entry.canonicalName)) {
    if (currentPhase?.description) character.description = currentPhase.description;
    if (currentPhase?.identity) profile.origin = currentPhase.identity;
  }
  character.profile = profile;
  return true;
}

/**
 * 物化时调用：把某 stage 的角色列表逐个还原为完整档案。
 * @param characters mod.canon.characters（已 structuredClone 的副本）
 * @param stageId    mod.manifest.id
 * @returns 还原到的角色数
 */
export function resolveScenarioCharacters(characters: any[] | undefined, stageId: string): number {
  if (!Array.isArray(characters) || !stageId) return 0;
  let n = 0;
  for (const c of characters) if (resolveOne(c, stageId)) n++;
  syncNanhuangIdentityDisplay({ modId: stageId, canon: { characters } });
  return n;
}

/** registry 版本号（供旧档 reconcile 判断是否需要按新正典对齐）。 */
export const REGISTRY_VERSION: string = (registryJson as { version?: string }).version || 'unknown';

/** 是否有该角色的正典条目（供其他模块按需查询）。 */
export function hasRegistryEntry(name: string): boolean {
  return byName.has(name);
}

/**
 * 供叙事提示词按姓名或别名取回“人物而非道具”的最小身份卡。
 * 不暴露后续剧情，只返回跨关稳定的身份与别名事实。
 */
export function getRegistryIdentity(name: string): { canonicalName: string; aliases: string[]; identity: string } | null {
  const entry = byName.get(name);
  if (!entry) return null;
  return {
    canonicalName: entry.canonicalName,
    aliases: unique(entry.aliases || []),
    identity: compact(entry.staticProfile?.identitySummary || '', 180),
  };
}

/**
 * ID 驱动的安全门禁统一从 registry 展开规范名与全部已裁定别名，避免作者手抄
 * subjects 时漏掉旧名、蔑称或阶段称谓。
 */
export function getRegistryNamesById(characterId: string): string[] {
  const entry = byId.get(characterId);
  return entry ? unique([entry.canonicalName, ...(entry.aliases || [])]) : [];
}

/** 供当前人物提示词补回稳定谈吐；不携带阶段剧情，只用于避免角色被泛化为同一类口吻。 */
export function getRegistrySpeechStyle(name: string): string {
  const entry = byName.get(name);
  return compact(unique(asArray(entry?.staticProfile?.speechStyle)).join('；'), 220);
}

/** 仅以当前已出现的势力名召回其成员，补足关卡投影未携带的别名人物。 */
export function findRegistryIdentitiesByContext(context: string, limit = 12, stageId?: string, namingContext?: Parameters<typeof namingChapter>[0]): Array<{ canonicalName: string; aliases: string[]; identity: string }> {
  const source = String(context || '');
  if (!source) return [];
  const matches: Array<{ canonicalName: string; aliases: string[]; identity: string }> = [];
  const seen = new Set<string>();
  for (const entry of (registryJson as { characters: RegistryEntry[] }).characters || []) {
    const phase = stageId ? stagePhase(entry, stageId) : undefined;
    const identity = String(stageId?.startsWith('lcq.stage_0') ? phase?.identity || '' : entry.staticProfile?.identitySummary || '');
    if (isSouthernStage(stageId) && ledgerOverrides.blockedSouthernRecallIds.includes(entry.id)) continue;
    const southern = isSouthernStage(stageId);
    const chapter = namingChapter(namingContext || {modId: stageId});
    if (southern && entry.id === ledgerOverrides.historicalAliases.id && chapter < ledgerOverrides.historicalAliases.beforeChapter) continue;
    const allAliases = unique(entry.aliases || []);
    const aliases = southern ? [...new Set(['panel','narration','protagonistAddress','protagonistThought'].flatMap(channel => (namingFor(entry.id, chapter, channel as any)?.text || '').split('／')).filter(Boolean))].filter(name=>name !== entry.canonicalName) : allAliases;
    const directlyMentioned = [entry.canonicalName, ...allAliases].some(key => key.length >= 2 && source.includes(key));
    // 只从已在当前场景出现的明确势力词补召回，避免把无关人物和未来剧情塞进上下文。
    const factionMentioned = [...entityAliases("faction","liuchao.faction.xing_yue_hu")].some(faction => source.includes(faction) && identity.includes(faction));
    if (!directlyMentioned && !factionMentioned) continue;
    if (seen.has(entry.canonicalName)) continue;
    seen.add(entry.canonicalName);
    matches.push({ canonicalName: entry.canonicalName, aliases, identity: compact(identity, 180) });
    if (matches.length >= limit) break;
  }
  return matches;
}

/**
 * 对正文做低误伤的最后一道确定性拦截：已登记为“人物”的姓名/别名，不能在同一句
 * 被断言为兵器、坐骑、功法或物品。无法判断的关系叙述交由提示词约束，不能用正则硬删。
 */
export function stripNarrativeEntityTypeConflicts(text: string): { text: string; conflicts: string[] } {
  // 带对白的段落按整段删除，避免把开引号/说话句删掉却留下闭引号与声线描写。
  const parts = String(text || '').split(/[“”「」『』"]/u.test(text) ? /(\n+)/ : /([。！？\n]+)/);
  const conflicts: string[] = [];
  const protectedNames = [...byName.keys()].filter(name => name.length >= 2);
  const bannedType = '佩剑|宝剑|断剑|长剑|兵器|武器|法器|坐骑|战马|马匹|功法|秘笈|丹药|玉符';
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = parts[index] || '';
    const tail = parts[index + 1] || '';
    // 只拦“X 是/乃 Y”的实体直断，不能把“为他牵马”“作势拔剑”或比喻当成变物。
    const offender = protectedNames.find(name => new RegExp(
      `${escapeRegExp(name)}\\s*(?:便|正|原来)?(?:是|乃)(?!不是|并非|绝非)[^，。！？]{0,6}(?:${bannedType})`,
    ).test(sentence));
    if (offender) {
      conflicts.push(`正典人物/别名“${offender}”被叙事改写为非人物实体`);
      continue;
    }
    kept.push(sentence, tail);
  }
  return { text: kept.join('').trim(), conflicts };
}

/**
 * 全局库收录不代表本存档已经相识。未进入允许名单的人物不得被正文或 NPC 记忆
 * 当作已知熟人提及；这样 RAG 命中未来角色时也不会造成时间线泄露。
 */
export function stripNarrativeUnintroducedCharacters(
  text: string,
  introducedCanonicalNames: Iterable<string>,
  authoredHistoricalContext = '',
  disclosureContext?: Parameters<typeof disclosedNovelChapter>[0],
): { text: string; conflicts: string[] } {
  const introduced = new Set([...introducedCanonicalNames].map(name => byName.get(name)?.canonicalName || name));
  // 正文删除不可逆：两字姓名、氏族/称谓往往也有普通语义（如“龙神”），不能作为
  // 自动删句的证据。它们仍保留在 registry 中供提示词和身份召回使用。
  const safeForBlocklist = (name: string) => name.length >= 3
    && !/(?:氏|王|公子|姑娘|夫人|老头|婢|儿)$/.test(name);
  const blocked = (registryJson as { characters: RegistryEntry[] }).characters
    .filter(entry => !introduced.has(entry.canonicalName))
    // 时间线删除是不可逆的高风险操作：只用明确专名，绝不把“贱婢/郭氏/陈王”
    // 等泛称或双字名纳入黑名单；它们仍可用于提示词召回。
    .flatMap(entry => [entry.canonicalName, ...(entry.aliases || [])].filter(safeForBlocklist))
    .filter(name => typeof name === 'string' && name.length >= 2)
    .sort((left, right) => right.length - left.length);
  // 带对白的段落按整段删除，避免把开引号/说话句删掉却留下闭引号与声线描写。
  const parts = String(text || '').split(/[“”「」『』"]/u.test(text) ? /(\n+)/ : /([。！？\n]+)/);
  const conflicts: string[] = [];
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = parts[index] || '';
    const tail = parts[index + 1] || '';
    // 合同明确要求讲述某人的旧事，不等于该人在现场登场；不能删掉合法回忆对白。
    const offender = blocked.find(name => sentence.includes(name)
      && !((authoredHistoricalContext.includes(name) || approvedChapterGates.mentions.some(mention => mention.name === name && disclosedNovelChapter(disclosureContext || {}) >= mention.chapter)) && !new RegExp(name + '[^。！？\\n]{0,16}(?:现身|走来|走进|站在|坐在|出现在|来到|递给|向你出手)').test(sentence)));
    if (offender) {
      conflicts.push(`未登场正典人物“${offender}”被提前写入叙事/记忆`);
      continue;
    }
    kept.push(sentence, tail);
  }
  return { text: kept.join('').trim(), conflicts };
}

/** 取某角色的正典人格底线（principles），供运行时投影到 社交.关系 NPC.人格底线。无则空数组。 */
export function getRegistryBottomLine(name: string): string[] {
  const entry = byName.get(name);
  return unique(asArray<string>(entry?.staticProfile?.principles)).filter(Boolean);
}

/** 小说章号只取本关实际活跃／完成事件锚点；不把主轴seq当章号。 */
export function disclosedNovelChapter(runtime: {
  events?: { id: string; axisAnchor?: string }[]; activeEventIds?: string[];
  completedEventIds?: string[]; travelLedger?: { doneEventIds?: string[] };
}): number {
  const completed = new Set([...(runtime.completedEventIds || []), ...(runtime.travelLedger?.doneEventIds || [])]);
  const events = runtime.events || [];
  const chapterOf = (event: { axisAnchor?: string }) => Number(event.axisAnchor?.match(/第(\d+)章/)?.[1] || 0);
  const activeChapters = events.filter(event => runtime.activeEventIds?.includes(event.id)).map(chapterOf).filter(Boolean);
  // 并行可选拍不能把尚未走到的较晚章号提到当前拍前面。
  return Math.max(0, ...events.filter(event => completed.has(event.id)).map(chapterOf), ...(activeChapters.length ? [Math.min(...activeChapters)] : []));
}

export const approvedChapterGates = ledgerOverrides.chapterGates;

/** 一般旧事与具体父女确证分门；未知章号从严，不能凭所在关猜章节。 */
export function isDisclosureFactAllowed(text: string, runtime: Parameters<typeof xiaoziDisclosure>[0]): boolean {
  const chapter = disclosedNovelChapter(runtime);
  const reveal = xiaoziDisclosure(runtime);
  if (approvedChapterGates.mentions.some(mention => text.includes(mention.name) && chapter < mention.chapter && (!reveal.father || mention.chapter >= approvedChapterGates.poisonSectName))) return false;
  if (!new RegExp(approvedChapterGates.daughterPattern).test(text)) return true;
  if (reveal.father) return true;
  if (new RegExp(approvedChapterGates.specificDaughterPattern).test(text)) return reveal.suspectedFather && /怀疑|猜测|未证实/.test(text);
  return disclosedNovelChapter(runtime) >= approvedChapterGates.generalPosthumousDaughter;
}

/** 小说第78章交易拍揭母系；第105章父系劝说在临时协定第一步落账后成立。
 * seqLo/seqHi为主轴序号，不能当小说章号。未知进度保持表面卡。
 */
export function xiaoziDisclosure(runtime: {
  modId?: string; completedEventIds?: string[]; flags?: Record<string, unknown>;
  events?: { id: string; axisAnchor?: string }[]; activeEventIds?: string[];
  travelLedger?: { doneEventIds?: string[] };
  sceneLedger?: { worldFacts?: string[] };
  eventActionStates?: Record<string, { readyAtTurn?: number; preparations?: string[] }>;
}): { mother: boolean; father: boolean; suspectedFather: boolean } {
  const done = (id: string) => runtime.completedEventIds?.includes(id) || runtime.travelLedger?.doneEventIds?.includes(id)
    || runtime.eventActionStates?.[id]?.readyAtTurn !== undefined || runtime.flags?.[`event.${id.replace('lcq.event.', '')}.done`] === true;
  const lateStage = /^lcq\.stage_(?:0[6-9]|1\d)/.test(runtime.modId || '') || /^ly[lg]\./.test(runtime.modId || '');
  const pact = 'lcq.event.s05b_09_temporary_pact_with_xiaozi';
  const father = lateStage || Boolean(done(pact)) || Boolean(runtime.eventActionStates?.[pact]?.preparations?.includes('counterstrike_plan_formed'));
  const trade = Boolean(done('lcq.event.weapon_deal_with_geluo'));
  return { mother: father || Boolean(runtime.sceneLedger?.worldFacts?.some(fact => ['小紫母系已演出：碧姬的女儿', '小紫母系已演出：碧奴的女儿'].includes(fact))), father, suspectedFather: trade && !father };
}

/** 老档缓存也只能保留当前已公开的记忆；已揭母系／父系不因清理又丢失。 */
export function xiaoziUnrevealedFacts(runtime: Parameters<typeof xiaoziDisclosure>[0]): RegExp {
  const reveal = xiaoziDisclosure(runtime);
  return reveal.father ? new RegExp("毒宗|"+"(?:"+entityNamePattern("faction","liuchao.faction.hei_mo_hai")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.shang_zhen_yu")+")"+"|正宫|后宫|白切黑|病娇","") : reveal.mother
    ? new RegExp("(?:"+entityNamePattern("character","canon.character.a33134d511")+")"+"|"+"(?:"+entityNamePattern("character","canon.character.a33134d511")+")"+"|父亲|遗孤|遗腹|毒宗|"+"(?:"+entityNamePattern("faction","liuchao.faction.hei_mo_hai")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.shang_zhen_yu")+")"+"|正宫|后宫|白切黑|病娇","")
    : new RegExp("(?:"+entityNamePattern("character","canon.character.a33134d511")+")"+"|"+"(?:"+entityNamePattern("character","canon.character.a33134d511")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.bi_ji")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.bi_ji")+")"+"|母亲|父亲|血脉|遗孤|遗腹|毒宗|"+"(?:"+entityNamePattern("faction","liuchao.faction.hei_mo_hai")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.shang_zhen_yu")+")"+"|正宫|后宫|白切黑|病娇","");
}

/** 南荒身份展示只接受本地完成回执；不修改registry的人工身份。 */
export function syncNanhuangIdentityDisplay(runtime: {
  events?: { id: string; axisAnchor?: string }[]; activeEventIds?: string[];
  modId?: string; canon?: { characters?: any[] }; completedEventIds?: string[];
  flags?: Record<string, unknown>; eventActionStates?: Record<string, { readyAtTurn?: number; preparations?: string[] }>;
  sceneLedger?: { names?: Record<string, string>; worldFacts?: string[] };
  travelLedger?: { doneEventIds?: string[] };
}): void {
  sanitizeXieyiDisclosure(runtime);
  if (!['lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b'].includes(runtime.modId || '')) { if (runtime.events) syncCharacterNaming(runtime); return; }
  // 旧档已演出的同一母系事实只规范称呼，不新增知识或绕过揭示门。
  if (runtime.sceneLedger?.worldFacts) runtime.sceneLedger.worldFacts = [...new Set(runtime.sceneLedger.worldFacts.map(fact => fact === '小紫母系已演出：碧奴的女儿' ? '小紫母系已演出：碧姬的女儿' : fact))];
  const settled = (id: string) => runtime.completedEventIds?.includes(id)
    || runtime.eventActionStates?.[id]?.readyAtTurn !== undefined
    || runtime.flags?.[`event.${id.replace('lcq.event.', '')}.done`] === true;
  for (const character of runtime.canon?.characters || []) {
    if (character.id === 'liuchao.character.xiao_zi') {
      const reveal = xiaoziDisclosure(runtime);
      const old = character.profile || {};
      const hidden = xiaoziUnrevealedFacts(runtime);
      character.role = '碧鲮村少女';
      character.description = '穿紫衣的碧鲮族少女，住在碧鲮村。';
      character.profile = {
        ...(old.attributes ? { attributes: old.attributes } : {}),
        ...(old.spiritRoot ? { spiritRoot: old.spiritRoot } : {}),
        ...(old.talents ? { talents: old.talents } : {}),
        ...(old.avatar ? { avatar: old.avatar } : {}), ...(old.portrait ? { portrait: old.portrait } : {}),
        race: reveal.mother ? '碧鲮族（母系碧姬）' : '碧鲮族',
        origin: character.description,
        appearance: '穿紫衣的成年少女，黑发垂落，眼睛明亮，陆上以双腿行走。',
        personality: ['天真俏皮', '偶露古怪狠劲', '对程宗扬好奇'],
        memories: asArray<string>(old.memories).filter(note => !hidden.test(String(note))),
        notes: [
          ...(reveal.mother ? ['【已知身世】小紫是碧姬的女儿。'] : []),
          ...(reveal.father ? ['【已知身世】小紫的生父是岳鹏举。'] : []),
          ...(reveal.suspectedFather ? ['【未证实的猜测】程宗扬怀疑小紫是岳帅的遗腹女；尚未证实。'] : []),
        ],
      };
      // 全书阵营真值保留在registry；南荒公开卡不因血缘替她声明所属势力。
      delete character.affiliations; delete character.factionId;
    }
    if (character.id === 'lcq.character.np006' && runtime.modId === 'lcq.stage_04b_lingfei_baiyi_crisis') {
      character.name = isNamedEntityLabel("enemy","lcq.enemy.ge_luo",runtime.sceneLedger?.names?.阁罗) || settled('lcq.event.weapon_deal_with_geluo') ? '阁罗' : '鬼王峒使者';
    }
    if (character.id === 'liuchao.character.shang_zhen_yu') {
      const revealed = settled('lcq.event.shanghou_revealed');
      character.name = revealed ? '殇侯' : '朱八八';
      character.role = revealed ? '山村中的殇侯' : '云氏雇用的老向导';
      character.description = revealed ? '朱老头已当面显露殇侯身份。其他身世未揭露。' : '云氏雇用的老向导，自称朱八八。';
      character.profile = { origin: character.description, appearance: '瘦小苍老的成年老向导，不是魁梧壮汉。' };
      delete character.affiliations; delete character.factionId;
    }
    if (character.id === 'liuchao.character.le_mingzhu' && !settled('lcq.event.ghost_king_swallowed')) {
      for (const key of ['notes', 'memories', 'formsOfAddress']) if (Array.isArray(character.profile?.[key])) character.profile[key] = character.profile[key].filter((note: string) => !/老公/.test(String(note)));
    }
    if (character.id === 'liuchao.character.le_mingzhu' && ['lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04'].includes(runtime.modId || '')) {
      const revealed = settled('lcq.event.s04_03') || namingChapter(runtime) >= 47;
      character.name = revealed ? '乐明珠' : '花苗新娘';
      character.role = revealed ? '光明观堂弟子' : '戴面纱的花苗新娘';
      character.description = revealed ? '送亲新娘的身份已揭露，是光明观堂弟子乐明珠。' : '随花苗送亲队同行，身份尚未揭露。';
      character.profile = revealed ? { ...character.profile, origin: character.description } : { origin: character.description, appearance: '戴面纱的成年花苗新娘，暂不描写面纱下的容貌。' };
      delete character.affiliations; delete character.factionId;
    }
  }
  syncCharacterNaming(runtime);
}

/** 身手披露按本地完成事实；真境界留在canon，不用隐藏来改战斗数值。 */
export function isXieyiSkillHidden(runtime: { modId?: string; completedEventIds?: string[]; flags?: Record<string, unknown> }): boolean {
  if (!['lcq.stage_02', 'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis'].includes(runtime.modId || '')) return false;
  return !runtime.completedEventIds?.includes('lcq.event.s04b_lingfei_baiyi_crisis_13')
    && runtime.flags?.['event.s04b_lingfei_baiyi_crisis_13.done'] !== true;
}

/** 寻访从65章私下逐步透露；具体父女关系仍走确证门，不恢复受命护佑错误。 */
export function sanitizeXieyiDisclosure(runtime: Parameters<typeof xiaoziDisclosure>[0] & { canon?: { characters?: any[] } }): void {
  const known = xiaoziDisclosure(runtime).father;
  const chapter = disclosedNovelChapter(runtime);
  for (const c of runtime.canon?.characters || []) {
    if (c.id !== 'liuchao.character.xie_yi') continue;
    const profile = c.profile || {};
    for (const key of ['notes', 'memories', 'goals']) if (Array.isArray(profile[key])) {
      profile[key] = profile[key].filter((note: string) => !new RegExp("护佑其遗孀|护佑.*遗孤|奉"+"(?:"+entityNamePattern("character","canon.character.a33134d511")+")"+"之命","").test(String(note)) && (known || (chapter >= approvedChapterGates.xieyiSearch
        ? !new RegExp("(?:"+entityNamePattern("character","liuchao.character.xiao_zi")+")","").test(String(note)) && isDisclosureFactAllowed(String(note), runtime)
          && (chapter >= approvedChapterGates.generalPosthumousDaughter || !new RegExp(approvedChapterGates.searchDescendantsPattern).test(String(note)))
          && (chapter >= approvedChapterGates.searchDetailChapter || !new RegExp(approvedChapterGates.searchDetailPattern).test(String(note)))
        : !new RegExp(approvedChapterGates.searchPattern).test(String(note)))));
    }
  }
}
