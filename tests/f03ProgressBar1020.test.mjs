// fee4 F03：护人戏的威胁进度条要显示；同伴不被攻击（敌方动作只打主角）。
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {loadTs} from './loadTs.mjs';
const bars=await loadTs('../src/modules/sceneModule/host/progressBars.ts');
const f03=JSON.parse(readFileSync(new URL('../src/modules/sceneModule/contracts/f03.json',import.meta.url),'utf8'));
test('威胁进度条：按合同 scale 出档位文字与步数，越界夹住', () => {
  assert.deepEqual(bars.sceneProgressBars(f03,{tracks:{ally_threat:{threat:2}}}).map(b=>[b.key,b.text,b.step,b.max]),[['ally_threat.threat','后方告急',2,3]]);
  assert.equal(bars.sceneProgressBars(f03,{tracks:{}})[0].step,0);
  assert.equal(bars.sceneProgressBars(f03,{tracks:{ally_threat:{threat:9}}})[0].step,3);
  const vue=readFileSync(new URL('../src/components/dashboard/SceneEncounterCard.vue',import.meta.url),'utf8');assert.match(vue,/sceneProgressBars/);assert.match(vue,/<progress/);
});
test('F03 敌方动作全部指向主角，同伴不挨打；威胁动作只推进威胁条', () => {
  for(const a of f03.enemyActions)assert.equal(a.target,'player',a.id);
  for(const a of f03.enemyActions.filter(x=>x.id.startsWith('threat_')))assert.deepEqual(a.onHit.trackShifts.map(t=>t.party),['ally_threat']);
});
