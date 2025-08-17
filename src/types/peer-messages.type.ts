import type { PeerConnectionInfo } from './peer-manager.type';

export type MessageHandlerFunction = (
  key: string,
  peerInfo: PeerConnectionInfo,
  message: PeerMessage
) => void;

export enum MessageType {
  CHOKE = 0,
  UNCHOKE = 1,
  INTERESTED = 2,
  NOT_INTERESTED = 3,
  HAVE = 4,
  BITFIELD = 5,
  REQUEST = 6,
  PIECE = 7,
  CANCEL = 8,
  PORT = 9,
}

export interface HandshakeMessage {
  pstrlen: number;
  pstr: string;
  reserved: Uint8Array;
  infoHash: Uint8Array;
  peerId: Uint8Array;
}

export interface HaveMessage {
  pieceIndex: number;
}

export interface BitfieldMessage {
  bitfield: Uint8Array;
}

export interface RequestMessage {
  index: number;
  begin: number;
  length: number;
}

export interface PieceMessage {
  index: number;
  begin: number;
  block: Uint8Array;
}

export interface CancelMessage {
  index: number;
  begin: number;
  length: number;
}

export interface PortMessage {
  port: number;
}

export type PeerMessage =
  | { type: MessageType.CHOKE }
  | { type: MessageType.UNCHOKE }
  | { type: MessageType.INTERESTED }
  | { type: MessageType.NOT_INTERESTED }
  | { type: MessageType.HAVE; payload: HaveMessage }
  | { type: MessageType.BITFIELD; payload: BitfieldMessage }
  | { type: MessageType.REQUEST; payload: RequestMessage }
  | { type: MessageType.PIECE; payload: PieceMessage }
  | { type: MessageType.CANCEL; payload: CancelMessage }
  | { type: MessageType.PORT; payload: PortMessage };
