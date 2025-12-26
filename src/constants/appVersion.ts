// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '5.2.0',
  buildNumber: 50200,
  updateTime: '2025-12-25',
  changelog: [
    '添加设置组件并优化UI和性能',
    '新增SettingItem组件用于统一设置界面风格',
    '使用FlashList优化首页文章列表性能',
    '重构RSS解析器提升解析速度并减少内存占用',
    '优化文章HTML模板样式和代码块显示',
    '调整多个界面的内边距和圆角统一视觉风格',
    '新增SettingItem组件并重构多个设置页面',
    '统一调整多个页面的padding和样式细节',
    '移除部分边框样式并优化组件间距',
    '升级应用版本至5.3.0并优化性能',
    '添加@shopify/flash-list依赖以提升列表渲染性能',
    '重构RSS解析器使用正则表达式替代xmldom提升解析速度',
    '优化文章列表查询不获取content字段减少内存占用',
    '实现滚动自动标记已读功能及相邻标签预加载',
    '新增分组管理、文章限制和自动标记已读功能',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
