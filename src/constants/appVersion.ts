// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '2.6.1',
  buildNumber: 20601,
  updateTime: '2025-12-20',
  changelog: [
    '重构首页文章列表和导航配置优化',
    '提取 ArticleItem 组件，提升列表渲染性能和代码清晰度',
    '重构文章列表样式，优化卡片间距、阴影和未读状态',
    '简化 RootNavigator 和子导航栈配置，统一使用 getCommonScreenOptions',
    '移除 ArticleDetailScreen 中冗余导航配置，只保留隐藏原生导航栏',
    '优化刷新控件文字和颜色，增强主题适配',
    '清理冗余注释和未使用代码，提升代码整洁度',
    '统一样式定义，使用 StyleUtils 工具提取公共样式方法',
    '修正多个屏幕组件中暗色模式下的阴影和背景表现',
    '更新 app 版本号至 2.5.1，调整 buildCode 和更新时间',
    '优化启动页隐藏和App初始化逻辑',
    '移除App.tsx中onLayoutRootView回调，简化启动页隐藏逻辑',
    '改为在UserContext加载完成后延时隐藏启动页，避免界面卡顿',
    '增加3秒超时保护避免启动流程阻塞',
    '保持启动页背景色统一为#E6FBFF，提升视觉一致性',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
