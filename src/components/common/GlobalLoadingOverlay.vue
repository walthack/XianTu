<template>
  <transition name="fade">
    <div v-if="uiStore.isLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="spinner"></div>
        <p class="loading-text" v-html="uiStore.loadingText"></p>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useUIStore } from '@/stores/uiStore';

const uiStore = useUIStore();
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(var(--color-primary-rgb), 0.3);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--color-accent);
  font-size: 1.2rem;
  font-weight: 500;
  text-shadow: 0 0 10px rgba(var(--color-primary-rgb), 0.5);
  /* 流式预览会注入长文本，不限宽会满屏铺开 */
  max-width: min(46em, 88vw);
  margin: 0 auto;
  text-align: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
