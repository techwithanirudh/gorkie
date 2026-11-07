import { z } from 'zod';
import { workDescriptionSchema } from '../types/progress';

export function describeWorkSchema(schema: unknown) {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error('Described work tools must expose an object input schema.');
  }
  return schema.extend({ description: workDescriptionSchema });
}
