import { z } from 'zod';

export const storedJson = z.string().transform((raw, ctx) => {
  try {
    return JSON.parse(raw);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'not JSON' });
    return z.NEVER;
  }
});
