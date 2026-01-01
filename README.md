# 📚 ReadFlow (TechFlow Mobile)

> **极简主义、智能驱动的深度阅读生态系统**
>
> 结合了现代化的移动端 RSS 阅读器与强大的自托管云端同步服务，为您提供无缝的跨设备阅读体验。

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

#### 🤖 AI 智能学习引擎
*   **即时划词翻译**: 点击单词即刻唤起 LLM 解析（支持词形还原：running → run）。
*   **生词本同步**: 生词高亮引擎与本地/云端词汇库实时联动，阅读时即见所学。
*   **长难句解析**: 长按句子进行深度 AI 翻译与语法分析。

#### ☁️ 双模同步 (Local / Cloud)
*   **本地模式**: 纯本地解析 RSS，保护隐私，无服务器依赖。
*   **云端模式**: 登录自托管服务器，实现多设备间的阅读进度、收藏、生词本实时同步。
*   **智能预热**: 云端自动预加载和压缩图片，弱网环境下也能秒开文章。

#### 🎨 个性化定制
*   **全域主题**: 支持亮色/暗色/羊皮纸 (Sepia) 模式，秒级全域切换。
*   **药丸导航**: 重新设计的 Pill TabBar，支持毫秒级瞬时切换。

### ☁️ 服务端 (Server)

*   **RSS 聚合代理**: 解决跨域限制，统一解析 RSS 标准。
*   **云端同步中心**: 存储用户配置、阅读历史、收藏列表及生词本。
*   **Web 管理后台**:
    *   📊 **仪表盘**: 实时监控系统状态、流量及用户活跃度。
    *   📰 **源管理**: 可视化添加、编辑、刷新 RSS 源，支持批量导入。
    *   👥 **用户管理**: 查看注册用户状态及阅读统计。
*   **图片代理服务**: 内置图片压缩与缓存机制，显著提升客户端加载速度。

---

## 📸 界面预览

### 📱 移动端
| 首页 (Home) | 文章详情 (Detail) | 个人中心 (Profile) |
| :---: | :---: | :---: |
| <img src="docs/images/mobile_home.png" alt="Home" width="240"/> | <img src="docs/images/mobile_detail.png" alt="Detail" width="240"/> | <img src="docs/images/mobile_profile.png" alt="Profile" width="240"/> |

### 💻 服务端后台 (Admin Web)
| 仪表盘 (Dashboard) | 源管理 (Feeds) |
| :---: | :---: |
| <img src="docs/images/admin_dashboard.png" alt="Dashboard" width="400"/> | <img src="docs/images/admin_feeds.png" alt="Feeds" width="400"/> |

> *注：请将实际截图放置于 `docs/images/` 目录下*

---

## 🛠️ 技术栈

### Client (React Native)
*   **Framework**: Expo SDK 53, React Native 0.79
*   **Language**: TypeScript
*   **State Management**: Redux Toolkit, Context API
*   **Navigation**: React Navigation v7 (Native Stack)
*   **Storage**: expo-sqlite (文章索引), AsyncStorage (配置)
*   **UI/Animation**: Reanimated 3, React Native Gesture Handler
*   **Network**: Axios, Undici

### Server (Node.js)
*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Data**: JSON-based Storage (轻量级，易迁移), SQLite (可选)
*   **Features**: RSS Parsing, Image Processing (Sharp), JWT Auth
*   **Admin UI**: Tailwind CSS, Vanilla JS (无框架依赖，极致轻量)

### Server (Go) - *New!*
*   **Performance**: 极简高性能代理，资源占用极低。
*   **Capabilities**: 
    *   RSS 跨域转发与内容清洗。
    *   流式图片代理 (Stream Proxy)，自动处理防盗链 Referer。
    *   RSSHub 智能轮询机制。
*   **Deployment**: 支持 Docker 一键部署，体积仅 ~15MB。

---

## 🚀 快速开始

### 1. 环境准备
*   Node.js (v18+)
*   npm 或 yarn
*   Expo CLI: `npm install -g expo-cli`
*   模拟器 (iOS Simulator / Android Emulator) 或 真机

### 2. 启动服务端 (TechFlow Server)

我们提供了两种服务端模式，可根据需求选择：

#### 选项 A: Node.js 全功能版 (推荐)
适合需要**云端同步**、用户系统和管理后台的场景。

**使用 Docker 部署 (推荐):**

```bash
cd techflow-server

# 启动服务
docker-compose up -d
```

*   **配置**: 可在 `docker-compose.yml` 中修改 `ADMIN_PASSWORD` 环境变量来设置初始管理员密码（默认: `admin`）。
*   **API 地址**: `http://localhost:3000`
*   **管理后台**: `http://localhost:3000/admin`

**使用源码启动:**

```bash
# 进入服务端目录
cd techflow-server

# 安装依赖
npm install

# 启动服务 (默认端口 3000)
npm run dev
```

#### 选项 B: Go 轻量代理版 (Pure Proxy)
适合**仅需要解决跨域和图片防盗链**，且希望极致轻量的场景。

```bash
# 进入 Go 服务目录
cd server-go

# 运行 (需安装 Go 环境)
go run main.go

# 或者使用 Docker (推荐)
docker-compose up -d
```

*   **API 地址**: `http://localhost:8080`
*   **特点**: 内存占用极低 (<10MB)，响应速度极快。
*   **配置**: 在 App 中开启“代理模式”并填入此地址即可。

### 3. 启动客户端 (TechFlow Mobile)

```bash
# 回到项目根目录
cd ..

# 安装依赖
npm install

# 启动 Expo 开发服务器
npx expo start --clear
```

*   按 `a` 启动 Android 模拟器
*   按 `i` 启动 iOS 模拟器
*   或使用 Expo Go App 扫描二维码在真机运行

### 4. 开启云端同步模式 (可选)

1.  确保服务端已启动，并确保手机/模拟器能访问到服务端的 IP 地址。
2.  在 App 中进入 **设置 (Settings)** -> **同步设置 (Sync)**。
3.  切换模式为 **Cloud**。
4.  输入服务端地址（例如 `http://192.168.1.100:3000`）。
5.  点击 **登录/注册**，创建账号并登录。
6.  开启 **自动同步**，即可享受云端无缝体验。

---

## 📂 项目结构

```
TechFlowMobile/
├── src/                    # 📱 客户端源码
│   ├── components/         # UI 组件
│   ├── contexts/           # 全局状态 (Theme, Settings)
│   ├── database/           # SQLite 数据库层
│   ├── navigation/         # 路由配置
│   ├── screens/            # 页面 (Home, Article, Settings...)
│   ├── services/           # 业务逻辑 (RSS, Auth, Sync...)
│   ├── store/              # Redux Store
│   └── theme/              # 主题配置
│
├── techflow-server/        # ☁️ 服务端源码
│   ├── public/             # 静态资源 (Admin UI)
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 服务端逻辑
│   │   └── server.ts       # 入口文件
│   └── data/               # JSON 数据存储
│
└── README.md               # 项目文档
```

---

## 📝 开发计划

- [x] **v1.0**: 基础 RSS 阅读、LLM 翻译、本地生词本。
- [x] **v2.0**: 引入服务端，实现云端同步、Web 管理后台。
- [x] **v2.1**: UI 深度优化，双向数据同步，图片预热。
- [ ] **v3.0 (Planned)**:
    - [ ] 社交化阅读功能 (评论、分享)。
    - [ ] 更多 AI 模型支持 (Claude, Gemini)。
    - [ ] 桌面端 (Electron/Web) 支持。

---

## 🤝 贡献指南

欢迎提交 Issue 或 Pull Request！

1.  Fork 本仓库
2.  创建特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  提交 Pull Request

---

Made with ❤️ by the ReadFlow Team
