import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const ladderPromise = loadTs('../src/modules/scenarioMods/affinityLadder.ts');
const stancePromise = loadTs('../src/modules/scenarioMods/relationStance.ts');

test('八档区间连续、不重叠、完整覆盖 [-100, 100]', async () => {
  const { AFFINITY_TIERS, tierOf } = await ladderPromise;
  assert.equal(AFFINITY_TIERS.length, 8);
  assert.equal(AFFINITY_TIERS[0].min, -100);
  assert.equal(AFFINITY_TIERS[AFFINITY_TIERS.length - 1].max, 100);
  for (let i = 1; i < AFFINITY_TIERS.length; i += 1) {
    assert.equal(AFFINITY_TIERS[i].min, AFFINITY_TIERS[i - 1].max + 1, `档位 ${AFFINITY_TIERS[i].id} 与前档不连续`);
  }
  // 全域逐点可解析，且档位唯一
  for (let fav = -100; fav <= 100; fav += 1) {
    const hits = AFFINITY_TIERS.filter(tier => fav >= tier.min && fav <= tier.max);
    assert.equal(hits.length, 1, `好感 ${fav} 命中 ${hits.length} 个档位`);
    assert.equal(tierOf(fav).id, hits[0].id);
  }
});

test('档位边界落在用户裁定的位置', async () => {
  const { tierOf } = await ladderPromise;
  const expected = [
    [-100, 'nemesis'], [-60, 'nemesis'], [-59, 'hostile'], [-25, 'hostile'],
    [-24, 'wary'], [-10, 'wary'], [-9, 'stranger'], [19, 'stranger'],
    [20, 'acquainted'], [39, 'acquainted'], [40, 'trusted'], [59, 'trusted'],
    [60, 'close'], [79, 'close'], [80, 'sworn'], [100, 'sworn'],
  ];
  for (const [fav, id] of expected) assert.equal(tierOf(fav).id, id, `好感 ${fav} 应为 ${id}`);
});

test('越界与非法值被钳制而非抛错', async () => {
  const { tierOf, clampAffinity } = await ladderPromise;
  assert.equal(tierOf(999).id, 'sworn');
  assert.equal(tierOf(-999).id, 'nemesis');
  assert.equal(clampAffinity(Number.NaN), 0);
  assert.equal(clampAffinity(undefined), 0);
  assert.equal(tierOf(Number.NaN).id, 'stranger');
});

test('姿态投影：low ≤ -10 ＜ mid ＜ 40 ≤ high', async () => {
  const { stanceOf } = await ladderPromise;
  assert.equal(stanceOf(-11), 'low');
  assert.equal(stanceOf(-10), 'low');
  assert.equal(stanceOf(-9), 'mid');
  assert.equal(stanceOf(39), 'mid');
  assert.equal(stanceOf(40), 'high');
});

test('每档的 stance 与姿态函数一致', async () => {
  const { AFFINITY_TIERS, stanceOf } = await ladderPromise;
  for (const tier of AFFINITY_TIERS) {
    for (const fav of [tier.min, tier.max]) {
      assert.equal(stanceOf(fav), tier.stance, `${tier.id} 的 ${fav} 姿态不一致`);
    }
  }
});

// —— 滞回：路线图 R3-9 G1 明确要求"避免好感增减 1 点造成角色瞬间翻脸" ——

test('滞回：刚越档不立即翻档，需超出阈值 3 点', async () => {
  const { projectStance } = await ladderPromise;
  const held = { stance: 'mid' };
  assert.equal(projectStance(40, held, 1).stance, 'mid', '好感刚到 40 不应立刻翻高档');
  assert.equal(projectStance(42, held, 1).stance, 'mid');
  // 达标后进入 pending，本轮仍用旧姿态
  const pending = projectStance(43, held, 1);
  assert.equal(pending.stance, 'mid');
  assert.equal(pending.pending.stance, 'high');
});

test('滞回：达标并维持满一游戏日后才切档', async () => {
  const { projectStance } = await ladderPromise;
  const day1 = projectStance(43, { stance: 'mid' }, 1);
  assert.equal(day1.stance, 'mid');
  const sameDay = projectStance(43, day1, 1);
  assert.equal(sameDay.stance, 'mid', '同日内不得切换');
  const nextDay = projectStance(43, day1, 2);
  assert.equal(nextDay.stance, 'high');
  assert.equal(nextDay.pending, undefined);
});

test('滞回：pending 期间好感退回则撤销，不切档', async () => {
  const { projectStance } = await ladderPromise;
  const day1 = projectStance(43, { stance: 'mid' }, 1);
  assert.equal(day1.pending.stance, 'high');
  const pulledBack = projectStance(38, day1, 2);
  assert.equal(pulledBack.stance, 'mid');
  assert.equal(pulledBack.pending, undefined, '退回后应撤销 pending');
});

test('滞回：±1 点抖动不会来回翻脸（回归 G1 的显式要求）', async () => {
  const { projectStance } = await ladderPromise;
  let state = { stance: 'high' };
  // 在 39/40 边界反复抖动 20 次，姿态必须纹丝不动
  for (let i = 0; i < 20; i += 1) {
    state = projectStance(i % 2 === 0 ? 39 : 40, state, i + 1);
    assert.equal(state.stance, 'high', `第 ${i} 次抖动后姿态翻转`);
  }
});

test('滞回：降档同样需要缓冲', async () => {
  const { projectStance } = await ladderPromise;
  const held = { stance: 'high' };
  assert.equal(projectStance(37, held, 1).stance, 'high', '掉到 37 不应立即降档');
  const pending = projectStance(36, held, 1);
  assert.equal(pending.pending.stance, 'mid');
  assert.equal(projectStance(36, pending, 2).stance, 'mid');
});

test('滞回：无历史状态时退化为瞬时投影', async () => {
  const { projectStance, stanceOf } = await ladderPromise;
  for (const fav of [-80, -10, 0, 39, 40, 90]) {
    assert.equal(projectStance(fav, undefined, 1).stance, stanceOf(fav));
  }
});

// —— 阈值单一真值源 ——

test('阈值锚点为用户裁定值（deep 已由 55 迁到 60）', async () => {
  const { AFFINITY_THRESHOLDS, tierOf } = await ladderPromise;
  assert.equal(AFFINITY_THRESHOLDS.intimacyShallow, 20);
  assert.equal(AFFINITY_THRESHOLDS.intimacyDeep, 60);
  assert.equal(AFFINITY_THRESHOLDS.intimacyBonded, 80);
  assert.equal(AFFINITY_THRESHOLDS.bottomLineReveal, 40);
  // 语义锚定：deep 必须正好落在「亲厚」入口，bottomLineReveal 落在「信重」入口
  assert.equal(tierOf(AFFINITY_THRESHOLDS.intimacyDeep).id, 'close');
  assert.equal(tierOf(AFFINITY_THRESHOLDS.bottomLineReveal).id, 'trusted');
  assert.equal(tierOf(AFFINITY_THRESHOLDS.intimacyShallow).id, 'acquainted');
});

test('intimacyProfiles 的 deep 层随阈值迁移，55 不再解锁', async () => {
  const { formatIntimacyProfile } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const scene = '两人同榻，宽衣解带。';
  const at55 = formatIntimacyProfile('吕雉', { sceneText: scene, favor: 55 });
  const at60 = formatIntimacyProfile('吕雉', { sceneText: scene, favor: 60 });
  assert.ok(at60.length > at55.length, '好感 60 应比 55 多揭示一层');
});

// —— 姿态渲染合同 ——

test('姿态合同只覆盖路线图声明的五个维度', async () => {
  const { formatRelationStance } = await stancePromise;
  for (const fav of [-80, 0, 90]) {
    const text = formatRelationStance('吕雉', { favorability: fav });
    for (const dim of ['语气与称谓', '善恶意解释倾向', '主动披露深度', '协助／冒险意愿', '拒绝与设限方式']) {
      assert.ok(text.includes(dim), `好感 ${fav} 的合同缺维度：${dim}`);
    }
    assert.ok(text.includes('不变量'), '必须带不变量约束');
  }
});

test('姿态合同三档内容互不相同，且带档位名', async () => {
  const { formatRelationStance } = await stancePromise;
  const low = formatRelationStance('吕雉', { favorability: -80 });
  const mid = formatRelationStance('吕雉', { favorability: 0 });
  const high = formatRelationStance('吕雉', { favorability: 90 });
  assert.notEqual(low, mid);
  assert.notEqual(mid, high);
  assert.ok(low.includes('仇雠'));
  assert.ok(mid.includes('陌路'));
  assert.ok(high.includes('生死'));
});

test('高好感合同显式保留拒绝的可能（不得等同无条件服从）', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('吕雉', { favorability: 90 });
  assert.ok(high.includes('仍然可以拒绝'), '高档必须保留拒绝可能');
});

test('低好感合同显式否定机械敌对（不得泛用恶女化）', async () => {
  const { formatRelationStance } = await stancePromise;
  const low = formatRelationStance('吕雉', { favorability: -80 });
  assert.ok(low.includes('不等于失去智性或机械敌对'));
});

// —— 好感写入权门禁（§7 混合裁定） ——

test('门禁拒绝模型 set 好感度（写入权归引擎）', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  const result = gate({ action: 'set', key: '社交.关系.吕雉.好感度', value: 90 });
  assert.equal(result.command, null);
  assert.match(result.warning, /拒绝模型 set 好感度/);
});

test('门禁放行 add，且不干扰其它路径的命令', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  const ok = gate({ action: 'add', key: '社交.关系.吕雉.好感度', value: 10 });
  assert.equal(ok.command.value, 10);
  assert.equal(ok.warning, undefined);
  // 非好感路径原样返回，含 set
  const other = { action: 'set', key: '角色.属性.声望', value: 300 };
  assert.deepEqual(gate(other).command, other);
  const otherNpcField = { action: 'set', key: '社交.关系.吕雉.当前状态', value: '沉思' };
  assert.deepEqual(gate(otherNpcField).command, otherNpcField);
});

test('门禁把单条超限 add 钳到 ±15', async () => {
  const { createAffinityCommandGate, AFFINITY_LIMITS } = await ladderPromise;
  assert.equal(AFFINITY_LIMITS.perTurn, 15);
  const gate = createAffinityCommandGate();
  const up = gate({ action: 'add', key: '社交.关系.吕雉.好感度', value: 60 });
  assert.equal(up.command.value, 15);
  assert.match(up.warning, /钳制/);
  const gate2 = createAffinityCommandGate();
  const down = gate2({ action: 'add', key: '社交.关系.吕雉.好感度', value: -60 });
  assert.equal(down.command.value, -15);
});

test('门禁按 NPC 跨命令累计，拆成多条不能绕过上限', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  const key = '社交.关系.吕雉.好感度';
  assert.equal(gate({ action: 'add', key, value: 10 }).command.value, 10);
  // 第二条只剩 5 点额度
  assert.equal(gate({ action: 'add', key, value: 10 }).command.value, 5);
  // 第三条额度已尽，直接丢弃
  const third = gate({ action: 'add', key, value: 10 });
  assert.equal(third.command, null);
  assert.match(third.warning, /额度已用尽/);
});

test('门禁额度按 NPC 独立计算，互不挤占', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  assert.equal(gate({ action: 'add', key: '社交.关系.吕雉.好感度', value: 15 }).command.value, 15);
  assert.equal(gate({ action: 'add', key: '社交.关系.贾文和.好感度', value: 15 }).command.value, 15);
});

test('门禁允许反向操作收回已用额度（净变化语义）', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  const key = '社交.关系.吕雉.好感度';
  gate({ action: 'add', key, value: 15 });
  // 已达上限，但反向 -5 是净变化回落，应放行
  assert.equal(gate({ action: 'add', key, value: -5 }).command.value, -5);
  // 净变化回到 10 后，还能再加 5
  assert.equal(gate({ action: 'add', key, value: 10 }).command.value, 5);
});

test('门禁对非数值 add 不做处理，交由既有校验链', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  const cmd = { action: 'add', key: '社交.关系.吕雉.好感度', value: '很多' };
  assert.deepEqual(gate(cmd).command, cmd);
});

test('主角不得被注入关系姿态（真机抓包实测缺陷的回归）', async () => {
  // 曾在 OpenRouter 主叙事请求里抓到「程宗扬·关系姿态·受限渲染合同：陌路（好感 0）」——
  // 主角就是玩家，"对玩家的姿态"对他无意义，好感 0 只是因为他不在 社交.关系 里。
  // 表演卡与亲密档案靠名单门天然规避，姿态层是全量注入，必须在 storyContext 显式排除。
  const source = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8'));
  const call = source.indexOf('formatRelationStance(character.name');
  assert.ok(call > 0, 'storyContext 应调用 formatRelationStance');
  const guardWindow = source.slice(Math.max(0, call - 900), call);
  assert.match(guardWindow, /if \(hasRelationData\)/, '姿态注入必须被关系数据判据包裹');
  assert.match(guardWindow, /const hasRelationData = live !== undefined \|\| canonFav !== undefined/,
    '判据须基于真实关系数据；opening.playerCharacterId 在运行时与 canon 中实测均为空，用它会恒真');
});

test('姿态可由外部传入以覆盖瞬时投影（供滞回接线）', async () => {
  const { formatRelationStance } = await stancePromise;
  const forced = formatRelationStance('贾文和', { favorability: 90, stance: 'low' });
  assert.ok(forced.includes('不等于失去智性或机械敌对'), '应使用传入姿态而非好感瞬时值');
  assert.ok(forced.includes('生死'), '档位名仍反映真实好感');
});
