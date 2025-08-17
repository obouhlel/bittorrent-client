import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { Files, FileRange } from '~/types';
import { log } from '~/utils/system/logging';

export async function assembleMultiFile(
  files: Files[],
  totalPieces: number,
  pieceLength: number,
  lastPieceLength: number,
  downloadPath: string
): Promise<void> {
  const fileRanges: FileRange[] = [];
  let currentOffset = 0;

  for (const file of files) {
    fileRanges.push({
      file,
      startByte: currentOffset,
      endByte: currentOffset + file.length - 1,
    });
    currentOffset += file.length;
  }

  const uniqueDirs = new Set<string>();
  for (const { file } of fileRanges) {
    const dir = dirname(join(downloadPath, file.path));
    uniqueDirs.add(dir);
  }

  for (const dir of uniqueDirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  const fileHandles = new Map<string, Awaited<ReturnType<typeof fs.open>>>();
  try {
    for (const { file } of fileRanges) {
      const filePath = join(downloadPath, file.path);
      const handle = await fs.open(filePath, 'w');
      fileHandles.set(file.path, handle);
    }

    for (let pieceIndex = 0; pieceIndex < totalPieces; pieceIndex++) {
      const tempPath = join(downloadPath, `piece_${pieceIndex}.tmp`);

      try {
        const pieceData = await fs.readFile(tempPath);
        const currentPieceLength = pieceIndex === totalPieces - 1 ? lastPieceLength : pieceLength;
        const pieceStartByte = pieceIndex * pieceLength;
        const pieceEndByte = pieceStartByte + currentPieceLength - 1;
        for (const range of fileRanges) {
          const fileHandle = fileHandles.get(range.file.path);
          if (!fileHandle) continue;
          if (pieceEndByte >= range.startByte && pieceStartByte <= range.endByte) {
            const overlapStart = Math.max(pieceStartByte, range.startByte);
            const overlapEnd = Math.min(pieceEndByte, range.endByte);
            const startInPiece = overlapStart - pieceStartByte;
            const positionInFile = overlapStart - range.startByte;
            const bytesToWrite = overlapEnd - overlapStart + 1;
            const dataSlice = pieceData.subarray(startInPiece, startInPiece + bytesToWrite);
            await fileHandle.write(dataSlice, 0, bytesToWrite, positionInFile);

            log(
              'debug',
              `Piece ${pieceIndex}: Writing ${bytesToWrite} bytes to ${range.file.path} at file position ${positionInFile} (from piece offset ${startInPiece})`
            );
          }
        }

        await fs.unlink(tempPath);
      } catch (error) {
        log('warn', `Failed to process piece ${pieceIndex}: ${error}`);
      }
    }

    log('info', `Multi-file torrent assembled successfully`);
  } finally {
    for (const handle of fileHandles.values()) {
      await handle.close();
    }
  }
}

export async function assembleSingleFile(
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

    log('info', `Single file assembled successfully: ${finalPath}`);
  } finally {
    await writeStream.close();
  }
}
