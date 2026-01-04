// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '6.2.5',
  buildNumber: 60205,
  updateTime: '2026-01-04',
  changelog: [
    'feat(LLM): 实现多档案管理和功能绑定功能',
    '重构LLM设置服务，支持多档案管理和功能绑定：',
    '1. 新增LLMSettingsStoreV2数据结构，支持多档案配置',
    '2. 实现档案的增删改查和功能绑定管理',
    '3. 更新相关服务使用新档案系统',
    '4. 重做LLM设置界面，支持档案管理和绑定配置',
    '5. 完善颜色主题配置，增加容器颜色对比度',
    '6. 优化图片代理处理，支持srcset属性重写',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
