import { PrismaClient } from '.prisma/client';
import { logger } from '../utils/Logger';
import { storageService } from './StorageService';
import { llmGatewayService } from './LLMGatewayService';
import { simpleHash } from '../utils/RSSUtils';

const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: ['warn', 'error'],
});

// Cast to any for dailyReport model - types will be available after `prisma generate`
const prismaAny = prisma as any;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DailyReportConfig {
    enabled: boolean;
    scheduledTime: string; // HH:mm format, e.g. "06:00"
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

interface ArticleForRaw {
    title: string;
    url: string;
    sourceName: string;
    content: string;
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
        const settings = (configSync?.settings && typeof configSync.settings === 'object') ? configSync.settings : {};
        const drSettings =
            settings?.dailyReportSettings
            || configSync?.dailyReportSettings
            || userConfig?.dailyReportSettings
            || (userConfig?.settings && typeof userConfig.settings === 'object' ? userConfig.settings.dailyReportSettings : undefined);

        // Backwards compat: if scheduledTime not set, default to "06:00"
        let scheduledTime = '06:00';
        if (typeof drSettings?.scheduledTime === 'string' && /^\d{2}:\d{2}$/.test(drSettings.scheduledTime)) {
            scheduledTime = drSettings.scheduledTime;
        }

        return {
            enabled: drSettings?.enabled !== false, // default enabled
            scheduledTime,
            groupNames: Array.isArray(drSettings?.groupNames) ? drSettings.groupNames : [],
            articleLimit: typeof drSettings?.articleLimit === 'number' ? drSettings.articleLimit : 0,
        };
    }

    /**
     * Get source URLs for the target groups from user's synced config
     */
    private async getSourceUrlsForGroups(userId: string, targetGroupNames: string[]): Promise<string[]> {
        const feeds = await (prisma as any).userFeed.findMany({
            where: { userId },
            include: { source: true, group: true }
        }).catch(() => []);

        if (!Array.isArray(feeds) || feeds.length === 0) return [];

        const pickDefault = targetGroupNames.length === 0;
        const groupNameSet = new Set(targetGroupNames.map((n: string) => String(n || '').toLowerCase()).filter(Boolean));
        const out = new Set<string>();

        for (const f of feeds) {
            const url = f?.source?.url ? String(f.source.url) : '';
            if (!url) continue;
            const groupName = f?.group?.name ? String(f.group.name) : '';
            if (!groupName) continue;
            const gn = groupName.toLowerCase();
            if (!pickDefault) {
                if (groupNameSet.has(gn)) out.add(url);
                continue;
            }
            if (gn.includes('新闻') || gn.includes('news')) out.add(url);
        }

        return Array.from(out);
    }

    /**
     * Fetch recent articles from the database for given source URLs
     */
    private async fetchRecentArticles(sourceUrls: string[], since: Date, limit: number = 0): Promise<ArticleForSummary[]> {
        if (sourceUrls.length === 0) return [];

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
                publishedAt: { gte: since },
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
     * Fetch cleaned articles for a specific user within a date range (for external API use)
     */
    async getCleanedArticlesForDateRange(userId: string, startTime: Date, endTime: Date): Promise<ArticleForSummary[]> {
        // 1. Get user config to determine groups
        const dbUser = await prisma.user.findUnique({ where: { uuid: userId } });
        if (!dbUser) {
            throw new Error(`User not found: ${userId}`);
        }

        const pref = await prismaAny.userPreference.findUnique({ where: { userId: dbUser.uuid } });
        const userConfig = pref?.settings || {};
        const config = this.getDailyReportConfig(userConfig);

        // 2. Get source URLs for selected groups (or default news groups)
        const sourceUrls = await this.getSourceUrlsForGroups(userId, config.groupNames);
        if (sourceUrls.length === 0) {
            return [];
        }

        // 3. Find source IDs
        const sources = await prisma.rSSSource.findMany({
            where: { url: { in: sourceUrls } },
            select: { id: true, name: true },
        });

        if (sources.length === 0) return [];

        const sourceIdToName = new Map(sources.map(s => [s.id, s.name]));
        const sourceIds = sources.map(s => s.id);

        // 4. Fetch articles within the date range
        const articles = await prisma.article.findMany({
            where: {
                sourceId: { in: sourceIds },
                publishedAt: {
                    gte: startTime,
                    lte: endTime
                },
            },
            orderBy: { publishedAt: 'desc' },
            select: {
                title: true,
                url: true,
                content: true,
                sourceId: true,
                publishedAt: true,
            },
        });

        // 5. Apply the exact same cleaning logic as the daily report
        return articles.map(a => ({
            title: a.title,
            url: a.url,
            sourceName: sourceIdToName.get(a.sourceId) || 'Unknown',
            content: truncateText(stripHtmlToText(a.content || ''), 1500),
            publishedAt: a.publishedAt.toISOString(),
        }));
    }

    async getRawArticlesForDateRange(userId: string, startTime: Date, endTime: Date): Promise<ArticleForRaw[]> {
        const dbUser = await prisma.user.findUnique({ where: { uuid: userId } });
        if (!dbUser) {
            throw new Error(`User not found: ${userId}`);
        }

        const pref = await prismaAny.userPreference.findUnique({ where: { userId: dbUser.uuid } });
        const userConfig = pref?.settings || {};
        const config = this.getDailyReportConfig(userConfig);

        const sourceUrls = await this.getSourceUrlsForGroups(userId, config.groupNames);
        if (sourceUrls.length === 0) {
            return [];
        }

        const sources = await prisma.rSSSource.findMany({
            where: { url: { in: sourceUrls } },
            select: { id: true, name: true },
        });

        if (sources.length === 0) return [];

        const sourceIdToName = new Map(sources.map(s => [s.id, s.name]));
        const sourceIds = sources.map(s => s.id);

        const articles = await prisma.article.findMany({
            where: {
                sourceId: { in: sourceIds },
                publishedAt: {
                    gte: startTime,
                    lte: endTime
                },
            },
            orderBy: { publishedAt: 'desc' },
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
            content: a.content || '',
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

## 绝对结构规范（必须严格遵守的标题层级）

整份报告**只能且必须**包含以下层级的标题，且必须严格按照以下格式输出：

### 1. 今日洞察（全局唯一 H1）

**必须原样输出：** \`# 💡 今日洞察\`
用**一段话**（100-150字）概括今天最重要的宏观趋势。将科技进步、市场动态和地缘政治联系起来，给出你独到的见解。**此部分下绝对禁止使用任何子标题**，重点信息请加粗显示。

### 2. 分类新闻（必须且只能使用 H2）

将新闻分为以下几类（根据实际内容调整，可增减），**分类标题必须是 H2 (##)**：

- \`## 🚀 科技前沿\`
- \`## 💰 金融市场\`
- \`## 🌏 全球动态\`
- \`## 🗞️ 社会百态\`

在每个 H2 分类下，提炼 3-5 个核心主题。**核心主题必须且只能是 H3 (###)**（例如：\`### AI模型与应用\`）。

在每个 H3 核心主题下：
- 用无序列表列出相关新闻的总结，尽量简练，一句话即可。
- 每个条目之间不加空行。
- 在句末标注来源，**必须使用文章编号**，格式为 \`_(来源名#文章编号, 来源名#文章编号)_\`，编号对应素材中【文章 N】的 N。例如 \`_(cnBeta#3, AIBase#7)_\`。
- 对关键实体（公司、产品、人名）进行**加粗**。

### 3. 资讯速览（必须且只能使用 H2）

**必须原样输出：** \`## ⚡ 资讯速览\`
汇总其他值得关注的快讯（10-15条）。**此部分绝对禁止使用任何 H3 或其他层级的标题**。格式如下：

- 内容快讯摘要一句话。_(来源名#文章编号)_
- 内容快讯摘要一句话。_(来源名#文章编号)_

## 其他格式要求

- **严禁**在上述指定结构之外自创任何 H1、H2、H3 标题。
- **不要**在标题之间添加分割线（---）。
- **不要**换行显示新闻快讯，保持单行格式。
- 来源格式统一为 '_(来源名#文章编号)_'，例如 '_(cnBeta#3)_' 或 '_(BBC#1, 参考消息#5)_'。编号必须与素材中【文章 N】的编号一致。
- 段落之间保留空行，但**列表项之间不要留空行**（保持紧凑）。`;

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
     * @param generatedBy - 'manual' for user-triggered, 'auto' for scheduled
     */
    async generateForUser(userId: string, generatedBy: 'auto' | 'manual' = 'manual'): Promise<{ id: number; title: string } | null> {
        logger.info(`[DailyReport] Starting ${generatedBy} generation for user ${userId}`);

        // 1. Get user config
        const dbUser = await prisma.user.findUnique({ where: { uuid: userId } });
        if (!dbUser) {
            logger.warn(`[DailyReport] User not found: ${userId}`);
            return null;
        }

        const pref = await prismaAny.userPreference.findUnique({ where: { userId: dbUser.uuid } });
        const userConfig = pref?.settings || {};
        const config = this.getDailyReportConfig(userConfig);

        if (!config.enabled) {
            logger.debug(`[DailyReport] Daily report disabled for user ${userId}`);
            return null;
        }

        // 3. Get source URLs for ALL selected groups
        const sourceUrls = await this.getSourceUrlsForGroups(userId, config.groupNames);
        if (sourceUrls.length === 0) {
            logger.warn(`[DailyReport] No sources found for target groups, user ${userId}`);
            return null;
        }

        logger.debug(`[DailyReport] Found ${sourceUrls.length} sources for groups: ${config.groupNames.join(', ') || '(default news)'}`);

        // 4. Fetch articles from the last 24 hours
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const articles = await this.fetchRecentArticles(sourceUrls, since, config.articleLimit);
        if (articles.length === 0) {
            logger.debug(`[DailyReport] No recent articles found for user ${userId}`);
            return null;
        }

        logger.debug(`[DailyReport] Fetched ${articles.length} articles for summarization`);

        // 5. Build prompt and call LLM
        const { systemPrompt, userPrompt } = this.buildPrompt(articles);
        const combinedPrompt = `${String(systemPrompt || '').trim()}\n\n${String(userPrompt || '').trim()}`.trim();
        let summary = '';
        try {
            const result = await llmGatewayService.dailyReport(userId, combinedPrompt, { v: 1, promptHash: String(simpleHash(combinedPrompt)) });
            summary = result.text;
        } catch (e: any) {
            logger.warn(`[DailyReport] LLM failed user=${userId} err=${String(e?.message || e)}`);
            return null;
        }

        // 6. Build title
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        const title = `${dateStr} ${timeStr} 日报`;

        // 7. Save to database with generatedBy marker
        const report = await prismaAny.dailyReport.create({
            data: {
                userId,
                title,
                content: summary,
                sourceUrls: articles.map(a => a.url),
                articleCount: articles.length,
                groupNames: config.groupNames.length > 0 ? config.groupNames : ['新闻'],
                generatedBy,
                generatedAt: now,
            },
        });

        logger.info(`[DailyReport] Generated ${generatedBy} report #${report.id} for user ${userId}: "${title}" (${articles.length} articles)`);

        return { id: report.id, title };
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

        // Look up article IDs and titles from sourceUrls
        const urls: string[] = Array.isArray(report.sourceUrls) ? report.sourceUrls : [];
        let sourceArticles: { url: string; title: string; articleId: number; sourceName: string }[] = [];
        if (urls.length > 0) {
            try {
                const articles = await prisma.article.findMany({
                    where: { url: { in: urls } },
                    select: { id: true, url: true, title: true, source: { select: { name: true } } },
                });
                sourceArticles = articles.map(a => ({
                    url: a.url,
                    title: a.title,
                    articleId: a.id,
                    sourceName: a.source?.name || '',
                }));
            } catch (e) {
                logger.warn('[DailyReport] Failed to lookup source articles:', e);
            }
        }

        return {
            id: report.id,
            title: report.title,
            content: report.content,
            sourceUrls: report.sourceUrls,
            sourceArticles,
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
     * Schedule daily report generation for all users who need it.
     * Uses fixed daily time scheduling: checks if current time has passed
     * the user's scheduledTime and no auto report exists for today.
     */
    async scheduleAllUsers(): Promise<void> {
        logger.debug('[DailyReport] Checking all users for due report generation...');
        const lockName = 'daily_report_scheduler';
        const locked = await storageService.tryAcquireAdvisoryLock(lockName);
        if (!locked) return;

        try {
            const users = await prisma.user.findMany({
                select: { uuid: true },
            });

            const now = new Date();

            for (const user of users) {
                try {
                    const pref = await prismaAny.userPreference.findUnique({ where: { userId: user.uuid } });
                    const userConfig = pref?.settings || {};
                    const config = this.getDailyReportConfig(userConfig);

                    if (!config.enabled) continue;

                    // Parse scheduled time (HH:mm)
                    const [hourStr, minStr] = config.scheduledTime.split(':');
                    const scheduledHour = parseInt(hourStr, 10);
                    const scheduledMin = parseInt(minStr, 10);
                    if (isNaN(scheduledHour) || isNaN(scheduledMin)) continue;

                    // Build today's scheduled datetime (server timezone: Asia/Shanghai)
                    const todayScheduled = new Date(now);
                    todayScheduled.setHours(scheduledHour, scheduledMin, 0, 0);

                    // Not yet time
                    if (now < todayScheduled) continue;

                    // Check if an AUTO report already exists for today
                    // "Today" = from 00:00 of current day
                    const todayStart = new Date(now);
                    todayStart.setHours(0, 0, 0, 0);

                    const existingAutoReport = await prismaAny.dailyReport.findFirst({
                        where: {
                            userId: user.uuid,
                            generatedBy: 'auto',
                            generatedAt: { gte: todayStart },
                        },
                        select: { id: true },
                    });

                    if (existingAutoReport) {
                        continue; // Already generated today (auto), skip
                    }

                    logger.debug(`[DailyReport] User ${user.uuid} is due for auto report (scheduled: ${config.scheduledTime})`);
                    await this.generateForUser(user.uuid, 'auto');
                } catch (e) {
                    logger.error(`[DailyReport] Failed for user ${user.uuid}:`, e);
                }
            }

            logger.debug('[DailyReport] Schedule check complete');
        } finally {
            await storageService.releaseAdvisoryLock(lockName);
        }
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
