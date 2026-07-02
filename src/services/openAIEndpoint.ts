export type OpenAIEndpointKind = 'chat/completions' | 'models';

export function normalizeOpenAIBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

export function buildOpenAICompatibleEndpoint(url: string, kind: OpenAIEndpointKind): string {
  const baseUrl = normalizeOpenAIBaseUrl(url);
  if (!baseUrl) return '';

  if (kind === 'chat/completions') {
    if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
    if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/chat/completions`;
    return `${baseUrl}/v1/chat/completions`;
  }

  if (/\/models$/i.test(baseUrl)) return baseUrl;
  if (/\/chat\/completions$/i.test(baseUrl)) {
    return baseUrl.replace(/\/chat\/completions$/i, '/models');
  }
  if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/models`;
  return `${baseUrl}/v1/models`;
}

