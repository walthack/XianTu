import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('turn telemetry splits prepare, request, embeddings and retries', async () => {
  const tel = await loadTs('../src/utils/turnTelemetry.ts');
  tel.resetTurnTelemetryForTests();
  tel.beginTurnTelemetry('legacy_pilot');
  tel.noteRecallWait(12);
  tel.notePromptBytes(2048);
  tel.noteBufferedFullResponse(true);
  tel.noteGenerateStart({ provider: 'deepseek', model: 'flash', maxTokens: 2048, jsonObject: false });
  tel.noteGenerateStart({ provider: 'deepseek', model: 'flash', maxTokens: 2048, jsonObject: false });
  tel.noteStreamChunk('你好');
  tel.noteFirstSafeSentence();
  tel.noteGenerateComplete();
  tel.noteBackgroundStartedAfterCommit();
  const snapshot = tel.endTurnTelemetry();
  assert.equal(snapshot.path, 'legacy_pilot');
  assert.equal(snapshot.promptBytes, 2048);
  assert.equal(snapshot.retryCount, 1);
  assert.equal(snapshot.embeddingCountBeforeGenerate, 0);
  assert.equal(snapshot.embeddingCountTotal, 0);
  assert.equal(snapshot.jsonObject, false);
  assert.equal(snapshot.bufferedFullResponse, true);
  assert.equal(snapshot.backgroundStartedAfterCommit, true);
  assert.ok(snapshot.requestStartedAt);
  assert.ok(snapshot.firstContentAt);
  assert.ok(snapshot.firstSafeSentenceAt);
  assert.ok(snapshot.responseCompletedAt);
  assert.equal(tel.getActiveTurnTelemetry(), null);
});

test('embedding calls before generate are counted separately from later ones', async () => {
  const tel = await loadTs('../src/utils/turnTelemetry.ts');
  tel.resetTurnTelemetryForTests();
  tel.markEmbeddingCall();
  tel.beginTurnTelemetry('legacy');
  tel.markEmbeddingCall();
  tel.noteGenerateStart();
  tel.markEmbeddingCall();
  tel.noteGenerateComplete();
  const snapshot = tel.endTurnTelemetry();
  assert.equal(snapshot.embeddingCountBeforeGenerate, 2);
  assert.equal(snapshot.embeddingCountTotal, 3);
});
