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
  const packet = Buffer.alloc(12 + payload.length);
  packet[0] = 0x80;
  packet[1] = payloadType;
  packet.writeUInt16BE(sequence & 0xff_ff, 2);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeUInt32BE(ssrc >>> 0, 8);
  packet.set(payload, 12);
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

// RFC 3550 framing: fixed header, CSRCs, an optional extension, and padding.
export function rtpPayload({
  packet,
  payloadType,
}: {
  packet: Buffer;
  payloadType: number;
}) {
  if (
    packet.length < 12 ||
    packet[0] === undefined ||
    packet[1] === undefined
  ) {
    return;
  }
  const type = packet[1] & 0x7f;
  if (packet[0] >> 6 !== 2 || type !== payloadType) {
    return;
  }
  let offset = 12 + (packet[0] & 0x0f) * 4;
  if (packet[0] & 0x10) {
    if (packet.length < offset + 4) {
      return;
    }
    offset += 4 + packet.readUInt16BE(offset + 2) * 4;
  }
  const padding = packet[0] & 0x20 ? (packet.at(-1) ?? 0) : 0;
  const end = packet.length - padding;
  if (offset >= end) {
    return;
  }
  return {
    sequence: packet.readUInt16BE(2),
    payload: packet.subarray(offset, end),
  };
}
