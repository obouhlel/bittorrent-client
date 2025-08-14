import { log } from '~/utils/system/logging';
import { MessageType } from '~/types';
import type { MessageHandlerFunction } from '~/types';
import { parseMessagePayload } from '~/utils/protocol/message';

export class MessageHandlerService {
  private peerInfo: string;
  private isChoked = true;
  private isInterested = false;
  private _peerChoked = true;
  private _peerInterested = false;
  private handlers: Map<MessageType, MessageHandlerFunction>;
  onBitfield?: (bitfield: Buffer) => void;
  onUnchoke?: () => void;
  onPiece?: (index: number, offset: number, data: Buffer) => void;

  constructor(ip: string, port: number) {
    this.peerInfo = `${ip}:${port}`;
    this.handlers = new Map([
      [MessageType.CHOKE, () => this.handleChoke()],
      [MessageType.UNCHOKE, () => this.handleUnchoke()],
      [MessageType.INTERESTED, () => this.handleInterested()],
      [MessageType.NOT_INTERESTED, () => this.handleNotInterested()],
      [MessageType.HAVE, (payload: Buffer) => this.handleHave(payload)],
      [MessageType.BITFIELD, (payload: Buffer) => this.handleBitfield(payload)],
      [MessageType.REQUEST, (payload: Buffer) => this.handleRequest(payload)],
      [MessageType.PIECE, (payload: Buffer) => this.handlePiece(payload)],
      [MessageType.CANCEL, (payload: Buffer) => this.handleCancel(payload)],
      [MessageType.PORT, (payload: Buffer) => this.handlePort(payload)],
    ]);
  }

  handleMessage(messageId: number, payload: Buffer): void {
    const handler = this.handlers.get(messageId as MessageType);
    if (handler) {
      handler(payload);
    } else {
      log('warn', `Unknown message type ${messageId} from ${this.peerInfo}`);
    }
  }

  private handleChoke(): void {
    this.isChoked = true;
  }

  private handleUnchoke(): void {
    this.isChoked = false;
    this.onUnchoke?.();
  }

  private handleInterested(): void {
    this._peerInterested = true;
  }

  private handleNotInterested(): void {
    this._peerInterested = false;
  }

  private handleHave(payload: Buffer): void {
    parseMessagePayload(MessageType.HAVE, payload);
  }

  private handleBitfield(payload: Buffer): void {
    this.onBitfield?.(payload);
  }

  private handleRequest(payload: Buffer): void {
    parseMessagePayload(MessageType.REQUEST, payload);
  }

  private handlePiece(payload: Buffer): void {
    const parsed = parseMessagePayload(MessageType.PIECE, payload);
    if (parsed && 'index' in parsed && 'begin' in parsed && 'block' in parsed) {
      this.onPiece?.(parsed.index, parsed.begin, parsed.block);
    }
  }

  private handleCancel(payload: Buffer): void {
    parseMessagePayload(MessageType.CANCEL, payload);
  }

  private handlePort(payload: Buffer): void {
    parseMessagePayload(MessageType.PORT, payload);
  }

  get chokedStatus(): boolean {
    return this.isChoked;
  }

  get interestedStatus(): boolean {
    return this.isInterested;
  }

  get peerChokedStatus(): boolean {
    return this._peerChoked;
  }

  get peerInterestedStatus(): boolean {
    return this._peerInterested;
  }
}
