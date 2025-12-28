// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '5.3.2',
  buildNumber: 50302,
  updateTime: '2025-12-27',
  changelog: [
    '实现应用启动时自动刷新RSS源功能',
    '优化RSS同步性能并添加批量刷新功能',
    '升级应用版本至5.3.1',
    '在CacheEventData接口中添加reason字段记录刷新触发原因',
    '优化HomeScreen的防抖刷新逻辑，取消等待中的刷新任务',
    '添加RSSHub URL验证逻辑，支持更多特殊字符',
    '优化ArticleService的标记已读/未读逻辑，减少不必要刷新',
    '统一使用logger替代console.log进行日志记录',
    '修复HomeScreen穿透标签时的空页面问题',
    '优化RSSSourceContext的同步逻辑，仅在新增文章时触发刷新',
    '优化RSSHub协议处理并添加事件触发原因',
    '为标记已读/未读操作添加reason参数',
    '忽略标记已读触发的统计更新以避免不必要刷新',
    '改进URL验证和处理逻辑',
    '替换console.log为logger调用',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
