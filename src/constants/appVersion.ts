// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '2.3.0',
  buildNumber: 20300,
  updateTime: '2025-12-19',
  changelog: [
    '重构版本发布及阅读设置上下文集成',
    '在 App 中集成 ReadingSettingsProvider，实现全局阅读配置同步',
    '重新设计 README.md，全面更新项目介绍及功能亮点，突出 v2.1.0 版本改进',
    '升级 Android 原生配置，优化闪屏及状态栏样式，改进启动体验',
    '引入 expo-splash-screen 依赖，配合原生代码增强启动页管理',
    '更新 package.json 依赖版本，升级 react-native-reanimated、expo-splash-screen 等库',
    '优化脚本 build-apk.js，增强跨平台兼容性与缓存清理，支持从 Git 自动生成更新日志',
    '提升 Git 日志解析逻辑，支持 conventional commit 格式的消息抽取，完善 changelog 自动生成',
    '调整 babel 配置，新增 react-native-reanimated 插件支持',
    '提升脚本执行环境兼容性，修复 Windows 终端乱码问题',
    '版本号更新至 2.2.0，以匹配最新发布内容',
    '优化文章详情页面功能和性能',
    '新增数据库字段 scroll_position，用于保存文章滚动位置',
    'ArticleService 新增保存和读取滚动位置的接口方法',
    'ArticleDetailScreen 使用 WebView 渲染文章内容，提升渲染性能和交互体验',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
