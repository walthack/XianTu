/**
 * 新界面外壳开关：只看网址参数 `?ui=new`，启动时读一次。
 * 不进 store、不存 localStorage、不做设置项。路由是 memory history，网址参数不会丢。
 * 窗口 ≥1024 用电脑宽摆法；更窄（手机、竖屏平板、横屏手机）用窄屏摆法（外壳根上加 .un-phone）。
 * 不带 `?ui=new` 时这里的监听一个都不挂，老界面不受影响。
 */
import { computed, ref, watchEffect } from 'vue';

export const UI_NEW_MIN_WIDTH = 1024;

export const UI_NEW_REQUESTED: boolean =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ui') === 'new';

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0);
/** 可见区域（visualViewport）高度和上移量：手机弹出软键盘时变小。 */
const visibleHeight = ref(typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 0);
const visibleTop = ref(0);
/** 同一朝向下见过的最大窗口高度：软键盘弹出前的高度。换朝向（宽度变了）时重记。 */
const fullHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0);
const textFocused = ref(false);

if (UI_NEW_REQUESTED && typeof window !== 'undefined') {
  const sync = () => {
    if (window.innerWidth !== viewportWidth.value) fullHeight.value = window.innerHeight;
    viewportWidth.value = window.innerWidth;
    fullHeight.value = Math.max(fullHeight.value, window.innerHeight);
    visibleHeight.value = window.visualViewport?.height ?? window.innerHeight;
    visibleTop.value = window.visualViewport?.offsetTop ?? 0;
  };
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  const isText = (el: EventTarget | null) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'file', 'submit'].includes(el.type));
  document.addEventListener('focusin', e => { textFocused.value = isText(e.target); });
  document.addEventListener('focusout', () => { textFocused.value = false; });
  // 刘海／底部横条：只在新界面下给 viewport 加 viewport-fit=cover，env(safe-area-inset-*) 才有值；老界面不加
  const meta = document.querySelector('meta[name="viewport"]');
  const content = meta?.getAttribute('content') || '';
  if (meta && !/viewport-fit/.test(content)) meta.setAttribute('content', `${content}, viewport-fit=cover`);
}

/** 新界面是否生效：带了 ?ui=new 就生效（任何宽度）。 */
export const uiNewActive = computed(() => UI_NEW_REQUESTED);

/** 窄屏摆法：新界面生效且窗口窄于 1024。 */
export const uiNewPhone = computed(() => UI_NEW_REQUESTED && viewportWidth.value < UI_NEW_MIN_WIDTH);

/** 窗口宽度（只在新界面下跟着变；字框每段字数随它变）。 */
export const uiNewViewportWidth = computed(() => viewportWidth.value);

/** 窄屏下软键盘弹出：输入框聚焦且可见高度比原来矮了两成以上。 */
export const uiNewKeyboard = computed(() => uiNewPhone.value && textFocused.value && visibleHeight.value < fullHeight.value * 0.8);

// 窄屏外壳的高度＝可见区域高度（软键盘弹出时跟着变矮，字框仍贴在可见区域底部）。只在窄屏时写到 <html> 上，电脑宽不写。
if (UI_NEW_REQUESTED && typeof document !== 'undefined') {
  watchEffect(() => {
    const root = document.documentElement.style;
    if (uiNewPhone.value) {
      root.setProperty('--un-vvh', `${Math.round(visibleHeight.value)}px`);
      root.setProperty('--un-vvt', `${Math.round(visibleTop.value)}px`);
    } else {
      root.removeProperty('--un-vvh');
      root.removeProperty('--un-vvt');
    }
  });
}

/** 「任务」页开没开：右列「任务」和场景框左上角的任务追踪小块都能打开它（外壳读、主面板写）。 */
export const uiNewQuestOpen = ref(false);

/** 字框读到这一手的第几段：主面板随功能页开关重新挂载后接着读。只在内存里，刷新即丢。 */
export const uiNewReadPosition: { value: { key: string; index: number; atEnd: boolean } | null } = { value: null };
