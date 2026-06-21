import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('TypeScript test harness loads and exercises application modules', async () => {
  const { createDadBundle, unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
  const bundle = createDadBundle('presets', { presets: [{ id: 'fixture' }] });

  assert.equal(bundle.schema, 'dad.bundle');
  assert.deepEqual(unwrapDadBundle(bundle), {
    type: 'presets',
    payload: { presets: [{ id: 'fixture' }] },
    isBundle: true,
  });
});
