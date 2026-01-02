/**
 * 图片代理工具类
 * 统一管理客户端的图片代理策略，处理防盗链和被墙域名
 */

// 被墙域名列表 - 强制走公共代理
export const BLOCKED_DOMAINS = [
  'bbc.co.uk', 'bbc.com', 'bbci.co.uk',
  'nytimes.com', 'nyt.com',
  'wsj.com', 'wsj.net',
  'bloomberg.com',
  'reuters.com',
  'dw.com',
  'voanews.com',
  'rfa.org',
  'epochtimes.com',
  'ntdtv.com',
  'boxun.com',
  'creaders.net',
  'wenxuecity.com',
  '6park.com'
];

// 防盗链域名列表 - 优先走自建代理
export const ANTI_HOTLINK_DOMAINS = [
  'cdnfile.sspai.com', 'cdn.sspai.com', 'sspai.com',
  's3.ifanr.com', 'images.ifanr.cn', 'ifanr.com',
  'cnbetacdn.com', 'static.cnbetacdn.com',
  'twimg.com', 'pbs.twimg.com',
  'miro.medium.com',
  'qpic.cn', 'qlogo.cn', 'mmbiz.qpic.cn',
  'zhimg.com',
  'sinaimg.cn', 'weibo.com',
  'doubanio.com',
  'jianshu.io',
  'toutiaoimg.com',
  '36krcdn.com',
];

// WordPress 优先组：这些域名在直连模式下优先使用 WordPress 代理
// 原因是 weserv.nl 对这些域名的支持不稳定或被屏蔽
const WORDPRESS_PROXY_DOMAINS = [
  'qpic.cn', 'mmbiz.qpic.cn', // 微信
  'sinaimg.cn', 'weibo.com',  // 微博
  'zhimg.com',                // 知乎
  'doubanio.com',             // 豆瓣
];

/**
 * 检查是否需要代理
 * @param url 图片原始URL
 */
export function needsProxy(url: string): boolean {
  if (!url || url.startsWith('data:')) return false;
  
  // 防止二次代理：如果已经是代理链接，则跳过
  // 但要注意：如果 URL 本身包含了被墙域名，即使它看起来像代理（例如作为参数），
  // 我们可能仍需小心处理。不过通常代理 URL 不会直接匹配 BLOCKED_DOMAINS 的规则。
  if (url.includes('/api/image')) return false;
  // 特别注意：images.weserv.nl 自身是公共代理，不需要再代理
  if (url.includes('images.weserv.nl')) return false;
  // i0.wp.com 是 WordPress 代理
  if (url.includes('i0.wp.com') || url.includes('i1.wp.com') || url.includes('i2.wp.com')) return false;
  
  const urlLower = url.toLowerCase();
  
  // 检查是否在被墙列表或防盗链列表中
  return BLOCKED_DOMAINS.some(d => urlLower.includes(d)) || 
         ANTI_HOTLINK_DOMAINS.some(d => urlLower.includes(d));
}

/**
 * 生成代理 URL
 * @param url 原始图片 URL
 * @param proxyServerUrl 自建代理服务器地址（可选）
 */
export function toProxyUrl(url: string, proxyServerUrl?: string): string {
  if (!url) return url;
  
  // 如果不需要代理（或者是已代理的链接），直接返回
  if (!needsProxy(url)) return url;

  const urlLower = url.toLowerCase();

  // 1. 被墙域名策略：强制使用公共代理 (weserv.nl)
  // 原因：直连模式下，用户可能没有自建服务器，或者自建服务器也可能被墙。公共代理最稳妥。
  // 注意：BBC 图片经常带有 .webp 后缀或特殊参数，只要域名匹配就必须代理
  if (BLOCKED_DOMAINS.some(d => urlLower.includes(d))) {
    // 移除可能存在的查询参数干扰，确保 url 参数干净
    // weserv.nl 支持直接传原 URL
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=webp`;
  }

  // 2. 防盗链域名策略：优先使用自建代理，无自建则使用公共代理
  if (proxyServerUrl) {
    // 移除末尾斜杠
    const baseUrl = proxyServerUrl.replace(/\/$/, '');
    return `${baseUrl}/api/image?url=${encodeURIComponent(url)}`;
  }
  
  // 3. 直连模式下的防盗链兜底策略
  // 针对部分 weserv.nl 搞不定的顽固域名，使用 WordPress 代理
  if (WORDPRESS_PROXY_DOMAINS.some(d => urlLower.includes(d))) {
    // WordPress 代理格式: https://i0.wp.com/{原始URL去掉https://}
    const cleanUrl = url.replace(/^https?:\/\//, '');
    return `https://i0.wp.com/${cleanUrl}`;
  }
  
  // 4. 针对 sspai 的特殊处理：伪造 Referer
  if (urlLower.includes('sspai.com')) {
    // 强制指定 Referer 为 sspai.com，绕过防盗链
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://sspai.com')}&output=webp`;
  }
  
  // 默认兜底：公共代理 weserv.nl
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=webp`;
}
