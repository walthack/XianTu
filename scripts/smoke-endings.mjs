// 受控浏览器冒烟（不调模型）：包里 8 个结局 + 战败通用结局在界面上触发，以及凝羽 y5「留下」→ 鬼王峒驿馆会合这条非默认分支。
// 造档：Node 里用仓库 walker 现场推进到触发前一刻（不手写 gameOver / completedEventIds / flags）：
//   - 结局档：tests/mainlineWalker.mjs 的 step（正式新档沿主链逐拍走），在各触发点前截一份；
//     E02 冰蛊另用正式结算函数在阿姬曼一拍先做「先收起身契」（recordStoryEventStructuredAction），再用 step 走到武二郎入队。
//   - y5 档：tests/baihuMainlineWalk.mjs（nanhuangApprovedChanges 用的那份）走到 y5 可做；界面上选「留下」后，
//     把浏览器里的档交回同一 walker 走到驿馆拆信那一拍（中间的主线拍由 walker 推进），再导回浏览器做会合拍。
// 触发都在界面上：分支选项按钮、手打动作原句（拍子判定替身＝理想模型，只在候选里选目标动作）、中性回合把期限耗到头、场面卡里手打投降／弃守再点「确认选择」、
//   场面里手打「不还手」（识别替身给 yield_guard）一直「确认并掷骰」到被打倒。
// 期望在 Node 里现场算：结局编号＝endingKey、正文＝fixedEndingNarrative（包 texts）、标题＝包数据（fatalOutcomes／battleLoss／combatLossTitle）。
// 浏览器里走真实 importSave → loadGame（一次性上下文 IndexedDB；save-storage 一律替身 501）；模型请求全部替身；网络护栏。
// 用法：node scripts/smoke-endings.mjs <站点URL…> [--only 场景key,场景key]；SMOKE_ENDINGS_JSON＝结果写成 JSON。
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PINIA, enterIsolatedCharacter, importAndLoad, loadLikeGame, loadTs, openSmokeContext, quiet, readPersisted } from './lineSmokeHarness.mjs';

const [R, EP, FE, BD, BG, QL, P, REG, CTL] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/scenarioMods/endingPresentation.ts', '../src/modules/scenarioMods/fixedEndingNarratives.ts',
  '../src/modules/scenarioMods/branchDecision.ts', '../src/modules/scenarioMods/baihuGambleRefusal.ts', '../src/modules/scenarioMods/questLog.ts',
  '../src/modules/contentPacks/index.ts', '../src/modules/sceneModule/contracts/registry.ts', '../src/modules/sceneModule/host/controller.ts',
].map(p => loadTs(p))));
const Wk = await import('../tests/mainlineWalker.mjs');

const rtOf = save => save.世界.状态.剧本模组;
const squash = text => String(text || '').replace(/\s+/g, '');
const clone = v => JSON.parse(JSON.stringify(v));
const slotOf = (save, name) => { const s = clone(save); s.元数据.存档名 = name; return { 存档名: name, 存档数据: s }; };
const eventOf = (save, id) => rtOf(save).events.find(e => e.id === id);
const optionsOf = save => [...R.getCurrentStoryEventActions(save).filter(a => QL.questActionGate(save, a).ok), ...BG.getBaihuGambleRefusalSelections(save)];
const decisionOf = save => BD.detectBranchDecision(optionsOf(save));
const findAction = (save, eventId, actionId) => R.getCurrentStoryEventActions(save).find(a => a.eventId === eventId && a.actionId === actionId);
const contractOf = eventId => REG.SCENE_CONTRACTS.find(c => c.meta.hook.eventId === eventId);
const paragraphsOf = text => String(text).split(/\n\s*\n/).filter(Boolean).map(squash);
/** 期望的结局卡：编号、标题、正文段落全部按包数据现场算。 */
function cardExpect(endingId, sourceEventId, title) {
  const over = { endingId, sourceEventId };
  const code = EP.endingKey(over);
  const narrative = FE.fixedEndingNarrative(over);
  if (endingId !== 'lcq.ending.fail.combat') {
    assert.ok(P.CONTENT_PACKS.endings.some(e => e.endingId === endingId && e.key === code), `${endingId} 的编号应来自包里的结局表`);
    assert.ok(P.CONTENT_PACKS.texts[endingId] && narrative?.includes(P.CONTENT_PACKS.texts[endingId]), `${endingId} 的正文应来自包 texts`);
  }
  return { endingId, sourceEventId, code, title, paragraphs: narrative ? paragraphsOf(narrative) : null };
}

// ───────────── Node：walker 推进，截各触发点前的档 ─────────────
const POINTS = {
  s02_02: s => !!findAction(s, 'lcq.event.s02_02', 'witness_wang_zhe_nine_suns'),
  ningyu: s => decisionOf(s)?.options[0]?.eventId === 'lcq.event.ningyu_enters_gamble',
  sudaji: s => decisionOf(s)?.options[0]?.eventId === 'lcq.event.sudaji_south_pact',
  ajiman: s => decisionOf(s)?.options[0]?.eventId === 'lcq.event.free_ajiman',
  iron: s => !!findAction(s, 'lcq.event.iron_bridge_ambush', 'break_iron_bridge_ambush'),
  f10: s => !!findAction(s, 'lcq.event.s05b_05b_ideology_duel_and_defeat', 'advance_declared_objective'),
  f13: s => !!findAction(s, 'lcq.event.ghost_king_swallowed', 'advance_declared_objective'),
  f14: s => !!findAction(s, 'lcq.event.slay_dragon', 'advance_declared_objective'),
  shanghou: s => decisionOf(s)?.options[0]?.eventId === 'lcq.event.shanghou_revealed',
};
const snaps = {};
let wuerlang = null;
await quiet(() => Wk.withFixedHost(async () => {
  const mods = await Wk.loadMainlineMods();
  let save = Wk.formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
  for (let n = 0; n < 400 && Object.keys(snaps).length < Object.keys(POINTS).length; n++) {
    for (const [k, test] of Object.entries(POINTS)) if (!snaps[k] && test(save)) snaps[k] = clone(save);
    save = Wk.step(save, mods, n).save;
  }
  // E02：阿姬曼一拍用正式结算选「先收起身契」，再沿主链走到武二郎入队的确认动作可做。
  let s = clone(snaps.ajiman);
  const pocket = findAction(s, 'lcq.event.free_ajiman', 'pocket_ajiman_bond');
  assert.ok(pocket, '阿姬曼一拍应有「先收起身契」');
  assert.ok(R.recordStoryEventStructuredAction(s, pocket).attempted);
  s = R.advanceScenarioRuntime(s).saveData;
  for (let n = 0; n < 40 && !findAction(s, 'lcq.event.wuerlang_joins', 'confirm_wuerlang_no_prior_promise'); n++) s = Wk.step(s, mods, 1000 + n).save;
  wuerlang = clone(s);
}));
for (const k of Object.keys(POINTS)) assert.ok(snaps[k], `walker 没走到触发点 ${k}`);
assert.ok(findAction(wuerlang, 'lcq.event.wuerlang_joins', 'confirm_wuerlang_no_prior_promise'), 'walker 没走到武二郎入队的确认动作');

/** 绝路分支：Node 侧在读档后的同一状态上用正式结算做同一个选项，得出期望 gameOver。 */
async function fatalBranchCase(snap, eventId, name) {
  const slot = slotOf(snap, name);
  const save = await loadLikeGame(slot, name);
  const decision = decisionOf(save);
  assert.ok(decision && decision.options[0].eventId === eventId, `${name}：应出分支选择`);
  const fatalIds = (eventOf(save, eventId)?.fatalOutcomes?.choices || []).map(c => c.id);
  const pick = decision.options.findIndex(o => fatalIds.includes(o.actionId));
  assert.ok(pick >= 0, `${name}：分支里应有绝路选项`);
  const after = structuredClone(save);
  await quiet(async () => R.recordStoryEventStructuredAction(after, findAction(after, eventId, decision.options[pick].actionId)));
  const over = rtOf(after).gameOver;
  assert.ok(over?.endingId, `${name}：Node 侧绝路选项应落结局`);
  const choice = eventOf(save, eventId).fatalOutcomes.choices.find(c => c.id === decision.options[pick].actionId);
  assert.equal(over.endingId, choice.ending.id);
  assert.equal(over.title, choice.ending.title);
  return { slot, stage: rtOf(save).modId, labels: decision.labels, pickLabel: decision.labels[pick], ...cardExpect(over.endingId, over.sourceEventId, over.title) };
}
/** 场面结局：合同里写的败局结局。 */
function sceneCase(snap, eventId, name, extra) {
  const c = contractOf(eventId);
  assert.ok(c, `${eventId} 应有场面合同`);
  return { slot: slotOf(snap, name), stage: rtOf(snap).modId, contractId: c.meta.id, objective: c.objective.text, ...extra(c) };
}
const choiceOf = (c, id) => c.defeat.conditions.flatMap(x => x.kind === 'playerChoice' ? x.choices : []).find(x => x.id === id);
const battleLoss = id => P.CONTENT_PACKS.endings.find(e => e.endingId === id)?.battleLoss;

const CASES = {
  E01: () => fatalBranchCase(snaps.ningyu, 'lcq.event.ningyu_enters_gamble', '冒烟-结局E01'),
  async E02() {
    const name = '冒烟-结局E02', slot = slotOf(wuerlang, name), save = await loadLikeGame(slot, name);
    const action = findAction(save, 'lcq.event.wuerlang_joins', 'confirm_wuerlang_no_prior_promise');
    const after = structuredClone(save);
    await quiet(async () => { R.recordStoryEventStructuredAction(after, findAction(after, action.eventId, action.actionId)); });
    const advanced = await quiet(async () => R.advanceScenarioRuntime(after).saveData);
    const over = rtOf(after).gameOver || rtOf(advanced).gameOver;
    assert.equal(over?.endingId, 'lcq.ending.death.ajiman_bond', 'Node 侧：收起身契后确认武二郎入队应落冰蛊');
    return { slot, stage: rtOf(save).modId, action: { eventId: action.eventId, actionId: action.actionId, line: action.playerLine || action.label }, ...cardExpect(over.endingId, over.sourceEventId, over.title) };
  },
  E03: () => fatalBranchCase(snaps.sudaji, 'lcq.event.sudaji_south_pact', '冒烟-结局E03'),
  async E04() {
    const name = '冒烟-结局E04', slot = slotOf(snaps.s02_02, name), save = await loadLikeGame(slot, name);
    const action = findAction(save, 'lcq.event.s02_02', 'witness_wang_zhe_nine_suns');
    const d = eventOf(save, 'lcq.event.s02_02').fatalOutcomes.deadline;
    return { slot, stage: rtOf(save).modId, action: { eventId: action.eventId, actionId: action.actionId, line: action.playerLine || action.label },
      turns: d.turns, approach: d.approach, ...cardExpect(d.ending.id, 'lcq.event.s02_02', d.ending.title) };
  },
  E05: () => fatalBranchCase(snaps.shanghou, 'lcq.event.shanghou_revealed', '冒烟-结局E05'),
  E06: () => sceneCase(snaps.f10, 'lcq.event.s05b_05b_ideology_duel_and_defeat', '冒烟-结局E06', c => {
    const ch = choiceOf(c, 'join_or_yield');
    return { line: `我答应他，${ch.matchHints[2]}`, choice: ch, ...cardExpect(ch.endingId, c.meta.hook.eventId, battleLoss(ch.endingId).title) };
  }),
  E07: () => sceneCase(snaps.f13, 'lcq.event.ghost_king_swallowed', '冒烟-结局E07', c => {
    const ch = choiceOf(c, 'abandon_well');
    return { line: `我${ch.matchHints[1]}，带她往洞窟深处跑`, choice: ch, ...cardExpect(ch.endingId, c.meta.hook.eventId, battleLoss(ch.endingId).title) };
  }),
  E08: () => sceneCase(snaps.f14, 'lcq.event.slay_dragon', '冒烟-结局E08', c => ({ ...cardExpect(c.defeat.outcome.endingId, c.meta.hook.eventId, battleLoss(c.defeat.outcome.endingId).title) })),
  FAIL: () => sceneCase(snaps.iron, 'lcq.event.iron_bridge_ambush', '冒烟-战败通用', c => {
    const goal = c.goals.find(g => g.id === 'yield_guard');
    assert.ok(goal, 'f01 应有「停止抵抗」目标');
    assert.equal(c.defeat.outcome.endingId, 'lcq.ending.fail.combat');
    return { line: `我${goal.aliases[3]}，${goal.aliases[1]}`, ...cardExpect('lcq.ending.fail.combat', c.meta.hook.eventId, CTL.combatLossTitle(c)) };
  }),
};
const LABELS = { E01: '凝羽入局「不赌」→ 白湖斩首', E02: '收起身契→武二郎入队→冰蛊', E03: '南荒之约「拒绝期限」→ 炮烙', E04: '王哲自爆后不走，期限到 → 十里焦土',
  E05: '伸手去碰神物 → 白骨', E06: '场面 f10 答应投降 → 天命的指引', E07: '场面 f13 放弃井口 → 龙首无人', E08: '场面 f14 打输 → 龙精入体', FAIL: '场面 f01 不还手被打倒 → 战败通用' };

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1] ?? ''; args.splice(i, 2); return v.split(',').filter(Boolean); };
const only = flag('--only');
const baseUrls = args;
assert.ok(baseUrls.length, '缺少站点 URL：node scripts/smoke-endings.mjs http://127.0.0.1:端口/');
const ALL = [...Object.keys(CASES), 'Y5'];
const keys = only ? ALL.filter(k => only.includes(k)) : ALL;
assert.ok(keys.length, `--only 没选中任何场景（可选：${ALL.join(',')}）`);
const EXPECT = {};
for (const key of keys) if (CASES[key]) EXPECT[key] = await CASES[key]();

// ───────────── 浏览器侧 ─────────────
const router = (page, path) => page.evaluate(p => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(p), path);
const readSave = page => page.evaluate(expr => JSON.parse(JSON.stringify(eval(expr)._s.get('gameState').toSaveData())), PINIA);
const readState = page => page.evaluate(expr => {
  const save = eval(expr)._s.get('gameState').toSaveData();
  const rt = save.世界.状态.剧本模组;
  return { modId: rt.modId, gameOver: rt.gameOver ? JSON.parse(JSON.stringify(rt.gameOver)) : null, active: [...rt.activeEventIds], completed: [...rt.completedEventIds],
    scene: save.系统?.扩展?.场面模块?.active ? { status: save.系统.扩展.场面模块.active.state?.status, pending: !!save.系统.扩展.场面模块.active.pending, choice: save.系统.扩展.场面模块.active.choice || null, notice: save.系统.扩展.场面模块.active.notice || '' } : null,
    lcq: [...window.__lcqSeen] };
}, PINIA);
const idle = page => page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 60_000 });
async function waitChange(page, before) {
  await page.waitForFunction(({ expr, key }) => {
    const stores = eval(expr)._s; if (stores.get('ui').isAIProcessing) return false;
    const save = stores.get('gameState').toSaveData(), rt = save?.世界?.状态?.剧本模组 || {}, a = save?.系统?.扩展?.场面模块?.active;
    return `${(rt.completedEventIds || []).length}|${(rt.activeEventIds || []).join(',')}|${save?.系统?.历史?.叙事?.length ?? 0}|${rt.gameOver?.endingId || ''}|${a ? `${a.state?.beat}/${!!a.pending}/${!!a.choice}/${a.state?.status}` : ''}` !== key;
  }, { expr: PINIA, key: before }, { timeout: 60_000, polling: 200 });
  await idle(page);
  await page.waitForTimeout(250);
}
const changeKey = page => page.evaluate(expr => {
  const save = eval(expr)._s.get('gameState').toSaveData(), rt = save?.世界?.状态?.剧本模组 || {}, a = save?.系统?.扩展?.场面模块?.active;
  return `${(rt.completedEventIds || []).length}|${(rt.activeEventIds || []).join(',')}|${save?.系统?.历史?.叙事?.length ?? 0}|${rt.gameOver?.endingId || ''}|${a ? `${a.state?.beat}/${!!a.pending}/${!!a.choice}/${a.state?.status}` : ''}`;
}, PINIA);
let lastPre = null;
async function typeSend(page, text) {
  lastPre = await readState(page);
  const input = page.locator('textarea.game-input');
  assert.equal(await input.isDisabled(), false, `输入框应可用（要发「${text}」）`);
  await input.fill(text);
  const send = page.locator('.send-button');
  assert.equal(await send.isDisabled(), false, '发送键应可用');
  const key = await changeKey(page);
  await send.click();
  await waitChange(page, key);
}
async function clickAndWait(page, locator) {
  lastPre = await readState(page);
  const key = await changeKey(page);
  await locator.click();
  await page.waitForTimeout(150);
  const send = page.locator('.send-button');
  if ((await changeKey(page)) === key && await send.count() && !(await send.isDisabled())) await send.click();
  await waitChange(page, key);
}

// 模型替身：拍子判定＝理想模型（候选里有 want 就选它）；场面识别给 sceneGoal。
const ctl = { want: null, sceneGoal: null, prompts: [] };
function respond(body, kind) {
  const sys = String(body.messages?.[0]?.content || '');
  if (kind === 'beat') {
    let ids = [];
    try { ids = JSON.parse(body.messages.at(-1).content).actions.map(a => a.id); } catch { /* 非 JSON */ }
    return JSON.stringify(ctl.want && ids.includes(ctl.want) ? { id: ctl.want, c: 'high', ev: '照原句', neg: false } : { id: 'none', c: 'high', ev: '', neg: false });
  }
  if (kind === 'narration' && /行动识别器/.test(sys)) return JSON.stringify(ctl.sceneGoal || { goal: '', claim: { magnitude: 1, scope: 'single', targets: [] }, levers: [], certainty: 'high', inputClass: 'unclear' });
  if (kind === 'narration' && /只回答场内闲聊|场面描写|交锋/.test(sys) && !/每轮输出JSON|tavern_commands/.test(sys)) return '你稳住呼吸，局面随之一变。';
  if (kind === 'narration') ctl.prompts.push(body.messages.map(m => String(m.content || '')).join('\n'));
  return undefined;
}

/** 结局卡断言 + 卡上玩家能做的事。 */
async function assertEndingCard(page, exp, ctx, { action }) {
  await page.waitForFunction(expr => !!eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.gameOver?.endingId, PINIA, { timeout: 45_000 });
  await idle(page);
  const card = page.locator('.game-over-card');
  await card.waitFor({ timeout: 10_000 });
  const st = await readState(page);
  assert.equal(st.gameOver.endingId, exp.endingId, '结局 id');
  assert.equal(st.gameOver.sourceEventId, exp.sourceEventId, '结局来源事件');
  assert.equal(squash(await card.locator('.game-over-tag').innerText()), squash(`本局结束${exp.code ? ` · 结局 ${exp.code}` : ''}`), '结局编号');
  assert.equal((await card.locator('h3').innerText()).trim(), exp.title, '结局标题');
  const paragraphs = (await card.locator('p.game-over-hint').allInnerTexts()).map(squash).slice(1);
  if (exp.paragraphs) assert.deepEqual(paragraphs, exp.paragraphs, '结局卡正文应是包里的结局正文');
  else {
    // 战败通用结局包里没有固定正文：卡上显示 gameOver.facts（收场句）。
    assert.equal(FE.fixedEndingNarrative({ endingId: exp.endingId, sourceEventId: exp.sourceEventId }), undefined);
    assert.deepEqual(paragraphs, st.gameOver.facts.map(squash), '战败通用结局：卡上正文＝收场事实');
    assert.ok(paragraphs.length && paragraphs.every(Boolean), '战败通用结局：卡上应有收场句');
  }
  assert.equal(await page.locator('textarea.game-input').isDisabled(), true, '结局后输入框应封住');
  const persisted = await readPersisted(page, ctx.charId);
  assert.equal(persisted.data?.世界?.状态?.剧本模组?.gameOver?.endingId, exp.endingId, '工作槽应已落账结局');
  assert.deepEqual(st.lcq, [], '结局时不应弹 LCQ 报错码');
  const acts = (await card.locator('.game-over-acts button').allInnerTexts()).map(t => t.trim());
  let after;
  ctx.pre = lastPre;
  const rollback = card.locator('.game-over-acts button', { hasText: '回到上一轮' });
  if (action === 'rollback' && await rollback.count()) {
    await rollback.click();
    await page.locator('.retry-dialog .btn-primary').click();
    await page.waitForFunction(expr => !eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.gameOver, PINIA, { timeout: 20_000 });
    await idle(page);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.game-over-card').count(), 0, '回到上一轮后结局卡应消失');
    const back = await readState(page);
    assert.equal(back.gameOver, null);
    const branchShown = await page.locator('[data-testid="branch-decision-option"]').count();
    const inputOpen = !(await page.locator('textarea.game-input').isDisabled());
    assert.ok(inputOpen || branchShown, '回到上一轮后要么输入框可用、要么回到分支选择（分支期间输入框按设计锁住）');
    const pre = ctx.pre;
    assert.deepEqual([...back.completed].sort(), [...pre.completed].sort(), '回到上一轮后已完成拍应等于最后一手之前');
    after = `回到上一轮 → 结局清掉，已完成拍回到最后一手之前，${branchShown ? `分支选项重新出现（${branchShown} 个）` : '输入框可用'}`;
  } else {
    await card.locator('.game-over-acts button', { hasText: '返回角色选择' }).click();
    await page.waitForFunction(() => location.pathname === '/' || location.hash === '#/' || /\/$/.test(location.pathname), null, { timeout: 10_000 });
    await page.waitForTimeout(500);
    const body = (await page.locator('body').innerText()).trim();
    assert.ok(body.length > 20, '返回角色选择后页面不应白屏');
    after = `返回角色选择 → ${await page.evaluate(() => location.pathname + location.hash)}（页面 ${body.length} 字）`;
  }
  return `结局卡 ${exp.code || '（无编号）'}「${exp.title}」（${exp.endingId}），正文 ${paragraphs.length} 段${exp.paragraphs ? '同包数据' : '＝收场事实'}，输入封住，工作槽已落账；卡上按钮 ${JSON.stringify(acts)}；${after}`;
}

async function branchPick(page, exp) {
  const options = page.locator('[data-testid="branch-decision-option"]');
  await options.first().waitFor({ timeout: 10_000 });
  assert.deepEqual((await options.allInnerTexts()).map(t => t.trim()), exp.labels, '分支选项');
  assert.equal(await page.locator('textarea.game-input').isDisabled(), true, '分支期间输入框应锁');
  lastPre = await readState(page);
  await options.filter({ hasText: exp.pickLabel }).click();
}
/** 场面：手打一句开场，等场面卡出现。 */
async function sceneOpen(page, line) {
  await typeSend(page, line);
  await page.locator('section.scene-encounter').waitFor({ timeout: 15_000 });
}

const RUN = {
  async E01(page, exp) { await branchPick(page, exp); return `点「${exp.pickLabel}」；` + await assertEndingCard(page, exp, this, { action: 'home' }); },
  async E03(page, exp) { await branchPick(page, exp); return `点「${exp.pickLabel}」；` + await assertEndingCard(page, exp, this, { action: 'rollback' }); },
  async E05(page, exp) { await branchPick(page, exp); return `点「${exp.pickLabel}」；` + await assertEndingCard(page, exp, this, { action: 'rollback' }); },
  async E02(page, exp) {
    ctl.want = exp.action.actionId;
    await typeSend(page, exp.action.line);
    return `手打「${exp.action.line}」（判定替身选 ${exp.action.actionId}）；` + await assertEndingCard(page, exp, this, { action: 'rollback' });
  },
  async E04(page, exp) {
    ctl.want = exp.action.actionId;
    await typeSend(page, exp.action.line);
    let st = await readState(page);
    assert.equal(st.gameOver, null, '目睹自爆当回合不应结束');
    const att = (await readSave(page)).世界.状态.剧本模组.eventActionStates?.['lcq.event.s02_02']?.attempts || [];
    assert.ok(att.some(a => a.actionId === exp.action.actionId), '目睹自爆一步应落账');
    const witnessAt = att.find(a => a.actionId === exp.action.actionId).attemptedAtTurn, witnessWorldTurn = (await readSave(page)).世界.状态.剧本模组.worldTurn;
    ctl.want = null;
    const seen = [];
    for (let turn = 1; turn <= exp.turns + 1 && !st.gameOver; turn++) {
      ctl.prompts = [];
      const sidebarBefore = squash(await page.locator('.right-sidebar').innerText().catch(() => ''));
      await typeSend(page, '我站在原地，看着天上那道光。');
      st = await readState(page);
      const prompt = ctl.prompts.join('\n');
      const sv = await readSave(page);
      seen.push({ turn, worldTurn: sv.世界.状态.剧本模组.worldTurn, atTurn: st.gameOver?.atTurn ?? null, over: st.gameOver?.endingId ?? null, approach: exp.approach.findIndex(t => prompt.includes(t)), sidebarCountdown: /回合|倒计时/.test(sidebarBefore) && exp.approach.some(t => sidebarBefore.includes(squash(t))) });
    }
    // 期限按 worldTurn 计（runtime.ts settleFatalDeadlines：age＝worldTurn−attemptedAtTurn）：目睹那一手回合末的推进已算第 1 轮，
    // 逼近事实在算出的下一手才进正文请求。所以界面上需要的中性回合数＝attemptedAtTurn＋turns−目睹后 worldTurn。
    const need = witnessAt + exp.turns - witnessWorldTurn;
    assert.equal(seen.length, need, `应在第 ${need} 个中性回合触发（目睹于 attemptedAtTurn ${witnessAt}，目睹后 worldTurn ${witnessWorldTurn}）：${JSON.stringify(seen)}`);
    assert.equal(seen.at(-1).atTurn, witnessAt + exp.turns, '结局应落在 attemptedAtTurn＋turns');
    for (let i = 0; i < exp.approach.length; i++) assert.equal(seen[i]?.approach, i, `第 ${i + 1} 个中性回合的正文请求里应带第 ${i + 1} 条逼近事实：${JSON.stringify(seen)}`);
    assert.ok(seen.every(x => !x.sidebarCountdown), '任务日志／右栏不应出倒计时（裁定 #155）');
    assert.equal(seen.at(-1).over, exp.endingId);
    return `手打「${exp.action.line}」（attemptedAtTurn ${witnessAt}，目睹后 worldTurn ${witnessWorldTurn}）后中性回合 ${JSON.stringify(seen.map(x => `wt${x.worldTurn}:${x.over ? '结局' : ''}逼近#${x.approach + 1}`))}（逼近事实只进正文请求，右栏无倒计时 #155）；` + await assertEndingCard(page, exp, this, { action: 'rollback' });
  },
  async E06(page, exp) { return sceneChoice.call(this, page, exp); },
  async E07(page, exp) { return sceneChoice.call(this, page, exp); },
  async E08(page, exp) { return sceneLose.call(this, page, exp, { goal: 'slay' }); },
  async FAIL(page, exp) { return sceneLose.call(this, page, exp, { goal: 'yield_guard' }); },
};
async function sceneChoice(page, exp) {
  ctl.sceneGoal = null;
  await sceneOpen(page, exp.line);
  let st = await readState(page);
  if (!st.scene?.choice) { await typeSend(page, exp.line); st = await readState(page); }
  assert.equal(st.scene?.choice?.choiceId, exp.choice.id, `场面应进入终局选择 ${exp.choice.id}：${JSON.stringify(st.scene)}`);
  const card = page.locator('section.scene-encounter');
  assert.ok(squash(await card.innerText()).includes(squash(exp.choice.confirmText)), '场面卡应显示终局确认句');
  await clickAndWait(page, card.locator('button', { hasText: '确认选择' }));
  return `场面「${exp.contractId}」手打「${exp.line}」→「确认选择」；` + await assertEndingCard(page, exp, this, { action: 'rollback' });
}
async function sceneLose(page, exp, { goal }) {
  ctl.sceneGoal = { goal, claim: { magnitude: 1, scope: 'single', targets: [] }, levers: [], certainty: 'high', inputClass: 'action' };
  const line = exp.line || '我握紧匕首朝龙颅压下去';
  await sceneOpen(page, line);
  const card = page.locator('section.scene-encounter');
  let rolls = 0;
  for (let i = 0; i < 60; i++) {
    const st = await readState(page);
    if (st.gameOver || !st.scene) break;
    const finish = card.locator('button', { hasText: '继续收束（不再掷骰）' });
    if (await finish.count()) { await clickAndWait(page, finish); continue; }
    const confirm = card.locator('button', { hasText: '确认并掷骰' });
    if (await confirm.count()) { rolls++; await clickAndWait(page, confirm); continue; }
    await typeSend(page, line);
  }
  const st = await readState(page);
  assert.ok(st.gameOver, `场面 ${exp.contractId} ${rolls} 次掷骰后应已结局（当前 ${JSON.stringify(st.scene)}）`);
  return `场面「${exp.contractId}」手打「${line}」（识别替身 ${goal}），确认并掷骰 ${rolls} 次被打倒；` + await assertEndingCard(page, exp, this, { action: 'rollback' });
}

// y5「留下」→ 驿馆会合
const BW = await import('../tests/baihuMainlineWalk.mjs');
const Y5 = 'lcq.event.guiwangdong_coop_pact_ins_ningyu_enter', LETTER = 'lcq.event.blank_letter_and_dagu';
const ENT = await loadTs('../src/modules/scenarioMods/persistentLineEntries.ts');
const PRES = await loadTs('../src/modules/scenarioMods/presence.ts');
const REJOIN = ENT.REJOIN_ENTRY.eventId;
const lineActions = (save, eventId) => R.getCurrentStoryExplorationActions(save).filter(a => a.eventId === eventId);
async function y5Prepare() {
  let y5 = null;
  await quiet(async () => {
    try { await BW.walkMainline(save => { if (!y5 && lineActions(save, Y5).some(a => a.actionId === 'act.ningyu.y5.stay')) { y5 = clone(save); throw Object.assign(Error('stop'), { stop: true }); } }); }
    catch (e) { if (!e.stop) throw e; }
  });
  assert.ok(y5, 'baihu walker 应走到 y5 可做');
  const save = await loadLikeGame(slotOf(y5, '冒烟-y5留下'), 'y5');
  const stay = lineActions(save, Y5).find(a => a.actionId === 'act.ningyu.y5.stay');
  assert.ok(stay, 'y5 读档后「留下」应可做');
  return { slot: slotOf(y5, '冒烟-y5留下'), stage: rtOf(save).modId, stay: { label: stay.label, line: stay.playerLine || stay.label } };
}
/** 右栏「这一拍谁有戏」：逐行展开找带该动作按钮的那一行，点它，再发送。 */
async function sidebarLineAction(page, label) {
  const toggles = page.locator('.right-sidebar .line-beat-toggle');
  const n = await toggles.count();
  for (let i = 0; i < n; i++) {
    await toggles.nth(i).click();
    await page.waitForTimeout(200);
    const btn = page.locator('.right-sidebar .line-beat-action').filter({ hasText: label });
    if (await btn.count()) { const shown = (await btn.first().innerText()).trim(); await clickAndWait(page, btn.first()); return shown; }
    await toggles.nth(i).click();
    await page.waitForTimeout(120);
  }
  return null;
}
async function runY5(page, ctx) {
  const exp = ctx.y5;
  const shown = await sidebarLineAction(page, exp.stay.label);
  assert.ok(shown, `右栏应有 y5「${exp.stay.label}」按钮`);
  const afterStay = await readSave(page);
  assert.equal(rtOf(afterStay).flags['branch.ningyu.enter_dong'], 'stay', '界面选「留下」后 flag 应为 stay');
  assert.ok(rtOf(afterStay).pathReceipts?.['rcpt.ningyu.y5.stay'], '应有 y5 留下回执');
  // 浏览器里的档交回 walker，沿主链推进到驿馆拆信一拍（中间主线拍由 walker 推进）。
  let held = null;
  await quiet(async () => {
    try { await BW.walkMainline((save, event) => { if (!held && event?.id === LETTER && rtOf(save).flags['branch.ningyu.y5_rejoined'] !== true) { held = clone(save); throw Object.assign(Error('stop'), { stop: true }); } }, afterStay); }
    catch (e) { if (!e.stop) throw e; }
  });
  assert.ok(held, 'walker 应从界面档走到驿馆拆信一拍');
  const slot = slotOf(held, '冒烟-y5驿馆会合');
  const node = await loadLikeGame(slot, 'y5-rejoin');
  assert.equal(rtOf(node).flags['branch.ningyu.enter_dong'], 'stay');
  const rejoin = lineActions(node, REJOIN).find(a => a.actionId === 'act.ningyu.y5.rejoin');
  assert.ok(rejoin, 'Node：驿馆会合拍应可做');
  assert.ok(PRES.departedPresentNames(rtOf(node)).includes('凝羽'), 'Node：会合前凝羽不在场');
  const nodeAfter = structuredClone(node);
  rtOf(nodeAfter).worldTurn++;
  const nodeRes = await quiet(async () => R.recordStoryEventStructuredAction(nodeAfter, lineActions(nodeAfter, REJOIN).find(a => a.actionId === 'act.ningyu.y5.rejoin')));
  assert.equal(nodeRes.completed, true, 'Node：会合拍应完成');
  const outcomeText = rtOf(nodeAfter).events.find(e => e.id === REJOIN).playerCompletionContract.actions[0].outcomeText.success;
  // 导回浏览器，界面上做会合拍。
  await importAndLoad(page, ctx.charId, slot);
  await page.waitForTimeout(500);
  const before = await readSave(page);
  assert.equal(rtOf(before).flags['branch.ningyu.y5_rejoined'], undefined, '会合前不应已会合');
  assert.ok(PRES.departedPresentNames(rtOf(before)).includes('凝羽'), '浏览器读档后：会合前凝羽不在同行');
  const right = squash(await page.locator('.right-sidebar').innerText());
  assert.ok(right.includes('凝羽'), '右栏应出凝羽的会合行');
  const shownRejoin = await sidebarLineAction(page, rejoin.label);
  assert.ok(shownRejoin, `右栏应有会合「${rejoin.label}」按钮`);
  const after = await readSave(page), ar = rtOf(after), nr = rtOf(nodeAfter);
  assert.equal(ar.flags['branch.ningyu.y5_rejoined'], true, '会合 flag');
  assert.deepEqual(Object.keys(ar.pathReceipts || {}).sort(), Object.keys(nr.pathReceipts || {}).sort(), '路径回执与 Node 一致');
  assert.ok(ar.pathReceipts['rcpt.ningyu.y5_rejoin'], '会合回执');
  assert.ok(ar.questLineState?.receipts?.['beat.ningyu.y5_rejoin'], '会合拍回执');
  assert.deepEqual(Object.keys(ar.questLineState.receipts).sort(), Object.keys(nr.questLineState.receipts).sort(), '线拍回执与 Node 一致');
  assert.ok(!PRES.departedPresentNames(ar).includes('凝羽'), '凝羽回到同行');
  const narr = squash((after.系统?.历史?.叙事 || []).map(r => r.content).join('\n'));
  assert.ok(narr.includes(squash(outcomeText)), '叙事里应有会合正文');
  assert.ok(R.getCurrentStoryEventActions(after).some(a => a.actionId === 'open_blank_letter_in_person'), '会合后可拆信');
  assert.equal(lineActions(after, REJOIN).length, 0, '会合拍不再出现');
  return `右栏 y5「${shown}」→ flag stay；walker 从界面档走到 ${ar.modId} 拆信一拍；右栏会合「${shownRejoin}」→ y5_rejoined、回执同 Node、凝羽回同行、会合正文已显示、可拆信`;
}

if (keys.includes('Y5')) EXPECT.Y5 = await y5Prepare();
LABELS.Y5 = '凝羽 y5「留下」→ 驿馆会合';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
let failed = 0;
try {
  for (const baseUrl of baseUrls) {
    let requests = [];
    const { context, guard } = await openSmokeContext(browser, { contextOptions: { viewport: { width: 1600, height: 1000 } }, respond, onRequest: kind => requests.push(kind) });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      const charId = await enterIsolatedCharacter(page, baseUrl);
      for (const key of keys) {
        const exp = EXPECT[key];
        const t0 = Date.now();
        const record = { key, label: LABELS[key], save: exp.slot.存档名, stage: exp.stage };
        results.push(record);
        ctl.want = null; ctl.sceneGoal = null;
        try {
          await importAndLoad(page, charId, exp.slot);
          await page.waitForTimeout(500);
          const st0 = await readState(page);
          assert.equal(st0.modId, exp.stage, '读档后所在关');
          assert.equal(st0.gameOver, null, '读档后不应已结局');
          assert.deepEqual(st0.lcq, [], '读档后不应弹 LCQ 报错码');
          requests = [];
          const ctx = { charId, y5: EXPECT.Y5 };
          record.result = key === 'Y5' ? await runY5(page, ctx) : await RUN[key].call(ctx, page, exp);
          const st = await readState(page);
          assert.deepEqual(st.lcq, [], '操作后不应弹 LCQ 报错码');
          assert.deepEqual(pageErrors, [], '控制台不应有未捕获异常');
          record.requests = requests.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});
          record.status = 'passed';
        } catch (error) {
          failed++;
          record.status = 'failed';
          record.error = String(error.message || error).split('\n').slice(0, 8).join(' / ');
          record.visible = (await page.locator('body').innerText().catch(() => '')).slice(-500).replace(/\s+/g, ' ');
          pageErrors.length = 0;
        }
        await router(page, '/game').catch(() => {});
        record.ms = Date.now() - t0;
        console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${key}（${record.label}）${exp.stage}：${record.status === 'passed' ? `${record.result}；请求 ${JSON.stringify(record.requests)}` : `${record.error}；页面尾 ${record.visible}`}（${(record.ms / 1000).toFixed(1)}s）`);
      }
      guard.finish();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (process.env.SMOKE_ENDINGS_JSON) (await import('node:fs')).writeFileSync(process.env.SMOKE_ENDINGS_JSON, JSON.stringify(results, null, 2));
console.log(`${failed ? 'FAIL' : 'PASS'} smoke-endings：${results.length - failed}/${results.length} 个场景通过`);
process.exit(failed ? 1 : 0);
