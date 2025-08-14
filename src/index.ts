import '~/env';
import { log } from '~/utils/system/logging';
import { DownloadManager } from '~/models/storage/download-manager';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import { TorrentMetadata as TorrentMetadataClass } from '~/models/torrents/metadata';
import { decodeTorrent } from '~/utils/torrent/bencode';
import { TrackerManager } from '~/models/trackers/tracker-manager';
import {
  DEFAULT_PORT,
  DEFAULT_NUMWANT,
  CLIENT_VERSION,
  DEFAULT_TORRENT_FILE_PATH,
  BYTES_TO_MB,
  BYTES_TO_KB,
} from '~/utils/system/constants';

async function loadTorrentFile(path: string): Promise<TorrentMetadata> {
  log('info', `Loading torrent file: ${path}`);

  const buf: ArrayBuffer = await Bun.file(path).arrayBuffer();
  const data: Buffer = Buffer.from(buf);
  const torrent = decodeTorrent(data);
  const metadata = new TorrentMetadataClass(torrent);

  metadata.setInfoHash(data);

  return metadata;
}

function logTorrentInfo(metadata: TorrentMetadata): void {
  log('pass', `Torrent loaded: ${metadata.name}`);
  log(
    'info',
    `Size: ${(metadata.totalSize / BYTES_TO_MB).toFixed(2)} MB (${metadata.totalSize.toLocaleString()} bytes)`
  );
  log('info', `Piece length: ${(metadata.pieceLength / BYTES_TO_KB).toFixed(0)} KB`);
  log('info', `Total pieces: ${metadata.pieceCount}`);
  log('info', `Info hash: ${metadata.infoHash}`);
}

function logTrackersInfo(trackers: { url: string; protocol: string }[]): void {
  log('info', `Announce list contains ${trackers.length} tracker(s)`);

  const trackerCounts = {
    udp: trackers.filter((t) => t.protocol === 'udp').length,
    http: trackers.filter((t) => t.protocol === 'http').length,
    https: trackers.filter((t) => t.protocol === 'https').length,
  };

  if (trackerCounts.udp > 0) log('debug', `UDP trackers: ${trackerCounts.udp}`);
  if (trackerCounts.http > 0) log('debug', `HTTP trackers: ${trackerCounts.http}`);
  if (trackerCounts.https > 0) log('debug', `HTTPS trackers: ${trackerCounts.https}`);
}

/**
 * Configure and create a download manager with default settings
 */
function createDownloadManager(metadata: TorrentMetadata): DownloadManager {
  return new DownloadManager(metadata, {
    maxConnections: 80,
    downloadDir: './downloads',
    connectTimeout: 20000,
    retryAttempts: 1,
    progressInterval: 5000,
  });
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(downloadManager: DownloadManager): void {
  const shutdown = async () => {
    log('info', 'Shutting down gracefully...');
    await downloadManager.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Initialize and start the download process
 */
async function startDownload(downloadManager: DownloadManager): Promise<void> {
  try {
    log('info', 'Starting download...');
    await downloadManager.startDownload();
    log('pass', 'Download completed successfully!');
  } catch (error) {
    log('fail', `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Discover peers from trackers with intelligent management
 */
async function discoverPeers(
  metadata: TorrentMetadata,
  downloadManager: DownloadManager
): Promise<TrackerManager> {
  const trackers = metadata.getTrackers();
  logTrackersInfo(trackers);

  log('info', 'Starting intelligent tracker management...');
  log('debug', `Port: ${DEFAULT_PORT}`);
  log('debug', `Requesting ${DEFAULT_NUMWANT} peers per tracker`);

  // Créer le gestionnaire de trackers intelligent
  const trackerManager = new TrackerManager(metadata, downloadManager);

  // Connecter le TrackerManager au DownloadManager
  downloadManager.setTrackerManager(trackerManager);

  // Première annonce pour obtenir des peers initiaux (test tous les trackers par batch)
  log(
    'info',
    'Starting initial tracker announcement - download will begin as soon as peers are found'
  );
  const initialPeersPromise = trackerManager.announceToMultipleTrackers();

  // Démarrer la découverte automatique en parallèle
  trackerManager.startAutomaticDiscovery();

  // Attendre les peers initiaux
  const initialPeers = await initialPeersPromise;

  log('info', 'Initial tracker round complete');
  log('pass', `Total unique peers collected: ${initialPeers.length}`);

  if (initialPeers.length === 0) {
    log('warn', 'No peers found from initial trackers - automatic discovery continues');
  } else {
    log('info', 'Peers found! Download should already be starting...');
  }

  // Log des stats des trackers
  const stats = trackerManager.getTrackerStats();
  log('info', `Tracker stats: ${stats.working}/${stats.total} working, ${stats.failed} failed`);
  if (stats.bestTracker) {
    log('info', `Best tracker: ${stats.bestTracker.url} (${stats.bestTracker.seeders} seeders)`);
  }

  return trackerManager;
}

/**
 * Main application entry point
 */
async function main(torrentPath: string): Promise<void> {
  log('info', `BitTorrent client starting...`);

  // Load and parse torrent file
  const metadata = await loadTorrentFile(torrentPath);
  logTorrentInfo(metadata);

  // Create and initialize download manager
  const downloadManager = createDownloadManager(metadata);
  await downloadManager.initialize();

  // Log de configuration réseau pour debug
  log('debug', 'Network configuration:');
  log('debug', `- Max connections: ${downloadManager.currentStats}`);
  log('debug', `- Connect timeout: 15s`);
  log('debug', `- Retry attempts: 2`);

  // Setup graceful shutdown
  setupShutdownHandlers(downloadManager);

  // Discover peers and start download with intelligent tracker management
  log('info', 'Starting peer discovery and download in parallel...');

  // Démarrer le téléchargement en parallèle avec la découverte de peers
  const discoverPeersPromise = discoverPeers(metadata, downloadManager);
  const downloadPromise = startDownload(downloadManager);

  // Attendre que la découverte initiale soit terminée pour configurer les callbacks
  const trackerManager = await discoverPeersPromise;

  // Enhanced shutdown to stop tracker manager
  const enhancedShutdown = async () => {
    log('info', 'Shutting down gracefully...');
    trackerManager.stopAutomaticDiscovery();
    await downloadManager.stop();
    process.exit(0);
  };

  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.on('SIGINT', enhancedShutdown);
  process.on('SIGTERM', enhancedShutdown);

  // Attendre que le téléchargement soit terminé
  await downloadPromise;
}

// Application startup
const torrentFilePath = Bun.env.TORRENT_FILE_PATH || DEFAULT_TORRENT_FILE_PATH;

log('info', `BitTorrent client v${CLIENT_VERSION}`);
main(torrentFilePath).catch((error) => {
  log('fail', `Fatal error: ${error}`);
  process.exit(1);
});
