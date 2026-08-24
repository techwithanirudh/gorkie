import { sql } from 'kysely';
import { db } from '../client';

export type { UserBansTable } from '../../types/bans';

export async function createUserBansTable(): Promise<void> {
  await db.schema
    .createTable('user_bans')
    .ifNotExists()
    .addColumn('user_id', 'text', (col) => col.primaryKey())
    .addColumn('banned_by', 'text', (col) => col.notNull())
    .addColumn('reason', 'text')
    .addColumn('banned_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();
}
