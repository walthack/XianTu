// 秦线 PR B「先钉后搬」（M5）：rail 档、界面章名、序幕章配乐搬进内容包前后输出逐项相同。
// 期望是搬迁前由旧实现导出的字面量（章名）与 tests/fixtures/qin-rail-snapshot.json（rail 档，导出一次后不再重生）。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createJiti } from 'jiti';
import { loadTs } from './loadTs.mjs';

const QIN = 'lyg.qin_xianyang';
const PROLOGUE = 'lyg.chapter.qin_xianyang_prologue';
const FALLBACK = '<<FALLBACK>>';
const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
const { CANON_RAIL_PROFILES, getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const { storyChapterTitle } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { applyLoadRepairs } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const mod = CONTENT_PACKS.stages.find(s => s.manifest.id === QIN);
const snapshot = JSON.parse(readFileSync(new URL('./fixtures/qin-rail-snapshot.json', import.meta.url), 'utf8'));

/** 搬迁前旧实现对秦关每个事件的输出（fallback 为哨兵串）。 */
const EXPECTED_TITLES = {
  'liuchao.event.qin_hook_fangshi_rumor': FALLBACK,
  'liuchao.event.qin_enter_xianyang': FALLBACK,
  'liuchao.event.qin_entry_envoy': FALLBACK,
  'liuchao.event.qin_find_xu': FALLBACK,
  'liuchao.event.qin_entry_camp': FALLBACK,
  'liuchao.event.qin_king_refuses': FALLBACK,
  'liuchao.event.qin_xu_auspice': FALLBACK,
  'liuchao.event.qin_yu_sisters_refuge': '年节封宫',
  'liuchao.event.qin_new_year_banquet': '年节封宫',
  'liuchao.event.qin_palace_sealed': '年节封宫',
  'liuchao.event.qin_succession_fight': '年节封宫',
  'liuchao.event.qin_purge_hunted': '清洗',
  'liuchao.event.qin_yu_sisters_act2': '清洗',
  'liuchao.event.qin_heimohai_message': '清洗',
  'liuchao.event.qin_ningyu_coldtrace': '清洗',
  'liuchao.event.qin_xiaoling_villa': '清洗',
  'liuchao.event.qin_bo_family': '清洗',
  'liuchao.event.qin_close_default': '掌秦',
};

function start(source = mod) {
  const progress = rtm.createScenarioProgress(source);
  Object.assign(progress, { flags: { ...source.scenario.initialFlags, 'line.nanhuang.outcome': 'resolved' }, worldTurn: 0, modId: source.manifest.id,
    currentChapterId: rtm.getInitialScenarioChapterId(source), nextStageId: 'NEXT' });
  const save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  rtm.getCurrentStoryEventActions(save); // 当前拍的动作状态（含 contractHash）在取动作时才落进 runtime
  return save;
}

test('秦：关内每个事件的界面章名与搬迁前逐项相同（含回退）', () => {
  assert.deepEqual(mod.scenario.events.map(e => e.id).sort(), Object.keys(EXPECTED_TITLES).sort());
  for (const [eventId, title] of Object.entries(EXPECTED_TITLES)) {
    assert.equal(storyChapterTitle(QIN, eventId, FALLBACK), title, eventId);
  }
  // 口信拍注入到出发关里演时，章名仍取秦关的章
  assert.equal(storyChapterTitle('lyg.changgan_begins', 'liuchao.event.qin_hook_fangshi_rumor', FALLBACK), '咸阳传闻');
});

test('秦：序幕章配乐解析为 court', async () => {
  // musicLibrary 直接 import mp3，node 下无法加载：把 mp3 import 换成字符串常量后从临时目录加载（其余 import 走 @ 别名）
  const source = readFileSync(new URL('../src/utils/musicLibrary.ts', import.meta.url), 'utf8');
  let stubbed = 0;
  const patched = source.replace(/^import (\w+) from '(@\/assets\/music\/[^']+\.mp3)';$/gm, (_, name, path) => { stubbed++; return `const ${name} = '${path}';`; });
  assert.ok(stubbed > 0);
  assert.doesNotMatch(patched, /^import .*\.mp3';$/m);
  const dir = mkdtempSync(join(tmpdir(), 'qin-music-'));
  try {
    const file = join(dir, 'musicLibrary.ts');
    writeFileSync(file, patched);
    const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
    const { resolveMusicMoodForChapter, resolveMusicMoodForScenario } = await jiti.import(file);
    assert.equal(resolveMusicMoodForChapter(PROLOGUE), 'court');
    assert.equal(resolveMusicMoodForScenario(PROLOGUE, []), 'court');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('秦：rail 档与搬迁前快照深相等（文案为解析后的字符串）', () => {
  const profile = getCanonRailProfile({ modId: QIN });
  assert.deepEqual(JSON.parse(JSON.stringify(profile)), snapshot);
  assert.equal(snapshot.orderedEventIds.length, 14);
  assert.deepEqual(JSON.parse(JSON.stringify(CANON_RAIL_PROFILES.find(p => p.modId === QIN))), snapshot);
});

test('rail 档：数组长度等于 modId 去重数（包与 TS 不重复登记）', () => {
  assert.equal(CANON_RAIL_PROFILES.length, new Set(CANON_RAIL_PROFILES.map(p => p.modId)).size);
});

test('M1：存档里烘焙的事件没有 presentation 时，章名仍按 catalog 给出', () => {
  const save = start();
  const rt = save.世界.状态.剧本模组;
  assert.ok(rt.events.length >= Object.keys(EXPECTED_TITLES).length);
  for (const event of rt.events) delete event.presentation;
  for (const event of rt.events) {
    if (!(event.id in EXPECTED_TITLES)) continue;
    assert.equal(storyChapterTitle(rt.modId, event.id, FALLBACK), EXPECTED_TITLES[event.id], event.id);
  }
});

test('M1：事件加 presentation.uiChapterId 不进合同哈希；旧形状存档读入不重建动作状态', () => {
  // 新数据：每个事件都带 uiChapterId；旧档：烘焙的事件没有 presentation
  const withUi = structuredClone(mod);
  for (const event of withUi.scenario.events) event.presentation = { ...(event.presentation || {}), uiChapterId: PROLOGUE };
  const stripped = structuredClone(mod);
  for (const event of stripped.scenario.events) delete event.presentation;
  const a = start(withUi).世界.状态.剧本模组;
  const b = start(stripped).世界.状态.剧本模组;
  const hashes = rt => Object.fromEntries(Object.entries(rt.eventActionStates || {}).map(([id, s]) => [id, s.contractHash]));
  assert.ok(Object.keys(hashes(a)).length > 0);
  assert.deepEqual(hashes(a), hashes(b));

  // 旧形状存档：当前拍已有进度，去掉 presentation 后读档 + 推进，动作状态原样保留
  const save = start();
  const rt = save.世界.状态.剧本模组;
  for (const event of rt.events) delete event.presentation;
  const [eventId] = Object.keys(rt.eventActionStates);
  rt.eventActionStates[eventId].attemptCount = 1;
  rt.eventActionStates[eventId].preparations = ['pinned_progress'];
  const before = structuredClone(rt.eventActionStates);
  applyLoadRepairs(save);
  const after = rtm.advanceScenarioRuntime(save).saveData.世界.状态.剧本模组;
  assert.deepEqual(after.eventActionStates[eventId], before[eventId]);
  for (const [id, state] of Object.entries(before)) assert.equal(after.eventActionStates[id]?.contractHash, state.contractHash, id);
});
