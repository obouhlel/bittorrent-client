import { decodeTorrent } from '@/utils/torrent/bencode';
import { TorrentMetadata } from '@/models/metadata';
import { log } from '@/utils/system/logging';
import { BYTES_TO_MB, BYTES_TO_KB } from '@/utils/system/constants';

export async function loadTorrentFile(path: string): Promise<TorrentMetadata> {
  log('info', `Loading torrent file: ${path}`);

  const buf: ArrayBuffer = await Bun.file(path).arrayBuffer();
  const data: Buffer = Buffer.from(buf);
  const torrent = decodeTorrent(data);
  const metadata = new TorrentMetadata(torrent);

  metadata.setInfoHash(data);

  return metadata;
}

export function logTorrentInfo(metadata: TorrentMetadata): void {
  log('success', `Torrent loaded: ${metadata.name}`);
  log(
    'info',
    `Size: ${(metadata.totalSize / BYTES_TO_MB).toFixed(2)} MB (${metadata.totalSize.toLocaleString()} bytes)`
  );
  log('info', `Piece length: ${(metadata.pieceLength / BYTES_TO_KB).toFixed(0)} KB`);
  log('info', `Total pieces: ${metadata.pieceCount}`);
  log('info', `Info hash: ${metadata.infoHash}`);
}

export function logTrackersInfo(trackers: { url: string; protocol: string }[]): void {
  log('info', `Announce list contains ${trackers.length} tracker(s)`);

  const trackerCounts = {
    udp: trackers.filter((t) => t.protocol === 'udp').length,
    http: trackers.filter((t) => t.protocol === 'http').length,
    https: trackers.filter((t) => t.protocol === 'https').length,
  };

  if (trackerCounts.udp > 0) log('debug', `UDP trackers: ${trackerCounts.udp}`);
  if (trackerCounts.http > 0) log('debug', `HTTP trackers: ${trackerCounts.http}`);
  if (trackerCounts.https > 0) log('debug', `HTTPS trackers: ${trackerCounts.https}`);
}
