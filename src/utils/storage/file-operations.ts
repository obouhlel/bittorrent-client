import { promises as fs } from 'fs';
import { join } from 'path';
import { log } from '~/utils/system/logging';

export async function savePieceToFile(
  pieceIndex: number,
  data: Uint8Array,
  downloadPath: string
): Promise<void> {
  try {
    await fs.mkdir(downloadPath, { recursive: true });
    const filePath = join(downloadPath, `piece_${pieceIndex}.tmp`);
    await fs.writeFile(filePath, data);
  } catch (error) {
    log('fail', `Failed to save piece ${pieceIndex}: ${error}`);
    throw error;
  }
}

export async function assembleCompleteFile(
  totalPieces: number,
  pieceLength: number,
  downloadPath: string,
  fileName: string
): Promise<void> {
  const finalPath = join(downloadPath, fileName);
  const writeStream = await fs.open(finalPath, 'w');

  try {
    for (let i = 0; i < totalPieces; i++) {
      const tempPath = join(downloadPath, `piece_${i}.tmp`);
      const pieceData = await fs.readFile(tempPath);
      await writeStream.write(pieceData, 0, pieceData.length, i * pieceLength);
      await fs.unlink(tempPath);
    }

    log('info', `File assembled successfully: ${finalPath}`);
  } finally {
    await writeStream.close();
  }
}
