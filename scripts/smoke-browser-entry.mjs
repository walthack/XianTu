import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrls = process.argv.slice(2);
if (baseUrls.length === 0) {
  throw new Error('用法: npm run smoke:browser -- http://127.0.0.1:8091 [http://127.0.0.1:18097]');
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.XIANTU_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.XIANTU_CHROMIUM_EXECUTABLE }
    : { channel: 'chrome' }),
});

try {
  for (const baseUrl of baseUrls) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
      const entry = page.getByText('星月湖任务线试玩', { exact: true }).first();
      await entry.waitFor({ state: 'visible', timeout: 15_000 });
      assert.ok(await page.locator('#app').evaluate(element => element.innerText.trim().length > 0),
        `${baseUrl}/: #app 没有可见内容`);
      assert.deepEqual(pageErrors, [], `${baseUrl}/: 浏览器运行时错误`);
      console.log(`PASS ${baseUrl}/`);

      const legacy = page.locator('[data-testid="legacy-playtests"]');
      const worldEntry = legacy.locator('[data-testid="open-world-sim-playtest"]');
      const qingyuEntry = legacy.locator('[data-testid="open-qingyu-opening-playtest"]');
      assert.equal(await worldEntry.isVisible(), false, `${baseUrl}: 旧六朝入口未收起`);
      assert.equal(await qingyuEntry.isVisible(), false, `${baseUrl}: 旧清羽入口未收起`);
      await legacy.locator('summary').click();
      assert.equal(await worldEntry.isVisible(), true, `${baseUrl}: 旧六朝入口无法展开`);
      assert.equal(await qingyuEntry.isVisible(), true, `${baseUrl}: 旧清羽入口无法展开`);

      for (const [testId, heading] of [
        ['open-world-sim-playtest', '六朝世界试玩'],
        ['open-qingyu-opening-playtest', '清羽记开局'],
      ]) {
        if (!(await legacy.evaluate(element => element.open))) await legacy.locator('summary').click();
        await legacy.locator(`[data-testid="${testId}"]`).click();
        await page.getByRole('heading', { name: heading }).waitFor({ state: 'visible', timeout: 15_000 });
        await page.getByRole('button', { name: '← 返回主页' }).click();
        await entry.waitFor({ state: 'visible', timeout: 15_000 });
      }
      assert.deepEqual(pageErrors, [], `${baseUrl}: 历史试玩入口浏览器运行时错误`);
      console.log(`PASS ${baseUrl}/ (历史试玩折叠与入口)`);

      await entry.click();
      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]')
        .waitFor({ state: 'visible', timeout: 15_000 });
      assert.ok(await page.getByText('从飞机落地开始', { exact: true }).isVisible(),
        `${baseUrl}: 落地试玩按钮不可见`);
      assert.deepEqual(pageErrors, [], `${baseUrl}: 入口页浏览器运行时错误`);
      console.log(`PASS ${baseUrl}/xingyuehu-quest-playtest`);

      await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
      await page.getByText('雷光是紫色的。', { exact: false }).first()
        .waitFor({ state: 'visible', timeout: 20_000 });
      assert.deepEqual(pageErrors, [], `${baseUrl}: 游戏首屏浏览器运行时错误`);
      console.log(`PASS ${baseUrl}/game (草原落地首屏)`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
