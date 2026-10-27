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

test('配置：ui.rightSidebar.showLineCompass 默认 false 已登记；story.lineCompass 地区映射与文案上限进配置', () => {
  const merged = JSON.parse(fs.readFileSync('mod-kit/game-numbers.qingyu.json', 'utf8'));
  assert.equal(merged.ui.rightSidebar.showLineCompass, false);
  assert.equal(compass.showLineCompass(), false);
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

test('下一步表：7 条国家线、只放结构；占位样例标【待剧情策划】且是 draft；validator 对仓库表无问题', () => {
  const table = compass.lineCompassTable();
  assert.deepEqual(table.lines.map(l => l.lineId).sort(), [...registry.NATION_LINE_IDS].sort());
  for (const line of table.lines) for (const step of line.steps) {
    assert.equal(step.draft, true, `${line.lineId}.${step.id} 正式文案未定，只许占位`);
    assert.ok(texts[step.hintKey].startsWith(compass.LINE_COMPASS_DRAFT_MARK), step.hintKey);
  }
  assert.ok(table.lines.reduce((n, l) => n + l.steps.length, 0) <= 3, '极少量占位样例');
  assert.deepEqual(validateLineCompassTable(table, texts), []);
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

test('当前线＝焦点事件所在国家线；表里只有占位时用主线指南针「去X · 见Y」，占位文案永不出现', () => {
  const v = view(saveOf(), KILL_WU);
  assert.equal(v.current.lineId, 'jin');
  assert.equal(v.current.source, 'focus');
  assert.equal(v.current.name, texts['lineCompass.jin.name']);
  assert.equal(v.current.step, POINTER);
  assert.ok(!JSON.stringify(v).includes(compass.LINE_COMPASS_DRAFT_MARK));
  assert.ok(!JSON.stringify(v).includes(secondary.SECONDARY_LINES.find(l => l.id === 'jin').entryHint), '不回退旧 entryHint');
});

test('焦点不在国家线上（塞外）：取编年史最近推进过、未收束的线；都没有返回 null（右栏退回原指南针）', () => {
  const recent = view(saveOf({ modId: S02 }), 'lcq.event.s02_05');
  assert.equal(recent.current.lineId, 'jin');
  assert.equal(recent.current.source, 'recent');
  assert.equal(recent.current.step, '', '不是焦点所在的线，不借焦点事件的指南针');
  // 晋的锚还没知道：焦点在晋地也不认晋（线是被知道打开的），最近推进过的也只有塞外 → 没有当前线
  const none = view(saveOf({ done: [[S02, WANGZHE]] }), KILL_WU);
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
