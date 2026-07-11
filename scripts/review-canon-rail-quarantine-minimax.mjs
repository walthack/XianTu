#!/usr/bin/env node

// MiniMax M2.7 highspeed fallback for the same strictly sanitized quarantine
// targets used by DeepSeek. This writes review drafts only; Canon Rail data is
// never changed by this script.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const sourceDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon', 'canon-rail', 'quarantine-deepseek-review');
const outDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon', 'canon-rail', 'quarantine-minimax-review');
const nasDir = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/canon-rail-review/quarantine-minimax-review';
const model = 'MiniMax-M2.7-highspeed';
const sensitive = /性|裸|乳|阴|阳具|阳物|阴户|淫|奸|交合|性交|床笫|脱衣|呻吟|高潮|亲热|双修|强暴|后庭|处子|肉体|臀|亲吻|按摩棒/u;
const onlyStage = process.argv.includes('--stage') ? process.argv[process.argv.indexOf('--stage') + 1] : '';
const targets = JSON.parse(await readFile(join(sourceDir, 'targets.json'), 'utf8')).targets;
if (onlyStage && !targets.some(target => target.stageId === onlyStage)) throw new Error(`未知隔离关：${onlyStage}`);
const system = '你是保守的小说剧情锚点审计员。输入已去除成人内容；严禁输出、猜测或复述成人内容。只根据输入判断，不可用外部记忆补造事实。仅输出紧凑 JSON：{stageVerdict:"safe|needs_remap|insufficient_evidence",sourceOrder:["事件id"],events:[{id:"",status:"supported|conflict|unknown",recommendedAction:"keep|remap|exclude",reason:"不超过30字",safeMustReach:"不超过30字；无证据留空"}]}。已略去的条目必须 unknown/exclude。';

async function review(target) {
  const user = `审核隔离关 ${target.stageId}；唯一可用材料如下：\n${JSON.stringify(target)}`;
  try {
    const { stdout } = await run('mmx', [
      'text', 'chat', '--model', model, '--system', system, '--message', `user:${user}`,
      '--max-tokens', '1600', '--temperature', '0.01', '--non-interactive', '--quiet',
    ], { cwd: root, timeout: 90000, maxBuffer: 1024 * 1024 });
    const raw = stdout.trim();
    if (sensitive.test(raw)) return { error: 'model_output_redacted_for_sensitive_content' };
    const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
    return JSON.parse(json);
  } catch (error) {
    return { error: String(error) };
  }
}

await mkdir(outDir, { recursive: true });
await mkdir(nasDir, { recursive: true });
for (const target of targets.filter(item => !onlyStage || item.stageId === onlyStage)) {
  const reviewResult = await review(target);
  await writeFile(join(outDir, `${target.stageId}.minimax-m2.7-highspeed.json`), `${JSON.stringify({ schema: 'liuchao.canon-rail-quarantine-minimax/v1', model, generatedAt: new Date().toISOString(), target, review: reviewResult }, null, 2)}\n`);
}
const outputs = await Promise.all(targets.map(async target => {
  const file = join(outDir, `${target.stageId}.minimax-m2.7-highspeed.json`);
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : { target, review: { error: 'not_run' } };
}));
const proposals = outputs.map(item => ({ stageId: item.target.stageId, stageVerdict: item.review?.stageVerdict || 'error', sourceOrder: item.review?.sourceOrder || [], events: item.review?.events || [], error: item.review?.error }));
await writeFile(join(outDir, 'merged-draft.json'), `${JSON.stringify({ schema: 'liuchao.canon-rail-quarantine-minimax-merged/v1', model, outputs }, null, 2)}\n`);
await writeFile(join(outDir, 'proposals.json'), `${JSON.stringify({ schema: 'liuchao.canon-rail-quarantine-minimax-proposals/v1', proposals }, null, 2)}\n`);
const report = `# Canon Rail 隔离关 MiniMax M2.7 Highspeed 复核\n\n- 范围：${targets.map(target => target.stageId).join('、')}\n- 约束：只输入去成人化摘要；仅审计草稿，不自动改正典。\n- 完成：${proposals.filter(item => !item.error).length}/${proposals.length}\n\n${proposals.map(item => `- ${item.stageId}: ${item.stageVerdict}${item.error ? `（${item.error}）` : ''}`).join('\n')}\n`;
await writeFile(join(outDir, 'REPORT.md'), report);
for (const name of ['merged-draft.json', 'proposals.json', 'REPORT.md']) await cp(join(outDir, name), join(nasDir, name));
console.log(JSON.stringify({ outDir, nasDir, completed: proposals.filter(item => !item.error).length, total: proposals.length }, null, 2));
