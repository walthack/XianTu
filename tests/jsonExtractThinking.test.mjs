import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { parseJsonSmart, stripModelThinking } = await loadTs('../src/utils/jsonExtract.ts');

test('strips MiniMax think blocks before parsing JSON', () => {
  const response = '<think>先分析需要初始化哪些字段。</think>\n{"mid_term_memory":"开局","tavern_commands":[{"action":"set","key":"角色.属性.声望","value":0}],"action_options":["观察"]}';
  const parsed = parseJsonSmart(response, true);
  assert.equal(parsed.mid_term_memory, '开局');
  assert.equal(parsed.tavern_commands.length, 1);
});

test('strips common reasoning block variants', () => {
  assert.equal(stripModelThinking('<thinking>hidden</thinking>{"ok":1}'), '{"ok":1}');
  assert.equal(stripModelThinking('<analysis>hidden</analysis>{"ok":1}'), '{"ok":1}');
  assert.equal(stripModelThinking('<reasoning>hidden</reasoning>{"ok":1}'), '{"ok":1}');
  assert.equal(stripModelThinking('<thought>hidden</thought>{"ok":1}'), '{"ok":1}');
});
