// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '2.5.1',
  buildNumber: 20501,
  updateTime: '2025-12-20',
  changelog: [
    '优化启动页及RSS源同步体验',
    '增加启动页保底机制，5秒后强制隐藏启动页',
    '重构App初始化逻辑，增加3秒超时保护，避免界面卡顿',
    '修改原生Android启动页样式及配置，确保全屏透明背景与图标显示',
    '注入高级原生启动页修复逻辑，自动更新styles.xml及相关资源文件',
    '升级版本号至2.4.0，更新app.json及相关配置',
    '在RSSSourceContext中新增同步所有及单个RSS源接口(syncAllSources, syncSource)',
    'HomeScreen、RSSScreen和ManageSubscriptionsScreen中添加下拉刷新实现，支持单源及全量同步',
    'ManageSubscriptionsScreen添加单个源手动刷新按钮并完善相关错误处理',
    'UserContext使用AuthService状态优化用户认证初始化与登录注册流程',
    '控制导航器引用状态，避免导航方法在未准备时调用出现异常',
    '统一启动页背景色为#E6FBFF，提升视觉一致性',
    '优化启动体验及集成阅读设置上下文',
    '使用 expo-splash-screen 阻止启动屏自动隐藏，实现自定义加载流程',
    '预加载启动图并延迟隐藏启动屏，减少闪烁提升启动视觉效果',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
