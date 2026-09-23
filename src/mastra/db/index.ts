import { join } from 'node:path';
import { and, eq, isNotNull, notLike } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';
import { encryptedPrefix, encryptSecret } from '../lib/crypto';
import { db } from './client';
import { mcpServers } from './schema';

export { postgresStore } from './client';

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: join(env.PROJECT_ROOT, 'drizzle'),
  });

  // Rows written before MCP tokens were encrypted at rest still hold plaintext.
  const plaintext = await db
    .select({
      name: mcpServers.name,
      token: mcpServers.token,
      userId: mcpServers.userId,
    })
    .from(mcpServers)
    .where(
      and(
        isNotNull(mcpServers.token),
        notLike(mcpServers.token, `${encryptedPrefix}%`)
      )
    );
  await Promise.all(
    plaintext.map(({ name, token, userId }) =>
      token
        ? db
            .update(mcpServers)
            .set({ token: encryptSecret(token) })
            .where(
              and(eq(mcpServers.userId, userId), eq(mcpServers.name, name))
            )
        : undefined
    )
  );
}
