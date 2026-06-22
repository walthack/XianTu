# 六朝清羽记阶段 Mod 合集

基于 NAS `content` 素材目录 `/Volumes/botsvault/06_material` 中的《六朝清羽记》剧情大纲、人物卡、背景分析与 XianTu Catalog，提炼为三个互相独立的 Strict 剧情入口。

| 顺序 | Mod | 剧情范围 | 文件 |
|---|---|---|---|
| 1 | 六朝清羽记·草原鹰帜 | 穿越、段强、草原战局、王哲与太乙传功 | `liuchao-qingyu-prologue/liuchao.qingyu.grassland.json` |
| 2 | 六朝清羽记·九阳商路 | 第12至24章，奴隶身份到商人立足 | `liuchao-qingyu-merchant-rise/liuchao.qingyu.merchant-rise.json` |
| 3 | 六朝清羽记·南荒海王 | 约第25至58章，南荒、海王神殿与碧鲮海湾 | `liuchao-qingyu-southsea/liuchao.qingyu.southsea.json` |

三个 Mod 不是连续存档 DLC；它们是不同时间点的新游戏剧本。每个 Mod 都包含该阶段所需的独立世界、人物、势力、地点、内容和章节状态机。导入时可以同时保留，创角时选择其中一个。

## 正典边界

- 程宗扬始终作为正典 NPC，玩家为独立角色。
- 生死根始终只属于程宗扬。
- 九阳神功、毒术等限定内容通过 `rules.contentAccess` 保护，不会自动发放给玩家。
- 人物宗派与组织身份写入 `affiliations`，运行时不得被其他宗派替代。
- Strict 模式不调用 AI 重新生成已声明世界内容。
- 素材概述较粗时，新增的阶段配角会在各包 README 中明确标注，不冒充原作正典人物。
- 不复制小说正文；成人议题只作非露骨结构事实处理。

## 校验

```bash
npm run mod:validate -- mods/liuchao-qingyu-prologue/liuchao.qingyu.grassland.json
npm run mod:validate -- mods/liuchao-qingyu-merchant-rise/liuchao.qingyu.merchant-rise.json
npm run mod:validate -- mods/liuchao-qingyu-southsea/liuchao.qingyu.southsea.json
```
