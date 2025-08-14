// Network and buffer constants
export const MAX_BUFFER_SIZE = 1024 * 1024;
export const CONNECTION_TIMEOUT = 30000;

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

// Download Manager constants
export const DEFAULT_MAX_CONNECTIONS = 50;
export const DEFAULT_CONNECT_TIMEOUT = 15000;
export const DEFAULT_RETRY_ATTEMPTS = 1;
export const DEFAULT_PROGRESS_INTERVAL = 3000;
export const SLEEP_INTERVAL = 2000;
export const MIN_ACTIVE_CONNECTIONS = 5;
export const RETRY_PEER_LIMIT = 5;
export const AUTO_RETRY_TIMEOUT = 60000;
export const MIN_CONNECTIONS_FOR_RETRY = 20;
export const ETA_INCREASE_THRESHOLD = 1.2;
export const ETA_INCREASE_COUNT_THRESHOLD = 2;
export const PROGRESS_LOG_INTERVAL = 10;
export const COMPLETION_PERCENTAGE = 100;
export const BYTES_TO_KB = 1024;
export const BYTES_TO_MB = 1024 * 1024;
export const SECONDS_TO_MS = 1000;
export const MINUTES_TO_SECONDS = 60;
export const HOURS_TO_SECONDS = 3600;

// Peer monitoring constants
export const STUCK_PIECES_CHECK_INTERVAL = 10000;
export const MAX_STUCK_PIECES_TO_RESET = 5;
export const MAX_MISSING_PIECES_TO_ANALYZE = 20;
export const MAX_PIECES_TO_RELAUNCH = 5;
export const MIN_CONNECTIONS_FOR_FORCE_RETRY = 10;
export const MAX_FAILED_PEERS_TO_RETRY = 10;

// Connection and piece constants
export const KEEP_ALIVE_INTERVAL = 120000;
export const BLOCK_SIZE = 16384;
export const MAX_CONCURRENT_REQUESTS = 5;
export const SHA1_HASH_SIZE = 20;
export const BITFIELD_BYTE_SIZE = 8;
export const BIT_SHIFT_POSITIONS = 7;

// Tracker constants
export const DEFAULT_PORT = 6881;
export const DEFAULT_NUMWANT = 50;
export const MAX_TRACKERS_TO_USE = 3;
export const MIN_PEERS_NEEDED = 20;
export const UDP_TIMEOUT = 15000;
export const TRACKER_RETRY_INTERVAL = 300000; // 5 minutes

// BitTorrent message types
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
}

// UDP Tracker constants
export const UDP_PROTOCOL_ID = 0x41727101980n;
export const UDP_ACTION_CONNECT = 0;
export const UDP_ACTION_ANNOUNCE = 1;
export const UDP_CONNECT_REQUEST_SIZE = 16;
export const UDP_ANNOUNCE_RESPONSE_MIN_SIZE = 20;
export const UDP_PEER_SIZE = 6; // 4 bytes IP + 2 bytes port
export const UDP_ANNOUNCE_RESPONSE_HEADER_SIZE = 20;

// Event types for tracker
export enum TrackerEvent {
  NONE = 0,
  COMPLETED = 1,
  STARTED = 2,
  STOPPED = 3,
}

// Bencode constants
export const BENCODE_INTEGER_PREFIX = 0x69; // 'i'
export const BENCODE_LIST_PREFIX = 0x6c; // 'l'
export const BENCODE_DICT_PREFIX = 0x64; // 'd'
export const BENCODE_END_MARKER = 0x65; // 'e'
export const BENCODE_STRING_SEPARATOR = 0x3a; // ':'
export const BENCODE_NEGATIVE = 0x2d; // '-'
export const BENCODE_DIGIT_START = 0x30; // '0'
export const BENCODE_DIGIT_END = 0x39; // '9'

// Client constants
export const CLIENT_VERSION = '1.0.0';
export const CLIENT_NAME = 'BitTorrent-Client';
export const PEER_ID_PREFIX = '-BT0001-';
export const PEER_ID_RANDOM_LENGTH = 12;

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  HANDSHAKE_SENT = 'handshake_sent',
  HANDSHAKE_RECEIVED = 'handshake_received',
  CONNECTED = 'connected',
  ERROR = 'error',
}
