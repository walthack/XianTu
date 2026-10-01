// Hang A → leave /game → return → hang B → late A during B → release B.
// Intercepts model and server storage. Not real-LLM / official-save evidence.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const urls = process.argv.slice(2);
assert.ok(urls.length, 'Provide dev server URL(s)');

function okBody(text) {
  return JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          text,
          mid_term_memory: '当下行动已处理。',
          tavern_commands: [],
          action_options: [],
        }),
      },
      finish_reason: 'stop',
    }],
    usage: { completion_tokens: 80, total_tokens: 500 },
  });
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const url of urls) {
    const context = await browser.newContext();
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
        if (Number(body.max_tokens) <= 1024) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({actionId:'none',evidence:'',certainty:'high'})},finish_reason:'stop'}]})});
        const budget = Number(body.max_tokens);
        requests.push({ budget, hang: hangArmed });
        if (hangArmed) {
          hangArmed = false;
          await hang;
          try {
            return await route.fulfill({
              status: 200, contentType: 'application/json',
              body: okBody('迟到的星河剑不该出现在新回合。'),
            });
          } catch {
            return;
          }
        }
        if (holdB) { holdB = false; await bHang; }
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: okBody('你先看清眼前的草原，没有贸然作出新的决定。'),
        });
      }
      if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
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
      while (Date.now() < hangDeadline && longCalls < 1) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(longCalls >= 1, 'A must have started a model request');
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
      await page.locator('.engine-action-btn').first().click();
      const beforeB = longCalls;
      holdB = true;
      await clickSendAndWaitStart();
      await page.waitForFunction(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing === true);
      while (longCalls <= beforeB) await new Promise(resolve=>setTimeout(resolve,20));
      const bCalls = requests.slice(beforeB).filter(item => Number(item.budget) > 1024);
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
      console.log(`PASS ${url}: late A during active B retains busy and narrative isolation; intercepted model/storage`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
