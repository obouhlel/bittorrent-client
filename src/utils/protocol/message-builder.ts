import { MessageType } from '@/types';
import { buildMessage, buildKeepAlive } from '@/utils/protocol/message';

export { buildMessage, buildKeepAlive };

export function buildChoke(): Buffer {
  return buildMessage(MessageType.CHOKE);
}

export function buildUnchoke(): Buffer {
  return buildMessage(MessageType.UNCHOKE);
}

export function buildInterested(): Buffer {
  return buildMessage(MessageType.INTERESTED);
}

export function buildNotInterested(): Buffer {
  return buildMessage(MessageType.NOT_INTERESTED);
}

export function buildHave(pieceIndex: number): Buffer {
  const payload = Buffer.allocUnsafe(4);
  payload.writeUInt32BE(pieceIndex, 0);
  return buildMessage(MessageType.HAVE, payload);
}

export function buildBitfield(bitfield: Buffer): Buffer {
  return buildMessage(MessageType.BITFIELD, bitfield);
}

export function buildRequest(index: number, begin: number, length: number): Buffer {
  const payload = Buffer.allocUnsafe(12);
  payload.writeUInt32BE(index, 0);
  payload.writeUInt32BE(begin, 4);
  payload.writeUInt32BE(length, 8);
  return buildMessage(MessageType.REQUEST, payload);
}

export function buildPiece(index: number, begin: number, block: Buffer): Buffer {
  const payload = Buffer.allocUnsafe(8 + block.length);
  payload.writeUInt32BE(index, 0);
  payload.writeUInt32BE(begin, 4);
  block.copy(payload, 8);
  return buildMessage(MessageType.PIECE, payload);
}

export function buildCancel(index: number, begin: number, length: number): Buffer {
  const payload = Buffer.allocUnsafe(12);
  payload.writeUInt32BE(index, 0);
  payload.writeUInt32BE(begin, 4);
  payload.writeUInt32BE(length, 8);
  return buildMessage(MessageType.CANCEL, payload);
}
