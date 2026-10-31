// 真机 REPORT-8091-fbef6792 整轮复测修复（2026-10-31）。测试名前的圈号对应工单 ①–⑨。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const stageJson = id => JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`));

// ① 地图同点 ───────────────────────────────────────────────
/** 按 gameMapManager.addLocation 的真实底图画法估算一个城池标记的图标框与标签框（scale 2.5：图标 ×1.75、半径 21；标签字号 40、y=50）。 */
function cityMarkerBoxes(center, name) {
  const r = 21 * 1.75, w = name.length * 40 + 6, h = 52;
  return [{ x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r }, { x: center.x - w / 2, y: center.y + 50, width: w, height: h }];
}
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('① 草原独立坐标／五原同点组：真机点击路径（pickMapMarker）点图标或标签都开各自地点，标记整块互不压盖', async () => {
  const C = await loadTs('../src/utils/coordinateConverter.ts');
  const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  // 地图面板 loadMapData 的顺序：跨国代表点标记在前，再接关内地点（五原城是代表点，排第 0 留原点）。
  const drawn = M.withMapCapitalMarkers(stageJson('lcq.stage_01').canon.locations);
  const group = drawn.filter(l => C.coLocatedMarkerKey(l.coordinates) === '881:4366');
  assert.deepEqual(group.map(l => l.name), ['五原城', '帅帐', '龙池']);
  const targets = group.map((l, i) => {
    const o = C.coLocatedMarkerOffset(i), center = { x: 881 + o.x, y: 4366 + o.y };
    return { center, boxes: cityMarkerBoxes(center, l.name), data: l.name };
  });
  const grass = drawn.find(l => l.name === '草原');
  targets.push({ center: grass.coordinates, boxes: cityMarkerBoxes(grass.coordinates, grass.name), data: grass.name });
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    for (const a of targets[i].boxes) for (const b of targets[j].boxes) assert.ok(!overlap(a, b), `${targets[i].data}/${targets[j].data} 的图标或标签不得压盖`);
  }
  for (const t of targets) {
    const [icon, label] = t.boxes;
    assert.equal(C.pickMapMarker(t.center, targets), t.data, `点 ${t.data} 图标`);
    assert.equal(C.pickMapMarker({ x: label.x + 8, y: label.y + label.height / 2 }, targets), t.data, `点 ${t.data} 标签左端`);
    assert.equal(C.pickMapMarker({ x: label.x + label.width - 8, y: label.y + 8 }, targets), t.data, `点 ${t.data} 标签右端`);
    assert.equal(C.pickMapMarker({ x: icon.x + 4, y: icon.y + icon.height / 2 }, targets), t.data, `点 ${t.data} 图标边缘`);
  }
  // 根因复现：旧版（半径 80 小圆周＋只按最近中心、半径 50）点草原标签左端会命中五原城。
  const oldAngles = [null, -45, -135, 0];
  const oldTargets = ['五原城', '草原', '帅帐', '龙池'].map((name, i) => {
    const l = {name};
    const a = oldAngles[i], center = a === null ? { x: 881, y: 4366 } : { x: 881 + Math.round(Math.cos(a * Math.PI / 180) * 80), y: 4366 + Math.round(Math.sin(a * Math.PI / 180) * 80) };
    return { center, boxes: [], data: l.name };
  });
  const oldGrassLabel = cityMarkerBoxes(oldTargets[1].center, '草原')[1];
  assert.equal(C.pickMapMarker({ x: oldGrassLabel.x + 8, y: oldGrassLabel.y + 8 }, oldTargets), '五原城', '旧画法的根因');
  // 空白处不误中
  assert.equal(C.pickMapMarker({ x: 881 + 600, y: 4366 + 600 }, targets), null);
  const manager = read('src/utils/gameMapManager.ts');
  assert.match(manager, /const hit = pickMapMarker\(\{ x: worldX, y: worldY \}, targets\);/, '真机点击路径走 pickMapMarker');
  assert.match(manager, /boxes: this\.locationHitBoxes\(child as PIXI\.Container\)/);
  assert.match(manager, /\(locationContainer as any\)\.hitParts = \{ icon, label \};/);
  assert.match(manager, /location\.coordinates = resolvedCoordinates;/, '地点坐标仍是真坐标，路程不变');
  assert.doesNotMatch(manager, /nearestDistance < 50/, '旧的最近中心判定已移除');
});

// ② 存档槽时间 ─────────────────────────────────────────────
/** 照 characterStore.saveSlots 给面板的槽补展示兜底（境界 凡人／位置 未知）。 */
const enhanceLikeStore = slot => ({ ...slot, 境界: slot.境界 || '凡人', 位置: slot.位置 || '未知', 保存时间: slot.保存时间 || null, 最后保存时间: slot.最后保存时间 ?? slot.保存时间 ?? null });

test('② 时间点存档／上次对话：面板拿到的是 store 补过兜底的槽，空槽仍判空；有数据缺槽位时间时退到 元数据.更新时间', async () => {
  const D = await loadTs('../src/utils/saveSlotDisplay.ts');
  const G = await loadTs('../src/utils/lastConversationGuard.ts');
  const store = read('src/stores/characterStore.ts');
  assert.match(store, /境界: slot\.境界 \|\| displayInfo\.境界 \|\| '凡人',/, '根因：saveSlots 给每个槽补了 凡人／未知');
  // 时间点存档（默认关闭，从未写入）
  const timeSlot = enhanceLikeStore({ 存档名: '时间点存档', 保存时间: null, 存档数据: null });
  assert.equal(D.isEmptySaveSlot(timeSlot), true, '补过兜底的空槽仍判空');
  assert.equal(D.saveSlotDetail(timeSlot, '境界'), '尚未写入');
  assert.equal(D.saveSlotDetail(timeSlot, '位置'), '尚未写入');
  // 上次对话：写过→读别的档被清空
  const written = { 存档名: '上次对话', 保存时间: '2026-10-31T11:40:00.000Z', 最后保存时间: '2026-10-31T11:40:00.000Z', 存档数据: { 元数据: { 更新时间: '2026-10-31T11:40:00.000Z' } }, 境界: '无修为', 位置: '江州·下游码头', 游戏内时间: '1年3月2日', 修为进度: 3, 回滚来源槽位: '存档1', 角色名字: '程宗扬' };
  assert.equal(D.saveSlotModifiedAt(written), '2026-10-31T11:40:00.000Z');
  const cleared = G.clearedLastConversationSlot(written);
  assert.equal(G.isClearedLastConversationSlot('上次对话', cleared), true);
  assert.equal(G.isClearedLastConversationSlot('存档1', cleared), false, '只针对上次对话');
  assert.equal(G.isClearedLastConversationSlot('上次对话', written), false);
  for (const k of ['境界', '位置', '游戏内时间', '修为进度']) assert.ok(!(k in cleared), `清空后不留 ${k}`);
  assert.equal(cleared.角色名字, '程宗扬');
  const shown = enhanceLikeStore(cleared);
  assert.equal(D.isEmptySaveSlot(shown), true);
  assert.equal(D.saveSlotDetail(shown, '位置'), '尚未写入');
  assert.match(D.emptySaveSlotHint(shown, false), /下一次发送对话前会自动写入/);
  // REPORT89：磁盘内容允许回填展示；回滚资格仍须来源章
  assert.match(store, /if \(slot && !slot\.存档数据\) \{/);
  // 旧槽有数据没有槽位时间：退到存档自带 元数据.更新时间／创建时间，不再显示「未知」
  const legacy = enhanceLikeStore({ 存档名: '上次对话', 保存时间: null, 存档数据: { 元数据: { 创建时间: '2026-10-30T01:00:00.000Z', 更新时间: '2026-10-31T11:41:00.000Z' } } });
  assert.equal(D.isEmptySaveSlot(legacy), false);
  assert.equal(D.saveSlotModifiedAt(legacy), '2026-10-31T11:41:00.000Z');
  assert.equal(D.saveSlotCreatedAt(legacy), '2026-10-30T01:00:00.000Z');
  assert.equal(D.saveSlotModifiedAt({ 存档名: '存档1', 保存时间: 'a', 最后保存时间: 'b' }), 'b');
  assert.equal(D.saveSlotModifiedAt(timeSlot), null);
  // 手动存档写档同步 最后保存时间；面板各处时间都走同一函数
  assert.match(store, /slot\.最后保存时间 = slot\.保存时间;/);
  const panel = read('src/components/dashboard/SavePanel.vue');
  assert.equal((panel.match(/formatTime\(saveSlotModifiedAt\((?:save|currentSave)\)\)/g) || []).length, 3);
  assert.match(panel, /formatTime\(saveSlotCreatedAt\(currentSave\)\)/);
  assert.doesNotMatch(panel, /formatTime\((?:save|currentSave)\.(?:最后)?保存时间/);
});

// ③ 占位标记 ───────────────────────────────────────────────
test('③ 【扩写】【扩写·待剧情策划】对玩家只隐藏标记、文字保留；配置原文不动；右栏与叙事显示都走同一替换', async () => {
  const W = await loadTs('../src/utils/narrativeMetaWords.ts');
  const { FESTIVAL } = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
  assert.match(FESTIVAL.warning, /^【扩写】/, '数据里的占位标记保留给剧情策划');
  assert.match(FESTIVAL.transition, /^【扩写·待剧情策划】/);
  assert.equal(W.playerFacingText(FESTIVAL.warning), FESTIVAL.warning.replace('【扩写】', ''));
  assert.equal(W.playerFacingText(FESTIVAL.transition), '你决定赴黑魔海，圣教大祭由此开始。');
  assert.equal(W.playerFacingText(FESTIVAL.blocked), '秦地之事尚未了结，请先完成秦线，再赴黑魔海大祭。');
  for (const text of [FESTIVAL.warning, FESTIVAL.transition, FESTIVAL.blocked]) assert.doesNotMatch(W.playerFacingText(text), /【|扩写/);
  // 叙事中段出现也去掉（MainGamePanel 只剥开头一个【…】）
  assert.equal(W.stripNarrativeMetaWords('程宗扬抬头。【扩写·待剧情策划】你决定赴黑魔海。'), '程宗扬抬头。你决定赴黑魔海。');
  assert.equal(W.stripNarrativeMetaWords('【第三日】风起'), '【第三日】风起', '别的方括号不动');
  const sidebar = read('src/components/dashboard/RightSidebar.vue');
  assert.match(sidebar, /warning: playerFacingText\(view\.warning\), blocked: playerFacingText\(view\.blocked\), transition: playerFacingText\(view\.transition\)/);
  assert.match(sidebar, /festivalError\.value = playerFacingText\(result\.note\)/);
  assert.match(read('src/components/dashboard/MainGamePanel.vue'), /content: stripNarrativeMetaWords\(/);
});

// ④ 右栏原始 ID ────────────────────────────────────────────
test('④ 编年史跨关继承拍只记了 id：右栏显示事件中文名，查不到给可读兜底，不再露 id', async () => {
  const W = await loadTs('../src/utils/narrativeMetaWords.ts');
  const { readdirSync } = await import('node:fs');
  const mods = readdirSync(new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => stageJson(f.replace(/\.json$/, '')));
  const index = W.eventNameIndex(mods);
  // 真机入秦档（make-test-saves qin-entry）的三条编年史 title
  const titles = ['lcq.event.s05b_wuer_suli_depart', 'lcq.event.s09_10_separation', 'lyl.event.taiquan_sacred_fruit_06'];
  assert.deepEqual(titles.map(t => W.playerFacingText(t, id => index.get(id))), ['二爷离队', '失散收束', '盘江股东大会']);
  assert.equal(W.playerFacingText('lcq.event.not_a_real_beat', id => index.get(id)), W.UNNAMED_EVENT_LABEL);
  assert.equal(W.playerFacingText('世界自行推进', id => index.get(id)), '世界自行推进', '普通标题不动');
  assert.equal(W.displayEventIds('来报：liuchao.event.black_sea_approach 已过', id => index.get(id)), `来报：${index.get('liuchao.event.black_sea_approach')} 已过`);
  for (const mod of mods) for (const event of mod.scenario.events || []) assert.equal(W.displayEventIds(event.id, id => index.get(id)), event.name, `${event.id} 有中文名`);
  const sidebar = read('src/components/dashboard/RightSidebar.vue');
  assert.match(sidebar, /title: playerFacingText\(String\(item\.title\), id => chronicleEventName\(rt, id\)\)/);
  assert.match(sidebar, /builtinEventNames \|\|= eventNameIndex\(BUILTIN_SCENARIO_MODS as any\)/);
  assert.match(sidebar, /worldDelta: playerFacingText\(item\.worldDelta, id => chronicleEventName\(rt, id\)\)/);
});

// ⑤ 开祭按钮 ───────────────────────────────────────────────
test('⑤ 开祭按钮名统一为「开启大祭」：权威分包、合并物、运行时常量一致，源码无旧名', async () => {
  const { FESTIVAL } = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
  assert.equal(FESTIVAL.label, '开启大祭');
  assert.equal(JSON.parse(read('mod-kit/numbers-progress.json')).story.lineCompass.festival.label, '开启大祭');
  assert.equal(JSON.parse(read('mod-kit/game-numbers.qingyu.json')).story.lineCompass.festival.label, '开启大祭');
  assert.match(read('src/components/dashboard/RightSidebar.vue'), /@click="beginFestival">\{\{ FESTIVAL\.label \}\}<\/button>/);
  assert.match(read('docs/ERROR-CODES.md'), /右栏点击「开启大祭」/);
  const { execSync } = await import('node:child_process');
  const hits = execSync('git grep -l "黑魔海大祭开始" -- src mod-kit/*.json scripts || true', { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
  assert.equal(hits, '', `仍有旧按钮名：${hits}`);
});

// ⑥ 入秦后目标与顶栏 ───────────────────────────────────────
test('⑥ 口信投递后直接点地图入秦：口信拍记完成、目标切到秦线当前拍「入咸阳」，顶栏位置「秦·咸阳」；旧档读档补修', async () => {
  const { CONTENT_PACKS: packs } = await loadTs('../src/modules/contentPacks/index.ts');
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime, getScenarioFocusEvent } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { selectMapTravel, settleMapTravel } = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  const { applyLoadRepairs, repairLingeringMapEntryMessage } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
  const entry = packs.mapEntries.find(e => e.id === 'qin');
  const closers = ['nanhuang', 'jin', 'song'].map(id => packs.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5));
  const init = buildStrictScenarioInitialization(stageJson('lcq.stage_07_qingyuan_jiankang'));
  init.runtimeState.completedEventIds = [...closers];
  let s = { 元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 12, 分钟: 0 } }, 角色: { 身份: {}, 属性: {}, 位置: init.initialLocation, 背包: { 金钱: {}, 物品: {} } }, 社交: { 关系: {} }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: init.runtimeState } } };
  s = advanceScenarioRuntime(s).saveData;
  const rt = save => save.世界.状态.剧本模组;
  assert.ok(rt(s).activeEventIds.includes(entry.eventId), '口信已投递、未选择（真机 qin-entry 档即此态）');
  assert.ok(!rt(s).completedEventIds.includes(entry.eventId));
  const selection = selectMapTravel(s, entry.locationId);
  assert.equal(settleMapTravel(s, selection), true);
  assert.equal(rt(s).modId, entry.stageId);
  assert.ok(rt(s).completedEventIds.includes(entry.eventId), '入关即记口信完成');
  assert.ok(!rt(s).activeEventIds.includes(entry.eventId));
  assert.equal(s.系统.扩展.mapEntryMessages[entry.id].done, true);
  const focus = getScenarioFocusEvent(rt(s));
  assert.equal(focus?.id, 'liuchao.event.qin_enter_xianyang');
  assert.match(String(focus.objective), /咸阳落脚/);
  assert.doesNotMatch(String(focus.objective), /决定何时前往咸阳/);
  assert.equal(s.角色.位置.描述, '秦·咸阳', '与普通地图抵达同口径「国别·地名」，不再是开场的「中州·咸阳」');
  // 旧版入秦留下的档：口信拍仍是当前拍、描述中州·咸阳 → 读档补修
  const stale = structuredClone(s);
  rt(stale).completedEventIds = rt(stale).completedEventIds.filter(id => id !== entry.eventId);
  rt(stale).activeEventIds = [entry.eventId];
  delete stale.系统.扩展.mapEntryMessages;
  stale.角色.位置.描述 = '中州·咸阳';
  assert.equal(getScenarioFocusEvent(rt(stale))?.id, entry.eventId, '复现：旧档主线停在口信');
  applyLoadRepairs(stale);
  assert.ok(rt(stale).completedEventIds.includes(entry.eventId));
  assert.equal(getScenarioFocusEvent(rt(stale))?.id, 'liuchao.event.qin_enter_xianyang');
  assert.equal(stale.角色.位置.描述, '秦·咸阳');
  const once = structuredClone(stale);
  assert.equal(repairLingeringMapEntryMessage(stale), 0, '幂等');
  assert.deepEqual(stale, once);
  // 不在秦关、没入口续点的档不动
  const untouched = advanceScenarioRuntime({ ...structuredClone(s), 系统: { 扩展: {} } }).saveData;
  assert.equal(repairLingeringMapEntryMessage(untouched), 0);
});

// ⑦ 技能面板修炼速度 ───────────────────────────────────────
test('⑦ 技能面板「速度」：修炼速度加成按 fraction_increment（×(1+加成)）乘品质倍率，与 formatCultivationSpeedBonus 同格式', async () => {
  const C = await loadTs('../src/utils/cultivationSpeedCalculator.ts');
  const { techniqueNumbersOf } = await loadTs('../src/data/techniqueQuality.ts');
  const tiers = JSON.parse(read('mod-kit/item-grades.json')).technique.tiers;
  assert.equal(JSON.parse(read('mod-kit/numbers-progress.json')).techniques.cultivationSpeedBonus.semantics, 'fraction_increment');
  // 凡品倍率 1.0：面板与背包/闭关弹窗完全同字（真机功法 0.56 → +56%，旧版显示「0.6%/日」）
  assert.equal(tiers.fan.speedBonus, 1);
  assert.equal(C.formatTechniqueCultivationSpeed(tiers.fan.speedBonus, 0.56), C.formatCultivationSpeedBonus(0.56));
  assert.equal(C.formatTechniqueCultivationSpeed(tiers.fan.speedBonus, 0.56), '+56%');
  assert.equal(C.formatTechniqueCultivationSpeed(1, -0.44), '-44%');
  assert.equal(C.formatTechniqueCultivationSpeed(1, undefined), '+0%', '无加成不再按 ×1 当成 100%');
  // 品质倍率叠乘：真品 1.3 × 1.56 = 2.028 → +103%
  assert.equal(C.formatTechniqueCultivationSpeed(tiers.zhen.speedBonus, 0.56), '+103%');
  assert.equal(C.formatTechniqueCultivationSpeed(tiers.shen.speedBonus, 0), '+200%');
  assert.equal(C.formatTechniqueCultivationSpeed(techniqueNumbersOf(undefined).speedBonus, 0.2), C.formatCultivationSpeedBonus(techniqueNumbersOf(undefined).speedBonus * 1.2 - 1));
  assert.equal(C.techniqueCultivationSpeedBonus(NaN, 0.1).toFixed(2), '0.10', '倍率异常按 1');
  const panel = read('src/components/dashboard/SkillsPanel.vue');
  assert.match(panel, /return formatTechniqueCultivationSpeed\(getQualitySpeedBonus\(technique\.品质\?\.quality\), technique\.功法效果\?\.修炼速度加成\);/);
  assert.doesNotMatch(panel, /修炼速度加成 \|\| 1/);
  assert.doesNotMatch(panel, /%\/日/);
});

// ⑧ Demo 合并短语 ≤8 ───────────────────────────────────────
/** 真机 /tmp/pt/r/69ab-play.txt 的 A/B/R 段玩家原话（草原开场，盾阵护段强）。 */
const REAL_69AB_INPUTS = ["我一把拽起段强，压低身子朝秦军阵线方向狂奔", "我护着段强冲向秦军阵线，借倒伏尸体掩护", "我压低盾牌诱敌靠近，再带段强冲入秦军阵线", "我举盾挡住横扫的长矛，护着段强向秦军缺口冲去", "我滚向坡侧捡回盾牌，让段强退向弩手阵地", "我借土坎掩护拖回盾牌，避开落矛", "我侧身避开直落长矛，随即回盾护住段强", "举盾贴地护段强退回弩手身后", "我护住段强，沿骑兵空档贴地侧移", "我举盾挡箭，压低段强向拒马后侧滚", "我以盾顶开长矛，带段强滚入后阵", "我割断背包带子，带段强滚入盾阵后撤", "我举盾挡住侧坡长矛，沿盾列继续后撤", "我贴地挪向段强，架盾撞开长矛", "我举盾挡开长矛，钻过缺口与段强会合", "我借盾护住段强，观察敌阵并寻找突围缺口", "我高喊弩手封住侧坡，带段强沿盾缝后撤", "我在盾阵后寻得隐蔽处，闭关修炼七日。", "我先去取回遗落在盾阵前沿的行囊", "我先取回遗落在盾阵前沿的行囊", "我趁盾叶错步取回行囊，随伤兵后队赴五原城。", "我挑开断刺，拖回行囊后随伤兵撤离", "我顺木纹向外挑刺，让段强同步拖出行囊", "我借盾兵压住横木，再挑出肩带取回行囊", "趁势挑开肩带收回行囊", "我借盾叶再压横木半息，趁机彻底拖出行囊", "借盾缘割断末圈肩带", "我割断末圈肩带，与段强沿旧驿道撤往五原城", "我沿旧驿道跟随残旗撤往五原城"];
test('⑧ 清羽 Demo 合并后 s01_02/03/05 压回 ≤8、stage_02 无空 rejectIf，校验器对合并结果 0 报错；内置/overlay/manifest 一致，旧档读档替换', async () => {
  const P = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const V = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { applyLoadRepairs } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
  const { applyCanonAuthorityOverlay } = await import('../scripts/canon-authority-overlay.mjs');
  const { S01_DEMO_INTENT_MATCH, builtinManifestVersion } = await import('../scripts/dev/apply-s01-demo-intent-match.mjs');
  const stage01 = stageJson('lcq.stage_01'), stage02 = stageJson('lcq.stage_02');
  const demoSave = () => P.createQingyuOpeningPlaytestSave(V.parseScenarioMod(stageJson('lcq.stage_01')), '2026-10-31T09:08:20.813Z');
  const merged01 = { ...structuredClone(stage01), scenario: { ...stage01.scenario, events: demoSave().世界.状态.剧本模组.events } };
  const merged02 = { ...structuredClone(stage02), scenario: { ...stage02.scenario, events: P.overlayQingyuStage02Opening(V.parseScenarioMod(stage02)).scenario.events } };
  for (const mod of [merged01, merged02]) {
    const result = V.validateScenarioMod(mod);
    assert.deepEqual(result.issues.map(i => `${i.path} ${i.code}`), [], `${mod.manifest.id} 合并结果 0 报错`);
    for (const event of mod.scenario.events) for (const action of event.playerCompletionContract?.actions || []) {
      const intent = action.intentMatch;
      if (!intent) continue;
      for (const key of ['matchAny', 'matchAll', 'rejectIf']) if (key in intent) assert.ok(intent[key].length >= 1 && intent[key].length <= 8, `${event.id}/${action.id}.${key}=${intent[key].length}`);
    }
  }
  const intentOf = (mod, id) => mod.scenario.events.find(e => e.id === id).playerCompletionContract.actions.find(a => a.id === 'advance_declared_objective').intentMatch;
  for (const [id, { before, after }] of Object.entries(S01_DEMO_INTENT_MATCH)) {
    assert.deepEqual(intentOf(stage01, id), after, `${id} 内置＝合并后 ≤8`);
    assert.deepEqual(intentOf(merged01, id), after, `${id} Demo 不再追加`);
    assert.ok(before.matchAny.length + after.matchAny.length > 8);
  }
  // 测试与任务栏钉住的短语仍在
  assert.ok(intentOf(merged01, 'lcq.event.s01_03').matchAny.includes('见月霜'));
  for (const p of ['去帅帐', '见王哲', '请王哲诊治']) assert.ok(intentOf(merged01, 'lcq.event.s01_05').matchAny.includes(p), p);
  // 删掉的短语：对真机原话 0 命中，或被留下的短语严格包含（子串）
  const norm = s => s.replace(/[\s\p{P}\p{S}]/gu, '');
  const realInputs = REAL_69AB_INPUTS.map(norm);
  const DEMO = { 'lcq.event.s01_02': ['带段强躲开', '拉段强避箭', '掩护段强', '寻找掩护', '躲开半兽人', '避开箭袭'], 'lcq.event.s01_03': ['见月霜', '上前查看伤者', '看看那个伤兵', '查看伤者', '扶住伤者', '救那个伤兵'], 'lcq.event.s01_05': ['去帅帐', '前往帅帐', '走进帅帐', '见王哲', '请他看伤', '说明自己的来历'] };
  for (const [id, { before, after }] of Object.entries(S01_DEMO_INTENT_MATCH)) {
    for (const dropped of [...before.matchAny, ...DEMO[id]].filter(p => !after.matchAny.includes(p))) {
      const redundant = after.matchAny.some(k => norm(dropped).includes(norm(k)));
      assert.ok(redundant || !realInputs.some(i => i.includes(norm(dropped))), `${id} 删掉的「${dropped}」不得是真机命中词`);
    }
  }
  // stage_02 原来 7 个空 rejectIf
  const empties = merged02.scenario.events.flatMap(e => (e.playerCompletionContract?.actions || []).filter(a => Array.isArray(a.intentMatch?.rejectIf) && !a.intentMatch.rejectIf.length));
  assert.equal(empties.length, 0);
  // overlay：把新 op 的 from 写回当前内置关再套 overlay，必须还原当前内置关（canon:build 从生成源重建时保留）
  const overlay = JSON.parse(read('mod-kit/canon-authority-overlays/lcq.stage_01.json'));
  const ops = overlay.ops.filter(op => Object.keys(S01_DEMO_INTENT_MATCH).some(id => op.path.startsWith(`scenario.events[id=${id}].`)));
  assert.equal(ops.length, 3);
  const rewound = structuredClone(stage01);
  for (const [id, { before }] of Object.entries(S01_DEMO_INTENT_MATCH)) intentOf(rewound, id).matchAny = structuredClone(before.matchAny);
  applyCanonAuthorityOverlay(rewound, { ...overlay, ops });
  assert.deepEqual(rewound, stage01);
  assert.equal(JSON.parse(read('src/modules/scenarioMods/builtins/manifest.json')).version, builtinManifestVersion(), 'manifest version＝内容哈希');
  // 旧档：正式开局档（改前内置值）与 Demo 档（追加后超 8）读档都换成新值；有过尝试的拍不动
  for (const variant of ['before', 'demoMerged']) {
    const save = demoSave();
    const rt = save.世界.状态.剧本模组;
    for (const [id, { before }] of Object.entries(S01_DEMO_INTENT_MATCH)) {
      const action = rt.events.find(e => e.id === id).playerCompletionContract.actions[0];
      action.intentMatch = variant === 'before' ? structuredClone(before) : { matchAny: [...before.matchAny, ...DEMO[id]], rejectIf: [...before.rejectIf] };
    }
    applyLoadRepairs(save);
    for (const [id, { after }] of Object.entries(S01_DEMO_INTENT_MATCH)) assert.deepEqual(save.世界.状态.剧本模组.events.find(e => e.id === id).playerCompletionContract.actions[0].intentMatch, after, `${variant} ${id}`);
  }
  const tried = demoSave();
  const triedRt = tried.世界.状态.剧本模组;
  const oldMerged = { matchAny: [...S01_DEMO_INTENT_MATCH['lcq.event.s01_02'].before.matchAny, ...DEMO['lcq.event.s01_02']], rejectIf: [...S01_DEMO_INTENT_MATCH['lcq.event.s01_02'].before.rejectIf] };
  triedRt.events.find(e => e.id === 'lcq.event.s01_02').playerCompletionContract.actions[0].intentMatch = structuredClone(oldMerged);
  (triedRt.eventActionStates ||= {})['lcq.event.s01_02'] = { attemptCount: 1 };
  applyLoadRepairs(tried);
  assert.deepEqual(tried.世界.状态.剧本模组.events.find(e => e.id === 'lcq.event.s01_02').playerCompletionContract.actions[0].intentMatch, oldMerged, '已有尝试的拍不改');
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/dev/apply-s01-demo-intent-match.mjs', '--check'], { cwd: new URL('..', import.meta.url) });
  assert.doesNotMatch(read('src/modules/scenarioMods/qingyuOpeningPlaytest.ts'), /event\('lcq\.event\.s01_0[235]'/);
});

// ⑨ 可靠的读档失败测试档 ───────────────────────────────────
/** 取 characterStore 里一个函数的源码（到下一个声明前），转成 JS，用给定边界依赖执行（同 report69.test.mjs 的 loadGame 测法）。 */
async function storeFunction(name, endMarker, deps) {
  const ts = (await import('typescript')).default;
  const source = read('src/stores/characterStore.ts');
  const start = source.indexOf(`  const ${name} = async`), end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `${name} 源码定位`);
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(deps), `${js};return ${name};`)(...Object.values(deps));
}

test('⑨ broken-load.json：经真实导入（importSave）收下，经真实读档（loadGame）必失败并提示「读档失败：原因」，零写入零删除', async () => {
  const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { createDadBundle, unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
  const E = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
  const F = await loadTs('../src/utils/saveLoadFallback.ts');
  const M = await loadTs('../src/utils/saveMigration.ts');
  const V3 = await loadTs('../src/utils/saveValidationV3.ts');
  const R = await loadTs('../src/utils/saveRotation.ts');
  const { buildBrokenLoadSave, BROKEN_LOAD_SLOT } = await import('../scripts/dev/make-test-saves.mjs');
  const templateSave = init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(stageJson('lcq.stage_01'), '2026-10-31T00:00:00.000Z'));
  const template = createDadBundle('saves', { characterId: 'char_test', characterName: '程宗扬', saves: [{ 存档名: '存档1', 存档数据: templateSave }] });
  const bundle = await buildBrokenLoadSave(template);
  // 文件形态：游戏导出包、一槽、无存档数据（SavePanel.handleImportFile 的格式检查能过）
  const unwrapped = unwrapDadBundle(JSON.parse(JSON.stringify(bundle)));
  assert.equal(unwrapped.type, 'saves');
  assert.equal(unwrapped.payload.saves.length, 1);
  const slot = unwrapped.payload.saves[0];
  assert.equal(slot.存档名, BROKEN_LOAD_SLOT);
  assert.equal(slot.存档数据, null);
  assert.doesNotMatch(JSON.stringify(bundle), /sk-/);

  const calls = [], toasts = [], noop = () => {};
  const toast = { error: m => toasts.push(['error', m]), success: m => toasts.push(['success', m]), info: m => toasts.push(['info', m]), warning: m => toasts.push(['warning', m]) };
  const storage = { saveSaveData: (...a) => calls.push(['write', a[1]]), deleteSaveData: (...a) => calls.push(['delete', a[1]]) };
  const keep = { 存档名: '存档1', 保存时间: 't', 存档数据: templateSave };
  const rootState = { value: { 角色列表: { c: { 模式: '单机', 角色: { 名字: '程宗扬' }, 存档列表: { 存档1: keep } } }, 当前激活存档: { 角色ID: 'c', 存档槽位: '存档1' } } };
  const importSave = await storeFunction('importSave', '\n  /**\n   * 清空所有存档', {
    assertEntitySaveFormat: E.assertEntitySaveFormat, rootState, toast, storage, isTavernEnv: () => false, ensureSaveDataHasTavernNsfw: x => x,
    isSaveDataV3: M.isSaveDataV3, migrateSaveDataToLatest: M.migrateSaveDataToLatest, validateSaveDataV3: V3.validateSaveDataV3,
    cloneDeep: structuredClone, debug: { log: noop, warn: noop, error: noop }, commitMetadataToStorage: async () => calls.push(['metadata']),
  });
  assert.equal(await importSave('c', structuredClone(slot)), BROKEN_LOAD_SLOT, '导入成功');
  assert.deepEqual(calls, [['metadata']], '导入只写槽位元数据，不写存档数据');
  assert.equal(rootState.value.角色列表.c.存档列表[BROKEN_LOAD_SLOT].存档数据, null);
  assert.deepEqual(toasts.at(-1), ['success', `存档【${BROKEN_LOAD_SLOT}】导入成功`]);

  // 读取：本机主槽与滚动备份都没有这一槽（导入没写），按 loadSaveWithFallback 同款回退读一遍
  const reads = [];
  const loadSaveWithFallback = async (_charId, slotId) => {
    const result = await R.readWithRotationFallback({ keep: R.rotationKeepFor(slotId), readPrimary: async () => { reads.push(slotId); return null; }, readBackup: async index => { reads.push(`${slotId}#${index}`); return null; } });
    assert.equal(result.status, 'absent');
    return result.data;
  };
  calls.length = 0; toasts.length = 0;
  const before = structuredClone(rootState.value);
  const ui = { startLoading: noop, updateLoadingText: noop, stopLoading: noop, showDetailModal: noop, hideDetailModal: noop };
  const loadGame = await storeFunction('loadGame', '\n  const saveActiveCharacterToStorage', {
    cloneDeep: structuredClone, debug: { log: noop, error: noop, warn: noop }, toast, useUIStore: () => ui, rootState, getOnlineSaveSlot: () => null,
    assertEntitySaveFormat: E.assertEntitySaveFormat, rejectFutureSaveVersion: F.rejectFutureSaveVersion, detectLegacySaveData: M.detectLegacySaveData,
    validateLoadedSave: F.validateLoadedSave, loadSaveWithFallback, applyLoadRepairs: () => calls.push(['repair']), clearAllCharacterData: async () => calls.push(['clear']),
    shouldReattachLandingPlaytestWorkingCopy: () => false, packPlaytestWorkingSlot: () => null, checkpointWorkingCopy: () => null,
    useGameStateStore: () => ({ loadFromSaveData: () => calls.push(['loadState']) }), useActionQueueStore: () => ({ clearActions: noop }), isTavernEnv: () => false, reseedActiveSceneAfterLoad: noop,
    storage, resetLastConversationIfForeign: () => calls.push(['reset']), commitMetadataToStorage: () => calls.push(['metadata']),
  });
  for (let round = 0; round < 2; round++) {
    assert.equal(await loadGame('c', BROKEN_LOAD_SLOT), false, `第 ${round + 1} 次读取必失败`);
    assert.ok(reads.includes(BROKEN_LOAD_SLOT), '确实去存储读了这一槽');
    assert.deepEqual(calls, [], '失败路径零写入、零删除、不清当前游戏、不改元数据');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0][0], 'error');
    assert.match(toasts[0][1], new RegExp(`^读档失败：存档【${BROKEN_LOAD_SLOT}】的数据读取不到（存储或网络出错），存档未改动$`));
    assert.deepEqual(rootState.value.当前激活存档, { 角色ID: 'c', 存档槽位: '存档1' }, '激活存档不变');
    assert.ok(rootState.value.角色列表.c.存档列表[BROKEN_LOAD_SLOT], '损坏槽仍在');
    assert.equal(rootState.value.角色列表.c.存档列表.存档1, keep, '别的档原封不动');
    assert.deepEqual(rootState.value, before);
    toasts.length = 0;
  }
  // 面板：loadGameById 返回 false 时显示「读档失败：…」横幅（cd16 已加），不报成功
  const panel = read('src/components/dashboard/SavePanel.vue');
  assert.match(panel, /loadError\.value = `读档失败：存档【\$\{save\.存档名\}】未能读取，存档本身未改动；原因见右上角提示。`/);
  // 产出物：脚本 --only broken-load 只写这一份
  const script = read('scripts/dev/make-test-saves.mjs');
  assert.match(script, /if \(args\[i\] === '--only'\) only = /);
  assert.match(script, /writeFileSync\(file, JSON\.stringify\(await buildBrokenLoadSave\(template\), null, 2\) \+ '\\n'\);/);
});
