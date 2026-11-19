// 新界面字框（?ui=new）切段纯函数：按段切、长段按句末标点拆、引号里不拆、说话人取第一个记号。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { splitNarrativeSegments, segmentSpeaker, SEGMENT_MAX_LEN } = await loadTs('../src/utils/narrativeSegments.ts');

test('按换行分段，空行和首尾空白去掉', () => {
  assert.deepEqual(splitNarrativeSegments('第一段。\n\n  第二段。  \n第三段。'), ['第一段。', '第二段。', '第三段。']);
  assert.deepEqual(splitNarrativeSegments(''), []);
  assert.deepEqual(splitNarrativeSegments('\n\n'), []);
});

test('不超过上限的段不拆', () => {
  const para = '你没有退。'.repeat(20); // 100 字
  assert.deepEqual(splitNarrativeSegments(para), [para]);
  assert.equal(SEGMENT_MAX_LEN, 130);
});

test('超长段按句末标点拆，每块不超过上限，拼回去等于原文', () => {
  const para = '库里的灯油味很重，三只黑木箱并排摆在货架下面。'.repeat(8); // 23*8=184 字
  const segs = splitNarrativeSegments(para);
  assert.ok(segs.length >= 2);
  assert.equal(segs.join(''), para);
  for (const s of segs) assert.ok(s.length <= 130, s.length);
  for (const s of segs) assert.ok(/[。！？]$/.test(s));
});

test('引号里的句号不拆；后引号跟着句末标点留在前一块', () => {
  const quote = '「' + '里面有东西在动。你退后。'.repeat(6) + '」'; // 引号内 74 字
  const para = '凝羽低声道：' + quote + '你没有退，只是把灯举高了一些。'.repeat(5);
  const segs = splitNarrativeSegments(para);
  assert.equal(segs.join(''), para);
  // 引号整个落在同一块里
  assert.ok(segs.some(s => s.includes(quote)));
  for (const s of segs) {
    const open = (s.match(/「/g) || []).length;
    const close = (s.match(/」/g) || []).length;
    assert.equal(open, close, s);
  }
});

test('句末标点紧跟后引号：在后引号之后拆', () => {
  const a = '“' + '我听了半天了。'.repeat(10) + '”'; // 72 字
  const b = '乐明珠说完又缩回货架后面，只露出半张脸来看你。'.repeat(3);
  const segs = splitNarrativeSegments(a + b);
  assert.ok(segs.length >= 2);
  assert.ok(segs[0].startsWith(a));
  assert.ok(segs.every(s => !/^[”」』]/.test(s)));
  assert.equal(segs.join(''), a + b);
});

test('上限按去掉说话人记号后的可见字数算；记号不被拆开', () => {
  const line = '〈凝羽〉「' + '毒清了。'.repeat(30) + '」'; // 可见 122 字
  assert.deepEqual(splitNarrativeSegments(line), [line]);
  const long = '凝羽收起银针。〈凝羽〉「毒清了。」' + '你点点头，转身去看那口箱子。'.repeat(10);
  const segs = splitNarrativeSegments(long);
  assert.equal(segs.join(''), long);
  assert.ok(segs.every(s => !/〈[^〉]*$/.test(s)));
});

test('一句话本身超长且没有句末标点时整句留着，不硬切', () => {
  const para = '风'.repeat(200);
  assert.deepEqual(splitNarrativeSegments(para), [para]);
});

test('segmentSpeaker：有记号取第一个名字，旁白返回 null', () => {
  assert.equal(segmentSpeaker('〈凝羽〉「里面有东西在动。你退后。」'), '凝羽');
  assert.equal(segmentSpeaker('乐明珠探出头。〈乐明珠〉“不是他。”〈凝羽〉“退后。”'), '乐明珠');
  assert.equal(segmentSpeaker('库里只剩你一个人。'), null);
  assert.equal(segmentSpeaker('〈凝羽〉没有引号的不算记号'), null);
});
