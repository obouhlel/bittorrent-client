import { decodeTorrent } from '@/utils/bencode';
import { TorrentMetadata } from '@/models/metadata';
import { HTTPTracker } from '@/trackers/http-tracker';
import { UDPTracker } from '@/trackers/udp-tracker';
import type { AnnounceParams, AnnounceResponse } from '@/trackers/http-tracker';
import type { Peer } from '@/models/torrent';
import { log } from '@/utils/logging';

async function main(path: string) {
  log('info', `BitTorrent client starting...`);
  log('info', `Loading torrent file: ${path}`);

  const buf: ArrayBuffer = await Bun.file(path).arrayBuffer();
  const data: Buffer = Buffer.from(buf);
  const torrent = decodeTorrent(data);
  const metadata = new TorrentMetadata(torrent);

  metadata.setInfoHash(data);

  log('success', `Torrent loaded: ${metadata.name}`);
  log(
    'info',
    `Size: ${(metadata.totalSize / (1024 * 1024)).toFixed(2)} MB (${metadata.totalSize.toLocaleString()} bytes)`
  );
  log('info', `Piece length: ${(metadata.pieceLength / 1024).toFixed(0)} KB`);
  log('info', `Total pieces: ${metadata.pieceCount}`);
  log('info', `Info hash: ${metadata.infoHash}`);

  const trackers = metadata.getTrackers();
  log('info', `Announce list contains ${trackers.length} tracker(s)`);

  const trackerCounts = {
    udp: trackers.filter((t) => t.protocol === 'udp').length,
    http: trackers.filter((t) => t.protocol === 'http').length,
    https: trackers.filter((t) => t.protocol === 'https').length,
  };

  if (trackerCounts.udp > 0) log('debug', `UDP trackers: ${trackerCounts.udp}`);
  if (trackerCounts.http > 0) log('debug', `HTTP trackers: ${trackerCounts.http}`);
  if (trackerCounts.https > 0) log('debug', `HTTPS trackers: ${trackerCounts.https}`);

  const announceParams: AnnounceParams = {
    uploaded: 0,
    downloaded: 0,
    left: metadata.totalSize,
    event: 'started',
    numwant: 50,
    port: 6881,
  };

  log('info', 'Starting announce phase...');
  log('debug', `Port: ${announceParams.port}`);
  log('debug', `Requesting ${announceParams.numwant} peers`);

  const allPeers: Peer[] = [];

  for (const tracker of trackers) {
    log('info', `Contacting tracker: ${tracker.url}`);

    try {
      let response: AnnounceResponse;

      if (tracker.protocol === 'http' || tracker.protocol === 'https') {
        log('debug', `Protocol: HTTP${tracker.protocol === 'https' ? 'S' : ''}`);
        log('debug', 'Sending announce request...');
        const httpTracker = new HTTPTracker(tracker.url, metadata);
        response = await httpTracker.announce(announceParams);
      } else if (tracker.protocol === 'udp') {
        log('debug', 'Protocol: UDP');
        log('debug', 'Establishing connection...');
        const udpTracker = new UDPTracker(tracker.url, metadata);
        response = await udpTracker.announce(announceParams);
        udpTracker.close();
        log('debug', 'Connection closed');
      } else {
        log('warn', `Unsupported protocol: ${tracker.protocol}`);
        continue;
      }

      log('success', `Tracker responded successfully`);
      log(
        'info',
        `Peers: ${response.peers.length} | Seeders: ${response.complete} | Leechers: ${response.incomplete}`
      );
      log('info', `Next announce in: ${response.interval} seconds`);

      let newPeers = 0;
      for (const peer of response.peers) {
        const exists = allPeers.some((p) => p.ip === peer.ip && p.port === peer.port);
        if (!exists) {
          allPeers.push(peer);
          newPeers++;
        }
      }

      if (newPeers > 0) {
        log('debug', `Added ${newPeers} new unique peer(s)`);
      }

      if (response.peers.length > 0) {
        log('info', 'Sufficient peers found, stopping tracker search');
        break;
      }
    } catch (error) {
      log(
        'error',
        `Tracker communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  log('info', `Announce phase complete`);
  log('success', `Total unique peers collected: ${allPeers.length}`);

  if (allPeers.length === 0) {
    log('warn', 'No peers found from any tracker');
  } else {
    log('info', 'Ready to start peer connections');
  }

  log('info', 'Shutting down...');
  process.exit(0);
}

log('info', 'BitTorrent client v1.0.0');
main(
  './torrents/[DKB] Sakamoto Days - S01E17 [1080p][HEVC x265 10bit][Dual-Audio][Multi-Subs][9BB964ED].mkv.torrent'
).catch((error) => {
  log('error', `Fatal error: ${error}`);
  process.exit(1);
});
