// 开局第 1 步 system 不再把玩家提示词拼进「角色设定」。userPrompt 仍只作为 step1 generateOnce 的 user 发给模型一次。
// 2026-10-29 16:25 用户批准：只删 buildInitialSplitSystemPrompt step===1 的重复段。源码静态检查。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');

test('开局第 1 步 system 提示词不包含 userPrompt', () => {
  const start = src.indexOf('const buildInitialSplitSystemPrompt');
  const step1 = src.slice(src.indexOf('if (step === 1)', start), src.indexOf('// 第2步：指令生成', start));
  assert.match(step1, /if \(step === 1\)/);
  assert.equal(step1.includes('userPrompt'), false);
  assert.equal(step1.includes('# 角色设定'), false);
  assert.match(step1, /# 世界观设定\n\$\{worldStandardsPrompt\}\n\s*`\.trim\(\)/);
});

test('step1 的 generateOnce 调用仍带 user: userPrompt', () => {
  const anchor = src.indexOf('const buildInitialSplitSystemPrompt');
  const start = src.indexOf('const step1Raw = await generateOnce({', anchor);
  const call = src.slice(start, src.indexOf('});', start));
  assert.match(call, /step:\s*1,/);
  assert.match(call, /system:\s*`\$\{step1SystemPrompt\}\$\{strictLengthSuffix\}`,/);
  assert.match(call, /user:\s*userPrompt,/);
  assert.equal(src.split('user: userPrompt').length - 1, 1);
});
