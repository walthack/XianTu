# R2-10E · NPC 行动冲突、反制与多回合生命周期 G1

- 日期：2026-07-20
- 基线：R2-10D 态度／知识／effects 反馈环
- 范围：通用 NPC 决策内核 + `lyg.event.s01_06–08`
- 结论：**冲突与生命周期 G1 通过；下一里程碑为地区／势力／人物分层唤醒。**

## 1. 行动生命周期

`durationTurns` 不再只是重复行动冷却。持续行动进入运行时 `activeAction`，按世界行动轮依次产生：

- `started`：支付成本并一次性应用 effects；
- `continuing`：保持在途，不重复扣成本或叠加 effects；
- `completed`：结束在途状态并进入一轮冷却；
- `instant`：单轮行动当轮完成。

在途状态属于 `npcStates`，因此进入决策输入哈希并随存档持久化。JSON 重载不会重启行动、重复落账或改变剩余回合。

## 2. 冲突与反制

行动可声明：

```json
{
  "interaction": {
    "domain": "royal_guard",
    "stance": "advance",
    "power": 3,
    "counters": ["protect_principal"]
  }
}
```

同一 `domain` 的相反 stance，或显式 `counters` 命中的行动，由本地内核以“行动效用分 + power”确定性比较；平分按稳定 decision id 决胜。回执记录双方强度、对手和冲突域。

- 胜方：`outcome=succeeded`，正常结算；
- 败方：`outcome=blocked`，不应用局势 effects、态度／知识 effects，也不启动持续行动；
- 在途行动被更强反制时立即中断并进入冷却；
- LLM 只渲染胜负，不得重新裁定。

## 3. 首批样本

- `s01_06`：郭解 `protect_principal` 防守 `royal_guard`，剑玉姬 `sabotage_agenda` 推进同一冲突域；护持胜出时只增加 `royalSafety`，剑玉姬不会获得换防规律知识。
- `s01_06`：`escort_witness/open_safe_route` 与 `block_road` 构成 `evacuation_route` 反制组。
- `s01_07`：董卓遗命和贾文和撤军为同阵营的持续收束行动，不因共享领域而互相误杀。
- `s01_08`：调查来源与控制证据形成秘密来源域，为后续多角色介入预留反制合同。

## 4. G1 断言

命令：`npm run test:g1:npc`

- 同输入得到相同胜负与回执；
- interaction 配置变化进入输入哈希；
- 败方 effects、stateEffects 和持续行动均不落账；
- 三回合行动严格经过 started → continuing → completed；
- continuing/completed 不重复应用起始 effects；
- 在途行动经 JSON 重载后仍可被更强行动反制并中断；
- validator 拒绝非法 stance、domain 和未知 counter action。

G2 仍负责真实模型是否自然演出行动被阻断、持续推进与反制因果。
