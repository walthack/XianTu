// Controlled browser acceptance with intercepted models/storage, not real-LLM evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { FIXTURE_NONE, classifyFixtureRequest, fixtureCompletion, installSmokeNetworkGuard } from './e2e-smoke.mjs';

const urls = process.argv.slice(2);
// 任务模式拍子判定小请求的超时与超时重发次数（story.quest.intentSettle.beatJudge）：分类器截止上限按配置算。
const beatJudge = JSON.parse(readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8')).story.quest.intentSettle.beatJudge;
const beatDeadlineMs = beatJudge.timeoutMs * (beatJudge.timeoutRetries + 1);
assert.ok(urls.length, 'Provide dev server URL(s)');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const url of urls) {
    const context = await browser.newContext();
    // 网络护栏先装：脚本路由处理不了的请求 route.fallback() 落到护栏（非本机一律替身或 abort+判失败）。
    const guard = await installSmokeNetworkGuard(context);
    let truncated = false;
    let classifierFailed = false;
    let classifierHanging = false;
    let longCalls = 0;
    const requests = [];
    const errors = [];
    await context.addInitScript(() => {
      localStorage.setItem('api_management_config', JSON.stringify({apiConfigs:[{id:'default',name:'fixture',provider:'openrouter',url:'https://openrouter.ai/api/v1',apiKey:'fixture',model:'typesafe/jev-router',temperature:0.7,maxTokens:8192,enabled:true}],apiAssignments:[]}));
      localStorage.setItem('ai_service_config', JSON.stringify({ mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://openrouter.ai/api/v1', apiKey: 'fixture', model: 'typesafe/jev-router' } }));
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
        // 按内容分种类（预算已不可靠：意图请求现为 4096）：intent／beat 是分类小请求，memory／audit 是模块链路后台请求。
        const kind = classifyFixtureRequest(body);
        requests.push({ kind, budget: body.max_tokens, chars: JSON.stringify(body.messages).length, model: body.model,
          reasoning: body.reasoning, reasoningEffort: body.reasoning_effort, start: String(body.messages?.[0]?.content || '').slice(0, 140) });
        // 任务模式下守着合同链的分类器是拍子判定小请求（主线动作已不在意图请求的候选里）：悬挂它，每次都超过单次超时。
        if (classifierHanging && kind === 'beat') {
          await new Promise(resolve=>setTimeout(resolve, beatJudge.timeoutMs + 1000));
          try { await route.fulfill({status:200,contentType:'application/json',body:'{}'}); } catch {}
          return;
        }
        if (kind === 'intent' || kind === 'beat') return route.fulfill(fixtureCompletion(body, classifierFailed ? 'not valid json' : FIXTURE_NONE[kind]));
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
      const clickSendAndIdle = async (timeoutMs = 20000) => {
        const before = longCalls;
        await page.locator('.send-button').click();
        const deadline = Date.now() + timeoutMs;
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
      // 2026-10-03「试玩无旧链路」（docs/handoffs/2026-10-02/lead_designer_demo_no_legacy_plan.md 第16/23行）：试玩档模块两稿失败一律不落账、
      // 保留输入、报「本轮未执行，请重试」；原脚本期望的「正文生成不完整，已按你选择的行动推进」本地兜底已作废，改验不落账＋手动重试落账。
      const completedEvents = () => page.evaluate(() => JSON.stringify(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').toSaveData().世界.状态.剧本模组.completedEventIds || []));
      const failureNotice = /本轮未执行，请重试：响应因输出长度限制被截断/;
      const kindsSince = (index, ...kinds) => requests.slice(index).filter(item => kinds.includes(item.kind));
      truncated = true;
      const beforeCalls = longCalls;
      const completedBefore = await completedEvents();
      await fillMainLine();
      const structuredIntent = await input.inputValue();
      await clickSendAndIdle();
      assert.ok(kindsSince(beforeCalls, 'narration').length <= 2, `structured action truncation stays within 2 module drafts: ${JSON.stringify(requests.slice(beforeCalls))}`);
      await page.getByText(failureNotice).first().waitFor({ timeout: 20000 });
      assert.equal(await completedEvents(), completedBefore, 'truncated structured turn must not settle the contract');
      assert.equal(await input.inputValue(), structuredIntent, 'structured input retained for manual retry');
      assert.equal(await page.locator('.narrative-content .last-user-intent-text').innerText(), firstIntent, 'failed structured turn cannot label previous prose');
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
      const longAfter = kindsSince(afterStructured, 'narration');
      assert.ok(longAfter.length <= 2, `free-input long requests must stay within 2: ${JSON.stringify(after)}`);
      truncated = false;
      classifierFailed = true;
      const beforeFailedClassifier = longCalls;
      await input.fill('我想看看山那边的路');
      await clickSendAndIdle();
      assert.deepEqual(kindsSince(beforeFailedClassifier, 'narration'), [], 'failed classifier must not start narrative');
      assert.ok(kindsSince(beforeFailedClassifier, 'intent', 'beat').length >= 1, 'classifier was asked');
      assert.equal(await input.inputValue(), '我想看看山那边的路');
      assert.equal(await input.evaluate(node => document.activeElement === node), true);
      classifierFailed = false;
      // OpenRouter 上的显式推理档：意图分类与模块正文都按模块策略发 effort=none（src/services/moduleModelRuntime.ts GAME_MODEL_MODULES；
      // 2026-10-03 起试玩只走模块链路，原「正文 low」来自旧链路，已作废）。
      assert.ok(requests.some(r => r.kind === 'intent' && r.reasoning?.effort === 'none'), 'intent request carries scoped effort none');
      assert.ok(requests.filter(r => r.kind === 'narration').every(r => r.reasoning?.effort === 'none'), 'module narration carries the module policy effort');
      classifierHanging = true;
      const beforeTimeout = longCalls;
      await input.fill('我再观察一下山那边的路');
      const timeoutStarted = Date.now();
      await clickSendAndIdle(beatDeadlineMs + 10000);
      const elapsed = Date.now() - timeoutStarted;
      assert.ok(elapsed >= beatJudge.timeoutMs && elapsed < beatDeadlineMs + 4000, `classifier must stop at its configured deadline (${beatJudge.timeoutMs}ms × ${beatJudge.timeoutRetries + 1}): ${elapsed}ms`);
      assert.equal(kindsSince(beforeTimeout, 'beat').length, beatJudge.timeoutRetries + 1, 'beat judge retried only as configured on timeout');
      assert.deepEqual(kindsSince(beforeTimeout, 'narration'), [], 'timed-out classifier must not start narrative');
      assert.equal(await input.inputValue(),'我再观察一下山那边的路');
      assert.equal(await input.evaluate(node=>document.activeElement===node),true);
      classifierHanging = false;
      const manual = await page.evaluate(async () => {
        const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('characterV3');
        const slot = await store.saveAsNewSlot('Run5 reset protection');
        return {slot, id:store.rootState.当前激活存档.角色ID};
      });
      assert.ok(manual.slot);
      await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/'));
      await page.getByText('星月湖任务线试玩', {exact:true}).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.getByText('确认重置落地连续档', {exact:true}).click();
      await input.waitFor();
      const preserved = await page.evaluate(async manual => {
        const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('characterV3');
        const metadata = store.rootState.角色列表[manual.id].存档列表[manual.slot];
        const loaded = await store.loadGame(manual.id, manual.slot);
        return {metadata:!!metadata, loaded};
      },manual);
      assert.deepEqual(preserved,{metadata:true,loaded:true});
      assert.deepEqual(errors, []);
      guard.finish();
      console.log(`PASS ${url}: truncation holds then manual retry settles, classifier failure/timeout recovery, scoped reasoning payload, reset retains readable manual save; intercepted model/storage`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
