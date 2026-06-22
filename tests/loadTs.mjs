import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
  },
});

export async function loadTs(relativePath) {
  return jiti.import(new URL(relativePath, import.meta.url).pathname);
}
