import type { Peer } from '~/types';
import { log } from '~/utils/system/logging';
import { MessageHandlerService } from '~/models/peer/message-handler';
import {
  MAX_BUFFER_SIZE,
  CONNECTION_TIMEOUT,
  ConnectionState,
  HANDSHAKE_SIZE,
  KEEP_ALIVE_INTERVAL,
  BLOCK_SIZE,
} from '~/utils/system/constants';
import net from 'node:net';
import { buildHandshake, parseHandshake } from '~/utils/protocol/handcheck';
import { PieceManager } from '~/models/peer/piece-manager';
import type { TorrentMetadata } from '~/models/torrents/metadata';
import { FileManager } from '~/models/storage/file-manager';
import {
  buildInterested,
  buildNotInterested,
  buildRequest,
  buildKeepAlive,
  buildChoke,
  buildUnchoke,
  buildHave,
  buildBitfield,
} from '~/utils/protocol/message-builder';

export default class PeerConnection {
  private socket: net.Socket;
  private ip: string;
  private port: number;
  private peerId: Buffer | undefined;
  private infoHash: Buffer;
  private buffer: Buffer = Buffer.alloc(0);
  public messageHandler: MessageHandlerService;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private handshakeReceived = false;
  private pieceManager: PieceManager;
  private keepAliveInterval?: NodeJS.Timeout;

  constructor(
    peer: Peer,
    infoHash: string,
    metadata: TorrentMetadata,
    sharedPieceManager?: PieceManager
  ) {
    this.ip = peer.ip;
    this.port = peer.port;
    this.socket = new net.Socket();
    this.peerId = peer.id;
    this.infoHash = Buffer.from(infoHash, 'hex');
    this.messageHandler = new MessageHandlerService(this.ip, this.port);

    // Utiliser le PieceManager partagé ou créer un nouveau
    if (sharedPieceManager) {
      this.pieceManager = sharedPieceManager;
    } else {
      const fileManager = new FileManager(metadata);
      this.pieceManager = new PieceManager(metadata.pieceCount, metadata.pieceLength, fileManager);
    }

    // Configurer les callbacks
    this.messageHandler.onBitfield = (bitfield) => {
      const peerId = this.peerAddress;
      this.pieceManager.setPeerBitfield(peerId, bitfield);
      if (this.pieceManager.isInterestedInPeer(peerId)) {
        this.sendInterested();
      } else {
        this.sendNotInterested();
      }
    };

    this.messageHandler.onUnchoke = () => {
      // Commencer à télécharger des pieces
      log('debug', `Peer ${this.ip}:${this.port} unchoked us`);

      // Demander plusieurs pieces en parallèle selon le mode
      this.requestMultiplePieces();
    };

    this.messageHandler.onPiece = (index, offset, data) => {
      this.pieceManager.addPieceBlock(index, offset, data);

      // Continuer à demander plus de blocks si on n'est pas choked
      if (!this.messageHandler.chokedStatus) {
        this.requestMultiplePieces();
      }

      // Notifier les autres peers qu'on a cette piece
      if (this.pieceManager.weHavePiece(index)) {
        this.broadcastHave(index);
      }
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, rejects) => {
      this.socket.setTimeout(CONNECTION_TIMEOUT);

      this.socket.connect(this.port, this.ip, () => {
        log('info', `Connect with ${this.ip}:${this.port}`);
        this.state = ConnectionState.CONNECTING;

        try {
          const handshakeBuffer = buildHandshake(this.infoHash, this.peerId);
          this.socket.write(handshakeBuffer);
          this.state = ConnectionState.HANDSHAKE_SENT;
          log('debug', `Handshake sent to ${this.ip}:${this.port}`);
          resolve();
        } catch (error) {
          log('fail', `Failed to build handshake for ${this.ip}:${this.port}`);
          this.state = ConnectionState.ERROR;
          rejects(error);
        }
      });

      this.socket.on('data', (data: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, data]);

        if (this.buffer.length > MAX_BUFFER_SIZE) {
          log('warn', `Buffer overflow from ${this.ip}:${this.port}, resetting`);
          this.resetBuffer();
          return;
        }

        this.handleMessages();
      });

      this.socket.once('error', (error) => {
        log('fail', `Connection error with ${this.ip}:${this.port}: ${error.message}`);
        this.state = ConnectionState.ERROR;
        this.resetBuffer();
        rejects(error);
      });

      this.socket.once('timeout', () => {
        log('warn', `Connection timeout with ${this.ip}:${this.port}`);
        this.state = ConnectionState.ERROR;
        this.resetBuffer();
        this.socket.destroy();
        rejects(new Error('Connection Timeout'));
      });
    });
  }

  private handleMessages(): void {
    if (!this.handshakeReceived && this.state === ConnectionState.HANDSHAKE_SENT) {
      if (this.buffer.length >= HANDSHAKE_SIZE) {
        const handshakeBuffer = this.buffer.subarray(0, HANDSHAKE_SIZE);
        const handshakeResult = parseHandshake(handshakeBuffer);

        if (handshakeResult) {
          log('debug', `Valid handshake received from ${this.ip}:${this.port}`);

          if (handshakeResult.infoHash.equals(this.infoHash)) {
            this.handshakeReceived = true;
            this.state = ConnectionState.CONNECTED;
            log('info', `Handshake validated for ${this.ip}:${this.port}`);
            this.buffer = this.buffer.subarray(HANDSHAKE_SIZE);

            // Démarrer le keep-alive
            this.startKeepAlive();

            // Envoyer notre bitfield en premier
            this.sendBitfield(this.pieceManager.getOurBitfield());

            // Envoyer interested si on a besoin de pieces
            if (this.pieceManager.isInterestedInPeer(this.peerAddress)) {
              this.sendInterested();
            }

            // Décider si on choke le peer ou pas selon notre état
            if (this.shouldChokePeer()) {
              this.sendChoke();
            } else {
              this.sendUnchoke();
            }
          } else {
            log('fail', `InfoHash mismatch from ${this.ip}:${this.port}`);
            this.state = ConnectionState.ERROR;
            this.close();
            return;
          }
        } else {
          log('fail', `Invalid handshake from ${this.ip}:${this.port}`);
          this.state = ConnectionState.ERROR;
          this.close();
          return;
        }
      } else {
        // Pas assez de données pour le handshake
        return;
      }
    }

    // Traitement des messages BitTorrent normaux
    while (this.buffer.length >= 4 && this.handshakeReceived) {
      const messageLength = this.buffer.readUInt32BE(0);

      // Keep-alive message (length = 0)
      if (messageLength === 0) {
        this.buffer = this.buffer.subarray(4);
        log('debug', `Keep-alive from ${this.ip}:${this.port}`);
        continue;
      }

      // Vérifier si on a le message complet
      if (this.buffer.length < 4 + messageLength) {
        break;
      }

      // Validation de la taille du message
      if (messageLength > MAX_BUFFER_SIZE / 2) {
        log('fail', `Message too large (${messageLength} bytes) from ${this.ip}:${this.port}`);
        this.resetBuffer();
        this.close();
        return;
      }

      const messageId = this.buffer[4];
      const payload = this.buffer.subarray(5, 4 + messageLength);

      if (messageId !== undefined) {
        try {
          this.messageHandler.handleMessage(messageId, payload);
        } catch (error) {
          log('fail', `Error handling message ${messageId} from ${this.ip}:${this.port}: ${error}`);
        }
      }

      this.buffer = this.buffer.subarray(4 + messageLength);
    }
  }

  private resetBuffer(): void {
    this.buffer = Buffer.alloc(0);
    log('debug', `Buffer reset for ${this.ip}:${this.port}`);
  }

  private startKeepAlive(): void {
    // Envoyer un keep-alive toutes les 2 minutes
    this.keepAliveInterval = setInterval(() => {
      if (this.isConnected) {
        this.socket.write(buildKeepAlive());
        log('debug', `Keep-alive sent to ${this.ip}:${this.port}`);
      }
    }, KEEP_ALIVE_INTERVAL);
  }

  private sendInterested(): void {
    this.socket.write(buildInterested());
    log('debug', `Interested sent to ${this.ip}:${this.port}`);
  }

  private sendNotInterested(): void {
    this.socket.write(buildNotInterested());
    log('debug', `Not interested sent to ${this.ip}:${this.port}`);
  }

  private sendChoke(): void {
    this.socket.write(buildChoke());
    log('debug', `Choke sent to ${this.ip}:${this.port}`);
  }

  private sendUnchoke(): void {
    this.socket.write(buildUnchoke());
    log('debug', `Unchoke sent to ${this.ip}:${this.port}`);
  }

  private broadcastHave(pieceIndex: number): void {
    this.socket.write(buildHave(pieceIndex));
    log('debug', `Have message sent for piece ${pieceIndex} to ${this.ip}:${this.port}`);
  }

  sendBitfield(bitfield: Buffer): void {
    this.socket.write(buildBitfield(bitfield));
    log('debug', `Bitfield sent to ${this.ip}:${this.port}`);
  }

  private shouldChokePeer(): boolean {
    // Logique simple : on choke si le peer n'est pas intéressé par nos pieces
    // ou si on a peu de bande passante upload
    return !this.messageHandler.peerInterestedStatus;
  }

  requestPiece(pieceIndex: number): void {
    if (!this.isConnected || this.messageHandler.chokedStatus) return;

    const blockSize = BLOCK_SIZE;
    const piece = this.pieceManager.getPiece(pieceIndex);
    if (!piece) return;

    // Demander tous les blocs de la piece
    for (let offset = 0; offset < piece.length; offset += blockSize) {
      const length = Math.min(blockSize, piece.length - offset);
      const request = buildRequest(pieceIndex, offset, length);
      this.socket.write(request);
    }

    log('debug', `Requested piece ${pieceIndex} (${Math.ceil(piece.length / blockSize)} blocks)`);
  }

  close(): void {
    log('info', `Connection closed with ${this.ip}:${this.port}`);
    this.state = ConnectionState.DISCONNECTED;

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Supprimer ce peer du PieceManager
    this.pieceManager.removePeer(this.peerAddress);

    this.resetBuffer();
    this.socket.end();
    this.socket.destroy();
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.handshakeReceived;
  }

  get peerAddress(): string {
    return `${this.ip}:${this.port}`;
  }

  get pieceStats() {
    return this.pieceManager.getCompletionStats();
  }

  get peerPieceCount(): number {
    return this.pieceManager.countPeerPieces(this.peerAddress);
  }

  private requestMultiplePieces(): void {
    if (!this.isConnected || this.messageHandler.chokedStatus) {
      log(
        'debug',
        `Cannot request pieces from ${this.peerAddress}: connected=${this.isConnected}, choked=${this.messageHandler.chokedStatus}`
      );
      return;
    }

    const completionStats = this.pieceManager.getCompletionStats();

    // Demander plusieurs pieces en parallèle (limite raisonnable)
    const maxPiecesPerRound = 10; // Plus que 3 mais pas infini
    let requestedCount = 0;

    log('debug', `Requesting pieces from ${this.peerAddress}, max ${maxPiecesPerRound} pieces`);

    // Boucle limitée pour éviter de saturer le peer
    for (let i = 0; i < maxPiecesPerRound; i++) {
      const pieceIndex = this.pieceManager.getNextPieceToDownload(this.peerAddress);
      if (pieceIndex !== null) {
        this.requestPiece(pieceIndex);
        requestedCount++;
        log(
          'debug',
          `Requested piece ${pieceIndex} from ${this.peerAddress} (${requestedCount}/${maxPiecesPerRound})`
        );
      } else {
        log(
          'debug',
          `No more pieces available from ${this.peerAddress} after ${requestedCount} requests`
        );
        break; // Plus de pieces disponibles
      }
    }

    if (requestedCount === 0) {
      log(
        'debug',
        `No pieces available to request from ${this.peerAddress} (completion: ${completionStats.percentage}%)`
      );
    } else {
      log('debug', `Successfully requested ${requestedCount} pieces from ${this.peerAddress}`);
    }
  }
}
