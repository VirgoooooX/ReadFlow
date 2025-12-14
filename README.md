# TechFlow - 智能RSS阅读器

[![React Native](https://img.shields.io/badge/React%20Native-0.79.6-blue)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-53.0.0-black)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

TechFlow 是一款功能强大的移动端 RSS 阅读器，集合了智能翻译、生词查询、多媒体播放等高级功能，为用户提供专业的内容聚合和学习体验。

## 🌟 核心功能

### 📰 RSS 内容管理
- **自定义订阅**：支持添加、编辑、删除 RSS 源
- **分类管理**：按分类组织管理订阅源
- **多媒体支持**：
  - 📷 图文模式：提取并显示文章中的图片
  - 🎥 视频播放：支持 HTML5 视频和 `<video>` 标签渲染
  - 📝 纯文本模式：仅显示文本内容，加载更快
- **增量同步**：智能判断新旧文章，避免重复解析

### 🤖 智能翻译
- **LLM 驱动**：集成 LLM 翻译服务
- **自动翻译**：可自动翻译文章标题和内容
- **多语言支持**：支持中英文等多种语言

### 📚 词汇学习
- **生词查询**：点击单词快速查看释义
- **智能解析**：LLM 自动识别词形变化（如 running → run）
- **本地缓存**：首次查询由 LLM 解析，结果永久保存
- **单词本管理**：收藏重要词汇（功能开发中）

### 🎨 阅读体验
- **主题切换**：支持亮色/暗色主题
- **自定义阅读**：
  - 字体大小调整
  - 行间距设置
  - 背景颜色自定义
- **阅读进度追踪**：记录阅读位置和进度

### 📊 用户统计
- **实时数据**：RSS 源数、文章数、未读数统计
- **学习统计**：单词本统计、学习进度追踪

## 🛠️ 技术栈

### 前端框架
- **React Native**：跨平台移动开发
- **Expo**：简化开发流程和部署
- **TypeScript**：类型安全和开发体验

### 状态管理与导航
- **Redux Toolkit**：全局状态管理
- **React Navigation**：声明式导航
- **Context API**：跨组件通信

### 数据库与存储
- **SQLite (expo-sqlite)**：本地数据持久化
- **Async Storage**：键值对存储
- **Secure Store**：加密敏感数据存储

### 多媒体支持
- **expo-av**：音视频播放
- **expo-image**：高性能图片加载和缓存
- **expo-image-picker**：图片选择

### UI 与样式
- **Material Icons**：图标库
- **React Native Render HTML**：HTML 内容渲染
- **自定义主题系统**：Material Design 3 风格

## 📦 项目结构

```
TechFlowMobile/
├── src/
│   ├── components/          # 可复用组件
│   │   ├── VideoPlayer.tsx        # 视频播放器
│   │   ├── WordTappableText.tsx   # 可点击词汇文本
│   │   └── ...
│   ├── screens/             # 页面组件
│   │   ├── Article/               # 文章详情
│   │   ├── RSS/                   # RSS 管理
│   │   ├── Vocabulary/            # 单词本
│   │   ├── Settings/              # 设置页面
│   │   └── ...
│   ├── services/            # 业务逻辑服务
│   │   ├── RSSService.ts          # RSS 解析和管理
│   │   ├── DictionaryService.ts   # 词典查询
│   │   ├── TranslationService.ts  # 翻译服务
│   │   └── ...
│   ├── store/               # Redux 状态管理
│   │   └── slices/                # Redux 切片
│   ├── theme/               # 主题配置
│   ├── database/            # 数据库服务
│   └── navigation/          # 导航配置
├── android/                 # Android 原生代码
├── package.json
├── tsconfig.json
└── app.json
```

## 🚀 快速开始

### 前置要求
- Node.js (v16+)
- npm 或 yarn
- Expo CLI: `npm install -g expo-cli`

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 在 Android 模拟器运行
npm run android

# 在 iOS 模拟器运行（macOS 需要）
npm run ios

# 构建 Web 版本
npm run web
```

## 📱 功能详解

### RSS 源管理
- 支持标准 RSS/Atom feed
- 支持 RSSHub 协议（`rsshub://`）
- 内容类型选择：多媒体（图文视频）或纯文本
- 自动更新频率设置

### 文章阅读
- 支持 HTML 内容渲染
- 图片自适应显示
- 视频原生播放
- 词汇点击查询
- 长按翻译句子

### 视频播放
- 支持 `.mp4`、`.webm`、`.m3u8` 等格式
- 原生播放控制
- 自动加载提示

## 🔐 数据安全

- 敏感信息使用 Secure Store 加密存储
- 本地数据库不上传到服务器
- 支持完整的数据导出和导入

## 📝 配置文件

### 环境变量
在项目根目录创建 `.env.local` 文件：

```env
# LLM 翻译 API（可选）
LLM_API_KEY=your_api_key
LLM_API_URL=your_api_url

# 其他配置
RSSHUB_URL=https://rsshub.app
```

## 🔄 更新日志

### v1.0.0 (2025-12-14)
- ✅ 核心 RSS 阅读功能
- ✅ LLM 智能翻译
- ✅ 生词查询系统
- ✅ 多媒体支持（图片、视频）
- ✅ 主题切换和自定义阅读设置
- ✅ 本地数据库和缓存

## 🐛 问题报告

发现 bug 或有功能建议？欢迎提交 Issue 或 Pull Request！

## 📄 许可证

[添加你的许可证信息]

## 👨‍💻 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建 feature 分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. Push 到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📞 联系方式

- GitHub Issues：用于 bug 报告和功能请求
- Email：[你的邮箱]

---

Made with ❤️ by the TechFlow Team
