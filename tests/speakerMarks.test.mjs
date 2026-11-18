// 说话人记号（Q29 修订版做法甲，2026-11-18 14:12 用户批准）：纯函数、显示、流式预览、截断抢救。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { loadTs } from './loadTs.mjs';

const marks = await loadTs('../src/utils/speakerMarks.ts');
const { resolveSpeakerId } = await loadTs('../src/utils/speakerMarkIds.ts');
const salvage = await loadTs('../src/services/narrativeResponseSalvage.ts');

const MARKED = '凝羽收起银针。〈凝羽〉“毒清了。”你点点头。〈你〉“多谢。”掌柜探出头来。〈掌柜〉「客官要住店？」〈云苍峰〉"走吧。"';
const PLAIN = '凝羽收起银针。“毒清了。”你点点头。“多谢。”掌柜探出头来。「客官要住店？」"走吧。"';

test('stripSpeakerMarks：完整记号、缺右括号、不紧跟引号、空记号都删；正文原样', () => {
  assert.equal(marks.stripSpeakerMarks(MARKED), PLAIN);
  assert.equal(marks.stripSpeakerMarks('〈凝羽“毒清了。”'), '“毒清了。”');
  assert.equal(marks.stripSpeakerMarks('他说〈凝羽〉毒清了。'), '他说毒清了。');
  assert.equal(marks.stripSpeakerMarks('〈〉“好。”〈“走。”结尾〈'), '“好。”“走。”结尾');
  assert.equal(marks.stripSpeakerMarks('〈凝羽\n“换行。”'), '\n“换行。”');
  // 缺右括号又不贴引号/换行/文末的，无法和正文里的〈…〉区分，不当记号
  assert.equal(marks.stripSpeakerMarks('〈凝羽，你来。'), '〈凝羽，你来。');
  assert.equal(marks.stripSpeakerMarks(PLAIN), PLAIN);
});

test('记号被当主语写在句首：存全文与显示时去括号留名字；句中的、名字重复的、概要选项用的 strip 仍删', () => {
  const raw = '卓云君立在阶旁。〈秦桧〉将一卷文书摊在案上。〈秦桧〉“黑魔海肯撤。”\n〈你〉抬手示意。';
  assert.equal(marks.stripSpeakerMarks(raw), '卓云君立在阶旁。将一卷文书摊在案上。“黑魔海肯撤。”\n抬手示意。');
  assert.equal(marks.normalizeSpeakerMarks('〈易虎〉易虎说路通了。他说〈凝羽〉毒清了。'), '易虎说路通了。他说毒清了。');
  assert.equal(marks.normalizeSpeakerMarks(raw), '卓云君立在阶旁。秦桧将一卷文书摊在案上。〈秦桧〉“黑魔海肯撤。”\n你抬手示意。');
  assert.deepEqual(marks.parseSpeakerMarks(raw), { text: '卓云君立在阶旁。秦桧将一卷文书摊在案上。“黑魔海肯撤。”\n你抬手示意。', speakers: [{ index: 20, speaker: '秦桧' }] });
  assert.equal(marks.stripSpeakerMarks('他说〈凝羽〉毒清了。'), '他说毒清了。');
});

test('保守规则：含标点或超过 12 字的〈…〉不当记号，原样保留', () => {
  const prose = '书上写着〈此乃上古遗留之物，切勿轻动〉几个字。〈一二三四五六七八九十十一十二十三〉';
  assert.equal(marks.stripSpeakerMarks(prose), prose);
  assert.equal(marks.normalizeSpeakerMarks(prose), prose);
});

test('normalizeSpeakerMarks：只留「完整记号＋紧跟开引号」，写坏的删掉', () => {
  assert.equal(marks.normalizeSpeakerMarks(MARKED), MARKED);
  assert.equal(marks.normalizeSpeakerMarks('〈凝羽〉 “隔了空格。”〈凝羽“缺括号。”他看向〈掌柜〉。〈'), ' “隔了空格。”“缺括号。”他看向。');
});

test('parseSpeakerMarks：拿掉记号，给出每句对白开引号下标与说话人', () => {
  const parsed = marks.parseSpeakerMarks(MARKED);
  assert.equal(parsed.text, PLAIN);
  assert.deepEqual(parsed.speakers.map(item => [parsed.text[item.index], item.speaker]),
    [['“', '凝羽'], ['“', '你'], ['「', '掌柜'], ['"', '云苍峰']]);
  assert.deepEqual(marks.parseSpeakerMarks(PLAIN), { text: PLAIN, speakers: [] });
  assert.deepEqual(marks.parseSpeakerMarks('他说〈凝羽〉毒清了。'), { text: '他说毒清了。', speakers: [] });
});

test('stripSpeakerMarksForStreaming：停在半个记号上不露', () => {
  for (const tail of ['〈', '〈凝', '〈凝羽', '〈凝羽〉']) {
    assert.equal(marks.stripSpeakerMarksForStreaming(`凝羽收起银针。${tail}`), '凝羽收起银针。', tail);
  }
  assert.equal(marks.stripSpeakerMarksForStreaming('凝羽收起银针。〈凝羽〉“毒'), '凝羽收起银针。“毒');
});

test('resolveSpeakerId：总表名字与别名对上返回 id；无名角色、主角、空串返回 null', () => {
  assert.equal(resolveSpeakerId('凝羽'), 'liuchao.character.ning_yu');
  assert.equal(resolveSpeakerId('程宗扬'), 'liuchao.character.cheng_zongyang');
  for (const name of ['掌柜', '你', '', '查无此人']) assert.equal(resolveSpeakerId(name), null, name);
});

// ---- 显示：FormattedText（与 formattedTextMounted.test.mjs 同法挂载，额外把 speakerMarks 编成 data URL） ----
async function tsModuleUrl(relative) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}

async function loadFormattedText() {
  const filename = new URL('../src/components/common/FormattedText.vue', import.meta.url).pathname;
  const { descriptor } = parse(await readFile(filename, 'utf8'), { filename });
  const compiled = compileScript(descriptor, { id: 'speaker-marks-test', inlineTemplate: true, templateOptions: { ssr: true } });
  const js = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replaceAll("from 'vue/server-renderer'", `from '${import.meta.resolve('@vue/server-renderer')}'`)
    .replaceAll('from "vue/server-renderer"', `from '${import.meta.resolve('@vue/server-renderer')}'`)
    .replaceAll("from '@/utils/speakerMarks'", `from '${await tsModuleUrl('../src/utils/speakerMarks.ts')}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).default;
}
const FormattedText = await loadFormattedText();
const render = text => renderToString(createSSRApp({ render: () => h(FormattedText, { text }) }));

test('显示：带记号与不带记号渲染完全相同，画面不露记号', async () => {
  const cases = [
    [MARKED, PLAIN],
    ['【山风】凝羽收起银针。〈凝羽〉“毒清了。”`她松了口气`', '【山风】凝羽收起银针。“毒清了。”`她松了口气`'],
    ['〈凝羽“缺右括号。”', '“缺右括号。”'],
    ['他说〈凝羽〉毒清了。', '他说毒清了。'],
    ['〈查无此人〉“名字不在总表。”', '“名字不在总表。”'],
    ['〈凝羽〉 “隔了空格。”', ' “隔了空格。”'],
  ];
  for (const [withMarks, without] of cases) {
    const html = await render(withMarks);
    assert.equal(html, await render(without), withMarks);
    assert.doesNotMatch(html, /[〈〉]/, withMarks);
  }
});

test('显示：旧存档条目（无记号）渲染与原文一致', async () => {
  const old = '你推开石门。“有人吗？”【殿内昏暗】〔系统提示：山门将在入夜后关闭〕';
  const html = await render(old);
  assert.match(html, /有人吗/);
  assert.match(html, /class="judgement-card/);
  assert.equal(html, await render(marks.stripSpeakerMarks(old)));
});

test('流式预览：FormattedText 拿到停在半个记号上的文本也不露', async () => {
  for (const tail of ['〈', '〈凝', '〈凝羽〉']) {
    const html = await render(marks.stripSpeakerMarksForStreaming(`凝羽收起银针。${tail}`));
    assert.doesNotMatch(html, /[〈〉]/, tail);
    // FormattedText 自己也拦：未经流式函数直接给它半个记号同样不露
    assert.doesNotMatch(await render(`凝羽收起银针。${tail}`), /[〈〉]/, tail);
  }
});

test('截断抢救：带记号的已闭合正文照常抢救，记号随正文保留', () => {
  const partial = salvage.salvageCompleteNarrativeResponse(
    '{"text":"你先看清眼前的草原。〈凝羽〉“风里有血腥气。”她按住剑柄。","mid_term_memory":"当下',
  );
  assert.equal(partial.salvaged, true);
  assert.equal(partial.text, '你先看清眼前的草原。〈凝羽〉“风里有血腥气。”她按住剑柄。');
  assert.equal(marks.stripSpeakerMarks(partial.text), '你先看清眼前的草原。“风里有血腥气。”她按住剑柄。');
  assert.deepEqual(partial.tavern_commands, []);
});
