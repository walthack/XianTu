#!/usr/bin/env node
// 正典落地一键管线：卡 → registry → stage投影 → 同门派生 → 内置同步 → 校验 → 测试。
// 各步幂等，可反复跑；任一步失败即停（fail-fast）。
// 用法：npm run canon:build          完整管线
//       npm run canon:build -- --fast   跳过 37 关校验与测试（只落数据，改卡后快速迭代）
//
// 注意：以下**内容生产型**脚本不在本管线（需人工裁定后手动跑）：
//   derive-cross-stage-memories.mjs / insert-debut-events.mjs / apply-enrichment-to-cards.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FAST = process.argv.includes('--fast');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');

const steps = [
  ['账本人名棘轮', 'node', ['scripts/validate-ledger-ratchet.mjs']],
  ['registry 重建', 'node', ['scripts/build-character-registry.mjs']],
  ['卡投影 stage(slim+personality)', 'node', ['scripts/apply-character-cards-v3-to-mod.mjs']],
  ['归属投影 stage', 'node', ['scripts/project-affiliations-to-stages.mjs', '--apply']],
  ['同门/同族/同袍派生', 'node', ['scripts/derive-tongmen-edges.mjs', '--apply']],
  ['内置 mod 同步', 'node', ['scripts/sync-builtin-mods.mjs']],
  ['统一实体索引重建', 'node', ['scripts/build-entity-index.mjs']],
  ['道具技能功法总表校验', 'node', ['scripts/validate-entity-catalog.mjs']],
  ['支线人物线引用校验', 'node', ['scripts/validate-quest-lines.mjs']],
  ['人工裁定执法', 'node', ['scripts/validate-canon-decisions.mjs']],
  ['主轴/存档契约校验', 'node', ['scripts/validate-axis-save-contract.mjs']],
  ['人物时点级数引用校验', 'node', ['scripts/validate-character-levels.mjs']],
  ['必经战胜率门槛', 'node', ['scripts/validate-required-combat-winrate.mjs']],
  ['地点 id 校验', 'node', ['scripts/validate-location-ids.mjs']],
];
if (!FAST) {
  const stageFiles = [];
  for (const b of ['qingyu', 'yunlong', 'yange']) {
    const dir = join(gen, b, 'stages');
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) stageFiles.push(join(dir, f));
  }
  steps.push(['37 关 schema 校验', 'node', ['scripts/validate-scenario-mod.mjs', ...stageFiles]]);
  // Node 25 的并发 test worker 在大型 JSON fixture + 后台模型进程并存时偶发 IPC
  // structured-clone 反序列化失败；单并发不改变测试内容，只让正典门禁可重复。
  steps.push(['单元测试', 'node', ['--test', '--test-concurrency=1', ...readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join('tests', f))]]);
}

const t0 = Date.now();
const timings = [];
for (const [label, cmd, args] of steps) {
  const s = Date.now();
  process.stderr.write(`\n━━━ ${label} ━━━\n`);
  try {
    execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
  } catch {
    console.error(`\n❌ 管线中断于「${label}」（exit≠0），后续步骤未执行。`);
    process.exit(1);
  }
  timings.push(`${label} ${((Date.now() - s) / 1000).toFixed(1)}s`);
}
console.error(`\n✅ canon:build 完成（${((Date.now() - t0) / 1000).toFixed(1)}s）${FAST ? '（--fast 跳过校验/测试）' : ''}`);
console.error('   ' + timings.join(' | '));
