import type { LegacyNarratorPacket } from './legacyNarratorPacket';
import type { LegacyRenderPlan } from './legacyRenderPlan';

export const LEGACY_NARRATIVE_PILOT_EVENT_IDS = [
  'lcq.event.s01_01',
  'lcq.event.s01_02',
  'lcq.event.s01_03',
  'lcq.event.s01_04',
  'lcq.event.s01_05',
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

export function acceptLegacyPilotScene(packet: LegacyNarratorPacket): boolean {
  const eventId = legacyPilotEventIdOf(packet);
  if (!isLegacyPilotEventId(eventId)) return false;
  const names = presentNames(packet);
  if (eventId === 'lcq.event.s01_01') return names.length === 1 && names[0] === '段强';
  if (eventId === 'lcq.event.s01_02') return names.includes('段强');
  if (eventId === 'lcq.event.s01_03') return names.includes('月霜');
  if (eventId === 'lcq.event.s01_04') return names.some(name => (S01_04_CAST as readonly string[]).includes(name));
  if (eventId === 'lcq.event.s01_05') {
    if (!names.includes('王哲')) return false;
    const atTent = /帅帐/.test(packet.location || '') || /帅帐/.test(packet.mustAppear?.location || '');
    const moving = packet.receipts?.move === true && /帅帐/.test(String(packet.receipts?.moveTo || ''));
    return atTent || moving;
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
  const companion = presentNames(packet)[0] || '段强';
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
  const names = presentNames(packet);
  const companion = names.find(name => name === '段强') || names[0] || '段强';
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
    ...namedBeats(names, name => `${name}就在开阔处，背对着弓弦拉满的方向。`),
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
  return openingPool(packet);
}

export function usesOpeningStockSentences(text: string): boolean {
  return OPENING_STOCK_RE.test(String(text || ''));
}
