import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/divergenceLedger.ts');

test('谢艺 void 只有明确生还状态才激活长养 IF', async () => {
  const { recordReconcileDivergences } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lcq.event.s06_03',
    verdict: 'void',
    evidence: '谢艺拄刀而立',
    worldDelta: '谢艺在围猎后生还，但需长期静养',
    characterStates: { 'liuchao.character.xie_yi': 'alive' },
  }]);
  assert.equal(added.length, 1);
  assert.equal(added[0].branchId, 'lcq.if_xieyi_longrest');
  assert.equal(runtime.flags['branch.lcq.if_xieyi_longrest.active'], true);
  assert.equal(runtime.flags['character.xie_yi.status'], 'longrest');
});

test('谢艺缺席失败不误激活长养 IF，并留下搜寻与联络线防卫的持续后果', async () => {
  const { recordReconcileDivergences, formatDivergencePrompt } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lcq.event.s06_03',
    verdict: 'void',
    evidence: '战场已被洪水冲毁',
    worldDelta: '围猎战场被毁，原定桥段无法发生',
    characterStates: { 'liuchao.character.xie_yi': 'missing' },
  }]);
  assert.equal(added.length, 1);
  assert.equal(added[0].branchId, undefined);
  assert.equal(runtime.flags['branch.lcq.if_xieyi_longrest.active'], undefined);
  assert.equal(runtime.flags['world.xieyi_absence.active'], true);
  assert.equal(runtime.flags['character.xie_yi.status'], 'missing');
  const prompt = formatDivergencePrompt(runtime.divergences);
  assert.match(prompt, /不得确认其死亡或安全/);
  assert.match(prompt, /分出人手搜寻/);
  assert.match(prompt, /黑魔海借断线渗透/);
});

test('碧姬明确生还才激活小紫未弑母 IF，并要求处置余波', async () => {
  const { recordReconcileDivergences, formatDivergencePrompt } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lcq.event.s06_04', verdict: 'void', evidence: '碧姬重伤仍有呼吸',
    worldDelta: '碧姬在小紫刀下重伤生还',
    characterStates: { 'liuchao.character.bi_ji': 'incapacitated' },
  }]);
  assert.equal(added[0].branchId, 'lcq.if_xiaozi_spares_mother');
  assert.equal(runtime.flags['branch.lcq.if_xiaozi_spares_mother.active'], true);
  assert.equal(runtime.flags['character.bi_ji.status'], 'alive');
  assert.match(formatDivergencePrompt(runtime.divergences), /不得被写成已弑母/);
  assert.match(formatDivergencePrompt(runtime.divergences), /处置仍活着的碧姬/);
});

test('碧姬缺席等其他 void 原因不误激活未弑母 IF', async () => {
  const { recordReconcileDivergences } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lcq.event.s06_04', verdict: 'void', evidence: '废墟塌陷后碧姬下落不明',
    worldDelta: '废墟塌陷，预设弑母桥段无法发生',
    characterStates: { 'liuchao.character.bi_ji': 'missing' },
  }]);
  assert.equal(added[0].branchId, undefined);
  assert.equal(runtime.flags['branch.lcq.if_xiaozi_spares_mother.active'], undefined);
});

test('苏妲己明确死亡才激活莫愁伏诛 IF，并要求承接黑魔海余波', async () => {
  const { recordReconcileDivergences, formatDivergencePrompt } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lcq.event.s08_06_pursuit_repelled', verdict: 'void', evidence: '苏妲己倒在莫愁湖畔',
    worldDelta: '苏妲己在莫愁湖伏诛，黑魔海追杀线断裂',
    characterStates: { 'liuchao.character.su_daji': 'dead' },
  }]);
  assert.equal(added[0].branchId, 'lcq.if_sudaji_slain_mochou');
  assert.equal(runtime.flags['branch.lcq.if_sudaji_slain_mochou.active'], true);
  assert.equal(runtime.flags['character.su_daji.status'], 'dead');
  assert.match(formatDivergencePrompt(runtime.divergences), /不得让她继续出手追杀/);
});

test('苏妲己逃逸或失踪不会误激活莫愁伏诛 IF', async () => {
  const { recordReconcileDivergences } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lcq.event.s08_06_pursuit_repelled', verdict: 'void', evidence: '苏妲己遁入夜色失去踪迹',
    worldDelta: '苏妲己去向不明，追杀桥段失效',
    characterStates: { 'liuchao.character.su_daji': 'missing' },
  }]);
  assert.equal(added[0].branchId, undefined);
  assert.equal(runtime.flags['branch.lcq.if_sudaji_slain_mochou.active'], undefined);
});

test('英逝双枢纽只有明确生还才激活，并要求承接辅政与凉州余波', async () => {
  const { recordReconcileDivergences, formatDivergencePrompt } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lyg.event.s01_06', verdict: 'void', evidence: '郭解尚有脉息',
    worldDelta: '郭解重伤生还，游侠旧部等待新朝安排',
    characterStates: { 'liuchao.character.guo_jie': 'alive' },
  }, {
    id: 'lyg.event.s01_07', verdict: 'void', evidence: '董卓由贾文和护出宫门',
    worldDelta: '董卓重伤未死，凉州旧部需要被收束',
    characterStates: { 'liuchao.character.dong_zhuo': 'incapacitated' },
  }]);
  assert.deepEqual(added.map(item => item.branchId), ['lyg.if_guojie_longrest', 'lyg.if_dongzhuo_longrest']);
  assert.equal(runtime.flags['character.guo_jie.status'], 'longrest');
  assert.equal(runtime.flags['character.dong_zhuo.status'], 'longrest');
  const prompt = formatDivergencePrompt(runtime.divergences);
  assert.match(prompt, /托孤已转为受限辅政/);
  assert.match(prompt, /贾文和必须收束凉州旧部/);
  assert.match(prompt, /定陶王登基不变/);
});

test('英逝人物缺席不误激活郭解或董卓 IF', async () => {
  const { recordReconcileDivergences } = await modPromise;
  const runtime = { flags: {} };
  const added = recordReconcileDivergences(runtime, [{
    id: 'lyg.event.s01_06', verdict: 'void', evidence: '宫门封锁，郭解不知所终',
    worldDelta: '郭解所在的宫门被封锁',
    characterStates: { 'liuchao.character.guo_jie': 'missing' },
  }, {
    id: 'lyg.event.s01_07', verdict: 'void', evidence: '混战中董卓下落不明',
    worldDelta: '董卓在混战中失去踪迹',
    characterStates: { 'liuchao.character.dong_zhuo': 'missing' },
  }]);
  assert.deepEqual(added.map(item => item.branchId), [undefined, undefined]);
  assert.equal(runtime.flags['branch.lyg.if_guojie_longrest.active'], undefined);
  assert.equal(runtime.flags['branch.lyg.if_dongzhuo_longrest.active'], undefined);
});

test('分歧账本幂等，prompt要求NPC据变化行动', async () => {
  const { recordReconcileDivergences, formatDivergencePrompt } = await modPromise;
  const runtime = { flags: {} };
  const input = [{
    id: 'lcq.event.s06_03', verdict: 'void', evidence: '谢艺生还',
    worldDelta: '谢艺没有死去', characterStates: { 'liuchao.character.xie_yi': 'longrest' },
  }];
  recordReconcileDivergences(runtime, input);
  recordReconcileDivergences(runtime, input);
  assert.equal(runtime.divergences.length, 1);
  assert.match(formatDivergencePrompt(runtime.divergences), /谢艺没有死去/);
  assert.match(formatDivergencePrompt(runtime.divergences), /相关人物据此采取行动/);
});

test('没有预写 IF 的人物分歧也写入统一状态路径', async () => {
  const { recordReconcileDivergences } = await modPromise;
  const runtime = { flags: {} };
  recordReconcileDivergences(runtime, [{
    id: 'custom.event.01', verdict: 'void', evidence: '赵甲失踪',
    worldDelta: '赵甲在山道失踪，原会面无法发生',
    characterStates: { 'custom.character.zhao_jia': 'missing' },
  }]);
  assert.equal(runtime.flags['character.zhao_jia.status'], 'missing');
});
