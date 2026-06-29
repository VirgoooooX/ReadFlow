import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GroupRecord = {
  id: number;
  userId: string;
  name: string;
  sortOrder: number;
  icon: string | null;
  color: string | null;
};

type SourceRecord = {
  id: number;
  uuid?: string;
  url: string;
  name: string;
  category: string;
  description: string | null;
};

type UserFeedRecord = {
  userId: string;
  sourceId: number;
  customName: string;
  customCategory: string;
  groupId?: number;
  isActive: boolean;
  contentType: string | null;
  sourceMode: string | null;
  fetchLimit: number | null;
  retentionLimit: number | null;
  sortOrder: number | null;
  updateFrequency: number | null;
};

type FilterRuleRecord = {
  id: number;
  userId: string;
  keyword: string;
  mode: string;
  isRegex: boolean;
  scope: string;
  sourceUrls: string[];
  target: string;
  isActive: boolean;
};

type DbState = {
  groups: GroupRecord[];
  sources: SourceRecord[];
  userFeeds: UserFeedRecord[];
  filterRules: FilterRuleRecord[];
  nextGroupId: number;
  nextSourceId: number;
  nextFilterRuleId: number;
};

type SeedState = Partial<Pick<DbState, 'groups' | 'sources' | 'userFeeds' | 'filterRules'>>;

const mocks = vi.hoisted(() => {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const createState = (): DbState => ({
    groups: [],
    sources: [],
    userFeeds: [],
    filterRules: [],
    nextGroupId: 1,
    nextSourceId: 1,
    nextFilterRuleId: 1,
  });

  const stateWithSeed = (seed: SeedState = {}): DbState => {
    const next = createState();
    next.groups = clone(seed.groups ?? []);
    next.sources = clone(seed.sources ?? []);
    next.userFeeds = clone(seed.userFeeds ?? []);
    next.filterRules = clone(seed.filterRules ?? []);
    next.nextGroupId = Math.max(0, ...next.groups.map(group => group.id)) + 1;
    next.nextSourceId = Math.max(0, ...next.sources.map(source => source.id)) + 1;
    next.nextFilterRuleId = Math.max(0, ...next.filterRules.map(rule => rule.id)) + 1;
    return next;
  };

  const runtime = {
    state: createState(),
    hooks: {} as Record<string, ((ctx: any) => void) | undefined>,
    reset(seed: SeedState = {}) {
      this.state = stateWithSeed(seed);
      this.hooks = {};
    },
    snapshot() {
      return clone(this.state);
    },
  };

  const runHook = (name: string, ctx: any) => {
    const hook = runtime.hooks[name];
    if (hook) {
      hook(ctx);
    }
  };

  const buildClient = (state: DbState) => ({
    userRSSGroup: {
      findMany: async ({ where }: any) =>
        clone(state.groups.filter(group => !where?.userId || group.userId === where.userId)),
      upsert: async ({ where, update, create }: any) => {
        const key = where.userId_name;
        const existing = state.groups.find(
          group => group.userId === key.userId && group.name === key.name
        );

        if (existing) {
          Object.assign(existing, update);
          runHook('userRSSGroup.upsert.after', { state, record: existing, where, update, create });
          return clone(existing);
        }

        const created: GroupRecord = {
          id: state.nextGroupId++,
          userId: create.userId,
          name: create.name,
          sortOrder: create.sortOrder,
          icon: create.icon ?? null,
          color: create.color ?? null,
        };
        state.groups.push(created);
        runHook('userRSSGroup.upsert.after', { state, record: created, where, update, create });
        return clone(created);
      },
    },
    rSSSource: {
      findUnique: async ({ where }: any) => {
        if (where?.uuid !== undefined) {
          return clone(state.sources.find(source => source.uuid === where.uuid) ?? null);
        }
        if (where?.url !== undefined) {
          return clone(state.sources.find(source => source.url === where.url) ?? null);
        }
        return null;
      },
      create: async ({ data }: any) => {
        const created: SourceRecord = {
          id: state.nextSourceId++,
          uuid: data.uuid,
          url: data.url,
          name: data.name,
          category: data.category,
          description: data.description ?? null,
        };
        state.sources.push(created);
        runHook('rSSSource.create.after', { state, record: created, data });
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const source = state.sources.find(item => item.id === where.id);
        if (!source) {
          throw new Error(`Source ${where.id} not found`);
        }
        Object.assign(source, data);
        runHook('rSSSource.update.after', { state, record: source, where, data });
        return clone(source);
      },
    },
    userFeed: {
      upsert: async ({ where, update, create }: any) => {
        const key = where.userId_sourceId;
        const existing = state.userFeeds.find(
          feed => feed.userId === key.userId && feed.sourceId === key.sourceId
        );

        if (existing) {
          Object.assign(existing, update);
          runHook('userFeed.upsert.after', { state, record: existing, where, update, create });
          return clone(existing);
        }

        const created: UserFeedRecord = {
          userId: create.userId,
          sourceId: create.sourceId,
          customName: create.customName,
          customCategory: create.customCategory,
          groupId: create.groupId,
          isActive: create.isActive,
          contentType: create.contentType ?? null,
          sourceMode: create.sourceMode ?? null,
          fetchLimit: create.fetchLimit ?? null,
          retentionLimit: create.retentionLimit ?? null,
          sortOrder: create.sortOrder ?? null,
          updateFrequency: create.updateFrequency ?? null,
        };
        state.userFeeds.push(created);
        runHook('userFeed.upsert.after', { state, record: created, where, update, create });
        return clone(created);
      },
      deleteMany: async ({ where }: any) => {
        const before = state.userFeeds.length;
        state.userFeeds = state.userFeeds.filter(feed => {
          if (where?.userId && feed.userId !== where.userId) {
            return true;
          }
          if (where?.sourceId?.notIn) {
            return where.sourceId.notIn.includes(feed.sourceId);
          }
          return false;
        });
        const result = { count: before - state.userFeeds.length };
        runHook('userFeed.deleteMany.after', { state, where, result });
        return result;
      },
    },
    userRSSFilterRule: {
      deleteMany: async ({ where }: any) => {
        const before = state.filterRules.length;
        state.filterRules = state.filterRules.filter(
          rule => where?.userId && rule.userId !== where.userId
        );
        const result = { count: before - state.filterRules.length };
        runHook('userRSSFilterRule.deleteMany.after', { state, where, result });
        return result;
      },
      createMany: async ({ data }: any) => {
        runHook('userRSSFilterRule.createMany.before', { state, data });
        const created = data.map((rule: any) => ({
          id: state.nextFilterRuleId++,
          userId: rule.userId,
          keyword: rule.keyword,
          mode: rule.mode,
          isRegex: rule.isRegex,
          scope: rule.scope,
          sourceUrls: clone(rule.sourceUrls ?? []),
          target: rule.target,
          isActive: rule.isActive,
        }));
        state.filterRules.push(...created);
        runHook('userRSSFilterRule.createMany.after', { state, data, created });
        return { count: created.length };
      },
    },
  });

  const prisma = {
    $transaction: vi.fn(async (callback: (tx: ReturnType<typeof buildClient>) => Promise<any>) => {
      const txState = clone(runtime.state);
      const txClient = buildClient(txState);
      const result = await callback(txClient);
      runtime.state = txState;
      return result;
    }),
  } as any;

  return { prisma, runtime };
});

vi.mock('../db/prisma', () => ({
  prisma: mocks.prisma,
  prismaAny: mocks.prisma,
}));

import { ConfigController } from './ConfigController';

const USER_ID = 'user-1';

function createRequest(body: any) {
  return {
    body,
    user: { id: USER_ID },
  } as any;
}

function createResponse() {
  const res: any = {
    statusCode: 200,
    payload: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: any) => {
      res.payload = payload;
      return res;
    }),
  };
  return res;
}

describe('ConfigController batch sync transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rolls back source writes and stale-feed deletion when cleanup fails late in the transaction', async () => {
    mocks.runtime.reset({
      groups: [
        { id: 1, userId: USER_ID, name: 'Existing Group', sortOrder: 1, icon: null, color: null },
      ],
      sources: [
        {
          id: 1,
          uuid: 'existing-source',
          url: 'https://existing.example/rss',
          name: 'Existing Feed',
          category: 'Tech',
          description: 'original',
        },
      ],
      userFeeds: [
        {
          userId: USER_ID,
          sourceId: 1,
          customName: 'Existing Feed',
          customCategory: 'Tech',
          groupId: 1,
          isActive: true,
          contentType: null,
          sourceMode: null,
          fetchLimit: null,
          retentionLimit: null,
          sortOrder: 10,
          updateFrequency: null,
        },
      ],
    });
    mocks.runtime.hooks['userFeed.deleteMany.after'] = () => {
      throw new Error('simulated delete failure');
    };

    const res = createResponse();

    await ConfigController.batchUpsertSources(
      createRequest([
        {
          uuid: 'new-source',
          url: 'https://new.example/rss',
          name: 'New Feed',
          category: 'News',
          description: 'new description',
          groupName: 'Created In Transaction',
          sortOrder: 1,
        },
      ]),
      res
    );

    const snapshot = mocks.runtime.snapshot();

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.payload).toEqual({
      success: false,
      message: 'Failed to batch upsert sources',
    });
    expect(snapshot.groups).toEqual([
      { id: 1, userId: USER_ID, name: 'Existing Group', sortOrder: 1, icon: null, color: null },
    ]);
    expect(snapshot.sources).toEqual([
      {
        id: 1,
        uuid: 'existing-source',
        url: 'https://existing.example/rss',
        name: 'Existing Feed',
        category: 'Tech',
        description: 'original',
      },
    ]);
    expect(snapshot.userFeeds).toEqual([
      {
        userId: USER_ID,
        sourceId: 1,
        customName: 'Existing Feed',
        customCategory: 'Tech',
        groupId: 1,
        isActive: true,
        contentType: null,
        sourceMode: null,
        fetchLimit: null,
        retentionLimit: null,
        sortOrder: 10,
        updateFrequency: null,
      },
    ]);
  });

  it('rolls back filter-rule replacement when createMany fails after existing rules were deleted', async () => {
    mocks.runtime.reset({
      filterRules: [
        {
          id: 1,
          userId: USER_ID,
          keyword: 'legacy-rule',
          mode: 'exclude',
          isRegex: false,
          scope: 'global',
          sourceUrls: [],
          target: 'title_summary',
          isActive: true,
        },
      ],
    });
    mocks.runtime.hooks['userRSSFilterRule.createMany.before'] = () => {
      throw new Error('simulated createMany failure');
    };

    const res = createResponse();

    await ConfigController.batchUpsertFilterRules(
      createRequest([
        {
          keyword: 'fresh-rule',
          mode: 'include',
          sourceUrls: ['https://specific.example/rss'],
          target: 'title_summary',
          isActive: true,
        },
      ]),
      res
    );

    const snapshot = mocks.runtime.snapshot();

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.payload).toEqual({
      success: false,
      message: 'Failed to batch upsert filter rules',
    });
    expect(snapshot.filterRules).toEqual([
      {
        id: 1,
        userId: USER_ID,
        keyword: 'legacy-rule',
        mode: 'exclude',
        isRegex: false,
        scope: 'global',
        sourceUrls: [],
        target: 'title_summary',
        isActive: true,
      },
    ]);
  });

  it('rolls back prior group updates when a later group upsert fails', async () => {
    mocks.runtime.reset({
      groups: [
        {
          id: 1,
          userId: USER_ID,
          name: 'Alpha',
          sortOrder: 1,
          icon: 'rss',
          color: '#111111',
        },
      ],
    });
    mocks.runtime.hooks['userRSSGroup.upsert.after'] = ({ record }: any) => {
      if (record.name === 'Beta') {
        throw new Error('simulated group failure');
      }
    };

    const res = createResponse();

    await ConfigController.batchUpsertGroups(
      createRequest([
        { name: 'Alpha', sortOrder: 99, icon: 'star', color: '#ffffff' },
        { name: 'Beta', sortOrder: 2, icon: 'bolt', color: '#222222' },
      ]),
      res
    );

    const snapshot = mocks.runtime.snapshot();

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.payload).toEqual({
      success: false,
      message: 'Failed to batch upsert groups',
    });
    expect(snapshot.groups).toEqual([
      {
        id: 1,
        userId: USER_ID,
        name: 'Alpha',
        sortOrder: 1,
        icon: 'rss',
        color: '#111111',
      },
    ]);
  });
});
