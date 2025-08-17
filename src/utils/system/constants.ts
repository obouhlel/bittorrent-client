// Network and buffer constants
export const ONE_MB = 1024 * 1024;
export const CONNECTION_TIMEOUT = 10000;

// BitTorrent protocol constants
export const PROTOCOL_NAME = 'BitTorrent protocol';
export const PROTOCOL_NAME_LENGTH = 19;
export const HANDSHAKE_SIZE = 68;
export const INFO_HASH_SIZE = 20;
export const PEER_ID_SIZE = 20;
export const RESERVED_BYTES_SIZE = 8;

// Client constants
export const CLIENT_VERSION = '1.0.0';
export const PEER_ID_PREFIX = '-BT0001-';
export const PEER_ID_RANDOM_LENGTH = 12;

// Default torrent file path
export const DEFAULT_TORRENT_FILE_PATH = './torrents/BigBuckBunny_124_archive.torrent';

// Tracker constants
export const DEFAULT_PORT = 6881;
export const DEFAULT_NUMWANT = 80;
export const TARGET_PEER_COUNT = 80;
export const REFRESH_TRACKERS = 5000;
export const NUMBER_TRACKERS_RUN = 5;

// HTTP Tracker constants
export const HTTP_TIMEOUT = 10000;

// UDP Tracker constants
export const UDP_MAGIC_CONSTANT = 0x41727101980n;
export const UDP_ACTION_CONNECT = 0;
export const UDP_ACTION_ANNOUNCE = 1;
export const UDP_CONNECT_REQUEST_SIZE = 16;
export const UDP_ANNOUNCE_RESPONSE_MIN_SIZE = 20;
export const UDP_PEER_SIZE = 6;
export const UDP_TIMEOUT = 15000;
export const UDP_ANNOUNCE_RESPONSE_HEADER_SIZE = 20;
export enum UDPEvent {
  NONE = 0,
  COMPLETED = 1,
  STARTED = 2,
  STOPPED = 3,
}

// TCP
export const TCP_TIMEOUT = 30000;
export const TCP_RECONNECT_DELAY = 10000;
export const TCP_MAX_RECONNECTION_ATTEMPTS = 3;

// Peer connection timeouts
export const HANDSHAKE_TIMEOUT = 15000;
export const PEER_CONNECTION_TIMEOUT = 8000;
export const PEER_MESSAGE_TIMEOUT = 30000;

// Piece management constants
export const PIECE_BLOCK_SIZE = 16384;
export const MAX_PENDING_REQUESTS = 5;
export const PIECE_TIMEOUT = 30000;
export const MAX_PIECE_SIZE = 2 * ONE_MB;

// Download/Upload constants
export const DEFAULT_DOWNLOAD_PATH = './downloads';
export const MAX_CONCURRENT_DOWNLOADS = 10;
export const PIECE_HASH_CHECK_ENABLED = true;

// Peer behavior constants
export const OPTIMISTIC_UNCHOKE_INTERVAL = 30000;
export const REGULAR_UNCHOKE_INTERVAL = 10000;
export const MAX_UNCHOKED_PEERS = 4;
export const INTERESTED_TIMEOUT = 60000;
export const MIN_CONNECTED_PEERS = 5;
