/**
 * Parse a bitfield to determine which pieces are available
 * @param bitfield The bitfield bytes from the peer
 * @returns A Set containing the indices of available pieces
 */
export function parseBitfield(bitfield: Uint8Array): Set<number> {
  const pieces = new Set<number>();

  for (let byteIndex = 0; byteIndex < bitfield.length; byteIndex++) {
    const byte = bitfield[byteIndex] ?? 0;
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      if (byte & (1 << (7 - bitIndex))) {
        const pieceIndex = byteIndex * 8 + bitIndex;
        pieces.add(pieceIndex);
      }
    }
  }

  return pieces;
}

/**
 * Create a bitfield from a set of piece indices
 * @param pieces Set of piece indices that are available
 * @param totalPieces Total number of pieces in the torrent
 * @returns Bitfield as Uint8Array
 */
export function createBitfield(pieces: Set<number>, totalPieces: number): Uint8Array {
  const byteLength = Math.ceil(totalPieces / 8);
  const bitfield = new Uint8Array(byteLength);

  for (const pieceIndex of pieces) {
    const byteIndex = Math.floor(pieceIndex / 8);
    const bitIndex = pieceIndex % 8;
    if (byteIndex < bitfield.length) {
      const currentByte = bitfield[byteIndex] ?? 0;
      bitfield[byteIndex] = currentByte | (1 << (7 - bitIndex));
    }
  }

  return bitfield;
}

/**
 * Check if a specific piece is set in the bitfield
 * @param bitfield The bitfield bytes
 * @param pieceIndex The index of the piece to check
 * @returns true if the piece is available, false otherwise
 */
export function hasPiece(bitfield: Uint8Array, pieceIndex: number): boolean {
  const byteIndex = Math.floor(pieceIndex / 8);
  const bitIndex = pieceIndex % 8;

  if (byteIndex >= bitfield.length) {
    return false;
  }

  return ((bitfield[byteIndex] ?? 0) & (1 << (7 - bitIndex))) !== 0;
}
