function isWebpackDevServerHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    // Tailscale assigns IPv4 addresses from the CGNAT range 100.64.0.0/10.
    // This is still the local webpack dev server, so save-storage must use its
    // same-origin /api endpoint instead of falling back to a fresh IndexedDB.
    /^100\.(?:6[4-9]|[789]\d|1[01]\d|12[0-7])\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname.includes('local')
  );
}

export function normalizeBackendUrl(input: string): string {
  if (!input) return '';
  let url = input.trim();
  if (!url) return '';
  url = url.replace(/\/api\/v1\/?$/i, '');
  url = url.replace(/\/+$/, '');
  return url;
}

export function getBackendServerUrl(): string {
  // 开发模式：检查是否通过webpack dev server运行
  const isDevelopment = isWebpackDevServerHost(window.location.hostname);

  // 如果是开发模式且有webpack代理，使用空字符串（相对路径）
  // 这样请求会发送到同源，然后被webpack代理转发到后端
  if (isDevelopment) {
    console.log('[后端配置] 开发模式：使用webpack代理');
    return ''; // 空字符串表示使用相对路径，通过代理访问
  }

  // 生产模式：使用配置的后端URL
  if (typeof BACKEND_BASE_URL === 'string') {
    return normalizeBackendUrl(BACKEND_BASE_URL);
  }
  return '';
}

export function isBackendConfigured(): boolean {
  // 开发模式下，如果通过webpack dev server运行，认为已配置（使用代理）
  const isDevelopment = isWebpackDevServerHost(window.location.hostname);

  if (isDevelopment) {
    return true; // 开发模式下使用代理，认为已配置
  }

  // 生产模式下检查是否有配置的URL
  return !!getBackendServerUrl();
}

export function buildBackendUrl(path: string): string {
  const baseUrl = getBackendServerUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;

  // 如果baseUrl为空（开发模式使用代理），直接返回路径
  if (!baseUrl) {
    return suffix;
  }

  // 否则拼接完整URL
  return `${baseUrl}${suffix}`;
}

export async function fetchBackendVersion(): Promise<string | null> {
  try {
    const url = buildBackendUrl('/api/v1/version');
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && typeof data.version !== 'undefined') {
      return String(data.version);
    }
  } catch {
    return null;
  }
  return null;
}
