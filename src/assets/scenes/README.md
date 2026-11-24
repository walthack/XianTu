# 场景图

用户 2026-11-16 定：新的立绘、场景图、CG 都放在仓库 `src/assets/` 下，各一个子目录（与 `endings/` 并列）。本目录放场景图。

- 文件名约定：`scenes/<类型>__<变体>.<扩展名>（该类型的默认图：<类型>.<扩展名>）`
- 扩展名只用小写的 png／webp／jpg／jpeg。
- 放进来的图要在所属内容包的 `assets.json` 里登记才会被用到；登记的 `file` 从 `src/assets/` 起算（即以 `scenes/` 开头）。格式与缺图回落见 `docs/handoffs/2026-10-11/CONTENT-PACK-CONTRACT.md`「图片挂位 assets」。
- 打包规则已加（用户 2026-11-21 同意，`webpack.config.js`，只管 characters／scenes／cg 三个目录），取网址用 `src/assets/packImages.ts`。
- **2026-11-25 起新界面场景框已接**：第一批 37 张（16 类白天、6 张夜图、15 张地点单图）登记在 `src/modules/contentPacks/packs/qingyu/scene-assets.json`，同一个文件里的 `locationScenes` 写明哪个地点用哪几类。没登记的地点场景框只写地点名。
- **图片文件不在仓库里**（和立绘一样，本仓库是公开的，图不推）。文件名是 `<类型>.webp`、`<类型>__night.webp`、`loc_<地点>.webp`，2560×1600。没有文件时界面按没有图处理，不报错。要看图就把文件拷进本目录再打包；不要提交。
