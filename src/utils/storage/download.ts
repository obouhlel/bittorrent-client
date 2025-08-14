import { log } from '~/utils/system/logging';
import type { Peer, DownloadStats } from '~/types';
import type PeerConnection from '~/models/peer/connection';
import {
  BYTES_TO_KB,
  SECONDS_TO_MS,
  MINUTES_TO_SECONDS,
  HOURS_TO_SECONDS,
  MIN_ACTIVE_CONNECTIONS,
  RETRY_PEER_LIMIT,
  MAX_FAILED_PEERS_TO_RETRY,
} from '~/utils/system/constants';

export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '∞';

  const hours = Math.floor(seconds / HOURS_TO_SECONDS);
  const minutes = Math.floor((seconds % HOURS_TO_SECONDS) / MINUTES_TO_SECONDS);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${(bytesPerSecond / BYTES_TO_KB).toFixed(1)} KB/s`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateETA(bytesRemaining: number, downloadSpeed: number): number {
  if (downloadSpeed <= 0 || bytesRemaining <= 0) return 0;
  const eta = bytesRemaining / downloadSpeed;
  return Math.max(0, Math.min(eta, 86400)); // Max 24 heures
}

export function calculateDownloadSpeed(bytesDownloaded: number, elapsedMs: number): number {
  const elapsed = elapsedMs / SECONDS_TO_MS;
  return elapsed > 0 ? bytesDownloaded / elapsed : 0;
}

export function logProgressUpdate(stats: DownloadStats, avgPeerCompletion: number): void {
  log(
    'info',
    `Progress: ${stats.percentage}% | Speed: ${formatSpeed(stats.downloadSpeed)} | Peers: ${stats.activePeers} (avg: ${avgPeerCompletion} pieces) | ETA: ${formatTime(stats.eta)}`
  );
}

export function retryFailedPeers(
  failedPeers: Set<string>,
  availablePeers: Peer[],
  retryCount: Map<string, number>,
  limit: number = MAX_FAILED_PEERS_TO_RETRY
): number {
  const failedPeersArray = Array.from(failedPeers);
  const peersToRetry = failedPeersArray.slice(0, limit);

  for (const peerId of peersToRetry) {
    failedPeers.delete(peerId);
    retryCount.delete(peerId);
    const parts = peerId.split(':');
    if (parts.length === 2 && parts[0] && parts[1]) {
      availablePeers.push({ ip: parts[0], port: parseInt(parts[1]) });
    }
  }

  if (peersToRetry.length > 0) {
    log('info', `Retrying ${peersToRetry.length} failed peers`);
  }

  return peersToRetry.length;
}

export function cleanupDisconnectedPeers(connections: Map<string, PeerConnection>): string[] {
  const toRemove: string[] = [];

  for (const [peerId, connection] of connections.entries()) {
    if (!connection.isConnected) {
      const stats = connection.pieceStats;
      log(
        'debug',
        `Removing disconnected peer ${connection.peerAddress} (downloaded: ${stats.completed} pieces)`
      );
      connection.close();
      toRemove.push(peerId);
    }
  }

  toRemove.forEach((peerId) => connections.delete(peerId));

  return toRemove;
}

export function shouldRetryPeers(activeConnections: number): boolean {
  return activeConnections < MIN_ACTIVE_CONNECTIONS;
}

export function getPeersToRetry(
  failedPeers: Set<string>,
  limit: number = RETRY_PEER_LIMIT
): string[] {
  return Array.from(failedPeers).slice(0, limit);
}
