
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
    console.log('Starting migration of daily report settings...');

    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        try {
            // Cast safely
            const syncData: any = user.syncData ? JSON.parse(JSON.stringify(user.syncData)) : {};

            let changed = false;

            // Ensure structure exists
            if (!syncData.configSync) syncData.configSync = {};
            if (!syncData.configSync.settings) syncData.configSync.settings = {};
            if (!syncData.configSync.settings.dailyReportSettings) syncData.configSync.settings.dailyReportSettings = {};

            const drSettings = syncData.configSync.settings.dailyReportSettings;

            // 1. Migrate intervalHours -> schedule
            if (!drSettings.schedule) {
                console.log(`User ${user.uuid}: Migrating schedule...`);
                drSettings.schedule = '0 6,18 * * *';

                if (typeof drSettings.intervalHours === 'number') {
                    const h = drSettings.intervalHours;
                    if (h === 6) drSettings.schedule = '0 0,6,12,18 * * *';
                    else if (h === 24) drSettings.schedule = '0 8 * * *';
                    delete drSettings.intervalHours;
                }
                changed = true;
            }

            // 2. Initialize lastAutoReportTime if missing
            // user.syncData.dailyReport.lastAutoReportTime
            if (!syncData.dailyReport) syncData.dailyReport = {};

            // Cleanup old field if exists from previous runs/code
            if (syncData.dailyReport.lastAutoTime) {
                console.log(`User ${user.uuid}: Renaming lastAutoTime to lastAutoReportTime...`);
                syncData.dailyReport.lastAutoReportTime = syncData.dailyReport.lastAutoTime;
                delete syncData.dailyReport.lastAutoTime;
                changed = true;
            }

            if (!syncData.dailyReport.lastAutoReportTime) {
                console.log(`User ${user.uuid}: Initializing lastAutoReportTime...`);
                // Set to now so we don't immediately trigger a backlog of reports.
                syncData.dailyReport.lastAutoReportTime = new Date().toISOString();
                changed = true;
            }

            if (changed) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { syncData }
                });
                console.log(`User ${user.uuid}: Updated.`);
            } else {
                console.log(`User ${user.uuid}: No changes needed.`);
            }

        } catch (e) {
            console.error(`Failed to migrate user ${user.uuid}:`, e);
        }
    }

    console.log('Migration complete.');
    await prisma.$disconnect();
}

migrate();
