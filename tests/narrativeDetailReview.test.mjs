// 回看显示（详细描写不入档，设计稿 2026-11-03 第七节方案 B）：有本地全文副本显示副本，没有显示概要；无概要条显示提示文案。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const { reviewTextOf } = await loadTs('../src/services/narrativeSummary.ts');
const store = await loadTs('../src/services/narrativeDetailStore.ts');
const MARKER = numbers.GAME_NUMBERS.narrative.noSummaryMarker;
const PREFIX = '【仙道1年1月1日 08:00】';
const HINT = '本回合没有概要，本机也没有保存全文';

test('reviewTextOf：有本地副本显示副本', () => {
  assert.equal(reviewTextOf({ content: `${PREFIX}韩云入城。` }, `${PREFIX}全文：韩云入城，城门高三丈……`), `${PREFIX}全文：韩云入城，城门高三丈……`);
  assert.equal(reviewTextOf({ content: `${PREFIX}${MARKER}` }, '无概要条也有全文'), '无概要条也有全文');
});

test('reviewTextOf：无副本显示概要；无概要又无副本返回 null', () => {
  assert.equal(reviewTextOf({ content: `${PREFIX}韩云入城。` }), `${PREFIX}韩云入城。`);
  assert.equal(reviewTextOf({ content: `${PREFIX}韩云入城。` }, '   '), `${PREFIX}韩云入城。`);
  assert.equal(reviewTextOf({ content: `${PREFIX}${MARKER}` }), null);
  assert.equal(reviewTextOf({ content: MARKER }, undefined), null);
  // 迁移前或当回合条目只有正文：照常显示正文
  assert.equal(reviewTextOf({ content: '当回合正文全文' }), '当回合正文全文');
});

test('loadDetailsFor：按角色ID＋detailId 取副本，无副本、无 detailId、空存档标识都略过', async () => {
  store.setNarrativeDetailBackend(store.createMemoryDetailBackend());
  await store.saveDetail('char_1', 'nd_0_a', '第一回全文');
  await store.saveDetail('char_2', 'nd_1_b', '别的角色');
  const entries = [
    { type: 'ai', content: '概要一', detailId: 'nd_0_a' },
    { type: 'ai', content: '概要二', detailId: 'nd_1_b' },
    { type: 'ai', content: '当回合正文' },
    null,
  ];
  const details = await store.loadDetailsFor('char_1', entries);
  assert.deepEqual(details, { nd_0_a: '第一回全文' });
  assert.deepEqual(await store.loadDetailsFor('', entries), {});
  const shown = entries.filter(Boolean).map(entry => reviewTextOf(entry, details[entry.detailId]));
  assert.deepEqual(shown, ['第一回全文', '概要二', '当回合正文']);
  store.setNarrativeDetailBackend(null);
});

test('loadDetailsFor：副本库读取抛错时略过（回看退回概要），不抛', async () => {
  store.setNarrativeDetailBackend({
    async put() {},
    async get() { throw new Error('idb 不可用'); },
    async deleteBySave() {},
  });
  assert.deepEqual(await store.loadDetailsFor('char_1', [{ detailId: 'x' }]), {});
  store.setNarrativeDetailBackend(null);
});

test('主面板与记忆中心导出小说：叙事条目经 reviewTextOf 取回看正文，无概要显示提示文案；提示文案有英文', () => {
  const main = readFileSync(path.join(root, 'src/components/dashboard/MainGamePanel.vue'), 'utf8');
  assert.match(main, /loadDetailsFor\(saveKey/);
  assert.match(main, /reviewTextOf\(/);
  assert.match(main, new RegExp(`const NO_SUMMARY_REVIEW_TEXT = '${HINT}'`));
  assert.match(main, /content: stripNarrativeMetaWords\(\[reviewDisplayText\(latestNarrative\)/);
  assert.ok(!/latestNarrative\.content\.replace/.test(main), '主面板不应再直接显示叙事条目 content');

  const memory = readFileSync(path.join(root, 'src/components/dashboard/MemoryCenterPanel.vue'), 'utf8');
  const exportBody = memory.slice(memory.indexOf('const exportMemoriesAsNovel'), memory.indexOf('URL.createObjectURL', memory.indexOf('const exportMemoriesAsNovel')));
  assert.match(exportBody, /loadDetailsFor\(characterStore\.rootState\.当前激活存档\?\.角色ID/);
  assert.match(exportBody, /reviewTextOf\(entry/);
  assert.ok(exportBody.includes(`t('${HINT}')`));
  assert.ok(!/entry\.content\.replace/.test(exportBody), '导出小说不应再直接用叙事条目 content');

  const i18n = readFileSync(path.join(root, 'src/i18n/index.ts'), 'utf8');
  assert.match(i18n, new RegExp(`'${HINT}': '[^']+'`));
});
