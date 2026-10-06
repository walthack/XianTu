// 场面模块是通用模块：不写人名、不依赖试玩代码和主应用、不留已取消的伤害点概念。
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src/modules/sceneModule');
const files = (await readdir(dir)).filter(name => name.endsWith('.ts'));

test('场面模块只依赖自己和类型：不引用 dev 试玩代码，不引用主应用的运行时代码', async () => {
  const imports = [];
  for (const name of files) {
    const text = await readFile(path.join(dir, name), 'utf8');
    for (const match of text.matchAll(/(?:import|export)[^'"]*from\s+'([^']+)'/g)) imports.push([name, match[1], /import type/.test(match[0])]);
  }
  const outside = imports.filter(([, spec]) => !spec.startsWith('./') && spec !== '../../../mod-kit/game-numbers.qingyu.json');
  assert.deepEqual(outside.map(([name, spec, typeOnly]) => `${name} ${spec} ${typeOnly}`), ['statusAdapters.ts @/types/game true'], '唯一的外部引用是对游戏状态类型的 type import');
});

test('场面模块的 .ts 不写死角色库里的任何姓名或别名（账本人名棘轮同一算法）', async () => {
  const registry = JSON.parse(await readFile(path.join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
  const names = [...new Set(registry.characters.flatMap(c => [c.canonicalName, ...c.aliases]).filter(n => /^[一-鿿]{2,8}$/.test(n)))];
  assert.ok(names.length > 100, '角色库读取失败，断言会空转');
  const offenders = [];
  for (const name of files) {
    const text = await readFile(path.join(dir, name), 'utf8');
    const hits = names.filter(n => text.includes(n));
    if (hits.length) offenders.push(`${name}: ${hits.join('、')}`);
  }
  assert.deepEqual(offenders, []);
});

test('伤害点、战败代价梯度、野心附加已取消：代码里只有体检拒绝旧字段的那张表还提到它们', async () => {
  const retired = /harmPoints|costLadder|ambitionSurcharge|harmToTier|critRelief|maxTierLift/;
  const offenders = [];
  for (const name of files) {
    if (name === 'lint.ts') continue;
    const text = await readFile(path.join(dir, name), 'utf8');
    if (retired.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test('模块里没有胜负、拍数、人头数的默认门槛：设置默认值里不含这类字段', async () => {
  const { loadTs } = await import('./loadTs.mjs');
  const { DEFAULT_SETTINGS } = await loadTs('../src/modules/sceneModule/tiers.ts');
  const text = JSON.stringify(DEFAULT_SETTINGS);
  for (const key of ['beats"', 'onTimeout', 'ambushAfterStall', 'headcount', 'harm', 'win', 'lose']) {
    assert.equal(text.includes(key), false, `默认设置里不应出现 ${key}`);
  }
  assert.equal(DEFAULT_SETTINGS.tiers.failure.edge, 2);
});
