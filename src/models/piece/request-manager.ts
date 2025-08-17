import type { PendingRequest } from '~/types';
import { PIECE_TIMEOUT } from '~/config';
import { log } from '~/utils/system/logging';

export class RequestManager {
  private pendingRequests: Map<string, PendingRequest>;

  constructor() {
    this.pendingRequests = new Map<string, PendingRequest>();
  }

  addRequest(pieceIndex: number, begin: number, length: number, peerId: string): boolean {
    const requestKey = this.getRequestKey(pieceIndex, begin, peerId);

    if (this.pendingRequests.has(requestKey)) {
      return false;
    }

    this.pendingRequests.set(requestKey, {
      pieceIndex,
      begin,
      length,
      requestTime: Date.now(),
      peerId,
    });

    log(
      'debug',
      `Added request: piece ${pieceIndex}, begin ${begin}, length ${length} from ${peerId}`
    );
    return true;
  }

  removeRequest(pieceIndex: number, begin: number, peerId: string): boolean {
    const requestKey = this.getRequestKey(pieceIndex, begin, peerId);
    return this.pendingRequests.delete(requestKey);
  }

  getPendingRequestsForPiece(pieceIndex: number): number {
    return Array.from(this.pendingRequests.values()).filter(
      (request) => request.pieceIndex === pieceIndex
    ).length;
  }

  isBlockPending(pieceIndex: number, begin: number): boolean {
    return Array.from(this.pendingRequests.values()).some(
      (request) => request.pieceIndex === pieceIndex && request.begin === begin
    );
  }

  clearRequestsForPiece(pieceIndex: number): void {
    for (const [key, request] of this.pendingRequests.entries()) {
      if (request.pieceIndex === pieceIndex) {
        this.pendingRequests.delete(key);
      }
    }
  }

  cleanupExpiredRequests(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.requestTime > PIECE_TIMEOUT) {
        this.pendingRequests.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log('debug', `Cleaned up ${cleanedCount} expired requests`);
    }
  }

  getRequestCount(): number {
    return this.pendingRequests.size;
  }

  private getRequestKey(pieceIndex: number, begin: number, peerId: string): string {
    return `${pieceIndex}-${begin}-${peerId}`;
  }
}
