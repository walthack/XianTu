#!/usr/bin/env node
/**
 * R2-11M：隔离关 `lyl.luoyang_coup` 来源重建 + 完成合同落账。
 *
 * 逐拍来源核对见 `docs/R2-11M-QUARANTINE-LUOYANG-COUP-SOURCE-MAP-2026-07-21.md`，
 * 全部结论出自 EPUB 原文第 66 集《两宫交兵》逐章比对，不依赖模型审计。
 *
 * 本脚本落六项裁定：
 *   A 轴来源重标（`s06_01b` 改绑源 280《凌辱》，轴节点侧由 fix-luoyang-coup-axis-binding.mjs 处理）
 *   B 顺序倒挂修正（凌辱/治丧先于矫诏）
 *   C 补源 286《赏格》缺拍，新增非关键事件 `s06_04b`
 *   D 与原文矛盾的 objective 重写
 *   E 轴拍串章修正（武库/围北宫属源 285，不属 284）
 *   F 八个事件落 `objective_action` 完成合同
 *
 * 合同一律用 `objective_action`：本关每一拍的结局都由脊柱固定（郭解式的生死翻转不在此关），
 * 没有任何原文依据支持一个属性阈值，硬造 `successWhen` 就是交接档禁止的「按事件名猜合同」。
 */

import { readFileSync, writeFileSync } from 'node:fs';

const stagePath = 'mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.luoyang_coup.json';
const contractPath = 'mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json';

const STEP_TEXT = {
  success: '你已完成当前结构化步骤；最终完成真值由本地引擎落账。',
  partial: '该动作不产生 partial；需要分歧时必须另建本地判定合同。',
  failure: '该动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
};

/**
 * 展示型多拍合同：铺垫步只积累 preparation，结算步才落 done。
 *
 * 标了 `final` 的步骤是**并列**的结算选择（同一拍的不同演法，正典结局相同），
 * 它们共享最后一个 preparation 前置，互不为前置；不标则默认最后一步结算。
 */
function sequence(steps) {
  const hasExplicitFinal = steps.some(step => step.final === true);
  const isFinal = (step, index) => (hasExplicitFinal ? step.final === true : index === steps.length - 1);
  const prepareKeyByIndex = new Map();
  let prepareCount = 0;
  for (const [index, step] of steps.entries()) {
    if (!isFinal(step, index)) {
      prepareCount += 1;
      prepareKeyByIndex.set(index, `sequence_step_${prepareCount}`);
    }
  }
  const lastPrepareKey = prepareCount ? `sequence_step_${prepareCount}` : null;

  return {
    kind: 'objective_action',
    settleOn: ['success'],
    actions: steps.map((step, index) => {
      const action = {
        id: step.id,
        label: step.label,
        actionText: step.actionText,
        timeCost: 1,
        outcomeText: { ...STEP_TEXT },
      };
      const prepareKey = prepareKeyByIndex.get(index);
      if (prepareKey) {
        action.kind = 'prepare';
        action.grantsPreparation = prepareKey;
        const previous = prepareKeyByIndex.get(index - 1);
        if (previous) action.requiresPreparation = [previous];
      } else if (lastPrepareKey) {
        action.requiresPreparation = [lastPrepareKey];
      }
      return action;
    }),
  };
}

/** 事件级改动。objective 全部按原文重写，见文档 §2.4。 */
const EVENT_PATCHES = {
  'lyl.event.s06_01b': {
    axisId: 'yunlong.280.1',
    axisAnchor: '六朝云龙吟·#280·凌辱',
    conditions: [{ path: 'flags.chapter.lyl.luoyang_coup.started', operator: 'eq', value: true }],
    objective: '在藻井上屏息藏住自己与赵合德，看完含光殿中发生的一切',
    playerCompletionContract: sequence([
      {
        id: 'stay_hidden_in_coffer',
        label: '按住赵合德，不让她发出声音',
        actionText: '我按住身边的赵合德，两人一起屏息伏在藻井的板壁上，不让下面的人察觉。',
      },
      {
        id: 'tell_her_she_lives',
        label: '告诉赵合德友通期并没有真死',
        actionText: '我把嘴凑到赵合德耳边，低声告诉她别害怕——友通期没有死。',
      },
    ]),
  },
  'lyl.event.s06_01': {
    conditions: [{ path: 'flags.event.s06_01b.done', operator: 'eq', value: true }],
    objective: '扮作内侍混出昭阳宫，护送赵飞燕与赵合德撤回长秋宫',
    playerCompletionContract: sequence([
      {
        id: 'hold_eunuch_disguise',
        label: '换上内侍衣物，等东阁的大臣散尽',
        actionText: '我趁群臣作鸟兽散、甲士随吕淑出宫的空档换上内侍衣物，扶着赵合德从藻井下来。',
      },
      {
        id: 'escort_empress_to_changqiu',
        label: '混进妃嫔队伍护送皇后回长秋宫',
        actionText: '我低着头混在妃嫔与内侍的队伍里，跟着期门武士把赵飞燕与赵合德护送进长秋宫。',
      },
    ]),
  },
  'lyl.event.s06_02': {
    objective: '从密道出宫，召齐各方定下拥立定陶王并分派任务',
    playerCompletionContract: sequence([
      {
        id: 'exit_through_secret_passage',
        label: '从皇后寝宫后的密道出宫',
        actionText: '我从长秋宫寝殿后小阁的密道下去，摸黑走到废宅的井口，再赶回通商里。',
      },
      {
        id: 'declare_dingtao_wang',
        label: '向众人交代宫变经过并定下拥立定陶王',
        actionText: '我把这一夜的所见所闻讲给众人，然后挑明：我们要拥立的是定陶王，不是清河王刘蒜。',
      },
      {
        id: 'assign_faction_tasks',
        label: '当场分派各方任务',
        actionText: '我逐个分派：严君平随我去见金蜜镝，郭解联络游侠，程郑以废除算缗令游说商贾，高智商去争取羽林军。',
      },
    ]),
  },
  'lyl.event.s06_03': {
    axisBeat: '刘建以中垒军并裹挟宗室家奴强攻崇德殿受阻，转而西取昭阳宫；分守四门的卫尉军开始向昭阳宫集中。',
    description: '刘建以中垒军并大批宗室家奴攻打崇德殿受阻，转攻昭阳宫；卫尉军自四门集中驰援。',
    objective: '潜回长秋宫布防，并请皇后下诏授金蜜镝掌宫禁',
    playerCompletionContract: sequence([
      {
        id: 'return_via_passage',
        label: '带人从密道潜回长秋宫',
        actionText: '我带着吴三桂等人从密道潜回长秋宫，只留两人守住井口，免得被人抄了后路。',
      },
      {
        id: 'request_empress_decree',
        label: '请皇后下诏授金蜜镝掌宫禁',
        actionText: '我请赵飞燕用皇后之宝下诏，授车骑将军金蜜镝掌管宫禁，我以大行令为副襄助。',
      },
      {
        id: 'seal_gates_and_free_eunuchs',
        label: '封死诸门并赶去玉堂前殿救人',
        actionText: '我与金蜜镝议定除东门外诸门全部封死，然后赶往玉堂前殿，救出被拘的徐璜、唐衡与左悺。',
      },
    ]),
  },
  'lyl.event.s06_04': {
    axisBeat: '虎贲军攻取武库，卫尉军弃守南宫退入北宫；蔡敬仲率内侍与期门武士据长秋宫三十六级台阶，连退中垒军三波进攻。',
    description: '虎贲军攻取武库，卫尉军退守北宫；蔡敬仲率内侍与期门武士据守长秋宫台阶，击退中垒军多次进攻。',
    objective: '守住长秋宫台阶，并看住刘建的性命不能在此时丢掉',
    playerCompletionContract: sequence([
      {
        id: 'hold_the_steps',
        label: '在阙楼上看住台阶防线',
        actionText: '我在阙楼上盯住那三十六级台阶，让敖润居高压制，看着蔡敬仲把内侍一批批推上去挡住中垒军。',
      },
      {
        id: 'spare_liu_jian',
        label: '按住敖润的铁弓，不许射杀刘建',
        actionText: '敖润瞄准了刘建，我抬手按住他的弓——刘建这会儿要是死了，吕氏就赢了。',
      },
    ]),
  },
  'lyl.event.s06_05': {
    // 接在补录的赏格之后：原文里正是长秋宫的赏格招来中垒军军司马叛投，刘建才在本拍发作。
    conditions: [{ path: 'flags.event.s06_04b.done', operator: 'eq', value: true }],
    objective: '在长秋宫应对剑玉姬的招揽，并拒绝她开出的条件',
    playerCompletionContract: sequence([
      {
        id: 'hear_north_palace_news',
        label: '听剑玉姬报出北宫的战况',
        actionText: '我听剑玉姬报出北宫的底细：射声军早已入永安宫，刘子骏中伏而死，刘箕不肯烧武库被诛。',
      },
      {
        id: 'hear_the_offer',
        label: '听完她开出的全部条件',
        actionText: '我听她把条件一层层加上来：舞都侯、废除算缗令、盐铁特许、蔡敬仲掌南北二宫，直到那个「天子之位」。',
      },
      {
        id: 'refuse_after_cai_speaks',
        label: '在蔡敬仲揭穿刘建劣迹后直接回绝',
        actionText: '蔡敬仲抖出刘建拿犬马与宫人配种的旧事，我借着这盆冷水把话说死，回绝了这桩交易。',
        final: true,
      },
      {
        id: 'refuse_by_mocking_liu_jian',
        label: '拿刘建的劣迹反讥，把话说绝',
        actionText: '我顺着蔡敬仲的话反问她们是不是也好这一口，把替刘建生儿子的算盘当面踩碎。',
        final: true,
      },
    ]),
  },
  'lyl.event.s06_06': {
    objective: '看住阿阁战局，别让吕氏把赵皇后接往北宫',
    playerCompletionContract: sequence([
      {
        id: 'stall_qi_yuxian',
        label: '通宵应付齐羽仙的拖延谈判',
        actionText: '我陪齐羽仙扯了一整夜，拒了她那套「刘建驾崩后再由定陶王继位」的提议，只从她嘴里套门内大祭的口风。',
      },
      {
        id: 'watch_the_ejiao_battle',
        label: '在阙楼上看住阿阁的战局',
        actionText: '我在阙楼上看吕奉先单骑杀出、斩断天子旌旗，看两军在阿阁反复易手，把长秋宫的门守死。',
      },
      {
        id: 'leak_the_transfer_plan',
        label: '把移宫的时辰路线转给齐羽仙',
        actionText: '蔡敬仲把北宫谒者约定的接应时辰告诉我，我转手递给齐羽仙——让长水军自己去撞长秋宫外的埋伏。',
      },
    ]),
  },
};

/** 裁定 C：补源 286《赏格》。非关键事件，不作 s06_05 的前置，不进默认 Rail。 */
const NEW_EVENT = {
  id: 'lyl.event.s06_04b',
  name: '赏格与联络胡骑',
  description:
    '武库陷落、夏门举烽，乱军对北宫形成三面合围。程宗扬派敖润持皇后诏书赴池阳宫争取按兵观望的胡骑校尉桓郁；同时以私财在长秋宫立下重赏——守一日赏金铢十枚，平乱后每日另加四十，伤者加倍、战殁荫及族人。蔡敬仲当众力争，为北宫来的内侍讨到同等赏格。',
  conditions: [{ path: 'flags.event.s06_04.done', operator: 'eq', value: true }],
  completion: [{ path: 'flags.event.s06_04b.done', operator: 'eq', value: true }],
  relatedCharacterIds: [
    'liuchao.character.cheng_zongyang',
    'liuchao.character.cai_jingzhong',
    'liuchao.character.zhao_feiyan',
    'liuchao.character.np069',
  ],
  relatedFactionIds: ['lyl.faction.changqiu', 'liuchao.faction.cheng_shi_shang_hui'],
  locationId: 'lyl.location.changqiu_palace',
  axisBeat:
    '源 286《赏格》缺拍补录：这一章是本关唯一由玩家自己掏钱与派人改变战局的一拍，下游的桓郁谈判与中垒军军司马叛投都由此而来。不得把赏格写成朝廷拨款，钱出自程氏商会私财。',
  objective: '立下赏格稳住长秋宫守军，并派人赶在两方使节之前争取胡骑校尉桓郁',
  critical: false,
  playerCompletionContract: sequence([
    {
      id: 'send_envoy_to_huan_yu',
      label: '派敖润持皇后诏书去争取桓郁',
      actionText: '我写下以皇后名义召桓郁护驾的诏书用印，让敖润走密道出宫，去池阳宫赶在刘建与吕氏的使节之前。',
    },
    {
      id: 'post_the_reward_scale',
      label: '在宫门前当众立下赏格',
      actionText: '我让人把盛满金铢的木箱直接摆在宫门前，按人头发赏：守一日十枚，平乱后每日另加四十，伤者翻倍。',
    },
    {
      id: 'extend_reward_to_north_palace',
      label: '让步，把赏格一并给北宫内侍',
      actionText: '蔡敬仲当众争到脸红脖子粗，我最后松口，比照长秋宫的赏格把北宫来的内侍也一并赏了。',
    },
  ]),
};

function main() {
  const document = JSON.parse(readFileSync(stagePath, 'utf8'));
  const events = document.scenario.events;
  const byId = new Map(events.map(event => [event.id, event]));

  for (const [eventId, patch] of Object.entries(EVENT_PATCHES)) {
    const event = byId.get(eventId);
    if (!event) throw new Error(`missing event ${eventId}`);
    Object.assign(event, patch);
  }

  if (byId.has(NEW_EVENT.id)) throw new Error(`${NEW_EVENT.id} already exists`);
  const anchorIndex = events.findIndex(event => event.id === 'lyl.event.s06_04');
  events.splice(anchorIndex + 1, 0, NEW_EVENT);

  // 裁定 B：章内顺序按原文重排，凌辱/治丧先于矫诏。
  const chapter = document.scenario.chapters[0];
  chapter.eventIds = [
    'lyl.event.s06_01b',
    'lyl.event.s06_01',
    'lyl.event.s06_02',
    'lyl.event.s06_03',
    'lyl.event.s06_04',
    'lyl.event.s06_04b',
    'lyl.event.s06_05',
    'lyl.event.s06_06',
  ];
  chapter.summary = '洛都政变与吕氏覆灭：含光殿之变 … 吕奉先单骑破阵';
  document.scenario.initialFlags['event.s06_04b.done'] = false;

  writeFileSync(stagePath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`stage: patched ${Object.keys(EVENT_PATCHES).length} events, added ${NEW_EVENT.id}`);

  // append-only：只增不改，冻结条目原样保留。
  const frozen = JSON.parse(readFileSync(contractPath, 'utf8'));
  const entry = frozen.stages['lyl.luoyang_coup'];
  if (!entry.eventIds.includes(NEW_EVENT.id)) {
    entry.eventIds.push(NEW_EVENT.id);
    entry.eventIds.sort();
    entry.eventFlagPaths[NEW_EVENT.id] = ['flags.event.s06_04b.done'];
    writeFileSync(contractPath, `${JSON.stringify(frozen, null, 2)}\n`);
    console.log(`save-contract: appended ${NEW_EVENT.id}`);
  }
}

main();
