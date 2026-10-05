import {
  createDice, createPhasedBattle, createRoundBattle, hpWound,
  phasedTactics, resolvePhase, resolveRound, roundActions,
} from './engine.mjs';
import { scenario, narratePhase, narrateRound } from './scenario-f03.mjs';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'A' ? 'A' : 'B';
const seedParam = params.get('seed');
const seed = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam)) ? Number(seedParam) : null;
const forced = (params.get('rolls') || '').split(',').map(item => Number(item.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 20);
const wantLlm = params.get('llm') === '1';
const storageKey = `combat-proto:${mode}:${seed ?? 'r'}:${forced.join('.')}:${wantLlm ? 'llm' : 'tpl'}`;

const $ = id => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const signed = value => `${value >= 0 ? '+' : ''}${value}`;
const chance = needed => Math.round(Math.min(1, Math.max(0, (21 - needed) / 20)) * 100);

let llm = { available: false, model: null };
let session;
let dice;

function fresh() {
  return {
    state: mode === 'A' ? createRoundBattle(scenario) : createPhasedBattle(scenario),
    entries: [],
    draws: 0,
    clicks: 0,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

function save() {
  localStorage.setItem(storageKey, JSON.stringify(session));
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (raw?.state?.mode === mode) return raw;
  } catch { /* 坏存档按新开处理 */ }
  return null;
}

function rebuildDice() {
  dice = createDice({ seed, forced });
  // 恢复时把已用过的骰点跳过，保证刷新后不会重掷、指定序列不重头再来。
  for (let i = 0; i < session.draws; i += 1) dice.next();
}

// ---------- 渲染 ----------

function renderCard() {
  const card = $('card');
  card.replaceChildren();
  card.append(el('h2', '', scenario.title), el('p', 'muted', `${scenario.source} ｜ 模式：${mode === 'A' ? 'A 回合制（每回合一骰）' : 'B 分阶段判定（每阶段一骰）'}`));
  const rows = [
    ['敌方', scenario.card.enemies], ['在场同伴', scenario.card.allies], ['不出手', scenario.card.bystanders],
    ['你的处境', scenario.card.role], ['提示', scenario.card.twist], ['地形', scenario.card.environment],
  ];
  const table = el('dl', 'facts');
  for (const [k, v] of rows) table.append(el('dt', '', k), el('dd', '', v));
  card.append(table);
  const stakes = el('div', 'stakes');
  for (const tier of ['胜', '败', '大败']) {
    const row = el('div', `stake tier-${tier}`);
    row.append(el('b', '', tier), el('span', '', scenario.card.stakes[tier]));
    stakes.append(row);
  }
  card.append(stakes);
  if (mode === 'A') card.append(el('p', 'muted', `规则：你有 ${scenario.rounds.playerHp} 点气血，眼前武士 ${scenario.rounds.enemyHp} 点。第 ${scenario.rounds.rescueRound} 回合结束时援手赶到；那时气血保住一半以上，或把武士压到 ${scenario.rounds.winEnemyHp} 点以下，算胜；气血归零算大败。`));
  else card.append(el('p', 'muted', `规则：共 ${scenario.phased.phases.length} 个阶段，每阶段选一个战术、掷一次骰。整场结果取最后一个阶段的档位，各阶段的代价逐条记账。`));
}

function renderStatus() {
  const box = $('status');
  box.replaceChildren();
  const { state } = session;
  if (mode === 'A') {
    const bar = (label, value, max, cls) => {
      const wrap = el('div', `bar ${cls}`);
      const fill = el('span', 'fill');
      fill.style.width = `${Math.max(0, (value / max) * 100)}%`;
      wrap.append(el('b', '', `${label} ${value}/${max}`), fill);
      return wrap;
    };
    box.append(
      el('div', 'round', state.done ? '战斗结束' : `第 ${state.round} / ${scenario.rounds.rescueRound} 回合`),
      bar('你的气血', state.playerHp, scenario.rounds.playerHp, 'player'),
      bar('眼前的利角武士（压制）', state.enemyHp, scenario.rounds.enemyHp, 'enemy'),
      el('div', 'chips', `伤势：${hpWound(scenario, state.playerHp)} ｜ 凝羽：${state.protectedNingyu ? '已护住' : '未护住'}`),
    );
  } else {
    const total = scenario.phased.phases.length;
    box.append(
      el('div', 'round', state.done ? '战斗结束' : `第 ${state.phaseIndex + 1} / ${total} 阶段`),
      el('div', 'chips', `你的伤势：${state.playerWound}`),
    );
  }
  const seconds = Math.round(((session.finishedAt || Date.now()) - session.startedAt) / 1000);
  $('stats').textContent = `点击 ${session.clicks} ｜ 掷骰 ${session.state.resolutions.length} ｜ 叙事 ${session.entries.filter(e => e.narration).length} 段 ｜ 用时 ${seconds}s`;
}

function factorList(factors) {
  const list = el('ul', 'factors');
  for (const factor of factors) {
    const item = el('li', factor.value < 0 ? 'neg' : 'pos');
    item.append(el('span', '', factor.label), el('b', '', signed(factor.value)));
    list.append(item);
  }
  return list;
}

function diceCard(resolution) {
  const card = el('div', `dice tier-${resolution.tier}`);
  const head = el('div', 'dice-head');
  head.append(el('span', 'die', String(resolution.roll)), el('span', 'source', `d20（${resolution.rollSource}）`));
  card.append(head, factorList(resolution.factors));
  const math = el('div', 'math');
  math.textContent = `骰点 ${resolution.roll} ${signed(resolution.modifier)} ＝ 总值 ${resolution.total}　对比 难度 ${resolution.difficulty}（需掷 ≥ ${resolution.needed}）`;
  const verdict = el('div', 'verdict');
  verdict.append(el('b', '', resolution.outcomeLabel), el('span', `tier tier-${resolution.tier}`, `→ ${resolution.tier}`));
  const scale = el('div', 'scale muted');
  const d = resolution.difficulty;
  scale.textContent = `档位线：大失败 <${d - 15} ≤ 失败 <${d - 5} ≤ 部分成功 <${d} ≤ 成功 <${d + 15} ≤ 大成功 <${d + 30} ≤ 完美`;
  card.append(math, verdict, scale);
  return card;
}

function renderLog() {
  const log = $('log');
  log.replaceChildren();
  log.append(el('p', 'narration intro', scenario.intro));
  for (const entry of session.entries) {
    const block = el('article', 'entry');
    block.append(el('h3', '', entry.heading));
    if (entry.resolution) block.append(diceCard(entry.resolution));
    if (entry.narration !== undefined) {
      const tag = entry.narrationSource === 'template' ? '【模板叙事】' : entry.narrationSource === 'pending' ? '【模型生成中…】' : `【模型：${entry.narrationSource}】`;
      const text = el('p', 'narration');
      text.append(el('span', 'tag', tag), document.createTextNode(entry.narration));
      block.append(text);
      if (entry.narrationNote) block.append(el('p', 'muted', entry.narrationNote));
      if (llm.available && wantLlm && entry.resolution && entry.narrationSource !== 'pending') {
        const again = el('button', 'small', '重写这段（不重掷骰）');
        again.type = 'button';
        again.onclick = () => narrateWithModel(entry);
        block.append(again);
      }
    }
    if (entry.resolution?.dealt !== undefined) {
      block.append(el('p', 'muted', `本回合：你造成 ${entry.resolution.dealt} 伤害，受到 ${entry.resolution.taken} 伤害 → 你 ${entry.resolution.hpAfter.player}，武士 ${entry.resolution.hpAfter.enemy}`));
    }
    for (const fact of entry.facts || []) block.append(el('p', 'fact', fact));
    if (entry.effects?.length) {
      const list = el('ul', 'effects');
      for (const effect of entry.effects) list.append(el('li', '', effect));
      block.append(list);
    }
    log.append(block);
  }
}

function renderActions() {
  const box = $('actions');
  box.replaceChildren();
  const { state } = session;
  if (state.done) return;
  const options = mode === 'A' ? roundActions(scenario, state) : phasedTactics(scenario, state);
  const prompt = mode === 'A' ? `第 ${state.round} 回合：你怎么做？（点一下就掷骰）` : `${scenario.phased.phases[state.phaseIndex].prompt}（点一下就掷骰）`;
  box.append(el('h3', '', prompt));
  const grid = el('div', 'grid');
  for (const option of options) {
    const button = el('button', 'option');
    button.type = 'button';
    button.append(
      el('b', '', option.label),
      el('span', 'hint', option.hint || ''),
      el('span', 'odds', `${option.kind} ｜ 难度 ${option.difficulty} ｜ 加值 ${signed(option.previewModifier)} ｜ 需掷 ≥ ${option.needed}（胜 ${chance(option.needed)}%）`),
      factorList(option.previewFactors),
    );
    button.onclick = () => act(option.id);
    grid.append(button);
  }
  box.append(grid);
}

function renderEnding() {
  const box = $('ending');
  box.replaceChildren();
  const { state } = session;
  if (!state.done) return;
  box.append(el('h2', `tier-${state.finalTier}`, `结局：${state.finalTier}`));
  if (mode === 'A') box.append(el('p', 'muted', state.endingReason === 'player_down' ? '你的气血归零。' : state.endingReason === 'enemy_down' ? '武士被你逼得踉跄后退、再扑不上来，武二郎赶到补上了最后一刀。' : '援手赶到。'));
  const list = el('ul', 'effects');
  for (const item of state.ledger) list.append(el('li', '', `${item.step}：${item.text}`));
  box.append(el('h3', '', '落账（状态与死伤，模型只能照此描写）'), list);
  const again = el('button', 'restart', '重开');
  again.type = 'button';
  again.onclick = restart;
  box.append(again);
}

function render() {
  renderCard();
  renderStatus();
  renderLog();
  renderActions();
  renderEnding();
}

// ---------- 结算与叙事 ----------

function factsFor(entry) {
  const r = entry.resolution;
  return {
    场景: scenario.title,
    步骤: entry.heading,
    玩家行动: r.label,
    结果档位: r.tier,
    本步代价: entry.effects || [],
    固定插手: entry.facts || [],
    ...(r.dealt !== undefined ? { 伤害: `你造成${r.dealt}、受到${r.taken}`, 气血: `你${r.hpAfter.player}/${scenario.rounds.playerHp}` } : {}),
    在场: scenario.card.allies,
  };
}

async function narrateWithModel(entry) {
  const template = entry.templateText;
  entry.narrationSource = 'pending';
  entry.narration = '';
  render();
  try {
    const response = await fetch('/api/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facts: factsFor(entry) }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || response.status);
    entry.narration = json.text;
    entry.narrationSource = json.model;
    entry.narrationNote = '';
  } catch (error) {
    entry.narration = template;
    entry.narrationSource = 'template';
    entry.narrationNote = `模型描写失败（${error.message}），已改用模板；结果不受影响。`;
  }
  session.entries = [...session.entries];
  save();
  render();
}

function act(optionId) {
  if (session.state.done) return;
  session.clicks += 1;
  const die = dice.next();
  session.draws += 1;
  if (mode === 'A') {
    const { state, resolution } = resolveRound(scenario, session.state, optionId, die);
    const text = narrateRound(resolution);
    session.state = state;
    session.entries.push({
      heading: `第 ${resolution.round} 回合 · ${resolution.label}`,
      resolution, templateText: text, narration: text, narrationSource: 'template',
      facts: resolution.scripted,
    });
    if (state.done) session.entries.push({ heading: '援手与收场', facts: scenario.rounds.finale });
  } else {
    const { state, resolution } = resolvePhase(scenario, session.state, optionId, die);
    const text = narratePhase(resolution);
    session.state = state;
    // 两阶段之间只有一个间隙：固定插手（生死根、苏荔）在所有分支都出现。
    const interlude = state.done ? [] : scenario.phased.interludes;
    session.entries.push({
      heading: `${resolution.phaseTitle} · ${resolution.label}`,
      resolution, templateText: text, narration: text, narrationSource: 'template',
      effects: resolution.effects, facts: interlude,
    });
    if (state.done) session.entries.push({ heading: '援手与收场', facts: scenario.phased.finale });
  }
  if (session.state.done) session.finishedAt = Date.now();
  save();
  render();
  const last = [...session.entries].reverse().find(entry => entry.resolution);
  if (wantLlm && llm.available && last) narrateWithModel(last);
}

function restart() {
  localStorage.removeItem(storageKey);
  session = fresh();
  rebuildDice();
  save();
  render();
}

// ---------- 开发参数 ----------

function setupDev() {
  $('title').textContent = `战斗试玩原型 · ${mode === 'A' ? 'A 回合制' : 'B 分阶段判定'}`;
  $(`link-${mode}`).classList.add('active');
  for (const id of ['A', 'B']) {
    const next = new URLSearchParams(location.search);
    next.set('mode', id);
    $(`link-${id}`).href = `?${next}`;
  }
  $('dev-seed').value = seed ?? '';
  $('dev-rolls').value = forced.join(',');
  $('dev-llm').checked = wantLlm;
  if (seed !== null || forced.length) $('dev').open = true;
  $('dev-apply').onclick = () => {
    const next = new URLSearchParams();
    next.set('mode', mode);
    if ($('dev-seed').value !== '') next.set('seed', $('dev-seed').value);
    if ($('dev-rolls').value.trim()) next.set('rolls', $('dev-rolls').value.replace(/\s+/g, ''));
    if ($('dev-llm').checked) next.set('llm', '1');
    localStorage.removeItem(`combat-proto:${mode}:${seed ?? 'r'}:${forced.join('.')}:${wantLlm ? 'llm' : 'tpl'}`);
    location.search = `?${next}`;
  };
  $('restart').onclick = restart;
}

async function detectLlm() {
  try {
    const response = await fetch('/api/config');
    llm = (await response.json()).llm || llm;
  } catch { /* 离线：只用模板 */ }
  $('dev-llm').disabled = !llm.available;
  $('llm-note').textContent = llm.available ? `可用：${llm.model}` : '未配置，只能用模板；启动服务时加 --model 可开启';
}

setupDev();
session = load() || fresh();
rebuildDice();
render();
setInterval(renderStatus, 1000);
detectLlm().then(render);
