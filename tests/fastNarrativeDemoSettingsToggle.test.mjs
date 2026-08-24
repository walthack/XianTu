import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';

const panelUrl = new URL('../src/components/dashboard/SettingsPanel.vue', import.meta.url);

test('settings panel exposes the existing fast narrative demo flag without touching save data', async () => {
  const source = await readFile(panelUrl, 'utf8');
  const { descriptor, errors } = parse(source, { filename: panelUrl.pathname });
  assert.deepEqual(errors, []);
  assert.ok(descriptor.scriptSetup);
  assert.ok(descriptor.template);

  const script = compileScript(descriptor, { id: 'fast-narrative-settings-toggle' });
  assert.match(script.content, /FAST_NARRATIVE_DEMO_STORAGE_KEY/);
  assert.match(script.content, /localStorage\.setItem\(FAST_NARRATIVE_DEMO_STORAGE_KEY, 'true'\)/);
  assert.match(script.content, /localStorage\.setItem\(FAST_NARRATIVE_DEMO_STORAGE_KEY, 'false'\)/);
  assert.match(script.content, /if \(raw == null \|\| raw === ''\) return true/);

  const template = compileTemplate({
    id: 'fast-narrative-settings-toggle',
    filename: panelUrl.pathname,
    source: descriptor.template.content,
  });
  assert.deepEqual(template.errors, []);
  assert.match(source, /v-model="fastNarrativeDemoEnabled"/);
  assert.match(source, /@change="onFastNarrativeDemoChange"/);
  assert.match(source, /清羽快速叙事（实验）/);
});
