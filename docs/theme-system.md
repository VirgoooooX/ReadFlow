# 客户端主题系统（统一版）

## 核心原则

- 主题单一事实源：`ThemeProvider`（[theme/index.tsx](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/theme/index.tsx)）。
- 组件读取主题统一使用 `useTheme()` 或 `useThemeContext()`。
  - 在 Provider 内：`useTheme()` 会直接返回 Context 的 `theme`，确保预设/自定义/模式切换全局一致。
  - 在 Provider 外：`useTheme()` 会退化为基于系统 `useColorScheme()` 的主题（仅用于边界场景）。
- 主题颜色统一由 `ColorTokens`（MD3 语义 token）驱动，避免在页面/组件中硬编码深浅模式分支。

## 深色/浅色/系统跟随

- `themeMode`：`light | dark | system`，持久化存储在 `AsyncStorage`（[ThemeStorageService.ts](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ThemeStorageService.ts)）。
- `system` 模式下：由 React Native `useColorScheme()` 决定 `theme.isDark`。
- 非 `system` 模式下：完全以用户选择为准。

## 主题预设（单一数据源）

- 预设定义：`themePresets`（[colors.ts](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/theme/colors.ts)）。
- 设置页展示：`THEME_PRESETS` 由 `themePresets` 派生生成（[presets.ts](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/theme/presets.ts)），避免出现“展示与生效不一致”。
- `custom` 预设：由用户自定义颜色构成（目前 UI 开放 primary/secondary）。

## Token 分层

- `theme.colors`：MD3 语义 token（primary/onPrimary/background/surface/outline/多层 surfaceContainer…）。
- `theme.semantic`：业务语义色（success/warning/info），用于提示/徽章等非 MD3 内建语义的场景。

## 导航与状态栏

- `NavigationContainer` 注入 theme：以 React Navigation 自带的 `DefaultTheme/DarkTheme` 为基底合并 colors，避免缺失字段导致运行时异常（[AppNavigator.tsx](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/navigation/AppNavigator.tsx)）。
- `getCommonScreenOptions(theme)`：统一 content 背景、header 背景/文字色、statusBarStyle（[screenOptions.ts](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/navigation/screenOptions.ts)）。

## 开发期校验

- `createTheme()` 在开发环境会对关键颜色对（background/onBackground 等）做对比度校验并输出警告，便于在新增预设或自定义色时提前发现可读性问题（[theme/index.tsx](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/theme/index.tsx)）。

## 迁移规范（写 UI 时）

- 不要写 `isDark ? '#...' : '#...'` 来分支颜色。
- 不要写 `theme?.colors?.xxx || '#...'` 的兜底色；在 Provider 内 `theme.colors.xxx` 必须始终存在。
- 需要业务语义色时，用 `theme.semantic.success|warning|info`，不要在页面里写固定绿/黄/蓝色。

