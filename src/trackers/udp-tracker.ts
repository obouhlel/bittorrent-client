import type { TorrentMetadata } from '@/models/metadata';
import type { Peer } from '@/models/torrent';
import type { AnnounceParams, AnnounceResponse } from '@/trackers/http-tracker';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { getClientPeerId } from '@/utils/peer-id';

const PROTOCOL_ID = 0x41727101980n; // BitTorrent protocol ID
const ACTION_CONNECT = 0;
const ACTION_ANNOUNCE = 1;

enum TrackerEvent {
  NONE = 0,
  COMPLETED = 1,
  STARTED = 2,
  STOPPED = 3,
}

export class UDPTracker {
  private socket: dgram.Socket;
  private host: string;
  private port: number;
  private torrentInfo: TorrentMetadata;
  private peerId: Buffer;
  private connectionId: Buffer | null = null;
  private timeout = 15000;

  constructor(announceUrl: string, torrentInfo: TorrentMetadata) {
    const url = new URL(announceUrl);
    this.host = url.hostname;
    this.port = parseInt(url.port) || 80;
    this.torrentInfo = torrentInfo;
    this.peerId = getClientPeerId();
    this.socket = dgram.createSocket('udp4');
  }

  private buildConnectRequest(): Buffer {
    const buffer = Buffer.allocUnsafe(16);
    let offset = 0;

    // Protocol ID (8 bytes)
    buffer.writeBigUInt64BE(PROTOCOL_ID, offset);
    offset += 8;

    // Action (4 bytes) - Connect = 0
    buffer.writeUInt32BE(ACTION_CONNECT, offset);
    offset += 4;

    // Transaction ID (4 bytes) - random
    const transactionId = crypto.randomInt(0, 0xffffffff);
    buffer.writeUInt32BE(transactionId, offset);

    return buffer;
  }

  private buildAnnounceRequest(params: AnnounceParams, transactionId: number): Buffer {
    if (!this.connectionId) {
      throw new Error('Not connected to tracker');
    }

    const buffer = Buffer.allocUnsafe(98);
    let offset = 0;

    // Connection ID (8 bytes)
    this.connectionId.copy(buffer, offset);
    offset += 8;

    // Action (4 bytes) - Announce = 1
    buffer.writeUInt32BE(ACTION_ANNOUNCE, offset);
    offset += 4;

    // Transaction ID (4 bytes)
    buffer.writeUInt32BE(transactionId, offset);
    offset += 4;

    // Info hash (20 bytes)
    const infoHashBuffer = Buffer.from(this.torrentInfo.infoHash, 'hex');
    infoHashBuffer.copy(buffer, offset);
    offset += 20;

    // Peer ID (20 bytes)
    this.peerId.copy(buffer, offset);
    offset += 20;

    // Downloaded (8 bytes)
    buffer.writeBigUInt64BE(BigInt(params.downloaded), offset);
    offset += 8;

    // Left (8 bytes)
    buffer.writeBigUInt64BE(BigInt(params.left), offset);
    offset += 8;

    // Uploaded (8 bytes)
    buffer.writeBigUInt64BE(BigInt(params.uploaded), offset);
    offset += 8;

    // Event (4 bytes)
    let event = TrackerEvent.NONE;
    if (params.event === 'started') event = TrackerEvent.STARTED;
    else if (params.event === 'completed') event = TrackerEvent.COMPLETED;
    else if (params.event === 'stopped') event = TrackerEvent.STOPPED;
    buffer.writeUInt32BE(event, offset);
    offset += 4;

    // IP address (4 bytes) - 0 means use sender's IP
    buffer.writeUInt32BE(0, offset);
    offset += 4;

    // Key (4 bytes) - random
    const key = crypto.randomInt(0, 0xffffffff);
    buffer.writeUInt32BE(key, offset);
    offset += 4;

    // Num want (4 bytes)
    buffer.writeInt32BE(params.numwant ?? -1, offset);
    offset += 4;

    // Port (2 bytes)
    buffer.writeUInt16BE(params.port ?? 6881, offset);

    return buffer;
  }

  private parseConnectResponse(buffer: Buffer): Buffer {
    if (buffer.length < 16) {
      throw new Error('Invalid connect response length');
    }

    const action = buffer.readUInt32BE(0);
    if (action !== ACTION_CONNECT) {
      throw new Error(`Invalid connect response action: ${action}`);
    }

    // Extract connection ID (8 bytes starting at offset 8)
    return buffer.subarray(8, 16);
  }

  private parseAnnounceResponse(buffer: Buffer): Peer[] {
    if (buffer.length < 20) {
      throw new Error('Invalid announce response length');
    }

    const action = buffer.readUInt32BE(0);
    if (action !== ACTION_ANNOUNCE) {
      throw new Error(`Invalid announce response action: ${action}`);
    }

    const peers: Peer[] = [];

    // Peers start at offset 20, each peer is 6 bytes (4 IP + 2 port)
    for (let i = 20; i < buffer.length; i += 6) {
      if (i + 5 < buffer.length) {
        const ipBytes = buffer.subarray(i, i + 4);
        const port = buffer.readUInt16BE(i + 4);

        const ip = Array.from(ipBytes).join('.');
        peers.push({ ip, port });
      }
    }

    return peers;
  }

  private sendRequest(buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('UDP tracker request timeout'));
      }, this.timeout);

      this.socket.once('message', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });

      this.socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      this.socket.send(buffer, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  async connect(): Promise<void> {
    const connectRequest = this.buildConnectRequest();

    try {
      const response = await this.sendRequest(connectRequest);
      this.connectionId = this.parseConnectResponse(response);
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

    const transactionId = crypto.randomInt(0, 0xffffffff);
    const announceRequest = this.buildAnnounceRequest(params, transactionId);

    try {
      const response = await this.sendRequest(announceRequest);

      if (response.length < 8) {
        throw new Error('Invalid announce response');
      }

      // Check for error response
      const action = response.readUInt32BE(0);
      const responseTransactionId = response.readUInt32BE(4);

      if (responseTransactionId !== transactionId) {
        throw new Error('Transaction ID mismatch in response');
      }

      if (action === 3) {
        // Error
        const errorMessage =
          response.length > 8 ? response.subarray(8).toString() : 'Unknown error';
        throw new Error(`Tracker error: ${errorMessage}`);
      }

      if (action !== ACTION_ANNOUNCE) {
        throw new Error(`Invalid announce response action: ${action}`);
      }

      const interval = response.readUInt32BE(8);
      const incomplete = response.readUInt32BE(12);
      const complete = response.readUInt32BE(16);
      const peers = this.parseAnnounceResponse(response);

      return {
        interval,
        peers,
        complete,
        incomplete,
      };
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
