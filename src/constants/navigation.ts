// 导航相关常量配置
// 使用函数返回值来避免 Hermes 编译器在 release build 时的常量内联优化

// 底部标签栏高度
const _TAB_BAR_HEIGHT = 50;
// 标签栏垂直内边距
const _TAB_BAR_PADDING_VERTICAL = 2;
// 导航栏高度
const _HEADER_HEIGHT = 35;

// 使用函数封装，确保运行时获取值而非编译时内联
export function getTabBarHeight(): number {
  return _TAB_BAR_HEIGHT;
}

export function getTabBarPaddingVertical(): number {
  return _TAB_BAR_PADDING_VERTICAL;
}

export function getHeaderHeight(): number {
  return _HEADER_HEIGHT;
}

// 为保持向后兼容，同时导出变量（通过Object.defineProperty防止内联）
const _exports = {} as {
  TAB_BAR_HEIGHT: number;
  TAB_BAR_PADDING_VERTICAL: number;
  HEADER_HEIGHT: number;
  HEADER_TITLE_STYLE: { fontWeight: '600' };
};

Object.defineProperty(_exports, 'TAB_BAR_HEIGHT', {
  get: () => _TAB_BAR_HEIGHT,
  enumerable: true,
});

Object.defineProperty(_exports, 'TAB_BAR_PADDING_VERTICAL', {
  get: () => _TAB_BAR_PADDING_VERTICAL,
  enumerable: true,
});

Object.defineProperty(_exports, 'HEADER_HEIGHT', {
  get: () => _HEADER_HEIGHT,
  enumerable: true,
});

Object.defineProperty(_exports, 'HEADER_TITLE_STYLE', {
  get: () => ({ fontWeight: '600' as const }),
  enumerable: true,
});

export const { TAB_BAR_HEIGHT, TAB_BAR_PADDING_VERTICAL, HEADER_HEIGHT, HEADER_TITLE_STYLE } = _exports;

// 导航常量对象
export const NAVIGATION_CONSTANTS = _exports;