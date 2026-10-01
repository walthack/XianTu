// Controlled browser fixture, NOT a continuous real-LLM playtest.
// Builds the pre-gamble state through local production actions, then tests real UI sending.
// Each run uses an ephemeral browser context; external writes/model requests are blocked.
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
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/\/api\/v1\/save-storage(?:\/|$)/.test(url.pathname)) {
        // Force this context onto IndexedDB without reading user saves/API config
        // or forwarding metadata writes to either live server.
        return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
      }
      if (url.origin !== new URL(baseUrl).origin && /^https?:/.test(url.protocol) && request.method() !== 'GET') {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      }
      if (request.method() === 'POST' && /completions|responses|messages/.test(url.pathname)) {
        blocked.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 20_000 });
      await page.evaluate(save => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        pinia._s.get('gameState').loadFromSaveData(save);
      }, fixture);
      await page.getByRole('button', { name: /拒绝这场赌局/ }).waitFor();
      await page.locator('textarea.game-input').fill('赌就不必了');
      await page.locator('.send-button').click();
      await page.getByRole('button', { name: /反抗拘拿/ }).waitFor({ timeout: 20_000 });
      await page.evaluate(async slot => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        await pinia._s.get('characterV3').saveToSlot(slot);
      }, landing.XINGYUEHU_LANDING_PLAYTEST_SLOT);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      await page.getByRole('button', { name: '继续落地连续档', exact: true }).click();
      await page.getByRole('button', { name: /反抗拘拿/ }).click();
      await page.locator('.send-button').click();
      await page.waitForFunction(() => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        return pinia._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.baihuGambleRefusal?.phase === 'detained';
      }, undefined, { timeout: 20_000 });
      const state = await page.evaluate(() => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const rt = pinia._s.get('gameState').toSaveData().世界.状态.剧本模组;
        return { ledger: rt.baihuGambleRefusal, active: rt.activeEventIds, completed: rt.completedEventIds };
      });
      assert.equal(state.ledger.response, 'resist');
      assert.equal(state.ledger.gambled, false);
      assert.equal(state.ledger.signedBond, false);
      assert.ok(state.active.includes('lcq.event.sudaji_south_pact'));
      assert.ok(!state.completed.includes('lcq.event.sudaji_south_pact'));
      assert.deepEqual(blocked, [], 'refusal flow must not attempt model requests');
      assert.deepEqual(pageErrors, [], 'browser runtime errors');
      console.log(`PASS ${baseUrl}: natural refusal → persisted capture/reload → UI resistance → detention; pact unplayed; no model requests`);
    } catch (error) {
      console.error({ pageErrors, blocked, visible: (await page.locator('body').innerText()).slice(-1800) });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
