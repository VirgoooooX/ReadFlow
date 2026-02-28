## 目标
- 客户端前端：保持现有交互与渲染逻辑不变
- 客户端“后端层/服务层”：只负责从云端同步用户配置与文章数据；不再承担 RSS 抓取/解析、图片代理等计算型职责
- 云端服务：统一承担 RSS 抓取解析、图片代理/转换、AI 日报定时生成；用户登录后可无缝恢复原体验（配置全量同步）
- 安全：云端存储的用户敏感配置（API Key 等）必须加密，服务端接口不得明文回显
- LLM：客户端不再配置/维护 LLM API；服务端使用全局配置为所有用户提供 LLM 能力

## 现状快照（基于代码库）
- 已存在云端服务 readflow-server（Node/TS + Prisma），提供：
  - 鉴权：/api/auth（JWT），可选 x-server-token 作为额外门禁
  - 配置同步：/api/config/preferences、llm-keys、groups、sources、filter-rules
  - 文章同步：/api/rss/sync（serverCursor + delivery/ack）、阅读状态同步 /api/rss/syncState
  - 图片代理：/api/image（sharp 转码/压缩/缓存），RSS 解析时可替换正文图为代理 URL
  - AI 日报：/api/rss/daily-reports/* + DailyReportService（从近 24h 文章清洗→调用 LLM→落库）
- 客户端（RN）已具备：
  - ConfigSyncService：分模块 push/pull 配置（含 dailyReportSettings）
  - CloudSyncService：从服务端增量拉取文章并落库；支持 serverCursor + ack；阅读状态双向同步
  - 仍存在本地图片落盘缓存/HTML 替换等“客户端侧处理图片”的能力
- 文档仍提到 server-go 轻量代理，但仓库未见该目录（仅 README 引用）

## 关键差距（待确认并补齐）
- “配置全量同步”范围：除已有 preferences/llm-keys/groups/sources/filter-rules 外，是否还包括：
  - RSS 启动设置（rssStartupSettings）、主题、阅读设置、用户资料、AI 日报配置（已在 preferences 内看到 dailyReportSettings）
  - 词典/翻译相关设置、导入导出、其它运行态字段（需要继续盘点哪些应同步、哪些应本地专有）
- “实时同步”定义：需要做到设置变更即 push，还是以手动/关键配置变更触发为主
- RSS 源池：服务端已出现 public RSS 相关迁移与路由，但“公共池 + 用户私有源”的边界、去重、权限与 UI 流程需要对齐功能说明
- 文章同步打游标：已有 serverCursor+delivery/ack，需对齐你期望的“游标语义”（按源、按用户、按时间/ID、幂等）
- “一次性打包 JSON 同步”：现为分块 blocks 拉取；是否需要改成单包（可能影响大源/大批量时的内存与超时）
 - 已发现实现不一致：
   - dailyReportSettings：已修复（客户端 pull 后落盘生效，服务端读取兼容顶层/嵌套）
   - llm-keys：已收口（仅 admin/server-token 可访问；不对普通用户/客户端暴露；不回显明文）
   - 安全默认值：已加固（生产环境缺失 ENCRYPTION_SECRET/JWT_SECRET 或使用默认 ADMIN_PASSWORD 会阻止启动）

## 决策点（需要在设计阶段定稿）
- 同步协议：推荐继续沿用 serverCursor+delivery/ack（已存在且更抗断网/幂等），不改 sinceId
- 图片策略：推荐短期保留客户端本地图片缓存；中期逐步改为完全依赖 /api/image（避免一次性引入带宽与缓存抖动）
- 私有 RSS：推荐“用户新增默认私有”，公共池仅用于建议/发现与去重存档；导入即建立 UserFeed 订阅关系
- LLM 统一云端化：已定稿（客户端零密钥；服务端全局配置提供 dict/translate/title/dailyReport）
- 成本与滥用防护：你选择“不限制”，但必须保留 JWT 鉴权；推荐追加最小审计（按 userId 记录 feature+耗时+token估算）
- 绑定模型：已定稿（保留四组功能分别绑定不同 profile：translation/dictionary/titleTranslation/dailyReport）

## 推荐方案：LLM 完全云端化（服务端统一配置，客户端零密钥）
### 目标与约束
- 服务端可用：用于 AI 日报 + 查词 + 翻译 + 标题翻译等所有 LLM 功能
- 客户端零密钥：客户端不再保存/同步任何 LLM apiKey
- 延迟可控：客户端仍保持 SQLite 本地缓存优先；服务端二级缓存 + 连接复用 + 统一重试/超时
- 安全：全局 apiKey 仅在服务端环境变量/管理后台；API 响应与日志永不回显

### 核心思路（LLM Gateway）
- readflow-server 新增统一 LLM 网关接口：/api/llm/dict、/api/llm/translate、/api/llm/title-translate、/api/llm/daily-report（内部用）
- 网关内部调用 OpenAI-compatible 上游，并封装：鉴权、限流、重试、超时、审计、缓存
- 客户端未命中缓存时调用网关，拿到结果后写入现有 SQLite 缓存表（dictionary_cache / translation_cache）

### 四组功能绑定（客户端逻辑“搬运到服务端”的落点）
- 目标：保留 translation / dictionary / titleTranslation / dailyReport 四组“可分别使用不同 provider/baseUrl/model/apiKey”的能力，但由服务端统一配置
- 服务端配置结构（全局，建议落在 server_settings 或 env）：
  - llm.profiles：若干 profile（id/name/provider/baseUrl/model/apiKey/temperature/maxTokens/topP/isActive）
  - llm.bindings：{ translation: profileId, dictionary: profileId, titleTranslation: profileId, dailyReport: profileId }
- 服务端网关按 feature 选择 profile（等价于客户端 SettingsService.getLLMSettingsFor）
- Prompt 差异也搬运：
  - dictionary：强 JSON 输出 + 容错解析
  - translation：只返回翻译文本
  - titleTranslation：标题短文本翻译（需补齐当前未落地部分）
  - dailyReport：复用现有 DailyReportService 的 prompt 体系，但把“选择 profile/调用上游”改为走全局绑定

### Admin 配置落地（你选择 Admin 页面配置）
- 在“系统设置”页新增 LLM 配置区：
  - Profiles：可编辑 profiles 列表（provider/baseUrl/model/apiKey/temperature/maxTokens/topP/isActive）
  - Bindings：四组功能分别选择 profileId（translation/dictionary/titleTranslation/dailyReport）
- 存储位置：复用 server_settings(key='global') 的 JSONB(data)，由 StorageService.sanitizeSettings 接纳并持久化
- 安全：Admin settings 的 GET 返回时不回显 apiKey（只回显 hasApiKey/apiKeyHint），POST 支持“空 apiKey 表示不覆盖现有”

### Admin UI（表格/表单编辑）字段草案
- Profiles 列表字段：
  - 启用：isActive（checkbox）
  - 名称：name（text）
  - Provider：provider（select：openai-compatible / anthropic）
  - Base URL：baseUrl（text）
  - Model：model（text）
  - API Key：apiKey（password 输入；仅在提交时发送；GET 不回显）
  - Temperature：temperature（number 0-2）
  - Max Tokens：maxTokens（number）
  - Top P：topP（number 0-1）
  - 操作：新增/删除/复制
- Bindings：
  - translation/dictionary/titleTranslation/dailyReport 四个下拉框，选项为 profiles 中 isActive 的 profile
  - 允许“未绑定”但保存时会自动回退到默认 profile（便于最初配置）

### 接口草案（初版）
- POST /api/llm/dict
  - body: { word, context?, sourceLang?, targetLang? }
  - resp: { result, cacheKey, modelVersion }
- POST /api/llm/translate
  - body: { text, sourceLang, targetLang, style? }
  - resp: { translatedText, cacheKey, modelVersion }
- POST /api/llm/title-translate
  - body: { title, sourceLang?, targetLang? }
  - resp: { translatedTitle, cacheKey, modelVersion }
- DailyReport：沿用现有服务端生成，但改为读取全局 LLM 配置与 dailyReport binding

### 客户端侧行为（不改 UI 交互为前提）
- 继续使用现有 SQLite 本地缓存（dictionary_cache / translation_cache）
- 未命中缓存时改为调用服务端 LLM 网关接口，再把结果写回本地缓存
- 客户端 LLM 设置页逐步改为“功能开关/偏好”，不再要求用户填写 key

### 运维与成本
- 你选择“不限制”：不做配额/计费，但保留鉴权（JWT）+ 最小审计
- 最小审计：按 userId 记录 feature、provider、model、耗时、成功/失败、token估算（不记录明文内容）

### 安全
- 服务端全局 apiKey 严禁出现在响应/日志
- 强制配置 ENCRYPTION_SECRET（若仍用于其它敏感字段）

## 最小改动落地顺序（按兼容性从易到难）
### Step 1：先加服务端 LLM 网关（不动客户端）
- 服务端新增 /api/llm/dict 与 /api/llm/translate，用全局配置直连上游
- 接口先走现有鉴权（JWT），保证后续可做 per-user 限流
- 同期改造 Admin “系统设置”页：可编辑全局 profiles+bindings（表格/表单）

### Step 2：客户端切流到网关（命中缓存仍本地）
- DictionaryService / TranslationService 未命中缓存时改为调用服务端网关
- 继续写入现有 SQLite 缓存表，保持“二次命中秒回”

### Step 3：收口 LLM 设置与同步
- 客户端 LLM 设置页调整为“功能开关/偏好”，不再要求用户填写 key
- ConfigSyncService 停止 push/pull llm-keys；服务端 llm-keys 对客户端不再暴露或仅 admin 可见

### Step 4：补齐限流/缓存/审计与成本控制
- per-user 限流：分钟窗口 + 短窗口突发 + 并发上限；触发返回 429
- 服务端缓存：内存 TTL 缓存（按 feature+profile+input hash），命中不打上游
- 最小审计：请求事件落库（userId/feature/耗时/cacheHit/httpStatus/token估算），管理后台可按天聚合查询

## 需要改动的文件清单（按 Step 分组）
### Step 1（服务端网关）
- 服务端：
  - readflow-server/src/routes（新增 llm.ts 或并入现有 routes）
  - readflow-server/src/services（新增 LLMGatewayService：统一调用上游）
  - readflow-server/src/server.ts（挂载新路由并走现有 authMiddleware）
  - readflow-server/src/services/StorageService.ts（扩展 ServerSettings + sanitizeSettings：接纳 llm.profiles/bindings，且 GET 脱敏）
  - readflow-server/public/admin.html（增加 LLM 配置区 UI）
  - readflow-server/public/js/modules/settings.js（读写 LLM profiles/bindings）

### Step 2（客户端切流）
- 客户端：
  - src/services/DictionaryService.ts（未命中缓存时调用 /api/llm/dict）
  - src/services/TranslationService.ts（未命中缓存时调用 /api/llm/translate）

### Step 3（收口 llm-keys）
- 服务端：
  - readflow-server/src/controllers/ConfigController.ts（getLLMKeys 改为 admin-only 或移除对客户端暴露）
- 客户端：
  - src/services/ConfigSyncService.ts（停止 push/pull llm-keys）
  - src/screens/Settings/LLMSettingsScreen.tsx（改成偏好/开关）

## 验证清单（上线前必须过）
- 功能回归：词典/翻译未命中缓存时能走服务端网关并写回 SQLite 缓存
- 体验回归：命中缓存仍秒回；未命中延迟稳定；失败可重试且 UI 提示一致
- 安全回归：服务端全局 apiKey 不出现在响应/日志；网关接口有鉴权与限流
- Admin 回归：profiles/bindings 可保存并持久化；GET 不回显 apiKey；POST 空 apiKey 不覆盖已有

## 分阶段计划
### Phase 0：全库复盘与对齐（complete）
- 盘点客户端“后端层”仍在做的：RSS/图片/代理/解析/缓存/重写等
- 盘点服务端已覆盖的：RSS 抓取、public pool、图片代理、日报生成、配置同步字段
- 输出：差距清单 + 需要新增/删除的模块列表

### Phase 1：确定边界与数据模型（complete）
- 用户 preferences 同步白名单与归一化：服务端 /api/config/preferences 只读写指定字段并 merge 更新
- dailyReportSettings 同步落地：客户端 pull 后落盘生效；服务端读取兼容顶层/嵌套
- LLM 参数与缓存 key：网关按 feature+profile+input hash 生成 cacheKey；日报调用也统一走网关
- RSS 数据模型与游标：serverCursor + delivery/ack（UserSourceCursor.lastAckedArticleId）与幂等推进策略
- DailyReport 配置：system prompt 由 admin settings 管理；生成链路消费同步到云端的 dailyReportSettings

### Phase 2：服务端能力补齐（complete）
- RSS：已补齐刷新状态落库（errorCount/lastErrorMessage）并支持受控并发；全文抓取超时可配置（rssFulltextTimeoutMs）
- 图片：已补齐 /api/image 的 SSRF 防护、超时与响应体大小限制，并让缓存命中能刷新 mtime；增加安全重定向处理与可选的 IP 分钟级频控
- 日报：已改为从 UserFeed + Group 读取分组订阅源（不依赖 userPreference.settings 内嵌 sources），避免“有设置但选不出源”
- 配置同步：已补齐 sources 的 groupName 兼容（GET 返回 groupName；batchUpsert 支持按 groupName 映射 groupId）
- 多实例：RSS 刷新与日报调度已增加 DB advisory lock，避免横向扩容时重复刷新/重复生成
- 清理：已增加 sync_deliveries(acked) 的按天数清理（SYNC_DELIVERY_RETENTION_DAYS，默认 30），并增加 daily_reports 保留策略（dailyReportRetentionDays）
- 图片：weserv 第三方回退已改为可配置（IMAGE_WESERV_FALLBACK_ENABLED，生产默认关闭）；并增加 Content-Type 基本校验

### Phase 3：客户端“后端层”瘦身（complete）
- 本地 RSS 抓取/解析：客户端不再包含 RSS XML 抓取/解析实现，文章刷新统一通过云端 API
- 本地图片缓存：云模式下禁用 ImageCacheService 的下载与“写回 DB/HTML”重写，避免出现 file:// 图片路径
- 清理：移除未使用的 RSShubService 与 react-native-rss-parser 类型声明，减少后端层噪音与误用入口

### Phase 4：迁移、兼容与验证（complete）
- 数据迁移：新增登录后自动 bootstrap（远端有配置→pull；远端空且本地有配置→push；两边都有时 pull 后强制 push 一次用于合并 sources/groups/rules）
- 兼容：登录后把 userId 写入 appSettings.sync.userId，保证后续状态/游标同步可用
- 可操作入口：设置页增加“同步阅读状态 / 重新执行配置迁移”按钮，便于回归与故障自愈
- 状态同步：阅读状态改为本地 dirty 队列（article_state_changes），同步 read/unread/favorite 且默认降低频率（最小 10 分钟），支持手动立即同步
- 状态同步：不再同步阅读进度；read/unread/favorite 变更切后台时 push 一次（仍保留手动立即同步兜底）
- 状态回填：切前台（active）按最小 12 小时间隔 pull 一次用于跨端回填；lastStatePullAt 记录在 appSettings.sync
- 回归测试：登录/同步/离线/大源/慢网/断点续传/幂等/重复文章去重
- 安全验证：敏感配置不明文落库/不明文返回/日志不泄漏

#### Phase 4 验收清单
- 首次登录/换机：远端有配置→pull 后 UI/订阅/分组/规则正确；远端空且本地有→push 后云端可见
- 合并场景：本地+远端同时存在 sources/groups/rules，登录后能合并（pull 后强制 push）且不会丢订阅
- 阅读状态：A 设备标记 read/unread/favorite → 切后台后云端有变更；B 设备切前台后 pull 回填到本地库
- 低频：前台频繁点读/收藏不会触发网络；切后台仅 push 一次；切前台 12 小时内不重复 pull

## 风险与缓解
- 大量文章单包 JSON：可能触发超时与内存峰值 → 继续分块或增加压缩与分页
- 游标一致性：ACK 丢失或重复下发 → delivery/ack 幂等、服务端保留投递记录
- URL 标准化：源/文章 URL 去重失败 → 统一 normalize 规则并全链路复用
- 图片代理成本：带宽与缓存压力 → 强缓存、可配置质量/尺寸、CDN 前置

## 错误记录
| 错误 | 尝试 | 解决 |
| --- | --- | --- |
