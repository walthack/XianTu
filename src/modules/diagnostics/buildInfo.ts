/** 运行期读取构建期注入的版本信息（DefinePlugin）；测试/未注入环境回退 'unknown'。 */
export interface BuildInfo {
  version: string;
  buildId: string;
  gitSha: string;
  contentPackVersion: string;
}

export function getBuildInfo(): BuildInfo {
  return {
    version: typeof APP_VERSION !== 'undefined' && APP_VERSION ? APP_VERSION : 'unknown',
    buildId: typeof BUILD_ID !== 'undefined' && BUILD_ID ? BUILD_ID : 'unknown',
    gitSha: typeof GIT_SHA !== 'undefined' && GIT_SHA ? GIT_SHA : 'unknown',
    contentPackVersion:
      typeof CONTENT_PACK_VERSION !== 'undefined' && CONTENT_PACK_VERSION ? CONTENT_PACK_VERSION : 'unknown',
  };
}

/** `v0.1.0 (a1b2c3d-20261018)` */
export const formatVersionLabel = (info: BuildInfo = getBuildInfo()): string => `v${info.version} (${info.buildId})`;

/** `v0.1.0 (a1b2c3d-20261018) · 内容包 990e8d3506cc779b` */
export const formatVersionDetail = (info: BuildInfo = getBuildInfo()): string =>
  `${formatVersionLabel(info)} · 内容包 ${info.contentPackVersion}`;
