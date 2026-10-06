import {applyStoryLevel} from './levelProgression';

import { canonicalEndingId, endingPresentation } from './endingPresentation';
import { runtimeEntityId, runtimeEntityName, migrateRuntimePersonRecords } from './ledger/affinityIdentity';
import type { SaveData } from '@/types/game';
import type { ScenarioStepScene } from './schema';
import { advanceClock } from './travel/travelLedger';
import { visibleModuleText } from './modularTurn';
/** 剧情交接 2026-10-02：固定死亡正文；配图由 endingPresentation 提供。 */
const ENDING_TEXTS: Readonly<Record<string, string>> = {
  "lcq.ending.death.shanghou_relic": "指尖碰到那层凝固的灰尘时，你先听见了一声极轻的嗡鸣。\n那声音你太熟了。小区楼下的配电箱，地铁隧道里的变压器，夏夜空调外机旁的铁皮柜，都是这样低低的、不肯停歇的嗡嗡声。你在那个世界里从它们旁边走过一千次，从没多看一眼。它们的门上贴着同一个标记：黄底，黑边，一道红色的拐弯箭头。\n手臂上的汗毛先竖了起来，接着是头皮。空气里浮起一股焦甜的腥气，像雷雨落下之前的味道。你想把手缩回来，手指却不听使唤，像被一只看不见的铁钳攥住，五指反而越扣越紧。\n然后它进来了。\n起初不是疼，是一股蛮横的力量从指尖灌进来，顺着胳膊直撞胸口。全身的筋肉在同一瞬间抽紧，牙关咬得咯咯作响，你连一声都叫不出来。心口猛地一顿，又胡乱跳了几下，像一面被人乱擂的破鼓。丹田里那团真阳被惊醒了，生死根疯了一样翻涌，却不知该往哪里去。\n眼前白了一下。你闻到头发烧焦的味道，然后是皮肉。殇侯说过，以往的测试者一触之下便化作火球。那时你还在心里嘀咕：有这么厉害吗？现在你知道了，衣襟上已经蹿起了火苗。\n你忽然想起路边那些骨头。藤蔓底下一层压着一层，一直铺到土径尽头。一百六十七个。他们大概也是这样，被一句“天命之人”说动了心，伸出手去，以为前面就是荣华富贵。\n可你本来认得这个标记。你比他们中的任何一个都认得。\n隔着那片白光，你好像看见殇侯站了起来，又慢慢坐了回去。他捋了捋胡须，叹了口气，那声音很轻，像在惋惜一颗又被失手摔碎的夜明珠。\n最后一个念头竟有点好笑：苏妲己的冰蛊等了你三个月，到底没能等到。\n雨还在下。\n等雨停了，那条红土路边会多出一具焦黑的骨头。用不了几年，藤蔓就会把它盖住，空洞的眼窝里，也会长出青草。",
  // TODO：剧情策划正式正文批准后直接替换此占位，结构无需再改。
  "lcq.ending.death.baihu_beheading": "苏妲己认定连赌都不敢的人所说产地不可信，命凝羽一刀了结你，如刚处死的五个男奴；镜头停在桌上背包，楼下传来一声闷响。",
  "lcq.ending.death.ajiman_bond": "消息来得比你想象的快。祁老四记得买主的模样，凝羽这一次没有替你遮掩。黄昏时分，你被带进画楼，苏妲己斜倚在榻上，指间捏着那张身契。它完好无损，连一道撕痕都没有，是刚从你贴身的衣袋里搜出来的。\n“五十个金铢，买走妾身调教了一年多的舞姬。”她笑吟吟地把身契在灯下抖开，“你倒有眼光，可惜不懂规矩。商馆的奴才买下商馆的货，这货归谁，这奴才又归谁？”\n你张口想辩解，她却不等你说完，屈指一弹。\n起初只是一点凉，从小腹深处浮上来，像那盏冰镇酸梅汤还没化尽。下一刻，那点凉活了过来，开始游动。\n寒意顺着血脉往上爬，所过之处，皮肉一寸寸发紧。你低头看见手指泛起冰块般的光泽，想攥拳，指节却僵得发出细碎的脆响。呼出的气变成白雾，凝在眼前不肯散去。窗外还有夏日傍晚的蝉鸣，你却已经冷得听不真切。\n你忽然想起那张纸。你曾把它捏在手里，掂量过要不要撕掉。撕了，它只是一把碎屑。没撕，它就是一条铁链。你以为留着它是给自己留余地，此刻才明白，余地从来不在你手里。\n冷到了胸口。心跳变得又慢又重，每一下都像敲在冰面上。你跪倒在地，膝盖磕上青砖，竟觉不出疼。\n院外传来锁链拖地的声响。你拼尽力气扭过头，从门缝里看见阿姬曼被两名女侍卫押着走过，手腕和脚踝扣着乌沉沉的铁链，红褐色的长发垂在脸侧。她没有哭，也没有看你，碧蓝的眼睛空空的，像两口结了冰的井。\n“送往黑魔海。”苏妲己淡淡吩咐，声音里听不出半点波澜。\n你想喊她的名字，嘴唇却冻得张不开。她说过你像她哥哥。你连哥哥该做的一件事都没能做到。\n寒意漫进脑中，念头一点点变得透明、迟缓，像被封进冰里的虫子。眼前的灯火凝成一团模糊的光晕，然后慢慢熄灭。\n你最后听见的，是那张身契被折好、收进袖中的轻响。",
  "lcq.ending.death.paolao": "你以为自己算准了。\n霓龙丝的产地只有你一个人知道，至少她这样相信。只要这个秘密还锁在你脑子里，她就杀不得你。九十天太短，条件太苛，你把它推回去，她自然会让一步，生意场上向来如此。你甚至已经在心里打好了下一轮的腹稿：放宽期限，要几成股份，再添几个护卫。\n苏妲己听完，没有还价。她端起茶盏浅浅抿了一口，又轻轻放下，瓷底碰在案上，一声脆响。\n“公子说得不错，那地方只有你知道。”她嫣然一笑，“可一个不肯去的人，知道什么又有何用？妾身院里的牡丹池下，埋过不少知道秘密的人。”\n她转向凝羽，语气平常得像在吩咐添茶：“原说三个月不回便尝炮烙，既然他连三个月都不要，那便今日吧。”\n你脸上的笑还挂着，脑子却空了一拍。你张嘴想换第二套说辞、第三套，那些在会议室里屡试不爽的话，双赢、让利、长期合作。话到嘴边，你才发现对面坐的根本不是客户。\n铜柱抬进来时，你闻到了炭火和热油的气味，浓得让人作呕。热浪先一步扑到脸上，皮肤绷紧发痛。你还在算，现在答应还来得及吗？九十天，六十天，三十天都行。你喊出来了，声音尖得不像自己。\n苏妲己笑吟吟地看着你，像在看一个出价太晚的买家。“晚了。”\n凝羽拧住你的手臂，把你推向那团暗红的光。贴上去的那一瞬，先是一声轻响，然后是白。不是疼，是白，铺天盖地的白，把所有念头都烧穿了。等疼追上来，你已经叫不出声，只听见油脂在耳边嗤嗤沸腾，像有人在一遍遍拨着算盘。\n原来从一开始你就没有筹码。她要霓龙丝，可她从不缺一个奴才。你把命当成底牌押上了桌，她连看都没看一眼。\n火光渐渐退成远处的一点红。你想起那个世界里打过的无数通电话，签过的无数份合同。最后一份，是你亲手推了回去。\n热度慢慢离你而去。\n再也没有下一轮了。",
  "lcq.ending.death.wangzhe_blast": "天上先静了一瞬。\n你仰起头，看见那道天青色的身影悬在百丈高处，金冠碎成一蓬流星，黑发在风里散开。王哲的声音从极高的地方落下来，一个字，又一个字，临，兵，斗，者……每喝一声，他身上便多亮起一点光，像有人在天上一盏一盏地点灯。\n你知道你该走。他让你带着月霜往东南去，两刻之内离开，这句话还在耳朵里。可你的腿钉在原地，像被什么按住了。也许是不信，一个人怎么能把自己点成一轮太阳。也许是那一声“拜托”太重，重得你挪不动步。\n四周的厮杀停了。罗马人的铜盔，唐军的陌刀，满地横陈的尸骨，全都仰着脸。你忽然觉得小腹那团暖意在疯长，生死根贪婪地吞着满场死气，真阳一股股往经脉里灌，胀得你耳膜嗡嗡作响。\n“行！”\n八点光聚成一团，在他胸腹间旋转、膨胀。你脸上的皮肤先感觉到了，像贴着一扇刚刚拉开的炉门。汗还没流下来就干了。你眯起眼，泪水涌出，又被烤得发涩。\n你想起背包里那只锦囊，火漆还没拆。想起六阳，想起太泉古阵西边那块赤红的石头，你一样都没去成。想起那个总想一剑捅穿你的丫头，师帅把她托付给你，你却连她此刻在哪儿都顾不上去想。\n你甚至荒唐地想到了加班，想到地铁里挤得喘不过气的早高峰。那时候你总觉得日子烂透了，现在才知道，那些烂日子有多好。\n“极！”\n光落下来了。\n没有声音。或者说声音太大，大到耳朵直接放弃了。你看见自己的手在光里变得透明，能看见骨头的影子，然后连影子也被抹去。热不再是热，是一种干净而彻底的白，从皮肤一直灌进骨髓，再从骨髓里把你整个人推出去。疼来不及到，恐惧也来不及到。\n你最后一个念头很轻：原来他说两刻，是真心想让你活下去。\n然后草原裂开，焦土连成一片方圆十里的黑。\n那片黑里，已经没有你了。",
  "lcq.ending.death.ghost_king_skull": "你听见自己说「好」。\n\n那两个字落地的时候，祭台上的年轻人只点了点头，像是验收一件迟交的供品。你本想再说点什么——嘲讽、讨价还价，哪怕问一句「老弟贵庚」——喉咙却被人从后面勒住。黑暗里涌出几名额生利角的武士，铁斧柄敲在你膝弯上，双刀当啷落地。\n\n你被拖进鬼王峒更深的一层。\n\n地牢没有假星河。这里只有潮气、苔藓，和墙上嵌着的一具具水晶。有的水晶里还封着人影，五官模糊，像隔着一层冬日的冰。你被推进一间空龛，那些水晶状的物质像活物一样涌过来，漫过脚踝、膝盖、胸口，最后停在下颌，只留出头脸——他说过，要留活的。\n\n不知过了多久。你数着太阳穴上那道伤痕的跳动，像数一盏快要灭的灯。丹田里的真阳推不出去，死气倒源源涌进来，把气轮撑得发烫。刀不在手里。血顺着晶壁往下流，一滴也够不着外面的世界。\n\n脚步声停在龛前。\n\n鬼巫王来了。他身上仍披着那件黑色斗篷，苍白得像从未见过太阳，双眸深邃而黝黑，如同望不到底的深潭。他的手指在水晶上一划，晶壁像水一样分开。他凝视着你额角的伤痕，那道伤痕在他目光下又霍霍跳起来。\n\n「天命者，」他平淡地说，「我给你过一次机会：加入我，或者成为我的敌人。你选了前者。现在，我要切开你的头颅，寻找天命的指引。」\n\n鬼羽剑的剑尖凉凉地抵上你的额角。\n\n你忽然很想知道银镜里的人现在怎样。谢艺、武二郎、凝羽、苏荔——他们离你那么近，近得只隔着几层石头，可谁也不知道该往这边看。你一张嘴，发不出声音。\n\n你想起那个世界很久没见过的星星。最后看见的这一片，在更上面的大厅里，是假的；这里连假的都没有。\n\n剑尖往里送了一分。\n\n那道伤痕跳了最后一下，停了。\n\n后来的事，你已经看不见了。\n\n鬼巫王在那颗头颅里什么也没有找到。当夜，一个刀锋般的黑影在空龛前站了很久，只说了两个字：「可惜。」\n\n两天之后，苍龙星阵在祭坛上亮起，龙神睁开眼睛，一口吞下了召唤它的人。南荒从此落进一只看不见的手里。银镜里那十几个人后来有没有走出鬼王峒，没有人说得清。只有满穹的假星星，还亮着，照着一间再也没有人的空龛。",
  "lcq.ending.death.dragon_well": "井口守不住了。你抓起乐明珠的手，往洞窟深处那道裂缝跑。身后是尸鬼的嘶叫，脚下的地面在一下一下地发颤，像有什么东西在大地深处翻身。\n\n你算准了退路，偏偏算漏了背上的伤。跨过石缝那一步，伤口整个撕开，腿一软，你们俩一起滚下了碎石坡。你只来得及翻过身，把她护在胸前，背脊朝下砸在岩石上。\n\n身体里有什么东西断了，一根，又一根。\n\n“大笨瓜！你起来呀！”\n\n你起不来。头顶的岩壁裂开一道缝，缝里透出一只山丘般的眼睛。一点寒星亮在它眼前，然后是两点，四点……星芒一颗接一颗爬满它的瞳孔。巨大的眼珠翻开，映出一个人影：衣衫褴褛，满脸血污，唇角还挂着那点改不掉的坏笑。像极了从前那个挤在地铁里、为一滴蜜糖拼命的小职员。\n\n龙首开始抬起，成吨的玄武岩像饼干一样碎裂。你用尽最后的力气，把乐明珠推进龙角下那道缝隙：“抓紧！别松手！”\n\n她哭着伸手来拉你。你没有去握。\n\n岩石如雨落下。龙神昂身而起，带走了最后一线光。鬼巫王说过，鬼王峒的祖先来自大地深处。你最后也留在了那里。黑暗压下来，又沉又暖，像加完班倒头就睡的那张床。\n\n上面的洞窟里，龙神一口吞下了鬼巫王，那句“黑魔海”的咒骂被嚼碎在齿间。凝羽拉住每一个逃出来的人问：“见到他们了吗？”没有人回答她。\n\n龙首冲出山体，暴雨倾盆。满山逃出来的南荒人跪在泥水里，等着有人站在龙首上，喊一声“拿起你们的武器”。龙角下只有一个哭哑了嗓子的少女。\n\n他们就那样一直跪着。\n\n后来乐明珠回了花苗，再没穿过那身新娘的衣裳。每年雨季，她都独自走到鬼王峒塌掉的山口，坐上一整天。有人听见她对着山石说话，说的总是同一句：“大笨瓜，你骗人，你说过要带我出去的。”\n\n很多年后，南荒的部族照旧往鬼王峒送新娘，只是祭坛上换了一位不说话的神，替神传话的人，穿着黑衣。",
  "lcq.ending.fail.dragon_essence": "匕首卡在龙颅的骨缝里，再也推不动半分。\n气轮空了。你跪在湿透的龙鳞上，听着暴雨砸在龙角上的声音，也听着自己的心跳一下慢过一下。\n就在这时，那股力量来了。它从刀柄灌进手臂，阴冷，蛮横，一往无前。枯竭的丹田猛然一震，气轮疯了一样转起来。你知道这不是你的力气，可你还是吼着把匕首压了下去。\n龙颅掀开，血珠凝成的星图在你眼前轰然碎裂。龙神哀鸣一声，翻滚着从空中坠落。\n那股力量却没有停。\n它顺着匕首倒流回来，带着碧青的光，带着龙脑里凝了十几年的东西。太阳穴上的伤痕先尝到了味道，像一头饿了太久的鲸，张口就吞。生死根把一条龙的死，整个吸进了你的身体。\n丹田深处多了一团冰冷的东西，正慢慢睁开眼睛。\n“天命者，”一个声音在你颅骨里轻轻说道，“现在，我们可以好好谈谈了。”\n你听出了那是谁的声音。\n龙神伏在碧潭边，再也没有动。乐明珠扑过来，又哭又笑：“你杀了龙神！”她伸手想摸你的眉毛，指尖却停在半空。她看着你的眼睛，往后缩了一下。\n黄昏时，那个黑衣女子站在剖开的龙颅旁，探手进去，摸了个空。她回头看你，目光像在清点一只已经装好货的箱子。“龙精我会来取。”说完，她便没入了密林。\n谢艺躺在山石上，胸口焦黑。他看了你很久，那句“你杀了龙神，很好”，终究没有说出口。小紫站在远处的岩石下，第一次没有笑。\n你站在龙首上，望着脚下那片阳光普照的南荒。你想像从前那样放声大喊“能活着真好”。张开嘴，说出来的却是：\n“他们需要秩序。”\n那声音很平静，也很耳熟。\n你还活着，还会一直活下去。南荒很快就会知道，鬼王峒有了新的主人。\n只是那个从地铁和加班里走出来的程宗扬，永远留在了龙颅里。",
};

// 战斗正式接入时消费此表；此处只录数据，不由LLM写tier触发，也不重复判slay_dragon/s06_02。
export const BATTLE_LOSS_ENDINGS = ([
  {
    "endingId": "lcq.ending.death.ghost_king_skull",
    "title": "天命的指引",
    "kind": "death",
    "sourceEventId": "lcq.event.s05b_05b_ideology_duel_and_defeat",
    "tierFlag": "lcq.encounter.f10.tier",
    "tier": "rout",
    "facts": [
      "程宗扬被封回龛窟，血没能沾上骨虎",
      "鬼巫王剖开天命者的头颅",
      "银镜中的同伴未能找到他",
      "龙神照常吞下鬼巫王"
    ]
  },
  {
    "endingId": "lcq.ending.death.dragon_well",
    "title": "龙首无人",
    "kind": "death",
    "sourceEventId": "lcq.event.ghost_king_swallowed",
    "tierFlag": "lcq.encounter.f13.tier",
    "tier": "lose",
    "facts": [
      "你带乐明珠逃往洞窟裂缝时滚下碎石坡，背脊重伤",
      "乐明珠被推进龙角下的空隙",
      "程宗扬被埋在鬼王峒地底",
      "龙神吞下鬼巫王，龙首无人号令反击"
    ]
  },
  {
    "endingId": "lcq.ending.fail.dragon_essence",
    "title": "龙精入体",
    "kind": "failure",
    "sourceEventId": "lcq.event.slay_dragon",
    "tierFlag": "lcq.encounter.f14.tier",
    "tier": "lose",
    "facts": [
      "龙神死去",
      "龙精携鬼巫王残念进入程宗扬丹田",
      "程宗扬存活，原来的自我不再主宰身体",
      "本局结束，不可续玩"
    ]
  }
] as const).map(ending => ({ ...ending, presentation: endingPresentation(ending) }));

export function fixedEndingNarrative(ending: { endingId: string; sourceEventId: string } | undefined): string | undefined {
  if (!ending) return undefined;
  return ENDING_TEXTS[canonicalEndingId(ending)];
}

/** 关键动作已由引擎预结算；不让写手追加条件、选择或道具。 */
export function fixedBeatNarrative(eventId: string | undefined, actionId: string | undefined): string | undefined {
  return ({
    'lcq.event.s04_06::advance_declared_objective': '凝羽被麻古毒瘾折磨得难以安坐。她强撑着不肯出声，额上却沁出了冷汗。你向乐明珠求助，请她替凝羽解毒。乐明珠点头应下，取出针具，小心察看凝羽的状况；她对这种毒瘾还缺乏经验，你留在一旁照应。',
    'lcq.event.s04_05::respond_to_flash_flood': '山洪骤然涌下。易虎先把易彪送到安全处，随即转身救起那名年轻军士，将他也推离洪流。你看清了这先后两次救援，救起两人的都是易虎。',
    'lcq.event.s03b_yinzhu_xiongerpu::burn_yinzhu_victim': '祁远认出阴蛛，说它吸血、怕火，还可能产卵，必须烧尸。花苗人用蕉叶包住阿葭的遗体，阿夕抱着她痛哭，苏荔双眉紧锁。你认定是鬼王峒豢养的阴蛛。武二郎从林中回来，拎着被他拧断腿的阴蛛；腿上还有你留下的刀痕。他听清原委，把阴蛛踢给苏荔。你随众人在营地焚化阿葭的遗体。',
    'lcq.event.s03b_yinzhu_xiongerpu::pick_zhu88_as_guide': '你在熊耳铺找向导。秦桧与吴三桂分别上前，你没有选他们，而是请自称朱八八的老向导带路。送亲队的新娘仍戴着面纱，鬼王峒使者已先走；你与商队收拾行装，同送亲队继续前行。',
    'lcq.event.s02_02::witness_wang_zhe_nine_suns': '你抬头望向战场上空。王哲脱去甲胄，天青道袍在风中展开，他的身形离开地面，升上高空。金冠爆散，声音从天上传来，九阳随真言依次点亮，光芒逐渐汇成日轮。你眼前再也不是帐中的师帅，而是悬在战场上方、以自身撑起最后一击的人。日轮的光芒照在你脸上，你仰头看着他，四周的喊声被天上传来的真言压了下去。',
    'lcq.event.charge_sudaji_fee::name_sixty_zhu_before_help': '你没有立刻动手，先向苏妲己开出六十金铢工价。苏妲己就在面前，器物也还留在原处；你把价钱说清，等她当面答复。她看着你，尚未作答，你也没有抢先动手。',
    'lcq.event.charge_sudaji_fee::lock_fee_then_remove_device': '苏妲己当面应下六十金铢的报酬，将钱交到你手里。你收下报酬，才按说定的办法帮她取出那件新奇器物。苏妲己亲自接下器物，你收回手，这件事至此办完。',
    'lcq.event.baihu_shangguan_escape::walk_out_wuyuan_shangguan': '你走过白湖商馆的大门，来到五原城里的街上。囚室和内院已经在身后；下一步去向仍由你决定。',
    'lcq.event.wuerlang_joins::confirm_wuerlang_no_prior_promise': '眼前这名汉子是武二郎。你向他问清先前的条件：他当时只求解开镣铐，并未答应随队南行。同行的事还要另谈。',
    'lcq.event.wuerlang_joins::secure_wuerlang_southbound': '你同武二郎把报酬和南行的事谈清。武二郎当面答应加入南荒队伍，这一句话终于不再含糊。他留在队伍里，你也有了一个明确答应同行的人。',
    'lcq.event.sudaji_south_pact::offer_nylon_clue_for_term': '你向苏妲己提出，用霓龙丝的产地线索换取三个月行动期限。苏妲己听过条件，等你当面订约。',
    'lcq.event.sudaji_south_pact::seal_three_month_south_pact': '你当面与苏妲己订下南荒之约：三个月内前往南荒采集霓龙丝，逾期受炮烙。这份约定成为你南下的由头。',
    'lcq.event.free_ajiman::take_ajiman_bond_in_hand': '你用五十金铢从祁老四手里买下阿姬曼，接过她的身契。阿姬曼就在眼前；契纸仍拿在你手中，你尚未决定如何处置。',
    'lcq.event.free_ajiman::tear_bond_and_face_blockade': '你在阿姬曼面前展开身契，把它撕成两半。纸张裂开的声音落下，你将她的自由还给她。阿姬曼盯着你手里的两半契纸，神色却没有软下来。她生气地别开脸，没有道谢，也没有立刻相信这场赎身会改变她的处境。你们随后遇上商馆侍卫封住出城岔路，只得改道避开搜查。',
    'lcq.event.free_ajiman::pocket_ajiman_bond': '你把阿姬曼的身契收进怀里，决定出城后再说。阿姬曼看着你，没有答应跟你离开。',
    'lcq.event.shanghou_revealed::follow_yeao_to_shanghou': '你随叶媪进堂。主人打开裹着鲨皮的红木箱，里面的物件上有黄底黑边的三角和红色拐弯箭头。他说，先前一百六十七人触碰它后化为火球，埋骨路边；他要你也伸手一试。你尚未碰它。',
    'lcq.event.s05b_shanghou_reads_letter::hand_blank_letter_to_shanghou': '你喝下殇侯用一斤三两精盐兑成的盐水，玄冰掌随即落下。你吐出裹着蛊虫的冰块，冰蛊终于被解除。喘息稍定，你把黑鸦使者的白纸信交给殇侯，等他辨认。',
    'lcq.event.shanghou_revealed::confirm_zhu_is_shanghou': '主人终于现出熟悉的面孔。你认出他就是一路同行的朱老头，也当面听清了殇侯与天命之人的说法。',
    'lcq.event.shanghou_revealed::refuse_shanghou_relic_test': '你把手缩了回来：这是高压危险的警示标记，你不碰。堂中主人的目光沉了下来。',
    'lcq.event.ningyu_enters_gamble::answer_ningyu_on_debut': '你当面回应凝羽，接下苏妲己提出的赌局。凝羽奉命上场，赌局就此开始。',
  } as Record<string, string>)[`${eventId}::${actionId}`];
}

/** 结局承接只保留1–2个完整句；长句/格式异常直接舍弃，固定结局始终可发布。 */
export function endingBridge(raw: string, endingId?: string): string {
  if (endingId === 'lcq.ending.death.ghost_king_skull') return '你听见自己说「好」。武士的铁斧柄随即敲在你膝弯上。';
  if (endingId === 'lcq.ending.death.dragon_well') return '你抓起乐明珠的手，转身往洞窟深处的裂缝跑去。';
  if (endingId === 'lcq.ending.fail.dragon_essence') return '你双手握紧匕首，再一次朝龙颅的裂缝压了下去。';
  if (endingId === 'lcq.ending.death.shanghou_relic') return '你伸出手，指尖朝那块黄底黑边的三角落了下去。';
  if (endingId === 'lcq.ending.death.wangzhe_blast') return '你仍留在战场上，天光刺得你难以睁眼。';
  try {
    let text = visibleModuleText(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (text.startsWith('{')) text = String(JSON.parse(text).text || '');
    const sentences = text.match(/[^。！？!?]+[。！？!?][”’」』"]?/g) || [];
    const kept: string[] = [];
    for (const sentence of sentences.slice(0, 2)) {
      if (kept.join('').length + sentence.trim().length > 220) break;
      kept.push(sentence.trim());
    }
    return kept.join('');
  } catch { return ''; }
}


export interface SceneLedger {
  receipts: string[]; actors: Record<string, { status: 'dead' | 'missing' | 'departed' | 'present'; eventId: string; actionId: string; name?: string; characterId?: string }>;
  injuries: Record<string, string>; names: Record<string, string>; worldFacts: string[];
  groupInjuries?: Record<string, { label: string; text: string }>;
  lastBeat?: { eventId: string; actionId: string; facts: string[] };
}
export function stepScene(runtime: any, eventId?: string, actionId?: string): ScenarioStepScene | undefined {
  const event = runtime?.events?.find((e: any) => e.id === eventId);
  const actions = event?.playerCompletionContract?.actions || [];
  const prepared = runtime?.eventActionStates?.[eventId || '']?.preparations || [];
  return actionId ? actions.find((a: any) => a.id === actionId) : actions.find((a: any) => (a.requiresPreparation || []).every((p: string) => prepared.includes(p)) && !(a.kind === 'prepare' && prepared.includes(a.grantsPreparation)));
}
export function sceneDayPart(time: any): string {
  const hour = Number(time?.小时) || 0;
  return hour < 5 ? '深夜' : hour < 8 ? '清晨' : hour < 12 ? '上午' : hour < 17 ? '白天' : hour < 20 ? '黄昏' : '夜';
}
export function isNanhuangSceneStage(id?: string): boolean { return /^lcq\.stage_0(?:3b|4|4b)/.test(id || ''); }

/** 只由成功的本地步骤调用；同一步重复回执不重复改生死、物品或时间。 */
export function applyStepSceneLedger(save: SaveData, runtime: any, eventId: string, actionId: string): void {
  const scene = stepScene(runtime, eventId, actionId);
  if (!scene || !isNanhuangSceneStage(runtime.modId)) return;
  const ledger: SceneLedger = runtime.sceneLedger ||= { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [] };
  const receipt = `${eventId}::${actionId}`;
  if (ledger.receipts.includes(receipt)) return;
  ledger.receipts.push(receipt);
  for (const person of scene.cast?.exit || []) {
    const id=runtimeEntityId(runtime,person.name);
    ledger.actors[id] = { name:person.name, characterId:id, status: person.status, eventId, actionId };
    runtime.departedCast = person.status === 'dead'
      ? [...new Set([...(runtime.departedCast || []), id])]
      : (runtime.departedCast || []).filter((name: string) => name !== id);
  }
  for (const name of scene.ledgerEffects?.returnActors || []) {
    const id=runtimeEntityId(runtime,name);
    ledger.actors[id] = { name, characterId:id, status: 'present', eventId, actionId };
    runtime.departedCast = (runtime.departedCast || []).filter((n: string) => n !== id);
  }
  for(const [name,value] of Object.entries(scene.ledgerEffects?.names||{}))ledger.names[runtimeEntityId(runtime,name)]=value;
  for(const [name,value] of Object.entries(scene.ledgerEffects?.injuries||{}))ledger.injuries[runtimeEntityId(runtime,name)]=value;
  migrateRuntimePersonRecords(runtime);
  ledger.worldFacts = [...new Set([...ledger.worldFacts, ...(scene.ledgerEffects?.worldFacts || [])])];
  if (scene.ledgerEffects?.level) applyStoryLevel(save, scene.ledgerEffects.level.to);
  if (scene.ledgerEffects?.jiuyang) {
    const realm = (save as any).角色.属性.境界;
    // 九阳层次没有通用等级换算记录；保留现有高手榜等级，只记原著已有层次。
    if (realm && typeof realm === 'object') realm.九阳层次 = scene.ledgerEffects.jiuyang;
  }
  ledger.lastBeat = { eventId, actionId, facts: scene.fixedFacts?.length ? [...scene.fixedFacts] : [scene.fallbackText || scene.previousBeat || '本步已经落账。'] };
  if (scene.dayPart && (save as any).元数据?.时间) {
    const hours: Record<string, number> = { 清晨: 6, 上午: 9, 白天: 12, 黄昏: 18, 傍晚: 18, 夜: 21, 深夜: 0, 正午: 12 };
    const time = (save as any).元数据.时间;
    const target = hours[scene.dayPart] * 60;
    const current = (Number(time.小时) || 0) * 60 + (Number(time.分钟) || 0);
    const samePart = sceneDayPart(time) === scene.dayPart || (scene.dayPart === '正午' && Number(time.小时) === 12);
    if (!samePart) advanceClock(save, { minutes: (target - current + 1440) % 1440 }, receipt);
  }
}

/** 运行时事实摘要，缺字段的旧档按已有回执推导，不从模型文字反填。 */
export function sceneLedgerSummary(save: SaveData): Record<string, unknown> {
  const runtime = (save as any).世界?.状态?.剧本模组;
  const ledger: SceneLedger | undefined = runtime?.sceneLedger;
  const inventory = (save as any).角色?.背包;
  const done = new Set([...(runtime?.completedEventIds || []), ...(runtime?.travelLedger?.doneEventIds || [])]);
  const transformed = done.has('lcq.event.s04b_lingfei_baiyi_crisis_11') || done.has('lcq.event.s04b_xi_furen_trade_route');
  const yiHuState = transformed ? { status: 'transformed', detail: '被炼成血虎的怪物，不可当普通活人使用' }
    : done.has('lcq.event.s04_05') || /^lcq\.stage_0(?:4b|5b)/.test(runtime?.modId || '') ? { status: 'missing', detail: '山洪卷走后失踪' } : ledger?.actors?.易虎;
  return {
    日期: (save as any).元数据?.时间, 时段: sceneDayPart((save as any).元数据?.时间),
    主角: { 姓名: '程宗扬', 性别: '男', 身份: '白湖商馆南荒商队头领', 境界: (save as any).角色?.属性?.境界 },
    货币: inventory?.货币 || {}, 关键物品: Object.values(inventory?.物品 || {}).map((i: any) => ({ 名称: i.名称, 数量: i.数量 })),
    人物状态: { ...Object.fromEntries(Object.entries(ledger?.actors||{}).map(([id,value])=>[runtimeEntityName(runtime,id),value])), ...(yiHuState ? { 易虎: yiHuState } : {}) }, 伤病: Object.fromEntries(Object.entries(ledger?.injuries||{}).map(([id,value])=>[runtimeEntityName(runtime,id),value])),
    群体伤病: Object.values(ledger?.groupInjuries || {}),
    已故: [...new Set([runtimeEntityName(runtime,"lcq.character.duan_qiang"), runtimeEntityName(runtime,"lcq.character.wang_zhe"), ...Object.entries(ledger?.actors || {}).filter(([, v]) => v.status === 'dead').map(([id]) => runtimeEntityName(runtime,id))])],
    世界事实: [...(runtime?.completedEventIds?.includes('lcq.event.ghost_king_swallowed') ? [] : ['鬼王峒未平定，鬼巫王在世']), ...(ledger?.worldFacts || [])],
    上一拍要点: ledger?.lastBeat?.facts || runtime?.chronicle?.at(-1)?.summary || '',
  };
}
