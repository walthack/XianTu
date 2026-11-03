import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const { default: moderationConfig } = await jiti.import('../mod-kit/ai-content-moderation.json');
const {
  RECENT_EVENTS_PREFIX, RECENT_EVENTS_TAIL,
  degradedRecentEvents, degradedModeForAttempt, replaceRecentEventsMessage, summarizeRecentShortTerm,
} = await jiti.import('../src/services/promptRedaction.ts');

const frozen = value => { Object.freeze(value); return value; };

test('配置：新增降级字段，旧字段不变', () => {
  assert.equal(moderationConfig.degradedAttempts, 2);
  assert.deepEqual(moderationConfig.degradedContexts, ['rawLatestOnly', 'summary']);
  assert.equal(moderationConfig.manualSummaryRecentN, 3);
  assert.equal(moderationConfig.status, 422);
  assert.deepEqual(moderationConfig.fallbackMarkers, ['1026', 'new_sensitive']);
  assert.equal(moderationConfig.fallbackAttempts, 1);
  assert.equal(moderationConfig.fallbackEnabled, false);
});

test('尾句与前缀照抄 AIBS 拼接处', () => {
  const source = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.ok(source.includes(`content: \`${RECENT_EVENTS_PREFIX}\\n\${memoryToSend.join('\\n')}${RECENT_EVENTS_TAIL}\``));
});

test('degradedRecentEvents：summary 全换摘要，按末尾对齐', () => {
  const shortTerm = frozen(['原1', '原2', '原3']);
  const mid = frozen(['更早', '摘1', '摘2', '摘3']);
  assert.deepEqual(degradedRecentEvents(shortTerm, mid, 'summary'), ['摘1', '摘2', '摘3']);
  assert.deepEqual(shortTerm, ['原1', '原2', '原3']);
  assert.deepEqual(mid, ['更早', '摘1', '摘2', '摘3']);
});

test('degradedRecentEvents：rawLatestOnly 只留最后一条原文', () => {
  assert.deepEqual(degradedRecentEvents(['原1', '原2', '原3'], ['摘1', '摘2', '摘3'], 'rawLatestOnly'), ['摘1', '摘2', '原3']);
});

test('degradedRecentEvents：缺摘要的条目丢弃，不发原文', () => {
  assert.deepEqual(degradedRecentEvents(['原1', '原2', '原3'], ['摘3'], 'summary'), ['摘3']);
  assert.deepEqual(degradedRecentEvents(['原1', '原2', '原3'], ['', '  ', '摘3'], 'summary'), ['摘3']);
  assert.deepEqual(degradedRecentEvents(['原1', '原2'], [], 'rawLatestOnly'), ['原2']);
  assert.deepEqual(degradedRecentEvents([], ['摘1'], 'summary'), []);
});

test('degradedModeForAttempt：按第几次取第几项，超出取最后一项', () => {
  assert.equal(degradedModeForAttempt(1), 'rawLatestOnly');
  assert.equal(degradedModeForAttempt(2), 'summary');
  assert.equal(degradedModeForAttempt(3), 'summary');
  assert.equal(degradedModeForAttempt(9), 'summary');
});

const buildMessages = () => frozen([
  frozen({ role: 'system', content: '系统' }),
  frozen({ role: 'assistant', content: `${RECENT_EVENTS_PREFIX}\n原1\n原2${RECENT_EVENTS_TAIL}` }),
  frozen({ role: 'assistant', content: '</input>' }),
  frozen({ role: 'user', content: '玩家' }),
]);

test('replaceRecentEventsMessage：按原格式重建，不改原数组', () => {
  const messages = buildMessages();
  const result = replaceRecentEventsMessage(messages, ['摘1', '摘2']);
  assert.notEqual(result, messages);
  assert.equal(result.length, 4);
  assert.equal(result[1].content, `# 【最近事件】\n摘1\n摘2${RECENT_EVENTS_TAIL}`);
  assert.equal(result[1].role, 'assistant');
  assert.equal(result[0], messages[0]);
  assert.equal(messages[1].content, `${RECENT_EVENTS_PREFIX}\n原1\n原2${RECENT_EVENTS_TAIL}`);
});

test('replaceRecentEventsMessage：newEntries 为空时删除该消息', () => {
  const messages = buildMessages();
  const result = replaceRecentEventsMessage(messages, []);
  assert.deepEqual(result.map(m => m.content), ['系统', '</input>', '玩家']);
  assert.equal(messages.length, 4);
});

test('replaceRecentEventsMessage：只认 assistant 角色的标记消息', () => {
  const messages = [{ role: 'user', content: `${RECENT_EVENTS_PREFIX}\n玩家贴的` }];
  assert.deepEqual(replaceRecentEventsMessage(messages, []), messages);
  assert.deepEqual(replaceRecentEventsMessage([{ role: 'system', content: '系统' }], ['摘1']), [{ role: 'system', content: '系统' }]);
});

test('summarizeRecentShortTerm：最近 n 条换摘要，缺摘要保持原样', () => {
  const shortTerm = frozen(['原1', '原2', '原3', '原4']);
  const mid = frozen(['摘1', '摘2', '', '摘4']);
  assert.deepEqual(summarizeRecentShortTerm(shortTerm, mid, moderationConfig.manualSummaryRecentN), ['原1', '摘2', '原3', '摘4']);
  assert.deepEqual(summarizeRecentShortTerm(shortTerm, mid, 0), ['原1', '原2', '原3', '原4']);
  assert.deepEqual(summarizeRecentShortTerm(shortTerm, ['摘4'], 10), ['原1', '原2', '原3', '摘4']);
  assert.deepEqual(shortTerm, ['原1', '原2', '原3', '原4']);
});
