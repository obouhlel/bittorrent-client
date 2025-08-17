import type { TrackerInfo, TrackerStats, Peer, TrackerEvent } from '~/types';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import type { HTTPTracker } from './http/http-tracker';
import type { ITrackerManager } from './tracker-manager.interface';
import { UDPTracker } from './udp/udp-tracker';
import { NUMBER_TRACKERS_RUN, REFRESH_TRACKERS, TARGET_PEER_COUNT } from '~/config';
import { createTrackerInfo, initTrackerInstance } from '~/utils/tracker/factory';
import { announceToTrackers, discoverPeersProgressively } from '~/utils/tracker/discovery';
import { sortTrackersByProtocol } from '~/utils/tracker/sort';
import { log } from '~/utils/system/logging';

export class TrackerManager implements ITrackerManager {
  private trackers: TrackerInfo[];
  private peers: Set<string>;
  private instances: Map<string, HTTPTracker | UDPTracker>;
  private stats: TrackerStats;
  private refreshTimer?: NodeJS.Timeout;
  private trackerRotationIndex = 0;

  constructor(private metadata: TorrentMetadata) {
    const trackers = this.metadata.getTrackers();
    this.trackers = [];
    for (const tracker of trackers) {
      this.trackers.push(createTrackerInfo(tracker));
    }
    this.trackers = sortTrackersByProtocol(this.trackers);
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
    const rotatedTrackers = this.getRotatedTrackers();
    const trackerUrls = rotatedTrackers.map((t) => t.url.substring(0, 30) + '...').join(', ');

    log('debug', `Using trackers starting at index ${this.trackerRotationIndex}: ${trackerUrls}`);

    const newPeers = await discoverPeersProgressively(
      rotatedTrackers,
      this.instances,
      this.stats,
      this.metadata,
      'started',
      this.peers,
      TARGET_PEER_COUNT
    );

    this.trackerRotationIndex =
      (this.trackerRotationIndex + NUMBER_TRACKERS_RUN) % this.trackers.length;

    return newPeers;
  }

  private getRotatedTrackers(): TrackerInfo[] {
    if (this.trackers.length <= NUMBER_TRACKERS_RUN) {
      return this.trackers;
    }

    const rotated: TrackerInfo[] = [];
    for (let i = 0; i < NUMBER_TRACKERS_RUN && i < this.trackers.length; i++) {
      const index = (this.trackerRotationIndex + i) % this.trackers.length;
      const tracker = this.trackers[index];
      if (tracker) {
        rotated.push(tracker);
      }
    }

    return rotated;
  }

  async refreshPeers(): Promise<Peer[]> {
    const selectTrackers = this.getRotatedTrackers();
    const trackerUrls = selectTrackers.map((t) => t.url.substring(0, 30) + '...').join(', ');

    log(
      'debug',
      `Refreshing with trackers starting at index ${this.trackerRotationIndex}: ${trackerUrls}`
    );

    const newPeers = await announceToTrackers(
      selectTrackers,
      this.instances,
      this.stats,
      this.metadata,
      undefined,
      this.peers
    );

    // Incrémenter l'index de rotation pour la prochaine fois
    this.trackerRotationIndex =
      (this.trackerRotationIndex + NUMBER_TRACKERS_RUN) % this.trackers.length;

    return newPeers;
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
