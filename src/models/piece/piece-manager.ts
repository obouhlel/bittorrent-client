import type { PieceInfo, PieceBlock, PieceManagerStats } from '~/types';
import { TorrentMetadata } from '~/models/torrents/metadata';
import { DEFAULT_DOWNLOAD_PATH, MAX_PENDING_REQUESTS } from '~/utils/system/constants';
import { log } from '~/utils/system/logging';
import {
  createBlocksForPiece,
  assemblePieceData,
  updateBlockProgress,
} from '~/utils/storage/block-utils';
import { verifyPieceHash } from '~/utils/storage/hash-verification';
import { savePieceToFile, assembleCompleteFile } from '~/utils/storage/file-operations';
import { RequestManager } from '~/models/piece/request-manager';

export class PieceManager {
  private pieces: Map<number, PieceInfo>;
  private completedPieces: Set<number>;
  private requestManager: RequestManager;
  private downloadPath: string;
  private torrentMetadata: TorrentMetadata;
  private totalPieces: number;
  private pieceLength: number;
  private lastPieceLength: number;

  constructor(torrentMetadata: TorrentMetadata, downloadPath: string = DEFAULT_DOWNLOAD_PATH) {
    this.pieces = new Map<number, PieceInfo>();
    this.completedPieces = new Set<number>();
    this.requestManager = new RequestManager();
    this.torrentMetadata = torrentMetadata;
    this.downloadPath = downloadPath;
    this.totalPieces = torrentMetadata.pieces.length / 20;
    this.pieceLength = torrentMetadata.pieceLength;
    this.lastPieceLength = torrentMetadata.totalSize % this.pieceLength || this.pieceLength;

    this.initializePieces();
  }

  private initializePieces(): void {
    for (let i = 0; i < this.totalPieces; i++) {
      const pieceSize = i === this.totalPieces - 1 ? this.lastPieceLength : this.pieceLength;
      const blocks = createBlocksForPiece(i, pieceSize);
      const hash = new Uint8Array(this.torrentMetadata.pieces.slice(i * 20, (i + 1) * 20));

      this.pieces.set(i, {
        index: i,
        size: pieceSize,
        hash,
        blocks,
        completed: false,
        verified: false,
        downloadProgress: 0,
      });
    }
  }

  getNextPieceToRequest(availablePieces: Set<number>): number | null {
    for (const pieceIndex of availablePieces) {
      const piece = this.pieces.get(pieceIndex);
      if (
        piece &&
        !piece.completed &&
        this.requestManager.getPendingRequestsForPiece(pieceIndex) < MAX_PENDING_REQUESTS
      ) {
        return pieceIndex;
      }
    }
    return null;
  }

  getNextBlockToRequest(pieceIndex: number): PieceBlock | null {
    const piece = this.pieces.get(pieceIndex);
    if (!piece || piece.completed) return null;

    return (
      piece.blocks.find(
        (block) => !block.completed && !this.requestManager.isBlockPending(pieceIndex, block.begin)
      ) || null
    );
  }

  requestBlock(pieceIndex: number, begin: number, length: number, peerId: string): boolean {
    return this.requestManager.addRequest(pieceIndex, begin, length, peerId);
  }

  async receiveBlock(
    pieceIndex: number,
    begin: number,
    data: Uint8Array,
    peerId: string
  ): Promise<boolean> {
    const piece = this.pieces.get(pieceIndex);
    if (!piece) return false;

    const block = piece.blocks.find((b) => b.begin === begin);
    if (!block || block.completed) return false;

    this.requestManager.removeRequest(pieceIndex, begin, peerId);

    block.data = data;
    block.completed = true;

    piece.downloadProgress = updateBlockProgress(piece.blocks);

    if (this.isPieceComplete(pieceIndex)) {
      return await this.completePiece(pieceIndex);
    }

    return true;
  }

  private isPieceComplete(pieceIndex: number): boolean {
    const piece = this.pieces.get(pieceIndex);
    return piece ? piece.blocks.every((block) => block.completed) : false;
  }

  private async completePiece(pieceIndex: number): Promise<boolean> {
    const piece = this.pieces.get(pieceIndex);
    if (!piece) return false;

    const pieceData = assemblePieceData(piece.blocks);

    if (!verifyPieceHash(pieceData, piece.hash)) {
      log('warn', `Piece ${pieceIndex} hash verification failed, resetting`);
      this.resetPiece(pieceIndex);
      return false;
    }

    piece.completed = true;
    piece.verified = true;
    this.completedPieces.add(pieceIndex);

    await savePieceToFile(pieceIndex, pieceData, this.downloadPath);
    log('info', `Piece ${pieceIndex} completed and saved`);

    return true;
  }

  private resetPiece(pieceIndex: number): void {
    const piece = this.pieces.get(pieceIndex);
    if (!piece) return;

    piece.completed = false;
    piece.verified = false;
    piece.downloadProgress = 0;

    for (const block of piece.blocks) {
      block.completed = false;
      block.data = undefined;
    }

    this.completedPieces.delete(pieceIndex);
    this.requestManager.clearRequestsForPiece(pieceIndex);
  }

  cleanupExpiredRequests(): void {
    this.requestManager.cleanupExpiredRequests();
  }

  getPieceInfo(pieceIndex: number): PieceInfo | undefined {
    return this.pieces.get(pieceIndex);
  }

  getCompletedPieces(): Set<number> {
    return new Set(this.completedPieces);
  }

  getAvailablePieces(): Set<number> {
    return new Set(
      Array.from(this.pieces.keys()).filter((index) => !this.completedPieces.has(index))
    );
  }

  getStats(): PieceManagerStats {
    return {
      totalPieces: this.totalPieces,
      completedPieces: this.completedPieces.size,
      downloadProgress:
        this.totalPieces === 0 ? 100 : (this.completedPieces.size / this.totalPieces) * 100,
      pendingRequests: this.requestManager.getRequestCount(),
    };
  }

  hasPiece(pieceIndex: number): boolean {
    return this.completedPieces.has(pieceIndex);
  }

  getTotalPieces(): number {
    return this.totalPieces;
  }

  async assembleCompleteFile(): Promise<void> {
    if (this.completedPieces.size !== this.totalPieces) {
      throw new Error('Cannot assemble file: not all pieces are downloaded');
    }

    const fileName = this.torrentMetadata.name || 'downloaded_file';
    await assembleCompleteFile(this.totalPieces, this.pieceLength, this.downloadPath, fileName);
  }
}
