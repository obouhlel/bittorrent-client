import type { PieceBlock } from '~/types';
import { PIECE_BLOCK_SIZE } from '~/config';

export function createBlocksForPiece(pieceIndex: number, pieceSize: number): PieceBlock[] {
  const blocks: PieceBlock[] = [];
  const numBlocks = Math.ceil(pieceSize / PIECE_BLOCK_SIZE);

  for (let i = 0; i < numBlocks; i++) {
    const begin = i * PIECE_BLOCK_SIZE;
    const length = Math.min(PIECE_BLOCK_SIZE, pieceSize - begin);

    blocks.push({
      index: pieceIndex,
      begin,
      length,
      completed: false,
    });
  }

  return blocks;
}

export function assemblePieceData(blocks: PieceBlock[]): Uint8Array {
  const totalSize = blocks.reduce((sum, block) => sum + (block.data?.length || 0), 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (const block of blocks) {
    if (block.data) {
      result.set(block.data, offset);
      offset += block.data.length;
    }
  }

  return result;
}

export function updateBlockProgress(blocks: PieceBlock[]): number {
  const completedBlocks = blocks.filter((block) => block.completed).length;
  return (completedBlocks / blocks.length) * 100;
}
