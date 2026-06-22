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

- 已有值保持不变。
- 缺失字段由 Mod 补齐。
- 缺失实体追加到生成世界。
- 同 ID 或同名实体不会重复创建。

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
