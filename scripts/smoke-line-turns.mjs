// 受控浏览器冒烟（不是真实模型试玩）：八条线各一份中段旧档，在浏览器里导入→读档→发一回合→落账。
// 档取仓库已入库夹具（tests/fixtures/lines-replay 六线 mid、qin-replay/qin-rail-mid、song-replay/song-linan-mid），不新造夹具。
// 期望值（关、焦点拍、当前线名、章节名、任务日志主线目标）在 Node 里用源码现场算：导入链与读档修补链同 tests/linesReplayFixtures.test.mjs。
// 浏览器里走真实存储接口 characterStore.importSave → loadGame（一次性上下文的 IndexedDB；save-storage 一律替身 501，不写测试服）。
// 模型请求全部替身：拍子判定小请求回「判中当前拍」（ev 取玩家原句片段、不超过 evidenceMaxChars），正文回一段带概要的合规正文。
// 用法：node scripts/smoke-line-turns.mjs <站点URL…> [--only 线key,线key]
//   环境变量 SMOKE_LINE_TURNS_JSON＝把每条线的结果写成 JSON 文件；SMOKE_LINE_TURNS_DEBUG＝打印每个模型请求的种类与开头。
// 现行设计下输入主线目标原文由本地字链直接选中这一拍，不发拍子判定小请求；替身仍按「判中」备着，以后改成发小请求也接得住。
// 多步合同的拍（一回合只记一步准备）照新的主线目标原文再发，至多「合同动作数」回合，断言本拍最终记为完成。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { chromium } from 'playwright-core';
import { FIXTURE_NONE, classifyFixtureRequest, fixtureCompletion, installSmokeNetworkGuard } from './e2e-smoke.mjs';

// musicLibrary.ts 直接 import 曲目 .mp3；Node 下只当 URL 字符串模块（同 tests/linesReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
// 期望值按内测构建算（被测站点是 --mode development 的内测构建：任务模式 story.quest 读 enabledDev）。
// 站点若是正式构建，任务日志不出现，下面「任务日志应列主线目标」会直接红，不会静默错配。
globalThis.MODULE_DEV_DEFAULTS = true;
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const { loadTs } = await import('../tests/loadTs.mjs');
const [R, P, NV, LC, QL, GN] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/contentPacks/index.ts', '../src/modules/scenarioMods/eventNarrativeView.ts',
  '../src/modules/scenarioMods/lineCompass.ts', '../src/modules/scenarioMods/questLog.ts', '../src/modules/sceneModule/numbers.ts',
].map(p => loadTs(p))));
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

/** 八条线的中段档（夹具路径相对 tests/fixtures）。 */
const LINES = [
  { key: 'saiwai', label: '塞外', file: 'lines-replay/saiwai-mid.json' },
  { key: 'zhaonan', label: '昭南（南荒）', file: 'lines-replay/zhaonan-mid.json' },
  { key: 'jin', label: '晋', file: 'lines-replay/jin-mid.json' },
  { key: 'song', label: '宋', file: 'song-replay/song-linan-mid.json' },
  { key: 'han', label: '汉', file: 'lines-replay/han-mid.json' },
  { key: 'tang', label: '唐', file: 'lines-replay/tang-mid.json' },
  { key: 'qin', label: '秦', file: 'qin-replay/qin-rail-mid.json' },
  { key: 'taiquan', label: '太泉', file: 'lines-replay/taiquan-mid.json' },
];
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1] ?? ''; args.splice(i, 2); return v.split(',').filter(Boolean); };
const only = flag('--only');
const baseUrls = args;
assert.ok(baseUrls.length, '缺少站点 URL：node scripts/smoke-line-turns.mjs http://127.0.0.1:端口/');
const lines = only ? LINES.filter(l => only.includes(l.key)) : LINES;
assert.ok(lines.length, `--only 没选中任何线（可选：${LINES.map(l => l.key).join(',')}）`);

const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const MODS = readdirSync(dataDir).filter(f => f.endsWith('.json')).sort()
  .map(f => P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))));
const EVIDENCE_MAX = GN.GAME_NUMBERS.story.quest.intentSettle.beatJudge.evidenceMaxChars;
assert.ok(Number.isInteger(EVIDENCE_MAX) && EVIDENCE_MAX > 0, 'beatJudge.evidenceMaxChars 须为正整数');

/** 导入链 + 游戏读档链（同 tests/linesReplayFixtures.test.mjs 的 importBundle / loadLikeGame）。 */
async function loadLikeGame(slot, label) {
  const raw = slot.存档数据;
  const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
  assert.equal(validateSaveDataV3(save).isValid, true, `${label} 导入校验未通过`);
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('line-turns', label, JSON.parse(JSON.stringify(save)), { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}

/** 期望值：只从存档与 catalog 算，不抄剧情文字。 */
async function expectationOf(line) {
  const bundle = JSON.parse(readFileSync(new URL(`../tests/fixtures/${line.file}`, import.meta.url), 'utf8'));
  const unwrapped = unwrapDadBundle(bundle);
  assert.equal(unwrapped.type, 'saves');
  assert.equal(unwrapped.payload.saves.length, 1, `${line.file} 应只含一份档`);
  const slot = unwrapped.payload.saves[0];
  const save = await loadLikeGame(slot, line.key);
  const rt = save.世界.状态.剧本模组;
  const focus = R.getScenarioFocusEvent(rt);
  assert.ok(focus?.id, `${line.key} 中段档应有焦点拍`);
  const chapter = (rt.chapters || []).find(c => c.eventIds?.includes(focus.id)) || (rt.chapters || []).find(c => c.id === rt.currentChapterId);
  assert.ok(chapter, `${line.key} 焦点拍应有所属章`);
  const compass = await quiet(async () => LC.lineCompassView(save, { focusEventId: focus.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => '' }));
  // 当前线可为 null：塞外（序幕）不在 7 条国家线里，右栏按设计退回主线指南针那一句（lineCompass.ts 文件头）。
  const quest = await quiet(async () => QL.questLogView(save, MODS));
  const main = quest.current.filter(e => e.line === 'main');
  assert.equal(main.length, 1, `${line.key} 任务日志应恰有一条主线目标：${JSON.stringify(quest.current.map(e => [e.line, e.title]))}`);
  assert.ok(main[0].objective, `${line.key} 主线目标应有文字`);
  return {
    slot, stage: rt.modId, focus: focus.id, lineName: compass.current?.name ?? null, lineId: compass.current?.lineId ?? null,
    chapter: `章节：${NV.storyChapterTitle(rt.modId, focus.id, chapter.title || chapter.id)}`,
    objective: main[0].objective, title: main[0].title, questText: `${main[0].title}：${main[0].objective}`, completed: rt.completedEventIds.length,
    maxTurns: Math.max(1, Math.min(4, focus.playerCompletionContract?.actions?.length ?? 1)),
  };
}
const EXPECT = {};
for (const line of lines) EXPECT[line.key] = await expectationOf(line);

/** ev：玩家原句里第一个分句（逐字连续），截到上限。 */
const evidenceOf = text => (String(text).split(/[，。！？；、,.!?;]/).find(s => s.trim()) || String(text)).trim().slice(0, EVIDENCE_MAX);
const narrationOf = line => JSON.stringify({
  text: `你照着眼下的打算行事，身边的人各自看了你一眼，没有多言。风从${line.label}的方向吹过来，你稳住心神，把这一步做完。`,
  mid_term_memory: `${line.label}线：按当前目标行事，这一步已做完。`, tavern_commands: [], action_options: [],
});

const PINIA = "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia";
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
let failed = 0;
try {
  for (const baseUrl of baseUrls) {
    const context = await browser.newContext();
    // 网络护栏先装：脚本路由处理不了的请求 route.fallback() 落到护栏（非本机一律替身或 abort+判失败）。
    const guard = await installSmokeNetworkGuard(context);
    await context.addInitScript(() => {
      localStorage.setItem('ai_service_config', JSON.stringify({
        mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture-not-a-secret', model: 'fixture' },
      }));
      // 记下任何出现过的 LCQ 报错码（toast 会自动消失，轮询读不全）。
      window.__lcqSeen = [];
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          const text = node.textContent || '';
          for (const m of text.matchAll(/LCQ-[A-Z]+-\d{3}/g)) window.__lcqSeen.push(m[0]);
        }
      }).observe(document, { childList: true, subtree: true });
    });
    let current = null;
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/\/api\/v1\/save-storage(?:\/|$)/.test(url.pathname)) return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      if (request.method() === 'POST' && /completions/.test(url.pathname)) {
        const body = request.postDataJSON();
        let kind = classifyFixtureRequest(body);
        let content = kind === 'narration' ? narrationOf(current?.line ?? { label: '' }) : FIXTURE_NONE[kind];
        // 主叙事回合后的后台一致性整理（mod-kit/dual-model.json）：分类器不认，按它的输出格式回空整理、原样抄回 turnId。
        const system = String(body.messages?.[0]?.content || '');
        if (kind === 'narration' && /后台一致性整理器/.test(system)) {
          kind = 'consistency';
          const turnId = (() => { try { return JSON.parse(body.messages.at(-1).content).turnId; } catch { return ''; } })();
          content = JSON.stringify({ turnId, npcMemory: [], relationNotes: [], continuity: [], summaryCheck: { ok: true, issue: '' } });
        }
        if (kind === 'beat' && current) {
          const beat = (body.messages || []).map(m => { try { return JSON.parse(m.content); } catch { return null; } }).find(p => p?.playerText && Array.isArray(p.actions));
          current.beatActions = beat.actions.map(a => a.id);
          content = JSON.stringify({ id: beat.actions[0].id, c: 'high', ev: evidenceOf(beat.playerText), neg: false });
        }
        current?.requests.push(kind);
        if (process.env.SMOKE_LINE_TURNS_DEBUG) console.log('REQ', kind, body.model, body.stream, JSON.stringify((body.messages || []).map(m => String(m.content).slice(0, 160))).slice(0, 700));
        return route.fulfill(fixtureCompletion(body, content));
      }
      return route.fallback();
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const state = () => page.evaluate(PINIA_EXPR => {
      const stores = eval(PINIA_EXPR)._s;
      const save = stores.get('gameState').toSaveData();
      const rt = save?.世界?.状态?.剧本模组 || {};
      return { busy: stores.get('ui').isAIProcessing, modId: rt.modId, history: save?.系统?.历史?.叙事?.length ?? 0, lcq: [...window.__lcqSeen] };
    }, PINIA);
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      // 进游戏拿一个单机隔离角色（星月湖试玩入口），之后各线档都导入到这个角色名下。
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 25_000 });
      const charId = await page.evaluate(expr => eval(expr)._s.get('characterV3').rootState.当前激活存档.角色ID, PINIA);
      assert.ok(charId, '试玩入口应建好单机角色');

      for (const line of lines) {
        const exp = EXPECT[line.key];
        current = { line, requests: [], beatActions: null };
        const t0 = Date.now();
        const record = { key: line.key, label: line.label, file: line.file, save: exp.slot.存档名, stage: exp.stage, focus: exp.focus, lineName: exp.lineName, chapter: exp.chapter, objective: exp.objective };
        results.push(record);
        try {
          // 1. 导入并读档：真实 importSave（V3 迁移+校验，落一次性上下文 IndexedDB）→ loadGame（读档校验+修补链）。
          const loaded = await page.evaluate(async ({ expr, charId, slot }) => {
            const stores = eval(expr)._s;
            const character = stores.get('characterV3');
            window.__lcqSeen.length = 0;
            const name = await character.importSave(charId, slot, { overwrite: true });
            const ok = await character.loadGame(charId, name);
            const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
            if (router.currentRoute.value.path !== '/game') await router.push('/game');
            return { name, ok };
          }, { expr: PINIA, charId, slot: exp.slot });
          assert.equal(loaded.ok, true, '读档应成功');
          await page.locator('textarea.game-input').waitFor({ timeout: 20_000 });
          await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 20_000 });
          const ui = await page.evaluate(expr => {
            const stores = eval(expr)._s;
            const save = stores.get('gameState').toSaveData();
            const rt = save.世界.状态.剧本模组;
            const text = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.trim());
            const tagged = tag => text('.quest-main .quest-chapter').filter(t => t.startsWith(tag)).map(t => t.slice(tag.length).trim());
            return {
              modId: rt.modId, completed: rt.completedEventIds.length, history: save.系统.历史.叙事.length,
              lineName: tagged('当前线'), chapter: tagged('主线'), questLog: text('[data-testid="quest-log"] .quest-log-entry .quest-event'),
            };
          }, PINIA);
          assert.equal(ui.modId, exp.stage, '读档后所在关');
          assert.equal(ui.completed, exp.completed, '读档后已完成拍数同存档');
          assert.deepEqual(ui.lineName, exp.lineName ? [exp.lineName] : [], exp.lineName ? `「当前线」应为 ${exp.lineName}` : '本档不在国家线上，不应出「当前线」行');
          assert.deepEqual(ui.chapter, [exp.chapter], `章节名应为 ${exp.chapter}`);
          assert.ok(ui.questLog.some(t => t.endsWith(exp.questText)), `任务日志应列主线目标「${exp.questText}」，实际 ${JSON.stringify(ui.questLog)}`);
          const lcqAfterLoad = (await state()).lcq;
          assert.deepEqual(lcqAfterLoad, [], '读档后不应弹 LCQ 报错码');

          // 2. 发回合：输入＝任务日志主线目标原文（选中这一拍）。多步合同的拍一回合只记一步（准备步），
          //    就照新的主线目标原文再发，至多「合同动作数」回合；每回合都断言落定、本拍记了一步、历史恰多一条。
          record.turns = [];
          let history = ui.history, attempts = 0, focusDone = false, text = exp.objective;
          for (let turn = 1; turn <= exp.maxTurns && !focusDone; turn++) {
            const sent = current.requests.length;
            await page.locator('textarea.game-input').fill(text);
            await page.locator('.send-button').click();
            await page.waitForTimeout(800);
            await page.waitForFunction(({ expr, history }) => {
              const stores = eval(expr)._s;
              return !stores.get('ui').isAIProcessing && stores.get('gameState').toSaveData().系统.历史.叙事.length > history;
            }, { expr: PINIA, history }, { timeout: 45_000 });
            await page.waitForTimeout(500);
            const after = await page.evaluate(({ expr, focus, title }) => {
              const stores = eval(expr)._s;
              const save = stores.get('gameState').toSaveData();
              const rt = save.世界.状态.剧本模组;
              const mainEntry = [...document.querySelectorAll('[data-testid="quest-log"] .quest-log-entry .quest-event')].map(e => e.innerText.trim())
                .map(t => t.slice(t.indexOf(`${title}：`))).find(t => t.startsWith(`${title}：`));
              return { busy: stores.get('ui').isAIProcessing, modId: rt.modId, history: save.系统.历史.叙事.length,
                focusDone: rt.completedEventIds.includes(focus), attempts: rt.eventActionStates?.[focus]?.attemptCount ?? 0,
                preparations: rt.eventActionStates?.[focus]?.preparations ?? [], lastOutcome: rt.eventActionStates?.[focus]?.lastOutcome ?? null,
                hold: document.querySelector('[data-testid="intent-hold-message"]')?.innerText ?? '', lcq: [...window.__lcqSeen],
                nextText: mainEntry ? mainEntry.slice(title.length + 1) : null };
            }, { expr: PINIA, focus: exp.focus, title: exp.title });
            const kinds = current.requests.slice(sent);
            record.turns.push({ turn, text, requests: kinds, historyDelta: after.history - history, attempts: after.attempts, preparations: after.preparations, done: after.focusDone });
            assert.equal(after.busy, false, `第${turn}回合应落定（不再 AI 处理中）`);
            assert.equal(after.modId, exp.stage, `第${turn}回合后仍在本关`);
            assert.equal(after.history, history + 1, `第${turn}回合历史应恰多一条`);
            assert.ok(kinds.includes('narration'), `第${turn}回合正文请求应走替身`);
            assert.ok(after.focusDone || (after.attempts > attempts && after.lastOutcome === 'success'),
              `第${turn}回合当前拍 ${exp.focus} 应记一步或完成（hold=${after.hold}；attempts=${after.attempts}；preparations=${JSON.stringify(after.preparations)}）`);
            assert.deepEqual(after.lcq, [], `第${turn}回合不应弹 LCQ 报错码`);
            history = after.history; attempts = after.attempts; focusDone = after.focusDone;
            if (!focusDone) { assert.ok(after.nextText, `第${turn}回合后任务日志应仍列本拍主线目标`); text = after.nextText; }
          }
          assert.ok(focusDone, `当前拍 ${exp.focus} 应在 ${exp.maxTurns} 回合内记为完成`);
          // 3. 落账：持久化的工作槽读回来比对。
          const persisted = await page.evaluate(async ({ expr, charId }) => {
            const character = eval(expr)._s.get('characterV3');
            const slot = character.rootState.当前激活存档.存档槽位;
            const data = await character.loadSaveData(charId, slot);
            return { slot, history: data?.系统?.历史?.叙事?.length ?? null, completed: data?.世界?.状态?.剧本模组?.completedEventIds ?? null };
          }, { expr: PINIA, charId });
          record.requests = current.requests;
          record.beatActions = current.beatActions;
          record.historyDelta = history - ui.history;
          record.persisted = { slot: persisted.slot, history: persisted.history };
          assert.ok(persisted.completed?.includes(exp.focus), '持久化的工作槽里当前拍应已完成');
          assert.equal(persisted.history, history, '持久化的工作槽历史条数同运行时');
          assert.deepEqual(pageErrors, [], '控制台不应有未捕获异常');
          record.status = 'passed';
        } catch (error) {
          failed++;
          record.status = 'failed';
          record.error = String(error.message || error).split('\n').slice(0, 6).join(' / ');
          record.requests ||= current.requests;
          record.visible = (await page.locator('body').innerText().catch(() => '')).slice(-600).replace(/\s+/g, ' ');
          pageErrors.length = 0;
        }
        record.ms = Date.now() - t0;
        console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${line.key}（${line.label}）${exp.stage} 焦点 ${exp.focus}：${record.status === 'passed'
          ? `当前线「${exp.lineName ?? '（无，退回指南针）'}」${exp.chapter}；输入主线目标 ${record.turns.length} 回合 → 本拍完成，历史+${record.historyDelta}，工作槽 ${record.persisted.slot} 已落账；请求 ${JSON.stringify(record.requests)}${record.beatActions ? ` 判定候选 ${JSON.stringify(record.beatActions)}` : '（无拍子判定小请求）'}`
          : `${record.error}；请求 ${JSON.stringify(record.requests)}；页面尾 ${record.visible}`}（${(record.ms / 1000).toFixed(1)}s）`);
      }
      current = null;
      guard.finish();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (process.env.SMOKE_LINE_TURNS_JSON) (await import('node:fs')).writeFileSync(process.env.SMOKE_LINE_TURNS_JSON, JSON.stringify(results, null, 2));
console.log(`${failed ? 'FAIL' : 'PASS'} smoke-line-turns：${results.length - failed}/${results.length} 条线通过`);
process.exit(failed ? 1 : 0);
