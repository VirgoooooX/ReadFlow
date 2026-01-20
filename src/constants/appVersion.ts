// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '6.5.3',
  buildNumber: 60503,
  updateTime: '2026-01-18',
  changelog: [
    '实现强制刷新功能并更新版本号至6.5.2',
    '更新tsconfig配置并修复Prisma导入路径',
    '实现服务端游标同步机制并优化性能',
    '添加用户源游标和同步交付表结构',
    '实现基于游标的增量同步API和确认机制',
    '优化同步性能日志记录和监控',
    '更新服务端版本信息展示',
    '添加构建脚本支持版本管理和变更日志',
    '改进云同步服务游标处理逻辑',

  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
