import { DatabaseService } from '../../database/DatabaseService';
import { Article } from '../../types';
import { logger } from './RSSUtils';

/**
 * Interface for articles that can be filtered.
 * Contains only the fields necessary for filtering.
 */
export interface FilterableArticle {
  title: string;
  summary: string;
  content: string;
  [key: string]: any; // Allow other properties
}

type CompiledFilterRule = {
  mode: 'include' | 'exclude';
  isRegex: boolean;
  keywordLower: string;
  regex: RegExp | null;
};

type CompiledRuleSet = {
  whitelist: CompiledFilterRule[];
  blacklist: CompiledFilterRule[];
  expiresAt: number;
};

export class FilterService {
  private static instance: FilterService;
  private databaseService: DatabaseService;
  private compiledRulesCache: Map<number, CompiledRuleSet> = new Map();

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): FilterService {
    if (!FilterService.instance) {
      FilterService.instance = new FilterService();
    }
    return FilterService.instance;
  }

  /**
   * Apply filter rules (whitelist/blacklist) to a list of articles.
   * Logic:
   * 1. Whitelist takes precedence: If whitelist rules exist, article MUST match at least one.
   * 2. Blacklist: If article matches any blacklist rule, it is discarded.
   */
  public async applyFilterRules<T extends FilterableArticle>(
    articles: T[],
    sourceId: number,
    yieldEvery?: number
  ): Promise<T[]> {
    try {
      const now = Date.now();
      const cacheTtlMs = 60_000;
      const safeYieldEvery =
        yieldEvery === undefined
          ? 5
          : Number.isFinite(yieldEvery)
              ? Math.max(0, Math.floor(yieldEvery))
              : 0;

      let compiled = this.compiledRulesCache.get(sourceId);
      if (!compiled || compiled.expiresAt <= now) {
        const rules = await this.databaseService.getEffectiveRules(sourceId);
        if (rules.length === 0) {
          this.compiledRulesCache.set(sourceId, { whitelist: [], blacklist: [], expiresAt: now + cacheTtlMs });
          return articles;
        }

        const whitelist: CompiledFilterRule[] = [];
        const blacklist: CompiledFilterRule[] = [];

        for (const r of rules) {
          const keywordRaw = typeof r?.keyword === 'string' ? r.keyword : '';
          const keywordLower = keywordRaw.toLowerCase();
          const isRegex = r?.is_regex === 1;
          const mode: 'include' | 'exclude' = r?.mode === 'include' ? 'include' : 'exclude';
          const compiledRule: CompiledFilterRule = {
            mode,
            isRegex,
            keywordLower,
            regex: null,
          };

          if (isRegex) {
            try {
              compiledRule.regex = new RegExp(keywordRaw, 'i');
            } catch (e) {
              logger.warn(`[FilterService] Invalid regex: ${keywordRaw}`);
              compiledRule.regex = null;
            }
          }

          if (mode === 'include') {
            whitelist.push(compiledRule);
          } else {
            blacklist.push(compiledRule);
          }
        }

        compiled = { whitelist, blacklist, expiresAt: now + cacheTtlMs };
        this.compiledRulesCache.set(sourceId, compiled);
      }

      const { whitelist, blacklist } = compiled;
      if (whitelist.length === 0 && blacklist.length === 0) {
        return articles;
      }

      logger.info(`[FilterService] Source ${sourceId}: Whitelist=${whitelist.length}, Blacklist=${blacklist.length}`);
      
      // 3. Apply filtering
      const filteredArticles: T[] = [];
      
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        
        if (safeYieldEvery > 0 && i > 0 && i % safeYieldEvery === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const title = (article.title || '').toLowerCase();
        const summary = (article.summary || '').toLowerCase();
        const content = (article.content || '').toLowerCase();
        const contentToCheck = `${title} ${summary} ${content}`;
        
        const checkMatch = (rule: CompiledFilterRule): boolean => {
          if (rule.isRegex) {
            if (!rule.regex) return false;
            return rule.regex.test(contentToCheck);
          }
          if (!rule.keywordLower) return false;
          return contentToCheck.includes(rule.keywordLower);
        };
        
        let keep = true;

        // Whitelist check: If whitelist exists, article MUST match at least one
        if (whitelist.length > 0) {
          const hitsWhitelist = whitelist.some(rule => checkMatch(rule));
          if (!hitsWhitelist) {
            keep = false; // Not in whitelist, discard
          }
        }
        
        // Blacklist check: If matches any blacklist rule, discard
        if (keep && blacklist.length > 0) {
          const hitsBlacklist = blacklist.some(rule => checkMatch(rule));
          if (hitsBlacklist) {
            keep = false; // Hit blacklist, discard
          }
        }
        
        if (keep) {
          filteredArticles.push(article);
        }
      }
      
      if (articles.length !== filteredArticles.length) {
        logger.info(`[FilterService] Filtered out ${articles.length - filteredArticles.length} articles.`);
      }

      return filteredArticles;
    } catch (error) {
      logger.error('[FilterService] Failed to apply filters:', error);
      return articles; // Return original list on error
    }
  }

  /**
   * 导出过滤规则
   */
  public async exportRulesForSync(): Promise<any[]> {
    try {
      const [filterRuleColumns, hasFilterBindingsTable] = await Promise.all([
        this.getTableColumns('filter_rules'),
        this.hasTable('filter_bindings'),
      ]);

      if (filterRuleColumns.has('source_id')) {
        const results = await this.databaseService.executeQuery(
          `
            SELECT f.*, s.url as source_url 
            FROM filter_rules f
            LEFT JOIN rss_sources s ON f.source_id = s.id
          `
        );
        return results.map(row => ({
          keyword: row.keyword,
          mode: row.mode,
          target: row.target,
          sourceUrl: row.source_url,
          isRegex: row.is_regex,
          isActive: Boolean(row.is_active),
        }));
      }

      if (!hasFilterBindingsTable || !filterRuleColumns.has('scope')) {
        const results = await this.databaseService.executeQuery('SELECT * FROM filter_rules ORDER BY id DESC');
        return results.map(row => ({
          keyword: row.keyword,
          mode: row.mode,
          isRegex: Boolean(row.is_regex),
        }));
      }

      const [rules, sources] = await Promise.all([
        this.databaseService.executeQuery(
          'SELECT id, keyword, is_regex, mode, scope FROM filter_rules ORDER BY id DESC'
        ),
        this.databaseService.executeQuery('SELECT id, url FROM rss_sources'),
      ]);

      const sourceUrlById = new Map<number, string>();
      for (const row of sources) {
        if (typeof row.id === 'number' && typeof row.url === 'string') {
          sourceUrlById.set(row.id, row.url);
        }
      }

      const exported: any[] = [];
      for (const rule of rules) {
        const base = {
          keyword: rule.keyword,
          mode: rule.mode,
          isRegex: Boolean(rule.is_regex),
          scope: rule.scope,
        };

        if (rule.scope === 'specific') {
          const sourceIds = await this.databaseService.getRuleBindings(rule.id);
          const sourceUrls = sourceIds
            .map((id: number) => sourceUrlById.get(id))
            .filter((v: any) => typeof v === 'string');
          exported.push({ ...base, sourceUrls });
        } else {
          exported.push(base);
        }
      }

      return exported;
    } catch (error) {
      logger.error('Error exporting filter rules:', error);
      return [];
    }
  }

  /**
   * 导入过滤规则
   */
  public async importRulesFromSync(rules: any[]): Promise<void> {
    try {
      await this.databaseService.executeQuery('SELECT 1');

      const [filterRuleColumns, hasFilterBindingsTable] = await Promise.all([
        this.getTableColumns('filter_rules'),
        this.hasTable('filter_bindings'),
      ]);

      if (filterRuleColumns.has('source_id')) {
        await this.databaseService.beginTransaction();
        
        for (const rule of rules) {
          let sourceId = null;
          if (rule.sourceUrl) {
            const sources = await this.databaseService.executeQuery(
              'SELECT id FROM rss_sources WHERE url = ?', 
              [rule.sourceUrl]
            );
            if (sources.length > 0) {
              sourceId = sources[0].id;
            } else {
              continue;
            }
          }

          const query = sourceId 
            ? 'SELECT id FROM filter_rules WHERE keyword = ? AND source_id = ? AND mode = ?'
            : 'SELECT id FROM filter_rules WHERE keyword = ? AND source_id IS NULL AND mode = ?';
          
          const params = sourceId 
            ? [rule.keyword, sourceId, rule.mode]
            : [rule.keyword, rule.mode];

          const existing = await this.databaseService.executeQuery(query, params);
          
          if (existing.length === 0) {
            await this.databaseService.executeInsert(
              `INSERT INTO filter_rules (keyword, mode, target, source_id, is_regex, is_active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                rule.keyword, 
                rule.mode, 
                rule.target || 'title_summary', 
                sourceId, 
                rule.isRegex ? 1 : 0, 
                rule.isActive ? 1 : 0,
                new Date().toISOString()
              ]
            );
          }
        }
        
        await this.databaseService.commitTransaction();
        this.compiledRulesCache.clear();
        return;
      }

      if (!hasFilterBindingsTable || !filterRuleColumns.has('scope')) {
        return;
      }

      const sources = await this.databaseService.executeQuery('SELECT id, url FROM rss_sources');
      const sourceIdByUrl = new Map<string, number>();
      for (const row of sources) {
        if (typeof row.url === 'string' && typeof row.id === 'number') {
          sourceIdByUrl.set(row.url, row.id);
        }
      }

      await this.databaseService.beginTransaction();
      
      for (const rule of rules) {
        const keyword = typeof rule.keyword === 'string' ? rule.keyword.trim() : '';
        if (!keyword) continue;

        const mode = rule.mode === 'include' ? 'include' : 'exclude';
        const isRegex = Boolean(rule.isRegex ?? rule.is_regex);

        const sourceUrlsRaw = Array.isArray(rule.sourceUrls)
          ? rule.sourceUrls
          : (typeof rule.sourceUrl === 'string' ? [rule.sourceUrl] : []);
        const sourceUrls = sourceUrlsRaw.filter((v: any) => typeof v === 'string' && v.trim());

        const scope = rule.scope === 'specific' || sourceUrls.length > 0 ? 'specific' : 'global';
        const targetSourceIds =
          scope === 'specific'
            ? sourceUrls
                .map((u: string) => sourceIdByUrl.get(u))
                .filter((v: any) => typeof v === 'number') as number[]
            : [];

        if (scope === 'specific' && targetSourceIds.length === 0) {
          continue;
        }

        const candidates = await this.databaseService.executeQuery(
          'SELECT id FROM filter_rules WHERE keyword = ? AND mode = ? AND is_regex = ? AND scope = ?',
          [keyword, mode, isRegex ? 1 : 0, scope]
        );

        let exists = false;
        for (const c of candidates) {
          if (!c?.id) continue;
          if (scope === 'global') {
            exists = true;
            break;
          }

          const existingBindings = await this.databaseService.getRuleBindings(c.id);
          const a = [...existingBindings].map(Number).sort((x, y) => x - y);
          const b = [...new Set(targetSourceIds)].map(Number).sort((x, y) => x - y);
          if (a.length !== b.length) continue;
          let same = true;
          for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
              same = false;
              break;
            }
          }
          if (same) {
            exists = true;
            break;
          }
        }

        if (!exists) {
          await this.databaseService.createRule(
            keyword,
            isRegex,
            mode,
            scope,
            targetSourceIds
          );
        }
      }
      
      await this.databaseService.commitTransaction();
      this.compiledRulesCache.clear();
    } catch (error) {
      await this.databaseService.rollbackTransaction();
      logger.error('Error importing filter rules:', error);
    }
  }

  private async hasTable(tableName: string): Promise<boolean> {
    try {
      const rows = await this.databaseService.executeQuery(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
        [tableName]
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    try {
      const rows = await this.databaseService.executeQuery(`PRAGMA table_info(${tableName})`);
      return new Set(rows.map((r: any) => String(r.name)));
    } catch {
      return new Set<string>();
    }
  }
}

export const filterService = FilterService.getInstance();
