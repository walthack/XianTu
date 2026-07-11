#!/usr/bin/env node

// Resets only the narrative layer of a contaminated save to its current
// source-backed Canon Rail beat. Character attributes, inventory and money are
// deliberately left untouched. Use --apply to write a timestamped backup.

import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const storage = join(root, '.xiantu-server', 'save-storage');
const slotIndex = process.argv.indexOf('--slot');
const slot = slotIndex >= 0 ? process.argv[slotIndex + 1] : '';
const apply = process.argv.includes('--apply');
if (!slot) throw new Error('需要指定单一存档：--slot <存档名>');

const matches = (await readdir(storage)).filter(name => name.startsWith('savedata_') && name.endsWith(`_${slot}.json`));
if (matches.length !== 1) throw new Error(`未找到唯一存档「${slot}」（匹配 ${matches.length} 个）`);
const file = join(storage, matches[0]);
const wrapper = JSON.parse(await readFile(file, 'utf8'));
const data = wrapper?.data;
const runtime = data?.世界?.状态?.剧本模组;
if (!data || !runtime?.modId) throw new Error('存档缺少剧本运行时');

const modFile = join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'data', `${runtime.modId}.json`);
const mod = JSON.parse(await readFile(modFile, 'utf8'));
const binding = JSON.parse(await readFile(join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon', 'axis-binding.json'), 'utf8'));
const axisById = new Map((binding.nodes || []).map(node => [node.axisId, node]));
const isCritical = event => event.critical !== undefined ? event.critical === true
  : event.axisMethod !== 'reviewed-no-anchor' && event.axisId !== null
    && Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
const events = (mod.scenario?.events || []).filter(isCritical).slice().sort((a, b) =>
  (axisById.get(a.axisId)?.seq ?? a.axisSeq ?? Infinity) - (axisById.get(b.axisId)?.seq ?? b.axisSeq ?? Infinity),
);
if (!events.length) throw new Error(`${runtime.modId} 没有可重置的 source-axis 承重事件`);

// Retain only the completed source-order prefix; later done flags would be a
// contaminated skip and must not survive the repair.
const oldCompleted = new Set(runtime.completedEventIds || []);
const completed = [];
for (const event of events) {
  if (!oldCompleted.has(event.id)) break;
  completed.push(event.id);
}
const nextEvent = events.find(event => !completed.includes(event.id)) || null;
const report = [];

for (const key of ['短期记忆', '中期记忆', '长期记忆', '隐式中期记忆']) {
  if (Array.isArray(data.社交?.记忆?.[key]) && data.社交.记忆[key].length) {
    report.push(`社交.记忆.${key}（${data.社交.记忆[key].length} 条）`);
    data.社交.记忆[key] = [];
  }
}
if (Array.isArray(data.系统?.历史?.叙事) && data.系统.历史.叙事.length) {
  report.push(`系统.历史.叙事（${data.系统.历史.叙事.length} 条）`);
  data.系统.历史.叙事 = [];
}
if (Array.isArray(data.社交?.事件?.事件记录) && data.社交.事件.事件记录.length) {
  report.push(`社交.事件.事件记录（${data.社交.事件.事件记录.length} 条）`);
  data.社交.事件.事件记录 = [];
}
if (data.系统?.扩展?.任务追踪?.即兴目标) {
  data.系统.扩展.任务追踪.即兴目标 = [];
  report.push('系统.扩展.任务追踪.即兴目标');
}

const factions = new Map((mod.canon?.factions || []).map(faction => [faction.id, faction]));
const locations = new Map((mod.canon?.locations || []).map(location => [location.id, location]));
const characters = mod.canon?.characters || [];
const characterByName = new Map(characters.map(character => [character.name, character]));
const registry = JSON.parse(await readFile(join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'character-registry.json'), 'utf8'));
const knownCanonicalNames = new Set((registry.characters || []).flatMap(character => [character.canonicalName, ...(character.aliases || [])]).filter(Boolean));
const relationshipByCharacterId = new Map((mod.canon?.playerRelationships || []).map(item => [item.characterId, item]));
const relations = data.社交?.关系 || {};
for (const [name, relation] of Object.entries(relations)) {
  const character = characterByName.get(name);
  if (!character) {
    if (knownCanonicalNames.has(name)) {
      relation.记忆 = [];
      relation.当前位置 = { 描述: '位置未定' };
      delete relation.当前外貌状态;
      delete relation.当前内心想法;
      report.push(`社交.关系.${name}（保留正典人物，清除动态污染）`);
      continue;
    }
    delete relations[name];
    report.push(`社交.关系.${name}（不在当前正典名册）`);
    continue;
  }
  const declared = relationshipByCharacterId.get(character.id);
  const affiliation = (character.affiliations || [])[0];
  const faction = factions.get(affiliation?.factionId || character.factionId);
  const sect = (character.affiliations || []).find(item => item.category === 'sect');
  const sectFaction = factions.get(sect?.factionId);
  const location = locations.get(character.locationId);
  relation.名字 = character.name;
  relation.与玩家关系 = declared?.relation || '陌生人';
  relation.好感度 = declared?.favorability || 0;
  relation.记忆 = [...(declared?.memories || [])];
  relation.势力归属 = faction?.name;
  relation.势力归属列表 = (character.affiliations || []).map(item => factions.get(item.factionId)?.name).filter(Boolean);
  if (sectFaction) relation.宗门 = sectFaction.name;
  else delete relation.宗门;
  relation.当前位置 = { 描述: location?.name || '位置未定', ...(location?.coordinates || {}) };
  delete relation.当前外貌状态;
  delete relation.当前内心想法;
}
data.社交.关系矩阵 = { version: 1, nodes: Object.keys(relations), edges: [] };
report.push('社交.关系（当前 stage 正典重投影）');

runtime.currentChapterId = mod.scenario?.chapters?.[0]?.id || runtime.currentChapterId;
runtime.completedChapterIds = [];
runtime.completedEventIds = completed;
runtime.activeEventIds = nextEvent ? [nextEvent.id] : [];
runtime.flags = runtime.flags || {};
for (const event of events) {
  for (const condition of event.completion || []) {
    if (condition.path?.startsWith('flags.') && condition.operator === 'eq' && condition.value === true) {
      runtime.flags[condition.path.slice('flags.'.length)] = completed.includes(event.id);
    }
  }
}
for (const chapter of mod.scenario?.chapters || []) {
  for (const condition of chapter.completion || []) {
    if (condition.path?.startsWith('flags.') && condition.operator === 'eq' && condition.value === true) {
      runtime.flags[condition.path.slice('flags.'.length)] = false;
    }
  }
}
runtime.nextStageReadyId = null;
runtime.stallTurns = 0;
runtime.steeringCooldown = 0;
delete runtime.reconciledRegistryVersion;
report.push(`剧本进度：保留 ${completed.length}/${events.length} 个正典前缀，当前锚点 ${nextEvent?.id || '本关已完成'}`);

const player = characters.find(character => character.id === mod.scenario?.opening?.playerCharacterId) || characters.find(character => character.name === '程宗扬');
const playerLocation = locations.get(player?.locationId);
if (playerLocation?.coordinates) {
  data.角色.位置 = { 描述: playerLocation.name, ...playerLocation.coordinates };
  report.push(`角色.位置 → ${playerLocation.name}`);
}

console.log(`${apply ? '将修复' : '预览'}：${file}`);
for (const line of report) console.log(`- ${line}`);
if (apply) {
  const backup = `${file}.bak-canon-rail-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await cp(file, backup);
  await writeFile(file, `${JSON.stringify(wrapper, null, 2)}\n`);
  console.log(`已写入；备份：${backup}`);
}
