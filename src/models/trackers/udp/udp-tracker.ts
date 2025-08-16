import type { TorrentMetadata } from '~/models/torrents/metadata';
import type { AnnounceParams, AnnounceResponse } from '~/types/tracker';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { getClientPeerId } from '~/utils/protocol/peer-id';
import { UDP_TIMEOUT } from '~/utils/system/constants';
import * as UDPProtocol from '~/utils/tracker/udp-protocol';
import { UDPSocket } from './udp-socket';

export class UDPTracker {
  private socket: UDPSocket;
  private connectionId: Buffer | null = null;
  private peerId: Buffer;

  constructor(
    announceUrl: string,
    private torrentInfo: TorrentMetadata
  ) {
    const url = new URL(announceUrl);
    const host = url.hostname;
    const port = parseInt(url.port) || 80;
    this.socket = new UDPSocket(host, port, UDP_TIMEOUT);
    this.peerId = getClientPeerId();
  }

  async connect(): Promise<void> {
    const transactionId = crypto.randomInt(0, 0xffffffff);
    const connectRequest = UDPProtocol.buildConnectRequest(transactionId);

    try {
      const response = await this.socket.sendRequest(connectRequest);
      this.connectionId = UDPProtocol.parseConnectResponse(response, transactionId);
    } catch (error) {
      throw new Error(
        `Failed to connect to UDP tracker: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async announce(params: AnnounceParams): Promise<AnnounceResponse> {
    if (!this.connectionId) {
      await this.connect();
    }

    if (!this.connectionId) {
      throw new Error('Failed to establish connection');
    }

    const transactionId = crypto.randomInt(0, 0xffffffff);
    const announceRequest = UDPProtocol.buildAnnounceRequest(
      this.connectionId,
      params,
      transactionId,
      this.torrentInfo.infoHash,
      this.peerId
    );

    try {
      const response = await this.socket.sendRequest(announceRequest);
      return UDPProtocol.parseAnnounceResponse(response, transactionId);
    } catch (error) {
      throw new Error(
        `Failed to announce to UDP tracker: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  close(): void {
    this.socket.close();
  }
}
