#!/usr/bin/env node

// R2-11W：在三条主线各补一张人工精选、由 NPC 已裁定行动触发的机会卡。
// 不按事件机械铺卡；只复用现有 decisionCore actor/action，且不改变事件完成条件。
// 幂等：同 id 先删后写。备份只在首次运行时创建，永不覆盖原始快照。

import { cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash');

const TARGETS = [
  {
    book: 'qingyu',
    stageFile: 'lcq.stage_10_jiangzhou_shadow_war.json',
    eventId: 'lcq.event.s10_04_left_army_review',
    opportunity: {
      id: 'opportunity.lcq.s10_04.counterintelligence_probe',
      title: '让小紫试一条假消息',
      characterIds: ['liuchao.character.xiao_zi'],
      whyNow: '军机接触链仍有漏洞，但直接点名嫌疑人只会让真正的泄露路径立刻潜伏。',
      nextStep: '协助小紫把无害军情拆成不同版本，分别递给有限接触点并记录传播去向。',
      stakes: '试探若失控会损害内部信任；任何版本都不得包含足以伤害江州备战的真实机密。',
      rewardPreview: '取得一次调用星月湖错位消息试探与传播链复核的权限。',
      futureHint: '下一次军机异常时，小紫会允许你查验哪条消息曾从哪个接触点流出。',
      actionText: '我追踪“让小紫试一条假消息”：只使用无害的错位信息建立对照，并按传播路径复核接触链，不提前指认真凶。',
      rewardKey: 'permission.lcq.xiaozi.counterintelligence_probe',
      rewardLabel: '小紫·错位消息试探与传播链复核',
      trigger: {
        actorIds: ['liuchao.character.xiao_zi'],
        actionIds: ['gather_intelligence', 'test_loyalty'],
      },
      completionContract: {
        kind: 'player_action_sequence',
        settlement: 'immediate',
        expiry: 'persistent',
        steps: [
          {
            id: 'seed_harmless_variants',
            label: '分别递出无害的错位消息',
            actions: [{
              id: 'seed_harmless_message_variants',
              label: '布置无害消息对照',
              actionText: '我同小紫把一条不影响真实军务的消息改成几个可辨版本，分别交给有限接触点，并登记每个版本的去向。',
              timeCost: 1,
            }],
            matchAny: ['无害的消息', '可辨版本', '登记每个版本'],
            rejectIf: ['泄露真实军机', '公开全部军务', '已经坐实真凶'],
          },
          {
            id: 'compare_propagation_paths',
            label: '复核消息传播路径',
            actions: [{
              id: 'compare_message_propagation',
              label: '比对传播链',
              actionText: '我只比对各版本实际出现的位置与转递次序，把异常接触点列为待复核对象，不把试探结果冒充定罪证据。',
              timeCost: 1,
            }],
            matchAny: ['比对各版本', '转递次序', '待复核对象'],
            rejectIf: ['直接定罪', '真凶已经确定', '无需复核'],
          },
        ],
      },
    },
  },
  {
    book: 'yunlong',
    stageFile: 'lyl.luoyang_cloud_secret.json',
    eventId: 'lyl.event.s05_09',
    opportunity: {
      id: 'opportunity.lyl.s05_09.preserve_ambush_evidence',
      title: '给伊水伏击留下反查线索',
      characterIds: ['liuchao.character.yun_cang_feng', 'liuchao.character.yun_dan_liu'],
      whyNow: '余部一旦撤离，伏击位置、截断方式和敌方退路都会迅速被现场混乱抹掉。',
      nextStep: '在不拖住伤员撤离的前提下标记伏击断点，保存可复核物证并沿安全路线回查。',
      stakes: '为追线索停留过久会招来第二轮截击；现有证据也不足以宣称追回全部金铢或歼灭袭击者。',
      rewardPreview: '取得一次调用云氏反伏击勘验与路线风险复核的权限。',
      futureHint: '云氏重开商路前，会把新的路线交给曾经替他们保存现场证据的人先看。',
      actionText: '我追踪“给伊水伏击留下反查线索”：先保存不会拖累撤离的现场证据，再沿已打开的安全路线复核截断点，不深追敌军。',
      rewardKey: 'permission.lyl.yun_convoy.counterambush_audit',
      rewardLabel: '云氏·反伏击勘验与路线风险复核',
      trigger: {
        actorIds: ['liuchao.character.yun_cang_feng', 'liuchao.character.yun_dan_liu'],
        actionIds: ['open_safe_route', 'block_road'],
      },
      expiresAfterTurns: 3,
      completionContract: {
        kind: 'player_action_sequence',
        settlement: 'immediate',
        expiry: 'standard',
        steps: [
          {
            id: 'preserve_ambush_traces',
            label: '保存伏击断点与退路痕迹',
            actions: [{
              id: 'mark_ambush_breakpoints',
              label: '标记伏击断点',
              actionText: '我在不拖住伤员撤离的前提下，标记车队被截断的位置、来袭方向和敌方退路，只保存可复核痕迹。',
              timeCost: 1,
            }],
            matchAny: ['标记车队被截断', '来袭方向', '可复核痕迹'],
            rejectIf: ['停下撤离', '全军追击', '已经歼灭'],
          },
          {
            id: 'audit_route_hazards',
            label: '沿安全路线复核风险',
            actions: [{
              id: 'audit_safe_route_hazards',
              label: '复核路线风险',
              actionText: '我沿云苍峰打开的安全路线回查相邻截断点，把能证明的风险记入新路线，不越过接应范围深追。',
              timeCost: 1,
            }],
            matchAny: ['回查相邻截断点', '记入新路线', '不越过接应范围'],
            rejectIf: ['全部金铢已经追回', '全歼袭击者', '恢复原路线'],
          },
        ],
      },
    },
  },
  {
    book: 'yange',
    stageFile: 'lyg.dingtao_beijing.json',
    eventId: 'lyg.event.s01_07',
    opportunity: {
      id: 'opportunity.lyg.s01_07.withdrawal_logistics',
      title: '让凉州旧部退得出去',
      characterIds: ['liuchao.character.jia_wenhe'],
      whyNow: '旧部已有退场次序，但没有独立补给与有限联络，撤离很快会重新变成洛都兵变或边地失控。',
      nextStep: '把宫城军需与撤离军需分账，并为退往边地的旧部保留一条受限补给联络。',
      stakes: '补给若重新绑定宫城权力，会让退场变成挟持；切断过急又可能逼出哗变。',
      rewardPreview: '取得一次向贾文和协调凉州旧部撤离后勤与备用联络的权限。',
      futureHint: '凉州旧部离开洛都后，贾文和会把最先出现的补给断点交给你核对。',
      actionText: '我追踪“让凉州旧部退得出去”：将撤离后勤与宫城争权切开，只保留维持秩序所需的有限补给和备用联络。',
      rewardKey: 'permission.lyg.jia_wenhe.withdrawal_logistics',
      rewardLabel: '贾文和·凉州旧部撤离后勤协调',
      trigger: {
        actorIds: ['liuchao.character.jia_wenhe'],
        actionIds: ['reserve_supplies', 'prepare_fallback_route'],
      },
      expiresAfterTurns: 3,
      completionContract: {
        kind: 'player_action_sequence',
        settlement: 'timeline_deadline',
        expiry: 'standard',
        steps: [
          {
            id: 'separate_withdrawal_supplies',
            label: '把撤离军需与宫城权力分账',
            actions: [{
              id: 'separate_military_handoff_inventory',
              label: '拆分撤离军需账',
              actionText: '我同贾文和把凉州旧部撤离所需的军需单独封签，明确不得用这批补给交换入宫或继续争权。',
              timeCost: 1,
            }],
            matchAny: ['军需单独封签', '不得用这批补给', '撤离所需'],
            rejectIf: ['继续入宫争权', '挟持新帝', '接管新朝'],
          },
          {
            id: 'open_limited_resupply_contact',
            label: '保留有限补给与退路联络',
            actions: [{
              id: 'establish_limited_resupply_contact',
              label: '建立受限后勤联络',
              actionText: '我建立一条只报告补给断点与撤离受阻的受限联络，不传未经核实的开战消息，也不替旧部保留宫城指挥权。',
              timeCost: 1,
            }],
            matchAny: ['只报告补给断点', '撤离受阻', '受限联络'],
            rejectIf: ['确定胡骑入侵', '保留宫城指挥权', '董卓继续掌权'],
          },
        ],
      },
    },
  },
];

function assertTriggerIsBound(event, opportunity) {
  const bindings = event.worldActor?.decisionCore?.actionBindings || [];
  const actorIds = new Set(opportunity.trigger.actorIds);
  const actionIds = new Set(opportunity.trigger.actionIds);
  const reachable = bindings.some(binding => actionIds.has(binding.actionId)
    && binding.actorIds.some(actorId => actorIds.has(actorId)));
  if (!reachable) throw new Error(`${opportunity.id}: trigger does not match a decisionCore action binding`);
}

for (const target of TARGETS) {
  const stagePath = join(generated, target.book, 'stages', target.stageFile);
  const backupDir = join(generated, target.book, 'stages-pre-r2-11w-opportunity-backup');
  if (!existsSync(backupDir)) await cp(dirname(stagePath), backupDir, { recursive: true });

  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  const event = document.scenario.events.find(item => item.id === target.eventId);
  if (!event) throw new Error(`${target.eventId}: event not found in ${stagePath}`);
  if (!event.worldActor?.decisionCore) throw new Error(`${target.eventId}: missing decisionCore`);
  assertTriggerIsBound(event, target.opportunity);

  const opportunities = event.worldActor.opportunities || [];
  event.worldActor.opportunities = [
    ...opportunities.filter(item => item.id !== target.opportunity.id),
    target.opportunity,
  ];
  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`updated ${target.eventId}: ${event.worldActor.opportunities.length} opportunities`);
}

