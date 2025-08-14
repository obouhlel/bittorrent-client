export interface DownloadConfig {
  maxConnections: number;
  downloadDir: string;
  connectTimeout: number;
  retryAttempts: number;
  progressInterval: number;
}

export interface DownloadStats {
  totalPieces: number;
  completedPieces: number;
  activePeers: number;
  downloadSpeed: number; // bytes/sec
  uploadSpeed: number; // bytes/sec
  eta: number; // seconds
  percentage: number;
}

export interface StorageFileInfo {
  path: string;
  length: number;
  offset: number; // Position dans le torrent global
}

export interface ProgressInfo {
  completed: number;
  total: number;
  percentage: number;
}
