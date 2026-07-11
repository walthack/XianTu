#!/usr/bin/env node

// Targeted repair for a save contaminated by a fabricated Taiyi plotline.
// It never changes campaign flags, attributes, currency, or unrelated history.
// Usage: node scripts/repair-canon-persona-memory.mjs --slot 22222 [--apply]

import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const storage = join(root, '.xiantu-server', 'save-storage');
const apply = process.argv.includes('--apply');
const slotIndex = process.argv.indexOf('--slot');
const slot = slotIndex >= 0 ? process.argv[slotIndex + 1] : '';
if (!slot) throw new Error('需要指定单一存档：--slot <存档名>，例如 --slot 22222');

const matches = (await readdir(storage))
  .filter(name => name.startsWith('savedata_') && name.endsWith(`_${slot}.json`));
if (matches.length !== 1) throw new Error(`未找到唯一存档「${slot}」（匹配 ${matches.length} 个）`);
const file = join(storage, matches[0]);
const wrapper = JSON.parse(await readFile(file, 'utf8'));
const data = wrapper?.data;
if (!data) throw new Error(`存档缺少 data：${file}`);

// Do not treat "申服君之女" / "申服君封地" as corruption: they are canonical.
const yunFalseTaiyi = (text) => text.includes('云丹琉')
  && /太乙|道观|道袍|道士|王哲|掌教|师姐|龙池|玉佩|静虚|贫道|教御/.test(text);
const shenFalseTaiyi = (text) => text.includes('申服君')
  && /太乙|教御|掌教|道士|龙池|静虚|新掌教|赴建康|上位|太后爪牙/.test(text);
const isContaminated = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return yunFalseTaiyi(text) || shenFalseTaiyi(text);
};

const report = [];
const dropArrayEntries = (array, label) => {
  if (!Array.isArray(array)) return array;
  const kept = array.filter(entry => {
    if (!isContaminated(entry)) return true;
    report.push(label);
    return false;
  });
  return kept;
};

// Memory/history entries are atomic summaries. Removing a contaminated entry is
// safer than leaving a partial false causal chain for later RAG retrieval.
const memory = data?.社交?.记忆;
if (memory && typeof memory === 'object') {
  for (const key of ['短期记忆', '中期记忆', '长期记忆', '隐式中期记忆']) {
    memory[key] = dropArrayEntries(memory[key], `社交.记忆.${key}`);
  }
}
if (Array.isArray(data?.系统?.历史?.叙事)) {
  data.系统.历史.叙事 = dropArrayEntries(data.系统.历史.叙事, '系统.历史.叙事');
}
if (Array.isArray(data?.社交?.事件?.事件记录)) {
  data.社交.事件.事件记录 = dropArrayEntries(data.社交.事件.事件记录, '社交.事件.事件记录');
}

// The fake courier plot also minted two narrative-only items. Remove only those
// objects; ordinary inventory is left untouched.
const items = data?.角色?.背包?.物品;
if (items && typeof items === 'object') {
  for (const [key, item] of Object.entries(items)) {
    if (key.includes('云丹琉') || isContaminated(item)) {
      delete items[key];
      report.push(`角色.背包.物品.${key}`);
    }
  }
}

// Reset the contaminated NPC card to the reviewed registry identity. We retain
// the player's relationship label/affinity, rather than deleting player state.
const yun = data?.社交?.关系?.云丹琉;
if (yun && typeof yun === 'object') {
  yun.名字 = '云丹琉';
  yun.性别 = '女';
  yun.种族 = '人族';
  yun.出生 = '云如瑶亲侄女，云氏商会家主侄女/女骑士';
  yun.外貌描述 = '身材热辣，习武跳舞练就紧致弹性与肉欲的双腿。';
  yun.性格特征 = ['泼辣刁蛮', '好胜心极强', '风风火火', '一言不合拔剑', '张扬的世家小辣妹'];
  yun.势力归属 = '云氏商会';
  yun.势力归属列表 = ['云氏商会', '晋国'];
  delete yun.宗门;
  yun.当前位置 = { 描述: '位置未定' };
  delete yun.当前外貌状态;
  delete yun.当前内心想法;
  yun.人格底线 = ['不主动欺负不招惹她的人', '赌约与承诺必须兑现'];
  yun.记忆 = [];
  report.push('社交.关系.云丹琉（正典身份重投影）');
}

// The fabricated association nodes/edges came from the same false encounter.
const matrix = data?.社交?.关系矩阵;
if (matrix && typeof matrix === 'object') {
  if (Array.isArray(matrix.nodes)) {
    const before = matrix.nodes.length;
    matrix.nodes = matrix.nodes.filter(name => name !== '云丹琉');
    if (matrix.nodes.length !== before) report.push('社交.关系矩阵.nodes.云丹琉');
  }
  if (Array.isArray(matrix.edges)) {
    const before = matrix.edges.length;
    matrix.edges = matrix.edges.filter(edge => !isContaminated(edge));
    if (matrix.edges.length !== before) report.push('社交.关系矩阵.edges（伪关联）');
  }
}

// Scrub a small number of free-form cached fields left outside the memory
// buckets, without changing structured gameplay state.
const scrub = (value, path = '') => {
  if (typeof value === 'string') return isContaminated(value) ? '' : value;
  if (Array.isArray(value)) return value.map((item, index) => scrub(item, `${path}[${index}]`)).filter(item => item !== '');
  if (!value || typeof value !== 'object') return value;
  for (const [key, item] of Object.entries(value)) {
    if (key === '关系' || key === '记忆' || key === '叙事' || key === '事件记录' || key === '物品') continue;
    value[key] = scrub(item, path ? `${path}.${key}` : key);
  }
  return value;
};
scrub(data?.系统?.扩展);

console.log(`${apply ? '将修复' : '预览'}：${file}`);
console.log(`命中 ${report.length} 个受污染条目：`);
for (const item of report) console.log(`- ${item}`);
if (apply) {
  const backup = `${file}.bak-canon-persona-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await cp(file, backup);
  await writeFile(file, `${JSON.stringify(wrapper, null, 2)}\n`);
  console.log(`已写入；备份：${backup}`);
}
