const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        const result = await prisma.rSSSource.updateMany({
            where: {
                isPublic: false
            },
            data: {
                isPublic: true,
            },
        });
        console.log(`[Startup] Successfully updated ${result.count} existing RSS sources to be public!`);
    } catch (error) {
        console.error('[Startup Error] Failed to update existing RSS sources to public:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
