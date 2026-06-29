import { Request, Response } from 'express';
import { encrypt } from '../utils/encryption';
import { prisma } from '../db/prisma';
import { ValidationError, validateString, validateInt, validateArray, validateUrl } from '../utils/validation';

// Declare global Express Request to have user
declare global {
    namespace Express {
        interface Request {
            user?: { id: string, uuid?: string };
        }
    }
}

export class ConfigController {

    static async getConfigMeta(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });

            const [pref, groupsAgg, feedsAgg, rulesAgg] = await Promise.all([
                prisma.userPreference.findUnique({ where: { userId: userUuid }, select: { updatedAt: true } }).catch(() => null),
                (prisma as any).userRSSGroup.aggregate({ where: { userId: userUuid }, _max: { updatedAt: true } }).catch(() => null),
                (prisma as any).userFeed.aggregate({ where: { userId: userUuid }, _max: { updatedAt: true } }).catch(() => null),
                (prisma as any).userRSSFilterRule.aggregate({ where: { userId: userUuid }, _max: { updatedAt: true } }).catch(() => null),
            ]);

            const preferencesUpdatedAt = pref?.updatedAt ? pref.updatedAt.toISOString() : null;
            const groupsUpdatedAt = groupsAgg?._max?.updatedAt ? new Date(groupsAgg._max.updatedAt).toISOString() : null;
            const sourcesUpdatedAt = feedsAgg?._max?.updatedAt ? new Date(feedsAgg._max.updatedAt).toISOString() : null;
            const filterRulesUpdatedAt = rulesAgg?._max?.updatedAt ? new Date(rulesAgg._max.updatedAt).toISOString() : null;

            const fingerprint = [
                preferencesUpdatedAt || '',
                groupsUpdatedAt || '',
                sourcesUpdatedAt || '',
                filterRulesUpdatedAt || '',
            ].join('|');

            res.json({
                success: true,
                data: { preferencesUpdatedAt, groupsUpdatedAt, sourcesUpdatedAt, filterRulesUpdatedAt, fingerprint },
            });
        } catch (error) {
            console.error('[ConfigController] getConfigMeta error:', error);
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Config meta not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to fetch config meta' });
        }
    }

    private static normalizeDailyReportSettings(value: any): any {
        const raw = value && typeof value === 'object' ? value : {};
        const enabled = raw.enabled !== false;
        const scheduledTime = (typeof raw.scheduledTime === 'string' && /^\d{2}:\d{2}$/.test(raw.scheduledTime)) ? raw.scheduledTime : '06:00';
        const groupNames = Array.isArray(raw.groupNames) ? raw.groupNames.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
        const articleLimitRaw = raw.articleLimit;
        const articleLimit = typeof articleLimitRaw === 'number' && Number.isFinite(articleLimitRaw) && articleLimitRaw >= 0 ? articleLimitRaw : 0;
        return { enabled, scheduledTime, groupNames, articleLimit };
    }

    private static normalizeRssStartupSettings(value: any): any {
        const raw = value && typeof value === 'object' ? value : {};
        const enabled = !!raw.enabled;
        const sourceUrls = Array.isArray(raw.sourceUrls) ? raw.sourceUrls.map((u: any) => String(u || '').trim()).filter(Boolean) : [];
        return { enabled, sourceUrls };
    }

    private static sanitizePreferencesPayload(payload: any): any {
        const p = payload && typeof payload === 'object' ? payload : {};
        const out: any = {};
        if (p.readingSettings && typeof p.readingSettings === 'object') out.readingSettings = p.readingSettings;
        if (p.appSettings && typeof p.appSettings === 'object') {
            const { sync: _sync, ...rest } = p.appSettings as any;
            out.appSettings = rest;
        }
        if (p.rssSettings && typeof p.rssSettings === 'object') out.rssSettings = p.rssSettings;
        if (p.themeSettings && typeof p.themeSettings === 'object') out.themeSettings = p.themeSettings;
        if (p.rssStartupSettings) out.rssStartupSettings = ConfigController.normalizeRssStartupSettings(p.rssStartupSettings);
        if (p.dailyReportSettings) out.dailyReportSettings = ConfigController.normalizeDailyReportSettings(p.dailyReportSettings);
        return out;
    }

    private static pickPreferences(settings: any): any {
        const s = settings && typeof settings === 'object' ? settings : {};
        const out: any = {};
        if (s.readingSettings) out.readingSettings = s.readingSettings;
        if (s.appSettings) out.appSettings = s.appSettings;
        if (s.rssSettings) out.rssSettings = s.rssSettings;
        if (s.themeSettings) out.themeSettings = s.themeSettings;
        if (s.rssStartupSettings) out.rssStartupSettings = s.rssStartupSettings;
        if (s.dailyReportSettings) out.dailyReportSettings = s.dailyReportSettings;
        return out;
    }

    private static isSchemaMissingError(error: any): boolean {
        const code = String(error?.code || '');
        if (code === 'P2021' || code === 'P2022') return true;
        const msg = String(error?.message || '');
        return msg.includes('does not exist in the current database') || msg.includes('does not exist in the current database.');
    }

    private static optionalInt(
        value: any,
        name: string,
        options: { min?: number; max?: number } = {}
    ): number | null {
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return null;
        }
        return validateInt(value, name, options);
    }

    static async getPreferences(req: Request, res: Response) {
        try {

            // Support string uuid from the middleware assignment (.id is assigned instead of uuid in server.ts authMiddleware)
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });

            const pref = await prisma.userPreference.findUnique({
                where: { userId: userUuid }
            });

            res.json({
                success: true,
                data: ConfigController.pickPreferences(pref?.settings || {})
            });
        } catch (error) {
            console.error('[ConfigController] getPreferences error:', error);
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Preferences config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to fetch preferences' });
        }
    }

    static async updatePreferences(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const settingsPayload = ConfigController.sanitizePreferencesPayload(req.body);

            const existing = await (prisma as any).userPreference.findUnique({ where: { userId: userUuid } });
            const existingSettings = existing?.settings && typeof existing.settings === 'object' ? existing.settings : {};
            const nextSettings = { ...existingSettings, ...settingsPayload };
            if (nextSettings.llmSettings) delete nextSettings.llmSettings;

            const prismaAny = prisma as any;
            const pref = await prismaAny.userPreference.upsert({
                where: { userId: userUuid },
                update: { settings: nextSettings },
                create: {
                    userId: userUuid,
                    settings: nextSettings
                }
            });

            res.json({ success: true, data: ConfigController.pickPreferences(pref.settings) });
        } catch (error) {
            console.error('[ConfigController] updatePreferences error:', error);
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Preferences config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to update preferences' });
        }
    }

    // Sources (UserFeed)
    static async getSources(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });

            const feeds = await (prisma as any).userFeed.findMany({
                where: { userId: userUuid },
                include: { source: true, group: true }
            });

            const data = feeds.map((f: any) => ({
                url: f.source.url,
                name: f.customName || f.source.name,
                category: f.customCategory || f.source.category,
                description: f.source.description || null,
                contentType: f.contentType || null,
                sourceMode: f.sourceMode || null,
                isActive: f.isActive !== false,
                fetchLimit: typeof f.fetchLimit === 'number' ? f.fetchLimit : null,
                retentionLimit: typeof f.retentionLimit === 'number' ? f.retentionLimit : null,
                sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : null,
                updateFrequency: typeof f.updateFrequency === 'number' ? f.updateFrequency : null,
                groupId: f.groupId,
                groupName: f.group?.name || null,
            }));

            res.json({ success: true, data });
        } catch (error) {
            console.error('[ConfigController] getSources error:', error);
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Sources config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to fetch sources' });
        }
    }

    static async upsertSource(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { uuid, url, name, category, description, groupId, groupName, contentType, sourceMode, isActive, fetchLimit, retentionLimit, sortOrder, updateFrequency } = req.body;
            const cleanUuid = uuid ? validateString(uuid, 'uuid', { maxLength: 100 }) : '';
            const cleanUrl = validateUrl(url, 'url', {
                required: true,
                maxLength: 2048,
                stripTrailingSlash: true,
                allowRssHub: true,
            });
            const cleanName = name ? validateString(name, 'name', { maxLength: 255 }) : 'Unknown';
            const cleanCategory = category ? validateString(category, 'category', { maxLength: 100 }) : 'General';
            const cleanDescription = description ? validateString(description, 'description', { maxLength: 1000 }) : '';
            const cleanGroupName = groupName ? validateString(groupName, 'groupName', { maxLength: 100 }) : '';
            const cleanContentType = contentType ? validateString(contentType, 'contentType', { maxLength: 50 }) : null;
            const cleanSourceMode = sourceMode ? validateString(sourceMode, 'sourceMode', { maxLength: 50 }) : null;
            const cleanFetchLimit = ConfigController.optionalInt(fetchLimit, 'fetchLimit', { min: 0, max: 10000 });
            const cleanRetentionLimit = ConfigController.optionalInt(retentionLimit, 'retentionLimit', { min: 0, max: 100000 });
            const cleanSortOrder = ConfigController.optionalInt(sortOrder, 'sortOrder');
            const cleanUpdateFrequency = ConfigController.optionalInt(updateFrequency, 'updateFrequency', { min: 0 });
            let effectiveGroupId = ConfigController.optionalInt(groupId, 'groupId', { min: 1 }) ?? undefined;
            if ((!effectiveGroupId || !Number.isFinite(effectiveGroupId)) && cleanGroupName) {
                const group = await (prisma as any).userRSSGroup.upsert({
                    where: { userId_name: { userId: userUuid, name: cleanGroupName } },
                    update: {},
                    create: { userId: userUuid, name: cleanGroupName, sortOrder: 0 }
                });
                effectiveGroupId = group.id;
            }

            let source = null;
            if (cleanUuid) {
                source = await prisma.rSSSource.findUnique({ where: { uuid: cleanUuid } });
            }
            if (!source) {
                source = await prisma.rSSSource.findUnique({ where: { url: cleanUrl } });
                if (source && cleanUuid && !source.uuid) {
                    source = await prisma.rSSSource.update({
                        where: { id: source.id },
                        data: { uuid: cleanUuid }
                    });
                }
            }

            if (!source) {
                source = await prisma.rSSSource.create({
                    data: {
                        uuid: cleanUuid || undefined,
                        url: cleanUrl,
                        name: cleanName,
                        category: cleanCategory,
                        description: cleanDescription || null,
                    }
                });
            } else {
                const nextDesc = (cleanDescription && !String((source as any).description || '').trim()) ? cleanDescription : undefined;
                const nextUrl = (source.url !== cleanUrl) ? cleanUrl : undefined;
                
                if (nextDesc || nextUrl) {
                    source = await prisma.rSSSource.update({
                        where: { id: source.id },
                        data: {
                            ...(nextDesc ? { description: nextDesc } : {}),
                            ...(nextUrl ? { url: nextUrl } : {})
                        }
                    });
                }
            }

            const userFeed = await (prisma as any).userFeed.upsert({
                where: { userId_sourceId: { userId: userUuid, sourceId: source.id } },
                update: {
                    customName: cleanName,
                    customCategory: cleanCategory,
                    groupId: effectiveGroupId,
                    isActive: isActive !== false,
                    contentType: cleanContentType,
                    sourceMode: cleanSourceMode,
                    fetchLimit: cleanFetchLimit,
                    retentionLimit: cleanRetentionLimit,
                    sortOrder: cleanSortOrder,
                    updateFrequency: cleanUpdateFrequency,
                },
                create: {
                    userId: userUuid,
                    sourceId: source.id,
                    customName: cleanName,
                    customCategory: cleanCategory,
                    groupId: effectiveGroupId,
                    isActive: isActive !== false,
                    contentType: cleanContentType,
                    sourceMode: cleanSourceMode,
                    fetchLimit: cleanFetchLimit,
                    retentionLimit: cleanRetentionLimit,
                    sortOrder: cleanSortOrder,
                    updateFrequency: cleanUpdateFrequency,
                }
            });

            res.json({ success: true, data: userFeed });
        } catch (error) {
            console.error('[ConfigController] upsertSource error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to upsert source' });
        }
    }

    // Groups
    static async getGroups(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });

            const groups = await (prisma as any).userRSSGroup.findMany({
                where: { userId: userUuid },
                orderBy: { sortOrder: 'asc' }
            });

            res.json({ success: true, data: groups });
        } catch (error) {
            console.error('[ConfigController] getGroups error:', error);
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Groups config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to fetch groups' });
        }
    }

    static async upsertGroup(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { name, icon, color, sortOrder } = req.body;
            const cleanName = validateString(name, 'group name', { required: true, maxLength: 100 });
            const cleanIcon = icon ? validateString(icon, 'icon', { maxLength: 100 }) : null;
            const cleanColor = color ? validateString(color, 'color', { maxLength: 50 }) : null;
            const cleanSortOrder = validateInt(sortOrder, 'sortOrder', { defaultValue: 0 });

            const group = await (prisma as any).userRSSGroup.upsert({
                where: { userId_name: { userId: userUuid, name: cleanName } },
                update: {
                    sortOrder: cleanSortOrder,
                    icon: cleanIcon,
                    color: cleanColor,
                },
                create: {
                    userId: userUuid,
                    name: cleanName,
                    sortOrder: cleanSortOrder,
                    icon: cleanIcon,
                    color: cleanColor,
                }
            });

            res.json({ success: true, data: group });
        } catch (error) {
            console.error('[ConfigController] upsertGroup error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to upsert group' });
        }
    }

    // Filter Rules
    static async getFilterRules(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });

            const rules = await (prisma as any).userRSSFilterRule.findMany({
                where: { userId: userUuid }
            });

            const data = (rules || []).map((r: any) => ({
                keyword: r.keyword,
                mode: r.mode,
                isRegex: r.isRegex,
                scope: r.scope,
                sourceUrls: Array.isArray(r.sourceUrls) ? r.sourceUrls : (r.sourceUrls ? r.sourceUrls : []),
                target: r.target || 'title_summary',
                isActive: r.isActive !== false,
            }));

            res.json({ success: true, data });
        } catch (error) {
            console.error('[ConfigController] getFilterRules error:', error);
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Filter rules config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to fetch filter rules' });
        }
    }

    static async upsertFilterRule(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { id, keyword, mode, isRegex, scope, sourceUrls, sourceUrl, target, isActive, type, pattern, action } = req.body;

            const effectiveKeyword = typeof keyword === 'string' && keyword.trim() ? keyword.trim() : (typeof pattern === 'string' ? pattern.trim() : '');
            const effectiveMode = mode === 'include' || mode === 'exclude' ? mode : 'exclude';
            const effectiveIsRegex = Boolean(isRegex);
            const urlsRaw = Array.isArray(sourceUrls) ? sourceUrls : (typeof sourceUrl === 'string' ? [sourceUrl] : []);
            const urls = urlsRaw.map((u: any) => validateUrl(u, 'sourceUrl', {
                maxLength: 2048,
                stripTrailingSlash: true,
                allowRssHub: true,
            })).filter(Boolean);
            const effectiveScope = scope === 'specific' || urls.length > 0 ? 'specific' : 'global';
            const effectiveTarget = typeof target === 'string' && target.trim() ? target.trim() : 'title_summary';
            const effectiveIsActive = isActive !== false;

            let rule;
            if (id) {
                rule = await (prisma as any).userRSSFilterRule.update({
                    where: { id },
                    data: {
                        keyword: effectiveKeyword,
                        mode: effectiveMode,
                        isRegex: effectiveIsRegex,
                        scope: effectiveScope,
                        sourceUrls: effectiveScope === 'specific' ? urls : [],
                        target: effectiveTarget,
                        isActive: effectiveIsActive,
                    }
                });
            } else {
                rule = await (prisma as any).userRSSFilterRule.create({
                    data: {
                        userId: userUuid,
                        keyword: effectiveKeyword,
                        mode: effectiveMode,
                        isRegex: effectiveIsRegex,
                        scope: effectiveScope,
                        sourceUrls: effectiveScope === 'specific' ? urls : [],
                        target: effectiveTarget,
                        isActive: effectiveIsActive,
                    }
                });
            }

            res.json({ success: true, data: rule });
        } catch (error) {
            console.error('[ConfigController] upsertFilterRule error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to upsert filter rule' });
        }
    }

    // Batch Operations
    static async batchUpsertSources(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const sources = validateArray(req.body, 'sources', { required: true, maxLength: 500 });

            const count = await prisma.$transaction(async (tx: any) => {
                const db = tx as any;
                const groups = await db.userRSSGroup.findMany({ where: { userId: userUuid } }).catch(() => []);
                const groupNameToId = new Map<string, number>();
                for (const g of groups) {
                    if (g?.name && typeof g.id === 'number') groupNameToId.set(String(g.name).trim(), g.id);
                }

                const results = [];
                for (const s of sources) {
                    const uuid = s?.uuid ? validateString(s.uuid, 'uuid', { maxLength: 100 }) : '';
                    const url = validateUrl(s?.url, 'url', {
                        required: true,
                        maxLength: 2048,
                        stripTrailingSlash: true,
                        allowRssHub: true,
                    });
                    const name = s?.name ? validateString(s.name, 'name', { maxLength: 255 }) : 'Unknown';
                    const category = s?.category ? validateString(s.category, 'category', { maxLength: 100 }) : 'General';
                    const desc = s?.description ? validateString(s.description, 'description', { maxLength: 1000 }) : '';
                    const gn = s?.groupName ? validateString(s.groupName, 'groupName', { maxLength: 100 }) : '';
                    const contentType = s?.contentType ? validateString(s.contentType, 'contentType', { maxLength: 50 }) : null;
                    const sourceMode = s?.sourceMode ? validateString(s.sourceMode, 'sourceMode', { maxLength: 50 }) : null;
                    const fetchLimit = ConfigController.optionalInt(s?.fetchLimit, 'fetchLimit', { min: 0, max: 10000 });
                    const retentionLimit = ConfigController.optionalInt(s?.retentionLimit, 'retentionLimit', { min: 0, max: 100000 });
                    const sortOrder = ConfigController.optionalInt(s?.sortOrder, 'sortOrder');
                    const updateFrequency = ConfigController.optionalInt(s?.updateFrequency, 'updateFrequency', { min: 0 });
                    let effectiveGroupId = ConfigController.optionalInt(s?.groupId, 'groupId', { min: 1 }) ?? undefined;
                    if ((!effectiveGroupId || !Number.isFinite(effectiveGroupId)) && gn) {
                        const existingId = groupNameToId.get(gn);
                        if (typeof existingId === 'number') {
                            effectiveGroupId = existingId;
                        } else {
                            const group = await db.userRSSGroup.upsert({
                                where: { userId_name: { userId: userUuid, name: gn } },
                                update: {},
                                create: { userId: userUuid, name: gn, sortOrder: 0 }
                            });
                            if (typeof group?.id === 'number') groupNameToId.set(gn, group.id);
                            effectiveGroupId = group.id;
                        }
                    }

                    // Match by UUID first, fallback to URL
                    let source = null;
                    if (uuid) {
                        source = await db.rSSSource.findUnique({ where: { uuid } });
                    }
                    if (!source) {
                        source = await db.rSSSource.findUnique({ where: { url } });
                        if (source && uuid && !source.uuid) {
                            source = await db.rSSSource.update({
                                where: { id: source.id },
                                data: { uuid }
                            });
                        }
                    }

                    if (!source) {
                        source = await db.rSSSource.create({
                            data: {
                                uuid: uuid || undefined,
                                url,
                                name: name,
                                category: category,
                                description: desc || null,
                            }
                        });
                    } else {
                        const nextDesc = (desc && !String((source as any).description || '').trim()) ? desc : undefined;
                        const nextUrl = (source.url !== url) ? url : undefined;

                        if (nextDesc || nextUrl) {
                            source = await db.rSSSource.update({
                                where: { id: source.id },
                                data: {
                                    ...(nextDesc ? { description: nextDesc } : {}),
                                    ...(nextUrl ? { url: nextUrl } : {})
                                }
                            });
                        }
                    }
                    const uf = await db.userFeed.upsert({
                        where: { userId_sourceId: { userId: userUuid, sourceId: source.id } },
                        update: {
                            customName: name,
                            customCategory: category,
                            groupId: effectiveGroupId,
                            isActive: s?.isActive !== false,
                            contentType: contentType,
                            sourceMode: sourceMode,
                            fetchLimit,
                            retentionLimit,
                            sortOrder,
                            updateFrequency,
                        },
                        create: {
                            userId: userUuid,
                            sourceId: source.id,
                            customName: name,
                            customCategory: category,
                            groupId: effectiveGroupId,
                            isActive: s?.isActive !== false,
                            contentType: contentType,
                            sourceMode: sourceMode,
                            fetchLimit,
                            retentionLimit,
                            sortOrder,
                            updateFrequency,
                        }
                    });
                    results.push(uf);
                }

                // Sync deletion: remove any UserFeed that is not in the pushed batch
                const processedSourceIds = results.map(uf => uf.sourceId);
                if (processedSourceIds.length > 0) {
                    await db.userFeed.deleteMany({
                        where: {
                            userId: userUuid,
                            sourceId: { notIn: processedSourceIds }
                        }
                    });
                } else {
                    await db.userFeed.deleteMany({
                        where: {
                            userId: userUuid
                        }
                    });
                }

                return results.length;
            });

            res.json({ success: true, count });
        } catch (error) {
            console.error('[ConfigController] batchUpsertSources error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Sources config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to batch upsert sources' });
        }
    }

    static async batchUpsertGroups(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const groups = validateArray(req.body, 'groups', { required: true, maxLength: 500 });

            const count = await prisma.$transaction(async (tx: any) => {
                const db = tx as any;
                const results = [];
                for (const g of groups) {
                    const name = validateString(g?.name, 'group name', { required: true, maxLength: 100 });
                    const icon = g?.icon ? validateString(g.icon, 'icon', { maxLength: 100 }) : null;
                    const color = g?.color ? validateString(g.color, 'color', { maxLength: 50 }) : null;
                    const sortOrder = validateInt(g?.sortOrder, 'sortOrder', { defaultValue: 0 });

                    const group = await db.userRSSGroup.upsert({
                        where: { userId_name: { userId: userUuid, name } },
                        update: {
                            sortOrder,
                            icon,
                            color,
                        },
                        create: {
                            userId: userUuid,
                            name,
                            sortOrder,
                            icon,
                            color,
                        }
                    });
                    results.push(group);
                }
                return results.length;
            });

            res.json({ success: true, count });
        } catch (error) {
            console.error('[ConfigController] batchUpsertGroups error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Groups config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to batch upsert groups' });
        }
    }

    static async batchUpsertFilterRules(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const rules = validateArray(req.body, 'rules', { required: true, maxLength: 1000 });

            const data = rules
                .map((r: any) => {
                    const keyword = validateString(r?.keyword ?? r?.pattern, 'keyword', { maxLength: 500 });
                    if (!keyword) return null;
                    const mode = r?.mode === 'include' ? 'include' : 'exclude';
                    const isRegex = Boolean(r?.isRegex ?? r?.is_regex);
                    const urlsRaw = Array.isArray(r?.sourceUrls) ? r.sourceUrls : (typeof r?.sourceUrl === 'string' ? [r.sourceUrl] : []);
                    const urls = urlsRaw.map((u: any) => validateUrl(u, 'sourceUrl', {
                        maxLength: 2048,
                        stripTrailingSlash: true,
                        allowRssHub: true,
                    })).filter(Boolean);
                    const scope = r?.scope === 'specific' || urls.length > 0 ? 'specific' : 'global';
                    const target = validateString(r?.target, 'target', { maxLength: 100, defaultValue: 'title_summary' });
                    const isActive = r?.isActive !== false;
                    return {
                        userId: userUuid,
                        keyword,
                        mode,
                        isRegex,
                        scope,
                        sourceUrls: scope === 'specific' ? urls : [],
                        target,
                        isActive,
                    };
                })
                .filter(Boolean);

            const count = await prisma.$transaction(async (tx: any) => {
                const db = tx as any;
                await db.userRSSFilterRule.deleteMany({ where: { userId: userUuid } });
                if (data.length === 0) return 0;
                const created = await db.userRSSFilterRule.createMany({ data });
                return created.count;
            });

            res.json({ success: true, count });
        } catch (error) {
            console.error('[ConfigController] batchUpsertFilterRules error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (ConfigController.isSchemaMissingError(error)) {
                res.status(404).json({ success: false, message: 'Filter rules config not available' });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to batch upsert filter rules' });
        }
    }

    static async getLLMKeys(req: Request, res: Response) {
        try {
            const isAdmin = (req as any).user?.id === 'admin' || (req as any).user?.uuid === 'admin';
            if (!isAdmin) {
                return res.json({ success: true, data: [] });
            }
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });

            const keys = await prisma.userLLMKey.findMany({
                where: { userId: userUuid }
            });

            const mappedKeys = keys.map((k: any) => ({
                id: k.id,
                profileId: k.profileId,
                name: k.name,
                provider: k.provider,
                model: k.model,
                baseUrl: k.baseUrl,
                temperature: k.temperature,
                maxTokens: k.maxTokens,
                topP: k.topP,
                isActive: k.isActive,
                customModelName: k.customModelName,
                hasApiKey: !!k.encryptedApiKey
            }));

            res.json({ success: true, data: mappedKeys });
        } catch (error) {
            console.error('[ConfigController] getLLMKeys error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch LLM keys' });
        }
    }

    static async upsertLLMKey(req: Request, res: Response) {
        try {
            const isAdmin = (req as any).user?.id === 'admin' || (req as any).user?.uuid === 'admin';
            if (!isAdmin) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { profileId, name, provider, model, apiKey, baseUrl, temperature, maxTokens, topP, isActive, customModelName } = req.body;

            if (!profileId) {
                return res.status(400).json({ success: false, message: 'profileId is required' });
            }

            // Encrypt the API key before storing
            const encryptedApiKey = encrypt(apiKey || '');

            const upserted = await prisma.userLLMKey.upsert({
                where: { userId_profileId: { userId: userUuid, profileId } },
                update: {
                    name, provider, model, baseUrl, temperature, maxTokens, topP, isActive, customModelName,
                    ...(apiKey ? { encryptedApiKey } : {}) // Only update key if provided in request
                },
                create: {
                    userId: userUuid,
                    profileId, name, provider, model, encryptedApiKey, baseUrl, temperature, maxTokens, topP, isActive, customModelName
                }
            });

            res.json({
                success: true,
                data: {
                    profileId: upserted.profileId,
                    name: upserted.name
                }
            });
        } catch (error) {
            console.error('[ConfigController] upsertLLMKey error:', error);
            res.status(500).json({ success: false, message: 'Failed to upsert LLM key' });
        }
    }

    static async deleteLLMKey(req: Request, res: Response) {
        try {
            const isAdmin = (req as any).user?.id === 'admin' || (req as any).user?.uuid === 'admin';
            if (!isAdmin) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { profileId } = req.params;

            await prisma.userLLMKey.delete({
                where: { userId_profileId: { userId: userUuid, profileId } }
            });

            res.json({ success: true });
        } catch (error) {
            // Ignore if not found
            res.json({ success: true });
        }
    }
    static async batchUpsertLLMKeys(req: Request, res: Response) {
        try {
            const isAdmin = (req as any).user?.id === 'admin' || (req as any).user?.uuid === 'admin';
            if (!isAdmin) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const keys = validateArray(req.body, 'keys', { required: true, maxLength: 50 });

            const results = [];
            for (const k of keys) {
                const name = validateString(k.name, 'name', { required: true, maxLength: 255 });
                const provider = validateString(k.provider, 'provider', { required: true, maxLength: 100 });
                const model = validateString(k.model, 'model', { required: true, maxLength: 100 });
                const baseUrl = k.baseUrl ? validateUrl(k.baseUrl, 'baseUrl', { maxLength: 2048 }) : '';
                const apiKey = k.apiKey ? validateString(k.apiKey, 'apiKey', { maxLength: 2048 }) : undefined;

                const encryptedApiKey = apiKey ? encrypt(apiKey) : undefined;
                const profileId = k.id || k.profileId;
                if (!profileId) {
                    throw new ValidationError('profileId or id is required');
                }

                const upserted = await prisma.userLLMKey.upsert({
                    where: { userId_profileId: { userId: userUuid, profileId } },
                    update: {
                        name, provider, model,
                        baseUrl: baseUrl || undefined,
                        temperature: typeof k.temperature === 'number' ? k.temperature : undefined,
                        maxTokens: typeof k.maxTokens === 'number' ? k.maxTokens : undefined,
                        topP: typeof k.topP === 'number' ? k.topP : undefined,
                        isActive: k.isActive === true,
                        customModelName: k.customModelName ? validateString(k.customModelName, 'customModelName', { maxLength: 100 }) : null,
                        ...(encryptedApiKey ? { encryptedApiKey } : {})
                    },
                    create: {
                        userId: userUuid,
                        profileId,
                        name, provider, model,
                        encryptedApiKey: encryptedApiKey || '',
                        baseUrl,
                        temperature: typeof k.temperature === 'number' ? k.temperature : undefined,
                        maxTokens: typeof k.maxTokens === 'number' ? k.maxTokens : undefined,
                        topP: typeof k.topP === 'number' ? k.topP : undefined,
                        isActive: k.isActive === true,
                        customModelName: k.customModelName ? validateString(k.customModelName, 'customModelName', { maxLength: 100 }) : null,
                    }
                });
                results.push(upserted);
            }

            res.json({ success: true, count: results.length });
        } catch (error) {
            console.error('[ConfigController] batchUpsertLLMKeys error:', error);
            if (error instanceof ValidationError) {
                return res.status(400).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to batch upsert LLM keys' });
        }
    }
}
