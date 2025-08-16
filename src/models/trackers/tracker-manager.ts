import type { TrackerInfo, TrackerStats, Peer, TrackerEvent } from '~/types';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import {
  createTrackerInfo,
  initTrackerInstance,
  sortTrackersBySuccess,
  announceToTrackers,
} from '~/utils/tracker/tracker';
import type { HTTPTracker } from './http/http-tracker';
import { UDPTracker } from './udp/udp-tracker';
import { NUMBER_TRACKERS_RUN, REFRESH_TRACKERS } from '~/utils/system/constants';

export class TrackerManager {
  private trackers: TrackerInfo[];
  private peers: Set<string>;
  private instances: Map<string, HTTPTracker | UDPTracker>;
  private stats: TrackerStats;
  private refreshTimer?: NodeJS.Timeout;

  constructor(private metadata: TorrentMetadata) {
    const trackers = this.metadata.getTrackers();
    this.trackers = [];
    for (const tracker of trackers) {
      this.trackers.push(createTrackerInfo(tracker));
    }
    this.peers = new Set<string>();
    this.instances = initTrackerInstance(this.trackers, this.metadata);
    this.stats = { uploaded: 0, downloaded: 0, left: metadata.totalSize };
  }

  updateStats(stats: TrackerStats) {
    this.stats = {
      uploaded: stats.uploaded,
      downloaded: stats.downloaded,
      left: stats.left,
    };
  }

  getTrackersStatus(): TrackerInfo[] {
    return this.trackers;
  }

  getTotalPeersCount(): number {
    return this.peers.size;
  }

  async discoverPeers(): Promise<Peer[]> {
    return announceToTrackers(
      this.trackers,
      this.instances,
      this.stats,
      this.metadata,
      'started',
      this.peers
    );
  }

  async refreshPeers(): Promise<Peer[]> {
    const sortedTrackers = sortTrackersBySuccess(this.trackers);
    const bestTrackers = sortedTrackers.slice(0, NUMBER_TRACKERS_RUN);

    return announceToTrackers(
      bestTrackers,
      this.instances,
      this.stats,
      this.metadata,
      undefined,
      this.peers
    );
  }

  async announceEvent(event: TrackerEvent): Promise<void> {
    await announceToTrackers(this.trackers, this.instances, this.stats, this.metadata, event);
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(async () => {
      await this.refreshPeers();
    }, REFRESH_TRACKERS);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  async destroy() {
    this.stopAutoRefresh();
    for (const [_, instance] of this.instances.entries()) {
      if (instance instanceof UDPTracker) {
        instance.close();
      }
    }
    this.peers.clear();
    this.instances.clear();
  }
}
