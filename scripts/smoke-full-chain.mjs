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
// --side：主链长跑途中把非主线拍也在界面里做掉（盘点与读法见 scripts/sideLineInventory.mjs）。每一手之前先看这份浏览器状态上有没有「此刻可做」的线拍
//   （R.getCurrentStoryExplorationActions 里出现 questLines 拍的 eventId；人物线＝lines-*.json 的 character 线、支线＝side 线，含碧鲮海藻丝常驻入口）：
//   有就先做（每拍取第一个非「.defer 略过」动作；同一动作最多试 2 手），入口优先级同主链：人物线拍点右栏「这一拍谁有戏」展开的「回应：…」按钮再发送（b）；
//   支线拍任务模式下没有按钮（探索按钮被撤、「可投的门路」默认隐藏），照动作原句手打，意图判定由替身选该动作（c）。
//   做完与 Node 侧对照：同一份（手前、advanceScenarioRuntime 后）状态上 recordStoryEventStructuredAction 同一动作＋片刻 settleActionTime＋advance，
//   比拍回执、准备步、主线进度（progressOf）、线主人好感、任务日志条目、右栏人物行是否收起；不一致记差异判失败。然后照常走主链。
//   另外每到一个焦点挂了人物任务／高光（character-beats.json）的主线事件，查右栏「这一拍谁有戏」是否出「名字——」行；每关第一手查当前线卡（线名、「别处还有事（N）」）与 Node lineCompassView 一致。
//   --side 不能与 --qin 同用；可与 --from／--until 同用（分段开发）。
//   默认不进 e2e:smoke（耗时长），聚合里加 --with-long 才跑。
// --real：真实模型模式（默认关；不加时行为不变）。chat/completions 与 embeddings 不替身，网络护栏只额外放行 api.minimaxi.com、api.siliconflow.cn；
//   API 配置由页面自己从测试服读（save-storage 只放行 GET …/user_config_api_management_v1，其余照旧 501；脚本不读、不打印任何密钥，日志 URL 不带查询串）。
//   每手照旧由 walker 定；原先「手打后由替身判定」的手改打该动作的玩家原句（playerLine／actionText，能本地对上就不靠模型判），对不上才交给真实判拍请求。
//   每手只比进度字段（关、已完成拍、激活拍、切关就绪、结局）；位置变化只在预备手（去任务地点）上算推进。卡点记录加本手打字、正文前 200 字、位置、任务日志目标与地点、本手模型请求数。
//   统计每手耗时、每手模型请求数（chat／embeddings）、主叙事请求耗时、「已替换为安全叙述」与「行动没能识别」次数，写进 --json 的 real 段与汇总。
//   --real 可与 --qin／--side 同用（2026-11-13 各在 8092 上实跑过一次）。
// --real-loose（须与 --real 同用）：每拍第一次手打时在玩家原句前加「这一步，」，让它不再与原句逐字相等——游戏本地对不上就会发真实判拍请求；
//   第一次没推进，同一拍之后的手改回原句。汇总里报「改写手」的推进数与其中发了判拍请求的手数。
// --real-naive（须与 --real 同用）：Q20 探测。walker 这一手要先去某地（travel:）时，第一次不去，改为照任务日志目标原文打字——
//   模拟「人还没到本拍地点就照日志打字」；没推进则同一拍之后照常先去地点。汇总里报探测手数与其中正文请求数、手后位置是否变了。
// --max-hands N：到 N 手即停，照常收尾出报告（outcome=maxHands，不算未走完）。
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
const STOP_ON_STUCK = bool('--stop-on-stuck'), VERBOSE = bool('--verbose'), QIN = bool('--qin'), SIDE = bool('--side');
const REAL = bool('--real'), LOOSE = bool('--real-loose'), NAIVE = bool('--real-naive'), MAX_HANDS_ARG = opt('--max-hands'), MAX_HANDS = MAX_HANDS_ARG === null ? null : Number(MAX_HANDS_ARG);
const baseUrl = args[0];
assert.ok(baseUrl, '缺少站点 URL：node scripts/smoke-full-chain.mjs http://127.0.0.1:端口/');
assert.ok(Number.isInteger(STALL) && STALL > 0, '--stall 须为正整数');

assert.ok(!(QIN && (FROM || UNTIL)), '--qin 不能与 --from／--until 同用');
assert.ok(!(QIN && SIDE), '--side 不能与 --qin 同用');
assert.ok(!LOOSE || REAL, '--real-loose 须与 --real 同用');
assert.ok(!NAIVE || REAL, '--real-naive 须与 --real 同用');
assert.ok(MAX_HANDS === null || (Number.isInteger(MAX_HANDS) && MAX_HANDS > 0), '--max-hands 须为正整数');
// 真实模型一手可能要几十秒到几分钟（主叙事＋判拍＋后台整理）：等待上限放宽。
const WAIT_MS = REAL ? 300_000 : 60_000;
// --side 才加载（主链／秦线模式不受影响）。
const SL = SIDE ? await quiet(() => import('./sideLineInventory.mjs')) : null;
const TM = SIDE ? await quiet(() => loadTs('../src/modules/scenarioMods/actionTime.ts')) : null;
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
const targetIdOf = plan => plan.kind === 'action' || plan.kind === 'side' ? plan.action.actionId : plan.kind === 'local:s02_04' ? plan.local.identityId
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
/** 真实模式下手打的句子：动作有玩家原句（playerLine／actionText）就打原句（游戏能本地对上，不靠模型判），否则照旧打任务日志目标。 */
let looseAttempt = 0;
const lineOf = (selection, fallback) => {
  if (!REAL) return fallback;
  const line = selection?.playerLine || selection?.actionText || fallback;
  if (!LOOSE || looseAttempt > 0) return line;
  if (current) current.loose = true;
  return `这一步，${line}`;
};
/** 真实模式的推进口径：只看进度字段（关、已完成拍、激活拍、切关就绪、结局）。 */
const realKeyOf = p => JSON.stringify([p.modId, p.completed, p.active, p.ready, p.gameOver]);
function diffOf(a, b) {
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'location' || k === 'attempts' || (REAL && k === 'offscreen') || JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
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
    narrative200: (document.querySelector('.narrative-text')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
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
async function settle(page, before, timeout = WAIT_MS) {
  await page.waitForFunction(({ expr, seq, key }) => {
    const stores = eval(expr)._s;
    if (stores.get('ui').isAIProcessing) return false;
    const save = stores.get('gameState').toSaveData();
    const rt = save?.世界?.状态?.剧本模组 || {}, a = save?.系统?.扩展?.场面模块?.active;
    const seqNow = Number(document.querySelector('[data-testid="turn-status"]')?.dataset.turnSeq || 0);
    return seqNow !== seq || `${rt.modId}|${(rt.completedEventIds || []).length}|${rt.nextStageReadyId || ''}|${(rt.activeEventIds || []).join(',')}|${save?.系统?.历史?.叙事?.length ?? 0}|${a ? `${a.state?.beat}/${!!a.pending}/${!!a.choice}/${a.state?.status}/${a.notice || ''}` : ''}` !== key;
  }, { expr: PINIA, seq: before.seq, key: shortKey(before.save) }, { timeout, polling: 200 }).catch(() => null);
  await page.waitForFunction(expr => !eval(expr)._s.get('ui').isAIProcessing, PINIA, { timeout: WAIT_MS });
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
  if (current) current.typed = text;
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
    if (main && attempt < 2) { const t = lineOf(plan.choice, main.objective); await typeSend(page, t, ui); return { via: current.judged ? 'c' : 'a', how: `无机会卡／按钮，手打${t === main.objective ? '任务目标' : '动作原句'}「${t}」` }; }
    return { failed: `没有机会卡「${opp?.title ?? plan.opportunityId}」也没有机会按钮「${label}」` };
  }
  if (plan.kind === 'local:s02_04') {
    const btn = page.locator('.engine-action-options button.engine-action-btn').filter({ hasText: plan.local.label });
    if (await btn.count()) { await clickSend(page, btn.first(), ui); return { via: 'b', how: `地方按钮「${plan.local.label}」` }; }
    const main = questEntries(save)[0];
    if (main && attempt < 2) { const t = lineOf(plan.local, main.objective); await typeSend(page, t, ui); return { via: current.judged ? 'c' : 'a', how: `无地方按钮，手打${t === main.objective ? '任务目标' : '动作原句'}「${t}」` }; }
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
      const naiveMain = NAIVE && attempt === 0 ? questEntries(save)[0] : null;
      if (naiveMain) { current.naive = true; await typeSend(page, naiveMain.objective, ui); return { via: current.judged ? 'c' : 'a', how: `【人不在场探测】手打任务目标「${naiveMain.objective}」（walker：${action.actionId}）` }; }
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
    const typed = lineOf(action, entry.objective);
    await typeSend(page, typed, ui);
    return { via: current.judged ? 'c' : 'a', how: `手打${typed === entry.objective ? '任务目标' : '动作原句'}「${typed}」${gate.ok ? '' : `（闸门 where=${gate.where} who=${gate.who}）`}` };
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
  return { via: current.judged ? 'c' : 'a', how: `场面打法「${line}」${REAL ? '（真实识别）' : current.judged ? `（识别：${current.judged}）` : '（未发识别请求）'}`, scene: true };
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

// ───────────── --side：非主线拍 ─────────────
const side = { results: [], seenDoable: new Map(), tried: new Map(), charRows: [], charSeen: new Set(), compass: [], compassStages: new Set() };
const SKIP_ACTION = /\.defer$/;
const affinityOfSave = (save, ids) => Object.fromEntries(ids.map(id => [id, save.社交?.关系?.[id]?.好感度 ?? null]));
const sidePrep = (save, eventId) => [...(rt(save).eventActionStates?.[eventId]?.preparations || [])].sort();
const lineEntriesOf = save => questEntries(save).map(e => `${e.title}：${e.objective}`);
/** 右栏「这一拍谁有戏」块的行文字。 */
const whoRows = page => page.locator('.right-sidebar .collapsible-section.quest-section').filter({ hasText: '这一拍谁有戏' }).locator('.quest-event').allInnerTexts().then(l => l.map(t => t.replace(/\s+/g, ' ').trim())).catch(() => []);
/** 每手之前：人物任务行、当前线卡检查（只读，不算一手）；有可做的线拍就做一手并返回 true。 */
async function sideMove(page, ui, row) {
  const save = ui.save, st = rt(save);
  const snap = quietSync(() => SL.sideSnapshot(save));
  // 人物任务／高光：焦点事件挂了人物戏，右栏应出「名字——」行（每个焦点只查一次）。
  if (snap.focus && snap.charBeatsHere.length && !side.charSeen.has(snap.focus)) {
    side.charSeen.add(snap.focus);
    const rows = await whoRows(page);
    for (const cb of SL.CHAR_BEATS.filter(c => c.status !== 'new' && c.eventIds.includes(snap.focus)))
      side.charRows.push({ id: cb.id, kind: cb.kind, name: cb.name, stage: st.modId, focus: snap.focus, shown: rows.some(t => t.includes(`${cb.name}——`)), rows: rows.slice(0, 6),
        // 右栏读的是 store 里未 advance 的运行时焦点；与 advance 后的焦点不同时记下来（诊断「右栏慢一拍」）。
        storeFocus: R.getScenarioFocusEvent(st)?.id ?? null });
  }
  // 二级线提示：每关第一手查当前线卡。
  if (!side.compassStages.has(st.modId)) {
    side.compassStages.add(st.modId);
    const card = await page.locator('.right-sidebar .quest-line-card').innerText().then(t => t.replace(/\s+/g, ' ')).catch(() => '');
    const n = Number(card.match(/别处还有事（(\d+)）/)?.[1] ?? 0);
    side.compass.push({ stage: st.modId, node: snap.compass, card: card.slice(0, 200), nameShown: !snap.compass.current || card.includes(snap.compass.current), othersShown: n, ok: (!snap.compass.current || card.includes(snap.compass.current)) && n === snap.compass.others.length });
  }
  const receipts = rt(save).questLineState?.receipts || {};
  for (const x of snap.doable) if (!side.seenDoable.has(x.beatId)) side.seenDoable.set(x.beatId, { stage: st.modId, focus: snap.focus, actions: snap.doable.filter(y => y.beatId === x.beatId).map(y => y.actionId) });
  const d = snap.doable.find(x => !receipts[x.beatId] && !SKIP_ACTION.test(x.actionId) && (side.tried.get(`${x.beatId}|${x.actionId}`) || 0) < 2);
  if (!d) return false;
  const key = `${d.beatId}|${d.actionId}`;
  side.tried.set(key, (side.tried.get(key) || 0) + 1);
  const { line, beat } = SL.lineBeatOfEvent(d.eventId);
  // Node 侧：同一份状态上做同一动作（同 MainGamePanel 口径：先 advance 再取动作）。
  const exp = quietSync(() => R.advanceScenarioRuntime(clone(save)).saveData);
  const action = quietSync(() => R.getCurrentStoryExplorationActions(exp)).find(a => a.eventId === d.eventId && a.actionId === d.actionId);
  const rowBefore = quietSync(() => QV_view(exp)).find(c => c.beatId === beat.id);
  let nodeErr = null, expSave = null;
  try {
    expSave = quietSync(() => {
      const receipt = R.recordStoryEventStructuredAction(exp, action);
      if (!receipt.attempted) throw Error(`Node 侧未受理：${JSON.stringify(receipt).slice(0, 200)}`);
      TM.settleActionTime(exp, { action_time: { tier: '片刻' } }, { timeActionId: `side-walk:${moves}` }, null, false, false);
      return R.advanceScenarioRuntime(exp).saveData;
    });
  } catch (e) { nodeErr = String(e?.message || e).slice(0, 200); }
  current = { plan: { kind: 'side', action }, requests: [], judged: null };
  let res = null;
  // 右栏人物行的整句「名字——目标」（questLineView 同口径）；只按目标前缀找会撞上同一人的别的拍（pan_secret 的目标就是「乐明珠」）。
  const nodeRow = rowBefore;
  const rowKey = nodeRow ? squash(`${nodeRow.name}——${nodeRow.objective}`) : null;
  const isRow = t => { const x = squash(t).replace(/^·/, ''); return !!rowKey && x.startsWith(rowKey) && /^([▸▾（]|$)/.test(x.slice(rowKey.length)); };
  // 玩家从界面上能不能知道这一拍：右栏全文里有没有本拍目标／线名（任务日志、当前线卡、人物行都在右栏）。
  const rightText = (await page.locator('.right-sidebar').innerText().catch(() => '')).replace(/\s+/g, '');
  const uiBefore = { sidebar: (await whoRows(page)).filter(isRow), quest: ui.quest,
    visible: { objective: rightText.includes(squash(beat.objective).slice(0, 10)), lineName: rightText.includes(squash(line.name).slice(0, 4)) } };
  if (line.kind === 'character') {
    // 同一人的几拍可能目标文字相同（y6 四拍都是「凝羽——门没有开。」）：逐行展开，找有本动作按钮的那一行，不是就收起。
    const toggles = page.locator('.right-sidebar .line-beat-toggle');
    const texts = await toggles.allInnerTexts();
    const hits = texts.map((t, i) => isRow(t) ? i : -1).filter(i => i >= 0);
    for (const at of hits) {
      await toggles.nth(at).click();
      await page.waitForTimeout(200);
      const btn = page.locator('.right-sidebar .line-beat-action').filter({ hasText: action.label });
      if (await btn.count()) { const shown = (await btn.first().innerText().catch(() => '')).trim(); await clickSend(page, btn.first(), ui); res = { via: 'b', how: `右栏「这一拍谁有戏」${hits.length > 1 ? `（同文 ${hits.length} 行中第 ${hits.indexOf(at) + 1} 行）` : ''}→「${shown || action.label}」` }; break; }
      await toggles.nth(at).click();
      await page.waitForTimeout(150);
    }
    if (!res) res = { gap: hits.length ? `右栏 ${hits.length} 行展开后都没有「${action.label}」按钮` : '右栏「这一拍谁有戏」没有本拍的行' };
  }
  if (!res || res.gap) {
    const gap = res?.gap;
    await typeSend(page, action.playerLine || action.label, ui);
    res = { via: current.judged ? 'c' : 'a', how: `${gap ? `${gap}；改` : ''}手打动作原句「${action.playerLine || action.label}」${current.judged ? '（判定选中）' : '（替身未见该候选）'}`, gap };
  }
  row.moves++; row.via[res.via]++; row.side = (row.side || 0) + 1;
  const after = (await readUi(page)).save;
  const owners = line.ownerCharacterIds;
  const affinityBefore = affinityOfSave(save, owners);
  const cmp = expSave ? {
    receipt: [!!rt(after).questLineState?.receipts?.[beat.id], !!rt(expSave).questLineState?.receipts?.[beat.id]],
    prep: [sidePrep(after, d.eventId), sidePrep(expSave, d.eventId)],
    progress: diffOf(progressOf(after), progressOf(expSave)),
    affinity: [affinityOfSave(after, owners), affinityOfSave(expSave, owners)],
    questLog: [lineEntriesOf(after), lineEntriesOf(expSave)],
  } : null;
  const sidebarAfter = (await whoRows(page)).filter(isRow);
  // 同文行按「仍待回应的行数」比：Node 侧同 rowKey、仍有动作的行数。
  const nodeOpenRows = expSave ? quietSync(() => QV_view(expSave)).filter(c => c.actions.length && squash(`${c.name}——${c.objective}`) === rowKey).length : null;
  const uiQuest = (await readUi(page)).quest;
  const problems = [];
  if (nodeErr) problems.push(`Node 侧出错：${nodeErr}`);
  if (cmp) {
    if (cmp.receipt[0] !== cmp.receipt[1]) problems.push(`拍回执 浏览器 ${cmp.receipt[0]} / Node ${cmp.receipt[1]}`);
    if (JSON.stringify(cmp.prep[0]) !== JSON.stringify(cmp.prep[1])) problems.push(`准备步 浏览器 ${JSON.stringify(cmp.prep[0])} / Node ${JSON.stringify(cmp.prep[1])}`);
    if (cmp.progress) problems.push(`主线进度不一致 ${JSON.stringify(cmp.progress)}`);
    if (JSON.stringify(cmp.affinity[0]) !== JSON.stringify(cmp.affinity[1])) {
      // 「同一拍同一人只改一次好感」（runtime affinityBeatTaken）：浏览器走完整回合，线回执先占了这一拍，共历好感被跳过；
      // Node 侧对照是 record＋advance 一次做完，顺序不同会多给。两边同向、浏览器不多于 Node 的记异常，其余才算不一致。
      const sameWay = owners.every(id => { const b = affinityBefore[id] ?? 0, ui = (cmp.affinity[0][id] ?? 0) - b, nd = (cmp.affinity[1][id] ?? 0) - b; return ui === nd || (ui !== 0 && Math.sign(ui) === Math.sign(nd) && Math.abs(ui) < Math.abs(nd)); });
      const note = `好感 手前 ${JSON.stringify(affinityBefore)} 浏览器 ${JSON.stringify(cmp.affinity[0])} / Node ${JSON.stringify(cmp.affinity[1])}`;
      if (sameWay) anomalies.push({ stage: rt(save).modId, beat: line.beat?.id, what: `线拍好感增量与离线对照不同（同拍只改一次好感的记账顺序）：${note}` });
      else problems.push(note);
    }
    if (JSON.stringify(cmp.questLog[0]) !== JSON.stringify(cmp.questLog[1])) problems.push(`任务日志 浏览器 ${JSON.stringify(cmp.questLog[0])} / Node ${JSON.stringify(cmp.questLog[1])}`);
    const missing = cmp.questLog[1].filter(t => !uiQuest.includes(t));
    if (missing.length) problems.push(`界面任务日志未显示 ${JSON.stringify(missing)}`);
    const openRows = sidebarAfter.filter(t => /[▸▾]/.test(t)).length;
    if (line.kind === 'character' && openRows !== nodeOpenRows) problems.push(`右栏同文待回应行 浏览器 ${openRows} / Node ${nodeOpenRows}`);
    if (!cmp.receipt[0] && !cmp.prep[0].length) problems.push('浏览器未落任何回执／准备步（没做成）');
  }
  const rec = { stage: st.modId, focus: snap.focus, line: line.id, kind: line.kind, beat: beat.id, action: d.actionId, label: action.label, via: res.via, how: res.how, gap: res.gap || null,
    receipt: cmp?.receipt ?? null, prep: cmp?.prep?.[0] ?? null, affinityBefore, affinity: cmp?.affinity ?? null, questLogAfter: cmp?.questLog?.[0] ?? null,
    sidebarBefore: uiBefore.sidebar, sidebarAfter, questBefore: uiBefore.quest, visibleBefore: uiBefore.visible, requests: [...current.requests], judged: current.judged, ok: problems.length === 0, problems };
  side.results.push(rec);
  console.log(`[支线] ${st.modId} ${beat.id} ← ${d.actionId} [${res.via}] ${res.how}${line.kind === 'side' ? `（右栏可见：目标 ${uiBefore.visible.objective}／线名 ${uiBefore.visible.lineName}）` : ''} → ${rec.ok ? '与 Node 一致' : `不一致：${problems.join('；')}`}`);
  return true;
}
const QV_view = save => SL.QV.questLineView(save).character;

// ───────────── 起点 ─────────────
async function realOpening(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('入六朝', { exact: true }).first().click();
  await page.getByText('开启仙途', { exact: true }).first().waitFor({ timeout: 20_000 });
  await page.getByText('开启仙途', { exact: true }).first().click();
  await page.locator('textarea.game-input').waitFor({ timeout: REAL ? 600_000 : 90_000 });
  await page.waitForFunction(expr => { const s = eval(expr)._s; return !s.get('ui').isAIProcessing && s.get('gameState').toSaveData()?.世界?.状态?.剧本模组?.modId; }, PINIA, { timeout: WAIT_MS });
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

// ───────────── --real：统计 ─────────────
const real = { actionTime: {}, profile: {}, hands: [], chat: 0, embeddings: 0, byKind: {}, failedRequests: 0, safeReplaced: 0, unrecognized: 0 };
const inflight = new Map(); // Playwright Request → { t0, cur, main }
const pathOf = request => { try { const u = new URL(request.url()); return `${u.host}${u.pathname}`; } catch { return '?'; } }; // 不带查询串
function onRealRequest(kind, body, request) {
  if (kind === 'inject529') { if (current) current.injected529 = (current.injected529 || 0) + 1; return; }
  if (kind === 'embeddings') real.embeddings++; else real.chat++;
  real.byKind[kind] = (real.byKind[kind] || 0) + 1;
  // 判拍／意图分类发了真实请求：这一手算 c（交给模型判）。
  if (current && (kind === 'beat' || kind === 'intent')) current.judged = kind;
  const main = kind === 'narration' && /tavern_commands/.test(String(body?.messages?.[0]?.content || ''));
  // 请求画像：按「种类｜系统提示前 16 字」归组，记推理档／思考参数与耗时（不记请求头）。
  const sig = kind === 'embeddings' ? 'embeddings' : `${kind}｜${String(body?.messages?.[0]?.content || '').replace(/\s+/g, ' ').slice(0, 16)}`;
  const params = kind === 'embeddings' ? '' : `effort=${body?.reasoning_effort ?? '-'} thinking=${JSON.stringify(body?.thinking ?? null)} stream=${!!body?.stream}`;
  if (request) inflight.set(request, { t0: Date.now(), cur: current, main, sig, params, kind });
  if (VERBOSE) console.log(`    ↗ ${kind} ${request ? pathOf(request) : ''}`);
}
function onRealDone(request, failed) {
  const x = inflight.get(request);
  if (!x) return;
  inflight.delete(request);
  if (failed) { real.failedRequests++; if (x.cur) x.cur.failedRequests = (x.cur.failedRequests || 0) + 1; }
  if (x.main && x.cur) (x.cur.narrMs ||= []).push(Date.now() - x.t0);
  // 主叙事回包里模型给的 action_time（动作耗时档位）：流式回包逐块拼回正文再取；只记这一个字段的原样文本（前 80 字）或 'absent'。
  if (x.main && !failed) request.response().then(r => r?.text()).then(raw => {
    if (!raw) return;
    let content = '';
    for (const line of raw.split('\n')) { if (!line.startsWith('data:')) continue; try { content += JSON.parse(line.slice(5))?.choices?.[0]?.delta?.content ?? ''; } catch { /* [DONE] 等 */ } }
    if (!content) { try { content = JSON.parse(raw)?.choices?.[0]?.message?.content ?? ''; } catch { /* 非 JSON */ } }
    if (!content) return;
    const m = content.match(/"action_time"\s*:\s*(\{[^}]*\}|"[^"]*"|[^,}\s]+)/);
    const v = m ? m[1].replace(/\s+/g, ' ').slice(0, 80) : 'absent';
    real.actionTime[v] = (real.actionTime[v] || 0) + 1;
    if (x.cur) (x.cur.actionTime ||= []).push(v);
  }).catch(() => {});
  // 判拍／意图请求的回包正文（模型输出，前 300 字）记到这一手，便于看没判中时模型回了什么。
  if (!failed && x.cur && (x.kind === 'beat' || x.kind === 'intent')) request.response().then(r => r?.json()).then(j => { (x.cur.judgeReplies ||= []).push(String(j?.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').slice(0, 300)); }).catch(() => {});
  const g = real.profile[x.sig] ||= { count: 0, failed: 0, ms: [], params: {}, status: {}, errorBodies: [] };
  // HTTP 状态码；非 2xx 时留回包正文前 200 字（上游的报错信息，不含请求头）。
  if (!failed) request.response().then(async r => { if (!r) return; const st = r.status(); g.status[st] = (g.status[st] || 0) + 1; if (st >= 400 && g.errorBodies.length < 5) g.errorBodies.push(String(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)); }).catch(() => {});
  g.count++; if (failed) g.failed++; g.ms.push(Date.now() - x.t0); g.params[x.params] = (g.params[x.params] || 0) + 1;
}
const position = save => ({ 描述: save.角色.位置?.描述 ?? null, locationId: save.角色.位置?.locationId ?? null });
const questTarget = save => { const e = questEntries(save)[0]; return e ? { title: e.title, objective: e.objective, place: e.place ?? null } : null; };
const reqCount = cur => { const list = (cur?.requests || []).filter(k => k !== 'inject529'); return { total: list.length, chat: list.filter(k => k !== 'embeddings').length, embeddings: list.filter(k => k === 'embeddings').length }; };
// 每手的诊断日志（--real）：从页面诊断日志自己的 IndexedDB（lcq-log／logs，不是存档接口）取本手开始后新增的这几种码，只取 code 与 detail。
// LCQ-SAV-065 在 sendMessage 收尾（终存档之后）才写，比 isAIProcessing 撤下晚：先等输入区 data-turn-state 离开 processing（回合账结清），
// 再按 diagnostics.flushMs 批量落库多等一会，之后隔 600ms 读一次、条数不再变就收（最多读 5 次）。旧包没有 LCQ-SAV-065、或库打不开，都按取不到处理（diag 为空数组或 null）。
const DIAG_CODES = ['LCQ-SAV-053', 'LCQ-SAV-054', 'LCQ-SAV-062', 'LCQ-SAV-065'];
async function readDiag(page, sinceMs) {
  await page.waitForFunction(() => document.querySelector('[data-testid="turn-status"]')?.dataset.turnState !== 'processing', null, { timeout: 60_000, polling: 200 }).catch(() => null);
  await page.waitForTimeout(800);
  let got = await readDiagOnce(page, sinceMs);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(600);
    const again = await readDiagOnce(page, sinceMs);
    const same = (again?.length ?? -1) === (got?.length ?? -1);
    got = again;
    if (same) break;
  }
  return got;
}
// 每手页面上出现过的浮动提示（src/components/common/ToastContainer.vue：.toast-container .toast .toast-message，默认 3 秒就撤）：
// 页面里的 MutationObserver（openSmokeContext 之后 addInitScript 挂上）记下文本与时间，这里取本手开始后的，去重、每条截 120 字。
const TOAST_OBSERVER = () => {
  window.__toastSeen = [];
  const note = el => { const text = (el.querySelector('.toast-message')?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim(); if (text) window.__toastSeen.push({ t: Date.now(), text }); };
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('.toast')) note(node);
      else for (const el of node.querySelectorAll('.toast')) note(el);
    }
  }).observe(document, { childList: true, subtree: true });
};
const readToasts = (page, sinceMs) => page.evaluate(since => [...new Set((window.__toastSeen || []).filter(x => x.t >= since).map(x => x.text.slice(0, 120)))], sinceMs).catch(() => null);
function readDiagOnce(page, sinceMs) {
  return page.evaluate(({ since, codes }) => new Promise(resolve => {
    try {
      const open = indexedDB.open('lcq-log');
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const db = open.result;
          if (!db.objectStoreNames.contains('logs')) { db.close(); resolve(null); return; }
          const req = db.transaction('logs', 'readonly').objectStore('logs').getAll(IDBKeyRange.lowerBound(since * 1000));
          req.onsuccess = () => { db.close(); resolve(req.result.filter(e => codes.includes(e.code) || e.level === 'warn' || e.level === 'error').sort((a, b) => a.seq - b.seq).map(e => codes.includes(e.code) ? { code: e.code, detail: e.detail ?? null } : { code: e.code, level: e.level, msg: String(e.msg ?? '').slice(0, 200), detail: e.detail === undefined ? undefined : JSON.stringify(e.detail).slice(0, 500) })); };
          req.onerror = () => { db.close(); resolve(null); };
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  }), { since: sinceMs, codes: DIAG_CODES }).catch(() => null);
}
/** 每手一行（真实模式）；请求数与主叙事耗时在收尾时从 cur 取（后台请求可能晚于本手落定）。 */
function realHand(tm, save, after, label, res, moved, nodeMoved = null, diag = null, toasts = null) {
  const safe = /已替换为安全叙述|本轮只呈现已经确认的公开动静/.test(`${after.notice} ${after.narrative200}`), unrec = /行动没能识别/.test(after.hold);
  if (safe) real.safeReplaced++;
  if (unrec) real.unrecognized++;
  const row = { hand: moves, stage: rt(save).modId, beat: QL.questBeatKey(save), plan: label, via: res.via ?? null, how: res.failed || res.how, typed: current.typed ?? null,
    moved, nodeMoved, loose: !!current.loose, naive: !!current.naive, injected529: current.injected529 || 0, locationBefore: position(save).locationId, judged: current.judged ?? null, ms: Date.now() - tm, safe, unrecognized: unrec, hold: after.hold || '', notice: after.notice || '', location: position(after.save).locationId, narrative200: after.narrative200, diag, toasts, _cur: current };
  real.hands.push(row);
  const r = reqCount(current);
  console.log(`[手] ${String(moves).padStart(3)} ${row.stage} ${row.beat ?? '-'} [${row.via ?? '×'}] ${String(row.how).slice(0, 80)} → ${moved ? '推进' : '未推进'}${nodeMoved === false ? '（walker 也不推进）' : ''}｜${(row.ms / 1000).toFixed(1)}s 请求 ${r.chat}+${r.embeddings}e${row.loose ? '｜改写' : ''}${row.judged ? `｜判拍 ${row.judged}` : ''}${safe ? '｜安全替换' : ''}${unrec ? '｜行动没能识别' : ''}`);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let guardRef = null, storageRef = null;
const pageErrors = [];
try {
  const { context, guard, storage } = await openSmokeContext(browser, {
    respond, contextOptions: { viewport: { width: 1600, height: 1000 } }, real: REAL,
    onRequest: (kind, body, request) => { current?.requests.push(kind); if (REAL) onRealRequest(kind, body, request); },
  });
  guardRef = guard; storageRef = storage;
  if (REAL) { context.on('requestfinished', r => onRealDone(r, false)); context.on('requestfailed', r => onRealDone(r, true)); }
  if (REAL) await context.addInitScript(TOAST_OBSERVER);
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
      startHow = REAL ? '首页「入六朝」默认设置 →「开启仙途」（--real：开局两步为真实模型请求）' : '首页「入六朝」默认设置 →「开启仙途」（开局两步模型请求用替身）';
      if (REAL) console.log(`[起点] 开局请求 ${JSON.stringify(reqCount(current))}`);
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
    const HAND_LIMIT = MAX_HANDS ?? MAX_MOVES;
    for (; outcome === 'running' && moves < HAND_LIMIT; moves++) {
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
        if (REAL) realHand(tm, save, after, `场面 ${sceneCtx.beat ?? ''}`, res, !after.scene, null, await readDiag(page, tm), await readToasts(page, tm));
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
      if (SIDE) {
        let handled = false;
        try { handled = await sideMove(page, ui, row); } catch (error) {
          handled = true;
          anomalies.push({ stage: state.modId, move: moves, what: '支线操作异常', error: String(error?.message || error).split('\n')[0].slice(0, 200) });
          side.results.push({ stage: state.modId, beat: '?', ok: false, problems: [`界面操作异常：${String(error?.message || error).split('\n')[0].slice(0, 200)}`] });
          await ensureGamePage(page).catch(() => {});
        }
        if (handled) continue;
      }
      const plan = planOf(save);
      lastPre = save;
      const bk = `${state.modId}|${QL.questBeatKey(save)}|${plan.kind}|${planLabel(plan)}`;
      if (bk !== beatKey) { beatKey = bk; noProgress = 0; idle = 0; attempt = 0; }
      current = { plan, requests: [], judged: null };
      const expected = nodeStep(save, stepNo);
      const before = progressOf(save);
      let res;
      looseAttempt = attempt;
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
      const moved = REAL ? realKeyOf(got) !== realKeyOf(before) || (!!res.prep && got.location !== before.location) : keyOf(got) !== keyOf(before);
      if (res.failed) {
        if (VERBOSE) console.log(`  · 手 ${moves} ${planLabel(plan)}：入口失败 ${res.failed}`);
      } else {
        row.via[res.via]++;
        if (res.prep) row.prep++;
        if (res.place && res.via === 'a') row.aPlace++;
        if (VERBOSE) console.log(`  · 手 ${moves} ${Date.now() - tm}ms [${res.via}] ${res.how} → ${moved ? '推进' : '未推进'}${current.beatCandidates ? ` 判定候选 ${JSON.stringify(current.beatCandidates)}` : ''}`);
      }
      const nodeMoved = expected.save ? (REAL ? realKeyOf(progressOf(expected.save)) !== realKeyOf(before) : keyOf(progressOf(expected.save)) !== keyOf(before)) : null;
      if (REAL) realHand(tm, save, after, planLabel(plan), res, moved, nodeMoved, await readDiag(page, tm), await readToasts(page, tm));
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
      if (REAL) Object.assign(rec, { hand: moves, typed: current.typed ?? null, narrative200: after.narrative200, position: position(after.save), questTarget: questTarget(after.save),
        requestCount: reqCount(current), hold: after.hold, notice: after.notice });
      stuck.push(rec);
      row.stuck++;
      // 调试：SMOKE_FULL_CHAIN_DUMP＝目录时把卡点前的浏览器存档写出来（默认不写盘）。
      if (process.env.SMOKE_FULL_CHAIN_DUMP) writeFileSync(`${process.env.SMOKE_FULL_CHAIN_DUMP}/stuck-${stuck.length}.json`, JSON.stringify(save));
      console.log(`[卡点] ${rec.stage} 拍 ${rec.beat}：walker 要走 ${rec.walker.action}；最后一手 ${rec.lastEntry}`);
      if (REAL) console.log(`  打字「${rec.typed}」；位置 ${JSON.stringify(rec.position)}；目标 ${JSON.stringify(rec.questTarget)}；请求 ${JSON.stringify(rec.requestCount)}\n  正文：${rec.narrative200}`);
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
    if (outcome === 'running') outcome = MAX_HANDS !== null && moves >= MAX_HANDS ? 'maxHands' : 'limit';
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
const sideOut = SIDE ? { results: side.results, seenDoable: Object.fromEntries(side.seenDoable), charRows: side.charRows, compass: side.compass } : undefined;
let realOut;
if (REAL) {
  for (const h of real.hands) { const r = reqCount(h._cur); Object.assign(h, { requests: r, kinds: [...(h._cur?.requests || [])], narrMs: h._cur?.narrMs || [], judgeReplies: h._cur?.judgeReplies || [], failedRequests: h._cur?.failedRequests || 0 }); delete h._cur; }
  const med = list => { const x = [...list].sort((a, b) => a - b); return x.length ? x[Math.floor(x.length / 2)] : null; };
  const handMs = real.hands.map(h => h.ms), narr = real.hands.flatMap(h => h.narrMs);
  realOut = { hosts: guardRef?.stats ? { allowed: guardRef.stats.allowed, violations: guardRef.stats.violations.length } : null, storage: storageRef,
    requests: { chat: real.chat, embeddings: real.embeddings, byKind: real.byKind, failed: real.failedRequests },
    handMs: { median: med(handMs), max: Math.max(0, ...handMs) }, narrationMs: { count: narr.length, median: med(narr), max: Math.max(0, ...narr) },
    safeReplaced: real.safeReplaced, unrecognized: real.unrecognized, actionTime: real.actionTime, hands: real.hands,
    profile: Object.fromEntries(Object.entries(real.profile).map(([k, g]) => [k, { count: g.count, failed: g.failed, medianMs: med(g.ms), maxMs: Math.max(0, ...g.ms), params: g.params, status: g.status, errorBodies: g.errorBodies }])) };
  // LCQ-SAV-065 按 detail.reason 计数；取不到诊断日志的手（旧包／库打不开）单独计。
  realOut.stall = { reasons: {}, entries: 0, handsWithoutDiag: real.hands.filter(h => !Array.isArray(h.diag)).length };
  for (const h of real.hands) for (const e of h.diag || []) if (e.code === 'LCQ-SAV-065') { realOut.stall.entries++; const k = e.detail?.reason ?? '?'; realOut.stall.reasons[k] = (realOut.stall.reasons[k] || 0) + 1; }
  if (LOOSE) { const l = real.hands.filter(h => h.loose); realOut.loose = { hands: l.length, moved: l.filter(h => h.moved).length, judged: l.filter(h => h.judged).length, judgedMoved: l.filter(h => h.judged && h.moved).length, notMoved: l.filter(h => !h.moved).map(h => ({ hand: h.hand, beat: h.beat, typed: h.typed, judged: h.judged, nodeMoved: h.nodeMoved })) }; }
}
const result = { baseUrl, real: realOut, maxHands: MAX_HANDS ?? undefined, side: sideOut, qin: QIN ? qin : undefined, from: FROM, until: UNTIL, startHow, outcome, ms, stall: STALL, expectedStages: EXPECTED_STAGES, visited: stages.map(s => s.id), stages, total, stuck, diffs, cOnly, scenes, overlays, anomalies, festival, pageErrors };
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
if (overlays.length) console.log(`[弹窗] ${JSON.stringify(overlays)}`);
console.log(`[合计] ${stages.length} 关，${total.moves} 手（a ${total.a} / b ${total.b} / c ${total.c} / d ${total.d}；预备 ${total.prep}），卡点 ${stuck.length}，与 walker 差异 ${diffs.length}，用时 ${(ms / 60000).toFixed(1)} 分钟，结局 ${outcome}`);
if (festival) console.log(`[大祭] ${JSON.stringify(festival)}`);
if (REAL) {
  console.log(`[真实模型] 请求 chat ${realOut.requests.chat}／embeddings ${realOut.requests.embeddings}（按种类 ${JSON.stringify(realOut.requests.byKind)}；失败 ${realOut.requests.failed}）`);
  console.log(`[真实模型] 每手耗时 中位 ${(realOut.handMs.median / 1000 || 0).toFixed(1)}s／最长 ${(realOut.handMs.max / 1000).toFixed(1)}s；主叙事 ${realOut.narrationMs.count} 次，中位 ${(realOut.narrationMs.median / 1000 || 0).toFixed(1)}s／最长 ${(realOut.narrationMs.max / 1000).toFixed(1)}s`);
  console.log(`[真实模型] 「已替换为安全叙述」${realOut.safeReplaced} 手，「行动没能识别」${realOut.unrecognized} 手；存档接口：读配置 ${storageRef.configGet}，替身读 ${storageRef.stubbedRead}，拦下写 ${storageRef.blockedWrite.length}${storageRef.blockedWrite.length ? ` ${JSON.stringify([...new Set(storageRef.blockedWrite)])}` : ''}`);
}
if (REAL) console.log(`[没推进原因] LCQ-SAV-065 共 ${realOut.stall.entries} 条：${Object.entries(realOut.stall.reasons).map(([k, n]) => `${k} ${n}`).join('、') || '无'}；取不到诊断日志 ${realOut.stall.handsWithoutDiag} 手`);
if (REAL) for (const [k, g] of Object.entries(realOut.profile)) console.log(`[请求画像] ${k}：${g.count} 次，失败 ${g.failed}，中位 ${(g.medianMs / 1000).toFixed(1)}s／最长 ${(g.maxMs / 1000).toFixed(1)}s；${JSON.stringify(g.params)}；HTTP ${JSON.stringify(g.status)}`);
if (REAL) console.log(`[真实模型] 主叙事回包里的 action_time：${JSON.stringify(realOut.actionTime)}`);
if (REAL && NAIVE) { const nv = realOut.hands.filter(h => h.naive); console.log(`[真实模型] 人不在场探测 ${nv.length} 手：发了主叙事 ${nv.filter(h => h.narrMs.length).length}；手后位置变了 ${nv.filter(h => h.location !== h.locationBefore).length}；本手就推进 ${nv.filter(h => h.moved).length}`); }
if (REAL && LOOSE) console.log(`[真实模型] 改写手 ${realOut.loose.hands}：推进 ${realOut.loose.moved}；发了判拍／意图请求 ${realOut.loose.judged}（其中推进 ${realOut.loose.judgedMoved}）；没推进 ${realOut.loose.notMoved.length}`);
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };
check((QIN ? ['railDone'] : ['done', 'until', 'maxHands']).includes(outcome), `未走完：outcome=${outcome}`);
if (QIN) for (const c of qin.checks) { if (!c.ok) failures.push(`秦线：${c.what}`); }
if (QIN) check(qin.ret && qin.reenter, '秦线：返回与返回后检查应已执行');
const expectedSeen = outcome === 'maxHands' ? EXPECTED_STAGES.slice(0, stages.length) : EXPECTED_STAGES;
check(JSON.stringify(stages.map(s => s.id)) === JSON.stringify(expectedSeen), `途经关序列不等于默认主链：${JSON.stringify(stages.map(s => s.id))}`);
check(stuck.length === 0, `有 ${stuck.length} 处卡点`);
// 与 walker 的差异：落在卡点那一拍上的算卡点的表现；其余差异判失败。
// --real-loose：改写句没判中的那一手必然与 walker 有差异（下一手照原句再打），算改写手的统计，不算失败。
const looseMiss = new Set(REAL && LOOSE ? real.hands.filter(h => h.loose && !h.moved).map(h => h.hand) : []);
const unexplained = diffs.filter(d => !stuck.some(x => x.stage === d.stage && x.beat === d.beat) && !looseMiss.has(d.move));
check(unexplained.length === 0, `有 ${unexplained.length} 处与 walker 的差异不能用卡点解释：${JSON.stringify(unexplained.slice(0, 3))}`);
check(pageErrors.length === 0, `控制台未捕获异常：${pageErrors.slice(0, 3).join(' / ')}`);
check(!anomalies.some(a => a.what === 'LCQ 报错码'), `出现 LCQ 报错码：${JSON.stringify(anomalies.filter(a => a.what === 'LCQ 报错码').flatMap(a => a.codes))}`);
if (!QIN && LAST === FINAL && outcome !== 'maxHands') {
  check(festival?.available && !festival.blocked && festival.button && !festival.button.disabled, `终关「${F.FESTIVAL.label}」应可点：${JSON.stringify(festival)}`);
  check(festival?.started === true && festival?.eventDone === true && festival?.buttonAfter === false, `「${F.FESTIVAL.label}」应生效：${JSON.stringify(festival)}`);
}
if (SIDE) {
  for (const r of side.results) check(r.ok, `支线拍 ${r.stage} ${r.beat} ${r.action ?? ''} 与 Node 不一致：${(r.problems || []).join('；')}`);
  // 浏览器里出现过「可做」的拍：要么落了拍回执，要么只出过准备步（如藻丝要齐远在场才能下单），否则算没做成。
  const done = new Set(side.results.filter(r => r.receipt?.[0]).map(r => r.beat));
  const prepOnly = new Set(side.results.filter(r => r.prep?.length && !r.receipt?.[0]).map(r => r.beat));
  for (const [beat, at] of side.seenDoable) check(done.has(beat) || prepOnly.has(beat) || side.results.some(r => r.beat !== beat && r.receipt?.[0] && r.stage === at.stage && SL.lineBeatOfEvent(SL.LINE_BEATS.find(x => x.beat.id === beat)?.beat.eventId)?.line.id === r.line),
    `线拍 ${beat}（${at.stage}／${at.focus}）界面上可做过但没做成`);
  for (const c of side.charRows) check(c.shown, `人物任务 ${c.id} ${c.name}（${c.stage}／${c.focus}；store 焦点 ${c.storeFocus}）右栏「这一拍谁有戏」没出行：${JSON.stringify(c.rows)}`);
  for (const c of side.compass) check(c.ok, `当前线卡 ${c.stage} 与 Node 不一致：Node ${JSON.stringify(c.node)}；界面「${c.card}」`);
  console.log(`[支线合计] 线拍手 ${side.results.length}（一致 ${side.results.filter(r => r.ok).length}），落回执 ${done.size} 拍，只到准备步 ${[...prepOnly].filter(b => !done.has(b)).length} 拍，可做过 ${side.seenDoable.size} 拍；人物任务／高光行 ${side.charRows.filter(c => c.shown).length}/${side.charRows.length}；当前线卡 ${side.compass.filter(c => c.ok).length}/${side.compass.length}`);
}
for (const f of failures) console.log(`FAIL ${f}`);
if (QIN) console.log(`[秦线检查] ${qin.checks.filter(c => c.ok).length}/${qin.checks.length} 通过`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} smoke-full-chain${QIN ? '（--qin）' : SIDE ? '（--side）' : ''}：${stages.length}/${EXPECTED_STAGES.length} 关，卡点 ${stuck.length}`);
process.exit(failures.length ? 1 : 0);
