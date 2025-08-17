import type { HandshakeMessage } from '~/types';
import { HANDSHAKE_SIZE, PROTOCOL_NAME_LENGTH, INFO_HASH_SIZE, PEER_ID_SIZE } from '~/config';

export function parseHandshake(data: Uint8Array): HandshakeMessage | null {
  if (data.length < HANDSHAKE_SIZE) {
    return null;
  }

  let offset = 0;
  const pstrlen = data[offset++];
  if (pstrlen !== PROTOCOL_NAME_LENGTH) {
    return null;
  }
  const decoder = new TextDecoder();
  const pstr = decoder.decode(data.slice(offset, offset + pstrlen));
  offset += pstrlen;
  const reserved = data.slice(offset, offset + 8);
  offset += 8;
  const infoHash = data.slice(offset, offset + INFO_HASH_SIZE);
  offset += INFO_HASH_SIZE;
  const peerId = data.slice(offset, offset + PEER_ID_SIZE);

  return {
    pstrlen,
    pstr,
    reserved,
    infoHash,
    peerId,
  };
}
