import type { RequestPiecesOptions } from '~/types';

export function requestPiecesFromPeer(options: RequestPiecesOptions): number {
  const { peerInfo, currentRequests, maxRequests, pieceSelector, onRequestBlock } = options;

  if (!peerInfo.pieceManager || !peerInfo.pieces || peerInfo.peerChoking) {
    return 0;
  }

  const requestsToMake = maxRequests - currentRequests;
  if (requestsToMake <= 0) {
    return 0;
  }

  const availablePieces = peerInfo.pieceManager.getAvailablePieces();
  const completedPieces = peerInfo.pieceManager.getCompletedPieces();

  const piecesToRequest = pieceSelector.selectPieces(
    availablePieces,
    peerInfo.pieces,
    completedPieces
  );

  let requestsMade = 0;

  for (const pieceIndex of piecesToRequest) {
    if (requestsMade >= requestsToMake) break;

    while (requestsMade < requestsToMake) {
      const block = peerInfo.pieceManager.getNextBlockToRequest(pieceIndex);
      if (!block) break;

      onRequestBlock(block.index, block.begin, block.length);
      requestsMade++;
    }
  }

  return requestsMade;
}
