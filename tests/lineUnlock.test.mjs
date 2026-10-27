// 整线解锁 T2（太泉解锁设计稿 2026-10-27 §3 / §9 / §10-1、9、10）：境界 ≥ minRealmLevel、已收束判档线 ≥ minClosedLines、
// requireDeadlinesCleared 全为 cleared（读不到按通过）；已走进本线追认解锁；说法按萧遥逸受伤拍分 song / wangzhe。
// 阈值只读 story.lineUnlock.taiquan；规则表与期限数值均为测试夹具（仓库规则表与 limits 首版为空）。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// 顺序加载：并发 loadTs 会各自实例化 numbers.ts，热改 GAME_NUMBERS 就看不到同一份
const loaded = (async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const unlock = await loadTs('../src/modules/scenarioMods/lineUnlock.ts');
  const secondary = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const log = await loadTs('../src/modules/diagnostics/log.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  const dbg = await loadTs('../src/modules/diagnostics/debugLog.ts');
  const cats = await loadTs('../src/modules/diagnostics/debugCategories.ts');
  return { numbers, rules, unlock, secondary, log, store, dbg, cats };
})();

const STAGE = 'lcq.stage_01';
const START = 'test.event.ice_start';
const CLEAR = 'test.event.ice_clear';
const TICK1 = 'test.event.tick1';
const TICK2 = 'test.event.tick2';
const SONG_HURT = 'lcq.event.s12_10_rescue_xiao';
const entry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });
const CLOSED = { 'line.song.outcome': 'resolved' };
const ZUOZHAO = { 名称: '坐照', 阶段: '初期' };

/** 存档夹具：境界、flags、本关按序完成的事件（夹具事件挂进本关 events），另可追加跨关编年史条目。 */
const saveOf = ({ realm = ZUOZHAO, flags = CLOSED, doneIds = [], crossStage = [] } = {}) => ({
  角色: { 属性: { 境界: realm } },
  世界: { 状态: { 剧本模组: {
    modId: STAGE,
    events: doneIds.map(id => ({ id })),
    chronicle: [...crossStage.map(([stageId, eventId], i) => entry(stageId, eventId, i + 1)), ...doneIds.map((id, i) => entry(STAGE, id, crossStage.length + i + 1))],
    completedEventIds: [],
    flags: structuredClone(flags),
  } } },
});

const table = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], itemGroups: [], partyJoins: [], partyLeaves: [], partyOpenings: [], progressTicks: [], progressDeadlines: [], ...patch });
const ticks = [{ eventId: TICK1, lineId: 'song' }, { eventId: TICK2, lineId: 'jin' }];

/** 挂规则表与期限数值（ice_gu id 取配置，不在测试里写死），用完复原。 */
async function withIceGu(fn, { id } = {}) {
  const { rules, numbers } = await loaded;
  const iceId = id ?? numbers.GAME_NUMBERS.story.lineUnlock.taiquan.requireDeadlinesCleared[0];
  const limits = numbers.GAME_NUMBERS.story.progressDeadline.limits;
  rules.setPlayerLedgerRulesForTest(table({ progressTicks: ticks, progressDeadlines: [{ id: iceId, name: '冰蛊', startEventIds: [START], clearEventIds: [CLEAR] }] }));
  limits[iceId] = { due: 3, urgentAt: 2 };
  try { return await fn(iceId); } finally {
    rules.setPlayerLedgerRulesForTest(undefined);
    delete limits[iceId];
  }
}

/** 热改 story.lineUnlock.taiquan，用完复原（走 applyGameNumbers，同 tuning.json）。 */
async function withConfig(patch, fn) {
  const { numbers } = await loaded;
  const before = structuredClone(numbers.GAME_NUMBERS.story.lineUnlock.taiquan);
  numbers.applyGameNumbers({ story: { lineUnlock: { taiquan: patch } } });
  try { return await fn(); } finally { numbers.applyGameNumbers({ story: { lineUnlock: { taiquan: before } } }); }
}

const quiet = async (fn) => {
  const saved = { warn: console.warn, error: console.error, info: console.info };
  console.warn = () => {}; console.error = () => {}; console.info = () => {};
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const logged = async (reason) => (await loaded).store.logStore.recent(500).filter(e => e.code === 'LCQ-SAV-029' && (!reason || e.detail?.reason === reason));
const resetLog = async () => (await loaded).log.resetLogState();
const status = async (save, opts) => (await loaded).unlock.lineUnlockStatus(save, 'taiquan', opts);

test('配置即设计稿 §2 的四值；没配置的线不设锁', async () => {
  const { numbers, unlock } = await loaded;
  const conf = unlock.lineUnlockConfig('taiquan');
  assert.equal(conf, numbers.GAME_NUMBERS.story.lineUnlock.taiquan, '每次现读 GAME_NUMBERS');
  assert.deepEqual({ ...conf }, { minRealmLevel: 5, minClosedLines: 1, countTiers: ['resolved', 'unresolved'], requireDeadlinesCleared: ['liuchao.deadline.ice_gu'] });
  assert.equal(unlock.lineUnlockConfig('jin'), undefined);
  assert.equal(unlock.lineUnlockConfig('note'), undefined, 'note 不是线');
  assert.equal(unlock.lineUnlockStatus(saveOf(), 'jin'), undefined);
  assert.equal(unlock.isLineUnlocked(saveOf({ realm: { 名称: '无修为' }, flags: {} }), 'jin'), true);
});

test('三条都满足 → 解锁；缺项顺序固定 realm → lines → deadline', async () => {
  const { unlock } = await loaded;
  const ok = await status(saveOf());
  assert.deepEqual({ unlocked: ok.unlocked, entered: ok.entered, missing: ok.missing, failure: ok.failure }, { unlocked: true, entered: false, missing: [], failure: undefined });
  assert.deepEqual(ok.realm, { level: 5, need: 5 });
  assert.deepEqual(ok.lines, { closedIds: ['song'], need: 1, short: 0 });
  assert.deepEqual(ok.deadlines, [{ id: 'liuchao.deadline.ice_gu', state: undefined, pass: true }], '期限未上线按通过');
  assert.equal(unlock.isLineUnlocked(saveOf(), 'taiquan'), true);
  await withIceGu(async () => {
    const running = [START];
    const cases = [
      [{}, []],
      [{ realm: { 名称: '入微' } }, ['realm']],
      [{ flags: {} }, ['lines']],
      [{ doneIds: running }, ['deadline']],
      [{ realm: { 名称: '入微' }, flags: {} }, ['realm', 'lines']],
      [{ realm: { 名称: '入微' }, doneIds: running }, ['realm', 'deadline']],
      [{ flags: {}, doneIds: running }, ['lines', 'deadline']],
      [{ realm: { 名称: '生象' }, flags: {}, doneIds: running }, ['realm', 'lines', 'deadline']],
    ];
    for (const [fixture, missing] of cases) {
      const s = await status(saveOf(fixture));
      assert.deepEqual(s.missing, missing, JSON.stringify(fixture));
      assert.equal(s.unlocked, missing.length === 0);
      assert.equal(unlock.isLineUnlocked(saveOf(fixture), 'taiquan'), missing.length === 0);
    }
  });
});

test('境界：坐照初期过、入微后期满进度不过、字串境界名也认；不认识的境界名不过且 SAV-029 只记一次', async () => {
  assert.equal((await status(saveOf({ realm: { 名称: '坐照', 阶段: '初期', 当前进度: 0 } }))).unlocked, true);
  assert.equal((await status(saveOf({ realm: '坐照' }))).unlocked, true);
  assert.equal((await status(saveOf({ realm: { 名称: '通幽', 阶段: '后期' } }))).unlocked, true);
  const nearly = await status(saveOf({ realm: { 名称: '入微', 阶段: '后期', 当前进度: 100, 下一级所需: 100 } }));
  assert.deepEqual([nearly.unlocked, nearly.missing, nearly.realm], [false, ['realm'], { level: 4, need: 5 }]);
  await resetLog();
  await quiet(async () => {
    for (const realm of [{ 名称: '六阳' }, { 名称: '六阳' }]) {
      const s = await status(saveOf({ realm }));
      assert.deepEqual([s.unlocked, s.missing, s.realm.level], [false, ['realm'], null]);
    }
  });
  const hits = await logged('realm_unreadable');
  assert.equal(hits.length, 1, '同一 reason＋线本会话只记一次');
  assert.deepEqual({ module: hits[0].module, level: hits[0].level, lineId: hits[0].detail.lineId, realm: hits[0].detail.realm }, { module: 'lineUnlock', level: 'warn', lineId: 'taiquan', realm: '六阳' });
  await resetLog();
});

test('线数：resolved / unresolved 都算，没有记录不算，太泉与非判档线不算；countTiers 只含 resolved 时 unresolved 不算；short＝max(0, need−closed)；minClosedLines=0 恒过', async () => {
  assert.deepEqual((await status(saveOf({ flags: { 'line.jin.outcome': 'unresolved' } }))).lines, { closedIds: ['jin'], need: 1, short: 0 });
  const none = await status(saveOf({ flags: { 'line.taiquan.outcome': 'resolved', 'line.chu.outcome': 'resolved' } }));
  assert.deepEqual([none.unlocked, none.missing, none.lines], [false, ['lines'], { closedIds: [], need: 1, short: 1 }]);
  await withConfig({ countTiers: ['resolved'] }, async () => {
    assert.deepEqual((await status(saveOf({ flags: { 'line.jin.outcome': 'unresolved' } }))).missing, ['lines']);
    assert.deepEqual((await status(saveOf({ flags: { 'line.jin.outcome': 'unresolved', 'line.qin.outcome': 'resolved' } }))).lines.closedIds, ['qin']);
  });
  await withConfig({ minClosedLines: 3 }, async () => {
    const s = await status(saveOf({ flags: { 'line.jin.outcome': 'unresolved', 'line.song.outcome': 'resolved' } }));
    assert.deepEqual(s.lines, { closedIds: ['jin', 'song'], need: 3, short: 1 });
    assert.deepEqual(s.missing, ['lines']);
  });
  await withConfig({ minClosedLines: 0 }, async () => {
    assert.deepEqual((await status(saveOf({ flags: {} }))).lines, { closedIds: [], need: 0, short: 0 });
    assert.equal((await status(saveOf({ flags: {} }))).unlocked, true);
  });
});

test('期限：未上线 / 未起算按通过；running、urgent 不过；cleared 过（现算与锁存）；[] 恒过；规则表非空但 id 拼错按通过并记 deadline_unknown', async () => {
  const { numbers } = await loaded;
  assert.deepEqual((await status(saveOf())).deadlines.map(d => d.pass), [true], '仓库规则表为空＝未上线');
  await withIceGu(async (iceId) => {
    const state = async (doneIds, flags = CLOSED) => (await status(saveOf({ doneIds, flags }))).deadlines[0];
    assert.deepEqual(await state([]), { id: iceId, state: undefined, pass: true }, '未起算');
    assert.deepEqual(await state([START]), { id: iceId, state: 'running', pass: false });
    assert.deepEqual(await state([START, TICK1, TICK2]), { id: iceId, state: 'urgent', pass: false });
    assert.deepEqual(await state([START, TICK1, CLEAR]), { id: iceId, state: 'cleared', pass: true }, '现算 cleared');
    await quiet(async () => {
      assert.deepEqual(await state([START], { ...CLOSED, [`deadline.${iceId}.state`]: 'cleared' }), { id: iceId, state: 'cleared', pass: true }, '锁存 cleared');
    });
    await withConfig({ requireDeadlinesCleared: [] }, async () => {
      const s = await status(saveOf({ doneIds: [START] }));
      assert.deepEqual([s.unlocked, s.deadlines], [true, []]);
    });
  });
  // 规则表已有期限，但要求的 id 拼错：按通过，留痕一次
  await resetLog();
  await withIceGu(async () => {
    await quiet(async () => {
      for (let i = 0; i < 2; i++) {
        const s = await status(saveOf({ doneIds: [START] }));
        assert.equal(s.unlocked, true);
        assert.deepEqual(s.deadlines, [{ id: numbers.GAME_NUMBERS.story.lineUnlock.taiquan.requireDeadlinesCleared[0], state: undefined, pass: true }]);
      }
    });
  }, { id: 'liuchao.deadline.ice_gu_typo' });
  const hits = await logged('deadline_unknown');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.deadlineId, 'liuchao.deadline.ice_gu');
  await resetLog();
});

test('已走进本线：太泉任一节点事件已完成（含跨关编年史）→ 解锁，即使境界只有生象；不传节点 id 不追认', async () => {
  const { secondary } = await loaded;
  const nodes = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan').nodes.map(n => n.eventId);
  const weak = { realm: { 名称: '生象' }, flags: {}, crossStage: [['lyl.taiquan_sacred_fruit', nodes[0]]] };
  await withIceGu(async () => {
    const s = await status(saveOf({ ...weak, doneIds: [START] }), { enteredEventIds: nodes });
    assert.deepEqual([s.unlocked, s.entered, s.missing, s.deadlines], [true, true, [], []]);
    const plain = await status(saveOf({ ...weak, doneIds: [START] }));
    assert.deepEqual([plain.unlocked, plain.entered, plain.missing], [false, false, ['realm', 'lines', 'deadline']]);
  });
  // 本关 completedEventIds 里的节点同样算（与 done.* 同一口径）
  const save = saveOf({ realm: { 名称: '生象' }, flags: {} });
  save.世界.状态.剧本模组.completedEventIds = [nodes.at(-1)];
  assert.equal((await status(save, { enteredEventIds: nodes })).entered, true);
  assert.equal((await status(saveOf({ realm: { 名称: '生象' } }), { enteredEventIds: nodes })).entered, false);
});

test('读数异常：判定抛错 eval_failed 锁住（已走进仍放行）；required 而缺配置 config_missing 锁住', async () => {
  const { unlock, secondary } = await loaded;
  const nodes = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan').nodes.map(n => n.eventId);
  const broken = (doneNode) => {
    const save = saveOf({ crossStage: doneNode ? [['lyl.taiquan_sacred_fruit', nodes[0]]] : [] });
    const rt = save.世界.状态.剧本模组;
    Object.defineProperty(rt, 'flags', { get() { throw new Error('flags 坏了'); } });
    return save;
  };
  await resetLog();
  await quiet(async () => {
    const locked = await status(broken(false), { enteredEventIds: nodes });
    assert.deepEqual([locked.unlocked, locked.entered, locked.failure, locked.missing], [false, false, 'eval_failed', []]);
    assert.equal(unlock.isLineUnlocked(broken(false), 'taiquan', { enteredEventIds: nodes }), false);
    const entered = await status(broken(true), { enteredEventIds: nodes });
    assert.deepEqual([entered.unlocked, entered.entered, entered.failure], [true, true, 'eval_failed']);
  });
  const evalHits = await logged('eval_failed');
  assert.equal(evalHits.length, 1, '同一线本会话只记一次');
  assert.equal(evalHits[0].detail.lineId, 'taiquan');
  await quiet(async () => {
    const missing = unlock.lineUnlockStatus(saveOf(), 'jin', { required: true });
    assert.deepEqual([missing.unlocked, missing.failure], [false, 'config_missing']);
    assert.equal(unlock.isLineUnlocked(saveOf(), 'jin', { required: true }), false);
    assert.equal(unlock.isLineUnlocked(saveOf(), 'jin'), true, '未声明 required 照旧不设锁');
  });
  assert.equal((await logged('config_missing')).length, 1);
  await resetLog();
});

test('热改 minRealmLevel 下一次调用立刻生效；解锁结果不锁存、不写存档', async () => {
  const save = saveOf({ realm: { 名称: '入微' } });
  const before = structuredClone(save);
  assert.equal((await status(save)).unlocked, false);
  await withConfig({ minRealmLevel: 4 }, async () => {
    const s = await status(save);
    assert.deepEqual([s.unlocked, s.realm], [true, { level: 4, need: 4 }]);
  });
  assert.equal((await status(save)).unlocked, false, '复原后立即回到锁住');
  assert.deepEqual(save, before, '判定不写存档');
});

test('进太泉说法：萧遥逸受伤拍只在跨关编年史里 → song；没完成 → wangzhe；抛错 → wangzhe 并记 variant_failed', async () => {
  const { unlock } = await loaded;
  assert.equal(unlock.TAIQUAN_SONG_VARIANT_EVENT_ID, SONG_HURT);
  const rt = (save) => save.世界.状态.剧本模组;
  assert.equal(unlock.taiquanEntryVariant(rt(saveOf({ crossStage: [['lcq.stage_12_jiangzhou_counterwar', SONG_HURT]] }))), 'song');
  assert.equal(unlock.taiquanEntryVariant(rt(saveOf())), 'wangzhe');
  assert.equal(unlock.taiquanEntryVariant(undefined), 'wangzhe');
  await resetLog();
  await quiet(async () => {
    assert.equal(unlock.taiquanEntryVariant({ chronicle: 42 }), 'wangzhe');
    assert.equal(unlock.taiquanEntryVariant({ chronicle: 42 }), 'wangzhe');
  });
  const hits = await logged('variant_failed');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.lineId, 'taiquan');
  await resetLog();
});

test('调试日志挂 story（剧情推进）大类：结果变化才打一行，大类关时不打', async () => {
  const { numbers, dbg, cats } = await loaded;
  assert.equal(cats.categoryOfFile('src/modules/scenarioMods/lineUnlock.ts'), 'story');
  const out = [];
  const before = structuredClone(numbers.GAME_NUMBERS.diagnostics);
  dbg.setDebugConsole((...args) => out.push(args));
  try {
    await status(saveOf({ realm: { 名称: '生象' } }));
    assert.equal(out.length, 0, '大类关着不打');
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { story: true } } } });
    await status(saveOf({ realm: { 名称: '生象' } }));
    await status(saveOf({ realm: { 名称: '生象' } }));
    assert.equal(out.length, 1, '同一结果只打一行');
    assert.match(out[0][0], /^\[dbg:story\] \[整线解锁\] taiquan 境界 3\/5 收束 1\/1（song）期限 ice_gu=未上线 → 锁（缺 realm）$/);
    await status(saveOf());
    assert.equal(out.length, 2);
    assert.match(out[1][0], /→ 解锁$/);
  } finally {
    numbers.applyGameNumbers({ diagnostics: before });
    dbg.setDebugConsole(null);
  }
});

// —— 守卫（§10-9）——
const stripCode = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''");

test('lineUnlock.ts 不写死阈值与期限 id：代码里没有字面量 5、1、liuchao.deadline.ice_gu', () => {
  const src = readFileSync(path.join(root, 'src/modules/scenarioMods/lineUnlock.ts'), 'utf8');
  assert.equal(src.includes('liuchao.deadline.ice_gu'), false);
  const code = stripCode(src);
  assert.deepEqual(code.match(/(?<![\w.])(?:5|1)(?![\w.])/g), null);
  // 自测：剥注释与字串后仍能抓到裸数字
  assert.ok(/(?<![\w.])(?:5|1)(?![\w.])/.test(stripCode("const x = 5; // 1\nconst y = '1';")));
});

test('minRealmLevel 只出现在 lineUnlock.ts、配置、registry 与测试；unlock.taiquan 账本门只在设计稿 §4.1 三个章节（秘境与其它节点不设修为门）', () => {
  const files = execSync('git ls-files --cached --others --exclude-standard src mod-kit scripts', { cwd: root, encoding: 'utf8' }).split('\n')
    .filter(f => /\.(ts|vue|js|mjs|json)$/.test(f) && !f.startsWith('mod-kit/generated/'));
  const allowed = new Set(['src/modules/scenarioMods/lineUnlock.ts', 'src/modules/sceneModule/numbersRegistry.ts', 'mod-kit/numbers-progress.json', 'mod-kit/game-numbers.qingyu.json']);
  const offenders = files.filter(f => !allowed.has(f) && readFileSync(path.join(root, f), 'utf8').includes('minRealmLevel'));
  assert.deepEqual(offenders, []);
  // unlock.taiquan 只许挂在这三个章节的条件里
  const GATED = new Set(['lyl.chapter.taiquan_sacred_fruit_canglan', 'lyl.chapter.escape_ant_hill', 'lyl.chapter.taiquan_afterfall_taquan']);
  const hits = [];
  const walk = (node, ownerId, file) => {
    if (Array.isArray(node)) { for (const item of node) walk(item, ownerId, file); return; }
    if (!node || typeof node !== 'object') return;
    const owner = typeof node.id === 'string' ? node.id : ownerId;
    if (typeof node.path === 'string' && node.path.startsWith('unlock.')) hits.push(`${file}:${owner}:${node.path}`);
    for (const value of Object.values(node)) walk(value, owner, file);
  };
  const dataDirs = ['src/modules/scenarioMods/builtins/data', 'mod-kit/canon-authority-overlays'];
  for (const dir of dataDirs) {
    for (const name of readdirSync(path.join(root, dir)).filter(n => n.endsWith('.json'))) walk(JSON.parse(readFileSync(path.join(root, dir, name), 'utf8')), undefined, `${dir}/${name}`);
  }
  assert.deepEqual(hits.filter(h => !GATED.has(h.split(':')[1]) || !h.endsWith(':unlock.taiquan')), [], '账本门只在 §4.1 三个章节');
  assert.equal(files.filter(f => f.startsWith('src/') && /tq_xuanyuan_mijing/.test(readFileSync(path.join(root, f), 'utf8')) && readFileSync(path.join(root, f), 'utf8').includes('unlock.')).length, 0, '秘境不设修为门');
});

test('T5 账本读数 lineUnlockLedgerValue：没拿到存档读成 undefined、不记码，只打 story 调试日志；有存档同 isLineUnlocked；opts.runtime 优先', async () => {
  const { unlock, numbers, dbg } = await loaded;
  await resetLog();
  const out = [];
  const before = structuredClone(numbers.GAME_NUMBERS.diagnostics);
  dbg.setDebugConsole((...args) => out.push(args));
  try {
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { story: true } } } });
    assert.equal(unlock.lineUnlockLedgerValue(undefined, 'taiquan'), undefined);
    assert.equal(unlock.lineUnlockLedgerValue({}, 'taiquan'), undefined, '占位空存档（没有 角色）同样读不到');
    assert.ok(out.some(([line]) => /^\[dbg:story\] \[整线解锁\] taiquan 账本条件没拿到存档/.test(line)));
  } finally {
    numbers.applyGameNumbers({ diagnostics: before });
    dbg.setDebugConsole(null);
  }
  assert.deepEqual(await logged(), [], '读不到存档不记码');
  assert.equal(unlock.lineUnlockLedgerValue(saveOf(), 'taiquan'), true);
  assert.equal(unlock.lineUnlockLedgerValue(saveOf({ realm: { 名称: '入微' } }), 'taiquan'), false);
  const rt = saveOf().世界.状态.剧本模组;
  assert.equal(unlock.lineUnlockLedgerValue(saveOf({ flags: {} }), 'taiquan', { runtime: rt }), true, '以传入的 runtime 为准');
});
