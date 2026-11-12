// 受控浏览器冒烟的共用部分（smoke-line-turns / smoke-stage-transitions / smoke-map-festival-ending）。文件名不以 smoke- 开头，不会被 e2e-smoke 当成脚本发现。
// Node 侧：按内测构建算期望（MODULE_DEV_DEFAULTS），导入链与读档修补链同 tests/linesReplayFixtures.test.mjs。
// 浏览器侧：先装网络护栏；save-storage 一律替身 501（不写测试服）；模型请求全部替身；init 脚本记下任何出现过的 LCQ 报错码。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { FIXTURE_NONE, classifyFixtureRequest, fixtureCompletion, installSmokeNetworkGuard } from './e2e-smoke.mjs';

// musicLibrary.ts 直接 import 曲目 .mp3；Node 下只当 URL 字符串模块（同 tests/linesReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
// 期望值按内测构建算（被测站点是 --mode development 的内测构建：任务模式 story.quest 读 enabledDev）。
// 站点若是正式构建，任务日志不出现，依赖任务日志的断言会直接红，不会静默错配。
globalThis.MODULE_DEV_DEFAULTS = true;
export const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
export const { loadTs } = await import('../tests/loadTs.mjs');
const P = await quiet(() => loadTs('../src/modules/contentPacks/index.ts'));
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

/** 内置关（套内容包 overlay，同运行时）。 */
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
export const MODS = readdirSync(dataDir).filter(f => f.endsWith('.json')).sort()
  .map(f => P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))));

/** 夹具（相对 tests/fixtures）里唯一的一份档。 */
export function readFixtureSlot(file) {
  const unwrapped = unwrapDadBundle(JSON.parse(readFileSync(new URL(`../tests/fixtures/${file}`, import.meta.url), 'utf8')));
  assert.equal(unwrapped.type, 'saves');
  assert.equal(unwrapped.payload.saves.length, 1, `${file} 应只含一份档`);
  return unwrapped.payload.saves[0];
}

/** 导入链 + 游戏读档链（同 tests/linesReplayFixtures.test.mjs 的 importBundle / loadLikeGame）。 */
export async function loadLikeGame(slot, label) {
  const raw = slot.存档数据;
  const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
  assert.equal(validateSaveDataV3(save).isValid, true, `${label} 导入校验未通过`);
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('line-turns', label, JSON.parse(JSON.stringify(save)), { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}

export const PINIA = "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia";
const DEFAULT_NARRATION = JSON.stringify({ text: '你照着眼下的打算行事，身边的人各自看了你一眼，没有多言。', mid_term_memory: '按当前目标行事。', tavern_commands: [], action_options: [] });

/**
 * 一次性浏览器上下文：护栏 → init 脚本（模型配置指向 fixture.invalid、LCQ 码监听）→ 路由（save-storage 501、模型替身）。
 * respond(body, kind) 返回替身内容（undefined＝默认：正文回一段合规正文，其余回「什么也没认出」）；onRequest(kind, body) 记账。
 * 主叙事回合后的后台一致性整理（mod-kit/dual-model.json）共用分类器不认，这里单独识别：回空整理、原样抄回 turnId，kind 记 consistency。
 */
export async function openSmokeContext(browser, { respond, onRequest, contextOptions } = {}) {
  const context = await browser.newContext(contextOptions);
  // 网络护栏先装：下面的路由处理不了的请求 route.fallback() 落到护栏（非本机一律替身或 abort+判失败）。
  const guard = await installSmokeNetworkGuard(context);
  await context.addInitScript(() => {
    localStorage.setItem('ai_service_config', JSON.stringify({
      mode: 'custom', streaming: false, maxRetries: 0,
      customAPI: { provider: 'openai', url: 'https://fixture.invalid', apiKey: 'fixture-not-a-secret', model: 'fixture' },
    }));
    // 记下任何出现过的 LCQ 报错码（toast 会自动消失，轮询读不全）。
    window.__lcqSeen = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        const text = node.textContent || '';
        for (const m of text.matchAll(/LCQ-[A-Z]+-\d{3}/g)) window.__lcqSeen.push(m[0]);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/\/api\/v1\/save-storage(?:\/|$)/.test(url.pathname)) return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
    if (request.method() === 'POST' && /completions/.test(url.pathname)) {
      const body = request.postDataJSON();
      let kind = classifyFixtureRequest(body);
      let content;
      if (kind === 'narration' && /后台一致性整理器/.test(String(body.messages?.[0]?.content || ''))) {
        kind = 'consistency';
        const turnId = (() => { try { return JSON.parse(body.messages.at(-1).content).turnId; } catch { return ''; } })();
        content = JSON.stringify({ turnId, npcMemory: [], relationNotes: [], continuity: [], summaryCheck: { ok: true, issue: '' } });
      } else {
        content = respond?.(body, kind) ?? (kind === 'narration' ? DEFAULT_NARRATION : FIXTURE_NONE[kind]);
      }
      onRequest?.(kind, body);
      return route.fulfill(fixtureCompletion(body, content));
    }
    return route.fallback();
  });
  return { context, guard };
}

/** 从星月湖试玩入口建一个单机隔离角色，返回角色 ID；之后各档都导入到它名下。 */
export async function enterIsolatedCharacter(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('星月湖任务线试玩', { exact: true }).first().click();
  await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
  await page.locator('textarea.game-input').waitFor({ timeout: 25_000 });
  const charId = await page.evaluate(expr => eval(expr)._s.get('characterV3').rootState.当前激活存档.角色ID, PINIA);
  assert.ok(charId, '试玩入口应建好单机角色');
  return charId;
}

/** 真实 importSave（V3 迁移+校验，落一次性上下文 IndexedDB）→ loadGame（读档校验+修补链）→ 进 /game，等落定。清空 LCQ 记录。 */
export async function importAndLoad(page, charId, slot) {
  const loaded = await page.evaluate(async ({ expr, charId, slot }) => {
    const stores = eval(expr)._s;
    const character = stores.get('characterV3');
    window.__lcqSeen.length = 0;
    const name = await character.importSave(charId, slot, { overwrite: true });
    const ok = await character.loadGame(charId, name);
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
    if (router.currentRoute.value.path !== '/game') await router.push('/game');
    return { name, ok };
  }, { expr: PINIA, charId, slot });
  assert.equal(loaded.ok, true, '读档应成功');
  await page.locator('textarea.game-input').waitFor({ timeout: 20_000 });
  await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 20_000 });
  return loaded;
}

/** 从持久化的工作槽读回当前档（落账核对用）。 */
export async function readPersisted(page, charId) {
  return page.evaluate(async ({ expr, charId }) => {
    const character = eval(expr)._s.get('characterV3');
    const slot = character.rootState.当前激活存档.存档槽位;
    const data = await character.loadSaveData(charId, slot);
    return { slot, data };
  }, { expr: PINIA, charId });
}

/** 在地图页拖动画布把地点拖到画布中央附近，再点它，等弹窗标题＝地名（同 smoke-map-festival-ending 的做法）。地图上没画出该地点返回 null。 */
export async function openMapLocationPopup(page, locationId, { tries = 30 } = {}) {
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/game/world-map'));
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ timeout: 15_000 });
  const locate = () => page.evaluate(id => {
    let el = document.querySelector('canvas'), comp = null;
    // 内测构建读 setupState；正式构建里 script setup 状态不外露，读 GameMapPanel 的 defineExpose（exposed 里是 ref）。
    const has = c => (c?.exposed && 'mapManager' in c.exposed) || (c?.setupState && 'mapManager' in c.setupState);
    while (el && !comp) { const c = el.__vueParentComponent; if (has(c)) comp = c; el = el.parentElement; }
    const exposed = comp?.exposed?.mapManager;
    const mm = exposed ? ('value' in exposed ? exposed.value : exposed) : comp?.setupState?.mapManager;
    const loc = mm?.layers?.get(4)?.children.map(c => c.userData?.data || c.userData).find(d => d && d.id === id);
    if (!mm || !loc) return null;
    const rect = document.querySelector('canvas').getBoundingClientRect(), s = mm.worldContainer.scale.x;
    const c = loc.coordinates || loc;
    return { name: loc.name, x: rect.left + mm.worldContainer.x + c.x * s, y: rect.top + mm.worldContainer.y + c.y * s, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }, locationId);
  let at = null;
  for (let i = 0; i < tries && !at; i++) { at = await locate(); if (!at) await page.waitForTimeout(300); }
  if (!at) return null;
  for (let n = 0; n < 6 && (Math.abs(at.x - at.cx) > 200 || Math.abs(at.y - at.cy) > 200); n++) {
    const dx = Math.max(-500, Math.min(500, at.cx - at.x)), dy = Math.max(-350, Math.min(350, at.cy - at.y));
    await page.mouse.move(at.cx, at.cy);
    await page.mouse.down();
    await page.mouse.move(at.cx + dx / 2, at.cy + dy / 2, { steps: 5 });
    await page.mouse.move(at.cx + dx, at.cy + dy, { steps: 5 });
    await page.mouse.up();
    at = await locate();
  }
  await page.mouse.click(at.x, at.y);
  const popup = page.locator('.location-popup');
  await popup.waitFor({ timeout: 5_000 });
  const title = (await popup.locator('h4').innerText()).trim();
  return title === at.name ? { popup, name: at.name } : null;
}
