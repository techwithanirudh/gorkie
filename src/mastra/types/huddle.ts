export interface ChimeJoinInfo {
  attendee: { AttendeeId: string; JoinToken: string };
  meeting: {
    MediaPlacement: { AudioHostUrl: string; SignalingUrl: string };
  };
}

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
  | { type: 'ended'; callId: string }
  | { type: 'member-left'; callId: string; userId: string };

export interface TurnCredentials {
  password: string;
  uris: string[];
  username: string;
}

export interface SignalFrame {
  audio_metadata?: {
    attendee_states?: { audio_stream_id: number; volume?: number }[];
  };
  audio_status?: { audio_status?: number };
  audio_stream_id_info?: {
    streams?: {
      audio_stream_id: number;
      attendee_id?: string;
      external_user_id?: string;
      muted?: boolean;
    }[];
  };
  error?: { description?: string; status?: number };
  joinack?: { turn_credentials?: TurnCredentials };
  ping_pong?: { ping_id?: number; type?: string };
  suback?: { duplex?: string; sdp_answer?: string };
  type: string;
}

export type TurnEvent =
  | { type: 'start' }
  | { type: 'eager'; transcript: string }
  | { type: 'resumed' }
  | { type: 'end'; transcript: string };

export type VoiceMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

export type HuddleAgentKey = 'research' | 'explore';
