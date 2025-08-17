import type { Peer } from '~/types';

export function getPeerKey(peer: Peer) {
  return `${peer.ip}:${peer.port}`;
}

export function deduplicatePeers(peers: Peer[], existingKeys: Set<string>): Peer[] {
  const newPeers: Peer[] = [];
  for (const peer of peers) {
    const key = getPeerKey(peer);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      newPeers.push(peer);
    }
  }
  return newPeers;
}
