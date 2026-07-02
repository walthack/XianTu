import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

test('builds action gate prompt with active gates', async () => {
  const { buildActionGatePrompt } = await loadTs('../src/utils/actionGate.ts');
  const saveData = {
    系统: {
      历史: { 叙事: [{ content: 'a' }, { content: 'b' }] },
      扩展: {
        行动门控: {
          recent: [
            {
              actionLabel: '强行潜入仓库',
              outcome: 'failure',
              scope: 'location',
              target: '白湖商馆仓库',
              reason: '守卫已经警觉',
              effect: '重复潜入难度提高,需另寻入口',
              createdAtTurn: 1,
              ttlTurns: 3,
            },
          ],
        },
      },
    },
  };

  const prompt = buildActionGatePrompt(saveData);
  assert.match(prompt, /当前叙事回合:2/);
  assert.match(prompt, /强行潜入仓库/);
  assert.match(prompt, /不得原样推荐/);
  assert.match(prompt, /系统\.扩展\.行动门控\.recent/);
});

test('filters and prunes expired action gates', async () => {
  const { getActiveActionGates, pruneExpiredActionGates } = await loadTs('../src/utils/actionGate.ts');
  const saveData = {
    系统: {
      历史: { 叙事: [{}, {}, {}, {}, {}] },
      扩展: {
        行动门控: {
          recent: [
            {
              actionLabel: '硬闯正门',
              outcome: 'failure',
              scope: 'location',
              reason: '守卫围堵',
              effect: '正门短期不可行',
              createdAtTurn: 1,
              ttlTurns: 2,
            },
            {
              actionLabel: '再次劝说凝羽',
              outcome: 'partial',
              scope: 'npc',
              target: '凝羽',
              reason: '对方仍有戒心',
              effect: '需先提供新证据',
              createdAtTurn: 4,
              ttlTurns: 3,
            },
          ],
        },
      },
    },
  };

  const active = getActiveActionGates(saveData);
  assert.equal(active.length, 1);
  assert.equal(active[0].actionLabel, '再次劝说凝羽');

  const result = pruneExpiredActionGates(saveData);
  assert.equal(result.changed, true);
  assert.equal(saveData.系统.扩展.行动门控.recent.length, 1);
  assert.equal(saveData.系统.扩展.行动门控.recent[0].target, '凝羽');
});
