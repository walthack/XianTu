import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';
import { freshPrologueCheckpoint } from './generate-prologue-checkpoint.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const V = await loadTs('../src/utils/saveValidationV3.ts');
export const checkpointLines = [
  { id: 'han', name: '汉' }, { id: 'tang', name: '唐' }, { id: 'taiquan', name: '太泉' },
].map(line => ({ ...line, eventId: P.CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === line.id).steps.find(s => s.eventId && !s.pending && !s.draft).eventId }));
const rt = save => save.世界.状态.剧本模组;
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
export const outputDir = new URL('../tests/fixtures/checkpoints/', import.meta.url);

export async function generateLineEntryCheckpoints() {
  // 固定宿主时钟/随机种子/UUID只用于离线重放的可重复性；不改游戏时间、境界或 runtime 进度。
  // 无 completedEventIds/flags/activeEventIds 补写，无前置线收束注入。
  const OriginalDate = globalThis.Date, originalRandom = Math.random;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const epoch = OriginalDate.parse('2026-11-01T00:00:00.000Z');
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [epoch])); }
    static now() { return epoch; }
  };
  let seed = 20261101;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // NPC 本地实体也使用 crypto.randomUUID；保留 UUID 形状，跨次重放生成同一实体引用。
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID() {
      const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  } });
  try {
    const mods = await Promise.all((await readdir(dataDir)).filter(f => f.endsWith('.json')).sort().map(async f =>
      P.applyContentPackOverlays(JSON.parse(await readFile(new URL(f, dataDir), 'utf8')))));
    let { save, trace: prologue } = await freshPrologueCheckpoint();
    const trace = [{ kind: 'source', generator: 'freshPrologueCheckpoint', nonEngineProgress: [],
      note: '从当前新档沿正式关链推进；mapEntries 仅含秦，三条目标线不使用地图入口或前置完成注入。固定宿主时钟和随机种子，不固定游戏时钟。' }, ...prologue];
    const pastry = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action');
    assert.ok(pastry);
    const capture = W.settleWuyuanOpenWorldSelection(save, pastry);
    assert.equal(capture.canonEventCompleted, true);
    trace.push({ kind: 'local', selection: pastry.identityId, result: capture });
    save = R.advanceScenarioRuntime(save).saveData;
    const checkpoints = {};
    let idle = 0;
    for (let n = 0; n < 1000; n++) {
      const state = rt(save), focus = R.getScenarioFocusEvent(state);
      assert.ok(!state.gameOver, `unexpected ending at ${state.modId}`);
      // 太泉首拍未配 locationId；按其「抵达苍澜镇」目标走正式地图路线，
      // 不把坐标/位置或完成标志直接写入存档。地图 actionId 是调用方幂等键。
      if (focus?.id === checkpointLines.find(l => l.id === 'taiquan').eventId
        && save.角色.位置.locationId !== 'liuchao.location.canglan') {
        const selection = M.selectMapTravel(save, 'liuchao.location.canglan');
        assert.ok(selection, '苍澜地图路线不可用');
        selection.actionId = 'line-checkpoint:map:canglan';
        assert.equal(M.settleMapTravel(save, selection), true);
        trace.push({ kind: 'map', selection, location: structuredClone(save.角色.位置) });
      }
      const actions = R.getCurrentStoryEventActions(save);
      for (const line of checkpointLines) {
        const actionable = actions.filter(a => a.eventId === line.eventId && !/^(travel:|idle:)/.test(a.actionId));
        const event = state.events.find(e => e.id === line.eventId);
        if (!checkpoints[line.id] && event && !state.completedEventIds.includes(line.eventId)
          && (state.activeEventIds.includes(line.eventId) || focus?.id === line.eventId)
          && actionable.length && (!event.locationId || save.角色.位置.locationId === event.locationId)) {
          const snapshot = structuredClone(save);
          snapshot.元数据.存档名 = `当前构建新档-${line.name}线进线前`;
          assert.equal(V.validateSaveDataV3(snapshot).isValid, true);
          checkpoints[line.id] = {
            bundle: { type: 'saves', saves: [{ 存档名: snapshot.元数据.存档名, 存档数据: snapshot }] },
            trace: [...structuredClone(trace), { kind: 'checkpoint', line: line.id, eventId: event.id,
              eventName: event.name, stage: state.modId, location: snapshot.角色.位置,
              actions: actionable.map(a => a.actionId), nonEngineProgress: [] }],
          };
        }
      }
      if (Object.keys(checkpoints).length === checkpointLines.length) return checkpoints;
      if (state.nextStageReadyId) {
        const result = I.transitionToNextScenarioStage(save, mods);
        assert.ok(result.ok, result.reason);
        save = result.saveData;
        trace.push({ kind: 'stage', from: state.modId, to: rt(save).modId });
        idle = 0;
        continue;
      }
      const action = actions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId))
        || actions.find(a => a.actionId.startsWith('travel:')) || actions[0];
      if (action) {
        const receipt = R.recordStoryEventStructuredAction(save, action);
        assert.ok(receipt.attempted, JSON.stringify({ action, receipt }));
        trace.push({ kind: 'action', stage: state.modId, event: action.eventId, action: action.actionId, receipt });
        idle = 0;
      } else {
        const opportunity = focus?.worldActor?.opportunities?.[0];
        if (opportunity) R.trackStoryOpportunity(save, opportunity.id);
        const choice = R.getTrackedStoryOpportunityActions(save)[0];
        if (choice) {
          const receipt = R.recordStoryOpportunityStructuredAction(save, choice);
          assert.ok(receipt.progressed, JSON.stringify(receipt));
          trace.push({ kind: 'opportunity', stage: state.modId, selection: choice, receipt });
          idle = 0;
        } else {
          // 世界角色/画外拍的正常时钟推进；不补写事件完成。
          assert.ok(++idle <= 50, `no progress: ${state.modId}/${focus?.id}`);
          trace.push({ kind: 'wait', stage: state.modId, focus: focus?.id ?? null, turn: state.worldTurn });
        }
      }
      T.settleActionTime(save, { action_time: { tier: '片刻' } }, { timeActionId: `line-checkpoint:${n}` }, null, false, false);
      save = R.advanceScenarioRuntime(save).saveData;
    }
    throw Error('line checkpoint replay exceeded 1000 turns');
  } finally {
    globalThis.Date = OriginalDate;
    Math.random = originalRandom;
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    else delete globalThis.crypto;
  }
}

export async function writeLineEntryCheckpoints(dir = outputDir) {
  const checkpoints = await generateLineEntryCheckpoints();
  await mkdir(dir, { recursive: true });
  for (const line of checkpointLines) {
    const stem = new URL(`current-${line.id}-entry`, dir);
    for (const [suffix, value] of [['.json', checkpoints[line.id].bundle], ['.trace.json', checkpoints[line.id].trace]]) {
      await writeFile(fileURLToPath(stem) + suffix, JSON.stringify(value, null, 2) + '\n');
    }
  }
  return checkpoints;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkpoints = await writeLineEntryCheckpoints();
  for (const line of checkpointLines) console.log(JSON.stringify(checkpoints[line.id].trace.at(-1)));
}
