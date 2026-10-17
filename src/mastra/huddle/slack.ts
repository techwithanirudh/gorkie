import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';
import { z } from 'zod';
import { logger } from '../lib/logger';
import {
  type ChimeJoinInfo,
  chimeJoinSchema,
  type HuddleEvent,
  type HuddleSlackOptions,
  type JoinedHuddle,
} from '../types';

const okSchema = z.looseObject({
  ok: z.boolean(),
  error: z.string().optional(),
});

const authSchema = okSchema.extend({
  team_id: z.string().optional(),
  user_id: z.string().optional(),
});

const joinSchema = z.looseObject({
  call: z.looseObject({ call_id: z.string(), free_willy: chimeJoinSchema }),
  canvas: z.looseObject({
    thread_channel_id: z.string(),
    root_thread_ts: z.string(),
  }),
});

const roomInfoSchema = z.looseObject({
  room: z.looseObject({
    id: z.string(),
    thread_root_ts: z.string().optional(),
    canvas_thread_ts: z.string().optional(),
  }),
});

const realtimeSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('huddle_invite'),
    channel_id: z.string(),
    call_id: z.string(),
    sender_user_id: z.string(),
    free_willy: chimeJoinSchema.optional(),
  }),
  z.looseObject({
    type: z.literal('sh_room_leave'),
    user: z.string(),
    call_id: z.string().optional(),
    room: z.looseObject({ id: z.string().optional() }).optional(),
  }),
  z.looseObject({
    type: z.literal('sh_room_update'),
    huddle: z
      .looseObject({
        id: z.string().optional(),
        has_ended: z.boolean().optional(),
        date_end: z.number().optional(),
      })
      .optional(),
    room: z.looseObject({ call_id: z.string().optional() }).optional(),
  }),
  z.looseObject({ type: z.literal('reconnect_url'), url: z.string() }),
  z.looseObject({ type: z.literal('hello') }),
]);

function toEvent(
  message: z.infer<typeof realtimeSchema>
): HuddleEvent | undefined {
  if (message.type === 'huddle_invite') {
    return {
      type: 'invited',
      callId: message.call_id,
      channelId: message.channel_id,
      inviterId: message.sender_user_id,
      chime: message.free_willy,
    };
  }
  if (message.type === 'sh_room_leave') {
    const callId = message.call_id ?? message.room?.id;
    return callId
      ? { type: 'member-left', callId, userId: message.user }
      : undefined;
  }
  if (message.type === 'sh_room_update') {
    const callId = message.room?.call_id ?? message.huddle?.id;
    const ended = message.huddle?.has_ended || message.huddle?.date_end;
    return callId && ended ? { type: 'ended', callId } : undefined;
  }
}

// Slack's own desktop client is the only thing that can join a huddle, so
// this speaks its private API as a dedicated user.
// Ported from HuddleFM's `slack-huddle.ts`.
export class HuddleSlack {
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectAttempts = 0;
  private reconnectUrl?: string;
  private readonly options: HuddleSlackOptions;
  userId?: string;

  constructor(options: HuddleSlackOptions) {
    this.options = options;
  }

  async start() {
    const auth = authSchema.parse(
      await this.post({ method: 'auth.test', fields: {} })
    );
    if (!(auth.ok && auth.team_id && auth.user_id)) {
      throw new Error(`huddle user auth failed: ${auth.error ?? 'unknown'}`);
    }
    this.userId = auth.user_id;
    await this.connect(auth.team_id);
  }

  async join(channelId: string): Promise<JoinedHuddle> {
    const raw = await this.post({
      method: 'rooms.join',
      fields: {
        channel_id: channelId,
        regions: this.options.mediaRegion,
        multidevice: 'true',
      },
    });
    const ok = okSchema.parse(raw);
    if (!ok.ok) {
      throw new Error(`rooms.join failed: ${ok.error ?? 'unknown'}`);
    }
    const { call, canvas } = joinSchema.parse(raw);
    return {
      callId: call.call_id,
      channelId: canvas.thread_channel_id,
      threadTs: canvas.root_thread_ts,
      chime: call.free_willy,
    };
  }

  async joinInvited({
    callId,
    channelId,
    chime,
  }: {
    callId: string;
    channelId: string;
    chime: ChimeJoinInfo;
  }): Promise<JoinedHuddle> {
    const raw = await this.post({
      method: 'screenhero.rooms.info',
      fields: { room: callId, _x_reason: 'all-calls-store/conditional-fetch' },
    });
    const { room } = roomInfoSchema.parse(raw);
    const threadTs = room.thread_root_ts ?? room.canvas_thread_ts;
    if (room.id !== callId || !threadTs) {
      throw new Error('screenhero.rooms.info returned the wrong huddle');
    }
    return { callId, channelId, threadTs, chime };
  }

  private async post({
    method,
    fields,
  }: {
    method: string;
    fields: Record<string, string>;
  }): Promise<unknown> {
    const body = new FormData();
    for (const [key, value] of Object.entries({
      token: this.options.xoxc,
      ...fields,
    })) {
      body.set(key, value);
    }
    const response = await fetch(
      new URL(`/api/${method}`, this.options.workspaceUrl),
      {
        method: 'POST',
        headers: { cookie: `d=${this.options.xoxd}` },
        body,
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      throw new Error(`${method} HTTP ${response.status}`);
    }
    return response.json();
  }

  private connect(teamId: string) {
    const url = this.reconnectUrl
      ? new URL(this.reconnectUrl)
      : this.gatewayUrl(teamId);
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers: { cookie: `d=${this.options.xoxd}` },
      });
      let ready = false;
      const handshake = setTimeout(() => {
        socket.terminate();
        reject(new Error('huddle realtime handshake timed out'));
      }, 15_000);
      socket.on('message', (raw) => {
        let data: unknown;
        try {
          data = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const parsed = realtimeSchema.safeParse(data);
        if (!parsed.success) {
          return;
        }
        const message = parsed.data;
        if (message.type === 'hello') {
          ready = true;
          clearTimeout(handshake);
          this.reconnectAttempts = 0;
          clearInterval(this.pingTimer);
          this.pingTimer = setInterval(
            () => socket.send(JSON.stringify({ type: 'ping', id: Date.now() })),
            5000
          );
          resolve();
          return;
        }
        if (message.type === 'reconnect_url') {
          this.reconnectUrl = message.url;
          return;
        }
        const huddleEvent = toEvent(message);
        if (huddleEvent) {
          this.options.onEvent(huddleEvent);
        }
      });
      socket.on('error', () => {
        if (!ready) {
          clearTimeout(handshake);
          reject(new Error('huddle realtime connection failed'));
        }
      });
      socket.on('close', () => {
        clearTimeout(handshake);
        clearInterval(this.pingTimer);
        if (!ready) {
          reject(new Error('huddle realtime socket closed before hello'));
          return;
        }
        this.reconnect(teamId).catch(() => undefined);
      });
    });
  }

  private async reconnect(teamId: string) {
    for (;;) {
      const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts++);
      logger.warn('[huddle] realtime socket closed, reconnecting', { delay });
      // biome-ignore lint/performance/noAwaitInLoops: reconnect attempts back off one after another
      await sleep(delay);
      try {
        await this.connect(teamId);
        return;
      } catch (error) {
        this.reconnectUrl = undefined;
        logger.warn('[huddle] realtime reconnect failed', { error });
      }
    }
  }

  private gatewayUrl(teamId: string) {
    const url = new URL('wss://wss-primary.slack.com/');
    url.search = new URLSearchParams({
      token: this.options.xoxc,
      sync_desync: '1',
      slack_client: 'desktop',
      start_args:
        '?agent=client&org_wide_aware=true&eac_cache_ts=true&cache_ts=0&name_tagging=true&only_self_subteams=true&connect_only=true&ms_latest=true',
      no_query_on_subscribe: '1',
      flannel: '3',
      lazy_channels: '1',
      gateway_server: `T${teamId.slice(1)}-1`,
      enterprise_id: teamId,
      batch_presence_aware: '1',
    }).toString();
    return url;
  }
}
