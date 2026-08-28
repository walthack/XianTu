import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const STORY = 'renderGuard.forbiddenTerms=暗道\nrenderGuard.reservedFutureTerms=月霜|王哲传功';
const ON = { getItem: key => (key === 'xiantu.legacyNarrativePilot.s01_01.v1' ? 'true' : null) };

async function openingPacket() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const { compileLegacyNarratorPacket } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const selection = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  const plan = planLegacyNarrativePilot({
    saveData: save,
    eventAction: selection,
    eventActionProvenance: 'selected',
    storage: ON,
  });
  return compileLegacyNarratorPacket(save, plan, STORY, '叙述者配置', '主角性格：谨慎');
}

async function makeStream(overrides = {}) {
  const { createLegacySentenceStream } = await loadTs('../src/modules/scenarioMods/legacySentenceStream.ts');
  const { resetTurnTelemetryForTests, beginTurnTelemetry, getActiveTurnTelemetry } = await loadTs('../src/utils/turnTelemetry.ts');
  const compiled = await openingPacket();
  resetTurnTelemetryForTests();
  beginTurnTelemetry('legacy_pilot');
  const emitted = [];
  const stream = createLegacySentenceStream({
    userInput: '我稳住自己并弄清身在何处',
    storyPrompt: STORY,
    packet: compiled.packet,
    mustNotAppear: compiled.packet.mustNotAppear,
    onSafeText: (delta, displayed) => emitted.push({ delta, displayed }),
    ...overrides,
  });
  return { stream, emitted, getActiveTurnTelemetry, packet: compiled.packet };
}

test('holds one sentence then emits the first safe sentence before the model finishes', async () => {
  const { stream, emitted, getActiveTurnTelemetry } = await makeStream();
  stream.push('你撑着湿草站起来。');
  assert.deepEqual(emitted, []);
  stream.push('风里有铁锈味。');
  assert.equal(emitted.map(item => item.delta).join(''), '你撑着湿草站起来。');
  assert.ok(getActiveTurnTelemetry().firstSafeSentenceAt);
  const done = stream.finish();
  assert.ok(done.text.includes('你撑着湿草站起来。'));
  assert.ok(done.text.includes('段强'));
});

test('a reserved-future sentence and everything after it stay off screen', async () => {
  const { stream, emitted } = await makeStream();
  stream.push('你撑着湿草站起来。风里有铁锈味。月霜从马上跃下。段强还在喘气。');
  const done = stream.finish();
  assert.equal(emitted.map(item => item.delta).join('').includes('月霜'), false);
  assert.equal(done.text.includes('月霜'), false);
  assert.equal(done.stopped, true);
  assert.equal(done.usedFallback, true);
  assert.match(done.text, /你撑着湿草站起来。/);
  assert.equal(done.text.includes('本轮只呈现已经确认的公开动静'), false);
});

test('cross-sentence confirmation of a forbidden term stops the confirming sentence', async () => {
  const { stream } = await makeStream();
  stream.push('草坡后是否另有暗道？');
  stream.push('确有一条通往北阙。');
  const done = stream.finish();
  assert.equal(done.text.includes('确有一条'), false);
  assert.equal(done.stopped, true);
});

const SYSTEM_REGISTER_SNIPPETS = [
  '没有被写成别的结局',
  '没有凭空多出兵器',
  '没有新的刀剑，也没有忽然换到另一座城',
  '气血仍是100/100，没有新的创口被写进这一刻',
  '公开动静',
  '改写范围',
  '事件结束',
  '落账',
  '选择权交还',
  '你已亲自执行',
  '气血100/100',
  '公开事实',
];

test('empty model output fails closed to a rich local s01_01 body, not a tiny template', async () => {
  const { countVisibleNarrativeChars, buildLegacySafeNarrative } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const { stream, packet } = await makeStream();
  const done = stream.finish();
  const chars = countVisibleNarrativeChars(done.text);
  const displayed = stream.getDisplayed().trim();
  console.log(`s01_01 fallback chars=${chars} displayed===returned=${done.text === displayed} ends=${JSON.stringify(done.text.slice(-1))}`);
  assert.equal(done.usedFallback, true);
  assert.ok(chars >= 800, chars);
  assert.ok(chars <= 1000, chars);
  assert.match(done.text, /你/);
  assert.match(done.text, /段强/);
  assert.match(done.text, /草原|草地/);
  assert.match(done.text, /稳住/);
  assert.match(done.text, /弄清|辨认|处境|身在何处/);
  assert.match(done.text, /[。！？]$/);
  assert.equal(done.text.includes('本轮只呈现已经确认的公开动静'), false);
  assert.equal(done.text.includes('事件完成真值'), false);
  for (const snippet of SYSTEM_REGISTER_SNIPPETS) {
    assert.equal(done.text.includes(snippet), false, snippet);
  }
  assert.equal(done.text.includes('热衷幻想'), false);
  assert.equal(done.text.includes('缺乏现实感'), false);
  assert.equal(done.text.includes('易恐惧'), false);
  assert.equal(done.text, displayed);

  const direct = buildLegacySafeNarrative(packet);
  const directChars = countVisibleNarrativeChars(direct);
  console.log(`s01_01 buildLegacySafeNarrative chars=${directChars} ends=${JSON.stringify(direct.slice(-1))}`);
  assert.ok(directChars >= 800, directChars);
  assert.ok(directChars <= 1000, directChars);
  assert.match(direct, /[。！？]$/);
  assert.match(direct, /段强/);
  assert.match(direct, /草原|草地/);
  assert.match(direct, /稳住/);
  assert.match(direct, /弄清|辨认|处境|身在何处/);
  for (const snippet of SYSTEM_REGISTER_SNIPPETS) {
    assert.equal(direct.includes(snippet), false, snippet);
  }
});

test('player-visible meta leaks are invalid even when the rest of the sentence is scene-like', async () => {
  const { validateLegacyVisibleNarrative, buildLegacySafeNarrative } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const { packet } = await makeStream();
  const leaks = [
    '他还在你看得见的地方，没有消失，也没有被写成别的结局。',
    '那些声音会把人往前拽。你没有跟着它走，只把它们当成必须记住的公开动静。',
    '远处的喊杀仍在继续。它不属于你此刻就能改写的范围。',
    '你没有宣布任何事件结束，也没有把未发生的事说成已经落账。',
    '就在这一停顿里，世界把选择权交还给你：你可以再看。',
    '你把能确定的公开事实又在心里过了一遍。',
    '你已亲自执行寻找降落地点。',
    '你身上气血仍是100/100，没有新的创口被写进这一刻。',
    '【当前状态】气血：100/100',
  ];
  for (const sample of leaks) {
    const check = validateLegacyVisibleNarrative(sample, packet, { partial: true });
    assert.equal(check.valid, false, sample);
  }
  const safe = buildLegacySafeNarrative(packet);
  assert.equal(validateLegacyVisibleNarrative(safe, packet).valid, true, validateLegacyVisibleNarrative(safe, packet).issues.join(','));
});

test('three review counterexamples are rejected or replaced and never succeed as model text', async () => {
  const { validateLegacyVisibleNarrative, countVisibleNarrativeChars } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const { packet } = await makeStream();
  const invented = '你从草地站起。你捡起一柄神兵。你已走到五原城。你与段强结为生死兄弟。';
  const tooShort = '你站稳脚步，四下看了看。';
  const internal = '你已亲自执行寻找降落地点。事件完成真值将由本地引擎落账。';

  assert.equal(validateLegacyVisibleNarrative(invented, packet).valid, false);
  assert.equal(validateLegacyVisibleNarrative(tooShort, packet).valid, false);
  assert.equal(validateLegacyVisibleNarrative(internal, packet).valid, false);

  for (const sample of [invented, tooShort, internal]) {
    const { stream } = await makeStream();
    stream.push(sample);
    const done = stream.finish();
    assert.equal(done.text.includes('神兵'), false, done.text);
    assert.equal(done.text.includes('五原城'), false, done.text);
    assert.equal(done.text.includes('生死兄弟'), false, done.text);
    assert.equal(done.text.includes('事件完成真值'), false, done.text);
    assert.equal(done.text.includes('本地引擎落账'), false, done.text);
    assert.notEqual(done.text.trim(), tooShort);
    assert.ok(countVisibleNarrativeChars(done.text) >= 800, done.text);
    assert.equal(done.text, stream.getDisplayed().trim());
    assert.match(done.text, /你/);
  }
});

test('hard 1000-character cap applies during streaming and displayed equals returned', async () => {
  const { countVisibleNarrativeChars, validateLegacyVisibleNarrative } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const { stream, packet } = await makeStream();
  const sentence = '你在草坡上稳住呼吸，继续把眼前能看见的风、土和人看清楚。';
  let payload = '';
  while (countVisibleNarrativeChars(payload) < 1400) payload += sentence;
  stream.push(payload);
  const done = stream.finish();
  const displayed = stream.getDisplayed().trim();
  assert.equal(done.text, displayed);
  assert.ok(countVisibleNarrativeChars(done.text) <= 1000, countVisibleNarrativeChars(done.text));
  assert.ok(countVisibleNarrativeChars(done.text) >= 800, countVisibleNarrativeChars(done.text));
  const complete = validateLegacyVisibleNarrative(done.text, packet);
  assert.equal(complete.valid, true, complete.issues.join(','));
});

test('stream reserves room to close missing required concepts before the hard cap', async () => {
  const { countVisibleNarrativeChars, validateLegacyVisibleNarrative } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const { stream, packet } = await makeStream();
  const sentence = '你在草坡上看着风吹过，没有急着迈步，只把眼前的烟尘看得更清楚。';
  let payload = '';
  while (countVisibleNarrativeChars(payload) < 1400) payload += sentence;
  stream.push(payload);
  const done = stream.finish();
  const check = validateLegacyVisibleNarrative(done.text, packet);
  assert.equal(check.valid, true, check.issues.join(','));
  assert.match(done.text, /段强/);
  assert.match(done.text, /中州|草原|草地/);
  assert.match(done.text, /稳住/);
  assert.match(done.text, /弄清|辨认|处境|身在何处/);
  assert.ok(countVisibleNarrativeChars(done.text) >= 800);
  assert.ok(countVisibleNarrativeChars(done.text) <= 1000);
  assert.equal(done.text, stream.getDisplayed().trim());
});

test('full-text validator requires 段强, grassland landing, and stabilize/orient cues, not personality tags', async () => {
  const { validateLegacyVisibleNarrative, buildLegacySafeNarrative, countVisibleNarrativeChars } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const { packet } = await makeStream();
  const safe = buildLegacySafeNarrative(packet);
  const ok = validateLegacyVisibleNarrative(safe, packet);
  assert.equal(ok.valid, true, ok.issues.join(','));
  assert.match(safe, /段强/);
  assert.match(safe, /草原|草地/);
  assert.equal(narrativeHasGoal(safe), true);
  assert.equal(safe.includes('热衷幻想'), false);
  assert.equal(packet.mustAppear.present.includes('段强'), true);
  assert.equal(JSON.stringify(packet.mustAppear).includes('热衷幻想'), false);

  const unit = '你在草地上看着段强喘气。';
  let missingGoal = '';
  while (countVisibleNarrativeChars(missingGoal) < 800) missingGoal += unit;
  const missing = validateLegacyVisibleNarrative(missingGoal, packet);
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some(issue => issue.includes('当前目标语义')));
  assert.ok(countVisibleNarrativeChars(missingGoal) >= 800);
  assert.ok(countVisibleNarrativeChars(missingGoal) <= 1000);
});

function narrativeHasGoal(text) {
  return /稳住/.test(text) && /弄清|辨认|处境|身在何处/.test(text);
}
