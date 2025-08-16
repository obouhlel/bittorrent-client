// Tracker-related types and interfaces

export interface BaseAnnounceParams {
  uploaded: number;
  downloaded: number;
  left: number;
  event?: 'started' | 'stopped' | 'completed';
  numwant?: number;
  port?: number;
}

export interface AnnounceParams extends BaseAnnounceParams {
  info_hash: Buffer;
  peer_id: Buffer;
  port: number;
  compact?: 1;
}

export interface AnnounceResponse {
  interval: number;
  peers: { ip: string; port: number; id?: Buffer }[];
  complete: number;
  incomplete: number;
  tracker_id?: string;
}

export interface TrackerInfo {
  url: string;
  protocol: string;
  lastSuccess?: number;
  lastFailure?: number;
  consecutiveFailures: number;
  totalPeers: number;
  seeders: number;
  leechers: number;
  responseTime: number;
}

export interface ITrackerManager {
  resetAndRetryAllTrackers(): Promise<{ ip: string; port: number; id?: Buffer }[]>;
}
