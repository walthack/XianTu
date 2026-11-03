// 叙事正文本地全文副本（narrativeDetailStore.ts；设计稿 2026-11-03 第七节方案 B）：存取、retention=none 不写、按存档删、不进导出／同步／检索。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const store = await loadTs('../src/services/narrativeDetailStore.ts');

const fresh = () => store.setNarrativeDetailBackend(store.createMemoryDetailBackend());

test('Node 无 IndexedDB 时默认后端可用', async () => {
  assert.equal(typeof indexedDB, 'undefined');
  store.setNarrativeDetailBackend(null);
  assert.equal(await store.saveDetail('s0', 'e0', '全文'), true);
  assert.equal(await store.getDetail('s0', 'e0'), '全文');
});

test('saveDetail / getDetail / hasDetail 按存档标识＋条目 id', async () => {
  fresh();
  assert.equal(await store.saveDetail('slotA', 'n1', '正文一'), true);
  await store.saveDetail('slotB', 'n1', '另一个档');
  assert.equal(await store.getDetail('slotA', 'n1'), '正文一');
  assert.equal(await store.getDetail('slotB', 'n1'), '另一个档');
  assert.equal(await store.hasDetail('slotA', 'n1'), true);
  assert.equal(await store.hasDetail('slotA', 'n2'), false);
  assert.equal(await store.getDetail('slotA', 'n2'), undefined);
  await store.saveDetail('slotA', 'n1', '覆盖');
  assert.equal(await store.getDetail('slotA', 'n1'), '覆盖');
});

test('deleteForSave 只删该存档', async () => {
  fresh();
  await store.saveDetail('slotA', 'n1', 'a1');
  await store.saveDetail('slotA', 'n2', 'a2');
  await store.saveDetail('slotB', 'n1', 'b1');
  await store.deleteForSave('slotA');
  assert.equal(await store.hasDetail('slotA', 'n1'), false);
  assert.equal(await store.hasDetail('slotA', 'n2'), false);
  assert.equal(await store.getDetail('slotB', 'n1'), 'b1');
});

test('detailRetention=none 时 saveDetail 不写', async () => {
  fresh();
  numbers.applyGameNumbers({ narrative: { detailRetention: 'none' } });
  try {
    assert.equal(await store.saveDetail('slotA', 'n1', '正文'), false);
    assert.equal(await store.hasDetail('slotA', 'n1'), false);
  } finally {
    numbers.applyGameNumbers({ narrative: { detailRetention: 'localOnly' } });
  }
});

test('可注入后端', async () => {
  const calls = [];
  store.setNarrativeDetailBackend({
    async put(record) { calls.push(['put', record.saveKey, record.entryId, record.content]); },
    async get() { return undefined; },
    async deleteBySave(saveKey) { calls.push(['del', saveKey]); },
  });
  await store.saveDetail('s', 'e', 'c');
  await store.deleteForSave('s');
  assert.deepEqual(calls, [['put', 's', 'e', 'c'], ['del', 's']]);
  store.setNarrativeDetailBackend(null);
});

test('独立库，不碰存档库；不被导出、云同步、叙事检索引用', () => {
  const source = readFileSync(path.join(root, 'src/services/narrativeDetailStore.ts'), 'utf8');
  assert.match(source, /const DB_NAME = 'lcq-narrative-detail';/);
  assert.ok(!/from '@\/utils\/indexedDBManager'|DB_NAME = 'DAD_SAVES_DB'/.test(source));
  const walk = dir => readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  const offenders = walk(path.join(root, 'src'))
    .filter(file => /\.(ts|vue)$/.test(file) && !file.endsWith('narrativeDetailStore.ts'))
    .filter(file => /narrativeDetailStore|lcq-narrative-detail/.test(readFileSync(file, 'utf8')))
    .map(file => path.relative(root, file));
  const forbidden = /cloudDataSync|userCloudStorage|dadBundle|services\/api\/|narrativeRagService|indexedDBManager|SavePanel|modules\/diagnostics\/(export|feedback|zip)\.ts/;
  assert.deepEqual(offenders.filter(file => forbidden.test(file)), []);
});
