import type { ScenarioCondition, ScenarioModEvent } from './schema';
import type { ScenarioDivergence } from './divergenceLedger';

// 旧存档把事件快照直接落在 runtime.events 中。它们不会随着内置关卡
// 数据升级而自动补齐 narrativeVariants，因此这里保留极小的兼容层。
// 对列入兼容层的稳定事件，代码侧覆盖旧快照中的过时 variant；否则老存档
// 即使升级应用，仍会继续使用当初写进 runtime.events 的旧完成合同。
const legacyNarrativeVariants: Record<string, Array<{
  when: ScenarioCondition[];
  replacesCanonRail?: boolean;
  name?: string;
  description?: string;
  axisBeat?: string;
  objective?: string;
}>> = {
  'lcq.event.s07_05_eight_steeds_informed': [{
    when: [{ path: 'flags.event.s06_03.void', operator: 'eq', value: true }],
    replacesCanonRail: true,
    name: '谢艺生还的后果',
    description: '孟非卿得知谢艺生还，以及鬼王峒一役留下的变故；他必须据此调度星月湖人手，而非只确认消息。',
    axisBeat: '孟非卿确认谢艺仍然生还，当场至少作出一项具体安排：派人接应或探望谢艺，或命人调查黑魔海与鬼王峒线索。',
    objective: '说明谢艺生还与鬼王峒变故，并见证孟非卿作出具体安排',
  }],
};

function flagValue(flags: Record<string, unknown>, path: string): unknown {
  if (!path.startsWith('flags.')) return undefined;
  const key = path.slice('flags.'.length);
  let cur: unknown = flags;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) { cur = undefined; break; }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur === undefined ? flags[key] : cur;
}

function matches(condition: ScenarioCondition, flags: Record<string, unknown>): boolean {
  const actual = flagValue(flags, condition.path);
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'neq') return actual !== condition.value;
  return false;
}

function relatedDivergence(
  event: ScenarioModEvent,
  divergences: ScenarioDivergence[] | undefined,
): ScenarioDivergence | undefined {
  const related = new Set(event.relatedCharacterIds || []);
  if (!related.size || !Array.isArray(divergences)) return undefined;
  return [...divergences].reverse().find(item =>
    item.revealed !== false && item.characterStates.some(state => related.has(state.characterId)),
  );
}

function projectFromDivergence(event: ScenarioModEvent, divergence: ScenarioDivergence): ScenarioModEvent {
  const states = divergence.characterStates
    .filter(state => (event.relatedCharacterIds || []).includes(state.characterId))
    .map(state => `${state.characterId}=${state.status}`)
    .join('、');
  const consequence = `本世界线既有事实：${divergence.worldDelta}${states ? `（${states}）` : ''}`;
  return {
    ...event,
    name: `${event.name}·世界线承接`,
    description: `${consequence}。原事件只能作为因果背景，必须改写为这一变化造成的新局面。`,
    axisBeat: `${consequence}。让仍在场的人物据此采取具体行动，不得复写已失效的原著结果。`,
    objective: `承接“${divergence.worldDelta}”造成的后果`,
  };
}

/** 返回当前存档分歧下可见的事件文案；事件 id / 完成条件不变，避免把追认误当重演。 */
export function resolveScenarioEventNarrative(
  event: ScenarioModEvent,
  flags: Record<string, unknown>,
  divergences?: ScenarioDivergence[],
): ScenarioModEvent {
  const compatibilityVariants = legacyNarrativeVariants[event.id];
  // 新版内置关卡的数据是权威；兼容层只填补老存档快照缺失的 variants，不能反向覆盖新数据。
  const variants = event.narrativeVariants?.length ? event.narrativeVariants : compatibilityVariants;
  const variant = variants?.find(item => item.when.every(condition => matches(condition, flags)));
  if (variant) return { ...event, ...variant };
  const divergence = relatedDivergence(event, divergences);
  return divergence ? projectFromDivergence(event, divergence) : event;
}

/** 仅显式声明的分歧投影可替代 Canon Rail；普通条件化文案仍保留默认正典合同。 */
export function narrativeVariantReplacesCanonRail(
  event: ScenarioModEvent,
  flags: Record<string, unknown>,
  divergences?: ScenarioDivergence[],
): boolean {
  const compatibilityVariants = legacyNarrativeVariants[event.id];
  const variants = event.narrativeVariants?.length ? event.narrativeVariants : compatibilityVariants;
  const explicitReplacement = variants?.some(item => item.replacesCanonRail === true
    && item.when.every(condition => matches(condition, flags))) ?? false;
  return explicitReplacement || Boolean(relatedDivergence(event, divergences));
}
