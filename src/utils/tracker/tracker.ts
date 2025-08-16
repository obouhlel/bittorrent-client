import type {
  AnnounceParams,
  Peer,
  Tracker,
  TrackerInfo,
  TrackerStats,
  TrackerEvent,
} from '~/types';
import { DEFAULT_NUMWANT, DEFAULT_PORT } from '../system/constants';
import { HTTPTracker } from '~/models/trackers/http/http-tracker';
import { UDPTracker } from '~/models/trackers/udp/udp-tracker';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import { log } from '../system/logging';

export function createTrackerInfo(tracker: Tracker): TrackerInfo {
  return {
    url: tracker.url,
    protocol: tracker.protocol,
    failures: 0,
    lastSuccess: undefined,
  };
}

export function createTrackerInstance(
  tracker: TrackerInfo,
  metadata: TorrentMetadata
): HTTPTracker | UDPTracker {
  if (tracker.protocol === 'udp') {
    return new UDPTracker(tracker.url, metadata);
  }
  return new HTTPTracker(tracker.url, metadata);
}

export function initTrackerInstance(
  trackers: TrackerInfo[],
  metadata: TorrentMetadata
): Map<string, HTTPTracker | UDPTracker> {
  const instances = new Map<string, HTTPTracker | UDPTracker>();

  for (const [index, tracker] of trackers.entries()) {
    const key = `trackers-${tracker.protocol}-${index}`;
    const instance = createTrackerInstance(tracker, metadata);
    instances.set(key, instance);
  }
  return instances;
}

export function createFullAnnounceParams(
  stats: TrackerStats,
  event: TrackerEvent,
  metadata: TorrentMetadata
): AnnounceParams {
  return {
    uploaded: stats.uploaded,
    downloaded: stats.downloaded,
    left: stats.left,
    event: event,
    numwant: DEFAULT_NUMWANT,
    info_hash: Buffer.from(metadata.infoHash),
    peer_id: metadata.peerId,
    port: DEFAULT_PORT,
  };
}

export function getPeerKey(peer: Peer) {
  return `${peer.ip}:${peer.port}`;
}

export function deduplicatePeers(peers: Peer[], existingKeys: Set<string>): Peer[] {
  const newPeers: Peer[] = [];
  for (const peer of peers) {
    const key = getPeerKey(peer);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      newPeers.push(peer);
    }
  }
  return newPeers;
}

export function sortTrackersBySuccess(trackers: TrackerInfo[]): TrackerInfo[] {
  return trackers.sort((a, b) => {
    const aHasSuccess = a.lastSuccess !== undefined;
    const bHasSuccess = b.lastSuccess !== undefined;

    if (aHasSuccess && !bHasSuccess) return -1;
    if (!aHasSuccess && bHasSuccess) return 1;

    return a.failures - b.failures;
  });
}

export async function announceToTrackers(
  trackers: TrackerInfo[],
  instances: Map<string, HTTPTracker | UDPTracker>,
  stats: TrackerStats,
  metadata: TorrentMetadata,
  event?: TrackerEvent,
  existingPeers?: Set<string>
): Promise<Peer[]> {
  const announceParams = createFullAnnounceParams(stats, event, metadata);

  const announcePromises = trackers.map(async (trackerInfo, index) => {
    const key = `trackers-${trackerInfo.protocol}-${index}`;
    const instance = instances.get(key);

    if (!instance) return [];

    try {
      const response = await instance.announce(announceParams);
      trackerInfo.lastSuccess = new Date();
      log('pass', `Tracker ${key} success: ${response.peers.length} peers found`);
      return response.peers;
    } catch (error) {
      trackerInfo.failures++;
      log(
        'fail',
        `Tracker ${key} failled: ${error instanceof Error ? error.message : 'unknow error'}`
      );
      return [];
    }
  });

  const allPeersArrays = await Promise.all(announcePromises);
  const allPeers = allPeersArrays.flat();

  if (!existingPeers) {
    return allPeers;
  }

  const newPeers = deduplicatePeers(allPeers, existingPeers);

  for (const peer of newPeers) {
    existingPeers.add(getPeerKey(peer));
  }

  return newPeers;
}
