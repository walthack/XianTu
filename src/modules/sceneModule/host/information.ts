import { namingChapter } from '@/modules/scenarioMods/ledger/naming';
import { interrogationFacts } from '../interrogation';
import type { Contract, SceneState } from '../types';
/** No runtime/chapter evidence means no disclosures. The contract's scene cap always wins. */
export function interrogationChapter(contract: Contract, runtime: unknown): number {
  if(!runtime || typeof runtime!=='object')return 0;
  return Math.min(namingChapter(runtime as any),contract.interrogation?.maxChapter || 0);
}
export function interrogationMaterial(contract: Contract, state: SceneState, goalId: string, runtime: unknown, success: boolean): string[] {
  if(!contract.interrogation?.goalIds.includes(goalId))return [];
  if(!success)return ['这次没有问出新的信息。'];
  const facts=interrogationFacts(contract,state,interrogationChapter(contract,runtime));
  return facts.length ? facts : ['没有可供当前章节公开的新信息。'];
}

export function wantsInterrogation(contract: Contract, text: string): boolean {
  return !!contract.interrogation && /审问|盘问|逼问|问出|来历|幕后|谁派|受谁|奉谁|主使|为何袭击|为什么袭击/.test(text) && !/不(?:审问|盘问|逼问)|如果|假如/.test(text);
}
