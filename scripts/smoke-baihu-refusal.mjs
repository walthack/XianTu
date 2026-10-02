// Controlled browser fixture, NOT a continuous real-LLM playtest.
// Builds the pre-gamble state through local production actions, then tests real UI sending.
// Each run uses an ephemeral browser context; external writes are blocked and model requests are answered by fixtures.
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
const baseUrls = process.argv.slice(2);
assert.ok(baseUrls.length, 'Provide at least one running dev server URL');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const baseUrl of baseUrls) {
    const context = await browser.newContext();
    // Satisfy the existing app availability check without any real credential.
    // This lives only in this ephemeral context; every attempted model POST fails the test.
    await context.addInitScript(() => {
      localStorage.setItem('ai_service_config', JSON.stringify({
        mode: 'custom', streaming: false, maxRetries: 0,
        customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture-not-a-secret', model: 'fixture' },
      }));
    });
    const page = await context.newPage();
    const pageErrors = [];
    const blocked = [];
    const modelRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const narration = JSON.stringify({
      text: '你迎着凝羽的目光点了点头，应下这场赌局。凝羽没有说话，只把手按在刀柄上，站到桌子另一侧。商馆里灯火安静。',
      mid_term_memory: '应下赌局。', tavern_commands: [], action_options: [],
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/\/api\/v1\/save-storage(?:\/|$)/.test(url.pathname)) {
        // Force this context onto IndexedDB without reading user saves/API config
        // or forwarding metadata writes to either live server.
        return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      }
      if (request.method() === 'POST' && /completions/.test(url.pathname)) {
        // Model requests are answered by a fixture (never a real provider) and counted.
        modelRequests.push(url.pathname);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: narration }, finish_reason: 'stop' }], usage: { completion_tokens: 80, total_tokens: 500 } }) });
      }
      if (url.origin !== new URL(baseUrl).origin && /^https?:/.test(url.protocol) && request.method() !== 'GET') {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const runtimeState = () => page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const rt = pinia._s.get('gameState').toSaveData().世界.状态.剧本模组;
      return { gameOver: rt.gameOver || null, ledger: rt.baihuGambleRefusal || null, active: rt.activeEventIds, completed: rt.completedEventIds };
    });
    const loadFixture = () => page.evaluate(save => {
      document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').loadFromSaveData(save);
    }, fixture);
    const idle = () => page.waitForFunction(() => !document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing, undefined, { timeout: 30_000 });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 20_000 });
      await loadFixture();

      // 2026-10-02 硬编码选项锁：答复凝羽这一步只给「接赌 / 不赌」，隐藏输入框，不显示步骤进度。
      const lock = page.locator('[data-testid="branch-decision"]');
      await lock.waitFor();
      assert.deepEqual(await page.locator('[data-testid="branch-decision-option"]').allInnerTexts(), ['接赌', '不赌']);
      assert.equal(/第\s*\d+\s*\/\s*\d+\s*步/.test(await lock.innerText()), false, 'no step progress in the lock');
      assert.equal(await page.locator('textarea.game-input').count(), 0, 'input hidden while locked');
      assert.equal(await page.locator('.engine-action-btn').count(), 0, 'no other buttons while locked');
      assert.equal(await page.getByRole('button', { name: /拒绝这场赌局/ }).count(), 0, 'old capture-branch refusal not offered');

      // 不赌：复用致命选项机制，本局以炮烙结束；不进扣押分支。
      await page.locator('[data-testid="branch-decision-option"]', { hasText: '不赌' }).click();
      await idle();
      const declined = await runtimeState();
      assert.equal(declined.gameOver?.endingId, 'lcq.ending.death.paolao', JSON.stringify(declined.gameOver));
      assert.match(declined.gameOver.facts.join('；'), /回绝白湖商馆的赌局/);
      assert.equal(declined.ledger, null, 'no capture-branch ledger');
      await page.locator('.game-over-card').waitFor();
      assert.match(await page.locator('.game-over-card').innerText(), /炮烙/);

      // 接赌：答复凝羽这一步结算，事件推进到谈期限；之后解锁，谈期限是普通交谈（没有推进卡片）。
      await loadFixture();
      await lock.waitFor();
      await page.locator('[data-testid="branch-decision-option"]', { hasText: '接赌' }).click();
      await idle();
      const accepted = await runtimeState();
      assert.ok(accepted.completed.includes('lcq.event.ningyu_enters_gamble'), JSON.stringify(accepted));
      assert.ok(accepted.active.includes('lcq.event.sudaji_south_pact'), JSON.stringify(accepted.active));
      assert.equal(accepted.gameOver, null);
      assert.equal(await lock.count(), 0, 'lock released after the decision');
      assert.equal(await page.locator('textarea.game-input').count(), 1, 'input back after the decision');
      assert.equal(await page.locator('[data-testid="key-beat-card"]').count(), 0, 'south pact has no advance card');
      assert.deepEqual(blocked, [], 'no external writes');
      assert.deepEqual(pageErrors, [], 'browser runtime errors');
      console.log(`PASS ${baseUrl}: lock shows only 接赌/不赌 with input hidden; 不赌 → paolao game over; 接赌 → settles, unlocks, pact is ordinary conversation; modelRequests=${modelRequests.length}`);
    } catch (error) {
      console.error({ pageErrors, blocked, modelRequests, visible: (await page.locator('body').innerText()).slice(-1800) });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
