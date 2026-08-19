import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/acquaintanceLedger.ts');

const NAMES = new Map([
  ['liuchao.character.sun_shou', '孙寿'],
  ['liuchao.character.xiao_zi', '小紫'],
  ['liuchao.character.jing_li', '惊理'],
]);

test('相识程度分四档且严格递增', async () => {
  const { rankOf } = await modPromise;
  assert.ok(rankOf('rumored') < rankOf('introduced'));
  assert.ok(rankOf('introduced') < rankOf('encountered'));
  assert.ok(rankOf('encountered') < rankOf('joined'));
});

test('只升不降：见过就不会变回没见过', async () => {
  const { upgradeAcquaintance, acquaintanceOf } = await modPromise;
  const ledger = {};
  assert.equal(upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'encountered' }), true);
  // 更低的程度应被忽略
  assert.equal(upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'rumored' }), false);
  assert.equal(acquaintanceOf(ledger, 'a').kind, 'encountered');
  // 更高的程度覆盖
  assert.equal(upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'joined' }), true);
  assert.equal(acquaintanceOf(ledger, 'a').kind, 'joined');
});

test('hasMet 只认 encountered 及以上，听说过不算', async () => {
  const { upgradeAcquaintance, hasMet } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '蛇夫人', kind: 'rumored' });
  assert.equal(hasMet(ledger, '蛇夫人'), false, '仅闻其名不算见过');
  upgradeAcquaintance(ledger, { characterId: 'a', name: '蛇夫人', kind: 'encountered' });
  assert.equal(hasMet(ledger, '蛇夫人'), true);
});

test('关系标签表明归属时同步为 joined', async () => {
  const { syncAcquaintanceLedger, hasJoined } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: NAMES,
    relations: {
      小紫: { 名字: '小紫', 与玩家关系: '主仆' },
      孙寿: { 名字: '孙寿', 与玩家关系: '陌生人' },
    },
  });
  assert.ok(hasJoined(ledger, '小紫'), '主仆表明已归属');
  assert.ok(!hasJoined(ledger, '孙寿'), '陌生人不算归属');
  // 2026-08-20 改口径：**有关系条目不再等于见过**。
  // 建档时 `社交.关系` 会被塞进全关角色档案，且关系标签与好感度都按原著预填
  // （stage_01 开局王哲那条就写着「恩人/受托者、好感 55」，玩家却连面都没见过）。
  // 原口径于是让整关的人从第 0 回合起全部解禁，旁白因此提前叫出名字。
  // 现在关系表只承认**归属级**标签（主仆/麾下这类，投影不会给的中性默认值），
  // 其余交给「已完成的事件」去记——玩家真见过，那一拍自然会完成。
  assert.equal(ledger['liuchao.character.sun_shou'], undefined, '「陌生人」这种标签是投影默认值，不构成见过');
});

test('事件与开场声明推导出 encountered', async () => {
  const { syncAcquaintanceLedger, hasMet } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: NAMES,
    metCharacterIds: ['liuchao.character.jing_li'],
    featuredCharacterIds: ['liuchao.character.xiao_zi'],
    stageId: 'lyl.luoyang_coup',
    worldTurn: 12,
  });
  assert.ok(hasMet(ledger, '惊理'));
  assert.ok(hasMet(ledger, '小紫'));
  assert.equal(ledger['liuchao.character.jing_li'].atStageId, 'lyl.luoyang_coup');
  assert.equal(ledger['liuchao.character.jing_li'].atWorldTurn, 12);
});

test('记住是哪个事件带来的相识，以及当时她是谁', async () => {
  // 处境不另建枚举推导——它本来就写在剧情里。孙寿在吕氏当权时是襄城君、
  // 倒台后是死囚；记下"在哪个事件遇到"+"当时的身份"，处境自然带出。
  const { syncAcquaintanceLedger, acquaintanceByName } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: NAMES,
    characterIdentities: new Map([['liuchao.character.sun_shou', '襄城君、吕冀之妻']]),
    metCharacterIds: new Map([['liuchao.character.sun_shou', 'lyl.event.s04_02']]),
    stageId: 'lyl.taiquan_sacred_fruit',
  });
  const record = acquaintanceByName(ledger, '孙寿');
  assert.equal(record.atEventId, 'lyl.event.s04_02', '须记下相遇事件');
  assert.equal(record.identityAtMeeting, '襄城君、吕冀之妻', '须记下当时的身份，而非她后来是谁');
  assert.equal(record.atStageId, 'lyl.taiquan_sacred_fruit');
});

test('同级记录补空字段，不被先入账者整条挡掉', async () => {
  // 真机实测：开场声明先入账（不带事件 id），随后带事件 id 的同级记录被"只升不降"
  // 整条拒绝，22 条里只有 1 条拿到 atEventId。同级应补空字段而非丢弃。
  const { upgradeAcquaintance, acquaintanceOf } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'encountered' });
  const filled = upgradeAcquaintance(ledger, {
    characterId: 'a', name: '甲', kind: 'encountered',
    atEventId: 'evt.1', identityAtMeeting: '商队成员',
  });
  assert.equal(filled, true, '同级补字段应视为发生了变更');
  assert.equal(acquaintanceOf(ledger, 'a').atEventId, 'evt.1');
  assert.equal(acquaintanceOf(ledger, 'a').identityAtMeeting, '商队成员');
  // 已有值不被后来的同级记录覆盖
  upgradeAcquaintance(ledger, {
    characterId: 'a', name: '甲', kind: 'encountered', atEventId: 'evt.2',
  });
  assert.equal(acquaintanceOf(ledger, 'a').atEventId, 'evt.1', '首次相遇的事件不被后续覆盖');
});

test('相识程度升级时刷新相遇时点，但不倒退', async () => {
  const { syncAcquaintanceLedger, acquaintanceByName } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger, characterNames: NAMES,
    metCharacterIds: new Map([['liuchao.character.sun_shou', 'lyl.event.s04_02']]),
    stageId: 'lyl.taiquan_sacred_fruit',
  });
  // 后续升级为 joined
  syncAcquaintanceLedger({
    ledger, characterNames: NAMES,
    relations: { 孙寿: { 名字: '孙寿', 与玩家关系: '内宅侍婢' } },
    stageId: 'lyg.changgan_begins',
  });
  const record = acquaintanceByName(ledger, '孙寿');
  assert.equal(record.kind, 'joined');
  assert.equal(record.atStageId, 'lyg.changgan_begins', '升级时点更新到归入那一关');
});

test('回填标记保留，用于标示证据强度较弱', async () => {
  const { syncAcquaintanceLedger } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger, characterNames: NAMES,
    metCharacterIds: ['liuchao.character.sun_shou'],
    backfilled: true,
  });
  assert.equal(ledger['liuchao.character.sun_shou'].backfilled, true);
});

test('主角不入账（真机实测漏过一次）', async () => {
  // 真机首轮：程宗扬以 encountered 进了账本。主角就是那个"我"，
  // 不该出现在"我认识谁"的记录里——与姿态层、上限层同一类排除。
  const { syncAcquaintanceLedger, acquaintanceByName } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: new Map([...NAMES, ['liuchao.character.cheng_zongyang', '程宗扬']]),
    metCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi'],
    relations: { 程宗扬: { 名字: '程宗扬', 与玩家关系: '自己' } },
    playerName: '程宗扬',
  });
  assert.equal(acquaintanceByName(ledger, '程宗扬'), undefined, '主角不得入账');
  assert.ok(acquaintanceByName(ledger, '小紫'), '其他角色照常入账');
});

test('未知角色不入账（characterNames 无映射时跳过）', async () => {
  const { syncAcquaintanceLedger } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({ ledger, characterNames: NAMES, metCharacterIds: ['unknown.id'] });
  assert.equal(Object.keys(ledger).length, 0);
});

// —— prompt 注入：挡住"按原著快照假定熟识" ——

test('素未谋面者注入明确约束', async () => {
  const { formatAcquaintance } = await modPromise;
  const line = formatAcquaintance({}, '孙寿');
  assert.match(line, /素未谋面/);
  assert.match(line, /不得以旧识|既有交情/, '须禁止写成旧识');
  assert.match(line, /对方同样不认识玩家/, '双向都要挡');
});

test('未相识时显式否定投影的关系身份（账本的立项动机）', async () => {
  // 孙寿在燕歌的 stage-projection role 写死为「程宗扬内宅侍婢」，
  // 哪怕玩家整条云龙线都没见过她。账本无记录时必须当场否定那个身份。
  const { formatAcquaintance } = await modPromise;
  const line = formatAcquaintance({}, '孙寿', '程宗扬内宅侍婢');
  assert.match(line, /素未谋面/);
  assert.match(line, /原著轨迹的投影|此局并未发生/, '须点明那是投影而非既成事实');
  assert.match(line, /不得据此称呼|不存在任何隶属/, '须禁止据此行动');
  assert.ok(line.includes('程宗扬内宅侍婢'), '须引用被否定的具体身份');
});

test('非关系类投影身份不触发否定（外貌/宗派等不依赖轨迹）', async () => {
  const { formatAcquaintance } = await modPromise;
  const line = formatAcquaintance({}, '孟非卿', '星月湖大营领袖、三团团长');
  assert.match(line, /素未谋面/, '仍然是素未谋面');
  assert.ok(!line.includes('原著轨迹的投影'), '军职不是关系身份，不该被否定');
});

test('已相识者不否定投影身份', async () => {
  const { upgradeAcquaintance, formatAcquaintance } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '孙寿', kind: 'joined' });
  assert.equal(formatAcquaintance(ledger, '孙寿', '程宗扬内宅侍婢'), '', '已归入者身份成立，不注入');
});

test('仅闻其名与一面之缘各有措辞', async () => {
  const { upgradeAcquaintance, formatAcquaintance } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '蛇夫人', kind: 'rumored' });
  assert.match(formatAcquaintance(ledger, '蛇夫人'), /仅闻其名|尚未见过本人/);
  const ledger2 = {};
  upgradeAcquaintance(ledger2, { characterId: 'b', name: '惊理', kind: 'introduced' });
  assert.match(formatAcquaintance(ledger2, '惊理'), /一面之缘/);
});

test('已见过/已归入者不注入相识约束（不啰嗦）', async () => {
  const { upgradeAcquaintance, formatAcquaintance } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '小紫', kind: 'encountered' });
  assert.equal(formatAcquaintance(ledger, '小紫'), '');
  upgradeAcquaintance(ledger, { characterId: 'a', name: '小紫', kind: 'joined' });
  assert.equal(formatAcquaintance(ledger, '小紫'), '');
});

// —— 持久化与跨关继承：与 introducedCharacterIds 的关键区别 ——

test('账本写入 runtime 并在切关时继承', async () => {
  const fs = await import('node:fs');
  const runtimeSrc = fs.readFileSync(new URL('../src/modules/scenarioMods/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtimeSrc, /updateAcquaintanceLedger\(next, runtime/, '每回合推进时须同步账本');
  assert.match(runtimeSrc, /rt\.acquaintances = rt\.acquaintances/, '须落在 runtime 上（持久化）');

  const initSrc = fs.readFileSync(new URL('../src/modules/scenarioMods/strictInitializer.ts', import.meta.url), 'utf8');
  assert.match(initSrc, /acquaintanceSnapshot/, '切关须快照账本');
  assert.match(initSrc, /newRuntime\.acquaintances/, '切关须恢复账本');
});

test('storyContext 消费账本，且主角不受影响', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8');
  // 跨行匹配：调用可能被格式化成多行，别锁单行形态（本条已因此断过一次）
  const call = src.search(/formatAcquaintance\(\s*runtime\.acquaintances/);
  assert.ok(call > 0, 'storyContext 应注入相识程度');
  assert.match(src.slice(Math.max(0, call - 260), call), /!isProtagonist/, '主角不注入');
  assert.match(src.slice(call, call + 320), /role|origin/, '须把本关投影身份传进去以便否定');
});
