#!/usr/bin/env node

// Builds review-only semantic contracts for the small set of default-line
// events whose irreversible outcome is dangerous to let an LLM "complete" by
// implication. It never edits Canon Rail profiles. Inputs are source-axis
// summaries only; any sensitive summary is replaced before it can leave disk.

import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generated = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const outDir = join(generated, 'character-canon', 'canon-rail', 'semantic-contract-review');
const nasDir = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/canon-rail-review/semantic-contract-review';
const model = 'deepseek/deepseek-v4-flash';
const onlyStage = process.argv.includes('--stage') ? process.argv[process.argv.indexOf('--stage') + 1] : '';
const rerun = process.argv.includes('--rerun');
// Death, irreversible loss, betrayal, transfer, confinement, or a decisive
// campaign outcome. This deliberately excludes ordinary fights and travel.
const irreversible = /死亡|身亡|杀死|被杀|斩杀|处死|覆灭|牺牲|自刎|毒杀|背叛|叛变|夺取|抢走|囚禁|烙印|奴隶|传授|传功|筑基|功法|秘籍|灵飞镜|封印|废去|灭门|弑君|失踪|经脉尽绝/u;
const sensitive = /性|裸|乳|阴|阳具|阳物|阴户|淫|奸|交合|性交|床笫|脱衣|呻吟|高潮|亲热|双修|强暴|后庭|处子|肉体|臀|亲吻|按摩棒|凌辱|糟蹋|玷污|非礼|猥亵|性侵|性暴力|强迫性/u;

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

function safe(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Keep the non-adult causal skeleton useful for a plot-outline review. A
  // residual sensitive token still drops the whole summary rather than risking
  // a partial redaction leak.
  const softened = text
    .replace(/凌辱|糟蹋|玷污|非礼|猥亵|性侵|性暴力|强迫性|强暴/g, '严重侵害')
    .replace(/性交|交合|双修|床笫|亲热/g, '亲密情节')
    .replace(/淫|奸/g, '不当行为')
    .replace(/裸|乳|阴|阳具|阳物|阴户|脱衣|呻吟|高潮|后庭|处子|肉体|臀|亲吻|按摩棒/g, '敏感细节');
  return sensitive.test(softened) ? '（敏感叙述已略去，不能据此生成语义合同）' : softened.slice(0, 360);
}

function parseGeneratedProfiles(raw) {
  const payload = raw.match(/= ([\s\S]+);\n$/)?.[1];
  if (!payload) throw new Error('无法读取 Canon Rail 生成档');
  return JSON.parse(payload);
}

async function request(key, target) {
  const system = `你是保守的小说剧情合同审计员。输入只含去成人化的来源轴摘要；严禁输出、猜测、复述或评价成人内容，也不得用外部记忆补造事实。只审查不可逆剧情结果。仅输出 JSON：{stageVerdict:"reviewed|insufficient_evidence",events:[{id:"",status:"supported|unknown",completionEvidence:["不超过8字的实体加动作或结果词，最多3项"],forbiddenInCanon:["不超过16字的具体禁止改写，最多3项"],reason:"不超过35字"}]}。若材料已略去或证据不足，status 必须 unknown，两个数组留空。completionEvidence 必须是叙事中可自然出现的短词，且每项均须包含动作或结果；禁止只填人名、地名或物件名，禁止固定句片。forbiddenInCanon 必须针对该拍的不可逆结果，禁止使用“改写原著结果”“提前剧情”等泛词；来源若只说失踪、传闻或衣冠葬，禁止断定人物已死亡。`;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Canon Rail Semantic Contract Review' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 1800, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: system },
      { role: 'user', content: `审查以下关卡的高风险拍。唯一证据如下：\n${JSON.stringify(target)}` },
    ] }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body.slice(0, 180)}`);
  const content = JSON.parse(body).choices?.[0]?.message?.content || '';
  return JSON.parse(content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || content);
}

const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('缺 OPENROUTER_API_KEY');
const axis = JSON.parse(await readFile(join(generated, 'character-canon', 'axis-binding.json'), 'utf8'));
const axisById = new Map((axis.nodes || []).map(node => [node.axisId, node]));
const profiles = parseGeneratedProfiles(await readFile(join(root, 'src/modules/scenarioMods/canonRailProfiles.generated.ts'), 'utf8'));
const targets = profiles.map(profile => {
  const stage = JSON.parse(readFileSync(join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'data', `${profile.modId}.json`), 'utf8'));
  const eventById = new Map((stage.scenario?.events || []).map(event => [event.id, event]));
  return {
    stageId: profile.modId,
    events: profile.contracts
      .filter(contract => !contract.completionEvidence.length && irreversible.test(contract.mustReach))
      .map(contract => {
        const node = axisById.get(eventById.get(contract.eventId)?.axisId);
      return {
        id: contract.eventId,
        axisId: node?.axisId || null,
        sourceSummary: safe(node?.beat || contract.mustReach),
        mustReach: safe(contract.mustReach),
      };
      }),
  };
}).filter(target => target.events.length);
if (onlyStage && !targets.some(target => target.stageId === onlyStage)) throw new Error(`没有待审高风险关「${onlyStage}」`);

await mkdir(outDir, { recursive: true });
await mkdir(nasDir, { recursive: true });
await writeFile(join(outDir, 'targets.json'), `${JSON.stringify({ schema: 'liuchao.canon-rail-semantic-contract-targets/v1', model, targets }, null, 2)}\n`);
for (const target of targets.filter(item => !onlyStage || item.stageId === onlyStage)) {
  const file = join(outDir, `${target.stageId}.deepseek-v4.json`);
  if (!rerun && existsSync(file)) continue;
  let review;
  try { review = await request(key, target); } catch (error) { review = { error: String(error) }; }
  await writeFile(file, `${JSON.stringify({ schema: 'liuchao.canon-rail-semantic-contract-review/v1', model, generatedAt: new Date().toISOString(), target, review }, null, 2)}\n`);
}
const outputs = await Promise.all(targets.map(async target => {
  const file = join(outDir, `${target.stageId}.deepseek-v4.json`);
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : { target, review: { error: 'not_run' } };
}));
const supported = outputs.flatMap(output => (output.review?.events || []).filter(event => event.status === 'supported'));
await writeFile(join(outDir, 'proposals.json'), `${JSON.stringify({ schema: 'liuchao.canon-rail-semantic-contract-proposals/v1', model, proposals: outputs }, null, 2)}\n`);
await writeFile(join(outDir, 'REPORT.md'), `# Canon Rail 高风险语义合同复核\n\n- 仅审默认线 ${targets.length} 关、${targets.reduce((n, target) => n + target.events.length, 0)} 个不可逆高风险拍；不输入原文正文或成人内容。\n- 复核草稿：${outputs.filter(output => !output.review?.error).length}/${outputs.length} 关；支持的逐拍合同：${supported.length}。\n- 草稿不会自动进入运行时；须经格式／敏感项校验与第二模型复核后才可接入。\n`);
for (const name of ['targets.json', 'proposals.json', 'REPORT.md']) await cp(join(outDir, name), join(nasDir, name));
console.log(JSON.stringify({ outDir, targets: targets.length, highRiskEvents: targets.reduce((n, target) => n + target.events.length, 0), reviewed: outputs.filter(output => !output.review?.error).length, supported: supported.length }, null, 2));
