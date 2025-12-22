// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '4.3.0',
  buildNumber: 40300,
  updateTime: '2025-12-22',
  changelog: [
    '优化文章阅读页样式和交互体验',
    '重构文章详情页导航动画，针对翻页切换使用淡入淡出效果，返回时恢复滑动动画',
    '使用 CSS 变量实现动态换肤，提升样式维护性和主题适配能力',
    '优化文章排版样式，支持最大宽度和 Safe Area 适配，改善平板阅读体验',
    '改用事件代理处理图片点击放大，减少内存占用并提升性能',
    '视频元素包裹容器添加可见性检测，提升视频播放效率',
    '改进阅读进度计算逻辑：基于距离底部的像素，加入阈值判断避免误差',
    '利用 requestAnimationFrame 和数据去重，优化滚动监听的性能和数据一致性',
    '新增图片加载监听，动态更新阅读进度，解决图片未加载完成时进度偏差问题',
    '增加底部上滑检测用于触发下一篇文章提示，增强用户导航体验',
    '升级版本号至3.1.0',
    '修改android/app/build.gradle中的versionCode至30100',
    '修改android/app/build.gradle中的versionName至3.1.0',
    '更新app.json内的version为3.1.0',
    '更新app.json中android配置的versionCode为30100',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
