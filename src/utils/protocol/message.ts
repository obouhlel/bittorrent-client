import { MessageType } from '~/types';
import type { ParsedMessagePayload } from '~/types';
import { PIECE_INDEX_SIZE, PIECE_OFFSET_SIZE, PIECE_LENGTH_SIZE } from '~/utils/system/constants';

export function buildMessage(messageId: MessageType, payload?: Buffer): Buffer {
  const payloadLength = payload ? payload.length : 0;
  const messageLength = 1 + payloadLength;

  const buffer = Buffer.allocUnsafe(4 + messageLength);
  let offset = 0;

  buffer.writeUInt32BE(messageLength, offset);
  offset += 4;

  buffer.writeUInt8(messageId, offset);
  offset += 1;

  if (payload) {
    payload.copy(buffer, offset);
  }

  return buffer;
}

export function buildKeepAlive(): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32BE(0, 0);
  return buffer;
}

export function parseMessagePayload(messageId: MessageType, payload: Buffer): ParsedMessagePayload {
  switch (messageId) {
    case MessageType.HAVE:
      if (payload.length >= PIECE_INDEX_SIZE) {
        return { pieceIndex: payload.readUInt32BE(0) };
      }
      break;
    case MessageType.REQUEST:
    case MessageType.CANCEL:
      if (payload.length >= PIECE_INDEX_SIZE + PIECE_OFFSET_SIZE + PIECE_LENGTH_SIZE) {
        return {
          index: payload.readUInt32BE(0),
          begin: payload.readUInt32BE(PIECE_INDEX_SIZE),
          length: payload.readUInt32BE(PIECE_INDEX_SIZE + PIECE_OFFSET_SIZE),
        };
      }
      break;
    case MessageType.PIECE:
      if (payload.length >= PIECE_INDEX_SIZE + PIECE_OFFSET_SIZE) {
        return {
          index: payload.readUInt32BE(0),
          begin: payload.readUInt32BE(PIECE_INDEX_SIZE),
          block: payload.subarray(PIECE_INDEX_SIZE + PIECE_OFFSET_SIZE),
        };
      }
      break;
    case MessageType.PORT:
      if (payload.length >= 2) {
        return { port: payload.readUInt16BE(0) };
      }
      break;
    case MessageType.BITFIELD:
      return { bitfield: payload };
  }
  return null;
}
