import type { Peer } from './network.type';

export type TrackerEvent = 'started' | 'stopped' | 'completed' | undefined;

export interface BaseAnnounceParams {
  uploaded: number;
  downloaded: number;
  left: number;
  event?: TrackerEvent;
  numwant?: number;
  port?: number;
}

export interface AnnounceParams extends BaseAnnounceParams {
  info_hash: Buffer;
  peer_id?: Buffer;
  port: number;
  compact?: 1;
}

export interface AnnounceResponse {
  interval: number;
  peers: Peer[];
  complete: number;
  incomplete: number;
  tracker_id?: string;
}

export interface TrackerInfo {
  url: string;
  protocol: string;
  event?: TrackerEvent;
}

export interface TrackerStats {
  uploaded: number;
  downloaded: number;
  left: number;
}
