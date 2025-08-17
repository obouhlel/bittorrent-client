import type { PeerConnectionInfo } from './peer-manager';
import type { PeerOptimizedSelector } from '~/models/piece/selection-strategy';

export interface RequestPiecesOptions {
  peerInfo: PeerConnectionInfo;
  peerId: string;
  currentRequests: number;
  maxRequests: number;
  pieceSelector: PeerOptimizedSelector;
  onRequestBlock: (index: number, begin: number, length: number) => void;
}
