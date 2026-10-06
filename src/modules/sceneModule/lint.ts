// 合同体检：只查结构（引用是否存在、有没有互相矛盾、有没有走不通的路径），不评价剧情。
// 通用模块不自带人头数、拍数、胜负门槛，所以凡是需要这些数的地方，合同没写就报出来，而不是悄悄补一个默认值。

import { isExpr, normalizeCond } from './conditions';
import { goalsOf } from './plan';
import { allTrackInfos, partyOf, partyTrackId, trackInfo } from './queries';
import { resolveStatusDef } from './statuses';
import type { Cond, Contract, EnemyActionDef, Expr, FixedEventEffect, PlayerChoiceCond, SceneContext, StatusDef } from './types';

export interface LintReport {
  errors: string[];
  warnings: string[];
  infos: string[];
}

/** 已取消的旧字段（伤害点 / 战败代价梯度 / 野心附加）。出现就报错，并指向新写法。 */
const RETIRED_KEYS: Record<string, string> = {
  harmPointsAtLeast: '伤害点已取消；败局条件改用 partyDowned / sideDowned / statusPresent / trackReaches（伤亡写成挂在具体角色身上的状态）',
  costLadder: '战败代价梯度已取消；代价就是已经挂在具体角色身上的状态',
  harmToTier: '伤害点到代价档的映射已取消',
  failCost: '失败不再扣伤害点；失败＝这招没成、局面往敌人那边偏；大失败的后果写在 fumble[]',
  critFailCost: '大失败的后果写在 fumble[]（具体后果挂到具体角色）',
  ambitionSurcharge: '野心附加随伤害点一并取消',
  ambitionSurchargeCap: '野心附加随伤害点一并取消',
  maxTierLift: '野心附加随伤害点一并取消',
  endingContractMaxTierLift: '野心附加随伤害点一并取消',
  critRelief: '伤害点已取消',
  fatalBeat: '拍数规则统一写在 clock（beats + onTimeout）',
  beatLimit: '拍数规则统一写在 clock（beats + onTimeout）',
};

function walkKeys(value: unknown, visit: (key: string, path: string) => void, path = ''): void {
  if (Array.isArray(value)) value.forEach((item, i) => walkKeys(item, visit, `${path}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      visit(key, `${path}.${key}`);
      if (key === 'kind' && typeof inner === 'string') visit(inner, `${path}.kind`);
      walkKeys(inner, visit, `${path}.${key}`);
    }
  }
}

function collectConds(expr: Cond | Expr | Record<string, any> | undefined, out: Cond[] = []): Cond[] {
  if (!expr) return out;
  const node = normalizeCond(expr as Record<string, any>);
  if (isExpr(node)) {
    for (const item of 'all' in node ? node.all : node.any) collectConds(item, out);
  } else if (node.kind === 'not') collectConds(node.cond, out);
  else out.push(node);
  return out;
}

/** 状态沿 upgradesTo 升级链能不能走到“倒下”。 */
function leadsToDowned(id: string, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, depth = 0): boolean {
  const def = resolveStatusDef(id, contract, ctx);
  if (!def || depth > 8) return false;
  if (def.effects.some(effect => effect.kind === 'downed')) return true;
  return def.upgradesTo ? leadsToDowned(def.upgradesTo, contract, ctx, depth + 1) : false;
}

export function lintContract(contract: Contract, ctx?: Pick<SceneContext, 'catalog'>): LintReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const err = (text: string): void => { errors.push(text); };
  const warn = (text: string): void => { warnings.push(text); };

  // ---- 旧字段 ----
  walkKeys(contract, (key, path) => {
    if (RETIRED_KEYS[key]) err(`${path.replace(/^\./, '')}：${RETIRED_KEYS[key]}`);
  });
  if (contract.defeat?.outcome?.type === 'tiered') warn('defeat.outcome.type = "tiered" 已改名为 "continue"（败不结束剧情，续接 closing.lose.next）；本次按 continue 处理');

  // ---- meta ----
  if (!contract.meta?.id) err('meta.id 缺失');
  if (!contract.meta?.scene?.kind) err('meta.scene.kind 缺失');
  if (contract.meta?.hook?.required && !(Number(contract.meta.hook.ambushAfterStall) >= 1)) {
    err('meta.hook.required = true 的合同必须写 meta.hook.ambushAfterStall（停留几回合后对方先动手）；通用模块不自带这个数');
  }

  // ---- 参与方 ----
  const partyIds = new Set<string>();
  for (const party of contract.parties || []) {
    if (partyIds.has(party.id)) err(`参与方 id 重复：${party.id}`);
    partyIds.add(party.id);
    if (!party.ref) err(`参与方 ${party.id} 缺 ref（角色库 id 或字面标签）`);
  }
  const players = (contract.parties || []).filter(p => p.player);
  if (players.length !== 1) err(`必须恰有一个 player:true 的参与方（现在 ${players.length} 个）`);
  const knownParty = (id: string | undefined, where: string): boolean => {
    if (!id || partyIds.has(id)) return true;
    err(`${where}：参与方“${id}”不存在`);
    return false;
  };

  const trackIdsOfParty = (party: string): string[] => (partyOf(contract, party)?.tracks || []).map(partyTrackId);
  for (const party of contract.parties || []) {
    for (const entry of party.tracks || []) {
      const id = partyTrackId(entry);
      const info = trackInfo(contract, party.id, id);
      if (!info) { err(`${party.id}.${id || '?'}：轨道没有刻度（需要全场 tracks[] 里的定义或内联 scale）`); continue; }
      if (party.side === 'player_side' && !entry.ending) continue;
      if (!entry.ending) { err(`${party.id}.${id}：缺 ending（finalState / ceiling）`); continue; }
      if (!info.scale.includes(entry.ending.finalState)) err(`${party.id}.${id}：finalState“${entry.ending.finalState}”不在刻度里`);
      for (const label of entry.ending.alternatives || []) {
        if (!info.scale.includes(label) || info.scale.indexOf(label) < info.limit) err(`${party.id}.${id}：备选终态不在终态区间`);
      }
      for (const element of entry.requiresLever || []) {
        if (!contract.elements?.some(e => e.id === element)) err(`${party.id}.${id}：必需杠杆不存在`);
      }
      const ceiling = Number(entry.ending.ceiling ?? 0);
      if (!(ceiling >= 0 && ceiling <= 3)) err(`${party.id}.${id}：ceiling 必须在 0–3`);
    }
    if (party.side === 'opposed' && party.tracks?.length && allTrackInfos(contract).filter(i => i.party === party.id).every(i => i.limit <= i.initial)) {
      infos.push(`${party.id}：玩家的主张推不动它的任何轨道（ceiling 全为 0）`);
    }
  }

  // ---- 状态可解析 ----
  const needStatus = (id: string, where: string): void => {
    const def = resolveStatusDef(id, contract, ctx);
    if (!def) err(`${where}：状态“${id}”没有定义（宿主状态目录、合同 statuses[]、模块内置都没有）`);
    else if (def.provisional) infos.push(`${where}：状态“${id}”目前只是临时定义，等总策划的状态目录落地后以目录为准`);
  };
  for (const def of contract.statuses || []) {
    if (def.upgradesTo) needStatus(def.upgradesTo, `statuses.${def.id}.upgradesTo`);
  }
  const checkEffects = (effects: FixedEventEffect[] | undefined, where: string): void => {
    if (effects !== undefined && !Array.isArray(effects)) err(`${where}：effects 必须是数组`);
    for (const effect of Array.isArray(effects) ? effects : []) {
      if (!['setTrack', 'depart', 'arrive', 'tag', 'status'].some(key => key in (effect as object))) {
        err(`${where}：无法识别的效果 ${JSON.stringify(effect)}（支持 setTrack{party?,track,to} / depart / arrive / tag / status）`);
      }
      if (effect.depart) knownParty(effect.depart, `${where}.depart`);
      if (effect.arrive) knownParty(effect.arrive, `${where}.arrive`);
      if (effect.status) { knownParty(effect.status.party, `${where}.status`); needStatus(effect.status.status, `${where}.status`); }
      if (effect.setTrack) {
        const { party, track, to } = effect.setTrack;
        if (party && party !== 'scene') {
          knownParty(party, `${where}.setTrack`);
          const info = trackInfo(contract, party, track);
          if (!info) err(`${where}.setTrack：${party} 没有轨道 ${track}`);
          else if (!info.scale.includes(to)) err(`${where}.setTrack：“${to}”不在 ${party}.${track} 的刻度里`);
        } else if (!contract.tracks?.some(t => t.id === track && t.scale.includes(to))) err(`${where}.setTrack：全场轨道 ${track} 或刻度“${to}”不存在`);
      }
    }
  };

  // ---- 条件引用 ----
  const checkConds = (expr: Cond | Expr | Record<string, any> | undefined, where: string): Cond[] => {
    const conds = collectConds(expr, []);
    for (const cond of conds) {
      const anyCond = cond as any;
      if (anyCond.party) knownParty(anyCond.party, where);
      if ('party' in cond)knownParty(cond.party,where);
      if (cond.kind === 'trackReaches') {
        const info = trackInfo(contract, cond.party, cond.track);
        if (!info) err(`${where}：${cond.party} 没有轨道 ${cond.track}`);
        else if (cond.reach !== 'final' && !info.scale.includes(cond.reach)) err(`${where}：“${cond.reach}”不在 ${cond.party}.${cond.track} 的刻度里`);
      } else if (cond.kind === 'statusPresent') needStatus(cond.status, where);
      else if (!['partyDowned', 'sideDowned', 'partyDeparted', 'partyPresent', 'tagActive', 'beatAtLeast', 'not'].includes(cond.kind)) err(`${where}：无法识别的条件 ${JSON.stringify(cond)}`);
    }
    return conds;
  };

  // ---- 胜利 ----
  const winConds = checkConds(contract.objective?.win, 'objective.win');
  if (!winConds.length) err('objective.win 缺失或为空');
  const departable = new Set<string>();
  const settable = new Set<string>();
  const noteEffects = (effects: FixedEventEffect[] | undefined): void => {
    for (const effect of effects || []) {
      if (effect.depart) departable.add(effect.depart);
      if (effect.setTrack?.party) settable.add(`${effect.setTrack.party}.${effect.setTrack.track}.${effect.setTrack.to}`);
    }
  };
  for (const event of contract.clock?.fixedEvents || []) noteEffects(event.effects);
  if (contract.clock?.onTimeout?.type === 'continue') noteEffects(contract.clock.onTimeout.events);
  for (const cond of winConds) {
    if (cond.kind === 'trackReaches') {
      const info = trackInfo(contract, cond.party, cond.track);
      if (info && cond.reach === 'final' && info.limit <= info.initial) err(`objective.win：${cond.party}.${cond.track} 的 ceiling 为 0，玩家永远推不到“final”`);
    }
    if (cond.kind === 'partyDeparted' && !departable.has(cond.party)) err(`objective.win：${cond.party} 没有任何事件让它离场`);
  }

  // ---- 拍数（全部来自合同；默认不设拍数） ----
  const clock = contract.clock;
  const timeoutRule = clock?.onTimeout as unknown;
  if (timeoutRule !== undefined) {
    const rule = timeoutRule as { type?: string; as?: string };
    const okClose = rule && typeof rule === 'object' && rule.type === 'close' && ['timeout', 'win', 'lose'].includes(String(rule.as));
    const okContinue = rule && typeof rule === 'object' && rule.type === 'continue';
    if (!okClose && !okContinue) err('clock.onTimeout 必须写成 {type:"close", as:"timeout"|"win"|"lose"} 或 {type:"continue", events, text}（写成字符串或别的形状会被当成“超时收束”，不会算赢）');
  }
  if (clock?.beats !== undefined) {
    if (!Number.isInteger(clock.beats) || clock.beats < 1) err('clock.beats 必须是 ≥ 1 的整数；不设拍数就不要写这个字段');
    if (!clock.onTimeout) warn('clock.beats 已设置但没写 onTimeout：拖满拍数按“超时收束”处理（不算赢）。只有合同明写 {type:"close",as:"win"} 才算赢');
    if (contract.beats && contract.beats.length < clock.beats) infos.push(`beats[] 只有 ${contract.beats.length} 条局势文字，少于 clock.beats ${clock.beats}`);
  } else if (clock?.onTimeout) warn('clock.onTimeout 已写但没有 clock.beats，不会触发');
  if (clock?.onTimeout?.type === 'continue') checkEffects(clock.onTimeout.events, 'clock.onTimeout.events');
  for (const event of clock?.fixedEvents || []) {
    if (event.atBeat !== undefined && (!Number.isInteger(event.atBeat) || event.atBeat < 1)) err(`clock.fixedEvents.${event.id}：atBeat 必须是 ≥ 1 的整数`);
    if (event.atBeat !== undefined && clock?.beats !== undefined && clock.onTimeout?.type !== 'continue' && event.atBeat > clock.beats) err(`clock.fixedEvents.${event.id}：atBeat ${event.atBeat} 超出 clock.beats ${clock.beats}`);
    checkEffects(event.effects, `clock.fixedEvents.${event.id}`);
  }

  // Conditional event authoring, information gates and continuity are checked before play.
  const fixedIds=new Set<string>();
  for(const event of clock?.fixedEvents || []) {
    if(!event.id)err('clock.fixedEvents：缺少事件id');
    if(fixedIds.has(event.id))err(`clock.fixedEvents：重复事件 ${event.id}`);fixedIds.add(event.id);
    if(event.when)checkConds(event.when,`clock.fixedEvents.${event.id}.when`);
    if(event.when && (event.atBeat!==undefined || event.onStart || event.atClose))err(`clock.fixedEvents.${event.id}：条件触发不能同时写拍数/开场/收束`);
    if(event.trigger && !['beatStart','afterAction','beforeEnemyAction','afterEnemyAction'].includes(event.trigger))err(`clock.fixedEvents.${event.id}：未知 trigger`);
    if(event.trigger && !event.when)err(`clock.fixedEvents.${event.id}：trigger 必须有 when`);
    if(event.enemyActionId && (!['beforeEnemyAction','afterEnemyAction'].includes(event.trigger || '') || !contract.enemyActions?.some(a=>a.id===event.enemyActionId)))err(`clock.fixedEvents.${event.id}：enemyActionId 必须引用敌方动作并指定敌方触发节点`);
  }
  for(const party of contract.parties || [])if(party.group && (!party.group.id || !party.group.label || party.player))err(`parties.${party.id}.group：必须有稳定id/标签，不能是主角`);
  checkEffects(contract.continuity?.effects,'continuity.effects');
  for(const cost of contract.continuity?.fixedCosts || []) {
    knownParty(cost.target,'continuity.fixedCosts');for(const ref of cost.statuses || [])needStatus(ref.status,'continuity.fixedCosts');
  }
  for(const after of contract.continuity?.checks || [])if(after.check)checkConds(after.check,`continuity.checks.${after.id}`);
  const info=contract.interrogation;
  if(info) {
    if(!Number.isInteger(info.maxChapter) || info.maxChapter<1)err('interrogation.maxChapter：必须是正整章号');
    if(!info.goalIds.length)err('interrogation.goalIds：必须指定至少一个审问目标');
    for(const id of info.goalIds)if(!goalsOf(contract).some(g=>g.id===id))err(`interrogation.goalIds：目标 ${id} 不存在`);
    if(info.requires)checkConds(info.requires,'interrogation.requires');
    const ids=new Set<string>();
    for(const fact of info.facts) {
      if(!fact.id || ids.has(fact.id) || !fact.text || !Number.isInteger(fact.fromChapter) || fact.fromChapter<1)err('interrogation.facts：id唯一、正文非空、章号为正整数');ids.add(fact.id);
      if(fact.forbiddenBefore)try{new RegExp(fact.forbiddenBefore);}catch{err(`interrogation.${fact.id}：禁写表达式无效`);}
    }
  }
  if(contract.rewardPolicy)for(const branch of [contract.closing?.win,contract.closing?.lose,contract.closing?.timeout,...Object.values(contract.closing?.playerChoices || {})]) {
    for(const reward of branch?.rewards || [])if(typeof reward.itemId==='string' && !contract.rewardPolicy.itemIds.includes(reward.itemId))err(`rewardPolicy：未经授权的奖励 ${reward.itemId}`);
  }

  // ---- 败局 ----
  const defeatList = (contract.defeat?.conditions || []);
  const plainDefeat = defeatList.filter(c => (c as PlayerChoiceCond).kind !== 'playerChoice') as Array<Cond | Expr>;
  for (const [i, cond] of plainDefeat.entries()) checkConds(cond, `defeat.conditions[${i}]`);
  for (const cond of defeatList.filter((c): c is PlayerChoiceCond => (c as PlayerChoiceCond).kind === 'playerChoice')) {
    for (const choice of cond.choices || []) {
      if (!choice.confirmText) err(`defeat.playerChoice.${choice.id}：必须有专用确认卡文字 confirmText`);
      if (!choice.endingId) err(`defeat.playerChoice.${choice.id}：缺 endingId`);
      if (!choice.matchHints?.length) err(`defeat.playerChoice.${choice.id}：缺 matchHints`);
    }
  }
  if (contract.defeat?.outcome?.type === 'ending' && !contract.defeat.outcome.endingId) err('defeat.outcome.type = "ending" 必须有 endingId');
  const timeoutLoses = clock?.onTimeout?.type === 'close' && clock.onTimeout.as === 'lose';
  if (!defeatList.length && !timeoutLoses) err('没有任何败路径：需要 defeat.conditions，或 clock.onTimeout 写成 {type:"close",as:"lose"}');
  for (const cond of plainDefeat.flatMap(c => collectConds(c, []))) {
    if ((cond.kind === 'partyDowned' || cond.kind === 'sideDowned')) {
      const sources: string[] = [];
      for (const action of contract.enemyActions || []) sources.push(...[...action.onHit.statuses, ...(action.onCrush?.statuses || [])].map(s => s.status));
      for (const entry of contract.fumble || []) if (entry.consequence.kind === 'status') sources.push(entry.consequence.status);
      if (!sources.some(id => leadsToDowned(id, contract, ctx))) warn('败局条件依赖“倒下”，但敌方出手和大失败后果里没有任何状态能走到“倒下”（可能永远输不了）');
    }
  }

  // ---- 敌方出手、大失败后果 ----
  const player = players[0]?.id;
  for (const action of contract.enemyActions || ([] as EnemyActionDef[])) {
    const where = `enemyActions.${action.id}`;
    const attacker = partyOf(contract, action.party);
    if (!attacker) err(`${where}：参与方“${action.party}”不存在`);
    else if (attacker.side === 'player_side') err(`${where}：出手方不能是 player_side`);
    if (typeof action.attack?.dc !== 'number') err(`${where}：attack.dc 缺失`);
    const t = action.target;
    if (t !== 'player') {
      if ('party' in t) knownParty(t.party, `${where}.target`);
      else if ('rotate' in t) t.rotate.forEach(id => knownParty(id, `${where}.target`));
      else if (!['player_side', 'opposed', 'neutral', 'third'].includes(t.each)) err(`${where}.target.each 不是合法阵营`);
    }
    if (!action.onHit?.statuses?.length) err(`${where}：onHit.statuses 为空（没挡住要给具体的人挂具体状态）`);
    for (const ref of [...(action.onHit?.statuses || []), ...(action.onCrush?.statuses || [])]) needStatus(ref.status, where);
    if (action.when) checkConds(action.when, `${where}.when`);
  }
  if (!(contract.enemyActions || []).length) infos.push('没有 enemyActions：敌方不会出手，玩家方不会因敌方行动挂状态');
  if (!(contract.fumble || []).length) infos.push('没有 fumble[]：大失败按模块默认处理（主角“失衡”，下一拍劣势）');
  for (const entry of contract.fumble || []) {
    const where = `fumble.${entry.id}`;
    if (typeof entry.target === 'object') knownParty(entry.target.party, where);
    if (entry.consequence.kind === 'status') needStatus(entry.consequence.status, where);
    else {
      const party = entry.consequence.party || (typeof entry.target === 'object' ? entry.target.party : player);
      if (party && !trackIdsOfParty(party).includes(entry.consequence.track)) err(`${where}：${party} 没有轨道 ${entry.consequence.track}`);
    }
  }

  // ---- 要素、目标、标签、锁 ----
  const elementIds = new Set((contract.elements || []).map(e => e.id));
  const tagIds = new Set((contract.tags || []).map(t => t.id));
  const goalIds = new Set(goalsOf(contract).map(g => g.id));
  for (const element of contract.elements || []) {
    if (!element.source) err(`elements.${element.id}：缺 source（出处）`);
    const av = element.availability as unknown;
    if (av !== undefined && (typeof av !== 'object' || av === null || Array.isArray(av))) err(`elements.${element.id}.availability 必须是 {fromBeat?, untilBeat?}，不能写成文字`);
    if (element.uses !== undefined && element.uses !== null && !(Number.isInteger(element.uses) && element.uses >= 1)) err(`elements.${element.id}.uses 必须是 ≥ 1 的整数或 null`);
    if (element.excludes !== undefined && !Array.isArray(element.excludes)) err(`elements.${element.id}.excludes 必须是数组`);
    if (element.owner) knownParty(element.owner, `elements.${element.id}.owner`);
    for (const other of Array.isArray(element.excludes) ? element.excludes : []) if (!elementIds.has(other)) err(`elements.${element.id}.excludes：要素“${other}”不存在`);
    for (const verb of element.verbs || []) {
      if (verb.requires !== undefined && !Array.isArray(verb.requires)) err(`elements.${element.id}.${verb.id}：requires 必须是数组（如 ["tag:xxx"]），不能写成文字`);
      if (verb.goalTags !== undefined && !Array.isArray(verb.goalTags)) err(`elements.${element.id}.${verb.id}：goalTags 必须是数组`);
      if (typeof verb.power !== 'number') err(`elements.${element.id}.${verb.id}：缺 power`);
      if (verb.creates && !tagIds.has(verb.creates)) err(`elements.${element.id}.${verb.id}：creates 的标签“${verb.creates}”不存在`);
      for (const tag of Array.isArray(verb.goalTags) ? verb.goalTags : []) if (!goalIds.has(tag)) err(`elements.${element.id}.${verb.id}：goalTags“${tag}”不是本场目标`);
      for (const need of Array.isArray(verb.requires) ? verb.requires : []) {
        const [kind, ref] = need.split(':');
        if (kind === 'tag' && !tagIds.has(ref)) err(`elements.${element.id}.${verb.id}：requires 的标签“${ref}”不存在`);
        else if (kind === 'lever' && !elementIds.has(ref)) err(`elements.${element.id}.${verb.id}：requires 的要素“${ref}”不存在`);
        else if (kind === 'present') knownParty(ref, `elements.${element.id}.${verb.id}.requires`);
        else if (!['tag', 'lever', 'present'].includes(kind)) err(`elements.${element.id}.${verb.id}：前置条件“${need}”无法识别（支持 tag:/lever:/present:）`);
      }
    }
  }
  for (const element of contract.elements || []) {
    for (const other of Array.isArray(element.excludes) ? element.excludes : []) {
      if (elementIds.has(other) && !(contract.elements!.find(e => e.id === other)!.excludes || []).includes(element.id)) warn(`elements.${element.id} 排斥 ${other}，但 ${other} 没有对称地排斥它`);
    }
  }
  for (const tag of contract.tags || []) {
    if (!['scene', 'player_side', 'opposed', 'neutral', 'third'].includes(tag.on) && !partyIds.has(tag.on)) err(`tags.${tag.id}：on“${tag.on}”不是参与方、阵营或 scene`);
  }
  for (const goal of goalsOf(contract)) {
    if (typeof goal.baseDifficulty !== 'number') err(`goals.${goal.id}：缺 baseDifficulty`);
    if (goal.onSuccess?.tag && !goal.onSuccess.tag.id) err(`goals.${goal.id}.onSuccess.tag 缺 id`);
  }
  if (!goalsOf(contract).length) err('goals[] 为空：非战斗场面需要自己定义目标类型（战斗场面有默认的“进攻 / 掩护”）');
  for (const lock of contract.locks || []) {
    if (lock.redirectTo && !goalIds.has(lock.redirectTo)) warn(`locks.${lock.id}.redirectTo“${lock.redirectTo}”不是本场目标，撞锁后只回复、不改目标`);
  }

  // ---- 红线 ----
  for (const line of contract.redLines || []) {
    const where = `redLines.${line.party}`;
    if (!knownParty(line.party, where)) continue;
    const tracks = line.track ? [line.track] : trackIdsOfParty(line.party);
    for (const track of tracks) {
      const info = trackInfo(contract, line.party, track);
      if (!info) { err(`${where}：没有轨道 ${track}`); continue; }
      const index = info.scale.indexOf(line.forbiddenFinalState);
      if (index < 0) continue;
      if (info.ending?.finalState === line.forbiddenFinalState) err(`${where}.${track}：终态 finalState 正是禁止的“${line.forbiddenFinalState}”`);
      else if (index <= info.limit && index > info.initial) err(`${where}.${track}：玩家的主张可以推到“${line.forbiddenFinalState}”（ceiling 够高）；红线要求任何路径都到不了`);
      for (const key of settable) if (key === `${line.party}.${track}.${line.forbiddenFinalState}`) err(`${where}.${track}：有事件把它设成禁止的“${line.forbiddenFinalState}”`);
      for (const branch of [contract.closing?.win,contract.closing?.lose,contract.closing?.timeout,...Object.values(contract.closing?.playerChoices || {})]) {
        for (const rule of branch?.settle || []) {
          if (rule.to === line.forbiddenFinalState && (!rule.party || rule.party === line.party)) err(`${where}.${track}：closing.settle 会把它设成禁止的“${line.forbiddenFinalState}”`);
        }
      }
    }
  }

  // ---- 收束引用 ----
  for (const [name, branch] of Object.entries({win:contract.closing?.win,lose:contract.closing?.lose,timeout:contract.closing?.timeout,...contract.closing?.playerChoices})) {
    for (const cost of branch?.fixedCosts || []) {
      if (cost.target !== 'scene') knownParty(cost.target, `closing.${name}.fixedCosts.${cost.id}`);
      for (const ref of cost.statuses || []) needStatus(ref.status, `closing.${name}.fixedCosts.${cost.id}`);
    }
    for (const rule of branch?.settle || []) if (rule.party) knownParty(rule.party, `closing.${name}.settle`);
    for (const after of branch?.afterState || []) if (after.check) checkConds(after.check, `closing.${name}.afterState.${after.id}`);
  }
  if (!contract.closing?.win) infos.push('没有 closing.win：赢了之后没有承重代价、事后状态和续接');
  const nextWin = contract.closing?.win?.next;
  const nextLose = contract.closing?.lose?.next;
  if (nextWin === undefined || nextLose === undefined) infos.push('closing.win / closing.lose 的 next 没有都声明（没有续接请显式写 null）');

  const statusDefs: StatusDef[] = contract.statuses || [];
  const seen = new Set<string>();
  for (const def of statusDefs) {
    if (seen.has(def.id)) err(`statuses 里 ${def.id} 重复`);
    seen.add(def.id);
  }
  return { errors, warnings, infos };
}
