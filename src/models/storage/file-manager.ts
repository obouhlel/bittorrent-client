import { log } from '@/utils/system/logging';
import type { TorrentMetadata } from '@/models/torrents/metadata';
import type { StorageFileInfo, ProgressInfo } from '@/types';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class FileManager {
  private metadata: TorrentMetadata;
  private downloadDir: string;
  private files: StorageFileInfo[] = [];
  private piecesDir: string;

  constructor(metadata: TorrentMetadata, downloadDir = './downloads') {
    this.metadata = metadata;
    this.downloadDir = downloadDir;
    this.piecesDir = path.join(downloadDir, '.pieces', this.metadata.name);
    this.initializeFiles();
  }

  private initializeFiles(): void {
    let offset = 0;

    if (this.metadata.isMultiFile) {
      const torrentFiles = this.metadata.getFiles();
      for (const file of torrentFiles || []) {
        this.files.push({
          path: path.join(this.downloadDir, this.metadata.name, file.path),
          length: file.length,
          offset,
        });
        offset += file.length;
      }
    } else {
      this.files.push({
        path: path.join(this.downloadDir, this.metadata.name),
        length: this.metadata.totalSize,
        offset: 0,
      });
    }
  }

  async initialize(): Promise<void> {
    // Créer les dossiers nécessaires
    await fs.mkdir(this.downloadDir, { recursive: true });
    await fs.mkdir(this.piecesDir, { recursive: true });

    // Créer les dossiers pour les fichiers multi-fichiers
    for (const file of this.files) {
      const dir = path.dirname(file.path);
      await fs.mkdir(dir, { recursive: true });
    }

    log('info', `File manager initialized in ${this.downloadDir}`);
  }

  async savePiece(pieceIndex: number, pieceData: Buffer): Promise<boolean> {
    try {
      // Vérifier le hash de la piece
      if (!(await this.verifyPieceHash(pieceIndex, pieceData))) {
        log('fail', `Piece ${pieceIndex} hash verification failed`);
        return false;
      }

      // Sauvegarder la piece dans le dossier temporaire
      const piecePath = path.join(this.piecesDir, `piece_${pieceIndex}.dat`);
      await fs.writeFile(piecePath, pieceData);

      log('debug', `Piece ${pieceIndex} saved to ${piecePath}`);
      return true;
    } catch (error) {
      log('fail', `Failed to save piece ${pieceIndex}: ${error}`);
      return false;
    }
  }

  async verifyPieceHash(pieceIndex: number, pieceData: Buffer): Promise<boolean> {
    const pieces = this.metadata.getPieces();
    const piece = pieces[pieceIndex];

    if (!piece) {
      log('fail', `Piece ${pieceIndex} not found in metadata`);
      return false;
    }

    const hash = crypto.createHash('sha1').update(pieceData).digest();
    const isValid = hash.equals(piece.hash);

    if (!isValid) {
      log(
        'fail',
        `Piece ${pieceIndex} hash mismatch. Expected: ${piece.hash.toString('hex')}, got: ${hash.toString('hex')}`
      );
    }

    return isValid;
  }

  async isPieceComplete(pieceIndex: number): Promise<boolean> {
    try {
      const piecePath = path.join(this.piecesDir, `piece_${pieceIndex}.dat`);
      await fs.access(piecePath);
      return true;
    } catch {
      return false;
    }
  }

  async reconstructFiles(): Promise<void> {
    log('info', 'Starting file reconstruction...');

    const totalPieces = this.metadata.pieceCount;
    const pieceLength = this.metadata.pieceLength;

    // Vérifier que toutes les pieces sont disponibles
    for (let i = 0; i < totalPieces; i++) {
      if (!(await this.isPieceComplete(i))) {
        throw new Error(`Piece ${i} is missing, cannot reconstruct files`);
      }
    }

    // Reconstruire chaque fichier
    for (const file of this.files) {
      await this.reconstructFile(file, pieceLength);
    }

    log('info', 'File reconstruction completed');
  }

  private async reconstructFile(file: StorageFileInfo, pieceLength: number): Promise<void> {
    log('info', `Reconstructing file: ${file.path}`);

    const fileHandle = await fs.open(file.path, 'w');
    let bytesWritten = 0;
    let fileOffset = file.offset;

    try {
      while (bytesWritten < file.length) {
        const pieceIndex = Math.floor(fileOffset / pieceLength);
        const pieceOffset = fileOffset % pieceLength;

        // Lire la piece
        const piecePath = path.join(this.piecesDir, `piece_${pieceIndex}.dat`);
        const pieceData = await fs.readFile(piecePath);

        // Calculer combien de bytes écrire depuis cette piece
        const remainingInFile = file.length - bytesWritten;
        const remainingInPiece = pieceData.length - pieceOffset;
        const bytesToWrite = Math.min(remainingInFile, remainingInPiece);

        // Écrire les données dans le fichier
        const dataToWrite = pieceData.subarray(pieceOffset, pieceOffset + bytesToWrite);
        await fileHandle.write(dataToWrite, 0, bytesToWrite, bytesWritten);

        bytesWritten += bytesToWrite;
        fileOffset += bytesToWrite;
      }

      log('info', `File reconstructed: ${file.path} (${bytesWritten} bytes)`);
    } finally {
      await fileHandle.close();
    }
  }

  async getDownloadProgress(): Promise<ProgressInfo> {
    const totalPieces = this.metadata.pieceCount;
    let completedPieces = 0;

    for (let i = 0; i < totalPieces; i++) {
      if (await this.isPieceComplete(i)) {
        completedPieces++;
      }
    }

    return {
      completed: completedPieces,
      total: totalPieces,
      percentage: Math.round((completedPieces / totalPieces) * 100),
    };
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.piecesDir, { recursive: true, force: true });
      log('info', 'Cleanup completed - temporary pieces removed');
    } catch (error) {
      log('fail', `Cleanup failed: ${error}`);
    }
  }
}
