// 日志大类开关 T3 首批迁移样板（docs/design/2026-10-26-日志大类开关设计稿.md §T3）：
// CharacterCreation 的 [DEBUG] → init、tavern 检测日志 → ai（删 dad_debug_tavern）、战斗试玩卡片 dlog / ?debug → combat、
// runtimeTuning 提示 → content（CFG 码照记）、里程碑奖励提示 → story；consoleGuard 基线较 T2 只减不增。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), clear: () => values.clear(),
  };
}
const { loadTs } = await import('./loadTs.mjs');
const { maskSource, scriptOf } = await import('./errorCodeCatchScan.mjs');

const root = fileURLToPath(new URL('..', import.meta.url));
const read = rel => readFileSync(path.join(root, rel), 'utf8');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const cats = await loadTs('../src/modules/diagnostics/debugCategories.ts');
const dbg = await loadTs('../src/modules/diagnostics/debugLog.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');

/** T2 提交（守卫与初版基线）；本批只许在它的基础上减少。 */
const T2_COMMIT = '0da1f28c';
const CONSOLE_ACCESS = /\bconsole\s*(?:\?\.|\.)\s*(?:log|info|debug|warn|error|table|group|groupCollapsed|groupEnd|time|timeEnd|count|countReset|trace|dir)\b/g;
/** 抹掉注释与字符串后的裸 console 访问行（.vue 只看 <script>）。 */
const consoleLines = (rel) => {
  const src = scriptOf(rel, read(rel)), masked = maskSource(src), lines = src.split('\n');
  return [...masked.matchAll(CONSOLE_ACCESS)].map(m => lines[src.slice(0, m.index).split('\n').length - 1]);
};
const debugCategoriesIn = text => [...text.matchAll(/\bdebug(?:Log|Enabled)\(\s*'([\w$]+)'/g)].map(m => m[1]);

/** 改大类开关的用例必须还原；登记 sink 为调试出口，并记下直接打到 console 的调用（log.ts 打的 [LCQ-…] 错误码行不算）。 */
async function withCategories(patch, fn) {
  const before = structuredClone(numbers.GAME_NUMBERS.diagnostics);
  const saved = {}, direct = [];
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = (...args) => { if (!/^\[LCQ-/.test(String(args[0]))) direct.push([k, ...args]); }; }
  const out = [];
  await log.resetLogState();
  try {
    if (patch) numbers.applyGameNumbers({ diagnostics: { debug: { categories: patch } } });
    dbg.setDebugConsole((...args) => out.push(args));
    return await fn({ out, direct });
  } finally {
    Object.assign(console, saved);
    numbers.applyGameNumbers({ diagnostics: before });
    dbg.setDebugConsole(null);
    await log.resetLogState();
  }
}

test('CharacterCreation 不再有 [DEBUG] 裸 console 改走 init 大类', () => {
  const rel = 'src/views/CharacterCreation.vue', text = read(rel);
  assert.equal(cats.categoryOfFile(rel), 'init');
  assert.ok(!text.includes('[DEBUG]'), '模板与脚本里都不再有 [DEBUG] 前缀输出');
  assert.deepEqual(consoleLines(rel).filter(line => /DEBUG/.test(line)), []);
  const used = debugCategoriesIn(text);
  assert.ok(used.length >= 15, `迁过去的调试输出走 debugLog（现 ${used.length} 处）`);
  assert.deepEqual([...new Set(used)], ['init']);
  assert.match(text, /@click\.prevent="\(event: Event\) => \{ debugLog\('init', '开启仙途按钮被点击'\); handleNext\(event\); \}"/, '模板里的按钮点击日志也走 init');
  assert.match(text, /import \{ debugLog \} from '@\/modules\/diagnostics\/debugLog';/);
});

test('tavern 检测日志读 ai 大类且不再读 dad_debug_tavern', async () => {
  const rel = 'src/utils/tavern.ts', text = read(rel);
  assert.equal(cats.categoryOfFile(rel), 'ai');
  const srcFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => /\.(ts|vue|js|mjs)$/.test(f));
  assert.deepEqual(srcFiles.filter(f => /dad_debug_tavern|shouldDebugTavern/.test(read(f))), [], '单功能开关已删');
  assert.deepEqual([...new Set(debugCategoriesIn(text))], ['ai']);
  assert.match(text, /const debug = debugEnabled\('ai'\);/, '两处 catch 体不动（errorCodeGuard 指纹），其开关改读 ai 大类');
  // catch 外的检测日志一律走 debugLog；剩下的裸 console 只有两处 catch 体与 :158–185 的存量
  const detect = consoleLines(rel).filter(line => /Tavern检测/.test(line));
  assert.equal(detect.length, 2);
  assert.match(detect[0], /^\s*if \(debug\) console\.log\('\[Tavern检测\] ⚠️ 访问window\.top失败/);
  assert.match(detect[1], /^\s*if \(debug\) console\.log\(`\[Tavern检测\] ⚠️ 访问第\$\{i \+ 1\}层parent失败/);

  const tavern = await loadTs('../src/utils/tavern.ts');
  const hadWindow = 'window' in globalThis, savedWindow = globalThis.window;
  const fakeWindow = { location: { href: 'http://localhost/game' } };
  Object.defineProperty(fakeWindow, 'top', { get() { throw new Error('跨域'); } });
  fakeWindow.parent = fakeWindow;
  globalThis.window = fakeWindow;
  try {
    localStorage.setItem('dad_debug_tavern', '1');
    await withCategories(null, async ({ out, direct }) => {
      assert.equal(tavern.isTavernEnv(), false);
      assert.deepEqual(out, [], 'ai 大类关时旧的 dad_debug_tavern=1 不再打开检测日志');
      assert.deepEqual(direct, []);
    });
    await withCategories({ ai: true }, async ({ out, direct }) => {
      assert.equal(tavern.isTavernEnv(), false);
      assert.deepEqual(out.map(args => args[0]), [
        '[dbg:ai] [Tavern检测] 开始查找 TavernHelper...',
        '[dbg:ai] [Tavern检测] 当前window.location:',
        '[dbg:ai] [Tavern检测] 尝试访问window.top...',
        '[dbg:ai] [Tavern检测] 已到达顶层（第1层）',
        '[dbg:ai] [Tavern检测] ❌ 未找到TavernHelper',
      ]);
      assert.equal(out[1][1], 'http://localhost/game');
      assert.deepEqual(direct.map(([k, msg]) => [k, msg]), [['log', '[Tavern检测] ⚠️ 访问window.top失败（跨域）:']], 'catch 体随 ai 大类打开');
    });
  } finally {
    localStorage.removeItem('dad_debug_tavern');
    if (hadWindow) globalThis.window = savedWindow; else delete globalThis.window;
  }
});

test('战斗试玩卡片不再读 URL debug 且不再用 console.error 打调试', () => {
  const card = 'src/dev/combatTrial/CombatEncounterCard.vue', main = 'src/dev/combatTrial/main.ts';
  assert.equal(cats.categoryOfFile(card), 'combat');
  assert.equal(cats.categoryOfFile(main), 'combat');
  const cardScript = scriptOf(card, read(card));
  assert.doesNotMatch(cardScript, /URLSearchParams|location\.search|\bDEBUG\b/, '卡片不再读 ?debug');
  assert.deepEqual(consoleLines(card), [], '卡片不再用 console.error（会被记成 LCQ-SYS-000）打调试');
  assert.match(cardScript, /const dlog = \(msg: string, data\?: unknown\) => debugLog\('combat', `\[战斗卡片\] \$\{msg\}`, data\)/);
  assert.equal([...cardScript.matchAll(/\bdlog\(/g)].length, 4, 'run / step 结果 / commit 完成 / needBegin 四处照旧');
  const mainText = read(main);
  assert.deepEqual(consoleLines(main), []);
  assert.deepEqual(debugCategoriesIn(mainText), ['combat', 'combat', 'combat'], '未加载 tuning / 已应用 tuning / 已启动');
  // main.ts 的 ?debug=1 只是给 e2e 暴露 router / pinia / flow 的测试钩子，不再兼管日志
  assert.doesNotMatch(mainText, /并让战斗卡片打关键日志/);
});

test('runtimeTuning 未应用与已应用提示走 content 大类且 CFG 码照记', async () => {
  const rel = 'src/modules/sceneModule/runtimeTuning.ts';
  assert.equal(cats.categoryOfFile(rel), 'content');
  assert.deepEqual(consoleLines(rel), []);
  const tuning = await loadTs('../src/modules/sceneModule/runtimeTuning.ts');
  const resp = (status, body = '') => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
  const codes = () => storeMod.logStore.recent(50).map(e => e.code).filter(code => code.startsWith('LCQ-CFG-'));

  await withCategories(null, async ({ out, direct }) => {
    assert.deepEqual(await tuning.loadRuntimeTuning(resp(404)), { applied: false, reason: 'HTTP 404' });
    assert.deepEqual(out, [], 'content 关时不打提示');
    assert.deepEqual(codes(), ['LCQ-CFG-001'], '大类全关错误码照记');
    assert.ok(!direct.some(([k]) => k === 'debug' || k === 'info'), '不再直接 console.debug / console.info');
  });
  await withCategories({ content: true }, async ({ out, direct }) => {
    assert.deepEqual(await tuning.loadRuntimeTuning(resp(200, '{not json')), { applied: false, reason: '不是合法 JSON' });
    assert.deepEqual(out, [['[dbg:content] 【数值热改】未应用 tuning.json，使用打包内默认值：不是合法 JSON']]);
    assert.deepEqual(codes(), ['LCQ-CFG-004']);
    out.length = 0;
    assert.deepEqual(await tuning.loadRuntimeTuning(resp(200, '{}')), { applied: true });
    assert.deepEqual(out, [['[dbg:content] 【数值热改】已应用 tuning.json']]);
    assert.deepEqual(codes(), ['LCQ-CFG-004'], '成功不记错误码');
    assert.ok(!direct.some(([k]) => k === 'debug' || k === 'info'));
  });
});

test('里程碑奖励提示走 story 大类', async () => {
  const rel = 'src/modules/scenarioMods/milestoneRewards.ts';
  assert.equal(cats.categoryOfFile(rel), 'story');
  assert.deepEqual(consoleLines(rel), []);
  const { applyMilestoneRewards } = await loadTs('../src/modules/scenarioMods/milestoneRewards.ts');
  const freshSave = () => ({ 角色: { 身份: {} }, 世界: { 状态: { 剧本模组: { modId: 'lyl.luoyang_coup', flags: {} } } } });
  const stageReady = [{ type: 'stage_ready', id: 'lyl.han_palace_endgame' }];

  await withCategories(null, async ({ out, direct }) => {
    assert.equal(applyMilestoneRewards(freshSave(), stageReady).length, 1);
    assert.deepEqual(out, []);
    assert.deepEqual(direct, [], '不再直接 console.info');
  });
  await withCategories({ story: true }, async ({ out, direct }) => {
    const save = freshSave();
    const notes = applyMilestoneRewards(save, stageReady);
    assert.deepEqual(save.角色.身份.称号, ['汉国舞阳侯']);
    assert.equal(out.length, 1);
    assert.match(out[0][0], /^\[dbg:story\] \[里程碑奖励\] \S+ 完成 → 获得称号「汉国舞阳侯」（/);
    assert.ok(out[0][0].endsWith(`（${notes[0].split('：').slice(1).join('：')}）`), '说明与返回给变更记录的 note 一致');
    assert.deepEqual(direct, []);
  });
});

test('consoleGuard 基线较 T2 只减不增', () => {
  const now = JSON.parse(read('tests/consoleGuard.baseline.json'));
  const t2 = JSON.parse(execFileSync('git', ['show', `${T2_COMMIT}:tests/consoleGuard.baseline.json`], { cwd: root, encoding: 'utf8' }));
  const grown = Object.entries(now).filter(([file, count]) => !(file in t2) || count > t2[file]).map(([file, count]) => `${file}: ${count}（T2 ${t2[file] ?? 0}）`);
  assert.deepEqual(grown, [], '基线只许收紧');
  for (const file of ['src/dev/combatTrial/CombatEncounterCard.vue', 'src/dev/combatTrial/main.ts', 'src/modules/sceneModule/runtimeTuning.ts', 'src/modules/scenarioMods/milestoneRewards.ts']) {
    assert.ok(!(file in now), `${file} 已迁完，不在基线里`);
  }
  assert.ok(now['src/utils/tavern.ts'] < t2['src/utils/tavern.ts']);
  assert.ok(now['src/views/CharacterCreation.vue'] < t2['src/views/CharacterCreation.vue']);
  const sum = tree => Object.values(tree).reduce((a, b) => a + b, 0);
  assert.ok(sum(now) < sum(t2), `总数 ${sum(now)} < T2 ${sum(t2)}`);
  for (const frozen of ['src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/runtime.ts']) assert.equal(now[frozen], t2[frozen], `${frozen} 冻结，不迁`);
});
