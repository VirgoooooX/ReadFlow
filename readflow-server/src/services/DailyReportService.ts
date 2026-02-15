import { PrismaClient } from '.prisma/client';
import fetch from 'node-fetch';
import { logger } from '../utils/Logger';
import { storageService } from './StorageService';
import parser from 'cron-parser';

const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: ['warn', 'error'],
});

// Cast to any for dailyReport model - types will be available after `prisma generate`
const prismaAny = prisma as any;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LLMProfile {
    id: string;
    name: string;
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    isActive: boolean;
    customModelName?: string;
}

interface DailyReportConfig {
    enabled: boolean;
    schedule: string;
    groupNames: string[];
    articleLimit: number;
}

interface ArticleForSummary {
    title: string;
    url: string;
    sourceName: string;
    content: string; // cleaned plain text
    publishedAt: string;
}

// ─── Content Cleaning ────────────────────────────────────────────────────────

function stripHtmlToText(html: string): string {
    if (!html) return '';
    try {
        // Use linkedom for parsing (already a project dependency)
        const { parseHTML } = require('linkedom');
        const { document } = parseHTML(`<body>${html}</body>`);

        // Remove non-content elements
        const removeTags = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript', 'svg'];
        for (const tag of removeTags) {
            const els = document.querySelectorAll(tag);
            for (const el of els) el.remove();
        }

        // Get text content
        let text = document.body?.textContent || '';

        // Normalize whitespace
        text = text.replace(/[\t ]+/g, ' ');
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.trim();

        return text;
    } catch (e) {
        // Fallback: crude regex strip
        let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/&nbsp;/gi, ' ');
        text = text.replace(/&amp;/gi, '&');
        text = text.replace(/&lt;/gi, '<');
        text = text.replace(/&gt;/gi, '>');
        text = text.replace(/\s+/g, ' ');
        return text.trim();
    }
}

function truncateText(text: string, maxLength: number = 1500): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ─── LLM Call ────────────────────────────────────────────────────────────────

async function callLLM(
    prompt: string,
    systemPrompt: string,
    profile: LLMProfile
): Promise<string> {
    const model = profile.customModelName || profile.model;
    let baseUrl = profile.baseUrl || 'https://api.openai.com/v1';
    // Normalize: ensure baseUrl ends with /v1 for OpenAI-compatible APIs
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1')) {
        // Check if it already has a path like /v1/chat/completions
        if (!baseUrl.includes('/v1')) {
            baseUrl += '/v1';
        }
    }

    const url = `${baseUrl}/chat/completions`;

    const body = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
        ],
        temperature: profile.temperature ?? 0.7,
        max_tokens: profile.maxTokens ?? 4096,
        top_p: profile.topP ?? 1,
    };

    logger.info(`[DailyReport] Calling LLM: model=${model} url=${url}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${profile.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`LLM API error ${response.status}: ${text.substring(0, 500)}`);
    }

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('LLM returned empty content');
    }

    return content;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DailyReportService {
    private static instance: DailyReportService;

    public static getInstance(): DailyReportService {
        if (!DailyReportService.instance) {
            DailyReportService.instance = new DailyReportService();
        }
        return DailyReportService.instance;
    }

    /**
     * Extract daily report config from user's synced settings
     */
    private getDailyReportConfig(userConfig: any): DailyReportConfig {
        const configSync = userConfig?.configSync || userConfig;
        const settings = configSync?.settings || {};
        const drSettings = settings?.dailyReportSettings;

        // Default schedule: 06:00 and 18:00 daily
        const defaultSchedule = '0 6,18 * * *';

        // Migrate or use default
        let schedule = drSettings?.schedule;
        if (!schedule && typeof drSettings?.intervalHours === 'number') {
            // If migrating from interval, just use default for simplicity, or try to map?
            // User likely wants fixed times now.
            schedule = defaultSchedule;
        }

        return {
            enabled: drSettings?.enabled !== false, // default enabled
            schedule: schedule || defaultSchedule,
            groupNames: Array.isArray(drSettings?.groupNames) ? drSettings.groupNames : [],
            articleLimit: typeof drSettings?.articleLimit === 'number' ? drSettings.articleLimit : 0,
        };
    }

    /**
     * Extract the LLM profile bound to dailyReport feature
     */
    private getLLMProfile(userConfig: any): LLMProfile | null {
        const configSync = userConfig?.configSync || userConfig;
        const settings = configSync?.settings || {};
        const llmSettings = settings?.llmSettings;

        if (!llmSettings || !Array.isArray(llmSettings.profiles) || llmSettings.profiles.length === 0) {
            return null;
        }

        const bindings = llmSettings.bindings || {};
        const boundId = bindings.dailyReport || bindings.translation; // fallback to translation binding
        if (boundId) {
            const found = llmSettings.profiles.find((p: LLMProfile) => p.id === boundId);
            if (found && found.apiKey) return found;
        }

        // Fallback: first active profile with an API key
        const fallback = llmSettings.profiles.find((p: LLMProfile) => p.isActive && p.apiKey);
        return fallback || null;
    }

    /**
     * Get source URLs for the target groups from user's synced config
     */
    private getSourceUrlsForGroups(userConfig: any, targetGroupNames: string[]): string[] {
        const configSync = userConfig?.configSync || userConfig;
        const sources: any[] = configSync?.sources || [];

        if (!Array.isArray(sources) || sources.length === 0) return [];

        // If no target groups specified, default to groups containing "新闻" or "News"
        const effectiveGroupNames = targetGroupNames.length > 0
            ? targetGroupNames
            : []; // will use default matching below

        if (effectiveGroupNames.length > 0) {
            const groupNameSet = new Set(effectiveGroupNames.map((n: string) => n.toLowerCase()));
            return sources
                .filter((s: any) => s.groupName && groupNameSet.has(s.groupName.toLowerCase()))
                .map((s: any) => s.url)
                .filter(Boolean);
        }

        // Default: match groups containing "新闻" or "news"
        return sources
            .filter((s: any) => {
                if (!s.groupName) return false;
                const gn = s.groupName.toLowerCase();
                return gn.includes('新闻') || gn.includes('news');
            })
            .map((s: any) => s.url)
            .filter(Boolean);
    }

    /**
     * Fetch recent articles from the database for given source URLs
     */
    private async fetchRecentArticles(
        sourceUrls: string[],
        lookbackHours: number,
        limit: number = 0,
        startDate?: Date,
        endDate?: Date
    ): Promise<ArticleForSummary[]> {
        if (sourceUrls.length === 0) return [];

        const since = startDate || new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
        const until = endDate || new Date();

        // Find source IDs
        const sources = await prisma.rSSSource.findMany({
            where: { url: { in: sourceUrls } },
            select: { id: true, name: true, url: true },
        });

        if (sources.length === 0) return [];

        const sourceIdToName = new Map(sources.map(s => [s.id, s.name]));
        const sourceIds = sources.map(s => s.id);

        const articles = await prisma.article.findMany({
            where: {
                sourceId: { in: sourceIds },
                publishedAt: {
                    gte: since,
                    lte: until
                },
            },
            orderBy: { publishedAt: 'desc' },
            take: limit > 0 ? limit : undefined,
            select: {
                title: true,
                url: true,
                content: true,
                sourceId: true,
                publishedAt: true,
            },
        });

        return articles.map(a => ({
            title: a.title,
            url: a.url,
            sourceName: sourceIdToName.get(a.sourceId) || 'Unknown',
            content: truncateText(stripHtmlToText(a.content || ''), 1500),
            publishedAt: a.publishedAt.toISOString(),
        }));
    }

    /**
     * Build the LLM prompt from articles
     */
    private buildPrompt(articles: ArticleForSummary[]): { systemPrompt: string; userPrompt: string } {
        const settings = storageService.getSettings();
        const defaultSystemPrompt = `你是一位资深科技资讯编辑。你的任务是将多篇新闻素材编纂成一份**深度、有洞察力且排版精美**的日报。

## 核心原则

- **深度整合**：不要简单罗列新闻，而是要寻找新闻背后的关联，提炼出核心趋势。
- **归纳整合**：不再逐条罗列新闻。你需要分析所有素材，将同一主题（如某公司发新模型、某领域新规）的多条新闻合并。
- **全球视野**：关注全球科技、金融、地缘政治的互动。
- **排版美观**：直接从H1标题开始输出，拒绝任何多余的开场白，合理使用 Emoji、加粗、列表等 Markdown 语法，提升阅读体验。

## 输出结构

### 1. 今日洞察（H1）

\`# 💡 今日洞察\`
用**一段话**（100-150字）概括今天最重要的宏观趋势。将科技进步、市场动态和地缘政治联系起来，给出你独到的见解。**不要**使用额外的子标题，重点信息要加粗显示。

### 2. 分类新闻（H2）

请将新闻分为以下几类（根据实际内容调整，可增减）：

- \`## 🚀 科技前沿\`
- \`## 💰 金融市场\`
- \`## 🌏 全球动态\`
- \`## 🗞️ 社会百态\`

请根据新闻内容，在每个分类下提炼 3-5 个核心主题（例如 "AI模型与应用"、"硬件创新"、"投融资动态" 等，根据实际内容调整，可增减）

- 每个主题下面用无序列表列出简短的每条相关新闻的总结，要尽量简练，简短，一句话即可
- 每个条目之间不加空行
- 在句末用括号标注来源，如 \`(cnBeta, AIBase)\`
- 对关键实体（公司、产品、人名）进行**加粗**。

### 3. 资讯速览（H2）

\`## ⚡ 资讯速览\`
用简短的一句话概括其他值得关注的快讯（10-15条）。

- **标题**：一句话内容。_(来源)_

## 格式要求

- 严格遵守 H1 (#) 和 H2 (##) 标题层级。
- **不要**在 H2 之间添加分割线（---）。
- **不要**换行显示新闻内容，保持 '- **标题**：内容' 的单行格式。
- 来源格式统一为 '_(来源名称)_'，例如 '_(cnBeta)_' 或 '_(BBC, 参考消息)_'。
- 关键信息（如人名、公司名、数据）适当**加粗**。
- 段落之间保留空行，但**列表项之间不要留空行**（紧凑列表）。`;

        const systemPrompt = settings.dailyReportSystemPrompt || defaultSystemPrompt;

        let userPrompt = `以下是今天的 ${articles.length} 篇新闻文章，请生成日报摘要：\n\n`;

        for (let i = 0; i < articles.length; i++) {
            const a = articles[i];
            userPrompt += `---\n`;
            userPrompt += `【文章 ${i + 1}】\n`;
            userPrompt += `标题: ${a.title}\n`;
            userPrompt += `来源: ${a.sourceName}\n`;
            userPrompt += `时间: ${new Date(a.publishedAt).toLocaleString('zh-CN')}\n`;
            if (a.content) {
                userPrompt += `内容: ${a.content}\n`;
            }
            userPrompt += `\n`;
        }

        return { systemPrompt, userPrompt };
    }

    /**
     * Generate a daily report for a specific user
     */
    async generateForUser(
        userId: string,
        options: { type: 'manual' | 'auto'; targetTime?: Date } = { type: 'manual' }
    ): Promise<{ id: number; title: string } | null> {
        logger.info(`[DailyReport] Starting generation for user ${userId} (${options.type})`);

        // 1. Get user config
        const dbUser = await prisma.user.findUnique({ where: { uuid: userId } });
        if (!dbUser) {
            logger.warn(`[DailyReport] User not found: ${userId}`);
            return null;
        }

        const userConfig = (dbUser.syncData as any) || {};
        const config = this.getDailyReportConfig(userConfig);

        if (!config.enabled && options.type === 'auto') {
            logger.info(`[DailyReport] Daily report disabled for user ${userId}`);
            return null;
        }

        // 2. Get LLM profile
        const llmProfile = this.getLLMProfile(userConfig);
        if (!llmProfile) {
            logger.warn(`[DailyReport] No LLM profile found for user ${userId}`);
            return null;
        }

        // 3. Get source URLs for target groups
        const sourceUrls = this.getSourceUrlsForGroups(userConfig, config.groupNames);
        if (sourceUrls.length === 0) {
            logger.info(`[DailyReport] No sources found for target groups, user ${userId}`);
            return null;
        }

        // 4. Determine Lookback Period
        let startDate: Date;
        let endDate: Date;
        const now = new Date();

        if (options.type === 'auto' && options.targetTime) {
            endDate = options.targetTime;
            try {
                // Parse schedule relative to targetTime to find the previous slot
                const interval = parser.parseExpression(config.schedule, {
                    currentDate: endDate,
                    tz: 'Asia/Shanghai'
                });
                // prev() from targetTime should give us the start of the period
                // Note: cron-parser start date is inclusive/exclusive depending on options.
                // If currentDate matches schedule, prev() goes back.
                startDate = interval.prev().toDate();
            } catch (e) {
                logger.warn(`[DailyReport] Failed to parse schedule for user ${userId}, falling back to 12h`, e);
                startDate = new Date(endDate.getTime() - 12 * 60 * 60 * 1000);
            }
        } else {
            // Manual: default to last 24h or since last report?
            // Ideally manual covers "now", maybe looks back 24h.
            endDate = now;
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        // Calculate lookback hours effectively for fetch function (which takes hours)
        // Or refactor fetchRecentArticles to take Date range.
        // Current fetchRecentArticles takes hours. modifying it is better.
        // Let's modify fetchRecentArticles signature first?
        // Or just calculate hours.
        const diffMs = endDate.getTime() - startDate.getTime();
        const lookbackHours = diffMs / (1000 * 60 * 60);

        logger.info(`[DailyReport] Fetching articles from ${startDate.toISOString()} to ${endDate.toISOString()} (${lookbackHours.toFixed(1)}h)`);

        const articles = await this.fetchRecentArticles(sourceUrls, lookbackHours, config.articleLimit, startDate, endDate);

        if (articles.length === 0) {
            logger.info(`[DailyReport] No recent articles found for user ${userId}`);
            // Even if no articles, if it's auto, we might want to update the schedule to avoid retrying?
            // But if we strictly return null, the caller (scheduler) won't update syncData.
            // Let's return null here, but the scheduler should probably update the timestamp anyway to "skip" this slot?
            // Or maybe generate an "Empty Report"?
            // For now, let's treat it as "done" but no report generated.
            // Caller needs to distinguish.
            return null;
        }

        logger.info(`[DailyReport] Fetched ${articles.length} articles for summarization`);

        // 5. Build prompt and call LLM
        const { systemPrompt, userPrompt } = this.buildPrompt(articles);
        const summary = await callLLM(userPrompt, systemPrompt, llmProfile);

        // 6. Build title
        const dateStr = endDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = endDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        const title = `${dateStr} ${timeStr} 日报`;

        // 7. Save to database
        const report = await prismaAny.dailyReport.create({
            data: {
                userId,
                title,
                content: summary,
                sourceUrls: articles.map(a => a.url),
                articleCount: articles.length,
                groupNames: config.groupNames.length > 0 ? config.groupNames : ['新闻'],
                generatedAt: endDate, // Use target time as generation time? Or actual generation time? Better actual.
                // Actually, for sorting, using 'now' is better.
            },
        });

        // 8. Update SyncData if Auto
        if (options.type === 'auto' && options.targetTime) {
            await this.updateLastAutoTime(userId, dbUser.syncData, options.targetTime);
        }

        logger.info(`[DailyReport] Generated report #${report.id} for user ${userId}: "${title}"`);
        return { id: report.id, title };
    }

    private async updateLastAutoTime(userId: string, currentSyncData: any, time: Date) {
        try {
            const newSyncData = JSON.parse(JSON.stringify(currentSyncData || {}));
            if (!newSyncData.dailyReport) newSyncData.dailyReport = {};

            newSyncData.dailyReport.lastAutoReportTime = time.toISOString();

            await prisma.user.update({
                where: { uuid: userId },
                data: { syncData: newSyncData }
            });
            logger.info(`[DailyReport] Updated lastAutoReportTime for user ${userId} to ${time.toISOString()}`);
        } catch (e) {
            logger.error(`[DailyReport] Failed to update syncData for user ${userId}`, e);
        }
    }

    /**
     * Get daily reports for a user
     */
    async getReportsForUser(userId: string, limit: number = 10, offset: number = 0) {
        const reports = await prismaAny.dailyReport.findMany({
            where: { userId },
            orderBy: { generatedAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                title: true,
                content: true,
                articleCount: true,
                groupNames: true,
                generatedAt: true,
                isRead: true,
            },
        });

        return reports.map((r: any) => ({
            id: r.id,
            title: r.title,
            content: r.content,
            articleCount: r.articleCount,
            groupNames: r.groupNames,
            generatedAt: r.generatedAt.toISOString(),
            isRead: r.isRead,
        }));
    }

    /**
     * Get a single daily report by ID
     */
    async getReportById(reportId: number, userId: string) {
        const report = await prismaAny.dailyReport.findFirst({
            where: { id: reportId, userId },
        });

        if (!report) return null;

        return {
            id: report.id,
            title: report.title,
            content: report.content,
            sourceUrls: report.sourceUrls,
            articleCount: report.articleCount,
            groupNames: report.groupNames,
            generatedAt: report.generatedAt.toISOString(),
            createdAt: report.createdAt.toISOString(),
            isRead: report.isRead,
        };
    }

    /**
     * Get the latest daily report for a user
     */
    async getLatestReport(userId: string) {
        const report = await prismaAny.dailyReport.findFirst({
            where: { userId },
            orderBy: { generatedAt: 'desc' },
        });

        if (!report) return null;

        return {
            id: report.id,
            title: report.title,
            content: report.content,
            sourceUrls: report.sourceUrls,
            articleCount: report.articleCount,
            groupNames: report.groupNames,
            generatedAt: report.generatedAt.toISOString(),
            isRead: report.isRead,
        };
    }

    /**
     * Schedule daily report generation for all users who need it
     */
    async scheduleAllUsers(): Promise<void> {
        logger.info('[DailyReport] Checking all users for due report generation...');

        const users = await prisma.user.findMany({
            select: { uuid: true, syncData: true },
        });

        const now = new Date();

        for (const user of users) {
            try {
                const userConfig = (user.syncData as any) || {};
                const config = this.getDailyReportConfig(userConfig);

                if (!config.enabled) continue;

                // Parse schedule
                // User input: "0 6,18 * * *"
                // We want to find the latest "tick" that happened <= now
                const interval = parser.parseExpression(config.schedule, {
                    currentDate: now,
                    tz: 'Asia/Shanghai'
                });

                // prev() finds the most recent execution time relative to 'now'
                const prev = interval.prev();
                const targetTime = prev.toDate();

                // Check last auto time
                const lastAutoTimeStr = userConfig.dailyReport?.lastAutoReportTime;
                let shouldGenerate = false;

                if (!lastAutoTimeStr) {
                    // Never generated -> generate
                    shouldGenerate = true;
                } else {
                    const lastAutoTime = new Date(lastAutoTimeStr);
                    // If last run was before target time, we missed this slot
                    if (lastAutoTime.getTime() < targetTime.getTime()) {
                        shouldGenerate = true;
                    }
                }

                if (shouldGenerate) {
                    logger.info(`[DailyReport] User ${user.uuid} due for report at ${targetTime.toISOString()}`);
                    const result = await this.generateForUser(user.uuid, { type: 'auto', targetTime });

                    // If result is null (e.g. no articles), we MUST still update the timestamp
                    // Otherwise it will retry every minute forever.
                    if (!result) {
                        await this.updateLastAutoTime(user.uuid, user.syncData, targetTime);
                    }
                }

            } catch (e) {
                logger.error(`[DailyReport] Failed schedule check for user ${user.uuid}:`, e);
            }
        }

        logger.info('[DailyReport] Schedule check complete');
    }

    /**
     * Mark a report as read
     */
    async markAsRead(reportId: number, userId: string): Promise<boolean> {
        const report = await prismaAny.dailyReport.findFirst({
            where: { id: reportId, userId },
        });

        if (!report) return false;

        await prismaAny.dailyReport.update({
            where: { id: reportId },
            data: { isRead: true },
        });

        return true;
    }
}

export const dailyReportService = DailyReportService.getInstance();
