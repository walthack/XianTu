#!/usr/bin/env node
// 战斗试玩原型的静态服务（只服务本目录），可选代理模型叙事。
// 用法：node dev/combat-proto/serve.mjs --port 8095 [--model <OpenRouter 模型名>]
// 模型开关：需要 --model（或环境变量 PROTO_LLM_MODEL），密钥取环境变量 OPENROUTER_API_KEY，
// 没有时读仓库根目录 .env 的同名项。密钥只留在服务端，不发给浏览器。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(arg('port', process.env.PORT || 8095));
const host = arg('host', '127.0.0.1');
const model = arg('model', process.env.PROTO_LLM_MODEL || '');
if (port === 8091) {
  console.error('8091 是主游戏服务端口，试玩原型不得占用。请换 8095。');
  process.exit(1);
}

function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const envFile = join(repoRoot, '.env');
  if (!existsSync(envFile)) return '';
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find(item => item.startsWith('OPENROUTER_API_KEY='));
  return line ? line.slice('OPENROUTER_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '') : '';
}

const llmAvailable = Boolean(model && apiKey());

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const SYSTEM_PROMPT = [
  '你是武侠小说的战斗描写者，只负责把本地已经结算好的一段战斗写成 80–160 字的中文正文，第二人称「你」指程宗扬。',
  '硬性规则：不得改变给定的结果档位、伤势、死伤和谁出手；不得新增未给出的伤势、死亡或道具；不得写出骰点、数值或判定字样；',
  '不得替玩家补出新的行动；不写任何性内容；所有角色都是成年人。只输出正文，不要标题。',
].join('');

async function narrate(body) {
  const facts = JSON.stringify(body?.facts || {}, null, 0).slice(0, 4000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `按下面的既定结果写这一段：\n${facts}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`上游 ${response.status}`);
    const json = await response.json();
    const text = String(json?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!text) throw new Error('上游返回空正文');
    return { text, model };
  } finally {
    clearTimeout(timer);
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/config') return send(res, 200, { llm: { available: llmAvailable, model: llmAvailable ? model : null } });
    if (url.pathname === '/api/narrate' && req.method === 'POST') {
      if (!llmAvailable) return send(res, 503, { error: '未配置模型（需要 --model 与 OPENROUTER_API_KEY）' });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) break; }
      return send(res, 200, await narrate(JSON.parse(raw || '{}')));
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = normalize(join(here, path));
    if (!file.startsWith(here) || !TYPES[extname(file)]) return send(res, 404, { error: 'not found' });
    return send(res, 200, await readFile(file), TYPES[extname(file)]);
  } catch (error) {
    return send(res, error?.code === 'ENOENT' ? 404 : 502, { error: String(error?.message || error) });
  }
});

server.listen(port, host, () => {
  console.log(`战斗试玩原型：http://${host}:${port}/  （A 回合制：/?mode=A  B 分阶段：/?mode=B）`);
  console.log(llmAvailable ? `模型叙事可用：${model}` : '模型叙事未配置：只用模板叙事（加 --model <模型名> 可开启）');
});
