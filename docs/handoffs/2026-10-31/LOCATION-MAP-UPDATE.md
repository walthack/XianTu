# XC-20261031 地点裁定与代表点地图

本次在既有国对国路程和晴州归宋工作区上续作，不 commit/push。

## 地点结果

- 江州、星月湖大营、金明寨（含旧 id jinmingzhai）country=晋，全部 stageVariants 与显式 country 投影同步；江州/星月湖/金明寨到临安按晋→宋52日。
- 白龙江口 lcq.location.bailongjiang_kou：南荒，liuchao.continent.nanhuang，城池，(1960,7080)，独立补给点，不是跨国代表点。描述依据用户提供 lcq.txt:5230，白龙江口南下入南荒前最后补给。
- 光明观堂 liuchao.location.guangming 合并入 liuchao.location.guang_ming_guan，旧 id 与名字作为 aliases；九个旧变体转入目标条目，连同原有一变体共十个，全部归宋。内置剧情旧 id 保留，由现有别名层解析；目录索引同步，搜刮表移除旧 id 的重复空 pending 条目（无掉落内容变化）。没有新建易州。
- 帅帐 lcq.location.shuai_zhang 及 command_tent 别名归中立边陲。
- 函谷关 country=汉；已检查各数据层显式 country，无别国残留。
- **未改** lcq.location.shuixiang_lou 江州水香楼：宋、无坐标，按用户要求保留。检索 definition 与全部变体，未发现其他明确的江州城内/城郊独立条目；宁州文字提及与江州唇齿相依，但属于邻城，保留晋。原 region、描述、阵营及坐标保持不变（新增白龙江口除外）。

## 地图

六朝锁定地图从总表补齐配置内九国首都/代表点，优先加入、按规范 id/名称去重，豁免子地点隐藏；仍走原地点点击弹窗和 selectMapTravel/settleMapTravel。未修改底图。

花苗寨保持 (1650,7470)，未偏移：与万古巨藤约110、熊耳铺约145、白龍江约400世界单位，现有最近点命中半径50；代表点先加入，同坐标时优先命中。位置在白龙江口南方，符合用户提供的南下入山商路依据；不将此示意坐标冒充原著精确测绘。

## 验证

最终 npm test：3020项，3007通过、0失败、13跳过（253.5秒）；本批新增8项。npm run type-check 退出0。跨国/时间/国别专项112/112，搜刮专项4/4；content-packs --check、entity-catalog校验（零错误）、GameMapPanel Vue SFC编译与 git diff --check 均通过。首轮全量3处失败（原字段保护预期、目录索引、旧id空搜刮条目）均已修正并由最终全量覆盖。冻结 runtime.ts、AIBidirectionalSystem.ts、tests/frozen-baseline.json 差分为空。无新增源文件、require 或错误码，无需新增 debugCategories。浏览器/真人体验未测。

## 本续轮改动文件（不含仅由前轮改动的文件）

- PROJECT-STATUS.md
- mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json
- mod-kit/canon-authority-overlays/lcq.stage_04.json
- mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json
- mod-kit/canon-authority-overlays/lcq.stage_05b.json
- mod-kit/location-loot.qingyu.json
- mod-kit/entity-catalog/index.json
- mod-kit/entity-catalog/locations.json
- src/components/dashboard/GameMapPanel.vue
- src/modules/contentPacks/generated/catalog.json
- src/modules/contentPacks/packs/qingyu/stage-qin-xianyang.json
- src/modules/scenarioMods/builtins/data/lcq.stage_01.json
- src/modules/scenarioMods/builtins/data/lcq.stage_02.json
- src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json
- src/modules/scenarioMods/builtins/data/lcq.stage_04.json
- src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json
- src/modules/scenarioMods/builtins/data/lcq.stage_05b.json
- src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json
- src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json
- src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json
- src/modules/scenarioMods/builtins/data/lcq.stage_10_jiangzhou_shadow_war.json
- src/modules/scenarioMods/builtins/data/lcq.stage_11_lieshan_battle.json
- src/modules/scenarioMods/builtins/data/lcq.stage_12_jiangzhou_counterwar.json
- src/modules/scenarioMods/builtins/data/lyg.buddhist_conspiracy.json
- src/modules/scenarioMods/builtins/data/lyg.changgan_begins.json
- src/modules/scenarioMods/builtins/data/lyg.changgan_interlude.json
- src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json
- src/modules/scenarioMods/builtins/data/lyg.ganlu_aftershock.json
- src/modules/scenarioMods/builtins/data/lyg.han_succession.json
- src/modules/scenarioMods/builtins/data/lyg.liangzhou_league.json
- src/modules/scenarioMods/builtins/data/lyg.mijing_rumen.json
- src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json
- src/modules/scenarioMods/builtins/data/lyl.han_palace_endgame.json
- src/modules/scenarioMods/builtins/data/lyl.jiangzhou_retreat.json
- src/modules/scenarioMods/builtins/data/lyl.lin_an_black_sea.json
- src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json
- src/modules/scenarioMods/builtins/data/lyl.luoyang_cloud_secret.json
- src/modules/scenarioMods/builtins/data/lyl.luoyang_coup.json
- src/modules/scenarioMods/builtins/data/lyl.taiquan_afterfall.json
- src/modules/scenarioMods/builtins/data/lyl.taiquan_core_conflict.json
- src/modules/scenarioMods/builtins/data/lyl.taiquan_sacred_fruit.json
- src/modules/scenarioMods/builtins/data/lyl.xiaoyingzhou_blacksea_trap.json
- src/modules/scenarioMods/travel/mapTravel.ts
- tests/actionTime.test.mjs
- tests/crossCountryTravel.test.mjs
- docs/handoffs/2026-10-31/LOCATION-MAP-UPDATE.md

## 续轮二：江州第二落点、五原移出落点、剧情跨国转场核验（未提交）

- 配置（`mod-kit/numbers-runtime.json` → `crossCountryTravel`，合并产物由脚本重生成）：新增 `destinations`（按国列跨国可点落点；晋＝[建康, 江州]，中立边陲不列＝五原不可作跨国目的地）与 `destinationRawDays`（单独落点的「出发国→该点」未截断天数）。`capitals` 与 `rawDays` 矩阵保留，五原出发仍按矩阵。注册表补两条必填 object 字段。
- 江州天数按江州坐标 (4956,6735) 到各国代表点直线距离/80 向上取整：宋32、汉46、唐55、秦61（结算截60）、南荒43、太泉43、昭南14、中立边陲59；晋国内到江州不走跨国规则（表内无晋）。江州出发按晋计（如江州→临安仍52日，与临安→江州32日不对称，按用户裁定）。
- `mapTravel.ts`：限制改读 `destinations`（无落点国别提示「此国别暂不开放跨国落点」），天数优先读该落点自身表，地图标记取全部落点（含江州、不含五原）。TS 内无硬编码地点。
- 剧情转场：**未被卡**。罗盘 `travel:` 移动由 runtime 本地 `movePlayerToEventLocation` 落位，不经 canonGuard/地图选择；`lyl.jiangzhou_retreat` 江州(晋)→荆溪村寨(宋)→筠州、`lyl.lin_an_black_sea` 临安(宋)→江州(晋)→临安 均到场，零 LCQ-SAV-038。模型位置指令跨国仍被 canonGuard 拒（LCQ-SAV-038）。无需修复，冻结三文件未动。
- 证据：`tests/jiangzhouScriptedTravel.test.mjs` 新增3项；`tests/crossCountryTravel.test.mjs` 增改为65项（临安→江州32日、江州各国天数、江州出发按晋计、建康↔江州无跨国回退、五原不可点且伪造拒绝、五原→建康38日、五原→太泉截60、标记含江州不含五原、落点配置国别一致）。npm test 3028项：3015通过、0失败、13跳过（243.0秒）；npm run type-check 退出0。浏览器/真人体验未测。

## 续轮三（用户 2026-10-31 01:18 更正）
- 五原（中立边陲 liuchao.location.wuyuan）恢复为可点跨国落点：`crossCountryTravel.destinations.中立边陲=[wuyuan]`，天数按国别矩阵（上限60）。上文"五原移出落点"作废；测试改为验证五原可点、地图标记含五原。
