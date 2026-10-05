// 战斗试玩端到端验收：无头 Chromium 驱动真实游戏界面，走完「剧情 → 遇敌 → 战斗 → 结束」。
//   node dev/combat-trial/e2e.mjs [--base http://127.0.0.1:8097] [--shots /path/to/dir]
// 前提：node dev/combat-trial/build.mjs 已构建，node dev/combat-trial/serve.mjs 在跑。
// 只访问试玩服务本身；阻断所有外网请求（验证离线可用）；不碰 8091 / 8095 / 8096。
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const BASE = arg('base', 'http://127.0.0.1:8097');
const SHOTS = arg('shots', join(homedir(), 'Desktop/narrative/13c-截图'));
mkdirSync(SHOTS, { recursive: true });
const require = createRequire(join(homedir(), '.local/lib/node_modules/'));
const { chromium } = require('playwright');

const FORBIDDEN_PORTS = [8091, 8095, 8096];
const failures = [];
const results = [];
const check = (name, condition, detail = '') => {
  if (!condition) failures.push(`${name}${detail ? '：' + detail : ''}`);
  return condition;
};

async function newSession(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const session = { context, page, external: new Set(), requests: [], errors: [], label };
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    session.external.add(url);
    return route.abort();
  });
  page.on('request', request => session.requests.push(`${request.method()} ${request.url()}`));
  page.on('pageerror', error => session.errors.push(String(error).slice(0, 200)));
  session.cdp = await context.newCDPSession(page);
  session.shot = async name => {
    const { data } = await session.cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${label}-${name}.png`), Buffer.from(data, 'base64'));
  };
  return session;
}

const saveOf = page => page.evaluate(() => window.__combatTrial.pinia._s.get('gameState').toSaveData());
const trialOf = async page => (await saveOf(page)).系统.扩展.战斗试玩;

async function startGame(session, query) {
  const { page } = session;
  await page.goto(`${BASE}/?debug=1&${query}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=start-combat-trial]', { timeout: 30000 });
  await page.click('[data-testid=start-combat-trial]');
  await page.waitForSelector('.input-section', { timeout: 30000 });
  await page.waitForSelector('[data-combat-trial-host]', { state: 'attached', timeout: 10000 });
}

/** 点主线按钮（按文字），再点发送；等叙事里出现期望文字。 */
async function mainLine(session, buttonText, expectText) {
  const { page } = session;
  await page.locator('.engine-action-options button', { hasText: buttonText }).first().click();
  await page.click('.send-button');
  await page.waitForFunction(text => document.querySelector('.current-narrative')?.innerText.includes(text), expectText, { timeout: 20000 });
}

async function playScenario(browser, { label, mode, rolls, tier, result, epilogueButton, epilogueText, pick }) {
  const session = await newSession(browser, label);
  const { page } = session;
  const started = Date.now();
  await startGame(session, `mode=${mode}&rolls=${rolls.join(',')}`);

  // 真实界面：TopBar、侧栏、主面板都在
  for (const selector of ['.game-view', '.left-sidebar', '.main-game-panel', '.input-section']) {
    check(`${label} 真实界面 ${selector}`, (await page.locator(selector).count()) > 0);
  }
  check(`${label} 开场前战斗卡片不显示`, (await page.locator('[data-testid=combat-trial-card]').count()) === 0);
  await session.shot('1-开场');

  // 一拍剧情 → 遇敌
  await mainLine(session, '循着哨声迎向雾里', '第一次与人正式交手');
  await page.waitForSelector('[data-testid=combat-trial-card][data-status=engaged]', { timeout: 15000 });
  check(`${label} 战斗中主线按钮隐藏`, !(await page.locator('.engine-action-options').first().isVisible().catch(() => false)));
  check(`${label} 战斗中输入框隐藏`, !(await page.locator('.input-section .input-wrapper').first().isVisible().catch(() => false)));
  await session.shot('2-遇敌');

  // 战斗：每一步点一个选项
  let steps = 0;
  const latencies = [];
  for (;;) {
    const status = await page.getAttribute('[data-testid=combat-trial-card]', 'data-status');
    if (status === 'resolved') break;
    check(`${label} 战斗步数上限`, steps < 8);
    if (steps >= 8) break;
    const choices = await page.locator('[data-testid^=combat-choice-]').evaluateAll(els => els.map(el => el.getAttribute('data-testid')));
    const chosen = pick ? pick(choices, steps) : choices[0];
    const before = (await trialOf(page)).battle.resolutions.length;
    const t0 = Date.now();
    await page.click(`[data-testid=${chosen}]`);
    await page.waitForFunction(count => window.__combatTrial.pinia._s.get('gameState').toSaveData().系统.扩展.战斗试玩.battle.resolutions.length > count, before, { timeout: 15000 });
    await page.waitForSelector('[data-testid=combat-last-result]', { timeout: 5000 });
    latencies.push(Date.now() - t0);
    if (steps === 0) await session.shot('3-第一步结果');
    steps++;
  }
  await page.waitForSelector('[data-testid=combat-summary]', { timeout: 10000 });
  await session.shot('4-战斗结束');
  const ext = await trialOf(page);
  check(`${label} 档位`, ext.tier === tier, `期望 ${tier} 实际 ${ext.tier}`);
  const mid = await saveOf(page);
  const runtime = mid.世界.状态.剧本模组;
  check(`${label} 结果标记`, runtime.flags['trial.combat.result'] === result);
  check(`${label} 主角外伤已落账`, (mid.角色.效果 || []).some(item => item.来源 === '山涧雾战'));
  const narrative = mid.系统.历史.叙事.at(-1).content;
  check(`${label} 战斗实录追加进遇敌条目`, narrative.includes('第一次与人正式交手') && narrative.includes('武二郎冲进雾里'));
  check(`${label} 结束后输入框恢复`, await page.locator('.input-section .input-wrapper').first().isVisible());
  const buttons = await page.locator('.engine-action-options button').allInnerTexts();
  check(`${label} 结束后恰有一个收尾按钮`, buttons.length === 1 && buttons[0].includes(epilogueButton), JSON.stringify(buttons));

  // 回叙事 → 终点
  await mainLine(session, epilogueButton, epilogueText);
  await page.waitForSelector('.game-over-card', { timeout: 15000 }).catch(() => {});
  const end = await saveOf(page);
  check(`${label} 事件完成`, end.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s04_02'));
  check(`${label} 终点卡片`, (await page.locator('.game-over-card').count()) > 0);
  await session.shot('5-终点');

  const stats = {
    label, 步数: steps, 结果: ext.tier, 点击到出结果ms: latencies.join('/'), 页面错误: session.errors.length, 外网请求: [...session.external].length,
    耗时s: Math.round((Date.now() - started) / 1000),
  };
  // 隔离：只访问试玩服务；不碰其它端口；不写服务器存档
  for (const request of session.requests) {
    check(`${label} 请求不碰其它端口`, !FORBIDDEN_PORTS.some(port => request.includes(`:${port}/`)), request);
    check(`${label} 不向服务器写存档`, !/^(PUT|POST|DELETE) /.test(request) || !request.includes('/api/'), request);
  }
  check(`${label} 无页面错误`, session.errors.length === 0, session.errors.join(' | '));
  check(`${label} 每步点击到出结果 < 500ms`, latencies.every(ms => ms < 500), latencies.join('/'));
  results.push(stats);
  await session.context.close();
  return stats;
}

const SCRIPTS = [
  { label: 'B-胜', mode: 'B', rolls: [20, 20], tier: '胜', result: 'win', epilogueButton: '清点伤亡，随队继续赶路', epilogueText: '武二郎斩杀四人' },
  { label: 'B-败', mode: 'B', rolls: [9, 9], tier: '败', result: 'lose', epilogueButton: '撑着站起来，清点伤亡', epilogueText: '祁远按着肩膀' },
  { label: 'B-大败', mode: 'B', rolls: [1, 1], tier: '大败', result: 'rout', epilogueButton: '被人搀起，等雾散去', epilogueText: '唇边带着黑血' },
  { label: 'A-胜', mode: 'A', rolls: [20, 20, 20, 20, 20], tier: '胜', result: 'win', epilogueButton: '清点伤亡，随队继续赶路', epilogueText: '武二郎斩杀四人' },
  { label: 'A-败', mode: 'A', rolls: [10, 10, 10, 10, 10], tier: '败', result: 'lose', epilogueButton: '撑着站起来，清点伤亡', epilogueText: '祁远按着肩膀' },
  { label: 'A-大败', mode: 'A', rolls: [1, 1, 1, 1, 1], tier: '大败', result: 'rout', epilogueButton: '被人搀起，等雾散去', epilogueText: '唇边带着黑血' },
];

async function refreshSafety(browser) {
  const label = '刷新续用';
  const session = await newSession(browser, label);
  const { page } = session;
  await startGame(session, 'mode=B&rolls=14,3&seed=42');
  await mainLine(session, '循着哨声迎向雾里', '第一次与人正式交手');
  await page.waitForSelector('[data-testid=combat-trial-card][data-status=engaged]');
  await page.click('[data-testid=combat-choice-use_mist]');
  await page.waitForFunction(() => window.__combatTrial.pinia._s.get('gameState').toSaveData().系统.扩展.战斗试玩.battle.resolutions.length === 1);
  const before = await trialOf(page);
  // 刷新页面：回到入口页，点「继续上次」
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid=continue-trial]', { timeout: 30000 });
  await page.click('[data-testid=continue-trial]');
  await page.waitForSelector('[data-testid=combat-trial-card][data-status=engaged]', { timeout: 30000 });
  const after = await trialOf(page);
  check('刷新续用 已掷结果不变', JSON.stringify(after.battle.resolutions) === JSON.stringify(before.battle.resolutions));
  check('刷新续用 已用骰数不变', after.diceUsed === before.diceUsed && after.diceUsed === 1);
  await page.click('[data-testid=combat-choice-call_suli]');
  await page.waitForFunction(() => window.__combatTrial.pinia._s.get('gameState').toSaveData().系统.扩展.战斗试玩.status === 'resolved');
  const finished = await trialOf(page);
  check('刷新续用 第二骰接着指定序列', finished.battle.resolutions[1].roll === 3, `第二骰=${finished.battle.resolutions[1].roll}`);
  await session.shot('1-刷新后继续');
  results.push({ label, 步数: 2, 结果: finished.tier, 页面错误: session.errors.length, 外网请求: [...session.external].length });
  check('刷新续用 无页面错误', session.errors.length === 0, session.errors.join(' | '));
  await session.context.close();
}

async function swapModes(browser) {
  const label = 'A↔B互换';
  const session = await newSession(browser, label);
  const { page } = session;
  await startGame(session, 'mode=B&rolls=1,1');
  await mainLine(session, '循着哨声迎向雾里', '第一次与人正式交手');
  await page.waitForSelector('[data-testid=combat-trial-card][data-status=engaged]');
  const hpBefore = (await saveOf(page)).角色.属性.气血.当前;
  while ((await page.getAttribute('[data-testid=combat-trial-card]', 'data-status')) !== 'resolved') {
    const first = (await page.locator('[data-testid^=combat-choice-]').first().getAttribute('data-testid'));
    const count = (await trialOf(page)).battle.resolutions.length;
    await page.click(`[data-testid=${first}]`);
    await page.waitForFunction(n => window.__combatTrial.pinia._s.get('gameState').toSaveData().系统.扩展.战斗试玩.battle.resolutions.length > n, count);
  }
  check('互换 B 打完大败', (await trialOf(page)).tier === '大败');
  check('互换 气血已扣', (await saveOf(page)).角色.属性.气血.当前 < hpBefore);
  await page.click('[data-testid=combat-restart-other]');
  await page.waitForFunction(() => {
    const ext = window.__combatTrial.pinia._s.get('gameState').toSaveData().系统.扩展.战斗试玩;
    return ext.mode === 'A' && ext.status === 'engaged' && ext.battle.resolutions.length === 0;
  }, null, { timeout: 15000 });
  const restored = await saveOf(page);
  check('互换 气血回到战前', restored.角色.属性.气血.当前 === hpBefore);
  check('互换 战斗标记已清', restored.世界.状态.剧本模组.flags['trial.combat.result'] === undefined);
  check('互换 卡片切到 A 回合制', (await page.locator('[data-testid=combat-hp]').count()) === 1);
  await session.shot('1-换成A再打');
  // A 再打到底，走完收尾，再从终点回到战前
  while ((await page.getAttribute('[data-testid=combat-trial-card]', 'data-status')) !== 'resolved') {
    const first = (await page.locator('[data-testid^=combat-choice-]').first().getAttribute('data-testid'));
    const count = (await trialOf(page)).battle.resolutions.length;
    await page.click(`[data-testid=${first}]`);
    await page.waitForFunction(n => window.__combatTrial.pinia._s.get('gameState').toSaveData().系统.扩展.战斗试玩.battle.resolutions.length > n, count);
  }
  const btn = (await page.locator('.engine-action-options button').allInnerTexts())[0];
  await mainLine(session, btn.trim().slice(0, 6), '');
  await page.waitForSelector('.game-over-card', { timeout: 15000 });
  check('互换 终点后卡片仍可重打', (await page.locator('[data-testid=combat-restart-other]').count()) === 1);
  await session.shot('2-终点后仍可重打');
  results.push({ label, 步数: '-', 结果: 'ok', 页面错误: session.errors.length, 外网请求: [...session.external].length });
  check('互换 无页面错误', session.errors.length === 0, session.errors.join(' | '));
  await session.context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const script of SCRIPTS) await playScenario(browser, script);
  await refreshSafety(browser);
  await swapModes(browser);
} catch (error) {
  failures.push(`未捕获异常：${String(error).slice(0, 400)}`);
} finally {
  await browser.close();
}
console.table(results);
if (failures.length) {
  console.error(`\n✖ ${failures.length} 项失败：\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\n✔ 端到端验收全部通过（${results.length} 组），截图在 ${SHOTS}`);
