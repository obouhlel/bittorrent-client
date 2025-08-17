import type { Piece, Files } from '~/types';

export interface ITorrentMetadata {
  peerId: Buffer;
  totalSize: number;
  pieceCount: number;
  pieceLength: number;
  pieces: Buffer;
  name: string;
  isMultiFile: boolean;
  getPieceSize(pieceIndex: number): number;
  getPieces(): Piece[];
  getFiles(): Files[];
}
