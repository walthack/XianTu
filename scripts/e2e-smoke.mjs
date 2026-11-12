#!/usr/bin/env node
// 端到端冒烟聚合：依次跑 scripts/smoke-*.mjs（浏览器夹具，拦截模型与存档请求，不打真实模型），汇总通过/失败。
// 用法：npm run e2e:smoke -- <站点URL…> [--only 名字,名字] [--list] [--with-real] [--json 输出文件]
//   站点 URL 原样转给每个脚本（需要已有可访问的构建产物，本脚本不构建、不起服务）；也可用环境变量 SMOKE_URL。
//   --with-real：另跑 smoke-modular-turn-real（会调用真实模型、消耗额度，默认不跑，记为 skipped）。
// 退出码：0 全通过；1 有失败；2 用法错误。
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 会调真实模型的脚本：默认跳过。 */
export const REAL_MODEL_SCRIPTS = ['smoke-modular-turn-real'];
/** 脚本以此退出码表示「前置条件缺失，跳过」（不是通过）；跳过原因写在标准输出 `SMOKE-SKIP: 原因` 一行。 */
export const SKIP_EXIT_CODE = 77;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
export const isLocalHost = hostname => LOCAL_HOSTS.has(hostname);
/** 被测页面 index.html 引用的外部 CDN 静态库：用本机 node_modules 里的同名库替身，不出网。 */
const STATIC_STUBS = [
  [/^https:\/\/unpkg\.com\/vue@3\/dist\/vue\.global\.js$/, 'node_modules/vue/dist/vue.global.js', 'text/javascript'],
  [/^https:\/\/unpkg\.com\/vue-router@4\/dist\/vue-router\.global\.js$/, 'node_modules/vue-router/dist/vue-router.global.js', 'text/javascript'],
  [/^https:\/\/unpkg\.com\/lodash@4\/lodash\.min\.js$/, 'node_modules/lodash/lodash.min.js', 'text/javascript'],
  [/^https:\/\/unpkg\.com\/jquery@3\/dist\/jquery\.min\.js$/, 'node_modules/jquery/dist/jquery.min.js', 'text/javascript'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/[^/]+\/css\/all\.min\.css$/, null, 'text/css'],
  [/^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js$/, null, 'text/javascript'],
  [/^https:\/\/www\.ddct\.top\/favicon\.ico$/, null, 'image/x-icon'],
  // 首页装饰背景视频：替身回 404，组件按原有容错不显示视频。
  [/^https:\/\/(www\.)?ddct\.top\/backgroundvedio\.mp4$/, null, 'video/mp4', 404],
];

/**
 * 冒烟网络护栏：在脚本自己的 context.route 之前装（Playwright 后装的路由先匹配，脚本处理不了的用 route.fallback() 落到这里）。
 * - 本机 GET/HEAD 放行；本机其它方法（写接口）一律 abort 并记为违规。
 * - 外部 CDN 静态库用本机文件替身；其余非本机请求一律 abort 并记为违规。
 * - 非本机请求永不放行（route.continue），因此每个非本机请求不是被脚本替身 fulfill 就是被 abort。
 * finish() 断言零违规、打印统计；设了环境变量 SMOKE_NET_LOG 时把统计追加到该文件供聚合脚本汇总。
 */
export async function installSmokeNetworkGuard(context, label = path.basename(process.argv[1] ?? '', '.mjs')) {
  const stats = { label, external: 0, externalFailed: 0, stubbedStatic: 0, violations: [] };
  context.on('request', request => { try { if (!isLocalHost(new URL(request.url()).hostname) && /^https?:/.test(request.url())) stats.external++; } catch { /* data: 等 */ } });
  context.on('requestfailed', request => { try { if (!isLocalHost(new URL(request.url()).hostname) && /^https?:/.test(request.url())) stats.externalFailed++; } catch { /* ignore */ } });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!/^https?:$/.test(url.protocol)) return route.continue();
    if (isLocalHost(url.hostname)) {
      if (['GET', 'HEAD'].includes(request.method())) return route.continue();
      stats.violations.push(`本机写请求未被替身：${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const stub = STATIC_STUBS.find(([re]) => re.test(`${url.origin}${url.pathname}`));
    if (stub && request.method() === 'GET') {
      stats.stubbedStatic++;
      return route.fulfill({ status: stub[3] ?? 200, contentType: stub[2], body: stub[1] ? readFileSync(path.join(ROOT, stub[1])) : '' });
    }
    stats.violations.push(`非本机请求未被替身：${request.method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
  let reported = false;
  const report = finished => {
    if (reported) return;
    reported = true;
    console.log(`[网络护栏] ${label}${finished ? '' : '（脚本未走到收尾）'}：非本机请求 ${stats.external}（替身 fulfill ${stats.external - stats.externalFailed}，其中静态库 ${stats.stubbedStatic}；abort/中止 ${stats.externalFailed}；放行 0），违规 ${stats.violations.length}`);
    if (process.env.SMOKE_NET_LOG) appendFileSync(process.env.SMOKE_NET_LOG, `${JSON.stringify({ ...stats, finished, violations: stats.violations.slice(0, 20) })}\n`);
  };
  // 脚本中途失败没走到 finish() 时，退出前照样上报统计（聚合汇总才完整）。
  process.once('exit', () => report(false));
  return {
    stats,
    finish() {
      report(true);
      if (stats.violations.length) throw new Error(`网络护栏违规：\n${stats.violations.join('\n')}`);
    },
  };
}

/**
 * 模型请求替身的响应体：请求带 stream:true 时回 SSE（正文链路现在按流式发），否则回普通 JSON。
 * 用法：route.fulfill(fixtureCompletion(request.postDataJSON(), content))。
 */
export function fixtureCompletion(body, content, { finishReason = 'stop', usage = { completion_tokens: 80, total_tokens: 500 }, status = 200 } = {}) {
  if (body?.stream) {
    const chunk = { choices: [{ delta: { content }, finish_reason: finishReason }], usage };
    return { status, contentType: 'text/event-stream', body: `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n` };
  }
  return { status, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }], usage }) };
}

/**
 * 按内容区分模型请求种类（预算已不可靠：意图请求现为 4096）：
 * beat＝任务模式拍子判定小请求（user JSON 带 actions）；intent＝意图分类（带 candidates）；
 * memory／audit＝模块链路回合后的后台记忆／审计；其余为 narration（正文演出）。
 */
export function classifyFixtureRequest(body) {
  const messages = body?.messages || [];
  for (const message of messages) {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed?.playerText && Array.isArray(parsed.actions)) return 'beat';
      if (parsed?.playerText && Array.isArray(parsed.candidates)) return 'intent';
    } catch { /* 非 JSON 内容 */ }
  }
  const text = messages.map(message => String(message.content || '')).join('\n');
  if (/作为记忆/.test(text) && /sentenceIds/.test(text)) return 'memory';
  if (/连续性审计员/.test(text)) return 'audit';
  return 'narration';
}
/** 非正文请求的「什么也没认出」替身内容。 */
export const FIXTURE_NONE = {
  intent: JSON.stringify({ actionId: 'none', evidence: '', certainty: 'high' }),
  beat: JSON.stringify({ id: 'none', c: 'high', ev: '', neg: false }),
  memory: JSON.stringify({ sentenceIds: [0] }),
  audit: JSON.stringify({ findings: [] }),
};

/** 前置条件缺失：打印原因并以 SKIP_EXIT_CODE 退出（聚合脚本记为 skipped，不算通过）。 */
export function skipSmoke(reason) {
  console.log(`SMOKE-SKIP: ${reason}`);
  process.exit(SKIP_EXIT_CODE);
}

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
  const passed = results.filter(r => r.status === 'passed'), ranSkipped = results.filter(r => r.status === 'skipped');
  const failed = results.filter(r => r.status !== 'passed' && r.status !== 'skipped');
  const skippedDetails = [...skipped.map(name => ({ name, reason: '真实模型，加 --with-real 才跑' })), ...ranSkipped.map(r => ({ name: r.name, reason: r.reason }))];
  return { total: results.length - ranSkipped.length, passed: passed.length, failed: failed.length, skipped: skippedDetails.length, failedNames: failed.map(r => r.name), skippedNames: skippedDetails.map(d => d.name), skippedDetails, ok: failed.length === 0, results };
}

export function formatSummary(s) {
  const icon = { passed: '✅', skipped: '⏭ ' };
  const lines = s.results.filter(r => r.status !== 'skipped').map(r => `${icon[r.status] ?? '❌'} ${r.name}  ${r.status}  ${(r.ms / 1000).toFixed(1)}s${r.status === 'passed' ? '' : `（${r.reason}）`}`);
  for (const d of s.skippedDetails) lines.push(`⏭  ${d.name}  skipped（${d.reason}）`);
  lines.push(`—— 冒烟汇总：${s.passed}/${s.total} 通过，${s.failed} 失败，${s.skipped} 跳过${s.failed ? `；失败：${s.failedNames.join('、')}` : ''}${s.skipped ? `；跳过：${s.skippedNames.join('、')}` : ''}`);
  return lines.join('\n');
}

/** 汇总各脚本网络护栏上报的统计（SMOKE_NET_LOG 每行一条 JSON）。 */
export function summarizeNetwork(lines, ranNames) {
  const entries = lines.filter(Boolean).map(line => JSON.parse(line));
  const reported = new Set(entries.map(e => e.label));
  const sum = key => entries.reduce((n, e) => n + (e[key] || 0), 0);
  return { contexts: entries.length, external: sum('external'), externalFailed: sum('externalFailed'), stubbedStatic: sum('stubbedStatic'),
    violations: entries.flatMap(e => e.violations.map(v => `${e.label}: ${v}`)), unreported: ranNames.filter(n => !reported.has(n)) };
}

/** 真实执行一个脚本；超时则杀掉并记 timeout。 */
export function runScript(name, urls, timeoutMs, scriptDir = path.join(ROOT, 'scripts')) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(scriptDir, `${name}.mjs`), ...urls], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; process.stdout.write(chunk); });
    let done = false;
    const finish = (status, reason) => { if (done) return; done = true; clearTimeout(timer); resolve({ name, status, reason, ms: Date.now() - t0 }); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish('timeout', `超过 ${timeoutMs}ms`); }, timeoutMs);
    child.on('error', e => finish('failed', `无法启动：${e.message}`));
    child.on('close', (code, signal) => {
      if (code === SKIP_EXIT_CODE) return finish('skipped', out.match(/^SMOKE-SKIP: (.+)$/m)?.[1] ?? '前置条件缺失');
      finish(code === 0 ? 'passed' : 'failed', code === 0 ? '' : `退出码 ${code ?? signal}`);
    });
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
  const netDir = mkdtempSync(path.join(tmpdir(), 'xiantu-smoke-net-'));
  process.env.SMOKE_NET_LOG = path.join(netDir, 'net.jsonl');
  let summary, network;
  try {
    summary = summarize(await runAll(sel.run, opts.urls, { timeoutMs: loadTimeoutMs() }), sel.skipped);
    const netFile = process.env.SMOKE_NET_LOG;
    network = summarizeNetwork(existsSync(netFile) ? readFileSync(netFile, 'utf8').split('\n') : [], summary.results.filter(r => r.status !== 'skipped').map(r => r.name));
  } finally { rmSync(netDir, { recursive: true, force: true }); }
  summary.network = network;
  console.log(`\n${formatSummary(summary)}`);
  console.log(`—— 网络护栏：${network.contexts} 个浏览器上下文，非本机请求 ${network.external}（替身 fulfill ${network.external - network.externalFailed}，其中静态库 ${network.stubbedStatic}；abort/中止 ${network.externalFailed}；放行 0），违规 ${network.violations.length}${network.unreported.length ? `；未上报护栏统计：${network.unreported.join('、')}` : ''}`);
  if (opts.json) writeFileSync(opts.json, JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().then(code => process.exit(code));
