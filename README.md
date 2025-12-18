# ReadFlow - 极简主义、智能驱动的深度阅读器

[![React Native](https://img.shields.io/badge/React%20Native-0.79.6-blue)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-53.0.0-black)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

ReadFlow 是一款专为深阅读设计的移动端 RSS 阅读器。它不仅是一个内容聚合器，更是一个集成了 LLM 智能翻译、交互式生词本及极致动画体验的语言学习利器。

## 🌟 核心亮点 (New in v2.1.0)

### 📖 沉浸式阅读系统
- **极简画质**：重构 35px 高度极简页眉，搭配 Extra Bold (900) 标题字体，致敬顶级阅读应用。
- **动态交互**：
  - **智能转场**：新增标题交叉淡入淡出动效，随阅读进度平滑切换“页面状态”。
  - **进度记忆**：自动记录并持久化 Webview 滚动坐标，跨 session 续读无缝衔接。
- **极致手势**：完美复刻系统级“侧滑返回”手势，即便在自定义 Header 模式下依然灵敏。

### 🤖 智能学习引擎
- **划词交互**：点击单词即刻唤起 LLM 解析（支持词形还原：running → run）。
- **单词本同步**：生词高亮引擎与本地词汇库实时联动，阅读时即见所学。
- **上下文翻译**：支持长按句子进行深度 AI 翻译。

### 🎨 响应式 UI/UX
- **药丸标签栏 (Pill TabBar)**：重新设计的顶部导航，支持毫秒级瞬时切换与自适应动态宽度。
- **全域主题**：支持亮色/暗色/羊皮纸 (Sepia) 模式，通过 `ReadingSettingsContext` 实现秒级全域同步。

## 🛠️ 核心架构

### 状态管理
- **Context API**：全面重构阅读设置逻辑，确保全局配置（字号、主题、标签可见性）实时响应。
- **Redux Toolkit**：驱动核心业务数据（文章、RSS 源、词汇库）的状态流转。

### 视图与动效
- **React Native Reanimated**：驱动 TabBar、Header 标题等高性能微动画。
- **Native Stack Navigation**：强制锁定 Card 模式与 Slide 动画，消除闪白，提供物理级推拉感。

### 数据存储
- **SQLite (expo-sqlite)**：承载高性能文章索引与词汇关系库。
- **Async Storage**：管理用户偏好设置。

## 🚀 开发环境

### 前置要求
- Node.js (v18+)
- Expo CLI: `npm install -g expo-cli`

### 运行
```bash
# 安装依赖
npm install

# 启动开发服务器 (清除缓存)
npx expo start --clear

# 构建测试版 APK
node scripts/build-apk.js --version 2.1.0 --arch arm64 --open
```

## 🔄 更新日志

### v2.1.0 (2025-12-19)
- ✨ **重构体验**：全面上线 35px 极简头部设计与 900 字重标题。
- ✨ **智能动效**：实现标题交叉淡入淡出 (Cross-fade) 动画。
- ✨ **架构升级**：引入 `ReadingSettingsContext` 解决跨路径配置同步问题。
- 🐛 **修复闪屏**：通过 `contentStyle` 同步彻底根除返回列表时的白屏现象。
- 🔧 **工程优化**：修复 `SettingsService` 重名冲突与类型隐患。

### v2.0.0 (2025-12-17)
- 🚀 **内核升级**：使用 `TabView` 重构主页标签系统。
- 🚀 **性能提升**：实现瀑布流列表懒加载与组件 Memo 化。

### v1.0.0 (2025-12-14)
- 🎉 核心 RSS 阅读、LLM 翻译及生词本系统正式上线。

---

Made with ❤️ by the ReadFlow Team
