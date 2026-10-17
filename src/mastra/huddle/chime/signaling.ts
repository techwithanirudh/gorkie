import protobuf from 'protobufjs';
import { type SignalFrame, signalFrameSchema } from '../../types';
import { signalingProto } from './protocol';

const Frame = protobuf
  .parse(signalingProto, { keepCase: true })
  .root.lookupType('SdkSignalFrame');
const frameTypes = Frame.lookupEnum('Type').values;

type FrameType = keyof typeof frameTypes & string;

const signalFrameTypeByte = 0x05;
const hasStreamUpdateFlag = 2;

export class ChimeSignaling {
  private socket?: WebSocket;
  private readonly handlers = new Set<(frame: SignalFrame) => void>();
  private pingTimer?: ReturnType<typeof setInterval>;
  private pingId = 0;
  private state: 'open' | 'closed' = 'open';
  onClose?: (code: number) => void;
  closeCode: number | undefined;
  lastInboundAt = Date.now();
  private readonly options: { signalingUrl: string; joinToken: string };

  constructor(options: { signalingUrl: string; joinToken: string }) {
    this.options = options;
  }

  onFrame(handler: (frame: SignalFrame) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect() {
    const socket = new WebSocket(
      `${this.options.signalingUrl}?X-Chime-Control-Protocol-Version=3&X-Amzn-Chime-Send-Close-On-Error=1`,
      ['_aws_wt_session', this.options.joinToken]
    );
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out opening Chime signaling')),
        10_000
      );
      socket.onopen = () => {
        clearTimeout(timer);
        this.lastInboundAt = Date.now();
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Chime signaling connection failed'));
      };
      socket.onclose = (event) => {
        clearTimeout(timer);
        clearInterval(this.pingTimer);
        this.closeCode = event.code;
        if (this.state === 'closed') {
          return;
        }
        this.state = 'closed';
        this.onClose?.(event.code);
      };
      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.receive(new Uint8Array(event.data));
        }
      };
    });
  }

  private receive(bytes: Uint8Array) {
    this.lastInboundAt = Date.now();
    let decoded: unknown;
    // Newer servers send frame types this proto does not know; proto2 then
    // drops the required `type` and decode throws, so the frame is skipped
    // like the JS SDK does.
    try {
      decoded = Frame.toObject(Frame.decode(bytes.subarray(1)), {
        bytes: String,
        enums: String,
        longs: Number,
      });
    } catch {
      return;
    }
    const parsed = signalFrameSchema.safeParse(decoded);
    if (!parsed.success) {
      return;
    }
    const frame = parsed.data;
    if (frame.type === 'PING_PONG' && frame.ping_pong?.type === 'PING') {
      this.send({
        type: 'PING_PONG',
        body: { ping_pong: { type: 2, ping_id: frame.ping_pong.ping_id } },
      });
    }
    for (const handler of this.handlers) {
      handler(frame);
    }
  }

  send({
    type,
    body = {},
  }: {
    type: FrameType;
    body?: Record<string, unknown>;
  }) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    const encoded = Frame.encode(
      Frame.fromObject({
        timestamp_ms: Date.now(),
        type: frameTypes[type],
        ...body,
      })
    ).finish();
    const out = new Uint8Array(encoded.length + 1);
    out[0] = signalFrameTypeByte;
    out.set(encoded, 1);
    this.socket.send(out);
    return true;
  }

  // A frame carrying an error rejects unless it is the awaited type:
  // SUBSCRIBE_ACK reports view-only video (206) next to a usable answer.
  wait({ type, timeoutMs = 15_000 }: { type: string; timeoutMs?: number }) {
    return new Promise<SignalFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for Chime ${type}`));
      }, timeoutMs);
      const off = this.onFrame((frame) => {
        if (frame.type === type) {
          clearTimeout(timer);
          off();
          resolve(frame);
          return;
        }
        if (frame.error && frame.type !== 'PING_PONG') {
          clearTimeout(timer);
          off();
          reject(
            new Error(
              `Chime ${frame.type} error ${frame.error.status}: ${frame.error.description ?? ''}`
            )
          );
        }
      });
    });
  }

  join(audioSessionId: number) {
    this.send({
      type: 'JOIN',
      body: {
        join: {
          protocol_version: 2,
          flags: hasStreamUpdateFlag,
          client_details: {
            app_name: 'gorkie',
            app_version: '1',
            device_model: process.platform,
            device_make: process.arch,
            platform_name: 'Node',
            platform_version: process.version,
            client_source: 'amazon-chime-sdk-js',
            chime_sdk_version: '3.31.0',
          },
          audio_session_id: audioSessionId,
          wants_compressed_sdp: false,
        },
      },
    });
  }

  startPings() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(
      () =>
        this.send({
          type: 'PING_PONG',
          body: { ping_pong: { type: 1, ping_id: ++this.pingId } },
        }),
      10_000
    );
  }

  close() {
    this.state = 'closed';
    clearInterval(this.pingTimer);
    this.handlers.clear();
    this.socket?.close();
  }
}
