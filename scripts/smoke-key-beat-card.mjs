// Controlled browser fixture: the south pact is ordinary conversation again (user ruling 2026-10-02; card unlocked). NOT a real-LLM playtest.
// Builds the state through local production actions up to the south-pact beat, then drives the real UI.
// Ephemeral browser context; model requests are answered by fixtures, storage writes are blocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { loadTs } from '../tests/loadTs.mjs';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
  clear: () => values.clear(),
};
const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
const landing = await loadTs('../src/modules/scenarioMods/xingyuehuLandingPlaytest.ts');
const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const wuyuan = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const mods = await Promise.all(['lcq.stage_01', 'lcq.stage_02'].map(async id => parseScenarioMod(JSON.parse(
  await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'),
))));
let fixture = landing.createXingyuehuLandingPlaytestSave(mods);
let s0204Fixture;
let lockedFixture;
const advance = () => { fixture = rtm.advanceScenarioRuntime(JSON.parse(JSON.stringify(fixture))).saveData; };
for (let step = 0; step < 100; step++) {
  const rt = fixture.世界.状态.剧本模组;
  const event = rtm.getScenarioFocusEvent(rt);
  if (event?.id === 'lcq.event.ningyu_enters_gamble') break;
  if (rt.nextStageReadyId === 'lcq.stage_02') {
    const transition = init.transitionToNextScenarioStage(fixture, mods);
    assert.equal(transition.ok, true, transition.reason);
    fixture = transition.saveData;
    advance();
    continue;
  }
  if (event?.id === 'lcq.event.s02_01') {
    const tracked = rtm.trackStoryOpportunity(fixture, 'opportunity.lcq.s02_01.take_full_mandate');
    assert.equal(tracked.ok, true, tracked.reason);
    for (let i = 0; i < 4; i++) {
      const [action] = rtm.getTrackedStoryOpportunityActions(fixture);
      if (!action) break;
      assert.equal(rtm.recordStoryOpportunityStructuredAction(fixture, action).progressed, true);
      advance();
    }
  }
  if (event?.id === 'lcq.event.s02_04') {
    s0204Fixture ||= JSON.parse(JSON.stringify(fixture));
    const action = wuyuan.resolveWuyuanOpenWorldSelectionFromText(fixture, '我去五原城。')
      || wuyuan.getWuyuanOpenWorldSelections(fixture).find(item => item.kind === 'travel')
      || wuyuan.getWuyuanOpenWorldSelections(fixture).find(item => item.kind === 'problem_action');
    assert.ok(action, 's02_04 must offer a local action');
    assert.equal(wuyuan.settleWuyuanOpenWorldSelection(fixture, action).settled, true);
    advance();
    continue;
  }
  const action = rtm.getCurrentStoryEventActions(fixture).find(item =>
    event?.playerCompletionContract?.actions.some(contract => contract.id === item.actionId));
  assert.ok(action, `missing step ${step}: ${event?.id}`);
  assert.equal(rtm.recordStoryEventStructuredAction(fixture, action).attempted, true);
  advance();
}
assert.equal(rtm.getScenarioFocusEvent(fixture.世界.状态.剧本模组)?.id, 'lcq.event.ningyu_enters_gamble');
{
  const debut = rtm.getCurrentStoryEventActions(fixture).find(item => item.actionId === 'see_ningyu_sent_into_gamble');
  assert.ok(debut, '凝羽入局准备步必须先发生，拒赌按钮才能出现');
  assert.equal(rtm.recordStoryEventStructuredAction(fixture, debut).attempted, true);
  advance();
}
{
  lockedFixture = JSON.parse(JSON.stringify(fixture));
  // 继续赌局：完成凝羽入局第 2 步，焦点进入谈期限（数据顺序与 R2-11S 原文一致）。
  const respond = rtm.getCurrentStoryEventActions(fixture).find(item => item.eventId === 'lcq.event.ningyu_enters_gamble');
  assert.ok(respond, 'ningyu step 2');
  assert.equal(rtm.recordStoryEventStructuredAction(fixture, respond).attempted, true);
  advance();
}
assert.equal(rtm.getScenarioFocusEvent(fixture.世界.状态.剧本模组)?.id, 'lcq.event.sudaji_south_pact');

const narration = JSON.stringify({
  text: '你把霓龙丝的来路一五一十摆在案上，开口要三个月。苏妲己指尖在扶手上停了停，眼神在你脸上转了一圈。“成交。”',
  mid_term_memory: '提出期限。', tavern_commands: [], action_options: [],
});
const baseUrls = process.argv.slice(2);
assert.ok(baseUrls.length, 'Provide at least one running dev server URL');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const baseUrl of baseUrls) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem('ai_service_config', JSON.stringify({
        mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture-not-a-secret', model: 'fixture' },
      }));
    });
    const page = await context.newPage();
    const pageErrors = [];
    const requests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/\/api\/v1\/save-storage(?:\/|$)/.test(url.pathname)) return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      if (request.method() === 'POST' && /completions/.test(url.pathname)) {
        const body = request.postDataJSON();
        const isIntent = (body.messages || []).some(message => { try { return Array.isArray(JSON.parse(message.content).candidates); } catch { return false; } });
        requests.push(isIntent ? 'intent' : 'narration');
        const content = isIntent ? '{"actionId":"none","evidence":"x","certainty":"high"}' : narration;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { completion_tokens: 80, total_tokens: 500 } }) });
      }
      if (url.origin !== new URL(baseUrl).origin && /^https?:/.test(url.protocol) && request.method() !== 'GET') return route.abort();
      return route.continue();
    });
    const runtimeState = () => page.evaluate(() => {
      const save = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').toSaveData();
      const rt = save.世界.状态.剧本模组;
      return { prep: rt.eventActionStates?.['lcq.event.sudaji_south_pact']?.preparations || [], done: (rt.completedEventIds || []).includes('lcq.event.sudaji_south_pact'), last: String(save.系统.历史.叙事.at(-1)?.content || '') };
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      // 模块拆分开关：本上下文从未写过开关，研发构建（MODULE_DEV_DEFAULTS）下默认勾选。
      assert.equal(await page.locator('[data-testid="modular-turn-switch"]').isChecked(), true, 'module switch defaults on in dev build');
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 20_000 });
      await page.evaluate(save => {
        document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').loadFromSaveData(save);
      }, fixture);

      // 2026-10-02 用户裁定：谈期限的推进卡片已解锁，回到普通交谈——没有卡片、没有锁，输入框照常可用，
      // 两步动作作为普通按钮出现；说"要推进"的话不再被卡片拦下。
      await page.locator('textarea.game-input').waitFor();
      assert.equal(await page.locator('[data-testid="key-beat-card"]').count(), 0, 'no advance card at the pact');
      assert.equal(await page.locator('[data-testid="branch-decision"]').count(), 0, 'the pact is not a locked decision');
      assert.ok(await page.locator('.engine-action-btn').count() >= 1, 'pact actions are ordinary buttons');
      await page.locator('textarea.game-input').fill('霓龙丝在南荒哪一带？');
      await page.locator('.send-button').click();
      await page.waitForFunction(() => !document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing, undefined, { timeout: 30_000 });
      const hold = page.locator('[data-testid="intent-hold-message"]');
      assert.equal(await hold.count() ? /确认请点上方卡片/.test(await hold.innerText()) : false, false, 'not intercepted by a card');
      assert.ok(requests.length >= 1, 'ordinary conversation reaches the model');
      assert.equal((await runtimeState()).done, false);
      for (const save of [s0204Fixture, lockedFixture]) {
        await page.evaluate(save => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').loadFromSaveData(save), save);
        if (save === lockedFixture) {
          await page.locator('[data-testid="branch-decision"]').waitFor();
          assert.equal(await page.getByText('↩ 斩线回轨', { exact: true }).count(), 0);
        } else {
          await page.locator('textarea.game-input').waitFor();
          assert.ok(await page.locator('.engine-action-btn').count(), 's02_04 renders without actionId crash');
        }
      }
      const endings = mods[1].scenario.events.flatMap(event => (event.fatalOutcomes?.choices || []).map(choice => ({ ...choice.ending, sourceEventId: event.id })));
      // 三种实际结局均验证展示层；触发语义由 fatalOutcomes/分支回归测试覆盖。
      const renderEndings = [...endings.filter(ending => ['lcq.event.ningyu_enters_gamble', 'lcq.event.sudaji_south_pact'].includes(ending.sourceEventId)),
        { ...mods[1].scenario.events.find(event => event.id === 'lcq.event.wuerlang_joins').fatalOutcomes.deadline.ending, sourceEventId: 'lcq.event.wuerlang_joins' }];
      assert.equal(renderEndings.length, 3);
      for (const ending of renderEndings) {
        await page.evaluate(({ save, ending }) => {
          save.世界.状态.剧本模组.gameOver = { endingId: ending.id, title: ending.title, facts: ending.facts, sourceEventId: ending.sourceEventId, atTurn: 0 };
          save.系统.历史.叙事.at(-1).actionOptions = ['主线 · 行动', '其他行动'];
          document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').loadFromSaveData(save);
        }, { save: JSON.parse(JSON.stringify(fixture)), ending });
        await page.locator('.game-over-card').waitFor();
        for (const fact of ending.facts) assert.ok((await page.locator('.game-over-card').innerText()).includes(fact));
        assert.equal(await page.locator('.engine-action-btn, .secondary-action-options, .stage-departure-offer').count(), 0);
        assert.equal(await page.getByText('↩ 斩线回轨', { exact: true }).count(), 0);
        assert.ok(!(await page.locator('.game-over-card').innerText()).includes('结局已写在上方正文里'));
      }
      assert.deepEqual(pageErrors, []);
      console.log(`PASS ${baseUrl}: dev build defaults the module switch on; the pact has no card and no lock, input stays usable, conversation is not intercepted; requests=${JSON.stringify(requests)}`);
    } catch (error) {
      console.error({ requests, pageErrors, visible: (await page.locator('body').innerText()).slice(-1200) });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
