import { z } from 'zod';

export const chimeJoinSchema = z.object({
  meeting: z.looseObject({
    MediaPlacement: z.looseObject({
      AudioHostUrl: z.string(),
      SignalingUrl: z.string(),
    }),
  }),
  attendee: z.looseObject({
    AttendeeId: z.string(),
    JoinToken: z.string(),
  }),
});

export type ChimeJoinInfo = z.infer<typeof chimeJoinSchema>;

export interface JoinedHuddle {
  callId: string;
  channelId: string;
  chime: ChimeJoinInfo;
  threadTs: string;
}

export type HuddleEvent =
  | {
      type: 'invited';
      callId: string;
      channelId: string;
      inviterId: string;
      chime?: ChimeJoinInfo;
    }
  | { type: 'ended'; callId: string };

const turnCredentialsSchema = z.object({
  password: z.string(),
  uris: z.array(z.string()),
  username: z.string(),
});

export type TurnCredentials = z.infer<typeof turnCredentialsSchema>;

export const signalFrameSchema = z.looseObject({
  type: z.string(),
  error: z
    .object({
      description: z.string().optional(),
      status: z.number().optional(),
    })
    .optional(),
  joinack: z
    .object({ turn_credentials: turnCredentialsSchema.optional() })
    .optional(),
  suback: z.object({ sdp_answer: z.string().optional() }).optional(),
  audio_stream_id_info: z
    .object({
      streams: z
        .array(
          z.object({
            audio_stream_id: z.number(),
            attendee_id: z.string().optional(),
            external_user_id: z.string().optional(),
            muted: z.boolean().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  audio_metadata: z
    .object({
      attendee_states: z
        .array(
          z.object({
            audio_stream_id: z.number(),
            volume: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  audio_status: z.object({ audio_status: z.number().optional() }).optional(),
  ping_pong: z
    .object({ ping_id: z.number().optional(), type: z.string().optional() })
    .optional(),
});

export type SignalFrame = z.infer<typeof signalFrameSchema>;

export interface ChimeLinkOptions {
  chime: ChimeJoinInfo;
  onAudio: (opus: Buffer) => void;
  onFrame: (frame: SignalFrame) => void;
  onJoining: () => void;
  onTerminal: (reason: string) => void;
  onWarn: (event: string, fields: Record<string, unknown>) => void;
}

export interface HuddleSlackOptions {
  mediaRegion: string;
  onEvent: (event: HuddleEvent) => void;
  workspaceUrl: string;
  xoxc: string;
  xoxd: string;
}

export type TurnEvent =
  | { type: 'start' }
  | { type: 'update'; transcript: string }
  | { type: 'end'; transcript: string };

export interface LiveHuddle {
  channelId: string;
  end: (reason: string) => Promise<void>;
  hangUp: () => void;
  runningTasks: () => Promise<TaskStatus[]>;
  slackThreadId: string;
}

export const taskStatusSchema = z.object({
  agent: z.string(),
  brief: z.string(),
  runningSeconds: z.number(),
  toolCalls: z.number(),
  currentTool: z.string().optional(),
  latestText: z.string().optional(),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
