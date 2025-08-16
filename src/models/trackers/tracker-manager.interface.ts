import type { Peer, TrackerEvent, TrackerInfo, TrackerStats } from '~/types';

export interface ITrackerManager {
  discoverPeers(): Promise<Peer[]>;
  refreshPeers(): Promise<Peer[]>;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
  updateStats(stats: TrackerStats): void;
  announceEvent(event: TrackerEvent): Promise<void>;
  getTrackersStatus(): TrackerInfo[];
  getTotalPeersCount(): number;
  destroy(): Promise<void>;
}
