// 受控浏览器冒烟（不调模型）：回归检查——「靠合同迁移表升级合同的旧档，读档后第一次点那一拍就落账」。
//
// 来历：2026-11-12 之前，这类旧档第一次点按钮会被拒（stale_contract）：界面按钮在副本上 advanceScenarioRuntime（读档对账→迁移表把合同升到当前版）后生成，
//   带新合同哈希；发送时 live 存档还没迁移，recordStoryEventStructuredAction 比对「按钮哈希 ≠ live 状态哈希」→ 不落账，回合却照常叙事，
//   还弹一条「还在等你答复」的提示；第二手才生效。修法：MainGamePanel 发送前在 live 上补跑同一步迁移（migrateBatch6TextContracts）。
// 下面 PINS 是修好后的行为：第一手就落账。再出现 stale_contract 这里就红。
// 夹具（tests/fixtures/load-reconcile/，各文件「来源」写明旧合同取自哪个提交、怎么造的）：
//   o2-…f27676f0：凝羽人物拍 O2，迁移表 2026-11-09 条目（f27676f0→37ca6495）；
//   y5-…aff4748f：凝羽人物拍 Y5，迁移表 2026-11-09 条目（aff4748f→569a4d8b）；
//   ningyu-19003cbb：对照——凝羽主拍旧合同 19003cbb 不经迁移表（to 已失效），读档由 V03 迁移在发送前承接，第一手就落账。
// 玩家做法：人物拍＝右栏「这一拍谁有戏」点该行展开→点「回应：…」（填入输入框）→点发送；主拍＝任务日志主线目标原文手打发送（任务模式）或点主面板按钮。
// 每一手后：Node 侧在同一状态上做同一操作（独立子进程，经 tests/loadReconcileChainHarness.mjs，读档对账真的执行），两边落账结果须一致。
// 用法：node scripts/smoke-old-contract-first-click.mjs <站点URL…>；SMOKE_STALE_JSON＝逐手观察写成 JSON。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const CHILD = process.env.SMOKE_STALE_CHILD === '1';
const MAX_HANDS = 3;

const CASES = [
  { file: 'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz', eventId: 'lcq.event.ningyu_regicide_offer_ins_ningyu_reply', beatId: 'beat.ningyu.o2_regicide',
    actionId: 'act.ningyu.o2.agree', via: 'line', oldHash: 'f27676f0', newHash: '37ca6495' },
  { file: 'load-reconcile/y5-ningyu-enter-aff4748f-contract.json.gz', eventId: 'lcq.event.guiwangdong_coop_pact_ins_ningyu_enter', beatId: 'beat.ningyu.y5_enter',
    actionId: 'act.ningyu.y5.bring', via: 'line', oldHash: 'aff4748f', newHash: '569a4d8b' },
  { file: 'load-reconcile/ningyu-19003cbb-contract.json.gz', eventId: 'lcq.event.ningyu_regicide_offer', beatId: null,
    actionId: 'trace_ningyu_cold_qi_source', via: 'main', oldHash: '19003cbb', newHash: '9e66a2a6' },
  // 同一份 O2 档，玩家不点右栏、直接在输入框说（提示里写着「也可以直接说」）。手打走 resolveNaturalIntent，候选从 live 存档取（读码：MainGamePanel
  // 发送时传的是 live saveData，不经副本 advance），带的是 live 的旧哈希，所以对得上；Node 侧照此从 live 取同一动作再点。
  { file: 'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz', control: 'say', say: '答应她，这件事我来办', eventId: 'lcq.event.ningyu_regicide_offer_ins_ningyu_reply', beatId: 'beat.ningyu.o2_regicide',
    actionId: 'act.ningyu.o2.agree', via: 'say', oldHash: 'f27676f0', newHash: '37ca6495' },
  // 同一份 O2 档，第一手的模型请求失败（替身回 500，回合没走到 AIBS 回合尾 advance）：看被拒是否顺延到下一手。
  { file: 'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz', control: 'fail1', failFirst: true, eventId: 'lcq.event.ningyu_regicide_offer_ins_ningyu_reply', beatId: 'beat.ningyu.o2_regicide',
    actionId: 'act.ningyu.o2.agree', via: 'line', oldHash: 'f27676f0', newHash: '37ca6495' },
  // 对照：同一份 O2 档在 Node 里先读档、回合尾 advance 一次（＝新版本游戏里走过一回合再存的档，合同与状态都已是 37ca6495），再进浏览器。
  { file: 'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz', control: 'advanced', eventId: 'lcq.event.ningyu_regicide_offer_ins_ningyu_reply', beatId: 'beat.ningyu.o2_regicide',
    actionId: 'act.ningyu.o2.agree', via: 'line', oldHash: '37ca6495', newHash: '37ca6495' },
];
const caseKey = c => `${c.file}${c.control ? `#${c.control}` : ''}`;

// 每手的落账结果（修好后的行为）；Node 与浏览器须同为这个序列。
// reason null＝落账成功（completed 为真即这一拍收场）。
const PINS = {
  'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz': [{ reason: null, done: true }],
  'load-reconcile/y5-ningyu-enter-aff4748f-contract.json.gz': [{ reason: null, done: true }],
  'load-reconcile/ningyu-19003cbb-contract.json.gz': [{ reason: null, done: true }],
  'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz#say': [{ reason: null, done: true }],
  'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz#fail1': [{ reason: 'turn_failed', done: false }, { reason: null, done: true }],
  'load-reconcile/o2-ningyu-reply-f27676f0-contract.json.gz#advanced': [{ reason: null, done: true }],
};

// ───────────── 子进程：Node 侧逐手 ─────────────
async function childMain() {
  const H = await import('../tests/loadReconcileChainHarness.mjs');
  const { R, rt, quiet } = H;
  const QL = await H.load('modules/scenarioMods/questLog.ts');
  const out = [];
  for (const c of CASES) {
    const rec = { file: caseKey(c) };
    try {
      let raw = H.readFixtureSave(c.file);
      if (c.control === 'advanced') raw = quiet(() => R.advanceScenarioRuntime(raw).saveData);
      rec.slot = { 存档名: `旧合同钉子-${caseKey(c).split('/').pop()}`, 存档数据: raw };
      let live = await H.loadLikeGame(raw, c.file);
      rec.questGuide = QL.questGuideEnabled(live);
      rec.hands = [];
      // 模型请求失败的那一手：Node 侧不落账也不 advance（live 原样），只占一个序号。
      if (c.failFirst) rec.hands.push({ reason: 'turn_failed', done: false, failed: true, liveHash: contractHashOf(H, live, c.eventId) });
      for (let hand = rec.hands.length + 1; hand <= MAX_HANDS; hand++) {
        const view = c.via === 'say' ? live : quiet(() => R.advanceScenarioRuntime(live).saveData);
        const offered = c.via !== 'main' ? quiet(() => R.getCurrentStoryExplorationActions(view)) : quiet(() => R.getCurrentStoryEventActions(view));
        const selection = offered.find(a => a.eventId === c.eventId && a.actionId === c.actionId);
        const h = { liveHash: contractHashOf(H, live, c.eventId), buttonHash: selection?.contractHash ?? null, label: selection?.label ?? null, actionText: selection?.actionText ?? null,
          outcomeText: rt(view).events.find(e => e.id === c.eventId)?.playerCompletionContract?.actions.find(a => a.id === c.actionId)?.outcomeText?.success ?? null,
          otherOutcomes: (rt(view).events.find(e => e.id === c.eventId)?.playerCompletionContract?.actions || []).filter(a => a.id !== c.actionId).map(a => a.outcomeText?.success).filter(Boolean), playerLine: selection?.playerLine ?? null };
        if (!selection) { h.offered = false; rec.hands.push(h); break; }
        const { receipt, after } = H.clickButton(live, { kind: 'event', selection });
        Object.assign(h, { reason: receipt.reason ?? null, attempted: Boolean(receipt.attempted), completed: Boolean(receipt.completed), done: doneOf(rt(after), c), afterHash: contractHashOf(H, after, c.eventId) });
        rec.hands.push(h);
        live = after;
        if (h.done) break;
      }
    } catch (error) { rec.error = String(error.stack || error).split('\n').slice(0, 4).join(' / '); }
    out.push(rec);
  }
  await new Promise(resolve => process.stdout.write(`@@EXPECT@@${JSON.stringify(out)}`, resolve));
}
function contractHashOf(H, save, eventId) {
  const contract = H.rt(save).events.find(e => e.id === eventId)?.playerCompletionContract;
  return contract ? H.contractHash(contract) : null;
}
/** 这一拍落账：人物拍看 questLineState 回执，主拍看 completedEventIds。浏览器侧用同一口径（见 readUi）。 */
function doneOf(r, c) {
  return c.beatId ? Boolean(r.questLineState?.receipts?.[c.beatId]) : (r.completedEventIds || []).includes(c.eventId);
}

if (CHILD) {
  await childMain();
  process.exit(0);
}

// ───────────── 主进程：浏览器侧 ─────────────
const { chromium } = await import('playwright-core');
const { PINIA, enterIsolatedCharacter, importAndLoad, openSmokeContext } = await import('./lineSmokeHarness.mjs');
const baseUrls = process.argv.slice(2);
assert.ok(baseUrls.length, '缺少站点 URL：node scripts/smoke-old-contract-first-click.mjs http://127.0.0.1:端口/');

const child = spawnSync(process.execPath, [SELF], { env: { ...process.env, SMOKE_STALE_CHILD: '1' }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180_000 });
assert.ok(child.stdout.includes('@@EXPECT@@'), `Node 侧子进程失败（退出 ${child.status}）：${child.stderr.slice(-1500)}`);
const EXPECT = JSON.parse(child.stdout.split('@@EXPECT@@').pop());

/** 浏览器里读：目标拍的合同／状态哈希、落账、历史、输入框、任务日志、右栏人物行、hold 提示、LCQ 码。 */
const readUi = (page, c) => page.evaluate(({ expr, c }) => {
  const stores = eval(expr)._s;
  const save = stores.get('gameState').toSaveData();
  const r = save.世界.状态.剧本模组;
  const text = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.replace(/\s+/g, ' ').trim());
  const peopleSection = [...document.querySelectorAll('.quest-section')].find(s => s.querySelector('.section-title')?.innerText.includes('这一拍谁有戏'));
  const history = save.系统?.历史?.叙事 || [];
  const state = r.eventActionStates?.[c.eventId];
  return {
    done: c.beatId ? Boolean(r.questLineState?.receipts?.[c.beatId]) : (r.completedEventIds || []).includes(c.eventId),
    receipt: c.beatId ? r.questLineState?.receipts?.[c.beatId]?.receiptId ?? null : null,
    stateHash: state?.contractHash ?? null, attempts: state?.attemptCount ?? 0,
    history: history.length, lastNarrative: String(history.at(-1)?.content || '').replace(/\s+/g, ' ').slice(0, 80), historyTail: history.slice(-2).map(e => `${e.type || e.role || '?'}:${String(e.content || '').replace(/\s+/g, ' ').slice(0, 24)}`),
    busy: stores.get('ui').isAIProcessing,
    input: document.querySelector('textarea.game-input')?.value ?? null,
    inputDisabled: document.querySelector('textarea.game-input')?.disabled ?? null,
    quest: text('[data-testid="quest-log"] .quest-log-entry .quest-event'),
    people: peopleSection ? [...peopleSection.querySelectorAll('.quest-main > .quest-event')].map(e => e.innerText.replace(/\s+/g, ' ').trim()) : [],
    hold: document.querySelector('[data-testid="intent-hold-message"]')?.innerText ?? '',
    engineButtons: text('.engine-action-btn, .opportunity-action-options button'),
    lcq: [...window.__lcqSeen], toasts: [...window.__toastSeen],
  };
}, { expr: PINIA, c });

/** 页面日志库（lcq-log／logs）里 seq > since 的 [{seq, level, code}]（同 smoke-old-saves）。 */
const logEntries = (page, since) => page.evaluate(since => new Promise(resolve => {
  const open = indexedDB.open('lcq-log');
  open.onerror = () => resolve([]);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('logs')) { db.close(); resolve([]); return; }
    const req = db.transaction('logs', 'readonly').objectStore('logs').getAll();
    req.onsuccess = () => { db.close(); resolve(req.result.filter(e => e.seq > since).map(e => ({ seq: e.seq, level: e.level, code: e.code,
      detail: e.code === 'LCQ-SAV-053' ? JSON.stringify(e.detail || {}).slice(0, 400) : e.code === 'LCQ-SYS-000' ? String(e.detail?.originalCode || e.msg || '').replace(/\s+/g, ' ').slice(0, 160) : undefined }))); };
    req.onerror = () => { db.close(); resolve([]); };
  };
}), since);
const maxSeq = entries => entries.reduce((m, e) => Math.max(m, e.seq), 0);
const tally = entries => Object.entries(entries.reduce((m, e) => ((m[`${e.level}:${e.code}`] = (m[`${e.level}:${e.code}`] || 0) + 1), m), {})).map(([k, n]) => `${k}×${n}`);

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
let failed = 0;
try {
  for (const baseUrl of baseUrls) {
    let requests = [];
    let narrationBodies = [];
    const { context, guard } = await openSmokeContext(browser, { contextOptions: { viewport: { width: 1600, height: 1000 } },
      onRequest: (kind, body) => { requests.push(kind); if (kind === 'narration') narrationBodies.push(JSON.stringify(body.messages || [])); } });
    // toast 3 秒自动消失：出现即记（类型＋原文）。
    await context.addInitScript(() => {
      window.__toastSeen = [];
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (const t of [node, ...node.querySelectorAll('.toast')]) if (t.classList?.contains('toast')) {
            // 刚插入时 v-html 可能还没填字：下一帧再读。
            setTimeout(() => window.__toastSeen.push(`${[...t.classList].find(k => k.startsWith('toast-')) || 'toast'}:${t.innerText.replace(/\s+/g, ' ').trim()}`), 60);
          }
        }
      }).observe(document, { childList: true, subtree: true });
    });
    // 后装的路由先匹配：failNext 时所有模型请求回 500（模拟这一手模型挂了）。
    let failNext = false;
    await context.route('**/*completions*', route => (failNext && route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"smoke: simulated failure"}}' }) : route.fallback()));
    const page = await context.newPage();
    const pageErrors = [];
    let consoleCodes = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', msg => { for (const m of msg.text().matchAll(/\[(LCQ-[A-Z]+-\d{3})\]/g)) consoleCodes.push(`${msg.type()}:${m[1]}`); });
    try {
      const charId = await enterIsolatedCharacter(page, baseUrl);
      await page.waitForTimeout(1000);
      for (const exp of EXPECT) {
        const c = CASES.find(x => caseKey(x) === exp.file);
        const record = { file: exp.file, hands: [] };
        results.push(record);
        try {
          assert.ok(!exp.error, `Node 侧算不出：${exp.error}`);
          const pin = PINS[exp.file];
          assert.deepEqual(exp.hands.map(h => ({ reason: h.reason, done: h.done })), pin, `Node 侧逐手结果变了（现状钉子）：${JSON.stringify(exp.hands)}`);
          const seq0 = maxSeq(await logEntries(page, 0));
          await importAndLoad(page, charId, exp.slot);
          await page.evaluate(() => { window.__toastSeen.length = 0; });
          await page.waitForTimeout(900);
          let seq = maxSeq(await logEntries(page, seq0)) || seq0;
          consoleCodes = []; pageErrors.length = 0;
          const loaded = await readUi(page, c);
          record.loaded = { stateHash: loaded.stateHash, done: loaded.done, quest: loaded.quest, people: loaded.people, toasts: loaded.toasts, lcq: loaded.lcq };
          assert.equal(loaded.stateHash, c.oldHash, '读档后 live 状态哈希应仍是旧合同（store 读档不跑 advance）');
          assert.equal(loaded.done, false, '读档后这一拍应未落账');
          for (let hand = 1; hand <= exp.hands.length; hand++) {
            const nodeHand = exp.hands[hand - 1].failed ? { ...exp.hands[hand], ...exp.hands[hand - 1] } : exp.hands[hand - 1];
            failNext = Boolean(nodeHand.failed);
            requests = []; consoleCodes = []; narrationBodies = [];
            await page.evaluate(() => { window.__toastSeen.length = 0; window.__lcqSeen.length = 0; });
            const before = await readUi(page, c);
            const obs = { hand, how: '' };
            if (c.via === 'line') {
              // 右栏「这一拍谁有戏」：点有「▸ 回应／略过」的那一行展开，再点「回应：<label>」。
              const btn0 = page.locator('.line-beat-action', { hasText: nodeHand.label });
              if (!(await btn0.count())) {
                const row = page.locator('.line-beat-toggle').filter({ hasText: '▸' });
                obs.rows = (await page.locator('.line-beat-toggle').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
                assert.ok(await row.count(), `右栏应有可展开的人物拍行：${JSON.stringify(obs.rows)}`);
                await row.first().click();
              }
              const btn = page.locator('.line-beat-action', { hasText: nodeHand.label });
              assert.ok(await btn.count(), `展开后应有「${nodeHand.label}」：${JSON.stringify(await page.locator('.line-beat-action').allInnerTexts())}`);
              obs.how = `右栏展开人物拍→点「${(await btn.first().innerText()).trim()}」→发送`;
              await btn.first().click();
              await page.waitForTimeout(300);
              obs.filled = (await readUi(page, c)).input;
            } else if (c.via === 'say') {
              obs.how = `输入框直接说「${c.say}」→发送`;
              await page.locator('textarea.game-input').fill(c.say);
              obs.filled = c.say;
            } else if (before.quest.some(q => q.includes('主线：'))) {
              const main = before.quest.find(q => q.includes('主线：')).split('主线：').slice(1).join('主线：').trim();
              obs.how = `任务日志主线目标原文手打「${main}」→发送`;
              await page.locator('textarea.game-input').fill(main);
              obs.filled = main;
            } else if (await page.locator('[data-testid="key-beat-option"]').count()) {
              const opt = page.locator('[data-testid="key-beat-option"]', { hasText: nodeHand.label });
              obs.how = `点重要桥段卡片「${(await opt.first().innerText()).trim()}」`;
              await opt.first().click();
              await page.waitForTimeout(300);
              obs.filled = (await readUi(page, c)).input;
            } else {
              const all = page.locator('.engine-action-btn, .opportunity-action-options button');
              assert.ok(await all.count(), `没有主面板按钮；questGuide=${exp.questGuide} 任务日志${JSON.stringify(before.quest)} 卡片${await page.locator('[data-testid="key-beat-card"]').count()}`);
              const i = Math.max(0, (await all.allInnerTexts()).findIndex(t => t.includes(nodeHand.label)));
              obs.how = `点主面板按钮「${(await all.nth(i).innerText()).trim()}」→发送`;
              await all.nth(i).click();
              await page.waitForTimeout(300);
              obs.filled = (await readUi(page, c)).input;
            }
            obs.toastsBeforeSend = (await readUi(page, c)).toasts;
            await page.locator('.send-button').click();
            await page.waitForTimeout(500);
            await page.waitForFunction(({ expr, history, failed }) => {
              const st = eval(expr)._s; if (st.get('ui').isAIProcessing) return false;
              return failed || st.get('gameState').toSaveData().系统.历史.叙事.length > history;
            }, { expr: PINIA, history: before.history, failed: Boolean(nodeHand.failed) }, { timeout: 45_000, polling: 200 }).catch(() => { obs.noHistory = true; });
            failNext = false;
            await page.waitForTimeout(900);
            const after = await readUi(page, c);
            const log = await logEntries(page, seq);
            seq = maxSeq(log) || seq;
            Object.assign(obs, {
              done: after.done, receipt: after.receipt, stateHash: `${before.stateHash}→${after.stateHash}`, attempts: `${before.attempts}→${after.attempts}`,
              historyDelta: after.history - before.history, lastNarrative: after.lastNarrative, historyTail: after.historyTail, inputAfter: after.input, inputDisabled: after.inputDisabled,
              hold: after.hold, // 空文字的是上一条提示离场时的残影；成功类「天机重现／已保存」是每回合都有的常规提示。
              toasts: after.toasts.filter(t => !/:$/.test(t) && !/^toast-success:(天机重现|存档【.*】已保存)$/.test(t)),
              logDetail: log.filter(e => e.detail).map(e => `${e.code} ${e.detail}`),
              // 正文请求里有没有引擎「已结算」的结果原文（合同 outcomeText.success）：有＝提示词按落账成功告诉模型；没有＝模型只看到玩家原话。
              narrationHasOutcome: narrationBodies.some(b => b.includes(JSON.stringify(nodeHand.outcomeText || '\u0000').slice(1, -1))),
              // 对照：同一合同里别的动作的结果原文也在＝提示词只是列出全部动作，不说明本手结算了什么。
              narrationHasOtherOutcome: narrationBodies.some(b => (nodeHand.otherOutcomes || []).some(t => b.includes(JSON.stringify(t).slice(1, -1)))), lcq: after.lcq, consoleCodes: [...consoleCodes], log: tally(log), requests: [...new Set(requests)],
              questChanged: JSON.stringify(after.quest) !== JSON.stringify(before.quest), quest: after.quest, people: after.people,
              node: { reason: nodeHand.reason, done: nodeHand.done, buttonHash: nodeHand.buttonHash, liveHash: nodeHand.liveHash },
            });
            record.hands.push(obs);
            console.log(`  第${hand}手 ${obs.how}（填入「${obs.filled}」）：落账=${obs.done}${obs.receipt ? `(${obs.receipt})` : ''} 状态哈希 ${obs.stateHash} 尝试 ${obs.attempts} 历史+${obs.historyDelta} 正文「${obs.lastNarrative.slice(0, 30)}」正文请求带本动作结果=${obs.narrationHasOutcome}／带别的动作结果=${obs.narrationHasOtherOutcome} 输入框后「${obs.inputAfter}」 hold「${obs.hold}」 toast${JSON.stringify(obs.toasts)} LCQ${JSON.stringify(obs.lcq)} 控制台${JSON.stringify(obs.consoleCodes)} 日志${JSON.stringify(obs.log)} 请求${JSON.stringify(obs.requests)} 任务日志${obs.questChanged ? '变了' : '没变'} 日志详情${JSON.stringify(obs.logDetail)} 历史尾${JSON.stringify(obs.historyTail)}；Node：${obs.node.reason ?? '落账'}${obs.node.done ? '/完成' : ''}`);
            assert.equal(obs.done, nodeHand.done, `第${hand}手落账应同 Node（Node ${nodeHand.reason ?? '落账'}）`);
            // 界面现象钉子（现状）：被拒那手没有任何报错码、输入框照常清空、历史+1（正文照常生成），之后弹一条「…在等你…」的 info 提示；落账那手不弹。
            assert.deepEqual(obs.lcq, [], `第${hand}手不应弹 LCQ 报错码`);
            if (nodeHand.failed) {
              // 模型失败那手（现状）：不落账、live 合同不迁移（回合尾 advance 没跑）、历史不增。提示与输入框如实记录、不钉。
              assert.equal(obs.stateHash, `${c.oldHash}→${c.oldHash}`, '模型失败那手 live 不应迁移');
              assert.equal(obs.historyDelta, 0, '模型失败那手历史不增');
              continue;
            }
            assert.equal(obs.inputAfter, '', `第${hand}手发送后输入框应清空`);
            assert.equal(obs.historyDelta, 1, `第${hand}手历史应恰多一条`);
            const waitToast = obs.toasts.some(t => t.startsWith('toast-info:') && t.includes('在等你'));
            assert.equal(waitToast, nodeHand.reason === 'stale_contract', `第${hand}手「在等你」提示：${JSON.stringify(obs.toasts)}`);
            if (nodeHand.reason === 'stale_contract') assert.equal(obs.stateHash, `${c.oldHash}→${c.newHash}`, '被拒那手回合尾 advance 把 live 迁到新合同');
            assert.equal(after.busy, false, `第${hand}手应落定`);
          }
          assert.equal(record.hands.at(-1).done, true, '最后一手应落账');
          assert.deepEqual(pageErrors, [], '不应有未捕获异常');
          record.status = 'passed';
        } catch (error) {
          failed++;
          record.status = 'failed';
          record.error = String(error.message || error).split('\n').slice(0, 6).join(' / ');
        }
        console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${exp.file}${record.error ? `：${record.error}` : `：${record.hands.length} 手落账（${PINS[exp.file].map(p => p.reason ?? '落账').join('→')}）`}`);
      }
      guard.finish();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (process.env.SMOKE_STALE_JSON) (await import('node:fs')).writeFileSync(process.env.SMOKE_STALE_JSON, JSON.stringify(results, null, 2));
console.log(`${failed ? 'FAIL' : 'PASS'} smoke-old-contract-first-click：${results.length - failed}/${results.length} 份旧合同档符合现状钉子`);
process.exit(failed ? 1 : 0);
