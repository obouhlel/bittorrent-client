import '~/env';
import { log } from '~/utils/system/logging';
import { CLIENT_VERSION, DEFAULT_TORRENT_FILE_PATH } from '~/utils/system/constants';
import { TorrentMetadata } from './models/torrents/metadata';
import { decodeTorrent } from './utils/torrent/bencode';
import { TrackerManager } from './models/trackers/tracker-manager';
import { PeerManager } from './models/peer/peer-manager';
import { PieceManager } from './models/piece/piece-manager';

// Application startup
const torrentFilePath = Bun.env.TORRENT_FILE_PATH || DEFAULT_TORRENT_FILE_PATH;

log('info', `BitTorrent client v${CLIENT_VERSION}`);
main(torrentFilePath)
  .catch((error) => {
    log('fail', `Fatal error: ${error}`);
    process.exit(1);
  })
  .then(() => {
    log('pass', 'Download complete');
    process.exit(0);
  });

async function finishDownload(pieceManager: PieceManager): Promise<void> {
  try {
    await pieceManager.assembleCompleteFile();
    log('pass', 'File successfully assembled!');
  } catch (error) {
    log('fail', `Failed to assemble file: ${error}`);
  }
}

async function main(path: string) {
  // Parse Torrent
  const data = Buffer.from(await Bun.file(path).arrayBuffer());
  const torrentFile = decodeTorrent(data);
  const torrent = new TorrentMetadata(torrentFile, data);
  log('info', `Name: ${torrent.name}`);
  log('info', `Hash: ${torrent.infoHash}`);
  log('info', `Number of pieces: ${torrent.pieceCount}`);
  log('info', `Size of pieces: ${torrent.pieceLength / 1000} KB`);
  log('info', `Total length: ${(torrent.totalSize / 1000000).toPrecision(5)} MB`);
  log('info', `Found ${torrent.getTrackers().length} trackers`);

  // Piece manager
  const pieceManager = new PieceManager(torrent);
  log('info', `Initialized piece manager with ${pieceManager.getTotalPieces()} pieces`);

  // Tracker manager
  const trackers = new TrackerManager(torrent);
  log('info', 'Discovering peers from some trackers...');
  const initialPeers = await trackers.discoverPeers();
  log('pass', `Discovered ${initialPeers.length} unique peers`);
  const trackerStatus = trackers.getTrackersStatus();
  const successfulTrackers = trackerStatus.filter((t) => t.lastSuccess).length;
  log('info', `${successfulTrackers} trackers responded`);
  trackers.startAutoRefresh();
  log('info', 'Started auto-refresh for peer discovery');
  // Peer manager
  const peerManager = new PeerManager(torrent, pieceManager);
  log('info', 'Connecting to peers...');
  await peerManager.connectToPeers(initialPeers);
  log('pass', `Successfully connected to ${peerManager.getConnectedPeersCount()} peers`);

  // Start download process
  log('info', 'Starting download process...');
  const downloadInterval = setInterval(() => {
    pieceManager.cleanupExpiredRequests();
    const stats = pieceManager.getStats();
    log(
      'info',
      `Download progress: ${stats.downloadProgress.toFixed(2)}% (${stats.completedPieces}/${stats.totalPieces} pieces, ${stats.pendingRequests} pending requests)`
    );

    if (stats.downloadProgress >= 100) {
      clearInterval(downloadInterval);
      log('pass', 'Download completed!');
      finishDownload(pieceManager);
    }
  }, 2000);

  // Wait for download to complete or timeout
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      clearInterval(downloadInterval);
      log('info', 'Download timeout reached');
      resolve(undefined);
    }, 300000); // 5 minutes timeout

    const checkCompletion = setInterval(() => {
      if (pieceManager.getStats().downloadProgress >= 100) {
        clearTimeout(timeout);
        clearInterval(checkCompletion);
        resolve(undefined);
      }
    }, 1000);
  });

  log('info', `Total peers discovered: ${trackers.getTotalPeersCount()}`);

  // Cleanup
  peerManager.destroy();
  await trackers.destroy();
}
