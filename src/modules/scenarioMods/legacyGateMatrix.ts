export const LEGACY_GATE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type LegacyGateId = (typeof LEGACY_GATE_IDS)[number];

export interface LegacyGateRule {
  id: string;
  gate: LegacyGateId;
  name: string;
  localAnchor: string;
  inNarratorPacket: boolean;
}

/** Living coverage matrix: every inherited rule must land on at least one gate. */
export const LEGACY_GATE_MATRIX: LegacyGateRule[] = [
  { id: 'fresh-selection', gate: 1, name: '结构化选项必须 fresh', localAnchor: 'planLegacyNarrativePilot/sameFreshSelection', inNarratorPacket: true },
  { id: 'selected-provenance', gate: 1, name: '自由输入不得进单幕', localAnchor: 'eventActionProvenance=selected', inNarratorPacket: true },
  { id: 'judgement-receipt', gate: 2, name: '判定结果本地先结算', localAnchor: 'verifyResolvedJudgementReceipt', inNarratorPacket: true },
  { id: 'event-contract', gate: 2, name: '事件合同本地结算', localAnchor: 'recordStoryEventStructuredAction', inNarratorPacket: true },
  { id: 'known-facts', gate: 3, name: '只投影玩家已知事实', localAnchor: 'compileLegacyNarratorPacket.mustAppear', inNarratorPacket: true },
  { id: 'location-receipt', gate: 4, name: '位置只读本地描述与回执', localAnchor: 'compileLegacyNarratorPacket.location', inNarratorPacket: true },
  { id: 'no-text-move', gate: 4, name: '禁止文本匹配补移动', localAnchor: 'packet.mustNotAppear 不含临时移动指令', inNarratorPacket: true },
  { id: 'reserved-future', gate: 5, name: '禁止提前演后续拍点', localAnchor: 'reservedFutureTerms → packet.mustNotAppear', inNarratorPacket: true },
  { id: 'present-cast', gate: 6, name: '只投影在场/已揭示人物', localAnchor: 'computePresentNames', inNarratorPacket: true },
  { id: 'sentence-gate', gate: 7, name: '句级输出门', localAnchor: 'createLegacySentenceStream + firstSafeSentenceAt', inNarratorPacket: false },
  { id: 'full-text-guard', gate: 8, name: '全文终检', localAnchor: 'validateNarrativePerformance', inNarratorPacket: false },
  { id: 'no-commands', gate: 9, name: 'Narrator 无命令与存档权', localAnchor: 'empty tavern_commands + narrativeAuthority=local_contract', inNarratorPacket: true },
  { id: 'fail-closed', gate: 10, name: '空/违规走本地收束', localAnchor: 'safeNarrativeFallbackForContext', inNarratorPacket: false },
];

export function uncoveredLegacyGates(rules: LegacyGateRule[] = LEGACY_GATE_MATRIX): LegacyGateId[] {
  const covered = new Set(rules.map(rule => rule.gate));
  return LEGACY_GATE_IDS.filter(id => !covered.has(id));
}
