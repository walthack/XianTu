/**
 * 新界面（?ui=new）右列四个动词键和字框之间共用的状态：
 * 每个键下现在有几条（MainGamePanel 算）、哪个键正开着（外壳右列点）。只在内存里，不写存档。
 * 归法见 src/components/uiNew/verbMenu.ts（⚠ 临时口径）。
 */
import { ref } from 'vue';
import type { VerbKey } from '@/components/uiNew/verbMenu';

export const uiNewVerbCounts = ref<Record<VerbKey, number>>({ look: 0, talk: 0, act: 0, go: 0 });
export const uiNewVerbOpen = ref<VerbKey | null>(null);
