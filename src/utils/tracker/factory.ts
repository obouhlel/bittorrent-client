import type { TrackerInfo, Tracker } from '~/types';
import { HTTPTracker } from '~/models/trackers/http/http-tracker';
import { UDPTracker } from '~/models/trackers/udp/udp-tracker';
import type { TorrentMetadata } from '~/models/torrents/metadata';

export function initTrackerInstance(
  trackers: TrackerInfo[],
  metadata: TorrentMetadata
): Map<string, HTTPTracker | UDPTracker> {
  const instances = new Map<string, HTTPTracker | UDPTracker>();

  for (const [index, tracker] of trackers.entries()) {
    const key = `trackers-${tracker.protocol}-${index}`;
    const instance = createTrackerInstance(tracker, metadata);
    instances.set(key, instance);
  }
  return instances;
}

export function createTrackerInfo(tracker: Tracker): TrackerInfo {
  return {
    url: tracker.url,
    protocol: tracker.protocol,
    failures: 0,
    event: undefined,
    lastSuccess: undefined,
  };
}

function createTrackerInstance(
  tracker: TrackerInfo,
  metadata: TorrentMetadata
): HTTPTracker | UDPTracker {
  if (tracker.protocol === 'udp') {
    return new UDPTracker(tracker.url, metadata);
  }
  return new HTTPTracker(tracker.url, metadata);
}
