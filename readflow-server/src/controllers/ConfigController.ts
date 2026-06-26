import { Request, Response } from 'express';
import { encrypt, decrypt } from '../utils/encryption';
import { verifyToken } from '../routes/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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
            let effectiveGroupId =
                typeof groupId === 'number'
                    ? groupId
                    : (Number.isFinite(parseInt(String(groupId ?? ''), 10)) ? parseInt(String(groupId ?? ''), 10) : undefined);
            const gn = typeof groupName === 'string' ? groupName.trim() : '';
            if ((!effectiveGroupId || !Number.isFinite(effectiveGroupId)) && gn) {
                const group = await (prisma as any).userRSSGroup.upsert({
                    where: { userId_name: { userId: userUuid, name: gn } },
                    update: {},
                    create: { userId: userUuid, name: gn, sortOrder: 0 }
                });
                effectiveGroupId = group.id;
            }

            // Find or create global source first (match by UUID first, fallback to URL)
            const cleanUuid = uuid ? String(uuid).trim() : '';
            const cleanUrl = url ? String(url).trim() : '';
            if (!cleanUrl) return res.status(400).json({ success: false, message: 'URL is required' });

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
                const desc = typeof description === 'string' ? description.trim() : '';
                source = await prisma.rSSSource.create({
                    data: {
                        uuid: cleanUuid || undefined,
                        url: cleanUrl,
                        name: name || 'Unknown',
                        category: category || 'General',
                        description: desc || null,
                    }
                });
            } else {
                const desc = typeof description === 'string' ? description.trim() : '';
                const nextDesc = (desc && !String((source as any).description || '').trim()) ? desc : undefined;
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
                    customName: name,
                    customCategory: category,
                    groupId: effectiveGroupId,
                    isActive: isActive !== false,
                    contentType: typeof contentType === 'string' ? contentType : null,
                    sourceMode: typeof sourceMode === 'string' ? sourceMode : null,
                    fetchLimit: typeof fetchLimit === 'number' ? fetchLimit : null,
                    retentionLimit: typeof retentionLimit === 'number' ? retentionLimit : null,
                    sortOrder: typeof sortOrder === 'number' ? sortOrder : null,
                    updateFrequency: typeof updateFrequency === 'number' ? updateFrequency : null,
                },
                create: {
                    userId: userUuid,
                    sourceId: source.id,
                    customName: name,
                    customCategory: category,
                    groupId: effectiveGroupId,
                    isActive: isActive !== false,
                    contentType: typeof contentType === 'string' ? contentType : null,
                    sourceMode: typeof sourceMode === 'string' ? sourceMode : null,
                    fetchLimit: typeof fetchLimit === 'number' ? fetchLimit : null,
                    retentionLimit: typeof retentionLimit === 'number' ? retentionLimit : null,
                    sortOrder: typeof sortOrder === 'number' ? sortOrder : null,
                    updateFrequency: typeof updateFrequency === 'number' ? updateFrequency : null,
                }
            });

            res.json({ success: true, data: userFeed });
        } catch (error) {
            console.error('[ConfigController] upsertSource error:', error);
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

            const group = await (prisma as any).userRSSGroup.upsert({
                where: { userId_name: { userId: userUuid, name } },
                update: {
                    sortOrder,
                    icon: typeof icon === 'string' ? icon : null,
                    color: typeof color === 'string' ? color : null,
                },
                create: {
                    userId: userUuid,
                    name,
                    sortOrder,
                    icon: typeof icon === 'string' ? icon : null,
                    color: typeof color === 'string' ? color : null,
                }
            });

            res.json({ success: true, data: group });
        } catch (error) {
            console.error('[ConfigController] upsertGroup error:', error);
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
            const urls = urlsRaw.map((u: any) => String(u || '').trim()).filter(Boolean);
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
            res.status(500).json({ success: false, message: 'Failed to upsert filter rule' });
        }
    }

    // Batch Operations
    static async batchUpsertSources(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const sources = req.body; // Array of { uuid?, url, name, category, description, contentType, sourceMode, isActive, fetchLimit, retentionLimit, sortOrder, updateFrequency, groupId?, groupName? }

            if (!Array.isArray(sources)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            const groups = await (prisma as any).userRSSGroup.findMany({ where: { userId: userUuid } }).catch(() => []);
            const groupNameToId = new Map<string, number>();
            for (const g of groups) {
                if (g?.name && typeof g.id === 'number') groupNameToId.set(String(g.name).trim(), g.id);
            }

            const results = [];
            for (const s of sources) {
                const uuid = s?.uuid ? String(s.uuid).trim() : '';
                const url = s?.url ? String(s.url).trim() : '';
                if (!url) continue;
                let effectiveGroupId =
                    typeof s?.groupId === 'number'
                        ? s.groupId
                        : (Number.isFinite(parseInt(String(s?.groupId ?? ''), 10)) ? parseInt(String(s?.groupId ?? ''), 10) : undefined);
                const gn = typeof s?.groupName === 'string' ? String(s.groupName).trim() : '';
                if ((!effectiveGroupId || !Number.isFinite(effectiveGroupId)) && gn) {
                    const existingId = groupNameToId.get(gn);
                    if (typeof existingId === 'number') {
                        effectiveGroupId = existingId;
                    } else {
                        const group = await (prisma as any).userRSSGroup.upsert({
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
                    source = await prisma.rSSSource.findUnique({ where: { uuid } });
                }
                if (!source) {
                    source = await prisma.rSSSource.findUnique({ where: { url } });
                    if (source && uuid && !source.uuid) {
                        source = await prisma.rSSSource.update({
                            where: { id: source.id },
                            data: { uuid }
                        });
                    }
                }

                if (!source) {
                    const desc = typeof s?.description === 'string' ? String(s.description).trim() : '';
                    source = await prisma.rSSSource.create({
                        data: {
                            uuid: uuid || undefined,
                            url,
                            name: s.name || 'Unknown',
                            category: s.category || 'General',
                            description: desc || null,
                        }
                    });
                } else {
                    const desc = typeof s?.description === 'string' ? String(s.description).trim() : '';
                    const nextDesc = (desc && !String((source as any).description || '').trim()) ? desc : undefined;
                    const nextUrl = (source.url !== url) ? url : undefined;
                    
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
                const uf = await (prisma as any).userFeed.upsert({
                    where: { userId_sourceId: { userId: userUuid, sourceId: source.id } },
                    update: {
                        customName: s.name,
                        customCategory: s.category,
                        groupId: effectiveGroupId,
                        isActive: s?.isActive !== false,
                        contentType: typeof s?.contentType === 'string' ? s.contentType : null,
                        sourceMode: typeof s?.sourceMode === 'string' ? s.sourceMode : null,
                        fetchLimit: typeof s?.fetchLimit === 'number' ? s.fetchLimit : null,
                        retentionLimit: typeof s?.retentionLimit === 'number' ? s.retentionLimit : null,
                        sortOrder: typeof s?.sortOrder === 'number' ? s.sortOrder : null,
                        updateFrequency: typeof s?.updateFrequency === 'number' ? s.updateFrequency : null,
                    },
                    create: {
                        userId: userUuid,
                        sourceId: source.id,
                        customName: s.name,
                        customCategory: s.category,
                        groupId: effectiveGroupId,
                        isActive: s?.isActive !== false,
                        contentType: typeof s?.contentType === 'string' ? s.contentType : null,
                        sourceMode: typeof s?.sourceMode === 'string' ? s.sourceMode : null,
                        fetchLimit: typeof s?.fetchLimit === 'number' ? s.fetchLimit : null,
                        retentionLimit: typeof s?.retentionLimit === 'number' ? s.retentionLimit : null,
                        sortOrder: typeof s?.sortOrder === 'number' ? s.sortOrder : null,
                        updateFrequency: typeof s?.updateFrequency === 'number' ? s.updateFrequency : null,
                    }
                });
                results.push(uf);
            }

            // Sync deletion: remove any UserFeed that is not in the pushed batch
            const processedSourceIds = results.map(uf => uf.sourceId);
            if (processedSourceIds.length > 0) {
                await (prisma as any).userFeed.deleteMany({
                    where: {
                        userId: userUuid,
                        sourceId: { notIn: processedSourceIds }
                    }
                });
            } else {
                await (prisma as any).userFeed.deleteMany({
                    where: {
                        userId: userUuid
                    }
                });
            }

            res.json({ success: true, count: results.length });
        } catch (error) {
            console.error('[ConfigController] batchUpsertSources error:', error);
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
            const groups = req.body; // Array of { name, icon, color, sortOrder }

            if (!Array.isArray(groups)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            const results = [];
            for (const g of groups) {
                const group = await (prisma as any).userRSSGroup.upsert({
                    where: { userId_name: { userId: userUuid, name: g.name } },
                    update: {
                        sortOrder: g.sortOrder,
                        icon: typeof g?.icon === 'string' ? g.icon : null,
                        color: typeof g?.color === 'string' ? g.color : null,
                    },
                    create: {
                        userId: userUuid,
                        name: g.name,
                        sortOrder: g.sortOrder,
                        icon: typeof g?.icon === 'string' ? g.icon : null,
                        color: typeof g?.color === 'string' ? g.color : null,
                    }
                });
                results.push(group);
            }

            res.json({ success: true, count: results.length });
        } catch (error) {
            console.error('[ConfigController] batchUpsertGroups error:', error);
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
            const rules = req.body; // Array of { keyword, mode, isRegex, scope, sourceUrls, target, isActive }

            if (!Array.isArray(rules)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            await (prisma as any).userRSSFilterRule.deleteMany({ where: { userId: userUuid } });

            const data = rules
                .map((r: any) => {
                    const keyword = typeof r?.keyword === 'string' ? r.keyword.trim() : '';
                    if (!keyword) return null;
                    const mode = r?.mode === 'include' ? 'include' : 'exclude';
                    const isRegex = Boolean(r?.isRegex ?? r?.is_regex);
                    const urlsRaw = Array.isArray(r?.sourceUrls) ? r.sourceUrls : (typeof r?.sourceUrl === 'string' ? [r.sourceUrl] : []);
                    const urls = urlsRaw.map((u: any) => String(u || '').trim()).filter(Boolean);
                    const scope = r?.scope === 'specific' || urls.length > 0 ? 'specific' : 'global';
                    const target = typeof r?.target === 'string' && r.target.trim() ? r.target.trim() : 'title_summary';
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

            const created = await (prisma as any).userRSSFilterRule.createMany({ data });

            res.json({ success: true, count: created.count });
        } catch (error) {
            console.error('[ConfigController] batchUpsertFilterRules error:', error);
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
            const keys = req.body; // Array of profile objects

            if (!Array.isArray(keys)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            const results = [];
            for (const k of keys) {
                const encryptedApiKey = k.apiKey ? encrypt(k.apiKey) : undefined;
                const upserted = await prisma.userLLMKey.upsert({
                    where: { userId_profileId: { userId: userUuid, profileId: k.id || k.profileId } },
                    update: {
                        name: k.name, provider: k.provider, model: k.model, baseUrl: k.baseUrl,
                        temperature: k.temperature, maxTokens: k.maxTokens, topP: k.topP,
                        isActive: k.isActive, customModelName: k.customModelName,
                        ...(encryptedApiKey ? { encryptedApiKey } : {})
                    },
                    create: {
                        userId: userUuid,
                        profileId: k.id || k.profileId,
                        name: k.name, provider: k.provider, model: k.model,
                        encryptedApiKey: encryptedApiKey || '',
                        baseUrl: k.baseUrl, temperature: k.temperature, maxTokens: k.maxTokens,
                        topP: k.topP, isActive: k.isActive, customModelName: k.customModelName
                    }
                });
                results.push(upserted);
            }

            res.json({ success: true, count: results.length });
        } catch (error) {
            console.error('[ConfigController] batchUpsertLLMKeys error:', error);
            res.status(500).json({ success: false, message: 'Failed to batch upsert LLM keys' });
        }
    }
}
