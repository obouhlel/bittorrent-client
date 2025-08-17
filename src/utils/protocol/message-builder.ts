import { MessageType } from '~/types';
import {
  PROTOCOL_NAME,
  PROTOCOL_NAME_LENGTH,
  HANDSHAKE_SIZE,
  INFO_HASH_SIZE,
  RESERVED_BYTES_SIZE,
} from '~/config';

export function buildHandshake(infoHash: Uint8Array, peerId: Uint8Array): Uint8Array {
  const message = new Uint8Array(HANDSHAKE_SIZE);
  let offset = 0;

  message[offset++] = PROTOCOL_NAME_LENGTH;
  const encoder = new TextEncoder();
  const pstrBytes = encoder.encode(PROTOCOL_NAME);
  message.set(pstrBytes, offset);
  offset += PROTOCOL_NAME_LENGTH;
  offset += RESERVED_BYTES_SIZE;
  message.set(infoHash, offset);
  offset += INFO_HASH_SIZE;
  message.set(peerId, offset);

  return message;
}

export function buildKeepAlive(): Uint8Array {
  return new Uint8Array(4);
}

export function buildChoke(): Uint8Array {
  return buildMessage(MessageType.CHOKE);
}

export function buildUnchoke(): Uint8Array {
  return buildMessage(MessageType.UNCHOKE);
}

export function buildInterested(): Uint8Array {
  return buildMessage(MessageType.INTERESTED);
}

export function buildNotInterested(): Uint8Array {
  return buildMessage(MessageType.NOT_INTERESTED);
}

export function buildHave(pieceIndex: number): Uint8Array {
  const payload = new Uint8Array(4);
  const view = new DataView(payload.buffer);
  view.setUint32(0, pieceIndex, false);
  return buildMessage(MessageType.HAVE, payload);
}

export function buildBitfield(bitfield: Uint8Array): Uint8Array {
  return buildMessage(MessageType.BITFIELD, bitfield);
}

export function buildRequest(index: number, begin: number, length: number): Uint8Array {
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setUint32(0, index, false);
  view.setUint32(4, begin, false);
  view.setUint32(8, length, false);
  return buildMessage(MessageType.REQUEST, payload);
}

export function buildPiece(index: number, begin: number, block: Uint8Array): Uint8Array {
  const payload = new Uint8Array(8 + block.length);
  const view = new DataView(payload.buffer);
  view.setUint32(0, index, false);
  view.setUint32(4, begin, false);
  payload.set(block, 8);
  return buildMessage(MessageType.PIECE, payload);
}

export function buildCancel(index: number, begin: number, length: number): Uint8Array {
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setUint32(0, index, false);
  view.setUint32(4, begin, false);
  view.setUint32(8, length, false);
  return buildMessage(MessageType.CANCEL, payload);
}

export function buildPort(port: number): Uint8Array {
  const payload = new Uint8Array(2);
  const view = new DataView(payload.buffer);
  view.setUint16(0, port, false);
  return buildMessage(MessageType.PORT, payload);
}

function buildMessage(type: MessageType, payload?: Uint8Array): Uint8Array {
  const payloadLength = payload ? payload.length : 0;
  const message = new Uint8Array(5 + payloadLength);
  const view = new DataView(message.buffer);

  view.setUint32(0, 1 + payloadLength, false);
  message[4] = type;

  if (payload) {
    message.set(payload, 5);
  }

  return message;
}
