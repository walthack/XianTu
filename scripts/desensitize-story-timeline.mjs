#!/usr/bin/env node

// 主轴脱敏：对 story-timeline 的 18 个含直白露骨描写的 beat 做脱敏改写——
// 保留走向/机制(真阳治寒毒、乐明珠后庭保元阴、双修助行功、借死气恢复真元、破处与否等)，去直白性描写。
// 确定性 PLAN，按 seq 精确匹配，同步改 .json 与 .md。备份 .pre-desensitize。
// Usage: node scripts/desensitize-story-timeline.mjs

import { existsSync, copyFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const jsonF = join(ccDir, 'story-timeline.json');
const mdF = join(ccDir, 'story-timeline.md');

// seq → 脱敏后 beat
const PLAN = {
  14: '苏妲己因情趣器物卡在体内无法取出，求助程宗扬，程宗扬以60金铢为条件帮其取出。',
  54: '阴煞夜袭商队，凌辱并杀害一名花苗女子，程宗扬以真阳之力击退。',
  70: '程宗扬与乐明珠以后庭之欢为其解除催情药毒（仅后庭、保其元阴与处子之身，不损凤凰宝典修炼）。',
  112: '程宗扬夜访云如瑶，与其交合，以真阳/精元为其治疗寒毒。',
  188: '王团练手下乡兵屠荆溪村寨、凌辱妇女，程宗扬等人赶到救援，斩杀乡兵。',
  526: '吕冀在含光殿用绳索勒死赵昭仪（友通期），并凌辱其尸。',
  600: '紫丫头主持审讯成光，揭露她与帛十六的奸情及广源行阴谋；成光被迫献身为奴，被程宗扬收用（后庭）。',
  613: '程宗扬清晨醒来，真元持续炼化杂气，与孙寿再度交合行功；随后处理政务，接见桓郁父子、晋封桓郁为卫将军，安排徐璜守卫宫城。',
  676: '程宗扬在兰汤殿错认赵飞燕为赵合德，与之欢好后才发现认错。',
  683: '程宗扬从密道夜入长秋宫，与赵飞燕欢合时察觉真元运行滞涩（精关不畅），随后与赵合德欢好。',
  685: '程宗扬因真气失控昏迷、半身冷半身热，吕雉指出需双修炼化；赵飞燕在登基大典上以双修之姿助其行功。',
  709: '程宗扬鼓励赵飞燕报复孙寿、孙暖，赵飞燕羞辱二人后与赵合德共侍程宗扬。',
  729: '程宗扬在浴房误认吕雉为阮香琳，强行以后庭之欢收用，但未破其处子之身，吕雉屈辱服从。',
  746: '潘金莲因受辱，借程宗扬之身使女忍者破处。',
  856: '程宗扬以后庭之欢驱散黛绮丝体内血莲花种、解其痛苦（仅后庭，故未致其破身淫兽化）。',
  931: '程宗扬当着李昂的面凌辱杨妃、强收其为奴（后庭），逼其卖身。',
  932: '李昂跪求程宗扬收用安乐公主以救母，程宗扬强行收用之。',
  971: '程宗扬在马车内令太后萧氏、贵妃杨氏、安乐公主三女观刑并同时收用三人，借刑杀的死气恢复真元；处决后宣告罚唐皇妻女母妹为奴。',
};

async function run() {
  for (const f of [jsonF, mdF]) { const bak = f.replace(/\.(json|md)$/, '.pre-desensitize.$1'); if (!existsSync(bak)) copyFileSync(f, bak); }

  // JSON
  const data = JSON.parse(await readFile(jsonF, 'utf8'));
  const nodes = data.nodes || data;
  let jn = 0;
  for (const n of nodes) if (PLAN[n.seq]) { n.beat = PLAN[n.seq]; jn++; }
  await writeFile(jsonF, JSON.stringify(data, null, 2) + '\n');

  // MD：行形如  - `#14` 〔anchor〕 旧beat   → 替换 〕 之后的 beat
  const lines = (await readFile(mdF, 'utf8')).split('\n');
  let mn = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*-\s*`#(\d+)`\s*〔[^〕]*〕\s*)(.*)$/);
    if (m && PLAN[+m[2]]) { lines[i] = m[1] + PLAN[+m[2]]; mn++; }
  }
  await writeFile(mdF, lines.join('\n'));

  console.error(`脱敏完成：json ${jn}/18，md ${mn}/18`);
  if (jn !== 18 || mn !== 18) console.error('⚠ 数量不符，请核对 seq 是否匹配');
}
run();
