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

interface RegistryPhase {
  scope?: string;
  stageId?: string;
  seq?: string;
  identity?: string;
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
function phaseProfileValue<K extends keyof RegistryStaticProfile>(
  profile: RegistryStaticProfile,
  currentPhase: RegistryPhase | undefined,
  key: K,
): RegistryStaticProfile[K] {
  return currentPhase && Object.prototype.hasOwnProperty.call(currentPhase, key)
    ? currentPhase[key as keyof RegistryPhase] as RegistryStaticProfile[K]
    : profile[key];
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
  add('关系', phaseProfileValue(profile, currentPhase, 'relationToProtagonist'));
  add('称呼', phaseProfileValue(profile, currentPhase, 'formsOfAddress'));
  add('谈吐', phaseProfileValue(profile, currentPhase, 'speechStyle'));
  add('底线', phaseProfileValue(profile, currentPhase, 'principles'));
  add('目标', phaseProfileValue(profile, currentPhase, 'goals'));
  add('软肋', phaseProfileValue(profile, currentPhase, 'weaknesses'));
  add('绝技', phaseProfileValue(profile, currentPhase, 'signatureAbilities'));
  add('入伙', phaseProfileValue(profile, currentPhase, 'joining'));
  add('情节', asArray(phaseProfileValue(profile, currentPhase, 'keyEvents')).slice(0, 8));
  add('结局', phaseProfileValue(profile, currentPhase, 'ending'));
  // 有明确关卡投影时，只注入该关开场身份；完整关系链包含未来分支，不能进游戏提示词。
  if (!currentPhase) {
    for (const phase of relationshipPhases(entry)) {
      const line = [phase.seq, phase.identity, phase.status ? `status=${phase.status}` : ''].filter(Boolean).join('：');
      add('阶段身份', line, 520);
      if (phase.forbidden?.length) add('本阶段禁用', `${phase.seq}：${phase.forbidden.join('、')}`, 360);
    }
  }
  if (currentPhase) {
    add('阶段身份', `当前关卡 ${currentPhase.stageId}：${currentPhase.identity || currentPhase.role || ''}`, 520);
    if (currentPhase.forbidden?.length) add('本阶段禁用', `${currentPhase.stageId}：${currentPhase.forbidden.join('、')}`, 360);
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
  byName.set(entry.canonicalName, entry);
  for (const alias of entry.aliases || []) if (!byName.has(alias)) byName.set(alias, entry);
}

// 与构建期 apply-character-cards-v3-to-mod.mjs 同步：早期关卡里的未揭示称谓
// 不得因 alias 命中全局 registry 而在新档物化时补出未来身份或画像。
const CARD_TIME_GATE_EXCLUSIONS: Record<string, Set<string>> = {
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
  const entry = byName.get(character?.name);
  if (!entry) return false;
  const profile = character.profile || {};
  const staticProfile = entry.staticProfile || {};
  const currentPhase = stagePhase(entry, stageId);
  const origin = currentPhase?.identity || staticProfile.identitySummary || '';

  // appearance/origin：场景/提取特定 → 仅缺失时才从正典填（保持 no-force）。
  // personality：稳定属性，卡为准 → 卡(registry)非空则覆盖，让改卡传导到确定性字段（不截断，卡已人工控长）。
  if (entry.gender && (!character.gender || character.gender === '未知')) character.gender = entry.gender;
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
  if (staticProfile.race && (!profile.race || profile.race === '人族')) profile.race = staticProfile.race;
  const personality = unique(asArray(phaseProfileValue(staticProfile, currentPhase, 'personality')));
  if (personality.length) profile.personality = personality;

  const blockedPrefixes = asArray(currentPhase?.blockedStageNotePrefixes);
  const keptNotes = asArray<string>(profile.notes).filter(note =>
    !DERIVED_TAGS.some(tag => String(note).startsWith(tag))
    && !blockedPrefixes.some(prefix => String(note).startsWith(prefix)),
  );
  profile.notes = [...keptNotes, ...buildNotes(entry, currentPhase, stageId)];
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
export function findRegistryIdentitiesByContext(context: string, limit = 12): Array<{ canonicalName: string; aliases: string[]; identity: string }> {
  const source = String(context || '');
  if (!source) return [];
  const matches: Array<{ canonicalName: string; aliases: string[]; identity: string }> = [];
  const seen = new Set<string>();
  for (const entry of (registryJson as { characters: RegistryEntry[] }).characters || []) {
    const identity = String(entry.staticProfile?.identitySummary || '');
    const aliases = unique(entry.aliases || []);
    const directlyMentioned = [entry.canonicalName, ...aliases].some(key => key.length >= 2 && source.includes(key));
    // 只从已在当前场景出现的明确势力词补召回，避免把无关人物和未来剧情塞进上下文。
    const factionMentioned = ['星月湖'].some(faction => source.includes(faction) && identity.includes(faction));
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
  const parts = String(text || '').split(/([。！？\n]+)/);
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
  const parts = String(text || '').split(/([。！？\n]+)/);
  const conflicts: string[] = [];
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = parts[index] || '';
    const tail = parts[index + 1] || '';
    const offender = blocked.find(name => sentence.includes(name));
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
