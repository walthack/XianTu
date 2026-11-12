import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';
import * as e2e from '../scripts/e2e-smoke.mjs';

const script = fileURLToPath(new URL('../scripts/e2e-smoke.mjs', import.meta.url));
const scriptsDir = fileURLToPath(new URL('../scripts/', import.meta.url));

test('发现的冒烟脚本 = scripts/smoke-*.mjs 全部 12 个，真实模型脚本在其中且默认跳过', () => {
  const all = e2e.discoverSmokeScripts();
  assert.equal(all.length, 12);
  assert.deepEqual(all, readdirSync(scriptsDir).filter(f => f.startsWith('smoke-') && f.endsWith('.mjs')).map(f => f.slice(0, -4)).sort());
  assert.ok(all.includes('smoke-modular-turn-real'));
  const sel = e2e.selectScripts(all, e2e.parseArgs([]));
  assert.equal(sel.run.length, 11);
  assert.deepEqual(sel.skipped, ['smoke-modular-turn-real']);
  assert.equal(e2e.selectScripts(all, e2e.parseArgs(['--with-real'])).run.length, 12);
});

test('package.json 登记了 e2e:smoke', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts['e2e:smoke'], 'node scripts/e2e-smoke.mjs');
});

test('参数解析：URL、--only、未知参数、--only 含不存在脚本', () => {
  const o = e2e.parseArgs(['http://a/', 'http://b/', '--only', 'smoke-run3-intent,smoke-run5-repairs', '--json', 'x.json']);
  assert.deepEqual(o.urls, ['http://a/', 'http://b/']);
  assert.deepEqual(o.only, ['smoke-run3-intent', 'smoke-run5-repairs']);
  assert.equal(o.json, 'x.json');
  assert.match(e2e.parseArgs(['--bogus']).error, /未知参数/);
  assert.match(e2e.selectScripts(e2e.discoverSmokeScripts(), { only: ['nope'] }).error, /不存在/);
});

test('汇总：逐个运行、失败与超时都计入失败，通过数/失败名正确', async () => {
  const fake = async (name, urls, timeoutMs) => {
    assert.deepEqual(urls, ['http://x/']); assert.equal(timeoutMs, 1234);
    return name === 'b' ? { name, status: 'failed', reason: '退出码 1', ms: 10 } : name === 'c' ? { name, status: 'timeout', reason: '超时', ms: 20 } : { name, status: 'passed', reason: '', ms: 5 };
  };
  const results = await e2e.runAll(['a', 'b', 'c'], ['http://x/'], { run: fake, timeoutMs: 1234 });
  const s = e2e.summarize(results, ['real']);
  assert.deepEqual([s.total, s.passed, s.failed, s.skipped, s.ok], [3, 1, 2, 1, false]);
  assert.deepEqual(s.failedNames, ['b', 'c']);
  const text = e2e.formatSummary(s);
  assert.match(text, /1\/3 通过，2 失败，1 跳过；失败：b、c/);
  assert.equal(e2e.summarize([{ name: 'a', status: 'passed', reason: '', ms: 1 }]).ok, true);
});

test('真实子进程：通过 / 失败 / 超时三种结局', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'smoke-'));
  writeFileSync(path.join(dir, 'ok.mjs'), 'process.exit(process.argv[2] === "http://u/" ? 0 : 9)');
  writeFileSync(path.join(dir, 'bad.mjs'), 'process.exit(3)');
  writeFileSync(path.join(dir, 'hang.mjs'), 'setInterval(() => {}, 1000)');
  const r = [await e2e.runScript('ok', ['http://u/'], 5000, dir), await e2e.runScript('bad', [], 5000, dir), await e2e.runScript('hang', [], 400, dir)];
  assert.deepEqual(r.map(x => x.status), ['passed', 'failed', 'timeout']);
  assert.match(r[1].reason, /退出码 3/);
});

test('命令行：--list 退出 0；缺 URL 退出 2；未知参数退出 2', () => {
  const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, SMOKE_URL: '' } });
  const list = run(['--list']);
  assert.equal(list.status, 0);
  assert.equal(list.stdout.trim().split('\n').length, 12);
  assert.equal(run([]).status, 2);
  assert.equal(run(['--zzz']).status, 2);
});

test('数值体检：e2eSmoke.scriptTimeoutMs 必须是正整数，已进 game-numbers 并登记校验器', async () => {
  const cfg = await loadTs('../src/modules/diagnostics/e2eSmokeConfig.ts');
  assert.deepEqual(cfg.validateE2eSmokeConfig(), []);
  assert.equal(cfg.validateE2eSmokeConfig(null).length, 1);
  assert.equal(cfg.validateE2eSmokeConfig({ scriptTimeoutMs: 0 }).length, 1);
  assert.equal(cfg.validateE2eSmokeConfig({ scriptTimeoutMs: 1.5 }).length, 1);
  assert.equal(cfg.validateE2eSmokeConfig({}).length, 1);
  assert.ok(e2e.loadTimeoutMs() > 0);
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.throws(() => numbers.applyGameNumbers({ e2eSmoke: { scriptTimeoutMs: -5 } }), /LCQ-NUM-006/);
  assert.equal(numbers.GAME_NUMBERS.e2eSmoke.scriptTimeoutMs, e2e.loadTimeoutMs());
});

test('跳过：脚本以 SKIP_EXIT_CODE 退出记为 skipped（带原因），不算通过也不算失败', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'smoke-'));
  writeFileSync(path.join(dir, 'skip.mjs'), `console.log('SMOKE-SKIP: 缺私有夹具 x'); process.exit(${e2e.SKIP_EXIT_CODE})`);
  const r = await e2e.runScript('skip', [], 5000, dir);
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, '缺私有夹具 x');
  const s = e2e.summarize([r, { name: 'a', status: 'passed', reason: '', ms: 1 }], ['real']);
  assert.deepEqual([s.total, s.passed, s.failed, s.skipped, s.ok], [1, 1, 0, 2, true], 'total counts only scripts that reached a verdict');
  assert.deepEqual(s.skippedNames, ['real', 'skip']);
  const text = e2e.formatSummary(s);
  assert.match(text, /⏭ {2}skip {2}skipped（缺私有夹具 x）/);
  assert.match(text, /1\/1 通过，0 失败，2 跳过；跳过：real、skip/);
  assert.doesNotMatch(text, /✅ skip/);
});

test('网络统计汇总：逐上下文求和、列出违规与未上报的脚本', () => {
  const lines = [
    JSON.stringify({ label: 'a', external: 10, externalFailed: 1, stubbedStatic: 8, violations: [] }),
    JSON.stringify({ label: 'a', external: 5, externalFailed: 0, stubbedStatic: 4, violations: ['非本机请求未被替身：GET https://x/y'] }),
    '',
  ];
  const n = e2e.summarizeNetwork(lines, ['a', 'b']);
  assert.deepEqual([n.contexts, n.external, n.externalFailed, n.stubbedStatic], [2, 15, 1, 12]);
  assert.deepEqual(n.violations, ['a: 非本机请求未被替身：GET https://x/y']);
  assert.deepEqual(n.unreported, ['b']);
});

test('模型请求替身：按内容分种类；按 stream 回 SSE 或 JSON', () => {
  const msg = content => ({ messages: [{ role: 'system', content: 'x' }, { role: 'user', content }] });
  assert.equal(e2e.classifyFixtureRequest(msg(JSON.stringify({ playerText: 'a', actions: [] }))), 'beat');
  assert.equal(e2e.classifyFixtureRequest(msg(JSON.stringify({ playerText: 'a', candidates: [] }))), 'intent');
  assert.equal(e2e.classifyFixtureRequest(msg('从编号原文句子中选出1至4句最重要的已发生事实作为记忆。只返回JSON {"sentenceIds":[0]}')), 'memory');
  assert.equal(e2e.classifyFixtureRequest(msg('你是只读的连续性审计员。')), 'audit');
  assert.equal(e2e.classifyFixtureRequest(msg('每轮输出JSON')), 'narration');
  for (const kind of ['intent', 'beat', 'memory', 'audit']) assert.doesNotThrow(() => JSON.parse(e2e.FIXTURE_NONE[kind]));
  const sse = e2e.fixtureCompletion({ stream: true }, 'hi', { finishReason: 'length' });
  assert.equal(sse.contentType, 'text/event-stream');
  const chunk = JSON.parse(sse.body.split('\n')[0].replace(/^data: /, ''));
  assert.deepEqual([chunk.choices[0].delta.content, chunk.choices[0].finish_reason], ['hi', 'length']);
  assert.match(sse.body, /data: \[DONE\]/);
  const json = e2e.fixtureCompletion({ stream: false }, 'hi');
  assert.equal(json.contentType, 'application/json');
  assert.equal(JSON.parse(json.body).choices[0].message.content, 'hi');
});

test('网络护栏：本机 GET 放行；CDN 静态库本机替身；本机写请求与其余非本机请求 abort 并记违规，finish 抛错', async () => {
  let handler;
  const listeners = {};
  const context = { on: (event, fn) => { listeners[event] = fn; }, route: async (_pattern, fn) => { handler = fn; } };
  const guard = await e2e.installSmokeNetworkGuard(context, 'unit');
  const call = async (url, method = 'GET') => {
    const request = { url: () => url, method: () => method };
    listeners.request(request);
    const seen = {};
    await handler({ request: () => request, continue: () => { seen.how = 'continue'; }, abort: () => { seen.how = 'abort'; listeners.requestfailed(request); }, fulfill: options => { seen.how = 'fulfill'; seen.options = options; } });
    return seen;
  };
  assert.equal((await call('http://127.0.0.1:8092/assets/a.js')).how, 'continue');
  const vue = await call('https://unpkg.com/vue@3/dist/vue.global.js');
  assert.equal(vue.how, 'fulfill');
  assert.ok(vue.options.body.length > 1000, 'served from local node_modules');
  assert.equal((await call('https://www.ddct.top/backgroundvedio.mp4')).options.status, 404);
  assert.deepEqual(guard.stats.violations, []);
  assert.doesNotThrow(() => guard.finish());
  assert.equal((await call('http://127.0.0.1:8092/api/v1/characters', 'POST')).how, 'abort');
  assert.equal((await call('https://api.siliconflow.cn/v1/embeddings', 'POST')).how, 'abort');
  assert.equal((await call('https://example.com/x.png')).how, 'abort');
  assert.equal(guard.stats.violations.length, 3);
  assert.deepEqual([guard.stats.external, guard.stats.externalFailed, guard.stats.stubbedStatic], [4, 2, 2]);
  assert.throws(() => guard.finish(), /网络护栏违规/);
});
