import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const { backendPanelState } = await loadTs('../src/services/dualModelPanel.ts');
const { DUAL_MODEL_CONFIG, validateDualModelConfig } = await loadTs('../src/services/dualModelConfig.ts');
const connection = { id: 'fixture', model: 'MiniMax-M3.1-Flash', url: 'https://api.minimaxi.com/v1' };

test('配置页档位：官方模型/主机可选，default 显示配置 max；未知模型、代理、坏 URL、空连接禁用', () => {
  assert.equal(backendPanelState(connection, true).supportsReasoning, true);
  assert.equal(backendPanelState(connection, true).defaultEffortLabel, '默认（max）');
  for (const c of [null, { ...connection, model: 'other' }, { ...connection, url: 'https://proxy.example/v1' }, { ...connection, url: 'invalid' }]) {
    assert.equal(backendPanelState(c, true).supportsReasoning, false);
  }
});

test('N6：仅继承非默认型号提示，大小写不敏感，不用推理档前缀名单代替型号比较', () => {
  assert.equal(backendPanelState(connection, true).inheritedWarning, '');
  assert.equal(backendPanelState({ ...connection, model: 'minimax-m3.1-flash' }, true).inheritedWarning, '');
  const other = { ...connection, model: 'MiniMax-M3.1-Flash-Pro' };
  assert.ok(backendPanelState(other, true).inheritedWarning.includes(connection.model));
  assert.equal(backendPanelState(other, false).inheritedWarning, '');
});

test('配置页文案校验：缺文案/缺预算占位符均拒绝', () => {
  assert.deepEqual(validateDualModelConfig(), []);
  const cfg = structuredClone(DUAL_MODEL_CONFIG);
  cfg.dualModel.ui.reasoningLabel = '';
  cfg.dualModel.ui.paidConfirmation = '后台自动请求';
  const errors = validateDualModelConfig(cfg).join();
  assert.match(errors, /reasoningLabel/);
  assert.match(errors, /hourlyBudget/);
});
