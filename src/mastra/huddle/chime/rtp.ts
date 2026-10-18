const fixedHeaderBytes = 12;
const csrcCountMask = 0x0f;
const extensionBit = 0x10;
const paddingBit = 0x20;

export function rtpPacket({
  payloadType,
  sequence,
  timestamp,
  ssrc,
  payload,
}: {
  payloadType: number;
  sequence: number;
  timestamp: number;
  ssrc: number;
  payload: Uint8Array;
}) {
  const packet = Buffer.alloc(fixedHeaderBytes + payload.length);
  packet[0] = 0x80;
  packet[1] = payloadType;
  packet.writeUInt16BE(sequence & 0xff_ff, 2);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeUInt32BE(ssrc >>> 0, 8);
  packet.set(payload, fixedHeaderBytes);
  return packet;
}

export function senderReport({
  ssrc,
  rtpTimestamp,
  packets,
  octets,
}: {
  ssrc: number;
  rtpTimestamp: number;
  packets: number;
  octets: number;
}) {
  const packet = Buffer.alloc(28);
  packet[0] = 0x80;
  packet[1] = 200;
  packet.writeUInt16BE(6, 2);
  packet.writeUInt32BE(ssrc >>> 0, 4);
  const ntp = Date.now() / 1000 + 2_208_988_800;
  packet.writeUInt32BE(Math.floor(ntp) >>> 0, 8);
  packet.writeUInt32BE(Math.floor((ntp % 1) * 2 ** 32) >>> 0, 12);
  packet.writeUInt32BE(rtpTimestamp >>> 0, 16);
  packet.writeUInt32BE(packets >>> 0, 20);
  packet.writeUInt32BE(octets >>> 0, 24);
  return packet;
}

export function rtpPayload({
  packet,
  payloadType,
}: {
  packet: Buffer;
  payloadType: number;
}) {
  if (
    packet.length < fixedHeaderBytes ||
    packet[0] === undefined ||
    packet[1] === undefined
  ) {
    return;
  }
  const type = packet[1] & 0x7f;
  if (packet[0] >> 6 !== 2 || type !== payloadType) {
    return;
  }
  let offset = fixedHeaderBytes + (packet[0] & csrcCountMask) * 4;
  if (packet[0] & extensionBit) {
    if (packet.length < offset + 4) {
      return;
    }
    offset += 4 + packet.readUInt16BE(offset + 2) * 4;
  }
  const padding = packet[0] & paddingBit ? (packet.at(-1) ?? 0) : 0;
  const end = packet.length - padding;
  if (offset >= end) {
    return;
  }
  return packet.subarray(offset, end);
}
