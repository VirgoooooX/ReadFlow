// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  // 版本号
  version: '1.5.0',
  // 构建号
  buildNumber: 10500,
  // 更新时间
  updateTime: '2025-12-16',
  // 更新内容
  changelog: [
    '优化 APK 构建脚本，支持多架构和自动生成 changelog',
    '- 新增构建参数支持，如 --version 指定版本号，--auto-generate 自动生成更新日志',
    '- 支持快速构建模式跳过缓存清理，加快构建速度',
    '- 增加目标架构参数，支持仅构建指定 CPU 架构（arm64、arm、x86、x86_64）',
    '- 构建完成后自动显示 APK 文件大小及构建耗时，支持打开 APK 目录',
    '- 重构缓存清理逻辑，支持清理 Metro、npm、Gradle 缓存及构建目录',
    '- 更新版本号及 changelog 同步到 app.json 和 appVersion.ts',
    '- 修正 build.gradle 中 versionCode 和 versionName 更新逻辑',
    '文章详情页加入收藏功能及剪贴板操作',
    '- 新增收藏状态管理及切换接口，支持文章收藏和取消收藏',
  ],
};

// 应用信息
export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
