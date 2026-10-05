<template>
  <section v-if="knowledgeEntries.length || pathEntries.length" class="epistemic-ledger">
    <button class="ledger-header" type="button" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <span>认知与路径</span>
      <span aria-hidden="true">{{ collapsed ? '▸' : '▾' }}</span>
    </button>
    <div v-show="!collapsed" class="ledger-body">
      <article v-for="entry in knowledgeEntries" :key="entry.id" class="ledger-entry">
        <span class="ledger-tag" :class="entry.confirmed ? 'confirmed' : 'rumor'">
          {{ entry.confirmed ? '已确认' : '听说' }}
        </span>
        {{ entry.claim }}
        <div class="ledger-meta">{{ entry.source }} · {{ entry.turnLabel }}</div>
      </article>
      <article v-for="entry in pathEntries" :key="entry.id" class="ledger-entry">
        <span aria-hidden="true">◇</span> {{ entry.label }}
        <div class="ledger-meta">路径记录 · {{ entry.dimension }} · {{ entry.turnLabel }}</div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ledgerRecordOrder, ledgerRecordTurnLabel } from '@/modules/scenarioMods/eventNarrativeView';

const props = defineProps<{
  playerKnowledge?: Record<string, any>;
  pathReceipts?: Record<string, any>;
  runtime?: any;
}>();

const collapsed = ref(false);
const factName = (id: string) => [...(props.runtime?.canon?.characters || []), ...(props.runtime?.canon?.factions || []), ...(props.runtime?.canon?.locations || [])].find(item => item.id === id)?.name;
const eventName = (id: string) => props.runtime?.events?.find((item: any) => item.id === id)?.name;
const order = (record: any) => ledgerRecordOrder(props.runtime, record);
const datedTurn = (record: any, turn: unknown) => ledgerRecordTurnLabel(props.runtime, record, turn);
const knowledgeEntries = computed(() => Object.values(props.playerKnowledge || {})
  .sort((a, b) => order(b) - order(a) || Number(b.learnedAtTurn || 0) - Number(a.learnedAtTurn || 0))
  .slice(0, 12)
  .map(fact => ({
    id: String(fact.factId),
    confirmed: fact.status === 'confirmed',
    claim: typeof fact.claim === 'string' && fact.claim.trim() && !/lcq\.|liuchao\./.test(fact.claim)
      ? fact.claim
      : /lcq\.|liuchao\./.test(`${fact.subjectId}.${fact.predicate}.${fact.objectId}`) ? factName(fact.subjectId) ? `你已知晓${factName(fact.subjectId)}` : '已记录一条线索（原记录缺少名称）' : `${fact.subjectId}.${fact.predicate}${fact.objectId ? `=${fact.objectId}` : ''}（旧记录）`,
    source: typeof fact.source?.label === 'string' && !/lcq\.|liuchao\./.test(fact.source.label) ? fact.source.label : eventName(fact.sourceEventId) || '已发生的剧情',
    turnLabel: datedTurn(fact, fact.learnedAtTurn || props.runtime?.eventActionStates?.[fact.sourceEventId]?.readyAtTurn),
  })));
const pathEntries = computed(() => Object.values(props.pathReceipts || {})
  .sort((a, b) => order(b) - order(a) || Number(b.selectedAtTurn || 0) - Number(a.selectedAtTurn || 0))
  .slice(0, 8)
  .map(receipt => ({
    id: String(receipt.receiptId),
    label: typeof receipt.label === 'string' && !/lcq\.|liuchao\./.test(receipt.label) ? receipt.label : '已作出的选择',
    dimension: /lcq\.|liuchao\./.test(String(receipt.dimension || '')) ? '剧情分支' : String(receipt.dimension || '剧情分支'),
    turnLabel: datedTurn(receipt, receipt.selectedAtTurn),
  })));
</script>

<style scoped>
.epistemic-ledger {
  margin-top: 10px;
  border: 1px solid var(--color-border, rgba(184, 148, 89, 0.3));
  border-radius: 8px;
  overflow: hidden;
}
.ledger-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 9px 10px;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font-weight: 600;
}
.ledger-body { padding: 0 10px 8px; }
.ledger-entry { padding: 7px 0; font-size: 12px; line-height: 1.55; }
.ledger-entry + .ledger-entry { border-top: 1px solid var(--color-border, rgba(184, 148, 89, 0.2)); }
.ledger-tag { display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 4px; }
.ledger-tag.confirmed { color: #6fb98f; background: rgba(69, 145, 102, 0.15); }
.ledger-tag.rumor { color: #c59a5b; background: rgba(180, 126, 50, 0.15); }
.ledger-meta { margin-top: 3px; opacity: 0.65; font-size: 11px; }
</style>
