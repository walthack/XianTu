#!/usr/bin/env node
/**
 * 主叙事推理档实测（2026-11-03）：同一份主叙事请求体，分别以「改前」（不带 reasoning_effort＝MiniMax 默认 max）
 * 与「改后」（reasoning_effort＝mod-kit aiRetry.reasoning.mainNarrative.effort）流式各发 N 次，交替进行，
 * 记录耗时、首字节、首段推理/正文时刻、推理字数、正文字数、finish、usage 以及正文能否被游戏解析器解析。
 *
 * 鉴权：本脚本不读取、不接收、不发送、不打印任何 key——请求只带 Content-Type/Accept 两个头。
 * --base 必须指向「由服务端注入 key」的 OpenAI 兼容代理（…/chat/completions 可省略）。仓库内 8091/webpack dev server
 * 目前没有这样的端点（只有 /api/v1/save-storage 与转发到后端 8080 的 /api 通用代理），见 docs/MAIN-NARRATIVE-REASONING-2026-11-03.md。
 *
 * 用法：
 *   node scripts/bench-narrative-reasoning.mjs --body <请求体.json> --base <代理 URL> [--n 3]
 *   node scripts/bench-narrative-reasoning.mjs --ctx <ctx.log> [--event lcq.event.s01_05] [--pick last|first|<req>] --base <URL>
 *   node scripts/bench-narrative-reasoning.mjs --body <请求体.json> --dry-run      # 不联网，只打印两组请求体差异
 * 选项：--effort <low|medium|high|xhigh|max>（默认读 mod-kit）；--before-effort <omit|low|…|max>（默认 omit）；
 *       --timeout-ms 300000；--out <结果.jsonl>（只写指标，不写请求头/正文）；--keep-text（结果里附正文前 200 字）。
 * 请求体：完整 OpenAI chat 请求体（含 model/messages），或仅 { "messages": [...] } 再用 --model 指定（默认 MiniMax-M3.1-Flash）。
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = new URL('../', import.meta.url);
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('src', root)) } });
const { stripModelThinking, parseJsonSmart, narrativeOutsideJson } = await jiti.import(fileURLToPath(new URL('src/utils/jsonExtract.ts', root)));

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const REASONING_KEYS = ['reasoning_effort', 'thinking', 'reasoning'];
const SECRET_KEY_RE = /^(api[-_]?key|apikey|authorization|x-api-key|key|token|secret|bearer)$/i;

export function parseArgs(argv) {
  const args = { n: 3, timeoutMs: 300000, event: 'lcq.event.s01_05', pick: 'last', beforeEffort: 'omit', model: 'MiniMax-M3.1-Flash' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${flag} 缺少取值`); return v; };
    if (flag === '--base') args.base = next();
    else if (flag === '--body') args.body = next();
    else if (flag === '--ctx') args.ctx = next();
    else if (flag === '--event') args.event = next();
    else if (flag === '--pick') args.pick = next();
    else if (flag === '--n') args.n = Number(next());
    else if (flag === '--effort') args.effort = next();
    else if (flag === '--before-effort') args.beforeEffort = next();
    else if (flag === '--timeout-ms') args.timeoutMs = Number(next());
    else if (flag === '--model') args.model = next();
    else if (flag === '--out') args.out = next();
    else if (flag === '--keep-text') args.keepText = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '-h' || flag === '--help') args.help = true;
    else throw new Error(`未知参数：${flag}`);
  }
  if (!(Number.isInteger(args.n) && args.n > 0)) throw new Error('--n 须为正整数');
  if (args.effort !== undefined && !EFFORTS.includes(args.effort)) throw new Error(`--effort 须为 ${EFFORTS.join('/')}`);
  if (args.beforeEffort !== 'omit' && !EFFORTS.includes(args.beforeEffort)) throw new Error(`--before-effort 须为 omit/${EFFORTS.join('/')}`);
  return args;
}

/** 配置里的改后档位（mod-kit 权威三分包，不读合并产物以外的东西）。 */
export function configuredEffort() {
  const runtime = JSON.parse(readFileSync(new URL('mod-kit/numbers-runtime.json', root), 'utf8'));
  return runtime.aiRetry.reasoning.mainNarrative.effort;
}

/** 去掉请求体里任何疑似凭据字段（只报字段名，不报值）。 */
export function scrubSecrets(value, path = [], removed = []) {
  if (Array.isArray(value)) return { value: value.map((item, i) => scrubSecrets(item, [...path, i], removed).value), removed };
  if (!value || typeof value !== 'object') return { value, removed };
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key) && path.length < 2 && typeof item !== 'object') { removed.push([...path, key].join('.')); continue; }
    out[key] = scrubSecrets(item, [...path, key], removed).value;
  }
  return { value: out, removed };
}

export function normalizeBody(raw, model) {
  const parsed = raw?.body && typeof raw.body === 'object' ? raw.body : raw;
  if (!Array.isArray(parsed?.messages) || !parsed.messages.length) throw new Error('请求体缺少 messages 数组');
  const { value, removed } = scrubSecrets(parsed);
  const body = { ...value, model: value.model || model, stream: true };
  for (const key of REASONING_KEYS) delete body[key];
  return { body, removed };
}

/** ctx.log 每行一个 JSON；真机驱动目前只记分段长度与段首 30 字（topSections），没有完整正文——此时无法还原请求体。 */
export function pickCtxEntry(text, event, pick) {
  const entries = text.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
    .filter(entry => JSON.stringify(entry).includes(event));
  if (!entries.length) throw new Error(`ctx.log 里没有含 ${event} 的请求`);
  const entry = pick === 'first' ? entries[0] : pick === 'last' ? entries[entries.length - 1] : entries.find(e => String(e.req) === String(pick));
  if (!entry) throw new Error(`ctx.log 里没有 req=${pick} 的 ${event} 请求`);
  if (Array.isArray(entry.messages) || entry.body?.messages) return { entry, raw: entry.body?.messages ? entry.body : { messages: entry.messages } };
  return { entry, raw: null };
}

export function buildVariants(body, afterEffort, beforeEffort) {
  const before = { ...body };
  if (beforeEffort !== 'omit') before.reasoning_effort = beforeEffort;
  return [
    { name: `改前(${beforeEffort === 'omit' ? '不带＝默认max' : beforeEffort})`, body: before },
    { name: `改后(${afterEffort})`, body: { ...body, reasoning_effort: afterEffort } },
  ];
}

export function chatEndpoint(base) {
  const url = new URL(base);
  if (!/\/chat\/completions\/?$/.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
  return url.toString();
}

/** 与游戏同口径：去思考块→强 JSON 解析（主叙事 rf=json_object）→取 text/叙事文本/narrative，空则取 JSON 外正文。 */
export function checkGameParse(content, forceJson = true) {
  try {
    const obj = parseJsonSmart(content, forceJson);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { jsonOk: false, textChars: 0, parseError: '不是 JSON 对象' };
    const text = String(obj.text || obj.叙事文本 || obj.narrative || '') || narrativeOutsideJson(stripModelThinking(content));
    return { jsonOk: true, textChars: text.trim().length, parseError: text.trim() ? undefined : '无正文 text' };
  } catch (error) {
    return { jsonOk: false, textChars: 0, parseError: error instanceof Error ? error.message : String(error) };
  }
}

/** 累计一个 SSE data 事件；推理来自 reasoning_content/reasoning 字段或 content 里的 <think>。 */
export function accumulate(state, data, now) {
  if (data.usage) state.usage = data.usage;
  const choice = data.choices?.[0];
  if (choice?.finish_reason) state.finish = choice.finish_reason;
  const delta = choice?.delta || choice?.message || {};
  const reasoning = delta.reasoning_content ?? delta.reasoning ?? (Array.isArray(delta.reasoning_details) ? delta.reasoning_details.map(d => d?.text || '').join('') : '');
  if (typeof reasoning === 'string' && reasoning) { state.reasoning += reasoning; state.firstReasoningMs ??= now; }
  if (typeof delta.content === 'string' && delta.content) {
    state.raw += delta.content;
    if (stripModelThinking(state.raw)) state.firstContentMs ??= now;
  }
}

export function finalize(state) {
  const thinkInContent = (state.raw.match(/<think>([\s\S]*?)(?:<\/think>|$)/gi) || []).join('').replace(/<\/?think>/gi, '');
  const content = stripModelThinking(state.raw);
  const usage = state.usage || {};
  return {
    reasoningChars: state.reasoning.length + thinkInContent.length,
    contentChars: content.length,
    finish: state.finish ?? null,
    completionTokens: usage.completion_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? null,
    ...checkGameParse(state.raw),
    content,
  };
}

async function runOnce(endpoint, body, timeoutMs) {
  const started = performance.now();
  const at = () => Math.round(performance.now() - started);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`超时 ${timeoutMs}ms`)), timeoutMs);
  const state = { raw: '', reasoning: '', finish: undefined, usage: undefined, firstReasoningMs: undefined, firstContentMs: undefined };
  let status = null, ttfbMs = null, error;
  try {
    // 只有这两个头：没有 Authorization，key 只能由 --base 指向的服务端代理注入。
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    status = response.status;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      ttfbMs ??= at();
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try { accumulate(state, JSON.parse(payload), at()); } catch { /* 非 JSON 行（注释/心跳）跳过 */ }
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally { clearTimeout(timer); }
  return { status, totalMs: at(), ttfbMs, firstReasoningMs: state.firstReasoningMs ?? null, firstContentMs: state.firstContentMs ?? null, ...finalize(state), error };
}

const median = values => { const v = values.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const mean = values => { const v = values.filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

export function summarize(results) {
  const byVariant = new Map();
  for (const result of results) byVariant.set(result.variant, [...(byVariant.get(result.variant) || []), result]);
  return [...byVariant].map(([variant, rows]) => ({
    variant, n: rows.length, errors: rows.filter(r => r.error).length,
    totalMsMedian: median(rows.map(r => r.totalMs)), totalMsMean: mean(rows.map(r => r.totalMs)),
    ttfbMsMedian: median(rows.map(r => r.ttfbMs)), firstContentMsMedian: median(rows.map(r => r.firstContentMs)),
    reasoningCharsMean: mean(rows.map(r => r.reasoningChars)), contentCharsMean: mean(rows.map(r => r.contentChars)),
    jsonOk: `${rows.filter(r => r.jsonOk).length}/${rows.length}`,
    finish: [...new Set(rows.map(r => r.finish))].join(','),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.body && !args.ctx)) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, ''));
    process.exit(args.help ? 0 : 1);
  }
  let raw;
  if (args.body) raw = JSON.parse(readFileSync(args.body, 'utf8'));
  else {
    const picked = pickCtxEntry(readFileSync(args.ctx, 'utf8'), args.event, args.pick);
    if (!picked.raw) {
      const parts = (picked.entry.parts || []).map(p => `#${p.i} ${p.role} ${p.len}字`).join('；');
      console.error(`ctx.log 的 req=${picked.entry.req}（${picked.entry.t}，共 ${picked.entry.total} 字：${parts}）只有分段长度与段首摘要，没有完整正文，无法还原请求体。`);
      console.error('请让真机驱动把该请求的 request.postData() 原样另存为 JSON（不含请求头），再用 --body 传入。');
      process.exit(2);
    }
    raw = picked.raw;
  }
  const { body, removed } = normalizeBody(raw, args.model);
  if (removed.length) console.warn(`已从请求体删除疑似凭据字段（值未读取/未打印）：${removed.join(', ')}`);
  const afterEffort = args.effort || configuredEffort();
  const variants = buildVariants(body, afterEffort, args.beforeEffort);
  const inChars = body.messages.reduce((sum, m) => sum + String(m.content ?? '').length, 0);
  console.log(`model=${body.model} messages=${body.messages.length} inChars=${inChars} max_tokens=${body.max_tokens ?? body.max_completion_tokens ?? '-'} rf=${body.response_format?.type ?? ''}`);
  for (const v of variants) console.log(`  ${v.name}: reasoning_effort=${v.body.reasoning_effort ?? '（不带）'}`);
  if (args.dryRun) return;
  if (!args.base) throw new Error('缺少 --base（服务端注入 key 的代理地址）');
  const endpoint = chatEndpoint(args.base);
  console.log(`endpoint=${endpoint} n=${args.n}（改前/改后交替）`);
  const results = [];
  for (let i = 0; i < args.n; i++) {
    for (const variant of variants) {
      const result = { variant: variant.name, run: i + 1, ...(await runOnce(endpoint, variant.body, args.timeoutMs)) };
      const { content, ...metrics } = result;
      if (args.keepText) metrics.contentHead = content.slice(0, 200);
      results.push(metrics);
      console.log(JSON.stringify(metrics));
      if (args.out) appendFileSync(args.out, JSON.stringify({ t: new Date().toISOString(), model: body.model, inChars, ...metrics }) + '\n');
    }
  }
  console.table(summarize(results));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
