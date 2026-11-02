// REPORT-8091-f9737e0d 复测修复回归。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  './characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const load = p => jiti.import(new URL('../src/' + p, import.meta.url).pathname);
const R = await load('modules/scenarioMods/runtime.ts');
const NI = await load('modules/scenarioMods/naturalIntentRouter.ts');
const { parseScenarioMod } = await load('modules/scenarioMods/validator.ts');
const init = await load('modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await load('utils/dataRepair.ts');
const rt = s => s.世界.状态.剧本模组;
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

// ───────────── P1 新开档 s01_03「受伤军士」不结算 ─────────────
// 「入六朝」新档：s01_01/s01_02 正常，s01_03 二十多回合不结算。真机驱动是把建议原句填进输入框再发送（按钮选择没带上），
// 走的是手打文字解析：建议原句「我上前查看那位伤者。」不含该拍任何作者短语（查看伤者/扶住伤者…），永远对不上。
// s01_01 的原句恰好命中短语、s01_02 靠 4 回合场外时钟到点结清，所以只在 s01_03（没有场外时钟）卡死。
// 与 3285eece / f9737e0d 无关：建议原句、s01_03 短语与 resolveStoryEventActionFromPlayerText 在两提交前（4c8245a5）就是这样。
const liuchaoNewGameAt = eventId => quiet(() => {
  const mod = parseScenarioMod(json('src/modules/scenarioMods/builtins/data/lcq.stage_01.json'));
  let s = R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mod))).saveData;
  for (let i = 0; i < 20 && !rt(s).activeEventIds.includes(eventId); i++) {
    const [a] = R.getCurrentStoryEventActions(s);
    if (a?.source === 'event_engine') R.recordStoryEventStructuredAction(s, a);
    s = R.advanceScenarioRuntime(s).saveData;
  }
  assert.ok(rt(s).activeEventIds.includes(eventId), eventId);
  return s;
});

test('P1 s01_03：手打/填入建议原句与点按建议同样结算（复现：旧解析对不上原句）', () => {
  const s = liuchaoNewGameAt('lcq.event.s01_03');
  const [suggested] = R.getCurrentStoryEventActions(s);
  assert.equal(suggested.playerLine, '我上前查看那位伤者。');
  assert.equal(R.resolveStoryEventActionFromPlayerText(structuredClone(s), suggested.playerLine), undefined, '复现：作者短语对不上建议原句');
  const typed = NI.resolveStoryEventActionFromText(s, suggested.playerLine);
  assert.equal(typed?.eventId, 'lcq.event.s01_03');
  assert.equal(typed?.actionId, suggested.actionId);
  // 标点/空白不同也算同一句；不是原句的照旧走作者短语，否定优先不变。
  assert.equal(NI.resolveStoryEventActionFromText(s, ' 我上前查看那位伤者 ')?.actionId, suggested.actionId);
  assert.equal(NI.resolveStoryEventActionFromText(s, '我扶住伤者')?.actionId, suggested.actionId);
  assert.equal(NI.resolveStoryEventActionFromText(s, '我转身离开，不管伤兵'), undefined);
  const settled = quiet(() => R.recordStoryEventStructuredAction(s, typed));
  assert.equal(settled.completed, true);
  const next = quiet(() => R.advanceScenarioRuntime(s).saveData);
  assert.ok(rt(next).completedEventIds.includes('lcq.event.s01_03'));
});

test('P1 通用：入六朝 s01 各拍建议原句手打都能对上本拍（s01_02/06 原句同样不在作者短语里）', () => {
  for (const id of ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_06']) {
    const s = liuchaoNewGameAt(id);
    const actions = R.getCurrentStoryEventActions(s).filter(a => a.eventId === id);
    assert.ok(actions.length, id);
    for (const a of actions) assert.equal(NI.resolveStoryEventActionFromText(s, a.playerLine)?.actionId, a.actionId, `${id} ${a.playerLine}`);
  }
});

test('P1 发送入口：自然意图别名与发送兜底都用认原句的解析', () => {
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /resolveFromText: resolveStoryEventActionFromText,/);
  assert.match(panel, /scenarioSaveAtSend \? resolveStoryEventActionFromText\(scenarioSaveAtSend, userMessage\)/);
  assert.doesNotMatch(panel, /resolveStoryEventActionFromPlayerText/);
});

