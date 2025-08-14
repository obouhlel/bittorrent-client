import {
  HANDSHAKE_SIZE,
  PROTOCOL_NAME,
  PROTOCOL_NAME_LENGTH,
  RESERVED_BYTES_SIZE,
  INFO_HASH_SIZE,
  PEER_ID_SIZE,
} from '~/utils/system/constants';

export function buildHandshake(infoHash: Buffer, peerId: Buffer | undefined): Buffer {
  if (!infoHash) {
    throw new Error('infoHash is required for handshake');
  }

  if (infoHash.length !== INFO_HASH_SIZE) {
    throw new Error(`infoHash must be ${INFO_HASH_SIZE} bytes, got ${infoHash.length}`);
  }

  if (peerId && peerId.length !== PEER_ID_SIZE) {
    throw new Error(`peerId must be ${PEER_ID_SIZE} bytes, got ${peerId.length}`);
  }

  const buffer = Buffer.allocUnsafe(HANDSHAKE_SIZE);
  let offset = 0;

  buffer.writeUInt8(PROTOCOL_NAME_LENGTH, offset++);
  buffer.write(PROTOCOL_NAME, offset, PROTOCOL_NAME_LENGTH, 'ascii');
  offset += PROTOCOL_NAME_LENGTH;
  buffer.fill(0, offset, offset + RESERVED_BYTES_SIZE);
  offset += RESERVED_BYTES_SIZE;
  infoHash.copy(buffer, offset);
  offset += INFO_HASH_SIZE;

  if (peerId) {
    peerId.copy(buffer, offset);
  } else {
    const defaultPeerId = Buffer.from('-BT0001-' + Date.now().toString().slice(-12));
    defaultPeerId.copy(buffer, offset, 0, PEER_ID_SIZE);
  }

  return buffer;
}

export function parseHandshake(buffer: Buffer): { infoHash: Buffer; peerId: Buffer } | null {
  if (buffer.length < HANDSHAKE_SIZE) return null;

  const protocolLength = buffer.readUInt8(0);
  if (protocolLength !== PROTOCOL_NAME_LENGTH) return null;

  const protocol = buffer.subarray(1, 1 + PROTOCOL_NAME_LENGTH).toString('ascii');
  if (protocol !== PROTOCOL_NAME) return null;

  const infoHashStart = 1 + PROTOCOL_NAME_LENGTH + RESERVED_BYTES_SIZE;
  const peerIdStart = infoHashStart + INFO_HASH_SIZE;

  return {
    infoHash: buffer.subarray(infoHashStart, infoHashStart + INFO_HASH_SIZE),
    peerId: buffer.subarray(peerIdStart, peerIdStart + PEER_ID_SIZE),
  };
}
