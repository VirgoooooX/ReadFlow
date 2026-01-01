// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '6.0.0',
  buildNumber: 60000,
  updateTime: '2025-12-31',
  changelog: [
    '实现云端同步功能并添加相关设置界面',
    '实现拖拽排序功能并优化文章详情页',
    '添加 react-native-draggable-flatlist 和 react-native-gesture-handler 依赖',
    '重构订阅管理界面支持拖拽排序',
    '优化文章详情页加载逻辑，支持传递完整文章对象实现秒开',
    '放宽 HTML 内容限制，允许 iframe 和多媒体元素',
    '增强 WebView 的多媒体支持配置',
    '增强文章详情页的多媒体支持',
    '在 WebView 中添加多媒体播放相关属性',
    '放宽 RSS 内容清理规则，保留 iframe/video/audio 标签',
    '优化文章模板的多媒体样式和交互',
    '新增 iframe 自动宽高比计算和平台特定优化',
    '为 fetch 请求添加默认浏览器 headers 以改善兼容性',
    '添加拖拽排序功能并优化UI交互',
    '引入 react-native-draggable-flatlist 和 react-native-gesture-handler 实现拖拽排序',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
