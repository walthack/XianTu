// NPC 角色卡有界层接入模块化路径：真实 tryModularTurn 管线（模型调用被截获，不联网），存档来自引擎主线夹具。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { walkMainline } from './baihuMainlineWalk.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});
const load = rel => jiti.import(new URL(rel, import.meta.url).pathname);

const NING_YU = 'liuchao.character.ning_yu';
const YEAO = 'lcq.character.nanhuang_yeao';
const LE_MINGZHU = 'liuchao.character.le_mingzhu';
const QUIET = ['log', 'info', 'warn', 'debug'];

const rt = await load('../src/modules/scenarioMods/runtime.ts');
const packet = await load('../src/modules/scenarioMods/legacyNarratorPacket.ts');
const cardLayer = await load('../src/modules/scenarioMods/npcCardLayer.ts');
const storyContext = await load('../src/modules/scenarioMods/storyContext.ts');
const { GAME_NUMBERS } = await load('../src/modules/sceneModule/numbers.ts');
const cfg = GAME_NUMBERS.npcCard;

// 夹具：只走一次主线，留下 Y6（凝羽门前）与各关首个存档。
const stages = {};
let y6;
const quiet = () => { const saved = {}; for (const k of QUIET) { saved[k] = console[k]; console[k] = () => {}; } return () => Object.assign(console, saved); };
{
  const restore = quiet();
  try {
    await walkMainline(save => {
      const r = save.世界.状态.剧本模组;
      stages[r.modId] ||= structuredClone(save);
      if (!y6 && rt.getCurrentStoryExplorationActions(save).some(a => /ningyu_stays_ins_ningyu_door$/.test(a.eventId))) y6 = structuredClone(save);
    });
  } finally { restore(); }
}
assert.ok(y6, 'fixture: Y6 snapshot');

const runtimeOf = save => save.世界.状态.剧本模组;
const stanceOfFav = fav => (fav <= -10 ? 'low' : fav >= 40 ? 'high' : 'mid');
/** 夹具设值：把所有 NPC 的好感/标签/持久化姿态设为同一值。 */
function withAffinity(save, fav, label) {
  const next = structuredClone(save);
  const r = runtimeOf(next);
  r.stanceStates ||= {};
  for (const [id, npc] of Object.entries(next.社交.关系 || {})) {
    npc.好感度 = fav;
    if (label) npc.与玩家关系 = label;
    r.stanceStates[id] = { ...(r.stanceStates[id] || {}), stance: stanceOfFav(fav) };
  }
  return next;
}

async function capture(save, userMessage, eventAction) {
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  useAPIManagementStore().apiConfigs = [{ id: 'default', name: 'fixture', provider: 'custom', url: 'https://example.invalid/v1', apiKey: 'fixture-not-a-real-key', model: 'fixture', enabled: true }];
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { aiService } = await load('../src/services/aiService.ts');
  const calls = [];
  const original = { generate: aiService.generate, generateRaw: aiService.generateRaw };
  aiService.generate = async options => { calls.push(options); return '你站在门外，没有再向前一步。门内的人沉默了片刻，终于低声回应了你。'; };
  aiService.generateRaw = async () => { throw new Error('unexpected generateRaw'); };
  const restore = quiet();
  try {
    await AIBidirectionalSystem.tryModularTurn(structuredClone(save),
      { ...(eventAction ? { eventAction, eventActionProvenance: 'selected' } : {}), playerIntentText: userMessage }, 'npc-card-test', () => false, userMessage);
  } finally { restore(); Object.assign(aiService, original); }
  assert.ok(calls.length >= 1, 'a model request was captured');
  const system = calls[0].injects[0].content;
  const from = system.indexOf('\n场景材料：') + '\n场景材料：'.length;
  return { system, scene: JSON.parse(system.slice(from, system.indexOf('\n历史摘录（'))) };
}

const knock = () => rt.getCurrentStoryExplorationActions(y6).find(a => /y6_knock$/.test(a.eventId));
const cardChars = actors => actors.reduce((total, actor) => total + (actor.card || []).join('').length, 0);
const actorOf = (scene, id) => scene.presentActors.find(actor => actor.characterId === id);
const FREE_TEXT = '凝羽，我知道你还没睡。这几天的事，是我欠你一句交代。';

/** 放大存档：编年史、NPC 记录数、每人记忆条数；t300 是合成上界，不是自然游玩状态。 */
function grown(save, scale) {
  const next = structuredClone(save);
  const r = runtimeOf(next);
  if (scale === 'turn10') r.chronicle = r.chronicle.slice(0, 8);
  if (scale === 'turn300') {
    const base = r.chronicle;
    while (r.chronicle.length < 300) { const entry = structuredClone(base[r.chronicle.length % base.length]); entry.id += '.sim' + r.chronicle.length; entry.sequence = r.chronicle.length + 1; r.chronicle.push(entry); }
    const entries = Object.entries(next.社交.关系);
    for (let i = 0; Object.keys(next.社交.关系).length < 60; i++) { const copy = structuredClone(entries[i % entries.length][1]); copy.角色ID = 'npc.local.sim' + i; next.社交.关系['npc.local.sim' + i] = copy; }
    for (const npc of Object.values(next.社交.关系)) { npc.记忆 = [...(npc.记忆 || [])]; while (npc.记忆.length < 40) npc.记忆.push('模拟记忆条目'.repeat(40) + npc.记忆.length); }
  }
  return next;
}

test('(a) 角色卡上下文有界：第 10/100/300 回合规模下都不超过 config 上限，且不随存档增长', async () => {
  const sizes = {};
  for (const [turn, scale] of [[10, 'turn10'], [100, 'turn100'], [300, 'turn300']]) {
    const save = withAffinity(grown(y6, scale), 25, '相识');
    for (const [kind, text, action] of [['button', knock().playerLine, knock()], ['free', FREE_TEXT, undefined]]) {
      const { scene } = await capture(save, text, action);
      const carded = scene.presentActors.filter(actor => actor.card?.length);
      assert.ok(carded.length >= 1 && carded.length <= cfg.maxCards, `${turn}/${kind}: carded actors ${carded.length}`);
      for (const actor of carded) assert.ok(actor.card.join('').length <= cfg.maxCardChars, `${turn}/${kind}: ${actor.name} card ${actor.card.join('').length}`);
      sizes[`${turn}/${kind}`] = cardChars(scene.presentActors);
    }
  }
  assert.ok(Object.values(sizes).every(size => size <= cfg.maxCards * cfg.maxCardChars), JSON.stringify(sizes));
  // 同一输入下，300 回合比 10 回合多出的卡片字数不超过“记忆 N 条 + 事件 N 条”的满额预算（t300 的合成记忆每条都顶满字数上限）。
  const slack = cfg.maxMemories * cfg.memoryChars + cfg.maxEvents * cfg.eventChars;
  assert.ok(sizes['300/button'] <= sizes['10/button'] + slack, JSON.stringify(sizes));
  assert.ok(sizes['300/free'] <= sizes['10/free'] + slack, JSON.stringify(sizes));
});

test('(a2) 记忆只取最近 N 条、事件只取最近 N 条，且按角色 id 关联事件', () => {
  const save = withAffinity(grown(y6, 'turn300'), 25, '相识');
  const { card } = cardLayer.readNpcCard(save, NING_YU);
  const memoryLine = card.find(line => line.startsWith('最近记忆：'));
  const eventLine = card.find(line => line.startsWith('相关重大事件：'));
  const record = save.社交.关系[NING_YU];
  assert.ok(memoryLine && memoryLine.split('；').length === cfg.maxMemories);
  assert.ok(memoryLine.includes(String(record.记忆[record.记忆.length - 1]).slice(0, 10)) || memoryLine.includes('模拟记忆条目'));
  assert.ok(!memoryLine.includes(String(record.记忆[0])), 'oldest memory is not carried');
  assert.ok(eventLine && eventLine.replace('相关重大事件：', '').split('；').length <= cfg.maxEvents);
  // 事件按 relatedCharacterIds 关联：叶媪事件与凝羽共享，无关人物的事件不应出现。
  const related = new Set(runtimeOf(save).events.filter(e => (e.relatedCharacterIds || []).includes(NING_YU)).map(e => e.name));
  for (const part of eventLine.replace('相关重大事件：', '').split('；')) assert.ok([...related].some(name => part.startsWith(name)), part);
});

test('(b) 自由输入回合有场景内 actor（含无候选回落），修复前是空', async () => {
  const save = withAffinity(y6, 25, '相识');
  const { scene } = await capture(save, FREE_TEXT, undefined);
  const ids = scene.presentActors.map(actor => actor.characterId);
  assert.ok(ids.includes(NING_YU) && ids.includes(YEAO), JSON.stringify(scene.presentActors.map(a => a.name)));
  assert.ok(scene.present.length >= 2);
  // 无任何候选的自由输入：由代码声明的在场人物回落（questLineContext），不超过 config 上限。
  let quietSave;
  const restore = quiet();
  try {
    await walkMainline(s => {
      if (quietSave) return;
      const candidates = [...rt.getCurrentStoryEventActions(s), ...rt.getCurrentStoryExplorationActions(s)];
      if (candidates.length) return;
      const capsule = packet.readLocalMemoryCapsule(structuredClone(s), candidates[0], candidates.slice(1));
      if (capsule.presentActors.length) quietSave = { save: structuredClone(s), capsule };
    });
  } finally { restore(); }
  assert.ok(quietSave, 'a no-candidate state with declared present actors exists on the mainline');
  assert.ok(quietSave.capsule.presentActors.length <= cfg.maxFallbackActors);
  const { scene: quietScene } = await capture(quietSave.save, '我四下看看，和身边的人说两句话。', undefined);
  assert.deepEqual(quietScene.presentActors.map(a => a.name), quietSave.capsule.presentActors.map(a => a.name));
});

test('(c) 按钮回合卡片按 id 解析出名字与画像字段，不再把 id 当名字', async () => {
  const { scene } = await capture(withAffinity(y6, 25, '相识'), knock().playerLine, knock());
  assert.deepEqual(scene.present, ['凝羽', '叶媪']);
  for (const actor of scene.presentActors) assert.ok(!/^(?:liuchao|lcq)\./.test(actor.name), actor.name);
  const ningyu = actorOf(scene, NING_YU);
  assert.equal(ningyu.name, '凝羽');
  assert.ok(ningyu.traits.length > 0 && ningyu.appearance && ningyu.role, JSON.stringify(ningyu));
  assert.ok(ningyu.speechStyle, 'speech style comes from the registry when the stage profile has none');
  assert.ok(ningyu.card.length >= 3);
});

test('(d) 低好感与高好感立场行不同（同一角色、同一输入）', async () => {
  const low = (await capture(withAffinity(y6, -15, '陌生'), knock().playerLine, knock())).scene;
  const high = (await capture(withAffinity(y6, 70, '信重'), knock().playerLine, knock())).scene;
  const lowStance = actorOf(low, NING_YU).card[0];
  const highStance = actorOf(high, NING_YU).card[0];
  assert.notEqual(lowStance, highStance);
  assert.match(lowStance, /陌生|敌|疏/);
  assert.ok(lowStance.includes('拉开距离') && !highStance.includes('拉开距离'));
  assert.ok(highStance.includes('投入程度提高') && !lowStance.includes('投入程度提高'));
  // 角色专属形态（凝羽高好感仍口是心非）随档位出现。
  assert.ok(lowStance.includes('本人姿态形态') && highStance.includes('本人姿态形态'));
  assert.notEqual(lowStance.split('本人姿态形态')[1], highStance.split('本人姿态形态')[1]);
});

test('阶段门：南荒关对凝羽底线的阻挡原样保留；有【底线】的关按好感门控', () => {
  // 05b：画像无【底线】。即使存档里的 人格底线 已被投影、好感 100，卡片也不得带出。
  const south = withAffinity(y6, 100, '信重');
  assert.ok(south.社交.关系[NING_YU].人格底线?.length, 'fixture: record-level bottom line exists');
  const southCard = cardLayer.readNpcCard(south, NING_YU).card.join('\n');
  for (const line of south.社交.关系[NING_YU].人格底线) assert.ok(!southCard.includes(line), `stage gate leaked: ${line}`);
  assert.ok(!southCard.includes('【底线】'));
  // stage_02：画像带【底线】——好感够才揭示，否则只给“尚未摸透”。
  const open = withAffinity(stages['lcq.stage_02'], 70, '信重');
  const closed = withAffinity(stages['lcq.stage_02'], -15, '陌生');
  const profile = runtimeOf(open).canon.characters.find(c => c.id === NING_YU).profile;
  const bottom = profile.notes.find(n => n.startsWith('【底线】'));
  assert.ok(bottom, 'fixture: stage_02 ningyu has 【底线】');
  assert.ok(cardLayer.readNpcCard(open, NING_YU).card.some(line => line.startsWith(bottom.slice(0, 20))));
  const closedCard = cardLayer.readNpcCard(closed, NING_YU).card;
  assert.ok(closedCard.includes(storyContext.BOTTOMLINE_HIDDEN_NOTE) && !closedCard.some(line => line.startsWith(bottom.slice(0, 20))));
});

test('承重角色保护：未完成的关键事件所系人物带保护行，事件完成后消失', () => {
  const save = withAffinity(y6, 25, '相识');
  const r = runtimeOf(save);
  assert.ok(!cardLayer.readNpcCard(save, NING_YU).card.some(line => line.includes('承重角色保护')), 'fixture: not load-bearing by default');
  const event = r.events.find(e => (e.relatedCharacterIds || []).includes(NING_YU) && !r.completedEventIds.includes(e.id));
  event.critical = true;
  assert.ok(cardLayer.readNpcCard(save, NING_YU).card.some(line => line.includes('承重角色保护') && line.includes('凝羽')));
  r.completedEventIds.push(event.id);
  assert.ok(!cardLayer.readNpcCard(save, NING_YU).card.some(line => line.includes('承重角色保护')));
});

test('封口人物（身份未揭示）只给旧路径的封口行，不带注册表谈吐/立场/底线', () => {
  const save = withAffinity(stages['lcq.stage_04'], 100, '信重');
  const veiled = runtimeOf(save).canon.characters.find(c => c.id === LE_MINGZHU);
  assert.ok(veiled && veiled.name !== '乐明珠', 'fixture: veiled in stage_04');
  const layer = cardLayer.readNpcCard(save, LE_MINGZHU);
  assert.equal(layer.card.length, 1);
  assert.ok(layer.card[0].includes('只使用当下已揭示身份'));
  assert.equal(layer.speechStyle, undefined);
});

test('封口人物不会在模型材料里获得谈吐补位', () => {
  const save = withAffinity(stages['lcq.stage_04'], 100, '信重');
  const capsule = packet.readLocalMemoryCapsule(save, undefined, []);
  for (const actor of capsule.presentActors) if (actor.characterId === LE_MINGZHU) assert.ok(!actor.speechStyle);
});
