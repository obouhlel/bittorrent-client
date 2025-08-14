export function checkBitfield(bitfield: Buffer, pieceIndex: number): boolean {
  const byteIndex = Math.floor(pieceIndex / 8);
  if (byteIndex >= bitfield.length) return false;
  const bitIndex = 7 - (pieceIndex % 8);
  const byte = bitfield[byteIndex];
  return byte !== undefined && !!(byte & (1 << bitIndex));
}

export function setBitfield(bitfield: Buffer, pieceIndex: number): void {
  const byteIndex = Math.floor(pieceIndex / 8);
  if (byteIndex < bitfield.length) {
    const bitIndex = 7 - (pieceIndex % 8);
    const currentByte = bitfield[byteIndex];
    if (currentByte !== undefined) {
      bitfield[byteIndex] = currentByte | (1 << bitIndex);
    }
  }
}

export function countBits(bitfield: Buffer, totalPieces: number): number {
  let count = 0;
  for (let i = 0; i < totalPieces; i++) {
    if (checkBitfield(bitfield, i)) count++;
  }
  return count;
}

export function createBitfield(totalPieces: number): Buffer {
  return Buffer.alloc(Math.ceil(totalPieces / 8));
}
