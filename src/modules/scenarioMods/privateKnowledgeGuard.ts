import { getRegistryNamesById } from './characterResolver';

import type {
  ScenarioNpcPrivateKnowledgeFact,
  ScenarioPlayerKnowledgeFact,
  ScenarioPrivateKnowledgeAssociationGuard,
} from './schema';

type PlayerKnowledgeLedger = Record<string, ScenarioPlayerKnowledgeFact> | undefined;

function uniqueStrings(values: Iterable<string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function playerKnowsPrivateFact(
  playerKnowledge: PlayerKnowledgeLedger,
  fact: ScenarioNpcPrivateKnowledgeFact,
): boolean {
  return Object.values(playerKnowledge || {}).some(known =>
    (fact.status === 'rumor'
      ? known.status === 'rumor' || known.status === 'confirmed'
      : known.status === 'confirmed')
    && known.subjectId === fact.subjectId
    && known.predicate === fact.predicate
    && (known.objectId || '') === (fact.objectId || '')
  );
}

/** confirmed 在玩家确认后退休；rumor 即使已听说也持续防止被坐实。 */
export function privateFactNeedsAssociationGuard(
  playerKnowledge: PlayerKnowledgeLedger,
  fact: ScenarioNpcPrivateKnowledgeFact,
): boolean {
  return fact.status === 'rumor' || !playerKnowsPrivateFact(playerKnowledge, fact);
}

/**
 * 数据中的 subjects 可保留额外语义称呼，但安全边界至少覆盖事实两端角色在
 * registry 登记的规范名与全部别名。正文和命令门禁共用这一编译结果。
 */
export function expandPrivateKnowledgeAssociations(
  fact: ScenarioNpcPrivateKnowledgeFact,
): ScenarioPrivateKnowledgeAssociationGuard[] {
  const registryNames = uniqueStrings([
    ...getRegistryNamesById(fact.subjectId),
    ...(fact.objectId ? getRegistryNamesById(fact.objectId) : []),
  ]);
  return (fact.forbiddenAssociations || []).map(association => ({
    ...association,
    subjects: uniqueStrings([...association.subjects, ...registryNames]),
    predicates: uniqueStrings(association.predicates),
  }));
}
