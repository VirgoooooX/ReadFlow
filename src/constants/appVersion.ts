// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '6.5.0',
  buildNumber: 60500,
  updateTime: '2026-01-13',
  changelog: [
    '添加全文本抓取速率限制和特定网站内容提取',
    '为RSS解析服务添加请求限流和特殊站点处理逻辑',
    '实现基于cron表达式的定时刷新功能并优化RSS同步逻辑',
    '添加cron表达式定时刷新功能，支持在RSS源和全局设置中配置',
    '修改刷新逻辑同时支持间隔秒数和cron表达式两种方式',
    '优化文章去重逻辑和源统计更新机制',
    '调整主标题字体大小从1.6em减小到1.4em',
    '更新应用版本号至6.4.2并添加更新日志',
    '在管理订阅界面将"上次检查"改为"最近同步"',
    '实现max_articles配置自动清理非收藏文章功能',
    '从README中移除splash图片引用',
    '添加基于cron表达式的定时刷新功能',
    '在RSS源和全局设置中新增refreshCron字段支持cron表达式定时刷新',
    '添加cron-parser依赖用于解析cron表达式',
    '在管理后台添加cron表达式输入和验证功能',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
