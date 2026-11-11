// 旧档走「真实读档对账」链路的回归测试。
//
// 背景：Node 下 builtins/index.ts 的 require.context 不可用，getReconcileDeps() 记 LCQ-SAV-044 返回 null，
// advanceScenarioRuntime 里的 reconcileSaveWithRegistry 整段 no-op——此前所有旧档回放测试都没有执行读档对账。
// 本文件经 tests/loadReconcileChainHarness.mjs 加载 src（不改 src：只给 builtins/index.ts 的 require 补 context），
// 让对账真的执行，并带自检防止以后悄悄退回 no-op。
//
// 链路顺序（ningyu-report §1 + src 调用点，只读）：
//   读档  characterStore.loadGame：JSON 往返 → validateLoadedSave → applyLoadRepairs（不跑 advance）
//   取按钮 MainGamePanel.scenarioEngineActionOptions：副本 advanceScenarioRuntime（对账在这里）→ getCurrentStoryEventActions(副本)
//   点击  MainGamePanel 发送：live reconcileNaturalIntentMetadata + applyBeatDeadlines → AIBS 落账（live）→ AIBS 回合尾 advanceScenarioRuntime(live)
//
// 断言是不变量，不做逐字节金样：正常改合同不需要重生夹具；改了对账行为让这里变红时，按 PR 说明改期望。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as H from './loadReconcileChainHarness.mjs';

const { R, rt } = H;
const B = await H.load('modules/scenarioMods/builtins/index.ts');
const { CONTENT_PACKS } = await H.load('modules/contentPacks/index.ts');
const { REGISTRY_VERSION, resolveScenarioCharacters } = await H.load('modules/scenarioMods/characterResolver.ts');
const modById = id => B.BUILTIN_SCENARIO_MODS.find(m => m.manifest?.id === id);

// 仓库里全部完整存档夹具（盘点：tests/fixtures 下带 世界.状态.剧本模组 且 events 非空的）。
// 不在内：playtest-6ccb/*（只剩剧本模组局部字段、events 为空）、playtest-1aae/*（只有 runtime 片段）、entity-ledger / festival-replay / scenario-mod（不是存档）。
const LEGACY = [
  'checkpoints/c01-before-wuyuan-220-timers.json', 'checkpoints/c01-before-wuyuan-220.json', 'checkpoints/current-han-entry.json',
  'checkpoints/current-prologue-before-s02_04.json', 'checkpoints/current-taiquan-entry.json', 'checkpoints/current-tang-entry.json',
  'checkpoints/nanhuang-04b-before-letter-id.json', 'checkpoints/nanhuang-05b-inn-stay-before-rejoin.json',
  ...['han', 'jin', 'saiwai', 'taiquan', 'tang', 'zhaonan'].flatMap(l => [`lines-replay/${l}-mid.json`, `lines-replay/${l}-end.json`]),
  'qin-replay/qin-before-entry.json', 'qin-replay/qin-entry-ready.json', 'qin-replay/qin-rail-mid.json', 'qin-replay/qin-rail-end.json',
  'song-replay/song-before-entry.json', 'song-replay/song-jiangzhou-mid.json', 'song-replay/song-linan-mid.json',
  'song-replay/song-line-end.json', 'song-replay/song-quarantine.json', 'song-replay/song-retreat-legacy.json',
  'playtest-08e0/f01-after.json', 'playtest-08e0/f03-before.json', 'playtest-08e0/f06-mid-beat18.json',
  'playtest-5e8f/cp03-dragon-corpse.json', 'playtest-5e8f/cp04-phase2-end.json.gz',
  'playtest-cd16/stuck-s01-01.json',
];
// 本任务固化的 10-30 之后存档状态（ningyu-report §4.1 ny-c / si-2 / s4-2），见各文件「说明」「来源」。
const SMALL = ['load-reconcile/ningyu-current-contract.json', 'load-reconcile/sheyi-d33e6b9d-contract.json', 'load-reconcile/s02_04-68462843-contract.json'];

// 现状钉子（不是「应当如此」，是 41465259 上的实测现状；变了就说明链路行为变了，要看原因再改）：
const PINNED = {
  // 场面模块进行中：advanceScenarioRuntime 在 activeScene 处提前返回（对账不跑），界面也不出事件按钮，玩家在场面面板里操作。
  'playtest-08e0/f03-before.json': { scene: true },
  'playtest-08e0/f06-mid-beat18.json': { scene: true },
  // 关卡 rail 已走完、没有当前拍按钮。
  'lines-replay/jin-end.json': { noButton: true }, 'lines-replay/saiwai-end.json': { noButton: true },
  'lines-replay/zhaonan-end.json': { noButton: true }, 'qin-replay/qin-rail-end.json': { noButton: true },
  'song-replay/song-before-entry.json': { noButton: true }, 'song-replay/song-line-end.json': { noButton: true },
  'playtest-5e8f/cp04-phase2-end.json.gz': { noButton: true },
  // 10-19 的旧档：存的是进关后从没 advance 过的 runtime（activeEventIds 为空、无 reconciledRegistryVersion）。
  // 按钮从副本（advance 后激活了 xiaozi_kills_mother）生成，live 上还没有当前拍 → 第一次点击 stale_event、不落账；
  // 回合尾 advance(live) 后第二次点击才落账。10-30 之后正常游玩的档每回合尾都 advance 过，不会是这种形状【推断】。
  'playtest-5e8f/cp03-dragon-corpse.json': { firstClick: 'stale_event' },
  // 05b 留客栈、未归队：开信被 hold 到归队（tests/nanhuangInnRoute.test.mjs 钉的设计），归队入口不在事件按钮里。
  // 当前拍只出 idle:「留意四周」——点下去 attempted、不完成、不记尝试（idle 按设计不落进度）。
  'checkpoints/nanhuang-05b-inn-stay-before-rejoin.json': { idleOnly: true },
};
const BAD_REASONS = ['stale_contract', 'stale_event', 'invalid_selection', 'unknown_action', 'unknown'];

// 只看对账会动的字段（advance 每次都会变的 worldTurn/stallTurns 等不在内）。
const reconcileOwned = save => {
  const r = rt(save);
  return JSON.stringify({ events: r.events, eventActionStates: r.eventActionStates, npcPrivateKnowledge: r.npcPrivateKnowledge,
    canon: r.canon, reconciledRegistryVersion: r.reconciledRegistryVersion, locations: save.世界?.信息?.地点信息 });
};
const incoherentStates = runtime => Object.entries(runtime.eventActionStates || {})
  .filter(([id, state]) => {
    const contract = runtime.events.find(e => e.id === id)?.playerCompletionContract;
    return contract && state.contractHash !== H.contractHash(contract);
  }).map(([id]) => id).sort();

/** 一份夹具走完整链路，返回中间态；断言在调用方。 */
async function runChain(relPath, { bumpRegistry = false } = {}) {
  const raw = H.readFixtureSave(relPath);
  if (bumpRegistry) delete rt(raw).reconciledRegistryVersion; // 模拟下一次 registry 改版：已存的版本对不上，角色重投影/点位补缺整段都跑
  const live = await H.loadLikeGame(raw, relPath);
  const buttons = H.uiButtons(live);
  return { raw, live, buttons };
}

/**
 * 对账各步的后置条件（防「步骤被悄悄跳过」——只看不丢进度时，跳过迁移/补缺也是绿的）：
 * - 迁移表（取包数据 CONTENT_PACKS.contractRevisions，不经 runtime 的映射）：to = 当前哈希、读档前合同哈希 ∈ {from,to} 的事件，对账后合同 = 当前合同；
 * - 知情表现 / 事前征兆：存档事件有 reveal/timeline、内置有而存档缺的，对账后已补上；
 * - registry 版本对不上时：内置正典里带坐标的地点，对账后都在 世界.信息.地点信息 里且坐标一致；
 * - registry 版本对不上时：旧档角色的派生注若按 registry 重投影会变，对账后派生注就不能还是旧档原样（证明重投影跑了）。
 *   不做「不动点」比较，原因（均实测）：对账之后 advance 的后续步骤会按剧情进度改显示名/种族（zhaonan-mid 小紫、cp03 碧姬），
 *   resolver 按名字取条目，单跑 resolve 会连带改注；【已知身世】等非派生注由后续步骤按知情账本补回（nanhuang-05b 小紫）；
 *   每次重投影还会多一条重复的门禁注（已知缺陷，见下方「现状钉子：门禁注重复」）。
 */
const { PROMPT_LAYERS } = await H.load('modules/scenarioMods/promptLayers.ts');
// 只看 resolver 自己产出的派生注（与 characterResolver.ts 剥旧注用的同一张前缀表）；【已知身世】等由 advance 后续步骤按知情账本补回。
const characterNoteSets = chars => JSON.stringify((chars || []).map(c => [...new Set((c?.profile?.notes || [])
  .filter(n => PROMPT_LAYERS.derivedNotePrefixes.some(prefix => String(n).startsWith(prefix))))].sort()));
function assertReconcilePostconditions(label, beforeSave, afterSave, registryStale) {
  const before = rt(beforeSave), after = rt(afterSave), mod = modById(after.modId);
  const latestById = new Map((mod?.scenario.events || []).map(e => [e.id, e]));
  for (const rev of CONTENT_PACKS.contractRevisions || []) {
    const latest = latestById.get(rev.eventId)?.playerCompletionContract;
    const saved = before.events.find(e => e.id === rev.eventId)?.playerCompletionContract;
    if (!latest || !saved || rev.to !== H.contractHash(latest) || ![rev.from, rev.to].includes(H.contractHash(saved))) continue;
    assert.equal(H.contractHash(after.events.find(e => e.id === rev.eventId).playerCompletionContract), rev.to, `${label} 迁移表 ${rev.eventId} 没迁移`);
  }
  for (const saved of after.events) {
    const latest = latestById.get(saved.id)?.timeline;
    if (saved.timeline?.reveal && latest?.reveal?.presentation) assert.ok(saved.timeline.reveal.presentation, `${label} ${saved.id} 知情表现没补`);
    if (saved.timeline && latest?.omen) assert.ok(saved.timeline.omen, `${label} ${saved.id} 事前征兆没补`);
  }
  if (registryStale && Array.isArray(before.canon?.characters)) {
    const projected = structuredClone(before.canon.characters);
    H.quiet(() => resolveScenarioCharacters(projected, after.modId));
    if (characterNoteSets(projected) !== characterNoteSets(before.canon.characters)) {
      assert.notEqual(characterNoteSets(after.canon.characters), characterNoteSets(before.canon.characters), `${label} canon.characters 没按 registry 重投影`);
    }
  }
  const locations = afterSave.世界?.信息?.地点信息;
  if (registryStale && Array.isArray(locations)) {
    for (const loc of mod?.canon?.locations || []) {
      if (!loc?.name || !loc.coordinates) continue;
      const found = locations.find(item => item?.名称 === loc.name);
      assert.ok(found, `${label} 地点 ${loc.name} 没补`);
      assert.deepEqual(found.coordinates || found.坐标, loc.coordinates, `${label} 地点 ${loc.name} 坐标没对齐`);
    }
  }
}

function assertPreserved(label, before, after) {
  assert.equal(after.modId, before.modId, `${label} modId`);
  assert.equal(after.currentChapterId ?? null, before.currentChapterId ?? null, `${label} currentChapterId`);
  for (const id of before.completedEventIds || []) assert.ok(after.completedEventIds.includes(id), `${label} completedEventIds 丢了 ${id}`);
  const completed = new Set(after.completedEventIds || []);
  for (const [key, value] of Object.entries(before.flags || {})) {
    // 唯一允许的改动：advance 里的 settleCompletedChapterFlags（不是对账）在本章事件全部完成时把 chapter.*.done 补成 true
    // ——前进不是丢失（实测：playtest-5e8f/cp03-dragon-corpse 的 chapter.lcq.stage_05b.palace.done，六拍早已完成）。
    const chapter = /^chapter\..+\.done$/.test(key) && value === false && after.flags?.[key] === true
      && (after.chapters || []).find(c => (c.completion || []).some(cond => cond.path === `flags.${key}`));
    if (chapter && (chapter.eventIds || []).length && chapter.eventIds.every(id => completed.has(id))) continue;
    assert.deepEqual(after.flags?.[key], value, `${label} flags.${key} 被改`);
  }
  for (const [id, state] of Object.entries(before.eventActionStates || {})) {
    const next = after.eventActionStates?.[id];
    assert.ok(next, `${label} eventActionStates.${id} 丢了`);
    assert.ok((next.attemptCount || 0) >= (state.attemptCount || 0), `${label} ${id} attemptCount 减少`);
    for (const p of state.preparations || []) assert.ok(next.preparations?.includes(p), `${label} ${id} 丢了准备项 ${p}`);
    assert.deepEqual((next.attempts || []).map(a => a.actionId), (state.attempts || []).map(a => a.actionId), `${label} ${id} 尝试记录变了`);
  }
}

test('自检：shim 只服务 builtins/data，BUILTIN_SCENARIO_MODS = 内置关数 + 包内关数，且按 id 排序', () => {
  assert.equal(H.shimStats.builtinsCompiled, 1, 'builtins/index.ts 应当恰好被编译一次（并补上 require.context）');
  assert.equal(B.BUILTIN_SCENARIO_MODS.length, H.builtinDataFileCount() + CONTENT_PACKS.stages.length);
  const ids = B.BUILTIN_SCENARIO_MODS.map(m => m.manifest.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(ids).size, ids.length);
  for (const stage of CONTENT_PACKS.stages) assert.ok(ids.includes(stage.manifest.id), `包内关 ${stage.manifest.id}`);
});

test('自检：对照组——不补 require.context 时对账是 no-op（记 LCQ-SAV-044、不写 reconciledRegistryVersion）', () => {
  const harness = fileURLToPath(new URL('./loadReconcileChainHarness.mjs', import.meta.url));
  const script = `const H = await import(${JSON.stringify(harness)});
    const s = H.readFixtureSave('lines-replay/saiwai-mid.json'); delete H.rt(s).reconciledRegistryVersion;
    const v = H.uiButtons(await H.loadLikeGame(s, 'control')).view;
    process.stdout.write('@@' + JSON.stringify({ ver: H.rt(v).reconciledRegistryVersion ?? null, sav044: H.logStore.recent(1000).filter(e => e.code === 'LCQ-SAV-044').length, compiled: H.shimStats.builtinsCompiled }));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, LOAD_RECONCILE_CHAIN_NO_SHIM: '1' }, encoding: 'utf8', timeout: 120000 });
  const out = JSON.parse(child.stdout.split('@@').pop());
  assert.deepEqual(out, { ver: null, sav044: 1, compiled: 0 }, child.stderr.slice(-2000));
});

for (const relPath of [...LEGACY, ...SMALL]) {
  for (const bumpRegistry of [false, true]) {
    const variant = bumpRegistry ? 'registry 改版' : '原样';
    test(`${relPath}（${variant}）：读档对账不改既有进度、幂等、当前拍按钮能落账`, async () => {
      const pin = PINNED[relPath] || {};
      const { raw, live, buttons } = await runChain(relPath, { bumpRegistry });
      const before = rt(raw);

      if (pin.scene) {
        assert.equal(buttons.scene, true, '应当处在场面中');
        const advanced = H.quiet(() => R.advanceScenarioRuntime(live).saveData);
        assert.equal(reconcileOwned(advanced), reconcileOwned(live), '场面中 advance 提前返回，对账不跑');
        return;
      }
      const view = rt(buttons.view);
      // 对账真的执行了：版本被写成当前 registry 版本。
      assert.equal(view.reconciledRegistryVersion, REGISTRY_VERSION, 'reconciledRegistryVersion 未写上 → 对账没跑');
      assertReconcilePostconditions(relPath, live, buttons.view, rt(live).reconciledRegistryVersion !== REGISTRY_VERSION);
      // 既有值只增不改；进度不减。
      assertPreserved(`${relPath} 读档`, before, view);
      // 状态哈希与合同哈希：applyLoadRepairs 后错开的只能是无进度状态；advance（对账）后原本对得上的仍对得上，
      // 有进度的状态一律对得上（对不上 → 下一拍整拍重建 → 进度清零）。
      // applyLoadRepairs 后的错开来自 backfillMissingIntentMatch：给旧档补 intentMatch 改了合同哈希、不动状态哈希，且只对无进度的
      // 状态补（实测：playtest-cd16/stuck-s01-01 的 lcq.event.s01_01、song-retreat-legacy 的 lyl.event.s01_01）；随后的 advance
      // 把这种空状态按新合同重建，什么也不丢。
      const liveRuntime = rt(live);
      for (const id of incoherentStates(liveRuntime)) assert.ok(!H.hasProgress(liveRuntime.eventActionStates[id]), `${id} applyLoadRepairs 后有进度却哈希错开`);
      const coherentBefore = new Set(Object.keys(before.eventActionStates || {}).filter(id => !incoherentStates(before).includes(id)));
      const broken = incoherentStates(view);
      for (const id of broken) assert.ok(!H.hasProgress(view.eventActionStates[id]), `${id} 有进度但状态哈希对不上 → 下一拍会清零`);
      assert.deepEqual(broken.filter(id => coherentBefore.has(id)), [], '读档对账后新出现的哈希错开');
      // 幂等：再跑一遍 advance，对账负责的字段不再变化；对账各步直接再调一次，内容不变。
      // （migrateBatch6TextContracts 的返回值不能当「有没有变化」：sameDelivery 名单 / to=当前哈希 的事件每次都会把
      //  同一份合同重抄一遍并计数，所以比内容，不比返回值。）
      const again = H.quiet(() => R.advanceScenarioRuntime(buttons.view).saveData);
      assert.equal(reconcileOwned(again), reconcileOwned(buttons.view), '对账不幂等');
      const events = modById(view.modId)?.scenario.events || [];
      assert.ok(events.length, `内置模组里应有 ${view.modId}`);
      const probe = structuredClone(view), probeBefore = JSON.stringify(probe);
      R.migrateBatch6TextContracts(probe, events);
      assert.equal(JSON.stringify(probe), probeBefore, 'migrateBatch6TextContracts 再跑仍改了内容');
      assert.equal(R.backfillRuntimeEventRevealPresentations(probe, events), 0);
      assert.equal(R.backfillRuntimeWorldOmens(probe, events), 0);

      // 当前拍按钮。
      const button = H.pickButton(buttons);
      if (pin.noButton) { assert.equal(button, null, '应当没有当前拍按钮'); return; }
      assert.ok(button, '应当有当前拍按钮');
      if (button.kind === 'event') {
        const contract = view.events.find(e => e.id === button.selection.eventId)?.playerCompletionContract;
        if (contract) {
          assert.equal(button.selection.contractHash, H.contractHash(contract), '照抄的哈希函数与 runtime.ts 漂移');
          assert.equal(view.eventActionStates[button.selection.eventId]?.contractHash, button.selection.contractHash);
        }
      }
      const priorState = structuredClone(rt(live).eventActionStates?.[button.selection.eventId] || null);
      const { receipt, after } = H.clickButton(live, button);
      if (pin.firstClick) {
        assert.equal(receipt.reason, pin.firstClick, JSON.stringify(receipt));
        const second = H.pickButton(H.uiButtons(after));
        const retry = H.clickButton(after, second);
        assert.equal(retry.receipt.attempted, true, JSON.stringify(retry.receipt));
        return;
      }
      if (pin.idleOnly) {
        assert.ok(button.selection.actionId.startsWith('idle:'), JSON.stringify(button.selection));
        assert.deepEqual([receipt.attempted, receipt.completed], [true, false], JSON.stringify(receipt));
        return;
      }
      assert.ok(!button.selection.actionId?.startsWith('idle:'), `当前拍只有 idle 按钮：${JSON.stringify(button.selection)}`);
      if (button.kind === 'open_world') {
        assert.equal(receipt.settled, true, JSON.stringify(receipt));
        return;
      }
      assert.equal(receipt.attempted, true, JSON.stringify(receipt));
      assert.ok(!BAD_REASONS.includes(receipt.reason), JSON.stringify(receipt));
      const a = rt(after);
      if (receipt.completed) assert.ok(a.completedEventIds.includes(receipt.eventId), '完成了却没进 completedEventIds');
      else assert.ok((a.eventActionStates[receipt.eventId]?.attemptCount || 0) > (priorState?.attemptCount || 0), '未完成也应记一次尝试');
    });
  }
}

test('ningyu-current-contract：凝羽当前合同档，读档后准备项与尝试都在，点第二个动作完成这一拍', async () => {
  const { live, buttons } = await runChain('load-reconcile/ningyu-current-contract.json');
  const id = 'lcq.event.ningyu_regicide_offer', view = rt(buttons.view);
  assert.equal(R.getScenarioFocusEvent(view)?.id, id);
  assert.equal(H.contractHash(view.events.find(e => e.id === id).playerCompletionContract), '9e66a2a6');
  assert.deepEqual(view.eventActionStates[id].preparations, ['ningyu_regicide_price_heard']);
  assert.equal(view.eventActionStates[id].attemptCount, 1);
  assert.equal(view.eventActionStates[id].contractHash, '9e66a2a6');
  const button = H.pickButton(buttons);
  assert.equal(button.selection.actionId, 'trace_ningyu_cold_qi_source');
  const { receipt, after } = H.clickButton(live, button);
  assert.deepEqual([receipt.attempted, receipt.completed, receipt.reason], [true, true, undefined]);
  assert.ok(rt(after).completedEventIds.includes(id));
});

test('sheyi-d33e6b9d：蛇彝村 10-30～11-05 旧合同档，读档不迁移（迁移表 to≠当前哈希）、进度保留，点「安顿」完成', async () => {
  const { live, buttons } = await runChain('load-reconcile/sheyi-d33e6b9d-contract.json');
  const id = 'lcq.event.silent_sheyi_village', view = rt(buttons.view);
  assert.equal(R.getScenarioFocusEvent(view)?.id, id);
  assert.equal(H.contractHash(view.events.find(e => e.id === id).playerCompletionContract), 'd33e6b9d', '合同应停在旧版');
  assert.deepEqual(view.eventActionStates[id].preparations, ['sheyi_silence_confirmed']);
  assert.equal(view.eventActionStates[id].contractHash, 'd33e6b9d');
  assert.equal(view.reconciledRegistryVersion, REGISTRY_VERSION, '旧 registry 版本 → 对账整段跑过');
  const button = H.pickButton(buttons);
  assert.equal(button.selection.actionId, 'settle_caravan_in_silent_sheyi');
  assert.equal(button.selection.contractHash, 'd33e6b9d');
  const { receipt, after } = H.clickButton(live, button);
  assert.deepEqual([receipt.attempted, receipt.completed, receipt.reason], [true, true, undefined]);
  assert.ok(rt(after).completedEventIds.includes(id));
});

test('s02_04-68462843：s02_04 10-30～11-01 旧合同档，读档不迁移、探针进度保留，五原本地选择一次完成这一拍', async () => {
  const { live, buttons } = await runChain('load-reconcile/s02_04-68462843-contract.json');
  const id = 'lcq.event.s02_04', view = rt(buttons.view);
  assert.equal(R.getScenarioFocusEvent(view)?.id, id);
  assert.equal(H.contractHash(view.events.find(e => e.id === id).playerCompletionContract), '68462843', '合同应停在旧版');
  assert.deepEqual(view.eventActionStates[id].preparations, ['load_reconcile_probe']);
  assert.equal(view.eventActionStates[id].attemptCount, 1);
  assert.equal(buttons.eventActions.filter(a => a.eventId === id).length, 0, '有本地选择时界面隐去 s02_04 宽泛按钮');
  const button = H.pickButton(buttons);
  assert.equal(button.kind, 'open_world');
  const { receipt, after } = H.clickButton(live, button);
  assert.equal(receipt.settled, true, JSON.stringify(receipt));
  assert.equal(receipt.canonEventCompleted, true);
  assert.ok(rt(after).completedEventIds.includes(id));
});

test('迁移表条目：合同从 from 迁到 to 时，有进度的状态哈希同步到 to、进度保留（合成状态）', async () => {
  // c01-before-wuyuan-220 的 ins_ningyu_reply 存的是迁移表 from 版合同（f27676f0），但没有状态；这里在内存里补一个有进度的
  // from 状态（不改夹具），看读档对账把状态哈希跟着合同同步到 to（runtime.ts migrateBatch6TextContracts 的状态同步那一行）。
  const id = 'lcq.event.ningyu_regicide_offer_ins_ningyu_reply';
  const rev = CONTENT_PACKS.contractRevisions.find(r => r.eventId === id);
  const raw = H.readFixtureSave('checkpoints/c01-before-wuyuan-220.json');
  assert.equal(H.contractHash(rt(raw).events.find(e => e.id === id).playerCompletionContract), rev.from);
  const state = { contractHash: rev.from, attemptCount: 1, preparations: ['load_reconcile_probe'], attempts: [{ actionId: 'load_reconcile_probe' }] };
  (rt(raw).eventActionStates ||= {})[id] = structuredClone(state);
  const live = await H.loadLikeGame(raw, 'c01-synthetic');
  const view = rt(H.uiButtons(live).view);
  assert.equal(H.contractHash(view.events.find(e => e.id === id).playerCompletionContract), rev.to);
  assert.equal(view.eventActionStates[id].contractHash, rev.to, '状态哈希没跟着合同同步 → 下一拍整拍重建');
  assert.equal(view.eventActionStates[id].attemptCount, 1);
  assert.deepEqual(view.eventActionStates[id].preparations, state.preparations);
});

test('现状钉子：门禁注重复——每次 registry 重投影都给角色多加一条【关系身份门禁】（41465259 现状，不是应当如此）', async () => {
  // 原因（读代码）：characterResolver.ts 重投影时按 promptLayers.derivedNotePrefixes（mod-kit/prompt-layers.json）剥掉旧的派生注，
  // 而该表没有「【关系身份门禁】」，所以旧门禁注被当成玩家/LLM 写的注保留，buildNotes 又追加一条新的。读档对账一次 registry
  // 改版只跑一次，所以表现为每次 REGISTRY_VERSION 变化 +1 条（真机 10-31 档 playtest-cd16 的卓云君已有两条一样的）。
  // 不丢进度，只让人物注变长。修了（前缀表补上）这条会红：把期望改成「再投影一次不变」即可。
  const gateCounts = chars => (chars || []).map(c => (c?.profile?.notes || []).filter(n => String(n).startsWith('【关系身份门禁】')).length);
  const { buttons } = await runChain('checkpoints/current-han-entry.json', { bumpRegistry: true });
  const view = rt(buttons.view), once = gateCounts(view.canon.characters);
  const twice = structuredClone(view.canon.characters);
  H.quiet(() => resolveScenarioCharacters(twice, view.modId));
  const delta = gateCounts(twice).map((n, i) => n - once[i]);
  assert.ok(once.some(n => n === 1), '对账后应有带一条门禁注的角色');
  assert.deepEqual(delta.filter(d => d !== 0 && d !== 1), [], '每次重投影门禁注只多一条');
  assert.equal(delta.filter(d => d === 1).length, once.filter(n => n > 0).length, '带门禁注的角色再投影一次各多一条');
  const real = rt(H.readFixtureSave('playtest-cd16/stuck-s01-01.json')).canon.characters;
  assert.ok(gateCounts(real).some(n => n >= 2), '真机档里已经有重复的门禁注');
});

test('自检（收尾）：整份文件跑下来没有记过 LCQ-SAV-044（getReconcileDeps 从未降级）', () => {
  assert.equal(H.logStore.recent(100000).filter(e => e.code === 'LCQ-SAV-044').length, 0);
});
