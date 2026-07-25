<template>
  <div class="account-container">
    <VideoBackground />

    <div class="account-panel">
      <div class="header">
        <div class="title-row">
          <h2 class="title">账号中心</h2>
          <span class="status" :class="{ ok: loggedIn, warn: !loggedIn }">
            {{ loggedIn ? '已登录' : '未登录' }}
          </span>
        </div>
        <p class="subtitle">集中管理账号信息</p>
      </div>

      <div v-if="!backendReady" class="backend-locked">
        <p>未配置后端服务器，账号中心不可用。</p>
        <div class="actions">
          <button class="btn btn-secondary" @click="goBack">返回</button>
        </div>
      </div>

      <template v-else>
        <div v-if="loading" class="loading">加载中…</div>
        <div v-else class="sections">
          <details v-for="section in sections" :key="section.title" class="section" :open="section.open">
            <summary class="section-title">{{ section.title }}</summary>
            <div class="section-body">
              <div v-if="section.items.length" class="info-list">
                <div v-for="item in section.items" :key="item.label" class="info-row">
                  <span class="info-label">{{ item.label }}</span>
                  <span class="info-value">{{ item.value }}</span>
                </div>
              </div>
              <div v-else class="info-empty">{{ section.emptyText || '暂无信息' }}</div>
            </div>
          </details>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="goBack">返回</button>
          <button class="btn danger" @click="logout">退出登录</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import VideoBackground from '@/components/common/VideoBackground.vue';
import { request } from '@/services/request';
import { isBackendConfigured } from '@/services/backendConfig';
import { toast } from '@/utils/toast';

type UserProfile = {
  id: number;
  user_name: string;
  created_at: string;
};

const router = useRouter();
const backendReady = ref(isBackendConfigured());
const loading = ref(false);
const profile = ref<UserProfile | null>(null);

const loggedIn = computed(() => !!profile.value);

const formatDate = (isoText: string) => {
  if (!isoText) return '-';
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return isoText;
  return date.toLocaleString();
};

const sections = computed(() => {
  const infoItems = profile.value
    ? [
        { label: '道号', value: profile.value.user_name },
        { label: '账号ID', value: String(profile.value.id) },
        { label: '注册时间', value: formatDate(profile.value.created_at) },
      ]
    : [];
  return [
    {
      title: '账号信息',
      open: true,
      items: infoItems,
      emptyText: '未获取到账号信息',
    },
  ];
});

const goBack = () => {
  router.push('/');
};

const logout = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('username');
  profile.value = null;
  toast.info('已退出登录');
  router.push('/login');
};

onMounted(async () => {
  if (!backendReady.value) return;
  const token = localStorage.getItem('access_token');
  if (!token) {
    router.push('/login');
    return;
  }
  loading.value = true;
  try {
    profile.value = await request.get<UserProfile>('/api/v1/auth/me');
  } catch (_e) {
    profile.value = null;
    router.push('/login');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.account-container {
  width: 100%;
  height: 100vh;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  box-sizing: border-box;
  overflow: auto;
}

.account-panel {
  width: 100%;
  max-width: 900px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 2.5rem;
  color: var(--color-text);
}

.header {
  margin-bottom: 1.5rem;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.title {
  margin: 0;
  font-family: var(--font-family-serif);
  font-size: 2rem;
  color: var(--color-primary);
}

.status {
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  font-size: 0.85rem;
}

.status.ok {
  border-color: rgba(95, 155, 106, 0.4);
  color: #5f9b6a;
}

.status.warn {
  border-color: rgba(213, 170, 74, 0.4);
  color: #d5aa4a;
}

.subtitle {
  margin: 0.6rem 0 0;
  color: var(--color-text-secondary);
}

.sections {
  display: grid;
  gap: 1rem;
}

.section {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-light);
  overflow: hidden;
}

.section-title {
  list-style: none;
  padding: 0.85rem 1rem;
  font-weight: 700;
  color: var(--color-text);
  cursor: pointer;
}

.section-title::-webkit-details-marker {
  display: none;
}

.section-body {
  padding: 0 1rem 1rem;
}

.info-list {
  display: grid;
  gap: 0.6rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--color-border);
}

.info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.info-value {
  font-weight: 600;
  color: var(--color-text);
}

.info-empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  padding: 0.3rem 0;
}

.actions {
  margin-top: 2rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.btn {
  flex: 1;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-light);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-hover);
}

.btn-secondary {
  background: var(--color-surface);
}

.btn.danger {
  border-color: rgba(195, 75, 60, 0.4);
  background: rgba(195, 75, 60, 0.12);
  color: #c34b3c;
}

.btn.danger:hover {
  background: rgba(195, 75, 60, 0.18);
}

.loading {
  color: var(--color-text-secondary);
}

.backend-locked {
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: var(--color-surface-light);
  border: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .account-panel {
    padding: 2rem 1.5rem;
  }

  .title-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
