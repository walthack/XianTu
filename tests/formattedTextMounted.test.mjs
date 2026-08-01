import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';

async function loadFormattedTextComponent() {
  const filename = new URL('../src/components/common/FormattedText.vue', import.meta.url).pathname;
  const source = await readFile(filename, 'utf8');
  const { descriptor, errors } = parse(source, { filename });
  assert.deepEqual(errors, []);

  const compiled = compileScript(descriptor, {
    id: 'formatted-text-mounted-test',
    inlineTemplate: true,
    templateOptions: { ssr: true },
  });
  const transpiled = ts.transpileModule(compiled.content, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const resolvable = transpiled
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`)
    .replaceAll("from 'vue/server-renderer'", `from '${import.meta.resolve('@vue/server-renderer')}'`)
    .replaceAll('from "vue/server-renderer"', `from '${import.meta.resolve('@vue/server-renderer')}'`);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(resolvable).toString('base64')}`;
  return (await import(moduleUrl)).default;
}

async function renderFormattedText(component, text) {
  const app = createSSRApp({
    render: () => h(component, { text }),
  });
  return renderToString(app);
}

test('FormattedText mount downgrades legacy model rolls while preserving non-roll system notices', async () => {
  const FormattedText = await loadFormattedTextComponent();

  const legacyHtml = await renderFormattedText(
    FormattedText,
    '剑光落下。〔突破:失败,判定值:18,难度:60,走火入魔〕余音未绝。',
  );
  assert.match(legacyHtml, /旧叙事描述，不计入系统/);
  assert.doesNotMatch(legacyHtml, /class="judgement-card/);
  assert.match(legacyHtml, /剑光落下/);
  assert.match(legacyHtml, /余音未绝/);

  const noticeHtml = await renderFormattedText(FormattedText, '〔系统提示：山门将在入夜后关闭〕');
  assert.match(noticeHtml, /class="judgement-card/);
  assert.match(noticeHtml, /山门将在入夜后关闭/);
});
