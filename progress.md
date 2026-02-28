## 进度日志

### 2026-02-27
- 初始化规划文件：task_plan.md / findings.md / progress.md
- 全库扫描同步链路：配置同步、文章同步、阅读状态同步、鉴权
- 全库定位 RSS 抓取解析、图片代理、AI 日报落点
- 盘点 SettingsService 导入导出结构，明确配置同步白名单/黑名单与已存在的不一致项
- 输出“密钥双向可用但不明文回显”推荐方案草案，并更新 Phase 2 规划
- 在 task_plan.md 补充接口与协议草案（device register + llm-keys 脱敏 + secret envelope）
- 补充最小改动落地顺序、文件改动清单与验证清单（按 Step 1-4 分阶段兼容上线）
- 方向调整：LLM 能力一步到位迁到服务端统一配置，更新 task_plan.md（LLM 网关 + 客户端零密钥 + 本地缓存优先）
- 补充客户端 LLM 四组绑定逻辑（translation/dictionary/titleTranslation/dailyReport）在代码中的存储与使用点，并规划服务端等价实现
- 梳理服务端 Admin Settings 读写链路（server_settings/global + /api/admin/settings + settings.js）用于落地全局 LLM profiles+bindings
- 对 task_plan.md 的“决策点”补充推荐与已定稿项（LLM 全云端化、四组绑定保留、鉴权+最小审计）
- 完善 planning：补齐 Admin 表格/表单配置字段草案、title-translate 网关端点、无配额下的最小审计口径
- 实施 Step 1：新增 /api/llm 网关（dict/translate/title-translate），Admin 系统设置支持全局 profiles+bindings（apiKey 加密存库、管理端脱敏回显），日报生成改为使用全局绑定
- 验证：readflow-server npm run build 通过
- 实施 Step 2：客户端查词/翻译未命中缓存时改为调用服务端 /api/llm（不再读取本地 LLM apiKey）
- 验证：客户端 npx tsc --noEmit 通过
- 修复：补齐 user_preferences 缺表导致的登录/管理端用户列表失败（新增 Prisma migration + 启动自检自动建表）
- 改进：管理后台“快速添加用户”改为调用 /api/auth/register（输入用户名+邮箱+密码），并允许在设置了 SERVER_TOKEN 时用 X-Admin-Token 执行注册
- 实施 Step 3：客户端停止 llm-keys 同步，LLM 设置页改为云端托管提示；服务端 llm-keys 接口不再回传明文 apiKey
- 验证：readflow-server npm run build 通过；客户端 npx tsc --noEmit 通过
- 实施 Step 4（部分）：服务端 /api/llm 增加内存缓存（TTL+LRU）与按 user+feature 的分钟级频控；触发频控返回 429
- 验证：readflow-server npm run build 通过

### 2026-02-28
- 完成 Step 4（治理补齐）：新增 llm_usage_events 审计表（Prisma schema + migration），并在服务端启动时自检自建表
- 网关增强：增加突发频控、按 user+feature 并发上限、全局并发队列与上游错误重试；日志统一 requestId 且不回显上游 body
- 管理后台：新增 /api/admin/llm-usage 聚合统计接口，并在“系统设置”页增加 LLM 使用统计面板
- 验证：readflow-server npm run build 通过

- 修复：dailyReportSettings 云端拉取后在客户端落盘生效，登录后可恢复日报设置
- 兼容：服务端日报配置读取同时兼容顶层 dailyReportSettings 与嵌套 settings.dailyReportSettings
- 验证：客户端 npx tsc --noEmit 通过；服务端 npm run build 通过

- 安全加固：生产环境强制要求 ENCRYPTION_SECRET/JWT_SECRET；生产环境 ADMIN_PASSWORD 不允许默认值；启动失败时生产环境退出进程
- 验证：readflow-server npm run build 通过

- 收口：/api/config/llm-keys 仅 admin/server-token 可访问（普通用户不再获得 LLM key 下发）
- 验证：readflow-server npm run build 通过

- Phase 1 收尾：服务端 /api/config/preferences 增加白名单与 merge 更新，避免整对象覆盖误删字段
- Phase 1 收尾：日报生成改为通过 LLMGatewayService(dailyReport feature) 调用上游，复用网关治理能力
- 验证：readflow-server npm run build 通过；客户端 npx tsc --noEmit 通过

- Phase 2 启动：RSS 刷新状态落库（errorCount/lastErrorMessage）并支持受控并发刷新（RSS_REFRESH_CONCURRENCY）
- Phase 2 启动：sources 同步兼容 groupName（服务端写入时映射/创建 groupId；读取时回传 groupName）
- Phase 2 启动：日报选源改为直接读取 UserFeed+Group，不再依赖 preferences 内嵌 sources
- Phase 2 启动：/api/image 增加 SSRF 防护、DNS 校验、超时与最大体积限制，缓存命中刷新 mtime
- 验证：readflow-server npm run build 通过；客户端 npx tsc --noEmit 通过

- Phase 2 深挖：RSS 刷新与日报调度增加 Postgres advisory lock，避免多实例重复任务
- Phase 2 深挖：清理任务增加 sync_deliveries(acked) retention（SYNC_DELIVERY_RETENTION_DAYS，默认 30）
- Phase 2 深挖：/api/image 增加 Content-Type 基本校验，weserv 回退改为可配置（生产默认关闭）
- 验证：readflow-server npm run build 通过；客户端 npx tsc --noEmit 通过

- Phase 3：云模式下禁用 ImageCacheService 的本地下载与写回重写，避免生成 file:// 图片路径
- Phase 3：移除未使用的 RSShubService 与 react-native-rss-parser 类型声明
- 验证：客户端 npx tsc --noEmit 通过

- Phase 2 收尾：RSS 全文抓取超时可配置（rssFulltextTimeoutMs），并透传到抓取链路
- Phase 2 收尾：cleanup 增加 daily_reports retention（dailyReportRetentionDays），并在日志输出 daily_reports/sync_deliveries 清理数
- Phase 2 收尾：/api/image 增加安全重定向逐跳校验与可选 IP 分钟级频控（IMAGE_RATE_LIMIT_PER_IP_PER_MIN）
- 验证：readflow-server npm run build 通过；客户端 npx tsc --noEmit 通过

- Phase 4：登录/初始化后自动 bootstrap 配置（按远端/本地空判断 pull/push，并用一次强制 push 合并订阅/分组/规则）
- Phase 4：登录后写入 appSettings.sync.userId，保证后续状态同步路径可用
- Phase 4：设置页新增“同步阅读状态 / 重新执行配置迁移”入口，便于回归与故障自愈
- Phase 4：阅读状态同步改为本地 dirty 队列（article_state_changes），仅同步 read/unread/favorite（不含阅读进度）
- Phase 4：同步频率改为切后台时 push 一次（AppState background/inactive），仍保留手动立即同步兜底
- Phase 4：状态回填策略补齐：切前台（AppState active）按最小 12 小时间隔 pull 一次（lastStatePullAt）
- 验证：客户端 npx tsc --noEmit 通过
