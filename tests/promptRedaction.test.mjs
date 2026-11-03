import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const { default: moderationConfig } = await jiti.import('../mod-kit/ai-content-moderation.json');
const {
  RECENT_EVENTS_PREFIX, RECENT_EVENTS_TAIL,
  degradedRecentEvents, degradedModeForAttempt, replaceRecentEventsMessage, summarizeRecentShortTerm, summarizeMemoryShortTerm,
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

test('summarizeMemoryShortTerm：存档短期记忆最近 N 条（N 读配置）换摘要，历史.叙事不动，缺摘要保持原样', () => {
  const narrative = [{ 类型: 'gm', 内容: '原1正文' }, { 类型: 'gm', 内容: '原4正文' }];
  const save = {
    社交: { 记忆: { 短期记忆: ['原1', '原2', '原3', '原4'], 隐式中期记忆: ['摘1', '摘2', '', '摘4'], 中期记忆: ['中1'] } },
    系统: { 历史: { 叙事: narrative } },
  };
  const narrativeBefore = JSON.stringify(save.系统.历史.叙事);
  const { shortTerm, replaced } = summarizeMemoryShortTerm(save.社交.记忆);
  assert.deepEqual(shortTerm, ['原1', '摘2', '原3', '摘4']);
  assert.equal(replaced, 2);
  assert.deepEqual(save.社交.记忆.短期记忆, ['原1', '原2', '原3', '原4'], '入参不改，写回由调用方做');
  save.社交.记忆.短期记忆 = shortTerm;
  assert.equal(JSON.stringify(save.系统.历史.叙事), narrativeBefore);
  assert.equal(save.系统.历史.叙事, narrative);
  assert.deepEqual(save.社交.记忆.隐式中期记忆, ['摘1', '摘2', '', '摘4']);
});

test('summarizeMemoryShortTerm：全缺摘要或无记忆时不换（replaced=0）', () => {
  assert.deepEqual(summarizeMemoryShortTerm({ 短期记忆: ['原1', '原2'], 隐式中期记忆: [] }), { shortTerm: ['原1', '原2'], replaced: 0 });
  assert.deepEqual(summarizeMemoryShortTerm({ 短期记忆: ['原1'], 隐式中期记忆: ['  '] }), { shortTerm: ['原1'], replaced: 0 });
  assert.deepEqual(summarizeMemoryShortTerm(null), { shortTerm: [], replaced: 0 });
});

test('记忆中心按钮：确认后调 summarizeMemoryShortTerm，只写回短期记忆、走 saveCurrentGame，不碰历史.叙事', () => {
  const source = readFileSync(new URL('../src/components/dashboard/MemoryCenterPanel.vue', import.meta.url), 'utf8');
  const start = source.indexOf('const summarizeRecentShortTermMemories');
  const body = source.slice(start, source.indexOf('\n};\n', start));
  assert.ok(start > 0 && source.includes('@click="summarizeRecentShortTermMemories"'));
  assert.ok(source.includes('const manualSummaryRecentN = moderationConfig.manualSummaryRecentN;'));
  assert.match(body, /uiStore\.showRetryDialog\(/);
  assert.match(body, /summarizeMemoryShortTerm\(memory, manualSummaryRecentN\)/);
  assert.match(body, /memory\.短期记忆 = shortTerm;/);
  assert.match(body, /characterStore\.saveCurrentGame\(\)/);
  assert.doesNotMatch(body, /历史\.叙事|\.叙事\s*=|系统\./);
  assert.doesNotMatch(body.replace(/'[^']*'/g, "''"), /\b\d+\b(?<!\b0)/, '不写魔数');
});

// 设定分层 §二第 3 条：降级重发时 NPC 记忆只带最近 memory.npcDegradedPromptLimit 条（条数进配置，不硬编码）。
const { NARRATIVE_STATE_PREFIX, limitDegradedNpcMemories } = await jiti.import('../src/services/promptRedaction.ts');
const { default: promptLayersConfig } = await jiti.import('../mod-kit/prompt-layers.json');
const stateMessage = (state, head = '系统规则\n') => ({ role: 'system', content: `${head}${NARRATIVE_STATE_PREFIX}${JSON.stringify(state)}` });
const parseState = message => JSON.parse(message.content.slice(message.content.lastIndexOf(NARRATIVE_STATE_PREFIX) + NARRATIVE_STATE_PREFIX.length));

test('NPC 记忆降级：状态 JSON 前缀照抄 AIBS 拼接处', () => {
  const source = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.ok(source.includes(`\n${NARRATIVE_STATE_PREFIX}\${stateJsonString}\n\`.trim();`));
});

test('NPC 记忆降级：默认条数取配置 npcDegradedPromptLimit，每个 NPC 留最近几条，其余字段与消息不动', () => {
  assert.equal(promptLayersConfig.memory.npcDegradedPromptLimit, 1);
  const state = frozen({
    角色: { 名字: '主角' },
    社交: { 关系: {
      a: { 名字: '甲', 好感度: 30, 记忆: ['旧一', '旧二', '最新甲'] },
      b: { 名字: '乙', 记忆: ['仅一条'] },
      c: { 名字: '丙' },
    }, 宗门: { x: 1 } },
  });
  const user = frozen({ role: 'user', content: '观察' });
  const original = frozen([stateMessage(state), user]);
  const snapshot = JSON.stringify(original);
  const out = limitDegradedNpcMemories(original);
  assert.equal(JSON.stringify(original), snapshot, '不改原消息');
  assert.equal(out[1], user);
  assert.ok(out[0].content.startsWith(`系统规则\n${NARRATIVE_STATE_PREFIX}`));
  const limited = parseState(out[0]);
  const n = promptLayersConfig.memory.npcDegradedPromptLimit;
  assert.deepEqual(limited.社交.关系.a.记忆, ['旧一', '旧二', '最新甲'].slice(-n));
  assert.deepEqual(limited.社交.关系.b.记忆, ['仅一条']);
  assert.equal(limited.社交.关系.a.好感度, 30);
  assert.deepEqual({ ...limited, 社交: { ...limited.社交, 关系: null } }, { ...state, 社交: { ...state.社交, 关系: null } });
  // 显式条数：按参数裁，条目文字不改。
  assert.deepEqual(parseState(limitDegradedNpcMemories(original, 2)[0]).社交.关系.a.记忆, ['旧二', '最新甲']);
});

test('NPC 记忆降级：无可裁、非 system、无标记、JSON 不完整、坏条数时原样返回', () => {
  const short = stateMessage({ 社交: { 关系: { a: { 记忆: ['一'] } } } });
  assert.equal(limitDegradedNpcMemories([short])[0], short);
  const asUser = { role: 'user', content: stateMessage({ 社交: { 关系: { a: { 记忆: ['一', '二'] } } } }).content };
  assert.equal(limitDegradedNpcMemories([asUser])[0], asUser);
  const plain = { role: 'system', content: '系统夹具' };
  assert.equal(limitDegradedNpcMemories([plain])[0], plain);
  const broken = { role: 'system', content: `${NARRATIVE_STATE_PREFIX}{"社交":{"关系":{"a":{"记忆":["一","二"]}}}}\n尾巴` };
  assert.equal(limitDegradedNpcMemories([broken])[0], broken);
  const many = stateMessage({ 社交: { 关系: { a: { 记忆: ['一', '二', '三'] } } } });
  for (const bad of [0, -1, 1.5, Number.NaN]) assert.equal(limitDegradedNpcMemories([many], bad)[0], many, `坏条数 ${bad}`);
});

const { LEGACY_SPLIT_STATE_PREFIX } = await jiti.import('../src/services/promptRedaction.ts');
const legacyStateMessage = (state, head = '分步规则\n') => ({ role: 'system', content: `${head}${LEGACY_SPLIT_STATE_PREFIX}${JSON.stringify(state)}` });

test('NPC 记忆降级（旧分步路径）：状态标题照抄 AIBS buildSplitSystemPrompt', () => {
  const source = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.ok(source.includes(`\n${LEGACY_SPLIT_STATE_PREFIX}\${stateJsonString}\n\`.trim();`));
});

test('NPC 记忆降级（旧分步路径）：同一配置条数裁每个 NPC 记忆，标题前正文与其他字段不动', () => {
  const state = frozen({
    角色: { 名字: '主角' },
    社交: { 关系: {
      a: { 名字: '甲', 好感度: 30, 记忆: ['旧一', '旧二', '最新甲'] },
      b: { 名字: '乙', 记忆: ['仅一条'] },
    } },
  });
  const original = frozen([legacyStateMessage(state)]);
  const snapshot = JSON.stringify(original);
  const out = limitDegradedNpcMemories(original);
  assert.equal(JSON.stringify(original), snapshot, '不改原消息');
  const head = `分步规则\n${LEGACY_SPLIT_STATE_PREFIX}`;
  assert.ok(out[0].content.startsWith(head));
  const limited = JSON.parse(out[0].content.slice(head.length));
  const n = promptLayersConfig.memory.npcDegradedPromptLimit;
  assert.deepEqual(limited.社交.关系.a.记忆, ['旧一', '旧二', '最新甲'].slice(-n));
  assert.deepEqual(limited.社交.关系.b.记忆, ['仅一条']);
  assert.equal(limited.社交.关系.a.好感度, 30);
  assert.deepEqual(limited.角色, state.角色);
  assert.deepEqual(JSON.parse(limitDegradedNpcMemories(original, 2)[0].content.slice(head.length)).社交.关系.a.记忆, ['旧二', '最新甲']);
});

test('NPC 记忆降级（旧分步路径）：无可裁、JSON 不完整、坏条数原样返回；两种标题并存取末尾那段', () => {
  const short = legacyStateMessage({ 社交: { 关系: { a: { 记忆: ['一'] } } } });
  assert.equal(limitDegradedNpcMemories([short])[0], short);
  const broken = { role: 'system', content: `${LEGACY_SPLIT_STATE_PREFIX}{"社交":{"关系":{"a":{"记忆":["一","二"]}}}}\n尾巴` };
  assert.equal(limitDegradedNpcMemories([broken])[0], broken);
  const many = legacyStateMessage({ 社交: { 关系: { a: { 记忆: ['一', '二', '三'] } } } });
  for (const bad of [0, -1, 1.5, Number.NaN]) assert.equal(limitDegradedNpcMemories([many], bad)[0], many, `坏条数 ${bad}`);
  // 规则正文里先出现旧标题（如说明文字），末尾才是主路径状态段：只裁末尾那段。
  const mixed = stateMessage({ 社交: { 关系: { a: { 记忆: ['一', '二'] } } } }, `说明\n${LEGACY_SPLIT_STATE_PREFIX}（示意）\n`);
  assert.deepEqual(parseState(limitDegradedNpcMemories([mixed])[0]).社交.关系.a.记忆, ['一', '二'].slice(-promptLayersConfig.memory.npcDegradedPromptLimit));
  assert.ok(limitDegradedNpcMemories([mixed])[0].content.startsWith(`说明\n${LEGACY_SPLIT_STATE_PREFIX}（示意）\n${NARRATIVE_STATE_PREFIX}`));
});
