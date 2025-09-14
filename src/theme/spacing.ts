// Material Design 3 Spacing System
// 基于8dp网格系统的间距定义

// 基础间距单位 (8dp)
const BASE_UNIT = 8;

// 间距标记系统
export const spacing = {
  // 基础间距 (0-7)
  none: 0,
  xs: BASE_UNIT * 0.5,    // 4dp
  sm: BASE_UNIT * 1,      // 8dp
  md: BASE_UNIT * 2,      // 16dp
  lg: BASE_UNIT * 3,      // 24dp
  xl: BASE_UNIT * 4,      // 32dp
  xxl: BASE_UNIT * 5,     // 40dp
  xxxl: BASE_UNIT * 6,    // 48dp

  // 扩展间距 (8+)
  huge: BASE_UNIT * 8,    // 64dp
  massive: BASE_UNIT * 12, // 96dp

  // 语义化间距
  padding: {
    xs: BASE_UNIT * 0.5,   // 4dp - 最小内边距
    sm: BASE_UNIT * 1,     // 8dp - 小内边距
    md: BASE_UNIT * 2,     // 16dp - 标准内边距
    lg: BASE_UNIT * 3,     // 24dp - 大内边距
    xl: BASE_UNIT * 4,     // 32dp - 超大内边距
  },

  margin: {
    xs: BASE_UNIT * 0.5,   // 4dp - 最小外边距
    sm: BASE_UNIT * 1,     // 8dp - 小外边距
    md: BASE_UNIT * 2,     // 16dp - 标准外边距
    lg: BASE_UNIT * 3,     // 24dp - 大外边距
    xl: BASE_UNIT * 4,     // 32dp - 超大外边距
  },

  gap: {
    xs: BASE_UNIT * 0.5,   // 4dp - 最小间隙
    sm: BASE_UNIT * 1,     // 8dp - 小间隙
    md: BASE_UNIT * 2,     // 16dp - 标准间隙
    lg: BASE_UNIT * 3,     // 24dp - 大间隙
    xl: BASE_UNIT * 4,     // 32dp - 超大间隙
  },
};

// 组件特定间距
export const componentSpacing = {
  // 按钮间距
  button: {
    paddingHorizontal: spacing.md,  // 16dp
    paddingVertical: spacing.sm,    // 8dp
    minHeight: 40,                  // 最小高度
    iconSpacing: spacing.sm,        // 图标与文字间距
  },

  // 卡片间距
  card: {
    padding: spacing.md,            // 16dp
    margin: spacing.sm,             // 8dp
    borderRadius: 12,               // 圆角
  },

  // 列表项间距
  listItem: {
    paddingHorizontal: spacing.md,  // 16dp
    paddingVertical: spacing.sm,    // 8dp
    minHeight: 48,                  // 最小高度
    iconSpacing: spacing.md,        // 图标间距
  },

  // 输入框间距
  input: {
    paddingHorizontal: spacing.md,  // 16dp
    paddingVertical: spacing.sm,    // 8dp
    minHeight: 48,                  // 最小高度
    borderRadius: 8,                // 圆角
  },

  // 标签页间距
  tab: {
    paddingHorizontal: spacing.md,  // 16dp
    paddingVertical: spacing.sm,    // 8dp
    minHeight: 48,                  // 最小高度
  },

  // 工具栏间距
  toolbar: {
    paddingHorizontal: spacing.md,  // 16dp
    height: 56,                     // 标准工具栏高度
  },

  // 底部导航间距
  bottomNav: {
    paddingHorizontal: spacing.sm,  // 8dp
    paddingVertical: spacing.xs,    // 4dp
    height: 60,                     // 底部导航高度
  },
};

// 布局间距
export const layoutSpacing = {
  // 屏幕边距
  screenPadding: {
    horizontal: spacing.md,         // 16dp
    vertical: spacing.lg,           // 24dp
  },

  // 容器间距
  container: {
    maxWidth: 1200,                 // 最大宽度
    padding: spacing.md,            // 16dp
  },

  // 网格间距
  grid: {
    gutter: spacing.md,             // 16dp - 网格间隙
    margin: spacing.md,             // 16dp - 网格外边距
  },

  // 分割线
  divider: {
    thickness: 1,                   // 分割线厚度
    margin: spacing.sm,             // 8dp - 分割线边距
  },
};

// 圆角半径系统
export const borderRadius = {
  none: 0,
  xs: 4,      // 小圆角
  sm: 8,      // 标准圆角
  md: 12,     // 中等圆角
  lg: 16,     // 大圆角
  xl: 20,     // 超大圆角
  xxl: 24,    // 特大圆角
  full: 9999, // 完全圆角

  // 组件特定圆角
  button: 20,     // 按钮圆角
  card: 12,       // 卡片圆角
  input: 8,       // 输入框圆角
  chip: 16,       // 标签圆角
  avatar: 9999,   // 头像圆角（圆形）
};

// 阴影和高度系统
export const elevation = {
  // Material Design 3 elevation levels
  level0: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  level1: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  level2: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  level3: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  level4: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  level5: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 5,
  },
};

// 尺寸系统
export const sizes = {
  // 图标尺寸
  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 48,
  },

  // 头像尺寸
  avatar: {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 56,
    xl: 80,
  },

  // 按钮尺寸
  button: {
    sm: { height: 32, minWidth: 64 },
    md: { height: 40, minWidth: 80 },
    lg: { height: 48, minWidth: 96 },
  },

  // 输入框尺寸
  input: {
    sm: { height: 32 },
    md: { height: 40 },
    lg: { height: 48 },
  },

  // 触摸目标最小尺寸（无障碍要求）
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
  },
};

// 断点系统（响应式设计）
export const breakpoints = {
  xs: 0,      // 超小屏幕
  sm: 576,    // 小屏幕
  md: 768,    // 中等屏幕
  lg: 992,    // 大屏幕
  xl: 1200,   // 超大屏幕
  xxl: 1400,  // 特大屏幕
};

// Z-index 层级系统
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  toast: 1080,
};

// 工具函数：获取间距值
export const getSpacing = (multiplier: number): number => {
  return BASE_UNIT * multiplier;
};

// 工具函数：获取响应式间距
export const getResponsiveSpacing = (screenWidth: number, baseSpacing: number): number => {
  if (screenWidth >= breakpoints.lg) {
    return baseSpacing * 1.5;
  } else if (screenWidth >= breakpoints.md) {
    return baseSpacing * 1.25;
  }
  return baseSpacing;
};

export default {
  spacing,
  componentSpacing,
  layoutSpacing,
  borderRadius,
  elevation,
  sizes,
  breakpoints,
  zIndex,
  getSpacing,
  getResponsiveSpacing,
};