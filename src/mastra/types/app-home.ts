import { z } from 'zod';

type Block = Record<string, unknown>;

export interface HomeSection {
  fixed: Block[];
  overflow?: (dropped: number) => Block;
  rows?: Block[][];
  trailing?: Block[];
}

export type PublishHome = (userId: string) => Promise<void>;

export const viewActionSchema = z.object({
  view: z.object({
    hash: z.string().optional(),
    id: z.string(),
    state: z
      .object({
        values: z.record(
          z.string(),
          z.record(
            z.string(),
            z.looseObject({
              selected_option: z.object({ value: z.string() }).nullish(),
            })
          )
        ),
      })
      .optional(),
  }),
});

export type ViewTarget = z.infer<typeof viewActionSchema>['view'];
