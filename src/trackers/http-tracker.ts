import type { TorrentMetadata } from '@/types/metadata';
import type { Peer } from '@/types';
import type { BencodeDict } from '@/types';
import { decode } from '@/utils/bencode';
import { getClientPeerId } from '@/utils/peer-id';

export interface AnnounceParams {
  uploaded: number;
  downloaded: number;
  left: number;
  event?: 'started' | 'stopped' | 'completed';
  numwant?: number;
  port?: number;
}

export interface AnnounceResponse {
  interval: number;
  peers: Peer[];
  complete: number;
  incomplete: number;
}

export class HTTPTracker {
  private announceUrl: string;
  private torrentInfo: TorrentMetadata;
  private peerId: Buffer;

  constructor(announceUrl: string, torrentInfo: TorrentMetadata) {
    this.announceUrl = announceUrl;
    this.torrentInfo = torrentInfo;
    this.peerId = getClientPeerId();
  }

  private encodeInfoHash(infoHash: string): string {
    const buffer = Buffer.from(infoHash, 'hex');
    return Array.from(buffer)
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join('');
  }

  private buildAnnounceURL(params: AnnounceParams): string {
    const url = new URL(this.announceUrl);

    const queryParams: string[] = [];

    queryParams.push(`info_hash=${this.encodeInfoHash(this.torrentInfo.infoHash)}`);
    queryParams.push(`peer_id=${encodeURIComponent(this.peerId.toString('binary'))}`);
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

  private parseCompactPeers(peersData: Buffer): Peer[] {
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

  private parseResponse(responseBuffer: Buffer): AnnounceResponse {
    const decoded = decode(responseBuffer);

    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('Invalid tracker response format');
    }

    const response = decoded as BencodeDict;

    const failureReason = response['failure reason'];
    if (failureReason && typeof failureReason === 'string') {
      throw new Error(`Tracker error: ${failureReason}`);
    }

    const interval = response.interval;
    if (!interval || typeof interval !== 'number') {
      throw new Error('Missing or invalid interval in tracker response');
    }

    let peers: Peer[] = [];

    const peersData = response.peers;
    if (peersData) {
      if (Buffer.isBuffer(peersData)) {
        peers = this.parseCompactPeers(peersData);
      } else if (Array.isArray(peersData)) {
        const peerList: Peer[] = [];
        for (const peer of peersData) {
          if (
            typeof peer === 'object' &&
            peer !== null &&
            !Array.isArray(peer) &&
            !Buffer.isBuffer(peer)
          ) {
            const peerDict = peer as BencodeDict;
            const ip = peerDict.ip;
            const port = peerDict.port;
            const peerId = peerDict['peer id'];

            if (typeof ip === 'string' && typeof port === 'number') {
              peerList.push({
                ip,
                port,
                id:
                  peerId && typeof peerId === 'string' ? Buffer.from(peerId, 'binary') : undefined,
              });
            }
          }
        }
        peers = peerList;
      }
    }

    const complete = response.complete;
    const incomplete = response.incomplete;

    return {
      interval,
      peers,
      complete: typeof complete === 'number' ? complete : 0,
      incomplete: typeof incomplete === 'number' ? incomplete : 0,
    };
  }

  async announce(params: AnnounceParams): Promise<AnnounceResponse> {
    const url = this.buildAnnounceURL(params);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'BitTorrent-Client/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const responseBuffer = Buffer.from(arrayBuffer);

      return this.parseResponse(responseBuffer);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to announce to tracker: ${error.message}`);
      }
      throw new Error('Unknown error occurred during tracker announce');
    }
  }
}
