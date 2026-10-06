import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTs} from './loadTs.mjs';
const {formatRealmWithStage,levelOf,levelName,GAOSHOUBANG_NARRATION_RULE}=await loadTs('../src/utils/realmUtils.ts');
test('canonical nine levels use names directly: 筑基 is level one, no old cultivation translation',()=>{for(let i=0;i<=9;i++)assert.equal(levelOf(levelName(i)),i);assert.equal(levelOf('筑基'),1);assert.equal(levelOf('金丹'),null);});
test('three phases display full names and removed phases are never displayed',()=>{assert.equal(formatRealmWithStage({名称:'通幽',阶段:'中期'}),'通幽·中期');assert.equal(formatRealmWithStage({名称:'通幽',阶段:'圆满'}),'通幽');assert.equal(formatRealmWithStage(null),'无修为');});
test('narration only uses canonical levels and receipt authority',()=>{assert.match(GAOSHOUBANG_NARRATION_RULE,/通幽/);assert.match(GAOSHOUBANG_NARRATION_RULE,/代码回执/);assert.doesNotMatch(GAOSHOUBANG_NARRATION_RULE,/金丹|元婴|圆满|极境/);});
