// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: 'test',
  buildNumber: 1,
  updateTime: '2025-12-22',
  changelog: [
    '升级版本号至3.1.0',
    '修改android/app/build.gradle中的versionCode至30100',
    '修改android/app/build.gradle中的versionName至3.1.0',
    '更新app.json内的version为3.1.0',
    '更新app.json中android配置的versionCode为30100',
    '移除多余依赖，精简package-lock.json',
    '添加expo-haptics和expo-linear-gradient依赖版本信息',
    '升级版本号至3.0.0并调整构建配置',
    '更新app.json和android build.gradle中的版本号和buildCode',
    '修改Go服务Dockerfile支持自动架构检测及优化docker-compose配置',
    '重构导航栈，移除冗余设置堆栈，优化用户堆栈路由及页面组件',
    '替换UserProfile为MineScreen，调整相关屏幕跳转和标题',
    '优化底部标签栏样式使用主题颜色及边框，提升视觉一致性',
    '调整CustomHeader组件，支持深色模式下更合适的背景和文字颜色',
    '增强状态栏文字颜色逻辑，提升深浅色模式下的显示效果',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
