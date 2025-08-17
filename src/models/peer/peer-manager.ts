import type { Peer, PeerConnectionInfo, HandshakeMessage, PeerMessage } from '~/types';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import type { PieceManager } from '~/models/piece/piece-manager';
import { createPeerConnection } from '~/utils/protocol/peer-builder';
import { buildHandshake } from '~/utils/protocol/message-builder';
import { log } from '~/utils/system/logging';
import { getPeerKey } from '~/utils/tracker/peer';
import { HANDSHAKE_TIMEOUT, PEER_CONNECTION_TIMEOUT } from '~/config';
import { MessageHandler } from './message-handler';

export class PeerManager {
  private peers: Map<string, PeerConnectionInfo>;
  private messageHandler: MessageHandler;
  private pieceManager: PieceManager;
  private handshakeTimeouts: Map<string, NodeJS.Timeout>;

  constructor(
    private metadata: TorrentMetadata,
    pieceManager: PieceManager
  ) {
    this.peers = new Map<string, PeerConnectionInfo>();
    this.handshakeTimeouts = new Map<string, NodeJS.Timeout>();
    this.pieceManager = pieceManager;
    this.messageHandler = new MessageHandler();
  }

  async connectToPeers(peers: Peer[]): Promise<void> {
    log('debug', `Attempting to connect to ${peers.length} peers`);
    const connectPromises = peers.map((peer) => this.connectToPeer(peer));
    const results = await Promise.allSettled(connectPromises);

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    const failedReasons = results
      .filter((r) => r.status === 'rejected')
      .map((r) => (r as PromiseRejectedResult).reason?.message || 'Unknown error');

    log('info', `Connected to ${successful}/${peers.length} peers (${failed} failed)`);
    if (failed > 0) {
      log(
        'debug',
        `Failed connection reasons: ${failedReasons.slice(0, 3).join(', ')}${failed > 3 ? '...' : ''}`
      );
    }
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

      const connectPromise = connection.connect();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), PEER_CONNECTION_TIMEOUT);
      });

      const connected = await Promise.race([connectPromise, timeoutPromise]);
      if (!connected) {
        throw new Error(`Failed to connect to ${key}`);
      }

      this.peers.set(key, {
        connection,
        peer,
        handshakeSent: false,
        handshakeReceived: false,
        peerChoking: true,
        peerInterested: false,
        amChoking: true,
        amInterested: false,
        pieceManager: this.pieceManager,
      });

      await this.sendHandshake(key);
      this.startHandshakeTimeout(key);
    } catch (error) {
      log('warn', `Failed to connect to peer (${key}): ${error}`);
      this.disconnectPeer(key);
      throw error;
    }
  }

  private async sendHandshake(key: string): Promise<void> {
    const peerInfo = this.peers.get(key);
    if (!peerInfo || peerInfo.handshakeSent) {
      return;
    }

    try {
      const infoHashBuffer = new Uint8Array(Buffer.from(this.metadata.infoHash, 'hex'));
      const peerIdBuffer = new Uint8Array(Buffer.from(this.metadata.peerId));

      log(
        'debug',
        `Building handshake for ${key} - InfoHash: ${this.metadata.infoHash}, PeerID: ${Buffer.from(this.metadata.peerId).toString('hex')}`
      );

      const handshakeMessage = buildHandshake(infoHashBuffer, peerIdBuffer);

      peerInfo.connection.send(handshakeMessage);
      peerInfo.handshakeSent = true;

      log('debug', `Sent handshake to ${key} (${handshakeMessage.length} bytes)`);

      if (peerInfo.handshakeReceived) {
        this.messageHandler.sendInterestedMessage(peerInfo);
      }
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
    const expectedHash = this.metadata.infoHash;

    log('debug', `Hash comparison - Received: ${receivedHash}, Expected: ${expectedHash}`);

    if (receivedHash !== expectedHash) {
      log('fail', `Info hash mismatch from ${key}`);
      this.disconnectPeer(key);
      return;
    }

    peerInfo.handshakeReceived = true;
    this.clearHandshakeTimeout(key);
    log('pass', `Handshake received from ${key}`);

    if (!peerInfo.handshakeSent) {
      this.sendHandshake(key);
    } else {
      this.messageHandler.sendInterestedMessage(peerInfo);
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
      this.clearHandshakeTimeout(key);
      log('debug', `Disconnected from peer ${key}`);
    }
  }

  private startHandshakeTimeout(key: string): void {
    const timeout = setTimeout(() => {
      const peerInfo = this.peers.get(key);
      if (peerInfo && !peerInfo.handshakeReceived) {
        log(
          'debug',
          `Handshake timeout for peer ${key} (sent: ${peerInfo.handshakeSent}, received: ${peerInfo.handshakeReceived})`
        );
        this.disconnectPeer(key);
      }
    }, HANDSHAKE_TIMEOUT);

    this.handshakeTimeouts.set(key, timeout);
  }

  private clearHandshakeTimeout(key: string): void {
    const timeout = this.handshakeTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.handshakeTimeouts.delete(key);
    }
  }

  getConnectedPeersCount(): number {
    return Array.from(this.peers.values()).filter((p) => p.handshakeReceived && p.handshakeSent)
      .length;
  }

  getPeerStatus(): {
    total: number;
    connected: number;
    handshakeSent: number;
    handshakeReceived: number;
  } {
    const peers = Array.from(this.peers.values());
    return {
      total: peers.length,
      connected: peers.filter((p) => p.handshakeReceived && p.handshakeSent).length,
      handshakeSent: peers.filter((p) => p.handshakeSent).length,
      handshakeReceived: peers.filter((p) => p.handshakeReceived).length,
    };
  }

  destroy(): void {
    for (const [key, peerInfo] of this.peers) {
      peerInfo.connection.close();
      this.clearHandshakeTimeout(key);
    }
    this.peers.clear();
    this.handshakeTimeouts.clear();
    log('info', 'Peer manager destroyed');
  }
}
