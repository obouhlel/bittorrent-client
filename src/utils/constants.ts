// Network and buffer constants
export const MAX_BUFFER_SIZE = 1024 * 1024;
export const CONNECTION_TIMEOUT = 10000;

// BitTorrent protocol constants
export const PROTOCOL_NAME = 'BitTorrent protocol';
export const PROTOCOL_NAME_LENGTH = 19;
export const HANDSHAKE_SIZE = 68;
export const INFO_HASH_SIZE = 20;
export const PEER_ID_SIZE = 20;
export const RESERVED_BYTES_SIZE = 8;

// Message constants
export const MESSAGE_LENGTH_SIZE = 4;
export const MESSAGE_ID_SIZE = 1;
export const PIECE_INDEX_SIZE = 4;
export const PIECE_OFFSET_SIZE = 4;
export const PIECE_LENGTH_SIZE = 4;

// Default values
export const DEFAULT_PIECE_SIZE = 16384;
export const MAX_PENDING_REQUESTS = 10;

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  HANDSHAKE_SENT = 'handshake_sent',
  HANDSHAKE_RECEIVED = 'handshake_received',
  CONNECTED = 'connected',
  ERROR = 'error',
}
