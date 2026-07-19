import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/memorySanitizer.ts');
const PREFIX = '【仙道220年9月16日 10:30】';

test('负向:含 {"text": JSON 壳的正文入库前被拆壳(台账 #11 实例)', async () => {
  const { composeShortTermMemoryEntry } = await modPromise;
  const raw = '{"text":"【仙道220年9月16日 09:45】程宗扬走出长秋宫，秋日午后的阳光洒在他青衫上。"}';
  const entry = composeShortTermMemoryEntry(PREFIX, raw);
  assert.ok(!entry.includes('{"text"'), `JSON 壳未拆:${entry.slice(0, 60)}`);
  assert.ok(entry.includes('程宗扬走出长秋宫'), '正文内容丢失');
});

test('负向:拆壳后自带时间戳不重复叠加(防双戳)', async () => {
  const { composeShortTermMemoryEntry } = await modPromise;
  const raw = '{"text":"【仙道220年9月16日 09:45】程宗扬走出长秋宫。"}';
  const entry = composeShortTermMemoryEntry(PREFIX, raw);
  const stamps = (entry.match(/【仙道/g) || []).length;
  assert.equal(stamps, 1, `时间戳应恰 1 个,实得 ${stamps}:${entry.slice(0, 60)}`);
});

test('正常剧情文本原样保留并拼前缀', async () => {
  const { composeShortTermMemoryEntry } = await modPromise;
  const entry = composeShortTermMemoryEntry(PREFIX, '程宗扬按着腰间的刀柄，望向南方。');
  assert.equal(entry, `${PREFIX}程宗扬按着腰间的刀柄，望向南方。`);
});

test('思维链/空文本不入库', async () => {
  const { composeShortTermMemoryEntry } = await modPromise;
  assert.equal(composeShortTermMemoryEntry(PREFIX, ''), '');
  assert.equal(composeShortTermMemoryEntry(PREFIX, null), '');
});

test('旧存档记忆中的内部控制协议在回读时被清除', async () => {
  const { sanitizePersistedMemoryEntry } = await loadTs('../src/utils/memorySanitizer.ts');
  assert.equal(
    sanitizePersistedMemoryEntry('【贾文和·高智行为硬合同】他展开绢图。'),
    '他展开绢图。',
  );
  assert.equal(
    sanitizePersistedMemoryEntry('`【世界留钩】正文结尾必须留下1-2个来自世界自身的新动静（信息、异动、NPC议程、风险或机会窗口）。`'),
    '',
  );
});
