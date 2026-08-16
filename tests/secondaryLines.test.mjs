import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// 二级线入口锚：国家／地区线锚地点，宗派线锚人（用户裁定 2026-08-16）。
// 只验"接得到吗"，不验"加入了没有"——后者不归本模块。

test('两类线各用各的锚，不混用', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  assert.equal(SECONDARY_LINES.length, 8, '八条线：宗派 3 ＋ 国家／地区 5');
  for (const line of SECONDARY_LINES) {
    if (line.kind === 'nation') {
      assert.ok(line.anchorLocationId, `国家／地区线 ${line.name} 必须有地点锚`);
      assert.ok(!line.anchorCharacterIds, `国家／地区线 ${line.name} 不该用人物锚`);
    } else {
      assert.ok(line.anchorCharacterIds?.length, `宗派线 ${line.name} 必须有人物锚`);
      assert.ok(!line.anchorLocationId, `宗派线 ${line.name} 不该用地点锚`);
    }
    assert.ok(line.basis && line.basis.length > 10, `${line.name} 缺锚的正典依据`);
  }
  assert.equal(SECONDARY_LINES.filter(l => l.kind === 'sect').length, 3);
  assert.equal(SECONDARY_LINES.filter(l => l.kind === 'nation').length, 5);
});

test('锚不得落在被默认路线跳过的死 id 上', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 实测的孪生死锚：选错 id 名字对、触发器不响
  const deadLocationIds = new Set([
    'liuchao.location.lin_an',      // 只在隔离关 lyl.lin_an_black_sea
    'linan_city',                   // 只在隔离关 lyl.taiquan_expedition
    'lyg.location.changan',         // live 关查无
    'liuchao.location.luoyang',     // atlas 孪生，抵达关不在场
    'lcq.location.longchi',         // 太乙山门，只在 stage_01 注入
    'liuchao.location.longchi',
    'liuchao.location.xingyue_lake', // 只在 lyg.mijing_rumen 注入
  ]);
  for (const line of SECONDARY_LINES) {
    if (line.anchorLocationId) {
      assert.ok(!deadLocationIds.has(line.anchorLocationId),
        `${line.name} 的地点锚 ${line.anchorLocationId} 是已知死锚`);
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
