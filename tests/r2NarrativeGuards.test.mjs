import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('R2-9 十二条叙事护栏同时进入非分步与分步正文路由', async () => {
  const { R2_9_NARRATIVE_GUARD_RULES } = await loadTs('../src/utils/prompts/definitions/businessRules.ts');
  const { getSystemPrompts } = await loadTs('../src/services/prompts/defaultPrompts.ts');
  const prompts = getSystemPrompts();

  assert.ok(R2_9_NARRATIVE_GUARD_RULES.length > 500);
  assert.match(prompts.businessRules.content, /\[R2-9叙事护栏·硬约束\]/);
  assert.match(prompts.splitGenerationStep1.content, /\[R2-9叙事护栏·硬约束\]/);

  const requiredRules = [
    '玩家代理权',
    '筹码接地',
    '前史与关系',
    '主角语域',
    '行动选项视角',
    'NPC语域与智谋',
    '力量金字塔',
    '正典生死权',
    '正典留白',
    '时限与回报',
    '原著知识与角色机密隔离',
    '世界留钩',
  ];
  for (const label of requiredRules) {
    assert.match(prompts.businessRules.content, new RegExp(label));
    assert.match(prompts.splitGenerationStep1.content, new RegExp(label));
  }

  assert.match(prompts.businessRules.content, /角色档案中的真身、卧底、伪装、内部称号与秘密归属/);
  assert.match(prompts.splitGenerationStep1.content, /不等于场内NPC已经知情/);
});

test('行动选项规则锁定主角视角并承接世界留钩', async () => {
  const { ACTION_OPTIONS_RULES } = await loadTs('../src/utils/prompts/definitions/actionOptions.ts');

  assert.match(ACTION_OPTIONS_RULES, /只能是主角本人下一步可执行的动作/);
  assert.match(ACTION_OPTIONS_RULES, /不得出现主角姓名并把主角当第三人称对象/);
  assert.match(ACTION_OPTIONS_RULES, /至少一个选项必须明确承接该钩/);
});
