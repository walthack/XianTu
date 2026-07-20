import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src/modules/scenarioMods/builtins/data');

// 规则（PROJECT-STATUS.md §2.3）：本关 canon 里已存在的实体，其名字不是秘密——玩家本来就认识它。
// 要保护的未揭露命题应写成 forbiddenAssociations（subjects × predicates），而不是把名字拉黑。
// 真机代价实测：正文正常提到同伴或已知人物即整轮硬违规、退两稿、降级成罐头。
test('forbidden terms never blacklist an entity that already exists in the same stage canon', () => {
  const offenders = [];

  for (const file of fs.readdirSync(dataDir).filter(name => name.endsWith('.json')).sort()) {
    const mod = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    const known = new Set([
      ...(mod.canon?.characters || []).map(item => item.name),
      ...(mod.canon?.factions || []).map(item => item.name),
    ].filter(Boolean));

    for (const event of mod.scenario?.events || []) {
      const terms = event.worldActor?.decisionCore?.narrativeGuard?.forbiddenTerms;
      if (!Array.isArray(terms)) continue;
      for (const term of terms) {
        if (known.has(term)) offenders.push(`${event.id} → 「${term}」`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    '以下禁词命中本关已存在的正典实体，应改用 forbiddenAssociations：\n'
      + offenders.map(item => `  - ${item}`).join('\n'),
  );
});
