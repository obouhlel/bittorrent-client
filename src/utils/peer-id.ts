import crypto from 'node:crypto';

let peerId: Buffer | null = null;

export function getClientPeerId(): Buffer {
  if (!peerId) {
    const prefix = '-BT0001-';
    const randomPart = crypto.randomBytes(12).toString('base64').slice(0, 12);
    peerId = Buffer.from(prefix + randomPart, 'ascii');
  }
  return peerId;
}
