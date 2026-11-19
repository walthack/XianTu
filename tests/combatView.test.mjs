// 新界面场面卡摆法的纯函数：老卡上的简报（sceneBrief）拆成对手／我方／其余，一行字都不许丢、不许新造。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { combatView, COMBAT_FOE_MAX } = await loadTs('../src/components/uiNew/combatView.ts');
const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const mod = await loadTs('../src/modules/sceneModule/index.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');

function saveWith(c, mutate) {
  const s = createMinimalSaveDataV3();
  const state = mod.beginScene(c).state;
  mutate?.(state, c);
  const a = ext.newActive({ contractId: c.meta.id, eventId: 'e', actionId: 'a', playerLine: '', state, narrativeIndex: 0 });
  ext.writeExt(s, { ...ext.readExt(s), active: a });
  return { s, a };
}
const viewText = v => [v.objective, ...v.foes.map(f => `${f.name}：${f.status}`), ...v.ours, ...v.others].join('\n');
const runtime = s => s.世界?.状态?.剧本模组;

function assertCovers(c, mutate) {
  const { s, a } = saveWith(c, mutate);
  const brief = host.sceneBrief(s);
  const v = combatView(c, a, runtime(s));
  const text = viewText(v);
  for (const line of brief.split('\n')) {
    // 简报里「名字：档位」与「名字：状态」两行，在摆法里并成一方一行；逐段核对
    const parts = line.includes('：') && !/^(当前局势|可用)：/.test(line) ? [line.split('：')[0], ...line.split('：').slice(1).join('：').split('、')] : [line];
    for (const part of parts) assert.ok(text.includes(part), `${c.meta.id} 丢了「${part}」（简报行：${line}）`);
  }
  return v;
}

test('所有正式合同开场：简报每一行都在摆法里', () => {
  assert.ok(registry.SCENE_CONTRACTS.length > 5);
  for (const c of registry.SCENE_CONTRACTS) assertCovers(c);
});

test('挂状态、局势、离场：状态并进那一方的小字，离场者不画；不在场者的状态照列在其余', () => {
  const c = registry.SCENE_CONTRACTS.find(x => x.parties.filter(p => p.side === 'opposed').length >= 2 && x.statuses?.length);
  assert.ok(c, '要一个有两个以上对手且有状态表的合同');
  const foes = c.parties.filter(p => p.side === 'opposed');
  const v = assertCovers(c, state => {
    state.statuses[foes[0].id] = [{ id: c.statuses[0].id }];
    state.departed.push(foes[1].id);
    state.statuses[foes[1].id] = [{ id: c.statuses[0].id }];
    state.tags.push({ id: 't', label: '测试态势' });
  });
  assert.ok(v.foes[0].status.includes(c.statuses[0].label));
  assert.ok(!v.foes.some(f => f.id === foes[1].id), '离场者不画');
  assert.ok(v.others.some(l => l.endsWith('：' + c.statuses[0].label)), '离场者的状态照列');
  assert.ok(v.others.includes('当前局势：测试态势'));
});

test('我方：玩家本人在前；对手按预览 targets 标被针对；倒下（hpDowned）变暗', () => {
  const c = registry.SCENE_CONTRACTS.find(x => x.parties.some(p => p.side === 'player_side' && !p.player) && x.parties.filter(p => p.side === 'opposed').length >= 2);
  assert.ok(c);
  const foes = c.parties.filter(p => p.side === 'opposed');
  const { s, a } = saveWith(c, state => { state.hpDowned = { [foes[1].id]: true }; });
  a.pending = { preview: { targets: [{ party: foes[0].id }] } };
  const v = combatView(c, a, runtime(s));
  assert.equal(v.ours.length, c.parties.filter(p => p.side === 'player_side' && (a.state.present[p.id] !== false && !p.absent || a.state.present[p.id] === true)).length);
  assert.ok(v.ours[0].startsWith(host.sceneBrief(s).split('\n').find(l => v.ours[0].startsWith(l.split('：')[0])).split('：')[0]));
  assert.deepEqual(v.foes.map(f => [f.targeted, f.downed]).slice(0, 2), [[true, false], [false, true]]);
  assert.equal(v.beat, 1);
  assert.equal(COMBAT_FOE_MAX, 4);
});
