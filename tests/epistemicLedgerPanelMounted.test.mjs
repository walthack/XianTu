import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';

async function loadPanel() {
  const filename = new URL('../src/components/dashboard/components/EpistemicLedgerPanel.vue', import.meta.url).pathname;
  const source = await readFile(filename, 'utf8');
  const { descriptor, errors } = parse(source, { filename });
  assert.deepEqual(errors, []);
  const compiled = compileScript(descriptor, {
    id: 'epistemic-ledger-panel-mounted-test',
    inlineTemplate: true,
    templateOptions: { ssr: true },
  });
  const transpiled = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const resolvable = transpiled
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`)
    .replaceAll("from 'vue/server-renderer'", `from '${import.meta.resolve('@vue/server-renderer')}'`)
    .replaceAll('from "vue/server-renderer"', `from '${import.meta.resolve('@vue/server-renderer')}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(resolvable).toString('base64')}`)).default;
}

test('epistemic ledger mounts confirmed, rumor, legacy and path receipts from engine state', async () => {
  const Panel = await loadPanel();
  const app = createSSRApp({
    render: () => h(Panel, {
      playerKnowledge: {
        confirmed: {
          factId: 'event.knowledge.confirmed', status: 'confirmed', claim: '王蕙撰写小史',
          source: { label: '小紫的说明' }, learnedAtTurn: 4,
        },
        rumor: {
          factId: 'event.knowledge.rumor', status: 'rumor', claim: '街巷附会皇叔血统',
          source: { label: '洛都街巷传抄' }, learnedAtTurn: 5,
        },
        legacy: {
          factId: 'legacy.fact', status: 'rumor', subjectId: 'old.subject', predicate: 'heard',
          sourceEventId: 'old.event', learnedAtTurn: 1,
        },
      },
      pathReceipts: {
        route: { receiptId: 'event.path.private', label: '私下追查', dimension: 'method', selectedAtTurn: 4 },
      },
    }),
  });
  const html = await renderToString(app);
  assert.match(html, /认知与路径/);
  assert.match(html, /已确认[\s\S]*王蕙撰写小史[\s\S]*小紫的说明/);
  assert.match(html, /听说[\s\S]*街巷附会皇叔血统[\s\S]*洛都街巷传抄/);
  assert.match(html, /old\.subject\.heard（旧记录）/);
  assert.match(html, /私下追查[\s\S]*路径记录 · method/);
});
