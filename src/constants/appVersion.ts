// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '5.0.1',
  buildNumber: 50001,
  updateTime: '2025-12-24',
  changelog: [
    '新增全局应用设置管理与过滤规则功能',
    '新增 AppSettingsContext，管理代理模式、LLM配置、RSS自动刷新等全局设置',
    '集成 AppSettingsProvider 至应用根组件包裹层级，确保全局配置有效',
    '过滤规则数据库表结构新增 filter_rules 与 filter_bindings，实现规则及绑定源存储',
    'DatabaseService 新增过滤规则管理接口，支持规则的增删改及绑定操作',
    'RSSSourceContext 增加监听缓存事件机制，支持多种事件触发后刷新 RSS 源列表',
    'HomeScreen 重构文章列表标签页，实现多标签独立分页加载和缓存管理',
    '增加后台静默刷新机制，依据用户配置自动定时刷新 RSS 源数据',
    '优化文章详情页退出时保存滚动位置，避免频繁写入造成数据库锁冲突',
    '导航栈增加过滤规则管理与编辑屏幕，支持规则的 UI 管理',
    'DatabaseService 打开数据库时配置 PRAGMA 以提升性能和避免数据库锁定问题',
    'HomeScreen 增加缓存事件订阅，细粒度清理和刷新对应标签页缓存数据',
    '优化分组管理界面及订阅源管理交互',
    '在订阅源页面标题栏添加“添加订阅源”按钮，提升操作便利性',
    '阅读偏好菜单新增“分组管理”和“过滤规则”入口，丰富设置选项',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
