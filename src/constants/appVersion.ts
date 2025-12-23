// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '4.4.0',
  buildNumber: 40400,
  updateTime: '2025-12-22',
  changelog: [
    '使用 Mozilla Readability 优化获取完整内容逻辑',
    '新增 @mozilla/readability 和 linkedom 依赖以支持智能内容提取',
    '将 User-Agent 伪装为手机浏览器以获取更简洁页面',
    '使用 linkedom 创建虚拟 DOM，提高嵌套元素处理准确性',
    '处理懒加载图片，修复 data-src 等属性到 src 属性赋值',
    '自动转换图片相对路径为绝对路径，保证资源可访问',
    '应用 Readability 解析器提取文章标题和干净的正文内容',
    '移除原先基于正则的繁杂内容筛选和清理逻辑',
    '增强错误捕获和日志记录，便于调试和监控获取情况',
    '支持防盗链图片代理及相关功能优化',
    '在服务器端添加订阅接口支持极简代理模式',
    '为图片提取服务添加防盗链域名跳过验证逻辑',
    '增强本地及远程RSS服务，提升URL清理及格式校验',
    '优化RSS内容提取，增强全文抓取与内容筛选',
    '在文章与首页界面新增代理服务器地址管理及传递',
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
