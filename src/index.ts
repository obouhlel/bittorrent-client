import '~/env';
import { log } from '~/utils/system/logging';
import { CLIENT_VERSION, DEFAULT_TORRENT_FILE_PATH, ONE_MB } from '~/utils/system/constants';
import { TorrentMetadata } from './models/torrents/metadata';
import { decodeTorrent } from './utils/torrent/bencode';
import { TrackerManager } from './models/trackers/tracker-manager';

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

async function main(path: string) {
  const data = Buffer.from(await Bun.file(path).arrayBuffer());
  const torrentFile = decodeTorrent(data);
  const torrent = new TorrentMetadata(torrentFile, data);
  log('info', `Name: ${torrent.name}`);
  log('info', `Hash: ${torrent.infoHash}`);
  log('info', `Number of pieces: ${torrent.pieceCount}`);
  log('info', `Size of pieces: ${torrent.pieceLength / 1000} KB`);
  log('info', `Total length: ${(torrent.totalSize / 1000000).toPrecision(5)} MB`);
  log('info', `Found ${torrent.getTrackers().length} trackers`);
  const trackers = new TrackerManager(torrent);
  // Découvrir les peers au démarrage
  log('info', 'Discovering peers from all trackers...');
  const initialPeers = await trackers.discoverPeers();
  log('pass', `Discovered ${initialPeers.length} unique peers`);

  // Afficher le statut des trackers
  const trackerStatus = trackers.getTrackersStatus();
  const successfulTrackers = trackerStatus.filter((t) => t.lastSuccess).length;
  log('info', `${successfulTrackers}/${trackerStatus.length} trackers responded`);

  // Démarrer l'auto-refresh
  trackers.startAutoRefresh();
  log('info', 'Started auto-refresh for peer discovery');

  // Simuler des stats pour test
  trackers.updateStats({
    uploaded: 0,
    downloaded: ONE_MB, // 1MB
    left: torrent.totalSize - ONE_MB,
  });

  // Attendre un peu et voir les peers
  await new Promise((resolve) => setTimeout(resolve, 5000));
  log('info', `Total peers discovered: ${trackers.getTotalPeersCount()}`);

  // Cleanup
  await trackers.destroy();
}
