import { createHash } from 'crypto';
import { encode, decode } from '../bencode.js';
import type { InfoHashResult, BencodeValue, BencodeDict } from '../models/torrent.js';

export function calculateInfoHash(torrentData: Buffer): InfoHashResult {
  const decoded = decode(torrentData) as BencodeDict;
  const infoValue = decoded.info;

  if (!infoValue) {
    throw new Error('No info section found in torrent data');
  }

  const encodedInfo = encode(infoValue as BencodeValue);
  const hash = createHash('sha1').update(encodedInfo).digest();

  return {
    buffer: hash,
    hex: hash.toString('hex'),
  };
}
