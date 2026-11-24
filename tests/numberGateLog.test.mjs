// Q26 版一（用户 2026-11-24 批）：数字检查只记不拦——命中记 LCQ-NAR-011，带哪一拍与原句。
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('recordNumberGateHits：有命中记一条 LCQ-NAR-011（info），带拍、规则与原句全文；没命中不记', async () => {
  const { recordNumberGateHits } = await loadTs('../src/modules/diagnostics/numberGateLog.ts');
  const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
  const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
  await resetLogState();
  const recent = () => logStore.recent(200).filter(entry => entry.code === 'LCQ-NAR-011');
  recordNumberGateHits(undefined, { site: 'turn' });
  recordNumberGateHits([], { site: 'turn' });
  assert.equal(recent().length, 0);
  recordNumberGateHits(
    [{ rule: 'concreteQuantity', sentence: '四营正在继续压合围圈' }, { rule: 'handoffLoss', sentence: ' 两名伤卒被扶到箱前' }],
    { site: 'turn', generationId: 'gen_1', step: { eventId: 'lcq.event.s10_03', action: { id: 'hold_the_gate' } } },
  );
  const [entry] = recent();
  assert.ok(entry, '记了一条');
  assert.equal(entry.level, 'info');
  assert.deepEqual(
    { ...entry.detail },
    {
      site: 'turn', eventId: 'lcq.event.s10_03', actionId: 'hold_the_gate', generationId: 'gen_1', count: 2,
      rules: ['concreteQuantity', 'handoffLoss'],
      sentences: '[concreteQuantity] 四营正在继续压合围圈\n[handoffLoss] 两名伤卒被扶到箱前',
    },
  );
  recordNumberGateHits([{ rule: 'concreteQuantity', sentence: '三百甲士列阵' }], { site: 'opening' });
  assert.equal(recent().length, 2);
  assert.ok(recent().some(item => item.detail.site === 'opening' && item.detail.eventId === null));
  await resetLogState();
});
