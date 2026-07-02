#!/usr/bin/env node

// Find important mentioned-only characters missing from character-cards-v3.
//
// Produces reviewable artifacts only; does not modify canonical cards.
// DeepSeek: conservative identity/importance judgment.
// MiniMax: high-volume candidate/persona draft expansion.

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const materialRoot = '/Volumes/botsvault/06_material';
const generatedRoot = resolve(arg('generated-root', join(root, 'mod-kit/generated/deepseek-v4-flash')));
const outDir = resolve(arg('out-dir', join(generatedRoot, 'character-canon/mentioned-only-character-review')));
const nasBase = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/mentioned-only-character-review';
const defaultAliases = ['岳鸟人', '岳帅', '岳鹏举', '岳飞', '岳武穆'];
const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];

function arg(name, fallback = '') {
  const item = process.argv.slice(2).find(v => v === `--${name}` || v.startsWith(`--${name}=`));
  if (!item) return fallback;
  return item.includes('=') ? item.slice(item.indexOf('=') + 1) : '1';
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return [];
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return [[m[1], v]];
  }));
}

function parseJsonLoose(text) {
  const source = String(text || '').trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidateSource = fenced || source;
  const start = candidateSource.indexOf('{');
  let end = -1;
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidateSource.length; i += 1) {
      const ch = candidateSource[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
  }
  const candidate = start >= 0 && end > start ? candidateSource.slice(start, end) : '';
  if (!candidate.trim()) throw new Error(`empty JSON content: ${source.slice(0, 160)}`);
  return JSON.parse(candidate);
}

function extractMiniMaxText(raw) {
  const obj = JSON.parse(raw);
  return (obj.content || [])
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
}

async function openRouterJson(messages, label, opts = {}) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  const model = opts.model || process.env.XIANTU_MENTIONED_DEEPSEEK_MODEL || 'deepseek/deepseek-v4-flash';
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': 'XianTu Mentioned-Only Character Review',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: opts.maxTokens || 9000,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 600)}`);
      return parseJsonLoose(JSON.parse(body).choices?.[0]?.message?.content || '');
    } catch (error) {
      lastError = error;
      console.error(`[deepseek:${label}] attempt ${attempt}/4 failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

async function miniMaxJson(messages, label, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-mentioned-mmx-'));
  const file = join(dir, 'messages.json');
  writeFileSync(file, JSON.stringify(messages, null, 2));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('mmx', [
        'text', 'chat',
        '--messages-file', file,
        '--max-tokens', String(opts.maxTokens || 10000),
        '--temperature', String(opts.temperature ?? 0.15),
        '--output', 'json',
        '--non-interactive',
      ], { maxBuffer: 30 * 1024 * 1024 });
      return parseJsonLoose(extractMiniMaxText(stdout));
    } catch (error) {
      lastError = error;
      console.error(`[minimax:${label}] attempt ${attempt}/3 failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function stripHtml(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadBookChapters(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-mentioned-epub-'));
  execFileSync('unzip', ['-o', '-q', join(materialRoot, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  if (!base) throw new Error(`找不到章节目录: ${epub}`);
  return readdirSync(base)
    .filter(f => /\.(xhtml|html?)$/i.test(f) && /\d/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
    .map(file => {
      const text = stripHtml(readFileSync(join(base, file), 'utf8'));
      const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s]?[^\s，。]{0,18}/) || [file.replace(/\.(xhtml|html?)$/i, '')])[0];
      return { file, title, text };
    });
}

function windowsForAliases(chapters, aliases, maxPerAlias = 16) {
  const out = [];
  for (const alias of aliases) {
    let count = 0;
    const snippets = [];
    for (const ch of chapters) {
      let pos = ch.text.indexOf(alias);
      while (pos >= 0) {
        count += 1;
        if (snippets.length < maxPerAlias) {
          const start = Math.max(0, pos - 90);
          const end = Math.min(ch.text.length, pos + alias.length + 110);
          snippets.push({
            alias,
            chapter: ch.file,
            title: ch.title,
            snippet: ch.text.slice(start, end).replace(/\s+/g, ' ').trim(),
          });
        }
        pos = ch.text.indexOf(alias, pos + alias.length);
      }
    }
    out.push({ alias, count, snippets });
  }
  return out;
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '_backups' || name.endsWith('-backup')) continue;
      walkFiles(p, out);
    } else if (/\.(json|md|txt)$/i.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function generatedEvidence(aliases) {
  const roots = [
    join(generatedRoot, 'character-canon'),
    join(generatedRoot, 'shared-atlas'),
    join(generatedRoot, 'qingyu/stages'),
    join(generatedRoot, 'yunlong/stages'),
    join(generatedRoot, 'yange/stages'),
  ];
  const files = roots.flatMap(r => walkFiles(r));
  const perAlias = new Map(aliases.map(a => [a, { alias: a, count: 0, snippets: [] }]));
  for (const file of files) {
    const rel = file.startsWith(root) ? file.slice(root.length + 1) : file;
    const text = readFileSync(file, 'utf8').replace(/\s+/g, ' ');
    for (const alias of aliases) {
      let pos = text.indexOf(alias);
      while (pos >= 0) {
        const rec = perAlias.get(alias);
        rec.count += 1;
        if (rec.snippets.length < 24) {
          rec.snippets.push({
            file: rel,
            snippet: text.slice(Math.max(0, pos - 120), Math.min(text.length, pos + alias.length + 140)).trim(),
          });
        }
        pos = text.indexOf(alias, pos + alias.length);
      }
    }
  }
  return [...perAlias.values()];
}

function cardEvidence(cards, aliases) {
  return aliases.map(alias => {
    const mentions = cards
      .filter(c => JSON.stringify(c).includes(alias))
      .map(c => ({
        name: c.canonicalName,
        gender: c.gender || '',
        tier: c.tier || '',
        books: c.books || c.sourceBooks || [],
        identitySummary: c.staticProfile?.identitySummary || '',
        relationToProtagonist: c.staticProfile?.relationToProtagonist || [],
        keyEvents: (c.staticProfile?.keyEvents || []).filter(x => String(x).includes(alias)).slice(0, 5),
      }));
    return { alias, count: mentions.length, mentions };
  });
}

function contentEvidence(aliases) {
  const dirs = ['qingyu/stages', 'yunlong/stages', 'yange/stages'].map(d => join(generatedRoot, d));
  const rows = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.uncertainties.json'))) {
      const mod = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const stageId = mod.manifest?.id || mod.id || file.replace(/\.json$/, '');
      for (const bucket of ['items', 'techniques', 'skills']) {
        for (const item of mod.content?.[bucket] || []) {
          const text = JSON.stringify(item);
          if (!aliases.some(a => text.includes(a))) continue;
          rows.push({
            stageId,
            type: bucket,
            id: item.id,
            name: item.name,
            description: item.description || item.effect || item.category || '',
          });
        }
      }
    }
  }
  return rows;
}

function existingNameInfo(cards, aliases) {
  const exact = [];
  for (const c of cards) {
    const names = [c.canonicalName, ...(c.aliases || [])].filter(Boolean);
    if (names.some(n => aliases.includes(n))) exact.push({ canonicalName: c.canonicalName, aliases: c.aliases || [] });
  }
  return exact;
}

function redact(value) {
  return String(value || '')
    .replace(/性爱|性表达|性事|房事|春情|破身|处女|下体|私处|裸|淫|乳|胸|臀|肉|双修|床/g, '相关情节')
    .replace(/娇媚|妩媚|媚态|妖艳|诱惑|丰腴|前凸后凹|蛇腰/g, '外貌/气质描写')
    .replace(/侍奉|主人|女奴|奴隶|卖身契|拍卖/g, '从属/交易情节')
    .slice(0, 220);
}

function compactTargetForModel(target) {
  return {
    generatedAt: target.generatedAt,
    objective: target.objective,
    aliases: target.aliases,
    existingExactMatches: target.existingExactMatches,
    cardEvidence: target.cardEvidence.map(entry => ({
      alias: entry.alias,
      count: entry.count,
      mentions: entry.mentions.map(m => ({
        name: m.name,
        gender: m.gender,
        tier: m.tier,
        books: m.books,
        identitySummary: redact(m.identitySummary),
        relationToProtagonist: (m.relationToProtagonist || []).map(redact),
        keyEvents: (m.keyEvents || []).map(redact),
      })),
    })),
    generatedEvidence: target.generatedEvidence.map(entry => ({
      alias: entry.alias,
      count: entry.count,
      files: [...new Set(entry.snippets.map(s => s.file))].slice(0, 16),
      summarySnippets: entry.snippets
        .filter(s => !/backup|_debug|v2/i.test(s.file))
        .slice(0, 8)
        .map(s => ({ file: s.file, snippet: redact(s.snippet) })),
    })),
    contentEvidence: target.contentEvidence.map(item => ({
      stageId: item.stageId,
      type: item.type,
      id: item.id,
      name: item.name,
      description: redact(item.description),
    })).slice(0, 160),
    epubEvidence: target.epubEvidence.map(book => ({
      book: book.book,
      title: book.title,
      aliasCounts: book.aliasHits.map(hit => ({
        alias: hit.alias,
        count: hit.count,
        chapters: [...new Set(hit.snippets.map(s => `${s.chapter}:${s.title}`))].slice(0, 12),
      })),
    })),
  };
}

function buildDeepSeekMessages(target) {
  const compactTarget = compactTargetForModel(target);
  return [
    {
      role: 'system',
      content: [
        '你是六朝/仙途角色正典整理助手，任务是判断“被多次提及但 v3 角色卡缺失”的角色是否应新增为 mentioned-only 角色卡。',
        '只基于输入证据做保守判断。不得照抄原文长段，不得写露骨内容。证据不足要标 low，不要硬编。',
        '输出严格 JSON，不要 Markdown。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `请根据证据输出 JSON：
{"characters":[{"canonicalName":"","aliases":[],"shouldAdd":true,"status":"missing|already_covered|merge_with_existing|uncertain","importance":"主要|次要|背景","gender":"","books":[],"roleSummary":"","personality":[],"relationNetwork":[],"mentionedBy":[],"weapons":[],"techniques":[],"items":[],"sourceEvidence":["短证据摘要"],"reviewNotes":"","confidence":"high|medium|low"}],"additionalCandidates":[{"name":"","aliases":[],"why":"","confidence":"medium|low"}]}

判定规则：
- 如果别名已经由现有角色卡明确覆盖，status=already_covered 或 merge_with_existing。
- 如果是重要背景人物、旧部/亲属/遗物/势力源头反复关联，即便未出场，也可 shouldAdd=true。
- weapons/techniques/items 只整理输入证据出现的遗物、功法、道具；不确定时写 reviewNotes。
- sourceEvidence 只写摘要，不要复制长句。

证据包：
${JSON.stringify(compactTarget, null, 2)}`
    }
  ];
}

function buildMiniMaxMessages(target) {
  const compactTarget = compactTargetForModel(target);
  return [
    {
      role: 'system',
      content: [
        '你是长篇小说角色资料编辑，擅长发现被频繁提及但没有独立卡片的重要配角。',
        '把输入证据整理成可审核的角色卡草案；可以提出额外候选，但必须说明依据来自输入证据的哪类线索。',
        '不要写露骨内容，不要照抄原文，不要把猜测写成事实。只输出 JSON。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `输出 JSON：
{"characters":[{"canonicalName":"","aliases":[],"shouldAdd":true,"importance":"主要|次要|背景","gender":"","books":[],"roleSummary":"","personaDraft":[""],"relations":[""],"loadout":{"weapons":[],"techniques":[],"items":[]},"modUse":"可作为回忆/遗物/旧部关系节点/背景势力节点","confidence":"high|medium|low","notes":""}],"additionalCandidates":[{"name":"","aliases":[],"why":"","confidence":"medium|low"}]}

重点：
- 岳鸟人/岳帅/岳鹏举是否应合为同一缺失角色卡。
- 多次被他人提及、有遗物、旧部、子女、势力影响的角色，应标成可审核候选。
- 额外候选要谨慎，宁缺毋滥。

证据包：
${JSON.stringify(compactTarget, null, 2)}`
    }
  ];
}

function byName(arr = []) {
  const map = new Map();
  for (const x of arr) {
    const key = x.canonicalName || x.name;
    if (key) map.set(key, x);
  }
  return map;
}

function firstNonEmpty(...items) {
  for (const item of items) {
    if (Array.isArray(item) && item.length) return item;
    if (typeof item === 'string' && item.trim()) return item;
    if (typeof item === 'boolean') return item;
  }
  return Array.isArray(items[0]) ? [] : '';
}

function mergeProposals(target, deepseek, minimax) {
  const ds = byName(deepseek.characters || []);
  const mm = byName(minimax.characters || []);
  const names = new Set([...ds.keys(), ...mm.keys()]);
  if (names.size === 0) names.add(target.aliases[0]);
  const proposals = [...names].map(name => {
    const d = ds.get(name) || {};
    const m = mm.get(name) || {};
    const aliases = [...new Set([...(d.aliases || []), ...(m.aliases || []), ...target.aliases])];
    return {
      canonicalName: d.canonicalName || m.canonicalName || name,
      aliases,
      shouldAdd: typeof d.shouldAdd === 'boolean' ? d.shouldAdd : (typeof m.shouldAdd === 'boolean' ? m.shouldAdd : true),
      status: d.status || (d.shouldAdd === false ? 'uncertain' : 'missing'),
      importance: d.importance || m.importance || '背景',
      gender: d.gender || m.gender || '',
      books: [...new Set([...(d.books || []), ...(m.books || [])])],
      roleSummary: d.roleSummary || m.roleSummary || '',
      personality: firstNonEmpty(d.personality, m.personaDraft),
      relationNetwork: firstNonEmpty(d.relationNetwork, m.relations),
      mentionedBy: d.mentionedBy || [],
      weapons: firstNonEmpty(d.weapons, m.loadout?.weapons),
      techniques: firstNonEmpty(d.techniques, m.loadout?.techniques),
      items: firstNonEmpty(d.items, m.loadout?.items),
      sourceEvidence: d.sourceEvidence || [],
      modUse: m.modUse || '',
      reviewNotes: [d.reviewNotes, m.notes].filter(Boolean).join('\n'),
      confidence: { deepseek: d.confidence || 'missing', minimax: m.confidence || 'missing' },
      needsReview: true,
      evidenceStats: {
        cardMentions: target.cardEvidence.reduce((n, x) => n + x.count, 0),
        generatedMentions: target.generatedEvidence.reduce((n, x) => n + x.count, 0),
        epubMentions: target.epubEvidence.reduce((n, book) => n + book.aliasHits.reduce((m, x) => m + x.count, 0), 0),
        contentRefs: target.contentEvidence.length,
      },
      sourceAliases: target.aliases,
    };
  });
  const additionalCandidates = [
    ...(deepseek.additionalCandidates || []),
    ...(minimax.additionalCandidates || []),
  ];
  return { proposals, additionalCandidates };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function area(field, value, isArray = true) {
  const text = Array.isArray(value) ? value.join('\n') : String(value || '');
  return `<textarea class="edit" data-field="${escapeHtml(field)}" data-array="${isArray ? 'yes' : 'no'}" spellcheck="false">${escapeHtml(text)}</textarea>`;
}

function pill(text, cls = '') {
  return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
}

async function buildHtml(proposalsFile, output) {
  const data = JSON.parse(await readFile(proposalsFile, 'utf8'));
  const cards = data.proposals.map((p, index) => {
    const patch = JSON.stringify({
      canonicalName: p.canonicalName,
      aliases: p.aliases,
      tier: p.importance,
      gender: p.gender,
      books: p.books,
      staticProfile: {
        identitySummary: p.roleSummary,
        personality: p.personality,
        relationNetwork: p.relationNetwork,
        signatureAbilities: [...(p.weapons || []), ...(p.techniques || []), ...(p.items || [])],
      },
      reviewOnly: true,
    }, null, 2);
    return `<article class="card" data-search="${escapeHtml([p.canonicalName, ...(p.aliases || []), p.roleSummary, p.reviewNotes].join(' ').toLowerCase())}">
      <header>
        <div>
          <div class="title"><h2>${index + 1}. ${escapeHtml(p.canonicalName)}</h2><label><input type="checkbox" class="reviewed"> 已审核</label></div>
          <div class="meta">
            ${pill(p.status)}
            ${pill(p.importance)}
            ${pill(`DeepSeek: ${p.confidence?.deepseek || 'missing'}`)}
            ${pill(`MiniMax: ${p.confidence?.minimax || 'missing'}`)}
          </div>
        </div>
      </header>
      <section class="grid">
        <label>canonicalName ${area('canonicalName', p.canonicalName, false)}</label>
        <label>aliases ${area('aliases', p.aliases)}</label>
        <label>gender ${area('gender', p.gender, false)}</label>
        <label>books ${area('books', p.books)}</label>
        <label>importance ${area('importance', p.importance, false)}</label>
        <label>status ${area('status', p.status, false)}</label>
      </section>
      <section><h3>角色定位</h3>${area('roleSummary', p.roleSummary, false)}</section>
      <section class="grid">
        <label>人格草案 ${area('personality', p.personality)}</label>
        <label>关系网络 ${area('relationNetwork', p.relationNetwork)}</label>
        <label>被谁提及 ${area('mentionedBy', p.mentionedBy)}</label>
        <label>证据摘要 ${area('sourceEvidence', p.sourceEvidence)}</label>
      </section>
      <section class="grid">
        <label>武器 ${area('weapons', p.weapons)}</label>
        <label>功法 ${area('techniques', p.techniques)}</label>
        <label>道具/遗物 ${area('items', p.items)}</label>
      </section>
      <section><h3>审核备注</h3>${area('reviewNotes', p.reviewNotes, false)}</section>
      <details><summary>统计 / JSON 补丁</summary><pre>${escapeHtml(JSON.stringify(p.evidenceStats, null, 2))}</pre><pre class="patch">${escapeHtml(patch)}</pre></details>
    </article>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>缺失重要配角审核</title>
<style>
body{margin:0;background:#f6f6f2;color:#202124;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.top{position:sticky;top:0;z-index:5;background:rgba(246,246,242,.96);border-bottom:1px solid #d8d6cf;backdrop-filter:blur(8px)}
.wrap{max-width:1220px;margin:0 auto;padding:16px 20px}
h1{font-size:22px;margin:0 0 10px}h2{font-size:18px;margin:0}h3{font-size:14px;margin:10px 0 6px}
.controls{display:grid;grid-template-columns:1fr auto auto;gap:8px}input,button,textarea{border:1px solid #d8d6cf;border-radius:6px;background:white;color:#202124;font:inherit}input,button{height:36px;padding:0 10px}button{cursor:pointer}
.card{background:white;border:1px solid #d8d6cf;border-radius:8px;margin:12px 0;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}.card.done{border-color:#8fc79c;box-shadow:0 0 0 2px rgba(33,110,57,.08)}
.title{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.title label{display:inline-flex;gap:6px;align-items:center;border:1px solid #d8d6cf;border-radius:999px;padding:3px 10px;color:#5f6368}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.pill{display:inline-flex;border:1px solid #d8d6cf;border-radius:999px;padding:2px 8px;background:#fafafa;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label{display:block;color:#5f6368;font-size:12px}textarea{display:block;width:100%;min-height:86px;margin-top:4px;padding:8px;resize:vertical;color:#202124}.grid label:nth-child(-n+6) textarea{min-height:44px}
pre{white-space:pre-wrap;background:#f8f9fa;border:1px solid #e2e2dd;border-radius:6px;padding:10px;overflow:auto}.hidden{display:none}
@media(max-width:760px){.controls,.grid{grid-template-columns:1fr}.wrap{padding:12px}}
</style>
</head>
<body>
<div class="top"><div class="wrap">
<h1>缺失重要配角审核</h1>
<div class="controls"><input id="q" placeholder="搜索角色/别名/备注"><button id="exportAll">导出全部</button><button id="exportReviewed">导出已审核</button></div>
<p>候选 ${data.proposals.length} 个；只用于人工审核，不会自动写回角色卡。</p>
</div></div>
<main class="wrap" id="cards">${cards}</main>
<script>
const KEY='xiantu.mentionedOnlyCharacterReview.v1';
const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
function readCard(card){
  const obj={reviewed:card.querySelector('.reviewed').checked};
  card.querySelectorAll('.edit').forEach(el=>{
    const val=el.dataset.array==='yes'?el.value.split(/\\n/).map(x=>x.trim()).filter(Boolean):el.value.trim();
    obj[el.dataset.field]=val;
  });
  return obj;
}
function save(){
  const data={};
  document.querySelectorAll('.card').forEach(card=>{data[card.querySelector('[data-field="canonicalName"]').value.trim()||Math.random()]=readCard(card)});
  localStorage.setItem(KEY,JSON.stringify(data));
}
document.querySelectorAll('.card').forEach(card=>{
  const name=card.querySelector('[data-field="canonicalName"]').value.trim();
  if(saved[name]){
    card.querySelector('.reviewed').checked=!!saved[name].reviewed;
    card.classList.toggle('done',!!saved[name].reviewed);
    card.querySelectorAll('.edit').forEach(el=>{if(saved[name][el.dataset.field]!=null)el.value=Array.isArray(saved[name][el.dataset.field])?saved[name][el.dataset.field].join('\\n'):saved[name][el.dataset.field]});
  }
  card.addEventListener('input',save);
  card.querySelector('.reviewed').addEventListener('change',e=>{card.classList.toggle('done',e.target.checked);save()});
});
document.getElementById('q').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  document.querySelectorAll('.card').forEach(card=>card.classList.toggle('hidden',q&&!card.dataset.search.includes(q)));
});
function download(name,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click()}
document.getElementById('exportAll').onclick=()=>download('mentioned-only-character-review-all.json',[...document.querySelectorAll('.card')].map(readCard));
document.getElementById('exportReviewed').onclick=()=>download('mentioned-only-character-review-reviewed.json',[...document.querySelectorAll('.card')].map(readCard).filter(x=>x.reviewed));
</script>
</body>
</html>`;
  await writeFile(output, html);
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const aliases = arg('aliases', defaultAliases.join(',')).split(',').map(s => s.trim()).filter(Boolean);
  const modelMode = arg('models', 'deepseek,minimax').split(',').map(s => s.trim()).filter(Boolean);
  const cardsFile = join(generatedRoot, 'character-canon/character-cards-v3.json');
  const cardsData = JSON.parse(await readFile(cardsFile, 'utf8'));
  const cards = cardsData.characters || [];

  const target = {
    generatedAt: new Date().toISOString(),
    objective: 'Find important mentioned-only characters missing from character-cards-v3.',
    aliases,
    existingExactMatches: existingNameInfo(cards, aliases),
    cardEvidence: cardEvidence(cards, aliases),
    generatedEvidence: generatedEvidence(aliases),
    contentEvidence: contentEvidence(aliases),
    epubEvidence: [],
  };
  for (const book of books) {
    const chapters = loadBookChapters(book.epub);
    target.epubEvidence.push({ book: book.id, title: book.title, aliasHits: windowsForAliases(chapters, aliases) });
  }
  await writeFile(join(outDir, 'targets.json'), `${JSON.stringify(target, null, 2)}\n`);

  let deepseek = { characters: [], additionalCandidates: [] };
  let minimax = { characters: [], additionalCandidates: [] };
  if (modelMode.includes('deepseek')) {
    const file = join(outDir, 'deepseek.batch-001.json');
    if (existsSync(file)) deepseek = JSON.parse(readFileSync(file, 'utf8'));
    else {
      try {
        deepseek = await openRouterJson(buildDeepSeekMessages(target), 'mentioned-only-001');
      } catch (error) {
        deepseek = { characters: [], additionalCandidates: [], error: error.message };
      }
      await writeFile(file, `${JSON.stringify(deepseek, null, 2)}\n`);
    }
  }
  if (modelMode.includes('minimax')) {
    const file = join(outDir, 'minimax.batch-001.json');
    if (existsSync(file)) minimax = JSON.parse(readFileSync(file, 'utf8'));
    else {
      try {
        minimax = await miniMaxJson(buildMiniMaxMessages(target), 'mentioned-only-001');
      } catch (error) {
        minimax = { characters: [], additionalCandidates: [], error: error.message };
      }
      await writeFile(file, `${JSON.stringify(minimax, null, 2)}\n`);
    }
  }

  const merged = mergeProposals(target, deepseek, minimax);
  const proposalsFile = join(outDir, 'mentioned-only-character-proposals.json');
  await writeFile(proposalsFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceRoot: generatedRoot,
    aliases,
    modelErrors: { deepseek: deepseek.error || '', minimax: minimax.error || '' },
    proposals: merged.proposals,
    additionalCandidates: merged.additionalCandidates,
  }, null, 2)}\n`);
  await writeFile(join(outDir, 'REPORT.md'), [
    '# Mentioned-only character review',
    '',
    `- Aliases: ${aliases.join(', ')}`,
    `- Proposals: ${merged.proposals.length}`,
    `- Additional candidates: ${merged.additionalCandidates.length}`,
    `- DeepSeek error: ${deepseek.error || 'none'}`,
    `- MiniMax error: ${minimax.error || 'none'}`,
    '',
    '## Proposals',
    ...merged.proposals.map(p => `- ${p.canonicalName}: ${p.status}, ${p.importance}, DeepSeek=${p.confidence.deepseek}, MiniMax=${p.confidence.minimax}`),
    '',
  ].join('\n'));
  await buildHtml(proposalsFile, join(outDir, 'review.html'));

  const stamp = new Date().toISOString().slice(0, 10);
  const nasDir = join(nasBase, `character-canon-${stamp}`);
  if (existsSync('/Volumes/botsvault')) {
    await mkdir(nasDir, { recursive: true });
    for (const file of ['targets.json', 'deepseek.batch-001.json', 'minimax.batch-001.json', 'mentioned-only-character-proposals.json', 'REPORT.md', 'review.html']) {
      if (existsSync(join(outDir, file))) {
        await writeFile(join(nasDir, file), await readFile(join(outDir, file)));
      }
    }
  }

  console.log(JSON.stringify({ outDir, nasDir, proposals: merged.proposals.length, additionalCandidates: merged.additionalCandidates.length }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
