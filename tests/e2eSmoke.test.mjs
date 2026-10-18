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
