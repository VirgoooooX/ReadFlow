
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Force override DATABASE_URL with the correct port for this environment
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5656/readflow?schema=public";

// Initialize Prisma
const prisma = new PrismaClient();

async function main() {
    try {
        const report = await prisma.dailyReport.findFirst({
            orderBy: { generatedAt: 'desc' },
        });

        if (report) {
            console.log(`Report ID: ${report.id}`);
            fs.writeFileSync('report_debug.txt', JSON.stringify(report.content, null, 2));
            console.log('Report content written to report_debug.txt');
        } else {
            console.log('No reports found.');
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
