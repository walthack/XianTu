import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const CANON_AUTHORITY_OVERLAY_DIR = resolve(scriptDir, '..', 'mod-kit', 'canon-authority-overlays');
const MANIFEST_NAME = 'manifest.json';

function clone(value) {
  return structuredClone(value);
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function fail(message) {
  throw new Error(`canon authority overlay: ${message}`);
}

export function tokenizePath(path) {
  if (typeof path !== 'string' || !path) fail(`invalid path ${path}`);
  const tokens = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === '.') {
      i += 1;
      continue;
    }
    if (path.startsWith('[id=', i)) {
      const end = path.indexOf(']', i);
      if (end < 0) fail(`unterminated id selector in ${path}`);
      tokens.push({ type: 'id', value: path.slice(i + 4, end) });
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j += 1;
    if (j === i) fail(`bad path at ${i}: ${path}`);
    tokens.push({ type: 'key', value: path.slice(i, j) });
    i = j;
  }
  if (!tokens.length) fail(`empty path ${path}`);
  return tokens;
}

function resolveNode(root, tokens) {
  let current = root;
  for (const token of tokens) {
    if (token.type === 'key') {
      if (current == null || typeof current !== 'object' || Array.isArray(current) || !(token.value in current)) {
        fail(`missing key ${token.value}`);
      }
      current = current[token.value];
    } else {
      if (!Array.isArray(current)) fail(`id selector on non-array for ${token.value}`);
      const found = current.find(item => item && item.id === token.value);
      if (!found) fail(`missing id ${token.value}`);
      current = found;
    }
  }
  return current;
}

function resolveContainer(root, path) {
  return resolveNode(root, tokenizePath(path));
}

function resolveSetTarget(root, path) {
  const tokens = tokenizePath(path);
  const last = tokens.pop();
  if (last.type !== 'key') fail(`set path must end in a key: ${path}`);
  const parent = tokens.length ? resolveNode(root, tokens) : root;
  if (parent == null || typeof parent !== 'object' || Array.isArray(parent)) {
    fail(`set parent is not an object: ${path}`);
  }
  if (!(last.value in parent)) fail(`missing set key ${last.value} at ${path}`);
  return { parent, key: last.value };
}

function isIdAddressedArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every(item => item && typeof item === 'object' && typeof item.id === 'string');
}

function assertValidIdArray(value, path, side) {
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') {
      fail(`${side} id-array item missing string id at ${path}[${i}]`);
    }
    if (item.id === '') fail(`${side} id-array has empty id at ${path}[${i}]`);
    if (seen.has(item.id)) fail(`${side} id-array has duplicate id ${item.id} at ${path}`);
    seen.add(item.id);
  }
}

function replaceObjectKeys(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

export function buildCanonAuthorityOps(from, to, path = '') {
  const ops = [];
  emitOps(from, to, path, ops);
  return ops;
}

function emitOps(from, to, path, ops) {
  if (deepEqual(from, to)) return;
  if (from === undefined) fail(`unexpected missing source at ${path || '<root>'}`);
  if (to === undefined) fail(`overlay must not delete ${path || '<root>'}`);
  // Once source is id-addressed, keep that structure. Empty target still hits delete detection.
  if (isIdAddressedArray(from)) {
    const at = path || '<root>';
    assertValidIdArray(from, at, 'source');
    if (!Array.isArray(to)) fail(`overlay must keep id-addressed array at ${at}`);
    if (to.length > 0) assertValidIdArray(to, at, 'target');
    emitIdArrayOps(from, to, path, ops);
    return;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    ops.push({ op: 'set', path, from: clone(from), to: clone(to) });
    return;
  }
  if (from && to && typeof from === 'object' && typeof to === 'object' && !Array.isArray(from) && !Array.isArray(to)) {
    emitObjectOps(from, to, path, ops);
    return;
  }
  ops.push({ op: 'set', path, from: clone(from), to: clone(to) });
}

function emitObjectOps(from, to, path, ops) {
  const fromKeys = Object.keys(from);
  const toKeys = Object.keys(to);
  const fromSet = new Set(fromKeys);
  const toSet = new Set(toKeys);
  const removed = fromKeys.filter(key => !toSet.has(key));
  if (removed.length) fail(`overlay would delete keys ${removed.join(', ')} at ${path || '<root>'}`);

  let lastExisting = null;
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    ops.push({
      op: 'insertKeys',
      path,
      afterKey: lastExisting,
      beforeKey: pendingAfterExistingKey(toKeys, lastExisting, fromSet),
      entries: Object.fromEntries(pending.map(([key, value]) => [key, clone(value)])),
    });
    pending = [];
  };

  for (const key of toKeys) {
    if (!fromSet.has(key)) {
      pending.push([key, to[key]]);
      continue;
    }
    flush();
    const childPath = path ? `${path}.${key}` : key;
    emitOps(from[key], to[key], childPath, ops);
    lastExisting = key;
  }
  flush();
}

function pendingAfterExistingKey(toKeys, lastExisting, fromSet) {
  const start = lastExisting == null ? 0 : toKeys.indexOf(lastExisting) + 1;
  for (let i = start; i < toKeys.length; i += 1) {
    if (fromSet.has(toKeys[i])) return toKeys[i];
  }
  return null;
}

function emitIdArrayOps(from, to, path, ops) {
  const fromIds = from.map(item => item.id);
  const toIds = to.map(item => item.id);
  const fromSet = new Set(fromIds);
  const toSet = new Set(toIds);
  const removed = fromIds.filter(id => !toSet.has(id));
  const added = toIds.filter(id => !fromSet.has(id));
  if (removed.length && added.length && fromIds.every(id => !toSet.has(id))) {
    ops.push({ op: 'set', path, from: clone(from), to: clone(to) });
    return;
  }
  if (removed.length) fail(`overlay would delete ids ${removed.join(', ')} at ${path}`);

  const fromById = new Map(from.map(item => [item.id, item]));
  let lastKept = null;
  for (const item of to) {
    if (fromSet.has(item.id)) {
      emitOps(fromById.get(item.id), item, `${path}[id=${item.id}]`, ops);
      lastKept = item.id;
      continue;
    }
    if (lastKept) {
      ops.push({ op: 'insertAfter', path, afterId: lastKept, value: clone(item) });
    } else {
      ops.push({ op: 'insertBefore', path, beforeId: fromIds[0], value: clone(item) });
    }
    lastKept = item.id;
  }
}

function applySet(root, op) {
  const { parent, key } = resolveSetTarget(root, op.path);
  const current = parent[key];
  if (deepEqual(current, op.to)) return 0;
  if (!deepEqual(current, op.from)) {
    fail(`source drift at ${op.path}`);
  }
  parent[key] = clone(op.to);
  return 1;
}

function applyInsert(root, op) {
  const list = resolveContainer(root, op.path);
  if (!Array.isArray(list)) fail(`insert target is not an array: ${op.path}`);
  const value = op.value;
  if (!value || typeof value.id !== 'string') fail(`insert value missing id at ${op.path}`);
  const existing = list.find(item => item && item.id === value.id);
  if (existing) {
    if (!deepEqual(existing, value)) fail(`source drift for id ${value.id} at ${op.path}`);
    return 0;
  }
  if (op.op === 'insertAfter') {
    const index = list.findIndex(item => item && item.id === op.afterId);
    if (index < 0) fail(`missing afterId ${op.afterId} at ${op.path}`);
    list.splice(index + 1, 0, clone(value));
    return 1;
  }
  const index = list.findIndex(item => item && item.id === op.beforeId);
  if (index < 0) fail(`missing beforeId ${op.beforeId} at ${op.path}`);
  list.splice(index, 0, clone(value));
  return 1;
}

function applyInsertKeys(root, op) {
  const target = op.path ? resolveContainer(root, op.path) : root;
  if (target == null || typeof target !== 'object' || Array.isArray(target)) {
    fail(`insertKeys target is not an object: ${op.path || '<root>'}`);
  }
  const entries = op.entries || {};
  const entryKeys = Object.keys(entries);
  if (!entryKeys.length) fail(`insertKeys missing entries at ${op.path || '<root>'}`);
  const present = entryKeys.filter(key => Object.prototype.hasOwnProperty.call(target, key));
  if (present.length === entryKeys.length) {
    for (const key of entryKeys) {
      if (!deepEqual(target[key], entries[key])) fail(`source drift at ${op.path || '<root>'}.${key}`);
    }
    return 0;
  }
  if (present.length) fail(`partial key overlap at ${op.path || '<root>'}: ${present.join(', ')}`);
  if (op.afterKey != null && !Object.prototype.hasOwnProperty.call(target, op.afterKey)) {
    fail(`missing afterKey ${op.afterKey} at ${op.path || '<root>'}`);
  }
  if (op.beforeKey != null && !Object.prototype.hasOwnProperty.call(target, op.beforeKey)) {
    fail(`missing beforeKey ${op.beforeKey} at ${op.path || '<root>'}`);
  }
  const next = {};
  if (op.afterKey == null) {
    Object.assign(next, clone(entries));
    Object.assign(next, target);
  } else {
    for (const key of Object.keys(target)) {
      next[key] = target[key];
      if (key === op.afterKey) Object.assign(next, clone(entries));
    }
  }
  if (op.beforeKey != null) {
    const keys = Object.keys(next);
    const firstEntry = entryKeys[0];
    const beforeIndex = keys.indexOf(op.beforeKey);
    const entryIndex = keys.indexOf(firstEntry);
    if (beforeIndex < 0 || entryIndex < 0 || beforeIndex !== entryIndex + entryKeys.length) {
      fail(`insertKeys landed in the wrong place at ${op.path || '<root>'}`);
    }
  }
  replaceObjectKeys(target, next);
  return entryKeys.length;
}

export function applyCanonAuthorityOverlay(mod, overlay) {
  if (!overlay || overlay.stageId !== mod?.manifest?.id) {
    fail(`stage mismatch: overlay ${overlay?.stageId} vs mod ${mod?.manifest?.id}`);
  }
  if (!Array.isArray(overlay.ops) || overlay.ops.length === 0) {
    fail(`empty ops for ${overlay.stageId}`);
  }
  const working = clone(mod);
  let applied = 0;
  for (const op of overlay.ops) {
    if (op.op === 'set') applied += applySet(working, op);
    else if (op.op === 'insertAfter' || op.op === 'insertBefore') applied += applyInsert(working, op);
    else if (op.op === 'insertKeys') applied += applyInsertKeys(working, op);
    else fail(`unknown op ${op.op} for ${overlay.stageId}`);
  }
  replaceObjectKeys(mod, working);
  return applied;
}

function validateManifest(manifest, files) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.overlays)) {
    fail('manifest must be version 1 with overlays[]');
  }
  const fileSet = new Set(files);
  if (!fileSet.has(MANIFEST_NAME)) fail('manifest.json missing');
  const overlayFiles = files.filter(name => name.endsWith('.json') && name !== MANIFEST_NAME).sort();
  const listed = manifest.overlays.map(entry => entry.file).sort();
  if (!deepEqual(overlayFiles, listed)) {
    fail(`overlay files ${overlayFiles.join(', ')} != manifest ${listed.join(', ')}`);
  }
  const seen = new Set();
  for (const entry of manifest.overlays) {
    if (!entry?.stageId || !entry?.file || !entry?.book) fail('manifest entry missing stageId/file/book');
    if (seen.has(entry.stageId)) fail(`duplicate stageId ${entry.stageId}`);
    seen.add(entry.stageId);
  }
  return manifest;
}

let cachedCatalog;

export async function loadTrackedCanonAuthorityOverlays(dir = CANON_AUTHORITY_OVERLAY_DIR) {
  if (cachedCatalog && dir === CANON_AUTHORITY_OVERLAY_DIR) return cachedCatalog;
  let files;
  try {
    files = (await readdir(dir)).filter(name => name.endsWith('.json')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`overlay directory missing: ${dir}`);
    throw error;
  }
  const manifest = validateManifest(JSON.parse(await readFile(join(dir, MANIFEST_NAME), 'utf8')), files);
  const byStageId = new Map();
  for (const entry of manifest.overlays) {
    const overlay = JSON.parse(await readFile(join(dir, entry.file), 'utf8'));
    if (overlay.version !== 1) fail(`${entry.file} must be version 1`);
    if (overlay.stageId !== entry.stageId) fail(`${entry.file} stageId mismatch`);
    if (!Array.isArray(overlay.ops) || overlay.ops.length === 0) fail(`${entry.file} has no ops`);
    byStageId.set(entry.stageId, overlay);
  }
  const catalog = { version: 1, manifest, byStageId, stageIds: [...byStageId.keys()] };
  if (dir === CANON_AUTHORITY_OVERLAY_DIR) cachedCatalog = catalog;
  return catalog;
}

export async function applyTrackedCanonAuthorityOverlay(mod, catalog) {
  const loaded = catalog || await loadTrackedCanonAuthorityOverlays();
  const overlay = loaded.byStageId.get(mod?.manifest?.id);
  if (!overlay) return { matched: false, applied: 0 };
  return { matched: true, applied: applyCanonAuthorityOverlay(mod, overlay) };
}

export async function assertCanonAuthorityOverlaysApplied(appliedStageIds, catalog) {
  const loaded = catalog || await loadTrackedCanonAuthorityOverlays();
  const missing = loaded.stageIds.filter(id => !appliedStageIds.has(id));
  if (missing.length) fail(`sync did not apply overlays for ${missing.join(', ')}`);
}
