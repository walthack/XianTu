// Chapter-gated, authored information: the model cannot create interrogation receipts.
import { evalExpr } from './conditions';
import type { Contract, SceneState } from './types';
export function interrogationFacts(contract: Contract, state: SceneState, chapter: number): string[] {
  const gate=contract.interrogation;
  if(!gate || !Number.isFinite(chapter) || chapter<1 || (gate.requires && !evalExpr(gate.requires,contract,state)))return [];
  const limit=Math.min(chapter,gate.maxChapter);
  return gate.facts.filter(fact=>fact.fromChapter<=limit).map(fact=>fact.text);
}
export function interrogationProblems(contract: Contract, chapter: number, text: string): string[] {
  return (contract.interrogation?.facts || []).filter(fact=>fact.fromChapter>Math.min(chapter,contract.interrogation!.maxChapter)
    && fact.forbiddenBefore && new RegExp(fact.forbiddenBefore).test(text)).map(fact=>`审問信息尚未开放：${fact.id}`);
}
