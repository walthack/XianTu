// scripts/bench-narrative-reasoning.mjs 离线自测：本地假 SSE 端点，不连真模型、不涉及任何 key。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/bench-narrative-reasoning.mjs', import.meta.url));
const bench = await import('../scripts/bench-narrative-reasoning.mjs');
const runtime = JSON.parse(readFileSync(new URL('../mod-kit/numbers-runtime.json', import.meta.url), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'bench-narrative-'));
const BODY = {
  model: 'MiniMax-M3.1-Flash', stream: false, max_tokens: 16384, response_format: { type: 'json_object' },
  reasoning_effort: 'max', apiKey: 'fixture-not-a-real-key',
  messages: [{ role: 'system', content: '# 游戏状态 fixture' }, { role: 'user', content: '<行动趋向>我请他先诊治我的伤。</行动趋向>' }],
};

test('请求体：去凭据字段与旧推理参数、强制流式、不换模型；改前不带、改后带配置档', () => {
  const { body, removed } = bench.normalizeBody(BODY, 'unused');
  assert.deepEqual(removed, ['apiKey']);
  assert.equal(body.model, 'MiniMax-M3.1-Flash');
  assert.equal(body.stream, true);
  assert.ok(!('reasoning_effort' in body) && !('apiKey' in body));
  const [before, after] = bench.buildVariants(body, bench.configuredEffort(), 'omit');
  assert.ok(!('reasoning_effort' in before.body));
  assert.equal(after.body.reasoning_effort, runtime.aiRetry.reasoning.mainNarrative.effort);
  assert.deepEqual({ ...after.body, reasoning_effort: undefined }, { ...before.body, reasoning_effort: undefined }, '两组只差推理档');
  assert.equal(bench.chatEndpoint('http://127.0.0.1:8091/llm-proxy/v1'), 'http://127.0.0.1:8091/llm-proxy/v1/chat/completions');
  assert.equal(bench.chatEndpoint('http://h/v1/chat/completions'), 'http://h/v1/chat/completions');
});

test('游戏解析器口径：去 think 后强 JSON 解析，取 text', () => {
  assert.deepEqual(bench.checkGameParse('<think>x</think>{"text":"正文","action_options":[]}'), { jsonOk: true, textChars: 2, parseError: undefined });
  assert.equal(bench.checkGameParse('不是 JSON').jsonOk, false);
  assert.equal(bench.checkGameParse('{"text":"","tavern_commands":[]}').parseError, '无正文 text');
});

test('ctx.log 只有分段摘要时明确拒绝（退出码 2），不伪造请求体', () => {
  const ctx = join(dir, 'ctx.log');
  writeFileSync(ctx, JSON.stringify({ t: 'T', req: 7, total: 83649, parts: [{ i: 0, role: 'user', len: 338, topSections: [['【本地事件判定已预结算】事件=lcq.event.s01_05；动作=advan', 151]] }] }) + '\n');
  const result = spawnSync(process.execPath, [script, '--ctx', ctx, '--base', 'http://127.0.0.1:9'], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /req=7.*没有完整正文/);
  const withBody = join(dir, 'ctx-full.log');
  writeFileSync(withBody, JSON.stringify({ req: 8, messages: BODY.messages, note: 'lcq.event.s01_05' }) + '\n');
  assert.deepEqual(bench.pickCtxEntry(readFileSync(withBody, 'utf8'), 'lcq.event.s01_05', 'last').raw, { messages: BODY.messages });
});

test('对本地假代理交替各发 N 次：无鉴权头、记耗时/首字节/推理与正文字数/finish/解析', async () => {
  const seen = [];
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      const body = JSON.parse(data);
      seen.push({ url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const think = body.reasoning_effort ? '想' : '想'.repeat(50);
      const events = [
        { choices: [{ delta: { reasoning_content: think } }] },
        { choices: [{ delta: { content: '{"text":"你走进帅帐。","action_options":["继续"]}' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 42 } },
      ];
      res.end(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const bodyFile = join(dir, 'body.json');
  const outFile = join(dir, 'out.jsonl');
  writeFileSync(bodyFile, JSON.stringify(BODY));
  try {
    const child = spawn(process.execPath, [script, '--body', bodyFile, '--base', `http://127.0.0.1:${port}/proxy/v1`, '--n', '2', '--out', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
    const code = await new Promise(resolve => child.on('close', resolve));
    assert.equal(code, 0, stderr);
    assert.doesNotMatch(stdout + stderr, /fixture-not-a-real-key/, '不打印凭据');
    assert.equal(seen.length, 4);
    assert.deepEqual(seen.map(s => 'reasoning_effort' in s.body), [false, true, false, true], '改前/改后交替');
    for (const s of seen) {
      assert.equal(s.url, '/proxy/v1/chat/completions');
      assert.equal(s.headers.authorization, undefined);
      assert.equal(s.body.apiKey, undefined);
      assert.equal(s.body.stream, true);
    }
    const rows = readFileSync(outFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 4);
    assert.doesNotMatch(readFileSync(outFile, 'utf8'), /fixture-not-a-real-key|你走进帅帐/, '结果文件只有指标');
    for (const row of rows) {
      assert.equal(row.finish, 'stop');
      assert.equal(row.jsonOk, true);
      assert.equal(row.completionTokens, 42);
      assert.ok(Number.isFinite(row.totalMs) && Number.isFinite(row.ttfbMs));
      assert.ok(row.contentChars > 0 && row.textChars > 0);
    }
    assert.deepEqual(rows.map(r => r.reasoningChars), [50, 1, 50, 1]);
  } finally { server.close(); }
});

test('--dry-run 不联网，列出两组推理档', () => {
  const bodyFile = join(dir, 'dry.json');
  writeFileSync(bodyFile, JSON.stringify({ messages: BODY.messages }));
  const result = spawnSync(process.execPath, [script, '--body', bodyFile, '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /model=MiniMax-M3\.1-Flash/);
  assert.match(result.stdout, /改前\(不带＝默认max\): reasoning_effort=（不带）/);
  assert.match(result.stdout, new RegExp(`改后\\(${runtime.aiRetry.reasoning.mainNarrative.effort}\\)`));
});
