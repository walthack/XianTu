// 右栏「当前线」卡·下一步表的原著顺序守门（剧情策划稿 §14.3-4；总策划定）。
// 同一条线里带 eventId 的正式步（非 pending／draft），按表顺序 axisSeq 不得倒序：每一步的 axisSeq 不小于它前面各步的最大值。
// 倒序的后果（lineCompass.ts 的「进度只往前走」兜底与「取第一条未过的步」）：
//   ① 后面那步的事件先完成 → 前面还没走到的步一律算过，带文案的提示被吞；
//   ② 前面那步的事件后完成 → 它一直被选中，挡住后面那步的提示。
// 例外逐条写明，查证时按默认路线的实际推进顺序（关链 nextStageId、关内 rail 顺序、条件链、eventReachability 欠账）：
//   ALLOWED＝核实过不吞带文案步的；KNOWN＝核实过确有影响、已汇报、待总策划定（不擅自改顺序）。
// 两张表都钉住「本步 seq < 前面最大 seq（那一步）」，数据一变就要重新核实；修好一处删一条。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');

const DATA = 'src/modules/scenarioMods/builtins/data';
const axisSeq = new Map(fs.readdirSync(DATA).filter(f => f.endsWith('.json'))
  .flatMap(f => (JSON.parse(fs.readFileSync(`${DATA}/${f}`, 'utf8')).scenario?.events || []).map(e => [e.id, e.axisSeq])));

const ALLOWED = {
  'nanhuang.nh_le_mingzhu_join': {
    at: '73 < 75（nh_f03_huamiao_mist）',
    why: 's04_03 乐明珠（73）在 s04_01 送亲疑点（75）之后才能触发：stage_04 条件链 s04_01 → s04_02 → s04_03，所以 s04_01 一定先完成，nh_f03_huamiao_mist 的提示照常显示到 s04_01 完成。',
  },
  'nanhuang.nh_leave_for_jin': {
    at: '219 < 222（nh_shanghou_ice_gu）',
    why: '05b rail 上二爷离队（219）在殇侯现身（222）之前；但离队就是南荒 closedWhen，一完成线就收束、卡片撤掉，兜底没机会吞 nh_shanghou_ice_gu——那一句在 tribes_pledge 之后到离队之前照常显示。',
  },
  'jin.jin_palm_oath': {
    at: '300 < 308（jin_gumingyin）',
    why: '掌誓（palm_oath_shanghou）不在 stage_08 rail、也没挂章（eventReachability 欠账），默认路线完成不了，吞不了前面的步；即便挂上，会被兜底算过的 jin_feiniao_ninjia、jin_gumingyin 都只有 eventId、没有文案。',
  },
  'tang.tang_fanseng': {
    at: '1061 < 1066（tang_changan_yangyuhuan）',
    why: '番僧猎杀（changgan_fanseng_hunt）不在 changgan_begins rail、也没挂章（eventReachability 欠账），默认路线完成不了；前一步 tang_changan_yangyuhuan 的 s03_01 是本关 rail 第一拍，按焦点排序（rail 拍优先）挂章后也是它先完成，提示不会被吞。',
  },
};

const KNOWN = {
  'jin.jin_shanghou_cure_and_trade': {
    at: '227 < 229（jin_arrive_skip_nh）',
    why: 'stage_07 rail 是 00a 殇侯交代商号 → 00b 返程 → 00c 抵建康。00a 一完成，三版「去建康…」入口提示（jin_arrive_*，挂 00c）就被兜底算过，返程期间卡片只剩线名（下一步 xiaoyaoyi_arrives 没有 locationId）；入口提示只在 00a 当焦点时出现。可改法：本步挪到三版入口之前。待总策划定。',
  },
  'han.han_camera_palace_alt': {
    at: '776 < 777（han_yuncangfeng_luodu）',
    why: '关链 taiquan_afterfall 在 luoyang_cloud_secret 之前。afterfall_09 之后被选中的是前一步 han_yuncangfeng_luodu（s05_01，显示「回到洛都看看」），「进宫看看」一次也不显示，afterfall_10 一完成就被算过。可改法：本步挪到 han_yuncangfeng_luodu 之前。待总策划定。',
  },
  'taiquan.tq_yinyang_fish': {
    at: '666 < 708（tq_city_in_film）',
    why: '关链 taiquan_core_conflict 在 taiquan_afterfall 之前。阴阳鱼反击（yin_yang_counter）一完成，tq_beast_traps、tq_mowu、tq_city_in_film 三步（只有 eventId，没有文案）被兜底算过，整个 afterfall 期间卡片提前显示「找条路出古阵」；core_conflict 期间显示的是 tq_beast_traps 的「回到太泉古阵看看」。用户定：只汇报，不擅自改顺序。',
  },
};

/** 每条线里倒序的步：本步 axisSeq 小于它前面各正式 eventId 步的最大值。 */
function inversions(table) {
  const found = {};
  for (const line of table.lines) {
    let max = null;
    for (const step of line.steps) {
      if (!step.eventId || step.pending || step.draft) continue;
      const seq = axisSeq.get(step.eventId);
      assert.equal(typeof seq, 'number', `${line.lineId}.${step.id}：${step.eventId} 没有 axisSeq`);
      if (max && seq < max.seq) found[`${line.lineId}.${step.id}`] = `${seq} < ${max.seq}（${max.id}）`;
      else max = { seq, id: step.id };
    }
  }
  return found;
}

test('下一步表：同一线带 eventId 的正式步按表顺序 axisSeq 不倒序；例外逐条写明原因，且钉住当前序号', () => {
  const pinned = Object.fromEntries([...Object.entries(ALLOWED), ...Object.entries(KNOWN)].map(([key, entry]) => [key, entry.at]));
  assert.deepEqual(inversions(compass.lineCompassTable()), pinned);
  for (const [key, entry] of [...Object.entries(ALLOWED), ...Object.entries(KNOWN)]) assert.ok(entry.why.length > 20, `${key} 要写明原因`);
  assert.ok(!Object.keys(ALLOWED).some(key => key in KNOWN), '同一处不能既放行又待定');
});

test('守门本身：倒序能查出来，pending／draft 步不参与', () => {
  const ev = id => `lcq.event.${id}`;
  const table = { version: 1, lines: [{ lineId: 'nanhuang', steps: [
    { id: 'a', eventId: ev('s04_01') },
    { id: 'p', eventId: ev('s05b_wuer_suli_depart'), pending: true },
    { id: 'b', eventId: ev('s04_03') },
    { id: 'c', eventId: ev('s04_06') },
  ] }] };
  assert.deepEqual(inversions(table), { 'nanhuang.b': '73 < 75（a）' });
});
