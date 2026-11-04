/**
 * 内测／正式构建的功能默认值（用户 2026-11-04 11:31 批准「内测默认开」）。
 * 构建判定同 apiManagementStore 的 DEV_BUILD_DEFAULTS：webpack.config.js 的 MODULE_DEV_DEFAULTS＝!isProduction，
 * 即 8091 内测版（--mode development）为 true、正式版（--mode production）为 false；测试环境未定义按正式版。
 * 配置里的功能开关写成 { enabled, enabledDev }：内测构建读 enabledDev，正式构建读 enabled；只认布尔 true，缺省按关。
 */

export const IS_MODULE_DEV_BUILD = typeof MODULE_DEV_DEFAULTS !== 'undefined' && MODULE_DEV_DEFAULTS === true;

export interface BuildDefaultSwitch { enabled?: unknown; enabledDev?: unknown }

/** 按构建取功能开关（dualModel、story.quest 等所有读 enabled 的地方都走这里）。devBuild 只供测试模拟。 */
export function buildDefaultEnabled(flag: BuildDefaultSwitch | null | undefined, devBuild: boolean = IS_MODULE_DEV_BUILD): boolean {
  return (devBuild ? flag?.enabledDev : flag?.enabled) === true;
}
