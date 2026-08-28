import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const STORY = 'renderGuard.forbiddenTerms=暗道\nrenderGuard.reservedFutureTerms=月霜|王哲传功';

async function makeStream() {
  const { createLegacySentenceStream } = await loadTs('../src/modules/scenarioMods/legacySentenceStream.ts');
  const { resetTurnTelemetryForTests, beginTurnTelemetry, getActiveTurnTelemetry } = await loadTs('../src/utils/turnTelemetry.ts');
  resetTurnTelemetryForTests();
  beginTurnTelemetry('legacy_pilot');
  const emitted = [];
  const stream = createLegacySentenceStream({
    userInput: '我稳住自己并弄清身在何处',
    storyPrompt: STORY,
    mustNotAppear: ['月霜', '王哲传功'],
    onSafeText: delta => emitted.push(delta),
  });
  return { stream, emitted, getActiveTurnTelemetry };
}

test('holds one sentence then emits the first safe sentence before the model finishes', async () => {
  const { stream, emitted, getActiveTurnTelemetry } = await makeStream();
  stream.push('你撑着湿草站起来。');
  assert.deepEqual(emitted, []);
  stream.push('风里有铁锈味。');
  assert.equal(emitted.join(''), '你撑着湿草站起来。');
  assert.ok(getActiveTurnTelemetry().firstSafeSentenceAt);
  const done = stream.finish();
  assert.equal(done.usedFallback, false);
  assert.equal(done.text, '你撑着湿草站起来。风里有铁锈味。');
});

test('a reserved-future sentence and everything after it stay off screen', async () => {
  const { stream, emitted } = await makeStream();
  stream.push('你撑着湿草站起来。风里有铁锈味。月霜从马上跃下。段强还在喘气。');
  const done = stream.finish();
  assert.equal(emitted.join('').includes('月霜'), false);
  assert.equal(done.text.includes('月霜'), false);
  assert.equal(done.stopped, true);
  assert.equal(done.usedFallback, true);
  assert.match(done.text, /你撑着湿草站起来。/);
  assert.match(done.text, /本轮只呈现已经确认的公开动静/);
});

test('cross-sentence confirmation of a forbidden term stops the confirming sentence', async () => {
  const { stream } = await makeStream();
  stream.push('草坡后是否另有暗道？');
  stream.push('确有一条通往北阙。');
  const done = stream.finish();
  assert.equal(done.text.includes('确有一条'), false);
  assert.equal(done.stopped, true);
});

test('empty model output fails closed to the local wrap-up', async () => {
  const { stream } = await makeStream();
  const done = stream.finish();
  assert.equal(done.usedFallback, true);
  assert.match(done.text, /本轮只呈现已经确认的公开动静/);
});
