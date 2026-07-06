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
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000, 灵气浓度: 30 }), 沧月: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '三艘小舟靠岸，众人鱼贯登岸，抵达荒废渔村。',
    commands: [moveCmd('小紫', loc), moveCmd('沧月', loc)],
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
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 沧月: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人登岸，抵达荒废渔村。',
    commands: [
      { action: 'set', key: '角色.位置', value: loc },
      moveCmd('小紫', loc),
      moveCmd('沧月', loc),
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
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村'), 沧月: npcAt('荒废渔村') };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '众人登岸，抵达荒废渔村。',
    commands: [moveCmd('小紫', loc), moveCmd('沧月', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});

test('does not move player without a movement-completion keyword', async () => {
  const { reconcileNarrativeState } = await modPromise;
  const loc = { 描述: '荒废渔村', x: 1000, y: 2000 };
  const saveData = baseSaveData();
  saveData.社交.关系 = { 小紫: npcAt('荒废渔村', { x: 1000, y: 2000 }), 沧月: npcAt('荒废渔村', { x: 1000, y: 2000 }) };

  const changes = reconcileNarrativeState({
    saveDataBefore: baseSaveData(),
    saveData,
    text: '两人在渔村外的芦苇丛中对峙，气氛紧绷。',
    commands: [moveCmd('小紫', loc), moveCmd('沧月', loc)],
  });

  assert.equal(changes.length, 0);
  assert.equal(saveData.角色.位置.描述, '芦苇小径');
});
