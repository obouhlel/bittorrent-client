import '~/env';
import { log } from '~/utils/system/logging';
import { CLIENT_VERSION, DEFAULT_TORRENT_FILE_PATH } from '~/utils/system/constants';
import { BitTorrent } from './models/bittorrent';

// Application startup
const torrentFilePath = Bun.env.TORRENT_FILE_PATH || DEFAULT_TORRENT_FILE_PATH;

log('info', `BitTorrent client v${CLIENT_VERSION}`);
main(torrentFilePath)
  .catch((error) => {
    log('fail', `Fatal error: ${error}`);
    process.exit(1);
  })
  .then(() => {
    log('pass', 'Download complete');
    process.exit(0);
  });

async function main(path: string) {
  try {
    const client = await BitTorrent.fromFile(path);
    const info = client.getTorrentInfo();

    log('info', `Name: ${info.name}`);
    log('info', `Hash: ${info.infoHash}`);
    log('info', `Number of pieces: ${info.pieceCount}`);
    log('info', `Size of pieces: ${info.pieceLength / 1000} KB`);
    log('info', `Total length: ${(info.totalSize / 1000000).toPrecision(5)} MB`);
    log('info', `Found ${info.trackersCount} trackers`);

    await client.start();
  } catch (error) {
    log('fail', `Failed to download: ${error}`);
    throw error;
  }
}
