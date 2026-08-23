import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

async function loadContract() {
  return loadTs('../src/modules/scenarioMods/fastNarrativeDemoBeatContract.ts');
}

const OUTCOMES = ['critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect'];
const LOCATIONS = ['scene_held', 'on_ground', 'at_corpse'];
const EXPECTED_LOCATION = {
  perfect: 'scene_held',
  great_success: 'scene_held',
  success: 'scene_held',
  partial: 'on_ground',
  failure: 'at_corpse',
  critical_failure: 'at_corpse',
};
const STYLE_A = { pace: 'sudden', sensory: 'grass', cadence: 'short', focus: 'motion' };
const STYLE_B = { pace: 'delayed', sensory: 'dust', cadence: 'rolling', focus: 'breath' };
const FORBIDDEN_ANY = [
  '段强', '程宗扬', '月霜', '王哲',
  '半兽人', '兽人', '弓手', '骑兵', '追兵', '敌人', '敌军', '同伴', '队友', '人影', '狼骑',
  '皮甲护腕', '护腕', '箭袋', '钱袋', '腰包', '背包',
  'lcq.event', 'judge-', 'tavern_commands', 'void', '完成',
];
const HARM_FALSE_RE = /伤|痛|血|破衣/;
const INVENTED_HARM_RE = /掌心|小臂|衣袖|伤口|流血|撕破|创口/;
const MECHANISM_HARM_RE = /判定|写入|结算|状态|效果|系统/;
const SETTLED_BODILY_COST_TEXT = '那份早已压在身上的负担仍未松开';
const DISTANCE_RE = /[一二三四五六七八九十两\d]+(?:步|丈|尺)|几步|(?:约|大约)\s*[一二三四五六七八九十两\d]+步/;
const ACTOR_PRONOUN_RE = /他们|她们|他|她/;
const TERMINAL_FACT = {
  scene_held: ['短刀', '握', '尸体', '箭', '草'],
  on_ground: ['短刀', '脱手', '乱草', '尸体', '箭'],
  at_corpse: ['短刀', '没能', '尸体', '箭', '草'],
};

function coreCharCount(text) {
  return String(text).replace(/\s+/g, '').length;
}

function assertNoLeaks(text, label) {
  for (const leak of FORBIDDEN_ANY) {
    assert.equal(String(text).includes(leak), false, `${label} leaked ${leak}`);
  }
  assert.equal(DISTANCE_RE.test(text), false, `${label} leaked distance`);
  assert.equal(ACTOR_PRONOUN_RE.test(String(text).replace(/其他/g, '')), false, `${label} leaked pronoun`);
}

test('beat contract version 1 covers six outcomes and rejects location mismatches', async () => {
  const api = await loadContract();
  assert.equal(api.FAST_NARRATIVE_DEMO_BEAT_CONTRACT_VERSION, 1);
  assert.deepEqual(api.DEFAULT_FAST_NARRATIVE_STYLE_DIRECTIVE, STYLE_A);

  for (const outcome of OUTCOMES) {
    const knifeLocation = EXPECTED_LOCATION[outcome];
    assert.equal(api.expectedFastNarrativeDemoKnifeLocation(outcome), knifeLocation);
    const input = { outcome, knifeLocation, hasSettledBodilyHarm: false };
    const snapshot = JSON.stringify(input);
    const contract = api.buildFastNarrativeDemoBeatContract(input);
    assert.equal(JSON.stringify(input), snapshot);
    assert.ok(contract, outcome);
    assert.equal(contract.version, 1);
    assert.equal(contract.outcome, outcome);
    assert.equal(contract.knifeLocation, knifeLocation);
    assert.equal(contract.hasSettledBodilyHarm, false);
    assert.ok(contract.actionBeats.length > 0);
    assert.ok(contract.sensoryBeats.length > 0);
    assert.ok(contract.resultBeats.length > 0);
    const blob = JSON.stringify(contract);
    assertNoLeaks(blob, `${outcome} contract`);
    assert.equal(HARM_FALSE_RE.test(blob), false, `${outcome} contract leaked harm`);
    assert.equal(blob.includes('背包'), false);
    assert.equal(blob.includes('完成'), false);
    assert.equal(blob.includes('void'), false);
  }

  for (const outcome of OUTCOMES) {
    for (const knifeLocation of LOCATIONS) {
      const built = api.buildFastNarrativeDemoBeatContract({
        outcome,
        knifeLocation,
        hasSettledBodilyHarm: false,
      });
      if (knifeLocation === EXPECTED_LOCATION[outcome]) assert.ok(built, `${outcome}/${knifeLocation}`);
      else assert.equal(built, null, `${outcome}/${knifeLocation} must not guess`);
    }
  }

  assert.equal(api.buildFastNarrativeDemoBeatContract({
    outcome: 'win',
    knifeLocation: 'scene_held',
    hasSettledBodilyHarm: false,
  }), null);
  assert.equal(api.buildFastNarrativeDemoBeatContract({
    outcome: 'success',
    knifeLocation: 'hand',
    hasSettledBodilyHarm: false,
  }), null);
  assert.equal(api.buildFastNarrativeDemoBeatContract({
    outcome: 'success',
    knifeLocation: 'scene_held',
    hasSettledBodilyHarm: 'false',
  }), null);
  assert.equal(api.buildFastNarrativeDemoBeatContract(null), null);
});

test('style wire format round-trips and fail-closes illegal or injected input', async () => {
  const api = await loadContract();
  const canonical = 'pace=sudden;sensory=grass;cadence=short;focus=motion';
  assert.equal(api.stringifyFastNarrativeStyleDirective(api.DEFAULT_FAST_NARRATIVE_STYLE_DIRECTIVE), canonical);
  assert.deepEqual(api.parseFastNarrativeStyleDirective(canonical), STYLE_A);
  assert.equal(api.stringifyFastNarrativeStyleDirective(api.parseFastNarrativeStyleDirective(canonical)), canonical);

  for (const pace of api.FAST_NARRATIVE_STYLE_PACES) {
    for (const sensory of api.FAST_NARRATIVE_STYLE_SENSORY) {
      for (const cadence of api.FAST_NARRATIVE_STYLE_CADENCES) {
        for (const focus of api.FAST_NARRATIVE_STYLE_FOCUSES) {
          const style = { pace, sensory, cadence, focus };
          const wire = api.stringifyFastNarrativeStyleDirective(style);
          assert.equal(api.stringifyFastNarrativeStyleDirective(api.parseFastNarrativeStyleDirective(wire)), wire);
          assert.deepEqual(api.parseFastNarrativeStyleDirective(wire), style);
        }
      }
    }
  }

  const illegal = [
    '',
    'pace=sudden;sensory=grass;cadence=short',
    'pace=fast;sensory=grass;cadence=short;focus=motion',
    'tempo=sudden;sensory=grass;cadence=short;focus=motion',
    'pace=sudden;pace=measured;sensory=grass;cadence=short;focus=motion',
    'pace=sudden;sensory=grass;cadence=short;focus=motion 附加正文',
    '{"pace":"sudden","sensory":"grass","cadence":"short","focus":"motion"}',
    'pace=sudden;sensory=grass;cadence=short;focus=motion;action=set',
    'pace=sudden;sensory=grass;cadence=short;focus=lcq.event.s01_02',
    'pace=sudden;sensory=grass;cadence=short;focus=judge-1',
    ' pace=sudden;sensory=grass;cadence=short;focus=motion',
    'pace=sudden;sensory=grass;cadence=short;focus=motion\n',
    'tavern_commands',
    'PACE=sudden;sensory=grass;cadence=short;focus=motion',
    'pace=sudden;sensory=grass;cadence=short;focus=motion;',
    '{"action":"set"}',
  ];
  assert.ok(illegal.length >= 12);
  for (const raw of illegal) {
    assert.equal(api.parseFastNarrativeStyleDirective(raw), null, raw);
  }
});

test('each outcome renders two styles with different prose but the same settled facts', async () => {
  const api = await loadContract();
  for (const outcome of OUTCOMES) {
    const knifeLocation = EXPECTED_LOCATION[outcome];
    const input = { outcome, knifeLocation, hasSettledBodilyHarm: false };
    const contract = api.buildFastNarrativeDemoBeatContract(input);
    const first = api.renderFastNarrativeDemoCore(contract, STYLE_A);
    const second = api.renderFastNarrativeDemoCore(contract, STYLE_B);
    assert.ok(first && second, outcome);
    assert.notEqual(first, second, `${outcome} styles must differ`);
    for (const text of [first, second]) {
      assert.ok(coreCharCount(text) >= 100 && coreCharCount(text) <= 180, `${outcome} length=${coreCharCount(text)}`);
      assert.match(text, /你/);
      for (const fact of TERMINAL_FACT[knifeLocation]) {
        assert.equal(text.includes(fact), true, `${outcome} missing ${fact}: ${text}`);
      }
      assertNoLeaks(text, `${outcome} core`);
      assert.equal(HARM_FALSE_RE.test(text), false, `${outcome} harm leak: ${text}`);
      assert.equal(INVENTED_HARM_RE.test(text), false, `${outcome} invented harm: ${text}`);
    }
  }
});

test('bodily-harm flag only projects settled cost and never invents wounds', async () => {
  const api = await loadContract();
  for (const outcome of OUTCOMES) {
    const knifeLocation = EXPECTED_LOCATION[outcome];
    const clean = api.renderFastNarrativeDemoCore(
      api.buildFastNarrativeDemoBeatContract({ outcome, knifeLocation, hasSettledBodilyHarm: false }),
      STYLE_A,
    );
    const harmed = api.renderFastNarrativeDemoCore(
      api.buildFastNarrativeDemoBeatContract({ outcome, knifeLocation, hasSettledBodilyHarm: true }),
      STYLE_A,
    );
    assert.equal(HARM_FALSE_RE.test(clean), false, outcome);
    assert.equal(clean.includes('身体代价'), false, outcome);
    assert.equal(clean.includes(SETTLED_BODILY_COST_TEXT), false, outcome);
    assert.equal(harmed.includes(SETTLED_BODILY_COST_TEXT), true, outcome);
    assert.equal(MECHANISM_HARM_RE.test(harmed), false, `${outcome} mechanism: ${harmed}`);
    assert.equal(INVENTED_HARM_RE.test(harmed), false, `${outcome} invented: ${harmed}`);
    assertNoLeaks(harmed, `${outcome} harmed core`);
  }
});

test('same input is byte-stable and does not mutate caller objects', async () => {
  const api = await loadContract();
  const input = { outcome: 'success', knifeLocation: 'scene_held', hasSettledBodilyHarm: false };
  const style = { ...STYLE_A };
  const inputBefore = JSON.stringify(input);
  const styleBefore = JSON.stringify(style);
  const contract = api.buildFastNarrativeDemoBeatContract(input);
  const contractBefore = JSON.stringify(contract);
  const first = api.renderFastNarrativeDemoCore(contract, style);
  const second = api.renderFastNarrativeDemoCore(
    api.buildFastNarrativeDemoBeatContract(input),
    { ...style },
  );
  assert.equal(first, second);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(style), styleBefore);
  assert.equal(JSON.stringify(contract), contractBefore);
  input.outcome = 'failure';
  style.pace = 'delayed';
  assert.equal(api.renderFastNarrativeDemoCore(contract, STYLE_A), first);
});

test('renderer rejects any contract that is not identical to the rebuilt canonical', async () => {
  const api = await loadContract();
  const contract = api.buildFastNarrativeDemoBeatContract({
    outcome: 'success',
    knifeLocation: 'scene_held',
    hasSettledBodilyHarm: false,
  });
  assert.ok(api.renderFastNarrativeDemoCore(contract, STYLE_A));
  assert.ok(api.renderFastNarrativeDemoCore(structuredClone(contract), STYLE_A));

  const tamperAction = structuredClone(contract);
  tamperAction.actionBeats[0].text = '你从背包取出神器并完成事件';
  assert.equal(api.renderFastNarrativeDemoCore(tamperAction, STYLE_A), null, 'action text');

  const tamperSensory = structuredClone(contract);
  tamperSensory.sensoryBeats[0].text = '你从背包取出神器并完成事件';
  assert.equal(api.renderFastNarrativeDemoCore(tamperSensory, STYLE_A), null, 'sensory text');

  const tamperResult = structuredClone(contract);
  tamperResult.resultBeats[0].text = '你从背包取出神器并完成事件';
  assert.equal(api.renderFastNarrativeDemoCore(tamperResult, STYLE_A), null, 'result text');

  const tamperId = structuredClone(contract);
  tamperId.actionBeats[0].id = 'action.injected';
  assert.equal(api.renderFastNarrativeDemoCore(tamperId, STYLE_A), null, 'beat id');

  const missingBeat = structuredClone(contract);
  missingBeat.actionBeats = missingBeat.actionBeats.slice(1);
  assert.equal(api.renderFastNarrativeDemoCore(missingBeat, STYLE_A), null, 'missing beat');

  const extraBeat = structuredClone(contract);
  extraBeat.actionBeats = [
    ...extraBeat.actionBeats,
    { kind: 'action', id: 'action.extra', text: '额外一句' },
  ];
  assert.equal(api.renderFastNarrativeDemoCore(extraBeat, STYLE_A), null, 'extra beat');

  const extraField = structuredClone(contract);
  extraField.injected = true;
  assert.equal(api.renderFastNarrativeDemoCore(extraField, STYLE_A), null, 'extra top-level field');

  const tamperVersion = structuredClone(contract);
  tamperVersion.version = 2;
  assert.equal(api.renderFastNarrativeDemoCore(tamperVersion, STYLE_A), null, 'wrong version');

  const tamperOutcome = structuredClone(contract);
  tamperOutcome.outcome = 'perfect';
  assert.equal(api.renderFastNarrativeDemoCore(tamperOutcome, STYLE_A), null, 'wrong outcome');

  const tamperLocation = structuredClone(contract);
  tamperLocation.knifeLocation = 'on_ground';
  assert.equal(api.renderFastNarrativeDemoCore(tamperLocation, STYLE_A), null, 'wrong location');

  const tamperHarmFlag = structuredClone(contract);
  tamperHarmFlag.hasSettledBodilyHarm = true;
  assert.equal(api.renderFastNarrativeDemoCore(tamperHarmFlag, STYLE_A), null, 'wrong harm with old beats');

  const harmedContract = api.buildFastNarrativeDemoBeatContract({
    outcome: 'success',
    knifeLocation: 'scene_held',
    hasSettledBodilyHarm: true,
  });
  const tamperHarmOff = structuredClone(harmedContract);
  tamperHarmOff.hasSettledBodilyHarm = false;
  assert.equal(api.renderFastNarrativeDemoCore(tamperHarmOff, STYLE_A), null, 'harm off with old beats');

  const reorderedTop = {
    actionBeats: contract.actionBeats,
    version: contract.version,
    outcome: contract.outcome,
    knifeLocation: contract.knifeLocation,
    hasSettledBodilyHarm: contract.hasSettledBodilyHarm,
    sensoryBeats: contract.sensoryBeats,
    resultBeats: contract.resultBeats,
  };
  assert.notDeepEqual(Object.keys(reorderedTop), Object.keys(contract));
  assert.equal(api.renderFastNarrativeDemoCore(reorderedTop, STYLE_A), null, 'reordered top-level fields');

  const reorderedActions = structuredClone(contract);
  reorderedActions.actionBeats = [
    ...reorderedActions.actionBeats.slice(1),
    reorderedActions.actionBeats[0],
  ];
  assert.equal(api.renderFastNarrativeDemoCore(reorderedActions, STYLE_A), null, 'reordered actionBeats');
});

test('all 1728 outcome/harm/style combinations render within length bounds', async () => {
  const api = await loadContract();
  let count = 0;
  for (const outcome of OUTCOMES) {
    for (const hasSettledBodilyHarm of [false, true]) {
      const contract = api.buildFastNarrativeDemoBeatContract({
        outcome,
        knifeLocation: EXPECTED_LOCATION[outcome],
        hasSettledBodilyHarm,
      });
      assert.ok(contract, `${outcome}/${hasSettledBodilyHarm}`);
      for (const pace of api.FAST_NARRATIVE_STYLE_PACES) {
        for (const sensory of api.FAST_NARRATIVE_STYLE_SENSORY) {
          for (const cadence of api.FAST_NARRATIVE_STYLE_CADENCES) {
            for (const focus of api.FAST_NARRATIVE_STYLE_FOCUSES) {
              const text = api.renderFastNarrativeDemoCore(contract, { pace, sensory, cadence, focus });
              const n = coreCharCount(text);
              assert.ok(text, `${outcome}/${hasSettledBodilyHarm}/${pace}/${sensory}/${cadence}/${focus}`);
              assert.ok(n >= 100 && n <= 180, `${outcome}/${hasSettledBodilyHarm}/${pace}/${sensory}/${cadence}/${focus} length=${n}`);
              count += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(count, 1728);
});
