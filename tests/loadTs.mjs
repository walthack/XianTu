import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
});

export async function loadTs(relativePath) {
  return jiti.import(new URL(relativePath, import.meta.url).pathname);
}
