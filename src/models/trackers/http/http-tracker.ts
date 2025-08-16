import type { TorrentMetadata } from '~/models/torrents/metadata';
import type { AnnounceParams, AnnounceResponse } from '~/types/tracker';
import { getClientPeerId } from '~/utils/protocol/peer-id';
import * as HTTPProtocol from '~/utils/tracker/http-protocol';
import { HTTPClient } from './http-client';

export class HTTPTracker {
  private httpClient: HTTPClient;
  private peerId: Buffer;

  constructor(
    private announceUrl: string,
    private torrentInfo: TorrentMetadata
  ) {
    this.httpClient = new HTTPClient();
    this.peerId = getClientPeerId();
  }

  async announce(params: AnnounceParams): Promise<AnnounceResponse> {
    const url = HTTPProtocol.buildAnnounceURL(
      this.announceUrl,
      params,
      this.torrentInfo.infoHash,
      this.peerId
    );

    try {
      const responseData = await this.httpClient.get(url);
      return HTTPProtocol.parseTrackerResponse(responseData);
    } catch (error) {
      throw new Error(
        `Failed to announce to HTTP tracker: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
