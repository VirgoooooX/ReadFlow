## 代码库结构
- 客户端：React Native（目录 src/）
- 云端服务：readflow-server（Node/TS + Prisma，目录 readflow-server/）

## 已存在的“云端化”能力（与目标高度一致）
- 配置同步（客户端↔服务端）
  - 客户端：[ConfigSyncService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ConfigSyncService.ts) 分模块 push/pull（preferences/llm-keys/groups/sources/filter-rules），且包含 dailyReportSettings
  - 服务端：[config routes](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/routes/config.ts) + [ConfigController](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/controllers/ConfigController.ts)；LLM key 加密存储
  - 安全：服务端 /api/config/llm-keys 已改为脱敏返回（不回传明文 apiKey，仅返回 hasApiKey 等）
- 文章同步（服务端→客户端）
  - 客户端：[CloudSyncService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/rss/CloudSyncService.ts) 调用 /api/rss/sync（serverCursor + delivery/ack）
  - 服务端：[rss routes](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/routes/rss.ts) + [StorageService](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/services/StorageService.ts) 维护投递/ACK 游标
- 图片代理/压缩（服务端）
  - 服务端：[/api/image](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/routes/image.ts) + [ImageProxyController](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/controllers/ImageProxyController.ts)
  - RSS 解析时替换正文图代理 URL：[RSSUtils](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/utils/RSSUtils.ts) + [RSSParserService](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/services/RSSParserService.ts)
- AI 日报（服务端生成、客户端展示）
  - 服务端：[DailyReportService](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/services/DailyReportService.ts) + 路由 /api/rss/daily-reports
  - 客户端：[DailyReportApiService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/DailyReportApiService.ts) + 设置/列表/详情页面

## 仍可能违背“客户端后端只做同步”的点（候选下沉/删除）
- 客户端本地图片缓存与 HTML 替换：[ImageCacheService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ImageCacheService.ts)
- 客户端侧 RSSHub 支持与部分 RSS 工具类（需要确认是否在云模式仍被调用）：
  - [RSShubService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/RSShubService.ts)
  - [ImageExtractionService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ImageExtractionService.ts)

## 文档/遗留
- README 提到 server-go 轻量代理（仓库未见 server-go 目录）：[README](file:///l:/Web/TechFlowMobile/TechFlowMobile/README.md)

## 安全注意
- 服务端对敏感字段使用 AES-256-CBC 加密，但 ENCRYPTION_SECRET 存在默认值回退（生产必须强制配置，避免同密钥/弱密钥导致的泄露风险）

## 客户端设置结构（用于“配置全量同步”白名单）
- exportSettings 顶层结构（客户端导出的实际字段名）：readingSettings、appSettings、rssSettings、llmSettings、themeSettings、rssStartupSettings、dailyReportSettings、exportedAt（见 [SettingsService.exportSettings](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/SettingsService.ts#L620-L662)）
- importSettings 顶层结构（客户端实际会导入并落盘的字段名）：readingSettings、appSettings、rssSettings、llmSettings、themeSettings、rssStartupSettings（见 [SettingsService.importSettings](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/SettingsService.ts#L850-L907)）
- 关键不一致：dailyReportSettings 目前“会导出/会推送到云端 preferences”，但“拉取后不会被 importSettings 应用”，因此登录后无法无缝恢复该设置（需要补齐导入/独立应用路径）

## “不应跨端同步”的运行态字段（现有代码也在规避）
- appSettings.sync 属于运行态/连接态配置，云同步会剔除（见 [ConfigSyncService.sanitizeExportedSettingsForConfigSync](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ConfigSyncService.ts#L60-L77)），且导入时强制保留本机 sync（见 [SettingsService.importSettings](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/SettingsService.ts#L867-L875)）
- rssStartupSettings.sourceIds 是本机 SQLite 自增 ID，不稳定；云同步语义已改为“以 sourceUrls 同步，再映射回本机 id”（见 [ConfigSyncService.normalizeRssStartupSettingsForPush/ForPull](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ConfigSyncService.ts#L245-L300)）

## 服务端配置存储与接口语义（用于对齐“云端存储全量用户配置”）
- 用户配置大对象：UserPreference.settings（JsonB），适合承载 reading/theme/rss/dailyReport 等非敏感配置（见 [schema.prisma:UserPreference](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/prisma/schema.prisma#L181-L194)）
- 用户 LLM 配置：UserLLMKey 表单独存储，apiKey 加密字段为 encryptedApiKey（见 [schema.prisma:UserLLMKey](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/prisma/schema.prisma#L196-L220)）
- RSS 公共池与私有订阅：
  - RSSSource：全局源池，带 isPublic/lastFetchAt/errorCount 等状态字段（见 [schema.prisma:RSSSource](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/prisma/schema.prisma#L71-L97)）
  - UserFeed：用户订阅关系（userId+sourceId），可挂分组 groupId，并允许 customName/customCategory（见 [schema.prisma:UserFeed](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/prisma/schema.prisma#L127-L145)）
- 当前接口风险点：
-  - /api/config/llm-keys 的 GET 已脱敏（见 [ConfigController.getLLMKeys](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/controllers/ConfigController.ts#L291-L317)），避免明文泄露

## 服务端 Admin 设置存储与入口
- 存储：Postgres 表 server_settings（Prisma: ServerSetting），以 key='global' 单行 JSONB(data) 承载（见 [schema.prisma](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/prisma/schema.prisma#L270-L277)、[StorageService](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/services/StorageService.ts#L92-L151)）
- API：/api/admin/settings GET/POST 读写 StorageService.getSettings/saveSettings（见 [admin.ts](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/routes/admin.ts#L51-L75)）
- UI：管理后台“系统设置”页通过 public/js/modules/settings.js 映射表单字段并提交（见 [settings.js](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/public/js/modules/settings.js#L1-L60)）

## 密钥“同步但不明文回显”方案约束（用于设计）
- 客户端依赖：当前客户端依赖 expo-secure-store 但未引入 tweetnacl/libsodium 等 E2EE 加密库（见 [package.json](file:///l:/Web/TechFlowMobile/TechFlowMobile/package.json)）；若采用设备公钥封装，需要补充纯 JS 加密依赖或确认 Expo WebCrypto 可用性
 - 兼容性风险：客户端 pullConfig 目前会用远端结果整体覆盖本地 profiles，若远端 apiKey 置空会导致本地 key 被清空（需要在客户端做 merge 保留本地）

## 查词/翻译本地缓存实现（当前：LLM 为主 + SQLite 缓存）
- 查词：优先读 SQLite 表 dictionary_cache，未命中才调用 LLM，成功后写回缓存（见 [DictionaryService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/DictionaryService.ts)）
  - 缓存键：word（lowercase+trim）
  - 额外行为：若识别 baseWord，会额外缓存 baseWord
- 翻译：优先读 SQLite 表 translation_cache，未命中才调用 LLM，成功后写回缓存（见 [TranslationService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/TranslationService.ts)）
  - 缓存键：(original_text, source_lang, target_lang)
- 表结构：dictionary_cache / translation_cache / llm_usage_stats 建表与索引在 [DatabaseService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/database/DatabaseService.ts)

## 客户端 LLM 功能绑定系统（4 组）
- 绑定定义：translation / dictionary / titleTranslation / dailyReport 四组功能，各自绑定一个 profileId（见 [SettingsService.normalizeLLMSettingsStore](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/SettingsService.ts#L745-L834)）
- 存储位置：AsyncStorage 的 llm_settings（V2 store：profiles + bindings + ui）由 [SettingsService](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/SettingsService.ts) 管理
- 运行时取用：业务代码通过 `SettingsService.getLLMSettingsFor(feature)` 取该功能绑定的 profile（见 [SettingsService.getLLMSettingsFor](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/SettingsService.ts#L521-L525)）
- 实际使用点：
  - 查词：DictionaryService 使用 dictionary binding（见 [DictionaryService.queryLLM](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/DictionaryService.ts#L195-L213)）
  - 翻译：TranslationService 使用 translation binding（见 [TranslationService.translateWithLLM](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/TranslationService.ts#L134-L171)）
  - 日报：客户端不直连 LLM；服务端 DailyReportService 会按 userPreference.settings.llmSettings.bindings.dailyReport 选择 profile（见 [DailyReportService.getLLMProfile](file:///l:/Web/TechFlowMobile/TechFlowMobile/readflow-server/src/services/DailyReportService.ts#L179-L201)）
  - 标题翻译：当前仅存在绑定字段/设置项，未发现实际调用点（需要在服务端网关落地该能力）
- 已发现不一致：客户端 config push 不包含 llmSettings.bindings（preferencesPayload 不含 llmSettings），导致服务端日报可能拿不到绑定信息（见 [ConfigSyncService.pushConfig](file:///l:/Web/TechFlowMobile/TechFlowMobile/src/services/ConfigSyncService.ts#L326-L349)）

## LLM 网关治理（已落地）
- 审计落库：服务端新增 llm_usage_events（Prisma 模型 LLMUsageEvent + migration），并在启动 init 中自检自建表，避免未跑迁移导致写审计失败
- 写入点：LLMGatewayService 在每次请求（含缓存命中/失败/限流）结束后调用 StorageService.recordLLMUsageEvent 写入一条记录（不落明文输入/输出）
- 频控与并发：按 user+feature 增加突发频控 + 并发上限，并增加全局并发队列限制，避免瞬时打爆上游
- 重试与脱敏：上游 429/5xx、网络错误、超时可控重试；不回显上游响应 body；日志统一 requestId
- 管理后台：新增 /api/admin/llm-usage 聚合接口，系统设置页增加“LLM 使用统计”面板（按天+功能聚合）

## 日报设置同步（已补齐）
- 客户端：SettingsService.importSettings 已支持 dailyReportSettings，并在云端拉取回填时落盘到 daily_report_settings（且不会触发反向自动 push）
- 服务端：DailyReportService.getDailyReportConfig 兼容从顶层 dailyReportSettings 读取（避免因存储结构差异导致一直走默认值）

## Fail-open 默认值（已加固）
- JWT_SECRET：生产环境缺失会直接抛错阻止启动；非生产环境会告警并使用默认值（仅用于本地开发）
- ENCRYPTION_SECRET：生产环境缺失会直接抛错阻止启动；非生产环境会告警并使用默认值
- ADMIN_PASSWORD：生产环境必须显式配置且不能为默认值 admin；否则 StorageService.init 会抛错阻止启动

## llm-keys 收口（已完成）
- /api/config/llm-keys 仅允许 admin/server-token 访问：GET 对普通用户返回空数组；写入/删除接口返回 403
- 对外接口不回显明文 apiKey（仅 hasApiKey），避免敏感信息泄漏

## Preferences 同步白名单（已落地）
- 服务端 /api/config/preferences 只接收并返回：readingSettings / appSettings(去除 sync) / rssSettings / themeSettings / rssStartupSettings(sourceUrls) / dailyReportSettings(规范化)
- 服务端 updatePreferences 不再整对象覆盖：会与既有 settings merge，避免误删其它写入方的字段（如历史的 configSync 等）

## RSS 数据模型与游标语义（serverCursor）
- 表与关系：RSSSource(url unique) ← UserFeed(userId+sourceId) ← Article(url unique, id 自增)；每用户每源维护 UserSourceCursor.lastAckedArticleId
- 同步：/api/rss/sync(mode=serverCursor) 按 lastAckedArticleId 生成 SyncDelivery(fromExclusiveId,toInclusiveId) 并返回 blocks；/api/rss/syncAck(deliveryId) 幂等推进游标（只增不减）
- 幂等与去重：Article upsert(url unique)；ACK 重放安全且乱序不回退；同步过程中会对 URL 做 suffix 去重（过滤跟踪参数）后再确定 latestId

## 日报 LLM 调用统一化（已落地）
- DailyReportService 已改为通过 LLMGatewayService(dailyReport feature) 调用上游，复用网关的鉴权/限流/审计/脱敏与全局绑定

## Phase 2 补齐（进行中，已落地部分）
- RSS 刷新：updateFeedRefreshState 会写入 RSSSource.errorCount/lastErrorMessage，并支持受控并发刷新（RSS_REFRESH_CONCURRENCY）
- RSS 全文抓取：全文抓取超时可配置（rssFulltextTimeoutMs），避免与 RSS XML 抓取超时策略割裂
- 配置同步：/api/config/sources GET 增加 groupName；batchUpsertSources/upsertSource 支持按 groupName 映射/创建 groupId
- 日报选源：DailyReportService 从 UserFeed+UserRSSGroup 直接取分组订阅源，不再依赖 userPreference.settings 内嵌 sources
- 图片代理：/api/image 增加 SSRF 防护（阻止私网/localhost）、DNS 解析校验、下载超时与最大体积限制；缓存命中会刷新 mtime
- 多实例互斥：RSS 自动刷新与日报调度使用 Postgres advisory lock，避免多实例重复跑任务
- 清理：按 SYNC_DELIVERY_RETENTION_DAYS（默认 30）清理已 ack 的 sync_deliveries，避免表无限增长
- 清理：增加 daily_reports retention（dailyReportRetentionDays，默认 90）
- 图片回退：weserv 回退改为可配置（IMAGE_WESERV_FALLBACK_ENABLED；生产默认关闭），并增加 Content-Type 基本校验
- 图片安全：重定向使用手动跟随并逐跳校验，避免通过跳转绕过 SSRF；可选 IP 分钟级频控（IMAGE_RATE_LIMIT_PER_IP_PER_MIN）

## Phase 3 客户端瘦身（已完成）
- 客户端不包含 RSS XML 抓取/解析实现，刷新统一调用云端接口并落本地库用于离线
- 云模式下 ImageCacheService 禁用本地下载与“写回文章内容/封面”的 file:// 重写，避免图片链路分叉
- 清理未使用模块：移除 RSShubService 与 react-native-rss-parser 类型声明，减少误用入口

## Phase 4 迁移与验证（进行中）
- 登录/初始化后自动 bootstrap 配置：远端有配置则 pull；远端空且本地有配置则 push；两边都有则 pull 后强制 push 一次做 sources/groups/rules 合并
- 迁移完成会写入本地标记（按 serverUrl+userId），避免每次启动重复跑
- 为回归与自愈提供手动入口：CloudSyncScreen 增加“同步阅读状态 / 重新执行配置迁移”
- 阅读状态同步轻量化：用本地 article_state_changes 作为 dirty 队列，仅同步发生变更的 read/unread/favorite（不再扫描 articles 表）；不再同步阅读进度 readProgress
- 同步频率降低：read/unread/favorite 变更仅打标，切后台（background/inactive）时 push 一次；仍保留手动“同步阅读状态”用于立即同步/回填
- 状态回填：切前台（active）按最小 12 小时间隔 pull 一次（lastStatePullAt 记录在 appSettings.sync），避免频繁网络请求
