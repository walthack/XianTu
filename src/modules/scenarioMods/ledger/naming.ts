import overrides from '../../../../mod-kit/entity-ledger/overrides.json';

/** 显示标签不是自报姓名。所有渠道以角色id读同一章门表，不反向以标签建人物。 */
export type NamingChannel = 'panel' | 'narration' | 'protagonistAddress' | 'protagonistThought' | 'npcAddress' | 'selfReportedName';
type Runtime = { modId?: string; events?: { id: string; axisAnchor?: string }[]; activeEventIds?: string[]; completedEventIds?: string[]; travelLedger?: { doneEventIds?: string[] }; flags?: Record<string, unknown>; canon?: { characters?: any[] } };
const entities = overrides.entities;
export function namingChapter(runtime: Runtime): number {
  const done = new Set([...(runtime.completedEventIds || []), ...(runtime.travelLedger?.doneEventIds || [])]);
  const chapterOf = (event: {axisAnchor?: string}) => Number(event.axisAnchor?.match(/第(\d+)章|qingyu\.(\d+)\./)?.slice(1).find(Boolean) || 0);
  const active = (runtime.events || []).filter(e => runtime.activeEventIds?.includes(e.id)).map(chapterOf).filter(Boolean);
  const floor = (overrides.stageOpeningChapters as Record<string,number>)[runtime.modId || ''] || 0;
  const milestones = Object.entries(overrides.namingMilestones).filter(([id])=>done.has(id)).map(([,chapter])=>chapter);
  return Math.max(floor, ...milestones, ...(runtime.events || []).filter(e => done.has(e.id)).map(chapterOf), ...(active.length ? [Math.min(...active)] : []));
}
/** 称呼档可选带 requiresState：只有该剧情状态（runtime.flags，值为 true）已写入才放开；没传状态一律不过门。 */
type StateGate = { requiresState?: string };
function stateGateOpen(step: unknown, flags?: Record<string, unknown>): boolean {
  const key = (step as StateGate).requiresState;
  return !key || flags?.[key] === true;
}
export function namingFor(id: string, chapter: number, channel: NamingChannel = 'panel', context: { flags?: Record<string, unknown> } = {}) {
  const entry = entities.find(e => e.id === id);
  const steps = entry?.naming[channel];
  return steps?.filter(s => s.fromChapter <= chapter && stateGateOpen(s, context.flags)).at(-1);
}
const wordsOf = (text: string) => text.split('／');
/** 首档之后新增的称呼词，在所有含它的档都未放开（章节未到或状态未写）时视为尚未放开；首档词是基线，不算。 */
export function npcAddressWithheld(id: string, runtime: Runtime, channel: NamingChannel = 'npcAddress'): string[] {
  const steps = entities.find(e => e.id === id)?.naming[channel] || [];
  const chapter = namingChapter(runtime);
  const allowed = new Set([...(steps[0] ? wordsOf(steps[0].text) : []), ...steps.filter(s => s.fromChapter <= chapter && stateGateOpen(s, runtime.flags)).flatMap(s => wordsOf(s.text))]);
  return [...new Set(steps.flatMap(s => wordsOf(s.text)))].filter(w => !allowed.has(w));
}
/** 正文里「角色名 + 35字内 + 尚未放开的称呼词」命中则返回该词；namePattern 由调用方给出（实体名正则）。 */
export function withheldAddressUsed(id: string, runtime: Runtime, text: string, namePattern: string): string | undefined {
  return npcAddressWithheld(id, runtime).find(w => text.includes(w) && new RegExp('(?:' + namePattern + ')[^。！？\\n]{0,35}' + w).test(text));
}
export function namingAliases(id: string): string[] { return entities.find(e => e.id === id)?.aliases || []; }
export function projectNamingText(text: string, runtime: Runtime, channel: NamingChannel = 'panel'): string {
  // 只重映射本存档中已有实体的专名，不用「使者／护卫」等泛称猜身份。
  const chapter = namingChapter(runtime);
  let result = text;
  for (const entry of entities) {
    if (!runtime.canon?.characters?.some(c => c.id === entry.id)) continue;
    const target = namingFor(entry.id, chapter, channel)?.text;
    if (!target) continue;
    if (channel === 'narration' && overrides.historicalNamePreservationIds.includes(entry.id)) continue; // 旧事中的姓名保留当时写法；在场形态由演员id投影
    for (const alias of [...entry.aliases].sort((a,b) => b.length-a.length)) {
      if (alias === target || overrides.nonReplacingAliases.includes(alias)) continue;
      if (entry.id === overrides.historicalAliases.id && chapter < overrides.historicalAliases.beforeChapter && overrides.historicalAliases.names.includes(alias)) continue;
      // 亲昵称呼由独立通道决定，不把对白里的亲密别称等改成姓名。
      const displayAliases = new Set([...entry.naming.panel, ...entry.naming.narration].map(s=>s.text));
      if (!displayAliases.has(alias) && !overrides.legacyDisplayAliases.includes(alias)) continue;
      const parts = result.split(alias);
      result = parts.reduce((joined, part, index) => {
        if (!index) return part;
        const protectedUse = overrides.nameProtectedSuffixes.some(s => part.startsWith(s)) || overrides.selfIntroductionPrefixes.some(prefix => joined.endsWith(prefix));
        return joined + (protectedUse ? alias : target) + part;
      }, '');
    }
  }
  return result;
}
/** 章级身份切换（账本 chapterIdentities）：某人物从某章起换一条身份文字，按人物 id 读表，不含人物专属代码。 */
type IdentityStep = { fromChapter: number; identity: string; role?: string };
const chapterIdentities = (overrides as unknown as { chapterIdentities: Record<string, { steps: IdentityStep[] }> }).chapterIdentities;
export function identityFor(id: string, chapter: number): IdentityStep | undefined {
  return chapterIdentities[id]?.steps.filter(s => s.fromChapter <= chapter).at(-1);
}
/** 把已放开的身份档写到阶段档：description／profile.origin／【阶段身份】备注同值；档里给了 role 才动 role。 */
function applyIdentityStep(c: any, step: IdentityStep): void {
  c.description = step.identity;
  if (step.role) c.role = step.role;
  const profile = c.profile ||= {};
  profile.origin = step.identity;
  const line = `【阶段身份】${step.identity}`;
  const notes: string[] = Array.isArray(profile.notes) ? profile.notes : [];
  const at = notes.findIndex(note => String(note).startsWith('【阶段身份】'));
  if (at >= 0) notes[at] = line; else notes.push(line);
  profile.notes = notes;
}
/** 章门直接读账本，不另存章号：改名章＝np006 面板称呼里首个 kind=name 档的 fromChapter；身份揭示章＝s04_03 命名里程碑。 */
export const ledgerChapterGates = {
  geluoRenameFrom: (entities.find(e => e.id === 'lcq.character.np006')!.naming.panel as { fromChapter: number; kind?: string }[]).find(s => s.kind === 'name')!.fromChapter,
  lemingzhuRevealFrom: overrides.namingMilestones['lcq.event.s04_03'],
};

export function syncCharacterNaming(runtime: Runtime): void {
  if (!runtime.modId?.startsWith('lcq.')) return;
  const chapter = namingChapter(runtime);
  for (const c of runtime.canon?.characters || []) {
    const shift = identityFor(c.id, chapter);
    if (shift) applyIdentityStep(c, shift);
    const display = namingFor(c.id, chapter);
    if (!display) continue;
    c.name = display.text;
    // 母系是已知事实，名字仍按称呼门展示，不改变血缘真值。
    if (c.id === 'liuchao.character.xiao_zi' && c.profile) {
      const names = entities.find(e=>e.id==='liuchao.character.bi_ji')!.naming.panel;
      const earlier=names[0].text, later=names[1].text, laterFrom=names[1].fromChapter;
      for (const key of ['race','origin']) if (typeof c.profile[key] === 'string') c.profile[key] = chapter < laterFrom ? c.profile[key].split(later).join(earlier) : c.profile[key].split(earlier).join(later);
      for (const key of ['notes','memories']) if (Array.isArray(c.profile[key])) c.profile[key] = c.profile[key].map((s: string) => chapter < laterFrom ? s.split(later).join(earlier) : s.split(earlier).join(later));
    }
  }
}

/** 只投影模型材料副本中的文字；keys/实体id/合同及结算保持不变。 */
export function projectNamingPacket<T>(packet: T, runtime: Runtime): T {
  const visit = (value: any, key = ''): any => typeof value === 'string' ? /(?:id|Id|Ids|Hash|source|引用|出处|panelName|protagonistAddress|protagonistThought|主角心称|主角对他|selfReportedName)$/.test(key) ? value : projectNamingText(value, runtime, 'narration') : Array.isArray(value) ? value.map(v => visit(v,key)) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,visit(v,k)])) : value;
  return visit(packet);
}

export const namingInstructions = overrides.namingInstructions;

export function isSouthernStage(stageId?: string): boolean { const chapter = (overrides.stageOpeningChapters as Record<string,number>)[stageId || '']; return Boolean(chapter && chapter >= 37 && chapter <= 124); }

/** 原著无名配角只绑定已指定场景窗口；不把同名标签当成通用身份。 */
export function sceneBoundEntity(label: string, chapter: number) { return entities.find(e => 'sceneBinding' in e && e.sceneBinding && chapter >= e.sceneBinding.fromChapter && chapter <= e.sceneBinding.toChapter && e.aliases.includes(label)); }
