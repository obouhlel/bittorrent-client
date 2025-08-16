import type { Peer } from '~/types';
import type { BencodeDict } from '~/types';
import type { AnnounceParams, AnnounceResponse } from '~/types/tracker';
import { decode } from '~/utils/torrent/bencode';

export function encodeInfoHash(infoHash: string): string {
  const buffer = Buffer.from(infoHash, 'hex');
  return Array.from(buffer)
    .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
    .join('');
}

export function buildAnnounceURL(
  announceUrl: string,
  params: AnnounceParams,
  infoHash: string,
  peerId: Buffer
): string {
  const url = new URL(announceUrl);
  const queryParams: string[] = [];

  queryParams.push(`info_hash=${encodeInfoHash(infoHash)}`);
  queryParams.push(`peer_id=${encodeURIComponent(peerId.toString('binary'))}`);
  queryParams.push(`port=${params.port ?? 6881}`);
  queryParams.push(`uploaded=${params.uploaded}`);
  queryParams.push(`downloaded=${params.downloaded}`);
  queryParams.push(`left=${params.left}`);
  queryParams.push('compact=1');

  if (params.event) {
    queryParams.push(`event=${params.event}`);
  }

  if (params.numwant) {
    queryParams.push(`numwant=${params.numwant}`);
  }

  url.search = queryParams.join('&');
  return url.toString();
}

export function parseCompactPeers(peersData: Buffer): Peer[] {
  const peers: Peer[] = [];

  for (let i = 0; i < peersData.length; i += 6) {
    const ipBytes = peersData.subarray(i, i + 4);
    const portBytes = peersData.subarray(i + 4, i + 6);

    const ip = Array.from(ipBytes).join('.');
    const port = portBytes.readUInt16BE(0);

    peers.push({ ip, port });
  }

  return peers;
}

export function parseDictionaryPeers(peersList: BencodeDict[]): Peer[] {
  const peers: Peer[] = [];

  for (const peerDict of peersList) {
    if (peerDict.ip && peerDict.port) {
      const ip = peerDict.ip.toString();
      const port = Number(peerDict.port);
      peers.push({ ip, port });
    }
  }

  return peers;
}

export function parseTrackerResponse(responseData: Buffer): AnnounceResponse {
  const decoded = decode(responseData) as BencodeDict;

  if (decoded['failure reason']) {
    throw new Error(`Tracker error: ${decoded['failure reason']}`);
  }

  let peers: Peer[] = [];
  if (decoded.peers) {
    if (Buffer.isBuffer(decoded.peers)) {
      peers = parseCompactPeers(decoded.peers);
    } else if (Array.isArray(decoded.peers)) {
      peers = parseDictionaryPeers(decoded.peers as BencodeDict[]);
    }
  }

  return {
    interval: Number(decoded.interval) || 1800,
    peers,
    complete: Number(decoded.complete) || 0,
    incomplete: Number(decoded.incomplete) || 0,
  };
}
