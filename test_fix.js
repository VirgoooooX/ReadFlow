// 测试修复逻辑
function fixImageUrl(url) {
  let fixed = url;
  
  // 处理特殊情况：file://file://data/...
  if (fixed.startsWith('file://file://') && !fixed.startsWith('file://file:///')) {
    fixed = fixed.replace('file://file://', 'file://');
  } else {
    // 处理其他情况：file://file:///...
    fixed = fixed.replace(/file:\/\/+/g, 'file://');
  }
  
  return fixed;
}

// 测试用例
const testCases = [
  'file://file://data/user/0/host.exp.exponent/files/images/test1.webp',
  'file://file:///data/user/0/host.exp.exponent/files/images/test2.webp',
  'file:///data/user/0/host.exp.exponent/files/images/test3.webp',
  'file://file://file:///data/user/0/host.exp.exponent/files/images/test4.webp'
];

console.log('测试修复逻辑:');
testCases.forEach(url => {
  const fixed = fixImageUrl(url);
  console.log(`${url}\n  -> ${fixed}\n`);
});