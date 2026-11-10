import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { createPinia, setActivePinia } from 'pinia';

// 仅骨干（skeleton）模式下执行器对 `角色.属性`、`社交.关系.<id>`、`角色.身份` 的对象 set 整体替换，
// 管线须拒绝未保留存档年龄字段的整体覆盖（2026-11-11 01:40 总策划定 (a)）。
// 与 c01LifespanLiveSync 相同：真实 AIBS executeCommand + pinia，characterStore 用落盘桩。
if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});
const loadTs = p => jiti.import(new URL(p, import.meta.url).pathname);

const bundle = JSON.parse(readFileSync(new URL('./fixtures/checkpoints/c01-before-wuyuan-220.json', import.meta.url)));
const fresh = () => structuredClone(bundle.saves[0].存档数据);
const YUE = 'lcq.character.yue_shuang';

const { AIBidirectionalSystem } = await loadTs('../src/utils/AIBidirectionalSystem.ts');
const { validateModelCommandPipeline } = await loadTs('../src/utils/modelCommandPipeline.ts');
const { useUIStore } = await loadTs('../src/stores/uiStore.ts');
const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
const { applyLoadRepairs } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const { ageForSaveCard, calculateAgeFromBirthdate } = await loadTs('../src/utils/lifespanCalculator.ts');
const { gateAgeNow } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const { privateGateOpen } = await loadTs('../src/modules/scenarioMods/promptLayers.ts');

const execute = (save, cmd, mode) => AIBidirectionalSystem['executeCommand'](structuredClone(cmd), save, mode);
/** mode 为 undefined 时不设置（uiStore 默认值）。 */
const withMode = mode => {
  setActivePinia(createPinia());
  globalThis.localStorage.removeItem('commandProtectionMode');
  if (mode) useUIStore().commandProtectionMode = mode;
};
const pipe = async (save, cmd) => validateModelCommandPipeline([structuredClone(cmd)], save);
const AGE_DROP = /仅骨干模式下整体覆盖会丢掉年龄字段/;
const ageDropRejected = result => result.rejectedCommands.some(r => r.errors.some(e => AGE_DROP.test(e)));

const dropLife = s => ({ action: 'set', key: '角色.属性', value: { 气血: structuredClone(s.角色.属性.气血), 灵气: structuredClone(s.角色.属性.灵气) } });
const keepLife = s => ({ action: 'set', key: '角色.属性', value: { 气血: { 当前: 90, 上限: 100 }, 灵气: structuredClone(s.角色.属性.灵气), 寿命: structuredClone(s.角色.属性.寿命) } });
const yueGate = s => {
  const ageNow = gateAgeNow(YUE, s.元数据.时间.年, undefined, s.社交?.关系?.[YUE]?.首见年);
  return { ageNow, open: privateGateOpen({ characterId: YUE, ageNow, present: true, affinity: 80, inputText: '亲密', beat: { scene: { intimate: true } } }) };
};

test('skeleton：set 角色.属性 丢掉寿命被管线拒绝；绕过管线执行会丢 寿命，读档不补回，现算年龄与私密门不变', async () => {
  withMode('skeleton');
  const s = fresh();
  const cmd = dropLife(s);
  const result = await pipe(s, cmd);
  assert.equal(result.validCommands.length, 0);
  assert.ok(ageDropRejected(result), JSON.stringify(result.rejectedCommands));
  assert.match(result.rejectedCommands[0].errors.join(' '), /角色\.属性\.寿命\.当前/);
  assert.equal(s.角色.属性.寿命.当前, 20, '管线拒绝后存档寿命仍在');

  // 对照：若绕过管线在 skeleton 下执行，寿命整段丢失（执行器整体替换，冻结文件不改）。
  const bypass = structuredClone(s);
  const gateBefore = yueGate(s);
  execute(bypass, cmd, 'skeleton');
  assert.equal(bypass.角色.属性.寿命, undefined);
  const reloaded = JSON.parse(JSON.stringify(bypass));
  applyLoadRepairs(reloaded);
  assert.equal(reloaded.角色.属性.寿命, undefined, '读档修复不补回寿命对象（只在已有对象上写当前）');
  assert.deepEqual(reloaded.角色.身份.出生日期, { 年: 200, 月: 1, 日: 1 });
  assert.equal(calculateAgeFromBirthdate(reloaded.角色.身份.出生日期, reloaded.元数据.时间), 20);
  assert.equal(ageForSaveCard(reloaded), 20);
  // 私密门只认现算年龄：月霜现算 18，门不开，前后不变。
  assert.deepEqual(gateBefore, { ageNow: 18, open: false });
  assert.deepEqual(yueGate(reloaded), gateBefore);
});

test('skeleton：整体 set 原样保留寿命（含当前）不因本规则拒绝，执行后年龄字段仍在', async () => {
  withMode('skeleton');
  const s = fresh();
  const result = await pipe(s, keepLife(s));
  assert.equal(result.validCommands.length, 1, JSON.stringify(result.rejectedCommands));
  execute(s, result.validCommands[0], 'skeleton');
  assert.deepEqual(s.角色.属性.寿命, { 当前: 20, 上限: 80 });
  assert.equal(s.角色.属性.气血.当前, 90);
  assert.deepEqual(s.角色.身份.出生日期, { 年: 200, 月: 1, 日: 1 });
});

test('skeleton：载荷改写寿命.当前（值不同）仍按既有禁令拒绝', async () => {
  withMode('skeleton');
  const s = fresh();
  const cmd = keepLife(s);
  cmd.value.寿命.当前 = 25;
  const result = await pipe(s, cmd);
  assert.equal(result.validCommands.length, 0);
  assert.match(result.rejectedCommands[0].errors.join(' '), /寿命当前值／首见年及其迁移版本由引擎管理/);
});

for (const mode of ['strict', undefined]) {
  test(`${mode ?? '未设置'}：丢掉寿命的整体 set 不因本规则拒绝，执行器深合并后寿命仍在`, async () => {
    withMode(mode);
    assert.equal(useUIStore().commandProtectionMode, 'strict');
    const s = fresh();
    const result = await pipe(s, dropLife(s));
    assert.equal(result.validCommands.length, 1, JSON.stringify(result.rejectedCommands));
    execute(s, result.validCommands[0], 'strict');
    assert.equal(s.角色.属性.寿命.当前, 20);
  });
}

test('strict：既有行为不变——载荷带寿命.当前（即便原值）仍拒', async () => {
  withMode('strict');
  const s = fresh();
  const result = await pipe(s, keepLife(s));
  assert.equal(result.validCommands.length, 0);
  assert.ok(!ageDropRejected(result));
});

test('skeleton：非年龄字段不受本规则约束——丢掉气血但保留寿命不拒', async () => {
  withMode('skeleton');
  const s = fresh();
  const cmd = { action: 'set', key: '角色.属性', value: { 灵气: structuredClone(s.角色.属性.灵气), 寿命: structuredClone(s.角色.属性.寿命) } };
  const result = await pipe(s, cmd);
  assert.equal(result.validCommands.length, 1, JSON.stringify(result.rejectedCommands));
  execute(s, result.validCommands[0], 'skeleton');
  assert.equal(s.角色.属性.气血, undefined);
  assert.equal(s.角色.属性.寿命.当前, 20);
});

test('对照：set 角色.身份／社交.关系[月霜] 丢出生日期、首见年——若执行会丢，管线本就由正典护栏拒；校验函数在 skeleton 下另判年龄丢失', async () => {
  const cases = [
    { cmd: s => ({ action: 'set', key: '角色.身份', value: { 名字: s.角色.身份.名字, 称号: s.角色.身份.称号 } }), lost: s => s.角色.身份.出生日期 },
    { cmd: s => ({ action: 'set', key: `社交.关系[${JSON.stringify(YUE)}]`, value: { 名字: s.社交.关系[YUE].名字, 好感度: s.社交.关系[YUE].好感度 } }), lost: s => s.社交.关系[YUE].首见年 ?? s.社交.关系[YUE].出生日期 },
  ];
  for (const { cmd, lost } of cases) {
    for (const mode of ['strict', 'skeleton']) {
      withMode(mode);
      const s = fresh();
      const result = await pipe(s, cmd(s));
      assert.equal(result.validCommands.length, 0, `${mode} ${cmd(s).key} 管线须拒（正典护栏先拦，不为放行而削弱）`);
      // 正典护栏未锁该路径时（如其他剧本），同一条指令由年龄条款兜住；只在 skeleton 生效。
      const direct = validateCommand(cmd(s), 0, s, false, mode);
      assert.equal(direct.errors.some(e => AGE_DROP.test(e)), mode === 'skeleton', `${mode} ${cmd(s).key}`);
    }
    const bypass = fresh();
    assert.notEqual(lost(bypass), undefined);
    execute(bypass, cmd(bypass), 'skeleton');
    assert.equal(lost(bypass), undefined, '绕过管线在 skeleton 下执行会丢年龄字段');
  }
});
