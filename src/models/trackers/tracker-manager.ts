import { TorrentMetadata } from '@/models/torrents/metadata';
import { log } from '@/utils/system/logging';
import { announceToTracker, createAnnounceParams } from '@/utils/tracker/tracker';
import { DownloadManager } from '@/models/storage/download-manager';
import type { Peer } from '@/types';
import type { AnnounceResponse } from '@/types/tracker';
import {
  MIN_PEERS_FOR_HEALTHY_SWARM,
  TRACKER_RETRY_INTERVAL_HEALTHY,
  TRACKER_RETRY_INTERVAL_STRUGGLING,
} from '@/utils/system/constants';

interface TrackerInfo {
  url: string;
  protocol: string;
  lastSuccess?: number;
  lastFailure?: number;
  consecutiveFailures: number;
  totalPeers: number;
  seeders: number;
  leechers: number;
  responseTime: number;
}

export class TrackerManager {
  private trackers: TrackerInfo[] = [];
  private discoveryTimer?: NodeJS.Timeout;
  private currentTrackerIndex = 0;

  constructor(
    private metadata: TorrentMetadata,
    private downloadManager: DownloadManager
  ) {
    this.initializeTrackers();
  }

  private initializeTrackers(): void {
    const rawTrackers = this.metadata.getTrackers();
    this.trackers = rawTrackers.map((tracker) => ({
      url: tracker.url,
      protocol: tracker.protocol,
      consecutiveFailures: 0,
      totalPeers: 0,
      seeders: 0,
      leechers: 0,
      responseTime: 0,
    }));

    log('info', `Initialized ${this.trackers.length} trackers for discovery`);
  }

  /**
   * Annoncer à plusieurs trackers intelligemment (par batches de 10)
   */
  async announceToMultipleTrackers(): Promise<Peer[]> {
    // Traiter les trackers par batches de 10 pour éviter la saturation réseau
    const batchSize = 10;
    const allPeers: Peer[] = [];
    let totalSuccessCount = 0;

    log('info', `Processing ${this.trackers.length} trackers in batches of ${batchSize}`);

    for (let i = 0; i < this.trackers.length; i += batchSize) {
      const batch = this.trackers.slice(i, i + batchSize);
      log('info', `Announcing to batch ${Math.floor(i / batchSize) + 1}: ${batch.length} trackers`);

      const batchPeers = await this.announceToBatch(batch);
      allPeers.push(...batchPeers);

      // Log immédiat des peers trouvés dans ce batch
      if (batchPeers.length > 0) {
        log(
          'pass',
          `Batch ${Math.floor(i / batchSize) + 1} found ${batchPeers.length} peers - download can start!`
        );
      }

      if (batch.some((t) => t.consecutiveFailures === 0 && t.totalPeers > 0)) {
        totalSuccessCount += batch.filter((t) => t.consecutiveFailures === 0).length;
      }

      // Petit délai entre les batches pour éviter de surcharger
      if (i + batchSize < this.trackers.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    log(
      'info',
      `All batches complete: ${totalSuccessCount} successful trackers, ${allPeers.length} total peers`
    );
    return allPeers;
  }

  /**
   * Annoncer à un batch de trackers
   */
  private async announceToBatch(selectedTrackers: TrackerInfo[]): Promise<Peer[]> {
    if (selectedTrackers.length === 0) {
      log('warn', 'No trackers available for announcement');
      return [];
    }

    log('debug', `Announcing to batch of ${selectedTrackers.length} trackers`);

    const announceParams = createAnnounceParams(this.metadata);
    const allPeers: Peer[] = [];
    let successCount = 0;

    // Annoncer à tous les trackers sélectionnés en parallèle
    const results = await Promise.allSettled(
      selectedTrackers.map(async (trackerInfo) => {
        const startTime = Date.now();
        const response = await announceToTracker(
          { url: trackerInfo.url, protocol: trackerInfo.protocol },
          this.metadata,
          announceParams
        );

        const responseTime = Date.now() - startTime;
        this.updateTrackerStats(trackerInfo, response, responseTime);

        return { trackerInfo, response };
      })
    );

    // Traiter les résultats
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.response) {
        const { response } = result.value;
        successCount++;

        // Filtrer les peers uniques
        const newPeers = response.peers.filter(
          (peer: Peer) => !allPeers.some((p) => p.ip === peer.ip && p.port === peer.port)
        );

        allPeers.push(...newPeers);
        this.downloadManager.addPeers(newPeers);

        log('debug', `Added ${newPeers.length} unique peers from tracker`);
      }
    });

    // Mise à jour de l'index de rotation
    this.currentTrackerIndex =
      (this.currentTrackerIndex + selectedTrackers.length) % this.trackers.length;

    log(
      'info',
      `Tracker round complete: ${successCount}/${selectedTrackers.length} successful, ${allPeers.length} total new peers`
    );

    return allPeers;
  }

  private updateTrackerStats(
    trackerInfo: TrackerInfo,
    response: AnnounceResponse | null,
    responseTime: number
  ): void {
    if (response) {
      // Succès
      trackerInfo.lastSuccess = Date.now();
      trackerInfo.consecutiveFailures = 0;
      trackerInfo.totalPeers = response.peers?.length || 0;
      trackerInfo.seeders = response.complete || 0;
      trackerInfo.leechers = response.incomplete || 0;
      trackerInfo.responseTime = responseTime;

      log(
        'debug',
        `Tracker ${trackerInfo.url}: ${trackerInfo.totalPeers} peers, ${trackerInfo.seeders} seeders (${responseTime}ms)`
      );
    } else {
      // Échec
      trackerInfo.lastFailure = Date.now();
      trackerInfo.consecutiveFailures++;

      if (trackerInfo.consecutiveFailures >= 3) {
        log('warn', `Tracker ${trackerInfo.url} failed ${trackerInfo.consecutiveFailures} times`);
      }
    }
  }

  /**
   * Obtenir seulement les bons trackers (ceux qui fonctionnent)
   */
  async announceToGoodTrackers(): Promise<Peer[]> {
    // Utiliser seulement les trackers qui ont fonctionné
    const goodTrackers = this.trackers.filter(
      (t) => t.consecutiveFailures === 0 && t.totalPeers > 0
    );

    if (goodTrackers.length === 0) {
      log('warn', 'No good trackers available, falling back to all trackers');
      return this.announceToMultipleTrackers();
    }

    log('info', `Announcing to ${goodTrackers.length} good trackers only`);

    const announceParams = createAnnounceParams(this.metadata);
    const allPeers: Peer[] = [];
    let successCount = 0;

    // Annoncer aux bons trackers en parallèle
    const results = await Promise.allSettled(
      goodTrackers.map(async (trackerInfo) => {
        const startTime = Date.now();
        const response = await announceToTracker(
          { url: trackerInfo.url, protocol: trackerInfo.protocol },
          this.metadata,
          announceParams
        );

        const responseTime = Date.now() - startTime;
        this.updateTrackerStats(trackerInfo, response, responseTime);

        return { trackerInfo, response };
      })
    );

    // Traiter les résultats
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.response) {
        const { response } = result.value;
        successCount++;

        const newPeers = response.peers.filter(
          (peer: Peer) => !allPeers.some((p) => p.ip === peer.ip && p.port === peer.port)
        );

        allPeers.push(...newPeers);
        this.downloadManager.addPeers(newPeers);

        log('debug', `Added ${newPeers.length} unique peers from good tracker`);
      }
    });

    log(
      'info',
      `Good trackers round complete: ${successCount}/${goodTrackers.length} successful, ${allPeers.length} new peers`
    );
    return allPeers;
  }

  /**
   * Démarrer la découverte automatique de peers
   */
  startAutomaticDiscovery(): void {
    const checkAndAnnounce = async () => {
      const currentPeers = this.downloadManager.currentStats.activePeers;
      const isHealthy = currentPeers >= MIN_PEERS_FOR_HEALTHY_SWARM;
      const interval = isHealthy
        ? TRACKER_RETRY_INTERVAL_HEALTHY
        : TRACKER_RETRY_INTERVAL_STRUGGLING;

      // Annoncer seulement si on a besoin de plus de peers
      if (currentPeers < MIN_PEERS_FOR_HEALTHY_SWARM) {
        await this.announceToGoodTrackers();
      }

      // Programmer la prochaine vérification
      this.discoveryTimer = setTimeout(checkAndAnnounce, interval);
    };

    // Première annonce immédiate
    checkAndAnnounce();

    log(
      'info',
      'Started automatic peer discovery with adaptive intervals (1-3 minutes based on swarm health)'
    );
  }

  /**
   * Reset tous les peers et redemander aux trackers (quand stuck)
   */
  async resetAndRetryAllTrackers(): Promise<Peer[]> {
    log('warn', 'Download stuck, resetting all peers and retrying all trackers...');

    // Reset des connexions peers dans le download manager
    this.downloadManager.resetAllPeers();

    // Reset des stats des trackers pour forcer un nouveau test
    this.trackers.forEach((tracker) => {
      tracker.consecutiveFailures = 0;
      tracker.lastFailure = undefined;
      tracker.totalPeers = 0;
    });

    // Contacter tous les trackers à nouveau
    return this.announceToMultipleTrackers();
  }

  /**
   * Arrêter la découverte automatique
   */
  stopAutomaticDiscovery(): void {
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = undefined;
      log('info', 'Stopped automatic peer discovery');
    }
  }

  /**
   * Obtenir des statistiques sur les trackers
   */
  getTrackerStats(): {
    total: number;
    working: number;
    failed: number;
    bestTracker?: TrackerInfo;
  } {
    const working = this.trackers.filter((t) => t.consecutiveFailures === 0).length;
    const failed = this.trackers.filter((t) => t.consecutiveFailures >= 3).length;
    const bestTracker = this.trackers
      .filter((t) => t.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)[0];

    return {
      total: this.trackers.length,
      working,
      failed,
      bestTracker,
    };
  }
}
