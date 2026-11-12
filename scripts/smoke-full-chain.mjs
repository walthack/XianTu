// 受控浏览器长跑（不调模型）：从全新开局沿默认主链，在真实界面里一拍一拍走到终关 rail 走完，并点「开启大祭」。
// 要回答的问题：任务模式（内测构建默认开）下，只看任务日志、只用界面的玩家，在模型表现理想时，有没有哪一拍、哪一处切关在界面这一层走不下去。
//
// 起点：首页「入六朝」默认设置 → 「开启仙途」（开局两步模型请求用替身：1/2 回一段够长的开局正文，2/2 回空初始化）。
//   --from <关id> 时改用 tests/mainlineWalker.mjs 的 formalNewSave + step 在 Node 里推到该关开头，再真实 importSave → loadGame 导入（角色取星月湖试玩入口建的隔离角色）。
// 每一步（一次界面操作＝一「手」）先在 Node 里用 walker 的同一套选择（planOf，与 step 同序）定本步该走的动作，入口按玩家真有的优先：
//   a 照任务日志当前目标原文手打发送（主线拍、关末启程）；
//   b 界面上出现的按钮：关键拍卡、分支选项、机会卡「追踪此机会」后的机会按钮、地方（五原开放世界）按钮、地图点选（人不在任务地点时去任务标记、跨国启程）；
//   c 手打后发出的拍子判定小请求／意图分类请求由替身扮演「理想模型」：从请求里的候选中选 Node 侧认为本步该走的那个动作 id（候选里没有就回 none）；
//   d 本步 walker 是「等」（无玩家动作、靠时间推进）：发一句中性的话，判定回 none。
//   一手里手打后由替身判中的记 c（不记 a）。正文请求一律回固定短正文（action_time 片刻，与 walker 的 settleActionTime 同档）。
// 每手之后与 Node 侧对照：同一份（手前的浏览器）状态上 walker.step 推一步，比 modId／completedEventIds／activeEventIds／offscreenResolvedEventIds／nextStageReadyId／gameOver；
//   预备手（去任务地点的地图出行）不比。差异逐条记账，不当场判失败；途经关序列必须等于 expectedMainline，终关 rail 必须走完，「开启大祭」可点且生效。
// 卡住：同一拍连续 --stall（默认 6）手，walker 认为会推进而浏览器没推进，记卡点（关、拍、任务日志、界面入口、判定候选、walker 该走的动作），
//   然后用 Node 侧 walker 把这一拍推过去、重新导入接着跑（--stop-on-stuck 则停下），一次跑出全部卡点；有卡点即判失败。
// 网络护栏、save-storage 替身、LCQ 报错码监听、模型替身同 scripts/lineSmokeHarness.mjs；不留 trace／视频／截图。
// --qin：秦线模式（地图入口的独立内容包 packs/qin）。起点改为导入 tests/fixtures/qin-replay/qin-entry-ready（入秦条件已满足、口信已「先记下」），
//   链＝地图上点咸阳 →「前往此地」→「确认前往」入秦（b）→ 秦关 rail 照上面的每手逻辑逐拍走完（直到返回报价出现）→ 点主面板返回按钮（b）→
//   断言回到的关与位置＝mapEntryResume 记录、mapEntryResume 清掉、返回后的关／焦点／任务日志当前拍与 Node 侧 transitionFromMapEntryStage 一致；
//   返回后再开地图咸阳弹窗，应不再有入秦行程（入口只开一次）。Node 侧每手对照：秦关内用秦线生成器 scripts/generate-qin-replay-fixtures.mjs step 的同一套选择
//   （与 walker.step 唯一差别是秦关内不因 nextStageReadyId 切关；秦关的 nextStageId 为空，这一支实测不触发，触发即记差异）。--qin 不能与 --from／--until 同用。
// 用法：node scripts/smoke-full-chain.mjs <站点URL> [--qin | --from 关id] [--until 关id] [--stall N] [--stop-on-stuck] [--json 结果文件] [--verbose]
//   默认不进 e2e:smoke（耗时长），聚合里加 --with-long 才跑。
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { MODS, PINIA, enterIsolatedCharacter, importAndLoad, loadTs, openMapLocationPopup, openSmokeContext, quiet, readFixtureSlot } from './lineSmokeHarness.mjs';

const { step, rt, formalNewSave, expectedMainline, unsettledRailBeats, withFixedHost } = await import('../tests/mainlineWalker.mjs');
const [R, W, QL, BP, F, BD, BG, GN, MT, P, RET, I, NM] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts', '../src/modules/scenarioMods/questLog.ts',
  '../src/modules/scenarioMods/beatProgress.ts', '../src/modules/scenarioMods/heimohaiFestival.ts', '../src/modules/scenarioMods/branchDecision.ts',
  '../src/modules/scenarioMods/baihuGambleRefusal.ts', '../src/modules/sceneModule/numbers.ts', '../src/modules/scenarioMods/travel/mapTravel.ts',
  '../src/modules/contentPacks/index.ts', '../src/modules/scenarioMods/mapEntryReturn.ts', '../src/modules/scenarioMods/strictInitializer.ts',
  '../src/utils/narrativeMetaWords.ts',
].map(p => loadTs(p))));

// ───────────── 参数 ─────────────
const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const FROM = opt('--from'), UNTIL = opt('--until'), STALL = Number(opt('--stall', '6')), JSON_OUT = opt('--json', process.env.SMOKE_FULL_CHAIN_JSON || null);
const STOP_ON_STUCK = bool('--stop-on-stuck'), VERBOSE = bool('--verbose'), QIN = bool('--qin');
const baseUrl = args[0];
assert.ok(baseUrl, '缺少站点 URL：node scripts/smoke-full-chain.mjs http://127.0.0.1:端口/');
assert.ok(Number.isInteger(STALL) && STALL > 0, '--stall 须为正整数');

assert.ok(!(QIN && (FROM || UNTIL)), '--qin 不能与 --from／--until 同用');
const START = 'lcq.stage_01';
const FINAL = F.FESTIVAL.finalStageId;
const CHAIN = expectedMainline(MODS, START).visited;
assert.equal(CHAIN.at(-1), FINAL, '默认主链末关应是大祭终关');
for (const [name, id] of [['--from', FROM], ['--until', UNTIL]]) if (id) assert.ok(CHAIN.includes(id), `${name} ${id} 不在默认主链上（可选：${CHAIN.join(',')}）`);
if (FROM && UNTIL) assert.ok(CHAIN.indexOf(FROM) <= CHAIN.indexOf(UNTIL), '--from 应不晚于 --until');
const LAST = UNTIL || FINAL;
// ───────────── 秦线模式的起点与期望 ─────────────
const QIN_STAGE = 'lyg.qin_xianyang';
const QIN_FIXTURE = 'qin-replay/qin-entry-ready.json';
const QIN_SLOT = QIN ? readFixtureSlot(QIN_FIXTURE) : null;
const QIN_DEP = QIN ? QIN_SLOT.存档数据.世界.状态.剧本模组.modId : null;
let EXPECTED_STAGES = QIN ? [QIN_DEP, QIN_STAGE, QIN_DEP] : CHAIN.slice(CHAIN.indexOf(FROM || START), CHAIN.indexOf(LAST) + 1);
const EVIDENCE_MAX = GN.GAME_NUMBERS.story.quest.intentSettle.beatJudge.evidenceMaxChars;
const NEUTRAL = '我先等等看';
const MAX_MOVES = 4000;
const SCENE_LIMIT = 80; // 一场场面最多 80 手（一拍两手：打法＋掷骰；碧鲮湾这类多目标场面实测要 20 拍上下）
const IDLE_LIMIT = 40; // walker 的 stallLimit 是 80 步；一拍空等 40 手还不动就当卡住

// ───────────── Node 侧：walker 的同一套选择（与 tests/mainlineWalker.mjs step 同序，只读） ─────────────
const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.stageId === 'lyg.qin_xianyang');
const clone = save => structuredClone(save);
/** 本步 walker 会走什么（不改入参）。 */
function planOf(save) {
  const state = rt(save), focus = R.getScenarioFocusEvent(state);
  if (state.gameOver) return { kind: 'over' };
  if (state.nextStageReadyId && !(QIN && state.modId === QIN_STAGE)) return { kind: 'stage', next: state.nextStageReadyId };
  if (focus?.id === 'lcq.event.s02_01') {
    const s = clone(save);
    R.trackStoryOpportunity(s, 'opportunity.lcq.s02_01.take_full_mandate');
    const choice = R.getTrackedStoryOpportunityActions(s)[0];
    if (choice) return { kind: 'opportunity:s02_01', opportunityId: 'opportunity.lcq.s02_01.take_full_mandate', choice, focus: focus.id };
  }
  if (focus?.id === 'lcq.event.s02_04') {
    const local = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action')
      || W.resolveWuyuanOpenWorldSelectionFromText(save, '我去点心铺')
      || W.getWuyuanOpenWorldSelections(save).find(a => a.identityId === 'lcq.route.wuyuan.arrive_market');
    if (local) return { kind: 'local:s02_04', local, focus: focus.id };
  }
  const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId !== ENTRY.eventId);
  const action = actions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId))
    || actions.find(a => a.actionId.startsWith('travel:')) || actions[0];
  if (action) return { kind: 'action', action, focus: focus?.id ?? null };
  const opportunity = focus?.worldActor?.opportunities?.[0];
  const s = clone(save);
  if (opportunity) R.trackStoryOpportunity(s, opportunity.id);
  const choice = R.getTrackedStoryOpportunityActions(s)[0];
  if (choice) return { kind: 'opportunity', opportunityId: opportunity?.id ?? null, choice, focus: focus?.id ?? null };
  return { kind: 'wait', focus: focus?.id ?? null };
}
/** 判定请求里本步该选的候选 id。 */
const targetIdOf = plan => plan.kind === 'action' ? plan.action.actionId : plan.kind === 'local:s02_04' ? plan.local.identityId
  : plan.kind.startsWith('opportunity') ? plan.choice.actionId : null;
const planLabel = plan => plan.kind === 'action' ? `${plan.action.eventId}/${plan.action.actionId}` : plan.kind === 'local:s02_04' ? plan.local.identityId
  : plan.kind.startsWith('opportunity') ? `${plan.opportunityId}→${plan.choice.actionId}` : plan.kind === 'stage' ? `启程→${plan.next}` : plan.kind;

const sorted = list => [...(list || [])].sort();
const progressOf = save => {
  const s = rt(save);
  return { modId: s.modId, completed: sorted(s.completedEventIds), active: sorted(s.activeEventIds), offscreen: sorted(s.offscreenResolvedEventIds),
    ready: s.nextStageReadyId ?? null, gameOver: s.gameOver?.endingId ?? (s.gameOver ? true : null), location: `${save.角色.位置?.locationId ?? ''}|${save.角色.位置?.描述 ?? ''}`,
    attempts: Object.values(s.eventActionStates || {}).reduce((n, x) => n + (Number(x?.attemptCount) || 0), 0) };
};
const keyOf = p => JSON.stringify(p);
function diffOf(a, b) {
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'location' || k === 'attempts' || JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    if (Array.isArray(a[k])) out[k] = { browserOnly: a[k].filter(x => !b[k].includes(x)), nodeOnly: b[k].filter(x => !a[k].includes(x)) };
    else out[k] = { browser: a[k], node: b[k] };
  }
  return Object.keys(out).length ? out : null;
}
/** walker 在这份状态上推一步的结果（失败返回 error）。 */
function nodeStep(save, n) {
  // 秦线生成器的 step 在秦关内不切关（其余与 walker.step 同序同选）；秦关签了 nextStageReadyId 就不再是同一套选择，报出来记差异。
  if (QIN && rt(save).modId === QIN_STAGE && rt(save).nextStageReadyId) return { error: `秦关内出现 nextStageReadyId=${rt(save).nextStageReadyId}（秦线生成器不切关，walker 会切）` };
  try { return { save: quietSync(() => step(clone(save), MODS, n).save) }; } catch (error) { return { error: String(error?.message || error).slice(0, 300) }; }
}
function quietSync(fn) { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } }

/** 主面板候选（MainGamePanel.scenarioEngineActionOptions 同口径）→ 分支选择。 */
function branchOf(save) {
  const live = R.advanceScenarioRuntime(clone(save)).saveData;
  const open = W.getWuyuanOpenWorldSelections(live);
  const options = [
    ...R.getCurrentStoryEventActions(live).filter(a => !(open.length && a.eventId === 'lcq.event.s02_04')).filter(a => QL.questActionGate(live, a).ok),
    ...R.getCurrentStoryExplorationActions(live), ...R.getTrackedStoryOpportunityActions(live), ...open, ...BG.getBaihuGambleRefusalSelections(live),
  ];
  return BD.detectBranchDecision(options);
}
const questEntries = save => quietSync(() => QL.questLogView(save, MODS).current);

// ───────────── 模型替身（理想模型） ─────────────
const LONG_OPENING = '【草原上风很大，天色灰白。】程宗扬从泥地里撑起身子，耳边仍是引擎的轰鸣余响，眼前却只有一望无际的草原。远处尘土翻滚，铁甲与兽吼混成一片，一队黑甲骑兵正与一群身形魁梧的半兽人厮杀。他压低身子伏在草丛里，心跳得厉害，脑子却出奇地清醒。'.repeat(7);
const narration = JSON.stringify({ text: '你照着眼下的打算行事，身边的人各自看了你一眼，没有多言。你稳住心神，把这一步做完。', mid_term_memory: '按当前目标行事，这一步已做完。',
  tavern_commands: [], action_options: [], action_time: { tier: '片刻' } });
const evidenceOf = text => (String(text).split(/[，。！？；、,.!?;]/).find(s => s.trim()) || String(text)).trim().slice(0, EVIDENCE_MAX);
const parseUser = body => (body.messages || []).map(m => { try { return JSON.parse(m.content); } catch { return null; } }).find(p => p?.playerText);
let current = null; // { plan, judged, beatCandidates, intentCandidates, requests }
/**
 * 场面识别请求（sceneModule/host/recognize.ts buildRecognitionPrompt）的理想识别器：候选＝【本场目标】里「作用于对方」的推进目标 ×【在场参与方】里的 opposed 方，
 * 其后是铺垫目标；按 current.sceneCombo 取一个（上一手被退回「请用陈述句…」时脚本把序号加一，相当于理想模型换一种合法理解）。识别结果仍要过 validateProposal。
 */
function sceneRecognition(user) {
  const section = name => { const m = user.split(`【${name}】`)[1] || ''; return m.split('【')[0].split('\n').map(l => l.trim()).filter(l => l.startsWith('- ')); };
  const goals = section('本场目标').map(l => ({ id: l.slice(2).split('：')[0], push: l.includes('作用于对方') }));
  const parties = section('在场参与方').map(l => ({ id: l.slice(2).split('：')[0], opposed: /（opposed；/.test(l) }));
  const foes = parties.filter(p => p.opposed);
  const combos = [...goals.filter(g => g.push).flatMap(g => (foes.length ? foes : [{ id: null }]).map(p => [g.id, p.id])), ...goals.filter(g => !g.push).map(g => [g.id, null])];
  const [goal, target] = combos.length ? combos[(current?.sceneCombo || 0) % combos.length] : ['', null];
  if (current) { current.judged = goal || null; current.sceneCandidates = { goals: goals.map(g => g.id), parties: parties.map(p => p.id), combos: combos.length }; }
  return JSON.stringify({ goal, claim: { magnitude: 2, scope: 'single', targets: target ? [target] : [] }, levers: [], cash: [], certainty: 'high', inputClass: 'action' });
}
function respond(body, kind) {
  const sys = String(body.messages?.[0]?.content || '');
  if (kind === 'narration' && /开局生成 1\/2/.test(sys)) return JSON.stringify({ text: LONG_OPENING });
  if (kind === 'narration' && /开局生成 2\/2/.test(sys)) return JSON.stringify({ mid_term_memory: '程宗扬落在草原上，远处秦军与半兽人交战。', tavern_commands: [], action_options: [] });
  if (kind === 'narration' && /行动识别器/.test(sys)) return sceneRecognition(String(body.messages.at(-1)?.content || ''));
  if (kind === 'narration' && /只回答场内闲聊|场面描写|交锋/.test(sys) && !/每轮输出JSON|tavern_commands/.test(sys)) return '你稳住呼吸，照着方才的打法出手，局面随之一变。';
  if (kind === 'narration') return narration;
  const payload = parseUser(body);
  const target = current?.plan ? targetIdOf(current.plan) : null;
  if (kind === 'beat' && payload) {
    const ids = payload.actions.map(a => a.id);
    if (current) current.beatCandidates = ids;
    if (target && ids.includes(target)) { current.judged = target; return JSON.stringify({ id: target, c: 'high', ev: evidenceOf(payload.playerText), neg: false }); }
    return JSON.stringify({ id: 'none', c: 'high', ev: '', neg: false });
  }
  if (kind === 'intent' && payload) {
    const hit = payload.candidates.find(c => c.actionId === target);
    if (current) current.intentCandidates = payload.candidates.map(c => `${c.source}:${c.actionId}`);
    const base = { affinityDelta: 0, statusProposals: [], tickets: [], risk: 'none', riskEv: '' };
    if (hit) { current.judged = target; return JSON.stringify({ actionId: hit.actionId, source: hit.source, eventId: hit.eventId, evidence: evidenceOf(payload.playerText), certainty: 'high', ...base }); }
    return JSON.stringify({ actionId: 'none', evidence: '', certainty: 'high', ...base });
  }
  return undefined;
}

// ───────────── 浏览器侧 ─────────────
const readUi = page => page.evaluate(expr => {
  const stores = eval(expr)._s;
  const save = stores.get('gameState').toSaveData();
  const text = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.trim().replace(/\s+/g, ' '));
  const festival = [...document.querySelectorAll('.right-sidebar .quest-section button.quest-next-btn')].map(b => ({ text: b.innerText.trim(), disabled: b.disabled }));
  return {
    save, busy: stores.get('ui').isAIProcessing, seq: Number(document.querySelector('[data-testid="turn-status"]')?.dataset.turnSeq || 0),
    path: location.pathname + location.hash,
    quest: text('[data-testid="quest-log"] .quest-log-entry .quest-event').map(t => t.replace(/^[◆◇●○★☆■□▲△]\s*/, '')),
    questPlace: text('[data-testid="quest-log"] .quest-log-entry .quest-more'),
    engine: text('.engine-action-options button.engine-action-btn'), keyBeat: text('[data-testid="key-beat-option"]'), branch: text('[data-testid="branch-decision-option"]'),
    cards: [...document.querySelectorAll('.right-sidebar .actor-card')].map(c => ({ title: c.querySelector('.actor-card-title')?.innerText.trim(), button: c.querySelector('button')?.innerText.trim(), disabled: c.querySelector('button')?.disabled })),
    hold: document.querySelector('[data-testid="intent-hold-message"]')?.innerText.trim() || '',
    notice: [...document.querySelectorAll('.narrative-text p[role="status"]')].map(e => e.innerText.trim()).join(' / '),
    lastNarrative: (document.querySelector('.narrative-text')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
    judgement: !!document.querySelector('.judgement-preflight-card'), scene: !!document.querySelector('.scene-encounter'), gameOverCard: !!document.querySelector('.game-over-card'),
    inputDisabled: document.querySelector('textarea.game-input')?.disabled ?? null, festival, lcq: [...window.__lcqSeen],
  };
}, PINIA);
const uiSummary = ui => ({ path: ui.path, quest: ui.quest, questPlace: ui.questPlace, engine: ui.engine, keyBeat: ui.keyBeat, branch: ui.branch, cards: ui.cards, hold: ui.hold, notice: ui.notice, lastNarrative: ui.lastNarrative,
  judgement: ui.judgement, scene: ui.scene, inputDisabled: ui.inputDisabled, sidebarButtons: ui.festival.map(f => f.text) });

const routerPush = (page, path) => page.evaluate(p => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(p), path);
async function ensureGamePage(page) {
  const path = await page.evaluate(() => location.pathname + location.hash);
  if (!/\/game\/?$/.test(path) || !(await page.locator('textarea.game-input').count())) {
    await routerPush(page, '/game');
    await page.locator('textarea.game-input').waitFor({ timeout: 20_000 });
  }
}
/** 等这一手落定：回合序号变了或进度变了，且不在 AI 处理中。 */
async function settle(page, before, timeout = 60_000) {
  await page.waitForFunction(({ expr, seq, key }) => {
    const stores = eval(expr)._s;
    if (stores.get('ui').isAIProcessing) return false;
    const save = stores.get('gameState').toSaveData();
    const rt = save?.世界?.状态?.剧本模组 || {}, a = save?.系统?.扩展?.场面模块?.active;
    const seqNow = Number(document.querySelector('[data-testid="turn-status"]')?.dataset.turnSeq || 0);
    return seqNow !== seq || `${rt.modId}|${(rt.completedEventIds || []).length}|${rt.nextStageReadyId || ''}|${(rt.activeEventIds || []).join(',')}|${save?.系统?.历史?.叙事?.length ?? 0}|${a ? `${a.state?.beat}/${!!a.pending}/${!!a.choice}/${a.state?.status}/${a.notice || ''}` : ''}` !== key;
  }, { expr: PINIA, seq: before.seq, key: shortKey(before.save) }, { timeout, polling: 200 }).catch(() => null);
  await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 60_000 });
  await page.waitForTimeout(250);
}
const shortKey = save => { const s = rt(save), a = save?.系统?.扩展?.场面模块?.active; return `${s.modId}|${(s.completedEventIds || []).length}|${s.nextStageReadyId || ''}|${(s.activeEventIds || []).join(',')}|${save?.系统?.历史?.叙事?.length ?? 0}|${a ? `${a.state?.beat}/${!!a.pending}/${!!a.choice}/${a.state?.status}/${a.notice || ''}` : ''}`; };
async function typeSend(page, text, before) {
  await ensureGamePage(page);
  const input = page.locator('textarea.game-input');
  if (await input.isDisabled()) return false;
  await input.fill(text);
  const send = page.locator('.send-button');
  if (await send.isDisabled()) return false;
  await page.waitForTimeout(150);
  await handleOverlay(page, text);
  await send.click();
  await settle(page, before);
  await handleOverlay(page, text, before);
  return true;
}
/**
 * 行动配置弹窗（输入含「闭关」等修炼词时弹出的修炼时长窗，MainGamePanel action-config-overlay）挡住发送：记账后点「确认」（默认时长）。
 */
async function handleOverlay(page, text, before) {
  const overlay = page.locator('.action-config-overlay');
  if (!(await overlay.count())) return false;
  const title = (await overlay.locator('h3').innerText().catch(() => '')).trim();
  overlays.push({ stage: before ? rt(before.save).modId : null, beat: before ? QL.questBeatKey(before.save) : null, typed: text, title });
  await overlay.locator('button.confirm-btn').click();
  await page.waitForTimeout(300);
  if (before) await settle(page, before);
  return true;
}
async function clickSend(page, locator, before) {
  await locator.click();
  await page.waitForTimeout(150);
  const send = page.locator('.send-button');
  if (!(await send.isDisabled())) await send.click();
  await settle(page, before);
}
/** 地图出行：点地点 → 「前往此地」→「确认前往」，等位置或关变化。返回是否出行成功。 */
async function mapTravel(page, locationId, before) {
  const opened = await openMapLocationPopup(page, locationId);
  if (!opened) return { ok: false, why: `地图上没画出 ${locationId}` };
  const go = opened.popup.locator('button.enter-region-btn', { hasText: '前往此地' });
  if (!(await go.count()) || await go.isDisabled()) { const why = (await opened.popup.innerText()).replace(/\s+/g, ' ').slice(0, 160); await routerPush(page, '/game'); return { ok: false, why: `「前往此地」不可点：${why}` }; }
  await go.click();
  const confirm = opened.popup.locator('button.enter-region-btn', { hasText: '确认前往' });
  if (!(await confirm.count())) { const why = (await opened.popup.innerText()).replace(/\s+/g, ' ').slice(0, 160); await routerPush(page, '/game'); return { ok: false, why: `无「确认前往」：${why}` }; }
  const loc0 = before.save.角色.位置?.locationId;
  await confirm.click();
  await page.waitForFunction(({ expr, loc0, mod0 }) => {
    const save = eval(expr)._s.get('gameState').toSaveData();
    return save?.角色?.位置?.locationId !== loc0 || save?.世界?.状态?.剧本模组?.modId !== mod0;
  }, { expr: PINIA, loc0, mod0: rt(before.save).modId }, { timeout: 20_000 }).catch(() => null);
  await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 60_000 });
  await page.waitForTimeout(400);
  await ensureGamePage(page);
  return { ok: true, name: opened.name };
}

const offMap = new Set();
const markerOf = (save, eventId) => { const list = quietSync(() => QL.questMarkers(save, MODS)); return list.find(m => m.key === eventId) || list[0]; };
/**
 * 去任务标记：先地图点选（b，地图上画得出该地点时）；画不出或走不了时照任务日志「地点：X」手打「去X」（记 a，how 标「去＋日志地点」）。
 * 返回 null＝没有可用的去法。
 */
async function goTo(page, ui, marker, attempt, eventId) {
  if (!marker) return null;
  // 跨国：剧情移动本轮只写准备、引导开地图（mapTravel.crossCountryStoryTravel，同输入区提示）；玩家照提示在地图上去目标国落点（目标本身或该国代表地点），到了再走国内移动。
  const cross = MT.crossCountryStoryTravel(ui.save, { source: 'event_engine', eventId, actionId: `travel:${marker.locationId}` });
  if (cross && attempt < 2) {
    const r = await mapTravel(page, cross.mapTargetId, ui);
    if (r.ok) return { via: 'b', how: `跨国：地图去 ${r.name}（去「${marker.name}」的落点）`, prep: cross.mapTargetId !== marker.locationId };
    anomalies.push({ stage: rt(ui.save).modId, what: '跨国落点地图走不了', target: cross, why: r.why });
  }
  if (!offMap.has(marker.locationId) && attempt < 1) {
    const r = await mapTravel(page, marker.locationId, ui);
    if (r.ok) return { via: 'b', how: `地图出行到 ${r.name}` };
    offMap.add(marker.locationId);
    anomalies.push({ stage: rt(ui.save).modId, what: '任务标记地点地图走不了', locationId: marker.locationId, name: marker.name, why: r.why });
  }
  const place = marker.name;
  if (!place || attempt >= 3) return null;
  const shownPlace = ui.questPlace.some(t => t.includes(place));
  await typeSend(page, `去${place}`, ui);
  return { via: current.judged ? 'c' : 'a', place: true, how: `照日志地点手打「去${place}」${shownPlace ? '' : '（日志未显示该地点）'}` };
}

/**
 * 执行一手。返回 { via: 'a'|'b'|'c'|'d', how, prep?, failed? }；prep＝去任务地点的预备手（不与 walker 对照）。
 * 优先级：界面上已出现的卡／分支／按钮（b）→ 手打任务日志目标（a，替身判中记 c）→ 人不在任务地点时地图去任务标记（b，prep）。
 */
async function executeMove(page, ui, plan, attempt) {
  const save = ui.save;
  current.judged = null; current.beatCandidates = null; current.intentCandidates = null;
  if (plan.kind === 'stage') {
    const entry = questEntries(save).find(e => e.key.startsWith('departure:'));
    if (!entry) return { failed: '任务日志没有启程条目' };
    const shown = `${entry.title}：${entry.objective}`;
    if (!ui.quest.includes(shown)) return { failed: `界面任务日志未显示启程条目「${shown}」：${JSON.stringify(ui.quest)}` };
    const pending = save.系统?.扩展?.stageDepartureMap;
    if (pending?.mapTargetId && attempt > 0) {
      const r = await mapTravel(page, pending.mapTargetId, ui);
      return r.ok ? { via: 'b', how: `跨国启程：地图点选 ${r.name}` } : { failed: `跨国启程地图点选失败：${r.why}` };
    }
    await typeSend(page, entry.objective, ui);
    const after = await readUi(page);
    // 跨国启程：手打后只记下待启程目标（stageDepartureMap），下一手在地图点选；这一手是预备手，不与 walker（一步切关）对照。
    const cross = rt(after.save).modId === rt(save).modId && after.save.系统?.扩展?.stageDepartureMap?.mapTargetId;
    return { via: current.judged ? 'c' : 'a', how: `手打启程目标「${entry.objective}」${cross ? '（跨国：转地图点选）' : ''}`, prep: Boolean(cross) };
  }
  if (plan.kind === 'wait') {
    await typeSend(page, NEUTRAL, ui);
    return { via: 'd', how: `中性推进「${NEUTRAL}」` };
  }
  if (plan.kind === 'opportunity' || plan.kind === 'opportunity:s02_01') {
    const label = plan.choice.label;
    const btn = page.locator('.engine-action-options button.engine-action-btn').filter({ hasText: label });
    if (await btn.count()) { await clickSend(page, btn.first(), ui); return { via: 'b', how: `机会按钮「${label}」` }; }
    // 先在右栏机会卡上点「追踪此机会」。
    const opp = save.世界.状态.剧本模组.events.find(e => e.id === plan.focus)?.worldActor?.opportunities?.find(o => o.id === plan.opportunityId);
    const card = page.locator('.right-sidebar .actor-card').filter({ hasText: opp?.title || '\u0000' });
    if (opp && await card.count() && !(await card.locator('button').first().isDisabled())) {
      await card.locator('button').first().click();
      await page.waitForTimeout(500);
      const b2 = page.locator('.engine-action-options button.engine-action-btn').filter({ hasText: label });
      if (await b2.count()) { await clickSend(page, b2.first(), ui); return { via: 'b', how: `追踪机会「${opp.title}」→ 机会按钮「${label}」` }; }
      return { failed: `追踪机会「${opp.title}」后主面板没有机会按钮「${label}」`, prep: true };
    }
    // 没有可点的卡：照任务日志手打，看理想模型能否判中。
    const main = questEntries(save)[0];
    if (main && attempt < 2) { await typeSend(page, main.objective, ui); return { via: current.judged ? 'c' : 'a', how: `无机会卡／按钮，手打任务目标「${main.objective}」` }; }
    return { failed: `没有机会卡「${opp?.title ?? plan.opportunityId}」也没有机会按钮「${label}」` };
  }
  if (plan.kind === 'local:s02_04') {
    const btn = page.locator('.engine-action-options button.engine-action-btn').filter({ hasText: plan.local.label });
    if (await btn.count()) { await clickSend(page, btn.first(), ui); return { via: 'b', how: `地方按钮「${plan.local.label}」` }; }
    const main = questEntries(save)[0];
    if (main && attempt < 2) { await typeSend(page, main.objective, ui); return { via: current.judged ? 'c' : 'a', how: `无地方按钮，手打任务目标「${main.objective}」` }; }
    return { failed: `主面板没有地方按钮「${plan.local.label}」` };
  }
  if (plan.kind === 'action') {
    const { action } = plan;
    // 关键拍卡。
    const card = page.locator('[data-testid="key-beat-option"]').filter({ hasText: action.label });
    if (ui.keyBeat.length) {
      if (await card.count()) { await card.first().click(); await settle(page, ui); return { via: 'b', how: `关键拍卡「${action.label}」` }; }
    }
    // 分支选择。
    if (ui.branch.length) {
      const decision = branchOf(save);
      const index = decision?.options.findIndex(o => o.eventId === action.eventId && o.actionId === action.actionId) ?? -1;
      if (index >= 0) {
        const label = decision.labels[index];
        await page.locator('[data-testid="branch-decision-option"]').filter({ hasText: label }).first().click();
        await page.waitForTimeout(150);
        const send = page.locator('.send-button');
        if (!(await send.isDisabled())) await send.click();
        await settle(page, ui);
        return { via: 'b', how: `分支选项「${label}」` };
      }
      return { failed: `界面在分支选择（${JSON.stringify(ui.branch)}），walker 要走的 ${action.actionId} 不在其中` };
    }
    if (action.actionId.startsWith('travel:')) {
      const marker = markerOf(save, plan.focus);
      const r = await goTo(page, ui, marker, attempt, plan.focus);
      if (r) return { ...r, how: `${r.how}（walker：${action.actionId}）` };
      const main = questEntries(save)[0];
      if (main) { await typeSend(page, main.objective, ui); return { via: current.judged ? 'c' : 'a', how: `手打任务目标「${main.objective}」（walker：${action.actionId}）` }; }
      return { failed: `walker 走 ${action.actionId}，界面无入口` };
    }
    const gate = QL.questActionGate(save, action);
    const entry = questEntries(save).find(e => e.eventId === action.eventId) || questEntries(save)[0];
    if (!gate.ok && attempt % 2 === 0) {
      // 人不在任务地点（或要见的人不在场）：去任务标记。
      const marker = markerOf(save, action.eventId);
      if (marker && !QL.atLocation(save.角色.位置?.locationId, marker.locationId)) {
        const r = await goTo(page, ui, marker, attempt / 2, action.eventId);
        if (r) return { ...r, how: `去任务地点：${r.how}`, prep: true };
      }
    }
    if (!entry) return { failed: '任务日志没有当前目标' };
    const shown = `${entry.title}：${entry.objective}`;
    if (!ui.quest.includes(shown)) return { failed: `界面任务日志未显示「${shown}」：${JSON.stringify(ui.quest)}` };
    await typeSend(page, entry.objective, ui);
    return { via: current.judged ? 'c' : 'a', how: `手打任务目标「${entry.objective}」${gate.ok ? '' : `（闸门 where=${gate.where} who=${gate.who}）`}` };
  }
  return { failed: `未知计划 ${plan.kind}` };
}

/** 场面卡在场时的一手：继续收束／确认选择／确认并掷骰（b），否则照场面简报里的本场目标描述打法（替身识别，记 c）。 */
async function sceneMove(page, ui, ctx) {
  const card = page.locator('section.scene-encounter');
  for (const label of ['继续收束（不再掷骰）', '确认选择', '确认并掷骰']) {
    const btn = card.locator('button', { hasText: label });
    if (await btn.count() && !(await btn.first().isDisabled())) {
      await btn.first().click(); await settle(page, ui);
      // 这一手的目标已推到头（对方那一路已全倒／已到上限）还没收场：下一手换一个目标（如改去救人、封出口），不在同一个目标上空转。
      if (label === '确认并掷骰' && /未能推进（已到你能推到的上限）/.test(await page.locator('.narrative-text').first().innerText().catch(() => ''))) ctx.combo++;
      return { via: 'b', how: `场面「${label}」`, scene: true };
    }
  }
  const goal = ((await card.locator('pre').innerText().catch(() => '')).split('\n')[0] || '').trim();
  const line = goal ? `我要${goal}` : '我全力出手，逼退眼前的敌人';
  current.judged = null; current.sceneCombo = ctx.combo;
  await typeSend(page, line, ui);
  const a = (await readUi(page)).save.系统?.扩展?.场面模块?.active;
  if (a && !a.pending && !a.choice) ctx.combo++; // 被退回：下一手理想识别器换一种合法理解
  return { via: current.judged ? 'c' : 'a', how: `场面打法「${line}」${current.judged ? `（识别：${current.judged}）` : '（未发识别请求）'}`, scene: true };
}
const sceneCardText = page => page.locator('section.scene-encounter').innerText().then(t => t.replace(/\s+/g, ' ').slice(0, 300)).catch(() => '');

/** 判定卡（确认并掷骰）出现就确认。 */
async function confirmJudgement(page) {
  const btn = page.locator('.judgement-preflight-card button', { hasText: '确认并掷骰' });
  if (!(await btn.count())) return false;
  const ui = await readUi(page);
  await btn.first().click();
  await settle(page, ui);
  return true;
}

// ───────────── 起点 ─────────────
async function realOpening(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('入六朝', { exact: true }).first().click();
  await page.getByText('开启仙途', { exact: true }).first().waitFor({ timeout: 20_000 });
  await page.getByText('开启仙途', { exact: true }).first().click();
  await page.locator('textarea.game-input').waitFor({ timeout: 90_000 });
  await page.waitForFunction(expr => { const s = eval(expr)._s; return !s.get('ui').isAIProcessing && s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId; }, PINIA, { timeout: 60_000 });
  await page.waitForTimeout(800);
  return page.evaluate(expr => eval(expr)._s.get('characterV3').rootState.当前激活存档.角色ID, PINIA);
}
async function nodeStartAt(stageId) {
  return withFixedHost(async () => quiet(async () => {
    let save = formalNewSave(MODS.find(m => m.manifest.id === START));
    for (let n = 0; rt(save).modId !== stageId; n++) {
      assert.ok(n < 5000, `Node 侧推不到 ${stageId}`);
      save = step(save, MODS, n).save;
    }
    return save;
  }));
}

/** 用 walker 在 base 上推到进度变化为止，再导入浏览器接着跑。 */
async function resumeFrom(page, charId, base, name, until) {
  let pushed = base;
  const k0 = keyOf(progressOf(base));
  const done = s2 => until ? until(s2) : keyOf(progressOf(s2)) !== k0;
  const limit = until ? 600 : 30;
  for (let n = 0; n < limit && !done(pushed); n++) {
    const r = nodeStep(pushed, 100000 + n);
    if (!r.save) return { ok: false, how: `walker 推不过：${r.error}` };
    pushed = r.save;
  }
  if (!done(pushed)) return { ok: false, how: `walker ${limit} 步内也推不过` };
  await importAndLoad(page, charId, { 存档名: `长跑-${name}`, 存档数据: JSON.parse(JSON.stringify(pushed)) });
  return { ok: true, how: `walker 推过后重新导入（${QL.questBeatKey(pushed) || rt(pushed).modId}）` };
}

// ───────────── 秦线模式：入秦与返回（b，界面真实入口） ─────────────
const XIANYANG = ENTRY.locationId;
const squash = text => String(text || '').replace(/\s+/g, '');
const resumeOf = save => { const r = save?.系统?.扩展?.mapEntryResume; return r ? { modId: r.runtime?.modId ?? null, position: r.position ?? null } : null; };
const qin = { entry: null, ret: null, reenter: null, checks: [], moves: [] };
const qinCheck = (ok, what) => { qin.checks.push({ ok: !!ok, what }); return !!ok; };
/** 返回按钮文字的固定前缀（包文案 {stage} 之前那段）：rail 未走完时主面板不应出现。 */
const QIN_RETURN_PREFIX = squash(NM.stripNarrativeMetaWords(P.packText(ENTRY.returnLabelTextId))).split('{stage}')[0].slice(0, 6);
const returnButtons = page => page.locator('.action-options button.action-option-btn').filter({ hasText: QIN_RETURN_PREFIX }).count();
/** 地图点咸阳 →「前往此地」→「确认前往」；与 Node 侧 selectMapTravel + settleMapTravel 对照。 */
async function qinEnter(page, ui) {
  const preview = MT.mapTravelPreview(ui.save, XIANYANG);
  const exp = clone(ui.save);
  const selection = MT.selectMapTravel(exp, XIANYANG);
  const nodeOk = !!selection && quietSync(() => MT.settleMapTravel(exp, selection));
  qinCheck(preview && nodeOk, `Node 侧：${QIN_DEP} 上应有去咸阳的入口行程并能落账`);
  const opened = await openMapLocationPopup(page, XIANYANG);
  if (!qinCheck(opened, `地图上应画出并点中咸阳（${XIANYANG}）`)) return { failed: '地图上点不中咸阳' };
  const text = squash(await opened.popup.innerText());
  qinCheck(preview && text.includes(squash(preview.label)), `咸阳弹窗应显示入口行程「${preview?.label}」`);
  const go = opened.popup.locator('button.enter-region-btn', { hasText: '前往此地' });
  if (!qinCheck(await go.count() && !(await go.isDisabled()), '「前往此地」应可点')) return { failed: `「前往此地」不可点：${text.slice(0, 160)}` };
  await go.click();
  const confirm = opened.popup.locator('button.enter-region-btn', { hasText: '确认前往' });
  if (!qinCheck(await confirm.count(), '应出「确认前往」')) return { failed: '无「确认前往」' };
  await confirm.click();
  await page.waitForFunction(({ expr, next }) => eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId === next, { expr: PINIA, next: QIN_STAGE }, { timeout: 20_000 }).catch(() => null);
  await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 60_000 });
  await page.waitForTimeout(600);
  await ensureGamePage(page);
  const after = (await readUi(page)).save;
  qinCheck(rt(after).modId === QIN_STAGE, `应进入秦关（实为 ${rt(after).modId}）`);
  const d = nodeOk ? diffOf(progressOf(after), progressOf(exp)) : null;
  qinCheck(!d, `入秦后与 Node 侧一致：${JSON.stringify(d)}`);
  qinCheck(JSON.stringify(resumeOf(after)) === JSON.stringify(resumeOf(exp)) && resumeOf(after)?.modId === QIN_DEP
    && JSON.stringify(resumeOf(after)?.position) === JSON.stringify(ui.save.角色.位置), `mapEntryResume 应记出发关 ${QIN_DEP} 与入秦前位置：${JSON.stringify(resumeOf(after))}`);
  qinCheck(R.getScenarioFocusEvent(rt(after))?.id === R.getScenarioFocusEvent(rt(exp))?.id, `入秦后焦点与 Node 一致（${R.getScenarioFocusEvent(rt(after))?.id} / ${R.getScenarioFocusEvent(rt(exp))?.id}）`);
  qin.entry = { preview: preview?.label, focus: R.getScenarioFocusEvent(rt(after))?.id ?? null, resume: resumeOf(after), diff: d };
  return { via: 'b', how: `地图点咸阳（${preview?.label}）→「前往此地」→「确认前往」` };
}
/** rail 走完后点主面板返回按钮；与 Node 侧 transitionFromMapEntryStage 对照；返回后再开咸阳弹窗看入口是否已关。 */
async function qinReturn(page) {
  await ensureGamePage(page);
  await page.waitForTimeout(500);
  const ui = await readUi(page), save = ui.save;
  const offer = RET.getMapEntryReturnOffer(save);
  const resume = resumeOf(save);
  qinCheck(unsettledRailBeats(rt(save))?.length === 0, `返回前秦关 rail 应全部结算：${JSON.stringify(unsettledRailBeats(rt(save)))}`);
  if (!qinCheck(offer, 'Node 侧：rail 走完后应有返回报价')) return;
  const label = squash(NM.stripNarrativeMetaWords(offer.label));
  const nodeRes = await quiet(async () => I.transitionFromMapEntryStage(clone(save), [...MODS, ...P.CONTENT_PACKS.stages]));
  qinCheck(nodeRes.ok && nodeRes.to === resume?.modId, `Node 侧返回应落在 mapEntryResume 的出发关：${nodeRes.reason || nodeRes.to}`);
  const button = page.locator('.action-options button.action-option-btn').filter({ hasText: label.slice(0, 6) });
  const n = await button.count();
  qin.ret = { label, resume, buttons: n };
  if (!qinCheck(n === 1, `主面板应有一个返回按钮「${label}」（实有 ${n}）`)) { qin.ret.ui = uiSummary(ui); return; }
  qinCheck(squash(await button.innerText()) === label, `返回按钮文字＝「${label}」`);
  await button.click();
  await page.waitForFunction(({ expr, next }) => eval(expr)._s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId === next, { expr: PINIA, next: resume.modId }, { timeout: 20_000 }).catch(() => null);
  await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: 60_000 });
  await page.waitForTimeout(600);
  const ui2 = await readUi(page), after = ui2.save;
  qinCheck(rt(after).modId === resume.modId, `回到的关＝mapEntryResume 记录 ${resume.modId}（实为 ${rt(after).modId}）`);
  qinCheck(JSON.stringify(after.角色.位置) === JSON.stringify(resume.position), `回到的位置＝mapEntryResume 记录：${JSON.stringify(after.角色.位置)} / ${JSON.stringify(resume.position)}`);
  qinCheck(resumeOf(after) === null, '返回后 mapEntryResume 应清掉');
  if (nodeRes.ok) {
    const exp = nodeRes.saveData, d = diffOf(progressOf(after), progressOf(exp));
    qin.ret.diff = d;
    qinCheck(!d, `返回后进度与 Node 一致：${JSON.stringify(d)}`);
    const focus = R.getScenarioFocusEvent(rt(after))?.id ?? null, nodeFocus = R.getScenarioFocusEvent(rt(exp))?.id ?? null;
    qinCheck(focus === nodeFocus, `返回后主链当前拍（焦点）与 Node 一致：${focus} / ${nodeFocus}`);
    qinCheck(QL.questBeatKey(after) === QL.questBeatKey(exp), `返回后任务日志当前拍与 Node 一致：${QL.questBeatKey(after)} / ${QL.questBeatKey(exp)}`);
    const main = questEntries(exp)[0], shown = main ? `${main.title}：${main.objective}` : null;
    qinCheck(shown && ui2.quest.includes(shown), `返回后界面任务日志应显示「${shown}」：${JSON.stringify(ui2.quest)}`);
    qinCheck(planLabel(planOf(after)) === planLabel(planOf(exp)), `返回后 walker 下一步一致：${planLabel(planOf(after))} / ${planLabel(planOf(exp))}`);
    qin.ret.focus = focus; qin.ret.quest = shown;
  }
  qinCheck(await page.locator('.action-options button.action-option-btn').filter({ hasText: label.slice(0, 6) }).count() === 0, '返回后不应再有返回按钮');
  qinCheck(ui2.lcq.length === 0, `返回后不应弹 LCQ 报错码：${JSON.stringify(ui2.lcq)}`);
  // rail 以外的入口：返回后入口只开一次——地图咸阳弹窗不应再有入秦行程（Node 侧同：mapTravelPreview 为空）。
  const nodePreview = MT.mapTravelPreview(after, XIANYANG) ?? null;
  const opened = await openMapLocationPopup(page, XIANYANG);
  const text = opened ? squash(await opened.popup.innerText()) : null;
  qin.reenter = { nodePreview: nodePreview?.label ?? null, popupShown: !!opened, popupHasEntry: text ? text.includes(squash(qin.entry?.preview)) : null };
  qinCheck(nodePreview === null, `Node 侧：返回后不应再有去咸阳的入口行程：${nodePreview?.label}`);
  qinCheck(opened && !text.includes(squash(qin.entry?.preview)), `返回后咸阳弹窗不应再显示入口行程「${qin.entry?.preview}」：${text?.slice(0, 160)}`);
  const st = (await readUi(page)).save;
  qinCheck(rt(st).modId === resume.modId, '点开咸阳弹窗不应离开出发关');
  await routerPush(page, '/game');
  await ensureGamePage(page);
}

// ───────────── 主循环 ─────────────
const t0 = Date.now();
const stages = [];
const stuck = [];
const diffs = [];
const cOnly = [];
const scenes = [];
const overlays = [];
const anomalies = [];
let moves = 0, outcome = 'running', festival = null, startHow = '';
const enterStage = (id, how) => {
  const row = { id, enterMove: moves, moves: 0, steps: 0, via: { a: 0, b: 0, c: 0, d: 0 }, aPlace: 0, scene: 0, prep: 0, stuck: 0, diffs: 0, enteredBy: how, t: Date.now() };
  stages.push(row);
  return row;
};
const sceneTally = id => { const list = scenes.filter(x => x.stage === id); return list.length ? ` 场面 ${list.map(x => `${x.contract ?? '?'}:${x.outcome ?? '?'}`).join(',')}` : ''; };
const printStage = row => console.log(`[关] ${String(stages.indexOf(row) + 1).padStart(2)} ${row.id.padEnd(36)} 手 ${String(row.moves).padStart(3)}（a ${row.via.a}［其中去地点 ${row.aPlace}］ / b ${row.via.b} / c ${row.via.c} / d ${row.via.d}；预备 ${row.prep}；场面 ${row.scene}）卡点 ${row.stuck} 差异 ${row.diffs}${sceneTally(row.id)}  ${((Date.now() - row.t) / 1000).toFixed(0)}s`);

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let guardRef = null;
const pageErrors = [];
try {
  const { context, guard } = await openSmokeContext(browser, {
    respond, contextOptions: { viewport: { width: 1600, height: 1000 } },
    onRequest: kind => current?.requests.push(kind),
  });
  guardRef = guard;
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`${error.message}`.slice(0, 300)));
  try {
    let charId;
    current = { plan: null, requests: [] };
    if (QIN) {
      charId = await enterIsolatedCharacter(page, baseUrl);
      await importAndLoad(page, charId, QIN_SLOT);
      startHow = `--qin：导入 ${QIN_FIXTURE}（importSave → loadGame），出发关 ${QIN_DEP}`;
    } else if (FROM) {
      charId = await enterIsolatedCharacter(page, baseUrl);
      const save = await nodeStartAt(FROM);
      await importAndLoad(page, charId, { 存档名: `长跑-${FROM}`, 存档数据: JSON.parse(JSON.stringify(save)) });
      startHow = `--from ${FROM}：Node 侧 formalNewSave + walker.step 推到该关开头，importSave → loadGame 导入`;
    } else {
      charId = await realOpening(page);
      startHow = '首页「入六朝」默认设置 →「开启仙途」（开局两步模型请求用替身）';
    }
    assert.ok(charId, '应有激活角色');
    let ui = await readUi(page);
    assert.equal(rt(ui.save).modId, QIN ? QIN_DEP : FROM || START, '起点关');
    assert.deepEqual(ui.lcq, [], '开局后不应弹 LCQ 报错码');
    console.log(`[起点] ${startHow}；${rt(ui.save).modId}，焦点 ${R.getScenarioFocusEvent(rt(ui.save))?.id}`);
    let row = enterStage(rt(ui.save).modId, 'start');
    if (QIN) {
      const r = await qinEnter(page, ui);
      moves++; row.moves++;
      if (r.failed) { outcome = 'qinEntryFailed'; console.log(`[入秦] 失败：${r.failed}`); } else { row.via.b++; console.log(`[入秦] [b] ${r.how}；焦点 ${qin.entry.focus}；mapEntryResume→${qin.entry.resume?.modId}`); }
      ui = await readUi(page);
    }
    let beatKey = null, noProgress = 0, idle = 0, attempt = 0, stepNo = 0, sceneCtx = null, lastPre = null, stageEntry = ui.save;
    for (; outcome === 'running' && moves < MAX_MOVES; moves++) {
      const tm = Date.now();
      ui = await readUi(page);
      const save = ui.save, state = rt(save);
      if (state.modId !== row.id) {
        printStage(row);
        row = enterStage(state.modId, 'transition');
        stageEntry = save;
        if (stages.length > 1 && stages.at(-2).id === UNTIL) { stages.pop(); outcome = 'until'; break; }
      }
      if (QIN && state.modId !== QIN_STAGE) { outcome = 'leftQin'; anomalies.push({ stage: state.modId, move: moves, what: '秦关 rail 未走完就离开了秦关' }); break; }
      if (QIN && RET.getMapEntryReturnOffer(save)) { outcome = 'railDone'; break; }
      if (!QIN && state.modId === FINAL && unsettledRailBeats(state)?.length === 0) { outcome = 'done'; break; }
      if (state.gameOver) { outcome = 'gameOver'; anomalies.push({ stage: state.modId, what: '走到结局（gameOver）', gameOver: state.gameOver }); break; }
      if (ui.lcq.length) { anomalies.push({ stage: state.modId, move: moves, what: 'LCQ 报错码', codes: [...new Set(ui.lcq)] }); await page.evaluate(() => { window.__lcqSeen.length = 0; }); }
      if (ui.judgement) { await confirmJudgement(page); row.moves++; row.via.b++; anomalies.push({ stage: state.modId, move: moves, what: '出现行动判定卡，已点「确认并掷骰」' }); continue; }
      if (ui.scene) {
        // 场面（战斗等）：walker 离线用结构化动作直接结算这一拍，界面上要打完这场。场面中的手不逐手对照，收场后与 walker 从场面前状态推一步比。
        sceneCtx ||= { stage: state.modId, beat: QL.questBeatKey(lastPre || save), startMove: moves, pre: lastPre || save, moves: 0, combo: 0, card: await sceneCardText(page) };
        current = { plan: null, requests: [], judged: null };
        let res;
        try { res = await sceneMove(page, ui, sceneCtx); } catch (error) { res = { via: 'b', how: `场面操作异常：${String(error?.message || error).split('\n')[0].slice(0, 200)}` }; anomalies.push({ stage: state.modId, move: moves, what: '场面操作异常', error: res.how }); }
        row.moves++; row.via[res.via]++; row.scene++; sceneCtx.moves++;
        if (VERBOSE) console.log(`  · 手 ${moves} ${Date.now() - tm}ms [${res.via}] ${res.how}`);
        const after = await readUi(page);
        if (!after.scene) {
          const over = rt(after.save).gameOver;
          const last = after.save.系统?.扩展?.场面模块?.history?.at(-1);
          const rec = { stage: sceneCtx.stage, beat: sceneCtx.beat, contract: last?.contractId ?? null, moves: sceneCtx.moves, outcome: last?.outcome ?? null, ending: over?.endingId ?? null, card: sceneCtx.card };
          scenes.push(rec);
          const expected = nodeStep(sceneCtx.pre, stepNo++);
          if (over) {
            anomalies.push({ stage: sceneCtx.stage, what: '场面打输（随机掷骰）走到结局', endingId: over.endingId, beat: sceneCtx.beat });
            if (STOP_ON_STUCK) { outcome = 'gameOver'; break; }
            rec.resume = await resumeFrom(page, charId, sceneCtx.pre, `场面败-${scenes.length}`);
            if (!rec.resume.ok) { outcome = 'gameOver'; break; }
          } else if (expected.save) {
            const d = diffOf(progressOf(after.save), progressOf(expected.save));
            // 场面打输而未到结局：这一拍在浏览器里不结算、要重来；walker 不打场面、直接按结算走，这种差异记作异常不算分歧。
            if (d && last?.outcome === 'lose') anomalies.push({ stage: sceneCtx.stage, move: moves, beat: sceneCtx.beat, what: '场面打输（随机掷骰），本拍未结算，重来' });
            // 随机遭遇战（combat.random.*）是插进来的一场，不是本拍的场面：打完本拍照旧待做。
            else if (d && String(last?.contractId || '').startsWith('combat.random.')) anomalies.push({ stage: sceneCtx.stage, move: moves, beat: sceneCtx.beat, what: `随机遭遇战插入（${last.outcome}），本拍照旧待做` });
            else if (d) { row.diffs++; diffs.push({ stage: sceneCtx.stage, move: moves, beat: sceneCtx.beat, plan: '场面收场', via: 'scene', diff: d }); }
          }
          sceneCtx = null; beatKey = null; noProgress = 0; idle = 0;
        } else if (sceneCtx.moves >= SCENE_LIMIT) {
          stuck.push({ stage: sceneCtx.stage, beat: sceneCtx.beat, what: `场面 ${SCENE_LIMIT} 手未分胜负`, card: await sceneCardText(page), sceneCandidates: current.sceneCandidates, requests: current.requests, ui: uiSummary(after) });
          row.stuck++;
          console.log(`[卡点] ${sceneCtx.stage} 拍 ${sceneCtx.beat}：场面 ${SCENE_LIMIT} 手未分胜负`);
          if (STOP_ON_STUCK) { outcome = 'stuck'; break; }
          const r = await resumeFrom(page, charId, sceneCtx.pre, `场面卡-${stuck.length}`);
          stuck.at(-1).resume = r.how;
          if (!r.ok) { outcome = 'stuck'; break; }
          sceneCtx = null; beatKey = null;
        }
        continue;
      }
      const plan = planOf(save);
      lastPre = save;
      const bk = `${state.modId}|${QL.questBeatKey(save)}|${plan.kind}|${planLabel(plan)}`;
      if (bk !== beatKey) { beatKey = bk; noProgress = 0; idle = 0; attempt = 0; }
      current = { plan, requests: [], judged: null };
      const expected = nodeStep(save, stepNo);
      const before = progressOf(save);
      let res;
      try { res = await executeMove(page, ui, plan, attempt); } catch (error) {
        res = { failed: `界面操作异常：${String(error?.message || error).split('\n')[0].slice(0, 200)}` };
        anomalies.push({ stage: state.modId, move: moves, what: '界面操作异常', error: res.failed });
        if (await page.locator('.action-config-overlay').count()) await page.locator('.action-config-overlay button.cancel-btn').click().catch(() => {});
        await ensureGamePage(page).catch(() => {});
      }
      attempt++;
      row.moves++;
      const after = await readUi(page);
      const got = progressOf(after.save);
      const moved = keyOf(got) !== keyOf(before);
      if (res.failed) {
        if (VERBOSE) console.log(`  · 手 ${moves} ${planLabel(plan)}：入口失败 ${res.failed}`);
      } else {
        row.via[res.via]++;
        if (res.prep) row.prep++;
        if (res.place && res.via === 'a') row.aPlace++;
        if (VERBOSE) console.log(`  · 手 ${moves} ${Date.now() - tm}ms [${res.via}] ${res.how} → ${moved ? '推进' : '未推进'}${current.beatCandidates ? ` 判定候选 ${JSON.stringify(current.beatCandidates)}` : ''}`);
      }
      const nodeMoved = expected.save ? keyOf(progressOf(expected.save)) !== keyOf(before) : null;
      if (QIN && rt(after.save).modId === QIN_STAGE && !RET.getMapEntryReturnOffer(after.save)) {
        const n = await returnButtons(page);
        (qin.railMid ||= { moves: 0, early: [] }).moves++;
        if (n) qin.railMid.early.push(QL.questBeatKey(after.save));
      }
      if (QIN) qin.moves.push({ move: moves, beat: QL.questBeatKey(save), plan: planLabel(plan), via: res.via ?? null, how: res.failed || res.how, moved, nodeMoved, requests: [...current.requests], judged: current.judged });
      if (after.scene && !res.failed) { if (VERBOSE) console.log(`  · 手 ${moves} 进入场面：${await sceneCardText(page)}`); continue; }
      if (!res.failed && !res.prep) {
        // 与 walker 对照（walker 也推了一步）。
        row.steps++; stepNo++;
        if (expected.save) {
          const d = diffOf(got, progressOf(expected.save));
          if (d) { row.diffs++; diffs.push({ stage: state.modId, move: moves, beat: QL.questBeatKey(save), plan: planLabel(plan), via: res.via, how: res.how, diff: d }); }
        } else diffs.push({ stage: state.modId, move: moves, plan: planLabel(plan), nodeError: expected.error });
        if (moved && res.via === 'c') cOnly.push({ stage: state.modId, beat: QL.questBeatKey(save), action: planLabel(plan), typed: res.how, candidates: current.beatCandidates || current.intentCandidates });
      }
      if (moved) { noProgress = 0; idle = 0; attempt = 0; continue; }
      // walker 这一步本来也不推进（等时间的拍）：不算卡，但同一拍空等超过 IDLE_LIMIT 手也停。
      if (nodeMoved === false && !res.failed && !res.prep && ++idle < IDLE_LIMIT) continue;
      if (idle < IDLE_LIMIT && ++noProgress < STALL) continue;
      // 卡住：记下，再用 walker 推过这一拍。
      const rec = { stage: state.modId, beat: QL.questBeatKey(save), focus: R.getScenarioFocusEvent(state)?.id ?? null, walker: { kind: plan.kind, action: planLabel(plan) },
        questLog: questEntries(save).map(e => `${e.title}：${e.objective}${e.place ? `（地点：${e.place}）` : ''}`), location: save.角色.位置?.locationId,
        gate: plan.kind === 'action' ? QL.questActionGate(save, plan.action) : null, ui: uiSummary(after), lastEntry: res.failed || res.how,
        beatCandidates: current.beatCandidates, intentCandidates: current.intentCandidates, requests: current.requests };
      stuck.push(rec);
      row.stuck++;
      // 调试：SMOKE_FULL_CHAIN_DUMP＝目录时把卡点前的浏览器存档写出来（默认不写盘）。
      if (process.env.SMOKE_FULL_CHAIN_DUMP) writeFileSync(`${process.env.SMOKE_FULL_CHAIN_DUMP}/stuck-${stuck.length}.json`, JSON.stringify(save));
      console.log(`[卡点] ${rec.stage} 拍 ${rec.beat}：walker 要走 ${rec.walker.action}；最后一手 ${rec.lastEntry}`);
      if (STOP_ON_STUCK) { outcome = 'stuck'; break; }
      let r = await resumeFrom(page, charId, save, `续-${stuck.length}`);
      if (!r.ok) {
        // 卡点状态本身是死路（walker 也推不动）：从本关入关时的浏览器存档，用 walker 推过这一拍。
        const first = r.how;
        r = await resumeFrom(page, charId, stageEntry, `续-${stuck.length}`, s2 => rt(s2).modId !== state.modId || rt(s2).completedEventIds.includes(rec.focus) || (rt(s2).offscreenResolvedEventIds || []).includes(rec.focus));
        r.how = `${first}；改从本关入关存档：${r.how}`;
        if (!r.ok && !QIN) {
          // 入关存档已带着前面场面的败局旗标等：改用 Node 侧 walker 从开局造到本关开头（同 --from），再推过这一拍。
          const second = r.how;
          r = await resumeFrom(page, charId, await nodeStartAt(state.modId), `续-${stuck.length}`, s2 => rt(s2).modId !== state.modId || rt(s2).completedEventIds.includes(rec.focus) || (rt(s2).offscreenResolvedEventIds || []).includes(rec.focus));
          r.how = `${second}；改用 walker 造本关开头档：${r.how}（此后浏览器状态是 walker 路线，前面场面的胜负分支不再带入）`;
        }
      }
      rec.resume = r.how;
      if (!r.ok) { outcome = 'stuck'; break; }
      beatKey = null; idle = 0; noProgress = 0;
    }
    if (outcome === 'running') outcome = 'limit';
    if (outcome !== 'until') printStage(row);

    // 秦线：rail 走完 → 点返回。
    if (QIN) qinCheck(qin.railMid?.moves > 0 && !qin.railMid.early.length, `rail 未走完的 ${qin.railMid?.moves ?? 0} 手里主面板均无返回按钮（出现于：${JSON.stringify(qin.railMid?.early ?? [])}）`);
    if (QIN && outcome === 'railDone') {
      const back = enterStage(QIN_DEP, 'return');
      await qinReturn(page);
      moves++; back.moves++; back.via.b++;
      const st = (await readUi(page)).save;
      if (rt(st).modId !== QIN_DEP) back.id = rt(st).modId;
      printStage(back);
      console.log(`[返回] [b] 点「${qin.ret?.label}」→ ${rt(st).modId}；焦点 ${qin.ret?.focus}；任务日志 ${qin.ret?.quest}；再开咸阳弹窗 ${JSON.stringify(qin.reenter)}`);
    }

    // 终关：「开启大祭」。
    if (outcome === 'done') {
      await ensureGamePage(page);
      await page.waitForTimeout(500);
      const ui1 = await readUi(page);
      const view = F.festivalView(ui1.save);
      const btn = ui1.festival.find(b => b.text === F.FESTIVAL.label);
      festival = { available: view.available, blocked: view.blocked, button: btn ?? null };
      if (btn && !btn.disabled) {
        await page.locator('.right-sidebar .quest-section button.quest-next-btn', { hasText: F.FESTIVAL.label }).click();
        await page.waitForFunction(expr => eval(expr)._s.get('gameState').toSaveData()?.系统?.扩展?.festivalStarted === true, PINIA, { timeout: 15_000 }).catch(() => null);
        await page.waitForTimeout(500);
        const ui2 = await readUi(page);
        festival.started = ui2.save.系统?.扩展?.festivalStarted === true;
        festival.eventDone = rt(ui2.save).completedEventIds.includes(F.FESTIVAL.eventId);
        festival.buttonAfter = ui2.festival.some(b => b.text === F.FESTIVAL.label);
        festival.lcq = ui2.lcq;
      }
    }
    guard.finish();
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

// ───────────── 汇总与断言 ─────────────
const ms = Date.now() - t0;
const total = stages.reduce((acc, s) => { for (const k of 'abcd') acc[k] += s.via[k]; acc.moves += s.moves; acc.prep += s.prep; return acc; }, { a: 0, b: 0, c: 0, d: 0, moves: 0, prep: 0 });
const result = { baseUrl, qin: QIN ? qin : undefined, from: FROM, until: UNTIL, startHow, outcome, ms, stall: STALL, expectedStages: EXPECTED_STAGES, visited: stages.map(s => s.id), stages, total, stuck, diffs, cOnly, scenes, overlays, anomalies, festival, pageErrors };
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
if (overlays.length) console.log(`[弹窗] ${JSON.stringify(overlays)}`);
console.log(`[合计] ${stages.length} 关，${total.moves} 手（a ${total.a} / b ${total.b} / c ${total.c} / d ${total.d}；预备 ${total.prep}），卡点 ${stuck.length}，与 walker 差异 ${diffs.length}，用时 ${(ms / 60000).toFixed(1)} 分钟，结局 ${outcome}`);
if (festival) console.log(`[大祭] ${JSON.stringify(festival)}`);
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };
check((QIN ? ['railDone'] : ['done', 'until']).includes(outcome), `未走完：outcome=${outcome}`);
if (QIN) for (const c of qin.checks) { if (!c.ok) failures.push(`秦线：${c.what}`); }
if (QIN) check(qin.ret && qin.reenter, '秦线：返回与返回后检查应已执行');
check(JSON.stringify(stages.map(s => s.id)) === JSON.stringify(EXPECTED_STAGES), `途经关序列不等于默认主链：${JSON.stringify(stages.map(s => s.id))}`);
check(stuck.length === 0, `有 ${stuck.length} 处卡点`);
// 与 walker 的差异：落在卡点那一拍上的算卡点的表现；其余差异判失败。
const unexplained = diffs.filter(d => !stuck.some(x => x.stage === d.stage && x.beat === d.beat));
check(unexplained.length === 0, `有 ${unexplained.length} 处与 walker 的差异不能用卡点解释：${JSON.stringify(unexplained.slice(0, 3))}`);
check(pageErrors.length === 0, `控制台未捕获异常：${pageErrors.slice(0, 3).join(' / ')}`);
check(!anomalies.some(a => a.what === 'LCQ 报错码'), `出现 LCQ 报错码：${JSON.stringify(anomalies.filter(a => a.what === 'LCQ 报错码').flatMap(a => a.codes))}`);
if (!QIN && LAST === FINAL) {
  check(festival?.available && !festival.blocked && festival.button && !festival.button.disabled, `终关「${F.FESTIVAL.label}」应可点：${JSON.stringify(festival)}`);
  check(festival?.started === true && festival?.eventDone === true && festival?.buttonAfter === false, `「${F.FESTIVAL.label}」应生效：${JSON.stringify(festival)}`);
}
for (const f of failures) console.log(`FAIL ${f}`);
if (QIN) console.log(`[秦线检查] ${qin.checks.filter(c => c.ok).length}/${qin.checks.length} 通过`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} smoke-full-chain${QIN ? '（--qin）' : ''}：${stages.length}/${EXPECTED_STAGES.length} 关，卡点 ${stuck.length}`);
process.exit(failures.length ? 1 : 0);
