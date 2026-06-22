# Scenario Mod 作者指南

Scenario Mod 用一个 JSON 文件描述可导入的世界与剧情框架。当前格式标识为 `xiantu.scenario-mod`，版本为 `1`。

需要交给其他 Agent 制作 Mod 时，直接使用 [`mod-kit`](../mod-kit/README.md)。其中包含 Agent 规范、机器可读 JSON Schema、Strict/Expand 模板和交付检查表。

## 使用流程

1. 准备符合 Schema 的 JSON 文件。
2. 在首页进入“剧本模组”。
3. 导入文件并启用 Mod。
4. 进入“独自修行”并开始新角色。
5. 在世界选择页选择 Strict 或 Expand Mod。

当前不兼容旧存档，也不支持多个 Mod 同时叠加。创建角色时会将 Mod 运行时快照写入存档，之后不依赖本地 Mod 库继续运行。

## 最小结构

```json
{
  "schema": "xiantu.scenario-mod",
  "version": 1,
  "manifest": {
    "id": "author.story",
    "name": "示例剧本",
    "version": "1.0.0"
  },
  "world": {
    "name": "示例世界",
    "era": "故事开端",
    "background": "世界背景说明。"
  },
  "scenario": {
    "opening": {
      "text": "故事从这里开始。"
    }
  },
  "rules": {
    "mode": "strict"
  }
}
```

完整可运行示例见 [`tests/fixtures/scenario-mod/minimal.json`](../tests/fixtures/scenario-mod/minimal.json)。类型定义位于 [`src/modules/scenarioMods/schema`](../src/modules/scenarioMods/schema)。

## 顶层字段

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `schema` | 是 | 固定为 `xiantu.scenario-mod` |
| `version` | 是 | 当前固定为 `1` |
| `manifest` | 是 | Mod ID、名称、版本、作者和说明 |
| `world` | 是 | 世界名称、纪元、背景、规则和大陆 |
| `canon` | 否 | 势力、地点和重要人物 |
| `content` | 否 | 技能、功法和物品 |
| `scenario` | 是 | 开场、flags、章节和事件 |
| `rules` | 是 | 运行模式和正典锁定字段 |

所有实体 ID 必须使用小写字母、数字、点、短横线或下划线，并在整个 Mod 内保持唯一。所有引用 ID 必须指向已定义实体。

## Strict 与 Expand

### Strict

`rules.mode` 设置为 `strict`。创角时直接从 Mod 构建世界，不调用 AI 世界生成。大陆、势力、地点及其名称以 Mod 为准，适合固定时代剧本。

### Expand

`rules.mode` 设置为 `expand`。系统先调用原有 AI 世界生成，再按 ID 或名称合并 Mod 内容：

- Mod 已声明的字段具有权威性，不会被 AI 同名内容覆盖。
- Mod 未声明的字段可由 AI 补齐。
- AI 生成的非冲突实体会保留，Mod 缺失实体会追加。
- 同 ID 或同名实体不会重复创建。

## 可导入内容与运行边界

| 内容 | 字段 | 导入效果 |
| --- | --- | --- |
| 宗派、组织、国家 | `canon.factions` | 进入世界势力和 Mod 正典 |
| 地点 | `canon.locations` | 进入世界地点和 Mod 正典 |
| 重要人物 | `canon.characters` | 进入 Mod 正典和剧情上下文，不自动创建玩家关系记录 |
| 技能、招式 | `content.skills` | 成为正典定义，可被人物、功法和物品引用 |
| 功法、传承 | `content.techniques` | 成为正典定义，可关联技能和物品 |
| 武器、护甲、消耗品、材料 | `content.items` | 成为正典定义，可关联技能或功法 |

`content` 描述的是世界中存在的定义，不代表玩家开局已经拥有。把技能、功法或物品写入人物的 `skillIds`、`techniqueIds`、`itemIds`，表示该正典人物与它们有关联；当前版本仍不会自动把它们发放到玩家技能栏、功法栏、背包或装备栏。玩家获得内容应通过剧情叙述和正常游戏指令发生。

### 玩家身份与专属内容

`scenario.opening.playerCharacterId` 可把玩家映射为一个 `canon.characters` 正典人物。未填写时，玩家是独立身份，不会自动继承任何正典人物的专属能力。

`rules.contentAccess` 限制技能、功法或物品的持有者。没有规则的内容默认为开放：

```json
{
  "scenario": {
    "opening": {
      "text": "故事开始。",
      "playerCharacterId": "story.character.protagonist"
    }
  },
  "rules": {
    "mode": "strict",
    "contentAccess": [
      {
        "contentId": "story.skill.life_death_root",
        "policy": "exclusive",
        "allowedCharacterIds": ["story.character.protagonist"],
        "playerAllowed": false
      }
    ]
  }
}
```

- `restricted`：只允许 `allowedCharacterIds` 中的人物持有；可用 `playerAllowed: true` 额外允许独立玩家。
- `exclusive`：只允许一个正典身份持有。若玩家映射为该人物，玩家与该人物视为同一身份。
- `playerAllowed` 指独立玩家权限，不会自动发放内容。
- CLI 会拒绝不存在的内容或人物引用、重复规则、没有持有者的规则，以及解析为多个身份的 `exclusive` 规则。

运行时 guard 会检查写向玩家或 NPC 技能、功法、背包、装备、灵根、天赋、特殊体质和能力字段的命令，并拒绝把受限内容的 ID 或名称授予未授权身份。普通记忆和剧情文本可以提及该内容。模型提示同时禁止复制、继承或创造等价变体；等价变体属于语义判断，由模型约束而非字符串 guard 判定。

### 人物宗派与势力归属

人物可用 `affiliations` 同时声明不同类别的正典归属：

```json
{
  "id": "liuchao.character.wang_zhe",
  "name": "王哲",
  "affiliations": [
    {
      "factionId": "liuchao.faction.taiyi",
      "category": "sect",
      "role": "掌教"
    },
    {
      "factionId": "liuchao.faction.left_guard",
      "category": "military",
      "role": "师帅"
    }
  ]
}
```

类别支持 `sect`、`military`、`state`、`clan`、`organization`。每条归属默认 `exclusive: true`，表示同类别排他：人物可以同时拥有宗派和军队身份，但不能同时被写入另一个宗派。只有原作明确允许同类兼任时才设置 `exclusive: false`。

旧字段 `character.factionId` 继续支持，并根据对应势力的 `type` 推断类别后按排他归属处理。新 Mod 应使用 `affiliations`，以免把宗派、军职和国家身份混为一类。

运行时会拦截修改 NPC `势力归属`、`宗门`、`宗派`、`军籍`、`国家`、`家族`等字段的冲突命令，也会阻止把正典人物加入其他 `社交.宗门.宗门成员` 列表。记忆中提到敌对宗派不等于加入，因此不会被拦截。

Strict 模式完全不调用 AI 世界生成，Mod 提供的世界、势力和地点是初始化权威来源。Expand 模式允许 AI 扩充，但采用“Mod 字段优先、AI 只补空白”的字段级合并。两种模式下，同 ID 或同名的 AI 内容都不得替代 Mod 实体；非冲突的新人物、宗派、技能或物品可以按剧情生成。

`lockedFields` 用于保护实体名称。Guard 同时拒绝通过覆盖父对象或整个数组来绕过名称锁，因此不能用整表替换删除已锁定实体；描述、关系、熟练度、耐久度、归属和剧情状态等未锁定运行数据仍可随游戏发展。

## 章节、事件与 flags

`scenario.initialFlags` 定义初始剧情标记。路径可使用扁平键，例如：

```json
{
  "initialFlags": {
    "yellow_turban.started": false,
    "reputation": 0
  }
}
```

条件支持以下运算符：

| 运算符 | 含义 |
| --- | --- |
| `eq` / `neq` | 相等 / 不相等 |
| `gt` / `gte` | 大于 / 大于等于 |
| `lt` / `lte` | 小于 / 小于等于 |
| `includes` | 数组或字符串包含给定值 |
| `exists` | 路径存在 |

条件路径以 `flags.` 开头时读取 Mod flags；其他路径读取 V3 存档，例如 `角色.身份.名字`。

章节使用 `activation` 和 `completion`。事件使用 `conditions` 激活，并可用 `completion` 完成：

```json
{
  "id": "chapter.arrival",
  "title": "入城",
  "summary": "玩家进入建康并接触主要人物。",
  "activation": [
    { "path": "flags.arrival.ready", "operator": "eq", "value": true }
  ],
  "completion": [
    { "path": "flags.arrival.done", "operator": "eq", "value": true }
  ],
  "eventIds": ["event.first_meeting"]
}
```

运行时只允许 AI 使用 `set` 修改 `世界.状态.剧本模组.flags.*`。章节 ID、事件定义、完成列表和 Mod 身份由前端状态机维护，AI 不得直接修改。

## 正典保护

`rules.lockedFields` 声明运行时不可改写的正典名称。当前支持：

```json
{
  "lockedFields": [
    "canon.factions.*.name",
    "canon.locations.*.name",
    "canon.characters.*.name",
    "content.skills.*.name",
    "content.techniques.*.name",
    "content.items.*.name"
  ]
}
```

Guard 会拒绝直接字段修改，也会拒绝通过父对象或整个数组覆盖锁定字段。普通描述、好感度等未锁定数据仍可变化。

## 模型上下文

每回合向 LLM 注入：

- Mod 身份和锁定正典名称。
- 当前章节标题、摘要和完成条件。
- 当前已触发事件、相关正典和完成条件。
- 当前 flags。

发送给模型的存档视图会移除未来章节和未触发事件；完整定义仍保存在实际存档中。

## 验证与测试

```bash
npm run mod:validate -- path/to/mod.json
npm test
npm run type-check
npm run lint:check
npm run build
```

导入时 validator 会拒绝不支持的 Schema、重复 ID、悬空引用、不安全路径和无效条件。建议从最小 fixture 复制一份，再逐步添加正典与剧情内容。
