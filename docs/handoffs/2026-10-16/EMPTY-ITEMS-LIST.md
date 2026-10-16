# 内容为空的道具清单（只列不补）

日期 2026-10-16。数据来源：`mod-kit/entity-catalog/items.json`（多义 id 拆分、同文字合并后，共 279 条，**含白湖 demo 条目** `lcq.item.demo_short_knife`，已在备注栏标注；`lyg.item.dragon_pearl`（龙珠）已按 2026-10-16 17:20 用户裁定清掉；点名四组之外 31 组名称+描述逐字相同的 id 对已按用户后续裁定合并，见 `POLYSEMY-SPLIT-MAP.md` 第四轮）。
**这份只是清单：没有改任何道具、没有补任何效果标签，也没有动任何合规标记内容（effectTags / onUse）。**

## 判定口径

- **无说明**：`definition.description` 缺失、不是字符串、或去掉空白后为空。
- **无效果标签**：`definition.effectTags` 与 `definition.onUse` **都没有**（只有其一不算「无」）。「没有效果就整个字段省略」是总表的约定，所以这一栏不等于「该物品没有效果」，只表示它现在读不到任何使用效果；是否需要补由用户逐条裁定（见 `ITEM-EFFECT-TAGS-TODO.md`）。
- 遍历总表全部条目（总表里已无 stageVariants，所以每条只看主定义）；「出现关卡」取自 `stage-access.json`；「是否新建」：本轮 = 2026-10-16 16:31 裁定后新拆的 7 个独立 id，上一轮 = 327376b9 新建的 7 个语义 slug id。
- 不含内容包（`src/modules/contentPacks`）里另行登记的实体，只列道具总表（内容包目录里目前 0 个道具实体）。
- 说明很短但不是空的不列入「无说明」：`liuchao.item.moon_crescent_knife`「凝羽的武器。」、`liuchao.item.purple_scale_whip`「小紫的武器。」（仅供留意）。

## 数量

| 项 | 数量 |
|---|---|
| 总表条目 | 279 |
| **无说明** | **0** |
| **无效果标签**（无 effectTags 且无 onUse） | **274**（有标签的 5 条） |
| 两者都缺 | 0 |
| 无效果标签中：本轮新建 / 上一轮新建 | 1 / 7（新建 id 按裁定一律不带标签；原本轮新建的 7 个里 6 个已并回本家） |
| 无效果标签按类型 | other 120 / material 69 / consumable 41 / weapon 37 / armor 7 |

## 一、无说明（0 条）

无。总表每一条都有 description。

## 二、无效果标签（274 条）

| id | 名称 | 类型 | 出现关卡 | 是否新建 | 备注 |
|---|---|---|---|---|---|
| `lcq.item.backpack` | 背包 | other | lcq.stage_01 | 否 |  |
| `lcq.item.crow_bamboo_tube` | 竹筒 | other | lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.demo_short_knife` | 短刀 | weapon | （无关卡引用） | 否 | 白湖快速叙事 demo（无关卡引用） |
| `lcq.item.drug` | 摇头丸 | other | lcq.stage_02 | 否 |  |
| `lcq.item.f10_broken_axe` | 断斧 | weapon | lcq.stage_05b | 否 |  |
| `lcq.item.horse` | 马匹 | other | lcq.stage_02 | 否 |  |
| `lcq.item.jin_nang` | 锦囊 | other | lcq.stage_02 | 否 |  |
| `lcq.item.lingerie` | 情趣内衣 | other | lcq.stage_02 | 否 |  |
| `lcq.item.nh_ancient_vine_resin` | 万古藤脂 | material | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_baiyi_rice_pearl` | 米粒湖珠 | material | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_bean_bun` | 豆沙包 | consumable | lcq.stage_05b | 否 |  |
| `lcq.item.nh_bee_wax` | 鬼面蜂蜡 | material | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_beech_bark` | 山榉树皮 | material | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_biling_sea_pearl` | 碧鲮小海珠 | material | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_bird_feather` | 彩色鸟羽 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_bone_bead_string` | 骨珠串 | other | lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_boshan_incense` | 博山炉香屑 | other | lcq.stage_05b | 否 |  |
| `lcq.item.nh_candle_stub` | 残烛 | consumable | lcq.stage_05b | 否 |  |
| `lcq.item.nh_cattail_smoke` | 蒲棒 | consumable | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_clam_shell` | 蚌壳片 | material | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_clay_oil_lamp` | 残油陶灯 | other | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_coconut_shell` | 椰壳 | other | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_coral_twig` | 碎珊瑚枝 | material | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_cracked_bronze_drum` | 裂口小铜鼓 | other | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_crowman_feather` | 鸦人黑羽 | material | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_crystal_bead` | 水晶帘珠 | other | lcq.stage_05b | 否 |  |
| `lcq.item.nh_crystal_wine_cup` | 水晶酒盏 | other | lcq.stage_05b | 否 |  |
| `lcq.item.nh_cuizhi_jade_fine` | 上等翠枝玉料 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04 | 否 |  |
| `lcq.item.nh_cuizhi_jade_scrap` | 翠枝玉碎料 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04 | 否 |  |
| `lcq.item.nh_dragon_scale_chip` | 龙鳞碎屑 | material | lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_dried_fish` | 碧鲮鱼干 | consumable | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_feed_cake` | 料饼 | consumable | lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_05b | 否 |  |
| `lcq.item.nh_fine_crossbow_bolt` | 无记号弩矢 | material | lcq.stage_05b | 否 |  |
| `lcq.item.nh_fine_crossbow_trigger` | 精铁弩机牙 | material | lcq.stage_05b | 否 |  |
| `lcq.item.nh_flint_set` | 火石火镰 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04 | 否 |  |
| `lcq.item.nh_ghost_horn_shard` | 鬼角残片 | material | lcq.stage_04 | 否 |  |
| `lcq.item.nh_ghostface_stinger` | 鬼面蜂尾针 | material | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_golden_seasnake_horn` | 金角海蛇角 | material | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_goose_palm_mushroom` | 鹅掌菌 | consumable | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_huamiao_flatbread` | 花苗烙饼 | consumable | lcq.stage_03b_snake_flower_bridge、lcq.stage_05b | 否 |  |
| `lcq.item.nh_iron_nail` | 铁钉 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04 | 否 |  |
| `lcq.item.nh_lava_glass` | 凝岩黑晶 | material | lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_merfolk_scale_pouch` | 鲛人鱼鳞袋 | other | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_miao_silver_bell` | 苗银小铃 | other | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_miao_silver_torque` | 旧苗银项圈 | other | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_mountain_herb` | 山草药 | consumable | lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_niche_crystal` | 龛窟水晶 | other | lcq.stage_05b | 否 |  |
| `lcq.item.nh_orange` | 橘子 | consumable | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_pebble_necklace` | 石子项链 | other | lcq.stage_04、lcq.stage_05b | 否 |  |
| `lcq.item.nh_rat_pelt` | 鼠皮 | material | lcq.stage_04、lcq.stage_05b | 否 |  |
| `lcq.item.nh_realgar_sachet` | 雄黄避蛊香囊 | other | lcq.stage_04、lcq.stage_05b | 否 |  |
| `lcq.item.nh_red_copper_bead` | 赤铜熔珠 | material | lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_rusty_arrowhead` | 锈箭镞 | material | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_salt_lump` | 盐巴块 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04 | 否 |  |
| `lcq.item.nh_sea_glow_reef` | 海光礁 | other | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_sheyi_bone_flute` | 蛇彝骨笛 | other | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_silk_scrap` | 丝绸零头 | material | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_small_hide` | 小张兽皮 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_snake_slough` | 蛇蜕 | material | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_tarnished_trinket` | 黯淡旧首饰 | other | lcq.stage_04、lcq.stage_05b | 否 |  |
| `lcq.item.nh_tea_brick_corner` | 茶饼一角 | consumable | lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_torch` | 火把 | consumable | lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_tube_skirt_cloth` | 筒裙布头 | material | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_verdigris_shard` | 铜绿碎片 | material | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.nh_vine_fiber` | 巨藤纤维 | material | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_wild_fruit` | 野果 | consumable | lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b | 否 |  |
| `lcq.item.nh_wild_honey` | 竹筒野蜂蜜 | consumable | lcq.stage_03b_snake_flower_bridge | 否 |  |
| `lcq.item.nh_yinzhu_silk` | 阴蛛蛛丝 | material | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.np003` | 按摩棒 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np006` | 麻古 | consumable | lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np007` | 龙睛玉 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np008` | 遥控器 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np009` | 灵飞镜 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np010` | 安全套 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np011` | 珊瑚铁 | weapon | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np012` | 霓龙丝（真） | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np014` | 鲛绡 | armor | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.np015` | 紫水晶戒指 | consumable | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.s05b_bone_tiger` | 骨虎 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.s05b_dragon_eye_jade` | 龙睛玉护罩 | material | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.s05b_spiral_needle` | 螺旋长针 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.vibrator` | 按摩棒 | other | lcq.stage_02 | 否 |  |
| `lcq.item.xieyi_ashes` | 谢艺骨灰 | other | lcq.stage_05b、lcq.stage_07_qingyuan_jiankang | 否 |  |
| `liuchao.item.coral_dagger` | 珊瑚匕首 | weapon | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar、lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame、lyl.han_palace_endgame、lyl.jiangzhou_retreat、lyl.lin_an_black_sea、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_expedition、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `liuchao.item.electric_rod` | 电击棒（岳帅遗物） | weapon | lyg.mijing_rumen | 否 |  |
| `liuchao.item.ghost_fang` | 鬼牙 | other | lyl.lin_an_black_sea、lyl.taiquan_expedition | 否 |  |
| `liuchao.item.green_dragon_sword` | 青龙偃月刀 | weapon | lyg.dingtao_beijing、lyg.mijing_rumen | 否 |  |
| `liuchao.item.gui_yu_sword` | 鬼羽剑 | weapon | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `liuchao.item.long_jing_yu` | 龙睛玉 | material | lcq.stage_04 | 否 |  |
| `liuchao.item.moon_crescent_knife` | 月牙弯刀 | weapon | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `liuchao.item.parrot_fish_eye` | 比目鱼珠 | other | lyg.mijing_rumen | 否 |  |
| `liuchao.item.plate_armor_sword` | 剧孟借予的长刀 | weapon | lyg.mijing_rumen | 否 |  |
| `liuchao.item.purple_scale_whip` | 紫鳞鞭 | weapon | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `liuchao.item.qinglong_saber` | 青龙偃月刀 | weapon | lyl.luoyang_coup | 否 |  |
| `liuchao.item.red_fan` | 大红洒金折扇 | other | lyg.mijing_rumen | 否 |  |
| `liuchao.item.remote_control` | 遥控器 | other | lcq.stage_04 | 否 |  |
| `liuchao.item.rusty_cuo_dao` | 生锈错刀 | weapon | lyg.dingtao_beijing | 否 |  |
| `liuchao.item.shuang_dao` | 双刀 | weapon | lyg.dingtao_beijing | 否 |  |
| `liuchao.item.snow_snow` | 雪雪 | other | lyg.mijing_rumen | 否 |  |
| `liuchao.item.spirit_flying_mirror` | 灵飞镜 | other | lyl.lin_an_black_sea、lyl.taiquan_expedition | 否 |  |
| `liuchao.item.sunglasses` | 墨镜 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `liuchao.item.tie_tai_diao_gong` | 铁胎雕弓 | weapon | lyg.dingtao_beijing | 否 |  |
| `liuchao.item.yue_ya_duan_ji` | 月牙短戟 | weapon | lyg.dingtao_beijing | 否 |  |
| `liuchao.item.zhong_axe` | 重斧 | weapon | lyg.dingtao_beijing | 否 |  |
| `liuchao.item.zhu_hu_guan` | 朱狐冠 | other | lcq.stage_03b_snake_flower_bridge、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lyg.item.chi_tu_horse` | 赤兔马 | other | lyg.changgan_begins | 否 |  |
| `lyg.item.flashlight` | 手电筒 | other | lyg.changgan_begins | 否 |  |
| `lyg.item.fubutsu_honmaru_hilt` | 布都御魂剑柄 | weapon | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.handgun` | 手枪 | weapon | lyg.changgan_begins | 否 |  |
| `lyg.item.np002` | 皇后印玺 | weapon | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np003` | 成光魂丹 | weapon | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np007` | 舞阳侯爵位 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np008` | 电击棒（岳帅遗物） | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np009` | 鹿皮书写提示 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np010` | 白石刻字 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np011` | 八块羊脂玉牌（岳帅信物） | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np013` | 白色长条石（传送石） | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np014` | 电击棒 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np015` | 白石/岳鹏举画押石 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np017` | 武穆秘籍 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np018` | 岳鹏举遗信 | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np019` | 天策令 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np020` | 沉香 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np021` | 纸符 | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np022` | 美人名单 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np023` | 舞阳侯封地 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np025` | 同心结（情趣用品） | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np026` | 慎恤胶 | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np027` | 舞都房地产开发计划 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np031` | 赤阳圣果 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np032` | 摄像机 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np034` | 手电筒 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np036` | 赤兔马 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np037` | 可乐饮料 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np038` | 鸦王座（钢轨模具相关？） | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np039` | 宣平坊程宅位置 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np041` | 霓龙丝衣 | armor | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np042` | 仙斛 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np043` | 魂丹（泉玉姬） | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np044` | 阴阳鱼 | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np045` | 禁音符 | consumable | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np046` | 太阳能电池板（疑似） | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np047` | 太阳能电池板（确认为可用） | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np048` | 程宅特权 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np050` | 特制鞋 | material | lyg.changgan_begins | 否 |  |
| `lyg.item.np051` | 光影记录设备 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np052` | 皇图天策府令箭 | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np053` | 南霁云 | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np054` | 水晶念珠 | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np063` | 琉璃天珠 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np065` | 薄荷油伪称催情露 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np068` | 布都御魂 | weapon | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np069` | 蹶张弩（大慈恩寺收藏） | weapon | lyg.changgan_begins | 否 |  |
| `lyg.item.np070` | 皇后之宝 | material | lyg.changgan_begins | 否 |  |
| `lyg.item.np073` | 无线充电灯泡（水晶灯） | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np076` | 金属虫蚁箱 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np077` | 雪雪 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np079` | 机械螃蟹 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np082` | 珊瑚铁 | weapon | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np083` | 断剑 | weapon | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np084` | 铸铁炸弹 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np085` | 贝叶经 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np086` | 金塔（七层浮屠） | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np087` | 手雷 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np088` | 卓云君头发 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np089` | 都卢难旦妖铃 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np090` | 巫毒娃娃（卓云君形） | material | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np091` | 龙精 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np093` | 澄心棠花瓣（取自齐羽仙） | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np095` | 都卢难旦妖铃（实心玉瓶） | material | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np096` | 三头魔犬（雪雪） | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np098` | 王守澄尸体 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np101` | 程氏红宝石耳坠 | material | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np104` | 密码箱（珊瑚铁制） | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np105` | 手枪 | weapon | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np106` | 天文望远镜 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np107` | 手提箱 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np108` | 明光铠（特制） | armor | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np109` | 琼芳妙玉脂 | material | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np111` | 比目鱼珠 | other | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np112` | 龙槎星辰 | material | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np116` | 银丝导线 | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np117` | 九华丹 | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np118` | 潘金莲乳头穿刺 | weapon | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np119` | 莲花刻漏（露器） | other | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np121` | 妙法天球 | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np123` | 水晶球（徐君房） | consumable | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np124` | 阴阳帐（徐君房） | material | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np125` | 黑曜石法杖 | material | lyg.buddhist_conspiracy、lyg.changgan_interlude、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.shituolin_endgame | 否 |  |
| `lyg.item.np127` | 空心针 | weapon | lyg.buddhist_conspiracy、lyg.changgan_begins、lyg.changgan_interlude、lyg.dingtao_beijing、lyg.ganlu_aftershock、lyg.han_succession、lyg.liangzhou_league、lyg.mijing_rumen、lyg.shituolin_endgame | 否 |  |
| `lyg.item.yangwuhou_xiaoshi` | 《阳武侯小史》 | other | lyg.mijing_rumen | 否 |  |
| `lyg.item.silver_dragon_scale_armor` | 银龙鳞甲 | armor | lyg.dingtao_beijing、lyg.mijing_rumen | 上一轮新建 |  |
| `lyg.item.broken_jade_pendant` | 残缺玉佩 | weapon | lyg.mijing_rumen | 上一轮新建 |  |
| `lyg.item.wumu_manual_swapped` | 《武穆秘籍》 | other | lyg.mijing_rumen | 上一轮新建 |  |
| `lyg.item.economy_sneakers` | 经济牌跑鞋 | other | lyg.changgan_begins | 上一轮新建 |  |
| `lyl.item.fishing_rod` | 白龙鱼竿 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np001` | 鬼牙 | other | lyl.han_palace_endgame、lyl.jiangzhou_retreat、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np003` | 屠龙刀 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np004` | 龙睛玉 | material | lyl.han_palace_endgame、lyl.lin_an_black_sea、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_expedition、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np005` | 金瓶梅 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np007` | 雷霆刀 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np010` | 纸币 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np011` | 手雷 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np013` | 通源行 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np014` | 武穆王府 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np015` | 药丸（殇侯制） | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np016` | 袈裟符文 | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np017` | 雷射战刀 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np018` | 雷射宝刀 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np021` | 赤阳圣果 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np022` | 盘江程氏股票 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np023` | 龙鳞盾 | armor | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np024` | 汽车 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np025` | 岳鹏举钥匙 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np028` | 雷射刀（已损毁） | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np029` | 旧摄像机 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np031` | 雷射刀 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np032` | 铁箱 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np033` | 手电筒 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np034` | 琉璃天珠 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np035` | 禁魂鬼偶 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np036` | 阴阳鱼 | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np037` | 蛋屋 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np038` | 电锯 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np039` | 摄像机 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np041` | 官印 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np043` | 鲛绡 | armor | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np044` | 纸钞 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np045` | 琥珀 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np046` | 鲛帕 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np047` | 奴隶烙印 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np048` | 钓鱼竿（白龙鱼竿） | other | lyl.han_palace_endgame、lyl.jiangzhou_retreat、lyl.lin_an_black_sea、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_expedition、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np050` | 求子仙符（假） | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np051` | 太阳能板 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np054` | 幽海螺 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np057` | 算缗令奏疏（原件） | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np058` | 塑料杯（替代品约定） | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np060` | 琉璃天樽 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np061` | 玉牌 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np062` | 秘卷 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np063` | 岳帅手表（刘娥所有） | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np064` | 最后一块玉牌（胶西城） | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np065` | 狐裘（吕不疑赠） | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np066` | 太后指纹汉白玉栏杆 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np067` | 珊瑚铁刀 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np068` | 都卢难旦妖铃 | material | lyl.han_palace_endgame、lyl.lin_an_black_sea、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np069` | 珊瑚紫蛇 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np070` | 春药 | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np071` | 青冥琥珀 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_core_conflict、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np073` | 紫鳞鞭 | weapon | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np075` | 雪雪（三头魔犬） | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np076` | 轩辕坟钥匙 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np078` | 五灵石 | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np080` | 太泉古阵物品 | armor | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np086` | 白雉 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np087` | 电子显微镜 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np088` | 石见之王 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np089` | 三条秀子 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np091` | 羽林天军腰牌 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np092` | 软晶玉杯 | material | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np094` | 黄泉蝶变 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np096` | 陶氏十七万取款凭证（白鹿皮） | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np097` | 仙草叶片（催情作用） | consumable | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np101` | 胡夫人借据（十万金铢） | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.luoyang_coup、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.np102` | 左武军产业 | other | lyl.luoyang_coup | 否 |  |
| `lyl.item.np103` | 龙牙锥 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.xuexue` | 雪雪 | other | lyl.han_palace_endgame、lyl.lin_an_bridge、lyl.luoyang_cloud_secret、lyl.taiquan_afterfall、lyl.taiquan_sacred_fruit、lyl.xiaoyingzhou_blacksea_trap | 否 |  |
| `lyl.item.iron_rail` | 铁轨 | material | lyl.taiquan_core_conflict | 上一轮新建 |  |
| `lyl.item.imperial_seal` | 传国玉玺 | material | lyl.luoyang_coup | 上一轮新建 |  |
| `lyl.item.tiger_tally` | 虎符 | consumable | lyl.luoyang_coup | 上一轮新建 |  |
| `lcq.item.zipper` | 拉链 | other | lcq.stage_01、lcq.stage_02、lcq.stage_03b_snake_flower_bridge、lcq.stage_04、lcq.stage_04b_lingfei_baiyi_crisis、lcq.stage_05b、lcq.stage_07_qingyuan_jiankang、lcq.stage_08_jiankang_coup、lcq.stage_09_trade_and_escape、lcq.stage_10_jiangzhou_shadow_war、lcq.stage_11_lieshan_battle、lcq.stage_12_jiangzhou_counterwar | 否 |  |
| `lcq.item.ajiman_bond` | 阿姬曼身契 | other | lcq.stage_02 | 否 |  |
| `lcq.item.biling_algae_sample` | 霓龙丝（伪） | other | lcq.stage_04b_lingfei_baiyi_crisis | 否 |  |
| `lcq.item.backpack_plain` | 背包 | other | lcq.stage_02 | **本轮新建** |  |
