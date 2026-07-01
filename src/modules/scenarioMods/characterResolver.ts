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
}
interface RegistryStaticProfile {
  identitySummary?: string;
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
  '【关系】', '【称呼】', '【谈吐】', '【底线】', '【目标】', '【软肋】', '【绝技】',
  '【入伙】', '【情节】', '【结局】', '【阶段身份】', '【本阶段禁用】', '【人工正典】',
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
function buildNotes(entry: RegistryEntry, currentPhase: RegistryPhase | undefined): string[] {
  const profile = entry.staticProfile || {};
  const notes: string[] = [];
  const add = (tag: string, value: unknown, max = 360) => {
    const values = unique(asArray(value as unknown[])).map(item => compact(item, max));
    if (values.length) notes.push(`【${tag}】${values.join('；')}`);
  };
  add('关系', profile.relationToProtagonist);
  add('称呼', profile.formsOfAddress);
  add('谈吐', profile.speechStyle);
  add('底线', profile.principles);
  add('目标', profile.goals);
  add('软肋', profile.weaknesses);
  add('绝技', profile.signatureAbilities);
  add('入伙', profile.joining);
  add('情节', asArray(profile.keyEvents).slice(0, 8));
  add('结局', profile.ending);
  for (const phase of relationshipPhases(entry)) {
    const line = [phase.seq, phase.identity, phase.status ? `status=${phase.status}` : ''].filter(Boolean).join('：');
    add('阶段身份', line, 520);
    if (phase.forbidden?.length) add('本阶段禁用', `${phase.seq}：${phase.forbidden.join('、')}`, 360);
  }
  if (currentPhase) {
    add('阶段身份', `当前关卡 ${currentPhase.stageId}：${currentPhase.identity || currentPhase.role || ''}`, 520);
    if (currentPhase.forbidden?.length) add('本阶段禁用', `${currentPhase.stageId}：${currentPhase.forbidden.join('、')}`, 360);
  }
  add('人工正典', entry.review?.humanNotes);
  add('人工正典', entry.review?.aliasMerged?.map(alias => `${alias} 已并入 ${entry.canonicalName}`));
  add('人工正典', entry.review?.followUps);
  return unique(notes);
}

// name/alias -> registry entry
const byName = new Map<string, RegistryEntry>();
for (const entry of (registryJson as { characters: RegistryEntry[] }).characters || []) {
  byName.set(entry.canonicalName, entry);
  for (const alias of entry.aliases || []) if (!byName.has(alias)) byName.set(alias, entry);
}

/**
 * 用注册表把一个精简角色还原为完整角色（原地修改 character.profile）。
 * 已经带完整 profile 的旧档角色也安全：force 覆盖为正典静态档，动态字段保留。
 */
function resolveOne(character: any, stageId: string): boolean {
  const entry = byName.get(character?.name);
  if (!entry) return false;
  const profile = character.profile || {};
  const staticProfile = entry.staticProfile || {};
  const currentPhase = stagePhase(entry, stageId);
  const origin = currentPhase?.identity || staticProfile.identitySummary || '';

  // appearance/personality/origin 精简 stage 已保留 → 仅缺失时才从正典填（镜像构建期 no-force 行为，保证等价）。
  if (entry.gender && (!character.gender || character.gender === '未知')) character.gender = entry.gender;
  if (currentPhase?.role) character.role = currentPhase.role;
  if (origin && !profile.origin) profile.origin = origin;
  if (staticProfile.appearance && !profile.appearance) profile.appearance = staticProfile.appearance;
  const personality = unique(asArray(staticProfile.personality)).slice(0, 8);
  if (personality.length && !(profile.personality && profile.personality.length)) profile.personality = personality;

  const keptNotes = asArray<string>(profile.notes).filter(note => !DERIVED_TAGS.some(tag => String(note).startsWith(tag)));
  profile.notes = [...keptNotes, ...buildNotes(entry, currentPhase)];
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

/** 是否有该角色的正典条目（供其他模块按需查询）。 */
export function hasRegistryEntry(name: string): boolean {
  return byName.has(name);
}
