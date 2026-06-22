# XianTu Scenario Mod Kit

这个目录是交给人类作者或其他 Agent 的标准制作包。最终交付物是一个可直接导入仙途的 UTF-8 JSON 文件。

## 目录

- [`AGENT_GUIDE.md`](./AGENT_GUIDE.md)：Agent 工作流、硬约束和交付检查表。
- [`schema/xiantu.scenario-mod.v1.schema.json`](./schema/xiantu.scenario-mod.v1.schema.json)：编辑器可使用的 JSON Schema。
- [`templates/strict.template.json`](./templates/strict.template.json)：固定世界剧本模板。
- [`templates/expand.template.json`](./templates/expand.template.json)：AI 世界补充模板。

## 推荐流程

1. 复制最接近目标的模板并重命名为 `<manifest.id>.json`。
2. 按 `AGENT_GUIDE.md` 提取世界框架、正典和剧情状态机。
3. 校验文件：

```bash
npm run mod:validate -- path/to/mod.json
```

4. 在仙途首页进入“剧本模组”，导入并启用 JSON。
5. 新建角色，从世界选择页选择 Mod，完成开场与存档重载测试。

JSON Schema 负责字段形状；CLI 使用仙途自身 validator，额外检查全局重复 ID、悬空引用和不安全路径。交付前必须通过 CLI。
