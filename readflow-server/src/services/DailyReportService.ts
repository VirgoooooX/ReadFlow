import { PrismaClient } from '.prisma/client';
import fetch from 'node-fetch';
import { logger } from '../utils/Logger';
import { storageService } from './StorageService';

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
    intervalHours: number;
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

        return {
            enabled: drSettings?.enabled !== false, // default enabled
            intervalHours: drSettings?.intervalHours ?? 12,
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
    private async fetchRecentArticles(sourceUrls: string[], lookbackHours: number, limit: number = 0): Promise<ArticleForSummary[]> {
        if (sourceUrls.length === 0) return [];

        const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

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
    async generateForUser(userId: string): Promise<{ id: number; title: string } | null> {
        logger.info(`[DailyReport] Starting generation for user ${userId}`);

        // 1. Get user config
        const dbUser = await prisma.user.findUnique({ where: { uuid: userId } });
        if (!dbUser) {
            logger.warn(`[DailyReport] User not found: ${userId}`);
            return null;
        }

        const userConfig = (dbUser.syncData as any) || {};
        const config = this.getDailyReportConfig(userConfig);

        if (!config.enabled) {
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
            logger.warn(`[DailyReport] No sources found for target groups, user ${userId}`);
            return null;
        }

        logger.info(`[DailyReport] Found ${sourceUrls.length} sources for groups: ${config.groupNames.join(', ') || '(default news)'}`);

        // 4. Fetch recent articles
        // If interval is 0 (manual), default to 24h lookback
        const lookbackHours = config.intervalHours > 0 ? config.intervalHours : 24;
        const articles = await this.fetchRecentArticles(sourceUrls, lookbackHours, config.articleLimit);
        if (articles.length === 0) {
            logger.info(`[DailyReport] No recent articles found for user ${userId}`);
            return null;
        }

        logger.info(`[DailyReport] Fetched ${articles.length} articles for summarization`);

        // 5. Build prompt and call LLM
        const { systemPrompt, userPrompt } = this.buildPrompt(articles);
        const summary = await callLLM(userPrompt, systemPrompt, llmProfile);

        // 6. Build title
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
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
                generatedAt: now,
            },
        });

        logger.info(`[DailyReport] Generated report #${report.id} for user ${userId}: "${title}" (${articles.length} articles)`);

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

        for (const user of users) {
            try {
                const userConfig = (user.syncData as any) || {};
                const config = this.getDailyReportConfig(userConfig);

                if (!config.enabled) continue;

                // If interval is 0 (manual), skip auto-scheduling
                if (config.intervalHours <= 0) continue;

                // Check if a report was generated recently enough
                const lastReport = await prismaAny.dailyReport.findFirst({
                    where: { userId: user.uuid },
                    orderBy: { generatedAt: 'desc' },
                    select: { generatedAt: true },
                });

                const intervalMs = config.intervalHours * 60 * 60 * 1000;
                const now = Date.now();

                if (lastReport && (now - lastReport.generatedAt.getTime()) < intervalMs) {
                    continue; // Not due yet
                }

                logger.info(`[DailyReport] User ${user.uuid} is due for report generation`);
                await this.generateForUser(user.uuid);
            } catch (e) {
                logger.error(`[DailyReport] Failed for user ${user.uuid}:`, e);
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
