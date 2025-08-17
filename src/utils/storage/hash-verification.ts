import { createHash } from 'crypto';
import { PIECE_HASH_CHECK_ENABLED } from '~/utils/system/constants';
import { log } from '~/utils/system/logging';

export function verifyPieceHash(pieceData: Uint8Array, expectedHash: Uint8Array): boolean {
  if (!PIECE_HASH_CHECK_ENABLED) {
    return true;
  }

  const hash = createHash('sha1').update(pieceData).digest();
  const isValid = Buffer.from(hash).equals(Buffer.from(expectedHash));

  if (!isValid) {
    log('warn', `Piece hash verification failed`);
  }

  return isValid;
}
