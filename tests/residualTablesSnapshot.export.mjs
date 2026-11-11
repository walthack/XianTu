// B0「补钉快照」的计算口径与一次性导出脚本（tests/residualTablesSnapshot.test.mjs 用的是这里同一段代码）。
// 快照 tests/fixtures/residual-tables-snapshot.json 由基线 048ca74a 的现行实现导出一次写入，之后**不再重生**；
// 搬迁 PR（B1–B8、BZ）不得改那份快照，只能换读取来源。探针集合变了会让测试变红，须人工确认后再单独补快照。
//
// 用法：
//   node tests/residualTablesSnapshot.export.mjs --out /tmp/x.json   # 导到别处（确定性自检用）
//   node tests/residualTablesSnapshot.export.mjs                      # 仅当夹具不存在时写入夹具；已存在则拒绝覆盖
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/linesPackSnapshot.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const ROOT = new URL('../', import.meta.url);
const { loadTs } = await import('./loadTs.mjs');
const quiet = fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

export const FIXTURE_URL = new URL('./fixtures/residual-tables-snapshot.json', import.meta.url);

// ───────────── 计算口径 ─────────────
const P = await loadTs('../src/modules/contentPacks/index.ts');
const NE = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const ST = await loadTs('../src/modules/scenarioMods/stanceProfiles.ts');
const AL = await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
const AC = await loadTs('../src/modules/scenarioMods/affinityCaps.ts');
const DL = await loadTs('../src/modules/scenarioMods/divergenceLedger.ts');
const PA = await loadTs('../src/modules/scenarioMods/playerActionPresentation.ts');
const BD = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const NV = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const EP = await loadTs('../src/modules/scenarioMods/endingPresentation.ts');
const FE = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const NH = await loadTs('../src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts');
const WZ = await loadTs('../src/modules/scenarioMods/travel/defs/qingyuWuyuanZones.ts');
const WO = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const LI = await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
const PE = await loadTs('../src/modules/scenarioMods/persistentLineEntries.ts');
const RT = await loadTs('../src/modules/scenarioMods/runtime.ts');

/** 不可 JSON 的值规范化：RegExp 记 source+flags，Set/Map 记迭代顺序，函数记名字；undefined 属性同 JSON 丢弃，顶层 undefined 记 null。 */
export function norm(v) {
  if (v === undefined) return null;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $number: String(v) };
  if (typeof v === 'function') return { $function: v.name || 'anonymous' };
  if (v instanceof RegExp) return { $regexp: v.source, flags: v.flags };
  if (v instanceof Set) return { $set: [...v].map(norm) };
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [norm(k), norm(x)]) };
  if (Array.isArray(v)) return v.map(norm);
  const out = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = norm(x);
  return out;
}
const uniq = xs => [...new Set(xs)];
const clone = v => structuredClone(v);

// 关源：B0 时在 builtins/data（套内容包 overlay，同运行时）＋内容包关。搬迁后只换这里的读取来源。
const dataDir = new URL('src/modules/scenarioMods/builtins/data/', ROOT);
const BUILTIN_IDS = readdirSync(dataDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const stageCache = new Map();
const stage = id => {
  if (!stageCache.has(id)) {
    const pack = P.CONTENT_PACKS.stages.find(s => s.manifest.id === id);
    stageCache.set(id, pack || P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(`${id}.json`, dataDir), 'utf8'))));
  }
  return stageCache.get(id);
};
export const ALL_STAGE_IDS = [...BUILTIN_IDS, ...P.CONTENT_PACKS.stages.map(s => s.manifest.id)];
const ALL_EVENTS = ALL_STAGE_IDS.flatMap(id => stage(id).scenario.events.map(e => ({ stageId: id, event: e })));
const eventById = id => ALL_EVENTS.find(x => x.event.id === id)?.event;
const OFF_ACTION = '__b0_not_in_contract__';
const OFF_EVENT = 'lcq.event.__b0_not_in_catalog__';
const NONE_LOC = 'liuchao.location.__b0_none__';

// ── 1. stanceProfiles ──
function computeStance() {
  const stances = ['low', 'mid', 'high'];
  const names = uniq([...ST.STANCE_PROFILES.flatMap(p => p.names), '__b0_无档案者__', '']);
  const format = {};
  for (const n of names) for (const s of stances) {
    const out = ST.formatStanceProfile(n, s);
    if (out) format[`${n}|${s}`] = out;
  }
  return {
    STANCE_PROFILES: norm(ST.STANCE_PROFILES),
    stances, nameProbeCount: names.length, formatProbeCount: names.length * stances.length,
    format,
    hasStanceProfile: Object.fromEntries(names.map(n => [n, ST.hasStanceProfile(n)])),
  };
}

// ── 2. affinityCaps ──
function computeAffinityCaps() {
  const capNames = uniq(AC.AFFINITY_CAPS.flatMap(c => c.names));
  // canonicalIdentityName 吃角色 id：凡别名与上限表有交集的角色 id 也作探针（id 来自命名实体表，不来自本表）
  const ids = NE.namedEntityEntries('character').filter(e => [e.definition?.name, ...(e.aliases || [])].some(a => capNames.includes(a))).map(e => e.id).sort();
  const probes = uniq([...capNames, ...ids, 'liuchao.character.__b0_none__', '__b0_无上限者__']);
  const labels = [undefined, '相识', '心腹', '后宫', '主仆', '敌对'];
  const capFor = {}, format = {};
  for (const n of probes) for (const l of labels) {
    const key = `${n}|${l ?? '<undefined>'}`;
    const hit = AC.affinityCapFor(n, l);
    capFor[key] = hit ? AC.AFFINITY_CAPS.indexOf(hit) : null;
    const f = AC.formatAffinityCap(n, l);
    if (f) format[key] = f;
  }
  // displayName 回退：传一个不在名册里的 id，展示名给表内名字
  const displayFallback = Object.fromEntries(capNames.map(n => [n, (h => (h ? AC.AFFINITY_CAPS.indexOf(h) : null))(AC.affinityCapFor('liuchao.character.__b0_none__', undefined, n))]));
  return {
    AFFINITY_CAPS: norm(AC.AFFINITY_CAPS),
    capTiers: AC.AFFINITY_CAPS.map(c => AL.AFFINITY_TIERS.find(t => c.cap >= t.min && c.cap <= t.max)?.id ?? null),
    probeCount: probes.length * labels.length, capFor, format, displayFallback,
  };
}

// ── 3. divergenceLedger（两张规则表未导出：按规则各造命中／不命中输入，从行为钉）──
// 探针输入是测试侧自定的固定 (事件, 人物) 组合，覆盖现行五条分支规则与一条后果规则；另附全书事件的空状态探针。
const DIVERGENCE_PAIRS = [
  ['lcq.event.s06_03', 'liuchao.character.xie_yi'],
  ['lcq.event.s06_04', 'liuchao.character.bi_ji'],
  ['lcq.event.s08_06_pursuit_repelled', 'liuchao.character.su_daji'],
  ['lyg.event.s01_06', 'liuchao.character.guo_jie'],
  ['lyg.event.s01_07', 'liuchao.character.dong_zhuo'],
  ['lcq.event.s06_03', 'liuchao.character.bi_ji'], // 事件对、人物不对
  [OFF_EVENT, 'liuchao.character.xie_yi'],
];
const DIVERGENCE_STATUSES = ['alive', 'longrest', 'incapacitated', 'dead', 'missing', 'ALIVE', ' Dead ', 'MISSING', 'unknown', ''];
function computeDivergence() {
  const branch = {}, record = {}, prompt = {};
  for (const [eventId, characterId] of DIVERGENCE_PAIRS) for (const status of DIVERGENCE_STATUSES) for (const verdict of ['void', 'done']) {
    const key = `${eventId}|${characterId}|${JSON.stringify(status)}|${verdict}`;
    const input = { id: eventId, verdict, evidence: 'b0-evidence', worldDelta: 'b0-world-delta', characterStates: { [characterId]: status } };
    branch[key] = DL.resolveReconcileBranchId(input) ?? null;
    const runtime = { flags: {} };
    const added = DL.recordReconcileDivergences(runtime, [input]);
    const again = DL.recordReconcileDivergences(runtime, [clone(input)]);
    record[key] = { added: norm(added), againAdded: again.length, flags: norm(runtime.flags) };
    prompt[key] = DL.formatDivergencePrompt(runtime.divergences);
  }
  // 无 worldDelta 不落账；全书事件空状态不出分支
  const noDelta = DL.recordReconcileDivergences({ flags: {} }, [{ id: 'lcq.event.s06_03', verdict: 'void', evidence: 'e', characterStates: { 'liuchao.character.xie_yi': 'alive' } }]).length;
  const bookEventBranches = Object.fromEntries(uniq(ALL_EVENTS.map(x => x.event.id)).map(id => [id, DL.resolveReconcileBranchId({ id, verdict: 'void', evidence: '', characterStates: {} })]).filter(([, v]) => v !== undefined));
  // formatDivergencePrompt 的其余分支：离屏战争、未公开、超 5 条截断、空
  const off = { flags: {} };
  DL.recordOffscreenDivergence(off, { id: 'offscreen.lcq.xingyuehu_war', eventId: 'lcq.event.xingyuehu_war', worldDelta: 'b0-war', evidence: 'e' });
  DL.recordOffscreenDivergence(off, { id: 'offscreen.b0.hidden', eventId: 'lcq.event.b0', worldDelta: 'b0-hidden', evidence: 'e', revealed: false });
  const dupOff = DL.recordOffscreenDivergence(off, { id: 'offscreen.lcq.xingyuehu_war', eventId: 'x', worldDelta: 'x', evidence: 'x' });
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, eventId: 'lcq.event.b0', worldDelta: `delta-${i}`, characterStates: [{ characterId: 'c', status: 's' }], evidence: '', sequence: i + 1 }));
  return {
    pairs: DIVERGENCE_PAIRS, statuses: DIVERGENCE_STATUSES, probeCount: Object.keys(branch).length,
    branch, record, prompt, noDeltaAdded: noDelta, bookEventBranchProbeCount: uniq(ALL_EVENTS.map(x => x.event.id)).length, bookEventBranches,
    offscreen: { ledger: norm(off.divergences), duplicate: norm(dupOff), prompt: DL.formatDivergencePrompt(off.divergences) },
    promptEdge: { undefined: DL.formatDivergencePrompt(undefined), empty: DL.formatDivergencePrompt([]), allHidden: DL.formatDivergencePrompt([{ ...many[0], revealed: false }]), seven: DL.formatDivergencePrompt(many) },
  };
}

// ── 4. playerActionPresentation ──
function computePlayerAction() {
  const scoped = {}, override = {};
  let probes = 0;
  for (const { stageId, event } of ALL_EVENTS) {
    const actions = event.playerCompletionContract?.actions || [];
    for (const a of [...actions, { id: OFF_ACTION, label: '表外动作', actionText: '表外动作原文' }]) {
      probes++;
      const key = `${stageId}|${event.id}::${a.id}`;
      const line = PA.resolveScopedPlayerLine(event, { id: a.id, label: a.label, actionText: a.actionText });
      if (line !== undefined) scoped[key] = line;
      const ov = PA.playerActionDisplayOverride(event.id, a.id);
      if (ov !== undefined) override[key] = norm(ov);
    }
  }
  // 表外事件 + 动作 id 的直查
  const lookupOff = PA.lookupScopedPlayerLine(OFF_EVENT, OFF_ACTION) ?? null;
  return { probeCount: probes, scoped, override, lookupOff, overrideOffEvent: norm(PA.playerActionDisplayOverride(OFF_EVENT, OFF_ACTION)) };
}

// ── 5. branchDecision ──
function computeBranchDecision() {
  const detect = {}, dormant = {};
  let probes = 0;
  const opt = (event, a, source = 'event_engine') => ({ source, eventId: event.id, actionId: a.id, label: a.label || a.id });
  for (const { stageId, event } of ALL_EVENTS) {
    const actions = event.playerCompletionContract?.actions || [];
    if (!actions.length) continue;
    const variants = {
      all: actions.map(a => opt(event, a)),
      reversed: [...actions].reverse().map(a => opt(event, a)),
      otherSource: actions.map(a => opt(event, a, 'open_world_engine')),
      withOffTable: [...actions.map(a => opt(event, a)), opt(event, { id: OFF_ACTION })],
    };
    const locked = BD.LOCKED_DECISIONS[event.id] || [];
    const lockedFirst = locked[0]?.[0];
    if (lockedFirst) variants.withoutDecisionAction = actions.filter(a => a.id !== lockedFirst).map(a => opt(event, a));
    // 锁里的其余选项（致命选项等）不一定是合同动作：补成候选再探一次
    const extraLocked = locked.map(([id]) => id).filter(id => !actions.some(a => a.id === id));
    if (extraLocked.length) variants.withLockedIds = [...actions.map(a => opt(event, a)), ...extraLocked.map(id => opt(event, { id }))];
    for (const [v, options] of Object.entries(variants)) {
      probes++;
      const d = BD.detectBranchDecision(options);
      if (d) detect[`${stageId}|${event.id}|${v}`] = { options: d.options.map(o => `${o.source}:${o.actionId}`), labels: d.labels };
    }
    for (const a of [...actions, ...extraLocked.map(id => ({ id })), { id: OFF_ACTION }]) if (BD.isDormantLockedOption(opt(event, a))) dormant[`${stageId}|${event.id}::${a.id}`] = true;
  }
  return { LOCKED_DECISIONS: norm(BD.LOCKED_DECISIONS), lockedOrder: Object.keys(BD.LOCKED_DECISIONS), probeCount: probes, detect, dormant, empty: BD.detectBranchDecision([]) };
}

// ── 6. eventNarrativeView：兼容变体、shanghou 特判、罗盘、行动展示 ──
const NARRATIVE_EVENT_IDS = ['lcq.event.gamble_bond_signed', 'lcq.event.ningyu_enters_gamble', 'lcq.event.s07_05_eight_steeds_informed', 'lcq.event.shanghou_revealed'];
// 各特判读到的 flag（扁平键，同 runtime.flags 写法）；phase 取 capture_ordered／其它值／缺省
const NARRATIVE_FLAGS = [
  ['event.gamble_bond_signed.refused_capture', [true]],
  ['world.baihu.hall_controlled', [true]],
  ['world.baihu.gamble_refusal_phase', ['capture_ordered', 'other']],
  ['event.s06_03.void', [true]],
  ['event.shanghou_revealed.done', [true]],
  ['event.shanghou_revealed.relic_test_refused', [true]],
];
function flagCombos() {
  let combos = [{}];
  for (const [k, vals] of NARRATIVE_FLAGS) combos = combos.flatMap(c => [c, ...vals.map(v => ({ ...c, [k]: v }))]);
  return combos;
}
function computeNarrative() {
  const views = [], viewIndex = new Map();
  const intern = v => { const s = JSON.stringify(v); if (!viewIndex.has(s)) { viewIndex.set(s, views.length); views.push(v); } return viewIndex.get(s); };
  const diff = (base, out) => norm(Object.fromEntries(uniq([...Object.keys(base), ...Object.keys(out)]).filter(k => JSON.stringify(base[k]) !== JSON.stringify(out[k])).map(k => [k, out[k] === undefined ? null : out[k]])));
  const combos = flagCombos();
  const results = {}, sources = {};
  for (const id of NARRATIVE_EVENT_IDS) {
    const current = eventById(id);
    sources[id] = { found: Boolean(current), currentHasNarrativeVariants: Boolean(current?.narrativeVariants?.length) };
    if (!current) continue;
    const legacy = clone(current); delete legacy.narrativeVariants; // 旧档快照：没有 narrativeVariants
    for (const [snapName, ev] of [['current', current], ['legacySnapshot', legacy]]) for (const flags of combos) {
      const key = `${id}|${snapName}|${JSON.stringify(flags)}`;
      results[key] = { view: intern(diff(ev, NV.resolveScenarioEventNarrative(clone(ev), flags))), replacesCanonRail: NV.narrativeVariantReplacesCanonRail(ev, flags) };
    }
  }
  // 嵌套 flag 写法与相关分歧投影
  const nested = {};
  for (const id of NARRATIVE_EVENT_IDS) {
    const ev = eventById(id); if (!ev) continue;
    const legacy = clone(ev); delete legacy.narrativeVariants;
    nested[id] = {
      nestedRefused: intern(diff(legacy, NV.resolveScenarioEventNarrative(clone(legacy), { event: { gamble_bond_signed: { refused_capture: true } } }))),
      nestedPhase: intern(diff(legacy, NV.resolveScenarioEventNarrative(clone(legacy), { world: { baihu: { gamble_refusal_phase: 'capture_ordered' } } }))),
    };
    const rel = (ev.relatedCharacterIds || [])[0];
    if (rel) {
      const div = [{ id: 'd1', eventId: 'x', worldDelta: 'b0-delta', characterStates: [{ characterId: rel, status: 'dead' }], evidence: '', sequence: 1 }];
      nested[id].divergence = { view: intern(diff(legacy, NV.resolveScenarioEventNarrative(clone(legacy), {}, div))), replacesCanonRail: NV.narrativeVariantReplacesCanonRail(legacy, {}, div) };
    }
  }
  // formatQuestCompass：s02_04 只显示目标；同一事件换 id 作对照
  const s0204 = eventById('lcq.event.s02_04');
  const rel = (s0204?.relatedCharacterIds || []);
  const compassRuntime = {
    opening: { playerCharacterId: 'liuchao.character.cheng_zongyang' },
    canon: {
      characters: [{ id: 'liuchao.character.cheng_zongyang', name: '程宗扬' }, ...rel.map((id, i) => ({ id, name: `人物${i}号` }))],
      locations: s0204?.locationId ? [{ id: s0204.locationId, name: '目标地点' }] : [],
    },
  };
  const compass = {};
  if (s0204) {
    const other = { ...clone(s0204), id: 'lcq.event.__b0_compass_contrast__' };
    for (const [name, rt] of [['emptyRuntime', {}], ['withCanon', compassRuntime], ['nullRuntime', null]]) for (const at of [undefined, s0204.locationId, NONE_LOC]) {
      compass[`s02_04|${name}|${at ?? '<undefined>'}`] = NV.formatQuestCompass(s0204, rt, at);
      compass[`contrast|${name}|${at ?? '<undefined>'}`] = NV.formatQuestCompass(other, rt, at);
    }
  }
  compass['null-event'] = NV.formatQuestCompass(null, compassRuntime, undefined);
  // storyActionPresentation：寿阳下舞都（在舞都／不在舞都／动作 id 不对／事件不对）
  const action = { eventId: 'lyl.event.han_shouyang_gaoyanei', actionId: 'descend_shouyang_to_wudu', label: '原label', playerLine: '原playerLine', extra: 1 };
  const at = loc => ({ 角色: { 位置: { locationId: loc } } });
  const actionPresentation = {
    atWudu: norm(NV.storyActionPresentation(action, at('liuchao.location.wudu'))),
    elsewhere: norm(NV.storyActionPresentation(action, at(NONE_LOC))),
    noSave: norm(NV.storyActionPresentation(action, undefined)),
    wrongAction: norm(NV.storyActionPresentation({ ...action, actionId: OFF_ACTION }, at('liuchao.location.wudu'))),
    wrongEvent: norm(NV.storyActionPresentation({ ...action, eventId: OFF_EVENT }, at('liuchao.location.wudu'))),
  };
  return { eventIds: NARRATIVE_EVENT_IDS, flagSpace: NARRATIVE_FLAGS, comboCount: combos.length, sources, views, results, nested, compass, actionPresentation };
}

// ── 7. 结局 ──
function computeEndings() {
  // endingId 探针：全书事件里出现的结局（任意层的 *.ending.* 对象 id／endingId）、战败结局表、配图表，外加一个表外 id
  const found = new Map();
  const walk = (node, eventId) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, eventId)); return; }
    for (const key of ['id', 'endingId']) if (typeof node[key] === 'string' && /\.ending\./.test(node[key])) (found.get(node[key]) || found.set(node[key], new Set()).get(node[key])).add(eventId);
    for (const v of Object.values(node)) walk(v, eventId);
  };
  for (const { event } of ALL_EVENTS) walk(event, event.id);
  const images = JSON.parse(readFileSync(new URL('mod-kit/ending-images.qingyu.json', ROOT), 'utf8'));
  const endingIds = uniq([...[...found.keys()].sort(), ...FE.BATTLE_LOSS_ENDINGS.map(e => e.endingId), ...Object.keys(images.byEndingId),
    'lcq.ending.fail.combat', /* 场面模块合同（sceneModule/contracts）的战败结局，不在关事件里 */ 'lcq.ending.__b0_not_in_table__']);
  const sourceEventIds = uniq([...[...found.values()].flatMap(s => [...s]).sort(), ...FE.BATTLE_LOSS_ENDINGS.map(e => e.sourceEventId),
    'lcq.event.ningyu_enters_gamble', 'lcq.event.wuerlang_joins', OFF_EVENT]);
  const texts = [], textIndex = new Map();
  const internText = t => { if (t === undefined) return null; if (!textIndex.has(t)) { textIndex.set(t, texts.length); texts.push(t); } return textIndex.get(t); };
  const byPair = {};
  for (const endingId of endingIds) for (const sourceEventId of sourceEventIds) {
    const ref = { endingId, sourceEventId };
    byPair[`${endingId}|${sourceEventId}`] = { canonical: EP.canonicalEndingId(ref), key: EP.endingKey(ref), image: EP.endingPresentation(ref).image, narrative: internText(quiet(() => FE.fixedEndingNarrative(ref))) };
  }
  const legacy = {};
  for (const endingId of endingIds) for (const sourceEventId of sourceEventIds) {
    const e = { endingId, sourceEventId, title: '原标题' };
    const changed = EP.migrateLegacyE01Ending(e);
    if (changed) legacy[`${endingId}|${sourceEventId}`] = norm(e);
  }
  return {
    endingIds, sourceEventIds, foundInEvents: Object.fromEntries([...found].map(([k, s]) => [k, [...s].sort()])),
    probeCount: endingIds.length * sourceEventIds.length, texts, byPair, legacyMigrations: legacy,
    undefinedRef: { canonical: EP.canonicalEndingId(undefined), key: EP.endingKey(undefined), image: EP.endingPresentation(undefined).image, narrative: FE.fixedEndingNarrative(undefined) ?? null, migrate: EP.migrateLegacyE01Ending(undefined) },
    BATTLE_LOSS_ENDINGS: norm(FE.BATTLE_LOSS_ENDINGS),
  };
}

// ── 8. 行旅定义 ──
function computeTravelDefs() {
  return {
    nanhuang: {
      NANHUANG_TRAVEL_SLICE_ID: NH.NANHUANG_TRAVEL_SLICE_ID, NANHUANG_STAGE_IDS: [...NH.NANHUANG_STAGE_IDS], NANHUANG_STEP_SCENE_STAGE_IDS: [...NH.NANHUANG_STEP_SCENE_STAGE_IDS],
      NANHUANG_AREAS: norm(NH.NANHUANG_AREAS), NANHUANG_ZONES: norm(NH.NANHUANG_ZONES), NANHUANG_ROUTES: norm(NH.NANHUANG_ROUTES),
      QINGYU_NANHUANG_DEFINITION: norm(NH.QINGYU_NANHUANG_DEFINITION),
      BIYU_POSITION_SEGMENT: NH.BIYU_POSITION_SEGMENT, BIYU_WORLD_LOCATION_ID: NH.BIYU_WORLD_LOCATION_ID, BIYU_POSITION_NODES: norm(NH.BIYU_POSITION_NODES),
    },
    wuyuan: {
      zoneConstants: Object.fromEntries(Object.entries(WZ).filter(([, v]) => typeof v === 'string')),
      WUYUAN_ZONES: norm(WZ.WUYUAN_ZONES),
      WUYUAN_OPEN_WORLD_SLICE_ID: WO.WUYUAN_OPEN_WORLD_SLICE_ID, WUYUAN_SETTLEMENT_ID: WO.WUYUAN_SETTLEMENT_ID, WUYUAN_MARKET_ARRIVAL_ID: WO.WUYUAN_MARKET_ARRIVAL_ID,
      WUYUAN_WORLD_LOCATION_ID: WO.WUYUAN_WORLD_LOCATION_ID,
      WUYUAN_OPEN_WORLD_DEFINITION: norm(WO.WUYUAN_OPEN_WORLD_DEFINITION),
      WUYUAN_PROBLEM_ACTION_JUDGEMENT: norm(WO.WUYUAN_PROBLEM_ACTION_JUDGEMENT), WUYUAN_PROBLEM_ACTION_DESCRIBE: norm(WO.WUYUAN_PROBLEM_ACTION_DESCRIBE),
    },
  };
}

// ── 10. travel/locationIds ──
function computeLocationIds() {
  const locEntries = NE.namedEntityEntries('location');
  const ids = uniq([
    ...Object.keys(LI.LOCATION_ID_ALIASES), ...Object.values(LI.LOCATION_ID_ALIASES), ...Object.keys(LI.LOCATION_PARENTS), ...Object.values(LI.LOCATION_PARENTS),
    ...Object.keys(LI.LOCATION_NAMES), ...locEntries.map(e => e.id), ...ALL_EVENTS.map(x => x.event.locationId).filter(Boolean),
  ]).sort();
  ids.push(NONE_LOC);
  const canonical = {}, ancestors = {}, country = {};
  for (const id of ids) {
    const c = LI.canonicalLocationId(id); if (c !== id) canonical[id] = c;
    const a = LI.locationAncestors(id); if (a.length) ancestors[id] = a;
    country[id] = LI.locationDescriptionWithCountry({ locationId: id, 描述: '旧大陆·某处' });
  }
  const within = {};
  for (const [child, parent] of Object.entries(LI.LOCATION_PARENTS)) {
    within[`${child}>${parent}`] = LI.locationWithin(child, parent);
    within[`${parent}>${child}`] = LI.locationWithin(parent, child);
  }
  for (const [from, to] of Object.entries(LI.LOCATION_ID_ALIASES)) within[`${from}>${to}`] = LI.locationWithin(from, to);
  const names = uniq([...Object.values(LI.LOCATION_NAMES).flatMap(e => [e.name, ...(e.displayAliases || [])]), ...locEntries.map(e => e.definition?.name).filter(n => typeof n === 'string'), '鬼王 宫', '__b0_无此地__']);
  const byName = Object.fromEntries(names.map(n => [n, LI.locationIdByRegisteredName(n)]).filter(([, v]) => v !== undefined));
  return {
    LOCATION_ID_ALIASES: { ...LI.LOCATION_ID_ALIASES }, LOCATION_PARENTS: { ...LI.LOCATION_PARENTS }, LOCATION_NAMES: norm(LI.LOCATION_NAMES),
    idProbeCount: ids.length, canonical, ancestors, country, within, nameProbeCount: names.length, byName,
    edge: { canonicalUndefined: LI.canonicalLocationId(undefined) ?? null, sameUndefined: LI.sameCanonicalLocation(undefined, 'x'), withinUndefined: LI.locationWithin(undefined, 'x') },
  };
}

// ── 11. runtime.ts 三张表（未导出：只读公开入口的可观察输出）──
// 哈希迁移：probe 输入里的 from 哈希是测试侧给的固定字面量（旧档里存的哈希）；输出钉「哪些事件会被迁移、迁到哪个哈希」。
const CONTRACT_HASH_PROBES = {
  'lcq.event.geluo_summons_biji': 'e0119be2', 'lcq.event.s02_04': 'f6f916da', 'lcq.event.huamiao_coop_boundary': 'dc6ab360', 'lcq.event.s04_01': 'fbe74510',
  'lcq.event.wuerlang_joins': 'e6c7f972', 'lcq.event.ningyu_regicide_offer': '88b5c491', 'lcq.event.rainforest_black_shoal': '112b54d3',
  'lcq.event.silent_sheyi_village': 'fa40aeb2', 'lcq.event.s03b_wanwu_night': 'd3222695', 'lcq.event.s03b_yinzhu_xiongerpu': 'c3d65b9d',
  'lcq.event.ningyu_regicide_offer_ins_ningyu_reply': 'f27676f0', 'lcq.event.guiwangdong_coop_pact_ins_ningyu_enter': 'aff4748f',
};
function computeContractRevisions() {
  const canonical = ALL_EVENTS.map(x => x.event);
  const run = (event, stateHash) => {
    const runtime = { events: [clone(event)], eventActionStates: { [event.id]: { contractHash: stateHash, attemptCount: 0, preparations: ['b0_prep'], attempts: [] } } };
    const migrated = quiet(() => RT.migrateBatch6TextContracts(runtime, canonical));
    return { migrated, stateHash: runtime.eventActionStates[event.id].contractHash };
  };
  // 全书带合同的事件：旧档快照＝现行合同，状态哈希分别取「本表 from」与「无关哈希」
  const hits = {};
  let probes = 0;
  for (const id of uniq(canonical.filter(e => e.playerCompletionContract).map(e => e.id))) {
    const ev = eventById(id);
    const fromProbe = CONTRACT_HASH_PROBES[id] || '00000000';
    const a = run(ev, fromProbe), b = run(ev, 'b0b0b0b0');
    probes += 2;
    if (a.migrated || b.migrated || a.stateHash !== fromProbe) hits[id] = { withFromHash: a, withUnrelatedHash: b };
  }
  // 旧档合同与现行不同、且哈希不在表里：不迁移
  const stale = {};
  for (const id of Object.keys(CONTRACT_HASH_PROBES)) {
    const ev = eventById(id); if (!ev) { stale[id] = 'event-missing'; continue; }
    const old = clone(ev); old.playerCompletionContract = { ...old.playerCompletionContract, actions: [...old.playerCompletionContract.actions, { id: OFF_ACTION, label: 'x' }] };
    const runtime = { events: [old], eventActionStates: { [id]: { contractHash: CONTRACT_HASH_PROBES[id], attemptCount: 0, preparations: [], attempts: [] } } };
    stale[id] = { migrated: quiet(() => RT.migrateBatch6TextContracts(runtime, canonical)), stateHash: runtime.eventActionStates[id].contractHash };
  }
  return { fromHashProbes: CONTRACT_HASH_PROBES, probeCount: probes, hits, staleContract: stale };
}
function computeS0204Guidance() {
  const routes = ['lcq.route.wuyuan.market_to_pastry_street', 'lcq.route.wuyuan.market_to_pastry_alley', 'lcq.route.wuyuan.pastry_to_market_street', '__b0_route__'];
  const actions = ['lcq.action.wuyuan.delay_and_observe', 'lcq.action.wuyuan.break_for_exit', '__b0_action__'];
  const zones = ['lcq.zone.wuyuan.pastry_shop', 'lcq.zone.wuyuan.market'];
  const save = (active, slice) => ({ 世界: { 状态: { 剧本模组: { flags: {}, activeEventIds: active ? ['lcq.event.s02_04'] : [], ...(slice ? { openWorldSlice: slice } : {}) } } } });
  const out = { inactive: RT.wuyuanS0204Guidance(save(false)) ?? null, noSlice: RT.wuyuanS0204Guidance(save(true)) ?? null, noRuntime: RT.wuyuanS0204Guidance({}) ?? null };
  let probes = 3;
  for (const zone of zones) for (const route of [...routes, null]) for (const mode of ['player', 'forced']) for (const action of [...actions, null]) {
    if (route === null && mode === 'forced') continue;
    probes++;
    const slice = { currentZoneId: zone, travelReceipts: route ? [{ routeId: route, mode }] : [], actionReceipts: action ? [{ actionId: action }] : [] };
    out[`${zone}|${route ?? '<none>'}|${route ? mode : '-'}|${action ?? '<none>'}`] = RT.wuyuanS0204Guidance(save(true, slice)) ?? null;
  }
  return { probeCount: probes, guidance: out };
}
// 同伴入队补登记（syncEarlyEncounteredCharacters，经 advanceScenarioRuntime）：只钉补进来的关系条目的 id／名字／性别／关系
function computeEarlyEncounters() {
  const events = ['lcq.event.free_ajiman', 'lcq.event.wuerlang_joins', 'lcq.event.xiaozi_first_appears'];
  const mk = (completed, attempts = {}) => ({
    角色: { 位置: { 描述: '五原' }, 属性: { 境界: { 名称: '凡人' } } }, 社交: { 关系: {}, 记忆: { 短期记忆: [] } }, 系统: { 历史: { 叙事: [] } }, 元数据: { 时间: { 年: 1, 月: 1, 日: 1, 小时: 8 } },
    世界: { 状态: { 剧本模组: { modId: 'lcq.stage_02', flags: {}, events: [], activeEventIds: [], completedEventIds: completed, eventActionStates: attempts, canon: { characters: [] } } } },
  });
  const pick = s => Object.entries(s.社交?.关系 || {}).map(([k, v]) => ({ key: k, id: v.角色ID ?? null, name: v.名字 ?? null, gender: v.性别 ?? null, relation: v.与玩家关系 ?? null }));
  const out = {};
  out.none = pick(quiet(() => RT.advanceScenarioRuntime(mk([]))).saveData);
  for (const e of events) {
    out[`completed:${e}`] = pick(quiet(() => RT.advanceScenarioRuntime(mk([e]))).saveData);
    out[`attemptSuccess:${e}`] = pick(quiet(() => RT.advanceScenarioRuntime(mk([], { [e]: { contractHash: 'x', attemptCount: 1, preparations: [], attempts: [{ outcome: 'success' }] } }))).saveData);
  }
  out.all = pick(quiet(() => RT.advanceScenarioRuntime(mk(events))).saveData);
  return { events, results: out };
}

// ── 12. 已钉表的缺口：persistentLineEntries.algaeCollected（linesPackSnapshot 只钉了 sync 与常量）──
function computeAlgae() {
  const base = () => ({ 世界: { 状态: { 剧本模组: { worldTurn: 7 } } }, 角色: { 背包: { 物品: {} } } });
  const cases = {
    noRuntime: {},
    fresh: base(),
    beatReceipt: (s => { s.世界.状态.剧本模组.questLineState = { version: 1, receipts: { [PE.ALGAE_ENTRY.beatId]: { receiptId: 'r', turn: 1, outcome: 'success' } } }; return s; })(base()),
    pathReceipt: (s => { s.世界.状态.剧本模组.pathReceipts = { [PE.ALGAE_ENTRY.receiptId]: {} }; return s; })(base()),
    transferReceipt: (s => { s.世界.状态.剧本模组.inventoryTransferReceipts = [{ itemId: PE.ALGAE_ENTRY.itemId }]; return s; })(base()),
    inventory: (s => { s.角色.背包.物品[PE.ALGAE_ENTRY.itemId] = { 数量: 1 }; return s; })(base()),
    inventoryZero: (s => { s.角色.背包.物品[PE.ALGAE_ENTRY.itemId] = { 数量: 0 }; return s; })(base()),
    unrelatedReceipt: (s => { s.世界.状态.剧本模组.pathReceipts = { 'rcpt.__b0__': {} }; return s; })(base()),
  };
  return Object.fromEntries(Object.entries(cases).map(([k, s]) => [k, { collected: PE.algaeCollected(s), questLineState: norm(s.世界?.状态?.剧本模组?.questLineState) }]));
}

export function computeResidualSnapshot() {
  return {
    baseline: '048ca74a',
    stageCount: ALL_STAGE_IDS.length,
    eventCount: ALL_EVENTS.length,
    stanceProfiles: computeStance(),
    affinityCaps: computeAffinityCaps(),
    divergenceLedger: computeDivergence(),
    playerActionPresentation: computePlayerAction(),
    branchDecision: computeBranchDecision(),
    eventNarrativeView: computeNarrative(),
    endings: computeEndings(),
    travelDefs: computeTravelDefs(),
    locationIds: computeLocationIds(),
    runtimeTables: { contractRevisions: computeContractRevisions(), s0204MapContract: computeS0204Guidance(), earlyEncounters: computeEarlyEncounters() },
    persistentLineEntriesGap: { algaeCollected: computeAlgae() },
  };
}
// ───────────── 计算口径结束 ─────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? new URL(process.argv[i + 1], `file://${process.cwd()}/`) : FIXTURE_URL;
  if (out.href === FIXTURE_URL.href && existsSync(FIXTURE_URL)) {
    console.error('夹具已存在：B0 快照只导出一次、以后不重生；要自检确定性请用 --out 导到别处。');
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(computeResidualSnapshot(), null, 1) + '\n');
  console.log('written', fileURLToPath(out));
}
