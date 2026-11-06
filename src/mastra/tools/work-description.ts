import { z } from 'zod';
import { workDescriptionSchema } from '../types/progress';

export function describeWorkSchema(input: unknown) {
  let schema = input;
  if (!(schema instanceof z.ZodObject)) {
    const parsed = z
      .object({ jsonSchema: z.looseObject({ type: z.literal('object') }) })
      .parse(input);
    schema = z.fromJSONSchema(parsed.jsonSchema);
  }
  if (!(schema instanceof z.ZodObject)) {
    throw new Error('Described work tools must expose an object input schema.');
  }
  return schema.extend({ description: workDescriptionSchema });
}
