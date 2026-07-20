#!/usr/bin/env node
/**
 * 禁词审计：narrativeGuard.forbiddenTerms 不应把「本关已存在的正典实体」整个名字列为绝对禁词。
 *
 * 规则（2026-07-20 用户裁定，见 PROJECT-STATUS.md §2.3）：
 *   本关 canon.characters / canon.factions 里已存在的实体，其**名字**不是秘密——
 *   玩家在本关本来就认识它。需要保护的是关于它的某个**未揭露命题**，
 *   那应该写成 forbiddenAssociations（subjects × predicates），而不是拉黑名字。
 *
 * 把名字当绝对禁词的代价是实测过的：正文只要正常提到同伴或已知人物就整轮硬违规、
 * 退两稿、降级成罐头，玩家白白损失一个回合。
 *
 * 用法：
 *   node scripts/audit-forbidden-terms-vs-canon.mjs            列出嫌疑
 *   node scripts/audit-forbidden-terms-vs-canon.mjs --fail     有嫌疑则退出码 1（CI 用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src/modules/scenarioMods/builtins/data');

const findings = [];

for (const file of fs.readdirSync(dataDir).filter(name => name.endsWith('.json')).sort()) {
  const mod = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const characters = new Map((mod.canon?.characters || []).map(item => [item.name, item]));
  const factions = new Map((mod.canon?.factions || []).map(item => [item.name, item]));

  for (const event of mod.scenario?.events || []) {
    const terms = event.worldActor?.decisionCore?.narrativeGuard?.forbiddenTerms;
    if (!Array.isArray(terms)) continue;
    for (const term of terms) {
      const character = characters.get(term);
      const faction = factions.get(term);
      if (!character && !faction) continue;      // 非本关实体 → 合理的绝对禁词
      findings.push({
        stage: mod.manifest?.id || file.replace(/\.json$/, ''),
        eventId: event.id,
        term,
        kind: character ? 'canon.characters' : 'canon.factions',
        summary: String(character?.description || faction?.description || '').slice(0, 60),
      });
    }
  }
}

if (!findings.length) {
  console.log('✅ 未发现把本关已存在正典实体列为绝对禁词的情况。');
  process.exit(0);
}

console.log(`⚠️  ${findings.length} 处禁词命中本关已存在的正典实体：\n`);
for (const item of findings) {
  console.log(`  ${item.stage} / ${item.eventId}`);
  console.log(`    禁词「${item.term}」已是 ${item.kind}：${item.summary}…`);
  console.log('    → 名字不该拉黑；把要保护的未揭露命题改写成 forbiddenAssociations。\n');
}

if (process.argv.includes('--fail')) process.exit(1);
