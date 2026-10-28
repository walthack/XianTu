/**
 * 随机遇敌合同（encounter-2；用户 2026-10-28 13:48 第3条；总策划定：随机战不写剧情事件、flags、身份账）。
 *
 * 模板 random/skirmish.template.json 不进 content packs、不进 SCENE_CONTRACTS，按合同 id 实例化：
 * 所有参数都编码在 id 里（遇敌 id、敌人、数量、等级），sceneContractById 只凭 id 就能重建，读档、预演克隆都不依赖外部状态。
 * 等级段：整数＝池条目给定的等级（已含难度 levelShift，由 snapshotLevels 直接用）；'p'＝按 combat.enemyPresets 定级；
 * 'p<整数>'＝按预设定级但 protagonistOffset 改用池条目的 levelOffset。
 */
import template from './random/skirmish.template.json';
import { registerSceneContracts } from './registry';
import { lintContract } from '../lint';
import { logEventOnce } from '@/modules/diagnostics/log';
import { namedEntity, entityAliases } from '@/modules/scenarioMods/namedEntities';
import type { Contract, PartyDef } from '../types';

export const RANDOM_CONTRACT_PREFIX = 'combat.random.skirmish~';

export interface RandomContractParams { id: string; enemyId: string; count: number; level: number | null; levelOffset?: number | null }

export function randomContractId({ id, enemyId, count, level, levelOffset }: RandomContractParams): string {
  const levelPart = Number.isInteger(level) ? String(level) : Number.isInteger(levelOffset) ? `p${levelOffset}` : 'p';
  return `${RANDOM_CONTRACT_PREFIX}${id}~${enemyId}~${count}~${levelPart}`;
}

export function isRandomContract(c: Pick<Contract, 'meta'> | undefined | null): boolean {
  return c?.meta?.scene?.kind === 'random';
}

function parse(contractId: string): RandomContractParams | string {
  if (!contractId.startsWith(RANDOM_CONTRACT_PREFIX)) return 'bad_prefix';
  const parts = contractId.slice(RANDOM_CONTRACT_PREFIX.length).split('~');
  if (parts.length !== 4) return 'bad_shape';
  const [id, enemyId, countText, levelText] = parts;
  if (!id || !enemyId) return 'bad_shape';
  const count = Number(countText);
  if (!/^\d+$/.test(countText) || !(count >= 1)) return 'bad_count';
  const offset = levelText.match(/^p(-?\d+)?$/);
  if (offset) return { id, enemyId, count, level: null, ...(offset[1] !== undefined ? { levelOffset: Number(offset[1]) } : {}) };
  if (!/^\d+$/.test(levelText)) return 'bad_level';
  return { id, enemyId, count, level: Number(levelText) };
}

function build(contractId: string, p: RandomContractParams): Contract | string {
  const enemy = namedEntity('enemy', p.enemyId);
  if (!enemy) return 'unknown_enemy';
  if (enemy.unnamed !== true) return 'named_enemy';
  const raw = structuredClone(template) as unknown as Contract;
  raw.meta.id = contractId;
  const foe = raw.parties.find(party => party.id === 'foe')!;
  const attack = raw.enemyActions!.find(action => action.party === 'foe')!;
  const aliases = entityAliases('enemy', p.enemyId);
  const foes: PartyDef[] = [], attacks: NonNullable<Contract['enemyActions']> = [];
  for (let i = 1; i <= p.count; i++) {
    const party: PartyDef = { ...structuredClone(foe), id: `foe_${i}`, ref: p.enemyId, enemyId: p.enemyId };
    if (aliases.length) party.aliases = aliases;
    if (p.level !== null) party.fixedLevel = p.level;
    else if (Number.isInteger(p.levelOffset)) party.levelOffset = p.levelOffset as number;
    foes.push(party);
    attacks.push({ ...structuredClone(attack), id: `foe_${i}_attack`, party: party.id });
  }
  raw.parties = [...raw.parties.filter(party => party !== foe), ...foes];
  raw.enemyActions = [...raw.enemyActions!.filter(action => action !== attack), ...attacks];
  // 赢＝每个来袭者的轨道都推到「倒下」（多敌照 f03 的写法；sideDowned 只认倒地状态，不认轨道到头）。
  raw.objective.win = { all: foes.map(party => ({ party: party.id, track: 'vit', reach: 'final' })) } as Contract['objective']['win'];
  const contract = registerSceneContracts([raw])[0];
  const errors = lintContract(contract).errors;
  return errors.length ? `lint: ${errors.join('；')}` : contract;
}

const cache = new Map<string, Contract>();

/** 按合同 id 实例化随机遇敌合同；任何一步失败都返回 undefined，并按 id 记一次 LCQ-SAV-034（本次不开战，遇敌由调用方作废）。 */
export function instantiateRandomContract(contractId: string): Contract | undefined {
  const hit = cache.get(contractId);
  if (hit) return hit;
  let result: Contract | string;
  try {
    const params = parse(contractId);
    result = typeof params === 'string' ? params : build(contractId, params);
  } catch (e) {
    result = `exception: ${(e as Error)?.message || String(e)}`; /* lcq-allow: 失败原因随下面的 LCQ-SAV-034 记录 */
  }
  if (typeof result === 'string') {
    logEventOnce(`LCQ-SAV-034:${contractId}`, { code: 'LCQ-SAV-034', detail: { contractId, reason: result } });
    return undefined;
  }
  cache.set(contractId, result);
  return result;
}
