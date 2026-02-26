import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5656/readflow?schema=public';
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

function toIso(v: any) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function escapeCsv(v: any) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const sources = await prisma.rSSSource.findMany({
    include: {
      _count: { select: { articles: true, users: true } },
    },
    orderBy: [{ id: 'asc' }],
  });

  const exported = sources.map((s: any) => ({
    id: s.id,
    url: s.url,
    name: s.name,
    category: s.category,
    description: s.description ?? '',
    isActive: !!s.isActive,
    isPublic: !!s.isPublic,
    lastFetchAt: s.lastFetchAt ? s.lastFetchAt.toISOString() : '',
    refreshIntervalSeconds: s.refreshIntervalSeconds ?? null,
    refreshCron: s.refreshCron ?? null,
    errorCount: s.errorCount ?? 0,
    lastErrorMessage: s.lastErrorMessage ?? '',
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
    articleCount: s._count?.articles ?? 0,
    subscriberCount: s._count?.users ?? 0,
  }));

  const datePart = new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, '../exports');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `feeds_export_${datePart}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(exported, null, 2), 'utf8');

  const headers = [
    'id',
    'url',
    'name',
    'category',
    'description',
    'isActive',
    'isPublic',
    'lastFetchAt',
    'refreshIntervalSeconds',
    'refreshCron',
    'errorCount',
    'lastErrorMessage',
    'createdAt',
    'updatedAt',
    'articleCount',
    'subscriberCount',
  ];

  const csvLines = [
    headers.join(','),
    ...exported.map(row => headers.map(h => escapeCsv((row as any)[h])).join(',')),
  ];
  const csvPath = path.join(outDir, `feeds_export_${datePart}.csv`);
  fs.writeFileSync(csvPath, '\ufeff' + csvLines.join('\n'), 'utf8');

  process.stdout.write(`Exported ${exported.length} feeds\n`);
  process.stdout.write(`JSON: ${jsonPath}\n`);
  process.stdout.write(`CSV:  ${csvPath}\n`);
}

main()
  .catch((e) => {
    process.stderr.write(String(e?.stack || e) + '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

