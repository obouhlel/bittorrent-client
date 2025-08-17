import type { TrackerInfo } from '~/types';
import { log } from '~/utils/system/logging';

export function sortTrackersByProtocol(trackers: TrackerInfo[]): TrackerInfo[] {
  const sorted = [...trackers].sort((a, b) => {
    // Prioriser UDP sur HTTPS (plus fiable pour BitTorrent)
    if (a.protocol === 'udp' && b.protocol !== 'udp') return -1;
    if (a.protocol !== 'udp' && b.protocol === 'udp') return 1;

    // Ordre alphabétique par défaut
    return a.url.localeCompare(b.url);
  });

  const protocolCounts = sorted.reduce(
    (acc, t) => {
      acc[t.protocol] = (acc[t.protocol] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  log('debug', `Tracker sorting: ${JSON.stringify(protocolCounts)} (UDP prioritized)`);

  return sorted;
}
