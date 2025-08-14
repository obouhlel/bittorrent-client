import { log } from '~/utils/system/logging';
import type PeerConnection from '~/models/peer/connection';
import { PieceManager } from '~/models/peer/piece-manager';
import {
  MAX_STUCK_PIECES_TO_RESET,
  MAX_MISSING_PIECES_TO_ANALYZE,
  MAX_PIECES_TO_RELAUNCH,
} from '~/utils/system/constants';

function findActivePeerWithPiece(
  pieceIndex: number,
  pieceManager: PieceManager,
  connections: Map<string, PeerConnection>
): PeerConnection | null {
  const peersWithPiece = pieceManager.getPeersWithPiece(pieceIndex);
  for (const connection of connections.values()) {
    if (peersWithPiece.includes(connection.peerAddress) && connection.isConnected) {
      return connection;
    }
  }
  return null;
}

function requestPieceFromPeer(connection: PeerConnection, pieceIndex: number): boolean {
  if (!connection.messageHandler.chokedStatus) {
    connection.requestPiece(pieceIndex);
    return true;
  }
  return false;
}

export function analyzeSlowProgress(
  pieceManager: PieceManager,
  connections: Map<string, PeerConnection>
): { resetCount: number; relaunchedCount: number } {
  log('info', 'Analyzing slow download progress...');

  const missingPieces = pieceManager.getMissingPieces();
  const downloadingCount = pieceManager.getDownloadingPiecesCount();

  // Force reset des pièces bloquées
  const resetCount = pieceManager.forceResetStuckPieces();

  log(
    'info',
    `Missing pieces: ${missingPieces.length}, Currently downloading: ${downloadingCount}, Reset stuck: ${resetCount}`
  );

  // Lister les pieces qui ont des peers disponibles
  const recoverablePieces: { piece: number; peers: string[] }[] = [];

  for (const pieceIndex of missingPieces.slice(0, MAX_MISSING_PIECES_TO_ANALYZE)) {
    const peersWithPiece = pieceManager.getPeersWithPiece(pieceIndex);
    if (peersWithPiece.length > 0) {
      recoverablePieces.push({ piece: pieceIndex, peers: peersWithPiece });
    }
  }

  log('info', `Found ${recoverablePieces.length} recoverable pieces`);

  // Essayer de relancer quelques pieces
  let relaunchedCount = 0;
  for (const { piece } of recoverablePieces.slice(0, MAX_PIECES_TO_RELAUNCH)) {
    const activePeer = findActivePeerWithPiece(piece, pieceManager, connections);
    if (activePeer && requestPieceFromPeer(activePeer, piece)) {
      relaunchedCount++;
    }
  }

  if (relaunchedCount > 0) {
    log('info', `Relaunched download for ${relaunchedCount} pieces`);
  }

  return { resetCount, relaunchedCount };
}

export function checkForStuckPieces(
  pieceManager: PieceManager,
  connections: Map<string, PeerConnection>
): number {
  const stuckPieces = pieceManager.getStuckPieces();
  let resetCount = 0;

  if (stuckPieces.length > 0) {
    log(
      'debug',
      `Found ${stuckPieces.length} stuck pieces: ${stuckPieces.slice(0, MAX_STUCK_PIECES_TO_RESET).join(', ')}`
    );

    // Reset pieces stuck for too long
    for (const pieceIndex of stuckPieces.slice(0, MAX_STUCK_PIECES_TO_RESET)) {
      const peersWithPiece = pieceManager.getPeersWithPiece(pieceIndex);
      if (peersWithPiece.length > 0) {
        log(
          'debug',
          `Piece ${pieceIndex} available from ${peersWithPiece.length} peers, resetting...`
        );
        pieceManager.resetPieceDownloadStatus(pieceIndex);
        resetCount++;

        // Essayer de relancer avec un peer actif
        const activePeer = findActivePeerWithPiece(pieceIndex, pieceManager, connections);
        if (activePeer) {
          requestPieceFromPeer(activePeer, pieceIndex);
        }
      }
    }
  }

  return resetCount;
}
