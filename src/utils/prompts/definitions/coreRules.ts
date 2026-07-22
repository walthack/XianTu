/**
 * @fileoverview 核心输出规则（AI友好格式）
 */

export const JSON_OUTPUT_RULES = `
[输出格式]
只输出JSON:{"text":"叙事","mid_term_memory":"摘要","tavern_commands":[...],"action_options":["选项1","选项2"]}
禁止:代码围栏/前后缀文本/确认消息/<thinking>标签/尾逗号/注释;字符串内换行用\\n
action_options是顶层字段,不在tavern_commands内
`.trim()

export const RESPONSE_FORMAT_RULES = `
[V3路径规则]
顶级路径:元数据./角色./社交./世界./系统.
玩家:角色.xxx | NPC:社交.关系.{NPC名}.xxx | 时间:元数据.时间.xxx | 事件:社交.事件.事件记录
禁止:人物./事件./NPC名./玩家名. 开头的路径

[数据同步]
text写什么就更新什么;无法确认的数据宁可不写;禁止猜测编造

[必须生成指令的场景]
时间:add 元数据.时间.分钟 | 位置:set 角色.位置{描述,x,y,灵气浓度}
物品:获得set/消耗add数量(负)/用完delete | 货币:add 角色.背包.货币.{币种}.数量
战斗:add 气血/灵气/神识.当前(负) | 修炼:add 境界.当前进度 | 功法:add 熟练度/push 已解锁技能
大道:解锁set完整对象/感悟add当前经验/升阶add当前阶段(+1)
NPC:新增set完整对象/好感add/记忆push/内心set/物品货币同玩家/关系网push edges
状态:push 角色.效果 | 事件:push 社交.事件.事件记录

[指令示例]
物品:{"action":"set","key":"角色.背包.物品.item_xxx","value":{物品ID,名称,类型,品质,数量,描述}}
消耗:{"action":"add","key":"角色.背包.物品.item_xxx.数量","value":-1}
删除:{"action":"delete","key":"角色.背包.物品.item_xxx"}
大道:{"action":"set","key":"角色.大道.大道列表.剑道","value":{道名,当前阶段:0,当前经验:0,阶段列表,感悟记录,关联}}
NPC:{"action":"set","key":"社交.关系.{名字}","value":{完整NPCData对象}}

[交易规则]
交易必须双向同步:买=玩家货币减+物品增+NPC货币增+物品减

[名称引用]
指令中的名称必须与存档完全一致,禁止编造;检查方法:核对存档确保key路径中的名称匹配
`.trim()

export const DATA_STRUCTURE_STRICTNESS = `
[数据结构]
只读:角色.身份/装备/技能.掌握技能/社交.记忆
境界:小突破add进度,大突破set整体
NPC:必须一次性创建完整对象,禁止残缺

[禁止整体操作路径]
顶级根/角色.属性/角色.背包/角色.功法/角色.大道/社交.关系/社交.事件/世界.地图/世界.势力
允许整体set:角色.位置/元数据.时间/角色.属性.境界

[字段操作]
字符串用set | 数组用push | 数值用add(必须是数字不是字符串)
`.trim()

export const NARRATIVE_PURITY_RULES = `
[叙事纯净]
text=纯镜头记录,只写可见/可闻/可感知画面,不读心/不解说
标记:环境【】;NPC内心反引号(成对);对话"";非判定系统提示〖〗（判定由本地引擎独占，禁止模型输出判定卡）
画面感:每回合至少1个动作细节+1次互动,结尾留钩子
字数:常规400-800字,重要场景最多1000字;禁止写到1500字以上;禁止Markdown;禁止暴露数值/机制/主角心理
`.trim()
