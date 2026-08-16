import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// 二级线入口锚：国家／地区线锚地点，宗派线锚人（用户裁定 2026-08-16）。
// 只验"接得到吗"，不验"加入了没有"——后者不归本模块。

// 规则：国家／地区线锚地点，宗派线锚人。
// 破例只有昭南一条——南荒没有可投的朝廷（麟趾／昭南城事件层从未抵达），
// 正典里进南荒必须有商队（冰蛊逼迫南行、与云苍峰商队同行），故锚在带路的人身上。
// 破例写成白名单而不是放松规则：多一条破例就得改这里，改不动就说明该重想。
const ANCHOR_RULE_EXEMPT_NATIONS = new Set(['zhaonan']);

test('两类线各用各的锚，破例只有白名单里那条', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  assert.equal(SECONDARY_LINES.length, 8, '八条线：宗派 3 ＋ 国家／地区 5');
  for (const line of SECONDARY_LINES) {
    if (line.kind === 'nation' && !ANCHOR_RULE_EXEMPT_NATIONS.has(line.id)) {
      assert.ok(line.anchorLocationIds?.length, `国家／地区线 ${line.name} 必须有地点锚`);
      assert.ok(!line.anchorCharacterIds, `国家／地区线 ${line.name} 不该用人物锚`);
    } else {
      assert.ok(line.anchorCharacterIds?.length, `${line.name} 必须有人物锚`);
      assert.ok(!line.anchorLocationIds, `${line.name} 不该用地点锚`);
    }
    assert.ok(line.basis && line.basis.length > 10, `${line.name} 缺锚的正典依据`);
  }
  assert.equal(SECONDARY_LINES.filter(l => l.kind === 'sect').length, 3);
  assert.equal(SECONDARY_LINES.filter(l => l.kind === 'nation').length, 5);

  // 破例必须在 basis 里讲明白，不能只是代码里悄悄换个字段
  for (const id of ANCHOR_RULE_EXEMPT_NATIONS) {
    const line = SECONDARY_LINES.find(l => l.id === id);
    assert.ok(line, `白名单里的 ${id} 不存在了，白名单该清理`);
    assert.match(line.basis, /破例/, `${line.name} 破例了却没在 basis 里说明理由`);
  }
});

test('锚不得落在被默认路线跳过的死 id 上', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 真正的死锚：只在隔离关出现、或 live 关查无。
  // ⚠ 不要把"某一关没有它"当死锚——liuchao.location.luoyang 曾被误列，
  // 它其实覆盖 24 关，只是抵达关 luoyang_cloud_secret 没有；那种应当"全收"而非排除。
  const deadLocationIds = new Set([
    'linan_city',                   // 只在隔离关 lyl.taiquan_expedition
    'lyg.location.changan',         // live 关查无
    'lcq.location.longchi',         // 太乙山门，只在 stage_01 注入
    'liuchao.location.longchi',
    'liuchao.location.xingyue_lake', // 只在 lyg.mijing_rumen 注入
  ]);
  for (const line of SECONDARY_LINES) {
    for (const id of line.anchorLocationIds || []) {
      assert.ok(!deadLocationIds.has(id), `${line.name} 的地点锚 ${id} 是已知死锚`);
    }
  }
});

test('地点锚：走到才算，走错地方不算', async () => {
  const { resolveAvailableLines } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const atLinan = resolveAvailableLines('liuchao.location.linan', {});
  assert.deepEqual(atLinan.map(l => l.id), ['song'], '在临安只该开宋国线');

  const nowhere = resolveAvailableLines('liuchao.location.not_a_place', {});
  assert.deepEqual(nowhere, [], '无关地点不该开任何线');

  const noLocation = resolveAvailableLines(undefined, {});
  assert.deepEqual(noLocation, [], '没有地点信息时不该开地点锚线');
});

test('人物锚：真的见过才算，只听过传闻不算', async () => {
  const { resolveAvailableLines } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');

  // 只听过传闻 → 不开
  const rumorOnly = resolveAvailableLines(undefined, {
    'liuchao.character.shang_zhen_yu': { characterId: 'liuchao.character.shang_zhen_yu', kind: 'rumored' },
  });
  assert.deepEqual(rumorOnly, [], '只听过传闻不该开线——否则"世上有这么个人"就能入教');

  // 真的见过 → 开
  const met = resolveAvailableLines(undefined, {
    'liuchao.character.shang_zhen_yu': { characterId: 'liuchao.character.shang_zhen_yu', kind: 'encountered' },
  });
  assert.deepEqual(met.map(l => l.id), ['heimohai'], '见过殇侯该开黑魔海线');
});

test('八骏任一见过即开星月湖', async () => {
  const { resolveAvailableLines, SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const line = SECONDARY_LINES.find(l => l.id === 'xingyuehu');
  assert.ok(line.anchorCharacterIds.length >= 2, '八骏该是多锚');
  // 月霜不在锚里：她是要护的人，不是引路人（用户裁定）
  assert.ok(!line.anchorCharacterIds.includes('lcq.character.yue_shuang'),
    '月霜不该当星月湖入口——她是要护的人，不是引你进门的人');

  for (const id of line.anchorCharacterIds) {
    const opened = resolveAvailableLines(undefined, { [id]: { characterId: id, kind: 'encountered' } });
    assert.ok(opened.some(l => l.id === 'xingyuehu'), `见过八骏成员 ${id} 应开星月湖线`);
  }
});

test('每条线都有入口指引，且说清"去哪／找谁"', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  for (const line of SECONDARY_LINES) {
    assert.ok(line.entryHint && line.entryHint.length >= 6, `${line.name} 缺入口指引`);
    // 指引必须点出锚：地点线要提地名，宗派线要提人名
    // 指引要对得上它实际用的锚：锚地就说去哪，锚人就说找谁／跟谁
    if (line.anchorLocationIds?.length) {
      assert.ok(/去|前往/.test(line.entryHint), `${line.name} 的指引没说去哪：${line.entryHint}`);
    } else {
      assert.ok(/找|同行|跟/.test(line.entryHint), `${line.name} 的指引没说找谁：${line.entryHint}`);
    }
  }
});

// 孪生 id：同一地方在不同关用不同 id，只填一个锚就只在那批关里响。
test('地点锚收齐孪生 id，覆盖该线全部关卡', async () => {
  const fs = await import('node:fs');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const dir = 'src/modules/scenarioMods/builtins/data/';

  // 统计每个地名在各关用的 id
  const byName = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    if (!j.scenario?.worldSimulation) continue;
    for (const l of j.canon?.locations || []) {
      (byName[l.name] ||= new Map()).set(l.id, (byName[l.name].get(l.id) || 0) + 1);
    }
  }

  const anchorNames = { han: '洛都', song: '临安', jin: '建康', tang: '长安' };
  for (const [lineId, placeName] of Object.entries(anchorNames)) {
    const line = SECONDARY_LINES.find(l => l.id === lineId);
    const variants = byName[placeName];
    assert.ok(variants, `地名 ${placeName} 在库里查无`);
    // 覆盖 ≥5 关的 id 必须被锚收下——漏了就会有整批关卡触发不了
    for (const [id, count] of variants) {
      if (count >= 5) {
        assert.ok(line.anchorLocationIds.includes(id),
          `${line.name} 漏收孪生 id ${id}（覆盖 ${count} 关），那批关卡里锚不会响`);
      }
    }
  }
});
