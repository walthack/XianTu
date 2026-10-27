// 右栏「当前线」卡（右栏线入口复用分析 2026-10-27 §5；用户 2026-10-27 09:26 定 Q1/Q2/Q4/Q6，总策划定 Q5/Q7/Q8/Q10）。
// 当前线＝焦点事件所在国家线，否则编年史里最近推进过、未收束的线；没有就退回主线指南针。下一步表只许账本路径、传存档求值；
// 缺键记 LCQ-PCK-005 不出这一步，绝不回退旧 entryHint；【待剧情策划】占位不进玩家可见。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const { validateLineCompassTable } = await loadTs('../src/modules/scenarioMods/validator.ts');
const secondary = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const entry = await loadTs('../src/modules/scenarioMods/secondaryLineEntry.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const store = await loadTs('../src/modules/diagnostics/store.ts');
const texts = packs.CONTENT_PACKS.texts;

const S02 = 'lcq.stage_02', S07 = 'lcq.stage_07_qingyuan_jiankang', TQ = 'lyl.taiquan_sacred_fruit';
const WANGZHE = 'lcq.event.s02_01';            // 太泉锚（王哲托付）
const JIN_ANCHOR = 'lcq.event.palace_haunting_rumor';
const OLD_CASE = 'lcq.event.s07_01_old_case', KILL_WU = 'lcq.event.s07_02_kill_wu', XIAOZI = 'lcq.event.s07_03_xiaozi_appears';
const chronicleEntry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });

/** 只有跨关账的存档：done＝编年史 [stageId, eventId]，本关 completedEventIds 为空（切关后的样子）。 */
const saveOf = ({ modId = S07, done = [[S02, WANGZHE], [S07, JIN_ANCHOR]], flags = {}, realm = { 名称: '坐照', 阶段: '初期' } } = {}) => ({
  角色: { 属性: { 境界: realm } },
  世界: { 状态: { 剧本模组: {
    modId, events: [], completedEventIds: [], flags: structuredClone(flags), acquaintances: {},
    chronicle: done.map(([stageId, eventId], i) => chronicleEntry(stageId, eventId, i + 1)),
  } } },
});
const POINTER = '去建康 · 见某人';
const view = (save, focusEventId, extra = {}) => compass.lineCompassView(save, { focusEventId, compassPointer: () => POINTER, ...extra });
const quiet = fn => { const saved = { warn: console.warn, error: console.error, info: console.info }; console.warn = console.error = console.info = () => {}; try { return fn(); } finally { Object.assign(console, saved); } };
const pck005 = () => store.logStore.recent(500).filter(e => e.code === 'LCQ-PCK-005' && e.detail?.source === 'lineCompass');

test('配置：ui.rightSidebar.showLineCompass 默认 true 已登记（用户 2026-10-27 08:57 定改完后不再隐藏）；story.lineCompass 地区映射与文案上限进配置', () => {
  const merged = JSON.parse(fs.readFileSync('mod-kit/game-numbers.qingyu.json', 'utf8'));
  assert.equal(merged.ui.rightSidebar.showLineCompass, true);
  assert.equal(merged.ui.rightSidebar.showSecondaryLines, false, '「可投的门路」仍隐藏');
  assert.equal(compass.showLineCompass(), true);
  assert.ok(registry.FIELD_SPECS.some(s => s.path === 'ui.rightSidebar.showLineCompass' && s.kind === 'bool' && s.required && s.section === 'runtime'));
  for (const path of ['story.lineCompass.regionLines', 'story.lineCompass.hint.maxChars', 'story.lineCompass.hint.bannedWords']) assert.ok(registry.FIELD_SPECS.some(s => s.path === path), path);
  const regionLines = numbers.GAME_NUMBERS.story.lineCompass.regionLines;
  assert.deepEqual(Object.values(regionLines).sort(), ['han', 'jin', 'nanhuang', 'song', 'taiquan', 'tang']);
  assert.equal(regionLines['塞外'], undefined, '塞外不是国家线');
  const tree = structuredClone(merged);
  tree.story.lineCompass.regionLines['塞外'] = 'saiwai';
  assert.ok(registry.validateAgainstRegistry(tree).some(e => e.includes('story.lineCompass.regionLines.塞外')));
  assert.equal(compass.lineOfStage(S07), 'jin');
  assert.equal(compass.lineOfStage(S02), undefined);
  assert.equal(compass.lineOfStage('lyl.taiquan_sacred_fruit'), 'taiquan');
});

test('下一步表：7 条国家线、写入剧情策划定稿 63 条（R-8 合并 5 对同文后 58 条，R-15 删南荒 nh_leave_for_jin 后 57 条，五线补全·唐 T20 给 tang_d7_publish 补文案后 58 条）；没有占位；pending 步与线级 knownWhen 按拍板；validator 对仓库表无问题', () => {
  const table = compass.lineCompassTable();
  assert.deepEqual(table.lines.map(l => l.lineId).sort(), [...registry.NATION_LINE_IDS].sort());
  const steps = table.lines.flatMap(l => l.steps.map(step => ({ lineId: l.lineId, ...step })));
  assert.ok(!steps.some(step => step.draft), '定稿后不留【待剧情策划】占位');
  const hinted = steps.filter(step => step.hintKey);
  assert.equal(hinted.length, 58, '定稿 63 条，R-8 删掉 5 行同文的「见过」版，R-15 删掉南荒 nh_leave_for_jin，唐 T20 补 tang_d7_publish「在长安城里留意朝廷动静」');
  const perLine = Object.fromEntries(table.lines.map(l => [l.lineId, l.steps.filter(step => step.hintKey).length]));
  assert.deepEqual(perLine, { nanhuang: 10, jin: 8, song: 10, han: 9, tang: 7, qin: 8, taiquan: 6 });
  for (const step of hinted) {
    assert.equal(step.hintKey, `lineCompass.${step.lineId}.step.${step.id}`);
    assert.ok([...texts[step.hintKey]].length <= numbers.GAME_NUMBERS.story.lineCompass.hint.maxChars, step.hintKey);
  }
  assert.equal(texts['lineCompass.jin.step.palace_ask'], '在建康打听宫里最近有什么事', 'P-14');
  assert.equal(texts['lineCompass.song.step.song_guangyang_skip_jin'], '打听月霜的下落', '宋跳过晋入口（用户定）');
  assert.equal(texts[compass.LINE_COMPASS_RETURN_KEY], '回到{地点}看看');
  // pending：仓库没有的事件，本次不新建；运行时跳过，note 写缺什么
  // 汉 6 步（四个入口、云如瑶卖饼、霍府别院）已于 2026-10-28 改挂新建事件、去 pending（五线补全·汉 H1／H2／H6）
  // 唐 6 步（两个入口、遇廖周袁、D7 委任／密约／公布）已于 2026-10-28 改挂事件、去 pending（五线补全·唐 T1／T2／T18／T19／T20）
  const pending = steps.filter(step => step.pending).map(step => `${step.lineId}.${step.id}`);
  assert.deepEqual(pending, [
    ...table.lines.find(l => l.lineId === 'qin').steps.map(step => `qin.${step.id}`),
    'taiquan.tq_enter_array', 'taiquan.tq_xionggu_key', 'taiquan.tq_xuanyuan_mijing',
  ]);
  for (const step of steps.filter(step => step.pending)) assert.ok(step.note?.includes('pending：'), `${step.lineId}.${step.id}`);
  for (const step of steps.filter(step => step.lineId === 'qin')) assert.match(step.eventId, /^liuchao\.event\.qin_/, '秦线事件命名空间（P-08）');
  // 线级：晋读 s02_01；宋汉唐与南荒读序幕收束；秦读派生读取点
  const known = id => table.lines.find(l => l.lineId === id).knownWhen;
  assert.deepEqual(known('jin'), [{ path: 'done.lcq.event.s02_01', operator: 'eq', value: true }]);
  for (const id of ['nanhuang', 'song', 'han', 'tang']) assert.deepEqual(known(id), [{ path: 'done.lcq.event.sudaji_south_pact', operator: 'eq', value: true }], id);
  assert.deepEqual(known('qin'), [{ path: 'compass.anyLineClosed', operator: 'eq', value: true }]);
  assert.deepEqual(validateLineCompassTable(table, texts, compass.lineCompassPlaces()), []);
  // 势力线、商道不进表（Q3/Q4）
  for (const id of ['heimohai', 'xingyuehu', 'taiyi', 'commerce']) assert.ok(!table.lines.some(l => l.lineId === id || l.anchorLine === id), id);
});

test('validator：只许账本路径、国家线、文案在 texts、正式文案守 §4 口径（定性词、字数、占位标记）', () => {
  const base = () => ({ version: 1, lines: [{ lineId: 'jin', nameKey: 'n', anchorLine: 'jin', steps: [{ id: 'a', hintKey: 'k' }] }] });
  const t = { n: '晋国', k: '去建康，打听宫里最近有什么事' };
  const codes = (table, tx = t) => validateLineCompassTable(table, tx).map(i => i.code);
  assert.deepEqual(codes(base()), [], '用户例 ✓ 句合规');
  assert.ok(codes(base(), { ...t, k: '去建康打听宫里的怪事' }).includes('hint_spoiler_word'), '用户例 ✗ 句：「怪事」是定性');
  assert.ok(codes(base(), { ...t, k: '去建康城里四处走走看看，打听一下宫里最近到底有什么事情' }).includes('hint_too_long'));
  assert.ok(codes(base(), { ...t, k: '【待剧情策划】去建康' }).includes('draft_text'));
  assert.ok(codes(base(), { n: '晋国' }).includes('missing_text'));
  const flagsPath = base(); flagsPath.lines[0].steps[0].when = [{ path: 'flags.x', operator: 'eq', value: true }];
  assert.ok(codes(flagsPath).includes('ledger_only'));
  const unlockOk = base(); unlockOk.lines[0].steps[0].when = [{ path: 'unlock.taiquan', operator: 'eq', value: true }];
  assert.deepEqual(codes(unlockOk), [], '求值传存档，unlock.* 可用');
  const badRef = base(); badRef.lines[0].steps[0].until = [{ path: 'done.no.such.event', operator: 'eq', value: true }];
  assert.ok(codes(badRef).includes('missing_reference'));
  const sect = base(); sect.lines[0].lineId = 'heimohai';
  assert.ok(codes(sect).includes('invalid_enum'), '势力线不单独上卡');
  const dup = base(); dup.lines.push(structuredClone(dup.lines[0]));
  assert.ok(codes(dup).includes('duplicate_id'));
  const draft = base(); draft.lines[0].steps[0].draft = true;
  assert.ok(codes(draft).includes('draft_unmarked'));
  assert.deepEqual(codes(draft, { ...t, k: '【待剧情策划】随便写' }), []);
  const empty = base(); empty.lines[0].steps[0] = { id: 'a' };
  assert.ok(codes(empty).includes('required_value'));
  const badEvent = base(); badEvent.lines[0].steps[0].eventId = 'lcq.event.nope';
  assert.ok(codes(badEvent).includes('missing_reference'));
  const anchor = base(); anchor.lines[0].anchorLine = 'nope';
  assert.ok(codes(anchor).includes('missing_reference'));
});

test('当前线＝焦点事件所在国家线；下一步按表取（没走南荒的存档：入口兜底句），占位文案永不出现', () => {
  const v = view(saveOf(), KILL_WU);
  assert.equal(v.current.lineId, 'jin');
  assert.equal(v.current.source, 'focus');
  assert.equal(v.current.name, texts['lineCompass.jin.name']);
  assert.equal(v.current.step, '去建康，找门路做生意');
  // 焦点正好是入口那一拍 → 主线指南针
  assert.equal(view(saveOf(), 'lcq.event.s07_00c_arrive_jiankang').current.step, POINTER);
  assert.ok(!JSON.stringify(v).includes(compass.LINE_COMPASS_DRAFT_MARK));
  assert.ok(!JSON.stringify(v).includes(secondary.SECONDARY_LINES.find(l => l.id === 'jin').entryHint), '不回退旧 entryHint');
});

test('焦点不在国家线上（塞外）：取编年史最近推进过、未收束的线；都没有返回 null（右栏退回原指南针）', () => {
  const recent = view(saveOf({ modId: S02 }), 'lcq.event.s02_05');
  assert.equal(recent.current.lineId, 'jin');
  assert.equal(recent.current.source, 'recent');
  assert.equal(recent.current.step, '去建康，找门路做生意', '不是焦点所在的线，不借焦点事件的指南针，按表出入口句');
  // 晋还没知道（王哲锦囊 s02_01 之前，用户定 P-02）：焦点在晋地也不认晋（线是被知道打开的）→ 没有当前线
  const none = view(saveOf({ done: [] }), KILL_WU);
  assert.equal(none.current, null);
});

test('已收束的线卡片和折叠行都撤（Q6）；判定只读跨关账（本关 completedEventIds 为空）', () => {
  const s = saveOf({ flags: { 'line.jin.outcome': 'resolved' } });
  assert.deepEqual(s.世界.状态.剧本模组.completedEventIds, []);
  const v = view(s, KILL_WU);
  assert.notEqual(v.current?.lineId, 'jin');
  assert.ok(!v.others.some(o => o.lineId === 'jin'));
});

test('别处还有事：只列已知未收束的线名；太泉没解锁时灰显，标题与缺项句复用 secondaryLineEntryView 锁定分支', () => {
  const s = saveOf({ done: [[S02, WANGZHE], [S07, JIN_ANCHOR], ['lcq.stage_10_jiangzhou_shadow_war', 'lcq.event.s10_01_jiangzhou_order']], realm: { 名称: '入微' } });
  const v = view(s, KILL_WU);
  assert.equal(v.current.lineId, 'jin');
  const tq = v.others.find(o => o.lineId === 'taiquan');
  const locked = entry.secondaryLineEntryView(secondary.SECONDARY_LINES.find(l => l.id === 'taiquan'), s);
  assert.equal(locked.locked, true);
  assert.deepEqual(tq, { lineId: 'taiquan', name: locked.title, locked: true, hintLines: locked.hintLines });
  assert.ok(tq.hintLines.length > 0);
  const song = v.others.find(o => o.lineId === 'song');
  assert.deepEqual(song, { lineId: 'song', name: texts['lineCompass.song.name'], locked: false, hintLines: [] }, '展开只列线名，不写提示');
  assert.ok(!v.others.some(o => ['han', 'tang', 'qin', 'nanhuang'].includes(o.lineId)), '未知的线不进折叠行');
});

test('太泉：没解锁不当当前线；走进太泉节点（追认解锁）后才成为当前线', () => {
  const lockedSave = saveOf({ modId: TQ, done: [[S02, WANGZHE], [S07, JIN_ANCHOR]], realm: { 名称: '入微' } });
  const locked = view(lockedSave, 'lyl.event.taiquan_sacred_fruit_11');
  assert.equal(locked.current.lineId, 'jin', '焦点在太泉关但没解锁 → 退到最近推进过的晋');
  assert.ok(locked.others.find(o => o.lineId === 'taiquan').locked);
  const entered = view(saveOf({ modId: TQ, done: [[S02, WANGZHE], [S07, JIN_ANCHOR], [TQ, 'lyl.event.taiquan_sacred_fruit_10']], realm: { 名称: '入微' } }), 'lyl.event.taiquan_sacred_fruit_11');
  assert.equal(entered.current.lineId, 'taiquan');
  assert.equal(entered.current.name, texts['lineCompass.taiquan.name']);
  assert.ok(!entered.others.some(o => o.lineId === 'taiquan'));
});

test('下一步：按顺序取第一条 when 满足、未过的一步；正好是焦点事件用指南针；when 传存档读 unlock.*；占位、非账本路径不出', () => {
  const table = { version: 1, lines: [{ lineId: 'jin', nameKey: 'n.jin', anchorLine: 'jin', steps: [
    { id: 'z', draft: true, hintKey: 'k.z' },
    { id: 'f', hintKey: 'k.f', when: [{ path: 'flags.anything', operator: 'eq', value: true }] },
    { id: 'u', hintKey: 'k.u', when: [{ path: 'unlock.taiquan', operator: 'eq', value: true }] },
    { id: 'a', hintKey: 'k.a', until: [{ path: `done.${OLD_CASE}`, operator: 'eq', value: true }] },
    { id: 'b', eventId: KILL_WU, hintKey: 'k.b' },
  ] }] };
  const tx = { 'n.jin': '晋', 'k.z': '【待剧情策划】占位', 'k.f': '不该出', 'k.u': '去苍澜看看', 'k.a': '去清远看看', 'k.b': '去问问这件事' };
  const at = (done, focus, extra = {}) => view(saveOf({ done: [[S02, WANGZHE], [S07, JIN_ANCHOR], ...done], ...extra }), focus, { table, texts: tx }).current.step;
  const flags = { 'line.song.outcome': 'resolved' };
  assert.equal(at([], XIAOZI, { flags: { ...flags, anything: true } }), '去苍澜看看', '太泉已解锁（坐照＋一条收束）：unlock.* 读得到存档');
  assert.equal(at([], XIAOZI, { realm: { 名称: '入微' } }), '去清远看看', '没解锁 → 跳过 u；flags.* 不是账本路径 → 跳过 f');
  assert.equal(at([[S07, OLD_CASE]], KILL_WU, { realm: { 名称: '入微' } }), POINTER, '这一步正好是焦点事件 → 指南针');
  assert.equal(at([[S07, OLD_CASE]], XIAOZI, { realm: { 名称: '入微' } }), '去问问这件事');
  assert.equal(at([[S07, OLD_CASE], [S07, KILL_WU]], XIAOZI, { realm: { 名称: '入微' } }), POINTER, '表里没有可用的一步、当前线是焦点所在的线 → 指南针');
});

test('缺键记 LCQ-PCK-005 并不出这一步（同一键只记一次），绝不回退旧 entryHint', () => {
  const table = { version: 1, lines: [{ lineId: 'jin', nameKey: 'n.jin', anchorLine: 'jin', steps: [{ id: 'a', hintKey: 'k.gone' }] }] };
  log.resetLogState();
  const v = quiet(() => { view(saveOf(), XIAOZI, { table, texts: { 'n.jin': '晋' } }); return view(saveOf(), XIAOZI, { table, texts: { 'n.jin': '晋' } }); });
  assert.equal(v.current.lineId, 'jin');
  assert.equal(v.current.step, '');
  const hits = pck005();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.textKey, 'k.gone');
  assert.equal(hits[0].detail.lineId, 'jin');
  assert.equal(hits[0].level, 'warn');
  log.resetLogState();
});

// ── 2026-10-27 定稿写入：派生读取点、pending、通用句、R-6 ──
const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const dbg = await loadTs('../src/modules/diagnostics/debugLog.ts');
const PACT = 'lcq.event.sudaji_south_pact';
const CLOSERS = { nanhuang: ['lcq.stage_05b', 'lcq.event.s05b_wuer_suli_depart'], jin: ['lcq.stage_09_trade_and_escape', 'lcq.event.s09_10_separation'], song: [TQ, 'lyl.event.taiquan_sacred_fruit_06'], han: ['lyg.mijing_rumen', 'lyg.event.s02_09'], tang: ['lyg.buddhist_conspiracy', 'lyg.event.buddhist_conspiracy_11_beat'] };
const ANY_CLOSED = { path: 'compass.anyLineClosed', operator: 'eq', value: true };
const rtOf = save => save.世界.状态.剧本模组;

test('R-3 compass.anyLineClosed：南荒／晋／宋／汉／唐任一 closedWhen 成立或 line.*.outcome 有档为 true；太泉、秦不算；计入的线进配置', () => {
  assert.deepEqual(ledger.parseLedgerPath('compass.anyLineClosed'), { kind: 'compass', id: 'anyLineClosed' });
  assert.equal(ledger.parseLedgerPath('compass.nope').invalid, true);
  assert.deepEqual(ledger.LEDGER_OPERATORS.compass, ['eq', 'neq']);
  assert.deepEqual(numbers.GAME_NUMBERS.story.lineCompass.anyLineClosed.lineIds, ['nanhuang', 'jin', 'song', 'han', 'tang']);
  assert.ok(registry.FIELD_SPECS.some(s => s.path === 'story.lineCompass.anyLineClosed.lineIds'));
  const tree = JSON.parse(fs.readFileSync('mod-kit/game-numbers.qingyu.json', 'utf8'));
  tree.story.lineCompass.anyLineClosed.lineIds.push('taiquan');
  assert.ok(registry.validateAgainstRegistry(tree).some(e => e.includes('anyLineClosed.lineIds')), '太泉不计入');
  const holds = save => ledger.evaluateLedgerCondition(ANY_CLOSED, rtOf(save), save);
  assert.equal(holds(saveOf()), false);
  for (const [lineId, [stage, eventId]] of Object.entries(CLOSERS)) assert.equal(holds(saveOf({ done: [[S02, WANGZHE], [stage, eventId]] })), true, lineId);
  assert.equal(holds(saveOf({ flags: { 'line.han.outcome': 'resolved' } })), true, 'line.*.outcome 有档');
  assert.equal(holds(saveOf({ done: [[S02, WANGZHE], ['lyl.taiquan_afterfall', 'lyl.event.taiquan_portal_exit']] })), false, '太泉收束不算');
  assert.equal(ledger.evaluateLedgerCondition({ ...ANY_CLOSED, operator: 'neq' }, rtOf(saveOf()), saveOf()), true);
  assert.equal(ledger.evaluateLedgerCondition({ ...ANY_CLOSED, operator: 'exists' }, rtOf(saveOf())), false, '只有 eq / neq');
});

test('R-3 秦线 knownWhen 读 compass.anyLineClosed：任一国家线收束前不出现，收束后进折叠行；秦步全是 pending，不出提示', () => {
  const before = view(saveOf(), KILL_WU);
  assert.ok(!before.others.some(o => o.lineId === 'qin'));
  const after = view(saveOf({ done: [[S02, WANGZHE], [S07, JIN_ANCHOR], CLOSERS.nanhuang] }), KILL_WU);
  assert.deepEqual(after.others.find(o => o.lineId === 'qin'), { lineId: 'qin', name: texts['lineCompass.qin.name'], locked: false, hintLines: [] });
  assert.ok(!after.others.some(o => o.lineId === 'nanhuang'), '南荒已收束撤掉');
});

test('validator：compass.* 不得进 closedWhen；pending 步允许仓库没有的事件、须写 note、不得同时 draft；非 pending 仍拒未知事件', () => {
  const base = () => ({ version: 1, lines: [{ lineId: 'qin', nameKey: 'n', knownWhen: [ANY_CLOSED], steps: [{ id: 'a', hintKey: 'k' }] }] });
  const t = { n: '秦国', k: '去咸阳看看' };
  const codes = (table, tx = t, places) => validateLineCompassTable(table, tx, places).map(i => i.code);
  assert.deepEqual(codes(base()), []);
  const closed = base(); closed.lines[0].closedWhen = [ANY_CLOSED];
  assert.ok(codes(closed).includes('compass_in_closed_when'));
  const badId = base(); badId.lines[0].knownWhen = [{ path: 'compass.whatever', operator: 'eq', value: true }];
  assert.ok(codes(badId).includes('invalid_path'));
  const pending = base(); Object.assign(pending.lines[0].steps[0], { pending: true, eventId: 'liuchao.event.qin_find_xu', when: [{ path: 'done.liuchao.event.qin_hook_fangshi_rumor', operator: 'eq', value: true }], note: 'pending：仓库无秦线事件' });
  assert.deepEqual(codes(pending), []);
  assert.ok(codes({ ...pending, lines: [{ ...pending.lines[0], steps: [{ ...pending.lines[0].steps[0], note: undefined }] }] }).includes('pending_note_required'));
  assert.ok(codes({ ...pending, lines: [{ ...pending.lines[0], steps: [{ ...pending.lines[0].steps[0], draft: true }] }] }).includes('invalid_value'));
  const shapeless = structuredClone(pending); shapeless.lines[0].steps[0].when[0].path = 'done.not an id';
  assert.ok(codes(shapeless).includes('missing_reference'));
  const notPending = structuredClone(pending); delete notPending.lines[0].steps[0].pending;
  assert.ok(codes(notPending).includes('missing_reference'), '非 pending 仍拒仓库没有的事件');
  const tooLongPending = structuredClone(pending); assert.ok(codes(tooLongPending, { ...t, k: '去咸阳城里四处走走看看，打听一下宫里最近到底有什么事情' }).includes('hint_too_long'), 'pending 文案照正式步校验');
  // 只有 eventId 的步：通用句须在 texts、代入地点后守字数
  const bare = { version: 1, lines: [{ lineId: 'jin', nameKey: 'n', anchorLine: 'jin', steps: [{ id: 'b', eventId: KILL_WU }] }] };
  assert.ok(codes(bare, { n: '晋国' }).includes('missing_text'));
  assert.deepEqual(codes(bare, { n: '晋国', [compass.LINE_COMPASS_RETURN_KEY]: '回到{地点}看看' }, { [KILL_WU]: '清远' }), []);
  assert.ok(codes(bare, { n: '晋国', [compass.LINE_COMPASS_RETURN_KEY]: '回到{地点}看看' }, { [KILL_WU]: '一二三四五六七八九十一二三四五六七' }).includes('hint_too_long'));
});

test('pending 步运行时跳过、不进玩家可见；R-4 只有 eventId 的步焦点不在此拍时「回到{地点}看看」，没有地点只显示线名并记 story 调试日志、不报错码', () => {
  const table = { version: 1, lines: [{ lineId: 'jin', nameKey: 'n.jin', anchorLine: 'jin', steps: [
    { id: 'p', pending: true, hintKey: 'k.p', note: 'pending：x' },
    { id: 'e', eventId: KILL_WU },
  ] }] };
  const tx = { 'n.jin': '晋', 'k.p': '不该出', [compass.LINE_COMPASS_RETURN_KEY]: '回到{地点}看看' };
  const at = (focus, places) => view(saveOf(), focus, { table, texts: tx, places }).current.step;
  assert.equal(at(XIAOZI, { [KILL_WU]: '清远' }), '回到清远看看');
  assert.equal(at(KILL_WU, { [KILL_WU]: '清远' }), POINTER, '焦点正好在这一拍 → 指南针');
  log.resetLogState();
  const out = [];
  numbers.applyGameNumbers({ diagnostics: { debug: { categories: { story: true } } } });
  dbg.setDebugConsole((...args) => out.push(args));
  try {
    assert.equal(at(XIAOZI, { [KILL_WU]: '' }), '', '没有地点 → 只显示线名');
  } finally {
    dbg.setDebugConsole(null);
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { story: false } } } });
  }
  assert.ok(out.some(([msg]) => msg.startsWith('[dbg:story]') && msg.includes('没有地点')), 'story 调试日志');
  assert.equal(store.logStore.recent(500).filter(e => e.detail?.source === 'lineCompass').length, 0, '不报错码');
  // 仓库表：晋 s07_08 等事件 locationId 为空 → 编译期记空串；南荒同地拍有地点名
  const places = compass.lineCompassPlaces();
  assert.equal(places['lcq.event.s07_08_palace_escape'], '');
  assert.equal(places['lcq.event.s04b_lingfei_baiyi_crisis_02'], '白夷族');
});

test('R-6：acq … lt encountered 在没有记录时为 true（等级按 0 比）；R-8 合并后兜底那行不再带 acq 条件', () => {
  const cond = { path: 'acq.liuchao.character.xu_junfang', operator: 'lt', value: 'encountered' };
  assert.equal(ledger.evaluateLedgerCondition(cond, { acquaintances: {} }), true, '无记录');
  assert.equal(ledger.evaluateLedgerCondition(cond, { acquaintances: { 'liuchao.character.xu_junfang': { kind: 'rumored' } } }), true, '只听说过');
  assert.equal(ledger.evaluateLedgerCondition(cond, { acquaintances: { 'liuchao.character.xu_junfang': { kind: 'encountered' } } }), false);
  // 防剧透通审后「见过／没见过」两版同文，按 R-8（总策划定）只留兜底那行（详见 lineCompassSpoilerAudit.test.mjs）
  const table = compass.lineCompassTable();
  const merged = (lineId, met, kept, who) => {
    const steps = table.lines.find(l => l.lineId === lineId).steps;
    assert.ok(!steps.some(s => s.id === met), met);
    assert.ok(!(steps.find(s => s.id === kept).when ?? []).some(c => c.path === `acq.liuchao.character.${who}`), kept);
  };
  merged('song', 'song_jiangzhou_war_open', 'song_jiangzhou_war_open_alt', 'xiao_yao_yi');
  merged('han', 'han_zhu_urge_luo', 'han_zhu_urge_luo_alt', 'shang_zhen_yu');
  merged('han', 'han_liujian_yuxi', 'han_liujian_yuxi_alt', 'zhao_feiyan');
  merged('qin', 'qin_entry_xu_met', 'qin_entry_xu_unmet', 'xu_junfang');
});

test('用户拍板：晋开局王哲锦囊起已知；宋汉唐南荒序幕结束起已知；宋入口按走没走过晋分两版', () => {
  const opening = view(saveOf({ modId: S02, done: [[S02, WANGZHE]] }), 'lcq.event.s02_05');
  assert.equal(opening.current, null, '还没推进过任何国家线、焦点在塞外 → 没有当前线');
  assert.ok(opening.others.some(o => o.lineId === 'jin'), '王哲锦囊之后晋即已知（折叠行）');
  assert.ok(!opening.others.some(o => ['song', 'han', 'tang', 'nanhuang'].includes(o.lineId)), '序幕结束前宋汉唐南荒未知');
  const afterPact = view(saveOf({ modId: S02, done: [[S02, WANGZHE], [S02, PACT]] }), 'lcq.event.s02_05');
  for (const id of ['song', 'han', 'tang', 'nanhuang']) assert.ok(afterPact.others.some(o => o.lineId === id), id);
  const SONG_FOCUS = 'lcq.event.s09_08_six_doors_confession';
  const S09 = 'lcq.stage_09_trade_and_escape';
  const skip = view(saveOf({ modId: S09, done: [[S02, WANGZHE], [S02, PACT]] }), SONG_FOCUS);
  assert.equal(skip.current.lineId, 'song');
  assert.equal(skip.current.step, '打听月霜的下落', '跳过晋：不点广阳');
  const fromJin = view(saveOf({ modId: S09, done: [[S02, WANGZHE], [S02, PACT], [S09, 'lcq.event.s09_05_drain_escape']] }), SONG_FOCUS);
  assert.equal(fromJin.current.step, '上岸，进附近的城看看', '走过晋：不点广阳（防剧透通审 §13.1 #5）');
});
