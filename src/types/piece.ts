export interface PieceBlock {
  index: number;
  begin: number;
  length: number;
  data?: Uint8Array;
  requestTime?: number;
  completed: boolean;
}

export interface PieceInfo {
  index: number;
  size: number;
  hash: Uint8Array;
  blocks: PieceBlock[];
  completed: boolean;
  verified: boolean;
  downloadProgress: number;
}

export interface PendingRequest {
  pieceIndex: number;
  begin: number;
  length: number;
  requestTime: number;
  peerId: string;
}

export interface PieceManagerStats {
  totalPieces: number;
  completedPieces: number;
  downloadProgress: number;
  pendingRequests: number;
}

export interface PieceRequestInfo {
  pieceIndex: number;
  begin: number;
  length: number;
}
