// 错误码守卫：①源码里的 LCQ- 字面量必须在码表内 ②码表（codes.ts）与 docs/ERROR-CODES.md 互相校验 ③GATE_REASONS 与 LCQ-FA 一一对应
// ④非测试源码的 catch 必须记日志（logError/logEvent）或写 `// lcq-allow: 原因`；存量 catch 记在基线文件里，只拦新增。
// 重生成基线（仅在确认“新增”确实该放行时）：UPDATE_ERROR_CODE_BASELINE=1 node --test tests/errorCodeGuard.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';
import { maskSource, scanCatches, scriptOf } from './errorCodeCatchScan.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const codes = await loadTs('../src/modules/diagnostics/codes.ts');
const facts = await loadTs('../src/modules/scenarioMods/freeAction/facts.ts');
const { ERROR_CODES, FA_GATE_CODES, CODE_PATTERN, RETIRED_CODES, UNREGISTERED_CODE } = codes;
const BASELINE = path.join(root, 'tests/errorCodeGuard.baseline.json');

/** git 跟踪的 src 下非测试源码（含未提交的新增文件：用 ls-files + --others）。 */
function sourceFiles() {
  const list = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  return list.filter(file => /\.(ts|vue|js|mjs)$/.test(file) && !/\.(test|spec)\./.test(file) && !/(^|\/)__tests__\//.test(file));
}

function docRows() {
  const text = readFileSync(path.join(root, 'docs/ERROR-CODES.md'), 'utf8');
  const section = text.split('## 码表')[1]?.split('\n## ')[0] ?? '';
  const rows = section.split('\n').filter(line => /^\|\s*LCQ-/.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  return rows.map(([code, level, module, meaning, causes, howto, toast]) => ({ code, level, module, meaning, causes, howto, toast }));
}

// ───────────── 码表 ↔ 文档 ─────────────

test('码表每个码格式合法、不在作废名单里、含义非空', () => {
  for (const [code, spec] of Object.entries(ERROR_CODES)) {
    assert.match(code, CODE_PATTERN, code);
    assert.ok(!RETIRED_CODES.includes(code), `${code} 已作废，不得再登记（码不复用）`);
    assert.ok(['debug', 'info', 'warn', 'error'].includes(spec.level), code);
    assert.ok(spec.module && spec.meaning, code);
  }
  assert.ok(ERROR_CODES[UNREGISTERED_CODE], '兜底码 LCQ-SYS-000 必须登记');
  assert.equal(ERROR_CODES[UNREGISTERED_CODE].meaning, '未登记');
});

test('docs/ERROR-CODES.md 与 codes.ts 互相一致：码、级别、模块、含义、是否进玩家提示；每行有原因与排查办法', () => {
  const rows = docRows(), byCode = new Map(rows.map(row => [row.code, row]));
  assert.equal(byCode.size, rows.length, '文档里有重复的码');
  assert.deepEqual([...byCode.keys()].sort(), Object.keys(ERROR_CODES).sort(), '文档与 codes.ts 的码集合不一致');
  for (const [code, spec] of Object.entries(ERROR_CODES)) {
    const row = byCode.get(code);
    assert.equal(row.level, spec.level, `${code} 级别`);
    assert.equal(row.module, spec.module, `${code} 模块`);
    assert.equal(row.meaning, spec.meaning, `${code} 含义`);
    assert.equal(row.toast, spec.toast ? '是' : '否', `${code} 是否进玩家提示`);
    assert.ok(row.causes && row.howto, `${code} 缺“常见原因”或“排查办法”`);
  }
  const retired = (readFileSync(path.join(root, 'docs/ERROR-CODES.md'), 'utf8').split('## 已作废')[1] ?? '');
  for (const code of RETIRED_CODES) assert.ok(retired.includes(code), `${code} 须在文档“已作废”一节登记`);
});

test('同一族内序号不重复、不跳号后复用：每族序号从 001 起且连续（作废的码仍占位）', () => {
  const families = new Map();
  for (const code of [...Object.keys(ERROR_CODES), ...RETIRED_CODES]) {
    const [, family, seq] = code.match(/^LCQ-([A-Z]+)-(\d{3})$/);
    families.set(family, [...(families.get(family) ?? []), Number(seq)]);
  }
  for (const [family, seqs] of families) {
    const sorted = [...seqs].sort((a, b) => a - b);
    assert.equal(new Set(sorted).size, sorted.length, `${family} 有重复序号`);
    const first = family === 'SYS' ? 0 : 1;
    assert.deepEqual(sorted, sorted.map((_, i) => first + i), `${family} 序号应连续`);
  }
});

// ───────────── GATE_REASONS ↔ LCQ-FA ─────────────

test('GATE_REASONS 与 LCQ-FA 一一对应：每个原因恰好一个 FA 码，FA 码都有原因，文档含义写明原因 id', () => {
  const reasons = [...facts.GATE_REASONS];
  assert.deepEqual(Object.keys(FA_GATE_CODES).sort(), [...reasons].sort(), 'FA_GATE_CODES 的键必须等于 GATE_REASONS');
  const used = Object.values(FA_GATE_CODES);
  assert.equal(new Set(used).size, used.length, '不同闸门原因不得共用同一个码');
  const faCodes = Object.keys(ERROR_CODES).filter(code => code.startsWith('LCQ-FA-'));
  assert.deepEqual([...used].sort(), [...faCodes].sort(), 'LCQ-FA 族与闸门原因必须一一对应');
  const rows = new Map(docRows().map(row => [row.code, row]));
  for (const reason of reasons) {
    assert.ok(rows.get(FA_GATE_CODES[reason]).meaning.includes(`（${reason}）`), `${FA_GATE_CODES[reason]} 的含义须写明（${reason}）`);
  }
});

// ───────────── 源码里的 LCQ- 字面量 ─────────────

test('非测试源码里出现的 LCQ-xxx-nnn 字面量必须在码表内（含注释，防止文档提到不存在的码）', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const m of text.matchAll(/LCQ-[A-Za-z]+-\d+/g)) {
      if (!CODE_PATTERN.test(m[0]) || !(m[0] in ERROR_CODES)) offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], '未登记的错误码：先在 codes.ts 与 docs/ERROR-CODES.md 登记');
});

test('码表里的码（除兜底码）至少在源码里被用到一次：登记了不发出的码要么接入要么作废', () => {
  const all = sourceFiles().filter(file => !file.endsWith('diagnostics/codes.ts')).map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
  const faViaMap = new Set(Object.values(FA_GATE_CODES));
  const unused = Object.keys(ERROR_CODES).filter(code => code !== UNREGISTERED_CODE && !faViaMap.has(code) && !all.includes(code));
  // NET-001..003 经 NET_TIMEOUT_CODES 映射发出，源码里只有映射表本身。
  const viaTimeout = new Set(Object.values(codes.NET_TIMEOUT_CODES));
  assert.deepEqual(unused.filter(code => !viaTimeout.has(code)), []);
});

// ───────────── catch 守卫 ─────────────

test('扫描器自测：字符串 / 注释 / 正则 / 模板里的 catch 字样不算；try-catch 与 .catch 都能识别；lcq-allow 与 logError 算已处理', () => {
  const src = [
    "const a = 'catch { }'; // catch (e) { }",
    'const b = `x ${ y } catch { } z`;',
    'const re = /catch\\s*\\{/;',
    'try { f(); } catch (e) { logError("LCQ-SYS-000", e); }', //  handled
    'try { f(); } catch { /* lcq-allow: 例子 */ }', // handled
    'try { f(); } catch (e) { console.warn(e); }', // not handled
    'p.catch(() => null);', // not handled
    'p.catch(e => { logEvent({ code: "x" }); });', // handled
    '// lcq-allow: 上一行豁免',
    'try { g(); } catch {}',
  ].join('\n');
  const found = scanCatches(src);
  assert.deepEqual(found.map(f => [f.kind, f.handled]), [['try', true], ['try', true], ['try', false], ['promise', false], ['promise', true], ['try', true]]);
  assert.equal(maskSource('a = "x"; // y\nb').length, 'a = "x"; // y\nb'.length);
});

test('扫描器自测：catch 里只有 debugLog 不算已处理；lcq-allow-console 不等于 lcq-allow', () => {
  const src = [
    "try { f(); } catch (e) { debugLog('ai', '失败', () => e); }",
    'try { f(); } catch { /* lcq-allow-console: 不是 catch 豁免 */ }',
    '// lcq-allow-console: 上一行也不算',
    'try { g(); } catch {}',
    "p.catch(e => debugLog('ai', 'x', e));",
    "try { f(); } catch (e) { debugLog('ai', 'x'); logError('LCQ-SYS-000', e); }",
  ].join('\n');
  assert.deepEqual(scanCatches(src).map(f => f.handled), [false, false, false, false, true]);
});

test('catch 守卫：非测试源码新增的 catch 必须含 logError/logEvent 或 // lcq-allow: 原因（存量见基线文件）', () => {
  const current = {};
  const unhandledAt = new Map();
  for (const file of sourceFiles()) {
    for (const hit of scanCatches(scriptOf(file, readFileSync(path.join(root, file), 'utf8')))) {
      if (hit.handled) continue;
      (current[file] ||= {})[hit.fingerprint] = (current[file][hit.fingerprint] ?? 0) + 1;
      unhandledAt.set(`${file}::${hit.fingerprint}`, [...(unhandledAt.get(`${file}::${hit.fingerprint}`) ?? []), hit.line]);
    }
  }
  if (process.env.UPDATE_ERROR_CODE_BASELINE === '1') {
    const sorted = Object.fromEntries(Object.keys(current).sort().map(file => [file, Object.fromEntries(Object.entries(current[file]).sort(([a], [b]) => (a < b ? -1 : 1)))]));
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 1)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const added = [];
  for (const [file, prints] of Object.entries(current)) {
    for (const [fingerprint, count] of Object.entries(prints)) {
      const allowed = baseline[file]?.[fingerprint] ?? 0;
      if (count > allowed) added.push(`${file}:${unhandledAt.get(`${file}::${fingerprint}`).join(',')}（比基线多 ${count - allowed} 处）`);
    }
  }
  assert.deepEqual(added, [], 'catch 里补 logError(码, err) / logEvent(...)；确实该静默吞掉的写 // lcq-allow: 原因');
});
