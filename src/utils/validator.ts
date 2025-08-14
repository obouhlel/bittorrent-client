import type { TorrentFile } from '@/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  totalSize: number;
  pieceCount: number;
}

export function validateTorrent(torrent: TorrentFile): ValidationResult {
  const errors: string[] = [];
  let totalSize = 0;

  if (!torrent.announce) {
    errors.push('Missing announce URL');
  }

  if (!torrent.info) {
    errors.push('Missing info section');
    return { valid: false, errors, totalSize: 0, pieceCount: 0 };
  }

  const info = torrent.info;

  if (!info.name) {
    errors.push('Missing name in info section');
  }

  if (!info['piece length'] || typeof info['piece length'] !== 'number') {
    errors.push('Missing or invalid piece length');
  } else {
    if (!isPowerOfTwo(info['piece length'])) {
      errors.push('Piece length must be a power of 2');
    }
  }

  if (!info.pieces || !Buffer.isBuffer(info.pieces)) {
    errors.push('Missing or invalid pieces');
  }

  if (info.files) {
    for (let i = 0; i < info.files.length; i++) {
      const file = info.files[i];
      if (!file) {
        errors.push(`File ${i}: Not found`);
        continue;
      }

      if (!file.length || typeof file.length !== 'number') {
        errors.push(`File ${i}: missing or invalid length`);
      } else {
        totalSize += file.length;
      }

      if (!file.path || !Array.isArray(file.path) || file.path.length === 0) {
        errors.push(`File ${i}: missing or invalid path`);
      }
    }
  } else if (info.length && typeof info.length === 'number') {
    totalSize = info.length;
  } else {
    errors.push(
      'Missing length field for single file torrent or files array for multi-file torrent'
    );
  }

  const expectedPieceCount =
    info['piece length'] && totalSize > 0 ? Math.ceil(totalSize / info['piece length']) : 0;

  const actualPieceCount =
    info.pieces && Buffer.isBuffer(info.pieces) ? info.pieces.length / 20 : 0;

  if (expectedPieceCount !== actualPieceCount) {
    errors.push(`Piece count mismatch: expected ${expectedPieceCount}, got ${actualPieceCount}`);
  }

  if (info.pieces && Buffer.isBuffer(info.pieces) && info.pieces.length % 20 !== 0) {
    errors.push('Pieces buffer length must be a multiple of 20 (SHA1 hash size)');
  }

  return {
    valid: errors.length === 0,
    errors,
    totalSize,
    pieceCount: actualPieceCount,
  };
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}
