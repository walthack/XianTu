#!/usr/bin/env node

// Conservative DeepSeek re-review for Canon Rail quarantines. It transmits
// only source-axis summaries that pass a strict non-adult redaction gate;
// unknown is the required answer when that leaves insufficient evidence.

import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const dataDir = join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'data');
const outDir = join(gen, 'character-canon', 'canon-rail', 'quarantine-deepseek-review');
const nasDir = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/canon-rail-review/quarantine-deepseek-review';
const model = 'deepseek/deepseek-v4-flash';
const stageIds = [
  'lcq.stage_03', 'lcq.stage_05', 'lcq.stage_06', 'lyg.ganlu_bian',
  'lyg.shixiang_ambush', 'lyl.lin_an_black_sea', 'lyl.luoyang_coup', 'lyl.taiquan_expedition',
];
const onlyStage = process.argv.includes('--stage') ? process.argv[process.argv.indexOf('--stage') + 1] : '';
if (onlyStage && !stageIds.includes(onlyStage)) throw new Error(`未知隔离关：${onlyStage}`);
const sensitive = /性|裸|乳|阴|阳具|阳物|阴户|淫|奸|交合|性交|床笫|脱衣|呻吟|高潮|亲热|双修|强暴|后庭|处子|肉体|臀|亲吻|按摩棒/u;
const isCritical = event => event.critical !== undefined ? event.critical === true
  : event.axisMethod !== 'reviewed-no-anchor' && event.axisId !== null
    && Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
const safe = value => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return sensitive.test(text) ? '（成人内容或敏感叙述已略去，不能据此判定）' : text.slice(0, 420);
};
function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}
async function request(key, payload) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Canon Rail Quarantine Review' },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 3000, response_format: { type: 'json_object' }, messages: payload }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${body.slice(0, 180)}`);
    const content = JSON.parse(body).choices?.[0]?.message?.content || '';
    return JSON.parse(content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || content);
  } catch (error) {
    return { error: String(error) };
  }
}

const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('缺 OPENROUTER_API_KEY');
const binding = JSON.parse(await readFile(join(gen, 'character-canon', 'axis-binding.json'), 'utf8'));
const axisById = new Map((binding.nodes || []).map(node => [node.axisId, node]));
await mkdir(outDir, { recursive: true });
await mkdir(nasDir, { recursive: true });

const targets = stageIds.map(stageId => {
  const mod = JSON.parse(readFileSync(join(dataDir, `${stageId}.json`), 'utf8'));
  const events = (mod.scenario?.events || []).filter(isCritical).map(event => {
    const axis = axisById.get(event.axisId);
    return {
      id: event.id,
      eventName: safe(event.name),
      axisId: event.axisId || null,
      axisSeq: axis?.seq ?? event.axisSeq ?? null,
      axisSummary: safe(axis?.beat || event.axisBeat),
      sourceHeading: safe(axis?.heading),
      reason: !event.axisId ? 'no_source_axis' : !axis ? 'unresolved_source_axis' : 'source_axis_present',
    };
  });
  return { stageId, stageName: safe(mod.manifest?.name), events };
});
await writeFile(join(outDir, 'targets.json'), `${JSON.stringify({ schema: 'liuchao.canon-rail-quarantine-targets/v1', model, targets }, null, 2)}\n`);

const system = `你是《六朝》系列的保守剧情锚点审计员。输入只包含去成人化的事件名称和来源轴摘要。不得输出、猜测、复述或评价成人内容。只能根据给定材料判断，不得用外部记忆补造原著事实。只输出紧凑 JSON；每个 reason 与 safeMustReach 最多 35 个汉字。对每个事件输出 {id,status:"supported|conflict|unknown",reason:"",recommendedAction:"keep|remap|exclude",safeMustReach:""}。若事件或摘要被标记为已略去，必须 status=unknown、recommendedAction=exclude。再输出 stageVerdict:"safe|needs_remap|insufficient_evidence" 和 sourceOrder:[id...]（只排列 supported 事件；不确定事件不要猜顺序）。`;
for (const target of targets.filter(item => !onlyStage || item.stageId === onlyStage)) {
  const artifactFile = join(outDir, `${target.stageId}.deepseek-v4.json`);
  if (!onlyStage && existsSync(artifactFile)) continue;
  const user = `审查隔离关卡 ${target.stageId}。以下是唯一可用的去成人化材料：\n${JSON.stringify(target, null, 2)}`;
  const review = await request(key, [{ role: 'system', content: system }, { role: 'user', content: user }]);
  const artifact = { schema: 'liuchao.canon-rail-quarantine-review/v1', model, generatedAt: new Date().toISOString(), target, review };
  await writeFile(artifactFile, `${JSON.stringify(artifact, null, 2)}\n`);
}
const outputs = [];
for (const target of targets) {
  const artifactFile = join(outDir, `${target.stageId}.deepseek-v4.json`);
  outputs.push(existsSync(artifactFile)
    ? JSON.parse(await readFile(artifactFile, 'utf8'))
    : { schema: 'liuchao.canon-rail-quarantine-review/v1', target, review: { error: 'not_run' } });
}
const merged = { schema: 'liuchao.canon-rail-quarantine-merged/v1', model, generatedAt: new Date().toISOString(), outputs };
await writeFile(join(outDir, 'merged-draft.json'), `${JSON.stringify(merged, null, 2)}\n`);
const proposals = outputs.map(item => {
  const events = item.target.events || [];
  const axisIds = events.map(event => event.axisId).filter(Boolean);
  const duplicateAxis = [...new Set(axisIds.filter(axisId => axisIds.filter(value => value === axisId).length > 1))];
  const unresolved = events.filter(event => event.reason !== 'source_axis_present').map(event => event.id);
  let stageVerdict = item.review?.stageVerdict || 'error';
  if (events.length === 0 || unresolved.length) stageVerdict = 'insufficient_evidence';
  else if (duplicateAxis.length) stageVerdict = 'needs_remap';
  return { stageId: item.target.stageId, stageVerdict, sourceOrder: item.review?.sourceOrder || [], events: item.review?.events || [], error: item.review?.error, deterministicBlockers: { duplicateAxis, unresolved } };
});
await writeFile(join(outDir, 'proposals.json'), `${JSON.stringify({ schema: 'liuchao.canon-rail-quarantine-proposals/v1', proposals }, null, 2)}\n`);
const report = `# Canon Rail 隔离关 DeepSeek V4 复核\n\n- 范围：${stageIds.join('、')}\n- 约束：仅去成人化剧情摘要；证据不足必须 unknown；不会自动改正典。\n- 完成：${outputs.filter(item => !item.review?.error).length}/${outputs.length}\n\n${proposals.map(item => `- ${item.stageId}: ${item.stageVerdict}${item.error ? `（${item.error}）` : ''}`).join('\n')}\n`;
await writeFile(join(outDir, 'REPORT.md'), report);
for (const name of ['targets.json', 'merged-draft.json', 'proposals.json', 'REPORT.md']) await cp(join(outDir, name), join(nasDir, name));
console.log(JSON.stringify({ outDir, nasDir, completed: outputs.filter(item => !item.review?.error).length, total: outputs.length }, null, 2));
