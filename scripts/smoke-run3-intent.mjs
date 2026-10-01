// Controlled UI / mocked model acceptance. No real model or user-save access.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.argv[2];
assert.ok(baseUrl, 'Provide a running dev server URL');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const typed = '我环顾这片陌生草地，辨认自己究竟落在何处。';
try {
  for (const mode of (process.argv.slice(3).length ? process.argv.slice(3) : ['matched', 'malformed', 'late'])) {
    assert.ok(['matched', 'malformed', 'late'].includes(mode), 'unknown test mode');
    const context = await browser.newContext();
    const requests = [];
    const errors = [];
    const blocked = [];
    let release;
    let seenIntent;
    const intentSeen = new Promise(resolve => { seenIntent = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await context.addInitScript(() => {
      localStorage.setItem('ai_service_config', JSON.stringify({
        mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture-not-a-secret', model: 'fixture' },
      }));
      // Deliberately leave experimental narrative switches UNSET.
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/\/api\/v1\/save-storage(?:\/|$)/.test(url.pathname)) {
        return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      }
      if (request.method() === 'POST' && /\/chat\/completions\/?$/.test(url.pathname)) {
        const body = request.postDataJSON();
        let intent;
        for (const message of body.messages || []) {
          try {
            const parsed = JSON.parse(message.content);
            if (parsed.playerText && Array.isArray(parsed.candidates)) intent = parsed;
          } catch { /* narrative/system content is not the intent payload */ }
        }
        requests.push({ kind: intent ? 'intent' : 'narration', chars: JSON.stringify(body).length });
        let content = '你踩稳脚下的草地，环顾四周。陌生的风掠过草叶，身旁的人仍在，你先辨清眼前的处境。';
        if (intent) {
          seenIntent();
          if (mode === 'late') await gate;
          const candidate = intent.candidates.find(item => item.actionId === 'advance_declared_objective') || intent.candidates[0];
          content = mode === 'malformed' ? 'not-json' : JSON.stringify({
            ...candidate, actionId: candidate.actionId, candidateId: candidate.candidateId || candidate.id,
            evidence: typed, certainty: 'high',
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          choices: [{ message: { content }, finish_reason: 'stop' }],
          usage: { completion_tokens: 60, total_tokens: 500 },
        }) });
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 20000 });
      const snapshot = () => page.evaluate(() => {
        const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
        const save = stores.get('gameState').toSaveData();
        return { runtime: JSON.stringify(save.世界.状态.剧本模组), history: JSON.stringify(save.系统.历史), processing: stores.get('ui').isAIProcessing };
      });
      let before = await snapshot();
      await page.locator('textarea.game-input').fill(typed);
      await page.locator('.send-button').click();
      await Promise.race([intentSeen, new Promise((_, reject) => setTimeout(() => reject(new Error('intent request absent')), 15000))]);
      if (mode === 'late') {
        await page.evaluate(() => {
          const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
          const save = stores.get('gameState').toSaveData();
          save.世界.状态.剧本模组.worldTurn += 100;
          stores.get('gameState').loadFromSaveData(save);
        });
        before = await snapshot();
        release();
      }
      // Wait for bounded processing to settle; collect a second idle sample to avoid
      // observing the gap between intent classification and the narrative request.
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => {
        const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
        return !stores.get('ui').isAIProcessing;
      }, undefined, { timeout: 20000 });
      await page.waitForTimeout(300);
      const after = await snapshot();
      assert.equal(requests.filter(item => item.kind === 'intent').length, 1);
      if (mode === 'matched') {
        assert.ok(after.runtime !== before.runtime, 'typed current action must reach local settlement');
        const prose = requests.filter(item => item.kind === 'narration');
        assert.ok(prose.length <= 1, 'no multi-layer narration retry');
        assert.ok(prose.every(item => item.chars < 24000), 'default demo must use compact prompt, not whole-save Legacy');
      } else {
        assert.ok(after.runtime === before.runtime, `${mode} intent must not advance/change runtime`);
        assert.ok(after.history === before.history, `${mode} intent must not append narration`);
        assert.equal(requests.length, 1, `${mode} intent must not fall through to narration`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${baseUrl} ${mode}: ${JSON.stringify(requests)}`);
    } catch (error) {
      console.error({ mode, requests, errors, blocked, visible: (await page.locator('body').innerText()).slice(-1400) });
      throw error;
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
