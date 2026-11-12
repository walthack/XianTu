// 受控浏览器冒烟（不调模型）：关与关之间的另外三类入口——从地图入秦与返回、大祭（世界事件）、结局卡。
// 档：qin-replay 的 qin-before-entry／qin-entry-ready／qin-rail-end；lines-replay/tang-end（终关 rail 走完：可开大祭、入秦条件也满足）；
//   结局档由仓库生成器 scripts/generate-prologue-checkpoint.mjs 现场生成，再照 tests/questBranchLockWuyuan.test.mjs 用结构化动作走到「凝羽入局」的接赌／不赌分支。
// 期望值在 Node 里用源码现场算（导入链与读档修补链同 tests/linesReplayFixtures.test.mjs）：地图入秦＝selectMapTravel+settleMapTravel，返回＝transitionFromMapEntryStage，
//   大祭＝startHeimohaiFestival，结局＝recordStoryEventStructuredAction（绝路选项）＋包里的结局编号／正文（endingKey／fixedEndingNarrative）。
// 界面操作：地图页用鼠标拖动画布把目标地点拖进视野、点地点、弹窗里「前往此地」→「确认前往」；返回／大祭／分支都点界面上的按钮。
// 浏览器里走真实存储接口 importSave → loadGame（一次性上下文 IndexedDB；save-storage 一律替身 501）；模型请求全部替身。
// 用法：node scripts/smoke-map-festival-ending.mjs <站点URL…> [--only 场景key,场景key]；SMOKE_MAP_FESTIVAL_JSON＝结果写成 JSON。
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { MODS, PINIA, enterIsolatedCharacter, importAndLoad, loadLikeGame, loadTs, openSmokeContext, quiet, readFixtureSlot, readPersisted } from './lineSmokeHarness.mjs';

const [R, I, MT, F, RET, EP, FE, NM, W, BD, BG, QL, P] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/scenarioMods/strictInitializer.ts', '../src/modules/scenarioMods/travel/mapTravel.ts',
  '../src/modules/scenarioMods/heimohaiFestival.ts', '../src/modules/scenarioMods/mapEntryReturn.ts', '../src/modules/scenarioMods/endingPresentation.ts',
  '../src/modules/scenarioMods/fixedEndingNarratives.ts', '../src/utils/narrativeMetaWords.ts', '../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts',
  '../src/modules/scenarioMods/branchDecision.ts', '../src/modules/scenarioMods/baihuGambleRefusal.ts', '../src/modules/scenarioMods/questLog.ts',
  '../src/modules/contentPacks/index.ts',
].map(p => loadTs(p))));

const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.id === 'qin');
assert.ok(ENTRY, '内容包应声明秦的地图入口');
const XIANYANG = ENTRY.locationId;
const HOOK = F.FESTIVAL.qinMessageEventId;
const rtOf = save => save.世界.状态.剧本模组;
const squash = text => String(text || '').replace(/\s+/g, '');
const shown = text => squash(NM.playerFacingText(text));
const progressOf = save => {
  const rt = rtOf(save);
  return { modId: rt.modId, chapterId: rt.currentChapterId ?? null, active: [...rt.activeEventIds].sort(), completed: [...rt.completedEventIds].sort(),
    focus: R.getScenarioFocusEvent(rt)?.id ?? null, location: save.角色.位置?.locationId ?? null };
};
const fixture = async file => { const slot = readFixtureSlot(file); return { slot, save: await loadLikeGame(slot, file) }; };

/** 地图入秦的期望（入口转场、入口拍、首拍、mapEntryResume 记录）。 */
function qinEntryExpectation(save, label) {
  const preview = MT.mapTravelPreview(save, XIANYANG);
  assert.ok(preview, `${label}：地图上应有去咸阳的行程`);
  const after = structuredClone(save);
  const selection = MT.selectMapTravel(after, XIANYANG);
  assert.ok(selection && MT.settleMapTravel(after, selection), `${label}：地图入秦应落账`);
  // 入口拍＝秦口信拍（入口声明的 messageEventId）：入秦后在秦关记为已完成；关转场记一条 stage 编年史。
  assert.ok(rtOf(after).completedEventIds.includes(HOOK), `${label}：入秦后口信拍应记为已完成`);
  const transition = rtOf(after).chronicle.find(e => e.type === 'stage' && e.id === `chronicle.stage.${rtOf(save).modId}.${rtOf(after).modId}`);
  assert.ok(transition, `${label}：编年史应有入秦的关转场条目`);
  return { previewLabel: preview.label, ...progressOf(after), transition,
    chronicle: rtOf(after).chronicle.at(-1), resume: { modId: after.系统.扩展.mapEntryResume.runtime.modId, position: after.系统.扩展.mapEntryResume.position } };
}

/** 结局档：生成器现场生成 → 去掉试玩标记 → 结构化动作走到「凝羽入局」接赌／不赌分支（同 tests/questBranchLockWuyuan.test.mjs）。 */
async function endingSlot() {
  const { freshPrologueCheckpoint } = await import('./generate-prologue-checkpoint.mjs');
  const focus = s => R.getScenarioFocusEvent(rtOf(s))?.id;
  let { save } = await quiet(() => freshPrologueCheckpoint());
  for (const p of P.CONTENT_PACKS.playtests) if (p.openingTextId) delete save.系统.扩展[p.extensionKey];
  await quiet(async () => {
    W.settleWuyuanOpenWorldSelection(save, W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action'));
    save = R.advanceScenarioRuntime(save).saveData;
    for (let n = 0; n < 20 && focus(save) !== 'lcq.event.ningyu_enters_gamble'; n++) {
      const ids = new Set(R.getScenarioFocusEvent(rtOf(save)).playerCompletionContract.actions.map(a => a.id));
      R.recordStoryEventStructuredAction(save, R.getCurrentStoryEventActions(save).find(x => ids.has(x.actionId) && !/refuse/.test(x.actionId)));
      save = R.advanceScenarioRuntime(save).saveData;
    }
    R.recordStoryEventStructuredAction(save, R.getCurrentStoryEventActions(save).find(a => a.actionId === 'see_ningyu_sent_into_gamble'));
    save = R.advanceScenarioRuntime(save).saveData;
  });
  assert.equal(focus(save), 'lcq.event.ningyu_enters_gamble', '结局档应停在凝羽入局');
  save.元数据.存档名 = '冒烟-凝羽入局分支';
  return { 存档名: save.元数据.存档名, 存档数据: JSON.parse(JSON.stringify(save)) };
}

const CASES = {
  async 'qin-closed'() {
    const { slot, save } = await fixture('qin-replay/qin-before-entry.json');
    assert.equal(MT.mapTravelPreview(save, XIANYANG), undefined, 'qin-before-entry 不该有去咸阳的行程');
    return { slot, stage: rtOf(save).modId, restriction: MT.mapTravelRestriction(save, XIANYANG) ?? null };
  },
  async 'qin-enter'() {
    const { slot, save } = await fixture('qin-replay/qin-entry-ready.json');
    return { slot, stage: rtOf(save).modId, ...qinEntryExpectation(save, 'qin-entry-ready') };
  },
  async 'qin-return'() {
    const { slot, save } = await fixture('qin-replay/qin-rail-end.json');
    const offer = RET.getMapEntryReturnOffer(save);
    assert.ok(offer, 'qin-rail-end 应有返回报价');
    const result = await quiet(async () => I.transitionFromMapEntryStage(structuredClone(save), [...MODS, ...P.CONTENT_PACKS.stages]));
    assert.ok(result.ok, `返回失败：${result.reason}`);
    const resume = save.系统.扩展.mapEntryResume;
    assert.equal(result.to, resume.runtime.modId, '返回的关应是 mapEntryResume 记的出发关');
    const after = result.saveData;
    return { slot, stage: rtOf(save).modId, label: squash(NM.stripNarrativeMetaWords(offer.label)), resume: { modId: resume.runtime.modId, position: resume.position },
      ...progressOf(after), chronicle: rtOf(after).chronicle.find(e => e.id === `chronicle.mapEntryReturn.${offer.entryId}`), entryTo: R.getStageEntryPresentation(after)?.toStageId };
  },
  async 'festival-start'() {
    const { slot, save } = await fixture('lines-replay/tang-end.json');
    const view = F.festivalView(save);
    assert.ok(view.available && !view.blocked, 'tang-end 应可开大祭');
    assert.ok(rtOf(save).activeEventIds.includes(HOOK), 'tang-end 的秦口信拍应在激活中（大祭后应被移除）');
    const after = structuredClone(save);
    const result = F.startHeimohaiFestival(after, { source: 'player', actionId: F.FESTIVAL.actionId });
    assert.ok(result.ok, '大祭应能开');
    return { slot, stage: rtOf(save).modId, label: F.FESTIVAL.label, warning: shown(view.warning), transition: shown(result.note),
      ...progressOf(after), chronicle: rtOf(after).chronicle.at(-1), hookInChapters: rtOf(after).chapters.some(c => c.eventIds.includes(HOOK)),
      qinPreviewAfter: MT.mapTravelPreview(after, XIANYANG) ?? null };
  },
  async 'festival-blocked'() {
    const { slot, save } = await fixture('lines-replay/tang-end.json');
    const entry = qinEntryExpectation(save, 'tang-end');
    const inQin = structuredClone(save);
    MT.settleMapTravel(inQin, MT.selectMapTravel(inQin, XIANYANG));
    const view = F.festivalView(inQin);
    assert.ok(view.available && view.blocked, '从终关入秦后：大祭可用性取出发关（可开），但秦内应被挡');
    return { slot, stage: rtOf(save).modId, ...entry, label: F.FESTIVAL.label, blocked: shown(view.blocked) };
  },
  async ending() {
    const slot = await endingSlot();
    const save = await loadLikeGame(slot, 'ending');
    const options = [...R.getCurrentStoryEventActions(save).filter(a => QL.questActionGate(save, a).ok), ...BG.getBaihuGambleRefusalSelections(save)];
    const decision = BD.detectBranchDecision(options);
    assert.ok(decision, '凝羽入局应出分支选择');
    const pick = decision.options.findIndex(o => (rtOf(save).events.find(e => e.id === o.eventId)?.fatalOutcomes?.choices || []).some(c => c.id === o.actionId));
    assert.ok(pick >= 0, '分支里应有绝路选项');
    const fatal = decision.options[pick];
    const after = structuredClone(save);
    const outcome = await quiet(async () => R.recordStoryEventStructuredAction(after, R.getCurrentStoryEventActions(after).find(a => a.actionId === fatal.actionId)));
    assert.equal(outcome.attempted, true);
    const over = rtOf(after).gameOver;
    assert.ok(over?.endingId, '绝路选项应落结局');
    const code = EP.endingKey(over);
    assert.ok(P.CONTENT_PACKS.endings.some(e => e.endingId === over.endingId && e.key === code), '结局编号应来自包里的结局表');
    const narrative = FE.fixedEndingNarrative(over);
    assert.equal(narrative, P.CONTENT_PACKS.texts[over.endingId], '结局正文应是包 texts 里该结局的正文');
    return { slot, stage: rtOf(save).modId, labels: decision.labels, pickLabel: decision.labels[pick], actionId: fatal.actionId,
      endingId: over.endingId, code, title: over.title, paragraphs: narrative.split(/\n\s*\n/).filter(Boolean).map(squash) };
  },
};
const LABELS = { 'qin-closed': '入秦条件未满足：地图上无行程', 'qin-enter': '地图入秦', 'qin-return': '秦关走完返回出发关', 'festival-start': '开启大祭', 'festival-blocked': '入秦后大祭按钮禁用', ending: '结局卡' };

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1] ?? ''; args.splice(i, 2); return v.split(',').filter(Boolean); };
const only = flag('--only');
const baseUrls = args;
assert.ok(baseUrls.length, '缺少站点 URL：node scripts/smoke-map-festival-ending.mjs http://127.0.0.1:端口/');
const keys = only ? Object.keys(CASES).filter(k => only.includes(k)) : Object.keys(CASES);
assert.ok(keys.length, `--only 没选中任何场景（可选：${Object.keys(CASES).join(',')}）`);
const EXPECT = {};
for (const key of keys) EXPECT[key] = await CASES[key]();

const router = (page, path) => page.evaluate(p => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(p), path);
const readState = page => page.evaluate(expr => {
  const save = eval(expr)._s.get('gameState').toSaveData();
  const rt = save.世界.状态.剧本模组;
  return { modId: rt.modId, chapterId: rt.currentChapterId ?? null, active: [...rt.activeEventIds].sort(), completed: [...rt.completedEventIds].sort(),
    location: save.角色.位置?.locationId ?? null, position: save.角色.位置, chronicle: rt.chronicle || [], chapters: rt.chapters || [], gameOver: rt.gameOver ?? null,
    ext: { festivalStarted: save.系统.扩展?.festivalStarted ?? null, resume: save.系统.扩展?.mapEntryResume ? { modId: save.系统.扩展.mapEntryResume.runtime.modId, position: save.系统.扩展.mapEntryResume.position } : null },
    entryTo: rt.stageEntryPresentation?.toStageId ?? null, lcq: [...window.__lcqSeen] };
}, PINIA);

/** 地图页：拖动画布把地点拖到画布中央附近，再点它，等弹窗标题＝地名。 */
async function openMapPopup(page, locationId) {
  await router(page, '/game/world-map');
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ timeout: 15_000 });
  const locate = () => page.evaluate(id => {
    let el = document.querySelector('canvas'), comp = null;
    // 内测构建读 setupState；正式构建里 script setup 状态不外露，读 GameMapPanel 的 defineExpose（exposed 里是 ref）。
    const has = c => (c?.exposed && 'mapManager' in c.exposed) || (c?.setupState && 'mapManager' in c.setupState);
    while (el && !comp) { const c = el.__vueParentComponent; if (has(c)) comp = c; el = el.parentElement; }
    const exposed = comp?.exposed?.mapManager;
    const mm = exposed ? ('value' in exposed ? exposed.value : exposed) : comp?.setupState?.mapManager;
    const loc = mm?.layers?.get(4)?.children.map(c => c.userData?.data || c.userData).find(d => d && d.id === id);
    if (!mm || !loc) return null;
    const rect = document.querySelector('canvas').getBoundingClientRect(), s = mm.worldContainer.scale.x;
    const c = loc.coordinates || loc;
    return { name: loc.name, x: rect.left + mm.worldContainer.x + c.x * s, y: rect.top + mm.worldContainer.y + c.y * s, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }, locationId);
  let at = null;
  for (let i = 0; i < 30 && !at; i++) { at = await locate(); if (!at) await page.waitForTimeout(300); }
  assert.ok(at, `地图上应画出地点 ${locationId}`);
  // 分几段拖（每段拖动距离超过点击阈值），拖到中央。
  for (let n = 0; n < 4 && (Math.abs(at.x - at.cx) > 200 || Math.abs(at.y - at.cy) > 200); n++) {
    const dx = Math.max(-500, Math.min(500, at.cx - at.x)), dy = Math.max(-350, Math.min(350, at.cy - at.y));
    await page.mouse.move(at.cx, at.cy);
    await page.mouse.down();
    await page.mouse.move(at.cx + dx / 2, at.cy + dy / 2, { steps: 5 });
    await page.mouse.move(at.cx + dx, at.cy + dy, { steps: 5 });
    await page.mouse.up();
    at = await locate();
  }
  await page.mouse.click(at.x, at.y);
  const popup = page.locator('.location-popup');
  await popup.waitFor({ timeout: 5_000 });
  assert.equal((await popup.locator('h4').innerText()).trim(), at.name, '地图上点中的应是目标地点');
  return { popup, name: at.name };
}
/** 弹窗里「前往此地」→「确认前往」，等关切换。 */
async function travelFromPopup(page, popup, nextModId) {
  await popup.locator('button.enter-region-btn', { hasText: '前往此地' }).click();
  await popup.locator('button.enter-region-btn', { hasText: '确认前往' }).click();
  await page.waitForFunction(({ expr, next }) => eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId === next, { expr: PINIA, next: nextModId }, { timeout: 20_000 });
  await page.waitForTimeout(600);
}
const sidebarFestival = page => page.evaluate(label => {
  const button = [...document.querySelectorAll('.right-sidebar .quest-section button.quest-next-btn')].find(b => b.innerText.trim() === label);
  const section = button?.closest('.quest-section') || [...document.querySelectorAll('.right-sidebar .quest-section')].find(s => /大祭/.test(s.innerText));
  return { button: button ? { disabled: button.disabled } : null, text: section ? section.innerText.replace(/\s+/g, '') : '' };
}, EXPECT['festival-start']?.label ?? EXPECT['festival-blocked']?.label ?? F.FESTIVAL.label);

async function assertQinEntered(page, exp) {
  const st = await readState(page);
  assert.equal(st.modId, exp.modId, '应进入秦关');
  assert.deepEqual(st.active, exp.active, '秦关首批激活事件');
  assert.ok(st.completed.includes(HOOK), `入口拍 ${HOOK} 应记为已完成`);
  assert.deepEqual(st.chronicle.find(e => e.id === exp.transition.id), exp.transition, '编年史应记入秦的关转场');
  assert.deepEqual(st.completed, exp.completed, '入秦后已完成拍');
  assert.equal(st.location, exp.location, '入秦后所在地');
  assert.equal(st.chronicle.at(-1)?.id, exp.chronicle.id, '编年史应记入口转场');
  assert.deepEqual(st.ext.resume, exp.resume, 'mapEntryResume 应记下出发关与位置');
  assert.equal(st.entryTo, exp.modId, '开场展示应属秦关');
  return st;
}

const RUN = {
  async 'qin-closed'(page, exp) {
    const { popup } = await openMapPopup(page, XIANYANG);
    const text = (await popup.innerText()).replace(/\s+/g, '');
    assert.ok(!text.includes('剧情入口转场'), `条件未满足时弹窗不应出入口行程：${text.slice(0, 200)}`);
    const go = popup.locator('button.enter-region-btn', { hasText: '前往此地' });
    if (exp.restriction) {
      assert.ok(text.includes(squash(exp.restriction)), `弹窗应显示限制「${exp.restriction}」`);
      assert.equal(await go.isDisabled(), true, '有限制时「前往此地」应禁用');
    } else {
      await go.click();
      await page.waitForTimeout(500);
      assert.ok((await popup.innerText()).includes('此处暂无已开放且登记路程的路线'), '点「前往此地」应提示无路线');
    }
    const st = await readState(page);
    assert.equal(st.modId, exp.stage, '不应离开本关');
    return `咸阳弹窗无入口行程（${exp.restriction ? `限制：${exp.restriction}` : '点前往提示无路线'}），仍在 ${st.modId}`;
  },
  async 'qin-enter'(page, exp) {
    const { popup } = await openMapPopup(page, XIANYANG);
    assert.ok((await popup.innerText()).includes(exp.previewLabel), `弹窗应显示「${exp.previewLabel}」`);
    await travelFromPopup(page, popup, exp.modId);
    await assertQinEntered(page, exp);
    return `地图点咸阳（${exp.previewLabel}）→ ${exp.modId}；入口拍 ${HOOK} 已完成；转场 ${exp.transition.id}；焦点 ${exp.focus}；编年史 ${exp.chronicle.id}；mapEntryResume→${exp.resume.modId}`;
  },
  async 'qin-return'(page, exp) {
    const button = page.locator('.action-options button.action-option-btn').filter({ hasText: exp.label.slice(0, 6) });
    assert.equal(await button.count(), 1, `主面板应有返回按钮「${exp.label}」`);
    assert.equal(squash(await button.innerText()), exp.label, '返回按钮文字');
    await button.click();
    await page.waitForFunction(({ expr, next }) => eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId === next, { expr: PINIA, next: exp.modId }, { timeout: 20_000 });
    await page.waitForTimeout(600);
    const st = await readState(page);
    assert.equal(st.modId, exp.resume.modId, '回到的关应与 mapEntryResume 记录一致');
    assert.deepEqual(st.position, exp.resume.position, '回到 mapEntryResume 记的位置');
    assert.equal(st.ext.resume, null, '返回后 mapEntryResume 应清掉');
    assert.deepEqual(st.active, exp.active, '出发关激活事件恢复');
    assert.equal(st.chapterId, exp.chapterId, '出发关当前章');
    assert.ok(st.chronicle.some(e => e.id === exp.chronicle.id), '编年史应记返回');
    assert.equal(st.entryTo, exp.entryTo, '返回过场指回出发关');
    assert.equal(await page.locator('.action-options button.action-option-btn').filter({ hasText: exp.label.slice(0, 6) }).count(), 0, '返回后不应再有返回按钮');
    return `点「${exp.label}」→ 回 ${st.modId}（同 mapEntryResume）；焦点 ${exp.focus}；编年史 ${exp.chronicle.id}`;
  },
  async 'festival-start'(page, exp) {
    const before = await sidebarFestival(page);
    assert.ok(before.button && !before.button.disabled, `右栏应有可点的「${exp.label}」按钮：${before.text}`);
    assert.ok(before.text.includes(exp.warning), '右栏应显示大祭将近提示');
    await page.locator('.right-sidebar .quest-section button.quest-next-btn', { hasText: exp.label }).click();
    await page.waitForFunction(expr => eval(expr)._s.get('gameState').toSaveData()?.系统?.扩展?.festivalStarted === true, PINIA, { timeout: 10_000 });
    await page.waitForTimeout(500);
    const st = await readState(page);
    assert.equal(st.ext.festivalStarted, true, 'festivalStarted 应为真');
    assert.ok(st.completed.includes(F.FESTIVAL.eventId), '大祭事件应记为完成');
    assert.deepEqual(st.completed, exp.completed, '已完成拍');
    assert.deepEqual(st.chronicle.at(-1), exp.chronicle, '编年史应记大祭（含转场句）');
    assert.ok(!st.active.includes(HOOK), '秦口信拍应从激活中移除');
    assert.equal(exp.hookInChapters, false, 'Node 期望：口信拍应从章节里移除');
    assert.equal(st.chapters.some(c => c.eventIds.includes(HOOK)), exp.hookInChapters, '秦口信拍应从章节里移除');
    assert.deepEqual(st.active, exp.active, '激活事件');
    const after = await sidebarFestival(page);
    assert.equal(after.button, null, '开祭后按钮应消失');
    assert.ok(after.text.includes(exp.transition), `右栏应显示转场句：${after.text}`);
    assert.equal(exp.qinPreviewAfter, null, '开祭后地图入秦行程应关闭');
    const persisted = await readPersisted(page, this.charId);
    assert.equal(persisted.data?.系统?.扩展?.festivalStarted, true, '工作槽应已落账 festivalStarted');
    return `点「${exp.label}」→ festivalStarted、${F.FESTIVAL.eventId} 完成、编年史 ${exp.chronicle.id}、口信拍 ${HOOK} 移除、转场句显示，工作槽已落账`;
  },
  async 'festival-blocked'(page, exp) {
    const before = await sidebarFestival(page);
    assert.ok(before.button && !before.button.disabled, '终关应先能看到可点的大祭按钮');
    const { popup } = await openMapPopup(page, XIANYANG);
    await travelFromPopup(page, popup, exp.modId);
    await assertQinEntered(page, exp);
    await router(page, '/game');
    await page.locator('textarea.game-input').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const inQin = await sidebarFestival(page);
    assert.ok(inQin.button, `秦内右栏仍应显示「${exp.label}」按钮（可用性取出发关）：${inQin.text}`);
    assert.equal(inQin.button.disabled, true, '秦内大祭按钮应禁用');
    assert.ok(inQin.text.includes(exp.blocked), `应显示挡住原因：${inQin.text}`);
    const st = await readState(page);
    assert.equal(st.ext.festivalStarted, null, '不应开祭');
    return `终关地图入秦 → ${exp.modId}；右栏「${exp.label}」禁用并显示挡住原因`;
  },
  async ending(page, exp) {
    const options = page.locator('[data-testid="branch-decision-option"]');
    await options.first().waitFor({ timeout: 10_000 });
    assert.deepEqual((await options.allInnerTexts()).map(t => t.trim()), exp.labels, '分支选项');
    assert.equal(await page.locator('textarea.game-input').isDisabled(), true, '分支期间输入框应锁');
    await options.filter({ hasText: exp.pickLabel }).click();
    await page.waitForFunction(expr => !!eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.gameOver?.endingId, PINIA, { timeout: 45_000 });
    await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 45_000 });
    const card = page.locator('.game-over-card');
    await card.waitFor({ timeout: 10_000 });
    const st = await readState(page);
    assert.equal(st.gameOver.endingId, exp.endingId, '结局 id');
    assert.equal(squash(await card.locator('.game-over-tag').innerText()), squash(`本局结束 · 结局 ${exp.code}`), '结局编号');
    assert.equal((await card.locator('h3').innerText()).trim(), exp.title, '结局标题');
    const paragraphs = (await card.locator('p.game-over-hint').allInnerTexts()).map(squash).slice(1);
    assert.deepEqual(paragraphs, exp.paragraphs, '结局卡正文应是包里的结局正文');
    assert.equal(await page.locator('textarea.game-input').isDisabled(), true, '结局后输入框应封住');
    const persisted = await readPersisted(page, this.charId);
    assert.equal(persisted.data?.世界?.状态?.剧本模组?.gameOver?.endingId, exp.endingId, '工作槽应已落账结局');
    return `点「${exp.pickLabel}」→ 结局卡 ${exp.code}「${exp.title}」（${exp.endingId}），正文 ${exp.paragraphs.length} 段同包数据，输入封住，工作槽已落账；请求 ${JSON.stringify(this.requests)}`;
  },
};

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
let failed = 0;
try {
  for (const baseUrl of baseUrls) {
    let requests = [];
    const { context, guard } = await openSmokeContext(browser, { contextOptions: { viewport: { width: 1600, height: 1000 } }, onRequest: kind => requests.push(kind) });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      const charId = await enterIsolatedCharacter(page, baseUrl);
      for (const key of keys) {
        const exp = EXPECT[key];
        const t0 = Date.now();
        const record = { key, label: LABELS[key], save: exp.slot.存档名, stage: exp.stage };
        results.push(record);
        try {
          await importAndLoad(page, charId, exp.slot);
          await page.waitForTimeout(500);
          const st0 = await readState(page);
          assert.equal(st0.modId, exp.stage, '读档后所在关');
          assert.deepEqual(st0.lcq, [], '读档后不应弹 LCQ 报错码');
          requests = [];
          record.result = await RUN[key].call({ charId, get requests() { return requests; } }, page, exp);
          const st = await readState(page);
          assert.deepEqual(st.lcq, [], '操作后不应弹 LCQ 报错码');
          if (key !== 'ending') assert.deepEqual(requests, [], '本场景不应发模型请求');
          record.requests = requests;
          assert.deepEqual(pageErrors, [], '控制台不应有未捕获异常');
          record.status = 'passed';
        } catch (error) {
          failed++;
          record.status = 'failed';
          record.error = String(error.message || error).split('\n').slice(0, 6).join(' / ');
          record.visible = (await page.locator('body').innerText().catch(() => '')).slice(-500).replace(/\s+/g, ' ');
          pageErrors.length = 0;
        }
        await router(page, '/game').catch(() => {});
        record.ms = Date.now() - t0;
        console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${key}（${record.label}）${exp.stage}：${record.status === 'passed' ? record.result : `${record.error}；页面尾 ${record.visible}`}（${(record.ms / 1000).toFixed(1)}s）`);
      }
      guard.finish();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (process.env.SMOKE_MAP_FESTIVAL_JSON) (await import('node:fs')).writeFileSync(process.env.SMOKE_MAP_FESTIVAL_JSON, JSON.stringify(results, null, 2));
console.log(`${failed ? 'FAIL' : 'PASS'} smoke-map-festival-ending：${results.length - failed}/${results.length} 个场景通过`);
process.exit(failed ? 1 : 0);
