import type { PeerMessage, PeerConnectionInfo, MessageHandlerFunction } from '~/types';
import { MessageType } from '~/types/peer-messages';
import { parseBitfield } from '~/utils/protocol/bitfield';
import { log } from '~/utils/system/logging';

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
    log('debug', `Received message type ${message.type} from ${key}`);
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

    if (peerInfo.pieceManager && peerInfo.pieces) {
      this.startRequestingPieces(key, peerInfo);
    }
  }

  private handleInterested(key: string, peerInfo: PeerConnectionInfo, _message: PeerMessage): void {
    peerInfo.peerInterested = true;
    log('debug', `Peer ${key} is interested`);

    if (!peerInfo.amChoking) {
      this.sendUnchokeMessage(peerInfo);
    }
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

  private handleRequest(key: string, peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.REQUEST && 'payload' in message) {
      const { index, begin, length } = message.payload;
      log('debug', `Peer ${key} requested piece ${index} (offset: ${begin}, length: ${length})`);

      if (peerInfo.pieceManager && peerInfo.pieceManager.hasPiece(index) && !peerInfo.amChoking) {
        this.sendPieceData(peerInfo, index, begin, length);
      }
    }
  }

  private async handlePiece(
    key: string,
    peerInfo: PeerConnectionInfo,
    message: PeerMessage
  ): Promise<void> {
    if (message.type === MessageType.PIECE && 'payload' in message) {
      const { index, begin, block } = message.payload;
      log('debug', `Received piece ${index} from ${key} (offset: ${begin}, size: ${block.length})`);

      if (peerInfo.pieceManager) {
        const success = await peerInfo.pieceManager.receiveBlock(index, begin, block, key);
        if (success) {
          this.continueRequestingPieces(key, peerInfo);
        } else {
          log('warn', `Failed to store piece ${index} block from ${key}`);
        }
      }
    }
  }

  private handleCancel(key: string, _peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.CANCEL && 'payload' in message) {
      const { index, begin, length } = message.payload;
      log(
        'debug',
        `Peer ${key} cancelled request for piece ${index} (offset: ${begin}, length: ${length})`
      );
    }
  }

  private handlePort(key: string, _peerInfo: PeerConnectionInfo, message: PeerMessage): void {
    if (message.type === MessageType.PORT && 'payload' in message) {
      const port = message.payload.port;
      log('debug', `Peer ${key} DHT port: ${port}`);
    }
  }

  private startRequestingPieces(key: string, peerInfo: PeerConnectionInfo): void {
    if (!peerInfo.pieceManager || !peerInfo.pieces) return;

    const pieceIndex = peerInfo.pieceManager.getNextPieceToRequest(peerInfo.pieces);
    if (pieceIndex !== null) {
      const block = peerInfo.pieceManager.getNextBlockToRequest(pieceIndex);
      if (block) {
        this.requestBlock(peerInfo, block.index, block.begin, block.length, key);
      }
    }
  }

  private continueRequestingPieces(key: string, peerInfo: PeerConnectionInfo): void {
    if (!peerInfo.peerChoking) {
      this.startRequestingPieces(key, peerInfo);
    }
  }

  private requestBlock(
    peerInfo: PeerConnectionInfo,
    index: number,
    begin: number,
    length: number,
    peerId: string
  ): void {
    if (peerInfo.pieceManager?.requestBlock(index, begin, length, peerId)) {
      log('debug', `Requesting block: piece ${index}, begin ${begin}, length ${length}`);
    }
  }

  private sendPieceData(
    peerInfo: PeerConnectionInfo,
    index: number,
    begin: number,
    _length: number
  ): void {
    const pieceInfo = peerInfo.pieceManager?.getPieceInfo(index);
    if (!pieceInfo) return;

    const block = pieceInfo.blocks.find((b) => b.begin === begin && b.data);
    if (block?.data) {
      log('debug', `Sending piece ${index} block to peer`);
    }
  }

  private sendUnchokeMessage(peerInfo: PeerConnectionInfo): void {
    peerInfo.amChoking = false;
    log('debug', 'Sent unchoke message');
  }

  sendInterestedMessage(peerInfo: PeerConnectionInfo): void {
    peerInfo.amInterested = true;
    log('debug', 'Sent interested message');
  }
}
