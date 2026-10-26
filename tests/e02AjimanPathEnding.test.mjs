// E02 冰蛊阿姬曼路正文（裁定簿 #240，用户 2026-10-27 00:35）：texts 键 lcq.ending.death.ajiman_bond.ajiman_path 两句，
// 首句插通用正文开头、次句插结尾；只认武二郎入队拍落的结局（gameOver.sourceEventId），期限到期等其它来路只给通用正文。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const loaded = (async () => {
  const packs = await loadTs('../src/modules/contentPacks/index.ts');
  const fixed = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { texts: packs.CONTENT_PACKS.texts, fixed, store };
})();

const ENDING_ID = 'lcq.ending.death.ajiman_bond';
const PATH_KEY = `${ENDING_ID}.ajiman_path`;
const quiet = async (fn) => {
  const warn = console.warn; const error = console.error;
  console.warn = () => {}; console.error = () => {};
  try { return await fn(); } finally { console.warn = warn; console.error = error; }
};

test('E02 阿姬曼路（武二郎入队拍落结局）：分支句首行在开头、其余在结尾，中间是通用正文', async () => {
  const { texts, fixed } = await loaded;
  const generic = texts[ENDING_ID];
  const [opening, ...closing] = texts[PATH_KEY].split('\n');
  assert.ok(generic && opening && closing.length, '内容包里通用正文与分支句都在');
  const text = fixed.fixedEndingNarrative({ endingId: ENDING_ID, sourceEventId: 'lcq.event.wuerlang_joins' });
  assert.equal(text, [opening, generic, ...closing].join('\n'));
  assert.ok(text.startsWith(opening));
  assert.match(text, /屈指一弹[\s\S]*连皮带骨[\s\S]*押着走过，送往黑魔海。她没有看你。$/);
});

test('E02 其它来路（期限到期、来路不明）只显示通用正文', async () => {
  const { texts, fixed } = await loaded;
  for (const sourceEventId of ['lcq.event.s05b_ice_gu_detour', '', undefined]) {
    const text = fixed.fixedEndingNarrative({ endingId: ENDING_ID, sourceEventId });
    assert.equal(text, texts[ENDING_ID], String(sourceEventId));
    assert.doesNotMatch(text, /苏妲己|阿姬曼|黑魔海/);
  }
});

test('E02 分支句缺失：照发通用正文，记 LCQ-PCK-004（同键只记一次）', async () => {
  const { texts, fixed, store } = await loaded;
  const saved = texts[PATH_KEY];
  delete texts[PATH_KEY];
  try {
    const ending = { endingId: ENDING_ID, sourceEventId: 'lcq.event.wuerlang_joins' };
    await quiet(() => {
      assert.equal(fixed.fixedEndingNarrative(ending), texts[ENDING_ID]);
      assert.equal(fixed.fixedEndingNarrative(ending), texts[ENDING_ID]);
    });
    const logged = store.logStore.recent(500).filter(e => e.code === 'LCQ-PCK-004');
    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0].detail, { endingId: ENDING_ID, sourceEventId: 'lcq.event.wuerlang_joins', textKey: PATH_KEY });
  } finally {
    texts[PATH_KEY] = saved;
  }
});
