/**
 * 新界面外壳（第①步）开关：只看网址参数 `?ui=new`，启动时读一次。
 * 不进 store、不存 localStorage、不做设置项。路由是 memory history，网址参数不会丢。
 * 本步只做电脑宽（≥1024）；窗口更窄时退回老界面。
 */
import { computed, ref } from 'vue';

export const UI_NEW_MIN_WIDTH = 1024;

export const UI_NEW_REQUESTED: boolean =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ui') === 'new';

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0);
if (UI_NEW_REQUESTED && typeof window !== 'undefined') {
  window.addEventListener('resize', () => { viewportWidth.value = window.innerWidth; });
}

/** 新界面是否生效：带了 ?ui=new 且窗口够宽。 */
export const uiNewActive = computed(() => UI_NEW_REQUESTED && viewportWidth.value >= UI_NEW_MIN_WIDTH);

/** 字框读到这一手的第几段：主面板随功能页开关重新挂载后接着读。只在内存里，刷新即丢。 */
export const uiNewReadPosition: { value: { key: string; index: number; atEnd: boolean } | null } = { value: null };
