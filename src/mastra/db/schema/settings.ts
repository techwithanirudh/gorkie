import { type ColumnType, sql } from 'kysely';
import { db } from '../client';

export interface UserSettingsTable {
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
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();
}
