import { rawId } from '../../lib/ids';
import { db } from '../client';

export async function getInstructions(
  userId: string
): Promise<string | undefined> {
  const row = await db
    .selectFrom('user_settings')
    .select('instructions')
    .where('user_id', '=', rawId(userId))
    .executeTakeFirst();
  return row?.instructions ?? undefined;
}

export async function setInstructions({
  userId,
  instructions,
}: {
  userId: string;
  instructions: string | undefined;
}): Promise<void> {
  const id = rawId(userId);
  const value = instructions ?? null;
  const now = new Date();
  await db
    .insertInto('user_settings')
    .values({ instructions: value, updated_at: now, user_id: id })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({ instructions: value, updated_at: now })
    )
    .execute();
}
