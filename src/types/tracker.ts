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
  announce: string;
  isWorking: boolean;
  lastResponse?: Date;
  failureCount: number;
  lastError?: string;
}

export interface ITrackerManager {
  resetAndRetryAllTrackers(): Promise<{ ip: string; port: number; id?: Buffer }[]>;
}
