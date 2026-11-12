// Controlled UI / mocked model acceptance. No real model or user-save access.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { fixtureCompletion, installSmokeNetworkGuard } from './e2e-smoke.mjs';

const baseUrl = process.argv[2];
assert.ok(baseUrl, 'Provide a running dev server URL');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const typed = '我环顾这片陌生草地，辨认自己究竟落在何处。';
try {
  for (const mode of (process.argv.slice(3).length ? process.argv.slice(3) : ['matched', 'malformed', 'late'])) {
    assert.ok(['matched', 'malformed', 'late'].includes(mode), 'unknown test mode');
    const context = await browser.newContext();
    // 网络护栏先装：脚本路由处理不了的请求 route.fallback() 落到护栏（非本机一律替身或 abort+判失败）。
    const guard = await installSmokeNetworkGuard(context);
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
        // 2026-11-04 起任务模式（内测构建默认开）：焦点拍的主线动作不再进大意图请求的 candidates，
        // 改由并行的「拍子判定」小请求（user JSON 带 actions）判；大请求只剩自由行动／状态识别。
        let intent, beat;
        for (const message of body.messages || []) {
          try {
            const parsed = JSON.parse(message.content);
            if (parsed.playerText && Array.isArray(parsed.candidates)) intent = parsed;
            if (parsed.playerText && Array.isArray(parsed.actions)) beat = parsed;
          } catch { /* narrative/system content is not the intent payload */ }
        }
        // 开发版默认开模块链路（MODULE_DEV_DEFAULTS）：模块回合后还会在后台发回合记忆／审计请求，
        // 它们不是演出重试，单独记账（只改判定，不改产品行为）。
        const system = (body.messages || []).map(message => String(message.content || '')).join('\n');
        const background = /作为记忆/.test(system) && /sentenceIds/.test(system) ? 'memory' : /连续性审计员/.test(system) ? 'audit' : '';
        requests.push({ kind: beat ? 'beat' : intent ? 'intent' : background || 'narration', chars: JSON.stringify(body).length });
        // 2026-10-01：当前路线走要求 JSON 的原链路，正文桩改为合法 JSON（原纯文本桩已过时）。
        let content = JSON.stringify({ text: '你踩稳脚下的草地，环顾四周。陌生的风掠过草叶，身旁的人仍在，你先辨清眼前的处境。', mid_term_memory: '', tavern_commands: [], action_options: [] });
        if (beat) seenIntent();
        if ((intent || beat) && mode === 'late') await gate;
        if (intent) content = JSON.stringify({ actionId: 'none', evidence: '', certainty: 'high' });
        if (beat) {
          const action = beat.actions.find(item => item.id === 'advance_declared_objective') || beat.actions[0];
          // ev 须是玩家原话里逐字连续的一段（beatJudge.evidenceMaxChars 以内）。
          content = mode === 'malformed' ? 'not-json' : JSON.stringify({ id: action.id, c: 'high', ev: '辨认自己究竟落在何处', neg: false });
        }
        // 正文请求现按流式发（stream:true），替身按请求形状回 SSE 或 JSON。
        return route.fulfill(fixtureCompletion(body, content, { usage: { completion_tokens: 60, total_tokens: 500 } }));
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.fallback();
      }
      return route.fallback();
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
        const rt = save.世界.状态.剧本模组 || {};
        const settled = JSON.stringify({ done: Object.keys(rt.flags || {}).filter(key => /^event\..*\.done$/.test(key) && rt.flags[key]).sort(), completed: rt.completedEventIds || [] });
        return { runtime: JSON.stringify(rt), settled, history: JSON.stringify(save.系统.历史), processing: stores.get('ui').isAIProcessing };
      });
      let before = await snapshot();
      await page.locator('textarea.game-input').fill(typed);
      await page.locator('.send-button').click();
      await Promise.race([intentSeen, new Promise((_, reject) => setTimeout(() => reject(new Error('beat-judge request absent')), 15000))]);
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
      assert.equal(requests.filter(item => item.kind === 'beat').length, 1, 'main-line action is judged by the beat request');
      const fellThrough = () => requests.filter(item => !['intent', 'beat'].includes(item.kind));
      if (mode === 'matched') {
        assert.ok(after.runtime !== before.runtime, 'typed current action must reach local settlement');
        assert.ok(after.settled !== before.settled, 'beat-judged main-line action completes the current event (not a free turn)');
        const prose = requests.filter(item => item.kind === 'narration');
        assert.ok(prose.length <= 1, 'no multi-layer narration retry');
        assert.ok(prose.every(item => item.chars < 24000), 'default demo must use compact prompt, not whole-save Legacy');
      } else if (mode === 'malformed') {
        // 2026-10-01 用户裁定：固定事件链上识别失败——停下、保留输入、常驻提示，不演出也不结算。
        assert.ok(after.settled === before.settled, 'malformed intent must not settle any event');
        assert.ok(after.history === before.history, 'malformed intent on a contract chain must not narrate');
        assert.deepEqual(fellThrough(), [], 'malformed intent must not fall through to narration');
        assert.equal(await page.locator('textarea.game-input').inputValue(), typed, 'input retained');
        assert.match(await page.locator('[data-testid="intent-hold-message"]').innerText(), /没有推进/, 'persistent hold message visible');
      } else {
        assert.ok(after.runtime === before.runtime, `${mode} intent must not advance/change runtime`);
        assert.ok(after.history === before.history, `${mode} intent must not append narration`);
        assert.deepEqual(fellThrough(), [], `${mode} intent must not fall through to narration`);
      }
      assert.deepEqual(errors, []);
      guard.finish();
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
