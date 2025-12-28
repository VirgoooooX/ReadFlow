# 修复 RSS 源管理设置并添加刷新提示

根据您的要求，我将移除无效的“更新频率”设置，修复“文章数量限制”无法保存的问题，并添加刷新完成后的提示。

## 1. 修复“文章数量限制”无法保存的问题

*   **修改文件**: `src/screens/RSS/EditRSSSourceScreen.tsx`
    *   **操作**: 在保存逻辑 `handleSave` 中，将表单中的 `maxArticles` 字段正确传递给更新函数。

*   **修改文件**: `src/services/rss/RSSService.ts`
    *   **操作**: 在 `updateRSSSource` 方法中，添加对 `max_articles` 字段的更新逻辑（目前缺失）。
    *   **操作**: 在 `mapRSSSourceRow` 方法中，正确映射数据库中的 `max_articles` 字段，确保编辑时能回显当前设置。
    *   **操作**: 在 `addRSSSource` 方法中，支持保存 `max_articles` 字段。

## 2. 移除“更新频率”设置

*   **修改文件**: `src/screens/RSS/EditRSSSourceScreen.tsx`
    *   **操作**: 从界面中彻底移除“更新频率”的选择区域。
    *   **操作**: 移除相关的状态变量和验证逻辑。

## 3. 添加刷新完成提示

*   **修改文件**: `src/contexts/RSSSourceContext.tsx`
    *   **操作**: 在 `syncSource`（单个源刷新）完成后，使用 `ToastAndroid` 弹出提示：“xx 已完成刷新”。
    *   **操作**: 在 `syncAllSources`（全部刷新）完成后，使用 `ToastAndroid` 弹出提示：“所有源刷新完成”。
    *   **注意**: 将添加平台检测，确保只在 Android 上调用 `ToastAndroid`，避免在其他平台报错。

执行以上步骤后，源管理页面将更加简洁有效，且刷新操作会有明确的反馈。