import type { SlackBlock } from '@chat-adapter/slack/blocks';
import { z } from 'zod';

export interface HomeSection {
  fixed: SlackBlock[];
  overflow?: (dropped: number) => SlackBlock;
  rows?: SlackBlock[][];
  trailing?: SlackBlock[];
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
