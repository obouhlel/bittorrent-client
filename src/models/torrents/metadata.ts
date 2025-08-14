import type { TorrentFile, FileInfo, Piece, ITorrentMetadata } from '@/types/torrent';
import type { Tracker } from '@/types/network';
import { calculateInfoHash } from '@/utils/torrent/hash';
import { validateTorrent } from '@/utils/torrent/validator';

export class TorrentMetadata implements ITorrentMetadata {
  private torrent: TorrentFile;
  private _infoHash?: string;
  private _totalSize?: number;
  private _pieceCount?: number;
  private _trackers?: Tracker[];

  constructor(torrent: TorrentFile) {
    const validation = validateTorrent(torrent);
    if (!validation.valid) {
      throw new Error(`Invalid torrent: ${validation.errors.join(', ')}`);
    }
    this.torrent = torrent;
    this._totalSize = validation.totalSize;
    this._pieceCount = validation.pieceCount;
  }

  get infoHash(): string {
    if (!this._infoHash) {
      throw new Error(
        'Info hash not calculated. Use calculateInfoHash() with original torrent data.'
      );
    }
    return this._infoHash;
  }

  setInfoHash(torrentData: Buffer): void {
    const result = calculateInfoHash(torrentData);
    this._infoHash = result.hex;
  }

  get totalSize(): number {
    return this._totalSize ?? 0;
  }

  get pieceCount(): number {
    return this._pieceCount ?? 0;
  }

  get name(): string {
    return this.torrent.info.name;
  }

  get pieceLength(): number {
    return this.torrent.info['piece length'];
  }

  get isMultiFile(): boolean {
    return !!this.torrent.info.files;
  }

  getPieceSize(pieceIndex: number): number {
    if (pieceIndex < 0 || pieceIndex >= this.pieceCount) {
      throw new Error(`Invalid piece index: ${pieceIndex}`);
    }

    if (pieceIndex === this.pieceCount - 1) {
      const remainingBytes = this.totalSize % this.pieceLength;
      return remainingBytes === 0 ? this.pieceLength : remainingBytes;
    }

    return this.pieceLength;
  }

  getTrackers(): Tracker[] {
    if (!this._trackers) {
      this._trackers = this.parseTrackers();
    }
    return this._trackers;
  }

  private parseTrackers(): Tracker[] {
    const trackers: Tracker[] = [];

    trackers.push({
      url: this.torrent.announce,
      tier: 0,
      protocol: this.getProtocol(this.torrent.announce),
    });

    if (this.torrent['announce-list']) {
      for (let tier = 0; tier < this.torrent['announce-list'].length; tier++) {
        const tierUrls = this.torrent['announce-list'][tier];
        if (tierUrls) {
          for (const url of tierUrls) {
            if (url !== this.torrent.announce) {
              trackers.push({
                url,
                tier: tier + 1,
                protocol: this.getProtocol(url),
              });
            }
          }
        }
      }
    }

    return trackers.sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      if (a.protocol === 'http' && b.protocol !== 'http') {
        return -1;
      }
      if (a.protocol !== 'http' && b.protocol === 'http') {
        return 1;
      }
      return 0;
    });
  }

  private getProtocol(url: string): 'http' | 'https' | 'udp' {
    if (url.startsWith('http://')) return 'http';
    if (url.startsWith('https://')) return 'https';
    if (url.startsWith('udp://')) return 'udp';
    return 'http';
  }

  getPieces(): Piece[] {
    const pieces: Piece[] = [];
    const piecesBuffer = this.torrent.info.pieces;

    for (let i = 0; i < this.pieceCount; i++) {
      const hashStart = i * 20;
      const hash = piecesBuffer.subarray(hashStart, hashStart + 20);

      pieces.push({
        index: i,
        hash,
        length: this.getPieceSize(i),
        downloaded: false,
      });
    }

    return pieces;
  }

  getFiles() {
    if (this.isMultiFile) {
      return this.torrent.info.files?.map((file: FileInfo, index: number) => ({
        index,
        path: file.path.join('/'),
        length: file.length,
      }));
    }

    return [
      {
        index: 0,
        path: this.torrent.info.name,
        length: this.torrent.info.length ?? 0,
      },
    ];
  }
}
