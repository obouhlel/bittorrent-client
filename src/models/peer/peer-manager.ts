import type { Peer, PeerConnectionInfo, HandshakeMessage, PeerMessage } from '~/types';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import { createPeerConnection } from '~/utils/protocol/peer-builder';
import { buildHandshake } from '~/utils/protocol/message-builder';
import { log } from '~/utils/system/logging';
import { getPeerKey } from '~/utils/tracker/utils';
import { MessageHandler } from './message-handler';

export class PeerManager {
  private peers: Map<string, PeerConnectionInfo>;
  private messageHandler: MessageHandler;

  constructor(private metadata: TorrentMetadata) {
    this.peers = new Map<string, PeerConnectionInfo>();
    this.messageHandler = new MessageHandler();
  }

  async connectToPeers(peers: Peer[]): Promise<void> {
    const connectPromises = peers.map((peer) => this.connectToPeer(peer));
    const results = await Promise.allSettled(connectPromises);

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    log('info', `Connected to ${successful}/${peers.length} peers (${failed} failed)`);
  }

  private async connectToPeer(peer: Peer): Promise<void> {
    const key = getPeerKey(peer);

    if (this.peers.has(key)) {
      return;
    }

    try {
      const connection = createPeerConnection(
        peer,
        (handshake) => this.handleHandshake(key, handshake),
        (message) => this.handleMessage(key, message)
      );

      const connected = await connection.connect();
      if (!connected) {
        throw new Error(`Failed to connect to ${key}`);
      }

      this.peers.set(key, {
        connection,
        peer,
        handshakeSent: false,
        handshakeReceived: false,
      });

      await this.sendHandshake(key);
    } catch (error) {
      log('fail', `Failed to connect to peer (${key}): ${error}`);
      throw error;
    }
  }

  private async sendHandshake(key: string): Promise<void> {
    const peerInfo = this.peers.get(key);
    if (!peerInfo || peerInfo.handshakeSent) {
      return;
    }

    try {
      const handshakeMessage = buildHandshake(
        new Uint8Array(Buffer.from(this.metadata.infoHash, 'hex')),
        new Uint8Array(Buffer.from(this.metadata.peerId))
      );

      peerInfo.connection.send(handshakeMessage);
      peerInfo.handshakeSent = true;

      log('debug', `Sent handshake to ${key}`);
    } catch (error) {
      log('fail', `Failed to send handshake to ${key}: ${error}`);
      this.disconnectPeer(key);
    }
  }

  private handleHandshake(key: string, handshake: HandshakeMessage): void {
    const peerInfo = this.peers.get(key);
    if (!peerInfo) {
      return;
    }

    const receivedHash = Buffer.from(handshake.infoHash).toString('hex');
    const expectedHash = Buffer.from(this.metadata.infoHash).toString('hex');

    if (receivedHash !== expectedHash) {
      log('fail', `Info hash mismatch from ${key}`);
      this.disconnectPeer(key);
      return;
    }

    peerInfo.handshakeReceived = true;
    log('pass', `Handshake received from ${key}`);

    if (!peerInfo.handshakeSent) {
      this.sendHandshake(key);
    }
  }

  private handleMessage(key: string, message: PeerMessage): void {
    const peerInfo = this.peers.get(key);
    if (!peerInfo || !peerInfo.handshakeReceived) {
      return;
    }

    this.messageHandler.handleMessage(key, peerInfo, message);
  }

  private disconnectPeer(key: string): void {
    const peerInfo = this.peers.get(key);
    if (peerInfo) {
      peerInfo.connection.close();
      this.peers.delete(key);
      log('debug', `Disconnected from peer ${key}`);
    }
  }

  getConnectedPeersCount(): number {
    return Array.from(this.peers.values()).filter((p) => p.handshakeReceived && p.handshakeSent)
      .length;
  }

  destroy(): void {
    for (const [_key, peerInfo] of this.peers) {
      peerInfo.connection.close();
    }
    this.peers.clear();
    log('info', 'Peer manager destroyed');
  }
}
