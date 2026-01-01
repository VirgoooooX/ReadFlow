import { DatabaseService } from '../database/DatabaseService';
import { RSSGroup, RSSSource } from '../types';
import { logger } from './rss/RSSUtils';

/**
 * RSS 分组管理服务
 */
export class RSSGroupService {
  private static instance: RSSGroupService;
  private dbService: DatabaseService;

  private constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  public static getInstance(): RSSGroupService {
    if (!RSSGroupService.instance) {
      RSSGroupService.instance = new RSSGroupService();
    }
    return RSSGroupService.instance;
  }

  /**
   * 创建分组
   */
  async createGroup(group: Omit<RSSGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<RSSGroup> {
    const now = Date.now();
    
    const result = await this.dbService.executeInsert(
      `INSERT INTO rss_groups (name, icon, color, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        group.name,
        group.icon || null,
        group.color || null,
        group.sortOrder,
        now,
        now,
      ]
    );

    this.triggerSync();

    return {
      id: result.insertId,
      ...group,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 更新分组
   */
  async updateGroup(groupId: number, updates: Partial<RSSGroup>): Promise<void> {
    const now = Date.now();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?');
      values.push(updates.icon);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(updates.sortOrder);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(groupId);

    await this.dbService.executeStatement(
      `UPDATE rss_groups SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    this.triggerSync();
  }

  /**
   * 删除分组
   * @param groupId 分组 ID
   * @param deleteSourcesToo 是否同时删除该分组下的源（默认 false，源移至未分组）
   */
  async deleteGroup(groupId: number, deleteSourcesToo: boolean = false): Promise<void> {
    if (deleteSourcesToo) {
      // 级联删除源
      await this.dbService.executeStatement(
        'DELETE FROM rss_sources WHERE group_id = ?',
        [groupId]
      );
    } else {
      // 源移至未分组（group_id 设为 NULL）
      // 注意：由于数据库设置了 ON DELETE SET NULL，这一步实际会自动处理
      // 但为了明确性，我们显式执行
      await this.dbService.executeStatement(
        'UPDATE rss_sources SET group_id = NULL WHERE group_id = ?',
        [groupId]
      );
    }

    // 删除分组
    await this.dbService.executeStatement(
      'DELETE FROM rss_groups WHERE id = ?',
      [groupId]
    );
    this.triggerSync();
  }

  /**
   * 获取所有分组（带统计数据）
   */
  async getAllGroups(): Promise<RSSGroup[]> {
    const query = `
      SELECT 
        g.*,
        COUNT(s.id) as sourceCount,
        COALESCE(SUM(s.unread_count), 0) as unreadCount
      FROM rss_groups g
      LEFT JOIN rss_sources s ON s.group_id = g.id AND s.is_active = 1
      GROUP BY g.id
      ORDER BY g.sort_order ASC
    `;

    const rows: any[] = await this.dbService.executeQuery(query);
    
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceCount: row.sourceCount || 0,
      unreadCount: row.unreadCount || 0,
    }));
  }

  /**
   * 根据 ID 获取分组
   */
  async getGroupById(groupId: number): Promise<RSSGroup | null> {
    const rows: any[] = await this.dbService.executeQuery(
      'SELECT * FROM rss_groups WHERE id = ?',
      [groupId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 重新排序分组
   * @param groupIds 分组 ID 数组，按新的顺序排列
   */
  async reorderGroups(groupIds: number[]): Promise<void> {
    await this.dbService.beginTransaction();
    
    try {
      for (let i = 0; i < groupIds.length; i++) {
        await this.dbService.executeStatement(
          'UPDATE rss_groups SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i, Date.now(), groupIds[i]]
        );
      }
      
      await this.dbService.commitTransaction();
      this.triggerSync();
    } catch (error) {
      await this.dbService.rollbackTransaction();
      throw error;
    }
  }

  /**
   * 🚀 批量移动源到指定分组
   * @param sourceIds 源 ID 数组
   * @param targetGroupId 目标分组 ID（null 表示移至未分组）
   */
  async moveSourcesToGroup(sourceIds: number[], targetGroupId: number | null): Promise<void> {
    if (sourceIds.length === 0) return;

    const now = Date.now();
    const placeholders = sourceIds.map(() => '?').join(',');
    
    await this.dbService.executeStatement(
      `UPDATE rss_sources SET group_id = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [targetGroupId, now, ...sourceIds]
    );
    this.triggerSync();
  }

  /**
   * 将单个源添加到分组
   */
  async addSourceToGroup(sourceId: number, groupId: number): Promise<void> {
    await this.moveSourcesToGroup([sourceId], groupId);
  }

  /**
   * 将源移出分组（移至未分组）
   */
  async removeSourceFromGroup(sourceId: number): Promise<void> {
    await this.moveSourcesToGroup([sourceId], null);
  }

  /**
   * 获取指定分组下的所有源
   * @param groupId -1=全部, 0=未分组, >0=实际分组
   */
  async getSourcesByGroup(groupId: number): Promise<RSSSource[]> {
    let query: string;
    let params: any[];

    if (groupId === -1) {
      // 全部
      query = 'SELECT * FROM rss_sources ORDER BY sort_order ASC, id DESC';
      params = [];
    } else if (groupId === 0) {
      // 未分组
      query = 'SELECT * FROM rss_sources WHERE group_id IS NULL ORDER BY sort_order ASC, id DESC';
      params = [];
    } else {
      // 指定分组
      query = 'SELECT * FROM rss_sources WHERE group_id = ? ORDER BY group_sort_order ASC, sort_order ASC, id DESC';
      params = [groupId];
    }

    const rows: any[] = await this.dbService.executeQuery(query, params);
    
    return rows.map((row) => this.mapRowToRSSSource(row));
  }

  /**
   * 智能推荐分组（基于源的名称和分类）
   */
  suggestGroupForSource(source: RSSSource): string[] {
    const suggestions: string[] = [];
    const text = `${source.name} ${source.category}`.toLowerCase();

    const keywords: Record<string, string> = {
      'ai|gpt|machine learning|deep learning|人工智能': 'AI 前沿',
      'tech|technology|技术|编程|code|programming': '技术资讯',
      'design|ui|ux|设计|视觉': '设计灵感',
      'startup|entrepreneur|创业|商业': '创业资讯',
      'news|新闻|资讯': '新闻资讯',
      'science|科学|研究': '科学探索',
    };

    for (const [pattern, groupName] of Object.entries(keywords)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(text)) {
        suggestions.push(groupName);
      }
    }

    return suggestions.slice(0, 3); // 最多返回 3 个建议
  }

  /**
   * 获取默认图标（基于分组名称或首个源）
   */
  getDefaultIcon(group: RSSGroup, sources: RSSSource[] = []): string {
    if (group.icon) return group.icon;

    // 策略 1：取首个源的图标
    if (sources.length > 0 && sources[0].name) {
      // 这里可以扩展为使用 favicon，暂时返回首字母
      return sources[0].name[0].toUpperCase();
    }

    // 策略 2：根据分组名关键词推荐图标
    const keywords: Record<string, string> = {
      '技术|编程|代码': 'code',
      'AI|人工智能': 'psychology',
      '设计|UI|视觉': 'palette',
      '新闻|资讯': 'newspaper',
      '创业|商业': 'business-center',
      '科学|研究': 'science',
    };

    for (const [pattern, icon] of Object.entries(keywords)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(group.name)) {
        return icon;
      }
    }

    // 策略 3：首字母
    return group.name[0].toUpperCase();
  }

  /**
   * 🚀 迁移现有 category 到 group 系统
   * 检测所有唯一的 category，为每个创建对应的 group，并关联源
   */
  async migrateCategoryToGroups(): Promise<{ created: number; mapped: number }> {
    logger.info('📦 [分组迁移] 开始检测 category -> group 迁移...');
    
    // 1. 获取所有唯一的 category
    const categoriesResult: any[] = await this.dbService.executeQuery(
      'SELECT DISTINCT category FROM rss_sources WHERE category IS NOT NULL AND category != ""'
    );
    const categories = categoriesResult.map(r => r.category).filter(Boolean);
    
    if (categories.length === 0) {
      logger.info('📦 [分组迁移] 没有找到需要迁移的 category');
      return { created: 0, mapped: 0 };
    }
    
    logger.info(`📦 [分组迁移] 发现 ${categories.length} 个 category: ${categories.join(', ')}`);
    
    // 2. 获取现有分组
    const existingGroups = await this.getAllGroups();
    const existingGroupNames = new Set(existingGroups.map(g => g.name));
    
    let createdCount = 0;
    let mappedCount = 0;
    
    // 3. 为每个 category 创建对应的 group（如果不存在）
    for (const category of categories) {
      let groupId: number;
      
      if (existingGroupNames.has(category)) {
        // 分组已存在，获取 ID
        const existing = existingGroups.find(g => g.name === category);
        groupId = existing!.id;
        logger.info(`📦 [分组迁移] 分组 "${category}" 已存在 (ID: ${groupId})`);
      } else {
        // 创建新分组
        const newGroup = await this.createGroup({
          name: category,
          sortOrder: existingGroups.length + createdCount,
          color: this.getRandomColor(),
        });
        groupId = newGroup.id;
        createdCount++;
        logger.info(`📦 [分组迁移] 创建新分组 "${category}" (ID: ${groupId})`);
      }
      
      // 4. 将该 category 下的所有源关联到分组（仅当 group_id 为空时）
      // 先查询有多少需要迁移
      const countResult: any[] = await this.dbService.executeQuery(
        'SELECT COUNT(*) as count FROM rss_sources WHERE category = ? AND group_id IS NULL',
        [category]
      );
      const countToMigrate = countResult[0]?.count || 0;
      
      if (countToMigrate > 0) {
        await this.dbService.executeStatement(
          'UPDATE rss_sources SET group_id = ? WHERE category = ? AND group_id IS NULL',
          [groupId, category]
        );
        mappedCount += countToMigrate;
        logger.info(`📦 [分组迁移] 将 ${countToMigrate} 个源关联到分组 "${category}"`);
      }
    }
    
    logger.info(`✅ [分组迁移] 完成！创建 ${createdCount} 个分组，关联 ${mappedCount} 个源`);
    return { created: createdCount, mapped: mappedCount };
  }

  /**
   * 导出分组用于同步
   */
  async exportGroupsForSync(): Promise<any[]> {
    try {
      const query = 'SELECT name, icon, color, sort_order FROM rss_groups ORDER BY sort_order ASC';
      const rows: any[] = await this.dbService.executeQuery(query);
      return rows.map(row => ({
        name: row.name,
        icon: row.icon,
        color: row.color,
        sortOrder: row.sort_order,
      }));
    } catch (error) {
      logger.error('Error exporting groups for sync:', error);
      return [];
    }
  }

  /**
   * 导入同步的分组
   */
  async importGroupsFromSync(groups: any[]): Promise<void> {
    try {
      await this.dbService.beginTransaction();

      for (const group of groups) {
        // 检查是否存在 (by Name)
        const existing = await this.dbService.executeQuery(
          'SELECT id FROM rss_groups WHERE name = ?',
          [group.name]
        );

        if (existing.length > 0) {
          // Update
          const id = existing[0].id;
          await this.dbService.executeStatement(
            'UPDATE rss_groups SET icon = ?, color = ?, sort_order = ?, updated_at = ? WHERE id = ?',
            [group.icon || null, group.color || null, group.sortOrder, Date.now(), id]
          );
        } else {
          // Insert
          await this.createGroup({
            name: group.name,
            icon: group.icon,
            color: group.color,
            sortOrder: group.sortOrder,
          });
        }
      }

      await this.dbService.commitTransaction();
    } catch (error) {
      await this.dbService.rollbackTransaction();
      logger.error('Error importing groups from sync:', error);
      throw error;
    }
  }

  private syncTimer: any = null;

  private triggerSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(async () => {
      this.syncTimer = null;
      try {
        const { configSyncService } = require('./ConfigSyncService');
        if (configSyncService) {
          await configSyncService.syncConfig('push');
        }
      } catch (e) {
        // Ignore
      }
    }, 2000);
  }

  /**
   * 获取随机颜色
   */
  private getRandomColor(): string {
    const colors = [
      '#6750A4', // Purple
      '#0061A4', // Blue
      '#006E1C', // Green
      '#C77700', // Orange
      '#BA1A1A', // Red
      '#8E4585', // Pink
      '#00696C', // Teal
      '#5C5D72', // Slate
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * 数据库行转换为 RSSSource 对象
   */
  private mapRowToRSSSource(row: any): RSSSource {
    return {
      id: row.id,
      sortOrder: row.sort_order || 0,
      name: row.title,
      url: row.url,
      category: row.category,
      contentType: row.content_type || 'image_text',
      sourceMode: row.source_mode || 'direct',
      isActive: row.is_active === 1,
      lastFetchAt: row.last_updated ? new Date(row.last_updated) : undefined,
      errorCount: row.error_count || 0,
      description: row.description,
      updateFrequency: row.update_frequency,
      article_count: row.article_count,
      unread_count: row.unread_count,
      last_updated: row.last_updated,
      groupId: row.group_id,
      groupSortOrder: row.group_sort_order || 0,
    };
  }
}

export default RSSGroupService.getInstance();
