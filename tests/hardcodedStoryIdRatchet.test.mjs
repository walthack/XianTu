// 硬编码剧情 id 棘轮（秦线 PR A · 阶段 0；口径 B + 前缀模板行 + 拆分拼接防躲）。
// 基线：tests/hardcoded-story-id-baseline.json。
//
// 口径 B：扫 src 下扩展名 ts/tsx/vue/js/mjs（写死，不可配置）。源文件的物理一行只要出现带引号
// （' " `）的前缀表子串计 1 行；同行多个 id 仍计 1；含注释。匹配字面量前缀，不解析拼接结果。
// 不扫 tests/、不扫 JSON/md、不扫生成物（跳过名为 catalog.json 的文件及 node_modules/.git/dist/coverage）。
// 前缀表只取基线文件里的「前缀表」，本测试不另写一套：新增前缀等于放宽，须改基线并在 PR 说明里写明。
// 前缀模板行：反引号模板里写了前缀、并带 ${…}，单独计数，只要求不升。
// 拆分拼接防躲：'lcq' + '.event.' 这类把前缀拆开再用 + 拼回的写法报红（口径 B 本身看不见它）。
// 把 id 挪到 src 下未被扫描的扩展名（JSON/md 除外）同样算违规。
//
// 与人名棘轮的关系：两者各管各的。人名棘轮仍在 canon:build（scripts/validate-ledger-ratchet.mjs），
// 本棘轮在 npm test。不互相改基线、不互相当失败理由。
//
// 改基线的规矩：
// - 总数下降时，同一 PR 重写基线（改到恰好等于实扫），PR 说明写清 id 搬到了哪里。
// - 文件拆分或改名时「按文件不升」会误报：允许在总数（文件数可因拆分变化，行数与模板行总数）不升的前提下
//   重写基线，PR 说明列出搬家对照（旧文件 → 新文件、各自行数）。
// - 基线只存：口径版本、前缀表、总数、按文件计数、前缀模板行；不存匹配行清单、不做哈希。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(REPO_ROOT, 'tests', 'hardcoded-story-id-baseline.json');

export const 口径版本 = 'B';
export const SCANNED_EXTENSIONS = Object.freeze(['ts', 'tsx', 'vue', 'js', 'mjs']);
/** 非代码、允许承载 id 的 src 扩展名（声明化搬迁的去处）。 */
const NON_CODE_ALLOWED_EXTENSIONS = new Set(['json', 'md']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const SKIP_FILES = new Set(['catalog.json']);

export function loadBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildMatchers(prefixes) {
  const alt = prefixes.map(escapeRe).join('|');
  return {
    /** 带引号的前缀子串（', ", `）。 */
    quoted: new RegExp(`['"\`](?:${alt})`),
    /** 前缀写在反引号模板里、并带 ${…}。 */
    template: new RegExp('`(?:' + alt + ')[^`]*\\$\\{'),
  };
}

const toPosix = p => p.split(sep).join(posix.sep);
const sortKeys = obj => Object.fromEntries(Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(k => [k, obj[k]]));

function walkSrc(repoRoot) {
  const out = [];
  const walk = dir => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(full);
      } else if (ent.isFile() && !SKIP_FILES.has(ent.name)) {
        out.push(full);
      }
    }
  };
  walk(join(repoRoot, 'src'));
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

const extOf = file => extname(file).slice(1);
const scannedFiles = repoRoot => walkSrc(repoRoot).filter(f => SCANNED_EXTENSIONS.includes(extOf(f)));

/** 口径 B 扫描，返回与基线同形的对象。 */
export function scanHardcodedStoryIds(repoRoot, prefixes) {
  const { quoted, template } = buildMatchers(prefixes);
  const byFile = {};
  const templateByFile = {};
  let lineTotal = 0;
  let templateTotal = 0;
  for (const full of scannedFiles(repoRoot)) {
    const rel = toPosix(relative(repoRoot, full));
    let fileLines = 0;
    let fileTemplates = 0;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      if (quoted.test(line)) fileLines += 1;
      if (template.test(line)) fileTemplates += 1;
    }
    if (fileLines) { byFile[rel] = fileLines; lineTotal += fileLines; }
    if (fileTemplates) { templateByFile[rel] = fileTemplates; templateTotal += fileTemplates; }
  }
  return {
    口径版本,
    前缀表: [...prefixes],
    总数: { 文件数: Object.keys(byFile).length, 行数: lineTotal },
    按文件计数: sortKeys(byFile),
    前缀模板行: { 总数: templateTotal, 按文件计数: sortKeys(templateByFile) },
  };
}

/** 棘轮比较：只报上升。返回违规说明列表（空＝通过）。 */
export function ratchetViolations(scan, baseline) {
  const v = [];
  if (scan.总数.文件数 > baseline.总数.文件数) v.push(`总数.文件数 ${baseline.总数.文件数} → ${scan.总数.文件数}`);
  if (scan.总数.行数 > baseline.总数.行数) v.push(`总数.行数 ${baseline.总数.行数} → ${scan.总数.行数}`);
  for (const [file, n] of Object.entries(scan.按文件计数)) {
    const was = baseline.按文件计数[file] ?? 0;
    if (n > was) v.push(`按文件计数 ${file} ${was} → ${n}`);
  }
  if (scan.前缀模板行.总数 > baseline.前缀模板行.总数) v.push(`前缀模板行.总数 ${baseline.前缀模板行.总数} → ${scan.前缀模板行.总数}`);
  for (const [file, n] of Object.entries(scan.前缀模板行.按文件计数)) {
    const was = baseline.前缀模板行.按文件计数[file] ?? 0;
    if (n > was) v.push(`前缀模板行.按文件计数 ${file} ${was} → ${n}`);
  }
  return v;
}

// 一个字符串字面量：'…' / "…"（不跨行）或 `…`（可跨行）。
const LIT = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`';
const CHAIN = new RegExp(`(?:${LIT})(?:\\s*\\+\\s*(?:${LIT}))+`, 'g');
const LIT_ONE = new RegExp(LIT, 'g');

/**
 * 拆分拼接防躲：找出用 + 相连的字面量链，若某个前缀跨越了字面量边界才拼出来
 * （例如 'lcq' + '.event.'、'liuchao' + '.event.'、'lc' + 'q.x'），报红。
 * 返回 [{ file, line, text }]。
 */
export function findSplitConcat(text, prefixes) {
  const hits = [];
  for (const m of text.matchAll(CHAIN)) {
    const parts = [...m[0].matchAll(LIT_ONE)].map(x => x[0].slice(1, -1));
    for (let i = 0; i < parts.length - 1; i += 1) {
      const joined = parts.slice(i).join('');
      if (prefixes.some(p => joined.startsWith(p) && !parts[i].startsWith(p))) {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push({ line, text: m[0].split('\n')[0].trim() });
        break;
      }
    }
  }
  return hits;
}

export function scanSplitConcat(repoRoot, prefixes) {
  const out = [];
  for (const full of scannedFiles(repoRoot)) {
    for (const hit of findSplitConcat(readFileSync(full, 'utf8'), prefixes)) {
      out.push({ file: toPosix(relative(repoRoot, full)), ...hit });
    }
  }
  return out;
}

/** src 下未被扫描、且不是 JSON/md 的文件里出现带引号前缀：算把 id 挪去躲扫描。 */
export function scanUnscannedExtensions(repoRoot, prefixes) {
  const { quoted } = buildMatchers(prefixes);
  const out = [];
  for (const full of walkSrc(repoRoot)) {
    const ext = extOf(full);
    if (SCANNED_EXTENSIONS.includes(ext) || NON_CODE_ALLOWED_EXTENSIONS.has(ext)) continue;
    const lines = readFileSync(full, 'latin1').split('\n').filter(l => quoted.test(l)).length;
    if (lines) out.push({ file: toPosix(relative(repoRoot, full)), lines });
  }
  return out;
}

// ---------- 临时样本工具（反例只在临时目录里造，不碰仓库 src） ----------
function withTempRepo(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'story-id-ratchet-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const baseline = loadBaseline();
const PREFIXES = baseline.前缀表;

const SAMPLE_BASE = {
  'src/a.ts': [
    "export const A = 'lcq.event.alpha';",
    '// 注释里的 "lyg.chapter.x" 也计',
    "const two = ['lyl.a', 'lyl.b']; // 同行两个只计 1",
    'const t = `liuchao.event.${slug}`;',
    "const plain = 'no prefix here';",
  ].join('\n') + '\n',
  'src/b.vue': "<script>const x = \"playtest.run\";</script>\n",
  'src/catalog.json': '{"id": "lcq.event.ignored"}\n',
  'tests/x.test.mjs': "const y = 'lcq.event.tests_not_counted';\n",
};

test('基线文件：只含五个字段，口径 B，键已排序，前缀表非空', () => {
  assert.deepEqual(Object.keys(baseline), ['口径版本', '前缀表', '总数', '按文件计数', '前缀模板行']);
  assert.equal(baseline.口径版本, 口径版本);
  assert.ok(Array.isArray(baseline.前缀表) && baseline.前缀表.length > 0);
  assert.deepEqual(Object.keys(baseline.总数), ['文件数', '行数']);
  assert.deepEqual(Object.keys(baseline.前缀模板行), ['总数', '按文件计数']);
  assert.deepEqual(Object.keys(baseline.按文件计数), Object.keys(sortKeys(baseline.按文件计数)));
  assert.deepEqual(Object.keys(baseline.前缀模板行.按文件计数), Object.keys(sortKeys(baseline.前缀模板行.按文件计数)));
  const sum = Object.values(baseline.按文件计数).reduce((a, b) => a + b, 0);
  assert.equal(baseline.总数.行数, sum);
  assert.equal(baseline.总数.文件数, Object.keys(baseline.按文件计数).length);
  const tsum = Object.values(baseline.前缀模板行.按文件计数).reduce((a, b) => a + b, 0);
  assert.equal(baseline.前缀模板行.总数, tsum);
});

test('当前树：口径 B 总数/按文件/前缀模板行均不升，且恰好等于基线', () => {
  const scan = scanHardcodedStoryIds(REPO_ROOT, PREFIXES);
  assert.deepEqual(ratchetViolations(scan, baseline), [], '硬编码剧情 id 上升');
  assert.deepEqual(scan, baseline, '实扫与基线不一致：若是下降（搬走），同一 PR 重写基线并说明搬到了哪里');
});

test('当前树：没有拆分拼接躲避前缀的写法', () => {
  assert.deepEqual(scanSplitConcat(REPO_ROOT, PREFIXES), []);
});

test('当前树：src 下未扫描扩展名（JSON/md 除外）不藏前缀 id', () => {
  assert.deepEqual(scanUnscannedExtensions(REPO_ROOT, PREFIXES), []);
});

test('样本：口径 B 计数规则（同行计 1、含注释、跳过 catalog.json 与 tests/）', () => {
  withTempRepo(SAMPLE_BASE, root => {
    const scan = scanHardcodedStoryIds(root, PREFIXES);
    assert.deepEqual(scan.总数, { 文件数: 2, 行数: 5 });
    assert.deepEqual(scan.按文件计数, { 'src/a.ts': 4, 'src/b.vue': 1 });
    assert.deepEqual(scan.前缀模板行, { 总数: 1, 按文件计数: { 'src/a.ts': 1 } });
    assert.deepEqual(ratchetViolations(scan, scan), []);
  });
});

test('反例：新增一行带引号的前缀 id → 总数与按文件报红', () => {
  const before = withTempRepo(SAMPLE_BASE, root => scanHardcodedStoryIds(root, PREFIXES));
  const addSameFile = { ...SAMPLE_BASE, 'src/a.ts': SAMPLE_BASE['src/a.ts'] + "const n = \"liuchao.character.new\";\n" };
  withTempRepo(addSameFile, root => {
    const v = ratchetViolations(scanHardcodedStoryIds(root, PREFIXES), before);
    assert.ok(v.some(s => s.startsWith('总数.行数')), v.join('\n'));
    assert.ok(v.some(s => s.startsWith('按文件计数 src/a.ts')), v.join('\n'));
  });
  const addNewFile = { ...SAMPLE_BASE, 'src/c.js': "export default 'lcq.item.sword';\n" };
  withTempRepo(addNewFile, root => {
    const v = ratchetViolations(scanHardcodedStoryIds(root, PREFIXES), before);
    assert.ok(v.some(s => s.startsWith('总数.文件数')), v.join('\n'));
    assert.ok(v.some(s => s === '按文件计数 src/c.js 0 → 1'), v.join('\n'));
  });
});

test('反例：拆分拼接躲避（口径 B 看不见）→ 拼接检查报红', () => {
  const evasions = [
    "const id = 'lcq' + '.event.' + 'foo';",
    'const id = "liuchao" + ".event." + name;',
    "const id = 'lc' + 'q.event.foo';",
    "const id = 'lyg'\n  + '.chapter.x';",
    'const id = `playtest` + `.case`;',
  ];
  for (const line of evasions) {
    withTempRepo({ ...SAMPLE_BASE, 'src/evade.ts': line + '\n' }, root => {
      const scan = scanHardcodedStoryIds(root, PREFIXES);
      assert.equal(scan.按文件计数['src/evade.ts'], undefined, `口径 B 本应看不见：${line}`);
      const hits = scanSplitConcat(root, PREFIXES);
      assert.equal(hits.length, 1, `拼接检查应报红：${line}`);
      assert.equal(hits[0].file, 'src/evade.ts');
    });
  }
  // 不误伤：前缀完整在单个字面量里（由口径 B 计）、或拼接与前缀无关。
  for (const ok of ["const a = 'lcq.event.' + x;", "const b = 'foo' + '.bar';", "const c = 'lcq.x' + '.y';"]) {
    assert.deepEqual(findSplitConcat(ok, PREFIXES), [], ok);
  }
});

test('反例：新增一行前缀模板（反引号前缀 + ${…}）→ 前缀模板行报红', () => {
  const before = withTempRepo(SAMPLE_BASE, root => scanHardcodedStoryIds(root, PREFIXES));
  const added = { ...SAMPLE_BASE, 'src/b.vue': SAMPLE_BASE['src/b.vue'] + '<script>const y = `lcq.event.${id}`;</script>\n' };
  withTempRepo(added, root => {
    const v = ratchetViolations(scanHardcodedStoryIds(root, PREFIXES), before);
    assert.ok(v.some(s => s.startsWith('前缀模板行.总数')), v.join('\n'));
    assert.ok(v.some(s => s.startsWith('前缀模板行.按文件计数 src/b.vue')), v.join('\n'));
  });
});

test('反例：把 id 挪到 src 下未扫描扩展名 → 报红；JSON 不算', () => {
  withTempRepo({ ...SAMPLE_BASE, 'src/hide.cjs': "module.exports = 'lcq.event.hidden';\n" }, root => {
    assert.deepEqual(scanUnscannedExtensions(root, PREFIXES), [{ file: 'src/hide.cjs', lines: 1 }]);
  });
  withTempRepo({ ...SAMPLE_BASE, 'src/data/pack.json': '{"id": "lcq.event.declared"}\n' }, root => {
    assert.deepEqual(scanUnscannedExtensions(root, PREFIXES), []);
  });
});

test('前缀表取自基线：样本前缀表外的写法不计（放宽/收紧须改基线）', () => {
  withTempRepo({ 'src/a.ts': "const a = 'lcq.x';\nconst b = 'zz.y';\n" }, root => {
    assert.equal(scanHardcodedStoryIds(root, PREFIXES).总数.行数, 1);
    assert.equal(scanHardcodedStoryIds(root, [...PREFIXES, 'zz.']).总数.行数, 2);
  });
});
