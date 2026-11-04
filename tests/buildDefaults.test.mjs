// 内测默认开（用户 2026-11-04 11:31 批准）：8091 内测版（MODULE_DEV_DEFAULTS=true）默认开双模型后端总闸与任务日志（story.quest），正式版（false）两者仍默认关。
// 钉住：配置里正式默认仍为 false、内测默认 enabledDev 为 true；集中判定函数按构建取值；读取点都走判定函数。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const bd = await jiti.import('../src/utils/buildDefaults.ts');
const dual = await jiti.import('../src/services/dualModelConfig.ts');
const { GAME_NUMBERS } = await jiti.import('../src/modules/sceneModule/numbers.ts');
const { validateAgainstRegistry } = await jiti.import('../src/modules/sceneModule/numbersRegistry.ts');

test('判定函数：内测读 enabledDev、正式读 enabled，只认布尔 true；测试环境未定义 MODULE_DEV_DEFAULTS 按正式版', () => {
  assert.equal(bd.IS_MODULE_DEV_BUILD, false);
  for (const [flag, dev, prod] of [
    [{ enabled: false, enabledDev: true }, true, false],
    [{ enabled: true, enabledDev: false }, false, true],
    [{ enabled: 'true', enabledDev: 1 }, false, false],
    [{}, false, false],
    [undefined, false, false],
  ]) {
    assert.equal(bd.buildDefaultEnabled(flag, true), dev, JSON.stringify(flag));
    assert.equal(bd.buildDefaultEnabled(flag, false), prod, JSON.stringify(flag));
  }
});

test('双模型总闸：内测默认开、正式默认关；玩家开关仍任一关即关（N3-A）', () => {
  const cfg = dual.DUAL_MODEL_CONFIG;
  assert.equal(cfg.dualModel.enabled, false, '正式默认不改');
  assert.equal(cfg.dualModel.enabledDev, true);
  assert.deepEqual(dual.validateDualModelConfig(), []);
  assert.match(dual.validateDualModelConfig({ ...cfg, dualModel: { ...cfg.dualModel, enabledDev: 'yes' } }).join(), /enabledDev 须为布尔/);
  assert.equal(dual.dualModelMasterEnabled(cfg, true), true);
  assert.equal(dual.dualModelMasterEnabled(cfg, false), false);
  assert.equal(dual.dualModelMasterEnabled(), false, '测试环境按正式版');
  assert.equal(dual.consistencyEnabled(true, cfg, true), true);
  assert.equal(dual.consistencyEnabled(false, cfg, true), false);
  assert.equal(dual.consistencyEnabled(true, cfg, false), false);
});

test('双模型读取点：总闸只经 dualModelMasterEnabled，不再直读 dualModel.enabled', () => {
  for (const file of ['src/services/prompts/defaultPrompts.ts', 'src/modules/scenarioMods/storyContext.ts', 'src/services/gameModelModules.ts', 'src/services/consistencyBackground.ts', 'src/components/dashboard/APIManagementPanel.vue']) {
    assert.doesNotMatch(read(file), /dualModel\??\.enabled\b(?!Dev)/, file);
  }
  assert.match(read('src/services/prompts/defaultPrompts.ts'), /!dualModelMasterEnabled\(\)/);
  assert.match(read('src/modules/scenarioMods/storyContext.ts'), /if \(!dualModelMasterEnabled\(\)\) return '';/);
});

test('任务日志：内测默认开、正式默认关；三分包与合并树同步、numbers 登记', () => {
  const quest = GAME_NUMBERS.story.quest;
  assert.equal(quest.enabled, false, '正式默认不改');
  assert.equal(quest.enabledDev, true);
  assert.equal(bd.buildDefaultEnabled(quest, true), true);
  assert.equal(bd.buildDefaultEnabled(quest, false), false);
  const progress = JSON.parse(read('mod-kit/numbers-progress.json')).story.quest;
  const merged = JSON.parse(read('mod-kit/game-numbers.qingyu.json')).story.quest;
  assert.deepEqual([progress.enabled, progress.enabledDev], [false, true]);
  assert.deepEqual([merged.enabled, merged.enabledDev], [false, true]);
  assert.match(read('src/modules/sceneModule/numbersRegistry.ts'), /path: 'story\.quest\.enabledDev', kind: 'bool', required: true/);
  assert.deepEqual(validateAgainstRegistry(JSON.parse(read('mod-kit/game-numbers.qingyu.json'))), []);
  const broken = JSON.parse(read('mod-kit/game-numbers.qingyu.json')); delete broken.story.quest.enabledDev;
  assert.ok(validateAgainstRegistry(broken).some(e => e.includes('story.quest.enabledDev')), '缺字段须报错');
});

test('任务日志读取点：只经 questGuideEnabled→buildDefaultEnabled；UI 隐藏主线按钮处都走 questGuideEnabled', () => {
  const log = read('src/modules/scenarioMods/questLog.ts');
  assert.match(log, /return buildDefaultEnabled\(questConfig\(\)\) && !\(save && isQingyuOpeningPlaytestSave\(save\)\);/);
  assert.doesNotMatch(log, /questConfig\(\)\??\.enabled/);
  for (const file of ['src/components/dashboard/MainGamePanel.vue', 'src/components/dashboard/RightSidebar.vue', 'src/components/dashboard/SettingsPanel.vue', 'src/components/dashboard/GameMapPanel.vue']) {
    const text = read(file);
    assert.match(text, /questGuideEnabled\(/, file);
    assert.doesNotMatch(text, /quest\??\.enabled\s*(===|!==|==|\)|&&|\|\||\?|;|,)/, file);
  }
});
