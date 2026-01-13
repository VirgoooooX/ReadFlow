// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '6.4.2',
  buildNumber: 60402,
  updateTime: '2026-01-07',
  changelog: [
    '添加基于cron表达式的定时刷新功能',
    '在RSS源和全局设置中新增refreshCron字段支持cron表达式定时刷新',
    '添加cron-parser依赖用于解析cron表达式',
    '修改刷新逻辑同时支持间隔秒数和cron表达式两种方式',
    '在管理后台添加cron表达式输入和验证功能',
    '优化文章去重逻辑避免重复抓取',
    '添加标签页未读小红点显示功能',
    '优化RSS相关性能并添加文档说明',
    '使用getFeedsLight替代getFeeds减少数据加载量',
    '调整自动刷新间隔从15秒到60秒',
    '为管理界面添加详细的设置说明',
    '限制同步接口最大分页数量为500',
    '更新缓存事件触发方式',
    '优化文章详情页性能和阅读体验',
    '实现骨架屏加载效果，优化用户等待体验',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
