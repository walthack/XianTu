#!/usr/bin/env node
// 为各关 critical 事件生成 objective（玩家视角+地点+不剧透），写回 mod-kit stage json 的 scenario.events[].objective。
// 按 stage 批量（一关一次 LLM 调用）。断点续跑：已有 objective 的事件跳过。
// 用法：
//   node scripts/generate-stage-objectives.mjs --dry-run            # 只统计，不调用
//   node scripts/generate-stage-objectives.mjs --stage=<modId|文件名子串>   # 只跑一关（验证）
//   node scripts/generate-stage-objectives.mjs                      # 全量 37 关
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = process.env.XIANTU_OBJECTIVE_MODEL || 'deepseek/deepseek-v4-flash';
const BOOKS = ['qingyu', 'yunlong', 'yange'];
const onlyStage = process.argv.find(a => a.startsWith('--stage='))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

async function apiKey() {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const k = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error('OPENROUTER_API_KEY missing');
  return k;
}

async function openRouterJson(messages, label, key) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': `XianTu Objectives ${label}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 500)}`);
      const content = JSON.parse(body).choices?.[0]?.message?.content || '';
      try {
        return JSON.parse(content);
      } catch (e) {
        const dbg = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', '_debug');
        await mkdir(dbg, { recursive: true });
        await writeFile(join(dbg, `objectives-${label.replace(/[^a-z0-9._-]+/gi, '-')}-${attempt}.txt`), content);
        throw e;
      }
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}/4: ${error.message}`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

const SYSTEM = {
  role: 'system',
  content: `你是仙侠剧本的"任务目标"编写者。给你一关的若干主线关键事件（每个含剧情梗概 axisBeat=从上帝视角描述"会发生什么"），为每个事件写一句"玩家视角的下一步目标"objective。

硬性要求：
1. **玩家视角、可操作**：写玩家"该去哪、找谁、做什么"，不是"发生了什么"。（axisBeat"谢艺独入地宫杀使拷问碧宛下落无果"→objective"潜入鬼王峒地宫，查明碧奴下落"）
2. **带明确地点**：从梗概提取地点写进去（地宫/云苍峰/碧鲮族/某城…）。
3. **不剧透**：把"发生了X/揭晓了Y/某人死了"改写成"去做/去查X"，绝不透露结局、真相、未揭晓的人物命运。（axisBeat"巨浪淹竹楼，程与凝羽逃生，决定寻云苍峰"→objective"前往云苍峰"，不提大潮）
4. **简短**：一句话，≤20字，像任务栏的一行提示。
5. 严禁编造梗概里没有的地名/人物/情节。

只输出 JSON 对象，键=事件id，值=该事件的 objective 字符串。无任何前后缀、无代码块。`,
};

function buildUserPrompt(stageTitle, critEvents, nameOf) {
  const list = critEvents.map(e =>
    `- id=${e.id}\n  名称：${e.name || ''}\n  剧情梗概：${e.axisBeat || e.description || ''}\n  相关人物：${(e.relatedCharacterIds || []).map(nameOf).filter(Boolean).join('、') || '无'}`
  ).join('\n');
  return {
    role: 'user',
    content: `【关卡】${stageTitle}\n【本关主线关键事件】\n${list}\n\n为上述每个事件 id 输出一句玩家视角 objective（≤20字、带地点、不剧透）。输出 {"事件id":"objective",...}。`,
  };
}

async function main() {
  let key = null;
  let totalStages = 0, totalCrit = 0, totalFilled = 0;
  for (const book of BOOKS) {
    const dir = resolve(root, `mod-kit/generated/deepseek-v4-flash/${book}/stages`);
    let names;
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names.sort()) {
      if (!name.endsWith('.json') || name.endsWith('.uncertainties.json')) continue;
      const path = join(dir, name);
      const doc = JSON.parse(await readFile(path, 'utf8'));
      const modId = doc.manifest?.modId || doc.scenario?.modId || name.replace('.json', '');
      if (onlyStage && modId !== onlyStage && !name.includes(onlyStage)) continue;
      const events = (doc.scenario?.events) || [];
      const crit = events.filter(e => e.critical && !e.objective);
      if (!crit.length) continue;
      totalStages += 1; totalCrit += crit.length;
      const stageTitle = doc.manifest?.title || doc.scenario?.name || modId;
      const chars = new Map((doc.canon?.characters || []).map(c => [c.id, c.name]));
      const nameOf = (id) => chars.get(id) || '';
      if (dryRun) { console.log(`${modId} — critical待生成=${crit.length} / 本关事件=${events.length}`); continue; }
      if (!key) key = await apiKey();
      const messages = [SYSTEM, buildUserPrompt(stageTitle, crit, nameOf)];
      let result;
      try { result = await openRouterJson(messages, modId, key); }
      catch (e) { console.error(`[${modId}] 生成失败，跳过：${e.message}`); continue; }
      let filled = 0;
      for (const e of events) {
        const obj = result[e.id];
        if (obj && typeof obj === 'string' && obj.trim()) { e.objective = obj.trim(); filled += 1; }
      }
      totalFilled += filled;
      await writeFile(path, JSON.stringify(doc, null, 2) + '\n');
      console.log(`[${modId}] objective 已填 ${filled}/${crit.length}`);
    }
  }
  console.log(`\n== 汇总 == stages=${totalStages} critical=${totalCrit} filled=${totalFilled}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); });
