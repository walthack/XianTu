# 局域网云存档与云配置同步

本文说明仙途测试服的三类局域网同步能力：人物存档、API 管理配置、提示词自定义配置。

## 目标

- 同一局域网内的不同电脑打开 `http://192.168.50.51:8091` 时，共用同一份服务端存储。
- 单机人物存档不再只留在当前浏览器 IndexedDB。
- API 管理配置可以手动上传覆盖云端，也可以从云端下载覆盖本机。
- 提示词自定义项自动同步，换电脑后不需要再手动导出导入。
- 不要求用户注册或登录。

## 服务端接口

统一使用同源接口：

```text
/api/v1/save-storage/:key
```

局域网开发/测试环境下，浏览器只请求同源路径，例如：

```text
http://192.168.50.51:8091/api/v1/save-storage/user_config_api_management_v1
```

不要在浏览器侧写 `127.0.0.1`。其它电脑访问测试服时，`127.0.0.1` 会指向它们自己的机器。

当前 webpack dev server 内置了一个轻量存储服务：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/save-storage/:key` | 读取记录，不存在返回 `404` |
| `PUT` | `/api/v1/save-storage/:key` | 写入或覆盖记录 |
| `DELETE` | `/api/v1/save-storage/:key` | 删除单条记录 |
| `DELETE` | `/api/v1/save-storage?prefix=xxx` | 按 key 前缀批量删除 |
| `OPTIONS` | `/api/v1/save-storage/:key` | 预检请求 |

写入格式：

```json
{
  "id": "user_config_api_management_v1",
  "data": {},
  "timestamp": "2026-07-01T00:00:00.000Z"
}
```

数据文件默认落在：

```text
.xiantu-server/save-storage/
```

该目录已加入 `.gitignore`，其中可能包含 API Key，不能提交。

## 配置项

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `XIANTU_SAVE_STORAGE_DIR` | `.xiantu-server/save-storage` | 本地存储文件目录 |
| `XIANTU_BACKEND_URL` | `http://192.168.50.51:8080` | 其它 `/api` 请求的代理目标 |
| `BACKEND_BASE_URL` | 空 | 生产环境后端地址；开发/局域网环境默认走同源代理 |
| `REMOTE_SAVE_STORAGE_ENABLED` | `true` | 设为 `false` 可关闭远程存档同步 |

测试服由 LaunchAgent 常驻：

```bash
launchctl kickstart -k gui/$(id -u)/com.xiantu.devserver
```

日志位置：

```text
~/Library/Logs/xiantu-devserver.log
```

启动日志中应能看到：

```text
[本地存储] save-storage 目录: ...
[HPM] Proxy created: /api -> http://192.168.50.51:8080
```

## 云存档

实现入口：

- `src/utils/indexedDBManager.ts`
- `src/services/backendConfig.ts`

同步 key：

| key | 内容 |
|---|---|
| `characters` | 角色列表 |
| `active_save` | 当前激活存档 |
| `savedata_{characterId}_{slotId}` | 具体存档数据 |
| `scenario_mod_library_v1` | 剧本 Mod 库 |

保存策略：

- 本地 IndexedDB 仍然是兜底。
- 后端可用时，同时写入 `/api/v1/save-storage`。
- 后端返回 `404` 表示远端暂无数据，继续使用本地。
- 后端返回 `405` 或 `501` 时，本次会话关闭远程存档并回退本地。
- 剧本 Mod 库加载时会合并远端和本地，同 ID 时本地导入优先。
- 远程保存成功时会提示用户，避免用户误以为只保存到了本地。

## 云 API 管理配置

实现入口：

- `src/stores/apiManagementStore.ts`
- `src/components/dashboard/APIManagementPanel.vue`
- `src/services/userCloudStorage.ts`

同步 key：

```text
user_config_api_management_v1
```

包含内容：

- `apiConfigs`
- `apiAssignments`
- `functionModes`
- `functionEnabled`
- `aiGenerationSettings`

使用方式：

- 在“API 管理”点击“上传云端”，会用当前浏览器配置覆盖服务端配置。
- 点击“下载云端”，会用服务端配置覆盖当前浏览器本地配置。
- 首次加载时会尝试读取云端配置；若云端为空且本地已有配置，会自动种子写入云端。
- 上传和下载都不要求登录。若后端返回 `401`，说明服务端权限配置仍在要求认证，需要调整 `/api/v1/save-storage`。

安全注意：

- API Key 会随配置写入服务端存储。
- `.xiantu-server/save-storage/` 必须保持私有并忽略版本控制。
- 不要把云配置 JSON 发给不可信设备或提交到仓库。

## 云提示词配置

实现入口：

- `src/services/prompts/promptStorage.ts`
- `src/services/userCloudStorage.ts`

同步 key：

```text
user_config_prompts_v1
```

同步范围：

- 只同步用户自定义覆盖项，也就是 IndexedDB `dad-prompts` 中的记录。
- 默认提示词不重复写入云端，仍由代码中的默认定义提供。

加载与保存策略：

- 第一次加载提示词时读取云端覆盖项。
- 如果云端存在覆盖项，先清空本地覆盖项，再写入云端版本。
- 如果云端为空但本地已有覆盖项，会自动上传本地覆盖项。
- 保存、启用/禁用、重置、导入后会同步云端。

## 手动验证

写入并读取一个探针：

```bash
curl -i -X PUT \
  http://192.168.50.51:8091/api/v1/save-storage/__probe__ \
  -H 'Content-Type: application/json' \
  --data '{"data":{"ok":true}}'

curl -i http://192.168.50.51:8091/api/v1/save-storage/__probe__
```

删除探针：

```bash
curl -i -X DELETE \
  http://192.168.50.51:8091/api/v1/save-storage/__probe__
```

查看 API 管理配置是否已上传，不打印密钥：

```bash
node - <<'NODE'
const fs = require('fs');
const file = '.xiantu-server/save-storage/user_config_api_management_v1.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8')).data;
console.log({
  apiConfigCount: Array.isArray(data.apiConfigs) ? data.apiConfigs.length : 0,
  assignmentCount: Array.isArray(data.apiAssignments) ? data.apiAssignments.length : 0,
});
NODE
```

## 常见问题

### 上传提示“请先登录账号”

前端不再主动要求登录。若仍出现该提示，通常是旧 bundle 缓存或访问了错误域名。重启测试服并刷新页面。

### 上传云端失败，状态为 401

后端仍要求认证。当前局域网测试服的内置 `save-storage` 不要求登录；如果接入独立后端，需要放开 `/api/v1/save-storage` 或提供无账号的设备级存储策略。

### 上传云端失败，状态为 404/405/501

说明当前服务没有实现对应接口，或请求被代理到了错误后端。检查测试服日志中的 `/api` 代理目标，以及是否出现 `[本地存储] save-storage 目录`。

### 其它电脑无法同步

确认其它电脑访问的是：

```text
http://192.168.50.51:8091
```

不要访问 `localhost` 或 `127.0.0.1`。浏览器请求应保持同源 `/api/v1/save-storage/...`。

### 不想启用远程存档

启动前设置：

```bash
REMOTE_SAVE_STORAGE_ENABLED=false npm run serve -- --host 0.0.0.0 --port 8091
```

API 管理和提示词配置仍可使用 `userCloudStorage` 的云配置接口；该变量只控制 `indexedDBManager` 中的人物存档远程同步。
