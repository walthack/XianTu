import { projectNamingText } from './ledger/naming';
import type { ScenarioCondition, ScenarioModEvent } from './schema';
import type { ScenarioDivergence } from './divergenceLedger';
import { locationWithin } from './travel/locationIds';
import { resolveFixedQuestObjective } from './fixedQuestObjectives';
import { evaluateLedgerCondition } from './ledgerConditions';

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

/** 账本路径（identity./done./line./acq./knows./party.）先交 ledgerConditions；不传 runtime 时不命中。 */
function matches(condition: ScenarioCondition, flags: Record<string, unknown>, runtime?: unknown): boolean {
  const ledger = evaluateLedgerCondition(condition, runtime);
  if (ledger !== undefined) return ledger;
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
function resolveScenarioEventNarrativeRaw(
  event: ScenarioModEvent,
  flags: Record<string, unknown>,
  divergences?: ScenarioDivergence[],
  runtime?: unknown,
): ScenarioModEvent {
  if (event.id === 'lcq.event.shanghou_revealed'
    && flagValue(flags, 'flags.event.shanghou_revealed.done') !== true
    && flagValue(flags, 'flags.event.shanghou_revealed.relic_test_refused') !== true) {
    return { ...event, relatedFactionIds: [], name: '山村中的测试', objective: '随叶媪进堂，听主人说明测试',
      description: '进村前路边有白骨。堂中主人打开鲨皮红木箱，展示黄底黑边三角与红色拐弯箭头，警告167人触碰后化为火球。只写眼前物件和警告，不解释电、高压，不提前揭露朱老头本相，不替玩家选择。',
      axisBeat: '堂中主人要求测试天命之人，玩家尚未决定是否触碰。' };
  }
  const compatibilityVariants = legacyNarrativeVariants[event.id];
  // 新版内置关卡的数据是权威；兼容层只填补老存档快照缺失的 variants，不能反向覆盖新数据。
  const variants = event.narrativeVariants?.length ? event.narrativeVariants : compatibilityVariants;
  const variant = variants?.find(item => item.when.every(condition => matches(condition, flags, runtime)));
  if (variant) return { ...event, ...variant };
  const divergence = relatedDivergence(event, divergences);
  if (divergence) return projectFromDivergence(event, divergence);
  const objective = resolveFixedQuestObjective(event);
  return objective && objective !== event.objective ? { ...event, objective } : event;
}

/** 页面与叙事共享称呼出口；投影副本，不改合同哈希或存档里的事件真值。 */
export function resolveScenarioEventNarrative(event: ScenarioModEvent, flags: Record<string, unknown>, divergences?: ScenarioDivergence[], runtime?: Parameters<typeof projectNamingText>[1]): ScenarioModEvent {
  const view = resolveScenarioEventNarrativeRaw(event, flags, divergences, runtime);
  if (!runtime) return view;
  return { ...view, name: projectNamingText(view.name, runtime), description: projectNamingText(view.description || '', runtime, 'narration'), objective: projectNamingText(view.objective || '', runtime), axisBeat: projectNamingText(view.axisBeat || '', runtime, 'narration') };
}

type QuestCompassRuntime = {
  opening?: { playerCharacterId?: string };
  canon?: {
    characters?: Array<{ id?: string; name?: string }>;
    locations?: Array<{ id?: string; name?: string }>;
  };
} | null | undefined;

/** lyl.lin_an_bridge「初抵临安」章的拍（与关卡数据同步，测试钉住）。 */
export const LIN_AN_ARRIVAL_EVENT_IDS: ReadonlySet<string> = new Set([
  'linan_arrive_fengbo', 'tail_li_shishi', 'survey_wumu_mansion', 'evade_huangchengsi', 'mingqingsi_lin_lu_meeting',
  'decode_bianmenwa_note', 'weiyuan_extortion', 'libu_registration', 'meet_xue_yanshan', 'blacksea_iron_puppet',
].map(id => `lyl.event.${id}`));

/** lyl.han_palace_endgame「宫变之夜」章的拍（与关卡数据同步，测试钉住）。 */
export const HAN_PALACE_NIGHT_EVENT_IDS: ReadonlySet<string> = new Set([
  'lvji_defiles_consort', 'emperor_death_spreads', 'arrange_escape_route', 'liujian_takes_nangong',
  'changqiu_palace_defense', 'bounty_and_hu_cavalry', 'han_jianyu_refused', 'lvfengxian_breaks_line',
].map(id => `lyl.event.${id}`));

/** lyl.luoyang_cloud_secret「洛都风云」章的拍（与关卡数据同步，测试钉住）。 */
export const LUOYANG_COURT_EVENT_IDS: ReadonlySet<string> = new Set([
  'han_yuedan_ping', 'han_huo_villa', 'han_xingyue_framed', 'han_limit_field',
].map(id => `lyl.event.${id}`));

/** lyg.changgan_begins「留仙坪」章的承重拍（与关卡数据同步，测试钉住）；同章另挂的两条非 rail 拍开放在灞桥段，不在此列。 */
export const LIUXIANPING_EVENT_IDS: ReadonlySet<string> = new Set([
  'tang_liuxianping_arrive', 'tang_liuxianping_xiangshi', 'changgan_fanseng_hunt',
].map(id => `lyg.event.${id}`));

/** lyg.changgan_interlude 首章（rail 章）以外三章的拍，按章名分（与关卡数据同步，测试钉住）。 */
export const CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS: ReadonlyArray<readonly [string, ReadonlySet<string>]> = [
  ['年节与朝局', ['changgan_interlude_01_beat', 'changgan_interlude_02_beat', 'changgan_interlude_03_beat', 'song_tongwen',
    'changgan_interlude_04_beat', 'tang_secret_treaty_signed', 'changgan_interlude_05_beat']],
  ['失踪与伏击', ['changgan_interlude_06_beat', 'changgan_interlude_07_beat', 'changgan_interlude_08_beat', 'honglusi_treaty_announced',
    'changgan_interlude_09_beat', 'changgan_interlude_10_beat']],
  ['甘露前夜', ['liang_secret_order', 'zhoufei_conspiracy', 'feiniao_hilt_clue']],
].map(([title, ids]) => [title as string, new Set((ids as string[]).map(id => `lyg.event.${id}`))] as const);

/** 短版 stage02 合并了多段原著章节；界面按当前剧情地点标段，不沿用第10章标题。 */
export function storyChapterTitle(modId: string | undefined, eventId: string | undefined, fallback: string): string {
  if (modId === 'lcq.stage_04' && eventId) return ({
    'lcq.event.s04_02': '第46章·袭击', 'lcq.event.s04_03': '第47章·新娘身份',
    'lcq.event.s04_01': '第49章·刺王密谋', 'lcq.event.s04_04': '第51章·发蛊',
    'lcq.event.s04_05': '第52章·旱洪', 'lcq.event.s04_06': '第54章·穿山',
    'lcq.event.s04_07': '第55章·白夷迎客',
  } as Record<string, string>)[eventId] || fallback;
  if (modId === 'lcq.stage_04b_lingfei_baiyi_crisis' && eventId) {
    if (eventId === 'lcq.event.enter_dong_with_migu') return '第86章·随弥骨入峒';
    if (['lcq.event.huamiao_coop_boundary', 'lcq.event.guiwangdong_coop_pact'].includes(eventId)) return '第85章·进峒之约';
    if (eventId === 'lcq.event.yiyang_repels_yinsha') return '第84章·阴煞';
    if (eventId === 'lcq.event.wuerlang_slays_dagu') return '第83章·虎威';
    if (eventId === 'lcq.event.ruins_ghost_warriors') return '第82章·迎敌';
    if (eventId === 'lcq.event.biling_bay_stance') return '第80章·碧鲮前路';
    if (['lcq.event.haishen_hall_merfolk', 'lcq.event.pull_harpoon_lemingzhu'].includes(eventId)) return '海神殿';
    if (['lcq.event.regroup_caravan_envoy','lcq.event.weapon_deal_with_geluo','lcq.event.spot_dong_informant'].includes(eventId)) return '商队与峒使';
  }
  // 临安：rail 章是首章「初抵临安」，整关停在它上面；原「临安疑线」章的拍照旧标疑线（五线补全·宋 2026-10-28）
  if (modId === 'lyl.lin_an_bridge' && eventId) return LIN_AN_ARRIVAL_EVENT_IDS.has(eventId) ? '初抵临安' : '临安疑线';
  // 汉宫：rail 章是新首章「宫变之夜」，整关停在它上面；其余拍照旧标「汉宫突入」。洛都：rail 章仍是首章，第二章「洛都风云」的拍单标（五线补全·汉 2026-10-28）
  if (modId === 'lyl.han_palace_endgame' && eventId) return HAN_PALACE_NIGHT_EVENT_IDS.has(eventId) ? '宫变之夜' : '汉宫突入';
  if (modId === 'lyl.luoyang_cloud_secret' && eventId && LUOYANG_COURT_EVENT_IDS.has(eventId)) return '洛都风云';
  // 唐：长安初定、长安插曲的 rail 章都改成了新首章（留仙坪／佛门暗潮与元正朝会），整关停在它上面；其余拍照旧标原章（五线补全·唐 2026-10-28）
  if (modId === 'lyg.changgan_begins' && eventId) return LIUXIANPING_EVENT_IDS.has(eventId) ? '留仙坪' : '抵达长安灞桥';
  if (modId === 'lyg.changgan_interlude' && eventId) return CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS.find(([, ids]) => ids.has(eventId))?.[0] ?? fallback;
  if (modId !== 'lcq.stage_02' || !eventId) return fallback;
  if (['lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02'].includes(eventId)) return fallback;
  return storyRouteLocation(eventId)?.includes('南荒') ? '南荒商路' : '五原';
}

export function storyRouteLocation(eventId: string): string | undefined {
  // 可选姿态拍（`<主线事件>_ins_<线>`）演在主线事件所在的路上，不另起地点。
  eventId = eventId.split('_ins_')[0];
  return ({
    'lcq.event.iron_bridge_ambush': '南荒途中·铁索桥',
    'lcq.event.ningyu_regicide_offer': '南荒途中·商队宿处',
    'lcq.event.zixi_taiyi_intercept': '南荒途中·紫溪',
    'lcq.event.rainforest_black_shoal': '南荒途中·雨林黑石滩',
    'lcq.event.silent_sheyi_village': '南荒·蛇彝村',
  } as Record<string, string>)[eventId];
}

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
  if (!storyRouteLocation(event.id) && locName && event.locationId && !locationWithin(atLocationId, event.locationId)) phrases.push(`去${locName}`);
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
  if (event?.id === 'lcq.event.s02_04') return objective;
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
  runtime?: unknown,
): boolean {
  const compatibilityVariants = legacyNarrativeVariants[event.id];
  const variants = event.narrativeVariants?.length ? event.narrativeVariants : compatibilityVariants;
  const explicitReplacement = variants?.some(item => item.replacesCanonRail === true
    && item.when.every(condition => matches(condition, flags, runtime))) ?? false;
  return explicitReplacement || Boolean(relatedDivergence(event, divergences));
}

/** 认知/路径按已携带的编年史顺序跨关排，不比较不同关的本地回合。 */
export function ledgerRecordOrder(runtime: any, record: { sourceEventId?: string }): number {
  const entry = (runtime?.chronicle || []).find((c: any) => record.sourceEventId && String(c.id).endsWith('.' + record.sourceEventId));
  if (entry) return Number(entry.sequence) || 0;
  return runtime?.events?.some((e: any) => e.id === record.sourceEventId)
    ? Math.max(0, ...(runtime.chronicle || []).map((c: any) => Number(c.sequence) || 0)) + 1 : 0;
}
export function ledgerRecordTurnLabel(runtime: any, record: { sourceEventId?: string }, turn: unknown): string {
  const entry = (runtime?.chronicle || []).find((c: any) => record.sourceEventId && String(c.id).endsWith('.' + record.sourceEventId));
  const stage = entry?.stageId || (runtime?.events?.some((e: any) => e.id === record.sourceEventId) ? runtime.modId : '');
  const label = String(stage || '').match(/stage_(\d+b?)/)?.[1];
  const local = Number(turn) > 0 ? `第 ${Number(turn)} 回合` : !record.sourceEventId ? '开场已知' : '回合未记录';
  return `${label ? `第${label}关 · ` : ''}${local}`;
}
