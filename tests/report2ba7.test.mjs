// REPORT-8091-2ba71102 复测新问题回归：P2-A 手打跨国目的地点名地图落点（不在地图上按该国代表地点）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const read = async p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const fixture = async name => JSON.parse(await read(`tests/fixtures/checkpoints/current-${name}.json`)).saves[0].存档数据;

// ---------- P2-A 手打跨国目的地 ----------
test('P2-A 汉线舞都手打「我要去大明宫」：不是罗盘动作，提示「先开地图去长安」并写到后再去大明宫', async () => {
  const s = R.advanceScenarioRuntime(await fixture('han-entry')).saveData;
  assert.equal(s.角色.位置.locationId, 'liuchao.location.wudu');
  for (const text of ['我要去大明宫', '去大明宫']) {
    assert.equal(R.resolveStoryEventActionFromPlayerText(structuredClone(s), text), undefined, '手打路径，不经罗盘');
    assert.equal(M.mapPreparationNotice(s, text), '跨国出行请先开地图去长安，到后再前往大明宫', text);
    assert.match(M.mapPreparation(s, text), /打开地图选择前往长安的已开放路线，到后再前往大明宫/);
    assert.match(M.mapPreparationToast(s, text), /请打开地图前往长安/);
  }
  // 地图落点本身：直说该地；只说国别：取该国代表地点。
  assert.equal(M.mapPreparationNotice(s, '我要去长安'), '跨国出行请先开地图去长安');
  assert.equal(M.mapPreparationNotice(s, '我准备去唐国'), '跨国出行请先开地图去长安');
  assert.equal(M.mapPreparationNotice(s, '我要去临安'), '跨国出行请先开地图去临安');
  // 国内、否定不提示。
  assert.equal(M.mapPreparationNotice(s, '我不去大明宫'), undefined);
  assert.equal(M.mapPreparationNotice(s, '去洛都'), undefined);
});

test('P2-A 文案来自 mod-kit 配置；发送时 toast 走 mapPreparationToast，不写死通用句', async () => {
  const ui = JSON.parse(await read('mod-kit/cross-country-travel-ui.json'));
  for (const key of ['preparationDirect', 'preparationVia', 'toast', 'noticeDirect', 'noticeVia', 'genericNotice', 'genericToast']) assert.equal(typeof ui[key], 'string', key);
  const src = await read('src/modules/scenarioMods/travel/mapTravel.ts');
  assert.doesNotMatch(src, /跨国出行请|你正在准备前往/, '文案不写死在代码里');
  const panel = await read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /crossCountryStoryTravelToast\(crossCountryTravel\) : mapPreparationToast\(mapPrepSave!, userMessage\)/);
  assert.doesNotMatch(panel, /跨国旅行请打开地图选择路线/);
});
