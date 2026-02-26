# 调研发现 (Findings)

## 2026-02-26 - 公共 RSS 源池设计

1. 确认采用 **方案 A（引入审核机制的严格公共池）**：
   - 全局表 `RSSSource` 增加 `isPublic` 布尔字段。
   - 用户自定义新增的源默认 `isPublic = false`，仅该用户可见。
   - 服务端提供大厅接口 `/api/rss/public` 查询热门/精选的 `isPublic = true` 数据。

## 2026-02-26 - 纯云端 App 架构可行性

1. **目前 App 的配置和现状**:
   - 如果 `cloudConfig.serverUrl` 为空，`AuthService` 会自动回退调用 `mockLogin`（模拟登录）并启用本地状态模式。
   - 目前使用 `SettingsService` 将大模型设置 (LLM), 阅读排版 (Reading), 以及 App 基础设置存储在本地的 `AsyncStorage` 中。**目前并未通过用户 ID 划分命名空间。**
   - 服务端的 `RSSSource` 库表使用全局唯一的 `category` 字段来记录分类。

2. **最终目标**:
   - 应用系统仅允许处于 **CLOUD (云端)** 模式。如果没有 Server URL 或有效的用户 Token，App 应该强制拦截并停留在“登录/欢迎/配置”界面。
   - 代码中不得含有“离线专属 (offline-only)” 的本地降级逻辑。
   - 代码中不得含有“轻量代理转发 (Proxy)”模式。
