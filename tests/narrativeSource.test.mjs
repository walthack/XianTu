// 叙事来源日志（LCQ-NAR-001 / 002 / 003）与持久日志轮转（LCQ-SYS-002）：夹英文检测与白名单、来源字段与正文全文、
// 回合正文是否由模型生成的判定、触发来源 id、场面描写接入、配置体检与热改、按天数 / 条数轮转并记日志，以及各接入点的源码约束。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';
import { makeContract, mod } from './sceneModuleFixture.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const cfgMod = await loadTs('../src/modules/diagnostics/config.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');
const exportMod = await loadTs('../src/modules/diagnostics/export.ts');
const nar = await loadTs('../src/modules/diagnostics/narrativeSource.ts');
const narrate = await loadTs('../src/modules/sceneModule/host/narrate.ts');
const N = () => numbers.GAME_NUMBERS;

/** 改配置的用例必须还原；同时清日志与来源登记。控制台静音（NAR-002 是 warn，会打控制台）。 */
async function fresh(patch, fn) {
  const before = structuredClone(N().diagnostics), saved = {};
  for (const k of ['warn', 'error', 'info', 'debug']) { saved[k] = console[k]; console[k] = () => {}; }
  await log.resetLogState(); nar.resetNarrativeSourceState();
  try {
    if (patch) numbers.applyGameNumbers({ diagnostics: patch });
    return await fn();
  } finally {
    numbers.applyGameNumbers({ diagnostics: before });
    await log.resetLogState(); nar.resetNarrativeSourceState();
    Object.assign(console, saved);
  }
}
const recent = code => storeMod.logStore.recent(200).filter(entry => entry.code === code);
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/;

// 真机见过的问题词（修炼 / 闭关 / 冲关叙事）。
const LEAKY = '你盘膝坐定，周天运转，真气一路leaps而上，心神steady如磐石。确认你的状态changes之后，你Decide再冲一次，隐隐有种feel，仿佛被什么manipulated了。';

// ───────────── 夹英文检测 ─────────────

test('夹英文检测：真机六个词全命中，前后各取 20 字；不足 3 字母、白名单（不分大小写）、远离汉字的不算', async () => {
  await fresh(null, async () => {
    const hits = nar.findMixedLatin(LEAKY);
    assert.deepEqual(hits.map(hit => hit.word), ['leaps', 'steady', 'changes', 'Decide', 'feel', 'manipulated']);
    const leaps = hits[0];
    assert.equal(leaps.before, '你盘膝坐定，周天运转，真气一路');
    assert.equal(leaps.after, '而上，心神steady如磐石。确认你的状');
    assert.equal([...leaps.after].length, 20, '后 20 字');
    const long = '甲'.repeat(30) + 'steady' + '乙'.repeat(30);
    const [only] = nar.findMixedLatin(long);
    assert.equal(only.before, '甲'.repeat(20)); assert.equal(only.after, '乙'.repeat(20));

    assert.deepEqual(nar.findMixedLatin('他说了声OK，又补一句Hi。'), [], '两个字母的不算');
    assert.deepEqual(nar.findMixedLatin('程宗扬脱口一句Hello，又嘀咕Oh my God，SORRY啦，还说很MAN。'), [], '口语白名单不分大小写');
    assert.deepEqual(nar.findMixedLatin('他掏出iPhone看了看，又提到DNA。'), [], '专名白名单');
    assert.deepEqual(nar.findMixedLatin(`${'a '.repeat(30)}steady ${'b '.repeat(30)}`), [], '前后 20 字内没有汉字的不算夹在中文里');
    assert.deepEqual(nar.findMixedLatin('真气𠀀steady𠀀运转').map(hit => [hit.before, hit.after]), [['真气𠀀', '𠀀运转']], '扩展区汉字不被切成半个');
    assert.deepEqual(nar.findMixedLatin("他说don't，转身就走。").map(hit => hit.word), ["don't"], '带撇号的整词');
  });
});

test('白名单与阈值走配置，热改即时生效；配置体检拒绝坏值并整份退回', async () => {
  await fresh({ narrativeSource: { colloquialWhitelist: ['feel', 'steady'] } }, async () => {
    assert.deepEqual(nar.findMixedLatin(LEAKY).map(hit => hit.word), ['leaps', 'changes', 'Decide', 'manipulated']);
  });
  await fresh({ narrativeSource: { minLetters: 6, contextChars: 5 } }, async () => {
    const hits = nar.findMixedLatin(LEAKY);
    assert.deepEqual(hits.map(hit => hit.word), ['steady', 'changes', 'Decide', 'manipulated']);
    assert.equal(hits[0].before, '而上，心神', '前 5 字');
  });
  assert.deepEqual(cfgMod.validateDiagnosticsConfig(), []);
  // 整个换了类型的先被合并拦下（LCQ-NUM-003），其余由体检拦下（LCQ-NUM-006）；两种都整份退回。
  const reject = (patch, pattern) => assert.throws(() => numbers.applyGameNumbers({ diagnostics: patch }), err => ['LCQ-NUM-003', 'LCQ-NUM-006'].includes(err.code) && pattern.test(err.message), JSON.stringify(patch));
  reject({ narrativeSource: { minLetters: 0 } }, /minLetters/);
  reject({ narrativeSource: { contextChars: 1.5 } }, /contextChars/);
  reject({ narrativeSource: { nameWhitelist: ['ok', ''] } }, /nameWhitelist/);
  reject({ narrativeSource: { colloquialWhitelist: 'okay' } }, /colloquialWhitelist/);
  reject({ rotation: { retentionDays: 0 } }, /retentionDays/);
  reject({ rotation: { trimToRatio: 1 } }, /trimToRatio/);
  assert.equal(cfgMod.diagnosticsConfig().rotation.retentionDays, 3, '被拒绝后原值仍在（用户定：默认保留 3 天）');
  assert.equal(cfgMod.diagnosticsConfig().narrativeSource.minLetters, 3);
  assert.equal(cfgMod.diagnosticsConfig().narrativeSource.contextChars, 20);
});

// ───────────── 记录 ─────────────

test('recordNarrativeSource：NAR-001 带全部来源字段、本机时区生成时刻与正文全文（超 detailChars 不截断、text 键不按玩家原文省略）', async () => {
  await fresh(null, async () => {
    const text = '你缓缓收功。' + '灵气在经脉里流转不息。'.repeat(60) + '（sk-abcdefghijklmnopqrstuv）';
    const at = Date.UTC(2026, 9, 28, 1, 2, 3, 456);
    const hits = nar.recordNarrativeSource({
      site: 'turn', path: 'modular', triggers: ['freeAction:solo.breakthrough', 'judgement:cultivate'], moduleId: 'narrative',
      prompts: [{ id: 'moduleNarrativeSystem', custom: true }], model: 'deepseek-chat', provider: 'deepseek', turn: 12, generationId: 'gen_1', eventId: 'lcq.event.x',
    }, text, at);
    assert.deepEqual(hits.map(hit => hit.word), ['sk-abcdefghijklmnopqrstuv'], '密钥形状本身也算夹英文');
    assert.equal(recent('LCQ-NAR-002')[0].detail.hits[0].word, '[已脱敏]', 'NAR-002 里同样抹掉密钥');
    const [entry] = recent('LCQ-NAR-001');
    assert.ok(entry, '记了 NAR-001');
    assert.equal(entry.level, 'info'); assert.equal(entry.module, 'narrativeSource');
    const d = entry.detail;
    assert.deepEqual(
      { site: d.site, path: d.path, triggers: d.triggers, moduleId: d.moduleId, prompts: d.prompts, model: d.model, provider: d.provider, turn: d.turn, beat: d.beat, generationId: d.generationId, eventId: d.eventId },
      { site: 'turn', path: 'modular', triggers: ['freeAction:solo.breakthrough', 'judgement:cultivate'], moduleId: 'narrative', prompts: [{ id: 'moduleNarrativeSystem', custom: true }], model: 'deepseek-chat', provider: 'deepseek', turn: 12, beat: null, generationId: 'gen_1', eventId: 'lcq.event.x' },
    );
    assert.match(d.generatedAt, ISO_WITH_ZONE, '生成时刻是带时区偏移的 ISO');
    assert.equal(Date.parse(d.generatedAt), at, '生成时刻就是传入的那一刻');
    assert.equal(d.textChars, [...text].length);
    assert.ok(text.length > cfgMod.diagnosticsConfig().detailChars, '用例正文确实超过 detailChars');
    assert.equal(d.text, text.replace(/sk-[A-Za-z0-9_-]+/, '[已脱敏]'), '全文保留，只抹密钥形状');
    assert.match(entry.msg, /turn\/modular.*deepseek-chat.*字/);
  });
});

test('夹英文时另记 NAR-002：命中词、前后各 20 字与同样的来源字段；正文原样返回不改写；统计进诊断导出', async () => {
  await fresh(null, async () => {
    const source = { site: 'turn', path: 'modular', triggers: ['freeAction:solo.breakthrough'], moduleId: 'narrative', prompts: [{ id: 'moduleNarrativeSystem', custom: false }], model: 'm', turn: 3 };
    const hits = nar.recordNarrativeSource(source, LEAKY);
    assert.equal(hits.length, 6);
    const [entry] = recent('LCQ-NAR-002');
    assert.equal(entry.level, 'warn'); assert.equal(entry.module, 'narrativeSource');
    assert.deepEqual(entry.detail.words, ['leaps', 'steady', 'changes', 'Decide', 'feel', 'manipulated']);
    assert.deepEqual(entry.detail.hits[1], { word: 'steady', before: '，周天运转，真气一路leaps而上，心神', after: '如磐石。确认你的状态changes之后，' });
    for (const key of ['site', 'path', 'triggers', 'moduleId', 'prompts', 'model', 'turn', 'generatedAt', 'textChars']) assert.ok(key in entry.detail, key);
    assert.match(entry.detail.generatedAt, ISO_WITH_ZONE);
    assert.equal(recent('LCQ-NAR-001')[0].detail.text, LEAKY, 'NAR-001 的正文就是原文');
    assert.match(entry.msg, /leaps、steady/);

    nar.recordNarrativeSource(source, '你收功起身，神清气爽。');
    assert.equal(recent('LCQ-NAR-001').length, 2); assert.equal(recent('LCQ-NAR-002').length, 1, '干净正文不记 NAR-002');
    nar.recordNarrativeSource(source, '   ');
    assert.equal(recent('LCQ-NAR-001').length, 2, '空正文不记');

    const exported = await exportMod.buildLogExport();
    assert.deepEqual(exported.stats.narrativeSource, { scope: nar.NARRATIVE_SOURCE_STATS_SCOPE, records: 2, flagged: 1, withheld: 0, words: { leaps: 1, steady: 1, changes: 1, decide: 1, feel: 1, manipulated: 1 } });
    assert.ok(exported.entries.some(e => e.code === 'LCQ-NAR-001' && e.detail.text === LEAKY), '导出里有正文全文');
  });
});

test('记录永不抛错：配置坏掉、来源字段缺失、正文不是字符串都安全', async () => {
  await fresh(null, async () => {
    const saved = N().diagnostics.narrativeSource;
    N().diagnostics.narrativeSource = undefined;
    try { assert.deepEqual(nar.recordNarrativeSource({ site: 'turn', path: 'modular' }, '你说steady。'), []); }
    finally { N().diagnostics.narrativeSource = saved; }
    assert.doesNotThrow(() => nar.recordNarrativeSource({}, 12345));
    assert.equal(nar.recordTurnNarrative(null), false);
  });
});

// ───────────── 回合正文 ─────────────

test('回合正文：模块回执 modular 才记（模块 narrative + moduleNarrativeSystem 的自定义标记 + 回执模型）；local / card 不请求模型不记', async () => {
  await fresh(null, async () => {
    nar.notePromptUse('moduleNarrativeSystem', true);
    const base = { text: LEAKY, startedAt: Date.now() - 10, narrativePromptKey: 'moduleNarrativeSystem', triggers: ['judgement:cultivate'], turn: 7, generationId: 'gen_x' };
    assert.equal(nar.recordTurnNarrative({ ...base, receipt: { path: 'local' }, telemetry: { path: 'modular', requestStartedAt: 1 } }), false);
    assert.equal(nar.recordTurnNarrative({ ...base, receipt: { path: 'card' } }), false);
    assert.equal(recent('LCQ-NAR-001').length, 0);
    assert.equal(nar.recordTurnNarrative({ ...base, receipt: { path: 'modular', route: { model: 'MiniMax-M2.7', provider: 'custom' }, eventId: 'lcq.event.e' }, telemetry: { path: 'modular', model: 'other', requestStartedAt: 1 } }), true);
    const d = recent('LCQ-NAR-001')[0].detail;
    assert.deepEqual([d.site, d.path, d.moduleId, d.model, d.provider, d.turn, d.eventId, d.generationId], ['turn', 'modular', 'narrative', 'MiniMax-M2.7', 'custom', 7, 'lcq.event.e', 'gen_x']);
    assert.deepEqual(d.prompts, [{ id: 'moduleNarrativeSystem', custom: true }]);
    assert.deepEqual(recent('LCQ-NAR-002')[0].detail.triggers, ['judgement:cultivate']);
  });
});

test('回合正文：旧链路看回合埋点——legacy / legacy_pilot 且本回合发过模型请求才记，提示词取本回合窗口内取用的全部模块', async () => {
  await fresh(null, async () => {
    nar.notePromptUse('worldStandards', false);
    const startedAt = Date.now() + 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    nar.notePromptUse('splitGenerationStep1', false); nar.notePromptUse('textFormatRules', true);
    const base = { text: '你收功。', startedAt };
    assert.equal(nar.recordTurnNarrative({ ...base, telemetry: { path: 'legacy', requestStartedAt: null } }), false, '没发过模型请求');
    assert.equal(nar.recordTurnNarrative({ ...base, telemetry: { path: 'local_contract', requestStartedAt: 5 } }), false);
    assert.equal(nar.recordTurnNarrative({ ...base, telemetry: { path: 'open_world', requestStartedAt: 5 } }), false);
    assert.equal(nar.recordTurnNarrative({ ...base, telemetry: { path: 'legacy_pilot', model: 'gpt-x', provider: 'openai', requestStartedAt: 5 } }), true);
    const d = recent('LCQ-NAR-001')[0].detail;
    assert.deepEqual([d.path, d.moduleId, d.model, d.provider], ['legacy_pilot', null, 'gpt-x', 'openai']);
    assert.deepEqual(d.prompts, [{ id: 'splitGenerationStep1', custom: false }, { id: 'textFormatRules', custom: true }], '窗口外取用的 worldStandards 不算');
  });
});

test('触发来源用现有 id：自由行动票、判定类型、判定确认后的自由行动回执、事件动作、机会、开放世界、拒赌；去重保序', () => {
  assert.deepEqual(nar.narrativeTriggers({
    tickets: [{ actionClass: 'solo', variant: 'breakthrough' }, { actionClass: 'solo', variant: 'breakthrough' }, { actionClass: 'social' }],
    judgement: { kind: 'cultivate', authorityReceipt: { kind: 'free_action_judgement', actionClass: 'solo', variant: 'train' } },
    eventAction: { eventId: 'lcq.event.s02_02', actionId: 'go' }, opportunity: { opportunityId: 'opp.1' }, openWorld: { kind: 'travel' }, gambleRefusal: { actionId: 'refuse' },
  }), ['freeAction:solo.breakthrough', 'freeAction:solo.train', 'judgement:cultivate', 'event:lcq.event.s02_02#go', 'opportunity:opp.1', 'openWorld:travel', 'gambleRefusal:refuse']);
  assert.deepEqual(nar.narrativeTriggers({}), []);
  assert.deepEqual(nar.narrativeTriggers({ judgement: { kind: 'combat', authorityReceipt: { kind: 'other' } } }), ['judgement:combat']);
});

// ───────────── 场面描写 ─────────────

test('场面拍描写：模型写成并通过守卫才记（site=scene_beat，带拍序号、合同 id、narrative 模块最近一次路由的模型）；退回模板不记', async () => {
  await fresh(null, async () => {
    nar.noteModelRoute('narrative', { model: 'deepseek-chat', provider: 'deepseek' });
    const c = makeContract(), state = mod.beginScene(c).state;
    const plan = mod.validateProposal(c, state, { goal: 'guard', claim: { magnitude: 1, scope: 'single', targets: [] } }, '我掩护同伴').plan;
    const confirmed = mod.confirmAction(c, state, plan, { factors: 100, playerDefense: 100 });
    const reply = '你横身挡在同伴身前，气息steady，稳稳接下了这一击。';
    const done = await narrate.narrateBeat(c, confirmed.state, confirmed.result, '我掩护同伴', {}, async () => reply);
    assert.deepEqual([done.by, done.text], ['model', reply], '正文不改写');
    const d = recent('LCQ-NAR-001')[0].detail;
    assert.deepEqual([d.site, d.path, d.moduleId, d.model, d.beat, d.triggers], ['scene_beat', 'sceneModule', 'narrative', 'deepseek-chat', confirmed.state.beat, [`scene:${c.meta.id}`]]);
    assert.deepEqual(d.prompts, [{ id: 'sceneModule.narrateBeat', custom: false }]);
    assert.deepEqual(recent('LCQ-NAR-002')[0].detail.words, ['steady']);

    const template = await narrate.narrateBeat(c, confirmed.state, confirmed.result, '我掩护同伴', {}, async () => '');
    assert.equal(template.by, 'template');
    assert.equal(recent('LCQ-NAR-001').length, 1, '模板描写不是模型正文，不记');
  });
});

// ───────────── 主角尚不自知的设定与功法词（LCQ-NAR-003） ─────────────

const undisclosed = await loadTs('../src/modules/scenarioMods/undisclosedSelfFacts.ts');
// stage_01 开局：生死根、九阳神功都挂在 s01_05（王哲筑基）上。
const stage01Runtime = (completed = []) => ({
  completedEventIds: completed,
  undisclosedSelfFacts: [
    { fact: '生死根', untilEventId: 'lcq.event.s01_05', disclosedBy: '王哲在帅帐中察觉并说破' },
    { fact: '九阳神功', untilEventId: 'lcq.event.s01_05', disclosedBy: '王哲筑基后传下口诀' },
  ],
});
const CULTIVATE_LEAK = '你盘膝静坐，照着记忆里的九阳口诀引气，丹田里那团真阳缓缓转动。';

test('NAR-003：给了禁词且正文命中才记（warn），带命中词、禁词表、前后各 20 字与来源字段；正文原样返回不改写；统计进导出', async () => {
  await fresh(null, async () => {
    const terms = undisclosed.undisclosedSelfFactTerms(stage01Runtime());
    const source = { site: 'turn', path: 'modular', triggers: ['judgement:cultivate'], moduleId: 'narrative', model: 'm', turn: 2, withheldTerms: terms };
    assert.deepEqual(nar.recordNarrativeSource(source, CULTIVATE_LEAK), [], '返回值仍只是夹英文命中');
    const [entry] = recent('LCQ-NAR-003');
    assert.ok(entry, '记了 NAR-003');
    assert.equal(entry.level, 'warn'); assert.equal(entry.module, 'narrativeSource');
    assert.deepEqual(entry.detail.words, ['九阳', '口诀', '真阳']);
    assert.deepEqual(entry.detail.terms, terms);
    assert.deepEqual(entry.detail.hits[0], { word: '九阳', before: '你盘膝静坐，照着记忆里的', after: '口诀引气，丹田里那团真阳缓缓转动。' });
    for (const key of ['site', 'path', 'triggers', 'moduleId', 'model', 'turn', 'generatedAt', 'textChars']) assert.ok(key in entry.detail, key);
    assert.ok(!('withheldTerms' in recent('LCQ-NAR-001')[0].detail), '禁词表不进 NAR-001 的来源字段');
    assert.equal(recent('LCQ-NAR-001')[0].detail.text, CULTIVATE_LEAK, '正文原样');
    assert.match(entry.msg, /九阳、口诀、真阳.*turn\/modular/);

    nar.recordNarrativeSource(source, '你盘膝静坐，调息吐纳，体内有股说不清的暖意慢慢沉下去。');
    nar.recordNarrativeSource({ ...source, withheldTerms: undefined }, CULTIVATE_LEAK);
    nar.recordNarrativeSource({ ...source, withheldTerms: [] }, CULTIVATE_LEAK);
    assert.equal(recent('LCQ-NAR-003').length, 1, '干净正文、没给禁词表、禁词表为空都不记');
    const exported = await exportMod.buildLogExport();
    assert.equal(exported.stats.narrativeSource.withheld, 1);
  });
});

test('NAR-003 接入：回合正文把 withheldTerms 带过去；场面拍描写按 runtime 算禁词；点破之后不记', async () => {
  await fresh(null, async () => {
    const base = { text: CULTIVATE_LEAK, startedAt: Date.now(), receipt: { path: 'modular' } };
    nar.recordTurnNarrative({ ...base, withheldTerms: undisclosed.undisclosedSelfFactTerms(stage01Runtime()) });
    assert.equal(recent('LCQ-NAR-003').length, 1);
    nar.recordTurnNarrative({ ...base, withheldTerms: undisclosed.undisclosedSelfFactTerms(stage01Runtime(['lcq.event.s01_05'])) });
    assert.equal(recent('LCQ-NAR-003').length, 1, 's01_05 完成后不再记');

    const c = makeContract(), state = mod.beginScene(c).state;
    const plan = mod.validateProposal(c, state, { goal: 'guard', claim: { magnitude: 1, scope: 'single', targets: [] } }, '我掩护同伴').plan;
    const confirmed = mod.confirmAction(c, state, plan, { factors: 100, playerDefense: 100 });
    const reply = '你横身挡在同伴身前，体内生死根一阵翻涌，稳稳接下了这一击。';
    const done = await narrate.narrateBeat(c, confirmed.state, confirmed.result, '我掩护同伴', stage01Runtime(), async () => reply);
    assert.deepEqual([done.by, done.text], ['model', reply], '正文不改写');
    const scene = recent('LCQ-NAR-003').find(entry => entry.detail.site === 'scene_beat');
    assert.ok(scene, '场面拍描写也记');
    assert.deepEqual(scene.detail.words, ['生死根']);
  });
});

test('NAR-003 接入点（源码约束）：回合收尾按回合结束后的存档算禁词；开局、场内闲聊同样带上', () => {
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  const hook = panel.indexOf('recordTurnNarrative({');
  assert.match(panel.slice(hook - 300, hook), /const narratedSave = gameStateStore\.toSaveData\(\);/);
  assert.match(panel.slice(hook, hook + 900), /withheldTerms: undisclosedSelfFactTerms\(\(narratedSave as any\)\?\.世界\?\.状态\?\.剧本模组\)/);
  assert.match(read('src/services/initialization/characterInitialization.ts'), /withheldTerms: undisclosedSelfFactTerms\(\(saveDataAfterCommands as any\)\?\.世界\?\.状态\?\.剧本模组\)/);
  assert.match(read('src/modules/sceneModule/host/controller.ts'), /noteSceneNarrative\('scene_chat',reply,c,a\.state\.beat,a\.eventId,runtimeOf\(save\)\)/);
  const doc = read('docs/NARRATIVE-SOURCE-LOG.md');
  for (const needle of ['LCQ-NAR-003', 'undisclosedSelfFactTerms', 'withheld']) assert.ok(doc.includes(needle), needle);
});

// ───────────── 轮转 ─────────────

const entryOf = (i, extra = {}) => ({ ts: new Date().toISOString(), level: 'info', code: 'LCQ-SYS-000', module: 'm', sessionId: 's', turnId: null, msg: `m${i}`, ...extra });
/** 内存假后端：可预置旧记录（seq 决定时刻）。 */
function memoryBackend(rows = []) {
  const map = new Map(rows.map(row => [row.seq, structuredClone(row)]));
  return {
    rows: map,
    backend: { kind: 'indexedDB', load: async () => [...map.values()].sort((a, b) => a.seq - b.seq), put: async entries => { for (const e of entries) map.set(e.seq, structuredClone(e)); }, remove: async seqs => { for (const s of seqs) map.delete(s); }, clear: async () => map.clear() },
  };
}

test('轮转·定期：磁盘与内存里早于 retentionDays（默认 3 天）的记录在落盘时删掉，回报一次（byAge），本机时区时刻', async () => {
  await fresh({ flushMs: 1 }, async () => {
    const DAY = 86400000, now = Date.now();
    const old = [4, 3.5, 2.5].map((days, i) => ({ ...entryOf(`old${i}`), seq: (now - days * DAY) * 1000 + i }));
    const { backend, rows } = memoryBackend(old);
    const rotations = [];
    const store = storeMod.createLogStore({ openBackend: async () => backend, onRotate: info => rotations.push(info) });
    store.add(entryOf('new'), true);
    await store.flush();
    assert.deepEqual([...rows.values()].map(e => e.msg).sort(), ['mnew', 'mold2'], '3.5 天、4 天前的删掉，2.5 天前的留着');
    assert.deepEqual((await store.all()).map(e => e.msg), ['mold2', 'mnew'], '内存里也不再有过期的');
    assert.equal(rotations.length, 1);
    const info = rotations[0];
    assert.deepEqual([info.dropped, info.byAge, info.byLimit, info.kept, info.retentionDays], [2, 2, 0, 2, 3]);
    assert.match(info.rotatedAt, ISO_WITH_ZONE); assert.match(info.oldestDroppedAt, ISO_WITH_ZONE);
    assert.equal(Date.parse(info.oldestDroppedAt), Math.floor(old[0].seq / 1000));

    store.add(entryOf('again'), true);
    await store.flush();
    assert.equal(rotations.length, 1, '没有过期也没超上限就不轮转');
  });
});

test('轮转·定量：超 ringMax 一次删到 trimToRatio 倍以下，之后再写不会每条都轮转；超 maxBytes 同理；至少留最新一条', async () => {
  await fresh({ ringMax: 10, flushMs: 1 }, async () => {
    const { backend, rows } = memoryBackend();
    const rotations = [];
    const store = storeMod.createLogStore({ openBackend: async () => backend, onRotate: info => rotations.push(info) });
    for (let i = 0; i < 11; i++) store.add(entryOf(i), true);
    await store.flush();
    assert.equal(rows.size, 8, '11 条超了 10 → 删到 floor(10×0.8)=8');
    assert.deepEqual([rotations[0].byLimit, rotations[0].byAge, rotations[0].maxEntries, rotations[0].trimToRatio], [3, 0, 10, 0.8]);
    for (let i = 11; i < 13; i++) { store.add(entryOf(i), true); await store.flush(); }
    assert.equal(rotations.length, 1, '低水位留出余量，没到上限不再轮转');
    assert.equal(rows.size, 10);
  });
  await fresh({ maxBytes: 600, ringMax: 100, flushMs: 1 }, async () => {
    const { backend, rows } = memoryBackend();
    const rotations = [];
    const store = storeMod.createLogStore({ openBackend: async () => backend, onRotate: info => rotations.push(info) });
    for (let i = 0; i < 6; i++) store.add(entryOf(i, { pad: 'p'.repeat(150) }), true);
    await store.flush();
    assert.equal(rotations.length, 1);
    assert.ok(rotations[0].keptBytes <= 600 * 0.8, `删到 0.8 倍以下：${rotations[0].keptBytes}`);
    assert.ok([...rows.values()].some(e => e.msg === 'm5'), '最新的一定留着');
  });
  await fresh({ maxBytes: 10, ringMax: 100, flushMs: 1 }, async () => {
    const { backend, rows } = memoryBackend();
    const store = storeMod.createLogStore({ openBackend: async () => backend });
    for (let i = 0; i < 3; i++) store.add(entryOf(i), true);
    await store.flush();
    assert.deepEqual([...rows.values()].map(e => e.msg), ['m2'], '单条就超上限时仍留最新一条');
  });
});

test('默认存储轮转经 log.ts 记一条 LCQ-SYS-002（info，diagnostics），detail 是轮转回报', async () => {
  await fresh({ ringMax: 10, repeatMs: 1, flushMs: 1 }, async () => {
    for (let i = 0; i < 11; i++) log.logEvent({ code: 'LCQ-SYS-000', detail: { i } });
    await storeMod.logStore.flush();
    const [entry] = recent('LCQ-SYS-002');
    assert.ok(entry, '记了 LCQ-SYS-002');
    assert.equal(entry.level, 'info'); assert.equal(entry.module, 'diagnostics');
    assert.deepEqual([entry.detail.byLimit, entry.detail.maxEntries], [3, 10]);
    await storeMod.logStore.flush();
    assert.equal(recent('LCQ-SYS-002').length, 1, '轮转日志本身不会引发下一次轮转');
  });
});

// ───────────── 接入点（源码约束） ─────────────

test('接入点：回合收尾、场面闲聊、开局、提示词取用、模块路由各报一次；冻结文件不改', () => {
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  const send = panel.slice(panel.indexOf('const narrativeStartedAt = Date.now();'));
  assert.ok(send.indexOf('bidirectionalSystem.processPlayerAction(') > 0, '回合开始时刻取在 processPlayerAction 之前');
  const hook = send.indexOf('recordTurnNarrative({');
  assert.ok(hook > send.indexOf('latestMessageText.value = gmResp?.text || null;'), '在定下最终正文之后记');
  assert.match(send.slice(hook, hook + 800), /text: finalText, receipt: gmResp\?\.moduleReceipt, telemetry: getLastTurnTelemetry\(\)/);
  assert.match(send.slice(hook, hook + 800), /tickets: routedFreeActionTickets, judgement: contractedJudgementResolution/);

  const controller = read('src/modules/sceneModule/host/controller.ts');
  assert.match(controller, /reply=await deps\.askNarrative\(\{[^\n]*\}\);byModel=true;\}/, '只有模型真的回了话才标 byModel');
  assert.match(controller, /else \{logInput\([^\n]*'passThrough'\);if\(byModel\)noteSceneNarrative\('scene_chat',reply,c,a\.state\.beat,a\.eventId,runtimeOf\(save\)\);\}/, '被换成固定句的回话不记');

  const init = read('src/services/initialization/characterInitialization.ts');
  assert.ok(init.indexOf('const openingStartedAt = Date.now();') < init.indexOf('const initialMessageResponse = await robustAICall('));
  assert.match(init, /recordNarrativeSource\(\{\s*site: 'opening', path: 'opening', prompts: promptUsesSince\(openingStartedAt\)/);

  const prompts = read('src/services/prompts/promptStorage.ts');
  const get = prompts.slice(prompts.indexOf('async get(key: string)'), prompts.indexOf('async reset(key: string)'));
  assert.equal((get.match(/notePromptUse\(key, (true|false)\)/g) || []).length, 4, '每个返回分支都报一次');
  assert.match(get, /if \(saved\?\.modified\) \{\s*notePromptUse\(key, true\);/);
  assert.match(read('src/services/gameModelModules.ts'), /noteModelRoute\(moduleId, result\.route\)/);

  for (const frozen of ['src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/runtime.ts']) assert.doesNotMatch(read(frozen), /narrativeSource|recordNarrativeSource/, `${frozen} 冻结，不接入`);
});

test('promptStorage.get：用户改过的提示词报 custom=true，默认值与禁用报 false', async () => {
  await fresh(null, async () => {
    const { promptStorage } = await loadTs('../src/services/prompts/promptStorage.ts');
    const records = { moduleNarrativeSystem: { key: 'moduleNarrativeSystem', content: '改过', modified: true, enabled: true }, worldStandards: { key: 'worldStandards', content: 'x', modified: false, enabled: false } };
    const saved = { db: promptStorage.db, memoryOnly: promptStorage.memoryOnly };
    Object.assign(promptStorage, { db: { get: async (_store, key) => records[key] }, memoryOnly: false });
    try {
      assert.equal(await promptStorage.get('moduleNarrativeSystem'), '改过');
      await promptStorage.get('worldStandards'); await promptStorage.get('textFormatRules');
    } finally { Object.assign(promptStorage, saved); }
    assert.deepEqual(['moduleNarrativeSystem', 'worldStandards', 'textFormatRules'].map(id => nar.promptUse(id)), [
      { id: 'moduleNarrativeSystem', custom: true }, { id: 'worldStandards', custom: false }, { id: 'textFormatRules', custom: false },
    ]);
  });
});

test('正式文档在：字段、存放位置、错误码、白名单配置、轮转规则与导出办法都写了；码表文档链过去', () => {
  const doc = read('docs/NARRATIVE-SOURCE-LOG.md');
  for (const needle of ['LCQ-NAR-001', 'LCQ-NAR-002', 'LCQ-SYS-002', 'generatedAt', 'triggers', 'prompts', 'textChars', 'lcq-log', 'lcq-log-fallback',
    'nameWhitelist', 'colloquialWhitelist', 'retentionDays', 'trimToRatio', 'ringMax', 'maxBytes', '导出反馈包', 'logs.json', 'stats.narrativeSource']) assert.ok(doc.includes(needle), needle);
  assert.ok(read('docs/ERROR-CODES.md').includes('NARRATIVE-SOURCE-LOG.md'));
  assert.ok(read('docs/DEBUG-LOG.md').includes('NARRATIVE-SOURCE-LOG.md'));
});
