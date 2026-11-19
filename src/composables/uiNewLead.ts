/**
 * 新界面（?ui=new）立绘区的「主要角色」：MainGamePanel 里算，底行「在场」读同一份把他排第一。
 * 定法见 src/components/uiNew/leadCharacter.ts（⚠ 临时规则，用户未定）。
 * 只记在内存里（和字框读到第几段同样做法），不写存档；读档（characterStore.loadGame／loadGameById）后清掉重新定。
 */
import { ref, watchEffect } from 'vue';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useCharacterStore } from '@/stores/characterStore';
import { computeScenarioPresence } from '@/modules/scenarioMods/storyContext';
import { getScenarioFocusEvent } from '@/modules/scenarioMods/runtime';
import { resolveFullBody, resolvePortrait } from '@/modules/contentPacks/assets';
import { pickLeadCharacter, silhouetteKindFor, type LeadPick, type LeadRule, type SilhouetteKind } from '@/components/uiNew/leadCharacter';
import { uiNewActive } from './uiNew';

export interface UiNewLead {
  name: string;
  characterId: string;
  /** 能加载的图片网址；现在恒为空串（走剪影）。 */
  imageUrl: string;
  silhouette: SilhouetteKind;
  rule: LeadRule;
  /** 这一场最初是按哪条规则定的（a／b／c／d；之后 keep 不改它），给人工核对用。 */
  basis: LeadRule;
}

export const uiNewLead = ref<UiNewLead | null>(null);
let previous: LeadPick | null = null;
let basis: LeadRule = 'keep';
const loadTick = ref(0);
let loadHooked = false;

/**
 * 图片挂位里的 file（相对 src/assets/）→ 浏览器能加载的网址。
 * 这一步不做：让 src/assets/characters/ 下的图进打包要改打包配置，在等用户点头。将来只改这一处。
 */
export function leadImageUrl(_file: string): string {
  return '';
}

/** 先问图片挂位有没有全身立绘，没有再问半身／头像；都没有（现在一定没有）→ 空串，界面走剪影。 */
function imageFor(characterId: string): string {
  if (!characterId) return '';
  const hit = resolveFullBody({ characterId }) ?? resolvePortrait({ characterId });
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
        imageUrl: imageFor(characterId),
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
