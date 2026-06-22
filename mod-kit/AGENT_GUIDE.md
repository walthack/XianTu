# Scenario Mod Agent 制作规范

## 目标

把小说、历史时期、跑团设定或原创大纲提炼为“可运行的剧情框架”，而不是复制原文。最终产出必须是一个符合 `xiantu.scenario-mod/v1` 的 JSON 文件，可由仙途直接导入。

## 开始前需要的输入

Agent 应先获得或明确以下信息：

1. 素材来源与允许使用的范围。
2. 剧本时间点和结束边界。
3. `strict` 或 `expand` 模式。
4. 玩家身份是固定、建议还是开放。
5. 必须锁定的名称与允许 AI 扩展的部分。
6. 期望规模：章节数、关键人物数、势力数和地点数。

信息缺失时采用保守默认值：`strict`、开放玩家身份、4 至 8 章、每章1至3个事件，只锁定核心专名。

## 产出工作流

### 1. 提取世界骨架

先确定时代、核心矛盾、地理范围和特殊规则。背景应是摘要，不要粘贴长段原文。

### 2. 建立正典表

按以下顺序建立实体并分配稳定 ID：

1. 大陆或主要区域。
2. 地点。
3. 势力。
4. 技能、功法和物品。
5. 重要人物及其引用。

ID 规范：`<项目>.<类型>.<名称>`，只使用小写字母、数字、点、短横线和下划线。例如 `liuchao.character.cheng_zongyang`。

所有实体 ID 在整个 Mod 中必须唯一。名称可使用中文，ID 不使用中文。

### 3. 设计 flags

flags 是剧情事实，不是叙事文本。推荐命名：

- `chapter.<name>.started`
- `chapter.<name>.done`
- `event.<name>.triggered`
- `event.<name>.done`
- `relation.<name>.met`
- `reputation.<faction>`

每个条件引用的 `flags.*` 都应在 `initialFlags` 中初始化。优先使用布尔值表达里程碑，数值只用于声望、次数或阶段。

### 4. 设计章节状态机

- 第一章通常没有 `activation`，因此创建角色后立即激活。
- 后续章节应由上一章的完成 flag 激活。
- 有明确终点的章节必须提供非空 `completion`。
- 不要让同一条件同时依赖尚未激活章节才能产生的 flag。
- 章节 ID 按剧情顺序稳定命名，不依赖数组索引。

### 5. 设计事件

- `conditions` 决定事件何时进入当前上下文。
- `completion` 决定事件何时从活动事件中移除。
- 事件必须属于某个章节的 `eventIds` 才会激活。
- 事件描述写“需要发生什么”，不要提前写死玩家的选择或结果。
- 未提供 `completion` 的事件会保持活动直到章节结束。

### 6. 设置正典锁

只锁定不可被改名的核心专名。当前运行时支持：

- `canon.factions.*.name`
- `canon.locations.*.name`
- `canon.characters.*.name`
- `content.skills.*.name`
- `content.techniques.*.name`
- `content.items.*.name`

不要把性格、关系、修为或事件结果当作名称锁；这些内容应允许游戏过程改变。

## 模式选择

### Strict

适合历史时期、小说世界和固定舞台。Mod 世界直接成为游戏世界，不调用 AI 世界生成。核心地点、势力和开场所需实体应完整定义。

### Expand

适合只提供主题、少数关键势力或人物的扩展包。AI 先生成世界，再按 ID 或名称与 Mod 合并。Mod 已声明字段优先，AI 只能补充 Mod 未声明字段和非冲突实体。

## 内容边界与所有权

- `canon.factions` 可导入宗派、组织和国家；`canon.locations` 可导入地点；`canon.characters` 可导入重要人物。
- `content.skills` 可导入技能或招式；`content.techniques` 可导入功法或传承；`content.items` 可导入武器、护甲、消耗品、材料和其他物品。
- `content` 是正典定义库，不等于玩家开局持有。人物引用表示人物与内容有关联，也不会自动发放给玩家。
- Strict 不调用 AI 世界生成。Expand 中 Mod 已声明的字段是权威值，AI 仅补空白，不得用同 ID 或同名实体替代。
- AI 可生成 Mod 未定义的支线人物、普通地点、宗派、技能和物品，但不得制造同名替代品混淆正典。
- 名称锁会阻止名称修改以及通过父对象或整表覆盖删除实体；未锁定的动态状态仍可正常变化。

### 正典身份与专属内容

- 玩家扮演某个正典人物时，在 `scenario.opening.playerCharacterId` 填写该人物 ID；不填写表示独立玩家。
- 使用 `rules.contentAccess` 限制技能、功法或物品归属。未配置的内容默认开放。
- `restricted` 用于门派秘传、血脉限定或少数人可学内容，可列出多个 `allowedCharacterIds`。
- `exclusive` 用于生死根一类唯一能力，最终只能解析为一个允许身份。
- `playerAllowed: true` 允许独立玩家获得；玩家已映射为白名单正典人物时无需设置。
- 归属规则不代表开局发放，只约束谁可以在游戏过程中持有。

```json
{
  "contentId": "liuchao.skill.death_root",
  "policy": "exclusive",
  "allowedCharacterIds": ["liuchao.character.cheng_zongyang"],
  "playerAllowed": false
}
```

Guard 会硬拦截把受限内容 ID 或名称写给未授权玩家/NPC 的命令；“相似但改名”的等价能力只能通过正典提示约束模型，因此 Agent 还应在能力描述和 `world.specialRules` 中明确其唯一性。

## 建议规模

首个可玩版本建议控制在：

| 内容 | 建议数量 |
| --- | --- |
| 章节 | 4 至 8 |
| 每章事件 | 1 至 3 |
| 重要人物 | 5 至 15 |
| 势力 | 3 至 8 |
| 地点 | 5 至 15 |
| 技能、功法、物品合计 | 5 至 20 |

先制作一个能完整走通的短剧本，再增加支线。过多正典会增大每回合上下文。

## 硬约束

1. 最终文件只能包含合法 JSON，不能有注释、Markdown 代码围栏或尾随逗号。
2. `schema` 必须是 `xiantu.scenario-mod`，`version` 必须是 `1`。
3. 所有引用必须指向同文件中已定义的 ID。
4. `opening.locationId` 和 `featuredCharacterIds` 必须存在。
5. 非 `exists` 条件必须包含标量 `value`。
6. 不使用 `__proto__`、`prototype` 或 `constructor` 路径段。
7. 不复制大段小说原文；只写事实摘要、角色定位和剧情目标。
8. 不在 JSON 中添加当前 Schema 未定义的脚本、代码或外部指令。
9. 不把技能、功法或物品定义误写成“玩家已获得”；当前 Schema 没有开局发放字段。
10. 原作唯一能力必须配置 `exclusive`，门派或血脉限定内容应配置 `restricted`，不得只依赖人物描述。

## Agent 交付格式

Agent 应交付：

1. `<manifest.id>.json`：唯一的可导入 Mod 文件。
2. 简短校验报告：模式、实体数量、章节数、事件数、validator 结果和仍需人工确认的事实。

不要把校验报告写进 Mod JSON。

## 可直接复用的 Agent 指令

```text
你正在为 XianTu 制作 xiantu.scenario-mod/v1 JSON。
先阅读 mod-kit/AGENT_GUIDE.md、mod-kit/schema/xiantu.scenario-mod.v1.schema.json，
并选择 mod-kit/templates 下的 Strict 或 Expand 模板。

目标：把给定素材提炼为可运行的世界与剧情状态机，不复制长段原文。
要求：
- 全局 ID 唯一且只使用小写 ASCII、数字、点、短横线、下划线。
- 所有引用可解析。
- 每个条件使用的 flag 都在 initialFlags 初始化。
- 后续章节由前一章完成 flag 激活，避免死锁。
- 未触发章节和事件不得在当前章节摘要中泄露。
- 只锁定核心专名。
- 为原作唯一能力配置 exclusive，为限定传承配置 restricted，并确认玩家正典身份。
- 最终 Mod 文件必须是纯 JSON。

完成后运行：npm run mod:validate -- <文件路径>
修复全部错误后，再提交 JSON 和简短校验报告。
```

## 交付检查表

- [ ] JSON 可解析。
- [ ] CLI validator 通过。
- [ ] Strict/Expand 模式符合目标。
- [ ] 所有 ID 全局唯一。
- [ ] 所有实体引用存在。
- [ ] 第一章可激活。
- [ ] 每章存在可达到的完成条件或明确为开放章节。
- [ ] 事件属于正确章节。
- [ ] flags 已初始化且不存在明显死锁。
- [ ] 锁定字段仅包含核心专名。
- [ ] 开场地点和重要人物存在。
- [ ] 玩家正典身份正确；所有受限内容都有合法持有者且引用存在。
- [ ] 文本为摘要，无长段素材复制。
