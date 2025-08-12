import { decodeTorrent } from './bencode';
import { TorrentMetadata } from './models/metadata';

async function main(path: string) {
  const buf: ArrayBuffer = await Bun.file(path).arrayBuffer();
  const data: Buffer = Buffer.from(buf);
  const torrent = decodeTorrent(data);
  const _metadata = new TorrentMetadata(torrent);
  process.exit(0);
}

main('./torrents/BigBuckBunny_124_archive.torrent').catch(console.error);
