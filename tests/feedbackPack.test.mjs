// 一键反馈包：zip 写入器结构、默认不含存档/勾选才含、存档叙事脱敏（配置项，默认脱敏）、密钥无论如何不泄露、
// 配置体检登记、下载与失败日志、设置页与启动失败兜底界面的入口接线。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const root = new URL('..', import.meta.url).pathname;
const zip = await loadTs('../src/modules/diagnostics/zip.ts');
const feedback = await loadTs('../src/modules/diagnostics/feedback.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const store = await loadTs('../src/modules/diagnostics/store.ts');
const fatal = await loadTs('../src/utils/fatalFallback.ts');

const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};

// ───────────── 独立的 zip 读取器（不复用被测写入器的任何代码，含 CRC 校验） ─────────────

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
const crcOf = data => { let c = 0xffffffff; for (const b of data) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && eocd < 0; i--) if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  assert.ok(eocd >= 0, '找到 EOCD');
  const total = view.getUint16(eocd + 10, true), cdSize = view.getUint32(eocd + 12, true), cdOffset = view.getUint32(eocd + 16, true);
  assert.equal(view.getUint16(eocd + 8, true), total);
  assert.equal(cdOffset + cdSize, eocd, '中央目录紧贴 EOCD');
  assert.equal(view.getUint16(eocd + 20, true), 0, '无 zip 注释');
  const files = new Map();
  let pos = cdOffset;
  for (let i = 0; i < total; i++) {
    assert.equal(view.getUint32(pos, true), 0x02014b50);
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), crc = view.getUint32(pos + 16, true);
    const csize = view.getUint32(pos + 20, true), usize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true), extraLen = view.getUint16(pos + 30, true), commentLen = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    assert.equal(flags & 0x0800, 0x0800, 'UTF-8 文件名标志');
    assert.equal(method, 0, 'store 模式');
    assert.equal(csize, usize);
    // 本地头必须与中央目录一致
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint32(local + 14, true), crc);
    assert.equal(view.getUint32(local + 18, true), csize);
    const localNameLen = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
    assert.equal(new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + localNameLen)), name);
    const data = bytes.subarray(local + 30 + localNameLen + localExtra, local + 30 + localNameLen + localExtra + usize);
    assert.equal(crcOf(data), crc, `${name} CRC 正确`);
    assert.ok(!files.has(name));
    files.set(name, data);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  assert.equal(pos, eocd);
  return files;
}
const textOf = (files, name) => new TextDecoder().decode(files.get(name));
const jsonOf = (files, name) => JSON.parse(textOf(files, name));
const allText = files => [...files.keys()].map(name => textOf(files, name)).join('\n');

// ───────────── zip 写入器 ─────────────

test('createZip：多文件（含中文名、空文件、二进制）结构可解析，内容与 CRC 一致', () => {
  const binary = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7) % 256);
  const bytes = zip.createZip([
    { name: 'a.json', data: '{"k":1}' },
    { name: '存档/第一槽.json', data: '中文内容🙂' },
    { name: 'empty.txt', data: '' },
    { name: 'bin.dat', data: binary },
  ], new Date(2026, 9, 18, 12, 30, 40));
  const files = readZip(bytes);
  assert.deepEqual([...files.keys()], ['a.json', '存档/第一槽.json', 'empty.txt', 'bin.dat']);
  assert.equal(textOf(files, 'a.json'), '{"k":1}');
  assert.equal(textOf(files, '存档/第一槽.json'), '中文内容🙂');
  assert.equal(files.get('empty.txt').length, 0);
  assert.deepEqual([...files.get('bin.dat')], [...binary]);
});

test('createZip：crc32 已知向量；空 zip 只有 EOCD；DOS 时间戳按传入时间写', () => {
  assert.equal(zip.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(zip.crc32(new Uint8Array()), 0);
  const empty = zip.createZip([]);
  assert.equal(empty.length, 22);
  assert.equal(readZip(empty).size, 0);
  const bytes = zip.createZip([{ name: 'x', data: 'y' }], new Date(2026, 9, 18, 12, 30, 40));
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  assert.equal(view.getUint16(10, true), (12 << 11) | (30 << 5) | 20, '时间');
  assert.equal(view.getUint16(12, true), ((2026 - 1980) << 9) | (10 << 5) | 18, '日期');
});

test('createZip：不合法或重复的文件名直接抛错', () => {
  for (const name of ['', '/abs', '../up', 'a/../b', 'a\\b', 'dir/', 'a//b']) assert.throws(() => zip.createZip([{ name, data: 'x' }]), /文件名/, name);
  assert.throws(() => zip.createZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }]), /重复/);
});

test('createZip：系统 unzip 能完整校验（本机有 unzip 才跑）', t => {
  const probe = spawnSync('unzip', ['-v']);
  if (probe.error || probe.status !== 0) return t.skip('本机没有 unzip');
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'lcq-zip-')), 'x.zip');
  writeFileSync(file, zip.createZip([{ name: 'a.json', data: '{"中文":"值"}' }, { name: 'b/c.txt', data: 'hello' }]));
  const result = spawnSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /No errors detected/);
});

// ───────────── 样本 ─────────────

const SK = 'sk-ABCDEF1234567890abcdef';
const BEARER = 'Bearer abcdefghijklmnop1234567890';
const RAW_KEYS = ['PLAIN-KEY-NO-PREFIX-123', 'RAWKEY-IN-LOG-1234', 'RAWKEY-IN-SAVE-5678', 'pw123456', 'PLAINKEY_9f8e7d', 't0ken-value-abc'];
const GLOBALS = ['APP_VERSION', 'BUILD_ID', 'GIT_SHA', 'CONTENT_PACK_VERSION'];

const sampleSave = () => ({
  元数据: { 版本号: 3, 存档名: '测试档', 游戏版本: '0.1.0' },
  角色: { 身份: { 名字: '李逍遥' }, 位置: { 描述: '六朝诸国·月牙平原' } },
  社交: { 记忆: { 短期记忆: ['MEM_SHORT_TEXT'], 中期记忆: ['MEM_MID_TEXT'], 长期记忆: ['MEM_LONG_TEXT'], 隐式中期记忆: [] } },
  世界: { 信息: { 世界名称: '六朝并置世界' } },
  系统: {
    历史: { 叙事: [
      { type: 'ai', content: 'NARR_SECRET_TEXT_1', time: '16年1月1日', userIntent: 'INTENT_SECRET', actionOptions: ['OPT_SECRET_A', 'OPT_SECRET_B'], stateChanges: { 日志: ['STATE_SECRET'] } },
      { type: 'user', content: 'NARR_SECRET_TEXT_2', time: '16年1月2日', actionOptions: [] },
    ] },
    设置: { apiKey: 'RAWKEY-IN-SAVE-5678', 备注: `联系方式 ${BEARER} 结束`, 另一个: SK },
  },
});

const modelStorage = () => new Map([
  ['api_management_config', JSON.stringify({
    apiConfigs: [
      { id: 'default', name: '主力', provider: 'openai', url: 'https://user:pw123456@api.example.com/v1?key=PLAINKEY_9f8e7d&api_key=zzz#frag', apiKey: SK, model: 'gpt-x', temperature: 0.7, maxTokens: 1000, enabled: true },
      { id: 'local', name: '本地', provider: 'ollama', url: 'http://localhost:11434', apiKey: '', model: 'llama3.1', temperature: 0.7, maxTokens: 500, enabled: false },
    ],
    apiAssignments: [{ type: 'main', apiId: 'default' }],
    moduleAssignments: [{ moduleId: 'audit', apiId: 'inherit' }],
    moduleEnabled: { audit: false },
    aiGenerationSettings: { splitStep2Streaming: false },
  })],
  ['ai_service_config', JSON.stringify({ mode: 'custom', streaming: true, token: 't0ken-value-abc', customAPI: { provider: 'custom', url: 'https://x.example/v1', apiKey: 'PLAIN-KEY-NO-PREFIX-123', model: 'm1' } })],
]);

async function withEnv({ storage = modelStorage(), globals = {} } = {}, fn) {
  const savedLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedGlobals = Object.fromEntries(GLOBALS.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of GLOBALS) delete globalThis[k];
  Object.assign(globalThis, globals);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) } });
  try { return await fn(); } finally {
    if (savedLocal) Object.defineProperty(globalThis, 'localStorage', savedLocal); else delete globalThis.localStorage;
    for (const k of GLOBALS) { delete globalThis[k]; if (savedGlobals[k]) Object.defineProperty(globalThis, k, savedGlobals[k]); }
  }
}

async function withNarrativeRedaction(value, fn) {
  const before = feedback.feedbackConfig().redactSaveNarrative;
  numbers.applyGameNumbers({ feedback: { redactSaveNarrative: value } });
  try { return await fn(); } finally { numbers.applyGameNumbers({ feedback: { redactSaveNarrative: before } }); }
}

async function seedLog() {
  await log.resetLogState();
  await quiet(() => {
    log.logError('LCQ-NET-004', new Error(`request failed: ${BEARER} and ${SK}`), { detail: { apiKey: 'RAWKEY-IN-LOG-1234', headers: { Authorization: BEARER }, status: 401 } });
    log.logError('LCQ-NET-005', new Error('plain network failure'));
  });
}

// ───────────── 默认不含存档 / 勾选才含 ─────────────

test('默认（不传选项）不含存档：不会去读存档，文件清单固定，manifest 写明未请求', async () => {
  await seedLog();
  await withEnv({}, async () => {
    let reads = 0;
    const pack = await feedback.buildFeedbackPack({}, { loadSave: async () => { reads++; return { slot: 's', data: sampleSave() }; } });
    assert.equal(reads, 0, '没勾选就不碰存档');
    const files = readZip(pack.bytes);
    assert.deepEqual([...files.keys()].sort(), ['logs.json', 'manifest.json', 'model-config.json', 'perf.json', 'version.json']);
    assert.equal(files.has('save.json'), false);
    assert.deepEqual(jsonOf(files, 'manifest.json').save, { requested: false, included: false });
    assert.ok(!allText(files).includes('NARR_SECRET_TEXT_1'));
    // includeSave: false 同样不含
    const explicit = readZip((await feedback.buildFeedbackPack({ includeSave: false }, { loadSave: async () => { reads++; return null; } })).bytes);
    assert.equal(reads, 0);
    assert.equal(explicit.has('save.json'), false);
  });
});

test('勾选 includeSave：多出 save.json（可解析），manifest 记槽位与是否脱敏，文件大小与实际一致', async () => {
  await seedLog();
  await withEnv({}, async () => {
    const pack = await feedback.buildFeedbackPack({ includeSave: true }, { loadSave: async () => ({ slot: '存档1', data: sampleSave() }) });
    const files = readZip(pack.bytes);
    assert.deepEqual([...files.keys()].sort(), ['logs.json', 'manifest.json', 'model-config.json', 'perf.json', 'save.json', 'version.json']);
    const save = jsonOf(files, 'save.json');
    assert.equal(save.角色.身份.名字, '李逍遥');
    assert.equal(save.元数据.存档名, '测试档');
    const manifest = jsonOf(files, 'manifest.json');
    assert.deepEqual(manifest.save, { requested: true, included: true, slot: '存档1', narrativeRedacted: true });
    assert.deepEqual(manifest, pack.manifest);
    for (const entry of manifest.files) assert.equal(files.get(entry.name).length, entry.bytes, entry.name);
    assert.deepEqual(manifest.files.map(entry => entry.name).sort(), ['logs.json', 'model-config.json', 'perf.json', 'save.json', 'version.json']);
  });
});

test('勾选但没有当前存档 / 读取抛错：照常出包，manifest 写明原因，读取失败记 LCQ-SAV-018', async () => {
  await seedLog();
  await withEnv({}, async () => {
    const none = await feedback.buildFeedbackPack({ includeSave: true }, { loadSave: async () => null });
    assert.deepEqual(jsonOf(readZip(none.bytes), 'manifest.json').save, { requested: true, included: false, note: '没有找到当前存档' });
    const failed = await quiet(() => feedback.buildFeedbackPack({ includeSave: true }, { loadSave: async () => { throw new Error('idb 炸了'); } }));
    const files = readZip(failed.bytes);
    assert.equal(files.has('save.json'), false);
    assert.equal(jsonOf(files, 'manifest.json').save.included, false);
    assert.match(jsonOf(files, 'manifest.json').save.note, /读取存档失败/);
    assert.ok(store.logStore.recent(20).some(entry => entry.code === 'LCQ-SAV-018'));
  });
});

// ───────────── 版本信息 / 日志 / 模型配置 ─────────────

test('version.json 带游戏版本、构建号、GIT_SHA、内容包版本；未注入回退 unknown', async () => {
  await seedLog();
  await withEnv({ globals: { APP_VERSION: '0.1.0', BUILD_ID: 'a1b2c3d-20261018', GIT_SHA: 'a1b2c3d', CONTENT_PACK_VERSION: '990e8d35' } }, async () => {
    const version = jsonOf(readZip((await feedback.buildFeedbackPack()).bytes), 'version.json');
    assert.equal(version.app, 'XianTu');
    assert.equal(version.gameVersion, '0.1.0');
    assert.equal(version.buildId, 'a1b2c3d-20261018');
    assert.equal(version.gitSha, 'a1b2c3d');
    assert.equal(version.contentPackVersion, '990e8d35');
    assert.match(version.exportedAt, /^\d{4}-\d\d-\d\dT/);
  });
  await withEnv({}, async () => {
    const version = jsonOf(readZip((await feedback.buildFeedbackPack()).bytes), 'version.json');
    assert.deepEqual([version.gameVersion, version.buildId, version.gitSha, version.contentPackVersion], ['unknown', 'unknown', 'unknown', 'unknown']);
  });
});

test('logs.json 即现有日志导出结构（entries 带 code / level），含刚记的两条', async () => {
  await seedLog();
  await withEnv({}, async () => {
    const logs = jsonOf(readZip((await feedback.buildFeedbackPack()).bytes), 'logs.json');
    assert.equal(logs.count, logs.entries.length);
    assert.deepEqual(logs.entries.map(entry => entry.code).sort(), ['LCQ-NET-004', 'LCQ-NET-005']);
  });
});

test('model-config.json：只含白名单字段与“是否填了密钥”，URL 去掉账号/查询串/锚点', async () => {
  await seedLog();
  await withEnv({}, async () => {
    const config = jsonOf(readZip((await feedback.buildFeedbackPack()).bytes), 'model-config.json');
    const [main, local] = config.apiManagement.apis;
    assert.deepEqual(main, { id: 'default', name: '主力', provider: 'openai', model: 'gpt-x', temperature: 0.7, maxTokens: 1000, enabled: true, url: 'https://api.example.com/v1', keySet: true });
    assert.equal(local.keySet, false);
    assert.equal(local.url, 'http://localhost:11434');
    assert.deepEqual(config.apiManagement.apiAssignments, [{ type: 'main', apiId: 'default' }]);
    assert.deepEqual(config.aiService, { mode: 'custom', streaming: true, customAPI: { provider: 'custom', model: 'm1', url: 'https://x.example/v1', keySet: true } });
    const text = JSON.stringify(config);
    assert.ok(!/apiKey|"token"/i.test(text), '摘要里没有密钥字段');
  });
});

test('model-config：没有任何配置 / 配置损坏也能出包', async () => {
  await seedLog();
  await withEnv({ storage: new Map() }, async () => {
    const config = jsonOf(readZip((await feedback.buildFeedbackPack()).bytes), 'model-config.json');
    assert.deepEqual(config.apiManagement.apis, []);
    assert.equal(config.aiService.customAPI.keySet, false);
  });
  await withEnv({ storage: new Map([['api_management_config', '{坏的json'], ['ai_service_config', '123']]) }, async () => {
    const config = jsonOf(readZip((await feedback.buildFeedbackPack()).bytes), 'model-config.json');
    assert.deepEqual(config.apiManagement.apis, []);
  });
});

test('describeUrl：各种形状', () => {
  assert.equal(feedback.describeUrl('https://u:p@h.example:8443/a/b?key=1#x'), 'https://h.example:8443/a/b');
  assert.equal(feedback.describeUrl('https://h.example/'), 'https://h.example');
  assert.equal(feedback.describeUrl(''), '');
  assert.equal(feedback.describeUrl(undefined), '');
  assert.ok(!feedback.describeUrl('not a url ?key=SECRETVALUE1234').includes('SECRETVALUE1234'));
});

// ───────────── 存档叙事脱敏（配置项） ─────────────

test('默认配置 = 脱敏：叙事与记忆原文消失只留字数，type/time/名字/世界名等保留', async () => {
  assert.equal(feedback.feedbackConfig().redactSaveNarrative, true, '默认值是脱敏');
  await seedLog();
  await withEnv({}, async () => {
    const pack = await feedback.buildFeedbackPack({ includeSave: true }, { loadSave: async () => ({ slot: 's', data: sampleSave() }) });
    const files = readZip(pack.bytes), text = textOf(files, 'save.json');
    for (const secretText of ['NARR_SECRET_TEXT_1', 'NARR_SECRET_TEXT_2', 'INTENT_SECRET', 'OPT_SECRET_A', 'STATE_SECRET', 'MEM_SHORT_TEXT', 'MEM_MID_TEXT', 'MEM_LONG_TEXT']) assert.ok(!text.includes(secretText), secretText);
    const save = JSON.parse(text);
    const first = save.系统.历史.叙事[0];
    assert.equal(first.content, '[叙事原文已脱敏，18字]');
    assert.equal(first.type, 'ai');
    assert.equal(first.time, '16年1月1日');
    assert.deepEqual(first.actionOptions, ['[叙事原文已脱敏，12字]', '[叙事原文已脱敏，12字]']);
    assert.equal(save.社交.记忆.短期记忆[0], '[叙事原文已脱敏，14字]');
    assert.equal(save.角色.身份.名字, '李逍遥');
    assert.equal(save.世界.信息.世界名称, '六朝并置世界');
    assert.equal(save.元数据.存档名, '测试档');
  });
});

test('配置关掉脱敏：叙事原文原样带出（manifest 如实写 narrativeRedacted:false），密钥仍然抹掉；配置恢复后又脱敏', async () => {
  await seedLog();
  await withEnv({}, async () => {
    const run = async () => feedback.buildFeedbackPack({ includeSave: true }, { loadSave: async () => ({ slot: 's', data: sampleSave() }) });
    await withNarrativeRedaction(false, async () => {
      const files = readZip((await run()).bytes), save = jsonOf(files, 'save.json');
      assert.equal(save.系统.历史.叙事[0].content, 'NARR_SECRET_TEXT_1');
      assert.deepEqual(save.社交.记忆.短期记忆, ['MEM_SHORT_TEXT']);
      assert.equal(jsonOf(files, 'manifest.json').save.narrativeRedacted, false);
      assert.equal(save.系统.设置.apiKey, '[已脱敏]');
      assert.ok(!allText(files).includes(SK) && !allText(files).includes(BEARER));
    });
    const files = readZip((await run()).bytes);
    assert.ok(!textOf(files, 'save.json').includes('NARR_SECRET_TEXT_1'));
    assert.equal(jsonOf(files, 'manifest.json').save.narrativeRedacted, true);
  });
});

test('scrubDeep：不改入参；narrativePaths 来自配置（可改路径）；循环引用与极深嵌套不抛错', () => {
  const input = { a: { 说: ['甲乙丙'], type: 't' }, b: { 说: ['丁'] } };
  const snapshot = JSON.stringify(input);
  const cfg = { redactSaveNarrative: true, narrativePaths: [['a']], narrativeKeepKeys: ['type'] };
  assert.deepEqual(feedback.scrubDeep(input, undefined, cfg), { a: { 说: ['[叙事原文已脱敏，3字]'], type: 't' }, b: { 说: ['丁'] } });
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(feedback.scrubDeep(input, undefined, null), input, '不传叙事配置就不脱敏叙事');
  const loop = { name: 'x' }; loop.self = loop;
  assert.equal(feedback.scrubDeep(loop).self, '[循环引用]');
  let deep = {}; const head = deep; for (let i = 0; i < 200; i++) { deep.n = {}; deep = deep.n; }
  assert.doesNotThrow(() => feedback.scrubDeep(head));
  const evil = { get boom() { throw new Error('getter'); } };
  assert.equal(feedback.scrubDeep(evil), '[无法脱敏，已整体省略]');
});

// ───────────── 密钥不泄露 ─────────────

test('密钥不泄露：日志 / 模型配置 / 存档（含各种形状）整包文本里找不到任何密钥原文', async () => {
  await seedLog();
  await withEnv({}, async () => {
    for (const redactNarrative of [true, false]) {
      await withNarrativeRedaction(redactNarrative, async () => {
        const pack = await feedback.buildFeedbackPack({ includeSave: true }, { loadSave: async () => ({ slot: `槽 ${SK}`, data: sampleSave() }) });
        const text = allText(readZip(pack.bytes));
        for (const secret of [SK, BEARER, 'abcdefghijklmnop1234567890', ...RAW_KEYS]) assert.ok(!text.includes(secret), `${redactNarrative ? '脱敏' : '不脱敏'}模式下泄露了 ${secret}`);
        assert.ok(text.includes('[已脱敏]'), '确实发生了替换');
      });
    }
  });
});

test('密钥不泄露（纵深）：即使模型配置提供者误把原始密钥交上来，也在出包前被抹掉', async () => {
  await seedLog();
  await withEnv({}, async () => {
    const raw = { apiKey: 'PLAIN-KEY-NO-PREFIX-123', nested: { Authorization: BEARER, access_token: 't0ken-value-abc', list: [{ secret: 'pw123456' }] }, note: `用了 ${SK} 和 https://h.example/v1?api_key=PLAINKEY_9f8e7d&x=1`, geminiUrl: 'https://g.example/v1beta/models?key=AIzaSyD-test1234567890abcdefgh' };
    const text = allText(readZip((await feedback.buildFeedbackPack({}, { readModelConfig: () => raw })).bytes));
    for (const secret of [SK, BEARER, 'AIzaSyD-test1234567890abcdefgh', ...RAW_KEYS]) assert.ok(!text.includes(secret), secret);
    const out = jsonOf(readZip((await feedback.buildFeedbackPack({}, { readModelConfig: () => raw })).bytes), 'model-config.json');
    assert.equal(out.apiKey, '[已脱敏]');
    assert.equal(out.nested.Authorization, '[已脱敏]');
    assert.equal(out.nested.access_token, '[已脱敏]');
  });
});

test('summarizeModelConfig：形状乱也不抛；绝不输出 apiKey 的值或长度', () => {
  for (const bad of [{}, { apiManagement: 5, aiService: 'x' }, { apiManagement: { apiConfigs: 'x', apiAssignments: [null, 3] }, aiService: { customAPI: [] } }]) assert.doesNotThrow(() => feedback.summarizeModelConfig(bad));
  const out = feedback.summarizeModelConfig({ apiManagement: { apiConfigs: [{ id: 'a', apiKey: 'sk-0123456789abcdef', url: 'https://h/x?key=1' }] } });
  assert.deepEqual(out.apiManagement.apis, [{ id: 'a', url: 'https://h/x', keySet: true }]);
  assert.ok(!JSON.stringify(out).includes('0123456789'));
});

// ───────────── 配置体检登记 ─────────────

test('feedback 配置段：默认值通过体检；坏值被体检拒绝；热改被拒时配置回滚', () => {
  assert.deepEqual(feedback.validateFeedbackConfig(), []);
  assert.deepEqual(feedback.validateFeedbackConfig(undefined), []);
  assert.ok(feedback.validateFeedbackConfig({}).length >= 3);
  assert.match(feedback.validateFeedbackConfig({ redactSaveNarrative: 'yes', narrativePaths: [], narrativeKeepKeys: [] }).join(), /redactSaveNarrative/);
  assert.match(feedback.validateFeedbackConfig({ redactSaveNarrative: true, narrativePaths: [[]], narrativeKeepKeys: [] }).join(), /narrativePaths/);
  assert.match(feedback.validateFeedbackConfig({ redactSaveNarrative: true, narrativePaths: [['a', '']], narrativeKeepKeys: [] }).join(), /narrativePaths/);
  assert.match(feedback.validateFeedbackConfig({ redactSaveNarrative: true, narrativePaths: [['a']], narrativeKeepKeys: [1] }).join(), /narrativeKeepKeys/);
  const before = JSON.stringify(feedback.feedbackConfig());
  assert.throws(() => numbers.applyGameNumbers({ feedback: { narrativePaths: [[]] } }), /LCQ-NUM-006/);
  assert.equal(JSON.stringify(feedback.feedbackConfig()), before, '体检不过整份退回');
  assert.throws(() => numbers.applyGameNumbers({ feedback: { redactSaveNarrative: 'no' } }), /LCQ-NUM-003/);
  assert.throws(() => numbers.applyGameNumbers({ feedback: { unknownKey: 1 } }), /LCQ-NUM-002/);
});

test('默认配置在 mod-kit/game-numbers.qingyu.json 的 feedback 段，默认脱敏', () => {
  const json = JSON.parse(readFileSync(path.join(root, 'mod-kit/game-numbers.qingyu.json'), 'utf8'));
  assert.equal(json.feedback.redactSaveNarrative, true);
  assert.deepEqual(json.feedback.narrativePaths, [['系统', '历史', '叙事'], ['社交', '记忆']]);
});

// ───────────── 下载与失败 ─────────────

async function withBrowserStubs(fn) {
  const clicks = [], blobs = [];
  const savedDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { createObjectURL, revokeObjectURL } = URL;
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { clicks.push(this); }, remove() {} }) };
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:stub'; };
  URL.revokeObjectURL = () => {};
  try { return await fn({ clicks, blobs }); } finally {
    URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL;
    if (savedDoc) Object.defineProperty(globalThis, 'document', savedDoc); else delete globalThis.document;
  }
}

test('downloadFeedbackPack：触发 .zip 下载，Blob 是 application/zip 且能解析；默认 saveIncluded:false', async () => {
  await seedLog();
  await withEnv({}, () => withBrowserStubs(async ({ clicks, blobs }) => {
    const result = await feedback.downloadFeedbackPack({}, { now: () => new Date('2026-10-18T10:20:30.456Z') });
    assert.deepEqual(result, { ok: true, saveIncluded: false, saveNote: undefined });
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].download, 'lcq-feedback-2026-10-18T10-20-30-456Z.zip');
    assert.equal(blobs[0].type, 'application/zip');
    assert.ok(readZip(new Uint8Array(await blobs[0].arrayBuffer())).has('manifest.json'));
    const withSave = await feedback.downloadFeedbackPack({ includeSave: true }, { loadSave: async () => ({ slot: 's', data: sampleSave() }) });
    assert.deepEqual(withSave, { ok: true, saveIncluded: true, saveNote: undefined });
    const noSave = await feedback.downloadFeedbackPack({ includeSave: true }, { loadSave: async () => null });
    assert.deepEqual(noSave, { ok: true, saveIncluded: false, saveNote: '没有找到当前存档' });
  }));
});

test('downloadFeedbackPack：下载失败不抛错，返回 ok:false 并记 LCQ-UI-006', async () => {
  await seedLog();
  await withEnv({}, async () => {
    assert.equal(globalThis.document, undefined, '测试环境没有 document，保存会失败');
    const result = await quiet(() => feedback.downloadFeedbackPack({}));
    assert.deepEqual(result, { ok: false, saveIncluded: false });
    assert.ok(store.logStore.recent(20).some(entry => entry.code === 'LCQ-UI-006'));
  });
});

// ───────────── 入口：启动失败兜底界面 ─────────────

function fakeDoc() {
  const mk = tag => ({ tag, id: '', textContent: null, style: { cssText: '' }, onclick: null, children: [], appendChild(child) { this.children.push(child); } });
  const body = mk('body');
  const walk = (node, fn) => { fn(node); node.children.forEach(child => walk(child, fn)); };
  return {
    body, createElement: mk, getElementById: () => null,
    all: tag => { const out = []; walk(body, node => { if (node.tag === tag) out.push(node); }); return out; },
  };
}

test('兜底界面：有「导出反馈包」按钮与“附带当前存档”勾选框（默认不勾，提示含叙事原文）', () => {
  const doc = fakeDoc();
  fatal.showFatalFallback({ doc });
  const button = doc.all('button').find(node => node.textContent === '导出反馈包');
  assert.ok(button);
  const [box] = doc.all('input');
  assert.equal(box.type, 'checkbox');
  assert.equal(box.checked, false);
  const hint = doc.all('span').map(node => node.textContent).join('');
  assert.match(hint, /附带当前存档/);
  assert.match(hint, /叙事原文/);
  assert.match(hint, /已按配置脱敏/);
});

test('兜底界面：点「导出反馈包」按勾选框传 includeSave，并按结果提示；抛错也不外泄', async () => {
  const doc = fakeDoc();
  const calls = [];
  let result = { ok: true, saveIncluded: false };
  fatal.showFatalFallback({ doc, exportFeedback: async options => { calls.push(options); if (result === 'throw') throw new Error('x'); return result; } });
  const button = doc.all('button').find(node => node.textContent === '导出反馈包');
  const [box] = doc.all('input');
  const status = () => doc.all('div').at(-1).textContent;

  await button.onclick();
  assert.deepEqual(calls, [{ includeSave: false }], '默认不带存档');
  assert.match(status(), /已导出/);

  box.checked = true;
  result = { ok: true, saveIncluded: true };
  await button.onclick();
  assert.deepEqual(calls[1], { includeSave: true });
  assert.match(status(), /已导出/);

  result = { ok: true, saveIncluded: false, saveNote: '没有找到当前存档' };
  await button.onclick();
  assert.match(status(), /没能带上存档.*没有找到当前存档/);

  result = { ok: false, saveIncluded: false };
  await button.onclick();
  assert.match(status(), /失败/);
  result = 'throw';
  await button.onclick();
  assert.match(status(), /失败/);
  assert.notEqual(button.disabled, true, '结束后按钮恢复可点');
});

test('兜底界面：默认 exportFeedback 走 downloadFeedbackPack（源码接线）', () => {
  const src = readFileSync(path.join(root, 'src/utils/fatalFallback.ts'), 'utf8');
  assert.match(src, /import \{[^}]*downloadFeedbackPack[^}]*\} from '@\/modules\/diagnostics\/feedback'/);
  assert.match(src, /options\.exportFeedback \?\? \(\(\{ includeSave \}\) => downloadFeedbackPack\(\{ includeSave \}\)\)/);
});

// ───────────── 入口：设置页 ─────────────

test('设置页：高级设置里有永久的「导出反馈包」入口（不在调试模式条件下），组件默认不勾存档并提示叙事原文', () => {
  const panel = readFileSync(path.join(root, 'src/components/dashboard/SettingsPanel.vue'), 'utf8');
  assert.match(panel, /import FeedbackPackExport from '@\/components\/common\/FeedbackPackExport\.vue'/);
  const at = panel.indexOf('<FeedbackPackExport');
  assert.ok(at > 0);
  const itemStart = panel.lastIndexOf('<div class="setting-item', at);
  assert.ok(!/v-if=/.test(panel.slice(itemStart, at)), '入口不受 v-if（如调试模式）限制');
  assert.ok(panel.lastIndexOf('<div class="settings-section', at) < itemStart);

  const comp = readFileSync(path.join(root, 'src/components/common/FeedbackPackExport.vue'), 'utf8');
  assert.match(comp, /const includeSave = ref\(false\)/);
  assert.match(comp, /downloadFeedbackPack\(\{ includeSave: includeSave\.value \}\)/);
  assert.match(comp, /v-if="includeSave"[^>]*>[\s\S]*叙事原文/);
  assert.match(comp, /feedbackConfig\(\)\.redactSaveNarrative/);
});
