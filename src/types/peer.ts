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

export interface PieceInfo {
  index: number;
  length: number;
  completed: boolean;
  downloading: boolean;
  blocks: Map<number, Buffer>;
  downloadStartTime?: number; // Timestamp pour détecter les pièces bloquées
}

export type MessageHandlerFunction = (payload: Buffer) => void;

export interface ParsedHaveMessage {
  pieceIndex: number;
}

export interface ParsedRequestMessage {
  index: number;
  begin: number;
  length: number;
}

export interface ParsedPieceMessage {
  index: number;
  begin: number;
  block: Buffer;
}

export interface ParsedPortMessage {
  port: number;
}

export interface ParsedBitfieldMessage {
  bitfield: Buffer;
}

export type ParsedMessagePayload =
  | ParsedHaveMessage
  | ParsedRequestMessage
  | ParsedPieceMessage
  | ParsedPortMessage
  | ParsedBitfieldMessage
  | null;
