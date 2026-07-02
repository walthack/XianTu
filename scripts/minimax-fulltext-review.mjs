#!/usr/bin/env node

// MiniMax M2.7 全文检索式复核。
// 产物只用于人工裁定，不直接写回正典：
//   mod-kit/generated/deepseek-v4-flash/character-canon/minimax-fulltext-review.{json,md}
//
// Usage:
//   node scripts/minimax-fulltext-review.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const reviewDir = join(outDir, 'minimax-review');
const material = '/Volumes/botsvault/06_material';

const BOOKS = {
  qingyu: { title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  yunlong: { title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  yange: { title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
};

const ITEMS = [
  {
    id: 'p0_zhao_hede',
    group: 'P0角色二审剩余',
    books: ['yange', 'yunlong'],
    keywords: ['赵合德', '合德', '赵飞燕'],
    question: '复核赵合德角色卡需要的身份、性格、外貌/体质、与程宗扬关系、关键结局；只列原文明确支持的事实，无法确认写 unknown。',
  },
  {
    id: 'p0_cheng_zongyang',
    group: 'P0角色二审剩余',
    books: ['qingyu', 'yunlong', 'yange'],
    keywords: ['程宗扬', '程头儿', '程少主', '程员外'],
    question: '复核程宗扬主角卡是否有需要修正的核心身份、性格、能力限制、与后宫关系；只列可由原文支持的事实和需人工注意的矛盾。',
  },
  {
    id: 'p0_qi_yuxian',
    group: 'P0角色二审剩余',
    books: ['yange', 'yunlong'],
    keywords: ['齐羽仙', '羽仙'],
    question: '复核齐羽仙是否有明确武功境界、身份、与黑魔海/李辅国/程宗扬关系。尤其判断“武功上乘/六级通幽境”是否有原文支持。',
  },
  {
    id: 'p0_wu_erlang_poison',
    group: 'P0角色二审剩余',
    books: ['qingyu', 'yunlong'],
    keywords: ['武二郎', '武二', '凝羽', '中毒'],
    question: '复核武二郎“中毒后由凝羽救治”是否有原文支持；若只是相邻剧情或误会，指出 unsupported。',
  },
  {
    id: 'p1_taihuangtaihou',
    group: 'P1身份未定',
    books: ['yunlong', 'yange'],
    keywords: ['太皇太后', '郭氏', '郭太后', '郭太皇太后'],
    question: '确认“太皇太后”具体是哪国/哪位人物，是否可确认为郭氏；列身份链、首次/关键出现、结局或当前状态。',
  },
  {
    id: 'p1_qinglongsi',
    group: 'P1势力二验',
    books: ['yange'],
    keywords: ['青龙寺', '大慈恩寺', '窥基', '释特昧普'],
    question: '复核青龙寺与大慈恩寺是否被混淆；列青龙寺的头目、重要人物、关键事件、与程宗扬关系。无证据须明确写 unsupported。',
  },
  {
    id: 'p1_shengjiao',
    group: 'P1势力二验',
    books: ['qingyu', 'yunlong', 'yange'],
    keywords: ['圣教', '拜火教', '光明观堂', '黛绮丝'],
    question: '复核“圣教”的宗旨目标和关键事件；区分圣教、拜火教、光明观堂是否同一体系或不同势力。',
  },
  {
    id: 'p1_guangyuanhang',
    group: 'P1势力二验',
    books: ['yange'],
    keywords: ['广源行', '周飞', '黎锦香', '行里'],
    question: '复核广源行宗旨目标、关键事件、与周飞/黎锦香/程宗扬关系。无证据须明确写 unsupported。',
  },
  {
    id: 'p1_xuesun_mercenary',
    group: 'P1势力二验',
    books: ['qingyu', 'yunlong'],
    keywords: ['雪隼', '雪隼佣兵团', '石之隼'],
    question: '复核雪隼佣兵团关键事件和与程宗扬/星月湖关系，尤其是否有足够原文证据支撑势力档关键事件。',
  },
  {
    id: 'attitude_yunlong_yange',
    group: '态度建模',
    books: ['yunlong', 'yange'],
    keywords: ['林娘子', '白仙儿', '尹馥兰', '小紫', '吕雉', '杨玉环', '潘金莲', '白霓裳', '黛绮丝', '杨贤妃', '处子', '破身', '破处', '元阴', '元红', '鼎炉', '双修'],
    question: '为云龙/燕歌处子/破身相关约束做态度建模。只输出角色级 JSON：archetype=resist/cultivation_willing/conquered_submit/violated_resent/uncertain，asVirgin，afterBroken，boundary，evidence。不要把程宗扬本人建模为“处子角色”。',
  },
  {
    id: 'constraint_six_consequences',
    group: '约束后果原文确认',
    books: ['qingyu', 'yunlong'],
    keywords: ['碧奴', '林娘子', '虞紫薇', '白仙儿', '襄城君', '孙寿', '破身', '处子', '元阴', '鼎炉', '姹狐', '天狐', '控制', '禁制'],
    question: '逐项确认六个角色约束后果：碧奴、林娘子、虞紫薇、白仙儿、襄城君、孙寿。对每人输出 rule_supported, consequence_supported, exact_effect, confidence, evidence。证据不足写 unsupported/unknown。',
  },
];

function loadBook(bookId) {
  const spec = BOOKS[bookId];
  const epubPath = join(material, spec.epub);
  if (!existsSync(epubPath)) throw new Error(`missing epub: ${epubPath}`);
  const tmp = mkdtempSync(join(tmpdir(), `xt-mmx-${bookId}-`));
  execFileSync('unzip', ['-o', '-q', epubPath, '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  if (!base) throw new Error(`no text dir in ${epubPath}`);
  const chapters = [];
  for (const file of readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort()) {
    const raw = readFileSync(join(base, file), 'utf8');
    const text = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    chapters.push({ bookId, bookTitle: spec.title, file, text });
  }
  return chapters;
}

function findWindows(chapters, keywords, span = 520, maxPerKeyword = 4) {
  const out = [];
  const seen = new Set();
  for (const kw of keywords) {
    for (const ch of chapters) {
      let pos = 0;
      let count = 0;
      while (count < maxPerKeyword) {
        const idx = ch.text.indexOf(kw, pos);
        if (idx < 0) break;
        const key = `${ch.bookId}:${ch.file}:${idx}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            book: ch.bookTitle,
            file: ch.file,
            keyword: kw,
            snippet: ch.text.slice(Math.max(0, idx - span), Math.min(ch.text.length, idx + kw.length + span)),
          });
        }
        pos = idx + kw.length;
        count += 1;
      }
    }
  }
  return out;
}

function trimEvidence(windows, maxChars = 18000) {
  const selected = [];
  let used = 0;
  for (const w of windows) {
    const line = `【${w.book}/${w.file}/kw=${w.keyword}】${w.snippet}`;
    if (used + line.length > maxChars) break;
    selected.push(line);
    used += line.length;
  }
  return selected.join('\n\n');
}

function parseMmxJson(text) {
  try {
    const obj = JSON.parse(text);
    return obj?.choices?.[0]?.message?.content || obj?.output || obj?.text || text;
  } catch {
    return text;
  }
}

async function askMiniMax(item, evidence) {
  const message = [
    'system:你是严谨的小说设定复核员。只依据用户提供的全文检索片段判断，不脑补。输出 JSON。',
    `user:复核任务：${item.group} / ${item.id}
问题：${item.question}

要求：
- 只写游戏设定层事实，不复述露骨细节。
- 每个结论必须带 evidenceRefs，格式使用【书/file/kw】。
- 证据不足必须写 unsupported 或 unknown，不要补成正典。
- 输出 JSON：{id, verdict, findings:[{subject, status, conclusion, confidence, evidenceRefs, notes}], needsHuman:boolean}

全文检索片段：
${evidence}`,
  ];
  const tmp = join(reviewDir, `${item.id}.messages.json`);
  await writeFile(tmp, JSON.stringify(message.map(s => {
    const i = s.indexOf(':');
    return { role: s.slice(0, i), content: s.slice(i + 1) };
  }), null, 2));
  const stdout = execFileSync('mmx', [
    'text', 'chat',
    '--messages-file', tmp,
    '--model', 'MiniMax-M2.7',
    '--temperature', '0.1',
    '--max-tokens', '4096',
    '--non-interactive',
    '--quiet',
    '--output', 'json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return parseMmxJson(stdout);
}

async function run() {
  await mkdir(reviewDir, { recursive: true });
  const chapterCache = new Map();
  const results = [];
  for (const item of ITEMS) {
    const chapters = item.books.flatMap(book => {
      if (!chapterCache.has(book)) chapterCache.set(book, loadBook(book));
      return chapterCache.get(book);
    });
    const windows = findWindows(chapters, item.keywords);
    const evidence = trimEvidence(windows);
    await writeFile(join(reviewDir, `${item.id}.evidence.md`), `# ${item.group} / ${item.id}\n\n${evidence}\n`);
    console.error(`MiniMax ${item.id}: ${windows.length} windows, ${evidence.length} chars`);
    const response = await askMiniMax(item, evidence || '（全文检索未命中关键词）');
    let parsed = null;
    try {
      const jsonText = String(response).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(response).slice(String(response).indexOf('{'), String(response).lastIndexOf('}') + 1);
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = { id: item.id, verdict: 'parse_failed', raw: String(response), needsHuman: true };
    }
    results.push({ item, windows: windows.length, result: parsed });
    await writeFile(join(reviewDir, `${item.id}.result.json`), JSON.stringify(parsed, null, 2) + '\n');
  }

  const md = ['# MiniMax 全文重抽复核', '', `生成时间：${new Date().toISOString()}`, '', '> 仅供人工裁定；未直接写回正典。', ''];
  for (const { item, windows, result } of results) {
    md.push(`## ${item.group} / ${item.id}`);
    md.push(`- 检索窗口：${windows}`);
    md.push(`- verdict：${result.verdict || 'unknown'}`);
    md.push(`- needsHuman：${result.needsHuman === false ? 'false' : 'true'}`);
    for (const f of result.findings || []) {
      md.push(`- ${f.subject || '条目'}｜${f.status || 'unknown'}｜${f.confidence || 'unknown'}：${f.conclusion || ''}`);
      if (f.evidenceRefs?.length) md.push(`  - 证据：${f.evidenceRefs.join('；')}`);
      if (f.notes) md.push(`  - 备注：${f.notes}`);
    }
    if (result.raw) md.push('```text\n' + result.raw.slice(0, 4000) + '\n```');
    md.push('');
  }
  await writeFile(join(outDir, 'minimax-fulltext-review.json'), JSON.stringify(results, null, 2) + '\n');
  await writeFile(join(outDir, 'minimax-fulltext-review.md'), md.join('\n'));
  console.error(`wrote ${join(outDir, 'minimax-fulltext-review.md')}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
