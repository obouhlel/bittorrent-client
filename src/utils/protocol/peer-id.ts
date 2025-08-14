import crypto from 'node:crypto';
import { PEER_ID_PREFIX, PEER_ID_RANDOM_LENGTH } from '@/utils/system/constants';

let peerId: Buffer | null = null;

export function getClientPeerId(): Buffer {
  if (!peerId) {
    const randomPart = crypto
      .randomBytes(PEER_ID_RANDOM_LENGTH)
      .toString('base64')
      .slice(0, PEER_ID_RANDOM_LENGTH);
    peerId = Buffer.from(PEER_ID_PREFIX + randomPart, 'ascii');
  }
  return peerId;
}
