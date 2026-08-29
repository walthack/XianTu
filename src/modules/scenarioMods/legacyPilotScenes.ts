import type { LegacyNarratorPacket } from './legacyNarratorPacket';
import type { LegacyRenderPlan } from './legacyRenderPlan';

export const LEGACY_NARRATIVE_PILOT_EVENT_IDS = [
  'lcq.event.s01_01',
  'lcq.event.s01_02',
  'lcq.event.s01_03',
  'lcq.event.s01_04',
  'lcq.event.s01_05',
  'lcq.event.s01_06',
  'lcq.event.s02_01',
  'lcq.event.s02_03',
  'lcq.event.s02_02',
  'lcq.event.s02_04',
  'lcq.event.s02_05',
  'lcq.event.s02_06',
  'lcq.event.ningyu_enters_gamble',
  'lcq.event.sudaji_south_pact',
  'lcq.event.gamble_bond_signed',
  'lcq.event.charge_sudaji_fee',
  'lcq.event.free_ajiman',
  'lcq.event.baihu_shangguan_escape',
] as const;

export type LegacyPilotEventId = (typeof LEGACY_NARRATIVE_PILOT_EVENT_IDS)[number];

const OPENING_STOCK_RE = /这不是飞机|湿草撑起|跑道|舱壁|机舱里那点循环空气|抓住一把草，像抓住最后一点能证明这不是虚空/;

const S01_04_CAST = ['卓云君', '月霜', '蔺采泉', '商乐轩', '夙未央'] as const;

export function isLegacyPilotEventId(eventId: string | undefined): eventId is LegacyPilotEventId {
  return !!eventId && (LEGACY_NARRATIVE_PILOT_EVENT_IDS as readonly string[]).includes(eventId);
}

export function legacyPilotEventIdOf(packet: LegacyNarratorPacket): string {
  return String(packet.eventId || '').trim() || 'lcq.event.s01_01';
}

function presentNames(packet: LegacyNarratorPacket): string[] {
  return [...new Set((packet.mustAppear?.present || packet.present || []).map(name => String(name || '').trim()).filter(Boolean))];
}

function placeOf(packet: LegacyNarratorPacket): string {
  const raw = packet.mustAppear?.location || packet.location || '';
  return raw.replace(/[·,，]/g, '') || raw || '这片草地';
}

function isCommandTentLabel(value: unknown): boolean {
  const text = String(value || '').trim();
  return text === '帅帐' || /(^|[·])帅帐$/.test(text);
}

function isQingyuCommandTent(value: unknown): boolean {
  return String(value || '').trim() === '中州·帅帐';
}

function isWuyuanCityLabel(value: unknown): boolean {
  const text = String(value || '').trim();
  return text === '五原城' || /(^|[·])五原城$/.test(text);
}

function isWaterPrisonLabel(value: unknown): boolean {
  const text = String(value || '').trim();
  return text === '白湖商馆水牢' || /(^|[·])白湖商馆水牢$/.test(text);
}

function isBaihuHallLabel(value: unknown): boolean {
  const text = String(value || '').trim();
  return text === '白湖商馆内院' || /(^|[·])白湖商馆内院$/.test(text);
}

function atSameCityOrHall(packet: LegacyNarratorPacket): boolean {
  const atCity = isWuyuanCityLabel(packet.location) && isWuyuanCityLabel(packet.mustAppear?.location);
  const atHall = isBaihuHallLabel(packet.location) && isBaihuHallLabel(packet.mustAppear?.location);
  return atCity || atHall;
}

const S02_02_CAST = ['王哲', '月霜'] as const;

const LEGACY_PILOT_FINAL_ACTION_IDS: Partial<Record<LegacyPilotEventId, string>> = {
  'lcq.event.gamble_bond_signed': 'sign_the_bond',
  'lcq.event.charge_sudaji_fee': 'lock_fee_then_remove_device',
  'lcq.event.free_ajiman': 'tear_bond_and_face_blockade',
  'lcq.event.baihu_shangguan_escape': 'walk_out_wuyuan_shangguan',
};

/** relatedCharacterIds that may force-present. Physical extras still fail accept. */
export function filterLegacyPilotEventCharacterNames(eventId: string | undefined, names: string[]): string[] {
  if (
    eventId === 'lcq.event.s02_06'
    || eventId === 'lcq.event.sudaji_south_pact'
    || eventId === 'lcq.event.charge_sudaji_fee'
    || eventId === 'lcq.event.baihu_shangguan_escape'
  ) return [];
  if (
    eventId === 'lcq.event.ningyu_enters_gamble'
    || eventId === 'lcq.event.gamble_bond_signed'
    || eventId === 'lcq.event.free_ajiman'
  ) return names.filter(name => name === '凝羽');
  if (eventId !== 'lcq.event.s02_02') return names;
  return names.filter(name => (S02_02_CAST as readonly string[]).includes(name));
}

export function acceptLegacyPilotScene(packet: LegacyNarratorPacket): boolean {
  const eventId = legacyPilotEventIdOf(packet);
  if (!isLegacyPilotEventId(eventId)) return false;
  const finalAction = LEGACY_PILOT_FINAL_ACTION_IDS[eventId];
  if (finalAction && packet.actionId !== finalAction) return false;
  const names = presentNames(packet);
  if (eventId === 'lcq.event.s01_01') return names.length === 1 && names[0] === '段强';
  if (eventId === 'lcq.event.s01_02') return names.length === 1 && names[0] === '段强';
  if (eventId === 'lcq.event.s01_03') return names.includes('月霜');
  if (eventId === 'lcq.event.s01_04') return names.some(name => (S01_04_CAST as readonly string[]).includes(name));
  if (eventId === 'lcq.event.s01_05') {
    if (!names.includes('王哲')) return false;
    const atTent = /帅帐/.test(packet.location || '') || /帅帐/.test(packet.mustAppear?.location || '');
    const moving = packet.receipts?.move === true && /帅帐/.test(String(packet.receipts?.moveTo || ''));
    return atTent || moving;
  }
  if (eventId === 'lcq.event.s01_06') return names.includes('月霜') && !names.includes('段强');
  if (eventId === 'lcq.event.s02_01') {
    if (!names.includes('王哲') || names.includes('段强')) return false;
    const atTent = /帅帐/.test(packet.location || '') || /帅帐/.test(packet.mustAppear?.location || '');
    return atTent;
  }
  if (eventId === 'lcq.event.s02_03') {
    if (!names.includes('月霜') || names.includes('段强')) return false;
    const atTent = isCommandTentLabel(packet.location) && isCommandTentLabel(packet.mustAppear?.location);
    return atTent && packet.receipts?.move === false;
  }
  if (eventId === 'lcq.event.s02_02') {
    if (names.length !== 2 || !names.includes('王哲') || !names.includes('月霜')) return false;
    const atTent = isQingyuCommandTent(packet.location) && isQingyuCommandTent(packet.mustAppear?.location);
    return atTent && packet.receipts?.move === false && packet.receipts?.casualty === true;
  }
  if (eventId === 'lcq.event.s02_04') {
    if (names.some(name => name !== '月霜')) return false;
    const atCity = isWuyuanCityLabel(packet.location) && isWuyuanCityLabel(packet.mustAppear?.location);
    const moving = packet.receipts?.move === true && isWuyuanCityLabel(packet.receipts?.moveTo);
    return (atCity || moving) && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.s02_05') {
    if (names.length !== 0) return false;
    const atCity = isWuyuanCityLabel(packet.location) && isWuyuanCityLabel(packet.mustAppear?.location);
    const atPrison = isWaterPrisonLabel(packet.location) && isWaterPrisonLabel(packet.mustAppear?.location);
    return (atCity || atPrison) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.s02_06') {
    if (names.length !== 0) return false;
    const atCity = isWuyuanCityLabel(packet.location) && isWuyuanCityLabel(packet.mustAppear?.location);
    const atHall = isBaihuHallLabel(packet.location) && isBaihuHallLabel(packet.mustAppear?.location);
    return (atCity || atHall) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.ningyu_enters_gamble') {
    if (names.length !== 1 || names[0] !== '凝羽') return false;
    const atCity = isWuyuanCityLabel(packet.location) && isWuyuanCityLabel(packet.mustAppear?.location);
    const atHall = isBaihuHallLabel(packet.location) && isBaihuHallLabel(packet.mustAppear?.location);
    return (atCity || atHall) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.sudaji_south_pact') {
    if (names.length !== 0) return false;
    return atSameCityOrHall(packet) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.gamble_bond_signed') {
    if (names.length !== 1 || names[0] !== '凝羽') return false;
    return atSameCityOrHall(packet) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.charge_sudaji_fee') {
    if (names.length !== 0) return false;
    return atSameCityOrHall(packet) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.free_ajiman') {
    if (names.length !== 1 || names[0] !== '凝羽') return false;
    return atSameCityOrHall(packet) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  if (eventId === 'lcq.event.baihu_shangguan_escape') {
    if (names.length !== 0) return false;
    return atSameCityOrHall(packet) && packet.receipts?.move === false && packet.receipts?.casualty === false;
  }
  return false;
}

function namedBeats(names: string[], line: (name: string) => string): string[] {
  return names.map(line).filter(Boolean);
}

function openingPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const location = packet.location || '这片草地';
  const names = presentNames(packet);
  const companion = names[0] || '身边的人';
  const answers = companion === '段强'
    ? `${companion}抬眼看你，喉咙动了动，终于挤出半句：“这……这不是飞机。”`
    : `${companion}就在几步开外，一时说不出完整的话。`;
  const sensory = {
    grass_iron: `风从${location.replace(/[·,，]/g, '')}上刮过来，铁锈、草汁和远处人喊马嘶混在一起。`,
    wind_sky: `天光白得刺眼。你抬手挡了挡，这才看清地平线处有烟，有尘。`,
    mud_body: `你撑着湿草撑起上身。掌心下面仍是泥土和草根，凉，黏，带着刚被压过的草汁。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有起身就跑。眼下第一件事仍是先稳住自己，辨认这一处落点，弄清身在何处。`,
    tense_watch: `你把呼吸压低，先把能看见的边界看完，不跟着远处的喊声走。`,
    steady_breathe: `你先稳住呼吸，再慢慢把膝盖从泥里抽出来，让自己重新坐实。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}就在几步开外，肩背一起一伏，嘴唇发白，一时说不出完整的话。`,
    answers,
    silent_grip: `${companion}忽然抓住一把草，像抓住最后一点能证明这不是虚空的东西。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你把膝盖上的泥抹掉，重新蹲稳，让自己处在随时能起身、却还不盲目冲出去的位置。`,
    look_far: `你让身边的人先喘气，自己则把视野放远：左面是开阔的坡，右面有旗帜在抖。`,
    steady_breath: `你把呼吸重新对齐，先弄清自己身在何处。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function dangerPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const companion = '段强';
  const sensory = {
    grass_iron: `第一支箭钉进你脚边的泥里，箭羽还在抖。蹄声贴着草根压过来。`,
    wind_sky: `喊杀声换了方向。灌木后面立起几个佝偻的影子，短弓正在上弦。`,
    mud_body: `你把${companion}按进土沟。泥溅到牙缝里，苦，腥，还带着被踏过的草汁。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有回头看落点。眼下只剩一件事：先保住自己和身边的人。`,
    tense_watch: `你把呼吸压低，盯住上弦的那几张弓，不让${companion}再站到开阔处。`,
    steady_breathe: `你先把气沉住，再拽${companion}的袖口，让两个人一起贴进沟沿。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}还想直起身看，喉结滚动，一句完整的话都挤不出来。`,
    answers: `${companion}低声骂了一句，声音发干：“别愣着——弓拉开了。”`,
    silent_grip: `${companion}死死抓住你的手腕，指节发白，像抓住最后一块能挡箭的东西。`,
  }[plan.companion];
  const closing = packet.receipts?.casualty
    ? `${companion}的脖子上多了一截羽箭。血先从领口涌出来，他还想说什么，气已经散了。`
    : `你把${companion}按在自己身侧，先保住这一息，不把未见回执的伤亡写实。`;
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function interactPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const companion = presentNames(packet).find(name => name === '月霜') || presentNames(packet)[0] || '伤者';
  const sensory = {
    grass_iron: `伤处的血把甲片粘在布上。风一过，铁锈味比草汁更先扑到脸上。`,
    wind_sky: `烟尘从战场那头翻过来。你看清那名受伤军士还在喘气，肩背抽动。`,
    mud_body: `你跪到泥里。掌心触到的不是草根，是温热的血和发抖的肋下。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有立刻把人拖走。先判断该不该伸手相助，伤到了哪里，还能不能移动。`,
    tense_watch: `你把呼吸压低，先看清四周还有没有第二支箭，再靠近${companion}。`,
    steady_breathe: `你先稳住手，再把${companion}的肩甲托住，让伤处不要继续往泥里陷。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}咬着牙，目光凶得很，一时分不清你是来救还是来搜身。`,
    answers: `${companion}喘着说：“别碰那里——先看有没有追兵。”声音又硬又短。`,
    silent_grip: `${companion}一把扣住你的腕骨，力道大得不像重伤的人。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你把${companion}半扶起来，停在能伸手相助、却还不盲目冲阵的位置。`,
    look_far: `你让${companion}靠着土坡喘气，自己把视野放到烟尘起处，判断还有没有人过来。`,
    steady_breath: `你把呼吸重新对齐，先把这名受伤军士安稳住。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function progressPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const names = presentNames(packet);
  const fire = names.includes('卓云君') ? '卓云君' : '那名修士';
  const wounded = names.includes('月霜') ? '月霜' : '伤者';
  const place = placeOf(packet);
  const sensory = {
    grass_iron: `${place}这一侧，火光贴着兽影燎过去。焦糊味压过了血和草汁，弓弦声一下子乱了。`,
    wind_sky: `有修士突然插手战场。风被热浪掀开，旗帜在烟里抖成一条。`,
    mud_body: `热浪打在你后颈上。你把${wounded}从泥里拖起来，掌心全是血。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有把救人交给别人。先设法带着伤者脱险，再看这些修士要什么。`,
    tense_watch: `你盯着火光起处，不让${wounded}再暴露在弓箭能及的开阔地。`,
    steady_breathe: `你先把步子踩实，再把${wounded}的重量接到自己肩上。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${fire}的火光里，${wounded}只剩喘气，说不出完整的谢。`,
    answers: `${fire}喝了一声：“带伤者离开这一线！”声音又亮又短。`,
    silent_grip: `${wounded}抓住你的衣襟，指节发白，像生怕一松手就会被兽阵吞回去。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你把${wounded}转到火光内侧，先脱险，不跟着兽群的退向乱跑。`,
    look_far: `你让${wounded}靠着你，自己把视野放到修士落点：人在，火在，路还没有封死。`,
    steady_breath: `你把呼吸重新对齐，带着伤者从这一段战场里退出来。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function martyrPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const companion = '月霜';
  const place = placeOf(packet);
  const sensory = {
    grass_iron: `${place}帐口外，左武军的旗已经碎了。热浪先到，铁锈味被一种更干的焦糊盖住。`,
    wind_sky: `帐帘外天光忽然白得发烫。九阳一枚枚点亮，像有人把白昼重新钉上天空。`,
    mud_body: `靴底还停在${place}。帐外的土开始发硬发裂，热气贴着门槛往里钻。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `左武军已与联军开战，先保住自己和月霜，跟上战局变化。你没有冲出${place}。`,
    tense_watch: `你把呼吸压低，从帐口盯住王哲脱甲悬空的那一线，不让${companion}迈过帐门。`,
    steady_breathe: `你先把气沉住，拉住${companion}，停在还能看见九阳、人还在${place}的位置。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}咬着牙，说不出完整的话，只把你往帐门内侧拽。`,
    answers: `${companion}低声说：“看他。别抢这一击。”声音又硬又短。`,
    silent_grip: `${companion}扣住你的腕骨，力道大，不让你离开${place}去挡那团越来越亮的光。`,
  }[plan.companion];
  const closing = {
    hold_ground: `九阳依次点亮，合一如日轮。光球坠地，帐外成了焦土。王哲以自身殉军，旁人没有抢走最后一击。`,
    look_far: `你拉住${companion}，自己把视野放到帐外：联军那一侧的轻蔑散了，日轮落下去，左武第一军团覆灭。`,
    steady_breath: `你把呼吸重新对齐，先保住自己和${companion}。王哲的九阳收束了这一局，人还在${place}。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function brandPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const dest = String(packet.receipts?.moveTo || packet.mustAppear?.location || packet.location || '五原城');
  const destName = isWuyuanCityLabel(dest) ? '五原城' : dest.replace(/[·,，]/g, '') || '五原城';
  const companion = presentNames(packet).find(name => name === '月霜');
  const side = companion ? `${companion}被挡在人群外。` : '身边没有能替你回话的人。';
  const sensory = {
    grass_iron: `${destName}城门这一侧，马粪、铁锈和热烙铁的焦糊叠在一起。锁链先碰到手腕。`,
    wind_sky: `城门洞把风挤窄。尘土扑到牙上，有人已经把烙铁从炉里抽出来。`,
    mud_body: `靴底还带着帐外的土。${destName}的石板是硬的，膝盖撞上去发麻。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯。你没有去辨认他们的名字。`,
    tense_watch: `你把呼吸压低，先看清城门兵和拿烙铁的人站在哪一侧，再开口。`,
    steady_breathe: `你先把气沉住。盘问已经落到脸上，拉扯比话更快。`,
  }[plan.pacing];
  const reaction = {
    dazed: `有人卡住你的后颈，问你从哪座庄子逃出来。你一时答不上来。`,
    answers: `有人骂：“逃奴还敢进城？”随即把你的胳膊拧到背后。`,
    silent_grip: `一只手扣住你的腕骨，力道大，不让你从城门这一侧退回去。`,
  }[plan.companion];
  const closing = {
    hold_ground: `殴打过后，烙铁按上颈侧。奴隶印记落下，痛是实的，名分也是实的。`,
    look_far: `你被按在石板上。烙铁的热先到，印记后到。${destName}这一侧，逃奴已经定了。`,
    steady_breath: `你把呼吸重新对齐，先挨过这一烙。印记在，盘问还在，人还在${destName}。`,
  }[plan.closing];
  const arrival = packet.receipts?.move
    ? `城门洞一暗。你跨过门槛，泥还留在城外，${destName}里的嘈杂压过来。`
    : `你已在${destName}里。城门在身后合上，石板把靴底磕响。`;
  return [arrival, side, reaction, sensory, pacing, closing].filter(Boolean);
}

function dungeonPlaceName(packet: LegacyNarratorPacket): string {
  const loc = packet.mustAppear?.location || packet.location || '';
  if (isWaterPrisonLabel(loc)) return '水牢';
  return '五原城';
}

function ambushPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = dungeonPlaceName(packet);
  const sensory = {
    grass_iron: `${destName}地牢这一侧，潮气和铁锈贴着石壁。颈上的印记还烫，锁链先碰到腕骨。`,
    wind_sky: `牢门缝里挤进一点风。地牢比城门更暗，有人的脚步贴着水声过来。`,
    mud_body: `靴底还停在${destName}。石板上是湿的，膝盖一跪就凉。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `地牢里有人靠近你，先判断她要带你去哪。你没有立刻跟着走。`,
    tense_watch: `你把呼吸压低，先看清她停在牢门哪一侧，再开口。`,
    steady_breathe: `你先把气沉住。靠近已经落到眼前，去哪比名字更先要弄清。`,
  }[plan.pacing];
  const reaction = {
    dazed: `她靠近时没有报名字。你一时分不清这是放人还是把你再往外送一截。`,
    answers: `她低声说：“跟我走。别出声。”声音短，像在赶时间。`,
    silent_grip: `她扣住你的腕骨，力道不重，却不让你停在原处。`,
  }[plan.companion];
  const closing = {
    hold_ground: `牢门开了。外面等着的是伏击。你反抗，扑上来的人倒在地上，不再动。`,
    look_far: `她把你带出地牢。石阶尽头有人截住。你先反抗，不把这一截写成已经过关。`,
    steady_breath: `你把呼吸重新对齐，先看清伏击落在哪一侧。人还在${destName}，牢外这一刀已经落下。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function hallPlaceName(packet: LegacyNarratorPacket): string {
  const loc = packet.mustAppear?.location || packet.location || '';
  if (isBaihuHallLabel(loc)) return '白湖商馆内院';
  return '五原城';
}

function hallPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const sensory = {
    grass_iron: `${destName}这一侧，香和铁锈叠在一起。白湖商馆的灯把馆主的妆照得很端。`,
    wind_sky: `帘后有风。馆主坐得很稳，像早就等你把话说完。`,
    mud_body: `靴底还停在${destName}。地是干的，颈上的印记却还烫。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `在白湖商馆与馆主当面周旋，看清她究竟是谁。你没有先求放行。`,
    tense_watch: `你把呼吸压低，先看清她坐在哪一侧，再开口。`,
    steady_breathe: `你先把气沉住。周旋已经落到案对面，伪装比客套更先要看清。`,
  }[plan.pacing];
  const reaction = {
    dazed: `馆主看着你，笑得很浅，一时不让你把她认成哪一路的人。`,
    answers: `馆主说：“霓龙丝的事，你知道多少？”声音不高，却把问题钉死了。`,
    silent_grip: `馆主按住案沿，指节稳定，像在确认一件她还不打算说破的事。`,
  }[plan.companion];
  const closing = {
    hold_ground: `伪装被看穿以后，囚禁落到你身上。霓龙丝的问题还在，人还在${destName}。`,
    look_far: `你把视野放到帘外：没有放行。馆主要的是情报，不是送你出门。`,
    steady_breath: `你把呼吸重新对齐，先挨过这一问。囚禁是实的，交易还没有落。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function gambleDebutPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const companion = '凝羽';
  const sensory = {
    grass_iron: `${destName}这一侧，赌具和香叠在一起。${companion}被馆主差到案前，甲叶还没暖。`,
    wind_sky: `帘后有风。${companion}走进来，步子比馆主的笑更短。`,
    mud_body: `靴底还停在${destName}。石板是硬的，${companion}停在你能看见、也还能回话的位置。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `凝羽突然入局，当面看清她此刻的处境并回应。你没有把后话提前说完。`,
    tense_watch: `你把呼吸压低，先看清她是被差进来的，再开口。`,
    steady_breathe: `你先把气沉住。入局已经落到眼前，处境比来历更先要认。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}站在案前，一时说不清自己愿不愿意上这一桌。`,
    answers: `${companion}低声说：“是馆主要我上场。”声音短，像把差遣说完就不肯再补。`,
    silent_grip: `${companion}的手按在刀柄上，没有拔，只让你看见她是被推进来的。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你当面应了一句。认的是她此刻被差遣进赌局，不是后面那些还没落到桌上的事。`,
    look_far: `你让${companion}停在肩侧，自己把视野放到馆主那一侧：差遣是她下的，入局是这一拍。`,
    steady_breath: `你把呼吸重新对齐，先回应登场的${companion}。人还在${destName}，契还没有落到手上。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function southPactPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const sensory = {
    grass_iron: `${destName}案上仍是霓龙丝三个字。香更浓，馆主把期限按在你颈上那块还烫的皮旁边。`,
    wind_sky: `帘不透风。馆主把三个月说得很短，像把活路和炮烙放在同一只杯里。`,
    mud_body: `靴底还停在${destName}。你的膝抵着石，印记还烫，期限还没有落。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `面对馆主就霓龙丝一事的逼问，谈清眼下能换到的期限。你没有去碰那条立刻动手的路。`,
    tense_watch: `你把呼吸压低，先看清三个月和炮烙各落在哪一侧，再开口。`,
    steady_breathe: `你先把气沉住。线索可以换期限，现在动手的那条你不接。`,
  }[plan.pacing];
  const reaction = {
    dazed: `馆主看着你，等你把霓龙丝的线索交出来，一时不让你把活路说成已经到手。`,
    answers: `馆主说：“三个月。南荒。采不到，炮烙。”声音不高，却把约定钉死了。`,
    silent_grip: `馆主按住案沿，指节稳定，像在确认你敢不敢接这三个月。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你把三个月南荒之约接住。霓龙丝是由头，炮烙是后手，人还在${destName}。`,
    look_far: `你让约先落在案上，自己把视野放到帘外：出门是后一截，这一拍只把期限说死。`,
    steady_breath: `你把呼吸重新对齐，先把三个月订死。现在动手的那条没有落到你身上。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function bondPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const companion = '凝羽';
  const sensory = {
    grass_iron: `${destName}这一侧，刻香比人更快。香灰塌下去，${companion}还站在桌边。`,
    wind_sky: `帘不透风。刻香被催着往下烧，赌局的时限已经提前到头。`,
    mud_body: `靴底还停在${destName}。案上是契书，香是热的，你的手是凉的。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `赌局局面骤变，面对眼前的刻香与契书做出回应。你没有把此局说成尚未结束。`,
    tense_watch: `你把呼吸压低，先看清刻香被加速的那一侧，再伸手。`,
    steady_breathe: `你先把气沉住。落败已经落下，卖身契就在眼前。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}看着刻香，一时说不出完整的话，只把你往契书那一侧推。`,
    answers: `${companion}低声说：“香被催了。这一局已经判你输。”声音又硬又短。`,
    silent_grip: `${companion}扣住你的腕骨，不让你把桌子掀了，只让你看见眼前这张契。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你签下卖身契。奴籍落到白湖商馆名下。人还在${destName}，此局没有作废。`,
    look_far: `你让${companion}停在身边，自己把视野放到馆主那一侧：作弊是她的，签字是你的。`,
    steady_breath: `你把呼吸重新对齐，先把这张契签完。被卖的是你，不是${companion}。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function feePreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const sensory = {
    grass_iron: `${destName}案上摆着一件新奇器物。馆主要你先动手，工价还没有落。`,
    wind_sky: `帘后有风。器物在灯下发亮，六十金铢还没说死。`,
    mud_body: `靴底还停在${destName}。你的手按在膝上，不伸向那件东西。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `在帮馆主取出新奇器物前谈定六十金铢报酬。你没有先伸手。`,
    tense_watch: `你把呼吸压低，先把工价钉在六十金铢，再看她应不应。`,
    steady_breathe: `你先把气沉住。不预支就不动手。`,
  }[plan.pacing];
  const reaction = {
    dazed: `馆主看着器物，一时不提工钱，像要你先把东西取下来。`,
    answers: `馆主说：“六十金铢。先写条。”声音不高，却把价钉死了。`,
    silent_grip: `馆主按住案沿，指节稳定，像在确认你敢不敢把价说在动手前面。`,
  }[plan.companion];
  const closing = {
    hold_ground: `价先落，手后伸。六十金铢谈定以后，你才帮她取出器物。人还在${destName}。`,
    look_far: `你把视野放到条据上：工钱在前，取物在后。没有空口赊账。`,
    steady_breath: `你把呼吸重新对齐，先把六十金铢锁死，再碰那件器物。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function tearPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const companion = '凝羽';
  const sensory = {
    grass_iron: `${destName}这一侧，身契比香更硬。你把它拿到手里，纸边还烫着印。`,
    wind_sky: `帘后有风。身契在灯下发白，${companion}停在能看见撕口的位置。`,
    mud_body: `靴底还停在${destName}。五十金铢已经换手，契还没撕。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `取得那张身契并当面还她自由，再设法出城。你没有把撕契写成未发生。`,
    tense_watch: `你把呼吸压低，先确认契据已在自己手里，再当面撕开。`,
    steady_breathe: `你先把气沉住。撕契在前，改道在后。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}看着那张契，一时说不出完整的话，只把撕口对着灯。`,
    answers: `${companion}低声说：“撕了。门外有人在搜。”声音又硬又短。`,
    silent_grip: `${companion}扣住你的腕骨，不让你把契揣回去，只让你当面撕完。`,
  }[plan.companion];
  const closing = {
    hold_ground: `身契被当面撕开。她自由了。出城岔路已被搜查封住，你立刻改道。人还在${destName}。`,
    look_far: `你让${companion}停在身边，自己把视野放到门外：女侍卫在搜，南门不是这一拍的路。`,
    steady_breath: `你把呼吸重新对齐，先把契撕完，再躲开搜查。人仍在五原城里。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function walkPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = hallPlaceName(packet);
  const sensory = {
    grass_iron: `${destName}到大门这一截，香淡了，铁腥还在。女侍卫的步点贴着墙。`,
    wind_sky: `大门把风挤进来。死局在身后，五原城还在门外。`,
    mud_body: `靴底离开内院的石。门槛这一侧仍是五原城，不是南下的路。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `从白湖商馆的死局里脱身，走出五原商馆。人仍留在五原城里。`,
    tense_watch: `你把呼吸压低，先看清女侍卫搜查的方向，再改道迈出门。`,
    steady_breathe: `你先把气沉住。出馆是这一拍，出五原城不是。`,
  }[plan.pacing];
  const reaction = {
    dazed: `门外有人在搜。你一时分不清该直走还是改道，只先离开囚室这一截。`,
    answers: `你低声说：“出馆。人还留在城里。”没有人把这句话改成和解。`,
    silent_grip: `你按住门框，不回头，也不把步子迈成出城。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你迈出五原商馆。死局留在身后。人仍在五原城里，没有被抓回馆里。`,
    look_far: `你把视野放到街口：搜查还在，南门不是这一拍。脱身只到出馆。`,
    steady_breath: `你把呼吸重新对齐，先走出五原商馆。城里还站得住，城外的路还没有走。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function legionPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const companion = '月霜';
  const place = placeOf(packet);
  const sensory = {
    grass_iron: `${place}这一侧，帐外先传来标枪声。秦军方阵的前排被钉住，铁锈味隔着帐帘扑进来。`,
    wind_sky: `弩矢从帐外那一侧飞出去。罗马第十二军团的盾墙没有散，风把旗面拍得发硬。`,
    mud_body: `靴底还停在${place}。帐外泥里全是被踩乱的脚印，短兵相接的声音贴着地皮传来。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有冲出${place}。在秦军与罗马军的交战中求生并观察战局。`,
    tense_watch: `你把呼吸压低，从帐口盯住右刺那一侧，不让${companion}迈过帐门。`,
    steady_breathe: `你先把气沉住，和${companion}停在还能看见溃势、却还在${place}的位置。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}咬着牙，一时说不出完整的判断，只按住你要往帐外迈的那只肩。`,
    answers: `${companion}低声说：“标枪过了。右刺来了——看清，别冲出去。”声音又硬又短。`,
    silent_grip: `${companion}扣住你的腕骨，力道大，不让你离开${place}冲进已经乱掉的前排。`,
  }[plan.companion];
  const closing = {
    hold_ground: `秦军方阵被右刺撕开，人开始溃散。你和${companion}仍在${place}看着这一局落下。`,
    look_far: `你让${companion}停在身边，自己把视野放到帐外溃散处：盾墙还在推进，秦军已经守不住。`,
    steady_breath: `你把呼吸重新对齐，先求生，把秦军溃散看成已经发生的战局。人还在${place}。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function mandatePreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const destName = '帅帐';
  const sensory = {
    grass_iron: `${destName}里灯火压得很低。案上那只未拆的锦囊还在，帐外喊杀被油灯隔开一层。`,
    wind_sky: `帐帘落下。你看清王哲肩甲未卸，锦囊单独收在案上。`,
    mud_body: `靴底的泥停在门槛外。帐里是热的，锦囊就在手能够到、却还没落到你手里的位置。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有先问战局。王哲还有事要当面交代，先听他把话说完。`,
    tense_watch: `你把呼吸压低，先看清锦囊和人对面的距离，再开口。`,
    steady_breathe: `你先把气沉住，听他把托付说完。`,
  }[plan.pacing];
  const reaction = {
    dazed: `王哲看着你，目光沉，一时没有把三件事一次说完。`,
    answers: `王哲说：“锦囊先留在案上，别拆。太泉的事，修为够了再去。月霜，你护住。”声音不高，却把顺序钉死了。`,
    silent_grip: `王哲按住案上那只未拆的锦囊，指节稳定，像在确认一件他还不肯交手的事。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你在${destName}里站稳，把锦囊、太泉祭祀和守护月霜这三件事听完。锦囊仍在案上。`,
    look_far: `你让他把话说完，自己把视野放到帐帘外：杀声还在，托付说完了，锦囊还没交手。`,
    steady_breath: `你把呼吸重新对齐，先把这番当面交代接住。锦囊仍待后一步接物。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function frostPreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const companion = '月霜';
  const place = placeOf(packet);
  const sensory = {
    grass_iron: `${companion}的寒气贴着伤处往外冒。铁锈味还在，可这一侧已经冷过了血。`,
    wind_sky: `风一过，${companion}唇边结了一层白。天光还在，她却像被抽空了热。`,
    mud_body: `你按住${companion}的肩。掌心碰到的不是泥，是一层往骨头里钻的冷。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有退开。月霜身上的寒毒正在失控，先应对眼前危局。`,
    tense_watch: `你把呼吸压低，盯住${companion}指节发青的那一侧，不让她把丹药塞进嘴里的手停住。`,
    steady_breathe: `你先把气沉住。她已经掐开你的牙关，要把丹药强行灌下去。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}的目光已经散了，仍掐着你的下颌，把那粒丹药往你齿间塞。`,
    answers: `${companion}喘着说：“吞下去——寒毒压不住了。”随即掐开你的牙关，把丹药强行灌进嘴里。`,
    silent_grip: `${companion}扣住你的后颈，力道大得不像伤者，把丹药强行塞进你嘴里。`,
  }[plan.companion];
  const closing = {
    hold_ground: `丹药入喉，真阳被逼出来。你压住她，把热传入她体内，寒毒这才退下去。`,
    look_far: `真阳激发后你与${companion}贴身交合，把热送进她体内。${place}这一侧，寒气退了一寸。`,
    steady_breath: `你把呼吸重新对齐，在真阳驱使下与她发生关系，直到寒毒被压住。`,
  }[plan.closing];
  return [reaction, sensory, pacing, closing].filter(Boolean);
}

function arrivePreferred(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const dest = String(packet.receipts?.moveTo || packet.mustAppear?.location || '帅帐');
  const destName = /帅帐/.test(dest) ? '帅帐' : dest.replace(/[·,，]/g, '');
  const sensory = {
    grass_iron: `${destName}里灯火压得很低。帐外还能听见远处的喊杀，铁锈味却被油灯盖住一层。`,
    wind_sky: `帐帘一落，天光没了。你看清案上未干的墨和对面那人的肩甲。`,
    mud_body: `你把靴底的泥蹭在帐门槛外。掌心还凉，帐里的空气却是热的。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有先报功。在${destName}里把来历说清楚，先让对方诊治你的伤。`,
    tense_watch: `你把呼吸压低，先看清帐里几个人的位置，再开口。`,
    steady_breathe: `你先把气沉住，再把伤处露给王哲看。`,
  }[plan.pacing];
  const reaction = {
    dazed: `王哲看着你，目光沉，一时没有立刻下判语。`,
    answers: `王哲说：“先把伤给我看。来历一会儿再说。”声音不高，却把顺序钉死了。`,
    silent_grip: `王哲按住你的脉门，指节稳定，像在确认一件他还不肯说破的事。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你在${destName}里站稳，把来历和伤都交给眼前这个人诊治。`,
    look_far: `你让王哲先看伤，自己把视野放到帐帘外：杀声还在，这里已经能说话。`,
    steady_breath: `你把呼吸重新对齐，等他诊治这一身伤。`,
  }[plan.closing];
  const arrival = packet.receipts?.move
    ? `帐帘掀开。你跨过门槛，泥还留在帐外，${destName}里的灯火压得很低。`
    : `你已在${destName}里。帐帘落下，油灯把案面照出一圈。`;
  return [arrival, reaction, sensory, pacing, closing].filter(Boolean);
}

export function legacyPilotPreferredSentences(
  packet: LegacyNarratorPacket,
  plan: LegacyRenderPlan,
): string[] {
  const eventId = legacyPilotEventIdOf(packet);
  if (eventId === 'lcq.event.s01_02') return dangerPreferred(packet, plan);
  if (eventId === 'lcq.event.s01_03') return interactPreferred(packet, plan);
  if (eventId === 'lcq.event.s01_04') return progressPreferred(packet, plan);
  if (eventId === 'lcq.event.s01_05') return arrivePreferred(packet, plan);
  if (eventId === 'lcq.event.s01_06') return frostPreferred(packet, plan);
  if (eventId === 'lcq.event.s02_01') return mandatePreferred(packet, plan);
  if (eventId === 'lcq.event.s02_03') return legionPreferred(packet, plan);
  if (eventId === 'lcq.event.s02_02') return martyrPreferred(packet, plan);
  if (eventId === 'lcq.event.s02_04') return brandPreferred(packet, plan);
  if (eventId === 'lcq.event.s02_05') return ambushPreferred(packet, plan);
  if (eventId === 'lcq.event.s02_06') return hallPreferred(packet, plan);
  if (eventId === 'lcq.event.ningyu_enters_gamble') return gambleDebutPreferred(packet, plan);
  if (eventId === 'lcq.event.sudaji_south_pact') return southPactPreferred(packet, plan);
  if (eventId === 'lcq.event.gamble_bond_signed') return bondPreferred(packet, plan);
  if (eventId === 'lcq.event.charge_sudaji_fee') return feePreferred(packet, plan);
  if (eventId === 'lcq.event.free_ajiman') return tearPreferred(packet, plan);
  if (eventId === 'lcq.event.baihu_shangguan_escape') return walkPreferred(packet, plan);
  return openingPreferred(packet, plan);
}

function openingPool(packet: LegacyNarratorPacket): string[] {
  const names = presentNames(packet);
  const companions = names.length ? names : ['身边的人'];
  const location = packet.location || '这片草地';
  const place = placeOf(packet);
  const nearby = companions.join('、');
  const named = companions.flatMap((companion) => {
    if (companion !== '段强') return [`${companion}就在几步开外。`];
    return [
      `${companion}就在几步开外，肩背一起一伏，嘴唇发白，一时说不出完整的话。`,
      `“${companion}。”你低声叫了一声。他答应得晚半拍，声音发干，却毕竟应了。`,
      `${companion}朝你这边爬了一小步，手在空中抓了抓，像还想抓住并不存在的扶手。`,
      `${companion}忽然抓住一把草，像抓住最后一点能证明这不是虚空的东西。`,
      `${companion}的呼吸渐渐从乱变成急。你朝他点了下头，意思是先活过这一刻。`,
      `${companion}抬眼看你，喉咙动了动，终于挤出半句：“这……这不是飞机。”`,
      `${companion}还蹲在原处，手指死死抠着草根，像生怕一松手人就会重新掉回去。`,
    ];
  });
  return [
    ...named,
    `风从${place}上刮过来，铁锈、草汁和远处人喊马嘶混在一起。`,
    `你没有起身就跑。眼下第一件事仍是先稳住自己，辨认这一处落点，弄清身在何处。`,
    `你撑着湿草撑起上身。掌心下面仍是泥土和草根，凉，黏，带着刚被压过的草汁。`,
    `耳膜里还残留着刚才那一阵轰响，像整片天空从中间被撕开。`,
    `你先稳住呼吸，再慢慢把膝盖从泥里抽出来，让自己重新坐实。`,
    `指甲缝里是黑土，指节还在发抖。衣服被露水洇透，贴在小腿上发凉。`,
    `四周不是跑道，也不是舱壁。草浪一层层推开，远近都有旗帜和人影在晃。`,
    `天光白得刺眼。你抬手挡了挡，这才看清地平线处有烟，有尘，有一群人正在厮杀。`,
    `那些动静离你还不近，可风已经把血腥味送过来了。`,
    `脚底的土是软的，踩下去会陷。你试着把重心放稳，免得再摔回草里。`,
    `你把眼前能确定的事在心里过了一遍：人还在，地是草地，天还亮着，远处在打仗。`,
    `你用袖口擦掉嘴角的土，味道又腥又苦。`,
    `一只虫子从草叶上弹开。你跟着它的方向看过去，只看到更多的草。`,
    `你试着辨认太阳的位置，又辨认风的来处，好让自己不要转糊涂。`,
    `你让身边的人先喘气，自己则把视野放远：左面是开阔的坡，右面有旗帜在抖，再远处有金属碰撞的碎响。`,
    `你再看了看自己的落点。周围只剩被压倒的草和浅浅的泥窝。`,
    `你把手指插入土里，确认它会凉、会湿、会粘。这是实的。`,
    `有那么一瞬间你想问这是哪里。问题已经在嘴里，答案却不能靠空想。`,
    `你决定先把能看见的都看清楚：人、草、烟、旗、还有自己还能不能站稳。`,
    `风更大了些。草浪把你们小小的影子一下下盖住，又一下下掀开。`,
    `你把膝盖上的泥抹掉，重新蹲稳，让自己处在随时能起身、却还不盲目冲出去的位置。`,
    `远处的喊杀仍在继续。你只把这一圈看得更清楚：${place}还在脚下，${nearby}还在身边。`,
    `你把呼吸重新对齐，先弄清自己身在何处。`,
    `草叶刮过手腕，留下一道浅浅的凉意。你没有跟着远处的喊声走。`,
    `你再听了听自己的心跳，一下一下，沉，却还算齐。`,
    `你点了下头，没有急着回答。先把能看见的边界看完。`,
    `坡下有旗在抖。旗的颜色被烟尘搅浑，看不真切，可那是人在动，不是云。`,
    `你用手背抹掉睫毛上的土，视野这才干净一点。`,
    `泥土的味道很重。比机舱里那点循环空气要实得多。`,
    `你把一只手按在地上，另一只手虚扶着，让自己随时能撑起来。`,
    `你低声说：“先别动。看清楚再说话。”`,
    `你把目光收回来，重新量这片落点：前、后、左、右，都是草。`,
    `你撑着湿草撑起上身。四周仍是${location}。`,
  ];
}

function dangerPool(packet: LegacyNarratorPacket): string[] {
  const companion = '段强';
  const place = placeOf(packet);
  const death = packet.receipts?.casualty
    ? [
      `那一支钉进${companion}的脖子。他还想说什么，血先从领口涌了出来。`,
      `${companion}的手指在你袖口上收紧，又松开。气绝来得比骂声快。`,
      `你插了手，仗也没有因此停下。尸身、箭矢和踏平的草地都留在原地。`,
    ]
    : [
      `你把${companion}按进身侧，先确认人还在喘气。`,
      `第一支箭只钉在泥里。你不许自己把未见回执的伤亡写成终局。`,
    ];
  return [
    `${companion}就在开阔处，背对着弓弦拉满的方向。`,
    `草浪一路倒伏，像有什么在贴地推进。你听见蹄声和吼叫叠在一起。`,
    `佝偻的影子从灌木后立起来，兽面人身，短弓正在上弦。`,
    `你没有去辨认这是不是上海。眼下只剩保住自己和身边的人。`,
    `你拽${companion}的胳膊，让他离开那块没有遮拦的土。`,
    `箭羽擦过耳廓。风里全是铁锈和湿泥。`,
    `你把身体压低，用土沟挡住胸腹，再把${companion}拉到同一条线里。`,
    `远处旗帜还在抖，可这一侧已经不是旁观的位置。`,
    `你把掌心按进${place}的泥里，借力把人拖后半步。`,
    `短弓的弦声很近。你数得出上弦的次数。`,
    `你低声说：“趴下。别站着挨。”`,
    `你用肩挡住${companion}朝开阔处张望的那一下。`,
    `泥溅到牙上。你没有吐，只把气从鼻子里挤出去。`,
    `兽影贴着草根换位。你跟着换，不让自己成为第二块靶子。`,
    `你把${companion}的后领攥住，像攥住还能移动的重量。`,
    `喊杀声从左翼压过来。你只守这一小段能看见的土。`,
    `你把一只膝盖跪稳，另一只脚随时能蹬开。`,
    `血味更浓了。你分不清是远处的人还是脚边的泥。`,
    `你没有去捡箭。箭是别人的，命是自己的。`,
    `你让${companion}的头低于草尖，自己的也是。`,
    `风把草浪掀开又盖上。你只在掀开的那一瞬看弓。`,
    ...death,
    `你把这一息里能做的都做完：掩护、按住、换位、再呼吸。`,
    `战场没有因为你伸手而变宽。你只把身边的人从开阔处拖开。`,
  ];
}

function interactPool(packet: LegacyNarratorPacket): string[] {
  const names = presentNames(packet);
  const companion = names.find(name => name === '月霜') || names[0] || '月霜';
  const place = placeOf(packet);
  return [
    ...namedBeats(names, name => `${name}还在喘气，甲叶上的血已经凝成一条。`),
    `战场上有名受伤军士。你先判断该不该伸手相助。`,
    `${companion}的目光很硬，不像会把命交到陌生人手上的人。`,
    `你靠近时先摊开手，让对方看见你没有握刃。`,
    `伤在肋下。你没有乱按，只把人从积水的泥窝里托起来。`,
    `烟从${place}那头翻过来。你用身体挡住迎面的尘。`,
    `你问伤还能不能走。${companion}不答，只把牙咬得更紧。`,
    `伸手相助不是把人扛走那么简单。你先看清箭孔有没有还在冒。`,
    `你把外衣垫到${companion}背后，让伤处离开湿泥。`,
    `远处还有蹄声。你把呼吸压住，听是不是朝这边来。`,
    `你没有去翻对方的怀。眼下只处理眼前这口伤。`,
    `${companion}的手指在你腕上停了一停，力道大，随即松开。`,
    `你用布压住渗血的边，不让土再进去。`,
    `判断做完了：能扶，就扶；不能，就先把人挪出箭线。`,
    `你把${companion}的胳膊接到自己肩上，试了试重量。`,
    `风把血味送过来。你没有吐，只把步子迈小。`,
    `你低声说：“我扶你。追兵来了再跑。”`,
    `伤兵的呼吸乱，可还在。你按这个事实走。`,
    `你让${companion}靠着土坡，自己跪在能看见两边的位置。`,
    `你没有把这当成路遇闲人。伤、人、箭线，三件都要看。`,
    `你用袖口擦掉${companion}额上的土，视野这才干净一点。`,
    `你把能确定的事过了一遍：人还在，伤还在，你伸了手。`,
  ];
}

function progressPool(packet: LegacyNarratorPacket): string[] {
  const names = presentNames(packet);
  const fire = names.includes('卓云君') ? '卓云君' : '那名修士';
  const wounded = names.includes('月霜') ? '月霜' : '伤者';
  const place = placeOf(packet);
  return [
    ...namedBeats(names, name => `${name}就在火光能及的这一侧。`),
    `这一侧仍是${place}。有修士突然插手战场，火贴着兽阵燎过去。`,
    `${fire}的术火很近。热浪掀开草浪，也掀开你的后领。`,
    `你没有站着看热闹。先设法带着伤者脱险。`,
    `你把${wounded}的重量接到肩上，步子往火光内侧偏。`,
    `兽影在火里散开。你不追，只把人带离箭线。`,
    `修士的喝令很短。你听得懂的只有一句：离开这一线。`,
    `你用没受伤的那只手按住${wounded}的伤处，不让血在跑动里甩开。`,
    `旗帜在烟里抖。你认的不是旗，是还能走的路。`,
    `你把${wounded}转到${fire}身后那一小块已经空出来的土。`,
    `焦糊味压过血味。你用袖口挡住鼻，继续走。`,
    `你没有问这些人是哪一门。脱险在前，认门在后。`,
    `蹄声远了一点。你把步子放稳，不让${wounded}再摔回泥里。`,
    `火光把人脸照白。你看清${names.filter(name => name !== wounded).slice(0, 2).join('、') || fire}都还在场。`,
    `你低声对${wounded}说：“再撑这一段。出了箭线再说。”`,
    `你把膝盖上的泥蹭掉，不是为了干净，是为了还能跪、还能起。`,
    `修士们没有立刻围上来盘问。你利用这几息把人挪走。`,
    `你让${wounded}的头低于你的肩，自己去挡未熄的火星。`,
    `战场被切开一道。你走切开的这一侧，不走兽群退的那一侧。`,
    `你把能确定的事过了一遍：伤者在，修士在，路还没有封。`,
    `带着伤者脱险不是一句空话。你的肩已经开始发麻。`,
    `你没有把火光写成自己的本事。你只把人带出来。`,
  ];
}

function martyrPool(packet: LegacyNarratorPacket): string[] {
  const companion = '月霜';
  const place = placeOf(packet);
  return [
    `王哲就在帐外那一线。${companion}就在你身侧。人还在${place}。`,
    `左武军已与联军开战，先保住自己和月霜，跟上战局变化。`,
    `左武第一军团在罗马、马其顿、兽蛮联军围攻下伤亡殆尽。`,
    `天霁营的弩已经毁了。帅帐卫士在帐外杀马毁械。`,
    `你没有把这一段写成一招了断。先看清覆灭的前因。`,
    `王哲脱甲悬空。九阳依次点亮，没有旁人上去抢这一击。`,
    `九阳合一如日轮。白得发烫的光把帐帘照透。`,
    `帐外那一侧，联军骑手的轻蔑散了，换成来不及收住的惊。`,
    `毁灭性的光球坠地。战场化作焦土，热浪拍到${place}门槛上。`,
    `王哲以自身殉军。左武第一军团覆灭。`,
    `你拉住${companion}，停在帐口内侧，不迈过帐门去追那团光。`,
    `焰浪在帐外滚过去。你先保住自己和她。`,
    `你低声说：“看着。这一击是他的。”`,
    `你把能确定的事过了一遍：人是王哲，功是九阳，地是${place}，结果是焦土。`,
    `${companion}的目光很硬。她看的是日轮，不是逃路。`,
    `帐外那一侧已经没有完整的喝令。前因落完了，才把目光锁到王哲。`,
    `前线的覆灭是听见的，不是你从帐口改写的。`,
    `你没有冲出去改写成别人收束。最后一击仍是王哲的九阳。`,
    `日轮落下去以后，帐外只剩焦土和还没散尽的热。`,
    `你让${companion}的肩低于帐门，自己从帐口把这一局看完。`,
    `求生不是改写牺牲。王哲留下，你们还在${place}。`,
    `靴底仍在${place}。你往后偏半步，仍看着那枚日轮坠地。`,
  ];
}

function brandPool(packet: LegacyNarratorPacket): string[] {
  const dest = String(packet.receipts?.moveTo || packet.mustAppear?.location || packet.location || '五原城');
  const destName = isWuyuanCityLabel(dest) ? '五原城' : dest.replace(/[·,，]/g, '') || '五原城';
  const companion = presentNames(packet).find(name => name === '月霜');
  const named = companion
    ? [
      `${companion}被挡在人群外，够不着你这一侧。`,
      `你没有让${companion}挤进城门兵中间。眼下先应付盘问与拉扯。`,
    ]
    : [
      `身边没有能替你回话的人。盘问只对着你。`,
    ];
  const arrival = packet.receipts?.move
    ? [
      `城门洞一暗。你跨过门槛，泥还留在城外，${destName}里的嘈杂压过来。`,
      `靴底的凉停在城门槛这一侧。石板是热的。`,
    ]
    : [
      `你已在${destName}里。城门在身后，石板把靴底磕响。`,
    ];
  return [
    ...named,
    ...arrival,
    `五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯。`,
    `城门兵不问来历的细处，先问你从哪座庄子逃出来。`,
    `你说不清庄子的名字。这话一出口，拉扯就到了。`,
    `有人卡住你的后领，把你从人缝里拖到墙根。`,
    `殴打是短的。拳落到肋下，石板顶着膝盖。`,
    `炉子就在门洞内侧。烙铁抽出来时，焦糊味比马粪更先扑到脸上。`,
    `你没有去辨认拿烙铁的人叫什么。眼下只剩颈侧这一块皮。`,
    `烙铁按上来。痛是实的，奴隶印记也是实的。`,
    `印记落下以后，盘问停了一停。逃奴已经定了。`,
    `你没有伸手去揭。印记还烫着，揭不掉。`,
    `锁链碰到腕骨，凉，硬，带着刚出炉的铁腥。`,
    `你把能确定的事过了一遍：地是${destName}，人把你当逃奴，印记已经落下。`,
    `城门这一侧仍是${destName}。你没有被拖去别的城。`,
    `你低声说：“我不是逃奴。”没有人接这句话。`,
    `拉扯把你的肩甲扯歪。你没有还手，先挨过这一息。`,
    `热烙铁离开颈侧时，风从门洞灌进来，痛反而更清楚。`,
    `你跪在石板上，把气从牙缝里挤出去。`,
    `人群外有马嘶。你没有抬头去认旗。`,
    `印记在。名分在。${destName}还在脚下。`,
    `你把一只膝盖跪稳，另一只手按住刚烙过的那一侧，不让自己倒下去。`,
    `他们把你当货物点过一遍。点完，烙才算完。`,
    `你没有把这一段写成已经脱身。印记还烫着。`,
  ];
}

function ambushPool(packet: LegacyNarratorPacket): string[] {
  const destName = dungeonPlaceName(packet);
  return [
    `地牢里有人靠近你，先判断她要带你去哪。`,
    `${destName}这一侧仍是牢房。石壁在滴水。`,
    `她没有报名字。靠近的脚步比话更先到。`,
    `你问她要带你去哪。她只把下巴往牢门外抬了一下。`,
    `锁链松了一格。这不像越狱，像有人故意把你放出去。`,
    `你没有立刻迈过门槛。先看清门外有没有第二个人。`,
    `她说跟她走。你跟着，只走到石阶这一截。`,
    `牢门开了。风比里面热，也更脏。`,
    `石阶尽头有人截住。这是伏击，不是送你出城。`,
    `你没有把这一段写成已经脱身。伏击先落到肋下。`,
    `扑上来的人要按你的颈。你把肩顶回去。`,
    `反抗是短的。他的刀没有落到你脖子上。`,
    `他倒在地上，不再扑过来。你没有去翻他的怀。`,
    `你把能确定的事过了一遍：地是${destName}地牢，有人靠近，门外是伏击。`,
    `她停在台阶上，没有过来收刀。`,
    `你低声说：“这就是你要带我去的地方？”没有人接这句话。`,
    `印记还烫着。牢外的石板比牢里硬。`,
    `你把一只膝盖跪稳，另一只手按住刚挣开的那一侧。`,
    `第二个人没有立刻出现。你只守这一息已经落下的伏击。`,
    `你没有跟着她再往里走。眼下先判断去哪，不把后一截提前演完。`,
    `潮气从地牢门口灌回来。你还在${destName}这一侧。`,
    `刀落在石板上，响了一下。你没有去捡。`,
    `靠近你的人仍站在能看见你、也随时能退的位置。`,
    `你把呼吸重新对齐：牢开了，伏击到了，人倒了。`,
    `靴底仍在${destName}。你没有迈去别的馆。`,
  ];
}

function hallPool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  return [
    `在白湖商馆与馆主当面周旋，看清她究竟是谁。`,
    `${destName}这一侧灯火压得很低。案对面坐着馆主。`,
    `你没有先求放行。周旋在前，出门在后。`,
    `馆主的妆很端。端的下面另有一层。`,
    `你把能确定的事过了一遍：地是${destName}，人是馆主，要问的是霓龙丝。`,
    `霓龙丝三个字落在案上。你没有立刻答。`,
    `伪装被看穿时，她的笑收了一寸。`,
    `囚禁不是一句话。帘落下，出口被挡住。`,
    `你没有把囚禁改写成合作。交易还没有落。`,
    `她追问来路。你只把已经落到眼前的事实说完。`,
    `印记还烫着。馆里的香盖不住铁腥。`,
    `你低声说：“我不是来谈价钱的。”没有人接这句话当成交。`,
    `帘外有人走过，又停下。你仍在${destName}。`,
    `你把一只手按在膝上，另一只手空着，不伸向门。`,
    `馆主要的是情报。你先看清这一点。`,
    `你没有迈出门槛。这一息还在问，不在走。`,
    `灯火在杯沿上跳。你看见自己的手还在微微发颤。`,
    `她把问题重复了一遍。霓龙丝仍在桌上。`,
    `你把呼吸重新对齐：识破了，被囚了，问还在。`,
    `靴底仍在${destName}。你没有把后一截馆外的路提前走完。`,
    `案对面的人还坐着。你还跪着。`,
    `你没有去翻她的名。眼下只处理当面这一问。`,
    `香更浓了。你用这个事实走：人还在，问还在，门还关着。`,
    `你让她把顺序钉死：先问，后囚。出门不在这一息。`,
  ];
}

function gambleDebutPool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  const companion = '凝羽';
  return [
    `凝羽突然入局，当面看清她此刻的处境并回应。`,
    `${companion}被馆主差到${destName}这一侧。`,
    `你没有把她认成被卖之人。眼下只认奉命上场。`,
    `赌具已经摆上。她还站着，没有坐下。`,
    `你问她愿不愿意。她不答来历，只把差遣说完。`,
    `馆主没有离席。差遣是当面落下的。`,
    `你把能确定的事过了一遍：人是${companion}，地是${destName}，事是入局。`,
    `你当面应了一句。应的是处境，不是后头的输赢。`,
    `她的目光很硬。像在看这一桌，不是在看逃路。`,
    `你没有预写后来的经历。登场只到这一息。`,
    `印记还烫着。她看见了，没有问。`,
    `你低声说：“我看见你是被差进来的。”她点了下头。`,
    `帘外有人走过。你仍在${destName}。`,
    `你让${companion}停在能回话的位置，自己不把桌子掀了。`,
    `契还没有递过来。你不许自己把未落到手上的字写成已签。`,
    `她的甲叶轻响。你按这个事实走：人到了，局开了。`,
    `你没有去翻她的怀。眼下只处理当面这一拍。`,
    `馆主要她上场。你把这句话听完。`,
    `你把呼吸重新对齐：入局是真的，来历还不是这一拍的事。`,
    `靴底仍在${destName}。你没有把后一截赌局提前走完。`,
    `${companion}的手指在刀柄上停了一停，又松开。`,
    `你站在能被她看见、也能随时被馆主问的位置。`,
    `香和铁锈叠在一起。你只守这一息已经落下的登场。`,
    `你把这一拍交给当面回应，不把未发生的落败写成已得。`,
  ];
}

function southPactPool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  return [
    `面对馆主就霓龙丝一事的逼问，谈清眼下能换到的期限。`,
    `${destName}案上仍是那三个字。馆主等你开口。`,
    `你不当面硬拼。线索换三个月，活路先落在期限上。`,
    `三个月内前往南荒采集霓龙丝。这句话被钉死。`,
    `逾期是炮烙。你听见了，没有去接现在动手的那条。`,
    `你把能确定的事过了一遍：地是${destName}，问是霓龙丝，约是三个月。`,
    `馆主点了下头。那一下把南荒之约说死。`,
    `你低声应了一句。应的是期限，不是已经出门。`,
    `印记还烫着。约比烙更长，也更窄。`,
    `帘外没有放行。你仍在${destName}。`,
    `你把一只手按在膝上，不伸向门。`,
    `南下的由头是这一约。由头还在案上。`,
    `你没有把后一截采丝提前走完。`,
    `炮烙停在口头。这一拍没有落到皮肉上。`,
    `你让她把顺序钉死：先约，后走。走不在这一息。`,
    `香更浓了。你按这个事实走：约在，人在，门还关着。`,
    `你把呼吸重新对齐：三个月是真的，现在动手不是。`,
    `靴底仍在${destName}。你没有迈出馆门。`,
    `霓龙丝产地只点到能换期限的程度。`,
    `你没有去翻她的名。眼下只处理当面这一约。`,
    `灯火在杯沿上跳。你看见自己的手还在微微发颤。`,
    `约已经说死。你把这一拍交给期限，不把未发生的南荒路写成已走。`,
    `馆主把杯放下。那一下比任何安慰都短。`,
    `你站在能被看见、也能随时被再问的位置。`,
  ];
}

function bondPool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  const companion = '凝羽';
  return [
    `赌局局面骤变，面对眼前的刻香与契书做出回应。`,
    `${companion}还在${destName}这一侧。刻香比人更快。`,
    `香被催着往下烧。时限提前到头，此局已判你落败。`,
    `你没有把规则说成尚未结束。落败已经落下。`,
    `馆主没有离席。作弊是当面的。`,
    `案上是卖身契。你伸手。`,
    `你把能确定的事过了一遍：人是${companion}，地是${destName}，字是你签的。`,
    `被卖的是你。你没有把这张契推给她去签。`,
    `旁人没有代签。笔在你手里。`,
    `奴籍落到白湖商馆名下。此局没有作废。`,
    `你低声说：“我签。”${companion}没有拦。`,
    `印记还烫着。契比烙更长。`,
    `你让${companion}停在能看见签字的位置。`,
    `帘外有人走过。你仍在${destName}。`,
    `你没有掀桌子。眼下只处理眼前这张契。`,
    `香灰塌尽。时限已经没了。`,
    `你把呼吸重新对齐：落败是真的，签字是真的。`,
    `靴底仍在${destName}。你没有把后一截赎身提前走完。`,
    `${companion}的目光很硬。她看的是契，不是逃路。`,
    `你把一只手按在契上，另一只手空着。`,
    `馆主要的是这张字。你按这个事实走。`,
    `你没有去翻她的名。眼下只处理当面这一局。`,
    `灯火在墨上跳。你看见自己的手还在微微发颤。`,
    `你把这一拍交给签字，不把未发生的赢说成已得。`,
    `刻香的烟直着往上抽。时限被人为截短，这一局已经没有回头的规则。`,
    `你把笔按在契上。墨还没干，奴籍已经从这一笔开始算。`,
    `馆主坐在原处。作弊的手没有收回去。`,
    `${companion}没有替你签字。她只看着你把这一笔写完。`,
    `案上的契不长。字却把你卖进白湖商馆。`,
    `你没有去问她愿不愿意。这一拍要应的是你自己落败。`,
    `香油溅到腕骨上。热是短的，契是长的。`,
    `你把能看见的边界看完：桌还在，人还在，字已经落。`,
    `落败不是商量。刻香先到头，契后到手上。`,
    `你让自己跪稳，好把这一笔写清楚。`,
    `馆主的笑很浅。浅的下面是已经判完的局。`,
    `你没有把奴籍说成还能改。这一拍的字已经落进她的簿子。`,
    `灯把契上的空白照得很白。你把空白填上。`,
    `${companion}的甲叶轻响。她没有拔刀，只不让你把契推回去。`,
    `时限尽了。你按这个事实走：输了，签了，人还在${destName}。`,
    `墨在纸上渗开一圈。你没有停笔。`,
    `赌具还摊在原处。没有人宣布重开。`,
    `你把肩压低，让签字这一息先结束。`,
    `你把拇指按在契尾。那一按把奴籍按实。`,
    `馆主没有宣布可悔。这一局的字就是终局。`,
    `${companion}的呼吸很稳。稳的是看着你签完，不是替你签。`,
    `香尽以后，没有人把时限再拨回去。`,
  ];
}

function feePool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  return [
    `在帮苏妲己取出新奇器物前谈定六十金铢报酬。`,
    `${destName}案上摆着那件东西。工价还没有落。`,
    `你先开出六十金铢。不预支就不动手。`,
    `馆主应下这个数。条据写在动手前面。`,
    `你把能确定的事过了一遍：地是${destName}，价是六十金铢，手还没伸。`,
    `价先落，手后伸。没有空口赊账。`,
    `你低声说：“六十金铢。写下。”她点了下头。`,
    `器物在灯下发亮。你仍按在膝上。`,
    `条据落下以后，你才帮她取出。`,
    `工价不到手，你就不碰匣扣。`,
    `印记还烫着。工钱比烙更清楚。`,
    `帘外没有放行。你仍在${destName}。`,
    `你把一只手按在条据上，另一只手才碰器物。`,
    `南荒的路不在这一拍。眼下只锁工价。`,
    `你把呼吸重新对齐：六十金铢是真的，取物在后。`,
    `靴底仍在${destName}。你没有迈出门。`,
    `馆主把杯放下。那一下把价说死。`,
    `你没有去翻她的名。眼下只处理当面这六十金铢。`,
    `灯火在器物上跳。你看见自己的手还在微微发颤。`,
    `你站在能被看见、也能随时被再问的位置。`,
    `香更浓了。你按这个事实走：价在，物在，门还关着。`,
    `你让她把顺序钉死：先价，后取。`,
    `工钱落到条上。你才动手。`,
    `你把这一拍交给定价，不把未发生的南荒路说成已走。`,
    `条据的墨还没干。你用这个事实走：价已落，手才可以动。`,
    `器物取下来时，你没有问它从哪来。眼下只锁六十金铢。`,
    `馆主把器物转了一圈。你仍等条据先落下。`,
    `你把膝盖跪稳，让自己处在能动手、却还不空手赊账的位置。`,
    `灯把六十金铢这几个字照得很清楚。你按这个数走。`,
    `你没有去估那件东西值多少。工价已经说死。`,
    `门外有人停了一停。你仍在${destName}，价还在条上。`,
    `六十金铢写在条上以前，你的手不碰那件器物。`,
    `馆主把条据推过来。你先看数，再看物。`,
    `工钱是预支。预支不到手，取出就不发生。`,
    `你把条上的数读出声。六十金铢，一个字都不让少。`,
    `器物还在她那一侧。价不过来，物不过来。`,
    `你没有把工钱说成事后再算。这一拍先锁数。`,
    `灯下能看见条据的折痕。折痕比客套更硬。`,
    `她点头的那一下把工价按死。你这才把器物从匣里取出来。`,
    `匣扣是冷的。冷也要等六十金铢先落。`,
    `你让顺序钉在条上：数、据、再取。`,
    `案对面的人还坐着。价还没有从口头落到纸上时，你也不起身。`,
    `匣盖掀开以前，条据必须先在你手边。`,
    `你把六十金铢这个数重复了一遍，直到她不再改口。`,
    `工钱的数写清楚了，你才碰那件发亮的器物。`,
  ];
}

function tearPool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  const companion = '凝羽';
  return [
    `取得那张身契并当面还她自由，再设法出城。`,
    `${companion}在${destName}这一侧看着你把契拿到手里。`,
    `五十金铢换手。契据离开卖方。`,
    `你当着她的面把身契撕开。撕口对着灯。`,
    `纸已经裂了。撕契这一下是当面落下的。`,
    `她自由了。你没有把她重新按回卖方手里。`,
    `你把能确定的事过了一遍：地是${destName}，物是身契，结果是撕毁。`,
    `${companion}低声说门外有搜查。你听见了。`,
    `出城岔路被女侍卫封住。你立刻改道。`,
    `你没有直闯南门。这一拍只躲开搜查。`,
    `印记还烫着。撕开的纸比烙更响。`,
    `你让${companion}停在能看见撕口的位置。`,
    `帘外步点很齐。你仍在${destName}。`,
    `你把碎纸放下。不揣回去。`,
    `你低声说：“撕了。改道。”她点了下头。`,
    `你把呼吸重新对齐：契没了，人还在城里。`,
    `靴底仍在${destName}。出城的路还没有走。`,
    `搜查还在门外。你不把这一截改成硬闯。`,
    `你没有去翻那张契上的名。眼下只处理当面这一撕。`,
    `灯火在纸边跳。你看见自己的手还在微微发颤。`,
    `你站在能被看见、也能随时改道的位置。`,
    `香淡了。铁腥还在。`,
    `你把这一拍交给撕契和改道，不把未发生的出城说成已走。`,
    `${companion}的目光很硬。她看的是撕口，不是逃路。`,
    `纸裂开的声音很短。短过门外那些齐整的步点。`,
    `你把撕开的两半分开按在案上。不让它们再对回去。`,
    `${companion}看见撕口，肩松了一寸。`,
    `五十金铢已经不在你手里。契也不再是有效的那一张。`,
    `门外女侍卫换了方向。你带着她立刻改道。`,
    `你没有去撞南门那一截。搜查封住的路你不走。`,
    `碎纸落在灯下。自由是当面的，出城还不是。`,
    `你把能确定的边界看完：契没了，人还在${destName}，门外在搜。`,
    `改道是这一拍的活路。硬闯不是。`,
    `她跟你侧过廊柱。搜查的人没有立刻转过来。`,
    `你让自己停在还能转身的位置，不把步子迈成出城。`,
    `灯把撕口照得很白。白的是裂开，不是放行。`,
    `你把碎纸从案上抹开，让她看清那张契已经作废。`,
    `廊外靴钉很密。你只带她换一条还能走的廊。`,
    `撕开的纸边还连着一丝。你把它再拉开。`,
    `${companion}把碎纸看清楚，这才跟你侧过身。`,
    `卖方那一侧没有再递第二张契。这一张已经废了。`,
    `你听见南门方向有人喝停。你带着她往相反的廊走。`,
    `改道不是逃出五原城。改道只是不撞上这一队搜查。`,
    `你把她的袖口从灯下拉开，免得撕口的白纸再被看见。`,
    `廊柱后面能停半息。你只停半息，再换一条廊。`,
    `身契作废以后，她不再被那张纸捆在原处。`,
  ];
}

function walkPool(packet: LegacyNarratorPacket): string[] {
  const destName = hallPlaceName(packet);
  return [
    `从白湖商馆的死局里脱身，走出五原商馆。`,
    `你从${destName}走到大门。囚室留在身后。`,
    `女侍卫还在搜查。你改道，不直闯。`,
    `你迈出五原商馆。人仍留在五原城里。`,
    `这一步只出馆，人还停在五原城里。`,
    `你没有被抓回馆里。死局留在门槛那一侧。`,
    `你把能确定的事过了一遍：出馆是真的，出城不是。`,
    `街口有风。搜查的步点还在。`,
    `你低声说：“出馆。城里还能站。”`,
    `你没有回头去和解。这一拍只走路。`,
    `印记还烫着。门外的石板比馆里硬。`,
    `靴底离开内院。五原城还在脚下。`,
    `你把呼吸重新对齐：脱身到出馆为止。`,
    `南门不是这一拍。你不把路提前走完。`,
    `你站在能改道、也能随时停住的位置。`,
    `香淡了。铁腥被风冲开一截。`,
    `你没有迈成出城的步子。城里还站得住。`,
    `搜查换了方向。你跟着换，不硬闯。`,
    `大门在身后合上一寸。你没有退回去。`,
    `你把这一拍交给出馆，不把未发生的南荒路说成已走。`,
    `五原城还在。商馆死局不在你这一侧。`,
    `你用袖口擦掉额上的汗，视野这才干净一点。`,
    `你点了下头，没有急着跑出城。`,
    `风更大了些。你只把这一圈看得更清楚：人在城里，馆在身后。`,
    `门槛在身后。五原城的石板接住你的靴底。`,
    `你没有被馆里的人拖回去。死局停在门内。`,
    `女侍卫的灯从墙根扫过来。你贴着另一侧走。`,
    `出馆这一步已经落下。出城那一步还没有。`,
    `街面比内院宽。宽也不等于南门已过。`,
    `你把能确定的边界看完：馆在身后，人在城里，搜查还在。`,
    `风从巷口灌进来。你只走到巷口这一截。`,
    `脱身是出馆。馆门合上以后，你还站在五原城里。`,
    `你没有去喊和解。话在这一拍里用不上。`,
    `石板上有昨夜的水渍。你踩过去，不回头。`,
    `女侍卫的步点远了一寸。你用这一寸把人带出馆门。`,
    `五原商馆的灯被门框切掉一半。另一半已经照不到你。`,
    `巷口的人声比馆里杂。杂也不把你送出五原城。`,
    `你把肩上的香气抖掉，只留下城里这一口风。`,
    `你侧过门槛的那一瞬，馆里的香被门外的风切断。`,
    `五原城的街石比内院粗。粗的是城，不是城外的路。`,
    `搜查的灯在背后晃。你不回头去对那道光。`,
    `你把步子放短，只走到还能看见商馆门楣的位置。`,
    `门楣上的字还在。你已经不在那两个字下面。`,
    `你让风从领口灌进来，确认自己这一侧是街，不是囚室。`,
    `巷里有人低声问价。你不接话，只把人带过这一截。`,
    `脱身落下的标志是门槛。门槛过后，人还在五原城。`,
    `你没有把和解说出口。走出五原商馆这一步已经够用。`,
    `城门的方向还能看见灯。你不朝那盏灯走。`,
  ];
}

function legionPool(packet: LegacyNarratorPacket): string[] {
  const companion = '月霜';
  const place = placeOf(packet);
  return [
    `${companion}就在你身侧，甲叶上全是尘。人还在${place}。`,
    `在秦军与罗马军的交战中求生并观察战局。`,
    `帐外天武营的弩还在放。对面是罗马第十二军团的盾。`,
    `标枪砸进方阵。前排的人还没来得及换矛。`,
    `你没有冲出${place}去改写这一局。眼下只求生，并从这里看清溃在何处。`,
    `右刺从盾墙内侧递出来。秦军的阵脚先乱了半步。`,
    `你和${companion}停在${place}，帐口还能看见全阵。`,
    `短兵相接的声音隔着帐帘传来。你把呼吸压住，数得出盾牌碰撞的次数。`,
    `秦军方阵被撕开一道。人开始往两侧溃散。`,
    `你低声说：“别冲出去。看他们怎么散。”`,
    `风把旗面拍硬。罗马的步点没有乱，秦军的步点乱了。`,
    `尘从帐外翻进来。你用身体挡住，让${companion}先把伤处离开帐口。`,
    `求生不是逃走改写战局。你还在${place}，秦军已经溃了。`,
    `你把能确定的事过了一遍：人是${companion}，地是${place}，对面是罗马，结果是溃散。`,
    `${companion}的目光很硬。她看的是阵，不是逃路。`,
    `标枪的第二轮比第一轮更齐。你把膝盖在门槛内侧跪稳。`,
    `方阵的后排开始往后踏。这不是整顿，是溃。`,
    `你没有迈过帐门。矛是别人的，命是自己的。`,
    `远处喊杀换了调。你只守${place}这一小段能看见的边界。`,
    `你让${companion}停在肩侧，自己从帐口去看右刺还在不在推进。`,
    `秦军溃散已经落下来。你把这一息看完，不把未发生的胜写成已得。`,
    `靴底仍在${place}。你往后偏半步，仍看着阵面。`,
  ];
}

function mandatePool(packet: LegacyNarratorPacket): string[] {
  const destName = '帅帐';
  return [
    `王哲就在案对面，肩甲未卸。`,
    `王哲还有事要当面交代，先听他把话说完。`,
    `${destName}里灯火压得很低。锦囊单独收在案上，还没拆。`,
    `你没有先报功。托付不说完，帐外的仗也帮不上忙。`,
    `王哲指了指案上的锦囊，还没让你拿。那一下比任何安慰都短。`,
    `他说了三件事：锦囊先留在案上，修为够了去太泉祭祀，月霜要护住。`,
    `你把能确定的事过了一遍：人是王哲，地是${destName}，锦囊还在案上。`,
    `帐外喊杀仍在。帐里已经能把话说明白。`,
    `你没有伸手拿锦囊。他说过，先听完当面交代。`,
    `太泉的名字点到为止。你没有追问阵里有什么。`,
    `月霜不在这张案对面。托付里有她，人不在帐里。`,
    `你让他把顺序钉死：先听完，锦囊仍待后一步接物。`,
    `灯火在甲片上跳。你看见自己的手还在微微发颤。`,
    `你没有把帐外的仗再演一遍。这里要的是能听完的事实。`,
    `锦囊还在案上时，帐帘外有人走过，又停下。`,
    `你把肩甲的扣松开一格，方便他把话说清楚。`,
    `来历已经说过。这一息要的是托付，不是再讲一遍穿越。`,
    `王哲点了下头。那一下把三件事说死，锦囊仍未交手。`,
    `你站在能被看见、也能随时被问的位置。`,
    `你把这一息交给当面交代，不把未发生的战局写成已完。`,
    `靴底还凉。帐里的空气是热的。`,
    `你低声应了一句。应的是听完，不是已经办完。`,
  ];
}

function frostPool(packet: LegacyNarratorPacket): string[] {
  const companion = '月霜';
  const place = placeOf(packet);
  return [
    `${companion}就在你身侧，寒气从伤处一层层往外冒。`,
    `月霜身上的寒毒正在失控，先应对眼前危局。`,
    `${companion}掐开你的牙关，把丹药强行灌进你嘴里。`,
    `你想吐，她按住你的下颌。丹药已经过喉。`,
    `丹药入喉，一股热从胃里顶上来，真阳被逼得往外冲。`,
    `真阳激发后你压住${companion}，与她贴身交合，把热传入她体内。`,
    `这一次不是温存。寒毒要的是真阳，你只能把热送进去。`,
    `她的呼吸乱。你按这个事实走：人还在，毒还在，丹药已经下肚。`,
    `你低声说：“我在。先把寒压下去。”`,
    `寒气贴着你的小臂往上爬。你没有松手。`,
    `发生关系的那几息里，热把她肋下那口冷一点点顶开。`,
    `她咬着牙，目光凶得很，一时分不清这是救命还是把把柄交出来。`,
    `你没有去翻她的怀。眼下只处理眼前这口寒毒。`,
    `热和冷在她体内顶住。你把她按在${place}的土上，不让寒气再散开。`,
    `风从${place}上刮过来。这一侧已经不是战场的热，是骨头缝里的冷。`,
    `你让${companion}的头低于你的肩，自己去挡还在散的寒气。`,
    `真阳传入的那一瞬，她喉间溢出一声极短的喘。`,
    `你把能确定的事过了一遍：人是${companion}，毒是寒毒，丹药已经强行灌下。`,
    `她抓住你的衣襟，指节发白，像生怕一松手寒气就会把人吞回去。`,
    `你没有把这写成温存。强行灌药，真阳交合，把危局先压住。`,
    `寒气退了一寸。你没有停，直到她的牙关不再抖成一团。`,
    `你把膝盖跪稳，让两个人都还在${place}这一小块能看见的土上。`,
    `远处喊杀还在。你只守这一息：寒毒先下去，别的以后再说。`,
  ];
}

function arrivePool(packet: LegacyNarratorPacket): string[] {
  const dest = String(packet.receipts?.moveTo || packet.mustAppear?.location || '帅帐');
  const destName = /帅帐/.test(dest) ? '帅帐' : dest.replace(/[·,，]/g, '') || '帅帐';
  const names = presentNames(packet);
  const arrival = packet.receipts?.move
    ? [
      `帐帘掀开。你跨过门槛，泥还留在帐外，${destName}里灯火压得很低。`,
      `帐外喊杀仍在。帐里已经能把话说明白。`,
      `靴底的凉停在门槛这一侧，热空气从帐里漫出来。`,
    ]
    : [
      `你已在${destName}里。帐帘落下，油灯把案面照出一圈。`,
      `帐外喊杀仍在。帐里已经能把话说明白。`,
    ];
  return [
    ...namedBeats(names, name => `${name}就在案对面，肩甲未卸。`),
    ...arrival,
    `你在${destName}里把来历说清楚，先让对方诊治你的伤。`,
    `王哲没有立刻评对错。他先按你的脉。`,
    `你把伤处转向灯。布已经和血粘在一起。`,
    `帐里的空气是热的，靴底却还凉。`,
    `你说清自己不是这片战场上的人。细节点到能被诊治的程度为止。`,
    `王哲的手指稳定。你跟着那稳定把呼吸放慢。`,
    `案上有未拆的物事。你没有伸手。`,
    `你让他把顺序钉死：先伤，后来历。`,
    `灯火在甲片上跳。你看见自己的手还在微微发颤。`,
    `你没有把帐外的仗再演一遍。这里要的是能治的事实。`,
    `诊治开始时，帐帘外有人走过，又停下。`,
    `你把能确定的事过了一遍：人是王哲，地是${destName}，伤还在。`,
    `你把肩甲的扣松开一格，方便他看。`,
    `来历说完，嘴里发干。你没有去要水。`,
    `王哲点了下头。那一下比任何安慰都短。`,
    `你站在能被看见、也能随时被问的位置。`,
    `帐里没有草浪。你把目光放在灯和脉上。`,
    `你把这一息交给诊治，不把未发生的功法写成已得。`,
  ];
}

export function legacyPilotSafeSentencePool(packet: LegacyNarratorPacket): string[] {
  const eventId = legacyPilotEventIdOf(packet);
  if (eventId === 'lcq.event.s01_02') return dangerPool(packet);
  if (eventId === 'lcq.event.s01_03') return interactPool(packet);
  if (eventId === 'lcq.event.s01_04') return progressPool(packet);
  if (eventId === 'lcq.event.s01_05') return arrivePool(packet);
  if (eventId === 'lcq.event.s01_06') return frostPool(packet);
  if (eventId === 'lcq.event.s02_01') return mandatePool(packet);
  if (eventId === 'lcq.event.s02_03') return legionPool(packet);
  if (eventId === 'lcq.event.s02_02') return martyrPool(packet);
  if (eventId === 'lcq.event.s02_04') return brandPool(packet);
  if (eventId === 'lcq.event.s02_05') return ambushPool(packet);
  if (eventId === 'lcq.event.s02_06') return hallPool(packet);
  if (eventId === 'lcq.event.ningyu_enters_gamble') return gambleDebutPool(packet);
  if (eventId === 'lcq.event.sudaji_south_pact') return southPactPool(packet);
  if (eventId === 'lcq.event.gamble_bond_signed') return bondPool(packet);
  if (eventId === 'lcq.event.charge_sudaji_fee') return feePool(packet);
  if (eventId === 'lcq.event.free_ajiman') return tearPool(packet);
  if (eventId === 'lcq.event.baihu_shangguan_escape') return walkPool(packet);
  return openingPool(packet);
}

export function usesOpeningStockSentences(text: string): boolean {
  return OPENING_STOCK_RE.test(String(text || ''));
}
