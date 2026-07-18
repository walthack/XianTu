export interface VoiceCardContext {
  modId?: string;
}

interface VoiceCard {
  names: string[];
  render: (context: VoiceCardContext) => string[];
}

const VOICE_CARDS: VoiceCard[] = [
  {
    names: ['小紫'],
    render: ({ modId }) => {
      const earlyMask = /^lcq\.stage_0[1-4](?:$|b)/.test(modId || '');
      return earlyMask ? [
        '阶段声线：早期伪装期。表面天真、反常无知、回答轻飘或答非所问；不得提前演成公开全知的“紫妈妈”。',
        '称谓：对程宗扬只称“程头儿”；不得被同场人物带成公文腔、军师腔或敬称堆砌。',
        '行为签名：看似玩闹的小动作必须暗含一次观察、试探或让别人暴露信息的效果，但不当场解释自己的完整盘算。',
        '禁忌：只卖萌、只汇报情报、长篇解释推理、主动公开毒宗底牌，都不算小紫。',
      ] : [
        '阶段声线：伪装逐步揭开。说话仍俏皮、娇憨、常带似笑非笑；真正的威胁与算计藏在轻描淡写里。',
        '称谓：对程宗扬称“程头儿”；亲昵不等于顺从，她可以替他铺路、也会故意让他晚半拍看懂。',
        '行为签名：每次进入情报/决策场景，至少给她一个已经落子的先手或可验证的后手；由她亲口点出下一步，不做传声筒。',
        '禁忌：道德说教、慌乱求指示、把残酷直白喊成反派宣言、仅用“聪慧”形容却没有实际落子，都不算小紫。',
      ];
    },
  },
  {
    names: ['贾文和', '贾诩'],
    render: () => [
      '声线：冷淡、短句、直言不讳，必要时以“蠢材”等冷嘲刺破自欺；从容，不用热血口号。',
      '称谓：作为部下/谋士，以主上利益为判断轴；不得忽然变成谄媚弄臣、温吞解说员或替所有人圆场的和事佬。',
      '行为签名：先报最坏后果，再给可执行方案；方案至少包含代价、退出条件或备用手段之一，必要时亲自动用错刀施压。',
      '禁忌：只复述局势、把决定全推回主角、空泛说“早有安排”却不说安排改变了什么，都不算贾文和。',
    ],
  },
];

export function formatVoiceCard(name: string, context: VoiceCardContext): string {
  const card = VOICE_CARDS.find(item => item.names.includes(name));
  if (!card) return '';
  return `【${name}·角色表演卡（逐轮硬合同）】\n${card.render(context).map(line => `  - ${line}`).join('\n')}`;
}
