/**
 * Recover a complete, already-closed narrative field from a truncated model body.
 * Incomplete JSON, unclosed strings, and partial tavern_commands are not submitted.
 */

const TEXT_KEYS = ['text', '叙事文本', 'narrative'];
const MEMORY_KEYS = ['mid_term_memory', '中期记忆', 'memory'];

export interface SalvagedNarrativeResponse {
  text: string;
  mid_term_memory: string;
  tavern_commands: unknown[];
  salvaged: boolean;
}

function isCompleteSafeNarrative(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[。！？…」』”]$/.test(trimmed) && trimmed.length >= 12) return true;
  return trimmed.length >= 80;
}

function extractCompleteJsonStringField(raw: string, keys: string[]): string | null {
  for (const key of keys) {
    const marker = `"${key}"`;
    const keyIndex = raw.indexOf(marker);
    if (keyIndex < 0) continue;
    const colon = raw.indexOf(':', keyIndex + marker.length);
    if (colon < 0) continue;
    let index = colon + 1;
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    if (raw[index] !== '"') continue;
    index += 1;
    let output = '';
    while (index < raw.length) {
      const char = raw[index];
      if (char === '\\') {
        if (index + 1 >= raw.length) return null;
        const next = raw[index + 1];
        if (next === 'u') {
          if (index + 5 >= raw.length) return null;
          const hex = raw.slice(index + 2, index + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
          output += String.fromCharCode(Number.parseInt(hex, 16));
          index += 6;
          continue;
        }
        const escaped: Record<string, string> = {
          n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/',
        };
        output += escaped[next] ?? next;
        index += 2;
        continue;
      }
      if (char === '"') return output;
      output += char;
      index += 1;
    }
    return null;
  }
  return null;
}

function parseCompleteObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1]?.trim(), text].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          // Truncated object: fall through to closed-string salvage.
        }
      }
    }
  }
  return null;
}

export function salvageCompleteNarrativeResponse(raw: string): SalvagedNarrativeResponse | null {
  const parsed = parseCompleteObject(raw);
  if (parsed) {
    const text = String(parsed.text || parsed.叙事文本 || parsed.narrative || '').trim();
    if (!text) return null;
    const commands = Array.isArray(parsed.tavern_commands)
      ? parsed.tavern_commands
      : Array.isArray(parsed.指令)
        ? parsed.指令
        : [];
    return {
      text,
      mid_term_memory: String(parsed.mid_term_memory || parsed.中期记忆 || parsed.memory || ''),
      tavern_commands: commands,
      salvaged: false,
    };
  }

  const text = extractCompleteJsonStringField(String(raw || ''), TEXT_KEYS);
  if (!text || !isCompleteSafeNarrative(text)) return null;
  const memory = extractCompleteJsonStringField(String(raw || ''), MEMORY_KEYS) || '';
  return {
    text,
    mid_term_memory: memory,
    tavern_commands: [],
    salvaged: true,
  };
}

export function serializeSalvagedNarrativeResponse(salvaged: SalvagedNarrativeResponse): string {
  return JSON.stringify({
    text: salvaged.text,
    mid_term_memory: salvaged.mid_term_memory,
    tavern_commands: salvaged.tavern_commands,
    action_options: [],
  });
}
