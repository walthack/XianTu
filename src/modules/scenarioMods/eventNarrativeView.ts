import type { ScenarioCondition, ScenarioModEvent } from './schema';
import type { ScenarioDivergence } from './divergenceLedger';
import { resolveFixedQuestObjective } from './fixedQuestObjectives';

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
  'lcq.event.gamble_bond_signed': [
    {
      when: [
        { path: 'flags.event.gamble_bond_signed.refused_capture', operator: 'eq', value: true },
        { path: 'flags.world.baihu.hall_controlled', operator: 'eq', value: true },
      ],
      replacesCanonRail: true,
      name: '拒赌后被商馆扣押',
      description: '程宗扬明确拒绝与苏妲己对赌，并未入局也未签卖身契；苏妲己命人拿下后，他仍受白湖商馆控制。',
      axisBeat: '程宗扬拒赌后被扣押，仍受白湖商馆控制；此事不是赌输签契。',
      objective: '面对拒赌后被扣押、仍受商馆控制的局面',
    },
    {
      when: [{ path: 'flags.event.gamble_bond_signed.refused_capture', operator: 'eq', value: true }],
      replacesCanonRail: true,
      name: '拒赌后离开商馆',
      description: '程宗扬明确拒绝与苏妲己对赌，并未入局也未签卖身契；后来已从白湖商馆脱身，当前不再受商馆扣押。',
      axisBeat: '程宗扬曾拒赌并未签契，现已离馆；此事不是赌输签契。',
      objective: '承接拒赌后离馆的既成历史，不得改写成赌输或当前仍被扣押',
    },
    {
      when: [{ path: 'flags.world.baihu.gamble_refusal_phase', operator: 'eq', value: 'capture_ordered' }],
      replacesCanonRail: true,
      name: '拒赌后的拘拿',
      description: '你已拒绝这场赌局。苏妲己翻脸命人拿下，你尚未脱开商馆控制；此事不是赌局落败或签契。',
      axisBeat: '苏妲己因拒赌命人拿下；不得写成已经赌输或自愿签卖身契。',
      objective: '苏妲己已因你拒赌命人拿下，先应对眼前拘拿',
    },
  ],
  'lcq.event.ningyu_enters_gamble': [{
    when: [{ path: 'flags.world.baihu.gamble_refusal_phase', operator: 'eq', value: 'capture_ordered' }],
    replacesCanonRail: true,
    name: '拒赌后的拘拿',
    description: '凝羽已被差遣入局的当场，你拒绝与苏妲己对赌。苏妲己翻脸命人拿下，你尚未脱开商馆控制。',
    axisBeat: '你已拒绝赌局，苏妲己命人拿下；不得写成已经赌输或签契。',
    objective: '苏妲己已因你拒赌命人拿下，先应对眼前拘拿',
  }],
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
  if (divergence) return projectFromDivergence(event, divergence);
  const objective = resolveFixedQuestObjective(event);
  return objective && objective !== event.objective ? { ...event, objective } : event;
}

type QuestCompassRuntime = {
  opening?: { playerCharacterId?: string };
  canon?: {
    characters?: Array<{ id?: string; name?: string }>;
    locations?: Array<{ id?: string; name?: string }>;
  };
} | null | undefined;

function questCompassTargets(event: ScenarioModEvent, runtime: QuestCompassRuntime): { locName: string; who: string[] } {
  const locName = String((runtime?.canon?.locations || []).find(item => item.id === event.locationId)?.name || '').trim();
  const playerId = String(runtime?.opening?.playerCharacterId
    || ((runtime?.canon?.characters || []).some(item => item.id === 'liuchao.character.cheng_zongyang')
      ? 'liuchao.character.cheng_zongyang' : ''));
  const playerName = String((runtime?.canon?.characters || []).find(item => item.id === playerId)?.name || '').trim();
  const who = [...new Set((event.relatedCharacterIds || [])
    .filter(id => id && id !== playerId)
    .map(id => String((runtime?.canon?.characters || []).find(item => item.id === id)?.name || '').trim())
    .filter(name => name.length >= 2 && name !== playerName))]
    .slice(0, 2);
  return { locName, who };
}

/** 当前拍要去哪、见谁。已在目标地点时不再写「去某地」。 */
export function questCompassPhrases(
  event: ScenarioModEvent | null | undefined,
  runtime: QuestCompassRuntime,
  atLocationId?: string,
): string[] {
  if (!event) return [];
  const { locName, who } = questCompassTargets(event, runtime);
  const phrases: string[] = [];
  if (locName && event.locationId && event.locationId !== atLocationId) phrases.push(`去${locName}`);
  for (const name of who) phrases.push(`见${name}`);
  return phrases;
}

/** 任务栏罗盘：去哪、见谁。不剧透结果，不替代 objective。 */
export function formatQuestCompass(
  event: ScenarioModEvent | null | undefined,
  runtime: QuestCompassRuntime,
  atLocationId?: string,
): string {
  const objective = resolveFixedQuestObjective(event);
  const pointer = questCompassPhrases(event, runtime, atLocationId).join(' · ');
  if (!pointer) return objective;
  if (!objective) return pointer;
  return `${pointer}：${objective}`;
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
