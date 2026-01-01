import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, '../data');

async function main() {
  console.log('Starting migration...');

  // 1. Migrate Users
  const usersFile = path.join(DATA_DIR, 'users.json');
  if (fs.existsSync(usersFile)) {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    console.log(`Found ${users.length} users.`);

    for (const u of users) {
      // Merge legacy settings and config
      const syncData = {
        ...(u.config || {}),
        settings: u.settings || u.config?.settings,
      };

      await prisma.user.upsert({
        where: { uuid: u.id },
        update: {
          username: u.username,
          email: u.email,
          passwordHash: u.passwordHash,
          syncData: syncData,
          lastActive: new Date(u.lastActive || new Date()),
        },
        create: {
          uuid: u.id,
          username: u.username,
          email: u.email,
          passwordHash: u.passwordHash,
          registeredAt: new Date(u.registeredAt || new Date()),
          lastActive: new Date(u.lastActive || new Date()),
          syncData: syncData,
        },
      });
    }
    console.log('Users migrated.');
  }

  // 2. Migrate RSS Sources (Feeds)
  const feedsFile = path.join(DATA_DIR, 'feeds.json');
  const feedIdMap = new Map<string, number>(); // Old ID (string) -> New ID (int)

  if (fs.existsSync(feedsFile)) {
    const feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf-8'));
    console.log(`Found ${feeds.length} feeds.`);

    for (const f of feeds) {
      if (!f.url) continue;
      const source = await prisma.rSSSource.upsert({
        where: { url: f.url },
        update: {
          name: f.name,
          category: f.category,
          lastFetchAt: f.lastRefreshAt ? new Date(f.lastRefreshAt) : null,
        },
        create: {
          url: f.url,
          name: f.name,
          category: f.category,
          isActive: true,
          lastFetchAt: f.lastRefreshAt ? new Date(f.lastRefreshAt) : null,
        },
      });
      feedIdMap.set(f.id, source.id);
    }
    console.log('Feeds migrated.');
  }

  // 3. Migrate Articles
  const articlesFile = path.join(DATA_DIR, 'articles.json');
  if (fs.existsSync(articlesFile)) {
    const data = JSON.parse(fs.readFileSync(articlesFile, 'utf-8'));
    const articlesMap = data.articlesByKey || {};
    const articles = Object.values(articlesMap).map((v: any) => v.article);
    console.log(`Found ${articles.length} articles.`);

    // Batch insert for performance
    const batchSize = 100;
    let batch: any[] = [];

    for (const a of articles) {
      // Find source ID (we need to match by URL since we don't have the feed ID in article object usually, 
      // but StorageService stored 'sourceUrl' in the wrapper)
      // Wait, 'articles' array here is stripped of the wrapper? 
      // StorageService: storedArticles.articlesByKey[key] = { key, sourceUrl, article: ... }
      // My code above: map(v => v.article). I lost sourceUrl!
    }
    
    // Let's redo reading to keep sourceUrl
    const rawArticles = Object.values(articlesMap) as any[];
    console.log(`Processing ${rawArticles.length} raw article entries...`);

    for (const entry of rawArticles) {
      const { sourceUrl, article } = entry;
      if (!article || !article.url) continue;

      // Find Source ID
      // We might need to query DB or cache sources. 
      // Since we just migrated feeds, let's fetch them all to memory for lookup map.
      // Or just upsert source if missing? No, we should have it.
      // But URL in feed might differ slightly (normalization). 
      // Let's assume URL match.
      
      const source = await prisma.rSSSource.findUnique({ where: { url: sourceUrl } });
      if (!source) {
        // Create implicit source?
        console.warn(`Source not found for article: ${sourceUrl}`);
        continue; 
      }

      await prisma.article.upsert({
        where: { url: article.url },
        update: {}, // Skip if exists
        create: {
          url: article.url,
          title: article.title || 'No Title',
          content: article.content || '',
          summary: article.summary,
          author: article.author,
          publishedAt: new Date(article.publishedAt || new Date()),
          imageUrl: article.imageUrl,
          sourceId: source.id,
        },
      });
    }
    console.log('Articles migrated.');
  }

  // 4. Migrate User Feed Links
  const userFeedsFile = path.join(DATA_DIR, 'userFeeds.json');
  if (fs.existsSync(userFeedsFile)) {
    const links = JSON.parse(fs.readFileSync(userFeedsFile, 'utf-8'));
    console.log(`Found ${links.length} user-feed links.`);

    for (const link of links) {
      const { userId, feedId } = link;
      
      // We need to map feedId (string hash) to Source ID (int)
      // We have feedIdMap from Step 2
      const sourceId = feedIdMap.get(feedId);
      if (!sourceId) {
        console.warn(`Unknown feed ID in link: ${feedId}`);
        continue;
      }

      // Check if user exists
      const userExists = await prisma.user.findUnique({ where: { uuid: userId } });
      if (!userExists) continue;

      await prisma.userFeed.upsert({
        where: {
          userId_sourceId: {
            userId: userId,
            sourceId: sourceId,
          }
        },
        update: {},
        create: {
          user: { connect: { uuid: userId } },
          source: { connect: { id: sourceId } },
        }
      });
    }
    console.log('User-Feed links migrated.');
  }
  
  // 5. Migrate User Article States
  const statesFile = path.join(DATA_DIR, 'userArticleStates.json');
  if (fs.existsSync(statesFile)) {
    const statesMap = JSON.parse(fs.readFileSync(statesFile, 'utf-8')); // userId -> State[]
    console.log(`Found user article states.`);
    
    for (const [userId, states] of Object.entries(statesMap)) {
      const userStates = states as any[];
      for (const s of userStates) {
        if (!s.articleUrl) continue;
        
        // Find article ID by URL
        const article = await prisma.article.findUnique({ where: { url: s.articleUrl } });
        if (!article) continue;
        
        await prisma.userArticleState.upsert({
          where: {
            userId_articleId: {
              userId: userId,
              articleId: article.id
            }
          },
          update: {
            isRead: s.isRead,
            isFavorite: s.isFavorite,
            readProgress: s.readProgress,
            updatedAt: new Date(s.updatedAt || new Date()),
          },
          create: {
            user: { connect: { uuid: userId } },
            article: { connect: { id: article.id } },
            articleUrl: article.url,
            isRead: s.isRead || false,
            isFavorite: s.isFavorite || false,
            readProgress: s.readProgress || 0,
          }
        });
      }
    }
    console.log('User Article States migrated.');
  }

  // 6. Migrate Server Settings (legacy file)
  const settingsFile = path.join(DATA_DIR, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    await prisma.serverSetting.upsert({
      where: { key: 'default' },
      update: { data: settings },
      create: { key: 'default', data: settings },
    });
    console.log('Server settings migrated.');
  }

  // 7. Migrate Sync Blocks (legacy file)
  const syncBlocksFile = path.join(DATA_DIR, 'syncBlocks.json');
  if (fs.existsSync(syncBlocksFile)) {
    const syncBlocks = JSON.parse(fs.readFileSync(syncBlocksFile, 'utf-8'));
    await prisma.legacySyncBlockStore.upsert({
      where: { key: 'default' },
      update: { data: syncBlocks },
      create: { key: 'default', data: syncBlocks },
    });
    console.log('Sync blocks migrated.');
  }

  console.log('Migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
