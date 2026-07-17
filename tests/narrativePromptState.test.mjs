import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('narrative prompt state removes duplicated scenario canon and event bodies but keeps runtime progress', async () => {
  const { buildNarrativePromptState } = await loadTs('../src/utils/narrativePromptState.ts');
  const save = {
    角色: { 身份: { 名字: '程宗扬' } },
    世界: {
      信息: { 世界名称: '六朝' },
      状态: {
        天气: '雨',
        剧本模组: {
          modId: 'lyg.dingtao_beijing',
          currentChapterId: 'chapter.opening',
          flags: { event: { s01_07: { done: true } } },
          activeEventIds: ['lyg.event.s01_08', 'lyg.event.highlight_banchao_lamb_leg'],
          completedEventIds: ['lyg.event.s01_07'],
          canon: { characters: [{ id: 'np069', description: 'x'.repeat(20_000) }] },
          chapters: [{ id: 'chapter.opening', summary: 'x'.repeat(20_000) }],
          events: [{ id: 'lyg.event.s01_08', description: 'x'.repeat(20_000) }],
        },
      },
    },
  };

  const promptState = buildNarrativePromptState(save);
  const runtime = promptState.世界.状态.剧本模组;
  assert.equal(runtime.modId, 'lyg.dingtao_beijing');
  assert.deepEqual(runtime.activeEventIds, ['lyg.event.s01_08', 'lyg.event.highlight_banchao_lamb_leg']);
  assert.equal(runtime.flags.event.s01_07.done, true);
  assert.equal(runtime.canon, undefined);
  assert.equal(runtime.chapters, undefined);
  assert.equal(runtime.events, undefined);
  assert.ok(JSON.stringify(promptState).length < 10_000);
});
