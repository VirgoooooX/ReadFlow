// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '9.1.0',
  buildNumber: 90100,
  updateTime: '2026-03-01',
  changelog: [
    '升级至 v9.0.0 并重构配置同步与认证机制',
    '升级应用版本至 9.0.0，更新 Android 与 Expo 构建配置',
    '新增 `authLogout` 事件类型，支持全局登出状态同步',
    '重构配置同步服务，新增远程配置变更检测与按需同步逻辑',
    '改进用户认证服务，添加后台会话验证与超时处理',
    '移除 LLM 相关设置及 `AppSettingsContext`，简化配置结构',
    '扩展数据库 schema，为 RSS 源、分组和过滤规则添加新字段',
    '优化 RSS 服务，支持更完善的源属性合并与更新逻辑',
    '新增服务端 `/config/meta` 接口，用于配置指纹比对',
    '修复日报生成错误提示信息',
    '清理启动代码，移除不再需要的初始化逻辑',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
