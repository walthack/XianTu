import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/narrativeStateReconciler.ts');

function baseSaveData() {
  return {
    角色: { 位置: { 描述: '芦苇小径', x: 500, y: 600, 灵气浓度: 20 } },
    社交: { 关系: {} },
  };
}

function deathRootSaveData() {
  return {
    ...baseSaveData(),
    角色: {
      ...baseSaveData().角色,
      身份: { 名字: '程宗扬', 灵根: { name: '生死根' } },
      效果: [],
    },
    元数据: { 时间: { 年: 220, 月: 1, 日: 2, 小时: 3, 分钟: 4 } },
  };
}

function npcAt(desc, coords = {}) {
  return { 当前位置: { 描述: desc, ...coords } };
}

function moveCmd(npc, loc) {
  return { action: 'set', key: `社交.关系.${npc}.当前位置`, value: loc };
}

test('reconciles player location from party npc locations', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000, 灵气浓度: 30 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000, 灵气浓度: 30 }), 孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '三艘小舟靠岸，众人鱼贯登岸，抵达荒废渔村。',
    commands: [moveCmd('小紫', loc), moveCmd('孟非卿', loc)],
  });

  assert.equal(changes.length, 1);
  assert.equal(saveData.角色.位置.描述, '荒废渔村');
  assert.equal(saveData.角色.位置.x, 1000);
  assert.equal(saveData.角色.位置.y, 2000);
});

test('does not move player for distant reported location', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '下游发现星月湖船队，正朝北驶去。',
    commands: [],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('does not duplicate location command when llm already set player location', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人登岸，抵达荒废渔村。',
    commands: [
      { action: 'set', key: '角色.位置', value: loc },
      moveCmd('小紫', loc),
      moveCmd('孟非卿', loc),
    ],
  });

  assert.equal(changes.length, 0);
});

test('does not move player when only one npc relocated', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '小紫独自登岸，抵达荒废渔村。',
    commands: [moveCmd('小紫', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('skips location reconcile when npc location has no coordinates', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村' };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村'), 孟非卿: npcAt('荒废渔村') };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人登岸，抵达荒废渔村。',
    commands: [moveCmd('小紫', loc), moveCmd('孟非卿', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('does not move player without a movement-completion keyword', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '两人在渔村外的芦苇丛中对峙，气氛紧绷。',
    commands: [moveCmd('小紫', loc), moveCmd('孟非卿', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('does not count non-set commands as moves', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人登岸，抵达荒废渔村。',
    commands: [
      { action: 'add', key: '社交.关系.小紫.当前位置', value: loc },
      { action: 'push', key: '社交.关系.孟非卿.当前位置', value: loc },
    ],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('does not patch when npcs were already at the destination (no real move)', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }) };
  // 移动前两人已在荒废渔村 → 本轮命令是幂等，不算真移动
  const before = baseSaveData();
  before.社交.关系 = { 小紫: npcAt('荒废渔村'), 孟非卿: npcAt('荒废渔村') };

  const changes = reconcileNarrativeState({
    saveDataBefore: before,
    saveData,
    text: '众人在荒废渔村中稍作休整，随后又抵达村口。',
    commands: [moveCmd('小紫', loc), moveCmd('孟非卿', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('rejects ambiguous multi-destination moves in the same turn', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const village = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const lake = { 描述: '星月湖', x: 3000, y: 4000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = {
    小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }),
    孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }),
    甲: npcAt('星月湖', { x: 3000, y: 4000 }),
    乙: npcAt('星月湖', { x: 3000, y: 4000 }),
  };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '两队分头行动，一队抵达荒废渔村，一队抵达星月湖。',
    commands: [moveCmd('小紫', village), moveCmd('孟非卿', village), moveCmd('甲', lake), moveCmd('乙', lake)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('does not move when destination is absent from the narrative', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 孟非卿: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人鱼贯登岸，抵达对岸。', // 未写出"荒废渔村"
    commands: [moveCmd('小紫', loc), moveCmd('孟非卿', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('skips when candidate npcs report disagreeing coordinates', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系 = {
    小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }),
    孟非卿: npcAt('荒废渔村', { x: 9999, y: 8888 }),
  };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人登岸，抵达荒废渔村。',
    commands: [
      moveCmd('小紫', { 描述: '荒废渔村', x: 1000, y: 2000 }),
      moveCmd('孟非卿', { 描述: '荒废渔村', x: 9999, y: 8888 }),
    ],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('settles stale xiaozi rescue goal after guihai heart takes effect', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.系统 = { 扩展: { 任务追踪: { 即兴目标: [{ 标题: '救治小紫' }, { 标题: '寻找安全落脚点' }] } } };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '归海之心的灵光渗入小紫神魂，离魂症终于缓解。',
    commands: [],
  });

  assert.equal(changes.length, 1);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, [{ 标题: '寻找安全落脚点' }]);
});

test('adds grounded cross-turn goals without inventing npc-specific follow-ups', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.系统 = { 扩展: { 任务追踪: { 即兴目标: [{ 标题: '寻找安全落脚点' }] } } };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '碧奴玉牌与星月湖船队再次共鸣，众人决定追查它与龙骥君的关联。',
    commands: [],
  });

  assert.equal(changes.length, 1);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, [
    { 标题: '寻找安全落脚点' },
    { 标题: '查清碧奴玉牌与星月湖船队、龙骥君的关联' },
  ]);
});

test('does not create improvised goals for local housekeeping', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.系统 = { 扩展: { 任务追踪: { 即兴目标: [] } } };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '众人清点物品、包扎伤口，又休息片刻。',
    commands: [],
  });

  assert.equal(changes.length, 0);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, []);
});

test('does not add a pursuit the narrative explicitly declines', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.系统 = { 扩展: { 任务追踪: { 即兴目标: [] } } };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '众人虽发现碧奴玉牌与星月湖船队共鸣，却决定暂不追查。',
    commands: [],
  });

  assert.equal(changes.length, 0);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, []);
});

test('explicit improvised-goal command takes precedence over deterministic fallback', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.系统 = { 扩展: { 任务追踪: { 即兴目标: [{ 标题: '护送伤员' }] } } };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '归海之心温养小紫神魂，离魂症已经缓解。',
    commands: [{ action: 'set', key: '系统.扩展.任务追踪.即兴目标', value: [{ 标题: '护送伤员' }] }],
  });

  assert.equal(changes.length, 0);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, [{ 标题: '护送伤员' }]);
});

test('deduplicates persisted improvised goals without deleting distinct over-cap goals', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.系统 = { 扩展: { 任务追踪: { 即兴目标: [
    { 标题: '寻找安全落脚点' },
    { 标题: '寻找安全落脚点。' },
    { 标题: '护送伤员' },
    { 标题: '查清旧账' },
    { 标题: '安葬遗骨' },
  ] } } };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '归海之心已到手并妥善封存。',
    commands: [],
  });

  assert.equal(changes.length, 1);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标.map((goal) => goal.标题), [
    '寻找安全落脚点', '护送伤员', '查清旧账', '安葬遗骨',
  ]);
});

test('fills missing xiaozi state from explicit guihai-heart recovery facts', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.小紫 = { 当前状态: '' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '小紫的神魂正受归海之心温养。小紫的离魂症已有缓解，呼吸也平稳下来。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.小紫.当前状态, '归海之心正温养神魂，离魂症已有缓解');
  assert.equal(changes.at(-1).key, '社交.关系.小紫.当前状态');
});

test('does not overwrite an existing xiaozi state', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.小紫 = { 当前状态: '正在静养' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '小紫的神魂正受归海之心温养，离魂症已有缓解。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.小紫.当前状态, '正在静养');
  assert.equal(changes.some(change => change.key === '社交.关系.小紫.当前状态'), false);
});

test('explicit npc state command takes precedence over party-state fallback', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.小紫 = { 当前状态: '' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '小紫的神魂正受归海之心温养，离魂症已有缓解。',
    commands: [{ action: 'set', key: '社交.关系.小紫.当前状态', value: '已由医者接手' }],
  });

  assert.equal(saveData.社交.关系.小紫.当前状态, '');
  assert.equal(changes.some(change => change.key === '社交.关系.小紫.当前状态'), false);
});

test('rejects negated party-state narration', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.小紫 = { 当前状态: '未记录' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '小紫的离魂症尚未缓解，归海之心也未能温养她的神魂。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.小紫.当前状态, '未记录');
  assert.equal(changes.some(change => change.key === '社交.关系.小紫.当前状态'), false);
});

test('writes a generic short status for an existing improvised npc', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.临时旅伴 = { 当前状态: '' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '临时旅伴根基受损，暂时不宜强战。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.临时旅伴.当前状态, '根基受损，暂不宜强战');
  assert.equal(changes.some(change => change.key === '社交.关系.临时旅伴.当前状态'), true);
});

test('does not apply xiaozi-specific canon wording to another npc', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.临时旅伴 = { 当前状态: '' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '归海之心正温养临时旅伴的神魂。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.临时旅伴.当前状态, '');
  assert.equal(changes.some(change => change.key === '社交.关系.临时旅伴.当前状态'), false);
});

test('does not create or patch a relationship introduced during the current turn', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveDataBefore = baseSaveData();
  const saveData = baseSaveData();
  saveData.社交.关系.新旅伴 = { 当前状态: '' };

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '新旅伴身受重伤，需要静养。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.新旅伴.当前状态, '');
  assert.equal(changes.some(change => change.key === '社交.关系.新旅伴.当前状态'), false);
  assert.deepEqual(saveDataBefore.社交.关系, {});
});

test('does not misread xiaozi as the recipient when she heals someone else', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.小紫 = { 当前状态: '' };
  const saveDataBefore = structuredClone(saveData);

  const changes = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '小紫催动归海之心温养临时旅伴的神魂。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.小紫.当前状态, '');
  assert.equal(changes.some(change => change.key === '社交.关系.小紫.当前状态'), false);
});

test('writes reviewed canon-specific statuses for major characters', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const cases = [
    ['小紫', '小紫已经入定闭关冲击五级。', '正在闭关冲击五级'],
    ['凝羽', '凝羽的冰蛊毒瘾再次发作，寒意侵体。', '冰蛊毒性发作，需以真阳压制'],
    ['月霜', '月霜的寒毒突然发作，身体冰冷战栗。', '寒毒发作，身体冰冷虚弱'],
    ['云如瑶', '云如瑶多年寒疾已被纯阳龙气彻底洗净。', '寒毒已化解'],
    ['赵飞燕', '赵飞燕中毒昏迷，众人正在设法救治。', '中毒昏迷，正在救治'],
    ['剑玉姬', '剑玉姬受创见血后易碎体质随即反噬失控。', '受创引发易碎体质反噬'],
    ['友通期', '友通期不言不笑失魂之后瘫痪不能动。', '失魂瘫痪，需长期照料'],
    ['齐羽仙', '齐羽仙全身精血近乎耗尽，已是唇裂血枯。', '精血近乎耗尽，极度虚弱'],
    ['俞子元', '俞子元失去一条腿，眼下仍在养伤康复。', '失去一腿，正在康复'],
    ['古格尔', '古格尔的左脸被烈焰焚毁。古格尔左眼已经失明。', '左脸烧伤，左眼失明'],
    ['徐君房', '徐君房的阴阳帐被毁后遭到反噬，需要静修。', '法宝损毁反噬，正在静修'],
    ['薛延山', '薛延山身中寒毒已经重伤濒死。', '身中寒毒，重伤濒危'],
    ['袁天罡', '袁天罡忽然流鼻血，怀疑暗处正有杀意针对自己。', '鼻血示警，预知自身正有凶险'],
  ];

  for (const [npc, text, expected] of cases) {
    const saveData = baseSaveData();
    saveData.社交.关系[npc] = { 当前状态: '' };
    const changes = reconcileNarrativeState({
      saveDataBefore: structuredClone(saveData),
      saveData,
      text,
      commands: [],
    });
    assert.equal(saveData.社交.关系[npc].当前状态, expected, npc);
    assert.equal(changes.some(change => change.key === `社交.关系.${npc}.当前状态`), true, npc);
  }
});

test('does not turn adjacent canon lore into a current status without an affirmed trigger', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.剑玉姬 = { 当前状态: '' };
  saveData.社交.关系.月霜 = { 当前状态: '' };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '众人谈起剑玉姬不能受伤的易碎体质，也回忆月霜昔年曾受寒毒困扰。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.剑玉姬.当前状态, '');
  assert.equal(saveData.社交.关系.月霜.当前状态, '');
  assert.equal(changes.some(change => change.key.endsWith('.当前状态')), false);
});

test('does not treat ordinary yuan-tiangang nosebleeds as a danger warning', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.袁天罡 = { 当前状态: '' };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '袁天罡见到美人后激动得流起鼻血，连忙找帕子擦拭。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.袁天罡.当前状态, '');
  assert.equal(changes.some(change => change.key === '社交.关系.袁天罡.当前状态'), false);
});

test('writes the target state when Ruan Xiangning explicitly applies her exclusive hypnosis', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = baseSaveData();
  saveData.社交.关系.阮香凝 = { 当前状态: '' };
  saveData.社交.关系.林冲 = { 当前状态: '' };

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '阮香凝对林冲施展瞑寂，林冲顿时如坠梦中，受人驱使而不自知。',
    commands: [],
  });

  assert.equal(saveData.社交.关系.阮香凝.当前状态, '');
  assert.equal(saveData.社交.关系.林冲.当前状态, '受瞑寂催眠，如坠梦中并受人驱使');
  assert.equal(changes.some(change => change.key === '社交.关系.林冲.当前状态'), true);
});

test('does not turn discussion or negation of Ruan Xiangning hypnosis into a target state', async () => {
  const { reconcileNarrativeState } = await modPromise;
  for (const text of [
    '阮香凝向林冲解释，瞑寂能使中术者如坠梦中。',
    '阮香凝并未对林冲施展瞑寂，林冲也没有陷入梦境。',
  ]) {
    const saveData = baseSaveData();
    saveData.社交.关系.阮香凝 = { 当前状态: '' };
    saveData.社交.关系.林冲 = { 当前状态: '' };
    const changes = reconcileNarrativeState({
      saveDataBefore: structuredClone(saveData),
      saveData,
      text,
      commands: [],
    });
    assert.equal(saveData.社交.关系.林冲.当前状态, '', text);
    assert.equal(changes.some(change => change.key === '社交.关系.林冲.当前状态'), false, text);
  }
});

test('does not create a hypnosis target or override an explicit target-state command', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveDataBefore = baseSaveData();
  saveDataBefore.社交.关系.阮香凝 = { 当前状态: '' };
  const saveData = structuredClone(saveDataBefore);
  saveData.社交.关系.林冲 = { 当前状态: '' };

  const introducedChanges = reconcileNarrativeState({
    saveDataBefore,
    saveData,
    text: '阮香凝对林冲施展瞑寂，林冲顿时如坠梦中，受人驱使而不自知。',
    commands: [],
  });
  assert.equal(saveData.社交.关系.林冲.当前状态, '');
  assert.equal(introducedChanges.some(change => change.key === '社交.关系.林冲.当前状态'), false);

  const existing = baseSaveData();
  existing.社交.关系.阮香凝 = { 当前状态: '' };
  existing.社交.关系.林冲 = { 当前状态: '' };
  const explicitChanges = reconcileNarrativeState({
    saveDataBefore: structuredClone(existing),
    saveData: existing,
    text: '阮香凝对林冲施展瞑寂，林冲顿时如坠梦中，受人驱使而不自知。',
    commands: [{ action: 'set', key: '社交.关系.林冲.当前状态', value: '已由模型明确记录' }],
  });
  assert.equal(existing.社交.关系.林冲.当前状态, '');
  assert.equal(explicitChanges.some(change => change.key === '社交.关系.林冲.当前状态'), false);
});

test('records death-root overload as a protected player effect', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = deathRootSaveData();

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '程宗扬以生死根吸纳大量死气，丹田气旋随即膨胀不稳。',
    commands: [],
  });

  assert.equal(saveData.角色.效果.length, 1);
  assert.equal(saveData.角色.效果[0].状态名称, '生死根·死气积聚');
  assert.equal(saveData.角色.效果[0].来源, '生死根叙事补账');
  assert.equal(changes.some(change => change.key === '角色.效果'), true);
});

test('death-root residual injury replaces overload and explicit resolution clears it', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const saveData = deathRootSaveData();
  saveData.角色.效果 = [{
    状态名称: '生死根·死气积聚',
    类型: 'debuff',
    生成时间: { 年: 220, 月: 1, 日: 1, 小时: 0, 分钟: 0 },
    持续时间分钟: 99999,
    状态描述: '旧状态',
    来源: '生死根叙事补账',
  }];

  reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '程宗扬体内死气已经全部消耗，但杂质残留令经脉重创。',
    commands: [],
  });
  assert.deepEqual(saveData.角色.效果.map(effect => effect.状态名称), ['生死根·杂质伤脉']);

  const changes = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '程宗扬终于将杂气全部炼化，丹田已经恢复如常。',
    commands: [],
  });
  assert.deepEqual(saveData.角色.效果, []);
  assert.equal(changes.some(change => change.key === '角色.效果'), true);
});

test('does not grant death-root effects to another player or duplicate an existing effect', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const other = deathRootSaveData();
  other.角色.身份.名字 = '沈砚';
  const otherChanges = reconcileNarrativeState({
    saveDataBefore: structuredClone(other),
    saveData: other,
    text: '沈砚吸纳大量死气，丹田气旋膨胀不稳。',
    commands: [],
  });
  assert.deepEqual(other.角色.效果, []);
  assert.equal(otherChanges.some(change => change.key === '角色.效果'), false);

  const saveData = deathRootSaveData();
  reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '程宗扬以生死根吸纳大量死气，丹田气旋膨胀不稳。',
    commands: [],
  });
  const duplicateChanges = reconcileNarrativeState({
    saveDataBefore: structuredClone(saveData),
    saveData,
    text: '程宗扬体内死气仍旧积聚，丹田持续不稳。',
    commands: [],
  });
  assert.equal(saveData.角色.效果.filter(effect => effect.状态名称 === '生死根·死气积聚').length, 1);
  assert.equal(duplicateChanges.some(change => change.key === '角色.效果'), false);
});
