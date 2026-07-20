#!/usr/bin/env node
/**
 * 禁词审计：找出 narrativeGuard.forbiddenTerms 与本关正典实体同名的嫌疑项。
 *
 * canon 成员关系只证明实体存在于世界真值，不证明视角人物已经知情。这里的命中
 * 只能进入人工审计清单，不能自动删除禁词、自动裁定或作为 CI 失败条件。
 *
 * 把名字当绝对禁词的代价是实测过的：正文只要正常提到同伴或已知人物就整轮硬违规、
 * 退两稿、降级成罐头，玩家白白损失一个回合。
 *
 * 用法：
 *   node scripts/audit-forbidden-terms-vs-canon.mjs            列出嫌疑
 * 脚本始终以 0 退出；它是启发式报告，不是门禁。
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
      if (!character && !faction) continue;
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
  console.log('✅ 本次启发式审计未发现“禁词与本关正典实体同名”的嫌疑项。');
  process.exit(0);
}

console.log(`⚠️  ${findings.length} 处禁词与本关正典实体同名（仅为人工复核嫌疑）：\n`);
for (const item of findings) {
  console.log(`  ${item.stage} / ${item.eventId}`);
  console.log(`    禁词「${item.term}」已是 ${item.kind}：${item.summary}…`);
  console.log('    → 请按主角记忆、已亲历揭露或开场明示核对；canon 成员关系本身不能证明玩家知情。\n');
}
