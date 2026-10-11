# 内容包合同 v1 · P1-CONTENT-PACK-20261011

用户授权：六项P1“做掉”。目标：新增战斗合同或试玩段落只增改JSON，不写TypeScript import、不增加runtime/AI分支。内容编辑入口是`src/modules/contentPacks/packs/<目录>/manifest.json`；派生`generated/catalog.json`不可手工编辑。打包时自动生成，canon门禁重新校验。

## 作者交付

manifest字段：`schemaVersion:1`、全局唯一`id`；以下都是JSON文件路径：

| 字段 | 文件内容 | 消费点 |
|---|---|---|
| contracts / drafts | 合同对象；draft只校验，不可进入游戏 | sceneModule注册表 |
| statuses | 状态增量数组，不允许覆盖目录id | 状态目录 |
| stages | 完整ScenarioMod；不允许覆盖内置stage id | 内置模组库 |
| overlays | `{stageId,events:[完整事件]}`数组；只允许事件，不写canon角色/年龄/归属 | 加载stage时合并 |
| questLines | 现有quest-line v1的line增量数组 | 人物/支线引擎 |
| entities | `{kind:item/skill/technique,entry:现有CatalogEntry}`数组 | 实体目录 |
| texts | `{全局textId:正文}`对象；开场/固定结局逐字移入 | 正文、人物线文本引用 |
| playtests | 试玩声明数组，含起始/结束stage、结束事件、事件范围、隔离档标记与开场textId | 试玩建档/范围 |
| entries | 首页入口数组；label/route/group/icon/testId，试玩可指定playtestId | 首页Vue数据渲染 |

文件默认相对于pack目录；迁移既有权威允许`src/...`或`mod-kit/...`仓库相对路径。拒绝绝对路径、`..`、符号链接越界与非JSON。不加载任意脚本。各pack按目录排序，id冲突拒绝，不靠后加载覆盖。

playtests支持`extends`，有环或缺父定义拒绝。派生定义保留原存档kind/extensionKey，已有清羽、南荒两期和星月湖标记不改。新入口使用已有通用`/qingyu-opening-playtest`路由并填playtestId：首页自动附pack查询，建档使用声明的characterId/slot/startModId/openingTextId，禁止用正式角色id。当前通用建档仍沿六朝主角的既有创建预设；跨题材角色不在本轮范围。

新增战斗必须引用真实event/action；默认`advance_declared_objective`也必须由该stage事件提供。合同内容修改应提升meta.version，若允许旧场内状态续用须显式列compatibleStateVersions；不得在版本不变时改变正在进行的战斗规则。旧存档最终动作可在hook.compatibleActionIds显式声明（必须存在且不能是prepare），不把旧动作文本塞进识别词表。正文、剧情边界、奖励来源、人物在场名单由剧情策划负责；数值由模块策划打磨，模型仍从API设置读取，不绑提供商。

## 编译、校验与使用

`node scripts/content-packs.mjs`生成；`--check`校验来源并核对产物逐字段一致，过期则失败，不更新catalog。`sync-builtin-mods`同步完关卡再生成；`canon:build`含内容包引用/合同校验。错误不生成新catalog。检查重复id/歧义hook、草稿或待裁定误启用、事件/action、stage schema、试玩终点所属stage、正文、路由、继承环、实体覆盖、人物线结构/引用、状态与合同lint。

hook.completionSceneByOutcome只接受win/lose的固定事实、fallback/factChecks、cast、dayPart、sceneLocation和ledgerEffects字段，主动作与旧动作均需过schema；运行时只把补丁交给账本局部副本，不改保存合同。ledgerEffects为完整对象替换，不做嵌套合并。

通用能力：目标可声明when与targetIds，前置不成立或对象不对只返回可恢复澄清；预览也执行同一前置。settings.judgement可选现有判定种类，缺省仍combat/escape。收束事件可用atClose+when，以真实场内状态决定后果；辅助轨道应声明preserveOnWin，防止赢主目标时被自动补成完成。

F06–F09引用桌面31号作者原件的已定W18–32及裁定#209：F06/F08/F09在04b；05旧id不删除、不复活。F07挂04b既有biling_bay_stance，逃兵旗标使第87章blank_letter_and_dagu的第二动作进入条件盘问合同，未逃兵不插入。F14现有作者草稿无待裁定项，按数据注册为ready；数值初值经必经胜率门禁，超上限warning保留供模块策划调参，不改旧场数值。

## 核心文件冻结

`src/modules/scenarioMods/runtime.ts`与`src/utils/AIBidirectionalSystem.ts`只接受有失败证据的bugfix，不新增事件id/角色id/入口id分支。新内容走pack；新通用结算规则走sceneModule/host或合同字段，并有独立验证。此规则是开发/审查约束，不能由词法检查自动证明一个改动确属bugfix。本轮AI文件无diff；runtime只有已证明的旧动作绕过场面门禁bugfix，共用兼容判定用于入口/结算/地点动作查找，未新增任何剧情ID分支。

## 证据边界

新增JSON合同F14由清单加载，F06–F09与第87章条件合同均经同一加载；控骰回放仅用于合法生成检查点和确定性机制验证。隔离浏览器真实模型/自然骰与回放分开记录。真实玩家体验、长期数值平衡不能由门禁或执行观察替代。正式存档/API不改，不推送。
