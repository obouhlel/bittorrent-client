import type { Peer } from '~/types/network';
import { PeerConnection } from '~/models/peer/peer-connection';

export interface PeerConnectionInfo {
  peer: Peer;
  connection: PeerConnection;
  handshakeSent: boolean;
  handshakeReceived: boolean;
  peerChoking?: boolean;
  peerInterested?: boolean;
  pieces?: Set<number>;
}
