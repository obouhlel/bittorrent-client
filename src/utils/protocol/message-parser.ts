import type { PeerMessage, HandshakeMessage } from '~/types';
import { MessageType } from '~/types';
import { parseHandshake } from './handshake';

type MessageParser = (
  data: Uint8Array,
  view: DataView,
  messageLength: number
) => PeerMessage | null;

const parseChoke: MessageParser = () => ({ type: MessageType.CHOKE });
const parseUnchoke: MessageParser = () => ({ type: MessageType.UNCHOKE });
const parseInterested: MessageParser = () => ({ type: MessageType.INTERESTED });
const parseNotInterested: MessageParser = () => ({ type: MessageType.NOT_INTERESTED });

const parseHave: MessageParser = (_data, view, messageLength) => {
  if (messageLength < 5) return null;
  return {
    type: MessageType.HAVE,
    payload: {
      pieceIndex: view.getUint32(5, false),
    },
  };
};

const parseBitfield: MessageParser = (data, _view, messageLength) => ({
  type: MessageType.BITFIELD,
  payload: {
    bitfield: data.slice(5, 4 + messageLength),
  },
});

const parseRequest: MessageParser = (_data, view, messageLength) => {
  if (messageLength < 13) return null;
  return {
    type: MessageType.REQUEST,
    payload: {
      index: view.getUint32(5, false),
      begin: view.getUint32(9, false),
      length: view.getUint32(13, false),
    },
  };
};

const parsePiece: MessageParser = (data, view, messageLength) => {
  if (messageLength < 9) return null;
  return {
    type: MessageType.PIECE,
    payload: {
      index: view.getUint32(5, false),
      begin: view.getUint32(9, false),
      block: data.slice(13, 4 + messageLength),
    },
  };
};

const parseCancel: MessageParser = (_data, view, messageLength) => {
  if (messageLength < 13) return null;
  return {
    type: MessageType.CANCEL,
    payload: {
      index: view.getUint32(5, false),
      begin: view.getUint32(9, false),
      length: view.getUint32(13, false),
    },
  };
};

const parsePort: MessageParser = (_data, view, messageLength) => {
  if (messageLength < 3) return null;
  return {
    type: MessageType.PORT,
    payload: {
      port: view.getUint16(5, false),
    },
  };
};

const messageParsers = new Map<MessageType, MessageParser>([
  [MessageType.CHOKE, parseChoke],
  [MessageType.UNCHOKE, parseUnchoke],
  [MessageType.INTERESTED, parseInterested],
  [MessageType.NOT_INTERESTED, parseNotInterested],
  [MessageType.HAVE, parseHave],
  [MessageType.BITFIELD, parseBitfield],
  [MessageType.REQUEST, parseRequest],
  [MessageType.PIECE, parsePiece],
  [MessageType.CANCEL, parseCancel],
  [MessageType.PORT, parsePort],
]);

export function parseMessage(data: Uint8Array): PeerMessage | null {
  if (data.length < 4) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const messageLength = view.getUint32(0, false);

  if (messageLength === 0) {
    return null;
  }

  if (data.length < 4 + messageLength) {
    return null;
  }

  const messageType = data[4] as MessageType;
  const parser = messageParsers.get(messageType);

  if (!parser) {
    return null;
  }

  return parser(data, view, messageLength);
}

export function createMessageHandler(
  onHandshake: (handshake: HandshakeMessage) => void,
  onMessage: (message: PeerMessage) => void
) {
  let handshakeReceived = false;

  return (data: Uint8Array) => {
    if (!handshakeReceived) {
      const handshake = parseHandshake(data);
      if (handshake) {
        handshakeReceived = true;
        onHandshake(handshake);
      }
    } else {
      const message = parseMessage(data);
      if (message) {
        onMessage(message);
      }
    }
  };
}
