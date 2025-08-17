import type { BitTorrentConfig, TorrentFile, TrackerStats, Peer } from '~/types';
import { TorrentMetadata } from './torrents/metadata';
import { TrackerManager } from './trackers/tracker-manager';
import { PeerManager } from './peer/peer-manager';
import { PieceManager } from './piece/piece-manager';
import { log } from '~/utils/system/logging';
import { MIN_CONNECTED_PEERS, DEFAULT_DOWNLOAD_PATH, DOWNLOAD_REFRESH_INTERVAL } from '~/config';
import { decodeTorrent } from '~/utils/torrent/bencode';
import type { DownloadStats } from '~/utils/system/stats';

export class BitTorrent {
  private torrentMetadata: TorrentMetadata;
  private trackerManager: TrackerManager;
  private peerManager: PeerManager;
  private pieceManager: PieceManager;
  private downloadInterval?: NodeJS.Timeout;
  private config: Required<BitTorrentConfig>;
  private isDownloading = false;
  private lastPeerDiscovery = 0;

  constructor(torrentFile: TorrentFile, torrentData: Buffer, config: BitTorrentConfig = {}) {
    this.config = {
      downloadPath: config.downloadPath || DEFAULT_DOWNLOAD_PATH,
      minConnectedPeers: config.minConnectedPeers || MIN_CONNECTED_PEERS,
    };

    this.torrentMetadata = new TorrentMetadata(torrentFile, torrentData);
    this.pieceManager = new PieceManager(this.torrentMetadata, this.config.downloadPath);
    this.trackerManager = new TrackerManager(this.torrentMetadata);
    this.peerManager = new PeerManager(this.torrentMetadata, this.pieceManager);
  }

  static async fromFile(filePath: string, config?: BitTorrentConfig): Promise<BitTorrent> {
    const data = Buffer.from(await Bun.file(filePath).arrayBuffer());
    const torrentFile = decodeTorrent(data);
    return new BitTorrent(torrentFile, data, config);
  }

  getTorrentInfo() {
    return {
      name: this.torrentMetadata.name,
      infoHash: this.torrentMetadata.infoHash,
      pieceCount: this.torrentMetadata.pieceCount,
      pieceLength: this.torrentMetadata.pieceLength,
      totalSize: this.torrentMetadata.totalSize,
      trackersCount: this.torrentMetadata.getTrackers().length,
    };
  }

  async start(): Promise<void> {
    if (this.isDownloading) {
      throw new Error('Download already in progress');
    }

    this.isDownloading = true;
    log('info', 'Starting BitTorrent download...');

    try {
      await this.discoverInitialPeers();
      await this.connectToInitialPeers();
      this.startDownloadLoop();
      await this.waitForCompletion();
      await this.finishDownload();
    } catch (error) {
      this.isDownloading = false;
      throw error;
    }
  }

  private initialPeers: Peer[] = [];

  private async discoverInitialPeers(): Promise<void> {
    log('info', 'Discovering peers from trackers...');
    this.initialPeers = await this.trackerManager.discoverPeers();
    log('pass', `Discovered ${this.initialPeers.length} unique peers`);

    this.trackerManager.startAutoRefresh();
    log('info', 'Started auto-refresh for peer discovery');
  }

  private async connectToInitialPeers(): Promise<void> {
    log('info', 'Connecting to peers...');
    await this.peerManager.connectToPeers(this.initialPeers);
    log('pass', `Successfully connected to ${this.peerManager.getConnectedPeersCount()} peers`);
  }

  private startDownloadLoop(): void {
    log('info', 'Starting download process...');
    this.lastPeerDiscovery = Date.now();

    this.downloadInterval = setInterval(async () => {
      await this.downloadTick();
    }, DOWNLOAD_REFRESH_INTERVAL);
  }

  private async downloadTick(): Promise<void> {
    this.pieceManager.cleanupExpiredRequests();

    const stats = this.getDownloadStats();
    this.logProgress(stats);

    await this.ensureMinimumPeers();

    if (stats.downloadProgress >= 100) {
      this.stopDownload();
    }
  }

  private async ensureMinimumPeers(): Promise<void> {
    const connectedPeers = this.peerManager.getConnectedPeersCount();
    const now = Date.now();

    if (connectedPeers < this.config.minConnectedPeers && now - this.lastPeerDiscovery > 30000) {
      log('info', `Only ${connectedPeers} peers connected, discovering more...`);

      try {
        const newPeers = await this.trackerManager.discoverPeers();
        if (newPeers.length > 0) {
          await this.peerManager.connectToPeers(newPeers);
          log('info', `Connected to ${this.peerManager.getConnectedPeersCount()} total peers`);
        }
        this.lastPeerDiscovery = now;
      } catch (error) {
        log('warn', `Failed to discover more peers: ${error}`);
      }
    }
  }

  private logProgress(stats: DownloadStats): void {
    const peerStatus = this.peerManager.getPeerStatus();

    log(
      'info',
      `Download progress: ${stats.downloadProgress.toFixed(2)}% (${stats.completedPieces}/${stats.totalPieces} pieces, ${stats.pendingRequests} pending requests)`
    );

    log(
      'debug',
      `Peer status: ${peerStatus.connected}/${peerStatus.total} connected (sent: ${peerStatus.handshakeSent}, received: ${peerStatus.handshakeReceived})`
    );
  }

  private stopDownload(): void {
    if (this.downloadInterval) {
      clearInterval(this.downloadInterval);
      this.downloadInterval = undefined;
    }
    log('pass', 'Download completed!');
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        if (this.getDownloadStats().downloadProgress >= 100) {
          clearInterval(checkCompletion);
          resolve();
        }
      }, 1000);
    });
  }

  private async finishDownload(): Promise<void> {
    try {
      await this.pieceManager.assembleCompleteFile();
      log('pass', 'File successfully assembled!');
    } catch (error) {
      log('fail', `Failed to assemble file: ${error}`);
      throw error;
    } finally {
      this.isDownloading = false;
    }
  }

  getDownloadStats(): DownloadStats {
    const pieceStats = this.pieceManager.getStats();
    const peerStatus = this.peerManager.getPeerStatus();

    return {
      ...pieceStats,
      connectedPeers: peerStatus.connected,
      totalPeersDiscovered: this.trackerManager.getTotalPeersCount(),
    };
  }

  updateTrackerStats(stats: TrackerStats): void {
    this.trackerManager.updateStats(stats);
  }

  async stop(): Promise<void> {
    this.isDownloading = false;

    if (this.downloadInterval) {
      clearInterval(this.downloadInterval);
      this.downloadInterval = undefined;
    }

    log('info', 'Stopping BitTorrent client...');

    this.peerManager.destroy();
    await this.trackerManager.destroy();

    log('info', 'BitTorrent client stopped');
  }
}
