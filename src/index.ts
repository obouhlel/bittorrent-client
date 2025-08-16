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
  // Tracker manager
  const trackers = new TrackerManager(torrent);
  log('info', 'Discovering peers from all trackers...');
  const initialPeers = await trackers.discoverPeers();
  log('pass', `Discovered ${initialPeers.length} unique peers`);
  const trackerStatus = trackers.getTrackersStatus();
  const successfulTrackers = trackerStatus.filter((t) => t.lastSuccess).length;
  log('info', `${successfulTrackers}/${trackerStatus.length} trackers responded`);
  trackers.startAutoRefresh();
  log('info', 'Started auto-refresh for peer discovery');
  trackers.updateStats({
    uploaded: 0,
    downloaded: ONE_MB,
    left: torrent.totalSize - ONE_MB,
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  log('info', `Total peers discovered: ${trackers.getTotalPeersCount()}`);
  await trackers.destroy();
}
