// 宋线 S4：rail 生成器的去处路由（scripts/canon-rail-routing.mjs）。生成器依赖被 gitignore 的源，本机跑不了，所以路由抽成纯函数在这里测：
// 合成输入、临时包目录，外加「把仓库里两处生成档并回生成器输出，再路由一遍，逐字节等于已提交的文件」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readPackRailClaims, routeRailProfiles } from '../scripts/canon-rail-routing.mjs';

const root = resolve(import.meta.dirname, '..');
const p = modId => ({ id: modId, modId, chapterId: `${modId}.chapter`, orderedEventIds: [`${modId}.e`], contracts: [] });

test('路由：被 .generated.json 认领的档写回包文件，其余进核心生成档，各自保持生成顺序', () => {
  const profiles = ['a', 'b', 'c', 'd'].map(p);
  const { core, packs } = routeRailProfiles(profiles, [
    { file: 'packs/x/rails.generated.json', generated: true, modIds: ['d', 'b'] },
    { file: 'packs/y/rails.json', generated: false, modIds: ['z'] },
  ]);
  assert.deepEqual(core.map(x => x.modId), ['a', 'c']);
  assert.deepEqual([...packs.keys()], ['packs/x/rails.generated.json']);
  assert.deepEqual(packs.get('packs/x/rails.generated.json').map(x => x.modId), ['b', 'd']);
  assert.deepEqual(routeRailProfiles(profiles, []).core, profiles, '没有认领时与原来一样');
});

test('路由 fail closed：手写包 rail 认领、两个文件认领同一关、认领了却没生成', () => {
  const profiles = ['a', 'b'].map(p);
  assert.throws(() => routeRailProfiles(profiles, [{ file: 'packs/qin/rails.json', generated: false, modIds: ['a'] }]),
    /canon rail a: generated, but packs\/qin\/rails\.json is a hand-written pack rail/);
  assert.throws(() => routeRailProfiles(profiles, [{ file: 'x.generated.json', generated: true, modIds: ['a'] }, { file: 'y.generated.json', generated: true, modIds: ['a'] }]),
    /canon rail a: claimed by both x\.generated\.json and y\.generated\.json/);
  assert.throws(() => routeRailProfiles(profiles, [{ file: 'x.generated.json', generated: true, modIds: ['a', 'gone'] }]),
    /canon rail gone: claimed by x\.generated\.json but not generated/);
});

test('readPackRailClaims：按包目录名与 manifest 顺序读，按文件名区分生成档', async () => {
  const dir = await mkdtemp(join(root, '_newbot_tmp/song-s4-rail-routing-'));
  try {
    const pack = async (name, rails) => {
      await mkdir(join(dir, name));
      await writeFile(join(dir, name, 'manifest.json'), JSON.stringify({ schemaVersion: 1, id: `test.${name}`, ...(rails ? { rails: Object.keys(rails) } : {}) }));
      for (const [f, v] of Object.entries(rails || {})) await writeFile(join(dir, name, f), JSON.stringify(v));
    };
    await pack('b', { 'rails.generated.json': [p('s1'), p('s2')], 'rails.json': [p('h1')] });
    await pack('a', { 'rails.json': [p('h0')] });
    await pack('c');
    const rel = dir.slice(root.length + 1);
    assert.deepEqual(await readPackRailClaims(dir, root), [
      { file: `${rel}/a/rails.json`, generated: false, modIds: ['h0'] },
      { file: `${rel}/b/rails.generated.json`, generated: true, modIds: ['s1', 's2'] },
      { file: `${rel}/b/rails.json`, generated: false, modIds: ['h1'] },
    ]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('仓库现状：两处生成档并回生成器输出（按关 id 排＝生成器按文件名的顺序）再路由，逐字节等于已提交文件', async () => {
  const ser = v => JSON.stringify(v, null, 2) + '\n';
  const corePath = join(root, 'src/modules/scenarioMods/canonRailProfiles.generated.json');
  const claims = await readPackRailClaims(join(root, 'src/modules/contentPacks/packs'), root);
  const generatedFiles = claims.filter(c => c.generated).map(c => c.file);
  // 晋线 S4：晋 3 档进 packs/jin/rails.generated.json（读包顺序按目录名）
  assert.deepEqual(generatedFiles, ['src/modules/contentPacks/packs/jin/rails.generated.json', 'src/modules/contentPacks/packs/song/rails.generated.json']);
  const texts = new Map(await Promise.all([corePath, ...generatedFiles.map(f => join(root, f))].map(async f => [f, await readFile(f, 'utf8')])));
  const all = [...texts.values()].flatMap(t => JSON.parse(t)).sort((a, b) => (a.modId < b.modId ? -1 : a.modId > b.modId ? 1 : 0));
  const { core, packs } = routeRailProfiles(all, claims);
  assert.equal(ser(core), texts.get(corePath));
  for (const f of generatedFiles) assert.equal(ser(packs.get(f)), texts.get(join(root, f)), f);
});
