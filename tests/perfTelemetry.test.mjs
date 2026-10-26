// 回合/模型耗时监控：turnTelemetry 内部聚合（p50/p95）、超阈值 warn 日志（新错误码）、数值体检登记、
// 诊断导出与反馈包带统计，以及 AIBidirectionalSystem 的遥测调用点保持原样。
//
// 冻结门禁（相对 feat/baseline-p1 merge-base）：默认 runtime.ts / AIBidirectionalSystem.ts
// 不得再扩无批差分。用户拍板方案 A（2026-10-19）允许下列有限触碰——写入期望而非回滚功能：
//   1. 3763e22e — runtime.ts 同拍闸（settleSharedExperienceAffinity ↔ affinityBeatTaken，+约 6 行）
//   2. 781b656a — AIBidirectionalSystem.ts 自由行动接线（放行说明；口径不完全是「仅 bugfix/已批清理」；
//                该提交已在 baseline-p1 祖先内，相对当前 merge-base 通常无 name-only 差分）
//   3. 2026-10-19 22:31 用户批准的小批解冻（runtime.ts / AIBidirectionalSystem.ts）：任务线效果结算迁至 questLineEffects.ts
//      （角色结局只记归宿、不写 gameOver）、NPC 境界走 actorLevels.reconcileNpcRealm、剧情交易金额读 story.trades、
//      逐拍演出关卡读行旅数据 + story.stepScene.minutesPerBeat。改完重新上锁：内容哈希基线 tests/frozen-baseline.json。
//   4. 2026-10-19 23:52 用户批准：runtime.ts 谢艺境界改走 actorLevels.reconcileNpcRealm（存档为准、只补缺失，隐藏期仍显示「未知」）；
//      AIBS 2742 回合计时 120 分钟读 story.stepScene.minutesPerBeat 用户已知悉。基线哈希同步更新。
//   5. 2026-10-26 用户批准（身份账 T3 方案 A）：runtime.ts 只加 2 行（import syncPlayerLedgers；recordChronicleTransitions 之后调用），基线哈希同步更新。
//   6. 2026-10-25 23:24 用户批准（身份账 T4）：runtime.ts 只加 3 行（import resolveLedgerPath；resolveConditionValue 开头委托账本路径），基线哈希同步更新。
// 已批、可对照但不需再「新批」的清理：63fdf031（runtime world_sim 移除）、cd3d3706（AIBS 快速演示删除）。
// 禁止：回滚同拍闸、把同拍闸迁出 runtime、为过门禁改游戏运行时逻辑。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const tel = await loadTs('../src/utils/turnTelemetry.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const perfCfg = await loadTs('../src/modules/diagnostics/perfConfig.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const store = await loadTs('../src/modules/diagnostics/store.ts');
const codes = await loadTs('../src/modules/diagnostics/codes.ts');
const exportMod = await loadTs('../src/modules/diagnostics/export.ts');
const feedback = await loadTs('../src/modules/diagnostics/feedback.ts');
const root = new URL('..', import.meta.url).pathname;

const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};

/** 用可控时钟跑一个回合：model 毫秒数 = null 表示没走模型。 */
function runTurn(clock, { turnMs, modelMs = null, path = 'legacy' }) {
  const realNow = Date.now;
  try {
    Date.now = () => clock.t;
    tel.beginTurnTelemetry(path);
    if (modelMs != null) {
      tel.noteGenerateStart({ provider: 'p', model: 'm' });
      clock.t += modelMs;
      tel.noteGenerateComplete();
      clock.t += turnMs - modelMs;
    } else clock.t += turnMs;
    tel.endTurnTelemetry();
  } finally { Date.now = realNow; }
}

async function withPerf(patch, fn) {
  const before = structuredClone(numbers.GAME_NUMBERS.perf);
  tel.resetTurnTelemetryForTests();
  await log.resetLogState();
  try {
    if (patch) numbers.applyGameNumbers({ perf: patch });
    return await quiet(fn);
  } finally { numbers.applyGameNumbers({ perf: before }); tel.resetTurnTelemetryForTests(); await log.resetLogState(); }
}

test('percentile：最近邻法，空数组为 null，单值与边界', () => {
  assert.equal(tel.percentile([], 50), null);
  assert.equal(tel.percentile([7], 95), 7);
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(tel.percentile(v, 50), 50);
  assert.equal(tel.percentile(v, 95), 95);
  assert.equal(tel.percentile([5, 1, 3], 50), 3, '不依赖输入顺序');
  assert.equal(tel.percentile([5, 1, 3], 100), 5);
});

test('perf 配置：在 game-numbers 里、体检通过；坏值整份拒绝（LCQ-NUM-006），已登记校验器', async () => {
  assert.deepEqual(perfCfg.validatePerfConfig(), []);
  assert.ok(perfCfg.perfConfig().turnWarnMs > 0);
  for (const bad of [{ sampleWindow: 0 }, { turnWarnMs: -1 }, { modelWarnMs: 1.5 }, { minSamplesForPercentile: 999 }, { modelWarnMs: 999999 }]) {
    assert.throws(() => numbers.applyGameNumbers({ perf: bad }), err => err.code === 'LCQ-NUM-006', JSON.stringify(bad));
  }
  assert.throws(() => numbers.applyGameNumbers({ perf: { nope: 1 } }), err => err.code === 'LCQ-NUM-002');
  assert.deepEqual(perfCfg.validatePerfConfig(undefined), []);
  assert.equal(perfCfg.validatePerfConfig(null).length, 1);
  assert.deepEqual(perfCfg.validatePerfConfig(perfCfg.perfConfig()), []);
});

test('聚合：回合耗时与模型耗时分别统计 p50/p95，样本不足时分位为 null，没走模型的回合不进模型序列', async () => {
  await withPerf({ minSamplesForPercentile: 5 }, async () => {
    const clock = { t: 1_000_000 };
    for (const ms of [100, 200, 300, 400]) runTurn(clock, { turnMs: ms + 50, modelMs: ms });
    let s = tel.getPerfStats();
    assert.equal(s.turn.count, 4);
    assert.equal(s.turn.p50, null, '4 < 5 个样本不给分位');
    assert.equal(s.turn.max, 450);
    runTurn(clock, { turnMs: 500, modelMs: 450 });
    runTurn(clock, { turnMs: 40, path: 'local_contract' });
    s = tel.getPerfStats();
    assert.equal(s.turn.count, 6);
    assert.equal(s.model.count, 5, '本地回合没有模型耗时');
    assert.deepEqual([s.model.p50, s.model.p95, s.model.max], [300, 450, 450]);
    assert.deepEqual([s.turn.p50, s.turn.p95, s.turn.max], [250, 500, 500]);
    assert.deepEqual(s.byPath, { legacy: 5, local_contract: 1 });
    assert.deepEqual(s.warned, { turn: 0, model: 0 });
  });
});

test('窗口：只保留最近 sampleWindow 个回合；热改窗口生效', async () => {
  await withPerf({ sampleWindow: 5, minSamplesForPercentile: 1 }, async () => {
    const clock = { t: 5_000 };
    for (let i = 1; i <= 8; i++) runTurn(clock, { turnMs: i * 10, modelMs: i * 5 });
    const s = tel.getPerfStats();
    assert.deepEqual(s.window, { samples: 5, max: 5 });
    assert.equal(s.turn.count, 5);
    assert.equal(s.turn.max, 80);
    assert.equal(tel.percentile([40, 50, 60, 70, 80], 50), s.turn.p50, '丢掉最早的 3 个：40..80');
  });
});

test('超阈值：回合超时记 LCQ-NET-010、模型超时记 LCQ-NET-011，都是 warn，detail 带阈值与分项；恰好等于阈值不告警', async () => {
  await withPerf({ turnWarnMs: 1000, modelWarnMs: 600 }, async () => {
    const clock = { t: 9_000 };
    runTurn(clock, { turnMs: 1000, modelMs: 600 });
    assert.equal((await store.logStore.recent(50)).length, 0, '等于阈值不算超');
    runTurn(clock, { turnMs: 1500, modelMs: 700, path: 'modular' });
    runTurn(clock, { turnMs: 1200, modelMs: 100 });
    runTurn(clock, { turnMs: 800, modelMs: 650 });
    const entries = await store.logStore.recent(50);
    const byMs = (a, b) => b.detail.turnMs - a.detail.turnMs;
    const turn = entries.filter(e => e.code === 'LCQ-NET-010').sort(byMs), model = entries.filter(e => e.code === 'LCQ-NET-011').sort(byMs);
    assert.equal(turn.length, 2);
    assert.equal(model.length, 2);
    assert.ok(entries.every(e => e.level === 'warn' && e.module === 'turnTelemetry'));
    assert.equal(turn[0].detail.thresholdMs, 1000);
    assert.equal(turn[0].detail.turnMs, 1500);
    assert.equal(turn[0].detail.modelMs, 700);
    assert.equal(turn[0].detail.path, 'modular');
    assert.equal(model[0].detail.thresholdMs, 600);
    assert.deepEqual(tel.getPerfStats().warned, { turn: 2, model: 2 });
  });
});

test('日志故障或配置异常不影响回合收尾：endTurnTelemetry 照常返回快照', async () => {
  await withPerf({ turnWarnMs: 10, modelWarnMs: 5 }, async () => {
    const clock = { t: 1 };
    const realNow = Date.now;
    try {
      Date.now = () => clock.t;
      tel.beginTurnTelemetry('legacy');
      clock.t += 5000;
      const snap = tel.endTurnTelemetry();
      assert.equal(snap.path, 'legacy');
      assert.equal(snap.beganAt, 1);
    } finally { Date.now = realNow; }
    assert.equal(tel.endTurnTelemetry().path, 'legacy', '没有进行中回合时仍返回上一回合');
  });
});

test('错误码 LCQ-NET-010/011 已在 codes.ts 与 docs/ERROR-CODES.md 登记（warn / turnTelemetry / 不进玩家提示）', () => {
  const doc = readFileSync(`${root}docs/ERROR-CODES.md`, 'utf8');
  for (const code of ['LCQ-NET-010', 'LCQ-NET-011']) {
    const spec = codes.ERROR_CODES[code];
    assert.ok(spec, `${code} 未登记`);
    assert.deepEqual([spec.level, spec.module, spec.toast], ['warn', 'turnTelemetry', false]);
    assert.match(doc, new RegExp(`\\| ${code} \\| warn \\| turnTelemetry \\|`));
  }
});

test('诊断导出带 perf 统计', async () => {
  await withPerf({ minSamplesForPercentile: 1 }, async () => {
    runTurn({ t: 100 }, { turnMs: 300, modelMs: 200 });
    const exported = await exportMod.buildLogExport();
    assert.equal(exported.stats.perf.turn.count, 1);
    assert.equal(exported.stats.perf.model.p50, 200);
    assert.deepEqual(Object.keys(exported.stats.perf.thresholds).sort(), ['modelWarnMs', 'turnWarnMs']);
  });
});

/** 只够读 store 模式 zip 里指定文件的最小读取器。 */
function zipFile(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let pos = view.getUint32(eocd + 16, true);
  for (let i = 0, n = view.getUint16(eocd + 10, true); i < n; i++) {
    const size = view.getUint32(pos + 24, true), nameLen = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true);
    if (new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen)) === name) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      return new TextDecoder().decode(bytes.subarray(start, start + size));
    }
    pos += 46 + nameLen + extra + comment;
  }
  return null;
}

test('反馈包带 perf.json，且在 manifest 文件清单里', async () => {
  await withPerf({ minSamplesForPercentile: 1 }, async () => {
    runTurn({ t: 100 }, { turnMs: 900, modelMs: 700 });
    const pack = await feedback.buildFeedbackPack({}, { readModelConfig: () => ({}), now: () => new Date('2026-10-18T00:00:00Z') });
    assert.ok(pack.manifest.files.some(f => f.name === 'perf.json'));
    const perf = JSON.parse(zipFile(pack.bytes, 'perf.json'));
    assert.equal(perf.turn.count, 1);
    assert.equal(perf.turn.p95, 900);
    assert.equal(perf.model.p50, 700);
    assert.equal(JSON.parse(zipFile(pack.bytes, 'logs.json')).stats.perf.turn.count, 1);
  });
});

/** 相对 feat/baseline-p1 允许出现 name-only 差分的冻结文件（方案 A 有限放行）。 */
const ALLOWED_FROZEN_NAME_DIFF = new Set([
  'src/modules/scenarioMods/runtime.ts', // 3763e22e 同拍闸
  'src/utils/AIBidirectionalSystem.ts', // 781b656a 自由行动接线（说明用；基线内时常无差分）
]);

test('冻结门禁：AIBS 遥测 begin/end 各一处；runtime/AIBS 仅允许方案 A 有限已批差分', () => {
  const ai = readFileSync(`${root}src/utils/AIBidirectionalSystem.ts`, 'utf8');
  assert.equal((ai.match(/beginTurnTelemetry\(/g) ?? []).length, 1);
  assert.equal((ai.match(/endTurnTelemetry\(/g) ?? []).length, 1);
  assert.ok(!/getPerfStats|recordPerf/.test(ai), '聚合在 turnTelemetry 内部，调用方不感知');
  // 内容哈希锁（不依赖 baseline-p1 分支是否在本地）：两份冻结文件须与 tests/frozen-baseline.json 一致。
  const baseline = JSON.parse(readFileSync(`${root}tests/frozen-baseline.json`, 'utf8'));
  for (const file of ['src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/runtime.ts']) {
    const sha = createHash('sha256').update(readFileSync(`${root}${file}`)).digest('hex');
    assert.equal(sha, baseline.files[file], `冻结文件内容与基线不符: ${file}（解冻须用户批准并更新 tests/frozen-baseline.json）`);
  }
  // 与 feat/baseline-p1 merge-base 相比：仅允许 ALLOWED_FROZEN_NAME_DIFF 内文件出现；无 tip 时跳过。
  let base = '';
  try { base = execFileSync('git', ['merge-base', 'HEAD', 'feat/baseline-p1'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return; }
  const paths = ['src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/runtime.ts'];
  const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', ...paths], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of changed) {
    assert.ok(ALLOWED_FROZEN_NAME_DIFF.has(file), `未放行的冻结差分: ${file}`);
  }
  // 2026-10-19 22:31 用户批准小批解冻（任务线效果结算迁出 questLineEffects、NPC 境界以存档为准、剧情交易金额进 story.trades、
  // 逐拍演出关卡读行旅数据 + story.stepScene.minutesPerBeat）。改完重新锁上：两份冻结文件的内容哈希必须等于基线
  // tests/frozen-baseline.json；再动须重新获批并更新基线（取代原 +20/-50 行数上限）。
  if (changed.includes('src/modules/scenarioMods/runtime.ts')) {
    const runtime = readFileSync(`${root}src/modules/scenarioMods/runtime.ts`, 'utf8');
    assert.ok(runtime.includes('affinityBeatTaken'), 'runtime 同拍闸：须保留 affinityBeatTaken');
    assert.ok(runtime.includes('writableFreeActionState'), 'runtime 同拍闸：须保留 affinityTurn 记账');
  }
});
