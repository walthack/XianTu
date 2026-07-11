import type { ScenarioCondition, ScenarioModEvent } from './schema';

// 旧存档把事件快照直接落在 runtime.events 中。它们不会随着内置关卡
// 数据升级而自动补齐 narrativeVariants，因此这里保留极小的兼容层；
// 新存档仍优先使用事件数据自身的分歧文案。
const legacyNarrativeVariants: Record<string, Array<{
  when: ScenarioCondition[];
  name?: string;
  description?: string;
  axisBeat?: string;
  objective?: string;
}>> = {
  'lcq.event.s07_05_eight_steeds_informed': [{
    when: [{ path: 'flags.event.s06_03.void', operator: 'eq', value: true }],
    name: '谢艺生还的后果',
    description: '孟非卿得知谢艺生还，以及鬼王峒一役留下的变故，星月湖需要重新判断局势。',
    axisBeat: '谢艺生还改变了原有死讯带来的判断；先向孟非卿说明事实与鬼王峒余波。',
    objective: '向孟非卿说明谢艺生还与鬼王峒变故',
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

/** 返回当前存档分歧下可见的事件文案；事件 id / 完成条件不变，避免把追认误当重演。 */
export function resolveScenarioEventNarrative(event: ScenarioModEvent, flags: Record<string, unknown>): ScenarioModEvent {
  const variants = event.narrativeVariants?.length
    ? event.narrativeVariants
    : legacyNarrativeVariants[event.id];
  const variant = variants?.find(item => item.when.every(condition => matches(condition, flags)));
  return variant ? { ...event, ...variant } : event;
}
