import { log } from '@/utils/system/logging';
import { DEFAULT_PIECE_SIZE } from '@/utils/system/constants';
import type { FileManager } from '@/models/storage/file-manager';
import type { PieceInfo, ITorrentMetadata } from '@/types';
import { checkBitfield, setBitfield, countBits, createBitfield } from '@/utils/protocol/bitfield';

export class PieceManager {
  private pieces = new Map<number, PieceInfo>();
  private peerBitfields = new Map<string, Buffer>(); // peerId -> bitfield
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
    // Créer notre bitfield (tous à 0 = on n'a aucune piece)
    this.ourBitfield = createBitfield(totalPieces);

    // Initialiser toutes les pieces avec les bonnes tailles
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
    const peerPieces = this.countPeerPieces(peerId);
    const completion = Math.round((peerPieces / this.totalPieces) * 100);
    log(
      'debug',
      `Peer ${peerId} has ${peerPieces}/${this.totalPieces} pieces (${completion}% complete)`
    );
  }

  peerHasPiece(pieceIndex: number, peerId?: string): boolean {
    if (pieceIndex >= this.totalPieces) return false;

    // Si un peerId spécifique est demandé
    if (peerId) {
      const bitfield = this.peerBitfields.get(peerId);
      if (!bitfield) return false;
      return checkBitfield(bitfield, pieceIndex);
    }

    // Sinon, vérifier si au moins un peer a cette piece
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

    // Reconstruire la piece complète à partir des blocs
    const pieceData = this.assemblePieceFromBlocks(piece);
    if (!pieceData) {
      log('fail', `Cannot assemble piece ${pieceIndex} from blocks`);
      return;
    }

    // Sauvegarder sur disque si FileManager est disponible
    if (this.fileManager) {
      const saved = await this.fileManager.savePiece(pieceIndex, pieceData);
      if (!saved) {
        log('fail', `Failed to save piece ${pieceIndex} to disk`);
        return;
      }
    }

    piece.completed = true;
    piece.downloading = false;
    piece.blocks.clear(); // Libérer la mémoire

    // Mettre à jour notre bitfield
    setBitfield(this.ourBitfield, pieceIndex);

    log('info', `Piece ${pieceIndex} completed and saved`);
  }

  getNextPieceToDownload(fromPeerId?: string): number | null {
    // D'abord, nettoyer les pièces bloquées
    this.cleanupStuckDownloadingPieces();

    return this.getNextPieceNormal(fromPeerId);
  }

  private getNextPieceNormal(fromPeerId?: string): number | null {
    const pieceRarity = new Map<number, number>();

    // Calculer la rareté de chaque piece (combien de peers l'ont)
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

    // Log debug des états des pièces

    if (pieceRarity.size === 0) return null;

    // Trier par rareté (moins de peers = plus rare = priorité haute)
    const sortedPieces = Array.from(pieceRarity.entries()).sort((a, b) => a[1] - b[1]);

    // Prendre une des 3 pieces les plus rares (randomisation partielle)
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

      // Vérifier si la piece est complète
      if (this.isPieceComplete(pieceIndex)) {
        piece.downloading = false; // Libérer immédiatement
        // Marquer comme complète de manière asynchrone
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

    // Compter les pieces uniques disponibles chez tous les peers
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

    // Ne jamais afficher 100% tant que toutes les pièces ne sont pas téléchargées
    const rawPercentage = (completed / this.totalPieces) * 100;
    const percentage = completed === this.totalPieces ? 100 : Math.floor(rawPercentage);

    return {
      completed,
      total: this.totalPieces,
      percentage,
    };
  }

  isInterestedInPeer(peerId?: string): boolean {
    // On est intéressé si le peer a des pieces qu'on n'a pas
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

    // Trier les blocs par offset
    const sortedBlocks = Array.from(piece.blocks.entries()).sort(([a], [b]) => a - b);

    // Vérifier la continuité et assembler
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

    // Assembler les blocs
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

    // Nettoyer les pieces temporaires après reconstruction
    log('info', 'Cleaning up temporary files...');
    await this.fileManager.cleanup();

    log('info', 'Files reconstructed successfully!');
  }

  removePeer(peerId: string): void {
    this.peerBitfields.delete(peerId);
    log('debug', `Removed peer ${peerId} from piece manager`);
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
    // Vérifier que toutes les pièces sont marquées comme complètes
    for (let i = 0; i < this.totalPieces; i++) {
      const piece = this.pieces.get(i);
      if (!piece || !piece.completed) {
        return false;
      }
    }

    // Vérifier qu'aucune pièce n'est en cours de téléchargement
    const downloadingCount = this.getDownloadingPiecesCount();
    if (downloadingCount > 0) {
      log('debug', `Download not complete: ${downloadingCount} pieces still downloading`);
      return false;
    }

    // Vérifier que notre bitfield est complet
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
    const DOWNLOAD_TIMEOUT = 30000; // 30 secondes
    let cleanedCount = 0;

    for (const [index, piece] of this.pieces.entries()) {
      if (
        piece.downloading &&
        piece.downloadStartTime &&
        now - piece.downloadStartTime > DOWNLOAD_TIMEOUT
      ) {
        log(
          'debug',
          `Cleaning up stuck piece ${index} (downloading for ${(now - piece.downloadStartTime) / 1000}s)`
        );
        piece.downloading = false;
        piece.downloadStartTime = undefined;
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log('debug', `Cleaned up ${cleanedCount} stuck downloading pieces`);
    }
  }

  resetPieceDownloadStatus(pieceIndex: number): void {
    const piece = this.pieces.get(pieceIndex);
    if (piece) {
      piece.downloading = false;
      piece.blocks.clear();
      log('debug', `Reset download status for piece ${pieceIndex}`);
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
