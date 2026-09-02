import { getTableName } from 'drizzle-orm';

export type MockRow = Record<string, unknown>;

export function createAwaitable<T>(value: T) {
  const p = Promise.resolve(value) as Promise<T> & Record<string, unknown>;
  p.where = () => p;
  p.orderBy = () => p;
  p.limit = () => p;
  p.offset = () => p;
  p.returning = () => p;
  p.groupBy = () => p;
  p.leftJoin = () => p;
  return p;
}

export function createMockDb(state: {
  rows?: MockRow[];
  selectQueue?: MockRow[][];
  inserted?: MockRow[];
  deletedTables?: string[];
  accounts?: MockRow[];
  memberships?: MockRow[];
  joinConditions?: unknown[];
}) {
  const getRows = () => state.rows ?? [];
  const getTableNameSafe = (table: unknown) => {
    try {
      return getTableName(table as never);
    } catch {
      return '';
    }
  };

  const makeTx = () => ({
    select: () => ({
      from: (table?: unknown) => {
        const rows =
          getTableNameSafe(table) === 'group_members' && state.memberships
            ? state.memberships
            : getRows();
        const p = createAwaitable(rows.length ? [rows[0]] : []);
        p.where = () => p;
        p.orderBy = () => p;
        p.limit = () => p;
        return p;
      },
    }),
    insert: (_table?: unknown) => ({
      values: (v: MockRow) => {
        const row = { createdAt: new Date(), updatedAt: new Date(), ...v };
        if (state.inserted) state.inserted.push(v);
        if (state.rows) state.rows.push(row);
        return createAwaitable([row]);
      },
    }),
    update: (_table?: unknown) => ({
      set: (fields: MockRow) => ({
        where: () => {
          const target = getRows()[0];
          if (target) Object.assign(target, fields);
          return createAwaitable([target]);
        },
      }),
    }),
    delete: (table: any) => {
      let name = 'unknown';
      try {
        name = getTableName(table) || 'unknown';
      } catch {
        name = typeof table?._?.name === 'string' ? table._.name : 'unknown';
      }
      if (state.deletedTables) state.deletedTables.push(name);
      return {
        where: async () => {
          if (state.rows) state.rows.length = 0;
          return createAwaitable([]);
        },
      };
    },
  });

  return {
    select: () => ({
      from: (table?: unknown) => {
        const result =
          getTableNameSafe(table) === 'group_members' && state.memberships
            ? state.memberships
            : (state.accounts ??
              (state.selectQueue ? (state.selectQueue.shift() ?? []) : getRows()));
        const p = createAwaitable(result);
        p.where = () => p;
        p.orderBy = () => p;
        p.limit = () => p;
        if (state.joinConditions) {
          p.leftJoin = (_table: unknown, condition: unknown) => {
            state.joinConditions?.push(condition);
            return p;
          };
        }
        return p;
      },
    }),
    insert: (_table?: unknown) => makeTx().insert(),
    update: (_table?: unknown) => makeTx().update(),
    delete: (table: any) => makeTx().delete(table),
    transaction: async <T>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) => fn(makeTx()),
  };
}
