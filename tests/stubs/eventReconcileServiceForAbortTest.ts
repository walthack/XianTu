export {
  shouldRunReconcile,
  evidenceLikely,
  buildChainCandidates,
  runDeterministicHighlightReconcile,
  runDeterministicXieyiReconcile,
  runDeterministicBijiReconcile,
} from '../../src/services/eventReconcileService';

const callsKey = '__xiantuAbortEventReconcile';

type ReconcileBag = {
  delayMs: number;
  calls: Array<{ at: string }>;
  finished: Array<{ at: string }>;
};

function bag(): ReconcileBag {
  const root = globalThis as typeof globalThis & { [callsKey]?: ReconcileBag };
  if (!root[callsKey]) {
    root[callsKey] = { delayMs: 40, calls: [], finished: [] };
  }
  return root[callsKey]!;
}

export function resetEventReconcileAbortCalls() {
  const current = bag();
  current.calls.length = 0;
  current.finished.length = 0;
  current.delayMs = 40;
}

export function eventReconcileAbortCalls() {
  return [...bag().calls];
}

export function eventReconcileAbortFinished() {
  return [...bag().finished];
}

export async function runEventReconcile(input: {
  saveData: {
    世界?: { 状态?: { 剧本模组?: { flags?: Record<string, unknown>; divergences?: unknown[] } } };
  };
}) {
  const current = bag();
  current.calls.push({ at: new Date().toISOString() });
  await new Promise(resolve => setTimeout(resolve, current.delayMs));
  const runtime = input?.saveData?.世界?.状态?.剧本模组;
  if (runtime) {
    runtime.flags = { ...(runtime.flags || {}), 'event.s02_04.done': true };
    runtime.divergences = [...(runtime.divergences || []), { id: 'abort-test-divergence' }];
  }
  current.finished.push({ at: new Date().toISOString() });
  return [{
    key: '世界.状态.剧本模组.flags.event.s02_04.done',
    action: 'event_reconcile',
    oldValue: false,
    newValue: true,
  }];
}
