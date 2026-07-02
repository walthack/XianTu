# XianTu 系列共享正典地图集生成要求

## 目标

为《六朝清羽记》《六朝云龙吟》《六朝燕歌行》生成一份稳定的系列地图集。同一系列的所有阶段 Mod 必须使用同一坐标系、同一地点坐标和同一势力驻地；阶段差异只通过可见性和状态覆盖表达。

## 输入证据与优先级

1. `generated/deepseek-v4-flash/shared-atlas/source-maps/`：三册 EPUB 附录共同收录的总图和四张局部图，是底图、国界、相对位置和图上地名的最高优先级证据。
2. `generated/deepseek-v4-flash/shared-atlas/source-manifest.json`：图片来源、哈希和对应关系。
3. `generated/deepseek-v4-flash/*/synthesis/*.json`：由完整小说正文逐批阅读后汇总的事实，用于补充路线、别名和时期变化，不得推翻附录地图。
4. `generated/deepseek-v4-flash/*/stage-plan.json`：阶段切点。
5. `generated/deepseek-v4-flash/*/stages/*.json`：已生成的阶段实体及本地 ID。
6. `generated/deepseek-v4-flash/*/source-index.json`：原文段落索引。

不得依据常识、其他作品或网络资料补写小说没有的地理事实。图片与正文冲突时保留两边证据并写入 `uncertainties`，不得擅自裁决。

## 地图层与阶段层

- 地图层固定：大陆、区域、城市、据点、道路、地点坐标、势力总部位置和基础势力范围。
- 阶段层变化：当期可见地点、活跃势力、势力名称或控制权变化、人物所在地点。
- 政权领袖、人物归属、战争控制线等有时间性的事实不得固化到地图层。
- 早期阶段不得泄露尚未登场的地点或人物；完整地图可以存储它们，但阶段映射必须控制可见性。

## ID 与别名

- 地图集 ID 使用 `atlas.*` 小写 ASCII 稳定 ID。
- 同名、别名、旧称必须合并为一个地图实体，并保存 `aliases`。
- 阶段 Mod 已有本地 ID 不强行改名；在 `stageBindings` 中映射到地图集 ID。
- 无法确认是否同一实体时不得合并，应写入 `uncertainties`。

## 坐标与推断

- 坐标系固定为 `0..10000`，左上角为 `(0,0)`，右下角为 `(10000,10000)`。
- `map_explicit`：附录地图明确标注的位置。
- `explicit`：原文明确描述地理位置或从属关系。
- `relative_inference`：依据行程、相邻关系、方向和先后顺序推断。
- `layout_only`：仅为地图可读性安排，不能被游戏叙事当作正典距离。
- 每个地点必须给出 `placementBasis`、`confidence` 与至少一个 `sourceRef`。
- 不得生成自相交多边形；大陆边界与势力范围至少 3 点并闭合。

## 输出

输出单个严格 JSON，符合 `schema/xiantu.scenario-atlas.v1.schema.json`：

- `atlas`：完整共享地图。
- `stageBindings`：18 个阶段 Mod 的本地实体到地图实体映射，以及可见实体列表。
- `uncertainties`：无法从正文确认、需要人工复核的项目。

## 硬性质量门槛

- 所有 ID 唯一。
- 所有引用目标存在。
- 所有坐标和多边形点在地图范围内。
- 每个阶段文件都有一条 `stageBindings`。
- `visibleLocationIds` 和 `activeFactionIds` 只能引用地图集实体。
- 阶段 Mod 中每个地点和势力本地 ID，要么被映射，要么在 `unmappedLocalEntities` 明确列出原因。
- 禁止新增原文和已有全文抽取均未出现的地点、势力或路线。
