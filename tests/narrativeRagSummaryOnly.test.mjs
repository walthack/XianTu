// 叙事检索只读概要：summary 进索引与提示词，正文 content 全文、无概要标记条、迁移前旧条目一律不读（设计稿 2026-11-03 第七节方案 B）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const { narrativeRagService } = await loadTs('../src/services/narrativeRagService.ts');
const MARKER = numbers.GAME_NUMBERS.narrative.noSummaryMarker;
const PREFIX = '【仙道1年1月1日 08:00】';
const RAW = '这是一整段详细描写的正文全文，绝不能进检索。';

const saveData = () => ({
  系统: {
    历史: {
      叙事: [
        { type: 'user', content: '玩家输入' },
        { type: 'gm', content: `${PREFIX}${RAW}甲`, summary: `${PREFIX}韩云入城，见王哲。` },
        { type: 'gm', content: `${PREFIX}${RAW}乙`, summary: `${PREFIX}${MARKER}` },
        { type: 'gm', content: `${PREFIX}${RAW}丙` },
        { type: 'gm', content: `${PREFIX}${RAW}丁`, summary: '   ' },
        { type: 'gm', content: `${PREFIX}${RAW}戊`, summary: '王哲赠剑。' },
      ],
    },
  },
});

function harness(seed = []) {
  const store = new Map(seed.map(entry => [entry.id, entry]));
  const embedded = [];
  const svc = Object.create(Object.getPrototypeOf(narrativeRagService));
  svc.config = { ...narrativeRagService.getConfig(), enabled: true, autoIndex: true, minSimilarity: 0.05 };
  svc.db = {
    async getAll() { return [...store.values()]; },
    async put(_name, entry) { store.set(entry.id, entry); },
    async delete(_name, id) { store.delete(id); },
  };
  svc.isEnabled = () => true;
  svc.getEmbeddingRequestConfig = () => ({ model: 'm' });
  svc.embedBatch = async texts => { embedded.push(...texts); return { vectors: texts.map(() => [1, 0]), model: 'm' }; };
  return { svc, store, embedded };
}

test('只计概要条：无概要标记条、空 summary、只有 content 的旧条目都跳过', () => {
  assert.equal(narrativeRagService.countVectorizableNarratives(saveData()), 2);
});

test('建索引与检索结果只含概要，不出现正文全文', async () => {
  const { svc, store, embedded } = harness();
  const section = await svc.buildSectionForPrompt('王哲', saveData());
  assert.deepEqual(embedded, [`${PREFIX}韩云入城，见王哲。`, '王哲赠剑。', '王哲']);
  assert.ok(section.includes('韩云入城，见王哲。'));
  assert.ok(section.includes('王哲赠剑。'));
  assert.ok(!section.includes(RAW));
  assert.ok(!section.includes(MARKER));
  for (const entry of store.values()) assert.ok(!entry.content.includes(RAW));
});

test('旧版按正文建的索引条：autoIndex 关时也不进提示词', async () => {
  const stale = { id: 'nar_1_deadbeef', content: `${PREFIX}${RAW}甲`, vector: [1, 0], vectorType: 'embedding', embeddingModel: 'm', narrativeIndex: 1, timestamp: 0 };
  const { svc } = harness([stale]);
  svc.config.autoIndex = false;
  assert.equal(await svc.buildSectionForPrompt('王哲', saveData()), '');
});

test('源码不读正文 content、不碰本地全文副本', () => {
  const source = readFileSync(new URL('../src/services/narrativeRagService.ts', import.meta.url), 'utf8');
  const reader = source.match(/function getNarrativeItems[\s\S]*?\n}\n/)?.[0] ?? '';
  assert.ok(reader.includes('item.summary'));
  assert.ok(!/item\.content|\.content\b(?!:)/.test(reader.replace(/content: summary/, '')));
  assert.ok(!/narrativeDetailStore|lcq-narrative-detail/.test(source));
});
