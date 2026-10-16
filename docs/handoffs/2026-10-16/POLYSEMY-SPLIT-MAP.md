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
