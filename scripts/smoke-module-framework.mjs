// Controlled acceptance for the module framework polish (Q1–Q5, 2026-10-01).
// Disposable browser context; every model and server-storage request is intercepted. Never touches real API config or saves.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const urls = process.argv.slice(2);
const fixture = JSON.parse(await readFile('.xiantu-server/module-probe-20261001/fixture.private.json', 'utf8')).save;
const prose = '你把霓龙丝产地线索作为交换，向苏妲己提出三个月期限。苏妲己抬眼望着你，指尖在桌沿轻轻一停。商馆里灯火安静，她仍等你把条件说明白，没有立即接受你的提议。你站在桌前，凝羽留在近旁，眼下只是在谈期限，没有新的物品交付。';
const premature = '苏妲己答应给你三个月，从今日算起。你可以离开了。';
const SLOT_KEY = 'char_xingyuehu_landing_playtest_v1:星月湖从落地开始';
const conn = (id, model) => ({ id, name: id, provider: 'openai', url: 'https://fixture.invalid/v1', apiKey: `fixture-${id}`, model, maxTokens: 8192, temperature: .4, enabled: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const url of urls) {
    const ctx = await browser.newContext();
    const requests = [];
    const errors = [];
    const held = { memory: [], audit: [] };
    let mainQueue = [];
    await ctx.addInitScript(({ configs, slotKey }) => {
      if (sessionStorage.getItem('fixture-seeded')) return;
      sessionStorage.setItem('fixture-seeded', '1');
      localStorage.setItem('xiantu.modularTurnPlaytest.v1', 'true');
      localStorage.setItem('api_management_config', JSON.stringify({
        apiConfigs: configs,
        apiAssignments: [{ type: 'main', apiId: 'default' }, { type: 'memory_summary', apiId: 'memoryApi' }],
        functionEnabled: [{ type: 'memory_summary', enabled: true }],
        moduleAssignments: [{ moduleId: 'intent', apiId: 'intentApi' }, { moduleId: 'audit', apiId: 'auditApi' }],
        moduleEnabled: { audit: true },
      }));
      localStorage.setItem('ai_service_config', JSON.stringify({ mode: 'custom', streaming: false, maxRetries: 0, customAPI: { provider: 'openai', url: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'main-model' } }));
      // 从 0 起算，使第一次提交就到达审计检查点。
      localStorage.setItem('xiantu.backgroundAudit.state.v1', JSON.stringify({ slots: { [slotKey]: { auditedTurns: 0, modId: 'lcq.stage_02' } }, calls: [] }));
    }, { configs: [conn('default', 'main-model'), conn('memoryApi', 'memory-model'), conn('intentApi', 'intent-model'), conn('auditApi', 'audit-model')], slotKey: SLOT_KEY });

    await ctx.route('**/*', async route => {
      const r = route.request();
      const u = new URL(r.url());
      if (/\/save-storage(?:\/|$)/.test(u.pathname) || /\/api\//.test(u.pathname) && r.method() !== 'GET') return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      if (r.method() === 'POST' && /chat\/completions/.test(u.pathname)) {
        const body = r.postDataJSON();
        const entry = { model: body.model, maxTokens: body.max_tokens, chars: JSON.stringify(body.messages).length, at: Date.now() };
        requests.push(entry);
        let content;
        if (body.model === 'memory-model') { await new Promise(resolve => held.memory.push(resolve)); content = JSON.stringify({ evidence: ['她仍等你把条件说明白'] }); }
        else if (body.model === 'audit-model') { await new Promise(resolve => held.audit.push(resolve)); content = JSON.stringify({ findings: [] }); }
        else if (body.model === 'intent-model') content = 'not json';
        else content = mainQueue.length ? mainQueue.shift() : prose;
        try { return await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { completion_tokens: 120, total_tokens: 1000 } }) }); }
        catch { entry.aborted = true; return; }
      }
      if (!['GET', 'HEAD'].includes(r.method())) return route.abort();
      return route.continue();
    });

    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const failedModels = [];
    page.on('requestfailed', req => { try { if (/chat\/completions/.test(req.url())) failedModels.push(req.postDataJSON()?.model); } catch { /* ignore */ } });
    const pinia = () => page.evaluate(() => !!document.querySelector('#app')?.__vue_app__);
    const state = () => page.evaluate(() => {
      const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const s = p._s.get('gameState').toSaveData();
      return { busy: p._s.get('ui').isAIProcessing, receipt: s.系统.扩展.回合模块试玩?.receipts?.at(-1), shortTerm: s.社交?.记忆?.短期记忆 || [], history: s.系统.历史.叙事.length,
        audit: JSON.parse(localStorage.getItem('xiantu.backgroundAudit.log.v1') || '[]') };
    });
    const restore = () => page.evaluate(save => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').loadFromSaveData(save), fixture);
    const waitFor = async (fn, label, timeout = 25000) => { const end = Date.now() + timeout; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`timeout: ${label}`); await new Promise(r => setTimeout(r, 50)); } };
    const send = async text => {
      await page.locator('textarea.game-input').fill(text);
      await page.locator('.send-button').click();
      await page.waitForFunction(() => !document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing, {}, { timeout: 30000 });
    };
    const release = kind => held[kind].splice(0).forEach(resolve => resolve());

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitFor(pinia, 'app');
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 25000 });

      // 1. 模块演出：继承主流程；记忆后台运行，采纳后替换该回合短期记忆；审计到检查点后台发起。
      await restore();
      await send('我用霓龙丝产地线索换三个月期限。');
      const first = await state();
      assert.equal(first.receipt?.path, 'modular', 'modular path');
      assert.equal(first.receipt.route.model, 'main-model');
      assert.equal(first.receipt.route.inherited, true);
      assert.equal(first.receipt.memory.status, 'pending');
      assert.ok(first.receipt.shortTermEntry?.includes('霓龙丝'), 'short-term entry recorded');
      await waitFor(() => held.memory.length === 1, 'memory request');
      await waitFor(() => held.audit.length === 1, 'audit request');
      assert.equal(requests.find(r => r.model === 'audit-model')?.maxTokens <= 4096, true);
      release('memory');
      const afterMemory = await waitFor(async () => { const s = await state(); return s.receipt?.memory?.status === 'accepted' ? s : null; }, 'memory accepted');
      assert.equal(afterMemory.receipt.memory.appliedToShortTerm, true);
      const lastShort = afterMemory.shortTerm.at(-1);
      assert.match(lastShort, /^【[^】]+】她仍等你把条件说明白$/, 'short-term entry replaced by excerpt with time prefix');
      release('audit');
      const audited = await waitFor(async () => { const s = await state(); return s.audit.length === 1 ? s : null; }, 'audit log');
      assert.equal(audited.audit[0].status, 'accepted');
      assert.equal(audited.audit[0].route.model, 'audit-model');
      assert.equal(JSON.stringify(audited.audit).includes('fixture-'), false, 'no credentials in audit log');
      assert.equal(JSON.stringify(audited.receipt).includes('audit'), false, 'audit writes nothing into the save receipt');

      // 2. 审计让路：审计在途时开始前台回合，审计被取消且不记日志。
      await page.evaluate(slotKey => {
        const st = JSON.parse(localStorage.getItem('xiantu.backgroundAudit.state.v1'));
        st.slots[slotKey].auditedTurns = 0; localStorage.setItem('xiantu.backgroundAudit.state.v1', JSON.stringify(st));
      }, SLOT_KEY);
      await restore();
      await send('我用霓龙丝产地线索换三个月期限。');
      await waitFor(() => held.audit.length === 1, 'second audit request');
      release('memory');
      const auditLogBefore = (await state()).audit.length;
      await restore();
      await send('我用霓龙丝产地线索换三个月期限。');
      // 让路的那次审计未写日志、未推进检查点，所以这次提交后重新发起一次审计。
      await waitFor(() => held.audit.length === 2, 'audit re-requested after yield');
      release('audit');
      await waitFor(async () => (await state()).audit.length === auditLogBefore + 1, 'one audit log entry');
      await new Promise(r => setTimeout(r, 300));
      assert.equal(failedModels.filter(model => model === 'audit-model').length, 1, 'the in-flight audit was aborted when the foreground turn began');
      assert.equal((await state()).audit.length, auditLogBefore + 1, 'yielded audit is not logged');
      release('memory'); release('audit');

      // 3. Q3：首稿越界（提前确认期限）→ 同快照重试一次 → 采纳。
      await restore();
      const before3 = requests.filter(r => r.model === 'main-model').length;
      mainQueue = [premature, prose];
      await send('我用霓龙丝产地线索换三个月期限。');
      const retried = await state();
      assert.equal(retried.receipt?.path, 'modular');
      assert.equal(retried.receipt.text, prose);
      assert.equal(requests.filter(r => r.model === 'main-model').length - before3, 2, 'exactly one retry');
      release('memory'); release('audit');

      // 4. Q3：两稿都越界 → 固定道具档长请求预算不足以回落时不提交、保留输入；否则回落原链路并记原因。
      await restore();
      mainQueue = [premature, premature];
      const historyBefore = (await state()).history;
      await page.locator('textarea.game-input').fill('我用霓龙丝产地线索换三个月期限。');
      await page.locator('.send-button').click();
      await page.waitForFunction(() => !document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing, {}, { timeout: 30000 });
      const failedTwice = await state();
      const committed = failedTwice.history !== historyBefore;
      if (committed) { assert.equal(failedTwice.receipt.path, 'legacy'); assert.match(failedTwice.receipt.fallback.reason, /期限/); }
      else assert.equal(await page.locator('textarea.game-input').inputValue(), '我用霓龙丝产地线索换三个月期限。', 'input retained');
      mainQueue = [];
      release('memory'); release('audit');

      // 5. 行动解释走自己的模型（不经主流程）：分类失败只提示澄清、保留输入。
      await restore();
      const before5 = requests.length;
      await page.locator('textarea.game-input').fill('我想先四处看看，琢磨一下接下来怎么办');
      await page.locator('.send-button').click();
      await page.waitForFunction(() => !document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing, {}, { timeout: 30000 });
      const intentCalls = requests.slice(before5).filter(r => r.maxTokens <= 1024);
      assert.ok(intentCalls.every(r => r.model === 'intent-model'), `intent requests use the intent module model: ${JSON.stringify(intentCalls)}`);
      release('memory'); release('audit');

      assert.deepEqual(errors, []);
      results.push({ url, passed: true, q3FailedTwice: committed ? 'fell back to legacy' : 'held input (turn budget)', intentCalls: intentCalls.length,
        requests: requests.map(({ model, maxTokens, aborted }) => ({ model, maxTokens, aborted: !!aborted })) });
    } finally {
      release('memory'); release('audit');
      await ctx.close();
    }
  }
} finally { await browser.close(); }
await mkdir('.xiantu-server/module-framework', { recursive: true });
await writeFile('.xiantu-server/module-framework/controlled.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ url, passed, q3FailedTwice, intentCalls }) => ({ url, passed, q3FailedTwice, intentCalls }))));
