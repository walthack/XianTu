import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

// 登场卡（`debut_*`）必须有门，否则关一开就摆在玩家面前。
//
// 立项由来（2026-08-19）：制作人看 demo 序列时问「seq0 怎么是月霜登场，这时候我们都没穿越」。
// 查证属实，而且不是排序显示问题——**是 live 行为**：
// 该卡 `axisSeq: null`、`conditions: []`、却绑在章里，于是章一激活它就进 `activeEventIds`。
// 实跑 stage_01 第一轮，玩家可见目标是「程宗扬与段强穿越」＋「月霜·招牌登场」两条——
// 主角还没穿越，就能去「把月霜看清楚」。
//
// 这一类共 22 张：21 张 `axisSeq` 为 null、19 张没有 `conditions`、22 张全绑章。
// 月霜那张已按其自身描述（「太乙真宗众人救下受伤的月霜途中」）门在 `s01_04.done` 上，
// 并补 `axisSeq: 9`；`critical` 仍为 false，不因此变成承重。
//
// 门的选法：读该卡 description 里它所依托的那一拍，门在那一拍的 done flag 上。
// 不要一律门在关首——那只是把问题推后一拍。

const DIR = 'src/modules/scenarioMods/builtins/data/';

// 欠账：**只能减不能增**。每张的门要按它自己的 description 定，故逐张处理，不批量套。
const DEBT = new Set([
  'lcq.event.debut_lemingzhu',
  'lcq.event.debut_panjinlian',
  'lyg.event.debut_shefuren',
  'lyg.event.debut_daiqisi',
  'lyg.event.debut_lvzhi',
  'lyg.event.debut_chengguang',
  'lyg.event.debut_qiyuxian',
  'lyg.event.debut_jiawenhe',
  'lyg.event.debut_yangyuhuan',
  'lyg.event.debut_quanyuji',
  'lyg.event.debut_bainichang',
  'lyl.event.debut_zhuoyunjun',
  'lyl.event.debut_yundanliu',
  'lyl.event.debut_yunruyao',
  'lyl.event.debut_zhaohede',
  'lyl.event.debut_yinfulan',
  'lyl.event.debut_jingli',
  'lyl.event.debut_jianyuji',
]);

test('登场卡必须有 conditions，否则关一开就无条件摆给玩家', () => {
  const ungated = [];
  for (const file of fs.readdirSync(DIR).filter(name => name.endsWith('.json'))) {
    const mod = JSON.parse(fs.readFileSync(DIR + file, 'utf8'));
    if (!mod.scenario?.worldSimulation) continue;
    const bound = new Set((mod.scenario.chapters || []).flatMap(chapter => chapter.eventIds || []));
    for (const event of mod.scenario.events || []) {
      if (!event.id.split('.').pop().startsWith('debut_')) continue;
      if (!bound.has(event.id)) continue;          // 没绑章就进不了 active，不构成本问题
      if ((event.conditions || []).length) continue;
      ungated.push(`${mod.manifest.id}　${event.id}　${event.name || ''}`);
    }
  }
  const unexpected = ungated.filter(row => !DEBT.has(row.split('\u3000')[1]));
  assert.deepEqual(
    unexpected, [],
    '这些登场卡绑了章却没有 conditions——所在关一开就会摆给玩家，'
    + '不管剧情走到哪。请按该卡 description 里依托的那一拍加门',
  );
  const cleared = [...DEBT].filter(id => !ungated.some(row => row.includes(id)));
  assert.deepEqual(cleared, [], `这些已经加门了，请从 DEBT 删掉：\n${cleared.join('\n')}`);
});
