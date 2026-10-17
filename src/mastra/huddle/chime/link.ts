import { setTimeout as sleep } from 'node:timers/promises';
import { Audio, PeerConnection, type Track, Video } from 'node-datachannel';
import type {
  ChimeJoinInfo,
  ChimeLinkEvents,
  TurnCredentials,
} from '../../types';
import { rtpPacket, rtpPayload, senderReport } from './rtp';
import { ChimeSignaling } from './signaling';

// AUDIO_STATUS values after which reconnecting cannot help: joined from
// another device, disconnected, rejected, at capacity, ended, removed.
const terminalAudioStatus = new Set([301, 302, 403, 409, 410, 411]);

interface Connection {
  audio: Track;
  dead: boolean;
  open: boolean;
  opusPayloadType: number;
  peer: PeerConnection;
  reportTimer?: ReturnType<typeof setInterval>;
  signaling: ChimeSignaling;
  // node-datachannel closes a native track when its wrapper is garbage
  // collected, so every track stays referenced until the connection goes.
  tracks: Track[];
}

export const opusFrameSamples = (48_000 * 20) / 1000;

class TerminalError extends Error {}

function iceServers(turn: TurnCredentials) {
  return turn.uris.flatMap((uri) => {
    const match = uri.match(/^(turns?):([^:?]+):(\d+)(?:\?transport=(\w+))?/);
    if (!(match?.[1] && match[2] && match[3])) {
      return [];
    }
    const [, scheme, hostname, port, transport] = match;
    let relayType: 'TurnTls' | 'TurnTcp' | 'TurnUdp' = 'TurnUdp';
    if (scheme === 'turns') {
      relayType = 'TurnTls';
    } else if (transport === 'tcp') {
      relayType = 'TurnTcp';
    }
    return [
      {
        hostname,
        port: Number(port),
        username: turn.username,
        password: turn.password,
        relayType,
      },
    ];
  });
}

export class ChimeLink {
  readonly attendeeId: string;
  private readonly chime: ChimeJoinInfo;
  private readonly events: ChimeLinkEvents;
  private connection?: Connection;
  private phase: 'live' | 'reconnecting' = 'live';
  private readonly stop = new AbortController();
  private watchdog?: ReturnType<typeof setInterval>;
  private readonly audioSessionId = Math.floor(Math.random() * 2 ** 32);
  private readonly ssrc = Math.floor(Math.random() * 2 ** 31);
  private sequence = 0;
  private timestamp = 0;
  private packets = 0;
  private octets = 0;

  constructor(chime: ChimeJoinInfo, events: ChimeLinkEvents) {
    this.chime = chime;
    this.events = events;
    this.attendeeId = chime.attendee.AttendeeId;
  }

  async start() {
    this.connection = await this.connect();
    this.watchdog = setInterval(() => {
      const { connection } = this;
      // The server sends BITRATES every 4 s, so silence means a dead socket.
      if (
        connection?.open &&
        Date.now() - connection.signaling.lastInboundAt > 15_000
      ) {
        this.lost({ connection, reason: 'signaling went silent' });
      }
    }, 1000);
  }

  sendAudio(opus: Uint8Array) {
    const { connection, timestamp } = this;
    this.timestamp = (timestamp + opusFrameSamples) % 2 ** 32;
    const sequence = this.sequence++;
    if (!connection?.open) {
      return;
    }
    try {
      if (
        connection.audio.sendMessageBinary(
          rtpPacket({
            payloadType: connection.opusPayloadType,
            sequence,
            timestamp,
            ssrc: this.ssrc,
            payload: opus,
          })
        )
      ) {
        this.packets++;
        this.octets += opus.length;
      }
    } catch {
      // A track throws once ICE or DTLS is gone; the watchdog reconnects.
    }
  }

  async leave() {
    this.stop.abort();
    clearInterval(this.watchdog);
    const { connection } = this;
    this.connection = undefined;
    if (!connection) {
      return;
    }
    if (connection.signaling.send({ type: 'LEAVE', body: { leave: {} } })) {
      await connection.signaling
        .wait({ type: 'LEAVE_ACK', timeoutMs: 3000 })
        .catch(() => undefined);
    }
    this.teardown(connection);
  }

  private async connect(): Promise<Connection> {
    const signaling = new ChimeSignaling({
      signalingUrl: this.chime.meeting.MediaPlacement.SignalingUrl,
      joinToken: this.chime.attendee.JoinToken,
    });
    let connection: Connection | undefined;
    let terminal: TerminalError | undefined;
    // Listen before JOIN: Chime lists the attendees already present once,
    // right after it, and volumes are keyed by the stream ids that list sets.
    this.events.onJoining();
    signaling.onFrame((frame) => this.events.onFrame(frame));
    signaling.onFrame((frame) => {
      const status = frame.audio_status?.audio_status;
      if (status !== undefined && terminalAudioStatus.has(status)) {
        terminal ??= new TerminalError(`Chime audio status ${status}`);
      }
    });
    try {
      await signaling.connect();
      signaling.join(this.audioSessionId);
      const ack = await signaling.wait({ type: 'JOIN_ACK' });
      const turn = ack.joinack?.turn_credentials;
      if (!turn?.uris.length) {
        throw new Error('Chime JOIN_ACK carried no TURN servers');
      }
      await signaling
        .wait({ type: 'INDEX', timeoutMs: 5000 })
        .catch(() => undefined);
      connection = this.createPeer({ signaling, turn });
      await this.subscribe(connection);
      connection.open = true;
      this.watch(connection);
      return connection;
    } catch (error) {
      if (connection) {
        this.teardown(connection);
      } else {
        signaling.close();
      }
      if (signaling.closeCode === 4410) {
        throw new TerminalError('Chime meeting ended', { cause: error });
      }
      throw terminal ?? error;
    }
  }

  private createPeer({
    signaling,
    turn,
  }: {
    signaling: ChimeSignaling;
    turn: TurnCredentials;
  }): Connection {
    const peer = new PeerConnection('chime', {
      iceServers: iceServers(turn),
      iceTransportPolicy: 'relay',
    });
    const audio = new Audio('0', 'SendRecv');
    audio.addOpusCodec(
      111,
      'minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000'
    );
    audio.addSSRC(this.ssrc, 'gorkie', 'gorkie', 'audio');
    // Chime will not set the session up without a video m-line, so offer an
    // inactive one like amazon-chime-sdk-js does when the camera is off.
    const video = new Video('1', 'Inactive');
    video.addH264Codec(
      102,
      'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'
    );
    const audioTrack = peer.addTrack(audio);
    return {
      signaling,
      peer,
      audio: audioTrack,
      tracks: [audioTrack, peer.addTrack(video)],
      opusPayloadType: 111,
      open: false,
      dead: false,
    };
  }

  private async subscribe(connection: Connection) {
    const { peer, signaling } = connection;
    const gathered = new Promise<void>((resolve) =>
      peer.onGatheringStateChange((state) => {
        if (state === 'complete') {
          resolve();
        }
      })
    );
    const opened = new Promise<void>((resolve) => {
      connection.audio.onOpen(resolve);
      peer.onStateChange((state) => {
        if (state === 'connected') {
          resolve();
        }
      });
    });
    peer.setLocalDescription();
    // Chime takes the whole offer at once; there is no trickle ICE.
    await Promise.race([gathered, sleep(10_000)]);
    const description = peer.localDescription();
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the binding returns null when gathering produced no description
    if (!description?.sdp.includes('typ relay')) {
      throw new Error('No TURN relay candidate; Chime media is unreachable');
    }
    const offer = description.sdp;
    signaling.send({
      type: 'SUBSCRIBE',
      body: {
        sub: {
          duplex: 1,
          send_streams: [
            {
              media_type: 1,
              track_label: 'AmazonChimeExpressAudio',
              stream_id: 1,
              group_id: 1,
              framerate: 15,
              max_bitrate_kbps: 600,
              avg_bitrate_bps: 400_000,
              attendee_id: this.attendeeId,
            },
          ],
          receive_stream_ids: [0],
          // SDP.withUnifiedPlanFormat() in the JS SDK marks the offer this way.
          sdp_offer: offer.replace(/^o=\S+/m, 'o=mozilla-chrome'),
          audio_host: this.chime.meeting.MediaPlacement.AudioHostUrl,
          audio_checkin: false,
          audio_muted: false,
        },
      },
    });
    const ack = await signaling.wait({ type: 'SUBSCRIBE_ACK' });
    const answer = ack.suback?.sdp_answer;
    if (!answer) {
      throw new Error(
        `Chime refused SUBSCRIBE: ${ack.error?.status ?? 'no answer'} ${ack.error?.description ?? ''}`
      );
    }
    peer.setRemoteDescription(
      answer
        .split('\r\n')
        .filter((line) => !line.includes('typ srflx'))
        .join('\r\n'),
      'answer'
    );
    connection.opusPayloadType = Number(
      answer.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1] ?? 111
    );
    await Promise.race([
      opened,
      sleep(15_000).then(() => {
        throw new Error('Chime media did not connect within 15 s');
      }),
    ]);
  }

  private watch(connection: Connection) {
    const { signaling, peer, audio } = connection;
    audio.onMessage((packet) => {
      const rtp = rtpPayload({
        packet,
        payloadType: connection.opusPayloadType,
      });
      if (rtp) {
        this.events.onAudio(rtp.payload);
      }
    });
    signaling.onFrame((frame) => {
      const status = frame.audio_status?.audio_status;
      if (status === undefined || status === 200) {
        return;
      }
      if (terminalAudioStatus.has(status)) {
        this.terminal(`Chime audio status ${status}`);
        return;
      }
      this.lost({ connection, reason: `Chime audio status ${status}` });
    });
    signaling.onClose = (code) => {
      if (code === 4410) {
        this.terminal('Chime meeting ended');
        return;
      }
      this.lost({ connection, reason: `signaling closed ${code}` });
    };
    const onPeerState = (state: string) => {
      if (state === 'failed' || state === 'closed') {
        this.lost({ connection, reason: `peer ${state}` });
      }
    };
    peer.onIceStateChange(onPeerState);
    peer.onStateChange(onPeerState);
    signaling.startPings();
    connection.reportTimer = setInterval(() => {
      if (!connection.open) {
        return;
      }
      try {
        audio.sendMessageBinary(
          senderReport({
            ssrc: this.ssrc,
            rtpTimestamp: this.timestamp,
            packets: this.packets,
            octets: this.octets,
          })
        );
      } catch {
        // Same as sendAudio: the watchdog handles a dead transport.
      }
    }, 1000);
  }

  private teardown(connection: Connection) {
    connection.dead = true;
    connection.open = false;
    clearInterval(connection.reportTimer);
    connection.signaling.close();
    connection.peer.close();
  }

  private terminal(reason: string) {
    if (this.stop.signal.aborted) {
      return;
    }
    this.stop.abort();
    clearInterval(this.watchdog);
    if (this.connection) {
      this.teardown(this.connection);
    }
    this.connection = undefined;
    this.events.onTerminal(reason);
  }

  private lost({
    connection,
    reason,
  }: {
    connection: Connection;
    reason: string;
  }) {
    if (connection.dead) {
      return;
    }
    this.teardown(connection);
    if (this.connection === connection) {
      this.connection = undefined;
    }
    if (this.stop.signal.aborted || this.phase !== 'live') {
      return;
    }
    this.events.onWarn('chime connection lost', { reason });
    this.phase = 'reconnecting';
    this.reconnect().catch(() => undefined);
  }

  private async reconnect() {
    const startedAt = Date.now();
    for (let attempt = 1; !this.stop.signal.aborted; attempt++) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: reconnect attempts back off one after another
        const connection = await this.connect();
        if (this.stop.signal.aborted) {
          this.teardown(connection);
          return;
        }
        this.phase = 'live';
        this.connection = connection;
        return;
      } catch (error) {
        if (error instanceof TerminalError) {
          this.terminal(error.message);
          return;
        }
        this.events.onWarn('chime reconnect failed', { attempt, error });
        if (Date.now() - startedAt > 120_000) {
          this.terminal('Could not reconnect to Chime');
          return;
        }
        await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
}
