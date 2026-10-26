// 裸 console 守卫（日志大类开关 T2，见 docs/design/2026-10-26-日志大类开关设计稿.md §5）：
// ①非测试源码的裸 console.* 按文件计数，只许减少不许增加，新文件必须为 0（白名单出口除外）；本行或上一行 `// lcq-allow-console: 原因` 豁免
// ②debugLog / debugEnabled 的大类必须等于文件按最长前缀归到的大类，参数里不许写 LCQ- 码
// ③numbers-*.json 不许再加单功能调试开关：带 debug / 以 Log 结尾的键只许 diagnostics.debug 与 freeAction.debug 两处存量
// 冻结文件（AIBS、runtime.ts）的计数按现状记进基线，不要求改动。
// 重生成基线（只在收紧时用，审查时 diff 只许出现减少）：UPDATE_CONSOLE_BASELINE=1 node --test tests/consoleGuard.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';
import { maskSource, scriptOf } from './errorCodeCatchScan.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = path.join(root, 'tests/consoleGuard.baseline.json');
const cats = await loadTs('../src/modules/diagnostics/debugCategories.ts');

/** 可以直接调用 console 的出口（不计数、不进基线）。 */
const CONSOLE_EXITS = new Set([
  'src/modules/diagnostics/log.ts',
  'src/modules/diagnostics/debugLog.ts',
  'src/utils/consolePatch.ts',
  'src/utils/debug.ts',
]);
const FROZEN = ['src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/runtime.ts'];
const CONSOLE_METHODS = 'log|info|debug|warn|error|table|group|groupCollapsed|groupEnd|time|timeEnd|count|countReset|trace|dir';
const CONSOLE_ACCESS = new RegExp(`\\bconsole\\s*(?:\\?\\.|\\.)\\s*(?:${CONSOLE_METHODS})\\b`, 'g');
const ALLOW_CONSOLE = /lcq-allow-console:\s*\S+/;
const DEBUG_CALL = /\bdebug(?:Log|Enabled)\s*\(/g;
const CODE_LITERAL = /LCQ-[A-Za-z]+-\d+/;
/** numbers-*.json 里允许存在的调试类键（数据采集通道 playerTextLog / drainLog 经总策划审核保留）。 */
const DEBUG_KEY_ALLOWED = new Set(['diagnostics.debug', 'freeAction.debug', 'freeAction.debug.playerTextLog', 'freeAction.debug.drainLog']);
const DEBUG_KEY = key => /debug/i.test(key) || /Log$/.test(key);

/** git 跟踪的 src 下非测试源码（含未提交的新增文件），与 errorCodeGuard 同口径。 */
function sourceFiles() {
  const list = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  return list.filter(file => /\.(ts|vue|js|mjs)$/.test(file) && !/\.(test|spec)\./.test(file) && !/(^|\/)__tests__\//.test(file));
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/** 裸 console 访问（不必是调用，属性引用也算）：返回未豁免的行号；注释 / 字符串 / 模板里的不算。 */
function scanConsole(src) {
  const masked = maskSource(src), lines = src.split('\n'), hits = [];
  for (const m of masked.matchAll(CONSOLE_ACCESS)) {
    const line = lineOf(src, m.index);
    const prev = lines[line - 2] ?? '';
    const allowed = ALLOW_CONSOLE.test(lines[line - 1]) || (/^\s*(\/\/|\/\*|\*)/.test(prev) && ALLOW_CONSOLE.test(prev));
    if (!allowed) hits.push(line);
  }
  return hits;
}

/** debugLog / debugEnabled 调用：{ line, category（首参字符串字面量，没有则 null）, args（原文参数段）}；函数定义本身不算。 */
function scanDebugCalls(src) {
  const masked = maskSource(src), calls = [];
  for (const m of masked.matchAll(DEBUG_CALL)) {
    if (/\bfunction\s+$/.test(masked.slice(Math.max(0, m.index - 20), m.index))) continue;
    if (/\.\s*$/.test(masked.slice(0, m.index))) continue; // obj.debugLog(...) 不是本接口
    const open = m.index + m[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < masked.length; i++) {
      if (masked[i] === '(') depth++;
      else if (masked[i] === ')' && --depth === 0) { close = i; break; }
    }
    const args = src.slice(open + 1, close < 0 ? src.length : close);
    const category = args.match(/^\s*(['"])([\w$]+)\1\s*(?:,|$)/)?.[2] ?? null;
    calls.push({ line: lineOf(src, m.index), category, args });
  }
  return calls;
}

function currentCounts() {
  const counts = {};
  for (const file of sourceFiles()) {
    if (CONSOLE_EXITS.has(file)) continue;
    const hits = scanConsole(scriptOf(file, readFileSync(path.join(root, file), 'utf8')));
    if (hits.length) counts[file] = hits.length;
  }
  return counts;
}

test('扫描器自测：注释/字符串/模板里的 console. 不算，属性引用也算，lcq-allow-console 本行或上一行豁免', () => {
  const src = [
    "const a = 'console.log(1)'; // console.warn(x)",
    'const b = `x ${ y } console.error z`;',
    '/* console.info(1) */',
    'console.log(1);', // 4 算
    'function f(log = console.warn) {}', // 5 属性引用也算
    'const t = `${console.error(e)}`;', // 6 模板插值里是代码，算
    'console.debug(1); // lcq-allow-console: 宿主页面要求',
    '// lcq-allow-console: 上一行豁免',
    'console.table([]);',
    'x(); // lcq-allow-console: 别的行的豁免不外溢',
    'console.group("g");', // 11 上一行是代码行尾注释，不算豁免
    'myconsole.log(1); console.logger; console?.trace();', // 12 只算 console?.trace
    '// lcq-allow: 这是 catch 豁免，不等于 console 豁免',
    'console.warn(2);', // 14 算
  ].join('\n');
  assert.deepEqual(scanConsole(src), [4, 5, 6, 11, 12, 14]);
  const vue = '<template><div @click="console.log(1)">console.log</div></template>\n<script setup lang="ts">\nconsole.log(1);\n</script>\n';
  assert.deepEqual(scanConsole(scriptOf('x.vue', vue)), [3], '.vue 只扫 <script> 块，行号按整文件算');
  const calls = scanDebugCalls([
    "export function debugLog(category, msg) {}",
    "debugLog('init', 'x', () => ({ a: 1 }));",
    'if (debugEnabled("ai")) {}',
    'debugLog(cat, "LCQ-SYS-000");',
    'logger.debugLog("ui");',
  ].join('\n'));
  assert.deepEqual(calls.map(c => [c.line, c.category]), [[2, 'init'], [3, 'ai'], [4, null]]);
  assert.ok(CODE_LITERAL.test(calls[2].args));
});

test('裸 console.* 只减不增：每文件不超过基线，新文件为 0，白名单出口除外', () => {
  const current = currentCounts();
  if (process.env.UPDATE_CONSOLE_BASELINE === '1') {
    const sorted = Object.fromEntries(Object.keys(current).sort().map(file => [file, current[file]]));
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 1)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const exit of CONSOLE_EXITS) assert.ok(!(exit in baseline), `${exit} 是白名单出口，不进基线`);
  const added = Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => `${file}: ${count}（基线 ${baseline[file] ?? 0}）`);
  assert.deepEqual(added, [], '新代码用 debugLog(大类, …) 或 logEvent / logError（登记码）；宿主页面确需的输出写 // lcq-allow-console: 原因');
});

test('debugLog / debugEnabled 的大类与文件归属一致（最长前缀），大类须写字符串字面量', () => {
  const ids = new Set(cats.DEBUG_CATEGORY_IDS);
  const wrong = [];
  for (const file of sourceFiles()) {
    if (CONSOLE_EXITS.has(file)) continue;
    const expected = cats.categoryOfFile(file);
    for (const call of scanDebugCalls(scriptOf(file, readFileSync(path.join(root, file), 'utf8')))) {
      if (call.category === null) wrong.push(`${file}:${call.line} 大类不是字符串字面量`);
      else if (!ids.has(call.category)) wrong.push(`${file}:${call.line} 未知大类 ${call.category}`);
      else if (call.category !== expected) wrong.push(`${file}:${call.line} 用了 ${call.category}，文件归 ${expected}`);
    }
  }
  assert.deepEqual(wrong, [], '新功能挂到文件所在目录对应的大类（src/modules/diagnostics/debugCategories.ts）；增类须用户拍板');
});

test('debugLog 参数不带 LCQ- 码（带码事件走 logEvent / logError，不受大类开关控制）', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    for (const call of scanDebugCalls(scriptOf(file, readFileSync(path.join(root, file), 'utf8')))) {
      if (CODE_LITERAL.test(call.args)) offenders.push(`${file}:${call.line}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('不新增单功能调试开关：numbers-*.json 的 debug 类键只许 diagnostics.debug 与 freeAction.debug', () => {
  const found = [];
  const walk = (node, prefix, file) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const at = prefix ? `${prefix}.${key}` : key;
      if (DEBUG_KEY(key)) found.push({ file, at });
      if (at === 'diagnostics.debug') continue; // 大类表本身由 debugLog.test 的键集合校验管
      walk(value, at, file);
    }
  };
  const files = readdirSync(path.join(root, 'mod-kit')).filter(name => /^numbers-.*\.json$/.test(name));
  assert.ok(files.length >= 4, 'numbers-*.json 没找到');
  for (const file of files) walk(JSON.parse(readFileSync(path.join(root, 'mod-kit', file), 'utf8')), '', file);
  assert.deepEqual(found.filter(f => !DEBUG_KEY_ALLOWED.has(f.at)).map(f => `${f.file}: ${f.at}`), [], '调试输出挂到 diagnostics.debug.categories 的大类，不再单开功能开关');
  assert.deepEqual(found.map(f => f.at).sort(), [...DEBUG_KEY_ALLOWED].sort(), '存量数据采集通道 freeAction.debug.playerTextLog / drainLog 仍在');
});

test('大类清单定稿为 15 个 id，增删须改本测试并经用户拍板', () => {
  assert.deepEqual([...cats.DEBUG_CATEGORY_IDS], ['identity', 'story', 'narrative', 'freeAction', 'combat', 'npc', 'growth', 'world', 'init', 'ai', 'memory', 'save', 'content', 'ui', 'perf']);
});

test('冻结文件不要求改动：基线记录 AIBS 与 runtime 现有计数', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const current = currentCounts();
  for (const file of FROZEN) {
    assert.ok(baseline[file] > 0, `${file} 的现有计数须记进基线`);
    assert.equal(current[file], baseline[file], `${file} 是冻结文件，计数按现状记录，守卫不要求迁移`);
  }
});
