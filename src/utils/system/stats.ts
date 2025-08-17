import type { PieceManagerStats } from '~/types';

export interface DownloadStats extends PieceManagerStats {
  connectedPeers: number;
  totalPeersDiscovered: number;
}

export function formatDownloadProgress(stats: DownloadStats): string {
  return `${stats.downloadProgress.toFixed(2)}% (${stats.completedPieces}/${stats.totalPieces} pieces)`;
}

export function formatPeerStatus(connectedPeers: number, totalPeers: number): string {
  return `${connectedPeers}/${totalPeers} peers connected`;
}

export function calculateDownloadSpeed(
  currentBytes: number,
  previousBytes: number,
  timeInterval: number
): number {
  return (currentBytes - previousBytes) / (timeInterval / 1000);
}

export function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}
