import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('current rejected-command key renders actionable validation details', async () => {
  const { formatStateChanges } = await loadTs('../src/utils/stateChangeFormatter.ts');
  const formatted = formatStateChanges({
    changes: [{
      key: '❌ 无效指令（已拒绝）',
      action: 'validation_error',
      oldValue: undefined,
      newValue: {
        command: '{"action":"set","key":"世界.状态.剧本模组.flags.event.future.done","value":true}',
        errors: ['不得越级完成非当前章节/活跃事件'],
      },
    }],
  });

  assert.equal(formatted.changes[0].title, '❌ AI指令格式错误');
  assert.match(formatted.changes[0].details.join('\n'), /不得越级完成/);
  assert.match(formatted.changes[0].details.join('\n'), /flags\.event\.future\.done/);
});
