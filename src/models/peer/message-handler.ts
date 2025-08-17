import type { PeerMessage, PeerConnectionInfo } from '~/types';
import { MessageType } from '~/types/peer-messages';
import { parseBitfield } from '~/utils/protocol/bitfield';
import { log } from '~/utils/system/logging';

type MessageHandlerFunction = (
  key: string,
  peerInfo: PeerConnectionInfo,
  message: PeerMessage
) => void;

export class MessageHandler {
  private handlers: Map<MessageType, MessageHandlerFunction>;

  constructor() {
    this.handlers = new Map([
      [MessageType.CHOKE, this.handleChoke.bind(this)],
      [MessageType.UNCHOKE, this.handleUnchoke.bind(this)],
      [MessageType.INTERESTED, this.handleInterested.bind(this)],
      [MessageType.NOT_INTERESTED, this.handleNotInterested.bind(this)],
      [MessageType.HAVE, this.handleHave.bind(this)],
      [MessageType.BITFIELD, this.handleBitfield.bind(this)],
      [MessageType.REQUEST, this.handleRequest.bind(this)],
      [MessageType.PIECE, this.handlePiece.bind(this)],
      [MessageType.CANCEL, this.handleCancel.bind(this)],
      [MessageType.PORT, this.handlePort.bind(this)],
    ]);
  }

  handleMessage(key: string, peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    const handler = this.handlers.get(message.type);
    if (handler) {
      handler(key, peerInfo, message);
    } else {
      log('debug', `Unknown message type ${message.type} from ${key}`);
    }
  }

  private handleChoke(key: string, peerInfo: PeerConnectionInfo, _message: PeerMessage): void {
    peerInfo.peerChoking = true;
    log('debug', `Peer ${key} choked us`);
  }

  private handleUnchoke(key: string, peerInfo: PeerConnectionInfo, _message: PeerMessage): void {
    peerInfo.peerChoking = false;
    log('debug', `Peer ${key} unchoked us`);
    // TODO: Start requesting pieces
  }

  private handleInterested(key: string, peerInfo: PeerConnectionInfo, _message: PeerMessage): void {
    peerInfo.peerInterested = true;
    log('debug', `Peer ${key} is interested`);
  }

  private handleNotInterested(
    key: string,
    peerInfo: PeerConnectionInfo,
    _message: PeerMessage
  ): void {
    peerInfo.peerInterested = false;
    log('debug', `Peer ${key} is not interested`);
  }

  private handleHave(key: string, peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.HAVE && 'payload' in message) {
      const pieceIndex = message.payload.pieceIndex;
      if (!peerInfo.pieces) {
        peerInfo.pieces = new Set();
      }
      peerInfo.pieces.add(pieceIndex);
      log('debug', `Peer ${key} has piece ${pieceIndex}`);
    }
  }

  private handleBitfield(key: string, peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.BITFIELD && 'payload' in message) {
      const bitfield = message.payload.bitfield;
      peerInfo.pieces = parseBitfield(bitfield);
      log('debug', `Peer ${key} sent bitfield with ${peerInfo.pieces.size} pieces`);
    }
  }

  private handleRequest(key: string, _peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.REQUEST && 'payload' in message) {
      const { index, begin, length } = message.payload;
      log('debug', `Peer ${key} requested piece ${index} (offset: ${begin}, length: ${length})`);
      // TODO: Send the requested piece if we have it and are not choking them
    }
  }

  private handlePiece(key: string, _peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.PIECE && 'payload' in message) {
      const { index, begin, block } = message.payload;
      log('debug', `Received piece ${index} from ${key} (offset: ${begin}, size: ${block.length})`);
      // TODO: Store the piece and verify it
    }
  }

  private handleCancel(key: string, _peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.CANCEL && 'payload' in message) {
      const { index, begin, length } = message.payload;
      log(
        'debug',
        `Peer ${key} cancelled request for piece ${index} (offset: ${begin}, length: ${length})`
      );
      // TODO: Cancel sending the piece if we were about to send it
    }
  }

  private handlePort(key: string, _peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.PORT && 'payload' in message) {
      const port = message.payload.port;
      log('debug', `Peer ${key} DHT port: ${port}`);
      // TODO: Use for DHT if implemented
    }
  }
}
