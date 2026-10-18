/**
 * 最小 zip 写入器（store 模式，不压缩，不新增依赖）：反馈包只有几个 JSON 文本，不压缩换来零依赖、可核对。
 * 文件名按 UTF-8 写（通用标志位 bit11），单文件/总大小/条数都按经典 zip 上限校验，超限直接抛错（不写 zip64）。
 */
export interface ZipFile { name: string; data: Uint8Array | string }

const MAX_U32 = 0xffffffff, MAX_U16 = 0xffff;
const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS 时间戳（zip 头用）；早于 1980 的时间按 1980-01-01 记。 */
function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.max(at.getFullYear(), 1980);
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

function checkName(name: string, seen: Set<string>): void {
  if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(part => part === '..' || part === '')) throw new Error(`zip 文件名不合法：${name}`);
  if (seen.has(name)) throw new Error(`zip 文件名重复：${name}`);
  seen.add(name);
}

export function createZip(files: ZipFile[], at: Date = new Date()): Uint8Array {
  if (files.length > MAX_U16) throw new Error('zip 条目过多');
  const { time, date } = dosDateTime(at), seen = new Set<string>();
  const entries = files.map(file => {
    checkName(file.name, seen);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    return { name: encoder.encode(file.name), data, crc: crc32(data) };
  });

  let offset = 0, centralSize = 0;
  const locals: Array<{ offset: number }> = entries.map(entry => {
    const local = { offset };
    offset += 30 + entry.name.length + entry.data.length;
    centralSize += 46 + entry.name.length;
    return local;
  });
  if (offset + centralSize + 22 > MAX_U32) throw new Error('zip 总大小超过 4GB 上限');

  const out = new Uint8Array(offset + centralSize + 22), view = new DataView(out.buffer);
  let pos = 0;
  entries.forEach(entry => {
    view.setUint32(pos, 0x04034b50, true); view.setUint16(pos + 4, 20, true); view.setUint16(pos + 6, 0x0800, true);
    view.setUint16(pos + 8, 0, true); view.setUint16(pos + 10, time, true); view.setUint16(pos + 12, date, true);
    view.setUint32(pos + 14, entry.crc, true); view.setUint32(pos + 18, entry.data.length, true); view.setUint32(pos + 22, entry.data.length, true);
    view.setUint16(pos + 26, entry.name.length, true); view.setUint16(pos + 28, 0, true);
    out.set(entry.name, pos + 30); out.set(entry.data, pos + 30 + entry.name.length);
    pos += 30 + entry.name.length + entry.data.length;
  });
  const centralStart = pos;
  entries.forEach((entry, index) => {
    view.setUint32(pos, 0x02014b50, true); view.setUint16(pos + 4, 20, true); view.setUint16(pos + 6, 20, true); view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true); view.setUint16(pos + 12, time, true); view.setUint16(pos + 14, date, true);
    view.setUint32(pos + 16, entry.crc, true); view.setUint32(pos + 20, entry.data.length, true); view.setUint32(pos + 24, entry.data.length, true);
    view.setUint16(pos + 28, entry.name.length, true); // 额外字段 / 注释 / 起始盘号 / 内外部属性均为 0（ArrayBuffer 初值）
    view.setUint32(pos + 42, locals[index].offset, true);
    out.set(entry.name, pos + 46);
    pos += 46 + entry.name.length;
  });
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, entries.length, true); view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, centralSize, true); view.setUint32(pos + 16, centralStart, true);
  return out;
}
