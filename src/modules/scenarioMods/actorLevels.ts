/**
 * 参战者当前级数的唯一入口（场面战斗 snapshotLevels、自由行动判定/闸门、胜率模拟共用）。
 *
 * - 玩家：存档 角色.属性.境界 为准（修炼、夺元落账后即生效）；角色等级表只提供当章的“暂时压制”差值（effectiveLevel − level）。
 * - 有名人物：存档里的关系档 profile.境界（传功等落账写这里）为准，没有关系档时读本关阶段档的 stats.level / 旧顶层 level；
 *   角色等级表的当章行只当初始值或剧情节点的定向变更：取 max(存档级数, 表级数)，再叠表上的压制差值。
 *   合同变体行（variant，如“失去护煞”）是剧情定向的，以表为准；表上 level 为 null（不走九级）就不算级差；available=false 表示不在场。
 * - 无名/泛称敌人（敌人种类）：不再进角色等级表，按 numbers-combat.json combat.enemyPresets 取预设，
 *   级数 = 当章主角在等级表里的级数 + protagonistOffset（可热调）。本关阶段档对该种类显式写了 level 时以阶段档为准（剧情定向）。
 */
import { levelFact, effectiveLevel, hasLevelRows, type LevelFact } from './characterLevels';
import { kindIdOf } from './actorInstances';
import { stageOverrideOf, resolveActorStats, combatLevelOf } from './characterStats';
import { namedEntity, canonicalEntityId } from './namedEntities';
import { getRegistryCanonicalId } from './characterResolver';
import { relationshipOf } from './ledger/affinityIdentity';
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { levelOf } from '../../utils/realmUtils';
import { realmAt } from './levelProgression';

export interface EnemyPreset { protagonistOffset?: number; combatStrength?: number; levelGap?: boolean; variants?: Record<string, EnemyPreset> }
export interface EnemyPresetConfig { baseActorId: string; default: EnemyPreset; types: Record<string, EnemyPreset> }
export const enemyPresetConfig = (): EnemyPresetConfig => (GAME_NUMBERS.combat as unknown as { enemyPresets: EnemyPresetConfig }).enemyPresets;

export function validateEnemyPresets(cfg: EnemyPresetConfig | undefined = enemyPresetConfig()): string[] {
  if (!cfg || typeof cfg.baseActorId !== 'string' || !cfg.default || !cfg.types) return ['combat.enemyPresets 须有 baseActorId、default、types'];
  const errors: string[] = [];
  const check = (path: string, p: EnemyPreset) => {
    if (p.levelGap !== undefined && typeof p.levelGap !== 'boolean') errors.push(`${path}.levelGap 须为布尔`);
    if (p.protagonistOffset !== undefined && !Number.isInteger(p.protagonistOffset)) errors.push(`${path}.protagonistOffset 须为整数`);
    if (p.combatStrength !== undefined && !Number.isInteger(p.combatStrength)) errors.push(`${path}.combatStrength 须为整数`);
    if (p.levelGap !== false && p.protagonistOffset === undefined && path === 'default') errors.push('default.protagonistOffset 须给出');
    for (const [v, sub] of Object.entries(p.variants || {})) check(`${path}.variants.${v}`, sub);
  };
  check('default', cfg.default);
  for (const [id, p] of Object.entries(cfg.types)) check(`types.${id}`, p);
  return errors.map(e => `combat.enemyPresets.${e}`);
}
registerNumbersValidator(() => validateEnemyPresets());

/** 是否按敌人种类预设取级数：配置里列了；或敌人目录里有这个种类、且角色等级表里没有它（有名的敌方人物如鬼巫王仍走等级表）。 */
/** 实例 id → 种类 id → 规范 id（旧 id 别名，如男尸鬼 → 尸鬼）。 */
export const enemyKindOf = (id: string): string => { const kind = kindIdOf(id); return getRegistryCanonicalId(kind) ?? canonicalEntityId('enemy', kind); };
export function isEnemyKind(id: string): boolean {
  const kind = enemyKindOf(id);
  return Boolean(enemyPresetConfig()?.types?.[kind]) || (Boolean(namedEntity('enemy', kind)) && !hasLevelRows(kind));
}

export type LevelSource = 'save' | 'table' | 'stage' | 'preset' | 'none';
export interface ActorLevel {
  level: number | undefined;
  source: LevelSource;
  present: boolean;
  fact?: LevelFact;
  preset?: { kindId: string; baseLevel: number | undefined; protagonistOffset: number; variant?: string };
}

/** 当章主角的级数（预设的基准）：等级表当章行；查不到时用存档里玩家的级数。 */
export function protagonistLevel(chapter: number, save?: any): number | undefined {
  const f = levelFact(enemyPresetConfig().baseActorId, chapter);
  return effectiveLevel(f) ?? f?.level ?? levelOf(save?.角色?.属性?.境界) ?? undefined;
}

function stageLevel(runtime: any, id: string): number | undefined {
  const kind = kindIdOf(id);
  const profile = runtime?.canon?.characters?.find((c: any) => c?.id === kind || c?.id === id);
  const override = stageOverrideOf(profile);
  return override ? combatLevelOf(override as never) ?? undefined : undefined; // 战斗强度优先于等级
}

export function enemyKindLevel(id: string, chapter: number, variant?: string, runtime?: any, save?: any): ActorLevel {
  const kindId = enemyKindOf(id), cfg = enemyPresetConfig();
  const staged = stageLevel(runtime, id);
  if (staged !== undefined) return { level: staged, source: 'stage', present: true };
  const base = cfg.types[kindId] || cfg.default;
  const p = { ...cfg.default, ...base, ...(variant ? base.variants?.[variant] : undefined) };
  if (p.levelGap === false) return { level: undefined, source: 'preset', present: true, preset: { kindId, baseLevel: undefined, protagonistOffset: 0, variant } };
  // 不走九级体系但有裁定过的战斗强度（如尸鬼）：直接用这个当量，不随主角浮动。
  if (p.combatStrength !== undefined) return { level: p.combatStrength, source: 'preset', present: true, preset: { kindId, baseLevel: undefined, protagonistOffset: 0, variant } };
  const baseLevel = protagonistLevel(chapter, save), offset = p.protagonistOffset ?? 0;
  const raw = baseLevel === undefined ? undefined : baseLevel + offset;
  const level = raw === undefined ? undefined : Math.max(GAME_NUMBERS.levels.min, Math.min(GAME_NUMBERS.levels.max, raw));
  return { level, source: 'preset', present: true, preset: { kindId, baseLevel, protagonistOffset: offset, variant } };
}

/**
 * 某参战者在当章的当前级数。save 缺省（模拟）时：玩家与有名人物读等级表，敌人读预设。
 * player=true 表示这是玩家角色。
 */
export function currentActorLevel(id: string, opts: { chapter: number; variant?: string; save?: any; runtime?: any; player?: boolean; ref?: string }): ActorLevel {
  const { chapter, variant, save, runtime, player } = opts;
  if (!player && isEnemyKind(id)) return enemyKindLevel(id, chapter, variant, runtime, save);
  const fact = levelFact(id, chapter, variant);
  if (fact && !fact.available) return { level: undefined, source: 'table', present: false, fact };
  const tableLevel = fact?.level ?? undefined, suppression = fact ? (effectiveLevel(fact) ?? tableLevel ?? 0) - (tableLevel ?? 0) : 0;
  if (fact && tableLevel === undefined) return { level: undefined, source: 'table', present: true, fact };
  let saved: number | undefined;
  if (save) {
    if (player) saved = levelOf(save?.角色?.属性?.境界) ?? undefined;
    else saved = levelOf((relationshipOf(save, opts.ref || id)?.profile as any)?.境界) ?? levelOf((relationshipOf(save, id)?.profile as any)?.境界) ?? stageLevel(runtime, id) ?? undefined;
  }
  if (fact?.variant) return { level: effectiveLevel(fact), source: 'table', present: true, fact };
  if (saved === undefined && tableLevel === undefined) {
    // 存档和等级表都没有：退回角色卡（总表基础属性 ⊕ 阶段档覆盖项）当初始值；再没有就不给级数（调用方按同级）。
    const card = player ? undefined : combatLevelOf(resolveActorStats(runtime, id)?.stats) ?? (opts.ref ? combatLevelOf(resolveActorStats(runtime, opts.ref)?.stats) : undefined);
    return card === undefined ? { level: undefined, source: 'none', present: true } : { level: card, source: 'stage', present: true };
  }
  const fromSave = saved !== undefined && (tableLevel === undefined || saved >= tableLevel);
  // 玩家的表行只当初始值（initializeLevel 已按难度设置落到存档），存档为准，不再拿表级数抬高。
  const bare = player ? (saved ?? tableLevel!) : Math.max(saved ?? -Infinity, tableLevel ?? -Infinity);
  return { level: bare + suppression, source: player || fromSave ? 'save' : 'table', present: true, fact };
}

/**
 * 关系档 npc.境界 的展示值以存档为准（2026-10-19 用户定：等级/属性/修为以存档为准、会变）。
 * - 存档没有可识别的九级境界：用角色等级表当章行补；表上也没有（level 为 null / 查不到）且存档完全没写，才补“不详”。
 * - 存档已有境界：只在表上当章级数更高时抬到表级（剧情节点的定向提升，与 currentActorLevel 的 max(存档, 表) 一致）；
 *   从不往下改，也不把当章“暂时压制”烘进存档。
 */
export function reconcileNpcRealm(npc: any, characterId: string, chapter: number): void {
  const fact = levelFact(characterId, chapter);
  const table = typeof fact?.level === 'number' ? fact.level : null;
  const saved = levelOf(npc.境界);
  if (saved === null) {
    if (table !== null) npc.境界 = realmAt(table);
    else if (!npc.境界 || typeof npc.境界 !== 'object' || !npc.境界.名称) npc.境界 = { 名称: '不详', 阶段: '', 当前进度: 0, 下一级所需: 0, 突破描述: '' };
    return;
  }
  if (table !== null && table > saved) npc.境界 = realmAt(table);
}
