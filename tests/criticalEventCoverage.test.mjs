import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 每条承重（critical）event 都必须被三级任务链的某一层认领。
//
// 立项由来（2026-08-19）：用户看过人物线的问题后说「我很担忧之前你设计的二级线质量」。
// 查证属实，而且暴露的是**验收方式**的问题——此前报过「真孤儿 11 条」，
// 那是宽口径（把「B 档过程拍」「人物挂点」都算成已覆盖）；
// 严格只认三级链真正引用的 event id，实为 **67 条无人认领，其中 48 条 critical**。
// 同一批数据两个数字，报出去的是好看的那个。
//
// 故本门禁把标准写死：**critical event 必须有归属**，欠账写在 DEBT 里，只能减不能增。
// 这样「清零了没有」不再取决于谁的说法。

const DIR = 'src/modules/scenarioMods/builtins/data/';

test('每条 critical event 都被三级链认领；欠账只减不增', async () => {
  const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');

  const critical = new Map();
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(DIR + f, 'utf8'));
    if (!j.scenario?.worldSimulation) continue;
    // 隔离关默认路线静默跳过，其中的 event 玩家取不到，不计入
    if (DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(j.manifest.id)) continue;
    for (const e of j.scenario.events || []) {
      if (e.critical) critical.set(e.id, e.name || e.id);
    }
  }

  // 三级链：主轴 / 二级线 / 人物任务，任一层引用即算认领
  const claimed = new Set();
  for (const src of [
    'src/modules/scenarioMods/mainQuestAxis.ts',
    'src/modules/scenarioMods/secondaryLines.ts',
    'src/modules/scenarioMods/characterQuests.ts',
  ]) {
    const text = fs.readFileSync(src, 'utf8');
    for (const m of text.matchAll(/'((?:lcq|lyl|lyg|liuchao)\.event\.[a-zA-Z0-9_]+)'/g)) claimed.add(m[1]);
  }

  const orphans = [...critical.keys()].filter(id => !claimed.has(id)).sort();

  // 欠账清单：**只能减，不能增**。清掉一条就从这里删一条。
  // 新出现的 critical event 若不入链，测试会红——这正是本门禁存在的意义。
  // 裁定170豁免：24章历史冰蛊内容留原位，不在南荒当前可执行支线上；并非新增内容欠账。
  const DEBT = ['lcq.event.ice_gu_coercion'];

  const unexpected = orphans.filter(id => !DEBT.includes(id));
  assert.deepEqual(
    unexpected.map(id => `${id}　${critical.get(id)}`),
    [],
    '有 critical event 没被任何一层认领，且不在欠账清单里——要么落进链，要么明确它为什么不该在链上',
  );

  const cleared = DEBT.filter(id => !orphans.includes(id));
  assert.deepEqual(
    cleared, [],
    `欠账清单里这些已经认领了，请把它们从 DEBT 删掉（清一条删一条，别让清单虚高）：\n${cleared.join('\n')}`,
  );
});
