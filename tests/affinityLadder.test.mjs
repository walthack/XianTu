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

test('intimacyProfiles 的 deep 层随阈值迁移：55 不解锁、60 解锁（断具体文本，不比长度）', async () => {
  const { formatIntimacyProfile } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const scene = '两人同榻，宽衣解带。';
  const DEEP = '羞耻感常态化';          // 吕雉 deep 层原文
  const SHALLOW = '绝境求庇后委身';      // shallow 层，两档都该有
  const at54 = formatIntimacyProfile('吕雉', { sceneText: scene, favor: 54 });
  const at55 = formatIntimacyProfile('吕雉', { sceneText: scene, favor: 55 });
  const at59 = formatIntimacyProfile('吕雉', { sceneText: scene, favor: 59 });
  const at60 = formatIntimacyProfile('吕雉', { sceneText: scene, favor: 60 });
  for (const [label, text] of [['54', at54], ['55（旧阈值）', at55], ['59', at59]]) {
    assert.ok(!text.includes(DEEP), `好感 ${label} 不应解锁 deep 层`);
    assert.ok(text.includes(SHALLOW), `好感 ${label} 应仍有 shallow 层`);
  }
  assert.ok(at60.includes(DEEP), '好感 60 应解锁 deep 层');
  // 硬边界任何档位都在
  assert.ok(at54.includes('处女功法') || at54.includes('处子之身'), 'hardLimits 不受分层影响');
});

test('高档姿态不得盖掉表演卡声线（贾文和「他不会变热」）', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('贾文和', { favorability: 90 });
  // 曾写「亲近…称谓可更私人」，与其表演卡的冷淡短句、不得变热直接冲突（二审 P2）
  assert.ok(!high.includes('称谓可更私人'), '不得指示改口换称谓');
  assert.ok(high.includes('表演卡'), '高档语气项必须把声线权交还表演卡');
  assert.match(high, /不等于变热|保持冷硬/, '必须显式否定"高好感=变热"');
  assert.ok(high.includes('表演卡'), '不变量段须声明表演卡优先');
});

test('合同头部不得携带 tier.gist（它不属于五维度且措辞更强）', async () => {
  const { formatRelationStance } = await stancePromise;
  const nemesis = formatRelationStance('鬼巫王', { favorability: -80 });
  assert.ok(nemesis.includes('仇雠'), '档位名仍要有');
  assert.ok(!nemesis.includes('已认定必须除掉你'), 'gist 不得进 LLM 合同，只服务 UI/文档');
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
  assert.match(result.warning, /拒绝模型对好感度执行 set/);
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

// —— 命令门禁的绕过面（独立二审 P1：delete 可绕过 ±15） ——

test('门禁拒绝 delete 好感度（曾可绕过 perTurn 归零）', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  // 攻击序列：好感 80 时 delete 字段 → dataRepair 补回 0 → 同回合 add +15 → 15，净 -65。
  const del = gate({ action: 'delete', key: '社交.关系.吕雉.好感度' });
  assert.equal(del.command, null, 'delete 必须被拒绝');
  assert.match(del.warning, /只允许 add/);
});

test('门禁对未知/其它动作一律拒绝（白名单而非黑名单）', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  for (const action of ['push', 'pull', 'unset', 'merge', undefined, '']) {
    const r = gate({ action, key: '社交.关系.吕雉.好感度', value: 1 });
    assert.equal(r.command, null, `动作 ${String(action)} 应被拒绝`);
  }
});

test('门禁不误伤其它路径的 delete', async () => {
  const { createAffinityCommandGate } = await ladderPromise;
  const gate = createAffinityCommandGate();
  const cmd = { action: 'delete', key: '社交.关系.吕雉.当前状态' };
  assert.deepEqual(gate(cmd).command, cmd);
});

test('姿态注入的两道门：主角显式排除 + 需有真实关系数据', async () => {
  // 缺陷史：真机抓包发现主角被注入「程宗扬·关系姿态：陌路（好感 0）」。
  // 第一版修复用 runtime.opening?.playerCharacterId，该字段在运行时投影与 canon 中实测均为空，
  // 判据恒真、完全没生效；第二版才改为「玩家名 + 关系数据」两道门。
  // 这里断言两道门的判据都在，且顺序上主角优先——源码级断言是权宜（formatFocusedCharacter
  // 未导出），但两条判据一起锁比只锁一条更难被无意改坏。
  const source = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8'));
  const call = source.indexOf('formatRelationStance(character.name');
  assert.ok(call > 0, 'storyContext 应调用 formatRelationStance');
  const guardWindow = source.slice(Math.max(0, call - 1200), call);
  assert.match(guardWindow, /const isProtagonist = Boolean\(playerName\) && character\.name === playerName/,
    '必须有基于玩家名的显式主角判据');
  assert.match(guardWindow, /if \(!isProtagonist && hasRelationData\)/, '两道门都要生效');
  // 只禁止把它当**判据**用；注释里提到这个字段名（解释为什么不用）是允许的
  assert.ok(!/character\.id\s*!==\s*runtime\.opening\?\.playerCharacterId/.test(guardWindow),
    '不得回退到以 opening.playerCharacterId 为判据 —— 该字段实测为空，判据会恒真');
  // playerName 必须真的被取到并一路传下来，否则第一道门永远是 false
  assert.match(source, /const playerName = String\(readPath\(saveData, \['角色', '身份', '名字'\]\)/,
    'playerName 必须从存档取');
  assert.match(source, /formatFocusedCharacter\(character, runtime, favByName, intimacyGate, playerName\)/,
    'playerName 必须传进 formatFocusedCharacter');
});

// —— 角色专属姿态形态（防"高好感=通用温柔化"） ——

test('小紫高好感不得退化为恋爱脑，深情形态是占有与铺路', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('小紫', { favorability: 90 });
  assert.ok(high.includes('【小紫·本人姿态形态·优先'), '应注入专属形态');
  assert.ok(high.includes('高好感不等于恋爱脑'), '必须显式否定恋爱脑');
  assert.match(high, /占有|铺路/, '深情的正确形态须写明');
  assert.ok(high.includes('智商与信息始终压制主角'), '本色锚在任何档位都要在');
  assert.ok(high.includes('程头儿'), '称谓本色不变');
});

test('小紫低好感不翻脸，断的是信息而非撒娇', async () => {
  const { formatRelationStance } = await stancePromise;
  const low = formatRelationStance('小紫', { favorability: -80 });
  assert.ok(low.includes('不会翻脸'));
  assert.ok(low.includes('智商与信息始终压制主角'), '本色锚同样注入');
});

test('凝羽高好感仍口是心非，变化只在不由自主的破绽', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('凝羽', { favorability: 85 });
  assert.ok(high.includes('高好感不改变她的嘴'));
  assert.match(high, /颤|破绽/, '变化须落在生理破绽而非语言');
  assert.ok(high.includes('从不口头承认爱意'), '本色锚在场');
});

test('月霜高好感不等于和解或温柔（正典：事后仍动杀心）', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('月霜', { favorability: 85 });
  assert.ok(high.includes('高好感不等于和解'));
  assert.match(high, /刻薄找补|僵持/, '须保留傲娇找补的形态');
});

test('乐明珠是对照组：本色外露，高好感确实更黏', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('乐明珠', { favorability: 85 });
  assert.ok(high.includes('确实会更黏'), '本色外露的角色允许外露');
  assert.ok(high.includes('外露不等于失去自我'), '仍要保底线');
});

test('外显度由本色而非性别决定：同为女性，三人高档形态互斥', async () => {
  const { formatRelationStance } = await stancePromise;
  const [leming, ningyu, yueshuang] = ['乐明珠', '凝羽', '月霜']
    .map(n => formatRelationStance(n, { favorability: 85 }));
  // 乐明珠外露、凝羽不改口、月霜不和解——若按性别设外显度，三者会被拉平
  assert.ok(leming.includes('确实会更黏'));
  assert.ok(ningyu.includes('高好感不改变她的嘴'));
  assert.ok(yueshuang.includes('高好感不等于和解'));
  assert.notEqual(leming, ningyu);
  assert.notEqual(ningyu, yueshuang);
});

test('第二批覆盖高频出场缺口，且不收录留白角色', async () => {
  const { STANCE_PROFILES, hasStanceProfile } = await loadTs('../src/modules/scenarioMods/stanceProfiles.ts');
  // 按事件出场频率排出的 top 缺口，补齐后应全部在册
  for (const name of ['秦桧', '谢艺', '武二郎', '云苍峰', '孟非卿', '苏荔', '云丹琉', '杨玉环', '祁远', '潘金莲', '殇侯', '李师师', '赵飞燕', '袁天罡', '鬼巫王']) {
    assert.ok(hasStanceProfile(name), `${name} 应有姿态档案`);
  }
  // 苏妲己：裁定 #113 冻结的是**收编弧线**（她被收服的三幕过程），不是人物本身——
  // registry 常规字段照常可用。故她可入册，但档案必须守住留白，不得写出弧线终局。
  assert.ok(hasStanceProfile('苏妲己'), '主要女性需覆盖；冻结的是弧线不是人物');
  const sdj = STANCE_PROFILES.find(p => p.names.includes('苏妲己'));
  const sdjLines = [...sdj.constant, ...Object.values(sdj.bands).flat()];
  assert.ok(sdjLines.some(l => /留白|不得续写/.test(l)), '必须显式声明弧线留白');
  // 检查终局词时必须排除**所有禁令行**：禁令要写出"不得臣服/归顺""收编弧线留白"
  // 才能禁掉它们，否则禁令自己会命中禁词检测（本测试已因此返工两次）。
  const sdjBody = sdjLines.filter(l => !/不得|留白/.test(l)).join('');
  assert.ok(!/(收编|臣服|归顺|收服)/.test(sdjBody), '禁令之外不得写出被收服的终局');
  assert.match(sdjBody, /拉锯/, '关系形态应停在正典原文的「拉锯」');
  // 别名要能命中
  assert.ok(hasStanceProfile('贾诩') && hasStanceProfile('龙骥') && hasStanceProfile('武二'));
  assert.ok(STANCE_PROFILES.length >= 21);
});

test('有出场的主要女性角色全部有姿态档案（用户要求的覆盖面）', async () => {
  const fs = await import('node:fs');
  const path = new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url);
  const registry = JSON.parse(fs.readFileSync(path, 'utf8'));
  const { hasStanceProfile } = await loadTs('../src/modules/scenarioMods/stanceProfiles.ts');

  // 出场 = 出现在事件的 relatedCharacterIds 里；只有出场角色才会被 focus 并注入姿态
  const present = new Set();
  for (const file of fs.readdirSync(new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url))) {
    if (!file.endsWith('.json')) continue;
    const raw = fs.readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${file}`, import.meta.url), 'utf8');
    for (const m of raw.matchAll(/"relatedCharacterIds"\s*:\s*\[([^\]]*)\]/g)) {
      for (const id of m[1].matchAll(/"([^"]+)"/g)) present.add(id[1]);
    }
  }
  const missing = registry.characters
    .filter(c => c.tier === '主要' && c.gender === '女' && present.has(c.id))
    .map(c => c.canonicalName)
    .filter(name => !hasStanceProfile(name));
  assert.deepEqual(missing, [], `有出场却缺姿态档案的主要女性：${missing.join('、')}`);
});

test('所有档案的高档形态两两不雷同（本功能的存在理由）', async () => {
  const { STANCE_PROFILES } = await loadTs('../src/modules/scenarioMods/stanceProfiles.ts');
  const highs = STANCE_PROFILES
    .filter(p => p.bands.high)
    .map(p => ({ name: p.names[0], text: p.bands.high.join('') }));
  assert.ok(highs.length >= 20, '绝大多数角色都应写明高档形态');
  for (let i = 0; i < highs.length; i += 1) {
    for (let j = i + 1; j < highs.length; j += 1) {
      assert.notEqual(highs[i].text, highs[j].text, `${highs[i].name} 与 ${highs[j].name} 高档形态完全相同`);
      // 粗粒度趋同检测：按二字片段算重合度，过高说明写成了同一套话术
      const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, k) => s.slice(k, k + 2)));
      const a = grams(highs[i].text); const b = grams(highs[j].text);
      const inter = [...a].filter(g => b.has(g)).length;
      const jac = inter / (a.size + b.size - inter);
      assert.ok(jac < 0.5, `${highs[i].name} 与 ${highs[j].name} 高档形态雷同度过高（${jac.toFixed(2)}）`);
    }
  }
});

test('每份档案都有本色锚，且不得为空壳', async () => {
  const { STANCE_PROFILES } = await loadTs('../src/modules/scenarioMods/stanceProfiles.ts');
  for (const p of STANCE_PROFILES) {
    assert.ok(p.constant.length >= 2, `${p.names[0]} 本色锚过少`);
    assert.ok(p.constant.every(l => l.length >= 12), `${p.names[0]} 本色锚有空话`);
    assert.ok(Object.keys(p.bands).length >= 1, `${p.names[0]} 至少要写一档形态`);
  }
});

test('杨玉环高档：逃是过程不是结论，但仍不得从容献身', async () => {
  // 缺陷史：初版把"真凑近就逃"写成高档的**结论**，等于把她钉死在长弧起点，
  // 与 intimacyProfiles 的 bonded 层「被压制后动情，长弧终点是究极尤物」直接打架——
  // 好感 80+ 时两个注入会同时出现，互相矛盾。
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('杨玉环', { favorability: 85 });
  assert.match(high, /逃.{0,4}是过程不是结论/, '必须写明逃不是结论');
  assert.ok(high.includes('允许被压制后动情'), '高档须与亲密档案 bonded 层衔接');
  assert.ok(high.includes('不是从容接受'), '节奏铁律：不得从容献身');
  assert.ok(high.includes('不得写她从容献身'), '铁律须在本色锚，任何档位都注入');
  // 低档回到弧线起点
  const low = formatRelationStance('杨玉环', { favorability: -50 });
  assert.ok(low.includes('逃得干脆决绝'), '低档应退回起点的逃跑节奏');
  assert.ok(low.includes('不得写她从容献身'), '铁律在低档同样注入');
});

test('李师师的正典硬边界（无肉体关系）写进本色锚', async () => {
  const { formatRelationStance } = await stancePromise;
  const high = formatRelationStance('李师师', { favorability: 90 });
  assert.match(high, /未发生肉体关系|精神之恋/, '硬边界必须在任何档位注入');
  assert.ok(high.includes('停在精神层面'), '高档须显式收住');
});

test('小紫的玉盏铃花诅咒与五灵石暗线必须在 hardLimits（主线承重）', async () => {
  // 裁定 #84 + ENDING-BLUEPRINT §48-49：她保留元红不是矜持，是与她交合的男子必丧魂成傀儡，
  // 且不以她的意志为转移；解法是五灵石（正文 3/5），四颗则改寄主。这条是后续主线暗线的锚，
  // 此前 intimacyProfiles 完全没有，等于把她最核心的动机与一整条暗线悬空。
  const { INTIMACY_PROFILES } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const xz = INTIMACY_PROFILES.find(p => p.names.includes('小紫'));
  const limits = xz.hardLimits.join('');
  assert.match(limits, /玉盏铃花/, '诅咒来源必须点名');
  assert.match(limits, /丧魂|傀儡/, '后果必须写明');
  assert.match(limits, /不以她的意志为转移|想放过主角也做不到/, '必须写明她无法自主豁免');
  assert.match(limits, /五灵石/, '解法暗线必须在案');
  assert.match(limits, /四颗/, '四颗改寄主的悲剧岔路必须保留');
  // 「不是她的主观意愿」由上面那条 /不以她的意志为转移/ 断言覆盖。
  // 这里不再加禁词检测——禁令文本本身要写出禁词才能禁它，会自己命中（本文件已因此返工四次）。
});

test('凤凰宝典两人的势力级利害必须在 hardLimits', async () => {
  // 破身不只是个人后果：凤凰宝典是光明观堂对抗黑魔海的战力根基，潘金莲是本代候选者，
  // 大祭高潮「程宗扬 vs 潘金莲」整条对决线系于此（ENDING-BLUEPRINT §52）。
  const { INTIMACY_PROFILES } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const pan = INTIMACY_PROFILES.find(p => p.names.includes('潘金莲')).hardLimits.join('');
  assert.match(pan, /光明观堂/, '须点明所属势力');
  assert.match(pan, /候选者/, '须点明她是本代候选者');
  assert.match(pan, /对决线随之落空|失去出战资格/, '须写明破身的势力级后果');
  const le = INTIMACY_PROFILES.find(p => p.names.includes('乐明珠')).hardLimits.join('');
  assert.match(le, /光明观堂/, '乐明珠同为观堂资产');
  assert.match(le, /第七重|上限/, '须写明修为封顶的具体后果');
});

test('吕雉的破界后果与证据强度限定必须在 hardLimits', async () => {
  // 正典只给了两个结论词（"反噬吸干""开封筹码"），没给机制细节，反噬承受方未明确。
  // 与小紫的玉盏铃花（作者后记背书 + 五灵石解法 + 进度 3/5）证据强度差一档，
  // 故档案须显式限定"不得演出破界及其后果"，避免 LLM 拿两个词自行发挥。
  const { INTIMACY_PROFILES } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const lv = INTIMACY_PROFILES.find(p => p.names.includes('吕雉')).hardLimits.join('');
  assert.match(lv, /反噬吸干/, '正典结论一必须在案');
  assert.match(lv, /开封/, '正典结论二（预留的未来事件）必须在案');
  assert.match(lv, /不得自行演出/, '未落定的部分须禁止模型自行补完');
  // 用户 2026-08-15 定性：她交出筹码必然是达成重大交易，不是轻易给出。
  // "贸然"是限定词——反噬惩罚的是绕过她意志的强取，不是这件事本身。
  assert.match(lv, /交易门槛|重大交易/, '须写明这是交易而非诅咒');
  assert.match(lv, /飞羽族存续|族群存续/, '对价必须锚在她唯一的动机上');
  // 最要紧的一条：好感阶梯与姿态层是好感驱动的，必须显式切断"好感高＝顺理成章"
  assert.match(lv, /好感度不是触发条件/, '好感不得成为触发条件');
  assert.match(lv, /水到渠成|顺理成章/, '须点名并否定这两种典型误写');
  // 临时兜底（用户 2026-08-15）：求欢不会答应；强行推进＝反噬吸干主角＝游戏结束。
  // 反噬承受方由此定为主角，与小紫"交合者丧魂"形成对称。
  assert.match(lv, /游戏结束/, '临时兜底后果须明确到游戏结束');
  assert.match(lv, /主角被吸干|吸干.*主角|承受方就是主角/, '反噬承受方须写明是主角');
  assert.match(lv, /TODO|待补/, '交易线未设计前须保留待补标记');
});

test('无专属档案的角色回落通用五维，不报错', async () => {
  const { formatRelationStance } = await stancePromise;
  const text = formatRelationStance('某路人甲', { favorability: 50 });
  assert.ok(!text.includes('·本人姿态形态·优先'), '不应有专属形态块');
  assert.ok(text.includes('主动披露深度'), '通用五维仍在');
});

test('通用不变量显式禁止"高好感=温柔化"', async () => {
  const { formatRelationStance } = await stancePromise;
  const text = formatRelationStance('某路人甲', { favorability: 90 });
  assert.match(text, /严禁把高好感写成通用的温柔化／恋爱脑／有求必应/);
});

test('姿态可由外部传入以覆盖瞬时投影（供滞回接线）', async () => {
  const { formatRelationStance } = await stancePromise;
  const forced = formatRelationStance('贾文和', { favorability: 90, stance: 'low' });
  assert.ok(forced.includes('不等于失去智性或机械敌对'), '应使用传入姿态而非好感瞬时值');
  assert.ok(forced.includes('生死'), '档位名仍反映真实好感');
});
