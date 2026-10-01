// Isolated controlled-browser acceptance, not a real-model playthrough.
// Every save-storage request uses a virtual server; never touch user saves.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const urls = process.argv.slice(2);
assert.ok(urls.length, 'Provide running dev server URLs');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const { baseUrl, seeded } of urls.flatMap(baseUrl => [
    { baseUrl, seeded: false }, { baseUrl, seeded: true },
  ])) {
    const context = await browser.newContext();
    const records = new Map();
    if (seeded) {
      records.set('characters', { official_fixture: {
        模式: '单机', 角色: { 名字: '存储验收正式角色' },
        存档列表: Object.fromEntries(['正式进度', '上次对话', '时间点存档'].map(name => [name, {
          存档名: name, 保存时间: null, 最后保存时间: null,
        }])),
      } });
      records.set('active_save', { 角色ID: 'official_fixture', 存档槽位: '正式进度' });
    }
    const originalRemote = JSON.stringify([...records]);
    const writes = [];
    let phase = 'startup';
    const errors = [];
    const blocked = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const match = url.pathname.match(/\/api\/v1\/save-storage\/?(.*)$/);
      if (match) {
        const key = decodeURIComponent(match[1]);
        if (request.method() === 'GET') {
          return route.fulfill({ status: records.has(key) ? 200 : 404,
            contentType: 'application/json', body: JSON.stringify({ data: records.get(key) ?? null }) });
        }
        writes.push({ method: request.method(), key, phase });
        if (request.method() === 'PUT') records.set(key, request.postDataJSON().data);
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      if (request.method() !== 'GET' && request.method() !== 'HEAD') {
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
      writes.length = 0;
      phase = 'install-and-checkpoint';
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.locator('textarea.game-input').waitFor({ timeout: 20000 });
      const result = await page.evaluate(async () => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const character = pinia._s.get('characterV3');
        const game = pinia._s.get('gameState');
        const { 角色ID: id, 存档槽位: workingSlot } = character.rootState.当前激活存档;
        const setMarker = value => {
          const save = game.toSaveData();
          save.系统.扩展.run3StorageSmoke = value;
          game.loadFromSaveData(save);
        };
        setMarker('checkpoint-before');
        await character.saveToSlot('run3-immutable-checkpoint');
        const loaded = await character.loadGame(id, 'run3-immutable-checkpoint');
        const activeAfterLoad = { ...character.rootState.当前激活存档 };
        setMarker('continued-after');
        await character.saveCurrentGame();
        return {
          loaded, workingSlot, activeAfterLoad,
        };
      });
      assert.equal(result.loaded, true);
      assert.equal(result.activeAfterLoad.存档槽位, result.workingSlot, 'checkpoint must resume in working slot');
      phase = 'exit';
      await page.evaluate(async () => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        await pinia._s.get('characterV3').exitGameSession();
      });
      phase = 'reload';
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
      phase = 'continue';
      await page.getByRole('button', { name: '继续落地连续档', exact: true }).click();
      await page.locator('textarea.game-input').waitFor({ timeout: 20000 });
      const continued = await page.evaluate(async () => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const id = pinia._s.get('characterV3').rootState.当前激活存档.角色ID;
        const checkpoint = await new Promise((resolve, reject) => {
          const open = indexedDB.open('DAD_SAVES_DB');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const request = db.transaction('saves', 'readonly').objectStore('saves')
              .get(`savedata_${id}_run3-immutable-checkpoint`);
            request.onerror = () => { db.close(); reject(request.error); };
            request.onsuccess = () => { db.close(); resolve(request.result?.data?.系统?.扩展?.run3StorageSmoke); };
          };
        });
        return { working: pinia._s.get('gameState').toSaveData().系统.扩展.run3StorageSmoke, checkpoint };
      });
      assert.equal(continued.working, 'continued-after', 'home continue must resume latest working state');
      assert.equal(continued.checkpoint, 'checkpoint-before', 'persisted checkpoint must survive reload unchanged');
      assert.deepEqual(writes, [], 'isolated demo must not write any remote save metadata');
      assert.equal(JSON.stringify([...records]), originalRemote, 'official remote root and pointer unchanged');
      assert.deepEqual(blocked, [], 'no model or external mutation requests');
      assert.deepEqual(errors, [], 'no browser errors');
      console.log(`PASS ${baseUrl} seeded=${seeded}: checkpoint preserved, working slot updated, reload/continue latest, zero remote writes`);
    } catch (error) {
      console.error({ baseUrl, seeded, errors, writes, blocked });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
