import { log } from '~/utils/system/logging';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import type { Peer, DownloadConfig, DownloadStats } from '~/types';
import {
  categorizeConnectionError,
  shouldRetryError,
  getRetryDelay,
} from '~/utils/storage/connection-error';
import PeerConnection from '~/models/peer/connection';
import { FileManager } from '~/models/storage/file-manager';
import { PieceManager } from '~/models/peer/piece-manager';
import {
  formatTime,
  formatSpeed,
  sleep,
  calculateETA,
  calculateDownloadSpeed,
  logProgressUpdate,
  retryFailedPeers,
  cleanupDisconnectedPeers,
  shouldRetryPeers,
  getPeersToRetry,
} from '~/utils/storage/download';
import { analyzeSlowProgress, checkForStuckPieces } from '~/utils/storage/recovery';
import {
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_PROGRESS_INTERVAL,
  SLEEP_INTERVAL,
  ETA_INCREASE_THRESHOLD,
  ETA_INCREASE_COUNT_THRESHOLD,
  PROGRESS_LOG_INTERVAL,
  STUCK_PIECES_CHECK_INTERVAL,
  MIN_CONNECTIONS_FOR_FORCE_RETRY,
} from '~/utils/system/constants';

interface ITrackerManager {
  resetAndRetryAllTrackers(): Promise<Peer[]>;
}
export class DownloadManager {
  private metadata: TorrentMetadata;
  private config: DownloadConfig;
  private fileManager: FileManager;
  private pieceManager: PieceManager;
  private connections = new Map<string, PeerConnection>();
  private availablePeers: Peer[] = [];
  private failedPeers = new Set<string>();
  private blacklistedPeers = new Set<string>();
  private retryCount = new Map<string, number>();
  private retryDelays = new Map<string, number>();
  private progressTimer?: NodeJS.Timeout;
  private startTime = 0;
  private bytesDownloaded = 0;
  private isRunning = false;
  private isEnd = false;
  private lastETA = 0;
  private stuckPiecesTimer?: NodeJS.Timeout;
  private etaIncreaseCount = 0;
  private trackerManager?: ITrackerManager;
  private triggerImmediateConnection = false;

  constructor(metadata: TorrentMetadata, config: Partial<DownloadConfig> = {}) {
    this.metadata = metadata;
    this.config = {
      maxConnections: DEFAULT_MAX_CONNECTIONS,
      downloadDir: './downloads',
      connectTimeout: DEFAULT_CONNECT_TIMEOUT,
      retryAttempts: DEFAULT_RETRY_ATTEMPTS,
      progressInterval: DEFAULT_PROGRESS_INTERVAL,
      ...config,
    };

    this.fileManager = new FileManager(metadata, this.config.downloadDir);
    this.pieceManager = new PieceManager(
      metadata.pieceCount,
      metadata.pieceLength,
      this.fileManager,
      metadata
    );
  }

  async initialize(): Promise<void> {
    log('info', 'Initializing download manager...');
    await this.fileManager.initialize();

    await this.loadExistingProgress();

    log('info', `Download manager ready - Target: ${this.metadata.name}`);
    log('info', `Max connections: ${this.config.maxConnections}`);
    log('info', `Download directory: ${this.config.downloadDir}`);
  }

  getIsEnd(): boolean {
    return this.isEnd;
  }

  addPeers(peers: Peer[]): void {
    const newPeers = peers.filter((peer) => {
      const peerId = `${peer.ip}:${peer.port}`;
      return (
        !this.failedPeers.has(peerId) &&
        !this.blacklistedPeers.has(peerId) &&
        !this.connections.has(peerId)
      );
    });

    this.availablePeers.push(...newPeers);
    log(
      'info',
      `Added ${newPeers.length} new peers (${this.availablePeers.length} total, ${this.blacklistedPeers.size} blacklisted)`
    );

    if (this.isRunning && newPeers.length > 0) {
      log(
        'info',
        `Download is running - attempting immediate connection to ${newPeers.length} new peers`
      );

      this.triggerImmediateConnection = true;
    }
  }

  async startDownload(): Promise<void> {
    if (this.isRunning) {
      log('warn', 'Download already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    log('info', 'Starting download...');

    this.startProgressMonitoring();

    this.startStuckPiecesMonitoring();

    await this.maintainConnections();

    while (this.isRunning && !this.isDownloadComplete()) {
      await this.maintainConnections();

      if (this.triggerImmediateConnection) {
        this.triggerImmediateConnection = false;
        await this.maintainConnections();
      }

      if (this.connections.size === 0 && this.availablePeers.length > 0) {
        log(
          'warn',
          `No active connections, ${this.availablePeers.length} peers available for retry`
        );
      }

      await sleep(SLEEP_INTERVAL);
    }

    if (this.isDownloadComplete()) {
      await this.finishDownload();
    }
  }

  private async maintainConnections(): Promise<void> {
    this.cleanupConnections();

    const activeConnections = this.connections.size;
    const connectionsNeeded = Math.min(
      this.config.maxConnections - activeConnections,
      this.availablePeers.length
    );

    if (connectionsNeeded > 0) {
      const peersToConnect = this.availablePeers.splice(0, connectionsNeeded);
      await Promise.allSettled(peersToConnect.map((peer) => this.connectToPeer(peer)));
    }

    if (shouldRetryPeers(activeConnections) && this.failedPeers.size > 0) {
      const peersToRetry = getPeersToRetry(this.failedPeers);

      for (const peerId of peersToRetry) {
        this.failedPeers.delete(peerId);
        this.retryCount.delete(peerId);
        const parts = peerId.split(':');
        if (parts.length === 2 && parts[0] && parts[1]) {
          this.availablePeers.push({ ip: parts[0], port: parseInt(parts[1]) });
        }
      }
    }
  }

  private async connectToPeer(peer: Peer): Promise<void> {
    const peerId = `${peer.ip}:${peer.port}`;

    try {
      const connection = new PeerConnection(
        peer,
        this.metadata.infoHash,
        this.metadata,
        this.pieceManager
      );

      this.setupPeerCallbacks(connection);

      const connectPromise = connection.connect();
      const timeoutPromise = sleep(this.config.connectTimeout).then(() => {
        throw new Error('Connection timeout');
      });

      await Promise.race([connectPromise, timeoutPromise]);

      this.connections.set(peerId, connection);
      log('info', `Connected to peer ${connection.peerAddress} (${connection.connectionState})`);
    } catch (error) {
      const typedError = error as Error & { code?: string; errno?: string };
      await this.handlePeerConnectionError(peer, typedError);
    }
  }

  private setupPeerCallbacks(connection: PeerConnection): void {
    const originalOnPiece = connection.messageHandler.onPiece;
    connection.messageHandler.onPiece = (index: number, offset: number, data: Buffer) => {
      this.bytesDownloaded += data.length;
      if (originalOnPiece) {
        originalOnPiece(index, offset, data);
      }
    };
  }

  private async handlePeerConnectionError(
    peer: Peer,
    error: Error & { code?: string; errno?: string }
  ): Promise<void> {
    const peerId = `${peer.ip}:${peer.port}`;
    const currentAttempts = this.retryCount.get(peerId) || 0;
    const newAttempts = currentAttempts + 1;

    const action = categorizeConnectionError(error, peerId);
    const errorCode = error.code || error.errno;

    switch (action) {
      case 'blacklist':
        this.blacklistedPeers.add(peerId);
        this.failedPeers.delete(peerId);
        this.retryCount.delete(peerId);
        break;

      case 'ignore':
        this.failedPeers.add(peerId);
        break;

      case 'retry':
        this.retryCount.set(peerId, newAttempts);

        if (errorCode && shouldRetryError(errorCode, newAttempts, this.config.retryAttempts)) {
          const delay = getRetryDelay(newAttempts);
          this.retryDelays.set(peerId, Date.now() + delay);

          log(
            'debug',
            `Peer ${peerId} will retry in ${delay}ms (attempt ${newAttempts}/${this.config.retryAttempts})`
          );

          setTimeout(() => {
            const retryTime = this.retryDelays.get(peerId);
            if (retryTime && Date.now() >= retryTime) {
              this.retryDelays.delete(peerId);
              this.availablePeers.push(peer);
            }
          }, delay);
        } else {
          this.failedPeers.add(peerId);
        }
        break;
    }
  }

  private cleanupConnections(): void {
    cleanupDisconnectedPeers(this.connections);
  }

  private startProgressMonitoring(): void {
    let lastBytesDownloaded = this.bytesDownloaded;
    let stagnantCount = 0;

    this.progressTimer = setInterval(() => {
      const stats = this.getDownloadStats();

      if (this.bytesDownloaded === lastBytesDownloaded && stats.percentage < 100) {
        stagnantCount++;

        if (stagnantCount >= 5) {
          log(
            'warn',
            `Download stuck for ${stagnantCount * 2} seconds, resetting all peers and retrying trackers...`
          );
          this.handleStuckDownload();
          stagnantCount = 0;
        }
      } else {
        stagnantCount = 0;
        lastBytesDownloaded = this.bytesDownloaded;
      }

      const totalAvailablePieces = this.pieceManager.getTotalAvailablePieces();
      const avgPeerCompletion =
        this.connections.size > 0
          ? Math.round(totalAvailablePieces / Math.max(1, this.connections.size))
          : 0;

      if (this.isRunning) logProgressUpdate(stats, avgPeerCompletion);

      if (this.lastETA > 0 && stats.eta > this.lastETA * ETA_INCREASE_THRESHOLD) {
        this.etaIncreaseCount++;
        if (this.etaIncreaseCount >= ETA_INCREASE_COUNT_THRESHOLD) {
          log('warn', `ETA increasing, triggering recovery actions...`);
          this.handleSlowProgress();
          this.etaIncreaseCount = 0;
        }
      } else {
        this.etaIncreaseCount = 0;
      }
      this.lastETA = stats.eta;

      if (stats.percentage > 0 && stats.percentage % PROGRESS_LOG_INTERVAL === 0) {
        log(
          'info',
          `Download ${stats.percentage}% complete (${stats.completedPieces}/${stats.totalPieces} pieces)`
        );
      }
    }, this.config.progressInterval);
  }

  private forceRetryFailedPeers(): void {
    retryFailedPeers(this.failedPeers, this.availablePeers, this.retryCount);
  }

  private handleSlowProgress(): void {
    analyzeSlowProgress(this.pieceManager, this.connections);

    if (this.connections.size < MIN_CONNECTIONS_FOR_FORCE_RETRY) {
      log('info', 'Low connection count, forcing peer retry...');
      this.forceRetryFailedPeers();
    }
  }

  private startStuckPiecesMonitoring(): void {
    this.stuckPiecesTimer = setInterval(() => {
      this.checkForStuckPieces();
    }, STUCK_PIECES_CHECK_INTERVAL);
  }

  private checkForStuckPieces(): void {
    checkForStuckPieces(this.pieceManager, this.connections);

    this.pieceManager.cleanupStuckDownloadingPieces();
  }

  private handleStuckDownload(): void {
    log('info', 'Triggering stuck download recovery via tracker manager...');

    if (this.trackerManager) {
      this.trackerManager.resetAndRetryAllTrackers();
    }
  }

  private getDownloadStats(): DownloadStats {
    const pieceStats = this.pieceManager.getCompletionStats();
    const elapsed = Date.now() - this.startTime;
    const downloadSpeed = calculateDownloadSpeed(this.bytesDownloaded, elapsed);
    const remaining = Math.max(0, this.metadata.totalSize - this.bytesDownloaded);
    const eta = calculateETA(remaining, downloadSpeed);

    return {
      totalPieces: pieceStats.total,
      completedPieces: pieceStats.completed,
      activePeers: this.connections.size,
      downloadSpeed,
      uploadSpeed: 0,
      eta,
      percentage: pieceStats.percentage,
    };
  }

  private async loadExistingProgress(): Promise<void> {
    const progress = await this.fileManager.getDownloadProgress();
    log(
      'info',
      `Existing progress: ${progress.percentage}% (${progress.completed}/${progress.total} pieces)`
    );
  }

  private isDownloadComplete(): boolean {
    return this.pieceManager.isDownloadComplete();
  }

  private async finishDownload(): Promise<void> {
    log('info', 'Download complete! Finalizing...');

    const stats = this.pieceManager.getCompletionStats();
    if (stats.completed !== stats.total) {
      log(
        'fail',
        `Download not actually complete: ${stats.completed}/${stats.total} pieces completed`
      );

      this.identifyAndRelaunchMissingPieces();

      log('info', 'Continuing download to fetch missing pieces...');
      return;
    }

    log('info', `All ${stats.total} pieces confirmed complete, proceeding with reconstruction`);

    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }

    if (this.stuckPiecesTimer) {
      clearInterval(this.stuckPiecesTimer);
    }

    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();

    await this.pieceManager.finishDownload();

    this.isRunning = false;

    const totalTime = (Date.now() - this.startTime) / 1000;
    const avgSpeed = this.metadata.totalSize / totalTime;

    log('pass', `Download completed successfully!`);
    log('info', `Total time: ${formatTime(totalTime)}`);
    log('info', `Average speed: ${formatSpeed(avgSpeed)}`);
    log('info', `Files saved to: ${this.config.downloadDir}`);
    this.isEnd = true;
  }

  async stop(): Promise<void> {
    log('info', 'Stopping download...');
    this.isRunning = false;

    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }

    if (this.stuckPiecesTimer) {
      clearInterval(this.stuckPiecesTimer);
    }

    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
    this.isEnd = true;
  }

  resetAllPeers(): void {
    log('warn', 'Resetting all peer connections and clearing peer lists');

    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();

    this.availablePeers = [];
    this.failedPeers.clear();
    this.blacklistedPeers.clear();
    this.retryCount.clear();
    this.retryDelays.clear();

    log('info', 'All peers reset, ready for new peer discovery');
  }

  private identifyAndRelaunchMissingPieces(): void {
    const missingPieces: number[] = [];
    const stats = this.pieceManager.getCompletionStats();

    for (let i = 0; i < stats.total; i++) {
      const piece = this.pieceManager.getPiece(i);
      if (!piece || !piece.completed) {
        missingPieces.push(i);
      }
    }

    log(
      'warn',
      `Found ${missingPieces.length} missing pieces: ${missingPieces.slice(0, 20).join(', ')}${missingPieces.length > 20 ? '...' : ''}`
    );

    for (const pieceIndex of missingPieces) {
      this.pieceManager.resetPieceDownloadStatus(pieceIndex);

      this.requestPieceFromAllPeers(pieceIndex);
    }

    this.forceRetryFailedPeers();

    this.triggerImmediateConnection = true;

    log('info', 'Missing pieces reset and immediate reconnection triggered');
  }

  private requestPieceFromAllPeers(pieceIndex: number): void {
    let requestsCount = 0;

    for (const connection of this.connections.values()) {
      if (connection.isConnected && !connection.messageHandler.chokedStatus) {
        const peerPieceCount = connection.peerPieceCount;
        if (peerPieceCount > pieceIndex) {
          connection.requestPiece(pieceIndex);
          requestsCount++;
        }
      }
    }

    if (requestsCount === 0) {
      log('warn', `No available peers found for missing piece ${pieceIndex}`);
    } else {
      log('info', `Requested missing piece ${pieceIndex} from ${requestsCount} peers`);
    }
  }

  setTrackerManager(trackerManager: ITrackerManager): void {
    this.trackerManager = trackerManager;
  }

  get currentStats(): DownloadStats {
    return this.getDownloadStats();
  }
}
