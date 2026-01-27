// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '6.6.0',
  buildNumber: 60600,
  updateTime: '2026-01-25',
  changelog: [
    '为RSS源添加刷新与保留限制配置',
    '新增 fetchLimit 和 retentionLimit 字段，分别控制每次刷新获取数量和总保存数量',
    '在添加和编辑RSS源界面提供相应配置选项',
    '更新数据库迁移逻辑，兼容旧版 maxArticles 字段',
    '调整文章清理逻辑，使用 retentionLimit 作为保留依据',
    '同步更新版本号至6.5.5',
    '实现文章自动标记和多媒体优化功能',
    '添加自动标记已读功能的分层处理，区分UI更新和持久化操作',
    '实现CloudSyncService的状态同步调度机制，防止重复请求',
    '为ArticleService添加批量静默标记方法和源统计更新调度',
    '优化视频和iframe的多媒体展示，添加封面图和点击播放功能',
    '实现强制刷新功能并更新版本号至6.5.2',
    '更新tsconfig配置并修复Prisma导入路径',
    '实现服务端游标同步机制并优化性能',
    '添加用户源游标和同步交付表结构',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
