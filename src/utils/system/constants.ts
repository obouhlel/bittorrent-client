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
export const MAX_PENDING_REQUESTS = 50; // Plus de requêtes en parallèle

// Download Manager constants
export const DEFAULT_MAX_CONNECTIONS = 200; // Plus de connexions simultanées
export const DEFAULT_CONNECT_TIMEOUT = 15000; // Timeout plus long pour connexions lentes
export const DEFAULT_RETRY_ATTEMPTS = 2; // Plus de tentatives
export const DEFAULT_PROGRESS_INTERVAL = 2000; // More frequent progress updates
export const SLEEP_INTERVAL = 500; // Vérifications encore plus rapides
export const MIN_ACTIVE_CONNECTIONS = 5; // Plus de connexions minimum
export const RETRY_PEER_LIMIT = 15; // Retry plus de peers
export const AUTO_RETRY_TIMEOUT = 60000; // Retry moins fréquent pour éviter spam
export const MIN_CONNECTIONS_FOR_RETRY = 8; // Threshold plus élevé
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
export const STUCK_PIECES_CHECK_INTERVAL = 5000; // Check every 5 seconds instead of 10
export const MAX_STUCK_PIECES_TO_RESET = 10; // Reset more stuck pieces
export const MAX_MISSING_PIECES_TO_ANALYZE = 50; // Analyze more missing pieces
export const MAX_PIECES_TO_RELAUNCH = 15; // Relaunch more pieces at once
export const MIN_CONNECTIONS_FOR_FORCE_RETRY = 3; // Force retry with fewer connections
export const MAX_FAILED_PEERS_TO_RETRY = 20; // Retry more failed peers

// Connection and piece constants
export const KEEP_ALIVE_INTERVAL = 120000;
export const BLOCK_SIZE = 16384; // Taille standard BitTorrent (16KB)
export const MAX_CONCURRENT_REQUESTS = 20; // Plus de requêtes concurrentes
export const SHA1_HASH_SIZE = 20;
export const BITFIELD_BYTE_SIZE = 8;
export const BIT_SHIFT_POSITIONS = 7;

// Tracker constants
export const DEFAULT_PORT = 6881;
export const DEFAULT_NUMWANT = 80; // Plus de peers demandés
export const BATCH_SIZE = 5; // Plus de trackers par round
export const MIN_PEERS_FOR_HEALTHY_SWARM = 30; // Seuil pour swarm sain
export const MIN_PEERS_FOR_STRUGGLING_SWARM = 10; // Seuil pour swarm en difficulté
export const UDP_TIMEOUT = 15000;
export const TRACKER_RETRY_INTERVAL_HEALTHY = 180000; // 3 minutes si beaucoup de peers
export const TRACKER_RETRY_INTERVAL_STRUGGLING = 60000; // 1 minute si peu de peers
export const TRACKER_FAILURE_RETRY_DELAY = 30000; // 30s avant de retry un tracker failed

export enum TrackerEvent {
  NONE = 0,
  COMPLETED = 1,
  STARTED = 2,
  STOPPED = 3,
}

// UDP Tracker constants
export const UDP_MAGIC_CONSTANT = 0x41727101980n;
export const UDP_ACTION_CONNECT = 0;
export const UDP_ACTION_ANNOUNCE = 1;
export const UDP_CONNECT_REQUEST_SIZE = 16;
export const UDP_ANNOUNCE_RESPONSE_MIN_SIZE = 20;
export const UDP_PEER_SIZE = 6; // 4 bytes IP + 2 bytes port
export const UDP_ANNOUNCE_RESPONSE_HEADER_SIZE = 20;

// Client constants
export const CLIENT_VERSION = '1.0.0';
export const PEER_ID_PREFIX = '-BT0001-';
export const PEER_ID_RANDOM_LENGTH = 12;

// Default torrent file path
export const DEFAULT_TORRENT_FILE_PATH = './torrents/BigBuckBunny_124_archive.torrent';

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  HANDSHAKE_SENT = 'handshake_sent',
  HANDSHAKE_RECEIVED = 'handshake_received',
  CONNECTED = 'connected',
  ERROR = 'error',
}
