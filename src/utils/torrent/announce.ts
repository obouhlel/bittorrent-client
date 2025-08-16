import type { Protocol, TorrentFile, Tracker } from '~/types';

export function parseAnnounce(torrent: TorrentFile): Tracker[] {
  const trackers: Tracker[] = [];

  trackers.push({
    url: torrent.announce,
    protocol: getProtocol(torrent.announce),
  });

  if (torrent['announce-list']) {
    for (const tierList of torrent['announce-list']) {
      for (const url of tierList) {
        if (url !== torrent.announce) {
          trackers.push({
            url,
            protocol: getProtocol(url),
          });
        }
      }
    }
  }

  return trackers.sort((a, b) => {
    if (a.protocol === 'https' && b.protocol !== 'https') {
      return -1;
    }
    if (a.protocol !== 'https' && b.protocol === 'https') {
      return 1;
    }
    if (a.protocol === 'http' && b.protocol !== 'http' && b.protocol !== 'https') {
      return -1;
    }
    if (a.protocol !== 'http' && a.protocol !== 'https' && b.protocol === 'http') {
      return 1;
    }
    return 0;
  });
}

export function getProtocol(url: string): Protocol {
  if (url.startsWith('http://')) return 'http';
  if (url.startsWith('https://')) return 'https';
  if (url.startsWith('udp://')) return 'udp';
  return 'http';
}
