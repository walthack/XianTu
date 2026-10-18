#!/usr/bin/env node
// 端到端冒烟聚合：依次跑 scripts/smoke-*.mjs（浏览器夹具，拦截模型与存档请求，不打真实模型），汇总通过/失败。
// 用法：npm run e2e:smoke -- <站点URL…> [--only 名字,名字] [--list] [--with-real] [--json 输出文件]
//   站点 URL 原样转给每个脚本（需要已有可访问的构建产物，本脚本不构建、不起服务）；也可用环境变量 SMOKE_URL。
//   --with-real：另跑 smoke-modular-turn-real（会调用真实模型、消耗额度，默认不跑，记为 skipped）。
// 退出码：0 全通过；1 有失败；2 用法错误。
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 会调真实模型的脚本：默认跳过。 */
export const REAL_MODEL_SCRIPTS = ['smoke-modular-turn-real'];

export const discoverSmokeScripts = (dir = path.join(ROOT, 'scripts')) =>
  readdirSync(dir).filter(f => /^smoke-.+\.mjs$/.test(f)).map(f => f.replace(/\.mjs$/, '')).sort();

export function loadTimeoutMs(numbersFile = path.join(ROOT, 'mod-kit/game-numbers.qingyu.json')) {
  const ms = JSON.parse(readFileSync(numbersFile, 'utf8')).e2eSmoke?.scriptTimeoutMs;
  if (!Number.isInteger(ms) || ms <= 0) throw new Error('game-numbers.e2eSmoke.scriptTimeoutMs 须为正整数');
  return ms;
}

export function parseArgs(argv) {
  const opts = { urls: [], only: null, list: false, withReal: false, json: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') opts.list = true;
    else if (a === '--with-real') opts.withReal = true;
    else if (a === '--only') opts.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--json') opts.json = argv[++i] ?? null;
    else if (a.startsWith('--')) opts.error = `未知参数：${a}`;
    else opts.urls.push(a);
  }
  if (!opts.urls.length && process.env.SMOKE_URL) opts.urls.push(...process.env.SMOKE_URL.split(',').filter(Boolean));
  return opts;
}

/** 选出本次要跑的与跳过的脚本。 */
export function selectScripts(all, opts) {
  const unknown = (opts.only ?? []).filter(n => !all.includes(n));
  if (unknown.length) return { error: `--only 里有不存在的脚本：${unknown.join('、')}` };
  const wanted = opts.only ?? all;
  const run = [], skipped = [];
  for (const name of wanted) (REAL_MODEL_SCRIPTS.includes(name) && !opts.withReal && !opts.only ? skipped : run).push(name);
  return { run, skipped };
}

export function summarize(results, skipped = []) {
  const passed = results.filter(r => r.status === 'passed'), failed = results.filter(r => r.status !== 'passed');
  return { total: results.length, passed: passed.length, failed: failed.length, skipped: skipped.length, failedNames: failed.map(r => r.name), skippedNames: skipped, ok: failed.length === 0, results };
}

export function formatSummary(s) {
  const lines = s.results.map(r => `${r.status === 'passed' ? '✅' : '❌'} ${r.name}  ${r.status}  ${(r.ms / 1000).toFixed(1)}s${r.status === 'passed' ? '' : `（${r.reason}）`}`);
  for (const n of s.skippedNames) lines.push(`⏭  ${n}  skipped（真实模型，加 --with-real 才跑）`);
  lines.push(`—— 冒烟汇总：${s.passed}/${s.total} 通过，${s.failed} 失败，${s.skipped} 跳过${s.failed ? `；失败：${s.failedNames.join('、')}` : ''}`);
  return lines.join('\n');
}

/** 真实执行一个脚本；超时则杀掉并记 timeout。 */
export function runScript(name, urls, timeoutMs, scriptDir = path.join(ROOT, 'scripts')) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(scriptDir, `${name}.mjs`), ...urls], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    let done = false;
    const finish = (status, reason) => { if (done) return; done = true; clearTimeout(timer); resolve({ name, status, reason, ms: Date.now() - t0 }); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish('timeout', `超过 ${timeoutMs}ms`); }, timeoutMs);
    child.on('error', e => finish('failed', `无法启动：${e.message}`));
    child.on('exit', (code, signal) => finish(code === 0 ? 'passed' : 'failed', code === 0 ? '' : `退出码 ${code ?? signal}`));
  });
}

export async function runAll(names, urls, { run = runScript, timeoutMs }) {
  const results = [];
  for (const name of names) { console.log(`\n▶ ${name}`); results.push(await run(name, urls, timeoutMs)); }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = discoverSmokeScripts();
  if (opts.error) { console.error(opts.error); return 2; }
  const sel = selectScripts(all, opts);
  if (sel.error) { console.error(sel.error); return 2; }
  if (opts.list) { for (const n of sel.run) console.log(n); for (const n of sel.skipped) console.log(`${n}  (跳过：真实模型)`); return 0; }
  if (!opts.urls.length) { console.error('缺少站点 URL：npm run e2e:smoke -- http://127.0.0.1:端口/（或设环境变量 SMOKE_URL）'); return 2; }
  const summary = summarize(await runAll(sel.run, opts.urls, { timeoutMs: loadTimeoutMs() }), sel.skipped);
  console.log(`\n${formatSummary(summary)}`);
  if (opts.json) writeFileSync(opts.json, JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().then(code => process.exit(code));
