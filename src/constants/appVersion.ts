// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '2.2.0',
  buildNumber: 20200,
  updateTime: '2025-12-19',
  changelog: [
    '优化编辑RSS源页面与构建脚本',
    '替换 react-navigation stack 导航类型为 native-stack 类型',
    '编辑RSS界面添加键盘避免视图行为提升用户体验',
    '调整内容类型切换按钮颜色与样式一致性',
    '优化构建脚本中日志提取逻辑，支持更多提交类型和列表项提取',
    '提高 changelog 提取内容数量及去重处理',
    '构建日志输出中增加 app.json 和 appVersion.ts 保存状态提示',
    '移除 package.json 中未使用依赖，减少依赖体积',
    '删除 HomeScreen 中未使用的 TabView 相关依赖与导入',
    'Add Android native project setup, configure splash screen, and update app version.',
    'establish foundational application structure with navigation, theming, settings, and database services.',
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
