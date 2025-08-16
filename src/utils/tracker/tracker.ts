import { TorrentMetadata } from '~/models/torrents/metadata';
import { HTTPTracker } from '~/models/trackers/http-tracker';
import { UDPTracker } from '~/models/trackers/udp/udp-tracker';
import type { BaseAnnounceParams, AnnounceParams, AnnounceResponse } from '~/types/tracker';
import { log } from '~/utils/system/logging';
import { DEFAULT_PORT, DEFAULT_NUMWANT } from '~/utils/system/constants';
import { getClientPeerId } from '~/utils/protocol/peer-id';

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
    const fullAnnounceParams: AnnounceParams = {
      ...announceParams,
      info_hash: Buffer.from(metadata.infoHash, 'hex'),
      peer_id: getClientPeerId(),
      port: announceParams.port || DEFAULT_PORT,
      compact: 1,
    };

    let response: AnnounceResponse;

    if (tracker.protocol === 'http' || tracker.protocol === 'https') {
      const httpTracker = new HTTPTracker(tracker.url, metadata);
      response = await httpTracker.announce(fullAnnounceParams);
    } else if (tracker.protocol === 'udp') {
      const udpTracker = new UDPTracker(tracker.url, metadata);
      response = await udpTracker.announce(fullAnnounceParams);
      udpTracker.close();
    } else {
      log('warn', `Unsupported protocol: ${tracker.protocol}`);
      return null;
    }

    log(
      'pass',
      `Tracker responded successfully ${tracker.url} ! Peers: ${response.peers.length} | Seeders: ${response.complete} | Leechers: ${response.incomplete}`
    );

    return response;
  } catch (error) {
    log(
      'fail',
      `Tracker ${tracker.url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return null;
  }
}
