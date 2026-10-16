# 多义 item id 清理映射表（2026-10-16）

由 `scripts/split-polysemous-item-ids.mjs` 生成。每行：某关卡里原 id 实际指向的物品，改指到的 id。

| 类别 | 关卡 | 原 id（主定义名） | 变体实际是 | 改指 | 选择依据 |
|---|---|---|---|---|---|
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np002`（皇后印玺） | 成光魂丹 | `lyg.item.np003` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np008`（电击棒（岳帅遗物）） | 鹿皮书写提示 | `lyg.item.np009` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np009`（鹿皮书写提示） | 白石刻字 | `lyg.item.np010` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np010`（白石刻字） | 八块羊脂玉牌（岳帅信物） | `lyg.item.np011` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np013`（白色长条石（传送石）） | 电击棒 | `lyg.item.np014` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np014`（电击棒） | 白石/岳鹏举画押石 | `lyg.item.np015` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np017`（武穆秘籍） | 岳鹏举遗信 | `lyg.item.np018` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np018`（岳鹏举遗信） | 天策令 | `lyg.item.np019` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np019`（天策令） | 沉香 | `lyg.item.np020` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np020`（沉香） | 纸符 | `lyg.item.np021` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np021`（纸符） | 美人名单 | `lyg.item.np022` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np022`（美人名单） | 舞阳侯封地 | `lyg.item.np023` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np025`（同心结（情趣用品）） | 慎恤胶 | `lyg.item.np026` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np026`（慎恤胶） | 舞都房地产开发计划 | `lyg.item.np027` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np034`（手电筒） | 可乐饮料 | `lyg.item.np037` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np036`（赤兔马） | 宣平坊程宅位置 | `lyg.item.np039` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np038`（鸦王座（钢轨模具相关？）） | 霓龙丝衣 | `lyg.item.np041` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np039`（宣平坊程宅位置） | 仙斛 | `lyg.item.np042` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np042`（仙斛） | 禁音符 | `lyg.item.np045` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np046`（太阳能电池板（疑似）） | 密码箱（珊瑚铁制） | `lyg.item.np104` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np047`（太阳能电池板（确认为可用）） | 天文望远镜 | `lyg.item.np106` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np049`（驱毒丸（改良版）） | 手提箱 | `lyg.item.np107` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np065`（薄荷油伪称催情露） | 龙槎星辰 | `lyg.item.np112` | 唯一同名 |
| 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np071`（六识禁绝丹） | 空心针 | `lyg.item.np127` | 唯一同名 |
| 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np002`（皇后印玺） | 成光魂丹 | `lyg.item.np003` | 唯一同名 |
| 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np008`（电击棒（岳帅遗物）） | 鹿皮书写提示 | `lyg.item.np009` | 唯一同名 |
| 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np009`（鹿皮书写提示） | 白石刻字 | `lyg.item.np010` | 唯一同名 |
| 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np010`（白石刻字） | 八块羊脂玉牌（岳帅信物） | `lyg.item.np011` | 唯一同名 |
| 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np017`（武穆秘籍） | 空心针 | `lyg.item.np127` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np008`（电击棒（岳帅遗物）） | 鹿皮书写提示 | `lyg.item.np009` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np009`（鹿皮书写提示） | 白石刻字 | `lyg.item.np010` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np010`（白石刻字） | 八块羊脂玉牌（岳帅信物） | `lyg.item.np011` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np013`（白色长条石（传送石）） | 电击棒 | `lyg.item.np014` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np014`（电击棒） | 白石/岳鹏举画押石 | `lyg.item.np015` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np023`（舞阳侯封地） | 龙槎星辰 | `lyg.item.np112` | 唯一同名 |
| 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np026`（慎恤胶） | 空心针 | `lyg.item.np127` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np023`（龙鳞盾） | 盘江程氏股票 | `lyl.item.np022` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np024`（汽车） | 龙鳞盾 | `lyl.item.np023` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np025`（岳鹏举钥匙） | 汽车 | `lyl.item.np024` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np031`（雷射刀） | 雷射刀（已损毁） | `lyl.item.np028` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np032`（铁箱） | 旧摄像机 | `lyl.item.np029` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np034`（琉璃天珠） | 雷射刀 | `lyl.item.np031` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np035`（禁魂鬼偶） | 铁箱 | `lyl.item.np032` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np038`（电锯） | 禁魂鬼偶 | `lyl.item.np035` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np041`（官印） | 电锯 | `lyl.item.np038` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np044`（纸钞） | 官印 | `lyl.item.np041` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np047`（奴隶烙印） | 纸钞 | `lyl.item.np044` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np048`（钓鱼竿（白龙鱼竿）） | 琥珀 | `lyl.item.np045` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np050`（求子仙符（假）） | 奴隶烙印 | `lyl.item.np047` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np053`（假死药） | 求子仙符（假） | `lyl.item.np050` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np054`（幽海螺） | 太阳能板 | `lyl.item.np051` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np057`（算缗令奏疏（原件）） | 幽海螺 | `lyl.item.np054` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np061`（玉牌） | 算缗令奏疏（原件） | `lyl.item.np057` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np062`（秘卷） | 塑料杯（替代品约定） | `lyl.item.np058` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np064`（最后一块玉牌（胶西城）） | 琉璃天樽 | `lyl.item.np060` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np065`（狐裘（吕不疑赠）） | 玉牌 | `lyl.item.np061` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np066`（太后指纹汉白玉栏杆） | 秘卷 | `lyl.item.np062` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np067`（珊瑚铁刀） | 岳帅手表（刘娥所有） | `lyl.item.np063` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np068`（都卢难旦妖铃） | 最后一块玉牌（胶西城） | `lyl.item.np064` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np069`（珊瑚紫蛇） | 狐裘（吕不疑赠） | `lyl.item.np065` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np070`（春药） | 太后指纹汉白玉栏杆 | `lyl.item.np066` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np071`（青冥琥珀） | 珊瑚铁刀 | `lyl.item.np067` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np086`（白雉） | 青冥琥珀 | `lyl.item.np071` | 唯一同名 |
| 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np091`（羽林天军腰牌） | 轩辕坟钥匙 | `lyl.item.np076` | 唯一同名 |
| 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np023`（龙鳞盾） | 盘江程氏股票 | `lyl.item.np022` | 唯一同名 |
| 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np024`（汽车） | 龙鳞盾 | `lyl.item.np023` | 唯一同名 |
| 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np025`（岳鹏举钥匙） | 汽车 | `lyl.item.np024` | 唯一同名 |
| 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np036`（阴阳鱼） | 青冥琥珀 | `lyl.item.np071` | 唯一同名 |
| 多本家人工选 | lcq.stage_04 | `lcq.item.np003`（按摩棒） | 拉链 | `lcq.item.zipper` | 语义 slug 优先于 npNNN；候选 3 个 |
| 多本家人工选 | lyg.changgan_begins | `lyg.item.np007`（舞阳侯爵位） | 电击棒（岳帅遗物） | `lyg.item.np008` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyg.changgan_begins | `lyg.item.np031`（赤阳圣果） | 摄像机 | `lyg.item.np032` | 定义与变体逐字一致；候选 3 个 |
| 多本家人工选 | lyg.changgan_begins | `lyg.item.np041`（霓龙丝衣） | 阴阳鱼 | `lyg.item.np044` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyg.changgan_begins | `lyg.item.np044`（阴阳鱼） | 比目鱼珠 | `lyg.item.np111` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyg.changgan_begins | `lyg.item.np048`（程宅特权） | 珊瑚铁 | `lyg.item.np082` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyg.changgan_begins | `lyg.item.np063`（琉璃天珠） | 手雷 | `lyg.item.np087` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np007`（舞阳侯爵位） | 电击棒（岳帅遗物） | `lyg.item.np008` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np012`（白色长条石（传送石）） | 金属虫蚁箱 | `lyg.item.np076` | 被最多关卡引用；候选 2 个 |
| 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np013`（白色长条石（传送石）） | 雪雪 | `lyg.item.np077` | 定义与变体逐字一致+被最多关卡引用；候选 4 个 |
| 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np014`（电击棒） | 青龙偃月刀 | `liuchao.item.green_dragon_sword` | 类型/品阶/属性加成一致；候选 2 个 |
| 多本家人工选 | lyg.mijing_rumen | `lyg.item.np017`（武穆秘籍） | 金属虫蚁箱 | `lyg.item.np076` | 被最多关卡引用；候选 2 个 |
| 多本家人工选 | lyl.jiangzhou_retreat | `lyl.item.np003`（屠龙刀） | 钓鱼竿（白龙鱼竿） | `lyl.item.np048` | 被最多关卡引用；候选 3 个 |
| 多本家人工选 | lyl.lin_an_black_sea | `lyl.item.np001`（鬼牙） | 龙睛玉 | `lyl.item.np004` | 定义与变体逐字一致；候选 3 个 |
| 多本家人工选 | lyl.lin_an_black_sea | `lyl.item.np004`（龙睛玉） | 都卢难旦妖铃 | `lyl.item.np068` | 定义与变体逐字一致+被最多关卡引用；候选 3 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np022`（盘江程氏股票） | 赤阳圣果 | `lyl.item.np021` | 定义与变体逐字一致；候选 3 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np036`（阴阳鱼） | 手电筒 | `lyl.item.np033` | 定义与变体逐字一致；候选 3 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np037`（蛋屋） | 琉璃天珠 | `lyl.item.np034` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np039`（摄像机） | 阴阳鱼 | `lyl.item.np036` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np046`（鲛帕） | 鲛绡 | `lyl.item.np043` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np051`（太阳能板） | 钓鱼竿（白龙鱼竿） | `lyl.item.np048` | 被最多关卡引用；候选 3 个 |
| 多本家人工选 | lyl.luoyang_coup | `lyl.item.np088`（石见之王） | 紫鳞鞭 | `lyl.item.np073` | 定义与变体逐字一致；候选 2 个 |
| 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np022`（盘江程氏股票） | 赤阳圣果 | `lyl.item.np021` | 定义与变体逐字一致；候选 3 个 |
| 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np033`（手电筒） | 都卢难旦妖铃 | `lyl.item.np068` | 定义与变体逐字一致+被最多关卡引用；候选 3 个 |
| 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np034`（琉璃天珠） | 珊瑚紫蛇 | `lyl.item.np069` | 被最多关卡引用；候选 2 个 |
| 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np035`（禁魂鬼偶） | 春药 | `lyl.item.np070` | 被最多关卡引用；候选 2 个 |
| 多本家人工选 | lyl.taiquan_expedition | `lyl.item.np001`（鬼牙） | 龙睛玉 | `lyl.item.np004` | 定义与变体逐字一致；候选 3 个 |
| 新建 | lyg.changgan_begins | `lyg.item.np052`（皇图天策府令箭） | 经济牌跑鞋 | `lyg.item.economy_sneakers` | 无同名本家，新建语义 slug |
| 新建 | lyg.dingtao_beijing | `lyg.item.np015`（白石/岳鹏举画押石） | 银龙鳞甲 | `lyg.item.silver_dragon_scale_armor` | 无同名本家，新建语义 slug |
| 新建 | lyg.mijing_rumen | `lyg.item.np021`（纸符） | 银龙鳞甲 | `lyg.item.silver_dragon_scale_armor` | 无同名本家，新建语义 slug |
| 新建 | lyg.mijing_rumen | `lyg.item.np022`（美人名单） | 残缺玉佩 | `lyg.item.broken_jade_pendant` | 无同名本家，新建语义 slug |
| 新建 | lyg.mijing_rumen | `lyg.item.np027`（舞都房地产开发计划） | 《武穆秘籍》 | `lyg.item.wumu_manual_swapped` | 无同名本家，新建语义 slug |
| 新建 | lyl.luoyang_coup | `lyl.item.np075`（雪雪（三头魔犬）） | 传国玉玺 | `lyl.item.imperial_seal` | 无同名本家，新建语义 slug |
| 新建 | lyl.luoyang_coup | `lyl.item.np076`（轩辕坟钥匙） | 虎符 | `lyl.item.tiger_tally` | 无同名本家，新建语义 slug |
| 新建 | lyl.taiquan_core_conflict | `lyl.item.np032`（铁箱） | 铁轨 | `lyl.item.iron_rail` | 无同名本家，新建语义 slug |
| 暂缓 | lcq.stage_04 | `lcq.item.np007`（龙睛玉） | 朱箓蛇丹 | —（暂缓） | 变体是不带标签的「朱箓蛇丹」，同名本家 lcq.item.np013/np016 带 antidote 标签；改指会扩大标签覆盖，按同一口径暂缓，待裁定 |
| 暂缓 | lyg.changgan_begins | `lyg.item.np068`（布都御魂） | 六识禁绝丹 | —（暂缓） | 用户 2026-10-16 明确：np068 改指带标签 np071 的「扩展标签覆盖」不做，列入待裁定 |
| 暂缓 | lyg.dingtao_beijing | `lyg.item.np016`（武穆秘籍） | 六识禁绝丹 | —（暂缓） | 变体是不带标签的「六识禁绝丹」，同名本家只有带 sedative 标签的 lyg.item.np071；改指会扩大标签覆盖，待用户裁定（2026-10-16 决定4） |
| 暂缓 | lyg.mijing_rumen | `lyg.item.np025`（同心结（情趣用品）） | 六识禁绝丹 | —（暂缓） | 同上：变体是不带标签的「六识禁绝丹」，改指 lyg.item.np071 会扩大标签覆盖，待裁定 |


---

# 复核后（2026-10-16 用户裁定 16:31/16:32）

由 `scripts/split-polysemous-item-ids-v2.mjs` 执行（一次性迁移，已执行，保留作审计；备份在 `_newbot_tmp/backup-1016h/`）。
逐行台账（机器可读）：`docs/handoffs/2026-10-16/polysemy-review-rows.json`，`tests/polysemousItemIds.test.mjs` 用它逐行核对。

## 判定口径

用户裁定：名称或描述文字不一致就不是同一个东西，一律拆独立 id；不借用别的已有 id，也不改指向带标签的药。

1. 变体原文取 327376b9 之前的 `items.json`（含 stageVariants 的 name/description/type/其它字段）；改指目标的定义取现行 `items.json` 主定义。
2. **名称 + description 逐字比对，只忽略纯空白**（不做繁简/标点归一）。两项都一致 → 同一东西，保留改指。其它字段（grade/attributeBonus 等）不参与判定；本轮顺带核对过，102 行保留行的 type/grade/techniqueId/attributeBonus/skillIds 也全部一致。
3. 任何一项不一致 → 拆为新建独立 id（语义 slug，前缀按所在关卡书系 lcq/lyg/lyl），登记进道具总表，定义取变体原文，**不带 effectTags/onUse**。名称相同但描述不同（backpack、coral_dagger）→ 按描述拆，描述相同的共用一个 id。
4. 名称近似按名称不一致处理（如「电击棒」vs「电击棒（岳帅遗物）」，拆）。**只有「仅标点差异」或「近似到不确定是不是同一个」才列待裁定并保持原状**；脚本里对「仅标点差异」有自动检测，本轮命中 0 行。
5. 暂缓 4 行：全部新建独立 id、不带标签（`validation.config.json` 的 `pendingRename` 已清空）。《武穆秘籍》掉包行 `lyg.item.wumu_manual_swapped` 保持独立。
6. 已是新建的 7 个 id：核对每个来源变体的名称+描述与新 id 定义逐字一致（全部自洽；`silver_dragon_scale_armor` 的两处来源文字完全相同，共用）。

## 统计

旧映射表实际是 107 行 = 68（自动，唯一本家）+ 27（多本家择一）+ 8（新建，对应 7 个 id）+ 4（暂缓）；任务描述里的「103 行自动改指」= 95 改指 + 8 新建行。

| 项 | 行数 | 结论 |
|---|---|---|
| 自动（唯一本家） | 68 | 全部保留改指 |
| 多本家择一 | 27 | 26 保留改指；1 行（`lyg.item.np014`@lyg.dingtao_beijing → `liuchao.item.green_dragon_sword`）描述不一致，改为新建独立 id |
| 新建（7 个 id） | 8 | 全部保留（名称+描述自洽） |
| 暂缓 | 4 | 全部新建独立 id，不带标签（3 行共用 `lyg.item.six_sense_seal_pill`） |
| 现行总表里「名称相同、描述不同」的变体 | 5 | 全部拆独立 id：backpack 1 行、liuchao.item.coral_dagger 3 行（2 个新 id）、lyl.item.coral_dagger 1 行 |
| **合计** | **112** | **保留改指 102（94 改指 + 8 新建行）；拆出 10 行 → 新增 7 个独立 id**；待裁定（自动检测）0 |

说明：任务里说「lyl.item.coral_dagger 五处变体」，现行总表实际只有 1 处变体（lyl.taiquan_core_conflict）；该 id 被 7 个关卡引用，另外 6 关用主定义。5 处「同名异描述」变体是 backpack 1 + liuchao.coral_dagger 3 + lyl.coral_dagger 1。

执行后总表 318 → 325 条，且**总表里不再有任何 stageVariants**；`np068` 在 changgan_begins 是 黎锦香、义姁 的持有物，变体文字是「广源行庞白鹄提供六识禁绝丹给吕冀，用以将赵昭仪做成活死人。义姁承认为其炼制」，关卡 JSON 里它只出现在 `canon.characters[].itemIds` 和 `content.items`，该关文本里唯一提到相关内容的是「赵昭仪实为替身友通期，其「死」系六识禁绝丹假死」——所以它实际是「六识禁绝丹」（消耗品），不是主定义的「布都御魂」。

## 新建 id 清单（共 14 个 = 上一轮 7 + 本轮 7）

| 本轮 | 旧 id | 关卡 | 名称 | 新 id | 不一致依据（旧 id 主定义 → 变体原文） |
|---|---|---|---|---|---|
| 上一轮已新建，复核自洽 | `lyg.item.np015` | lyg.dingtao_beijing | 银龙鳞甲 | `lyg.item.silver_dragon_scale_armor` | 名称不同：「白石/岳鹏举画押石」→「银龙鳞甲」；描述：刻有岳鹏举画押与‘不许小便’的白色条石，用于替代陵墓石锁填充空洞开启… → 云丹琉用血符将银龙鳞甲解开，显露出胸前肌肤。 |
| 上一轮已新建，复核自洽 | `lyg.item.np021` | lyg.mijing_rumen | 银龙鳞甲 | `lyg.item.silver_dragon_scale_armor` | 名称不同：「纸符」→「银龙鳞甲」；描述：王真人所赠符咒。 → 云丹琉用血符将银龙鳞甲解开，显露出胸前肌肤。 |
| 上一轮已新建，复核自洽 | `lyg.item.np022` | lyg.mijing_rumen | 残缺玉佩 | `lyg.item.broken_jade_pendant` | 名称不同：「美人名单」→「残缺玉佩」；描述：粉色纸笺，列有武则天、杨玉环等十六位美女名字及岳鹏举标记。 → 云传峰（云丹琉之父）的随身玉佩，被锯齿刀切过，发现于秘境林中，证明云… |
| 上一轮已新建，复核自洽 | `lyg.item.np027` | lyg.mijing_rumen | 《武穆秘籍》 | `lyg.item.wumu_manual_swapped` | 名称不同：「舞都房地产开发计划」→「《武穆秘籍》」；描述：程宗扬计划在舞都以北开发商业区，首期一千五百亩土地，计划以每亩五百金… → 小玲儿在棺中抢走《武穆秘籍》（被掉包为空白本）。 |
| 上一轮已新建，复核自洽 | `lyg.item.np052` | lyg.changgan_begins | 经济牌跑鞋 | `lyg.item.economy_sneakers` | 名称不同：「皇图天策府令箭」→「经济牌跑鞋」；描述：李药师赠予程宗扬，可凭此获得天策府协助。 → 程宗扬送给祁远一双轻质防滑跑鞋，鞋底有花纹和银箍，祁远非常珍视。 |
| 上一轮已新建，复核自洽 | `lyl.item.np032` | lyl.taiquan_core_conflict | 铁轨 | `lyl.item.iron_rail` | 名称不同：「铁箱」→「铁轨」；描述：铁箱内藏机械蜘蛛 → 武二郎在熊谷地铁站拆下两根铁轨作为武器，重约二三百斤。 |
| 上一轮已新建，复核自洽 | `lyl.item.np075` | lyl.luoyang_coup | 传国玉玺 | `lyl.item.imperial_seal` | 名称不同：「雪雪（三头魔犬）」→「传国玉玺」；描述：雪雪可变为三头魔犬，喷吐火焰、寒冰和毒雾。 → 刘建从宫中取得传国玉玺，用于矫诏 |
| 上一轮已新建，复核自洽 | `lyl.item.np076` | lyl.luoyang_coup | 虎符 | `lyl.item.tiger_tally` | 名称不同：「轩辕坟钥匙」→「虎符」；描述：小紫在轩辕坟找到钥匙 → 刘建取得虎符，可调兵 |
| 本轮新拆 | `lyg.item.np068` | lyg.changgan_begins | 六识禁绝丹 | `lyg.item.six_sense_seal_pill` | 名称不同：「布都御魂」→「六识禁绝丹」；描述：飞鸟萤子称飞鸟家族保留的神器，实为程宗扬先前获得的剑柄，黑魔海曾追查… → 广源行庞白鹄提供六识禁绝丹给吕冀，用以将赵昭仪做成活死人。义姁承认为…；该名称+描述与带标签的 `lyg.item.np071` 逐字相同，仍按裁定拆成无标签独立 id（见待裁定 1） |
| 本轮新拆 | `lyg.item.np016` | lyg.dingtao_beijing | 六识禁绝丹 | `lyg.item.six_sense_seal_pill` | 名称不同：「武穆秘籍」→「六识禁绝丹」；描述：实为玄妙子所著灵魂功法，被岳鹏举撕去封面改名为武穆秘籍，内页有批注。 → 广源行庞白鹄提供六识禁绝丹给吕冀，用以将赵昭仪做成活死人。义姁承认为…；该名称+描述与带标签的 `lyg.item.np071` 逐字相同，仍按裁定拆成无标签独立 id（见待裁定 1） |
| 本轮新拆 | `lyg.item.np025` | lyg.mijing_rumen | 六识禁绝丹 | `lyg.item.six_sense_seal_pill` | 名称不同：「同心结（情趣用品）」→「六识禁绝丹」；描述：以丝带将两女乳头扎结，用于洞房游戏。 → 广源行庞白鹄提供六识禁绝丹给吕冀，用以将赵昭仪做成活死人。义姁承认为…；该名称+描述与带标签的 `lyg.item.np071` 逐字相同，仍按裁定拆成无标签独立 id（见待裁定 1） |
| 本轮新拆 | `lcq.item.np007` | lcq.stage_04 | 朱箓蛇丹 | `lcq.item.zhulu_snake_pill` | 名称不同：「龙睛玉」→「朱箓蛇丹」；描述：程宗扬从山民处购得 → 云苍峰用于治疗蛇毒；该名称+描述与带 antidote 标签的 `lcq.item.np013`/`np016` 逐字相同，仍按裁定拆成无标签独立 id（见待裁定 1） |
| 本轮新拆 | `lyg.item.np014` | lyg.dingtao_beijing | 青龙偃月刀 | `lyg.item.green_dragon_blade_huaxiong` | 名称相同（青龙偃月刀）、描述不同：现有同名条目 `liuchao.item.green_dragon_sword`「云丹琉的家传兵器，锋利沉重。」、`liuchao.item.qinglong_saber`「云丹琉使用的长刀，由珊瑚铁强化过。」 → 变体「云丹琉使用的长刀，斩杀华雄。」，两个都不一致 |
| 本轮新拆 | `lcq.item.backpack` | lcq.stage_02 | 背包 | `lcq.item.backpack_plain` | 名称相同、描述不同：程宗扬从现代世界带来的背包，内有情趣内衣、安全套、按摩棒。 → 程宗扬从现代世界带来的背包。 |
| 本轮新拆 | `liuchao.item.coral_dagger` | lyl.jiangzhou_retreat | 珊瑚匕首 | `lyl.item.coral_dagger_from_xiao_yaoyi` | 名称相同、描述不同：从鲛人身上获得的珊瑚铁匕首，锋锐异常。 → 程宗扬从萧遥逸处获得的武器。 |
| 本轮新拆 | `liuchao.item.coral_dagger` | lyl.lin_an_black_sea | 珊瑚匕首 | `lyl.item.coral_dagger_carried` | 名称相同、描述不同：从鲛人身上获得的珊瑚铁匕首，锋锐异常。 → 锋利异常的匕首，程宗扬随身武器。 |
| 本轮新拆 | `liuchao.item.coral_dagger` | lyl.taiquan_expedition | 珊瑚匕首 | `lyl.item.coral_dagger_carried` | 名称相同、描述不同：从鲛人身上获得的珊瑚铁匕首，锋锐异常。 → 锋利异常的匕首，程宗扬随身武器。 |
| 本轮新拆 | `lyl.item.coral_dagger` | lyl.taiquan_core_conflict | 珊瑚匕首 | `lyl.item.coral_dagger_cuts_vine` | 名称相同、描述不同：程宗扬从太泉古阵获得的宝物，锋利异常。 → 一柄锋利无比的匕首，可斩断赤阳藤等坚韧物体。 |


## 复核后：112 行逐行结论

| 结论 | 来源 | 关卡 | 旧 id（主定义名） | 变体原文名称 | 最终 id | 依据 |
|---|---|---|---|---|---|---|
| 保留改指 | 多本家人工选 | lcq.stage_04 | `lcq.item.np003`（按摩棒） | 拉链 | `lcq.item.zipper` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np002`（皇后印玺） | 成光魂丹 | `lyg.item.np003` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.changgan_begins | `lyg.item.np007`（舞阳侯爵位） | 电击棒（岳帅遗物） | `lyg.item.np008` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np008`（电击棒（岳帅遗物）） | 鹿皮书写提示 | `lyg.item.np009` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np009`（鹿皮书写提示） | 白石刻字 | `lyg.item.np010` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np010`（白石刻字） | 八块羊脂玉牌（岳帅信物） | `lyg.item.np011` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np013`（白色长条石（传送石）） | 电击棒 | `lyg.item.np014` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np014`（电击棒） | 白石/岳鹏举画押石 | `lyg.item.np015` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np017`（武穆秘籍） | 岳鹏举遗信 | `lyg.item.np018` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np018`（岳鹏举遗信） | 天策令 | `lyg.item.np019` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np019`（天策令） | 沉香 | `lyg.item.np020` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np020`（沉香） | 纸符 | `lyg.item.np021` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np021`（纸符） | 美人名单 | `lyg.item.np022` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np022`（美人名单） | 舞阳侯封地 | `lyg.item.np023` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np025`（同心结（情趣用品）） | 慎恤胶 | `lyg.item.np026` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np026`（慎恤胶） | 舞都房地产开发计划 | `lyg.item.np027` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.changgan_begins | `lyg.item.np031`（赤阳圣果） | 摄像机 | `lyg.item.np032` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np034`（手电筒） | 可乐饮料 | `lyg.item.np037` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np036`（赤兔马） | 宣平坊程宅位置 | `lyg.item.np039` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np038`（鸦王座（钢轨模具相关？）） | 霓龙丝衣 | `lyg.item.np041` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np039`（宣平坊程宅位置） | 仙斛 | `lyg.item.np042` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.changgan_begins | `lyg.item.np041`（霓龙丝衣） | 阴阳鱼 | `lyg.item.np044` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np042`（仙斛） | 禁音符 | `lyg.item.np045` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.changgan_begins | `lyg.item.np044`（阴阳鱼） | 比目鱼珠 | `lyg.item.np111` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np046`（太阳能电池板（疑似）） | 密码箱（珊瑚铁制） | `lyg.item.np104` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np047`（太阳能电池板（确认为可用）） | 天文望远镜 | `lyg.item.np106` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.changgan_begins | `lyg.item.np048`（程宅特权） | 珊瑚铁 | `lyg.item.np082` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np049`（驱毒丸（改良版）） | 手提箱 | `lyg.item.np107` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 新建 | lyg.changgan_begins | `lyg.item.np052`（皇图天策府令箭） | 经济牌跑鞋 | `lyg.item.economy_sneakers` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 多本家人工选 | lyg.changgan_begins | `lyg.item.np063`（琉璃天珠） | 手雷 | `lyg.item.np087` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np065`（薄荷油伪称催情露） | 龙槎星辰 | `lyg.item.np112` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.changgan_begins | `lyg.item.np071`（六识禁绝丹） | 空心针 | `lyg.item.np127` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np002`（皇后印玺） | 成光魂丹 | `lyg.item.np003` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np007`（舞阳侯爵位） | 电击棒（岳帅遗物） | `lyg.item.np008` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np008`（电击棒（岳帅遗物）） | 鹿皮书写提示 | `lyg.item.np009` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np009`（鹿皮书写提示） | 白石刻字 | `lyg.item.np010` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np010`（白石刻字） | 八块羊脂玉牌（岳帅信物） | `lyg.item.np011` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np012`（白色长条石（传送石）） | 金属虫蚁箱 | `lyg.item.np076` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np013`（白色长条石（传送石）） | 雪雪 | `lyg.item.np077` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 新建 | lyg.dingtao_beijing | `lyg.item.np015`（白石/岳鹏举画押石） | 银龙鳞甲 | `lyg.item.silver_dragon_scale_armor` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.dingtao_beijing | `lyg.item.np017`（武穆秘籍） | 空心针 | `lyg.item.np127` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np008`（电击棒（岳帅遗物）） | 鹿皮书写提示 | `lyg.item.np009` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np009`（鹿皮书写提示） | 白石刻字 | `lyg.item.np010` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np010`（白石刻字） | 八块羊脂玉牌（岳帅信物） | `lyg.item.np011` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np013`（白色长条石（传送石）） | 电击棒 | `lyg.item.np014` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np014`（电击棒） | 白石/岳鹏举画押石 | `lyg.item.np015` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyg.mijing_rumen | `lyg.item.np017`（武穆秘籍） | 金属虫蚁箱 | `lyg.item.np076` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 新建 | lyg.mijing_rumen | `lyg.item.np021`（纸符） | 银龙鳞甲 | `lyg.item.silver_dragon_scale_armor` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 新建 | lyg.mijing_rumen | `lyg.item.np022`（美人名单） | 残缺玉佩 | `lyg.item.broken_jade_pendant` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np023`（舞阳侯封地） | 龙槎星辰 | `lyg.item.np112` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyg.mijing_rumen | `lyg.item.np026`（慎恤胶） | 空心针 | `lyg.item.np127` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 新建 | lyg.mijing_rumen | `lyg.item.np027`（舞都房地产开发计划） | 《武穆秘籍》 | `lyg.item.wumu_manual_swapped` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 多本家人工选 | lyl.jiangzhou_retreat | `lyl.item.np003`（屠龙刀） | 钓鱼竿（白龙鱼竿） | `lyl.item.np048` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.lin_an_black_sea | `lyl.item.np001`（鬼牙） | 龙睛玉 | `lyl.item.np004` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.lin_an_black_sea | `lyl.item.np004`（龙睛玉） | 都卢难旦妖铃 | `lyl.item.np068` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np022`（盘江程氏股票） | 赤阳圣果 | `lyl.item.np021` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np023`（龙鳞盾） | 盘江程氏股票 | `lyl.item.np022` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np024`（汽车） | 龙鳞盾 | `lyl.item.np023` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np025`（岳鹏举钥匙） | 汽车 | `lyl.item.np024` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np031`（雷射刀） | 雷射刀（已损毁） | `lyl.item.np028` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np032`（铁箱） | 旧摄像机 | `lyl.item.np029` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np034`（琉璃天珠） | 雷射刀 | `lyl.item.np031` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np035`（禁魂鬼偶） | 铁箱 | `lyl.item.np032` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np036`（阴阳鱼） | 手电筒 | `lyl.item.np033` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np037`（蛋屋） | 琉璃天珠 | `lyl.item.np034` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np038`（电锯） | 禁魂鬼偶 | `lyl.item.np035` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np039`（摄像机） | 阴阳鱼 | `lyl.item.np036` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np041`（官印） | 电锯 | `lyl.item.np038` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np044`（纸钞） | 官印 | `lyl.item.np041` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np046`（鲛帕） | 鲛绡 | `lyl.item.np043` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np047`（奴隶烙印） | 纸钞 | `lyl.item.np044` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np048`（钓鱼竿（白龙鱼竿）） | 琥珀 | `lyl.item.np045` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np050`（求子仙符（假）） | 奴隶烙印 | `lyl.item.np047` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np051`（太阳能板） | 钓鱼竿（白龙鱼竿） | `lyl.item.np048` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np053`（假死药） | 求子仙符（假） | `lyl.item.np050` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np054`（幽海螺） | 太阳能板 | `lyl.item.np051` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np057`（算缗令奏疏（原件）） | 幽海螺 | `lyl.item.np054` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np061`（玉牌） | 算缗令奏疏（原件） | `lyl.item.np057` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np062`（秘卷） | 塑料杯（替代品约定） | `lyl.item.np058` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np064`（最后一块玉牌（胶西城）） | 琉璃天樽 | `lyl.item.np060` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np065`（狐裘（吕不疑赠）） | 玉牌 | `lyl.item.np061` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np066`（太后指纹汉白玉栏杆） | 秘卷 | `lyl.item.np062` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np067`（珊瑚铁刀） | 岳帅手表（刘娥所有） | `lyl.item.np063` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np068`（都卢难旦妖铃） | 最后一块玉牌（胶西城） | `lyl.item.np064` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np069`（珊瑚紫蛇） | 狐裘（吕不疑赠） | `lyl.item.np065` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np070`（春药） | 太后指纹汉白玉栏杆 | `lyl.item.np066` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np071`（青冥琥珀） | 珊瑚铁刀 | `lyl.item.np067` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 新建 | lyl.luoyang_coup | `lyl.item.np075`（雪雪（三头魔犬）） | 传国玉玺 | `lyl.item.imperial_seal` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 新建 | lyl.luoyang_coup | `lyl.item.np076`（轩辕坟钥匙） | 虎符 | `lyl.item.tiger_tally` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np086`（白雉） | 青冥琥珀 | `lyl.item.np071` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.luoyang_coup | `lyl.item.np088`（石见之王） | 紫鳞鞭 | `lyl.item.np073` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.luoyang_coup | `lyl.item.np091`（羽林天军腰牌） | 轩辕坟钥匙 | `lyl.item.np076` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np022`（盘江程氏股票） | 赤阳圣果 | `lyl.item.np021` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np023`（龙鳞盾） | 盘江程氏股票 | `lyl.item.np022` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np024`（汽车） | 龙鳞盾 | `lyl.item.np023` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np025`（岳鹏举钥匙） | 汽车 | `lyl.item.np024` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 新建 | lyl.taiquan_core_conflict | `lyl.item.np032`（铁箱） | 铁轨 | `lyl.item.iron_rail` | 新建 id 的名称+描述与来源变体逐字一致 |
| 保留改指 | 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np033`（手电筒） | 都卢难旦妖铃 | `lyl.item.np068` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np034`（琉璃天珠） | 珊瑚紫蛇 | `lyl.item.np069` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.taiquan_core_conflict | `lyl.item.np035`（禁魂鬼偶） | 春药 | `lyl.item.np070` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 自动(唯一本家) | lyl.taiquan_core_conflict | `lyl.item.np036`（阴阳鱼） | 青冥琥珀 | `lyl.item.np071` | 名称+描述与目标定义逐字一致 |
| 保留改指 | 多本家人工选 | lyl.taiquan_expedition | `lyl.item.np001`（鬼牙） | 龙睛玉 | `lyl.item.np004` | 名称+描述与目标定义逐字一致 |
| 拆独立 id | 同名异描述 | lcq.stage_02 | `lcq.item.backpack`（背包） | 背包 | `lcq.item.backpack_plain` | 名称相同但描述不一致（主定义：程宗扬从现代世界带来的背包，内有情趣内衣、安全套、按摩棒。） |
| 拆独立 id | 暂缓 | lcq.stage_04 | `lcq.item.np007`（龙睛玉） | 朱箓蛇丹 | `lcq.item.zhulu_snake_pill` | 暂缓行：按裁定拆独立 id，不带标签；总表里名称+描述逐字相同的已有条目：lcq.item.np013（带标签）、lcq.item.np016（带标签） |
| 拆独立 id | 暂缓 | lyg.changgan_begins | `lyg.item.np068`（布都御魂） | 六识禁绝丹 | `lyg.item.six_sense_seal_pill` | 暂缓行：按裁定拆独立 id，不带标签；总表里名称+描述逐字相同的已有条目：lyg.item.np071（带标签） |
| 拆独立 id | 多本家人工选 | lyg.dingtao_beijing | `lyg.item.np014`（电击棒） | 青龙偃月刀 | `lyg.item.green_dragon_blade_huaxiong` | 名称相同但描述不一致（目标：云丹琉的家传兵器，锋利沉重。） |
| 拆独立 id | 暂缓 | lyg.dingtao_beijing | `lyg.item.np016`（武穆秘籍） | 六识禁绝丹 | `lyg.item.six_sense_seal_pill` | 暂缓行：按裁定拆独立 id，不带标签；总表里名称+描述逐字相同的已有条目：lyg.item.np071（带标签） |
| 拆独立 id | 暂缓 | lyg.mijing_rumen | `lyg.item.np025`（同心结（情趣用品）） | 六识禁绝丹 | `lyg.item.six_sense_seal_pill` | 暂缓行：按裁定拆独立 id，不带标签；总表里名称+描述逐字相同的已有条目：lyg.item.np071（带标签） |
| 拆独立 id | 同名异描述 | lyl.jiangzhou_retreat | `liuchao.item.coral_dagger`（珊瑚匕首） | 珊瑚匕首 | `lyl.item.coral_dagger_from_xiao_yaoyi` | 名称相同但描述不一致（主定义：从鲛人身上获得的珊瑚铁匕首，锋锐异常。） |
| 拆独立 id | 同名异描述 | lyl.lin_an_black_sea | `liuchao.item.coral_dagger`（珊瑚匕首） | 珊瑚匕首 | `lyl.item.coral_dagger_carried` | 名称相同但描述不一致（主定义：从鲛人身上获得的珊瑚铁匕首，锋锐异常。） |
| 拆独立 id | 同名异描述 | lyl.taiquan_core_conflict | `lyl.item.coral_dagger`（珊瑚匕首） | 珊瑚匕首 | `lyl.item.coral_dagger_cuts_vine` | 名称相同但描述不一致（主定义：程宗扬从太泉古阵获得的宝物，锋利异常。） |
| 拆独立 id | 同名异描述 | lyl.taiquan_expedition | `liuchao.item.coral_dagger`（珊瑚匕首） | 珊瑚匕首 | `lyl.item.coral_dagger_carried` | 名称相同但描述不一致（主定义：从鲛人身上获得的珊瑚铁匕首，锋锐异常。） |

## 待用户裁定

脚本自动检测的「仅标点差异」「同名但另有逐字一致目标」均为 0 行。以下是我拿不准、但已按「文字不一致即拆」或用户明确指令处理的点，**不要当作已批准**：

1. **无标签独立 id 与带标签本家名称+描述逐字相同（4 行，2 个新 id）**
   - `lyg.item.six_sense_seal_pill`「六识禁绝丹」← `lyg.item.np068`@lyg.changgan_begins、`lyg.item.np016`@lyg.dingtao_beijing、`lyg.item.np025`@lyg.mijing_rumen；候选目标 `lyg.item.np071`（sedative 标签 + 6 个 onUse）。
   - `lcq.item.zhulu_snake_pill`「朱箓蛇丹」← `lcq.item.np007`@lcq.stage_04；候选目标 `lcq.item.np013`/`np016`（antidote 标签）。
   - 为何拿不准：按「名称+描述逐字一致 = 同一东西」其实就是同一件物品，但本轮指令是不改指向带标签的药、不扩大标签覆盖，所以拆成无标签独立 id。这样同一件药在总表里有「带标签」和「无标签」两份。需要决定：维持（无标签，留待补效果）/ 并回带标签本家（会让这几关的这颗药带上标签）/ 给新 id 补同样标签。
2. **`lyg.item.green_dragon_blade_huaxiong`「青龙偃月刀」← `lyg.item.np014`@lyg.dingtao_beijing**：总表已有两个同名条目 `liuchao.item.green_dragon_sword`（家传兵器，锋利沉重）、`liuchao.item.qinglong_saber`（珊瑚铁强化过）和本条（云丹琉使用的长刀，斩杀华雄）描述三者互不相同。按严格口径拆；但它们很可能是同一把刀的不同侧面，是否合并（以及合到哪个）待裁。
3. **珊瑚匕首家族**：现有 `liuchao.item.coral_dagger`、`lyl.item.coral_dagger`、`lyg.item.np066`、`lyl.item.np027` 加上本轮拆出的 3 个（`lyl.item.coral_dagger_from_xiao_yaoyi`、`coral_dagger_carried`、`coral_dagger_cuts_vine`），同名「珊瑚匕首」共 7 个 id、描述各不相同。其中 `coral_dagger_cuts_vine`「一柄锋利无比的匕首，可斩断赤阳藤等坚韧物体」与 `lyl.item.np027`「珊瑚匕首锋利无比，能斩断赤阳藤」语义几乎一样、只是文字不同。按严格口径都独立；哪些其实是同一把待裁。
4. **预存的同名多 id（非本轮造成，未动）**：`lcq.item.np001` 与 `lcq.item.zipper`「拉链」（lcq.stage_02）、`lcq.item.np005` 与 `np006`「麻古」、`np013` 与 `np016`「朱箓蛇丹」（lcq 多个关卡）、另有不在同一关卡的 `lyg.item.np016` 与 `np017`「武穆秘籍」（描述也逐字相同）。这是「一个东西多个 id」的反向问题，是否合并待裁。
5. 仅供记录：`lyg.item.wumu_manual_swapped`「《武穆秘籍》」与 `np016/np017`「武穆秘籍」只差书名号，已按用户明确指示保持独立。
