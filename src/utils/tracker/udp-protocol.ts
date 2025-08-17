import type { Peer } from '~/types';
import type { AnnounceParams, AnnounceResponse } from '~/types/tracker';
import crypto from 'node:crypto';
import {
  UDP_MAGIC_CONSTANT,
  UDP_ACTION_ANNOUNCE,
  UDP_ACTION_CONNECT,
  UDP_CONNECT_REQUEST_SIZE,
  UDP_ANNOUNCE_RESPONSE_MIN_SIZE,
  UDP_PEER_SIZE,
  UDP_ANNOUNCE_RESPONSE_HEADER_SIZE,
  UDPEvent,
} from '~/config';

export function buildConnectRequest(transactionId: number): Buffer {
  const buffer = Buffer.allocUnsafe(UDP_CONNECT_REQUEST_SIZE);
  let offset = 0;
  buffer.writeBigUInt64BE(UDP_MAGIC_CONSTANT, offset);
  offset += 8;
  buffer.writeUInt32BE(UDP_ACTION_CONNECT, offset);
  offset += 4;
  buffer.writeUInt32BE(transactionId, offset);
  return buffer;
}

export function buildAnnounceRequest(
  connectionId: Buffer,
  params: AnnounceParams,
  transactionId: number,
  infoHash: string,
  peerId: Buffer
): Buffer {
  const buffer = Buffer.allocUnsafe(98);
  let offset = 0;
  connectionId.copy(buffer, offset);
  offset += 8;
  buffer.writeUInt32BE(UDP_ACTION_ANNOUNCE, offset);
  offset += 4;
  buffer.writeUInt32BE(transactionId, offset);
  offset += 4;
  const infoHashBuffer = Buffer.from(infoHash, 'hex');
  infoHashBuffer.copy(buffer, offset);
  offset += 20;
  peerId.copy(buffer, offset);
  offset += 20;
  buffer.writeBigUInt64BE(BigInt(params.downloaded), offset);
  offset += 8;
  buffer.writeBigUInt64BE(BigInt(params.left), offset);
  offset += 8;
  buffer.writeBigUInt64BE(BigInt(params.uploaded), offset);
  offset += 8;

  const event = parseTrackerEvent(params.event);
  buffer.writeUInt32BE(event, offset);
  offset += 4;
  buffer.writeUInt32BE(0, offset);
  offset += 4;
  const key = crypto.randomInt(0, 0xffffffff);
  buffer.writeUInt32BE(key, offset);
  offset += 4;
  buffer.writeInt32BE(params.numwant ?? -1, offset);
  offset += 4;
  buffer.writeUInt16BE(params.port ?? 6881, offset);

  return buffer;
}

export function parseConnectResponse(buffer: Buffer, transactionId?: number): Buffer {
  if (buffer.length < UDP_CONNECT_REQUEST_SIZE) {
    throw new Error('Invalid connect response length');
  }

  const action = buffer.readUInt32BE(0);
  if (action !== UDP_ACTION_CONNECT) {
    throw new Error(`Invalid connect response action: ${action}`);
  }

  if (transactionId !== undefined) {
    const responseTransactionId = buffer.readUInt32BE(4);
    if (responseTransactionId !== transactionId) {
      throw new Error('Transaction ID mismatch in connect response');
    }
  }

  return buffer.subarray(8, 16);
}

export function parseAnnounceResponse(buffer: Buffer, transactionId: number): AnnounceResponse {
  if (buffer.length < 8) {
    throw new Error('Invalid announce response');
  }

  const action = buffer.readUInt32BE(0);
  const responseTransactionId = buffer.readUInt32BE(4);

  if (responseTransactionId !== transactionId) {
    throw new Error('Transaction ID mismatch in response');
  }

  if (action === 3) {
    const errorMessage = buffer.length > 8 ? buffer.subarray(8).toString() : 'Unknown error';
    throw new Error(`Tracker error: ${errorMessage}`);
  }

  if (action !== UDP_ACTION_ANNOUNCE) {
    throw new Error(`Invalid announce response action: ${action}`);
  }

  if (buffer.length < UDP_ANNOUNCE_RESPONSE_MIN_SIZE) {
    throw new Error('Invalid announce response length');
  }

  const interval = buffer.readUInt32BE(8);
  const incomplete = buffer.readUInt32BE(12);
  const complete = buffer.readUInt32BE(16);
  const peers = parsePeers(buffer);

  return {
    interval,
    peers,
    complete,
    incomplete,
  };
}

function parsePeers(buffer: Buffer): Peer[] {
  const peers: Peer[] = [];

  for (let i = UDP_ANNOUNCE_RESPONSE_HEADER_SIZE; i < buffer.length; i += UDP_PEER_SIZE) {
    if (i + 5 < buffer.length) {
      const ipBytes = buffer.subarray(i, i + 4);
      const port = buffer.readUInt16BE(i + 4);
      const ip = Array.from(ipBytes).join('.');
      peers.push({ ip, port });
    }
  }

  return peers;
}

function parseTrackerEvent(event?: string): number {
  switch (event) {
    case 'started':
      return UDPEvent.STARTED;
    case 'completed':
      return UDPEvent.COMPLETED;
    case 'stopped':
      return UDPEvent.STOPPED;
    default:
      return UDPEvent.NONE;
  }
}
