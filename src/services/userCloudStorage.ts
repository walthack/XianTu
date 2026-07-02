import { buildBackendUrl, isBackendConfigured } from '@/services/backendConfig';

const REMOTE_STORE_PREFIX = '/api/v1/save-storage';

export interface UserCloudSaveResult {
  success: boolean;
  status?: number;
  message?: string;
}

function remoteStorageUrl(key: string): string {
  return buildBackendUrl(`${REMOTE_STORE_PREFIX}/${encodeURIComponent(key)}`);
}

async function requestRemote<T>(key: string, options: RequestInit): Promise<T | null | undefined> {
  if (!isBackendConfigured()) return undefined;

  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('access_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(remoteStorageUrl(key), { ...options, headers });
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn('[用户云配置] 远程请求失败，使用本地缓存:', error);
    return undefined;
  }
}

export async function loadUserCloudData<T>(key: string): Promise<T | null> {
  const result = await requestRemote<{ data?: T } | T>(key, { method: 'GET' });
  if (result == null) return null;
  if (typeof result === 'object' && 'data' in (result as Record<string, unknown>)) {
    return (result as { data?: T }).data ?? null;
  }
  return result as T;
}

export async function saveUserCloudData(key: string, data: unknown): Promise<boolean> {
  const result = await saveUserCloudDataDetailed(key, data);
  return result.success;
}

export async function saveUserCloudDataDetailed(key: string, data: unknown): Promise<UserCloudSaveResult> {
  if (!isBackendConfigured()) {
    return { success: false, message: '未配置后端服务器' };
  }

  const headers = new Headers();
  const token = localStorage.getItem('access_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(remoteStorageUrl(key), {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: key,
        data,
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      return { success: true, status: response.status };
    }

    const raw = await response.text();
    let message = raw || `服务端错误 ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
      if (typeof parsed.detail === 'string') message = parsed.detail;
      else if (typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // keep raw message
    }

    return { success: false, status: response.status, message };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '网络连接失败',
    };
  }
}

export async function saveUserCloudDataLegacy(key: string, data: unknown): Promise<boolean> {
  const result = await requestRemote(key, {
    method: 'PUT',
    body: JSON.stringify({
      id: key,
      data,
      timestamp: new Date().toISOString(),
    }),
  });
  return result !== undefined;
}

export async function deleteUserCloudData(key: string): Promise<boolean> {
  const result = await requestRemote(key, { method: 'DELETE' });
  return result !== undefined;
}
