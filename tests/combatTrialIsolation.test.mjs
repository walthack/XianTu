// 战斗试玩的隔离约束：不进主应用打包、不用主服务端口、不写服务器存档、垫片不改响应式状态。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

test('src 里除 src/dev 以外没有任何文件引用试玩代码（主应用打包不会带上它）', async () => {
  const offenders = [];
  for (const file of await walk(path.join(root, 'src'))) {
    if (!/\.(ts|vue|js)$/.test(file) || file.includes(`${path.sep}src${path.sep}dev${path.sep}`)) continue;
    const text = await readFile(file, 'utf8');
    if (/@\/dev\/|\/dev\/combatTrial|\.\.\/dev\//.test(text)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test('试玩构建配置：关远程存档、不写 dist/、不清目录、只替换一个垫片', async () => {
  const config = await readFile(path.join(root, 'webpack.combat-trial.config.js'), 'utf8');
  assert.match(config, /REMOTE_SAVE_STORAGE_ENABLED = 'false'/);
  assert.match(config, /dev\/combat-trial\/dist/);
  assert.doesNotMatch(config, /path\.resolve\(__dirname, 'dist'\)/);
  assert.match(config, /clean: false/);
  assert.match(config, /devServer: undefined/);
  const build = (await readFile(path.join(root, 'dev/combat-trial/build.mjs'), 'utf8')).split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(build, /npm|prebuild|sync-builtin-mods|validate-canon-decisions/);
  assert.match(build, /REMOTE_SAVE_STORAGE_ENABLED: 'false'/);
});

test('静态服务拒绝主服务和原型占用的端口，且在绑定之前就退出', () => {
  for (const port of [8091, 8095, 8096, 8080]) {
    const run = spawnSync(process.execPath, [path.join(root, 'dev/combat-trial/serve.mjs'), '--port', String(port)], { encoding: 'utf8', timeout: 15000 });
    assert.notEqual(run.status, 0, `端口 ${port} 应被拒绝`);
    assert.match(run.stderr, /战斗试玩不使用/, run.stderr.slice(0, 300));
  }
});

test('关系表垫片：对响应式的关系表 / 矩阵先深拷贝再回填，原对象一个字节都不动', async () => {
  const { reactive, isReactive } = await import('vue');
  const shim = await loadTs('../src/dev/combatTrial/shims/affinityIdentity.ts');
  const records = reactive({ 凝羽: { 名字: '凝羽', 好感度: 10 } });
  const matrix = reactive({ nodes: ['玩家', '凝羽'], edges: [] });
  const before = JSON.stringify({ records, matrix });
  const save = { 社交: { 关系: records, 关系矩阵: matrix }, 世界: { 状态: { 剧本模组: { canon: { characters: [] } } } } };
  shim.backfillRelationshipIds(save, [], () => {});
  assert.equal(JSON.stringify({ records, matrix }), before, '响应式原对象被改动了');
  assert.equal(isReactive(records), true);
  assert.notEqual(save.社交.关系, records, '待返回存档里应是拷贝');
  assert.ok(Object.values(save.社交.关系).every(profile => profile.角色ID), '拷贝上应当完成回填');
  // 普通对象照常回填（读档路径）
  const plain = { 社交: { 关系: { 凝羽: { 名字: '凝羽' } } } };
  shim.backfillRelationshipIds(plain, [], () => {});
  assert.ok(Object.values(plain.社交.关系).every(profile => profile.角色ID));
});

test('账本人名棘轮：src/dev 下的 .ts / .vue 不写死角色库里的任何姓名或别名（作者内容放 data/*.json，代码只用 id）', async () => {
  // 与 scripts/validate-ledger-ratchet.mjs 同一算法：角色库姓名 / 别名里 2–8 个汉字的，统计出现次数。
  const registry = JSON.parse(await readFile(path.join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
  const names = [...new Set(registry.characters.flatMap(c => [c.canonicalName, ...c.aliases]).filter(n => /^[一-鿿]{2,8}$/.test(n)))];
  assert.ok(names.length > 100, '角色库读取失败，断言会空转');
  const offenders = [];
  for (const file of await walk(path.join(root, 'src/dev'))) {
    if (!/\.(ts|vue)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    const hits = names.filter(name => text.includes(name));
    if (hits.length) offenders.push(`${path.relative(root, file)}: ${hits.join('、')}`);
  }
  assert.deepEqual(offenders, [], '这些文件把人名写死在代码里，canon:build 的账本人名棘轮会拦住');
  // 作者数据确实在 JSON 里（防止有人把内容删光来“通过”）
  const data = JSON.parse(await readFile(path.join(root, 'src/dev/combatTrial/data/f03.json'), 'utf8'));
  assert.ok(data.encounterText.length > 40 && Object.keys(data.epilogues).length === 3 && data.ids.ningyu.startsWith('liuchao.character.'));
});
