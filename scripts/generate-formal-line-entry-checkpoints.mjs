// 南荒、晋、宋、秦四条线的进线试玩档（用户 2026-11-28 07:52 交办）。
// 做法同 generate-line-entry-checkpoints.mjs：沿正式关链用真实动作推进，不补写 completedEventIds/flags/activeEventIds。
// 不同处：底档是正式新档（tests/mainlineWalker.mjs 的 formalNewSave），不是清羽试玩档——试玩档带隔离标记，进不了秦。
// 南荒、晋、宋：线卡第一步的事件首次成为焦点且有可点动作时截档。
// 秦：入秦阈值达成、口信投递后选「接下」，地图点咸阳切进秦关，截在秦关第一拍。
// 在队名单不落存档，读档时由在队账按 mod-kit/player-ledger-rules.json 现算；trace 里记的是生成时算出的名单。
// 固定宿主时钟/随机种子/UUID，只为重跑逐字节一致；不固定游戏时钟。
// 生成：node scripts/generate-formal-line-entry-checkpoints.mjs → tests/fixtures/checkpoints/formal-<线>-entry.json + .trace.json
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';
import { step, rt, formalNewSave, withFixedHost, loadMainlineMods } from '../tests/mainlineWalker.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const V = await loadTs('../src/utils/saveValidationV3.ts');
const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const O = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const ME = await loadTs('../src/modules/scenarioMods/mapEntries.ts');
const PL = await loadTs('../src/modules/scenarioMods/partyLedger.ts');

export const outputDir = new URL('../tests/fixtures/checkpoints/', import.meta.url);
const firstStepEvent = lineId => P.CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === lineId).steps.find(s => s.eventId && !s.pending && !s.draft).eventId;
export const formalCheckpointLines = [
  { id: 'nanhuang', name: '南荒', eventId: firstStepEvent('nanhuang') },
  { id: 'jin', name: '晋', eventId: firstStepEvent('jin') },
  { id: 'song', name: '宋', eventId: firstStepEvent('song') },
  { id: 'qin', name: '秦' },
];
const QIN_STAGE = 'lyg.qin_xianyang';
const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.stageId === QIN_STAGE);
const qinReady = save => L.resolveLedgerPath('compass.qinEntryReady', rt(save), save)?.value === true;

export function checkpointSummary(save) {
  const s = rt(save);
  return { stage: s.modId, focus: R.getScenarioFocusEvent(s)?.id ?? null, location: save.角色.位置?.locationId ?? null,
    year: save.元数据.时间.年, completed: s.completedEventIds.length, closedLines: O.nationClosedLineCount(s),
    party: [...PL.partyRoster(s)].sort() };
}

export async function generateFormalLineEntryCheckpoints() {
  return withFixedHost(async () => {
    const mods = await loadMainlineMods();
    let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    const trace = [{ kind: 'source', generator: 'formalNewSave', nonEngineProgress: [],
      note: '正式（非隔离试玩）新档沿正式关链用真实动作推进；固定宿主时钟和随机种子，不固定游戏时钟。' }];
    const out = {};
    const mark = (line, s, extra) => {
      const snapshot = JSON.parse(JSON.stringify(s));
      snapshot.元数据.存档名 = `当前构建新档-${line.name}线进线前`;
      assert.equal(V.validateSaveDataV3(snapshot).isValid, true, line.id);
      out[line.id] = {
        bundle: { type: 'saves', saves: [{ 存档名: snapshot.元数据.存档名, 存档数据: snapshot }] },
        trace: [...structuredClone(trace), { kind: 'checkpoint', line: line.id, ...checkpointSummary(snapshot), ...extra, nonEngineProgress: [] }],
      };
    };
    let n = 0;
    for (; n < 3000 && !qinReady(save); n++) {
      const state = rt(save), focus = R.getScenarioFocusEvent(state);
      for (const line of formalCheckpointLines) {
        if (out[line.id] || !line.eventId || focus?.id !== line.eventId || state.completedEventIds.includes(line.eventId)) continue;
        const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId === line.eventId && !/^(travel:|idle:)/.test(a.actionId));
        if (actions.length) mark(line, save, { eventId: line.eventId, eventName: focus.name, actions: actions.map(a => a.actionId) });
      }
      const result = step(save, mods, n);
      trace.push({ kind: result.kind, stage: state.modId, focus: focus?.id ?? null });
      save = result.save;
    }
    assert.ok(qinReady(save), 'qinEntryReady never reached');
    for (const line of formalCheckpointLines) if (line.eventId) assert.ok(out[line.id], `${line.id} 入口拍没走到`);
    // 秦：口信已投递，选「接下」，再从地图点咸阳（同 generate-qin-replay-fixtures.mjs 的真实切关入口）。
    assert.ok(rt(save).activeEventIds.includes(ENTRY.eventId), 'Q-1 未投递');
    const hook = R.getCurrentStoryExplorationActions(save).filter(a => a.eventId === ENTRY.eventId);
    const accept = hook.find(a => a.actionId !== 'later');
    assert.ok(accept, `Q-1 没有「接下」动作：${hook.map(a => a.actionId).join('|')}`);
    assert.equal(R.recordStoryEventStructuredAction(save, accept).completed, true);
    trace.push({ kind: 'action', stage: rt(save).modId, event: ENTRY.eventId, action: accept.actionId, completed: true });
    save = R.advanceScenarioRuntime(save).saveData;
    assert.equal(ME.mapEntryReady(save, ENTRY), true, '接下后地图入口应可用');
    const selection = M.selectMapTravel(save, ENTRY.locationId);
    assert.ok(selection, '咸阳地图入口不可用');
    selection.actionId = 'formal-line-checkpoint:map:xianyang';
    assert.equal(M.settleMapTravel(save, selection), true);
    trace.push({ kind: 'map', selection, stage: rt(save).modId, location: structuredClone(save.角色.位置) });
    assert.equal(rt(save).modId, QIN_STAGE);
    const focus = R.getScenarioFocusEvent(rt(save));
    mark(formalCheckpointLines.find(l => l.id === 'qin'), save, { eventId: focus?.id ?? null, eventName: focus?.name ?? null,
      actions: R.getCurrentStoryEventActions(save).map(a => a.actionId) });
    return out;
  });
}

export async function writeFormalLineEntryCheckpoints(dir = outputDir) {
  const out = await generateFormalLineEntryCheckpoints();
  await mkdir(dir, { recursive: true });
  for (const line of formalCheckpointLines) {
    const stem = fileURLToPath(new URL(`formal-${line.id}-entry`, dir));
    await writeFile(`${stem}.json`, JSON.stringify(out[line.id].bundle) + '\n');
    await writeFile(`${stem}.trace.json`, JSON.stringify(out[line.id].trace, null, 1) + '\n');
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await writeFormalLineEntryCheckpoints(process.argv[2] ? pathToFileURL(process.argv[2].replace(/\/?$/, '/')) : outputDir);
  for (const line of formalCheckpointLines) console.log(JSON.stringify(out[line.id].trace.at(-1)));
}
