import type { ITorrentMetadata } from './metadata.interface';
import type { TorrentFile, FileInfo, Piece, Files } from '~/types';
import type { Tracker } from '~/types';
import { calculateInfoHash } from '~/utils/torrent/hash';
import { validateTorrent } from '~/utils/torrent/validator';
import { parseAnnounce } from '~/utils/torrent/announce';
import { getClientPeerId } from '~/utils/protocol/peer-id';

export class TorrentMetadata implements ITorrentMetadata {
  private _peerId?: Buffer;
  private _infoHash?: string;
  private _totalSize?: number;
  private _pieceCount?: number;
  private _trackers?: Tracker[];

  constructor(
    private torrent: TorrentFile,
    private data: Buffer
  ) {
    const validation = validateTorrent(torrent);
    if (!validation.valid) {
      throw new Error(`Invalid torrent: ${validation.errors.join(', ')}`);
    }
    this.torrent = torrent;
    this._totalSize = validation.totalSize;
    this._pieceCount = validation.pieceCount;
  }

  get peerId(): Buffer {
    if (!this._peerId) {
      this._peerId = Buffer.from(getClientPeerId());
    }
    return this._peerId;
  }

  get infoHash(): string {
    if (!this._infoHash) {
      const result = calculateInfoHash(this.data);
      this._infoHash = result.hex;
    }
    return this._infoHash;
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
      this._trackers = parseAnnounce(this.torrent);
    }
    return this._trackers;
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

  getFiles(): Files[] {
    if (this.isMultiFile && this.torrent.info.files) {
      return this.torrent.info.files.map((file: FileInfo, index: number) => ({
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
