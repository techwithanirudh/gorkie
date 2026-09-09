import { type ColumnType, sql } from 'kysely';
import { db } from '../client';

export interface UserSettingsTable {
  github_permission: ColumnType<string | null, string | null, string | null>;
  github_threads: ColumnType<boolean | null, boolean | null, boolean | null>;
  instructions: ColumnType<string | null, string | null, string | null>;
  updated_at: ColumnType<Date, Date, Date>;
  user_id: string;
}

export async function createUserSettingsTable(): Promise<void> {
  await db.schema
    .createTable('user_settings')
    .ifNotExists()
    .addColumn('user_id', 'text', (col) => col.primaryKey())
    .addColumn('instructions', 'text')
    .addColumn('github_permission', 'text')
    .addColumn('github_threads', 'boolean')
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await sql`
    alter table user_settings
      add column if not exists instructions text,
      add column if not exists github_permission text,
      add column if not exists github_threads boolean
  `.execute(db);
}
