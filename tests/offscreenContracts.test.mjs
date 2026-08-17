import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 场外结算合同（`offscreenResolution`）＝「玩家长期缺席时由世界自行结算」。
// 它是「去了现场 vs 没去现场」这条分支的承重件。
//
// 立项由来（2026-08-17）：汉国宫变段的 4 条合同（seq 894/896/897/899）挂在隔离关
// `lyl.luoyang_coup` 的原件上。默认路线静默跳过该关 → **这 4 条合同永远不会触发**。
// 内容重建进可达关 `lyl.han_palace_endgame` 时，合同没跟过来，谁也没发现——
// 直到查「传闻版 event 为什么无条件铺着」才顺出来。
// 合同失效是静默的：它不报错，只是那条分支从来没存在过。故立本门禁。

const DIR = 'src/modules/scenarioMods/builtins/data/';

function worldSimStages() {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(DIR + f, 'utf8'));
    if (j.scenario?.worldSimulation) out.push(j);
  }
  return out;
}

test('场外结算合同不得挂在被默认路线跳过的关上', async () => {
  const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const dead = [];
  for (const stage of worldSimStages()) {
    if (!DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(stage.manifest.id)) continue;
    for (const event of stage.scenario.events || []) {
      if (event.offscreenResolution) {
        dead.push(`[${stage.manifest.id}] ${event.id}（seq ${event.axisSeq}）`);
      }
    }
  }
  // 已知遗留：汉国宫变 4 条原件仍在隔离关里带着合同。它们是重复件——
  // 等价拍已在可达关 `lyl.han_palace_endgame` 补了合同（`offscreen.r3_11.*`），
  // 隔离原件不动（改隔离关数据无收益且有风险）。故此处记录而非清零。
  const KNOWN_DEAD = [
    '[lyl.luoyang_coup] lyl.event.s06_01（seq 894）',
    '[lyl.luoyang_coup] lyl.event.s06_03（seq 896）',
    '[lyl.luoyang_coup] lyl.event.s06_04（seq 897）',
    '[lyl.luoyang_coup] lyl.event.s06_06（seq 899）',
  ];
  assert.deepEqual(
    dead.sort(),
    KNOWN_DEAD.sort(),
    '有新的场外合同挂在隔离关上——它永远不会触发，那条「没去现场」的分支等于不存在',
  );
});

test('场外合同的字段齐全，否则结算时静默失效', () => {
  const bad = [];
  for (const stage of worldSimStages()) {
    for (const event of stage.scenario.events || []) {
      const c = event.offscreenResolution;
      if (!c) continue;
      for (const key of ['id', 'flagKey', 'resolvedEventIds', 'worldDelta', 'afterStallTurns']) {
        if (c[key] === undefined) bad.push(`${event.id} 缺 ${key}`);
      }
      if (Array.isArray(c.resolvedEventIds) && !c.resolvedEventIds.includes(event.id)) {
        bad.push(`${event.id} 的 resolvedEventIds 不含自己`);
      }
    }
  }
  assert.deepEqual(bad, [], '场外合同字段不全，结算时会静默跳过');
});

test('传闻版 event 由亲历拍门控，且门控指向真实存在的 event', () => {
  // 「去了现场就亲眼看见，没去就只剩传闻」（用户裁定 2026-08-17）。
  // 判据是 `flags.event.<亲历拍>.done`——该 flag **只有玩家亲历才置位**：
  // 场外结算写的是自己的 flagKey，schema 明写「不计作玩家完成」。
  const ids = new Set();
  const gated = [];
  for (const stage of worldSimStages()) {
    for (const event of stage.scenario.events || []) {
      ids.add(event.id);
      for (const cond of event.conditions || []) {
        if (cond.operator === 'neq' && cond.value === true && cond.path.startsWith('flags.event.')) {
          gated.push({ event: event.id, anchor: cond.path.slice('flags.event.'.length, -'.done'.length) });
        }
      }
    }
  }
  assert.ok(gated.length > 0, '一条「没去现场」门控都没有了？本设计被删就该改断言，不是留空跑过');
  const missing = gated.filter(g => !ids.has(`${g.event.split('.')[0]}.event.${g.anchor}`));
  assert.deepEqual(missing, [], '门控指向的亲历拍不存在——条件恒真，传闻版会一直出现');
});
