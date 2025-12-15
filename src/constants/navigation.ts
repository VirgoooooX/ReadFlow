// 导航相关常量配置
export const NAVIGATION_CONSTANTS = {
  // 导航栏高度 - 自定义导航栏高度
  HEADER_HEIGHT: 40,
  // 底部标签栏高度
  TAB_BAR_HEIGHT: 60,
  // 标签栏垂直内边距
  TAB_BAR_PADDING_VERTICAL: 4,
  // 导航栏标题样式
  HEADER_TITLE_STYLE: {
    fontWeight: 'bold' as const,
  },
} as const;

// 导出单独的常量以便使用
export const { HEADER_HEIGHT, TAB_BAR_HEIGHT, TAB_BAR_PADDING_VERTICAL, HEADER_TITLE_STYLE } = NAVIGATION_CONSTANTS;