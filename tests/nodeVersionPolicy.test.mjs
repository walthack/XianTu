// Node 版本策略：.nvmrc、package.json engines、全部 workflow、Dockerfile 统一在 20 以上；CI 带非阻塞的生产依赖 audit。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const MIN = 20;

test('.nvmrc 与 engines 声明 Node ≥ 20，当前运行环境满足', () => {
  assert.ok(Number(read('.nvmrc').trim().split('.')[0]) >= MIN);
  const engines = JSON.parse(read('package.json')).engines?.node;
  assert.match(engines, /^>=\s*(\d+)/);
  assert.ok(Number(engines.match(/(\d+)/)[1]) >= MIN);
  assert.ok(Number(process.versions.node.split('.')[0]) >= MIN, `当前 Node ${process.version} 低于 ${MIN}`);
});

test('所有 workflow 的 setup-node 都读 .nvmrc（或显式 ≥20），没有残留的 18', () => {
  for (const file of readdirSync(new URL('../.github/workflows/', import.meta.url)).filter(f => /\.ya?ml$/.test(f))) {
    const text = read(`.github/workflows/${file}`);
    const versions = [...text.matchAll(/node-version(?:-file)?:\s*(\S+)/g)].map(m => m[1]);
    for (const v of versions) assert.ok(v === '.nvmrc' || Number(v) >= MIN, `${file}: node-version ${v}`);
    if (text.includes('setup-node')) assert.ok(versions.length > 0, `${file} 的 setup-node 没指定版本`);
  }
});

test('Dockerfile 构建阶段用 Node ≥ 20', () => {
  const versions = [...read('Dockerfile').matchAll(/^FROM node:(\d+)/gm)].map(m => Number(m[1]));
  assert.ok(versions.length > 0);
  for (const v of versions) assert.ok(v >= MIN);
});

test('CI：测试走 test:ci（串行），audit 只看生产依赖且非阻塞', () => {
  const ci = read('.github/workflows/ci.yml'), scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts['test:ci'], /--test-concurrency=1/);
  assert.match(ci, /npm run test:ci/);
  const audit = ci.split('Audit production dependencies')[1];
  assert.ok(audit, 'ci.yml 缺少 audit 步骤');
  assert.match(audit, /continue-on-error:\s*true/);
  assert.match(audit, /npm audit --omit=dev/);
  assert.equal(scripts['audit:prod'], 'npm audit --omit=dev');
});
