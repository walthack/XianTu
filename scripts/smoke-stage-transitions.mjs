// 受控浏览器冒烟（不调模型）：各线关末档（rail 走完、下一关就绪）在浏览器里导入→读档→用界面上的入口启程→断言切进下一关。
// 档取仓库已入库夹具：tests/fixtures/lines-replay 六线 end、song-replay/song-line-end（宋线最后一关收束）；唐 end 是整链终关，只断言没有启程入口。
// 期望值在 Node 里用源码现场算（导入链与读档修补链同 tests/linesReplayFixtures.test.mjs）：下一关＝transitionToNextScenarioStage（跳过隔离关），
//   新关焦点拍／章节名／当前线／任务日志／编年史转场记录／开场展示都取切关结果。
// 入口按当前界面实际提供的算：内测构建是任务模式，撤掉了「▶ 启程」按钮；这几关的下一关都没有作者写的启程短语，任务日志文字「收拾行装，前往X」手打不认，
//   唯一能用的入口是在输入框手打启程按钮文字（getStageDepartureOffer.label，本拍动作表精确匹配＝点启程）。任务标记在别处、地图却走不到的记为界面缺口。
// 浏览器里走真实存储接口 importSave → loadGame（一次性上下文 IndexedDB；save-storage 一律替身 501）；模型请求全部替身（启程本身不应发模型请求，脚本断言为零）。
// 用法：node scripts/smoke-stage-transitions.mjs <站点URL…> [--only 线key,线key]；SMOKE_TRANSITIONS_JSON＝结果写成 JSON。
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { MODS, PINIA, enterIsolatedCharacter, importAndLoad, loadLikeGame, loadTs, openSmokeContext, quiet, readFixtureSlot, readPersisted } from './lineSmokeHarness.mjs';

const [R, I, NV, LC, QL, MT, NM, BP] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/scenarioMods/strictInitializer.ts', '../src/modules/scenarioMods/eventNarrativeView.ts',
  '../src/modules/scenarioMods/lineCompass.ts', '../src/modules/scenarioMods/questLog.ts', '../src/modules/scenarioMods/travel/mapTravel.ts',
  '../src/utils/narrativeMetaWords.ts', '../src/modules/scenarioMods/beatProgress.ts',
].map(p => loadTs(p))));

/** 各线关末档（夹具路径相对 tests/fixtures）。 */
const LINES = [
  { key: 'saiwai', label: '塞外', file: 'lines-replay/saiwai-end.json' },
  { key: 'zhaonan', label: '昭南（南荒）', file: 'lines-replay/zhaonan-end.json' },
  { key: 'jin', label: '晋', file: 'lines-replay/jin-end.json' },
  { key: 'song', label: '宋', file: 'song-replay/song-line-end.json' },
  { key: 'han', label: '汉', file: 'lines-replay/han-end.json' },
  { key: 'taiquan', label: '太泉', file: 'lines-replay/taiquan-end.json' },
  { key: 'tang', label: '唐（整链终关）', file: 'lines-replay/tang-end.json' },
];
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1] ?? ''; args.splice(i, 2); return v.split(',').filter(Boolean); };
const only = flag('--only');
const baseUrls = args;
assert.ok(baseUrls.length, '缺少站点 URL：node scripts/smoke-stage-transitions.mjs http://127.0.0.1:端口/');
const lines = only ? LINES.filter(l => only.includes(l.key)) : LINES;
assert.ok(lines.length, `--only 没选中任何线（可选：${LINES.map(l => l.key).join(',')}）`);

const rtOf = save => save.世界.状态.剧本模组;
/** 界面上能看到的「主线 章节」与「当前线」（同右栏 questMain／lineCompass 的取法）。 */
function sidebarView(save) {
  const rt = rtOf(save);
  const focus = R.getScenarioFocusEvent(rt);
  const chapter = (rt.chapters || []).find(c => focus && c.eventIds?.includes(focus.id)) || (rt.chapters || []).find(c => c.id === rt.currentChapterId);
  const compass = LC.lineCompassView(save, { focusEventId: focus?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => '' });
  const quest = QL.questLogView(save, MODS).current.map(e => `${e.title}：${e.objective}`);
  return { focus: focus?.id ?? null, chapter: chapter ? `章节：${NV.storyChapterTitle(rt.modId, focus?.id, chapter.title || chapter.id)}` : null, lineName: compass.current?.name ?? null, quest };
}
const progressOf = save => {
  const rt = rtOf(save);
  return { modId: rt.modId, chapterId: rt.currentChapterId ?? null, active: [...rt.activeEventIds].sort(), location: save.角色.位置?.locationId ?? null };
};
const squash = text => String(text || '').replace(/\s+/g, '');

/** 期望值：只从存档、catalog 与源码算，不抄剧情文字。 */
async function expectationOf(line) {
  const slot = readFixtureSlot(line.file);
  const save = await loadLikeGame(slot, line.key);
  const rt = rtOf(save);
  const offer = R.getStageDepartureOffer(save);
  const before = { stage: rt.modId, quest: QL.questLogView(save, MODS).current };
  if (!offer) {
    const probe = await quiet(async () => I.transitionToNextScenarioStage(structuredClone(save), MODS));
    assert.equal(probe.ok, false, `${line.key} 没有启程条件却能切关`);
    return { slot, ...before, final: true, reason: probe.reason };
  }
  const departure = before.quest.find(e => e.key === `departure:${offer.nextStageId}`);
  assert.ok(departure, `${line.key} 任务日志应有启程条目`);
  const marker = QL.questMarkers(save, MODS).find(m => m.key === departure.key);
  const here = save.角色.位置?.locationId;
  // 内测构建（任务模式）撤掉了启程按钮；六条线的下一关都没有作者写的启程短语（quests.json stages），任务日志里的「收拾行装，前往X」手打也不认，
  // 能用的入口只有手打启程按钮文字（getStageDepartureOffer.label，本拍动作表精确匹配）。标记在别处、地图却走不到的记为界面缺口（汉：留仙坪）。
  const away = marker && !QL.atLocation(here, marker.locationId) ? marker : null;
  const gap = away && !MT.mapTravelPreview(save, away.locationId) ? `任务标记「${away.name}」不在脚下，地图上却没有可走的路线（mapTravelPreview 为空）` : null;
  assert.ok(!away || gap, `${line.key} 任务标记在别处且地图走得到：本脚本只覆盖手打启程，须补地图启程路径`);
  assert.equal(await quiet(async () => BP.stageDepartureMapTarget(structuredClone(save), MODS)), undefined, `${line.key} 下一关不应跨国（跨国启程另一条路，本脚本未覆盖）`);
  const source = structuredClone(save);
  const result = await quiet(async () => I.transitionToNextScenarioStage(source, MODS));
  assert.ok(result.ok, `${line.key} 切关失败：${result.reason}`);
  const after = result.saveData;
  const art = rtOf(after);
  const presentation = R.getStageEntryPresentation(after);
  assert.ok(presentation?.text, `${line.key} 新关应有开场展示`);
  return {
    slot, ...before, gap, offer,
    departureText: `${departure.title}：${departure.objective}`,
    next: art.modId, nextName: result.toName, ...progressOf(after), ...sidebarView(after),
    chronicle: art.chronicle.at(-1), presentationHead: squash(NM.stripNarrativeMetaWords(presentation.text)).slice(0, 16),
  };
}
const EXPECT = {};
for (const line of lines) EXPECT[line.key] = await expectationOf(line);

/** 浏览器里读：运行时进度、右栏章节／当前线／任务日志、主阅读面开场展示。 */
const readUi = page => page.evaluate(expr => {
  const stores = eval(expr)._s;
  const save = stores.get('gameState').toSaveData();
  const rt = save.世界.状态.剧本模组;
  const text = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.trim());
  const tagged = tag => text('.quest-main .quest-chapter').filter(t => t.startsWith(tag)).map(t => t.slice(tag.length).trim());
  const entry = document.querySelector('.stage-entry-narrative');
  return {
    modId: rt.modId, nextStageId: rt.nextStageId ?? null, chapterId: rt.currentChapterId ?? null, active: [...rt.activeEventIds].sort(),
    location: save.角色.位置?.locationId ?? null, chronicle: (rt.chronicle || []).at(-1) ?? null, entryTo: rt.stageEntryPresentation?.toStageId ?? null,
    lineName: tagged('当前线'), chapter: tagged('主线'), quest: text('[data-testid="quest-log"] .quest-log-entry .quest-event').map(t => t.replace(/^◆/, '')),
    badge: entry?.querySelector('.stage-entry-badge')?.innerText.trim() ?? null, entryText: entry?.innerText.replace(/\s+/g, '') ?? '',
    departButtons: text('button').filter(t => /启程|收拾行装/.test(t)), path: location.pathname, lcq: [...window.__lcqSeen],
  };
}, PINIA);

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
      for (const line of lines) {
        const exp = EXPECT[line.key];
        const t0 = Date.now();
        const record = { key: line.key, label: line.label, file: line.file, save: exp.slot.存档名, stage: exp.stage, next: exp.next ?? null, gap: exp.gap ?? null };
        results.push(record);
        try {
          await importAndLoad(page, charId, exp.slot);
          await page.waitForTimeout(500);
          const ui0 = await readUi(page);
          assert.equal(ui0.modId, exp.stage, '读档后所在关');
          assert.deepEqual(ui0.lcq, [], '读档后不应弹 LCQ 报错码');
          // 任务模式撤掉了「▶ 启程」按钮（主面板与右栏都不应有）。
          assert.deepEqual(ui0.departButtons, [], '任务模式下不应有启程按钮');
          if (exp.final) {
            // 整链终关：没有下一关，任务日志不出启程条目。
            assert.equal(ui0.nextStageId, null, '终关不应有下一关');
            assert.ok(!ui0.quest.some(t => t.includes('收拾行装')), `终关任务日志不应有启程条目：${JSON.stringify(ui0.quest)}`);
            record.result = `终关无下一关（Node 切关探针：${exp.reason}），任务日志无启程条目`;
          } else {
            assert.ok(ui0.quest.includes(exp.departureText), `任务日志应列启程条目「${exp.departureText}」，实际 ${JSON.stringify(ui0.quest)}`);
            requests = [];
            // 手打启程按钮文字（本拍动作表精确匹配＝点启程）。
            await page.locator('textarea.game-input').fill(exp.offer.label);
            await page.locator('.send-button').click();
            await page.waitForFunction(({ expr, next }) => eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId === next,
              { expr: PINIA, next: exp.next }, { timeout: 20_000 });
            await page.locator('textarea.game-input').waitFor({ timeout: 15_000 });
            await page.waitForTimeout(800);
            const ui = await readUi(page);
            record.requests = requests;
            assert.deepEqual(requests, [], '启程本身不应发模型请求');
            assert.equal(ui.modId, exp.next, `应切进下一关 ${exp.next}`);
            assert.equal(ui.chapterId, exp.chapterId, '新关当前章');
            assert.deepEqual(ui.active, exp.active, '新关首批激活事件');
            assert.equal(ui.location, exp.location, '切关后所在地');
            assert.equal(ui.chronicle?.id, exp.chronicle.id, '编年史应记切关');
            assert.equal(ui.chronicle?.detail, exp.chronicle.detail, '编年史切关条目的去向');
            assert.equal(ui.entryTo, exp.next, '开场展示应属新关');
            assert.equal(ui.badge, '旅途新章', '主阅读面应显示新关开场（旅途新章）');
            assert.ok(ui.entryText.includes(exp.presentationHead), `主阅读面应是新关开场正文（开头「${exp.presentationHead}」）`);
            assert.deepEqual(ui.chapter, exp.chapter ? [exp.chapter] : [], `章节名应为 ${exp.chapter}`);
            assert.deepEqual(ui.lineName, exp.lineName ? [exp.lineName] : [], exp.lineName ? `「当前线」应为 ${exp.lineName}` : '不应出「当前线」行');
            assert.deepEqual(ui.quest, exp.quest, '任务日志应换成新关条目');
            assert.deepEqual(ui.lcq, [], '启程后不应弹 LCQ 报错码');
            const persisted = await readPersisted(page, charId);
            assert.equal(persisted.data?.世界?.状态?.剧本模组?.modId, exp.next, '持久化的工作槽应已在新关');
            record.result = `手打「${exp.offer.label}」 → ${exp.next}（${exp.nextName}）；${exp.chapter ?? '无章节行'}；当前线「${exp.lineName ?? '无'}」；焦点 ${exp.focus}；编年史 ${exp.chronicle.id}；工作槽 ${persisted.slot} 已落账${exp.gap ? `；界面缺口：${exp.gap}` : ''}`;
          }
          assert.deepEqual(pageErrors, [], '控制台不应有未捕获异常');
          record.status = 'passed';
        } catch (error) {
          failed++;
          record.status = 'failed';
          record.error = String(error.message || error).split('\n').slice(0, 6).join(' / ');
          record.visible = (await page.locator('body').innerText().catch(() => '')).slice(-500).replace(/\s+/g, ' ');
          pageErrors.length = 0;
          await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/game')).catch(() => {});
        }
        record.ms = Date.now() - t0;
        console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${line.key}（${line.label}）${exp.stage}：${record.status === 'passed' ? record.result : `${record.error}；页面尾 ${record.visible}`}（${(record.ms / 1000).toFixed(1)}s）`);
      }
      guard.finish();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (process.env.SMOKE_TRANSITIONS_JSON) (await import('node:fs')).writeFileSync(process.env.SMOKE_TRANSITIONS_JSON, JSON.stringify(results, null, 2));
console.log(`${failed ? 'FAIL' : 'PASS'} smoke-stage-transitions：${results.length - failed}/${results.length} 条线通过`);
process.exit(failed ? 1 : 0);
