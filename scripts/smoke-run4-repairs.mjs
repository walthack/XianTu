// Controlled browser acceptance with intercepted models/storage, not real-LLM evidence.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const urls = process.argv.slice(2);
assert.ok(urls.length, 'Provide dev server URL(s)');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const url of urls) {
    const context = await browser.newContext();
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
        requests.push({ budget: body.max_tokens, chars: JSON.stringify(body.messages).length,
          start: String(body.messages?.[0]?.content || '').slice(0, 140) });
        const content = truncated ? '{"text":"partial' : JSON.stringify({
          text: '【环境】草叶在风里低伏。你先看清眼前的草原，没有贸然作出新的决定。',
          mid_term_memory: '草原上的当下行动已处理。', tavern_commands: [], action_options: [],
        });
        if (body.stream) {
          const chunk = { choices: [{ delta: { content }, finish_reason: truncated ? 'length' : 'stop' }],
            usage: { completion_tokens: truncated ? 8192 : 80, total_tokens: 500 } };
          return route.fulfill({ status: 200, contentType: 'text/event-stream',
            body: `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n` });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          choices: [{ message: { content }, finish_reason: truncated ? 'length' : 'stop' }],
          usage: { completion_tokens: truncated ? 8192 : 80, total_tokens: 500 },
        }) });
      }
      if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
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
      await page.locator('.engine-action-btn').first().click();
      const firstIntent = await input.inputValue();
      await clickSendAndIdle();
      await page.locator('.narrative-content .last-user-intent-text').waitFor({ timeout: 20000 });
      assert.equal(await page.locator('.narrative-content .last-user-intent-text').innerText(), firstIntent);
      assert.equal((await page.locator('.narrative-text').innerText()).includes('【环境】'), false);
      truncated = true;
      const beforeCalls = longCalls;
      await page.locator('.engine-action-btn').first().click();
      const settledIntent = await input.inputValue();
      await clickSendAndIdle();
      assert.ok(longCalls - beforeCalls <= 2, `structured action truncation settles locally within 1 main + 1 recovery: ${JSON.stringify(requests.slice(beforeCalls))}`);
      assert.equal((await page.locator('.narrative-text').innerText()).includes('【环境】'), false);
      const afterStructured = longCalls;
      await input.fill('我只是看了看远处的云');
      await clickSendAndIdle();
      await page.getByText('回应被截断，已保留你的输入，可手动重试。', { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await input.inputValue(), '我只是看了看远处的云');
      assert.equal(await input.evaluate(node => document.activeElement === node), true, 'manual retry restores textarea focus');
      assert.equal(await page.locator('.narrative-content .last-user-intent-text').innerText(), settledIntent, 'failed input cannot label previous prose');
      const after = requests.slice(afterStructured);
      const longAfter = after.filter(item => Number(item.budget) > 1024);
      assert.ok(longAfter.length <= 2, `free-input long requests must stay within 2: ${JSON.stringify(after)}`);
      assert.deepEqual(errors, []);
      console.log(`PASS ${url}: intent/prose binding, marker cleanup, local-contract truncation settle, free-input retained/focus; intercepted model/storage`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
