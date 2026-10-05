# 结局配图交接（2026-10-05，用户12:57授权）

## 交付

结局已支持 `presentation.image: string | null`。静态图片放在 `src/assets/endings/`，编号资源键写在 `mod-kit/ending-images.qingyu.json`；Webpack 内嵌 JPEG 为 data URL，不依赖 Desktop、额外静态服务器或发布路径。游戏包会增加约2.2MB图片编码内容。

`endingPresentation.ts` 按 endingId/sourceEventId 解析配图，E01/E03共用炮烙ID但按事件区分。runtime.ts 两个终局结算入口写入配图字段，战斗结局表也带 presentation。AIBidirectionalSystem.ts 将配图键写入本轮历史 image；MainGamePanel.vue 正文显示图片，终局卡为旧档补显示，避免重复同一张图。旧档无需改写，computed只读取，不反写store。缺图明确null，不显示破图；不编图。

## 原图映射

|仓库文件|Desktop/narrative/结局 原图|
|---|---|
|src/assets/endings/E01.jpg|E01-不赌·炮烙.jpg|
|src/assets/endings/E02.jpg|E02-不撕·冰蛊.jpg|
|src/assets/endings/E03.jpg|E03-拒约·炮烙.jpg|
|src/assets/endings/E04-v2.jpg|E04-不走·王哲自爆-v2.jpg|
|src/assets/endings/E07-v7.jpg|E07-龙首无人-v7.jpg|

E07已使用v7，无需v6兜底；E05/E06/E08当前没有JPG，保留空字段。其它图优先使用无版本后缀同名图，E04只有v2。图片逐字节复制，没有裁剪、重绘或内容处理。编号文件名避免源码人名字面量棘轮误计，未放宽基线。

## 改动文件

- 新增 mod-kit/ending-images.qingyu.json、src/modules/scenarioMods/endingPresentation.ts。
- 新增 src/assets/endings/index.ts 及5张JPG；src/types/assets.d.ts 图片类型声明。
- 修改 webpack.config.js：仅结局目录的JPG使用asset/inline。
- 修改 fixedEndingNarratives.ts：正文/配图共用endingKey，战斗结局表附带presentation。
- 修改 runtime.ts：可选终局presentation类型和两处结算存档。
- 修改 AIBidirectionalSystem.ts：固定终局历史配图。
- 修改 MainGamePanel.vue：历史资源解析、终局旧档补图、图片样式。
- 新增 tests/endingImages.test.mjs，更新 PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md及本交接。
- canon:build自动刷新的registry/manifest产物按既有管线保留，未回滚其他批次/模块策划改动。

## 验收

- tsc --noEmit：0错误。
- 定向41/41通过；最终全量1457项：1452通过、0失败、5跳过。
- canon:build全绿，54.0秒，内置单测计数同上。
- 正式production Webpack编译（输出/tmp/xiantu-ending-images-build）通过；5张JPEG均与Desktop所选原图逐字节一致，并验证base64已进入最终XianTu.js。
- git diff --check通过。
- 未做真人/浏览器真机复测，请New Bot验证新终局与旧终局存档显示、刷新后历史图片和E01/E03图区分。

合规、结局正文和触发条件均未修改；没有提交或推送。战斗正式F13触发消费仍沿上一轮未接状态，本轮不新增战斗机制。门禁日志：/tmp/ending-images-before/。
