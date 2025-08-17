import type { PieceSelector } from '~/types';

export class PeerOptimizedSelector implements PieceSelector {
  selectPieces(
    availablePieces: Set<number>,
    peerPieces: Set<number>,
    completedPieces: Set<number>
  ): number[] {
    const candidates: number[] = [];

    for (const pieceIndex of peerPieces) {
      if (availablePieces.has(pieceIndex) && !completedPieces.has(pieceIndex)) {
        candidates.push(pieceIndex);
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = candidates[i];
      const swapValue = candidates[j];
      if (temp !== undefined && swapValue !== undefined) {
        candidates[i] = swapValue;
        candidates[j] = temp;
      }
    }

    return candidates;
  }
}

export class RandomSelector implements PieceSelector {
  selectPieces(
    availablePieces: Set<number>,
    peerPieces: Set<number>,
    completedPieces: Set<number>
  ): number[] {
    const candidates: number[] = [];

    for (const pieceIndex of peerPieces) {
      if (availablePieces.has(pieceIndex) && !completedPieces.has(pieceIndex)) {
        candidates.push(pieceIndex);
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = candidates[i];
      const swapValue = candidates[j];
      if (temp !== undefined && swapValue !== undefined) {
        candidates[i] = swapValue;
        candidates[j] = temp;
      }
    }

    return candidates;
  }
}

export class SequentialSelector implements PieceSelector {
  selectPieces(
    availablePieces: Set<number>,
    peerPieces: Set<number>,
    completedPieces: Set<number>
  ): number[] {
    const candidates: number[] = [];

    for (const pieceIndex of Array.from(peerPieces).sort((a, b) => a - b)) {
      if (availablePieces.has(pieceIndex) && !completedPieces.has(pieceIndex)) {
        candidates.push(pieceIndex);
      }
    }

    return candidates;
  }
}
