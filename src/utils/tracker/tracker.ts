import { TorrentMetadata } from '@/models/metadata';
import { HTTPTracker } from '@/models/http-tracker';
import { UDPTracker } from '@/models/udp-tracker';
import type { BaseAnnounceParams, AnnounceParams, AnnounceResponse } from '@/types/tracker';
import type { Peer } from '@/types';
import { DownloadManager } from '@/models/download-manager';
import { log } from '@/utils/system/logging';
import { DEFAULT_PORT, DEFAULT_NUMWANT } from '@/utils/system/constants';
import { getClientPeerId } from '@/utils/protocol/peer-id';

export function createAnnounceParams(metadata: TorrentMetadata): BaseAnnounceParams {
  return {
    uploaded: 0,
    downloaded: 0,
    left: metadata.totalSize,
    event: 'started',
    numwant: DEFAULT_NUMWANT,
    port: DEFAULT_PORT,
  };
}

export async function announceToTracker(
  tracker: { url: string; protocol: string },
  metadata: TorrentMetadata,
  announceParams: BaseAnnounceParams
): Promise<AnnounceResponse | null> {
  log('info', `Contacting tracker: ${tracker.url}`);

  try {
    // Créer les paramètres complets avec info_hash et peer_id
    const fullAnnounceParams: AnnounceParams = {
      ...announceParams,
      info_hash: Buffer.from(metadata.infoHash, 'hex'),
      peer_id: getClientPeerId(),
      port: announceParams.port || DEFAULT_PORT,
      compact: 1,
    };

    let response: AnnounceResponse;

    if (tracker.protocol === 'http' || tracker.protocol === 'https') {
      log('debug', `Protocol: HTTP${tracker.protocol === 'https' ? 'S' : ''}`);
      const httpTracker = new HTTPTracker(tracker.url, metadata);
      response = await httpTracker.announce(fullAnnounceParams);
    } else if (tracker.protocol === 'udp') {
      log('debug', 'Protocol: UDP');
      const udpTracker = new UDPTracker(tracker.url, metadata);
      response = await udpTracker.announce(fullAnnounceParams);
      udpTracker.close();
    } else {
      log('warn', `Unsupported protocol: ${tracker.protocol}`);
      return null;
    }

    log('success', `Tracker responded successfully`);
    log(
      'info',
      `Peers: ${response.peers.length} | Seeders: ${response.complete} | Leechers: ${response.incomplete}`
    );

    return response;
  } catch (error) {
    log(
      'error',
      `Tracker ${tracker.url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return null;
  }
}

// Fonction simple pour compatibilité - utilisez TrackerManager pour une gestion avancée
export async function announceToTrackers(
  metadata: TorrentMetadata,
  trackers: { url: string; protocol: string }[],
  downloadManager: DownloadManager
): Promise<Peer[]> {
  const announceParams = createAnnounceParams(metadata);
  const peers: Peer[] = [];

  // Utilise tous les trackers mais limite à 5 max
  const trackersToUse = trackers.slice(0, 5);

  for (const tracker of trackersToUse) {
    const response = await announceToTracker(tracker, metadata, announceParams);

    if (!response) continue;

    const newPeers = response.peers.filter((peer: Peer) => {
      return !peers.some((p) => p.ip === peer.ip && p.port === peer.port);
    });

    peers.push(...newPeers);
    downloadManager.addPeers(newPeers);

    if (newPeers.length > 0) {
      log('debug', `Added ${newPeers.length} new unique peer(s)`);
    }
  }

  return peers;
}

// Fonction dépréciée - utilisez TrackerManager.startAutomaticDiscovery() à la place
export function startPeerDiscovery(
  metadata: TorrentMetadata,
  trackers: { url: string; protocol: string }[],
  downloadManager: DownloadManager
): NodeJS.Timeout {
  return setInterval(async () => {
    if (downloadManager.currentStats.activePeers < 30) {
      log('debug', 'Searching for more peers...');
      await announceToTrackers(metadata, trackers, downloadManager);
    }
  }, 120000); // 2 minutes au lieu de 5
}
