/**
 * 新界面（?ui=new）立绘区的「主要角色」：MainGamePanel 里算，底行「在场」读同一份把他排第一。
 * 定法见 src/components/uiNew/leadCharacter.ts（一手最多换一次，跟这一手主要说话的人走）。
 * 只记在内存里（和字框读到第几段同样做法），不写存档；读档（characterStore.loadGame／loadGameById）后清掉重新定。
 */
import { ref, watchEffect } from 'vue';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useCharacterStore } from '@/stores/characterStore';
import { computeScenarioPresence } from '@/modules/scenarioMods/storyContext';
import { getScenarioFocusEvent } from '@/modules/scenarioMods/runtime';
import { resolveFullBody, resolvePortrait } from '@/modules/contentPacks/assets';
import { resolveNamedEntityId } from '@/modules/scenarioMods/namedEntities';
import { pickLeadCharacter, silhouetteKindFor, type LeadPick, type LeadRule, type SilhouetteKind } from '@/components/uiNew/leadCharacter';
import { packImageUrl } from '@/assets/packImages';
import { uiNewActive } from './uiNew';

export interface UiNewLead {
  name: string;
  characterId: string;
  /** 能加载的图片网址；没登记或文件不在时是空串（走剪影）。 */
  imageUrl: string;
  silhouette: SilhouetteKind;
  rule: LeadRule;
  /** 现在这个人最初是按哪条规则定的（a／b／c／d；之后 keep 不改它），给人工核对用。 */
  basis: LeadRule;
}

export const uiNewLead = ref<UiNewLead | null>(null);
let previous: LeadPick | null = null;
let basis: LeadRule = 'keep';
const loadTick = ref(0);
let loadHooked = false;

/** 图片挂位里的 file（相对 src/assets/）→ 浏览器能加载的网址；文件不在仓库里时是空串（走剪影）。 */
export function leadImageUrl(file: string): string {
  return packImageUrl(file);
}

/**
 * 先问图片挂位有没有全身立绘，没有再问半身／头像；都没有 → 空串，界面走剪影。
 * 图片挂位按人物总表的 id 登记；剧本里的人物 id 和总表不一定同名（段强：剧本 liuchao.character.duan_qiang，总表 lcq.character.duan_qiang），先按 id、再按名字对到总表。
 */
function imageFor(characterId: string, name: string): string {
  const registryId = resolveNamedEntityId('character', characterId) ?? resolveNamedEntityId('character', name) ?? characterId;
  if (!registryId) return '';
  const hit = resolveFullBody({ characterId: registryId }) ?? resolvePortrait({ characterId: registryId });
  return hit ? leadImageUrl(hit.file) : '';
}

export function useUiNewLead(narrativeText: () => string): void {
  const gameStateStore = useGameStateStore();
  const characterStore = useCharacterStore();
  if (!loadHooked) {
    loadHooked = true;
    characterStore.$onAction(({ name, after }) => {
      if (name !== 'loadGame' && name !== 'loadGameById') return;
      previous = null;
      after(() => { previous = null; loadTick.value += 1; });
    }, true);
  }
  watchEffect(() => {
    if (!uiNewActive.value) return;
    void loadTick.value;
    void gameStateStore.narrativeHistory?.length;
    void gameStateStore.location;
    const text = narrativeText();
    try {
      const save = gameStateStore.toSaveData();
      const presence = save ? computeScenarioPresence(save) : null;
      if (!presence) { previous = null; uiNewLead.value = null; return; }
      const anchor = getScenarioFocusEvent(presence.runtime as any);
      const characters = presence.runtime.canon?.characters || [];
      const eventCharacterNames = (anchor?.relatedCharacterIds || [])
        .map(id => characters.find(character => character.id === id)?.name || '')
        .filter(Boolean);
      const pick = pickLeadCharacter({
        eventId: anchor?.id || '',
        presentNames: [...presence.presentNames],
        eventCharacterNames,
        narrativeText: text,
        playerName: String(gameStateStore.character?.名字 || ''),
        previous,
      });
      if (pick && pick.rule !== 'keep') basis = pick.rule;
      previous = pick;
      if (!pick) { uiNewLead.value = null; return; }
      const character = characters.find(item => item.name === pick.name);
      const characterId = character?.id || '';
      uiNewLead.value = {
        name: pick.name,
        characterId,
        imageUrl: imageFor(characterId, pick.name),
        silhouette: silhouetteKindFor(character?.gender),
        rule: pick.rule,
        basis,
      };
    } catch {
      // lcq-allow: 立绘区只是显示，算不出就空着，不影响游戏
      uiNewLead.value = null;
    }
  });
}
