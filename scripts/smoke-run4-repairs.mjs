// Controlled browser acceptance with intercepted models/storage, not real-LLM evidence.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { FIXTURE_NONE, classifyFixtureRequest, fixtureCompletion, installSmokeNetworkGuard } from './e2e-smoke.mjs';

const urls = process.argv.slice(2);
assert.ok(urls.length, 'Provide dev server URL(s)');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const url of urls) {
    const context = await browser.newContext();
    // 网络护栏先装：脚本路由处理不了的请求 route.fallback() 落到护栏（非本机一律替身或 abort+判失败）。
    const guard = await installSmokeNetworkGuard(context);
    let truncated = false;
    let longCalls = 0;
    const requests = [];
    const errors = [];
    await context.addInitScript(() => {
      localStorage.setItem('ai_service_config', JSON.stringify({ mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture', model: 'fixture' } }));
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const target = new URL(request.url());
      if (/\/api\/v1\/save-storage(?:\/|$)/.test(target.pathname)) {
        return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      }
      if (request.method() === 'POST' && /\/chat\/completions\/?$/.test(target.pathname)) {
        longCalls += 1;
        const body = request.postDataJSON();
        // 按内容分种类：意图／拍子判定是分类小请求，memory／audit 是模块链路回合后的后台请求（内测构建默认开），都不是正文重试。
        const kind = classifyFixtureRequest(body);
        requests.push({ kind, budget: body.max_tokens, chars: JSON.stringify(body.messages).length,
          start: String(body.messages?.[0]?.content || '').slice(0, 140) });
        if (kind !== 'narration') return route.fulfill(fixtureCompletion(body, FIXTURE_NONE[kind]));
        const content = truncated ? '{"text":"partial' : JSON.stringify({
          text: '【环境】草叶在风里低伏。你先看清眼前的草原，没有贸然作出新的决定。',
          mid_term_memory: '草原上的当下行动已处理。', tavern_commands: [], action_options: [],
        });
        return route.fulfill(fixtureCompletion(body, content, truncated
          ? { finishReason: 'length', usage: { completion_tokens: 8192, total_tokens: 500 } } : {}));
      }
      // 其余请求交给网络护栏：本机 GET 放行；本机写请求与非本机请求一律 abort 并判失败。
      return route.fallback();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // 2026-11-03 起任务模式（story.quest；内测构建 enabledDev 默认开）撤了主线按钮，玩家照任务日志打出目标原文＝选中这一拍的动作
    // （beatProgress.resolveBeatText 按字命中，本地结算、不经分类模型）。任务模式关的构建仍点主线按钮。两条都是真实界面路径。
    const fillMainLine = async () => {
      const questEntry = page.locator('[data-testid="quest-log"] .quest-log-entry .quest-event').first();
      if (await questEntry.isVisible().catch(() => false)) {
        const objective = (await questEntry.innerText()).replace(/^[^：]*：/, '').trim();
        assert.ok(objective, 'quest log shows the current objective');
        await page.locator('textarea.game-input').fill(objective);
      } else await page.locator('.engine-action-btn').first().click();
    };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      const input = page.locator('textarea.game-input');
      await input.waitFor({ timeout: 20000 });
      const isProcessing = () => page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing === true);
      const clickSendAndIdle = async () => {
        const before = longCalls;
        await page.locator('.send-button').click();
        const deadline = Date.now() + 20000;
        let started = false;
        while (Date.now() < deadline) {
          if (longCalls > before || await isProcessing()) {
            started = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(started, 'send did not start processing or a model request');
        while (Date.now() < deadline) {
          if (!(await isProcessing())) return;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error('AI processing did not finish');
      };
      await fillMainLine();
      const firstIntent = await input.inputValue();
      await clickSendAndIdle();
      await page.locator('.narrative-content .last-user-intent-text').waitFor({ timeout: 20000 });
      assert.equal(await page.locator('.narrative-content .last-user-intent-text').innerText(), firstIntent);
      assert.equal((await page.locator('.narrative-text').innerText()).includes('【环境】'), false);
      // 2026-10-03「试玩无旧链路」（docs/handoffs/2026-10-02/lead_designer_demo_no_legacy_plan.md 第16/23行）：试玩档模块两稿失败
      // 一律不落账、保留输入、报「本轮未执行，请重试」，不再按本地合同推进（原脚本期望的「截断后本地推进」已作废）；手动重试成功才落账。
      const completedEvents = () => page.evaluate(() => JSON.stringify(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').toSaveData().世界.状态.剧本模组.completedEventIds || []));
      const failureNotice = /本轮未执行，请重试：响应因输出长度限制被截断/;
      const narrationSince = index => requests.slice(index).filter(item => item.kind === 'narration');
      truncated = true;
      const beforeCalls = longCalls;
      const completedBefore = await completedEvents();
      await fillMainLine();
      const structuredIntent = await input.inputValue();
      await clickSendAndIdle();
      assert.ok(narrationSince(beforeCalls).length <= 2, `structured action truncation stays within 2 module drafts: ${JSON.stringify(requests.slice(beforeCalls))}`);
      await page.getByText(failureNotice).first().waitFor({ timeout: 20000 });
      assert.equal(await completedEvents(), completedBefore, 'truncated structured turn must not settle the contract');
      assert.equal(await input.inputValue(), structuredIntent, 'structured input retained for manual retry');
      assert.equal(await page.locator('.narrative-content .last-user-intent-text').innerText(), firstIntent, 'failed structured turn cannot label previous prose');
      // 手动重试（不再截断）：同一句落账，正文绑定这一句，标记清理照旧。
      truncated = false;
      await clickSendAndIdle();
      await page.waitForFunction(text => document.querySelector('.narrative-content .last-user-intent-text')?.innerText === text, structuredIntent, { timeout: 20000 });
      assert.notEqual(await completedEvents(), completedBefore, 'manual retry settles the structured action');
      assert.equal((await page.locator('.narrative-text').innerText()).includes('【环境】'), false);
      const settledIntent = structuredIntent;
      truncated = true;
      const afterStructured = longCalls;
      await input.fill('我只是看了看远处的云');
      await clickSendAndIdle();
      await page.getByText(failureNotice).first().waitFor({ timeout: 20000 });
      assert.equal(await input.inputValue(), '我只是看了看远处的云');
      assert.equal(await input.evaluate(node => document.activeElement === node), true, 'manual retry restores textarea focus');
      assert.equal(await page.locator('.narrative-content .last-user-intent-text').innerText(), settledIntent, 'failed input cannot label previous prose');
      const after = requests.slice(afterStructured);
      const longAfter = narrationSince(afterStructured);
      assert.ok(longAfter.length <= 2, `free-input long requests must stay within 2: ${JSON.stringify(after)}`);
      assert.deepEqual(errors, []);
      guard.finish();
      console.log(`PASS ${url}: intent/prose binding, marker cleanup, truncated structured turn holds (no settle) then manual retry settles, free-input retained/focus; intercepted model/storage`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
