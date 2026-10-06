import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';
import { evaluateLocationGate, loadStageLocationData } from '../scripts/validate-location-ids.mjs';

const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);

function builtinStages() {
  return readdirSync(dataDir)
    .filter(file => file.endsWith('.json'))
    .map(file => ({ file, mod: JSON.parse(readFileSync(new URL(file, dataDir), 'utf8')) }));
}

test('规范 id（主策划裁定）：别名并到规范侧；子地点算在父地点，反之不算', async () => {
  const { canonicalLocationId, sameCanonicalLocation, locationWithin, locationIdByRegisteredName, LOCATION_ID_ALIASES } =
    await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
  assert.equal(canonicalLocationId('lcq.location.command_tent'), 'lcq.location.shuai_zhang');
  assert.equal(canonicalLocationId('liuchao.location.biyu'), 'liuchao.location.biyu_village');
  assert.equal(canonicalLocationId('liuchao.location.guiwang_dong'), 'liuchao.location.gui_wang_dong');
  assert.equal(canonicalLocationId('liuchao.location.gui_wang_dong_palace'), 'liuchao.location.gui_wang_gong');
  assert.equal(canonicalLocationId('liuchao.location.bai_yi_valley'), 'liuchao.location.baiyi');
  assert.equal(canonicalLocationId('lcq.location.longchi'), 'liuchao.location.longchi');
  assert.equal(canonicalLocationId(undefined), undefined);
  assert.equal(sameCanonicalLocation('liuchao.location.xiong_er_pu', 'liuchao.location.xiongerpu'), true);
  assert.equal(sameCanonicalLocation(undefined, undefined), false);
  for (const target of Object.values(LOCATION_ID_ALIASES)) assert.equal(LOCATION_ID_ALIASES[target], undefined, target);

  assert.equal(locationWithin('liuchao.location.sea_temple', 'liuchao.location.biyu'), true, '海神殿属碧鲮');
  assert.equal(locationWithin('liuchao.location.biyu_village', 'liuchao.location.sea_temple'), false);
  assert.equal(locationWithin('liuchao.location.gui_wang_gong.jingshen_tai', 'liuchao.location.gui_wang_dong'), true);
  assert.equal(locationWithin('liuchao.location.guiwang_dong', 'liuchao.location.gui_wang_gong'), false, '进峒≠到宫');
  assert.equal(locationWithin('liuchao.location.gui_wang_dong_palace', 'liuchao.location.gui_wang_gong'), true);
  assert.equal(locationIdByRegisteredName('白夷谷'), 'liuchao.location.baiyi');
  assert.equal(locationIdByRegisteredName('白夷族'), 'liuchao.location.baiyi');
});

test('地点 id 校验关：当前数据只剩已登记问题，名单每项字段齐全且没有过期项', async () => {
  const { failures, invalidEntries, stale, warnings } = await evaluateLocationGate();
  assert.deepEqual(failures.map(item => item.key), []);
  assert.deepEqual(invalidEntries, []);
  assert.deepEqual(stale.map(item => item.key), []);
  assert.ok(warnings.some(item => item.key === 'coordinate_conflict:liuchao.location.gui_wang_gong'), '鬼王宫坐标待校准须登记');
  assert.ok(warnings.some(item => item.key === 'coordinate_conflict:liuchao.location.longchi'), '龙池坐标待校准须登记');
});

test('地点 id 校验关：新问题直接失败；不许豁免的类型登记了也失败', async () => {
  const stages = loadStageLocationData();
  const { failures } = await evaluateLocationGate({ stages, known: [] });
  assert.ok(failures.length > 0 && failures.every(item => item.reason === '未登记的新问题'));

  const broken = structuredClone(stages);
  const stage = broken.find(item => item.modId === 'lcq.stage_04b_lingfei_baiyi_crisis');
  stage.eventLocations = [...stage.eventLocations, { eventId: 'lcq.event.fake', locationId: 'liuchao.location.nowhere' }];
  const known = [{ key: 'event_ref_broken:liuchao.location.nowhere', kind: 'event_ref_broken', locationIds: ['liuchao.location.nowhere'], reason: 'x', closeWhen: 'y' }];
  const result = await evaluateLocationGate({ stages: broken, known });
  assert.ok(result.failures.some(item => item.kind === 'event_ref_broken' && item.reason === '不许豁免'));
  assert.equal(result.invalidEntries.length, 1, '不许豁免的类型不能进名单');

  const { auditLocationIds } = await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
  const kinds = auditLocationIds([{ file: 'x', locations: [{ id: 'a', name: '甲' }], eventLocations: [] }], { a: 'a', b: 'c', c: 'b', d: 'zz' })
    .map(item => item.kind).sort();
  // b↔c 成环（同一对只报一次）、a 自指、c 与 zz 不存在。
  assert.deepEqual(kinds, ['alias_cycle', 'alias_self', 'alias_target_missing', 'alias_target_missing']);
});

test('auditLocationIds：父子地点允许共用锚点；南荒多边形只管南荒地点', async () => {
  const { auditLocationIds } = await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
  const bounds = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  const issues = auditLocationIds([{
    file: 'x',
    continents: [{ id: 'liuchao.continent.nanhuang', bounds }],
    eventLocations: [],
    locations: [
      { id: 'liuchao.location.biyu_village', name: '碧鲮族', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 5, y: 5 } },
      { id: 'liuchao.location.sea_temple', name: '海神殿', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 5, y: 5 } },
      { id: 'out', name: '外', continentId: 'liuchao.continent.nanhuang', coordinates: { x: 50, y: 5 } },
      { id: 'zhongzhou', name: '中州某地', continentId: 'liuchao.continent.zhongzhou', coordinates: { x: 50, y: 50 } },
      { id: 'a', name: '某寨', coordinates: { x: 1, y: 2 } },
      { id: 'b', name: '某寨', coordinates: { x: 1, y: 2 } },
      { id: 'nocoord', name: '无坐标', region: '南荒' },
    ],
  }], {});
  assert.deepEqual(issues.map(item => `${item.kind}:${item.ids.join('+')}`).sort(), [
    'missing_coordinates:nocoord',
    'outside_nanhuang:out',
    'shared_anchor:a+b',
    'unaliased_duplicate:a+b',
  ]);
});

test('每个事件与开场的 locationId 都在本关 canon.locations 里', () => {
  for (const { file, mod } of builtinStages()) {
    const ids = new Set((mod.canon?.locations || []).map(item => item.id));
    for (const event of mod.scenario?.events || []) {
      if (event.locationId) assert.ok(ids.has(event.locationId), `${file} ${event.id} → ${event.locationId}`);
    }
    const opening = mod.scenario?.opening?.locationId;
    if (opening) assert.ok(ids.has(opening), `${file} opening → ${opening}`);
  }
});

test('currentLocation 与旧解析同口径：原来能解析的串结果不变，另给大陆与规范 id', async () => {
  const { resolveLocationIdFromPosition } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const { currentLocation, locationFromPosition } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const locations = [
    { id: 'liuchao.location.biyu', name: '碧鲮族' },
    { id: 'a', name: '白夷' },
    { id: 'b', name: '白夷谷' },
  ];
  for (const text of ['南荒·碧鲮族', '南荒·白夷谷', '南荒·白夷', '']) {
    assert.equal(locationFromPosition(text, locations).locationId, resolveLocationIdFromPosition(text, locations), String(text));
  }
  assert.deepEqual(locationFromPosition('南荒·碧鲮族', locations), {
    text: '南荒·碧鲮族',
    continent: '南荒',
    locationId: 'liuchao.location.biyu',
    canonicalLocationId: 'liuchao.location.biyu_village',
  });
  assert.deepEqual(locationFromPosition('帅帐', undefined), { text: '帅帐', continent: '' });
  const save = { 角色: { 位置: { 描述: '南荒·白夷谷' } }, 世界: { 状态: { 剧本模组: { canon: { locations } } } } };
  assert.equal(currentLocation(save).locationId, 'b', '缺省取存档运行时的正典地点');
  assert.equal(currentLocation(save, []).locationId, 'liuchao.location.baiyi', '正典里没有时按规范名解析');
});

test('位置串：五原区内节点→五原城；「南荒·海神殿」→碧鲮族＋海神殿；规范名／显示别名可解析；其余解析不出', async () => {
  const { locationFromPosition } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const locations = [
    { id: 'liuchao.location.wuyuan', name: '五原城' },
    { id: 'lcq.location.baihu', name: '白湖商馆' },
  ];
  const at = text => locationFromPosition(text, locations);
  assert.deepEqual(at('中州·五原·点心铺'), {
    text: '中州·五原·点心铺', continent: '中州',
    locationId: 'liuchao.location.wuyuan', canonicalLocationId: 'liuchao.location.wuyuan',
    zoneId: 'lcq.zone.wuyuan.pastry_shop',
  });
  assert.equal(at('中州·五原·五原露天市集').zoneId, 'lcq.zone.wuyuan.market');
  assert.equal(at('中州·五原·水牢').zoneId, 'lcq.zone.wuyuan.water_prison', '别名也认');
  assert.equal(at('中州·五原·白湖商馆水牢').locationId, 'lcq.location.baihu', '原来能解析的串结果不变');
  assert.deepEqual(at('南荒·海神殿'), {
    text: '南荒·海神殿', continent: '南荒',
    locationId: 'liuchao.location.biyu_village', canonicalLocationId: 'liuchao.location.biyu_village',
    zoneId: 'nh.sea_temple',
  });
  assert.equal(at('南荒·碧鲮族·海神殿').zoneId, 'nh.sea_temple');
  assert.equal(at('南荒·白夷族').locationId, 'liuchao.location.baiyi');
  assert.equal(at('南荒·鬼王峒宫殿').canonicalLocationId, 'liuchao.location.gui_wang_gong');
  for (const text of ['中州·五原·城外乱葬岗', '中州·别处·点心铺', '五原·点心铺', '中州·海神殿', '南荒途中·铁索桥']) {
    assert.equal(at(text).locationId, undefined, text);
  }
});
