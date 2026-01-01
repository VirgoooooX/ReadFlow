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

export class FilterService {
  private static instance: FilterService;
  private databaseService: DatabaseService;

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
    sourceId: number
  ): Promise<T[]> {
    try {
      // 1. Get effective rules for this source (global + specific)
      const rules = await this.databaseService.getEffectiveRules(sourceId);
      
      if (rules.length === 0) {
        return articles; // No rules, return original list
      }
      
      // 2. Classify rules
      const whitelist = rules.filter((r: any) => r.mode === 'include');
      const blacklist = rules.filter((r: any) => r.mode === 'exclude');
      
      logger.info(`[FilterService] Source ${sourceId}: Whitelist=${whitelist.length}, Blacklist=${blacklist.length}`);
      
      // 3. Apply filtering
      const filteredArticles: T[] = [];
      
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        
        // Yield to main thread every 5 articles to prevent blocking
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const title = (article.title || '').toLowerCase();
        const summary = (article.summary || '').toLowerCase();
        const content = (article.content || '').toLowerCase();
        const contentToCheck = `${title} ${summary} ${content}`;
        
        // Helper: Check if content matches a rule
        const checkMatch = (rule: any): boolean => {
          if (rule.is_regex === 1) {
            try {
              const regex = new RegExp(rule.keyword, 'i');
              return regex.test(contentToCheck);
            } catch (e) {
              logger.warn(`[FilterService] Invalid regex: ${rule.keyword}`);
              return false;
            }
          } else {
            // Simple string match
            return contentToCheck.includes(rule.keyword.toLowerCase());
          }
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
      const query = `
        SELECT f.*, s.url as source_url 
        FROM filter_rules f
        LEFT JOIN rss_sources s ON f.source_id = s.id
      `;
      const results = await this.databaseService.executeQuery(query);
      return results.map(row => ({
        keyword: row.keyword,
        mode: row.mode,
        target: row.target,
        sourceUrl: row.source_url, // Use URL for sync
        isRegex: row.is_regex,
        isActive: Boolean(row.is_active),
      }));
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
      await this.databaseService.beginTransaction();
      
      for (const rule of rules) {
        // Resolve source ID from URL
        let sourceId = null;
        if (rule.sourceUrl) {
          const sources = await this.databaseService.executeQuery(
            'SELECT id FROM rss_sources WHERE url = ?', 
            [rule.sourceUrl]
          );
          if (sources.length > 0) {
            sourceId = sources[0].id;
          } else {
            // Source not found locally, maybe skip this rule or add as global?
            // Let's skip specific rules for missing sources
            continue; 
          }
        }

        // Check existence
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
    } catch (error) {
      await this.databaseService.rollbackTransaction();
      logger.error('Error importing filter rules:', error);
    }
  }
}

export const filterService = FilterService.getInstance();
