import { log } from '~/utils/system/logging';
import { DEFAULT_PIECE_SIZE } from '~/utils/system/constants';
import type { FileManager } from '~/models/storage/file-manager';
import type { PieceInfo, ITorrentMetadata } from '~/types';
import { checkBitfield, setBitfield, countBits, createBitfield } from '~/utils/protocol/bitfield';

export class PieceManager {
  private pieces = new Map<number, PieceInfo>();
  private peerBitfields = new Map<string, Buffer>();
  private ourBitfield: Buffer;
  private totalPieces: number;
  private pieceLength: number;
  private fileManager?: FileManager;
  private metadata?: ITorrentMetadata;

  constructor(
    totalPieces: number,
    pieceLength: number = DEFAULT_PIECE_SIZE,
    fileManager?: FileManager,
    metadata?: ITorrentMetadata
  ) {
    this.totalPieces = totalPieces;
    this.pieceLength = pieceLength;
    this.fileManager = fileManager;
    this.metadata = metadata;
    this.ourBitfield = createBitfield(totalPieces);

    for (let i = 0; i < totalPieces; i++) {
      const correctPieceLength = this.getPieceSize(i);
      this.pieces.set(i, {
        index: i,
        length: correctPieceLength,
        completed: false,
        downloading: false,
        blocks: new Map(),
      });
    }
  }

  private getPieceSize(pieceIndex: number): number {
    if (this.metadata) {
      return this.metadata.getPieceSize(pieceIndex);
    }

    return this.pieceLength;
  }

  setPeerBitfield(peerId: string, bitfield: Buffer): void {
    this.peerBitfields.set(peerId, bitfield);
  }

  peerHasPiece(pieceIndex: number, peerId?: string): boolean {
    if (pieceIndex >= this.totalPieces) return false;

    if (peerId) {
      const bitfield = this.peerBitfields.get(peerId);
      if (!bitfield) return false;
      return checkBitfield(bitfield, pieceIndex);
    }

    for (const bitfield of this.peerBitfields.values()) {
      if (checkBitfield(bitfield, pieceIndex)) {
        return true;
      }
    }
    return false;
  }

  weHavePiece(pieceIndex: number): boolean {
    if (pieceIndex >= this.totalPieces) return false;
    return checkBitfield(this.ourBitfield, pieceIndex);
  }

  async markPieceCompleted(pieceIndex: number): Promise<void> {
    const piece = this.pieces.get(pieceIndex);
    if (!piece || pieceIndex >= this.totalPieces) return;

    const pieceData = this.assemblePieceFromBlocks(piece);
    if (!pieceData) {
      log('fail', `Cannot assemble piece ${pieceIndex} from blocks`);
      return;
    }

    if (this.fileManager) {
      const saved = await this.fileManager.savePiece(pieceIndex, pieceData);
      if (!saved) {
        log('fail', `Failed to save piece ${pieceIndex} to disk`);
        return;
      }
    }

    piece.completed = true;
    piece.downloading = false;
    piece.blocks.clear();
    setBitfield(this.ourBitfield, pieceIndex);

    log('pass', `Piece ${pieceIndex} completed and saved`);
  }

  getNextPieceToDownload(fromPeerId?: string): number | null {
    this.cleanupStuckDownloadingPieces();

    return this.getNextPieceNormal(fromPeerId);
  }

  private getNextPieceNormal(fromPeerId?: string): number | null {
    const pieceRarity = new Map<number, number>();

    for (let i = 0; i < this.totalPieces; i++) {
      const piece = this.pieces.get(i);

      if (piece && !piece.completed && !piece.downloading) {
        let rarity = 0;
        for (const [, bitfield] of this.peerBitfields.entries()) {
          if (checkBitfield(bitfield, i)) {
            rarity++;
          }
        }
        if (rarity > 0 && (fromPeerId ? this.peerHasPiece(i, fromPeerId) : true)) {
          pieceRarity.set(i, rarity);
        }
      }
    }

    if (pieceRarity.size === 0) return null;

    const sortedPieces = Array.from(pieceRarity.entries()).sort((a, b) => a[1] - b[1]);

    const topRarest = sortedPieces.slice(0, Math.min(3, sortedPieces.length));
    const randomChoice = topRarest[Math.floor(Math.random() * topRarest.length)];
    if (!randomChoice) return null;
    const selectedPiece = randomChoice[0];

    const piece = this.pieces.get(selectedPiece);
    if (piece && !piece.downloading) {
      piece.downloading = true;
      piece.downloadStartTime = Date.now();
      return selectedPiece;
    }

    return null;
  }

  addPieceBlock(pieceIndex: number, offset: number, data: Buffer): void {
    const piece = this.pieces.get(pieceIndex);
    if (piece && !piece.completed) {
      piece.blocks.set(offset, data);

      if (this.isPieceComplete(pieceIndex)) {
        piece.downloading = false;

        this.markPieceCompleted(pieceIndex).catch((error) => {
          log('fail', `Failed to complete piece ${pieceIndex}: ${error}`);
        });
      }
    }
  }

  private isPieceComplete(pieceIndex: number): boolean {
    const piece = this.pieces.get(pieceIndex);
    if (!piece) return false;

    let totalSize = 0;
    for (const data of piece.blocks.values()) {
      totalSize += data.length;
    }

    return totalSize >= piece.length;
  }

  countPeerPieces(peerId?: string): number {
    if (peerId) {
      const bitfield = this.peerBitfields.get(peerId);
      if (!bitfield) return 0;
      return countBits(bitfield, this.totalPieces);
    }

    const availablePieces = new Set<number>();
    for (let i = 0; i < this.totalPieces; i++) {
      if (this.peerHasPiece(i)) {
        availablePieces.add(i);
      }
    }
    return availablePieces.size;
  }

  getCompletionStats(): { completed: number; total: number; percentage: number } {
    let completed = 0;
    for (const piece of this.pieces.values()) {
      if (piece.completed) completed++;
    }

    const rawPercentage = (completed / this.totalPieces) * 100;
    const percentage = completed === this.totalPieces ? 100 : Math.floor(rawPercentage);

    return {
      completed,
      total: this.totalPieces,
      percentage,
    };
  }

  isInterestedInPeer(peerId?: string): boolean {
    for (let i = 0; i < this.totalPieces; i++) {
      if (this.peerHasPiece(i, peerId) && !this.weHavePiece(i)) {
        return true;
      }
    }
    return false;
  }

  getPiece(pieceIndex: number): PieceInfo | undefined {
    return this.pieces.get(pieceIndex);
  }

  getOurBitfield(): Buffer {
    return this.ourBitfield;
  }

  private assemblePieceFromBlocks(piece: PieceInfo): Buffer | null {
    if (piece.blocks.size === 0) return null;

    const sortedBlocks = Array.from(piece.blocks.entries()).sort(([a], [b]) => a - b);

    let totalSize = 0;
    let expectedOffset = 0;

    for (const [offset, data] of sortedBlocks) {
      if (offset !== expectedOffset) {
        log('fail', `Missing block at offset ${expectedOffset} for piece ${piece.index}`);
        return null;
      }
      totalSize += data.length;
      expectedOffset += data.length;
    }

    const pieceData = Buffer.allocUnsafe(totalSize);
    let position = 0;

    for (const [, data] of sortedBlocks) {
      data.copy(pieceData, position);
      position += data.length;
    }

    return pieceData;
  }

  async finishDownload(): Promise<void> {
    if (!this.fileManager) {
      log('fail', 'No FileManager available to reconstruct files');
      return;
    }

    if (!this.isDownloadComplete()) {
      const stats = this.getCompletionStats();
      const missingPieces = this.getMissingPieces();
      const stuckPieces = this.getStuckPieces();
      log(
        'fail',
        `Download not complete: ${stats.percentage}% (${missingPieces.length} missing, ${stuckPieces.length} stuck)`
      );
      return;
    }

    log('info', 'Download complete, reconstructing files...');
    await this.fileManager.reconstructFiles();

    log('info', 'Cleaning up temporary files...');
    await this.fileManager.cleanup();

    log('info', 'Files reconstructed successfully!');
  }

  removePeer(peerId: string): void {
    this.peerBitfields.delete(peerId);
  }

  getTotalAvailablePieces(): number {
    return this.countPeerPieces();
  }

  getMissingPieces(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.totalPieces; i++) {
      const piece = this.pieces.get(i);
      if (piece && !piece.completed) {
        missing.push(i);
      }
    }
    return missing;
  }

  isDownloadComplete(): boolean {
    for (let i = 0; i < this.totalPieces; i++) {
      const piece = this.pieces.get(i);
      if (!piece || !piece.completed) {
        return false;
      }
    }

    const downloadingCount = this.getDownloadingPiecesCount();
    if (downloadingCount > 0) {
      return false;
    }

    const completedBits = countBits(this.ourBitfield, this.totalPieces);
    if (completedBits !== this.totalPieces) {
      log(
        'debug',
        `Download not complete: bitfield shows ${completedBits}/${this.totalPieces} pieces`
      );
      return false;
    }

    return true;
  }

  getStuckPieces(): number[] {
    const stuck: number[] = [];
    for (let i = 0; i < this.totalPieces; i++) {
      const piece = this.pieces.get(i);
      if (piece && !piece.completed && piece.downloading) {
        stuck.push(i);
      }
    }
    return stuck;
  }

  getPeersWithPiece(pieceIndex: number): string[] {
    const peersWithPiece: string[] = [];
    for (const [peerId, bitfield] of this.peerBitfields.entries()) {
      if (checkBitfield(bitfield, pieceIndex)) {
        peersWithPiece.push(peerId);
      }
    }
    return peersWithPiece;
  }

  /**
   * Nettoyer les pièces bloquées en statut "downloading" depuis trop longtemps
   */
  cleanupStuckDownloadingPieces(): void {
    const now = Date.now();
    const DOWNLOAD_TIMEOUT = 30000;

    for (const [_, piece] of this.pieces.entries()) {
      if (
        piece.downloading &&
        piece.downloadStartTime &&
        now - piece.downloadStartTime > DOWNLOAD_TIMEOUT
      ) {
        piece.downloading = false;
        piece.downloadStartTime = undefined;
      }
    }
  }

  resetPieceDownloadStatus(pieceIndex: number): void {
    const piece = this.pieces.get(pieceIndex);
    if (piece) {
      piece.downloading = false;
      piece.blocks.clear();
    }
  }

  getDownloadingPiecesCount(): number {
    let count = 0;
    for (const piece of this.pieces.values()) {
      if (piece.downloading) count++;
    }
    return count;
  }

  forceResetStuckPieces(): number {
    const stuckPieces = this.getStuckPieces();
    let resetCount = 0;

    for (const pieceIndex of stuckPieces) {
      this.resetPieceDownloadStatus(pieceIndex);
      resetCount++;
    }

    if (resetCount > 0) {
      log('info', `Force reset ${resetCount} stuck pieces to resume download`);
    }

    return resetCount;
  }
}
