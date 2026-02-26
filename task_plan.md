# 任务计划：重构为纯云端应用 & 多用户大厅隔离

## 目标
1. 将客户端转变为“纯云端 (Cloud-Only)”模式，移除本地直连和代理模式。
2. 引入公共 RSS 订阅池大厅（`isPublic` 机制）。
3. 彻底解决多用户之间分类冲突、本地配置及存储越界问题。

## 任务阶段 (Phases)

### [x] 阶段 1：调研与计划
- 完成客户端架构的隔离缺陷挖掘、确定 Proxy 处理方向。
- 设计了公共订阅池 **(方案A 审核强管控)** 的实施方案。
- 产出最终实施计划 (Implementation Plan)。

### [ ] 阶段 2：服务端数据库缺陷修复与大厅建设
- 修改 Prisma Schema：
  - `RSSSource` 中增加 `isPublic Boolean`。
  - `UserFeed` 表关联加强，承载 `customName` 和 `customCategory` 字段。
- 在 `readflow-server` 生成并执行 Migration。
- 更新 `StorageService.ts` 多用户分类读写，并新增获取 `isPublic=true` 列表的 API。

### [ ] 阶段 3：客户端界面与纯云端化
- 删除所有与 Proxy 代理相关的 UI 屏幕和服务代码，拦截非登录的脱机状态。
- **建设新增界面**：“发现大厅”用来承载服务端的 `/api/rss/public` 列表。

### [ ] 阶段 4：客户端账号切换的底层数据隔离
- 利用账号 ID 作为 `SettingsService` 内大模型/阅读排版 Key 的隔离后缀。
- 重构 Redux 的 Dispatch 逻辑，登出时清空 SQLite 与全局状态内存，防止前任用户数据污染。

## 遇到的错误 (Errors Encountered)
| 错误 | 尝试方案 | 解决办法 |
|-------|---------|------------|
| (暂无) | - | - |
