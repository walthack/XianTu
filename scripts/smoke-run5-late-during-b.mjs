// Hang A → leave /game → return → hang B → late A during B → release B.
// Intercepts model and server storage. Not real-LLM / official-save evidence.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { FIXTURE_NONE, classifyFixtureRequest, fixtureCompletion, installSmokeNetworkGuard } from './e2e-smoke.mjs';

const urls = process.argv.slice(2);
assert.ok(urls.length, 'Provide dev server URL(s)');

// 正文替身：请求带 stream:true（现行正文链路）回 SSE，否则回 JSON。
function okBody(body, text) {
  return fixtureCompletion(body, JSON.stringify({ text, mid_term_memory: '当下行动已处理。', tavern_commands: [], action_options: [] }));
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const url of urls) {
    const context = await browser.newContext();
    // 网络护栏先装：脚本路由处理不了的请求 route.fallback() 落到护栏（非本机一律替身或 abort+判失败）。
    const guard = await installSmokeNetworkGuard(context);
    let hangArmed = false;
    let releaseHang = () => {};
    const hang = new Promise(resolve => { releaseHang = resolve; });
    let holdB = false;
    let releaseB = () => {};
    const bHang = new Promise(resolve => { releaseB = resolve; });
    let longCalls = 0;
    const requests = [];
    const errors = [];
    await context.addInitScript(() => {
      localStorage.setItem('ai_service_config', JSON.stringify({
        mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture', model: 'fixture' },
      }));
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
        // 意图／拍子判定／后台记忆审计不是正文：直接回「没认出」替身，悬挂只作用于正文请求（A 的演出）。
        const kind = classifyFixtureRequest(body);
        if (kind !== 'narration') {
          requests.push({ kind, budget: Number(body.max_tokens) });
          return route.fulfill(fixtureCompletion(body, FIXTURE_NONE[kind]));
        }
        const budget = Number(body.max_tokens);
        requests.push({ kind, budget, hang: hangArmed });
        if (hangArmed) {
          hangArmed = false;
          await hang;
          try {
            return await route.fulfill(okBody(body, '迟到的星河剑不该出现在新回合。'));
          } catch {
            return;
          }
        }
        if (holdB) { holdB = false; await bHang; }
        return route.fulfill(okBody(body, '你先看清眼前的草原，没有贸然作出新的决定。'));
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
    const piniaUi = () => page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__;
      const ui = app?.config?.globalProperties?.$pinia?._s?.get('ui');
      return {
        processing: ui?.isAIProcessing === true,
        streaming: String(ui?.streamingContent || ''),
      };
    });
    const isProcessing = async () => (await piniaUi()).processing;
    const startPlaytest = async () => {
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      const continueBtn = page.getByRole('button', { name: '继续落地连续档' });
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
      } else {
        await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
        const confirm = page.locator('[data-testid="confirm-reset-xingyuehu-landing-playtest"] button.primary');
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
      }
      await page.locator('textarea.game-input').waitFor({ timeout: 20000 });
    };
    const clickSendAndWaitStart = async () => {
      const before = longCalls;
      await page.locator('.send-button').click();
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (longCalls > before || await isProcessing()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('send did not start');
    };
    const waitIdle = async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (!(await isProcessing())) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('processing did not finish');
    };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await startPlaytest();
      hangArmed = true;
      await page.locator('textarea.game-input').fill('我只是看了看远处的云');
      await clickSendAndWaitStart();
      const hangDeadline = Date.now() + 20000;
      // A 回合现在先发意图／拍子判定小请求，再发正文；要等 A 的正文真的悬挂在途再离开（否则悬挂会落到 B 头上）。
      while (Date.now() < hangDeadline && !requests.some(item => item.hang)) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(requests.some(item => item.kind === 'narration' && item.hang), 'A must have started its (hung) narration request');
      assert.equal((await piniaUi()).processing, true);
      await page.evaluate(() => {
        const app = document.querySelector('#app').__vue_app__;
        return app.config.globalProperties.$router.push('/');
      });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().waitFor({ timeout: 20000 });
      await page.locator('textarea.game-input').waitFor({state:'detached',timeout:5000});
      await page.waitForFunction(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing === false, {timeout:5000});
      assert.equal((await piniaUi()).processing, false, 'leaving /game must clear persistent busy');
      const afterLeave = longCalls;
      await startPlaytest();
      await fillMainLine();
      const beforeB = longCalls;
      holdB = true;
      await clickSendAndWaitStart();
      await page.waitForFunction(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing === true);
      while (longCalls <= beforeB) await new Promise(resolve=>setTimeout(resolve,20));
      const bCalls = requests.slice(beforeB).filter(item => item.kind === 'narration');
      assert.ok(bCalls.length >= 1, `B must issue its own narration while A is still hung: ${JSON.stringify(requests.slice(beforeB))}`);
      assert.ok(bCalls.length <= 2, `B long calls=${JSON.stringify(requests.slice(beforeB))}`);
      const beforeLate = {
        processing: (await piniaUi()).processing,
        narrative: await page.locator('.narrative-text').innerText().catch(() => ''),
      };
      assert.equal(beforeLate.processing, true);
      assert.equal(beforeLate.narrative.includes('迟到的星河剑'), false);
      releaseHang();
      await new Promise(resolve => setTimeout(resolve, 800));
      const afterLate = await piniaUi();
      const narrative = await page.locator('.narrative-text').innerText().catch(() => '');
      assert.equal(afterLate.processing, true, 'late A cannot clear B busy');
      assert.equal(narrative.includes('迟到的星河剑'), false, 'late A must not overwrite B prose');
      assert.equal(narrative.includes('星河剑'), false);
      assert.ok(longCalls - afterLeave >= 1, 'B must have issued its own request');
      releaseB();
      await waitIdle();
      assert.equal((await piniaUi()).processing,false);
      assert.equal((await page.locator('.narrative-text').innerText()).includes('迟到的星河剑'),false);
      assert.deepEqual(errors, []);
      guard.finish();
      console.log(`PASS ${url}: late A during active B retains busy and narrative isolation; intercepted model/storage`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
