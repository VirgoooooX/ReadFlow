// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '7.0.3',
  buildNumber: 70003,
  updateTime: '2026-02-10',
  changelog: [
    '调整发布流程并分离服务器与安卓应用构建触发',
    '修改 Docker Release 工作流，仅对版本号标签触发构建，并排除 app-* 标签',
    '更新 release.mjs 脚本，移除安卓应用标签创建与推送逻辑',
    '为 build-apk.js 添加 --release 模式，支持单独推送 app-* 标签触发云端构建',
    '优化构建脚本交互流程，支持在提交后手动确认继续执行',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
