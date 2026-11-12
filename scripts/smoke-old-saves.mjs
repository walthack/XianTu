// 受控浏览器冒烟（不调模型）：仓库里全部完整旧档夹具，在浏览器里逐份导入→读档→核对界面→走一手。
// 清单不抄：现场从 tests/loadReconcileChain.test.mjs 的 `const LEGACY = [...]` 字面量读（同一份清单 Node 侧已走真实读档对账链路）。
// smoke-line-turns 已覆盖的 8 份中段档也一并纳入（那边测多步合同走完一拍，这里测读档+第一手，口径不同，不重复）。
// 期望值在 Node 里用源码现场算，且在独立子进程里算：子进程只经 tests/loadReconcileChainHarness.mjs 加载 src（补了 require.context，
//   读档对账真的执行，与浏览器一致；该 harness 要求本进程不再用 tests/loadTs.mjs，所以与浏览器侧的 lineSmokeHarness 分进程）。
//   读档＝validateLoadedSave → applyLoadRepairs → migrateNarrativeDetailOnLoad（同 characterStore.loadGame）；界面期望照 RightSidebar 的取法（questLogView／lineCompassView／
//   questMain 章节行／characterBeats 人物行）；走一手的期望＝对当前拍的每个界面动作在读档后的同一状态上做 clickButton（MainGamePanel→AIBS 落账→回合尾 advance），
//   浏览器落账后的进度须等于其中一个动作的结果（记下是哪个）；关末启程用 transitionToNextScenarioStage。
// 浏览器里走真实存储接口 importSave → loadGame（一次性上下文 IndexedDB；save-storage 替身 501，不写测试服）；模型请求全部替身；网络护栏同其它冒烟。
// 用法：node scripts/smoke-old-saves.mjs <站点URL…> [--only 夹具路径子串,…]；SMOKE_OLD_SAVES_JSON＝结果写成 JSON。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const CHILD = process.env.SMOKE_OLD_SAVES_CHILD === '1';

/** LEGACY 清单：从测试文件源码里取 `const LEGACY = [ ... ];` 字面量求值（内含 flatMap，只用到字面量与数组方法）。 */
export function legacyList() {
  const text = readFileSync(new URL('../tests/loadReconcileChain.test.mjs', import.meta.url), 'utf8');
  const m = text.match(/\nconst LEGACY = (\[[\s\S]*?\n\]);/);
  assert.ok(m, 'tests/loadReconcileChain.test.mjs 里找不到 const LEGACY = [...]');
  const list = new Function(`return ${m[1]};`)();
  assert.ok(Array.isArray(list) && list.length && list.every(f => typeof f === 'string'), 'LEGACY 应为非空字符串数组');
  return list;
}

const STALE = ['stale_contract', 'stale_event'];
const BAD_TEXT = /undefined|NaN|\[object Object\]|\{[A-Za-z_一-龥]{1,20}\}|<<[^>]{0,40}>>|\$\{/g;

// ───────────── 子进程：Node 侧期望 ─────────────
async function childMain(files) {
  globalThis.MODULE_DEV_DEFAULTS = true; // 被测站点是内测构建（任务模式 story.quest 读 enabledDev），同 lineSmokeHarness
  const H = await import('../tests/loadReconcileChainHarness.mjs');
  const { R, rt, quiet } = H;
  const mods = await H.load('modules/scenarioMods/builtins/index.ts');
  const L = {};
  for (const [k, p] of Object.entries({ QL: 'modules/scenarioMods/questLog.ts', LC: 'modules/scenarioMods/lineCompass.ts', NV: 'modules/scenarioMods/eventNarrativeView.ts',
    CQ: 'modules/scenarioMods/characterQuests.ts', QLV: 'modules/scenarioMods/questLineView.ts', TL: 'modules/scenarioMods/travel/travelLedger.ts',
    I: 'modules/scenarioMods/strictInitializer.ts', QO: 'modules/scenarioMods/qingyuOpeningPlaytest.ts', D: 'utils/dataRepair.ts', SM: 'utils/saveMigration.ts', SV: 'utils/saveValidationV3.ts' })) L[k] = await H.load(p);
  const MODS = mods.BUILTIN_SCENARIO_MODS;

  const progressOf = save => {
    const r = rt(save);
    return { modId: r.modId, completed: [...(r.completedEventIds || [])].sort(), active: [...(r.activeEventIds || [])].sort(),
      nextStageReadyId: r.nextStageReadyId ?? null, gameOver: r.gameOver?.endingId ?? null };
  };
  // 没有进度的状态与没有状态等价（界面那一侧回合里的 advance 可能先建一个空状态）。
  const beatState = (save, id) => { const s = id && rt(save).eventActionStates?.[id]; return s && ((s.attemptCount || 0) || s.preparations?.length) ? { attempts: s.attemptCount || 0, preparations: [...(s.preparations || [])].sort() } : null; };

  /** 照 RightSidebar：主线章节行、当前线、任务日志（按 main/country/character 分组顺序）、「这一拍谁有戏」人物行。 */
  function sidebarOf(save) {
    const r = rt(save);
    const at = L.TL.locationFromPosition(String(save.角色?.位置?.描述 || ''), r.canon?.locations).locationId;
    const history = save.系统?.历史?.叙事 || [];
    const present = L.NV.questCompassPresentIds({ 角色: { 位置: save.角色?.位置 }, 社交: { 关系: save.社交?.关系 }, 世界: { 状态: save.世界?.状态 } },
      history.slice(-2).map(e => String(e?.content || '')).join('\n'));
    const focus = R.getScenarioFocusEvent(r);
    const chapter = (r.chapters || []).find(c => focus && c.eventIds?.includes(focus.id)) || (r.chapters || []).find(c => c.id === r.currentChapterId);
    const compass = L.LC.lineCompassView(save, { focusEventId: focus?.id, atLocationId: at, compassPointer: () => '' });
    const quest = L.QL.questLogView(save, MODS);
    const order = ['main', 'country', 'character'];
    const entries = order.flatMap(line => quest.current.filter(e => e.line === line));
    // characterBeats：以 advance(live) 后的运行时取当前拍（同 RightSidebar）。
    const adv = rt(R.advanceScenarioRuntime(save).saveData);
    const ev = R.getScenarioFocusEvent(adv);
    let objective = '';
    if (ev) {
      const view = L.NV.resolveScenarioEventNarrative(ev, adv.flags || {}, adv.divergences, adv);
      const atAdv = L.TL.locationFromPosition(String(save.角色?.位置?.描述 || ''), adv.canon?.locations).locationId;
      objective = L.NV.formatQuestCompass(view, adv, atAdv, present) || String(view.objective || '').trim();
    }
    const lv = L.QLV.questLineView(save);
    const rows = !objective ? [...lv.character.filter(b => b.actions.length), ...lv.closed, ...lv.resolved]
      : [...L.CQ.characterBeatsAt(ev?.id).map(b => ({ name: b.name, objective })), ...lv.character, ...lv.closed, ...lv.resolved];
    return {
      focus: focus?.id ?? null,
      // questMain 为 null（无章、无锚点、无启程、未停滞）时不出章节行；有章才出。
      chapter: chapter ? `章节：${L.NV.storyChapterTitle(r.modId, focus?.id, chapter.title || chapter.id)}` : null,
      lineName: compass.current?.name ?? null,
      quest: entries.map(e => ({ key: e.key, line: e.line, text: `${e.title}：${e.objective}`, objective: e.objective })),
      people: rows.map(b => `${b.name}——${b.objective}`),
    };
  }

  const out = [];
  for (const file of files) {
    const rec = { file };
    try {
      const url = new URL(`../tests/fixtures/${file}`, import.meta.url);
      const raw = file.endsWith('.gz') ? JSON.parse(gunzipSync(readFileSync(url))) : JSON.parse(readFileSync(url, 'utf8'));
      const save = H.readFixtureSave(file);
      const bundleSlot = raw.type === 'saves' ? H.unwrapDadBundle(raw).payload.saves[0] : null;
      rec.slot = bundleSlot ? { ...bundleSlot, 存档名: `旧档冒烟-${file}` } : { 存档名: `旧档冒烟-${file}`, 存档数据: save };
      rec.format = bundleSlot ? 'DAD bundle' : raw.save ? '{source,save}' : raw.存档 ? '{说明,来源,存档}' : '裸存档';
      // 导入链（importSave）：非 V3 先迁移，再 V3 校验。
      const v3 = L.SM.isSaveDataV3(save) ? save : L.SM.migrateSaveDataToLatest(save).migrated;
      rec.v3Already = L.SM.isSaveDataV3(save);
      const valid = L.SV.validateSaveDataV3(v3);
      assert.equal(valid.isValid, true, `导入校验未通过：${valid.errors?.[0]}`);
      const live = await H.loadLikeGame(v3, file);
      // characterStore.loadGame 读档修补之后还有「详细描写不入档」迁移（正文换概要；右栏人物行的「见X」看最近两条正文，须同口径）。
      rec.narrativeMigration = await quiet(() => L.D.migrateNarrativeDetailOnLoad(live, 'smoke-old-saves'));
      rec.loaded = progressOf(live);
      rec.scene = Boolean(H.activeScene(live));
      rec.ui = quiet(() => sidebarOf(live));
      rec.focusState = beatState(live, rec.ui.focus);
      const offer = quiet(() => R.getStageDepartureOffer(live));
      const departure = offer && rec.ui.quest.find(e => e.key === `departure:${offer.nextStageId}`);
      // 清羽开局试玩档：任务日志按设计不出（questGuideEnabled 对它为 false），主面板出主线／地方按钮（点按填入再发送）。
      rec.questGuide = L.QL.questGuideEnabled(live);
      rec.demoFinished = L.QO.isNanhuangDemoFinished(live);
      if (rec.loaded.gameOver) rec.plan = { kind: 'ending' };
      else if (rec.demoFinished) rec.plan = { kind: 'demoEnd' };
      else if (rec.scene) {
        // 场面档：取该场面合同（包数据）的第一个目标，玩家句用它的别名；替身识别器回这个目标 id。
        const a = H.activeScene(live);
        const { CONTENT_PACKS } = await H.load('modules/contentPacks/index.ts');
        const goal = CONTENT_PACKS.contracts.find(c => c.meta?.id === a.contractId)?.goals?.[0];
        rec.plan = { kind: 'scene', contractId: a.contractId, pending: Boolean(a.pending), goalId: goal?.id ?? null, line: goal ? `我${goal.aliases?.[0] || goal.label}` : '我稳住阵脚，先看清眼前局面' };
      }
      else if (offer && !rec.questGuide) {
        const result = quiet(() => L.I.transitionToNextScenarioStage(structuredClone(live), MODS));
        assert.ok(result.ok, `Node 侧切关失败：${result.reason}`);
        rec.plan = { kind: 'departButton', label: offer.label, next: rt(result.saveData).modId, nextName: result.toName, after: progressOf(result.saveData) };
      } else if (departure) {
        const result = quiet(() => L.I.transitionToNextScenarioStage(structuredClone(live), MODS));
        assert.ok(result.ok, `Node 侧切关失败：${result.reason}`);
        rec.plan = { kind: 'depart', typed: departure.objective, next: rt(result.saveData).modId, nextName: result.toName, after: progressOf(result.saveData) };
      } else {
        const main = rec.ui.quest.find(e => e.line === 'main');
        const buttons = quiet(() => H.uiButtons(live));
        const pick = quiet(() => H.pickButton(buttons));
        const all = [...buttons.eventActions.map(s => ({ kind: 'event', selection: s })), ...buttons.openWorld.map(s => ({ kind: 'open_world', selection: s }))];
        const outcomes = [];
        for (const b of all) {
          const id = b.selection.actionId || b.selection.identityId || b.selection.id;
          const one = { id, label: b.selection.label ?? null, eventId: b.selection.eventId ?? null, kind: b.kind, picked: Boolean(pick && (pick.selection === b.selection)) };
          try {
            const copy = structuredClone(live);
            const { receipt, after } = H.clickButton(copy, b);
            one.reason = receipt?.reason ?? null;
            one.completed = Boolean(receipt?.completed);
            one.after = progressOf(after);
            one.focusState = beatState(after, rec.ui.focus);
            if (STALE.includes(one.reason)) {
              // 第一次被拒：第二次点同一动作（按钮从推进后的状态重取）。
              const again = quiet(() => H.uiButtons(after));
              const second = [...again.eventActions.map(s => ({ kind: 'event', selection: s })), ...again.openWorld.map(s => ({ kind: 'open_world', selection: s }))]
                .find(x => (x.selection.actionId || x.selection.identityId || x.selection.id) === id);
              if (second) {
                const r2 = H.clickButton(after, second);
                one.second = { reason: r2.receipt?.reason ?? null, completed: Boolean(r2.receipt?.completed), after: progressOf(r2.after), focusState: beatState(r2.after, rec.ui.focus) };
              }
            }
          } catch (error) { one.error = String(error.message || error); }
          outcomes.push(one);
        }
        rec.plan = !rec.questGuide && outcomes.length ? { kind: 'button', outcomes, pickedId: pick ? (pick.selection.actionId || pick.selection.identityId) : null, pickedLabel: pick?.selection.label ?? null }
          : main ? { kind: 'type', typed: main.objective, title: main.text.slice(0, main.text.indexOf('：')), outcomes, pickedId: pick ? (pick.selection.actionId || pick.selection.identityId) : null }
          : { kind: 'none', outcomes, ...(() => {
            // 任务日志没有主线目标：玩家只能自由说一句。期望＝回合尾 advance(live) 之后的进度与任务日志（不经任何动作落账）。
            const advanced = quiet(() => R.advanceScenarioRuntime(structuredClone(live)).saveData);
            return { freeAfter: progressOf(advanced), freeQuest: quiet(() => sidebarOf(advanced)).quest.map(e => e.text) };
          })() };
      }
    } catch (error) { rec.error = String(error.stack || error.message || error).split('\n').slice(0, 4).join(' / '); }
    out.push(rec);
  }
  // 写进管道要等刷完再退出（直接 process.exit 会截断大输出）。
  await new Promise(resolve => process.stdout.write(`@@EXPECT@@${JSON.stringify(out)}`, resolve));
}

if (CHILD) {
  await childMain(JSON.parse(process.env.SMOKE_OLD_SAVES_FILES));
  process.exit(0);
}

// ───────────── 主进程：浏览器侧 ─────────────
const { chromium } = await import('playwright-core');
const { PINIA, enterIsolatedCharacter, importAndLoad, openSmokeContext, readPersisted } = await import('./lineSmokeHarness.mjs');

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1] ?? ''; args.splice(i, 2); return v.split(',').filter(Boolean); };
const only = flag('--only');
const baseUrls = args;
assert.ok(baseUrls.length, '缺少站点 URL：node scripts/smoke-old-saves.mjs http://127.0.0.1:端口/');
const LEGACY = legacyList();
const files = only ? LEGACY.filter(f => only.some(o => f.includes(o))) : LEGACY;
assert.ok(files.length, '--only 没选中任何夹具');

const tExp = Date.now();
const child = spawnSync(process.execPath, [SELF], { env: { ...process.env, SMOKE_OLD_SAVES_CHILD: '1', SMOKE_OLD_SAVES_FILES: JSON.stringify(files) }, encoding: 'utf8', maxBuffer: 1 << 30, timeout: 240_000 });
assert.ok(child.stdout.includes('@@EXPECT@@'), `Node 侧期望子进程失败（退出 ${child.status}）：${child.stderr.slice(-1500)}`);
const EXPECT = JSON.parse(child.stdout.split('@@EXPECT@@').pop());
console.log(`Node 侧期望：${EXPECT.length} 份（清单来源 tests/loadReconcileChain.test.mjs LEGACY，共 ${LEGACY.length} 份），用时 ${((Date.now() - tExp) / 1000).toFixed(1)}s`);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const brief = p => p ? `${p.modId} 完成${p.completed.length} 激活[${p.active.join(',')}]${p.nextStageReadyId ? ` 就绪→${p.nextStageReadyId}` : ''}${p.gameOver ? ` 结局${p.gameOver}` : ''}` : '—';

/** 浏览器里读：运行时进度、右栏、主面板状态、坏字样。 */
const readUi = (page, focus) => page.evaluate(({ expr, focus, badSrc }) => {
  const stores = eval(expr)._s;
  const save = stores.get('gameState').toSaveData();
  const r = save.世界.状态.剧本模组;
  const text = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.trim());
  const tagged = tag => text('.quest-main .quest-chapter').filter(t => t.startsWith(tag)).map(t => t.slice(tag.length).trim());
  const peopleSection = [...document.querySelectorAll('.quest-section')].find(s => s.querySelector('.section-title')?.innerText.includes('这一拍谁有戏'));
  const people = peopleSection ? [...peopleSection.querySelectorAll('.quest-main > .quest-event')].map(e => (e.querySelector('div')?.innerText || e.innerText).trim()
    .replace(/^·/, '').replace(/\s*▸.*$|\s*▾$/, '').trim()) : [];
  const appText = document.querySelector('#app')?.innerText || '';
  const bad = [...appText.matchAll(new RegExp(badSrc, 'g'))].map(m => appText.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12).replace(/\s+/g, ' '));
  const s = focus && r.eventActionStates?.[focus];
  return {
    progress: { modId: r.modId, completed: [...(r.completedEventIds || [])].sort(), active: [...(r.activeEventIds || [])].sort(), nextStageReadyId: r.nextStageReadyId ?? null, gameOver: r.gameOver?.endingId ?? null },
    focusState: s && ((s.attemptCount || 0) || s.preparations?.length) ? { attempts: s.attemptCount || 0, preparations: [...(s.preparations || [])].sort() } : null,
    history: save.系统?.历史?.叙事?.length ?? 0, busy: stores.get('ui').isAIProcessing,
    scene: Boolean(save.系统?.扩展?.场面模块?.active), sceneNotice: save.系统?.扩展?.场面模块?.active?.notice || '',
    sceneCard: document.querySelector('section.scene-encounter')?.innerText.replace(/\s+/g, ' ').slice(-120) ?? '',
    chapter: tagged('主线'), lineName: tagged('当前线'),
    quest: text('[data-testid="quest-log"] .quest-log-entry .quest-event'), people,
    endingCard: document.querySelector('.game-over-card')?.innerText.replace(/\s+/g, ' ').slice(0, 80) ?? null,
    inputDisabled: document.querySelector('textarea.game-input')?.disabled ?? null,
    hold: document.querySelector('[data-testid="intent-hold-message"]')?.innerText ?? '',
    appChars: appText.length, bad, path: document.querySelector('#app').__vue_app__.config.globalProperties.$router.currentRoute.value.path, lcq: [...window.__lcqSeen],
  };
}, { expr: PINIA, focus, badSrc: BAD_TEXT.source });

/** 场面变化键（同 smoke-endings changeKey）：进度、历史、结局、场面拍／待定／选择／状态。 */
const SCENE_KEY_SRC = `expr => { const save = eval(expr)._s.get('gameState').toSaveData(), rt = save?.世界?.状态?.剧本模组 || {}, a = save?.系统?.扩展?.场面模块?.active;
  return \`\${(rt.completedEventIds || []).length}|\${(rt.activeEventIds || []).join(',')}|\${save?.系统?.历史?.叙事?.length ?? 0}|\${rt.gameOver?.endingId || ''}|\${a ? \`\${a.state?.beat}/\${!!a.pending}/\${!!a.choice}/\${a.state?.status}\` : ''}\`; }`;
const sceneKey = page => page.evaluate(({ expr, src }) => eval(src)(expr), { expr: PINIA, src: SCENE_KEY_SRC });

/**
 * 诊断日志码：控制台只打 warn 以上（diagnostics.consoleLevel），info 级读档修补提示要从页面的日志库读（lcq-log／logs，persistLevel=info，flushMs 后落盘）。
 * 返回 seq 大于 since 的 [{seq, level, code}]。
 */
const logEntries = (page, since) => page.evaluate(since => new Promise(resolve => {
  const open = indexedDB.open('lcq-log');
  open.onerror = () => resolve({ error: String(open.error) });
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('logs')) { db.close(); resolve([]); return; }
    const req = db.transaction('logs', 'readonly').objectStore('logs').getAll();
    req.onsuccess = () => { db.close(); resolve(req.result.filter(e => e.seq > since).map(e => ({ seq: e.seq, level: e.level,
      // LCQ-SYS-000＝未登记：多为 consolePatch 收进来的控制台 warn，带上原文开头才看得出是什么。
      code: e.code === 'LCQ-SYS-000' ? `LCQ-SYS-000(${String(e.detail?.originalCode || e.msg || '').replace(/^[^：]*：/, '').replace(/\s+/g, ' ').slice(0, 36)})` : e.code }))); };
    req.onerror = () => { db.close(); resolve({ error: String(req.error) }); };
  };
}), since);
const maxSeq = entries => entries.reduce((m, e) => Math.max(m, e.seq), 0);
const tally = entries => Object.entries(entries.reduce((m, e) => ((m[`${e.level}:${e.code}`] = (m[`${e.level}:${e.code}`] || 0) + 1), m), {})).map(([c, n]) => `${c}×${n}`);

let sceneGoal = null;
const sceneReply = body => {
  const sys = String(body.messages?.[0]?.content || '');
  if (/行动识别器/.test(sys)) return JSON.stringify({ goal: sceneGoal || '', claim: { magnitude: 1, scope: 'single', targets: [] }, levers: [], certainty: 'high', inputClass: 'action' });
  if (/只回答场内闲聊|场面描写|交锋/.test(sys) && !/每轮输出JSON|tavern_commands/.test(sys)) return '你稳住呼吸，局面随之一变。';
  return undefined;
};

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
let failed = 0;
try {
  for (const baseUrl of baseUrls) {
    let requests = [];
    const { context, guard } = await openSmokeContext(browser, {
      contextOptions: { viewport: { width: 1600, height: 1000 } },
      respond: (body, kind) => (kind === 'narration' ? sceneReply(body) : undefined),
      onRequest: kind => requests.push(kind),
    });
    const page = await context.newPage();
    const pageErrors = [];
    let consoleCodes = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', msg => { for (const m of msg.text().matchAll(/\[(LCQ-[A-Z]+-\d{3})\]/g)) consoleCodes.push(`${msg.type()}:${m[1]}`); });
    try {
      const charId = await enterIsolatedCharacter(page, baseUrl);
      await page.waitForTimeout(1000); // 进游戏阶段的日志先落盘，免得算进第一份档
      for (const exp of EXPECT) {
        const t0 = Date.now();
        const record = { file: exp.file, format: exp.format, plan: exp.plan?.kind ?? null };
        results.push(record);
        consoleCodes = []; requests = []; pageErrors.length = 0;
        try {
          assert.ok(!exp.error, `Node 侧期望算不出：${exp.error}`);
          // 1. 导入并读档。
          const seq0 = maxSeq(await logEntries(page, 0));
          await importAndLoad(page, charId, exp.slot);
          await page.waitForTimeout(900); // > diagnostics.flushMs，日志落盘
          const loadLog = await logEntries(page, seq0);
          assert.ok(Array.isArray(loadLog), `读不到页面日志库：${JSON.stringify(loadLog)}`);
          record.loadLog = tally(loadLog);
          assert.deepEqual(loadLog.filter(e => e.level === 'error').map(e => e.code), [], '读档时日志库不应有 error 级码');
          var seqLoad = maxSeq(loadLog) || seq0;
          const ui = await readUi(page, exp.ui.focus);
          record.load = brief(ui.progress);
          record.loadCodes = [...consoleCodes];
          assert.ok(ui.appChars > 200, `疑似白屏（#app 文字 ${ui.appChars} 字）`);
          assert.equal(ui.path, '/game', '读档后应在 /game');
          assert.deepEqual(ui.lcq, [], '读档后不应弹 LCQ 报错码');
          assert.deepEqual(record.loadCodes.filter(c => c.startsWith('error:')), [], '读档后控制台不应有 error 级 LCQ 码');
          assert.deepEqual(pageErrors, [], '读档后不应有未捕获异常');
          assert.equal(ui.progress.modId, exp.loaded.modId, '读档后所在关');
          assert.deepEqual(ui.progress, exp.loaded, `读档后运行时进度应同 Node 侧（浏览器 ${brief(ui.progress)}；Node ${brief(exp.loaded)}）`);
          // 2. 界面核对。
          assert.deepEqual(ui.chapter, exp.ui.chapter ? [exp.ui.chapter] : [], `章节行应为 ${exp.ui.chapter ?? '（无）'}`);
          assert.deepEqual(ui.lineName, exp.ui.lineName ? [exp.ui.lineName] : [], `「当前线」应为 ${exp.ui.lineName ?? '（无）'}`);
          assert.equal(ui.quest.length, exp.ui.quest.length, `任务日志当前条目数：界面 ${JSON.stringify(ui.quest)}；期望 ${JSON.stringify(exp.ui.quest.map(e => e.text))}`);
          exp.ui.quest.forEach((e, i) => assert.ok(ui.quest[i].endsWith(e.text), `任务日志第${i + 1}条应为「${e.text}」，实际「${ui.quest[i]}」`));
          assert.deepEqual(ui.people, exp.ui.people, '右栏「这一拍谁有戏」人物行');
          assert.deepEqual(ui.bad, [], '页面不应有 undefined／NaN／[object Object]／未替换占位符');
          record.ui = `章节「${exp.ui.chapter ?? '无'}」当前线「${exp.ui.lineName ?? '无'}」任务${exp.ui.quest.length}条 人物行${exp.ui.people.length}`;
          // 3. 走一手。
          const plan = exp.plan;
          // send(文字)＝在输入框手打发送；send(定位器)＝点主面板按钮（点按填入，填入后没自动发就再点发送）。
          const send = async what => {
            const before = await readUi(page, exp.ui.focus);
            if (typeof what === 'string') {
              await page.locator('textarea.game-input').fill(what);
              await page.locator('.send-button').click();
            } else {
              await what.click();
              await page.waitForTimeout(300);
              const sendBtn = page.locator('.send-button');
              const st = await readUi(page, exp.ui.focus);
              if (!st.busy && st.history === before.history && st.progress.modId === before.progress.modId && !(await sendBtn.isDisabled())) await sendBtn.click();
            }
            await page.waitForTimeout(500);
            await page.waitForFunction(({ expr, history, modId }) => {
              const st = eval(expr)._s; if (st.get('ui').isAIProcessing) return false;
              const save = st.get('gameState').toSaveData();
              return save.系统.历史.叙事.length > history || save.世界.状态.剧本模组.modId !== modId;
            }, { expr: PINIA, history: before.history, modId: before.progress.modId }, { timeout: 45_000, polling: 200 });
            await page.waitForTimeout(500);
            return { before, after: await readUi(page, exp.ui.focus) };
          };
          /** 点主面板按钮：文字含 Node 侧首选动作的标签的那个，没有就第一个。 */
          const engineButton = async label => {
            const all = page.locator('.engine-action-btn, .opportunity-action-options button');
            const texts = (await all.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
            assert.ok(texts.length, '主面板应有可点的行动按钮');
            const i = Math.max(0, label ? texts.findIndex(t => t.includes(label)) : 0);
            return { locator: all.nth(i), text: texts[i], texts };
          };
          if (plan.kind === 'ending' || plan.kind === 'demoEnd') {
            assert.ok(ui.endingCard, plan.kind === 'ending' ? '结局档应显示结局卡' : '南荒试玩已走完的档应显示「本期结束」卡');
            assert.equal(ui.inputDisabled, true, '结局后输入框应封住');
            record.turn = `${plan.kind === 'ending' ? '结局卡' : '试玩「本期结束」卡'}在（${ui.endingCard.slice(0, 30)}…），输入框封住；不走一手`;
          } else if (plan.kind === 'departButton') {
            requests = [];
            const btn = await engineButton(plan.label);
            const { after } = await send(btn.locator);
            assert.deepEqual(requests, [], '启程本身不应发模型请求');
            assert.deepEqual(after.progress, plan.after, `启程后进度应同 Node 侧切关（浏览器 ${brief(after.progress)}；Node ${brief(plan.after)}）`);
            record.turn = `点启程按钮「${btn.text}」→ ${plan.next}（${plan.nextName}）`;
          } else if (plan.kind === 'depart') {
            requests = [];
            const { after } = await send(plan.typed);
            assert.deepEqual(requests, [], '启程本身不应发模型请求');
            assert.deepEqual(after.progress, plan.after, `启程后进度应同 Node 侧切关（浏览器 ${brief(after.progress)}；Node ${brief(plan.after)}）`);
            assert.deepEqual(after.lcq, [], '启程后不应弹 LCQ 报错码');
            record.turn = `手打启程目标「${plan.typed}」→ ${plan.next}（${plan.nextName}）`;
          } else if (plan.kind === 'scene') {
            // 场面待确认时界面入口是「确认并掷骰」；否则在输入框说一句。等场面状态／进度／历史任一变化后落定。
            const confirm = page.locator('button', { hasText: '确认并掷骰' });
            const before = await readUi(page, exp.ui.focus);
            const key = await sceneKey(page);
            const waitKey = async k => {
              await page.waitForFunction(({ expr, key, src }) => !eval(expr)._s.get('ui').isAIProcessing && eval(src)(expr) !== key,
                { expr: PINIA, key: k, src: SCENE_KEY_SRC }, { timeout: 45_000, polling: 200 });
              await page.waitForTimeout(400);
            };
            let entry = '';
            const typePreview = async k => {
              sceneGoal = plan.goalId;
              entry += `输入「${plan.line}」→ 预览；`;
              await page.locator('textarea.game-input').fill(plan.line);
              await page.locator('.send-button').click();
              await waitKey(k);
              const notice = await page.evaluate(expr => eval(expr)._s.get('gameState').toSaveData()?.系统?.扩展?.场面模块?.active?.notice || '', PINIA);
              assert.ok(await confirm.count(), `场面应进入预览（出「确认并掷骰」）；场面提示「${notice}」`);
            };
            const judged = (a, b) => a.split('|')[2] !== b.split('|')[2] || a.split('|').pop().split('/')[0] !== b.split('|').pop().split('/')[0];
            if (!(await confirm.count())) await typePreview(key);
            let keyMid = await sceneKey(page);
            entry += '点「确认并掷骰」';
            await confirm.first().click();
            await waitKey(keyMid);
            let keyAfter = await sceneKey(page);
            if (!judged(keyMid, keyAfter)) {
              // 读档带来的旧预览确认后没掷骰（场面拍、历史都没动）：如实记下提示，按提示重打一遍再确认，断言第二次生效。
              const firstNotice = (await readUi(page, exp.ui.focus)).sceneNotice;
              record.gameIssue = `读档后场面旧预览第一次「确认并掷骰」不掷骰，提示「${firstNotice}」，须重打打法再确认`;
              entry += `（未掷骰：「${firstNotice}」）；`;
              await typePreview(keyAfter);
              keyMid = await sceneKey(page);
              entry += '再点「确认并掷骰」';
              await confirm.first().click();
              await waitKey(keyMid);
              keyAfter = await sceneKey(page);
              assert.ok(judged(keyMid, keyAfter), `重打后确认仍未掷骰：${keyMid} → ${keyAfter}`);
            }
            const after = await readUi(page, exp.ui.focus);
            const key2 = await sceneKey(page);
            assert.equal(after.busy, false, '应落定');
            assert.ok(after.history >= before.history, '历史不应减少');
            assert.deepEqual(after.lcq, [], '不应弹 LCQ 报错码');
            assert.equal(after.progress.modId, exp.loaded.modId, '场面一手后仍在本关');
            for (const id of exp.loaded.completed) assert.ok(after.progress.completed.includes(id), `场面一手后不应丢已完成拍 ${id}`);
            record.turn = `场面 ${plan.contractId}：${entry} → 落定，场面态 ${key.split('|').pop() || '无'} → ${key2.split('|').pop() || '已收'}，历史+${after.history - before.history}${after.sceneNotice ? `，场面提示「${after.sceneNotice}」` : ''}；${brief(after.progress)}（场面结算不在 Node 侧对照范围）`;
          } else if (plan.kind === 'type' || plan.kind === 'button') {
            const btn = plan.kind === 'button' ? await engineButton(plan.pickedLabel) : null;
            const how = btn ? `点主面板按钮「${btn.text}」` : '手打主线目标';
            const { before, after } = await send(btn ? btn.locator : plan.typed);
            const firstCodes = consoleCodes.filter(c => !record.loadCodes.includes(c));
            assert.equal(after.busy, false, '第一手应落定');
            assert.equal(after.history, before.history + 1, '第一手历史应恰多一条');
            assert.deepEqual(after.lcq, [], '第一手不应弹 LCQ 报错码');
            const key = s => JSON.stringify([s.after, s.focusState]);
            const got = JSON.stringify([after.progress, after.focusState]);
            const hit = plan.outcomes.find(o => !o.error && key(o) === got && !STALE.includes(o.reason));
            const staleOutcome = plan.outcomes.find(o => STALE.includes(o.reason) && o.id === plan.pickedId) || plan.outcomes.find(o => STALE.includes(o.reason));
            const unchanged = same(after.progress, before.progress) && same(after.focusState, before.focusState);
            record.firstHold = after.hold || '';
            if (hit) {
              record.turn = `${how} → 落账动作 ${hit.id}${hit.picked ? '（＝Node 当前拍首选）' : ''}${hit.completed ? '，本拍完成' : '，记一步'}；${brief(after.progress)}`;
            } else if (unchanged && staleOutcome) {
              // 读档后第一手被拒（Node 侧同一动作首点 stale_*）：如实记下界面现象，再发第二手看是否生效。
              record.stale = { reason: staleOutcome.reason, hold: after.hold, requests: [...requests] };
              const second = await send(btn ? (await engineButton(plan.pickedLabel)).locator : plan.typed);
              const got2 = JSON.stringify([second.after.progress, second.after.focusState]);
              const ok2 = staleOutcome.second && JSON.stringify([staleOutcome.second.after, staleOutcome.second.focusState]) === got2;
              record.turn = `${how}：第一手未落账（Node 首点 ${staleOutcome.reason}；界面 hold「${after.hold || '无'}」，历史+1 叙事照常）；第二手${ok2 ? `生效＝Node 第二次点击结果` : `仍不一致：${brief(second.after.progress)}`}`;
              assert.ok(ok2, record.turn);
              record.gameIssue = `读档后第一手不落账（${staleOutcome.reason}），第二手才生效`;
            } else {
              assert.fail(`第一手后进度不等于任何当前拍动作的 Node 结果（浏览器 ${brief(after.progress)} ${JSON.stringify(after.focusState)}；hold「${after.hold}」；Node 候选 ${plan.outcomes.map(o => `${o.id}:${o.reason ?? (o.completed ? '完成' : '一步')}→${brief(o.after)} ${JSON.stringify(o.focusState)}`).join(' | ')}）`);
            }
            record.turnCodes = firstCodes;
            // 五原本地选择（open_world）是本地结算，不发正文请求；其余动作的正文须走替身。
            if (!hit || hit.kind !== 'open_world') assert.ok(requests.includes('narration'), '正文请求应走替身');
          } else {
            // 任务日志没有主线目标也没有启程：玩家只能自由说一句（不对应任何拍）。断言落定、历史+1、进度＝Node 侧回合尾 advance 的结果。
            assert.equal(ui.inputDisabled, false, '没有可做主线动作时输入框仍应可用');
            const { before, after } = await send('我四下看看，留意周围的动静');
            assert.equal(after.busy, false, '应落定');
            assert.equal(after.history, before.history + 1, '历史应恰多一条');
            assert.deepEqual(after.lcq, [], '不应弹 LCQ 报错码');
            assert.deepEqual(after.progress, plan.freeAfter, `自由一手后进度应同 Node 侧回合尾 advance（浏览器 ${brief(after.progress)}；Node ${brief(plan.freeAfter)}）`);
            assert.equal(after.quest.length, plan.freeQuest.length, `自由一手后任务日志：界面 ${JSON.stringify(after.quest)}；期望 ${JSON.stringify(plan.freeQuest)}`);
            plan.freeQuest.forEach((t, i) => assert.ok(after.quest[i].endsWith(t), `自由一手后任务日志第${i + 1}条应为「${t}」，实际「${after.quest[i]}」`));
            record.turn = `任务日志为空，自由说一句 → 落定、历史+1；回合尾推进后 ${brief(after.progress)}，任务日志 ${JSON.stringify(plan.freeQuest)}`;
            // 走一手后才出现条目＝读档后当前拍没激活（界面缺口）；走一手后仍为空＝本关 rail 已走完且没有启程条目（终关／关末）。
            if (plan.freeQuest.length) record.gameIssue = `读档后任务日志为空（当前拍未激活），要等自由走一手后才出现「${plan.freeQuest.join('；')}」`;
            else record.turn += '（本关 rail 已走完、没有启程条目）';
          }
          await page.waitForTimeout(700);
          const turnLog = await logEntries(page, seqLoad);
          record.turnLog = Array.isArray(turnLog) ? tally(turnLog) : [`读不到：${JSON.stringify(turnLog)}`];
          assert.deepEqual(Array.isArray(turnLog) ? turnLog.filter(e => e.level === 'error').map(e => e.code) : [], [], '走一手时日志库不应有 error 级码');
          const after = await readUi(page, exp.ui.focus);
          assert.deepEqual(after.bad, [], '走一手后页面不应有坏字样');
          assert.deepEqual(consoleCodes.filter(c => c.startsWith('error:')), [], '控制台不应有 error 级 LCQ 码');
          assert.deepEqual(pageErrors, [], '控制台不应有未捕获异常');
          if (plan.kind !== 'ending') {
            const persisted = await readPersisted(page, charId);
            assert.equal(persisted.data?.系统?.历史?.叙事?.length, after.history, '持久化的工作槽历史条数同运行时');
          }
          record.codes = [...consoleCodes];
          record.requests = [...requests];
          record.status = 'passed';
        } catch (error) {
          failed++;
          record.status = 'failed';
          record.error = String(error.message || error).split('\n').slice(0, 6).join(' / ');
          record.codes = [...consoleCodes];
          record.visible = (await page.locator('body').innerText().catch(() => '')).slice(-300).replace(/\s+/g, ' ');
          await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/game')).catch(() => {});
        }
        record.ms = Date.now() - t0;
        const codeTally = [record.loadLog?.length ? `读档 ${record.loadLog.join(' ')}` : '', record.turnLog?.length ? `一手 ${record.turnLog.join(' ')}` : ''].filter(Boolean).join('；');
        console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${exp.file}［${record.plan}］读档 ${record.load ?? '—'}；${record.status === 'passed' ? `${record.ui}；${record.turn}` : record.error}${codeTally ? `；日志码 ${codeTally}` : ''}（${(record.ms / 1000).toFixed(1)}s）`);
      }
      guard.finish();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (process.env.SMOKE_OLD_SAVES_JSON) (await import('node:fs')).writeFileSync(process.env.SMOKE_OLD_SAVES_JSON, JSON.stringify(results, null, 2));
console.log(`${failed ? 'FAIL' : 'PASS'} smoke-old-saves：${results.length - failed}/${results.length} 份旧档通过`);
process.exit(failed ? 1 : 0);
