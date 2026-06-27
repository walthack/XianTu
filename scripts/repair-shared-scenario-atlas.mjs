#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const atlasPath = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'shared-atlas', 'liuchao.shared-atlas.v1.json');
const auditPath = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'shared-atlas', 'repair-audit.json');
const model = 'deepseek/deepseek-v4-flash';
const atlas = JSON.parse(await readFile(atlasPath, 'utf8'));

function replaceReferences(value, replacements) {
  if (Array.isArray(value)) return value.map(item => replaceReferences(item, replacements));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? replacements[value] || value : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceReferences(item, replacements)]));
}

const replacements = {
  "liuchao.location.lin'an": 'liuchao.location.linan',
  "liuchao.location.xiong'erpu": 'liuchao.location.xiongerpu',
};
const normalized = replaceReferences(atlas, replacements);

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    return [[match[1], match[2].trim().replace(/^['"]|['"]$/g, '')]];
  }));
}
const apiKey = parseEnv(await readFile(join(root, '.env'), 'utf8')).OPENROUTER_API_KEY;

const stageDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'yange', 'stages');
const stageNames = (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json')).sort();
const stages = await Promise.all(stageNames.map(async name => {
  const mod = JSON.parse(await readFile(join(stageDir, name), 'utf8'));
  return {
    modId: mod.manifest.id,
    opening: mod.scenario.opening,
    locations: mod.canon?.locations || [],
    factions: mod.canon?.factions || [],
  };
}));
const evidence = JSON.parse(await readFile(
  join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'shared-atlas', 'yange.geography.json'),
  'utf8',
));

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/qianye60/XianTu', 'X-Title': 'XianTu Atlas Repair' },
  body: JSON.stringify({
    model, temperature: 0, max_tokens: 10000, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你是小说正典数据修复员。只依据给定地图与全文抽取证据补引用，不新增无证据事实，只输出 JSON。' },
      { role: 'user', content: `当前地图缺少太乙真宗 headquartersLocationId 所指向的 liuchao.location.longchi，并漏了六个《燕歌行》阶段映射。请输出 {"headquartersResolution":{"action":"add_location|change_reference","factionId":"liuchao.faction.taiyi_zhenzong","location":{完整 atlas location，action=add_location 时使用}|null,"headquartersLocationId":"...","reason":"..."},"stageBindings":[完整六项],"uncertainties":[]}。阶段绑定格式必须与现有 stageBindings 相同；本地实体无法可靠对应时放 unmappedLocalEntities，不得编造。所有地图目标必须使用 CURRENT ATLAS 已存在 ID，只有有明确证据时才允许新增龙池地点。\n\nCURRENT ATLAS:\n${JSON.stringify({ locations: normalized.atlas.locations, factions: normalized.atlas.factions })}\n\nYANGE STAGES:\n${JSON.stringify(stages)}\n\nYANGE FULL-TEXT GEOGRAPHY EVIDENCE:\n${JSON.stringify(evidence)}` },
    ],
  }),
});
const body = await response.text();
if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 1000)}`);
const result = JSON.parse(body);
const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.message?.reasoning || '';
const patch = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));

const resolution = patch.headquartersResolution;
if (resolution?.action === 'add_location' && resolution.location) normalized.atlas.locations.push(resolution.location);
const faction = normalized.atlas.factions.find(item => item.id === 'liuchao.faction.taiyi_zhenzong');
if (!faction || !resolution?.headquartersLocationId) throw new Error('DeepSeek did not resolve the Taiyi headquarters');
faction.headquartersLocationId = resolution.headquartersLocationId;
const existingMods = new Set(normalized.stageBindings.map(item => item.modId));
for (const binding of patch.stageBindings || []) if (!existingMods.has(binding.modId)) normalized.stageBindings.push(binding);
normalized.uncertainties.push(...(patch.uncertainties || []).map(item => typeof item === 'string'
  ? { subject: 'targeted repair', issue: item, recommendedReview: 'Review against appendix map and Yange source extraction.' }
  : item));
normalized._generation.repairedAt = new Date().toISOString();
normalized._generation.repairUsage = result.usage || {};
await writeFile(atlasPath, JSON.stringify(normalized, null, 2));
await writeFile(auditPath, JSON.stringify({ replacements, deepSeekPatch: patch, usage: result.usage || {} }, null, 2));
console.log(`repaired ${atlasPath}`);
