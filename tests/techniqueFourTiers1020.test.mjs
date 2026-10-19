// 2026-10-20 功法改四品：与道具共用 mod-kit/item-grades.json；旧档七档自动换算；数值全在配置。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTs } from './loadTs.mjs';
const tq = await loadTs('../src/data/techniqueQuality.ts');
const { repairSaveData } = await loadTs('../src/utils/dataRepair.ts').catch(() => ({}));
const table = JSON.parse(fs.readFileSync('mod-kit/item-grades.json', 'utf8'));

test('旧七档功法单字按配置换算成四品', () => {
  const want = { 凡: '凡', 黄: '珍', 玄: '珍', 地: '珍', 天: '仙', 仙: '仙', 神: '神' };
  for (const [old, now] of Object.entries(want)) {
    assert.deepEqual(tq.normalizeTechniqueQuality({ quality: old, grade: 6 }), { quality: now, grade: 6 }, old);
  }
  assert.deepEqual(tq.normalizeTechniqueQuality(null), { quality: '凡', grade: 1 });
  assert.equal(tq.normalizeTechniqueQuality({ quality: '玄', grade: 99 }).grade, 10);
});

test('目录 grade 字符串 → 存档四品', () => {
  assert.equal(tq.techniqueSaveQuality('中品').quality, '珍');
  assert.equal(tq.techniqueSaveQuality('神级').quality, '神');
  assert.equal(tq.techniqueSaveQuality('唯一').quality, '仙');
  assert.equal(tq.techniqueSaveQuality('下品').quality, '凡');
  assert.equal(tq.techniqueSaveQuality(undefined).quality, '凡');
});

test('功法数值都来自配置 technique 段', () => {
  for (const t of table.tiers) {
    assert.deepEqual(tq.techniqueNumbersOf(t.short), table.technique.tiers[t.id], t.name);
  }
  assert.equal(tq.TECHNIQUE_BREAKTHROUGH_CAP, table.technique.breakthroughCap);
  assert.equal(tq.techniqueNumbersOf('黄').libraryFloor, table.technique.tiers.zhen.libraryFloor);
});

test('提示词与面板不再出现功法七档', () => {
  for (const f of ['src/utils/prompts/definitions/dataDefinitions.ts', 'src/utils/prompts/definitions/textFormats.ts',
    'src/utils/prompts/definitions/worldStandards.ts', 'src/utils/prompts/tasks/craftingPrompts.ts',
    'src/utils/prompts/tasks/gameElementPrompts.ts', 'src/utils/prompts/definitions/businessRules.ts',
    'src/components/dashboard/components/SectLibraryContent.vue', 'src/components/dashboard/components/SectContributionContent.vue',
    'src/components/dashboard/components/GameVariableFormatGuideModal.vue']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /凡\|黄\|玄|凡品\|黄品|凡\/黄\/玄|黄品×/, f);
  }
});

test('businessRules 功法系数由配置生成', async () => {
  const br = await loadTs('../src/utils/prompts/definitions/businessRules.ts');
  const text = Object.values(br).filter(v => typeof v === 'string').join('\n');
  const line = table.tiers.map(t => `${t.name}×${table.technique.tiers[t.id].progressFactor}`).join('|');
  assert.ok(text.includes(`功法品质:${line}`), line);
});

test('按品统计脚本覆盖全部目录功法', () => {
  const out = JSON.parse(execFileSync('node', ['scripts/count-technique-grades.mjs'], { encoding: 'utf8' }));
  const sum = Object.values(out.catalog.byTier).reduce((a, b) => a + b, 0);
  assert.equal(sum, out.catalog.total);
  assert.ok(!Object.keys(out.catalog.byTier).some(k => k.startsWith('未识别')), JSON.stringify(out.catalog.byTier));
  assert.ok(!Object.keys(out.stageRefs.byTier).some(k => k.startsWith('未识别')));
});

// 6ccb 真机：功法页（默认修炼页）看不到四品——只有功法库卡片带品级标签。修炼页与功法库都加四品计数条。
test('功法页修炼/功法库两页都有四品计数条，按配置四品渲染', () => {
  const s = fs.readFileSync('src/components/dashboard/SkillsPanel.vue', 'utf8');
  assert.equal((s.match(/data-test="technique-tier-summary"/g) || []).length, 2);
  assert.match(s, /countTechniquesByTier\(inventoryTechniques\.value\.map/);
  assert.deepEqual(tq.countTechniquesByTier(['神', '凡', '黄', '玄', '天']), { 凡品: 1, 珍品: 2, 仙品: 1, 神品: 1 });
});
