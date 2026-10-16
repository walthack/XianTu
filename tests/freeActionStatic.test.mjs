// 自由行动的静态守则：不对玩家原话做关键词/正则匹配、不按变体名分支、必须活着的读取路径隔离。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mods } from './freeActionFixture.mjs';

const dir = fileURLToPath(new URL('../src/modules/scenarioMods/freeAction/', import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
const source = f => readFileSync(`${dir}${f}`, 'utf8');
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('反关键词静态检查：freeAction/** 不含正则或字符串匹配 API（原话只做 evidence 的连续子串核对）', () => {
  assert.ok(files.length >= 10);
  for (const f of files) {
    const code = stripComments(source(f));
    for (const pattern of [/\.test\(/, /\.match\(/, /\.matchAll\(/, /\.search\(/, /new RegExp/, /\.replace\(\s*\//]) assert.doesNotMatch(code, pattern, `${f} 含 ${pattern}`);
  }
});

test('代码只认类的路由家族与 effect 种类，不认变体名：freeAction/** 里没有任何变体 id 字面量（config.ts 除外）', () => {
  const ids = Object.values(mods.config.freeActionConfig().classes).flatMap(c => Object.keys(c.variants)).filter(id => id !== 'none');
  assert.ok(ids.length >= 12);
  for (const f of files.filter(name => name !== 'config.ts')) {
    const code = stripComments(source(f));
    for (const id of ids) assert.equal(new RegExp(`['"\`]${id}['"\`]`).test(code), false, `${f} 按变体名分支：${id}`);
  }
});

test('冻结文件不被 freeAction 引用写入：freeAction/** 只读导入 runtime / AIBidirectionalSystem 以外的东西', () => {
  for (const f of files) {
    const code = source(f);
    assert.doesNotMatch(code, /AIBidirectionalSystem/, f);
    assert.doesNotMatch(code, /from ['"][^'"]*scenarioMods\/runtime['"]|from ['"]\.\.\/runtime['"]/, `${f} 不应依赖 runtime.ts`);
  }
});

test('T31 剧情死亡不被拦截：必须活着的读取只在 protect.ts，且只被 freeAction 自己的结算/闸门引用（共用写入与守卫零引用）', () => {
  const consumers = files.filter(f => /protectedForbids|protectedCapFor|lifeFloorFor|isMustSurvive/.test(source(f))).sort();
  assert.deepEqual(consumers, ['actorStatus.ts', 'gates.ts', 'protect.ts', 'settle.ts']);
  const shared = ['modules/sceneModule/host/injuries.ts', 'modules/scenarioMods/runtime.ts', 'modules/sceneModule/host/writeback.ts', 'modules/scenarioMods/canonGuard.ts', 'modules/scenarioMods/fixedEndingNarratives.ts'];
  for (const f of shared) assert.doesNotMatch(readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8'), /from\s+['"][^'"]*protect['"]|mustSurvive|MustSurvive/, f);
});

test('R6 episode 排序/封顶与 runtime.ts 的 normalizeMemoryEpisodes 同口径（该函数未导出，这里核对源码并核对行为）', () => {
  const runtimeSource = readFileSync(fileURLToPath(new URL('../src/modules/scenarioMods/runtime.ts', import.meta.url)), 'utf8');
  const start = runtimeSource.indexOf('function normalizeMemoryEpisodes');
  const body = runtimeSource.slice(start, runtimeSource.indexOf('\n}\n', start));
  assert.ok(body.includes('.sort((a, b) => b.salience - a.salience || b.occurredAtTurn - a.occurredAtTurn || (a.id < b.id ? -1 : 1))'));
  assert.ok(body.includes('.slice(0, 12)') && mods.config.freeActionConfig().memory.episodeKeep === 12);
  assert.ok(body.includes('.sort((a, b) => a.occurredAtTurn - b.occurredAtTurn || (a.id < b.id ? -1 : 1))'));
  const episodes = Array.from({ length: 20 }, (_, i) => ({ id: `e${String(i).padStart(2, '0')}`, eventId: 'x', summary: 's', tags: [], salience: i % 5 === 0 ? 90 : 10 + i, occurredAtTurn: 100 - i }));
  const kept = mods.memory.normalizeEpisodes(episodes);
  assert.equal(kept.length, 12);
  assert.deepEqual(kept.map(e => e.occurredAtTurn), [...kept.map(e => e.occurredAtTurn)].sort((a, b) => a - b));
  assert.deepEqual(kept.filter(e => e.salience === 90).length, 4, '高显著度的先保住');
});

test('T19 决策核心无副作用：自由行动写的 episode 标签不与任何作者声明的 utility.memories 标签相交', () => {
  const data = fileURLToPath(new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url));
  const authored = new Set();
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.utility?.memories) for (const m of node.utility.memories) authored.add(m.tag);
    Object.values(node).forEach(walk);
  };
  for (const f of readdirSync(data).filter(name => name.endsWith('.json'))) walk(JSON.parse(readFileSync(`${data}${f}`, 'utf8')));
  assert.ok(authored.size >= 1);
  for (const tag of authored) assert.ok(tag !== 'major_episode' && !String(tag).startsWith('free:') && !String(tag).startsWith('receipt:free'), tag);
});
