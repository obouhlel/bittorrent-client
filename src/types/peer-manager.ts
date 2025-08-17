import type { Peer } from '~/types/network';
import { PeerConnection } from '~/models/peer/peer-connection';
import type { PieceManager } from '~/models/piece/piece-manager';

export interface PeerConnectionInfo {
  peer: Peer;
  connection: PeerConnection;
  handshakeSent: boolean;
  handshakeReceived: boolean;
  peerChoking?: boolean;
  peerInterested?: boolean;
  amChoking?: boolean;
  amInterested?: boolean;
  pieces?: Set<number>;
  pieceManager?: PieceManager;
}
