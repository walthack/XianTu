# 五条重写线 · 定稿节点表（2026-08-16）

> 源：（提交 c47f744）。
> 状态：**✅ ready** 已有 event 承载，现在就走得到　**🆕 new** 需新增 event（给建议挂载关与建议 id）　**⏳ pending** 待扩
> 顶点形态统一为「得到一个身份／名分」，不是「打赢一场仗」。

---

## 昭南　（国家地区线·锚地）

**入口**：南荒没有可投的朝廷，只有带你进去的人——跟云苍峰的商队同行，队里还有武二郎。

| # | 状 | 节点 | 承载关卡 | 事件 id | objective |
|---|---|---|---|---|---|
| 1 | ✅ | 跟云苍峰的商队进南荒 | `lcq.stage_03b_snake_flower_bridge` | `lcq.event.s03b_snake_flower_bridge_04` | 与云苍峰商队同行，前往白夷族 |
| 2 | ✅ | 查清蛇彝村灭村，血符指向鬼王峒 | `lcq.stage_03b_snake_flower_bridge` | `lcq.event.s03b_snake_flower_bridge_02` | 搜查蛇彝长屋，查清尸体来源 |
| 3 | ✅ | 问清花苗此刻站在哪一边 | `lcq.stage_03b_snake_flower_bridge` | `lcq.event.s03b_snake_flower_bridge_07` | 前往熊耳铺，探查贡物详情 |
| 4 | ✅ | 问清白夷此刻站在哪一边 | `lcq.stage_04` | `lcq.event.s04_07` | 与白夷族长交涉现款支付 |
| 5 | 🆕 | 赶到碧鲮湾，看清他们此刻敢不敢站出来 | `lcq.stage_05b` | `lcq.event.s05b_free_biyu` | （随新 event 一起写） |
| 6 | 🆕 | 跟花苗谈清进鬼王峒的合作边界 | `lcq.stage_05b` | `lcq.event.s05b_coop_boundary` | （随新 event 一起写） |
| 7 | ✅ | 潜入鬼王宫，当面见鬼巫王 | `lcq.stage_05b` | `lcq.event.s05b_05a_meet_ghost_king` | 在鬼王宫面见鬼巫王 |
| 8 | ✅ | 在鬼王宫里策动奴隶倒戈 | `lcq.stage_05b` | `lcq.event.s05b_10_slave_revolt_and_phoenix_change` | 在鬼王宫策动奴隶倒戈 |
| 9 | 🆕 | 在祭台上把鬼巫王这一仗打完 | `lcq.stage_05b` | `lcq.event.s05b_ghost_king_swallowed` | （随新 event 一起写） |
| 10 | 🆕 | 在破峒之后了结龙神 | `lcq.stage_05b` | `lcq.event.s05b_slay_dragon` | （随新 event 一起写） |
| 11 | 🆕 | 散峒之后，听清三族是否真的站到你这边 | `lcq.stage_05b` | `lcq.event.s05b_tribes_pledge` | （随新 event 一起写） |

**计**：✅ 6　🆕 5　⏳ 0（共 11）

**说明**：线形：商队进南荒 → 查清蛇彝 → 取得花苗／白夷／碧鲮立场（观望≠归附）→ 决战鬼巫王／龙神 → 散峒后三族真正归附。顶点＝三族真正归附（Z11 `s05b_tribes_pledge`）。隔离关 stage_05／06 不放出；斩蛇傀、合作边界、吞噬、杀龙、散峒改挂 05b 前缀／后缀。Z5／Z6／Z9／Z10／Z11 需新增。谢艺辞世不进本链（星月湖交接）。麟趾朝廷、芈氏外家、阖闾破郢、凝羽回归仍是开放线扩展位，不进这 11 条。

---

## 晋国　（国家地区线·锚地）

**入口**：想插手晋国朝局，去建康。

| # | 状 | 节点 | 承载关卡 | 事件 id | objective |
|---|---|---|---|---|---|
| 1 | ✅ | 进建康，夜探神龙殿，看清晋帝已被架空 | `lcq.stage_07_qingyuan_jiankang` | `lcq.event.s07_07_dragon_hall` | 夜探神龙殿查探异状 |
| 2 | ✅ | 鹰愁峪入瓮，等北府来解围 | `lcq.stage_08_jiankang_coup` | `lcq.event.s08_01_eagle_valley` | 鹰愁峪突围 |
| 3 | ✅ | 在玄武湖把晋帝、太后抢回来 | `lcq.stage_08_jiankang_coup` | `lcq.event.s08_10_xuanwu_rescue` | 在玄武湖保护晋帝 |
| 4 | 🆕 | 问清相府此刻站在哪一边 | `lcq.stage_09_trade_and_escape` | `lcq.event.s09_wang_maohong` | （随新 event 一起写） |
| 5 | ✅ | 问清北府此刻听谁的 | `lcq.stage_09_trade_and_escape` | `lcq.event.s09_01_eight_steeds_leave` | 在建康与萧遥逸会面 |
| 6 | 🆕 | 看清分赃：萧家江宁、云家盐业、你一无所得 | `lcq.stage_09_trade_and_escape` | `lcq.event.s09_fen_zang` | （随新 event 一起写） |
| 7 | 🆕 | 听说晋相腾出江州，让宋军来剿星月湖 | `lcq.stage_12_jiangzhou_counterwar` | `lcq.event.s12_jin_vacate` | （随新 event 一起写） |
| 8 | 🆕 | 趁晋国大旱收粮，把建康当成营销中心来做 | `lyl.taiquan_sacred_fruit` | `lyl.event.sacred_jin_drought` | （随新 event 一起写） |
| 9 | 🆕 | 把广源行在晋的旧账揭开（龙宸这条线） | `lyl.taiquan_afterfall` | `lyl.event.jin_guangyuan_ledger` | （随新 event 一起写） |
| 10 | 🆕 | 让相府把建康的盐粮路写进你的名下 | `lyl.taiquan_afterfall` | `lyl.event.jin_charter` | （随新 event 一起写） |

**计**：✅ 4　🆕 6　⏳ 0（共 10）

**说明**：线形：进建康看清帝室架空 → 宫变调查 → 相府／北府／云家立场（分赃无所得）→ 晋旱收粮＋广源行旧账 → 晋廷承认特许商权。顶点＝占位名分，原文未明、称号待定（seq 334 反证）。节点文案不写死官名。J4／J6／J7／J8／J9后半／J10 需新增。J9 前半已有龙宸 s12_14／s12_15。旧「清远斩吴」归太乙；「同门旧案」改挂汉国入口。

---

## 宋国　（国家地区线·锚地）

**入口**：想插手宋国朝局，去临安。

| # | 状 | 节点 | 承载关卡 | 事件 id | objective |
|---|---|---|---|---|---|
| 1 | ✅ | 探查贾师宪攻江州、清岳党的军令 | `lcq.stage_10_jiangzhou_shadow_war` | `lcq.event.s10_01_jiangzhou_order` | 前往江州城，探查贾师宪的军令部署 |
| 2 | ✅ | 看清江州水泥坚城，问清粮战怎么做 | `lcq.stage_11_lieshan_battle` | `lcq.event.s11_02_cement_fortress` | 前往江州，查看水泥城防 |
| 3 | ✅ | 扛住江州围城，看宋军阵线怎么破 | `lcq.stage_12_jiangzhou_counterwar` | `lcq.event.s12_11_siege_begins` | 防守江州城抵御攻城 |
| 4 | ✅ | 临安落脚，摸清这座城的暗线 | `lyl.lin_an_bridge` | `lyl.event.lin_an_bridge_01_beat` | 前往便门瓦牡丹棚打探情报 |
| 5 | 🆕 | 接下屯田司员外郎，去把籍贯落进册 | `lcq.stage_12_jiangzhou_counterwar` | `lcq.event.s12_tuntian` | （随新 event 一起写） |
| 6 | 🆕 | 问清贾师宪此刻要你推的是什么 | `lyl.xiaoyingzhou_blacksea_trap` | `lyl.event.xiaoyingzhou_paper_plan` | （随新 event 一起写） |
| 7 | ✅ | 问清高俅此刻站在哪一边 | `lyl.taiquan_sacred_fruit` | `lyl.event.taiquan_sacred_fruit_03` | 与高俅密谈，探查身世之谜 |
| 8 | ✅ | 问清太皇太后认不认你进宫 | `lyl.xiaoyingzhou_blacksea_trap` | `lyl.event.xiaoyingzhou_blacksea_trap_06_beat` | 潜入明庆寺观音殿 |
| 9 | 🆕 | 让纸钞能纳税，逼宋军退兵 | `lyl.xiaoyingzhou_blacksea_trap` | `lyl.event.xiaoyingzhou_paper_mint` | （随新 event 一起写） |
| 10 | ✅ | 在长安接下昭南索赔这档子事 | `lyg.changgan_interlude` | `lyg.event.changgan_interlude_03_beat` | 面见唐皇，应对昭南索赔 |
| 11 | 🆕 | 受礼部侍郎、通问计议使，用这颗印解宋困 | `lyg.changgan_interlude` | `lyg.event.song_tongwen` | （随新 event 一起写） |

**计**：✅ 7　🆕 4　⏳ 0（共 11）

**说明**：线形：卷入贾师宪清岳党 → 查清粮战与围城 → 相府／太尉／后宫立场 → 纸钞落地逼退＋昭南索赔 → 礼部侍郎、通问计议使。顶点＝礼部侍郎、通问计议使（seq 1134）。578 共同监制、1160 出资解困并进 S11，不另封「宝钞使」。S5／S6／S9／S11 需新增。S5 用屯田司员外郎，不用「客卿」。威远／武穆王府不上链。

---

## 汉国　（国家地区线·锚地）

**入口**：想插手汉国朝局，去洛都。

| # | 状 | 节点 | 承载关卡 | 事件 id | objective |
|---|---|---|---|---|---|
| 1 | ✅ | 跟着八骏，问清左武军怎么覆灭的 | `lcq.stage_07_qingyuan_jiankang` | `lcq.event.s07_01_old_case` | 向萧遥逸询问左武军覆灭详情 |
| 2 | ✅ | 买下官身，在汉廷立住脚 | `lyl.luoyang_cloud_secret` | `lyl.event.s05_01` | 前往云苍峰商议买官铜矿 |
| 3 | ✅ | 扛住吕氏动用汉军的围杀 | `lyl.luoyang_cloud_secret` | `lyl.event.s05_03` | 在山口镇应对吕氏围杀 |
| 4 | 🆕 | 用纸钞买田；看清限田令要把云家卷进削豪强 | `lyl.luoyang_cloud_secret` | `lyl.event.han_limit_field` | （随新 event 一起写） |
| 5 | 🆕 | 从传闻得知：天子已死，含光殿落到吕冀手里，刘建已起兵占了南宫 | `lyl.han_palace_endgame` | `lyl.event.han_power_vacuum` | （随新 event 一起写） |
| 6 | 🆕 | 决定是否出面拥立定陶王 | `lyl.han_palace_endgame` | `lyl.event.han_sponsor_dingtao` | （随新 event 一起写） |
| 7 | ✅ | 董卓无符入京；刘建伏诛 | `lyl.han_palace_endgame` | `lyl.event.han_palace_endgame_08_beat` | 前往洛都津门拦截董卓 |
| 8 | ✅ | 到场或听任新朝承认定陶王 | `lyg.dingtao_beijing` | `lyg.event.s01_05` | 到昭阳宫参与新帝登基 |
| 9 | ✅ | 吕冀赐死，见证吕雉亲裁诸吕 | `lyg.dingtao_beijing` | `lyg.event.s01_09` | 前往永巷赐死吕冀 |
| 10 | ✅ | 护住赵氏，促成新帝登基，自己以辅政定型 | `lyg.han_succession` | `lyg.event.han_succession_08_beat` | 在登基大典助程宗扬行功 |

**计**：✅ 7　🆕 3　⏳ 0（共 10）

**说明**：入口改挂（2026-08-16）：`s07_01_old_case` 跟着八骏查左武军覆灭，第 10 关即可入线；该节点同时喂星月湖。顶点＝封舞阳侯（实封五千户），辞少府只经商（seq 979）；尚无独立 event。仍缺 H4 限田／H5 真空传闻／H6 拥立选择。772 朝会粮草账、871 星月湖被诬尚未落地。`s10_04_left_army_review` 可加深调查、双喂星月湖。`taiquan_afterfall_07` 降为「人到洛都」地理拍，不再当入口。

---

## 唐国　（国家地区线·锚地）

**入口**：想插手唐国朝局，去长安。

| # | 状 | 节点 | 承载关卡 | 事件 id | objective |
|---|---|---|---|---|---|
| 1 | ✅ | 以汉使入长安，在宣平坊落脚 | `lyg.changgan_begins` | `lyg.event.s03_01` | 前往宣平坊宅院赴宴 |
| 2 | ✅ | 看见十方丛林围了大雁塔 | `lyg.changgan_begins` | `lyg.event.s03_08` | 解救被困大雁塔的小紫与吕雉 |
| 3 | ✅ | 摸清十方丛林要刺汉使 | `lyg.changgan_interlude` | `lyg.event.changgan_interlude_06_beat` | 探查十方丛林密谋，防备刺杀 |
| 4 | ✅ | 扛住十方丛林围杀 | `lyg.buddhist_conspiracy` | `lyg.event.buddhist_conspiracy_03_beat` | 在十方丛林应对僧众围杀 |
| 5 | ✅ | 揭穿窥基伪诏，逼他弃佛入魔 | `lyg.buddhist_conspiracy` | `lyg.event.buddhist_conspiracy_08_beat` | 在程宅应对窥基的假诏逼问 |
| 6 | ✅ | 甘露变在大明宫爆发 | `lyg.buddhist_conspiracy` | `lyg.event.buddhist_conspiracy_11_beat` | 在大明宫躲避神策军屠杀 |
| 7 | ✅ | 旁观李辅国审判；唐皇被弑 | `lyg.ganlu_aftershock` | `lyg.event.ganlu_aftershock_05_beat` | 旁观蓬莱秘阁的审判 |
| 8 | ✅ | 与众人合力消灭窥基魔身 | `lyg.shituolin_endgame` | `lyg.event.shituolin_endgame_05_beat` | 与众人合力消灭窥基魔身 |
| 9 | ✅ | 奉诏讨逆，莲座迎战李辅国 | `lyg.shituolin_endgame` | `lyg.event.shituolin_endgame_09_beat` | 前往大明宫参与讨逆行动 |
| 10 | ✅ | 联手斩断李辅国肉身 | `lyg.shituolin_endgame` | `lyg.event.shituolin_endgame_12_beat` | 联手斩断李辅国肉身 |
| 11 | ✅ | 阻止太皇太后被夺舍 | `lyg.shituolin_endgame` | `lyg.event.shituolin_endgame_13_beat` | 阻止太皇太后被夺舍 |
| 12 | 🆕 | 接旨大都护、上柱国 | `lyg.shituolin_endgame` | `lyg.event.shituolin_endgame_title_daduhu` | （随新 event 一起写） |
| 13 | ✅ | 搜查宫中找五肉五甘露 | `lyg.shituolin_endgame` | `lyg.event.shituolin_endgame_14_beat` | 搜查宫中找五肉五甘露 |
| 14 | ⏳ | 换身后续：长安驱魂局 | — | — | — |

**计**：✅ 12　🆕 1　⏳ 1（共 14）

**说明**：线形：以汉使入长安 → 卷入佛门纷争 → 大战窥基魔身 → 甘露变 → 李辅国换身暂告一段落。顶点＝大都护、上柱国（恩同亲王，seq 1396）。T12 需新增 `shituolin_endgame_title_daduhu`（1395 登基／1397 辞官劝告并进）。T14 换身后续：长安驱魂局，没剧本，留空待完成。旧「入仕唐廷的判据」作废。

