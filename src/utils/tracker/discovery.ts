import type { AnnounceParams, Peer, TrackerInfo, TrackerStats, TrackerEvent } from '~/types';
import { DEFAULT_NUMWANT, DEFAULT_PORT, TARGET_PEER_COUNT } from '~/utils/system/constants';
import { HTTPTracker } from '~/models/trackers/http/http-tracker';
import { UDPTracker } from '~/models/trackers/udp/udp-tracker';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import { log } from '~/utils/system/logging';
import { getPeerKey, deduplicatePeers } from './utils';

function createFullAnnounceParams(
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

export async function discoverPeersProgressively(
  trackers: TrackerInfo[],
  instances: Map<string, HTTPTracker | UDPTracker>,
  stats: TrackerStats,
  metadata: TorrentMetadata,
  event?: TrackerEvent,
  existingPeers?: Set<string>,
  targetCount: number = TARGET_PEER_COUNT
): Promise<Peer[]> {
  const collectedPeers: Peer[] = [];
  const peersSet = existingPeers || new Set<string>();

  const protocolCounts = trackers.reduce(
    (acc, t) => {
      acc[t.protocol] = (acc[t.protocol] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  log('debug', `Tracker distribution: ${JSON.stringify(protocolCounts)}`);

  for (const [index, trackerInfo] of trackers.entries()) {
    if (peersSet.size >= targetCount) {
      log('info', `Reached target of ${targetCount} peers, stopping discovery`);
      break;
    }

    const key = `trackers-${trackerInfo.protocol}-${index}`;
    const instance = instances.get(key);

    if (!instance) {
      log('debug', `No instance found for ${key}, skipping`);
      continue;
    }

    const announceParams = createFullAnnounceParams(stats, event, metadata);

    try {
      log(
        'debug',
        `Try to connect ${key} (${trackerInfo.url}) (${index + 1}/${trackers.length})...`
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tracker timeout after 5 seconds')), 5000);
      });

      const response = await Promise.race([instance.announce(announceParams), timeoutPromise]);

      trackerInfo.lastSuccess = new Date();
      log('pass', `Tracker ${key} success: ${response.peers.length} peers found`);

      for (const peer of response.peers) {
        const peerKey = getPeerKey(peer);
        if (!peersSet.has(peerKey)) {
          peersSet.add(peerKey);
          collectedPeers.push(peer);
        }
      }

      log('info', `Total unique peers: ${peersSet.size}/${targetCount}`);
    } catch (error) {
      trackerInfo.failures++;
      log(
        'fail',
        `Tracker ${key} failed: ${error instanceof Error ? (error.message === '' ? 'Unknown error' : error.message) : 'Unknown error'}`
      );
    }
  }

  return collectedPeers;
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
        `Tracker ${key} failled: ${error instanceof Error ? (error.message === '' ? 'Unknow error' : error.message) : 'Unknow error'}`
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
