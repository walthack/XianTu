// 场面模块测试用的抽象合同：没有任何一场的剧情，人物 id 都是占位。
import { loadTs } from './loadTs.mjs';

export const mod = await loadTs('../src/modules/sceneModule/index.ts');

const SCALE = ['完好', '轻', '中', '重', '出局'];

export function makeContract(patch = {}) {
  const base = {
    meta: { id: 'test.skirmish', version: 1, scene: { kind: 'combat' }, hook: { eventId: 'test.event', required: false } },
    objective: {
      text: '击败来犯者',
      win: { all: [
        { party: 'foe_a', track: 'vit', reach: 'final' },
        { party: 'foe_b', track: 'vit', reach: 'final' },
      ] },
    },
    parties: [
      { id: 'pc', side: 'player_side', ref: 'test.character.hero', player: true },
      { id: 'ally', side: 'player_side', ref: 'test.character.ally', defense: { bonus: 2 } },
      { id: 'ward', side: 'neutral', ref: 'test.character.ward', protected: true },
      { id: 'foe_a', side: 'opposed', ref: 'test.foe.alpha',
        tracks: [{ track: 'vit', initial: 0, ending: { preset: 'eliminated', finalState: '出局', ceiling: 3, previewText: '他会倒下', clampText: '他撑住了' } }] },
      { id: 'foe_b', side: 'opposed', ref: '无名武士',
        tracks: [{ track: 'vit', initial: 0, ending: { preset: 'driven_off', finalState: '重', ceiling: 2, clampText: '你最多逼退他' } }] },
      { id: 'boss', side: 'opposed', ref: 'test.foe.boss', resistance: 3,
        tracks: [{ track: 'vit', initial: 0, ending: { preset: 'withdraws_unharmed', finalState: '完好', ceiling: 0, clampText: '你伤不到他' } }] },
    ],
    tracks: [{ id: 'vit', kind: 'harm', scale: SCALE }],
    goals: [
      { id: 'attack', label: '进攻', baseDifficulty: 12, track: 'vit' },
      { id: 'guard', label: '掩护', type: 'support', baseDifficulty: 10,
        onSuccess: { tagOn: 'allies', tag: { id: 'guarded', label: '受掩护', on: 'player_side', durationBeats: 1, effect: { defenseBonus: 4 } } } },
    ],
    elements: [
      { id: 'blade', kind: 'weapon', label: '长刀', source: '测试', owner: 'pc',
        verbs: [{ id: 'slash', power: 2, goalTags: ['attack'] }] },
      { id: 'fog', kind: 'env', label: '浓雾', source: '测试',
        verbs: [{ id: 'conceal', power: 1, goalTags: ['attack', 'guard'], creates: 'hidden' }] },
      { id: 'bomb', kind: 'item', label: '火药罐', source: '测试', uses: 1,
        verbs: [{ id: 'throw', power: 3, goalTags: ['attack'] }] },
      { id: 'ally_help', kind: 'ally', label: '同伴协助', source: '测试', owner: 'ally',
        verbs: [{ id: 'assist', power: 2, goalTags: ['attack', 'guard'] }] },
    ],
    tags: [{ id: 'hidden', label: '隐蔽', on: 'player_side', durationBeats: 2, effect: { cash: 2 } }],
    enemyActions: [
      { id: 'strike_a', party: 'foe_a', label: '重击', target: 'player', attack: { dc: 14 },
        onHit: { statuses: [{ status: 'wound.external' }], text: '被击中' }, onBlocked: { text: '格开了' } },
      { id: 'slash_b', party: 'foe_b', label: '乱砍', target: { rotate: ['pc', 'ally'] }, attack: { dc: 12 },
        onHit: { statuses: [{ status: 'wound.external' }] } },
    ],
    fumble: [
      { id: 'drop_blade', when: { elementKind: 'weapon' }, target: 'actor', consequence: { kind: 'status', status: 'disarmed' }, text: '兵器脱手' },
      { id: 'ally_hurt', when: { elementKind: 'ally' }, target: 'committed', consequence: { kind: 'status', status: 'wound.external' }, text: '同伴受伤' },
    ],
    defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'continue' } },
    redLines: [{ party: 'boss', track: 'vit', forbiddenFinalState: '出局', forbiddenNarration: ['首领被杀'] }],
    closing: {
      win: { fixedCosts: [{ id: 'cost_ally', target: 'ally', effect: '同伴带伤', statuses: [{ status: 'wound.internal' }], anchorText: '测试锚点' }],
             afterState: [{ id: 'keep_ward', ref: 'ward', requirement: '须在场', check: { party: 'ward', present: true }, forbiddenNarration: ['被护者倒下'] }],
             flags: { 'test.done': true }, next: 'test.after_win' },
      lose: { next: 'test.after_lose' },
      timeout: { settle: [{ side: 'opposed', onlyUnfinished: true, to: '重' }], next: null },
    },
    narration: { forbidden: ['天降神兵'], requiredFacts: ['一场遭遇战'] },
  };
  return { ...structuredClone(base), ...structuredClone(patch) };
}

export const CTX = { factors: 6 };

/** 一个只有最少字段的计划 */
export function attack(targets = ['foe_a'], magnitude = 1, extra = {}) {
  return { goal: 'attack', magnitude, scope: 'single', targets, levers: [], text: '进攻', ...extra };
}

/** 指定骰面开始：action 为玩家检定骰面序列，defense 为防御骰面序列（用完后回到种子派生） */
export function begin(contract, { action = [], defense = [], seed = 12345 } = {}) {
  return mod.beginScene(contract, { seed, forced: { action, defense } });
}
