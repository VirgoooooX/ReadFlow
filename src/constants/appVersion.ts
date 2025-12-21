// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '3.1.0',
  buildNumber: 30100,
  updateTime: '2025-12-21',
  changelog: [
    '升级版本号至3.0.0并调整构建配置',
    '更新app.json和android build.gradle中的版本号和buildCode',
    '修改Go服务Dockerfile支持自动架构检测及优化docker-compose配置',
    '重构导航栈，移除冗余设置堆栈，优化用户堆栈路由及页面组件',
    '替换UserProfile为MineScreen，调整相关屏幕跳转和标题',
    '优化底部标签栏样式使用主题颜色及边框，提升视觉一致性',
    '调整CustomHeader组件，支持深色模式下更合适的背景和文字颜色',
    '增强状态栏文字颜色逻辑，提升深浅色模式下的显示效果',
    '优化AboutScreen和LLMSettingsScreen的样式，提升配色和间距布局',
    'LLMSettingsScreen调整选项列表渲染方式，改进分割线与选中样式',
    'ArticleDetailScreen新增传递字体设置至WebView，增强字体渲染一致性',
    '删除项目样式系统统一更新总结文档，样式改进已整合至代码中',
    '新增RSS源代理获取功能及相关设置界面',
    '新增通过代理服务器抓取RSS源的选项，适用于需要翻墙的国外源',
    '在添加和编辑RSS源界面中增加“通过代理获取”开关',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
