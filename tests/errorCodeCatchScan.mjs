// 错误码守卫的源码扫描器：把注释、字符串、正则、模板字面量的内容抹成空格（保留长度与换行），再在“纯代码”上找 catch。
// 不是完整的 JS 解析器，只处理 try/catch 的 catch 块和 .catch(...) 处理器；够守卫用，别拿去做别的。

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'delete', 'throw', 'new', 'yield', 'await']);
const REGEX_AFTER_PUNCT = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const isWordChar = c => /[\w$]/.test(c);

/** 返回 { masked }：与原文等长，注释 / 字符串 / 正则 / 模板字面量内容替换为空格（换行保留）。 */
export function maskSource(src) {
  const out = src.split('');
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  let prev = '';
  const run = (start, stopAtCloseBrace) => {
    let i = start, depth = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { const end = src.indexOf('\n', i); const to = end < 0 ? src.length : end; blank(i, to); i = to; continue; }
      if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); const to = end < 0 ? src.length : end + 2; blank(i, to); i = to; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
        blank(i + 1, Math.min(j, src.length)); i = j + 1; prev = '"'; continue;
      }
      if (c === '`') { i = template(i); prev = '`'; continue; }
      if (c === '/' && (REGEX_AFTER_PUNCT.has(prev) || REGEX_AFTER_WORD.has(prev))) {
        let j = i + 1, inClass = false;
        while (j < src.length && src[j] !== '\n' && (inClass || src[j] !== '/')) {
          if (src[j] === '\\') j++;
          else if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          j++;
        }
        blank(i + 1, Math.min(j, src.length)); i = j + 1; prev = '/'; continue;
      }
      if (stopAtCloseBrace) {
        if (c === '{') depth++;
        else if (c === '}') { if (depth === 0) return i; depth--; }
      }
      if (isWordChar(c)) {
        let j = i; while (j < src.length && isWordChar(src[j])) j++;
        prev = src.slice(i, j); i = j; continue;
      }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
    return i;
  };
  const template = start => {
    let i = start + 1;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { blank(i, i + 2); i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        blank(i, i + 2);
        prev = '{';
        i = run(i + 2, true);
        if (src[i] === '}') { blank(i, i + 1); i++; }
        continue;
      }
      blank(i, i + 1); i++;
    }
    return i + 1;
  };
  run(0, false);
  return out.join('');
}

function matchClose(masked, openIdx) {
  const open = masked[openIdx], close = open === '{' ? '}' : ')';
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close && --depth === 0) return i;
  }
  return -1;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;
const lineStart = (src, index) => src.lastIndexOf('\n', index - 1) + 1;
const prevLineStart = (src, index) => { const s = lineStart(src, index); return s === 0 ? 0 : lineStart(src, s - 1); };

export const LOGGING_CALL = /\blog(?:Error|Event|EventOnce|GateRefusal|Console)\s*\(/;
export const ALLOW_MARK = /lcq-allow:\s*\S+/;

/**
 * 找出所有 catch：{ kind: 'try' | 'promise', line, handled, fingerprint }
 * handled = 体内有 logError/logEvent 等调用，或附近（上一行起至体尾）有 `lcq-allow: 原因`。
 * fingerprint 取抹掉字符串与注释后的体前缀，改日志文案不会让存量 catch 变成“新增”。
 */
export function scanCatches(src) {
  const masked = maskSource(src), found = [];
  for (const m of masked.matchAll(/\bcatch\b/g)) {
    const at = m.index;
    let k = at - 1; while (k >= 0 && /\s/.test(masked[k])) k--;
    let kind, bodyStart, bodyEnd;
    if (masked[k] === '.') {
      kind = 'promise';
      let p = at + 5; while (/\s/.test(masked[p] ?? '')) p++;
      if (masked[p] !== '(') continue;
      bodyStart = p; bodyEnd = matchClose(masked, p);
    } else {
      kind = 'try';
      let p = at + 5; while (/\s/.test(masked[p] ?? '')) p++;
      if (masked[p] === '(') { p = matchClose(masked, p) + 1; while (/\s/.test(masked[p] ?? '')) p++; }
      if (masked[p] !== '{') continue;
      bodyStart = p; bodyEnd = matchClose(masked, p);
    }
    if (bodyEnd < 0) continue;
    const body = masked.slice(bodyStart, bodyEnd + 1);
    // 豁免写在 catch 所在行起至体尾，或写在紧挨着的上一行（该行只有注释，不能是别的 catch 行尾的注释）。
    const prevLine = src.slice(prevLineStart(src, at), lineStart(src, at));
    const nearby = (/^\s*(\/\/|\/\*|\*)/.test(prevLine) ? prevLine : '') + src.slice(lineStart(src, at), bodyEnd + 1);
    found.push({
      kind, line: lineOf(src, at),
      handled: LOGGING_CALL.test(body) || ALLOW_MARK.test(nearby),
      fingerprint: `${kind}|${body.replace(/\s+/g, ' ').slice(0, 100)}`,
    });
  }
  return found;
}

/** .vue 只扫 <script> 块（行号按整文件算：把非 script 部分替换为同样多的换行）。 */
export function scriptOf(file, text) {
  if (!file.endsWith('.vue')) return text;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const start = m.index + m[0].indexOf('>') + 1;
    out += text.slice(last, start).replace(/[^\n]/g, ' ') + m[1];
    last = start + m[1].length;
  }
  return out + text.slice(last).replace(/[^\n]/g, ' ');
}
