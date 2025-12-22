// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '4.3.4',
  buildNumber: 40304,
  updateTime: '2025-12-22',
  changelog: [
    '修复RSS内容中相对路径图片链接问题',
    '在服务器端添加fixRelativeImageURLs函数补全相对路径图片链接',
    'RSS内容提取前调用fixRelativeImageURLs修正图片URL',
    'LocalRSSService中增加相对路径修复调用，确保内容和图片提取准确',
    '优化fetch请求参数，支持CORS代理与重试机制',
    'AddRSSSourceScreen增加RSS验证失败的详细错误提示和解决方案',
    'appVersion及相关配置文件更新版本号至4.3.3',
    'Navigation中新增添加和编辑RSS源的界面路由与自定义标题栏',
    'RSSUtils新增fixRelativeImageUrls辅助方法，修复HTML中多种相对路径格式',
    '保持代码行长度不超过100字符，保证日志信息清晰可追踪',
    '优化文章详情页动画与震动反馈，修复提示显示逻辑',
    '修改翻页动画为淡入淡出效果，统一用户体验',
    '删除滚动显示提示时的震动，仅保留快速翻页时触发震动',
    '将震动反馈由 Medium 改为更短促的 Rigid，提升操作感受',
    '修复空白区域提示显示逻辑，支持有下一篇、最后一篇及无未读文章三种情况',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
