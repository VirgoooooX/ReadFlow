# ReadFlow - 极简主义、智能驱动的深度阅读器

[![React Native](https://img.shields.io/badge/React%20Native-0.79.6-blue?logo=react&logoColor=white)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-53.0.0-black?logo=expo&logoColor=white)](https://expo.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 项目概览

**ReadFlow** 不仅仅是一个 RSS 阅读器，它是一个完整的**深度阅读解决方案**。

它由两部分组成：
1.  **📱 移动端 (Client)**: 基于 React Native 构建的精美 iOS/Android 应用，专注于极致的阅读体验、流畅的动画和 AI 辅助学习。
2.  **☁️ 服务端 (Server)**: 基于 Node.js 的自托管后端，提供 RSS 聚合、云端同步、图片代理加速及强大的 Web 管理后台。

---

## ✨ 核心特性

### 📱 移动端 (Client)

#### 📖 沉浸式阅读体验
*   **极简设计**: 35px 极简页眉，Extra Bold 杂志级排版，致敬顶级阅读应用。
*   **动态交互**: 标题交叉淡入淡出 (Cross-fade) 动效，丝滑的滚动体验。
*   **阅读进度记忆**: 自动记录并持久化 Webview 滚动坐标，跨 Session 无缝续读。
*   **手势操作**: 完美复刻系统级侧滑返回手势，操作行云流水。

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
# 回到项目根目录
cd ..

# 安装依赖
npm install

# 启动 Expo 开发服务器
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
