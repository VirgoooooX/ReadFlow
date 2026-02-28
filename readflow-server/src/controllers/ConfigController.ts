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
        if (p.rssStartupSettings) out.rssStartupSettings = this.normalizeRssStartupSettings(p.rssStartupSettings);
        if (p.dailyReportSettings) out.dailyReportSettings = this.normalizeDailyReportSettings(p.dailyReportSettings);
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
                data: this.pickPreferences(pref?.settings || {})
            });
        } catch (error) {
            console.error('[ConfigController] getPreferences error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch preferences' });
        }
    }

    static async updatePreferences(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const settingsPayload = this.sanitizePreferencesPayload(req.body);

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

            res.json({ success: true, data: this.pickPreferences(pref.settings) });
        } catch (error) {
            console.error('[ConfigController] updatePreferences error:', error);
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
                groupId: f.groupId,
                groupName: f.group?.name || null,
            }));

            res.json({ success: true, data });
        } catch (error) {
            console.error('[ConfigController] getSources error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch sources' });
        }
    }

    static async upsertSource(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { url, name, category, groupId, groupName } = req.body;
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

            // Find or create global source first
            let source = await (prisma as any).rssSource.findUnique({ where: { url } });
            if (!source) {
                source = await (prisma as any).rssSource.create({
                    data: { url, name: name || 'Unknown' }
                });
            }

            const userFeed = await (prisma as any).userFeed.upsert({
                where: { userId_sourceId: { userId: userUuid, sourceId: source.id } },
                update: { customName: name, customCategory: category, groupId: effectiveGroupId },
                create: {
                    userId: userUuid,
                    sourceId: source.id,
                    customName: name,
                    customCategory: category,
                    groupId: effectiveGroupId
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
            res.status(500).json({ success: false, message: 'Failed to fetch groups' });
        }
    }

    static async upsertGroup(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { name, sortOrder } = req.body;

            const group = await (prisma as any).userRSSGroup.upsert({
                where: { userId_name: { userId: userUuid, name } },
                update: { sortOrder },
                create: { userId: userUuid, name, sortOrder }
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

            const rules = await (prisma as any).userFilterRule.findMany({
                where: { userId: userUuid }
            });

            res.json({ success: true, data: rules });
        } catch (error) {
            console.error('[ConfigController] getFilterRules error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch filter rules' });
        }
    }

    static async upsertFilterRule(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { id, type, pattern, action, isActive } = req.body;

            let rule;
            if (id) {
                rule = await (prisma as any).userFilterRule.update({
                    where: { id },
                    data: { type, pattern, action, isActive }
                });
            } else {
                rule = await (prisma as any).userFilterRule.create({
                    data: { userId: userUuid, type, pattern, action, isActive }
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
            const sources = req.body; // Array of { url, name, category, groupId?, groupName? }

            if (!Array.isArray(sources)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            const groups = await (prisma as any).userRSSGroup.findMany({ where: { userId: userUuid } }).catch(() => []);
            const groupNameToId = new Map<string, number>();
            for (const g of groups) {
                if (g?.name && typeof g.id === 'number') groupNameToId.set(String(g.name).trim(), g.id);
            }

            const results = [];
            for (const s of sources) {
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

                let source = await (prisma as any).rssSource.findUnique({ where: { url } });
                if (!source) {
                    source = await (prisma as any).rssSource.create({
                        data: { url, name: s.name || 'Unknown' }
                    });
                }
                const uf = await (prisma as any).userFeed.upsert({
                    where: { userId_sourceId: { userId: userUuid, sourceId: source.id } },
                    update: { customName: s.name, customCategory: s.category, groupId: effectiveGroupId },
                    create: {
                        userId: userUuid,
                        sourceId: source.id,
                        customName: s.name,
                        customCategory: s.category,
                        groupId: effectiveGroupId
                    }
                });
                results.push(uf);
            }

            res.json({ success: true, count: results.length });
        } catch (error) {
            console.error('[ConfigController] batchUpsertSources error:', error);
            res.status(500).json({ success: false, message: 'Failed to batch upsert sources' });
        }
    }

    static async batchUpsertGroups(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const groups = req.body; // Array of { name, sortOrder }

            if (!Array.isArray(groups)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            const results = [];
            for (const g of groups) {
                const group = await (prisma as any).userRSSGroup.upsert({
                    where: { userId_name: { userId: userUuid, name: g.name } },
                    update: { sortOrder: g.sortOrder },
                    create: { userId: userUuid, name: g.name, sortOrder: g.sortOrder }
                });
                results.push(group);
            }

            res.json({ success: true, count: results.length });
        } catch (error) {
            console.error('[ConfigController] batchUpsertGroups error:', error);
            res.status(500).json({ success: false, message: 'Failed to batch upsert groups' });
        }
    }

    static async batchUpsertFilterRules(req: Request, res: Response) {
        try {
            const userUuid = req.user?.id || req.user?.uuid;
            if (!userUuid) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const rules = req.body; // Array of { type, pattern, action, isActive }

            if (!Array.isArray(rules)) return res.status(400).json({ success: false, message: 'Body must be an array' });

            // For rules, maybe delete existing and recreate or match by pattern?
            // Existing sync behavior replaces all rules. Let's recreate.
            await (prisma as any).userFilterRule.deleteMany({ where: { userId: userUuid } });

            const created = await (prisma as any).userFilterRule.createMany({
                data: rules.map((r: any) => ({
                    userId: userUuid,
                    type: r.type,
                    pattern: r.pattern,
                    action: r.action,
                    isActive: r.isActive !== false
                }))
            });

            res.json({ success: true, count: created.count });
        } catch (error) {
            console.error('[ConfigController] batchUpsertFilterRules error:', error);
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
