// work/ASK-USER.md Q22 方案 B（草稿·待用户批准）：判拍引用 ev 超过 evidenceMaxChars（24）但与玩家原话逐字一致时，不作废，
// 取前 24 字继续走后面的检查；ev 为空或与原话对不上照旧 bad_evidence；24 字以内行为不变。
// 用例句子取自真机长跑（work/realchain-task/real-side.json、real-linan2.json 的 typed 与 judgeReplies[0]）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = fn => { const log = console.log, info = console.info, warn = console.warn; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { Object.assign(console, { log, info, warn }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const ec = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const cr = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const NI = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const QC = GAME_NUMBERS.story.quest;
const MAX = QC.intentSettle.beatJudge.evidenceMaxChars;

const MOD = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_04.json'))));
cr.resolveScenarioCharacters(MOD.canon?.characters, MOD.manifest.id);
// 南荒第一拍（初始化后焦点 s04_02，本拍动作 advance_declared_objective）。
const newSave = () => quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MOD))).saveData);
const NONE = JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets: [] });
async function judge(text, raw) {
  const prev = QC.enabled; QC.enabled = true;
  try {
    const save = newSave();
    assert.equal(R.getScenarioFocusEvent(save.世界.状态.剧本模组).id, 'lcq.event.s04_02');
    assert.equal(BP.resolveBeatText(save, text), undefined, '按字链对不上，才交给判拍');
    assert.deepEqual(BP.beatKeyTurn(save, text)?.actions.map(a => a.id), ['advance_declared_objective']);
    let beat = 0;
    const result = await NI.resolveNaturalIntent({
      saveData: save, playerText: text, selected: null, resolveFromText: NI.resolveStoryEventActionFromText,
      generate: async () => NONE,
      generateBeat: async () => { beat++; return { raw, inputTokens: 200, outputTokens: 30 }; },
    });
    assert.equal(beat, 1);
    return result;
  } finally { QC.enabled = prev; }
}
const settled = result => result.kind === 'matched' && result.reason === 'beat_intent' && result.selection.actionId === 'advance_declared_objective';

// real-side.json 第 74 手：原句、回包逐字（引用 25 字，被作废、没推进）。
const SIDE74 = { typed: '这一步，我问苏荔这趟送亲的安排，把各族与鬼王峒的关系问清楚。', reply: '{"id":"advance_declared_objective","c":"high","ev":"我问苏荔这趟送亲的安排，把各族与鬼王峒的关系问清楚","neg":false,"r":"social"}' };
// 另两例真机原句与引用（引用 32、34 字），id 换成本拍动作。
const LINAN9 = { typed: '这一步，我让青面兽背起整摊供香，摆出挥金如土的外地富商模样，从容走进明庆寺。', ev: '让青面兽背起整摊供香，摆出挥金如土的外地富商模样，从容走进明庆寺' };
const SIDE78 = { typed: '这一步，我留在现场见证易虎以千斤坠硬扛洪峰，继而被巨石正中胸口并遭洪水吞没。', ev: '我留在现场见证易虎以千斤坠硬扛洪峰，继而被巨石正中胸口并遭洪水吞没。' };
const reply = ev => JSON.stringify({ id: 'advance_declared_objective', c: 'high', ev, neg: false, r: 'none' });

test('超长但与原话逐字一致：不作废，按前 24 字截取后结算，evidenceLength 记截取后的长度', async () => {
  assert.equal(MAX, 24);
  assert.equal(JSON.parse(SIDE74.reply).ev.length, 25);
  for (const [text, raw] of [[SIDE74.typed, SIDE74.reply], [LINAN9.typed, reply(LINAN9.ev)], [SIDE78.typed, reply(SIDE78.ev)]]) {
    const result = await judge(text, raw);
    assert.ok(settled(result), `${text} → ${JSON.stringify({ kind: result.kind, reason: result.reason })}`);
    assert.deepEqual(result.beatIntent, { certainty: 'high', evidenceLength: MAX });
  }
});

test('超长且与原话对不上（漏字）：照旧作废，不结算', async () => {
  const broken = LINAN9.ev.replace('整摊', '整');
  assert.ok(broken.length > MAX && !LINAN9.typed.includes(broken));
  assert.ok(!settled(await judge(LINAN9.typed, reply(broken))));
  // 前 24 字逐字一致、后半段对不上：也不算逐字一致。
  const tail = LINAN9.ev.slice(0, MAX) + '然后转身离开了明庆寺';
  assert.ok(!settled(await judge(LINAN9.typed, reply(tail))));
});

test('24 字以内行为不变：逐字一致结算；对不上、为空不结算', async () => {
  // real-linan2.json 第 1 手的引用长度级别（12 字），这里用南荒原句里的一段。
  const short = '我问苏荔这趟送亲的安排';
  const ok = await judge(SIDE74.typed, reply(short));
  assert.ok(settled(ok));
  assert.deepEqual(ok.beatIntent, { certainty: 'high', evidenceLength: short.length });
  assert.ok(!settled(await judge(SIDE74.typed, reply('我问苏荔这趟送嫁的安排'))));
  assert.ok(!settled(await judge(SIDE74.typed, reply(''))));
});
