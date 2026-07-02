#!/usr/bin/env node

// Multi-model enrichment draft for 六朝 character canon v3.
//
// Produces reviewable draft files only; does not modify canonical cards or mods.
// DeepSeek: conservative structured extraction / normalization.
// MiniMax: high-volume role texture and playable weapon/technique suggestions.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

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
  if (!candidate.trim()) throw new Error(`empty JSON content: ${source.slice(0, 120)}`);
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
  const model = opts.model || process.env.XIANTU_ENRICH_DEEPSEEK_MODEL || 'deepseek/deepseek-v4-flash';
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': 'XianTu Character Enrichment',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: opts.maxTokens || 6000,
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
  const dir = mkdtempSync(join(tmpdir(), 'xt-mmx-'));
  const file = join(dir, 'messages.json');
  writeFileSync(file, JSON.stringify(messages, null, 2));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('mmx', [
        'text', 'chat',
        '--messages-file', file,
        '--max-tokens', String(opts.maxTokens || 8000),
        '--temperature', String(opts.temperature ?? 0.2),
        '--output', 'json',
        '--non-interactive',
      ], { maxBuffer: 20 * 1024 * 1024 });
      return parseJsonLoose(extractMiniMaxText(stdout));
    } catch (error) {
      lastError = error;
      console.error(`[minimax:${label}] attempt ${attempt}/3 failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function isEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === '';
}

function safeText(value) {
  return String(value || '')
    .replace(/性爱|性表达|性事|房事|春情|侍奉|主人|娇媚|妩媚|媚态|内宅|宠爱|情欲/g, match => {
      const map = {
        性爱: '情感依附',
        性表达: '情绪表达',
        性事: '私事',
        房事: '私事',
        春情: '情绪波动',
        侍奉: '服侍',
        主人: '保护者',
        娇媚: '娇俏',
        妩媚: '妩丽',
        媚态: '姿态',
        内宅: '随行圈层',
        宠爱: '关注',
        情欲: '情绪',
      };
      return map[match] || '相关';
    })
    .replace(/奴隶|女奴|卖身契|拍卖|艳|诱惑|丰腴|前凸后凹|蛇腰|乳|胸|臀|肉|裸|性|床|房事|侍奉|破身|处女|私处|下体|淫|媚/g, match => {
      const map = {
        奴隶: '受困者',
        女奴: '受困女子',
        卖身契: '契约',
        拍卖: '交易',
        艳: '美',
        诱惑: '魅力',
        丰腴: '成熟',
        前凸后凹: '仪态鲜明',
        蛇腰: '舞姿柔韧',
        乳: '身形',
        胸: '身形',
        臀: '身形',
        肉: '身体',
        裸: '无遮掩',
        性: '个性',
        床: '内室',
        房事: '私事',
        侍奉: '服侍',
        破身: '遭遇变故',
        处女: '清白女子',
        私处: '隐私',
        下体: '身体',
        淫: '放纵',
        媚: '妩丽',
      };
      return map[match] || '相关';
    })
    .replace(/个性爱/g, '情感依附')
    .slice(0, 600);
}

function femaleish(c) {
  return c.gender === '女' || /姬|妃|后|娘|姑|女|媛|珠|莲|香|凝|羽|燕|紫|娥|姝|霜|兰|瑶|仙|姊|妹/.test(c.canonicalName);
}

function weakPersonality(c) {
  const p = c.staticProfile || {};
  return femaleish(c) && (
    !Array.isArray(p.personality) || p.personality.length < 4 ||
    isEmpty(p.speechStyle) ||
    !Array.isArray(p.principles) || p.principles.length < 1 ||
    !Array.isArray(p.goals) || p.goals.length < 1 ||
    !Array.isArray(p.weaknesses) || p.weaknesses.length < 1
  );
}

function weakAbilities(c) {
  const arr = c.staticProfile?.signatureAbilities;
  if (!Array.isArray(arr) || arr.length === 0) return true;
  const text = arr.join('');
  return text.length < 8 || /^[-无暂无]$/.test(text.trim());
}

function compactCard(c) {
  const p = c.staticProfile || {};
  return {
    name: c.canonicalName,
    gender: c.gender || '',
    books: c.books || [],
    tier: c.tier || '',
    identitySummary: safeText(p.identitySummary || ''),
    personality: p.personality || [],
    speechStyle: safeText(p.speechStyle || ''),
    principles: (p.principles || []).map(safeText),
    goals: (p.goals || []).map(safeText),
    weaknesses: (p.weaknesses || []).map(safeText),
    signatureAbilities: (p.signatureAbilities || []).map(safeText),
    relationToProtagonist: (p.relationToProtagonist || []).map(safeText),
    keyEvents: (p.keyEvents || []).slice(0, 8).map(safeText),
    phaseIdentities: (c.phaseIdentities || []).slice(0, 4).map(x => ({
      stageId: x.stageId,
      book: x.book,
      identity: safeText(x.identity),
      role: safeText(x.role),
      notes: (x.notes || []).map(safeText),
    })),
  };
}

async function stageRefs(generatedRoot) {
  const out = new Map();
  const books = ['qingyu', 'yunlong', 'yange'];
  for (const book of books) {
    const stageDir = join(generatedRoot, book, 'stages');
    if (!existsSync(stageDir)) continue;
    for (const f of await readdir(stageDir)) {
      if (!f.endsWith('.json') || f.endsWith('.uncertainties.json')) continue;
      const mod = JSON.parse(await readFile(join(stageDir, f), 'utf8'));
      const contentName = new Map();
      for (const bucket of ['items', 'techniques', 'skills']) {
        for (const item of mod.content?.[bucket] || []) {
          contentName.set(item.id, { id: item.id, name: item.name, type: bucket, description: item.description || item.effect || item.category || '' });
        }
      }
      for (const c of mod.canon?.characters || []) {
        const rec = out.get(c.name) || [];
        rec.push({
          stageId: mod.manifest?.id || mod.id || f.replace(/\.json$/, ''),
          role: safeText(c.role || ''),
          skillIds: c.skillIds || [],
          techniqueIds: c.techniqueIds || [],
          itemIds: c.itemIds || [],
          content: [...(c.skillIds || []), ...(c.techniqueIds || []), ...(c.itemIds || [])]
            .map(id => {
              const item = contentName.get(id) || { id, name: id, type: 'unknown', description: '' };
              return { ...item, description: safeText(item.description || '') };
            }),
        });
        out.set(c.name, rec);
      }
    }
  }
  return out;
}

function buildDeepSeekMessages(batch) {
  return [
    {
      role: 'system',
      content: [
        '你是六朝/仙途角色设定整理助手。只基于输入中的 v3 角色卡、stage 投影和已有 content 引用做保守补全。',
        '任务1：细化女性/疑似女性角色人格，但不得写露骨内容，不得复制原文长句。',
        '任务2：为角色补足可进入 mod 的 weaponCandidates / techniqueCandidates / itemCandidates。若原资料不足，标 confidence=low 且 basis 写“阶段资料不足”。',
        '遇到敏感或资料不足时也必须输出 JSON，不要拒答；只写脱敏的角色设定摘要。',
        '禁止输出：性表达、性爱、房事、春情、内宅、宠爱、侍奉、主人、娇媚等性化/从属化词；改写为依附关系、情绪表达、保护者、随行圈层等中性表述。',
        '输出严格 JSON，不要 Markdown。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `请为以下角色输出：
{"characters":[{"name":"","personalityPatch":{"personality":[],"speechStyle":"","principles":[],"goals":[],"weaknesses":[],"summary":""},"loadoutPatch":{"weapons":[],"techniques":[],"items":[],"signatureAbilities":[]},"confidence":"high|medium|low","basis":["短依据"]}]}

约束：
- personality 每人 4-7 条，必须贴合身份与阶段，不写色情描写。
- weapons/techniques/items 使用中文名，可从 content 引用里抽取；没有明确武器时可写“无明确武器”并 low。
- signatureAbilities 是可玩化摘要，不等于所有物品。
- 不要编造同名替代正典；没有输入依据的武器/功法必须写到 low 置信候选，不得当事实。
- 若某角色资料敏感或不足，仍需给出该角色的 JSON 条目，confidence=low。

角色资料：
${JSON.stringify(batch, null, 2)}`
    }
  ];
}

function buildMiniMaxMessages(batch) {
  return [
    {
      role: 'system',
      content: [
        '你是长篇小说角色设定编辑，擅长把已有资料整理成可玩角色卡。',
        '只做高体量草案：加强人格、说话方式、行为动机、弱点和可玩装备/功法标签。',
        '不要输出露骨内容，不要照抄原文，不要改名；不要加入创伤诊断、现代心理学标签或输入中没有依据的黑暗桥段。只输出 JSON。'
        + ' 禁止输出：性表达、性爱、房事、春情、内宅、宠爱、侍奉、主人、娇媚等性化/从属化词；一律改写为中性人设表达。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `根据以下角色资料，输出 JSON：
{"characters":[{"name":"","persona":{"coreTraits":[],"speechStyle":"","motivation":"","principles":[],"flaws":[],"playNotes":""},"loadout":{"weaponNames":[],"techniqueNames":[],"itemNames":[],"abilityTags":[]},"confidence":"high|medium|low"}]}

要求：
- 女性角色人格优先细化，避免脸谱化。
- 武器/功法/道具优先使用输入已有 content；没有就给“候选”并 low。
- 不要把候选写成已确认事实；不要新增露骨、猎奇、创伤化设定。
- JSON 字符串内部禁止使用英文双引号；需要引用称呼时用中文引号或直接省略引号，避免 JSON 解析失败。
- 每人简洁但具体。

资料：
${JSON.stringify(batch, null, 2)}`
    }
  ];
}

async function run() {
  const generatedRoot = resolve(arg('generated-root', join(root, 'mod-kit/generated/deepseek-v4-flash')));
  const outDir = resolve(arg('out-dir', join(generatedRoot, 'character-canon/multimodel-enrichment')));
  const limit = Number(arg('limit', '0'));
  const batchSize = Number(arg('batch-size', '4'));
  const modelMode = arg('models', 'deepseek,minimax').split(',').map(s => s.trim()).filter(Boolean);
  await mkdir(outDir, { recursive: true });

  const cardsPath = join(generatedRoot, 'character-canon/character-cards-v3.json');
  const cards = JSON.parse(await readFile(cardsPath, 'utf8'));
  const refs = await stageRefs(generatedRoot);
  const targets = cards.characters
    .filter(c => c.tier === '主要' && (weakPersonality(c) || weakAbilities(c)))
    .map(c => ({
      targetReasons: [weakPersonality(c) ? 'weak_personality' : '', weakAbilities(c) ? 'weak_loadout' : ''].filter(Boolean),
      card: compactCard(c),
      stageRefs: (refs.get(c.canonicalName) || []).slice(0, 8),
    }));
  const selected = limit > 0 ? targets.slice(0, limit) : targets;
  await writeFile(join(outDir, 'character-enrichment-targets.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), count: selected.length, targets: selected }, null, 2)}\n`);

  const deepseekResults = [];
  const minimaxResults = [];
  for (let i = 0; i < selected.length; i += batchSize) {
    const batch = selected.slice(i, i + batchSize);
    const label = `${i + 1}-${Math.min(i + batchSize, selected.length)}`;
    if (modelMode.includes('deepseek')) {
      const file = join(outDir, `deepseek.batch-${String(i / batchSize + 1).padStart(3, '0')}.json`);
      if (existsSync(file)) {
        deepseekResults.push(JSON.parse(readFileSync(file, 'utf8')));
      } else {
        try {
          const result = await openRouterJson(buildDeepSeekMessages(batch), label);
          await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
          deepseekResults.push(result);
        } catch (error) {
          const result = { characters: [], error: error.message, batch: batch.map(x => x.card.name) };
          await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
          deepseekResults.push(result);
        }
      }
    }
    if (modelMode.includes('minimax')) {
      const file = join(outDir, `minimax.batch-${String(i / batchSize + 1).padStart(3, '0')}.json`);
      if (existsSync(file)) {
        minimaxResults.push(JSON.parse(readFileSync(file, 'utf8')));
      } else {
        try {
          const result = await miniMaxJson(buildMiniMaxMessages(batch), label);
          await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
          minimaxResults.push(result);
        } catch (error) {
          const result = { characters: [], error: error.message, batch: batch.map(x => x.card.name) };
          await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
          minimaxResults.push(result);
        }
      }
    }
    console.error(`done batch ${label}`);
  }

  const merged = new Map();
  for (const source of [{ name: 'deepseek', arr: deepseekResults }, { name: 'minimax', arr: minimaxResults }]) {
    for (const batch of source.arr) {
      for (const item of batch.characters || []) {
        const rec = merged.get(item.name) || { name: item.name, deepseek: null, minimax: null };
        rec[source.name] = item;
        merged.set(item.name, rec);
      }
    }
  }
  const report = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  await writeFile(join(outDir, 'multimodel-enrichment-draft.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceRoot: generatedRoot, count: report.length, characters: report }, null, 2)}\n`);
  console.log(JSON.stringify({ outDir, targets: selected.length, merged: report.length }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
