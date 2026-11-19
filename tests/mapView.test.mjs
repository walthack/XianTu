// 新界面地图页的纯函数：把老地图面板三种弹窗（地点／势力／大陆）的内容拆成字框（同老弹窗的显示条件、文字、按钮）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { mapDetail } = await loadTs('../src/components/uiNew/mapView.ts');

const base = {
  selectedLocation: null, selectedContinent: null, travelPlayback: null,
  isFactionLocation: l => !!l.leadership, getLocationTypeName: t => (t === 'town' ? '城镇坊市' : t || '未知类型'),
  mapTravelNotice: '', selectedTravelRestriction: undefined, selectedTravelPreview: null,
  travelConfirmation: null, mapTravelBusy: false, isAIProcessing: false, isLoadingRegion: false,
};
const town = { id: 'a', name: '五原城', type: 'town', description: '城里', danger_level: '安全' };
const acts = d => d.actions.map(a => `${a.key}:${a.label}${a.disabled ? '(禁)' : ''}`);

test('没选中：null', () => {
  assert.equal(mapDetail(base), null);
});

test('地点：名字、说明、小字、前往＋区域地图', () => {
  const d = mapDetail({ ...base, selectedLocation: town, selectedTravelPreview: { description: '路上说明', label: '路程两日', arrival: '到时是傍晚' } });
  assert.equal(d.name, '五原城');
  assert.equal(d.body, '路上说明');
  assert.deepEqual(d.head, ['城镇坊市', '路程两日', '到时是傍晚']);
  assert.deepEqual(d.lines, ['安全等级：安全']);
  assert.deepEqual(acts(d), ['travel:前往此地', 'region:🗺️ 进入区域地图']);
});

test('地点：限制语时前往禁用；刚前往的提示优先于限制语', () => {
  const d = mapDetail({ ...base, selectedLocation: town, selectedTravelRestriction: '你已在此地。' });
  assert.equal(d.body, '城里');
  assert.deepEqual(d.head, ['城镇坊市', '你已在此地。']);
  assert.deepEqual(d.lines, ['安全等级：安全']);
  assert.deepEqual(acts(d), ['travel:前往此地(禁)', 'region:🗺️ 进入区域地图']);
  const d2 = mapDetail({ ...base, selectedLocation: town, selectedTravelRestriction: '你已在此地。', mapTravelNotice: '已抵达五原城' });
  assert.deepEqual(d2.head, ['城镇坊市', '已抵达五原城']);
});

test('地点：确认态多「取消」「确认前往」；忙或模型处理中禁用前往；区域生成中', () => {
  const d = mapDetail({ ...base, selectedLocation: town, travelConfirmation: 'k' });
  assert.deepEqual(acts(d), ['cancel:取消', 'travel:确认前往', 'region:🗺️ 进入区域地图']);
  assert.equal(d.head.at(-1), '确认前往此地？');
  assert.deepEqual(acts(mapDetail({ ...base, selectedLocation: town, isAIProcessing: true, isLoadingRegion: true })), ['travel:前往此地(禁)', 'region:⏳ 生成中...(禁)']);
});

test('地点：赶路回放时不显示（同老弹窗）；势力回放时照显示', () => {
  assert.equal(mapDetail({ ...base, selectedLocation: town, travelPlayback: {} }), null);
  const sect = { name: '青云门', leadership: { 宗主: '甲', 宗主修为: '元婴' }, 等级: '一流', 特色: ['剑', '丹'], 与玩家关系: '友好', 描述: '宗门' };
  const d = mapDetail({ ...base, selectedLocation: sect, travelPlayback: {} });
  assert.equal(d.name, '青云门');
  assert.equal(d.body, '宗门');
  assert.deepEqual(d.head, ['势力']);
  assert.deepEqual(d.lines, ['势力等级：一流', '掌门：甲（元婴）', '势力特色：剑、丹', '关系：友好']);
  assert.deepEqual(d.actions, []);
});

test('大陆：默认说明与各项', () => {
  const d = mapDetail({ ...base, selectedContinent: { name: '南荒', 气候: '湿热', 主要势力: ['白夷族'] } });
  assert.equal(d.body, '广袤的修仙大陆，蕴含无尽机缘与危险。');
  assert.deepEqual(d.head, ['大陆']);
  assert.deepEqual(d.lines, ['气候：湿热', '主要势力：白夷族']);
  assert.deepEqual(d.actions, []);
});
